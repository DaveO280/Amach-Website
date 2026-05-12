// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

/// @dev Test-only helper. Selfdestructs in its constructor, forcing any ETH
///      held by the contract into `target`. Used to simulate the forced-ETH
///      vector that would otherwise brick the claim-path invariant.
contract SelfDestructAttacker {
    constructor(address payable target) payable {
        selfdestruct(target);
    }
}
