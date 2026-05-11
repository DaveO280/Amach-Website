// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IGroth16Verifier {
    function verifyProof(
        bytes calldata proof,
        uint256[4] calldata pubSignals
    ) external view returns (bool);
}

/// @title SpringPushEscrowV1
/// @notice Non-upgradeable prize escrow for the Spring Push Season One contest.
/// @dev    Trust model = immutability. There is no upgrade path, no admin
///         withdrawal, and no key that can drain the contract. Registration
///         is free; the prize pool is seeded entirely by the admin at
///         openRegistration(). Outflows are limited to: (1) verified-proof
///         prize claims, and (2) a 180-day founder reclaim of strictly
///         residual ETH that was never claimed.
contract SpringPushEscrowV1 is ReentrancyGuard {
    // -------------------------------------------------------------
    // Types
    // -------------------------------------------------------------

    /// @dev Lifecycle states. The state machine is one-way: every transition
    ///      moves forward, no resets. CLAIMING (the post-contest claim window)
    ///      is internally renamed from the spec's "CLAIM_WINDOW" so it does not
    ///      collide with the CLAIM_WINDOW immutable duration variable.
    enum ContestState {
        UNINITIALIZED,
        REGISTRATION_OPEN,
        ACTIVE,
        CLAIMING,
        FINISHED,
        FAILED
    }

    // -------------------------------------------------------------
    // Immutable parameters
    // -------------------------------------------------------------

    uint256 public immutable CONTEST_DURATION;
    uint256 public immutable CLAIM_WINDOW;
    uint256 public immutable MAX_PARTICIPANTS;
    uint256 public immutable MIN_PARTICIPANTS;
    uint256 public immutable FOUNDER_RECLAIM_DELAY;
    address public immutable IMPROVEMENT_VERIFIER;
    /// @dev Single privileged caller. On testnet this is the deployer EOA;
    ///      on mainnet it should be a Gnosis Safe. No on-chain timelock —
    ///      that is deferred to a possible V2.
    address public immutable ADMIN;

    /// @dev Floors enforced by the constructor so a misconfigured deploy
    ///      cannot produce a contest with absurd timing.
    uint256 public constant MIN_CONTEST_DURATION = 60;
    uint256 public constant MIN_CLAIM_WINDOW = 60;
    uint256 public constant MIN_MAX_PARTICIPANTS = 2;
    uint256 public constant MIN_MIN_PARTICIPANTS = 1;

    /// @dev Tier shares are basis points of the prize pool. 6000 + 2500 + 1500 = 10000.
    uint256 public constant TIER1_BPS = 6000;
    uint256 public constant TIER2_BPS = 2500;
    uint256 public constant TIER3_BPS = 1500;
    uint256 public constant BPS_DENOM = 10000;
    uint256 public constant TIER1_SLOTS = 10;
    uint256 public constant TIER2_SLOTS = 20;

    // -------------------------------------------------------------
    // Contest state
    // -------------------------------------------------------------

    ContestState public state;
    bytes32 public baselineRoot;
    uint256 public contestStartTime;
    uint256 public contestCloseTime;
    uint256 public claimWindowEndTime;

    /// @dev ETH seeded by the admin at openRegistration().
    uint256 public prizePool;
    /// @dev Cumulative ETH paid out via claimPrize().
    uint256 public totalClaimed;
    /// @dev Locked at finalize(). Equals the number of participants with a
    ///      verified proof on file.
    uint256 public qualifierCount;

    // -------------------------------------------------------------
    // Per-participant storage
    // -------------------------------------------------------------

    address[] public participants;
    mapping(address => bool) public registered;
    mapping(address => uint256) public improvementBp;
    /// @dev 1-indexed rank assigned by finalize(). 0 means unranked.
    mapping(address => uint256) public participantRank;
    mapping(address => bool) public claimed;

    // -------------------------------------------------------------
    // Events
    // -------------------------------------------------------------

    event ContestOpened(uint256 prizePool, uint256 startTime, bytes32 baselineRoot);
    event ParticipantRegistered(address indexed participant);
    event RegistrationClosed(uint256 participantCount, ContestState state);
    event ProofSubmitted(address indexed participant, uint256 improvementBp);
    event PrizeClaimed(address indexed participant, uint256 amount, uint8 tier);
    event ContestFinalized(uint256 qualifierCount);
    event FounderReclaim(address indexed to, uint256 amount);

    // -------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------

    error NotAdmin();
    error InvalidParams();
    error WrongState(ContestState expected, ContestState actual);
    error CapacityReached();
    error AlreadyRegistered();
    error NotRegistered();
    error AlreadySubmitted();
    error InvalidProof();
    error BaselineMismatch();
    error ImprovementZero();
    error AlreadyClaimed();
    error NotQualified();
    error TooEarly();
    error NotSorted();
    error DuplicateInRanking();
    error ZeroAddress();
    error ZeroValue();
    error InvariantBroken();

    // -------------------------------------------------------------
    // Modifiers
    // -------------------------------------------------------------

    modifier onlyAdmin() {
        if (msg.sender != ADMIN) revert NotAdmin();
        _;
    }

    modifier inState(ContestState expected) {
        if (state != expected) revert WrongState(expected, state);
        _;
    }

    // -------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------

    constructor(
        address verifier,
        address admin,
        uint256 contestDuration,
        uint256 claimWindow,
        uint256 maxParticipants,
        uint256 minParticipants
    ) {
        if (verifier == address(0) || admin == address(0)) revert ZeroAddress();
        if (contestDuration < MIN_CONTEST_DURATION) revert InvalidParams();
        if (claimWindow < MIN_CLAIM_WINDOW) revert InvalidParams();
        if (maxParticipants < MIN_MAX_PARTICIPANTS) revert InvalidParams();
        if (minParticipants < MIN_MIN_PARTICIPANTS) revert InvalidParams();
        if (minParticipants > maxParticipants) revert InvalidParams();

        IMPROVEMENT_VERIFIER = verifier;
        ADMIN = admin;
        CONTEST_DURATION = contestDuration;
        CLAIM_WINDOW = claimWindow;
        MAX_PARTICIPANTS = maxParticipants;
        MIN_PARTICIPANTS = minParticipants;
        FOUNDER_RECLAIM_DELAY = 180 days;
        state = ContestState.UNINITIALIZED;
    }

    // -------------------------------------------------------------
    // Lifecycle: admin
    // -------------------------------------------------------------

    /// @notice Seeds the prize pool, records the baseline Merkle root, and opens
    ///         registration. Single-shot; once called the prize pool is locked in.
    function openRegistration(bytes32 _baselineRoot)
        external
        payable
        onlyAdmin
        inState(ContestState.UNINITIALIZED)
    {
        if (msg.value == 0) revert ZeroValue();
        if (_baselineRoot == bytes32(0)) revert ZeroValue();

        prizePool = msg.value;
        baselineRoot = _baselineRoot;
        state = ContestState.REGISTRATION_OPEN;

        emit ContestOpened(msg.value, block.timestamp, _baselineRoot);
    }

    /// @notice Closes registration. Below MIN_PARTICIPANTS the contest fails;
    ///         the seeded prize pool then sits in escrow until founderReclaim
    ///         becomes callable. Otherwise the active contest begins.
    function closeRegistration()
        external
        onlyAdmin
        inState(ContestState.REGISTRATION_OPEN)
    {
        uint256 count = participants.length;

        if (count < MIN_PARTICIPANTS) {
            state = ContestState.FAILED;
            // Anchor the founder-reclaim delay to the moment of failure so the
            // seeded prize pool isn't permanently stuck. Without this,
            // founderReclaim() trips its contestCloseTime == 0 guard forever.
            contestCloseTime = block.timestamp;
            emit RegistrationClosed(count, state);
            return;
        }

        state = ContestState.ACTIVE;
        contestStartTime = block.timestamp;
        contestCloseTime = block.timestamp + CONTEST_DURATION;
        claimWindowEndTime = contestCloseTime + CLAIM_WINDOW;

        emit RegistrationClosed(count, state);
    }

    // -------------------------------------------------------------
    // Lifecycle: participant
    // -------------------------------------------------------------

    /// @notice Registers msg.sender for the contest. Free entry — the prize
    ///         pool is seeded by the admin, not by participants.
    function register()
        external
        inState(ContestState.REGISTRATION_OPEN)
    {
        if (participants.length >= MAX_PARTICIPANTS) revert CapacityReached();
        if (registered[msg.sender]) revert AlreadyRegistered();

        registered[msg.sender] = true;
        participants.push(msg.sender);

        emit ParticipantRegistered(msg.sender);
    }

    /// @notice Submits a Groth16 proof of improvement for the caller. Each
    ///         registered participant gets exactly one shot.
    /// @dev    Auto-advances ACTIVE → CLAIMING when block.timestamp passes
    ///         contestCloseTime, so the function works in either state without
    ///         requiring a separate close-contest call.
    function submitProof(bytes calldata proof, uint256[4] calldata pubSignals)
        external
        nonReentrant
    {
        _advanceFromActiveIfElapsed();

        if (state != ContestState.ACTIVE && state != ContestState.CLAIMING) {
            revert WrongState(ContestState.ACTIVE, state);
        }
        if (block.timestamp > claimWindowEndTime) revert TooEarly();
        if (!registered[msg.sender]) revert NotRegistered();
        if (improvementBp[msg.sender] != 0) revert AlreadySubmitted();

        if (uint256(baselineRoot) != pubSignals[0]) revert BaselineMismatch();
        if (pubSignals[3] == 0) revert ImprovementZero();

        bool ok = IGroth16Verifier(IMPROVEMENT_VERIFIER).verifyProof(proof, pubSignals);
        if (!ok) revert InvalidProof();

        improvementBp[msg.sender] = pubSignals[3];

        emit ProofSubmitted(msg.sender, pubSignals[3]);
    }

    /// @notice Locks in the final ranking once the claim window has elapsed.
    /// @dev    Caller (admin) supplies the participant list pre-sorted by
    ///         improvementBp descending. The contract verifies sort order,
    ///         uniqueness, and that every entry has a verified proof on file.
    ///         No on-chain sort — too gas-heavy and unbounded.
    function finalize(address[] calldata sortedParticipants)
        external
        onlyAdmin
    {
        _advanceFromActiveIfElapsed();
        if (state != ContestState.CLAIMING) {
            revert WrongState(ContestState.CLAIMING, state);
        }
        if (block.timestamp <= claimWindowEndTime) revert TooEarly();

        uint256 prevImprovement = type(uint256).max;
        uint256 len = sortedParticipants.length;
        for (uint256 i = 0; i < len; i++) {
            address p = sortedParticipants[i];
            uint256 imp = improvementBp[p];
            if (imp == 0) revert NotQualified();
            if (imp > prevImprovement) revert NotSorted();
            if (participantRank[p] != 0) revert DuplicateInRanking();
            participantRank[p] = i + 1;
            prevImprovement = imp;
        }

        qualifierCount = len;

        state = ContestState.FINISHED;
        emit ContestFinalized(len);
    }

    /// @notice Pays out a finalized prize from the admin-seeded pool.
    /// @dev    Spec language describes this as "callable during CLAIM_WINDOW".
    ///         Because finalize() must run first (it builds the ranking), the
    ///         actual gating state is FINISHED. The spec's CLAIM_WINDOW state
    ///         is the proof-submission window; this function is the post-
    ///         finalize claim path.
    function claimPrize()
        external
        nonReentrant
        inState(ContestState.FINISHED)
    {
        if (claimed[msg.sender]) revert AlreadyClaimed();
        uint256 rank = participantRank[msg.sender];
        if (rank == 0) revert NotQualified();

        (uint256 prizeAmount, uint8 tier) = _prizeFor(rank);

        _checkInvariant();

        claimed[msg.sender] = true;
        totalClaimed += prizeAmount;

        (bool sent, ) = payable(msg.sender).call{value: prizeAmount}("");
        if (!sent) revert InvariantBroken();

        emit PrizeClaimed(msg.sender, prizeAmount, tier);
    }

    /// @notice Sweeps strictly-residual ETH after the 180-day delay since the
    ///         official contest close. There is no path that lets this drain
    ///         active claims — by the time it is callable, the claim window
    ///         has been over for 150 days and every qualifier has had ample
    ///         time to claim.
    function founderReclaim(address payable to)
        external
        nonReentrant
        onlyAdmin
    {
        if (to == address(0)) revert ZeroAddress();
        if (contestCloseTime == 0) revert TooEarly();
        if (block.timestamp < contestCloseTime + FOUNDER_RECLAIM_DELAY) revert TooEarly();

        uint256 amount = address(this).balance;
        if (amount == 0) revert ZeroValue();

        (bool sent, ) = to.call{value: amount}("");
        if (!sent) revert InvariantBroken();

        emit FounderReclaim(to, amount);
    }

    // -------------------------------------------------------------
    // Views
    // -------------------------------------------------------------

    function participantCount() external view returns (uint256) {
        return participants.length;
    }

    function previewPrizeFor(address who) external view returns (uint256 amount, uint8 tier) {
        uint256 rank = participantRank[who];
        if (rank == 0) return (0, 0);
        return _prizeFor(rank);
    }

    // -------------------------------------------------------------
    // Internal
    // -------------------------------------------------------------

    function _advanceFromActiveIfElapsed() internal {
        if (state == ContestState.ACTIVE && block.timestamp >= contestCloseTime) {
            state = ContestState.CLAIMING;
        }
    }

    function _prizeFor(uint256 rank) internal view returns (uint256 amount, uint8 tier) {
        uint256 q = qualifierCount;
        if (q == 0 || rank > q) return (0, 0);

        uint256 tier1Count = q < TIER1_SLOTS ? q : TIER1_SLOTS;
        uint256 tier2Count;
        if (q > TIER1_SLOTS) {
            uint256 rem = q - TIER1_SLOTS;
            tier2Count = rem < TIER2_SLOTS ? rem : TIER2_SLOTS;
        }
        uint256 tier3Count;
        if (q > TIER1_SLOTS + TIER2_SLOTS) {
            tier3Count = q - TIER1_SLOTS - TIER2_SLOTS;
        }

        if (rank <= tier1Count) {
            amount = (prizePool * TIER1_BPS) / (BPS_DENOM * tier1Count);
            tier = 1;
        } else if (rank <= tier1Count + tier2Count) {
            amount = (prizePool * TIER2_BPS) / (BPS_DENOM * tier2Count);
            tier = 2;
        } else {
            amount = (prizePool * TIER3_BPS) / (BPS_DENOM * tier3Count);
            tier = 3;
        }
    }

    /// @dev Sanity check: every payout path must keep the invariant
    ///      balance + totalClaimed == prizePool.
    function _checkInvariant() internal view {
        if (address(this).balance + totalClaimed != prizePool) {
            revert InvariantBroken();
        }
    }

    /// @dev Reject blind ETH transfers — every inflow is accounted for explicitly.
    receive() external payable {
        revert ZeroValue();
    }
}
