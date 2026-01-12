// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IUniswapV3Pool
 * @notice Interface for the simplified UniswapV3Pool contract
 */
interface IUniswapV3Pool {
    // ============ View Functions ============

    /// @notice Returns pool state: sqrtPriceX96, tick, fee
    function slot0() external view returns (uint160, int24, uint256);

    /// @notice Returns current liquidity in the pool
    function getLiquidity() external view returns (uint128);

    /// @notice Returns position data for an owner
    function getPosition(address owner) external view returns (uint128, int24, int24);

    /// @notice Returns fee growth global
    function getFeeGrowthGlobal() external view returns (uint256, uint256);

    /// @notice Calculate flash loan fees
    function flashFee(uint256 amount0, uint256 amount1) external view returns (uint256, uint256);

    // ============ State-Changing Functions ============

    /// @notice Initialize the pool with a sqrt price
    function initialize(uint160 sqrtPriceX96) external returns (uint256);

    /// @notice Add liquidity to a position
    function mint(int24 tickLower, int24 tickUpper, uint128 amount) external returns (uint256, uint256);

    /// @notice Remove liquidity from a position
    function burn(uint128 amount) external returns (uint256, uint256);

    /// @notice Swap exact token0 for token1
    function swapExact0For1(uint256 amountIn, uint160 sqrtPriceLimitX96) external returns (uint256);

    /// @notice Swap exact token1 for token0
    function swapExact1For0(uint256 amountIn, uint160 sqrtPriceLimitX96) external returns (uint256);

    /// @notice Set protocol fee percentage
    function setFeeProtocol(uint256 feeProtocol) external returns (uint256);
}
