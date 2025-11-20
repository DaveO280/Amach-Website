// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/**
 * @title SecureHealthProfileV1
 * @dev UUPS Upgradeable contract for storing encrypted health data with event-based timeline
 * @notice V1: Core profile + immutable health event timeline
 * @notice Future V2+: Can add attestations, verifications, and additional features
 */
contract SecureHealthProfileV1 is 
    Initializable, 
    OwnableUpgradeable, 
    ReentrancyGuardUpgradeable,
    UUPSUpgradeable 
{
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    // ============================================
    // EVENTS
    // ============================================
    
    event ProfileCreated(
        address indexed user, 
        uint256 indexed profileId, 
        bytes32 dataHash,
        uint256 timestamp
    );
    
    event ProfileUpdated(
        address indexed user, 
        uint256 indexed profileId, 
        bytes32 newDataHash,
        uint256 timestamp
    );
    
    event ProfileDeactivated(
        address indexed user, 
        uint256 indexed profileId,
        uint256 timestamp
    );
    
    event HealthEventAdded(
        address indexed user,
        uint256 indexed eventId,
        bytes32 indexed searchTag,
        uint256 timestamp
    );
    
    event HealthEventDeactivated(
        address indexed user,
        uint256 indexed eventId,
        uint256 timestamp
    );
    
    event ZKProofSubmitted(
        address indexed user, 
        bytes32 indexed proofHash,
        uint256 timestamp
    );

    // ============================================
    // ENUMS
    // ============================================
    
    enum EventType {
        MEDICATION_STARTED,
        MEDICATION_STOPPED,
        CONDITION_DIAGNOSED,
        CONDITION_RESOLVED,
        SURGERY_COMPLETED,
        ALLERGY_ADDED,
        WEIGHT_RECORDED,
        HEIGHT_RECORDED,
        METRIC_SNAPSHOT,
        GENERAL_NOTE
    }

    // ============================================
    // STRUCTS
    // ============================================
    
    /**
     * @dev Core encrypted profile (demographic data)
     * @notice Stores base-64 encoded AES-256-GCM encrypted strings
     */
    struct EncryptedProfile {
        string encryptedBirthDate;    // Encrypted birth date
        string encryptedSex;          // Encrypted sex/gender
        string encryptedHeight;       // Encrypted initial height
        string encryptedEmail;        // Encrypted email
        bytes32 dataHash;             // Hash of original data for integrity
        uint256 timestamp;            // Last update timestamp
        bool isActive;                // Profile active status
        uint8 version;                // Profile version
        string nonce;                 // AES-GCM nonce for decryption
    }

    /**
     * @dev Health event in immutable timeline with searchable encryption
     * @notice Append-only events create complete health history
     * @notice Searchable encryption: keccak256(eventType + userSecret)
     * @notice Future V2+: Can add attestation fields
     */
    struct HealthEvent {
        uint256 timestamp;            // Event timestamp
        bytes32 searchTag;            // Searchable tag: keccak256(eventType + userSecret)
        string encryptedData;         // Encrypted JSON payload (includes eventType)
        bytes32 eventHash;            // Hash for integrity
        bool isActive;                // Soft delete flag
    }

    /**
     * @dev ZK Proof data for privacy-preserving verification
     */
    struct ZKProofData {
        string ageRange;              // e.g., "25-35" (not exact age)
        string heightRange;           // e.g., "5'8\"-6'0\"" (not exact height)
        string weightRange;           // e.g., "150-180" (not exact weight)
        string emailDomain;           // e.g., "gmail.com" (not full email)
        bytes32 proofHash;            // Hash of the ZK proof
        uint256 timestamp;            // Proof submission timestamp
        bool isValid;                 // Proof validity status
    }

    // ============================================
    // STATE VARIABLES (Storage Layout V1)
    // ============================================
    // ⚠️ CRITICAL: Never reorder, rename, or delete these variables!
    // ⚠️ Only APPEND new variables at the end in future versions
    
    /// @dev Core profiles mapping
    mapping(address => EncryptedProfile) public profiles;
    
    /// @dev Profile existence flag
    mapping(address => bool) public hasProfile;
    
    /// @dev Total number of profiles created
    uint256 public totalProfiles;
    
    /// @dev Current contract version
    uint8 public currentVersion;
    
    /// @dev Health event timeline (append-only)
    mapping(address => HealthEvent[]) public healthTimeline;
    
    /// @dev ZK proof data
    mapping(address => ZKProofData) public zkProofs;
    
    // ============================================
    // INITIALIZER (replaces constructor)
    // ============================================
    
    function initialize() public initializer {
        __Ownable_init(msg.sender);
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();
        
        currentVersion = 1;
        totalProfiles = 0;
    }

    // ============================================
    // UPGRADE AUTHORIZATION
    // ============================================
    
    /**
     * @dev Required by UUPS - only owner can upgrade
     */
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    // ============================================
    // MODIFIERS
    // ============================================
    
    modifier profileExists(address user) {
        require(hasProfile[user], "Profile does not exist");
        _;
    }

    // ============================================
    // PROFILE MANAGEMENT
    // ============================================
    
    /**
     * @dev Create a new encrypted health profile
     */
    function createProfile(
        string memory encryptedBirthDate,
        string memory encryptedSex,
        string memory encryptedHeight,
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

        emit ProfileCreated(msg.sender, totalProfiles, dataHash, block.timestamp);
    }

    /**
     * @dev Update existing encrypted profile
     */
    function updateProfile(
        string memory encryptedBirthDate,
        string memory encryptedSex,
        string memory encryptedHeight,
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
        profile.encryptedEmail = encryptedEmail;
        profile.dataHash = dataHash;
        profile.timestamp = block.timestamp;
        profile.version = currentVersion;
        profile.nonce = nonce;

        emit ProfileUpdated(msg.sender, totalProfiles, dataHash, block.timestamp);
    }

    /**
     * @dev Deactivate a health profile (soft delete)
     */
    function deactivateProfile() external nonReentrant profileExists(msg.sender) {
        profiles[msg.sender].isActive = false;
        emit ProfileDeactivated(msg.sender, totalProfiles, block.timestamp);
    }

    /**
     * @dev Get encrypted profile data
     * @notice Anyone can read encrypted data (only owner has decryption key)
     */
    function getProfile(address user) 
        external 
        view 
        profileExists(user) 
        returns (EncryptedProfile memory) 
    {
        return profiles[user];
    }

    /**
     * @dev Check if profile is active
     */
    function isProfileActive(address user) external view returns (bool) {
        return hasProfile[user] && profiles[user].isActive;
    }

    // ============================================
    // HEALTH TIMELINE (Immutable Events)
    // ============================================
    
    /**
     * @dev Add a health event to the timeline
     * @notice Events are append-only for complete health history
     */
    /**
     * @notice Add a health event with searchable encryption
     * @param searchTag keccak256(abi.encodePacked(eventType, userSecret))
     * @param encryptedData Encrypted JSON payload (includes eventType)
     * @param eventHash Hash for integrity verification
     * @dev userSecret is derived from wallet signature (never sent to contract)
     * @dev Enables private filtering without revealing event types on-chain
     */
    function addHealthEvent(
        bytes32 searchTag,
        string memory encryptedData,
        bytes32 eventHash
    ) external nonReentrant profileExists(msg.sender) {
        require(searchTag != bytes32(0), "Invalid search tag");
        require(eventHash != bytes32(0), "Invalid event hash");
        require(bytes(encryptedData).length > 0, "Event data required");

        HealthEvent memory newEvent = HealthEvent({
            timestamp: block.timestamp,
            searchTag: searchTag,
            encryptedData: encryptedData,
            eventHash: eventHash,
            isActive: true
        });

        healthTimeline[msg.sender].push(newEvent);
        
        uint256 eventId = healthTimeline[msg.sender].length - 1;
        emit HealthEventAdded(msg.sender, eventId, searchTag, block.timestamp);
    }

    /**
     * @dev Soft delete a health event (mark as inactive)
     * @notice Event remains in timeline but marked inactive
     */
    function deactivateHealthEvent(uint256 eventId) 
        external 
        nonReentrant 
        profileExists(msg.sender) 
    {
        require(eventId < healthTimeline[msg.sender].length, "Invalid event ID");
        
        healthTimeline[msg.sender][eventId].isActive = false;
        emit HealthEventDeactivated(msg.sender, eventId, block.timestamp);
    }

    /**
     * @dev Get entire health timeline for a user
     */
    function getHealthTimeline(address user) 
        external 
        view 
        profileExists(user) 
        returns (HealthEvent[] memory) 
    {
        return healthTimeline[user];
    }

    /**
     * @dev Get health events by type
     */
    /**
     * @notice Get health events filtered by search tag
     * @param user User address
     * @param searchTag keccak256(abi.encodePacked(eventType, userSecret))
     * @return Array of matching health events
     * @dev Caller must know the search tag (requires userSecret)
     * @dev Enables private filtering without revealing event types
     */
    function getEventsByTag(address user, bytes32 searchTag) 
        external 
        view 
        profileExists(user) 
        returns (HealthEvent[] memory) 
    {
        HealthEvent[] memory allEvents = healthTimeline[user];
        uint256 matchCount = 0;

        // Count matches
        for (uint256 i = 0; i < allEvents.length; i++) {
            if (allEvents[i].searchTag == searchTag && allEvents[i].isActive) {
                matchCount++;
            }
        }

        // Create result array
        HealthEvent[] memory filtered = new HealthEvent[](matchCount);
        uint256 currentIndex = 0;

        // Populate result
        for (uint256 i = 0; i < allEvents.length; i++) {
            if (allEvents[i].searchTag == searchTag && allEvents[i].isActive) {
                filtered[currentIndex] = allEvents[i];
                currentIndex++;
            }
        }

        return filtered;
    }

    /**
     * @dev Get events in date range (for AI context)
     */
    /**
     * @notice Get health events in a time range, optionally filtered by tag
     * @param user User address
     * @param startTime Start timestamp (inclusive)
     * @param endTime End timestamp (inclusive)
     * @param searchTag Optional tag filter (use bytes32(0) for no filter)
     * @return Array of matching health events
     */
    function getEventsInRange(
        address user, 
        uint256 startTime, 
        uint256 endTime,
        bytes32 searchTag
    ) 
        external 
        view 
        profileExists(user) 
        returns (HealthEvent[] memory) 
    {
        require(startTime <= endTime, "Invalid time range");
        
        HealthEvent[] memory allEvents = healthTimeline[user];
        uint256 matchCount = 0;
        bool filterByTag = searchTag != bytes32(0);

        // Count matches
        for (uint256 i = 0; i < allEvents.length; i++) {
            bool timeMatch = allEvents[i].timestamp >= startTime && 
                            allEvents[i].timestamp <= endTime;
            bool tagMatch = !filterByTag || allEvents[i].searchTag == searchTag;
            
            if (timeMatch && tagMatch && allEvents[i].isActive) {
                matchCount++;
            }
        }

        // Create result array
        HealthEvent[] memory filtered = new HealthEvent[](matchCount);
        uint256 currentIndex = 0;

        // Populate result
        for (uint256 i = 0; i < allEvents.length; i++) {
            bool timeMatch = allEvents[i].timestamp >= startTime && 
                            allEvents[i].timestamp <= endTime;
            bool tagMatch = !filterByTag || allEvents[i].searchTag == searchTag;
            
            if (timeMatch && tagMatch && allEvents[i].isActive) {
                filtered[currentIndex] = allEvents[i];
                currentIndex++;
            }
        }

        return filtered;
    }

    /**
     * @dev Get active events only
     */
    function getActiveEvents(address user) 
        external 
        view 
        profileExists(user) 
        returns (HealthEvent[] memory) 
    {
        HealthEvent[] memory allEvents = healthTimeline[user];
        uint256 activeCount = 0;

        // Count active events
        for (uint256 i = 0; i < allEvents.length; i++) {
            if (allEvents[i].isActive) {
                activeCount++;
            }
        }

        // Create result array
        HealthEvent[] memory active = new HealthEvent[](activeCount);
        uint256 currentIndex = 0;

        // Populate result
        for (uint256 i = 0; i < allEvents.length; i++) {
            if (allEvents[i].isActive) {
                active[currentIndex] = allEvents[i];
                currentIndex++;
            }
        }

        return active;
    }

    /**
     * @dev Get total event count for user
     */
    function getEventCount(address user) 
        external 
        view 
        profileExists(user) 
        returns (uint256) 
    {
        return healthTimeline[user].length;
    }

    // ============================================
    // ZK PROOF MANAGEMENT
    // ============================================
    
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
        require(proofHash != bytes32(0), "Invalid proof hash");

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
        emit ZKProofSubmitted(msg.sender, proofHash, block.timestamp);
    }

    /**
     * @dev Get ZK proof data
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
     * @dev Invalidate ZK proof
     */
    function invalidateZKProof() 
        external 
        nonReentrant 
        profileExists(msg.sender) 
    {
        zkProofs[msg.sender].isValid = false;
    }

    // ============================================
    // VIEW FUNCTIONS
    // ============================================
    
    /**
     * @dev Get profile metadata (public info only)
     */
    function getProfileMetadata(address user) 
        external 
        view 
        profileExists(user) 
        returns (
            uint256 timestamp, 
            bool isActive, 
            uint8 version, 
            bytes32 dataHash
        ) 
    {
        EncryptedProfile memory profile = profiles[user];
        return (
            profile.timestamp, 
            profile.isActive, 
            profile.version, 
            profile.dataHash
        );
    }

    /**
     * @dev Get total profile count
     */
    function getTotalProfiles() external view returns (uint256) {
        return totalProfiles;
    }

    /**
     * @dev Get contract version
     */
    function getVersion() external view returns (uint8) {
        return currentVersion;
    }
}

