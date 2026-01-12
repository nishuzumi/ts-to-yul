// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title IShowcaseWithInheritance
 * @notice Interface for ShowcaseWithInheritance contract demonstrating multiple inheritance
 */
interface IShowcaseWithInheritance {
    // Events from Ownable
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    // Events from Pausable
    event Paused(address indexed account);
    event Unpaused(address indexed account);

    // Own events
    event Transfer(address indexed from, address indexed to, uint256 amount);

    // Custom errors
    error InsufficientBalance(uint256 available, uint256 required);
    error OwnableUnauthorized(address caller);
    error OwnableInvalidOwner(address owner);
    error EnforcedPause();
    error ExpectedPause();

    // Functions from Ownable (overridden)
    function owner() external view returns (address);
    function transferOwnership(address newOwner) external;
    function renounceOwnership() external;

    // Functions from Pausable (overridden)
    function paused() external view returns (bool);

    // Own functions
    function deposit() external payable returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function getBalance(address account) external view returns (uint256);
    function pause() external;
    function unpause() external;
    function setTreasury(address newTreasury) external;
    function getOwner() external view returns (address);
    function isPaused() external view returns (bool);
    function getTreasury() external view returns (address);
}
