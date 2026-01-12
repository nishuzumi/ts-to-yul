// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

interface IUniswapV2Pair {
    function transfer(address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function getReserves() external view returns (uint256, uint256, uint256);
    function getBalanceOf(address account) external view returns (uint256);
    function mint(uint256 amount0, uint256 amount1) external returns (uint256);
    function burn(uint256 liquidity) external returns (uint256);
    function swap(uint256 amount0In) external returns (uint256);
    function getAmountOut(uint256 amountIn) external view returns (uint256);
    function sync(uint256 balance0, uint256 balance1) external;
}
