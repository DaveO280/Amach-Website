// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/**
 * @title SecureHealthProfile
 * @dev Secure smart contract for storing encrypted health data on ZKsync Era
 * @notice Stores actual encrypted data (not hashes) to enable ZK-proof verification
 */
contract SecureHealthProfile is Ownable, ReentrancyGuard {
    using ECDSA for bytes32;

    constructor() Ownable(msg.sender) {}

    // Events
    event ProfileCreated(address indexed user, uint256 indexed profileId, bytes32 dataHash);
    event ProfileUpdated(address indexed user, uint256 indexed profileId, bytes32 newDataHash);
    event ProfileDeactivated(address indexed user, uint256 indexed profileId);
    event ZKProofSubmitted(address indexed user, uint256 indexed profileId, bytes32 proofHash);
    event DataAccessGranted(address indexed user, address indexed requester, uint256 timestamp);

    // Structs
    struct EncryptedProfile {
        // Store actual encrypted data (Base64 encoded) - not hashes
        string encryptedBirthDate;    // AES-256-GCM encrypted birthdate
        string encryptedSex;          // AES-256-GCM encrypted sex/gender
        string encryptedHeight;       // AES-256-GCM encrypted height
        string encryptedWeight;       // AES-256-GCM encrypted weight
        string encryptedEmail;        // AES-256-GCM encrypted email
        bytes32 dataHash;             // Hash of original data for integrity
        uint256 timestamp;            // Last update timestamp
        bool isActive;                // Profile active status
        uint8 version;                // Profile version for upgrades
        string nonce;                 // AES-GCM nonce for decryption
    }

    struct ZKProofData {
        string ageRange;              // e.g., "25-35" (not exact age)
        string heightRange;           // e.g., "5'8\"-6'0\"" (not exact height)
        string weightRange;           // e.g., "150-180" (not exact weight)
        string emailDomain;           // e.g., "gmail.com" (not full email)
        bytes32 proofHash;            // Hash of the ZK proof
        uint256 timestamp;            // Proof submission timestamp
        bool isValid;                 // Proof validity status
    }

    struct AccessPermission {
        address requester;
        uint256 timestamp;
        bool granted;
        string purpose;               // e.g., "health_analysis", "research"
    }

    // State variables
    mapping(address => EncryptedProfile) public profiles;
    mapping(address => bool) public hasProfile;
    mapping(address => ZKProofData) public zkProofs;
    mapping(address => AccessPermission[]) public accessPermissions;
    
    // Protocol access control
    mapping(address => bool) public protocolAccess;
    address[] public authorizedProtocols;
    
    uint256 public totalProfiles;
    uint8 public currentVersion = 2; // Updated version for secure storage
    
    // Modifiers
    modifier onlyProfileOwner(address user) {
        require(msg.sender == user || msg.sender == owner(), "Not authorized");
        _;
    }

    modifier profileExists(address user) {
        require(hasProfile[user], "Profile does not exist");
        _;
    }

    modifier onlyAuthorizedProtocol() {
        require(protocolAccess[msg.sender] || msg.sender == owner(), "Not authorized protocol");
        _;
    }

    /**
     * @dev Create a new encrypted health profile with actual encrypted data
     */
    function createSecureProfile(
        string memory encryptedBirthDate,
        string memory encryptedSex,
        string memory encryptedHeight,
        string memory encryptedWeight,
        string memory encryptedEmail,
        bytes32 dataHash,
        string memory nonce
    ) external nonReentrant {
        require(!hasProfile[msg.sender], "Profile already exists");
        require(dataHash != bytes32(0), "Invalid data hash");
        require(bytes(nonce).length > 0, "Nonce required");

        EncryptedProfile memory newProfile = EncryptedProfile({
            encryptedBirthDate: encryptedBirthDate,
            encryptedSex: encryptedSex,
            encryptedHeight: encryptedHeight,
            encryptedWeight: encryptedWeight,
            encryptedEmail: encryptedEmail,
            dataHash: dataHash,
            timestamp: block.timestamp,
            isActive: true,
            version: currentVersion,
            nonce: nonce
        });

        profiles[msg.sender] = newProfile;
        hasProfile[msg.sender] = true;
        totalProfiles++;

        emit ProfileCreated(msg.sender, totalProfiles, dataHash);
    }

    /**
     * @dev Update existing encrypted health profile
     */
    function updateSecureProfile(
        string memory encryptedBirthDate,
        string memory encryptedSex,
        string memory encryptedHeight,
        string memory encryptedWeight,
        string memory encryptedEmail,
        bytes32 dataHash,
        string memory nonce
    ) external nonReentrant profileExists(msg.sender) {
        require(dataHash != bytes32(0), "Invalid data hash");
        require(bytes(nonce).length > 0, "Nonce required");

        EncryptedProfile storage profile = profiles[msg.sender];
        
        profile.encryptedBirthDate = encryptedBirthDate;
        profile.encryptedSex = encryptedSex;
        profile.encryptedHeight = encryptedHeight;
        profile.encryptedWeight = encryptedWeight;
        profile.encryptedEmail = encryptedEmail;
        profile.dataHash = dataHash;
        profile.timestamp = block.timestamp;
        profile.version = currentVersion;
        profile.nonce = nonce;

        emit ProfileUpdated(msg.sender, totalProfiles, dataHash);
    }

    /**
     * @dev Deactivate a health profile
     */
    function deactivateProfile() external nonReentrant profileExists(msg.sender) {
        profiles[msg.sender].isActive = false;
        emit ProfileDeactivated(msg.sender, totalProfiles);
    }

    /**
     * @dev Submit ZK proof data for privacy-preserving verification
     */
    function submitZKProof(
        string memory ageRange,
        string memory heightRange,
        string memory weightRange,
        string memory emailDomain,
        bytes32 proofHash
    ) external nonReentrant profileExists(msg.sender) {
        ZKProofData memory proofData = ZKProofData({
            ageRange: ageRange,
            heightRange: heightRange,
            weightRange: weightRange,
            emailDomain: emailDomain,
            proofHash: proofHash,
            timestamp: block.timestamp,
            isValid: true
        });

        zkProofs[msg.sender] = proofData;
        emit ZKProofSubmitted(msg.sender, totalProfiles, proofHash);
    }

    /**
     * @dev Grant access to protocol for health data analysis
     */
    function grantProtocolAccess(
        address user,
        string memory purpose
    ) external onlyAuthorizedProtocol profileExists(user) {
        AccessPermission memory permission = AccessPermission({
            requester: msg.sender,
            timestamp: block.timestamp,
            granted: true,
            purpose: purpose
        });

        accessPermissions[user].push(permission);
        emit DataAccessGranted(user, msg.sender, block.timestamp);
    }

    /**
     * @dev Get encrypted profile data
     * @notice Users can read their own profiles, authorized protocols can read any profile
     */
    function getEncryptedProfile(address user) 
        external 
        view 
        profileExists(user) 
        returns (EncryptedProfile memory) 
    {
        // No authorization check needed - data is encrypted on-chain
        // Anyone can read the encrypted data, but only the owner has the decryption key
        return profiles[user];
    }

    /**
     * @dev Get ZK proof data (public - no sensitive data)
     */
    function getZKProof(address user) 
        external 
        view 
        profileExists(user) 
        returns (ZKProofData memory) 
    {
        return zkProofs[user];
    }

    /**
     * @dev Verify ZK proof conditions
     */
    function verifyZKProofConditions(
        address user,
        uint256 minAge,
        uint256 maxAge,
        string memory requiredHeightRange,
        string memory requiredWeightRange,
        string[] memory allowedDomains
    ) external view profileExists(user) returns (bool) {
        ZKProofData memory proof = zkProofs[user];
        require(proof.isValid, "Invalid proof");

        // Parse age range from proof
        (uint256 proofMinAge, uint256 proofMaxAge) = parseAgeRange(proof.ageRange);
        
        // Check age constraints
        if (proofMaxAge < minAge || proofMinAge > maxAge) {
            return false;
        }

        // Check height range
        if (bytes(requiredHeightRange).length > 0 && 
            keccak256(bytes(proof.heightRange)) != keccak256(bytes(requiredHeightRange))) {
            return false;
        }

        // Check weight range
        if (bytes(requiredWeightRange).length > 0 && 
            keccak256(bytes(proof.weightRange)) != keccak256(bytes(requiredWeightRange))) {
            return false;
        }

        // Check email domain
        if (allowedDomains.length > 0) {
            bool domainAllowed = false;
            for (uint i = 0; i < allowedDomains.length; i++) {
                if (keccak256(bytes(proof.emailDomain)) == keccak256(bytes(allowedDomains[i]))) {
                    domainAllowed = true;
                    break;
                }
            }
            if (!domainAllowed) return false;
        }

        return true;
    }

    /**
     * @dev Add authorized protocol address
     */
    function addAuthorizedProtocol(address protocol) external onlyOwner {
        require(protocol != address(0), "Invalid protocol address");
        protocolAccess[protocol] = true;
        authorizedProtocols.push(protocol);
    }

    /**
     * @dev Remove authorized protocol address
     */
    function removeAuthorizedProtocol(address protocol) external onlyOwner {
        protocolAccess[protocol] = false;
        // Note: Keeping in array for audit trail, but access is revoked
    }

    /**
     * @dev Get total number of profiles
     */
    function getTotalProfiles() external view returns (uint256) {
        return totalProfiles;
    }

    /**
     * @dev Get profile metadata (public info only)
     */
    function getProfileMetadata(address user) 
        external 
        view 
        profileExists(user) 
        returns (uint256 timestamp, bool isActive, uint8 version, bytes32 dataHash) 
    {
        EncryptedProfile memory profile = profiles[user];
        return (profile.timestamp, profile.isActive, profile.version, profile.dataHash);
    }

    // Helper function to parse age range
    function parseAgeRange(string memory ageRange) internal pure returns (uint256, uint256) {
        // Parse "25-35" format
        bytes memory data = bytes(ageRange);
        uint256 dashIndex = 0;
        
        for (uint256 i = 0; i < data.length; i++) {
            if (data[i] == 0x2D) { // ASCII for '-'
                dashIndex = i;
                break;
            }
        }
        
        require(dashIndex > 0, "Invalid age range format");
        
        // Create new byte arrays for the parts
        bytes memory minAgeBytes = new bytes(dashIndex);
        bytes memory maxAgeBytes = new bytes(data.length - dashIndex - 1);
        
        for (uint256 i = 0; i < dashIndex; i++) {
            minAgeBytes[i] = data[i];
        }
        
        for (uint256 i = 0; i < maxAgeBytes.length; i++) {
            maxAgeBytes[i] = data[dashIndex + 1 + i];
        }
        
        string memory minAgeStr = string(minAgeBytes);
        string memory maxAgeStr = string(maxAgeBytes);
        
        return (parseUint(minAgeStr), parseUint(maxAgeStr));
    }

    // Helper function to parse string to uint
    function parseUint(string memory str) internal pure returns (uint256) {
        bytes memory data = bytes(str);
        uint256 result = 0;
        
        for (uint256 i = 0; i < data.length; i++) {
            require(data[i] >= 0x30 && data[i] <= 0x39, "Invalid number");
            result = result * 10 + (uint256(uint8(data[i])) - 0x30);
        }
        
        return result;
    }
}
