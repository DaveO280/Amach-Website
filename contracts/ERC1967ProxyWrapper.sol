// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/**
 * @title ERC1967ProxyWrapper
 * @dev Simple wrapper to make ERC1967Proxy compileable in our project
 */
contract ERC1967ProxyWrapper is ERC1967Proxy {
    constructor(address _logic, bytes memory _data) ERC1967Proxy(_logic, _data) {}
}

