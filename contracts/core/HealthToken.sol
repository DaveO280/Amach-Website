// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Pausable.sol";

/**
 * @title HealthToken
 * @dev ERC20 token for the Amach Health ecosystem
 * @notice Implements pausable, burnable token with owner controls
 */
contract HealthToken is ERC20, ERC20Burnable, Ownable, ERC20Pausable {
    
    // Token configuration
    uint256 public constant MAX_SUPPLY = 1_000_000_000 * 10**18; // 1 billion tokens
    uint256 public constant INITIAL_SUPPLY = 500_000_000 * 10**18; // 500 million initial supply
    
    // Allocation tracking
    mapping(address => bool) public hasReceivedInitialAllocation;
    uint256 public totalInitialAllocations;
    uint256 public maxInitialAllocations = 5000; // First 5,000 users
    
    // Events
    event InitialAllocationGranted(address indexed user, uint256 amount);
    event MaxInitialAllocationsUpdated(uint256 newMax);
    
    constructor() ERC20("Amach Health Protocol", "AHP") Ownable(msg.sender) {
        // Mint initial supply to contract owner for distribution
        _mint(msg.sender, INITIAL_SUPPLY);
    }
    
    /**
     * @dev Grant initial token allocation to verified users
     * @param user User address
     * @param amount Amount of tokens to allocate
     */
    function grantInitialAllocation(address user, uint256 amount) external onlyOwner {
        require(totalInitialAllocations < maxInitialAllocations, "Max initial allocations reached");
        require(!hasReceivedInitialAllocation[user], "User already received allocation");
        require(totalSupply() + amount <= MAX_SUPPLY, "Would exceed max supply");
        
        hasReceivedInitialAllocation[user] = true;
        totalInitialAllocations++;
        
        _mint(user, amount);
        emit InitialAllocationGranted(user, amount);
    }
    
    /**
     * @dev Mint tokens (only owner, up to max supply)
     * @param to Address to mint tokens to
     * @param amount Amount of tokens to mint
     */
    function mint(address to, uint256 amount) external onlyOwner {
        require(totalSupply() + amount <= MAX_SUPPLY, "Would exceed max supply");
        _mint(to, amount);
    }
    
    /**
     * @dev Update maximum initial allocations (only owner)
     * @param newMax New maximum number of initial allocations
     */
    function updateMaxInitialAllocations(uint256 newMax) external onlyOwner {
        require(newMax >= totalInitialAllocations, "Cannot reduce below current allocations");
        maxInitialAllocations = newMax;
        emit MaxInitialAllocationsUpdated(newMax);
    }
    
    /**
     * @dev Pause token transfers (only owner)
     */
    function pause() external onlyOwner {
        _pause();
    }
    
    /**
     * @dev Unpause token transfers (only owner)
     */
    function unpause() external onlyOwner {
        _unpause();
    }
    
    /**
     * @dev Override _update to include pausable functionality
     */
    function _update(address from, address to, uint256 value) internal override(ERC20, ERC20Pausable) {
        super._update(from, to, value);
    }
    
    /**
     * @dev Get remaining initial allocations
     * @return remaining Number of remaining initial allocations
     */
    function getRemainingInitialAllocations() external view returns (uint256 remaining) {
        return maxInitialAllocations - totalInitialAllocations;
    }
    
    /**
     * @dev Check if user has received initial allocation
     * @param user User address to check
     * @return hasAllocation Whether user has received initial allocation
     */
    function hasUserReceivedInitialAllocation(address user) external view returns (bool hasAllocation) {
        return hasReceivedInitialAllocation[user];
    }
}
