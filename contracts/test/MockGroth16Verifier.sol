// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

/// @dev Test-only stand-in for AverageImprovementProofV1Verifier. Behavior
///      is fully controlled by the deployer so we can exercise both the
///      accept and reject paths without real Groth16 proofs.
contract MockGroth16Verifier {
    bool public shouldAccept;

    constructor(bool _shouldAccept) {
        shouldAccept = _shouldAccept;
    }

    function setShouldAccept(bool v) external {
        shouldAccept = v;
    }

    function verifyProof(
        uint[2] calldata,
        uint[2][2] calldata,
        uint[2] calldata,
        uint[5] calldata
    ) external view returns (bool) {
        return shouldAccept;
    }
}
