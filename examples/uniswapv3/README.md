# UniswapV3 Pool Example

This example demonstrates a simplified Uniswap V3 concentrated liquidity AMM pool implementation written in TypeScript and compiled to EVM bytecode using ts-to-yul.

## Features

- **Concentrated Liquidity**: Liquidity providers can specify tick ranges for their positions
- **sqrtPriceX96**: Uses Q64.96 fixed-point format for price representation
- **Tick-based Pricing**: Supports tick values from -887272 to +887272
- **Fee Collection**: 0.3% swap fee with fee growth tracking per position
- **Swap Functions**: `swapExact0For1` and `swapExact1For0` for token exchanges

## Contract Interface

```solidity
interface IUniswapV3Pool {
    // View functions
    function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint256 fee);
    function getLiquidity() external view returns (uint128);
    function getPosition(address owner) external view returns (uint128 liquidity, int24 tickLower, int24 tickUpper);
    function getFeeGrowthGlobal() external view returns (uint256 feeGrowth0, uint256 feeGrowth1);
    function flashFee(uint256 amount0, uint256 amount1) external view returns (uint256 fee0, uint256 fee1);

    // State-changing functions
    function initialize(uint160 sqrtPriceX96) external returns (uint256);
    function mint(int24 tickLower, int24 tickUpper, uint128 amount) external returns (uint256, uint256);
    function burn(uint128 amount) external returns (uint256, uint256);
    function swapExact0For1(uint256 amountIn, uint160 sqrtPriceLimitX96) external returns (uint256);
    function swapExact1For0(uint256 amountIn, uint160 sqrtPriceLimitX96) external returns (uint256);
    function setFeeProtocol(uint256 feeProtocol) external returns (uint256);
}
```

## Building

```bash
# From the ts-to-yul root directory
pnpm build

# Compile TypeScript to EVM bytecode
node dist/cli.js build examples/uniswapv3/src/UniswapV3Pool.ts -O -o examples/uniswapv3/bytecode.hex
```

## Testing

The test suite includes 30 tests covering:
- Initialization
- Minting (in-range, below-range, above-range positions)
- Burning
- Swapping (0->1, 1->0)
- Fee collection
- Error cases
- Fuzz tests

```bash
cd examples/uniswapv3
forge test -vv
```

## Key Concepts

### Q64.96 Fixed-Point

The sqrt price is stored in Q64.96 format where:
- `Q96 = 2^96 = 79228162514264337593543950336`
- Price = 1.0 corresponds to sqrtPriceX96 = Q96

### Tick Ranges

Liquidity positions are defined by tick ranges:
- Ticks range from -887272 to +887272
- A tick of 0 corresponds to price = 1.0
- Positive ticks = price > 1.0
- Negative ticks = price < 1.0

### Token Amounts

When minting liquidity:
- Position below current price: only token1 required
- Position above current price: only token0 required
- Position containing current price: both tokens required

## Differences from Official Uniswap V3

This is a simplified implementation for demonstration:
- Simplified tick math (approximation)
- Single position per user
- No tick crossing during swaps
- No flash loans
- No protocol fee distribution

## License

MIT
