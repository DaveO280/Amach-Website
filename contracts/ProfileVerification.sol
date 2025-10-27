// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
/**
 * @title ProfileVerification
 * @dev Smart contract for profile verification with email whitelist and one-wallet-per-user enforcement
 * @notice Implements restrictive wallet creation with email verification and allocation tracking for mainnet migration
 */
contract ProfileVerification is Ownable, ReentrancyGuard {
    using ECDSA for bytes32;

    // Events
    event EmailWhitelisted(string indexed email, address indexed admin, uint256 timestamp);
    event EmailRemovedFromWhitelist(string indexed email, address indexed admin, uint256 timestamp);
    event UserVerified(string indexed email, address indexed wallet, uint256 indexed userId, uint256 timestamp);
    event AllocationRecorded(address indexed user, uint256 amount, uint256 allocationId, uint256 timestamp);
    event TokensClaimed(address indexed user, uint256 amount, uint256 timestamp);
    event WalletLinked(string indexed email, address indexed wallet, uint256 timestamp);
    event WalletUnlinked(string indexed email, address indexed wallet, uint256 timestamp);

    // Structs
    struct UserVerification {
        string email;
        address wallet;
        uint256 userId;
        uint256 timestamp;
        bool isActive;
        bool hasReceivedTokens;
        uint256 tokenAllocation;
    }

    struct AllocationConfig {
        uint256 totalAllocated;
        uint256 maxAllocations;
        uint256 allocationPerUser;
        bool isActive;
    }

    // State variables
    mapping(string => bool) public emailWhitelist;
    mapping(address => string) public walletToEmail;
    mapping(string => address) public emailToWallet;
    mapping(address => UserVerification) public userVerifications;
    mapping(uint256 => UserVerification) public userIdToVerification;
    
    AllocationConfig public allocationConfig;
    address public mainnetMigrationContract;
    IERC20 public healthToken;
    
    uint256 public totalVerifiedUsers;
    uint256 public nextUserId;
    bool public verificationEnabled = true;
    
    // Modifiers
    modifier onlyWhitelistedEmail(string memory email) {
        require(emailWhitelist[email], "Email not whitelisted");
        _;
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

    constructor() Ownable(msg.sender) {
        // Initialize allocation configuration for first 5,000 users
        allocationConfig = AllocationConfig({
            totalAllocated: 0,
            maxAllocations: 5000,
            allocationPerUser: 1000 * 10**18, // 1000 AHP tokens per user
            isActive: true
        });
    }

    /**
     * @dev Add email to whitelist (only owner)
     * @param email Email address to whitelist
     */
    function addEmailToWhitelist(string memory email) external onlyOwner {
        require(!emailWhitelist[email], "Email already whitelisted");
        emailWhitelist[email] = true;
        emit EmailWhitelisted(email, msg.sender, block.timestamp);
    }

    /**
     * @dev Add multiple emails to whitelist (only owner)
     * @param emails Array of email addresses to whitelist
     */
    function addEmailsToWhitelist(string[] memory emails) external onlyOwner {
        for (uint256 i = 0; i < emails.length; i++) {
            if (!emailWhitelist[emails[i]]) {
                emailWhitelist[emails[i]] = true;
                emit EmailWhitelisted(emails[i], msg.sender, block.timestamp);
            }
        }
    }

    /**
     * @dev Remove email from whitelist (only owner)
     * @param email Email address to remove from whitelist
     */
    function removeEmailFromWhitelist(string memory email) external onlyOwner {
        require(emailWhitelist[email], "Email not in whitelist");
        emailWhitelist[email] = false;
        emit EmailRemovedFromWhitelist(email, msg.sender, block.timestamp);
    }

    /**
     * @dev Verify user profile with email and wallet (with signature verification)
     * @param email Whitelisted email address
     * @param signature Signature proving ownership of wallet
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
        // Verify signature
        bytes32 messageHash = keccak256(abi.encodePacked(email, msg.sender));
        bytes32 ethSignedMessageHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash));
        address signer = ECDSA.recover(ethSignedMessageHash, signature);
        
        require(signer == msg.sender, "Invalid signature");
        
        _processVerification(email, msg.sender);
    }

    /**
     * @dev Verify user profile for ZKsync SSO (without signature verification)
     * @param email Email address (whitelist check handled by admin database)
     */
    function verifyProfileZKsync(
        string memory email
    ) external 
        nonReentrant 
        verificationActive 
        onlyUnusedEmail(email)
        onlyUnusedWallet(msg.sender) 
    {
        // For ZKsync SSO, we trust that msg.sender is the actual wallet owner
        // Whitelist check is handled by the admin database, not blockchain
        _processVerification(email, msg.sender);
    }


    /**
     * @dev Internal function to process verification (shared logic)
     * @param email Email address
     * @param wallet Wallet address
     */
    function _processVerification(string memory email, address wallet) internal {
        
        // Create user verification
        uint256 userId = nextUserId++;
        UserVerification memory verification = UserVerification({
            email: email,
            wallet: wallet,
            userId: userId,
            timestamp: block.timestamp,
            isActive: true,
            hasReceivedTokens: false,
            tokenAllocation: 0
        });
        
        // Store mappings
        userVerifications[wallet] = verification;
        userIdToVerification[userId] = verification;
        walletToEmail[wallet] = email;
        emailToWallet[email] = wallet;
        
        // Record allocation if available (but don't mark as received yet)
        if (allocationConfig.isActive && 
            allocationConfig.totalAllocated < allocationConfig.maxAllocations) {
            
            uint256 allocationAmount = allocationConfig.allocationPerUser;
            verification.tokenAllocation = allocationAmount;
            verification.hasReceivedTokens = false; // User needs to claim manually
            
            // Update allocation tracking
            allocationConfig.totalAllocated++;
            userVerifications[wallet] = verification;
            userIdToVerification[userId] = verification;
            
            emit AllocationRecorded(wallet, allocationAmount, userId, block.timestamp);
        }
        
        totalVerifiedUsers++;
        
        emit UserVerified(email, wallet, userId, block.timestamp);
        emit WalletLinked(email, wallet, block.timestamp);
    }

    /**
     * @dev Check if user is verified
     * @param user User address to check
     * @return isVerified Whether the user is verified
     */
    function isUserVerified(address user) external view returns (bool isVerified) {
        return userVerifications[user].isActive && userVerifications[user].wallet != address(0);
    }

    /**
     * @dev Get user verification data
     * @param user User address
     * @return verification User verification data
     */
    function getUserVerification(address user) external view returns (UserVerification memory verification) {
        return userVerifications[user];
    }

    /**
     * @dev Get verification data by email
     * @param email Email address
     * @return verification User verification data
     */
    function getVerificationByEmail(string memory email) external view returns (UserVerification memory verification) {
        address wallet = emailToWallet[email];
        require(wallet != address(0), "Email not verified");
        return userVerifications[wallet];
    }

    /**
     * @dev Check if email is whitelisted
     * @param email Email address to check
     * @return isWhitelisted Whether the email is whitelisted
     */
    function isEmailWhitelisted(string memory email) external view returns (bool isWhitelisted) {
        return emailWhitelist[email];
    }

    /**
     * @dev Check if email is already in use
     * @param email Email address to check
     * @return isInUse Whether the email is already in use
     */
    function isEmailInUse(string memory email) external view returns (bool isInUse) {
        return emailToWallet[email] != address(0);
    }

    /**
     * @dev Check if wallet is already in use
     * @param wallet Wallet address to check
     * @return isInUse Whether the wallet is already in use
     */
    function isWalletInUse(address wallet) external view returns (bool isInUse) {
        return bytes(walletToEmail[wallet]).length > 0;
    }

    /**
     * @dev Get allocation configuration status
     * @return config Allocation configuration data
     */
    function getAllocationConfig() external view returns (AllocationConfig memory config) {
        return allocationConfig;
    }

    /**
     * @dev Get total verified users count
     * @return count Total number of verified users
     */
    function getTotalVerifiedUsers() external view returns (uint256 count) {
        return totalVerifiedUsers;
    }

    /**
     * @dev Update allocation configuration parameters (only owner)
     * @param maxAllocations Maximum number of token allocations
     * @param allocationPerUser Tokens allocated per user
     * @param isActive Whether token allocation is active
     */
    function updateAllocationConfig(
        uint256 maxAllocations,
        uint256 allocationPerUser,
        bool isActive
    ) external onlyOwner {
        allocationConfig.maxAllocations = maxAllocations;
        allocationConfig.allocationPerUser = allocationPerUser;
        allocationConfig.isActive = isActive;
    }

    /**
     * @dev Set mainnet migration contract address (only owner)
     * @param _mainnetMigrationContract Address of mainnet migration contract
     */
    function setMainnetMigrationContract(address _mainnetMigrationContract) external onlyOwner {
        mainnetMigrationContract = _mainnetMigrationContract;
    }

    /**
     * @dev Set health token contract address (only owner)
     * @param _healthToken Address of health token contract
     */
    function setHealthToken(address _healthToken) external onlyOwner {
        healthToken = IERC20(_healthToken);
    }

    /**
     * @dev Toggle verification system (only owner)
     * @param enabled Whether verification is enabled
     */
    function setVerificationEnabled(bool enabled) external onlyOwner {
        verificationEnabled = enabled;
    }

    /**
     * @dev Emergency function to deactivate user (only owner)
     * @param user User address to deactivate
     */
    function deactivateUser(address user) external onlyOwner {
        require(userVerifications[user].isActive, "User not active");
        
        UserVerification storage verification = userVerifications[user];
        verification.isActive = false;
        
        // Clear mappings
        string memory email = verification.email;
        walletToEmail[user] = "";
        emailToWallet[email] = address(0);
        
        emit WalletUnlinked(email, user, block.timestamp);
    }

    /**
     * @dev Generate migration proof for user (for mainnet migration)
     * @param user User address
     * @param signature User signature proving ownership
     * @return migrationHash Hash of the migration proof
     */
    function generateMigrationProof(
        address user,
        bytes memory signature
    ) external returns (bytes32 migrationHash) {
        require(userVerifications[user].isActive, "User not verified");
        require(mainnetMigrationContract != address(0), "Migration contract not set");
        
        // Forward to mainnet migration contract
        (bool success, bytes memory data) = mainnetMigrationContract.delegatecall(
            abi.encodeWithSignature("generateMigrationProof(address,bytes)", user, signature)
        );
        
        require(success, "Migration proof generation failed");
        return abi.decode(data, (bytes32));
    }

    /**
     * @dev Claim allocated tokens for verified user
     * @notice Users can claim their allocated tokens once after verification
     */
    function claimAllocation() external nonReentrant {
        address user = msg.sender;
        UserVerification storage verification = userVerifications[user];
        
        require(verification.isActive, "User not verified");
        require(verification.tokenAllocation > 0, "No allocation available");
        require(!verification.hasReceivedTokens, "Tokens already claimed");
        require(address(healthToken) != address(0), "Health token not set");
        
        uint256 allocationAmount = verification.tokenAllocation;
        verification.hasReceivedTokens = true;
        
        // Update both mappings
        userVerifications[user] = verification;
        userIdToVerification[verification.userId] = verification;
        
        // Transfer tokens to user
        require(healthToken.transfer(user, allocationAmount), "Token transfer failed");
        
        emit TokensClaimed(user, allocationAmount, block.timestamp);
    }
}
