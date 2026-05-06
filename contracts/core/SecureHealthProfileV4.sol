// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./SecureHealthProfileV3.sol";

/**
 * @title SecureHealthProfileV4
 * @dev UUPS Upgradeable contract - V4 adds health data attestation
 * @notice V4: Adds on-chain attestation for uploaded health data
 * @notice Proves data uploads without revealing content
 *
 * UPGRADE NOTES:
 * - Adds attestation system for health data uploads
 * - Supports multiple data types (DEXA, Bloodwork, Apple Health, CGM)
 * - Tracks completeness scores for attestation tiers
 * - All existing V3 profiles remain compatible
 *
 * Custom errors (E0–E7) used to stay under 24KB contract size limit.
 */
contract SecureHealthProfileV4 is SecureHealthProfileV3 {

    error E0(); error E1(); error E2(); error E3(); error E4(); error E5(); error E6(); error E7();

    // ============================================
    // CONSTANTS
    // ============================================

    // Data type identifiers (matches TypeScript HealthDataType enum)
    uint8 public constant DATA_TYPE_DEXA = 0;
    uint8 public constant DATA_TYPE_BLOODWORK = 1;
    uint8 public constant DATA_TYPE_APPLE_HEALTH = 2;
    uint8 public constant DATA_TYPE_CGM = 3;

    // Attestation tier thresholds (matches TypeScript ATTESTATION_TIERS)
    uint16 public constant TIER_GOLD_MIN_SCORE = 8000;      // 80.00%
    uint16 public constant TIER_SILVER_MIN_SCORE = 6000;    // 60.00%
    uint16 public constant TIER_BRONZE_MIN_SCORE = 4000;    // 40.00%

    // ============================================
    // STORAGE LAYOUT (V4 additions)
    // ============================================

    /**
     * @dev Attestation record for a health data upload
     * Packed for gas efficiency:
     * - contentHash: 32 bytes (SHA256 of encrypted data)
     * - dataType: 1 byte
     * - startDate: 5 bytes (uint40 unix timestamp)
     * - endDate: 5 bytes (uint40 unix timestamp)
     * - completenessScore: 2 bytes (0-10000 = 0-100.00%)
     * - recordCount: 2 bytes (days or record count)
     * - coreComplete: 1 byte (bool)
     * - timestamp: 5 bytes (uint40 when attested)
     */
    struct Attestation {
        bytes32 contentHash;
        uint8 dataType;
        uint40 startDate;
        uint40 endDate;
        uint16 completenessScore;
        uint16 recordCount;
        bool coreComplete;
        uint40 timestamp;
    }

    // User address => array of attestations
    mapping(address => Attestation[]) private userAttestations;

    // Content hash => attesting user (for verification)
    mapping(bytes32 => address) private hashToUser;

    // User => dataType => count of attestations
    mapping(address => mapping(uint8 => uint16)) private attestationCounts;

    // Total attestations across all users
    uint256 public totalAttestations;

    // ============================================
    // EVENTS
    // ============================================

    event AttestationCreated(
        address indexed user,
        bytes32 indexed contentHash,
        uint8 dataType,
        uint16 completenessScore,
        uint40 startDate,
        uint40 endDate,
        uint256 attestationIndex
    );

    event AttestationRevoked(
        address indexed user,
        bytes32 indexed contentHash,
        uint256 attestationIndex
    );

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    // ============================================
    // ATTESTATION FUNCTIONS
    // ============================================

    /**
     * @notice Create attestation for uploaded health data
     * @param contentHash SHA256 hash of the encrypted data
     * @param dataType Type of health data (0=DEXA, 1=Bloodwork, 2=AppleHealth, 3=CGM)
     * @param startDate Start of data coverage period (unix timestamp)
     * @param endDate End of data coverage period (unix timestamp)
     * @param completenessScore Completeness score 0-10000 (0-100.00%)
     * @param recordCount Number of records/days in dataset
     * @param coreComplete Whether all core metrics are present
     */
    function createAttestation(
        bytes32 contentHash,
        uint8 dataType,
        uint40 startDate,
        uint40 endDate,
        uint16 completenessScore,
        uint16 recordCount,
        bool coreComplete
    ) external nonReentrant profileExists(msg.sender) {
        if (contentHash == bytes32(0)) revert E0();
        if (dataType > DATA_TYPE_CGM) revert E1();
        if (startDate >= endDate) revert E2();
        if (endDate > uint40(block.timestamp)) revert E3();
        if (completenessScore > 10000) revert E4();
        if (hashToUser[contentHash] != address(0)) revert E5();

        Attestation memory newAttestation = Attestation({
            contentHash: contentHash,
            dataType: dataType,
            startDate: startDate,
            endDate: endDate,
            completenessScore: completenessScore,
            recordCount: recordCount,
            coreComplete: coreComplete,
            timestamp: uint40(block.timestamp)
        });

        userAttestations[msg.sender].push(newAttestation);
        hashToUser[contentHash] = msg.sender;
        attestationCounts[msg.sender][dataType]++;
        totalAttestations++;

        uint256 index = userAttestations[msg.sender].length - 1;

        emit AttestationCreated(
            msg.sender,
            contentHash,
            dataType,
            completenessScore,
            startDate,
            endDate,
            index
        );
    }

    /**
     * @dev Internal helper to add one attestation at index i (reduces stack depth in batch)
     */
    function _pushAttestationAt(
        uint256 i,
        bytes32[] calldata contentHashes,
        uint8[] calldata dataTypes,
        uint40[] calldata startDates,
        uint40[] calldata endDates,
        uint16[] calldata completenessScores,
        uint16[] calldata recordCounts,
        bool[] calldata coreCompletes
    ) internal {
        bytes32 contentHash = contentHashes[i];
        if (contentHash == bytes32(0)) revert E0();
        uint8 dataType = dataTypes[i];
        if (dataType > DATA_TYPE_CGM) revert E1();
        uint40 startDate = startDates[i];
        uint40 endDate = endDates[i];
        if (startDate >= endDate) revert E2();
        if (endDate > uint40(block.timestamp)) revert E3();
        uint16 completenessScore = completenessScores[i];
        if (completenessScore > 10000) revert E4();
        if (hashToUser[contentHash] != address(0)) revert E5();

        Attestation memory newAttestation = Attestation({
            contentHash: contentHash,
            dataType: dataType,
            startDate: startDate,
            endDate: endDate,
            completenessScore: completenessScore,
            recordCount: recordCounts[i],
            coreComplete: coreCompletes[i],
            timestamp: uint40(block.timestamp)
        });

        userAttestations[msg.sender].push(newAttestation);
        hashToUser[contentHash] = msg.sender;
        attestationCounts[msg.sender][dataType]++;
    }

    /**
     * @notice Batch create attestations (gas efficient for multiple uploads)
     * @param contentHashes Array of content hashes
     * @param dataTypes Array of data types
     * @param startDates Array of start dates
     * @param endDates Array of end dates
     * @param completenessScores Array of completeness scores
     * @param recordCounts Array of record counts
     * @param coreCompletes Array of core complete flags
     */
    function createAttestationBatch(
        bytes32[] calldata contentHashes,
        uint8[] calldata dataTypes,
        uint40[] calldata startDates,
        uint40[] calldata endDates,
        uint16[] calldata completenessScores,
        uint16[] calldata recordCounts,
        bool[] calldata coreCompletes
    ) external nonReentrant profileExists(msg.sender) {
        uint256 len = contentHashes.length;
        if (len == 0 || len > 50) revert E6();
        if (
            dataTypes.length != len ||
            startDates.length != len ||
            endDates.length != len ||
            completenessScores.length != len ||
            recordCounts.length != len ||
            coreCompletes.length != len
        ) revert E7();

        for (uint256 i = 0; i < len; i++) {
            _pushAttestationAt(
                i,
                contentHashes,
                dataTypes,
                startDates,
                endDates,
                completenessScores,
                recordCounts,
                coreCompletes
            );
        }

        totalAttestations += len;
    }

    // ============================================
    // VERIFICATION FUNCTIONS
    // ============================================

    /**
     * @notice Verify a content hash was attested by a specific user
     * @param user Address of the user
     * @param contentHash Hash to verify
     * @return exists Whether the attestation exists
     * @return attestation The attestation details (if exists)
     */
    function verifyAttestation(address user, bytes32 contentHash)
        external
        view
        returns (bool exists, Attestation memory attestation)
    {
        if (hashToUser[contentHash] != user) {
            return (false, attestation);
        }

        Attestation[] storage attestations = userAttestations[user];
        for (uint256 i = 0; i < attestations.length; i++) {
            if (attestations[i].contentHash == contentHash) {
                return (true, attestations[i]);
            }
        }

        return (false, attestation);
    }

    /**
     * @notice Check if a content hash has been attested by anyone
     * @param contentHash Hash to check
     * @return attested Whether the hash is attested
     * @return attestor Address of the attestor (if attested)
     */
    function isHashAttested(bytes32 contentHash)
        external
        view
        returns (bool attested, address attestor)
    {
        attestor = hashToUser[contentHash];
        attested = attestor != address(0);
    }

    /**
     * @notice Get attestation tier for a given score
     * @param score Completeness score (0-10000)
     * @return tier 0=none, 1=bronze, 2=silver, 3=gold
     */
    function getAttestationTier(uint16 score) public pure returns (uint8 tier) {
        if (score >= TIER_GOLD_MIN_SCORE) return 3;
        if (score >= TIER_SILVER_MIN_SCORE) return 2;
        if (score >= TIER_BRONZE_MIN_SCORE) return 1;
        return 0;
    }

    // ============================================
    // QUERY FUNCTIONS
    // ============================================

    /**
     * @notice Get count of attestations for a user by data type
     * @param user Address of the user
     * @param dataType Type of health data
     * @return count Number of attestations
     */
    function getAttestationCount(address user, uint8 dataType)
        external
        view
        returns (uint16 count)
    {
        return attestationCounts[user][dataType];
    }

    /**
     * @notice Get total attestation count for a user across all types
     * @param user Address of the user
     * @return count Total attestations
     */
    function getTotalAttestationCount(address user)
        external
        view
        returns (uint256 count)
    {
        return userAttestations[user].length;
    }

    /**
     * @notice Get all attestations for a user
     * @param user Address of the user
     * @return attestations Array of user's attestations
     */
    function getUserAttestations(address user)
        external
        view
        returns (Attestation[] memory)
    {
        return userAttestations[user];
    }

    /**
     * @notice Get attestations for a user filtered by data type
     * @param user Address of the user
     * @param dataType Type of health data to filter
     * @return attestations Filtered array of attestations
     */
    function getUserAttestationsByType(address user, uint8 dataType)
        external
        view
        returns (Attestation[] memory)
    {
        Attestation[] storage all = userAttestations[user];
        uint256 count = attestationCounts[user][dataType];

        Attestation[] memory result = new Attestation[](count);
        uint256 index = 0;

        for (uint256 i = 0; i < all.length && index < count; i++) {
            if (all[i].dataType == dataType) {
                result[index] = all[i];
                index++;
            }
        }

        return result;
    }

    /**
     * @notice Get attestations within a date range
     * @param user Address of the user
     * @param fromDate Start of range (unix timestamp)
     * @param toDate End of range (unix timestamp)
     * @return attestations Filtered array of attestations
     */
    function getUserAttestationsInRange(
        address user,
        uint40 fromDate,
        uint40 toDate
    ) external view returns (Attestation[] memory) {
        Attestation[] storage all = userAttestations[user];

        // First pass: count matching attestations
        uint256 count = 0;
        for (uint256 i = 0; i < all.length; i++) {
            if (all[i].startDate >= fromDate && all[i].endDate <= toDate) {
                count++;
            }
        }

        // Second pass: collect matching attestations
        Attestation[] memory result = new Attestation[](count);
        uint256 index = 0;
        for (uint256 i = 0; i < all.length && index < count; i++) {
            if (all[i].startDate >= fromDate && all[i].endDate <= toDate) {
                result[index] = all[i];
                index++;
            }
        }

        return result;
    }

    /**
     * @notice Get user's highest tier attestation for a data type
     * @param user Address of the user
     * @param dataType Type of health data
     * @return tier Highest tier achieved (0=none, 1=bronze, 2=silver, 3=gold)
     * @return attestation The attestation with highest tier
     */
    function getHighestTierAttestation(address user, uint8 dataType)
        external
        view
        returns (uint8 tier, Attestation memory attestation)
    {
        Attestation[] storage all = userAttestations[user];
        uint16 highestScore = 0;

        for (uint256 i = 0; i < all.length; i++) {
            if (all[i].dataType == dataType && all[i].completenessScore > highestScore) {
                highestScore = all[i].completenessScore;
                attestation = all[i];
            }
        }

        tier = getAttestationTier(highestScore);
    }

    // ============================================
    // VERSION INFO
    // ============================================

    function getContractVersion() external pure override returns (uint8) {
        return 4;
    }

    // Note: _authorizeUpgrade is inherited from V2, no need to override
}
