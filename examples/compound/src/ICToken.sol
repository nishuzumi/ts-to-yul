// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title ICToken
/// @notice Interface for the simplified Compound cToken implementation
interface ICToken {
    // View Functions
    function exchangeRateStored() external view returns (uint256);
    function getTotalSupply() external view returns (uint256);
    function getTotalBorrows() external view returns (uint256);
    function getTotalReserves() external view returns (uint256);
    function getCash() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function balanceOfUnderlying(address account) external view returns (uint256);
    function borrowBalanceStored(address account) external view returns (uint256);
    function borrowRatePerBlock() external view returns (uint256);
    function supplyRatePerBlock() external view returns (uint256);
    function getAccountSnapshot(address account) external view returns (uint256, uint256, uint256);
    function allowance(address owner, address spender) external view returns (uint256);

    // State-Changing Functions
    function initialize(uint256 initialCash) external returns (uint256);
    function accrueInterest() external returns (uint256);
    function mint(uint256 mintAmount) external returns (uint256);
    function redeem(uint256 redeemTokens) external returns (uint256);
    function redeemUnderlying(uint256 redeemAmount) external returns (uint256);
    function borrow(uint256 borrowAmount) external returns (uint256);
    function repayBorrow(uint256 repayAmount) external returns (uint256);
    function repayBorrowBehalf(address borrower, uint256 repayAmount) external returns (uint256);
    function liquidateBorrow(address borrower, uint256 repayAmount) external returns (uint256);
    function transfer(address to, uint256 amount) external returns (uint256);
    function transferFrom(address from, address to, uint256 amount) external returns (uint256);
    function approve(address spender, uint256 amount) external returns (uint256);
    function addReserves(uint256 addAmount) external returns (uint256);
}
