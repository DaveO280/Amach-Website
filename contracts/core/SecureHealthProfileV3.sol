// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./SecureHealthProfileV2.sol";

/**
 * @title SecureHealthProfileV3
 * @dev UUPS Upgradeable contract - V3 adds weight field to profile
 * @notice V3: Adds encryptedWeight to EncryptedProfile struct
 * @notice IMPORTANT: Maintains storage compatibility with V2
 *
 * UPGRADE NOTES:
 * - Adds encryptedWeight to profile (was previously localStorage-only)
 * - All existing V2 profiles remain compatible
 * - Weight field will be empty string for migrated profiles (can be set via updateProfile)
 */
contract SecureHealthProfileV3 is SecureHealthProfileV2 {

    // ============================================
    // STORAGE LAYOUT (V3 additions only)
    // ============================================
    // NOTE: We cannot modify V2's EncryptedProfile struct directly
    // Instead, we add a mapping for weight data
    // This maintains storage compatibility while adding the feature

    mapping(address => string) private encryptedWeights;

    // ============================================
    // EVENTS (V3 specific)
    // ============================================

    event WeightUpdated(
        address indexed user,
        uint256 timestamp
    );

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    // ============================================
    // V3 UPGRADE: PROFILE FUNCTIONS WITH WEIGHT
    // ============================================

    /**
     * @notice Create new health profile with weight
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
     * @notice Update health profile with weight
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
     * @notice Get profile with weight
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

    function getContractVersion() external pure virtual returns (uint8) {
        return 3;
    }

    // Note: _authorizeUpgrade is inherited from V2, no need to override
}
