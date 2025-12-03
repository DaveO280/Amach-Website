// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/**
 * @title SecureHealthProfileV2
 * @dev UUPS Upgradeable contract - V2 adds Storj off-chain storage support
 * @notice V2: Adds storjUri and contentHash for off-chain encrypted storage
 * @notice Backwards compatible with V1 events (encryptedData field preserved)
 */
contract SecureHealthProfileV2 is
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

    // V2: New event for Storj-backed events
    event HealthEventAddedV2(
        address indexed user,
        uint256 indexed eventId,
        bytes32 indexed searchTag,
        string storjUri,
        bytes32 contentHash,
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
        string encryptedBirthDate;
        string encryptedSex;
        string encryptedHeight;
        string encryptedEmail;
        bytes32 dataHash;
        uint256 timestamp;
        bool isActive;
        uint8 version;
        string nonce;
    }

    /**
     * @dev Health event in immutable timeline - V1 format (kept for compatibility)
     * @notice This struct must not be modified to preserve storage layout
     */
    struct HealthEvent {
        uint256 timestamp;
        bytes32 searchTag;
        string encryptedData;    // V1: inline data, V2: empty string
        bytes32 eventHash;
        bool isActive;
    }

    /**
     * @dev ZK Proof data for privacy-preserving verification
     */
    struct ZKProofData {
        string ageRange;
        string heightRange;
        string weightRange;
        string emailDomain;
        bytes32 proofHash;
        uint256 timestamp;
        bool isValid;
    }

    // ============================================
    // STATE VARIABLES (Storage Layout V1 - DO NOT MODIFY)
    // ============================================
    // ⚠️ CRITICAL: Never reorder, rename, or delete these variables!

    mapping(address => EncryptedProfile) public profiles;
    mapping(address => bool) public hasProfile;
    uint256 public totalProfiles;
    uint8 public currentVersion;
    mapping(address => HealthEvent[]) public healthTimeline;
    mapping(address => ZKProofData) public zkProofs;

    // ============================================
    // STATE VARIABLES (Storage Layout V2 - APPEND ONLY)
    // ============================================

    /// @dev V2: Storj URI mapping for events (eventId => storjUri)
    mapping(address => mapping(uint256 => string)) public eventStorjUri;

    /// @dev V2: Content hash mapping for Storj data (eventId => contentHash)
    mapping(address => mapping(uint256 => bytes32)) public eventContentHash;

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

    /**
     * @dev V2 upgrade initialization
     * @notice Called after upgrade from V1 to V2
     */
    function initializeV2() external onlyOwner {
        require(currentVersion == 1, "Already V2 or higher");
        currentVersion = 2;
    }

    // ============================================
    // UPGRADE AUTHORIZATION
    // ============================================

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    // ============================================
    // MODIFIERS
    // ============================================

    modifier profileExists(address user) {
        require(hasProfile[user], "Profile does not exist");
        _;
    }

    // ============================================
    // PROFILE MANAGEMENT (unchanged from V1)
    // ============================================

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

    function deactivateProfile() external nonReentrant profileExists(msg.sender) {
        profiles[msg.sender].isActive = false;
        emit ProfileDeactivated(msg.sender, totalProfiles, block.timestamp);
    }

    function getProfile(address user)
        external
        view
        profileExists(user)
        returns (EncryptedProfile memory)
    {
        return profiles[user];
    }

    function isProfileActive(address user) external view returns (bool) {
        return hasProfile[user] && profiles[user].isActive;
    }

    // ============================================
    // HEALTH TIMELINE - V1 COMPATIBLE
    // ============================================

    /**
     * @dev V1 compatible: Add event with inline encrypted data
     * @notice Use addHealthEventV2 for Storj-backed events
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

    // ============================================
    // HEALTH TIMELINE - V2 WITH STORJ
    // ============================================

    /**
     * @dev V2: Add health event with Storj off-chain storage
     * @param searchTag Searchable encryption tag
     * @param storjUri Storj storage URI (e.g., "storj://bucket/path/file.enc")
     * @param contentHash SHA-256 hash of encrypted content for verification
     * @param eventHash Hash for event integrity
     * @notice encryptedData field is left empty to save gas
     */
    function addHealthEventV2(
        bytes32 searchTag,
        string memory storjUri,
        bytes32 contentHash,
        bytes32 eventHash
    ) external nonReentrant profileExists(msg.sender) {
        require(searchTag != bytes32(0), "Invalid search tag");
        require(eventHash != bytes32(0), "Invalid event hash");
        require(contentHash != bytes32(0), "Invalid content hash");
        require(bytes(storjUri).length > 0, "Storj URI required");

        // Store minimal data on-chain
        HealthEvent memory newEvent = HealthEvent({
            timestamp: block.timestamp,
            searchTag: searchTag,
            encryptedData: "",  // Empty - data is on Storj
            eventHash: eventHash,
            isActive: true
        });

        healthTimeline[msg.sender].push(newEvent);

        uint256 eventId = healthTimeline[msg.sender].length - 1;

        // Store Storj reference in V2 mappings
        eventStorjUri[msg.sender][eventId] = storjUri;
        eventContentHash[msg.sender][eventId] = contentHash;

        emit HealthEventAddedV2(
            msg.sender,
            eventId,
            searchTag,
            storjUri,
            contentHash,
            block.timestamp
        );
    }

    /**
     * @dev Get Storj URI for an event
     * @param user User address
     * @param eventId Event ID
     * @return storjUri The Storj storage URI
     */
    function getEventStorjUri(address user, uint256 eventId)
        external
        view
        profileExists(user)
        returns (string memory)
    {
        require(eventId < healthTimeline[user].length, "Invalid event ID");
        return eventStorjUri[user][eventId];
    }

    /**
     * @dev Get content hash for an event
     * @param user User address
     * @param eventId Event ID
     * @return contentHash The SHA-256 hash of encrypted content
     */
    function getEventContentHash(address user, uint256 eventId)
        external
        view
        profileExists(user)
        returns (bytes32)
    {
        require(eventId < healthTimeline[user].length, "Invalid event ID");
        return eventContentHash[user][eventId];
    }

    /**
     * @dev Check if event uses Storj storage
     * @param user User address
     * @param eventId Event ID
     * @return True if event has Storj URI
     */
    function isStorjEvent(address user, uint256 eventId)
        external
        view
        profileExists(user)
        returns (bool)
    {
        require(eventId < healthTimeline[user].length, "Invalid event ID");
        return bytes(eventStorjUri[user][eventId]).length > 0;
    }

    /**
     * @dev Soft delete a health event
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
     * @dev Get events by search tag
     */
    function getEventsByTag(address user, bytes32 searchTag)
        external
        view
        profileExists(user)
        returns (HealthEvent[] memory)
    {
        HealthEvent[] memory allEvents = healthTimeline[user];
        uint256 matchCount = 0;

        for (uint256 i = 0; i < allEvents.length; i++) {
            if (allEvents[i].searchTag == searchTag && allEvents[i].isActive) {
                matchCount++;
            }
        }

        HealthEvent[] memory filtered = new HealthEvent[](matchCount);
        uint256 currentIndex = 0;

        for (uint256 i = 0; i < allEvents.length; i++) {
            if (allEvents[i].searchTag == searchTag && allEvents[i].isActive) {
                filtered[currentIndex] = allEvents[i];
                currentIndex++;
            }
        }

        return filtered;
    }

    /**
     * @dev Get events in date range
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

        for (uint256 i = 0; i < allEvents.length; i++) {
            bool timeMatch = allEvents[i].timestamp >= startTime &&
                            allEvents[i].timestamp <= endTime;
            bool tagMatch = !filterByTag || allEvents[i].searchTag == searchTag;

            if (timeMatch && tagMatch && allEvents[i].isActive) {
                matchCount++;
            }
        }

        HealthEvent[] memory filtered = new HealthEvent[](matchCount);
        uint256 currentIndex = 0;

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

        for (uint256 i = 0; i < allEvents.length; i++) {
            if (allEvents[i].isActive) {
                activeCount++;
            }
        }

        HealthEvent[] memory active = new HealthEvent[](activeCount);
        uint256 currentIndex = 0;

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
    // ZK PROOF MANAGEMENT (unchanged from V1)
    // ============================================

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

    function getZKProof(address user)
        external
        view
        profileExists(user)
        returns (ZKProofData memory)
    {
        return zkProofs[user];
    }

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

    function getTotalProfiles() external view returns (uint256) {
        return totalProfiles;
    }

    function getVersion() external view returns (uint8) {
        return currentVersion;
    }
}
