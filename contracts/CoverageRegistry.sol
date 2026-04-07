// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title CoverageRegistry
 * @notice On-chain registry for ZK coverage proofs.
 *
 * Wraps the immutable Groth16 verifier (CoverageVerifier / Groth16Verifier).
 * Each wallet can submit a coverage proof; the contract verifies it and stores
 * a compact record so any third party can query whether a user has proven
 * continuous health data coverage.
 *
 * Public signals layout (matches coverage.circom):
 *   [0] root       — Merkle root of the genesis tree
 *   [1] startDayId — first day included in the proof window
 *   [2] endDayId   — last day included in the proof window
 *   [3] minDays    — minimum consecutive days required
 */

interface IGroth16Verifier {
    function verifyProof(
        uint[2] calldata _pA,
        uint[2][2] calldata _pB,
        uint[2] calldata _pC,
        uint[4] calldata _pubSignals
    ) external view returns (bool);
}

contract CoverageRegistry {

    IGroth16Verifier public immutable verifier;

    struct CoverageRecord {
        bytes32 proofHash;   // keccak256(abi.encode(pA, pB, pC, pubSignals))
        uint32  startDayId;  // pubSignals[1]
        uint32  endDayId;    // pubSignals[2]
        uint32  minDays;     // pubSignals[3]
        uint40  timestamp;   // block.timestamp when proof was accepted
    }

    /// @notice Latest accepted coverage record per wallet.
    mapping(address => CoverageRecord) public coverageRecords;

    event CoverageProofSubmitted(
        address indexed user,
        bytes32 indexed proofHash,
        uint32  startDayId,
        uint32  endDayId,
        uint32  minDays,
        uint256 timestamp
    );

    error InvalidProof();

    constructor(address _verifier) {
        verifier = IGroth16Verifier(_verifier);
    }

    /**
     * @notice Submit a Groth16 coverage proof.
     * @dev Proof is verified on-chain; record is stored and event emitted.
     *      A new submission overwrites the previous record.
     */
    function submitProof(
        uint[2]    calldata _pA,
        uint[2][2] calldata _pB,
        uint[2]    calldata _pC,
        uint[4]    calldata _pubSignals
    ) external {
        if (!verifier.verifyProof(_pA, _pB, _pC, _pubSignals)) revert InvalidProof();

        bytes32 proofHash  = keccak256(abi.encode(_pA, _pB, _pC, _pubSignals));
        uint32  startDayId = uint32(_pubSignals[1]);
        uint32  endDayId   = uint32(_pubSignals[2]);
        uint32  minDays    = uint32(_pubSignals[3]);

        coverageRecords[msg.sender] = CoverageRecord({
            proofHash:  proofHash,
            startDayId: startDayId,
            endDayId:   endDayId,
            minDays:    minDays,
            timestamp:  uint40(block.timestamp)
        });

        emit CoverageProofSubmitted(
            msg.sender,
            proofHash,
            startDayId,
            endDayId,
            minDays,
            block.timestamp
        );
    }

    /// @notice Returns true if the user has ever submitted a valid coverage proof.
    function hasCoverageProof(address user) external view returns (bool) {
        return coverageRecords[user].timestamp > 0;
    }

    /// @notice Returns the latest coverage record for a user.
    function getCoverageRecord(address user) external view returns (CoverageRecord memory) {
        return coverageRecords[user];
    }
}
