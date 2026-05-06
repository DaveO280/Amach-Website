// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./SecureHealthProfileV1.sol";

/**
 * @title SecureHealthProfileV3_FromV1
 * @dev UUPS Upgradeable contract - V3 direct upgrade from V1
 * @notice Combines V2 features (Storj) + V3 features (Weight)
 * @notice IMPORTANT: Inherits from V1, adds V2+V3 features in one upgrade
 *
 * NEW FEATURES (from V2):
 * - Storj off-chain storage URIs for health events
 * - Content hash verification for off-chain data
 *
 * NEW FEATURES (from V3):
 * - Weight field added to profile (encrypted)
 * - Weight-only update function (gas efficient)
 *
 * UPGRADE NOTES:
 * - All existing V1 profiles remain compatible
 * - Weight field will be empty string for migrated profiles
 * - Storj fields optional (backwards compatible)
 */
contract SecureHealthProfileV3_FromV1 is SecureHealthProfileV1 {

    // ============================================
    // STORAGE LAYOUT (V2+V3 additions)
    // ============================================
    // NOTE: We add new storage AFTER V1's storage
    // This maintains compatibility with existing proxy storage

    // V2 additions: Storj off-chain storage
    mapping(address => mapping(uint256 => string)) public eventStorjUri;
    mapping(address => mapping(uint256 => bytes32)) public eventContentHash;

    // V3 addition: Weight field
    mapping(address => string) private encryptedWeights;

    // ============================================
    // EVENTS (V2+V3 specific)
    // ============================================

    // V2: Storj-backed event
    event HealthEventAddedV2(
        address indexed user,
        uint256 indexed eventId,
        bytes32 indexed searchTag,
        string storjUri,
        bytes32 contentHash,
        uint256 timestamp
    );

    // V3: Weight updated
    event WeightUpdated(
        address indexed user,
        uint256 timestamp
    );

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    // ============================================
    // V2 FEATURES: STORJ OFF-CHAIN STORAGE
    // ============================================

    /**
     * @notice Add health event with Storj off-chain storage (V2)
     * @param encryptedData On-chain encrypted summary
     * @param searchTag Searchable tag (keccak256(eventType + secret))
     * @param storjUri Off-chain Storj storage URI
     * @param contentHash Hash of off-chain content for verification
     */
    function addHealthEventWithStorj(
        string memory encryptedData,
        bytes32 searchTag,
        string memory storjUri,
        bytes32 contentHash
    ) external nonReentrant profileExists(msg.sender) {
        require(bytes(storjUri).length > 0, "Storj URI required");
        require(contentHash != bytes32(0), "Content hash required");

        // Add event to timeline (V1 format)
        HealthEvent memory newEvent = HealthEvent({
            timestamp: block.timestamp,
            searchTag: searchTag,
            encryptedData: encryptedData,
            eventHash: keccak256(abi.encodePacked(msg.sender, block.timestamp, searchTag)),
            isActive: true
        });

        uint256 eventId = healthTimeline[msg.sender].length;
        healthTimeline[msg.sender].push(newEvent);

        // Store Storj metadata
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

    // ============================================
    // V3 FEATURES: WEIGHT FIELD
    // ============================================

    /**
     * @notice Create new health profile with weight (V3)
     * @dev Includes weight field in addition to standard profile data
     */
    function createProfileWithWeight(
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

        // Create profile using parent's storage
        EncryptedProfile memory newProfile = EncryptedProfile({
            encryptedBirthDate: encryptedBirthDate,
            encryptedSex: encryptedSex,
            encryptedHeight: encryptedHeight,
            encryptedEmail: encryptedEmail,
            dataHash: dataHash,
            timestamp: block.timestamp,
            isActive: true,
            version: 1,
            nonce: nonce
        });

        profiles[msg.sender] = newProfile;
        hasProfile[msg.sender] = true;
        totalProfiles++;

        // Store weight separately
        encryptedWeights[msg.sender] = encryptedWeight;

        emit ProfileCreated(msg.sender, totalProfiles, dataHash, block.timestamp);
        emit WeightUpdated(msg.sender, block.timestamp);
    }

    /**
     * @notice Update health profile with weight (V3)
     * @dev Updates profile including weight field
     */
    function updateProfileWithWeight(
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
        profile.encryptedEmail = encryptedEmail;
        profile.dataHash = dataHash;
        profile.timestamp = block.timestamp;
        profile.nonce = nonce;

        // Update weight separately
        encryptedWeights[msg.sender] = encryptedWeight;

        emit ProfileUpdated(msg.sender, totalProfiles, dataHash, block.timestamp);
        emit WeightUpdated(msg.sender, block.timestamp);
    }

    /**
     * @notice Update only weight (gas-efficient for frequent updates)
     */
    function updateWeight(
        string memory encryptedWeight
    ) external nonReentrant profileExists(msg.sender) {
        require(bytes(encryptedWeight).length > 0, "Weight required");

        encryptedWeights[msg.sender] = encryptedWeight;

        emit WeightUpdated(msg.sender, block.timestamp);
    }

    /**
     * @notice Get profile with weight (V3)
     * @dev Returns profile data plus weight from separate mapping
     * @dev Returns as tuple to avoid stack too deep errors
     */
    function getProfileWithWeight(address user)
        external
        view
        returns (
            EncryptedProfile memory profile,
            string memory weight
        )
    {
        return (profiles[user], encryptedWeights[user]);
    }

    /**
     * @notice Get only weight (for quick lookups)
     */
    function getWeight(address user)
        external
        view
        returns (string memory)
    {
        return encryptedWeights[user];
    }

    // ============================================
    // VERSION INFO
    // ============================================

    /**
     * @notice Get contract version
     * @dev Returns 3 (V3 features)
     */
    function getContractVersion() external pure returns (uint8) {
        return 3;
    }

    // Note: _authorizeUpgrade is inherited from V1, no need to override
}
