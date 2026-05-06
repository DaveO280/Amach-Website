// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/**
 * @title IHealthToken
 * @dev Interface for HealthToken with grantInitialAllocation
 */
interface IHealthToken {
    function grantInitialAllocation(address user, uint256 amount) external;
    function hasReceivedInitialAllocation(address user) external view returns (bool);
    function getRemainingInitialAllocations() external view returns (uint256);
}

/**
 * @title ProfileVerificationV2
 * @dev Improved version that uses HealthToken's grantInitialAllocation instead of transfer
 * @notice This is the MAINNET implementation - properly integrates with HealthToken's allocation system
 *
 * KEY IMPROVEMENTS OVER V1:
 * 1. Uses IHealthToken.grantInitialAllocation() to mint tokens directly (no contract funding needed)
 * 2. Removes redundant hasReceivedTokens tracking (uses HealthToken's own tracking)
 * 3. Removes redundant allocation counting (uses HealthToken's totalInitialAllocations)
 * 4. Cleaner architecture - single source of truth for allocations
 *
 * DEPLOYMENT REQUIREMENTS:
 * - ProfileVerificationV2 must be set as owner of HealthToken contract
 * - Or: HealthToken owner must grant minter role to ProfileVerificationV2
 */
contract ProfileVerificationV2 is Ownable, ReentrancyGuard {
    using ECDSA for bytes32;

    // Events
    event EmailWhitelisted(string indexed email, address indexed admin, uint256 timestamp);
    event EmailRemovedFromWhitelist(string indexed email, address indexed admin, uint256 timestamp);
    event UserVerified(string indexed email, address indexed wallet, uint256 indexed userId, uint256 timestamp);
    event AllocationClaimed(address indexed user, uint256 amount, uint256 userId, uint256 timestamp);
    event WalletLinked(string indexed email, address indexed wallet, uint256 timestamp);
    event WalletUnlinked(string indexed email, address indexed wallet, uint256 timestamp);

    // Structs
    struct UserVerification {
        string email;
        address wallet;
        uint256 userId;
        uint256 timestamp;
        bool isActive;
    }

    // State variables
    mapping(bytes32 => bool) public emailHashWhitelist;
    mapping(address => string) public walletToEmail;
    mapping(string => address) public emailToWallet;
    mapping(address => UserVerification) public userVerifications;
    mapping(uint256 => UserVerification) public userIdToVerification;

    IHealthToken public healthToken;
    uint256 public allocationPerUser;

    uint256 public totalVerifiedUsers;
    uint256 public nextUserId;
    bool public verificationEnabled = true;

    // Modifiers
    modifier onlyWhitelistedEmail(string memory email) {
        bytes32 emailHash = _hashEmail(email);
        require(emailHashWhitelist[emailHash], "Email not whitelisted");
        _;
    }

    function _hashEmail(string memory email) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(_toLower(email)));
    }

    function _toLower(string memory str) internal pure returns (string memory) {
        bytes memory bStr = bytes(str);
        bytes memory bLower = new bytes(bStr.length);
        for (uint i = 0; i < bStr.length; i++) {
            if ((uint8(bStr[i]) >= 65) && (uint8(bStr[i]) <= 90)) {
                bLower[i] = bytes1(uint8(bStr[i]) + 32);
            } else {
                bLower[i] = bStr[i];
            }
        }
        return string(bLower);
    }

    modifier onlyUnusedEmail(string memory email) {
        require(emailToWallet[email] == address(0), "Email already in use");
        _;
    }

    modifier onlyUnusedWallet(address wallet) {
        require(bytes(walletToEmail[wallet]).length == 0, "Wallet already in use");
        _;
    }

    modifier verificationActive() {
        require(verificationEnabled, "Verification is disabled");
        _;
    }

    constructor(address _healthToken, uint256 _allocationPerUser) Ownable(msg.sender) {
        require(_healthToken != address(0), "Invalid health token address");
        healthToken = IHealthToken(_healthToken);
        allocationPerUser = _allocationPerUser; // e.g., 1000 * 10**18 for 1000 AHP
    }

    /**
     * @dev Add email to whitelist (only owner)
     */
    function addEmailToWhitelist(string memory email) external onlyOwner {
        bytes32 emailHash = _hashEmail(email);
        require(!emailHashWhitelist[emailHash], "Email already whitelisted");
        emailHashWhitelist[emailHash] = true;
        emit EmailWhitelisted(email, msg.sender, block.timestamp);
    }

    /**
     * @dev Add multiple emails to whitelist (only owner)
     */
    function addEmailsToWhitelist(string[] memory emails) external onlyOwner {
        for (uint256 i = 0; i < emails.length; i++) {
            bytes32 emailHash = _hashEmail(emails[i]);
            if (!emailHashWhitelist[emailHash]) {
                emailHashWhitelist[emailHash] = true;
                emit EmailWhitelisted(emails[i], msg.sender, block.timestamp);
            }
        }
    }

    /**
     * @dev Remove email from whitelist (only owner)
     */
    function removeEmailFromWhitelist(string memory email) external onlyOwner {
        bytes32 emailHash = _hashEmail(email);
        require(emailHashWhitelist[emailHash], "Email not in whitelist");
        emailHashWhitelist[emailHash] = false;
        emit EmailRemovedFromWhitelist(email, msg.sender, block.timestamp);
    }

    /**
     * @dev Verify user profile with signature
     */
    function verifyProfile(
        string memory email,
        bytes memory signature
    ) external
        nonReentrant
        verificationActive
        onlyWhitelistedEmail(email)
        onlyUnusedEmail(email)
        onlyUnusedWallet(msg.sender)
    {
        bytes32 messageHash = keccak256(abi.encodePacked(email, msg.sender));
        bytes32 ethSignedMessageHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash));
        address signer = ECDSA.recover(ethSignedMessageHash, signature);

        require(signer == msg.sender, "Invalid signature");

        _processVerification(email, msg.sender);
    }

    /**
     * @dev Verify user profile for ZKsync SSO (without signature verification)
     */
    function verifyProfileZKsync(
        string memory email
    ) external
        nonReentrant
        verificationActive
        onlyUnusedEmail(email)
        onlyUnusedWallet(msg.sender)
    {
        _processVerification(email, msg.sender);
    }

    /**
     * @dev Internal function to process verification
     */
    function _processVerification(string memory email, address wallet) internal {
        uint256 userId = nextUserId++;
        UserVerification memory verification = UserVerification({
            email: email,
            wallet: wallet,
            userId: userId,
            timestamp: block.timestamp,
            isActive: true
        });

        userVerifications[wallet] = verification;
        userIdToVerification[userId] = verification;
        walletToEmail[wallet] = email;
        emailToWallet[email] = wallet;

        totalVerifiedUsers++;

        emit UserVerified(email, wallet, userId, block.timestamp);
        emit WalletLinked(email, wallet, block.timestamp);
    }

    /**
     * @dev Claim allocated tokens for verified user
     * @notice Uses HealthToken's grantInitialAllocation - mints tokens directly to user
     * @notice V2 IMPROVEMENT: No need to pre-fund contract, tokens are minted on-demand
     */
    function claimAllocation() external nonReentrant {
        address user = msg.sender;
        UserVerification storage verification = userVerifications[user];

        require(verification.isActive, "User not verified");
        require(address(healthToken) != address(0), "Health token not set");

        // Check if user already received allocation from HealthToken
        require(!healthToken.hasReceivedInitialAllocation(user), "Tokens already claimed");

        // Check if allocations are still available
        require(healthToken.getRemainingInitialAllocations() > 0, "No allocations remaining");

        // Grant allocation - this mints tokens directly to user
        healthToken.grantInitialAllocation(user, allocationPerUser);

        emit AllocationClaimed(user, allocationPerUser, verification.userId, block.timestamp);
    }

    /**
     * @dev Check if user is verified
     */
    function isUserVerified(address user) external view returns (bool isVerified) {
        return userVerifications[user].isActive && userVerifications[user].wallet != address(0);
    }

    /**
     * @dev Get user verification data
     */
    function getUserVerification(address user) external view returns (UserVerification memory verification) {
        return userVerifications[user];
    }

    /**
     * @dev Get verification data by email
     */
    function getVerificationByEmail(string memory email) external view returns (UserVerification memory verification) {
        address wallet = emailToWallet[email];
        require(wallet != address(0), "Email not verified");
        return userVerifications[wallet];
    }

    /**
     * @dev Check if email is whitelisted
     */
    function isEmailWhitelisted(string memory email) external view returns (bool isWhitelisted) {
        bytes32 emailHash = _hashEmail(email);
        return emailHashWhitelist[emailHash];
    }

    /**
     * @dev Check if email is already in use
     */
    function isEmailInUse(string memory email) external view returns (bool isInUse) {
        return emailToWallet[email] != address(0);
    }

    /**
     * @dev Check if wallet is already in use
     */
    function isWalletInUse(address wallet) external view returns (bool isInUse) {
        return bytes(walletToEmail[wallet]).length > 0;
    }

    /**
     * @dev Get remaining allocations from HealthToken
     */
    function getRemainingAllocations() external view returns (uint256) {
        return healthToken.getRemainingInitialAllocations();
    }

    /**
     * @dev Get total verified users count
     */
    function getTotalVerifiedUsers() external view returns (uint256 count) {
        return totalVerifiedUsers;
    }

    /**
     * @dev Update allocation per user (only owner)
     */
    function updateAllocationPerUser(uint256 _allocationPerUser) external onlyOwner {
        allocationPerUser = _allocationPerUser;
    }

    /**
     * @dev Set health token contract address (only owner)
     */
    function setHealthToken(address _healthToken) external onlyOwner {
        require(_healthToken != address(0), "Invalid address");
        healthToken = IHealthToken(_healthToken);
    }

    /**
     * @dev Toggle verification system (only owner)
     */
    function setVerificationEnabled(bool enabled) external onlyOwner {
        verificationEnabled = enabled;
    }

    /**
     * @dev Emergency function to deactivate user (only owner)
     */
    function deactivateUser(address user) external onlyOwner {
        require(userVerifications[user].isActive, "User not active");

        UserVerification storage verification = userVerifications[user];
        verification.isActive = false;

        string memory email = verification.email;
        walletToEmail[user] = "";
        emailToWallet[email] = address(0);

        emit WalletUnlinked(email, user, block.timestamp);
    }
}
