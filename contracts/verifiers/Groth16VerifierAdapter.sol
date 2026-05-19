// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

interface ISnarkJsGroth16Verifier {
    function verifyProof(
        uint256[2] calldata pA,
        uint256[2][2] calldata pB,
        uint256[2] calldata pC,
        uint256[5] calldata pubSignals
    ) external view returns (bool);
}

/// @title Groth16VerifierAdapter
/// @notice Adapts the SpringPushEscrowV1 verifier interface
///         (verifyProof(bytes,uint256[4])) to the underlying snarkjs-generated
///         AverageImprovementProofV1Verifier (verifyProof with split pA/pB/pC
///         and a 5-element public-signal array).
/// @dev    The Spring Push contest only awards positive improvements. The
///         underlying circuit's 5th public signal (claimedSignFlag) is pinned
///         to 0 here, so any submission claiming a negative delta will be
///         rejected by the snarkjs verifier even though the escrow's 4-signal
///         interface has no place to express it.
contract Groth16VerifierAdapter {
    ISnarkJsGroth16Verifier public immutable VERIFIER;

    error InvalidProofLength(uint256 length);

    /// @param verifier The deployed snarkjs Groth16Verifier for the
    ///                 AverageImprovementProof circuit.
    constructor(address verifier) {
        require(verifier != address(0), "ZERO_VERIFIER");
        VERIFIER = ISnarkJsGroth16Verifier(verifier);
    }

    /// @notice Match SpringPushEscrowV1's IGroth16Verifier signature.
    /// @param proof       abi.encode(uint256[2] pA, uint256[2][2] pB, uint256[2] pC).
    ///                    Total 320 bytes (8 × 32 + the static-array header
    ///                    layout that abi.encode produces for fixed sizes).
    /// @param pubSignals  [baselineRoot, finishRoot, metricPointer, improvementBp].
    ///                    Forwarded to the underlying verifier with a fifth
    ///                    signal (signFlag) pinned to 0.
    function verifyProof(
        bytes calldata proof,
        uint256[4] calldata pubSignals
    ) external view returns (bool) {
        // abi.encode of three fixed-size uint arrays packs to exactly 8 words.
        // pA  : 2 words
        // pB  : 4 words (flattened row-major)
        // pC  : 2 words
        if (proof.length != 8 * 32) revert InvalidProofLength(proof.length);

        (uint256[2] memory pA, uint256[2][2] memory pB, uint256[2] memory pC) =
            abi.decode(proof, (uint256[2], uint256[2][2], uint256[2]));

        uint256[5] memory full;
        full[0] = pubSignals[0];
        full[1] = pubSignals[1];
        full[2] = pubSignals[2];
        full[3] = pubSignals[3];
        full[4] = 0; // signFlag — only positive improvements admitted

        return VERIFIER.verifyProof(pA, pB, pC, full);
    }
}
