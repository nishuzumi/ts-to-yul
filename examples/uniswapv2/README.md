# Uniswap V2 Example

This example demonstrates a Uniswap V2 implementation written in TypeScript and compiled to EVM bytecode using the ts-to-yul compiler.

## Project Structure

```
src/
├── UniswapV2Pair.ts      # Core AMM pair contract (mint, burn, swap)
├── UniswapV2ERC20.ts     # ERC20 base class for LP tokens
├── UniswapV2Router.ts    # User-friendly router with slippage protection
├── IUniswapV2Pair.sol    # Solidity interface for testing
└── libraries/
    └── Math.ts           # Math utilities (sqrt, min)

test/
├── UniswapV2Pair.t.sol   # Pair contract tests (23 tests)
└── UniswapV2Router.t.sol # Router contract tests (19 tests)
```

## Features

### UniswapV2Pair
- Constant product AMM (x * y = k)
- 0.3% swap fee
- LP token minting/burning
- MINIMUM_LIQUIDITY lock (1000 wei)
- ERC20 functions (transfer, approve, transferFrom)

### UniswapV2Router
- `addLiquidity` / `removeLiquidity` with slippage protection
- `swapExactToken0ForToken1` / `swapExactToken1ForToken0`
- `swapToken0ForExactToken1` / `swapToken1ForExactToken0`
- `quote`, `getAmountOut`, `getAmountIn` view functions

## Build

```bash
# Install dependencies
pnpm install
forge install

# Compile TypeScript to bytecode
node ../../dist/cli.js build src/UniswapV2Pair.ts -o bytecode.hex
node ../../dist/cli.js build src/UniswapV2Router.ts -o bytecode-router.hex

# Generate ABI
node ../../dist/cli.js build src/UniswapV2Router.ts --abi
```

## Test

```bash
# Run all tests
forge test

# Run with verbose output
forge test -vvv

# Run specific test contract
forge test --match-contract UniswapV2PairTest
forge test --match-contract UniswapV2RouterTest
```

## Test Coverage

Tests are adapted from official Uniswap V2 repositories:
- [v2-core/test/UniswapV2Pair.spec.ts](https://github.com/Uniswap/v2-core/blob/master/test/UniswapV2Pair.spec.ts)
- [v2-periphery/test/UniswapV2Router02.spec.ts](https://github.com/Uniswap/v2-periphery/blob/master/test/UniswapV2Router02.spec.ts)

**42 tests total:**

| Contract | Tests | Coverage |
|----------|-------|----------|
| UniswapV2Pair | 23 | mint, burn, swap, ERC20, fuzz tests |
| UniswapV2Router | 19 | liquidity, swaps, slippage protection, fuzz tests |

### Key Test Cases

```solidity
// Official Uniswap test values
test_Mint: 1e18, 4e18 → liquidity = 2e18 - 1000
test_SwapToken0: 5:10 pool, swap 1 → output = 1662497915624478906
test_Quote: quote(1, 100, 200) = 2
test_GetAmountOut: getAmountOut(2, 100, 100) = 1
test_GetAmountIn: getAmountIn(1, 100, 100) = 2
```

## TypeScript Features Used

- `@storage` decorator for state variables
- `@view` decorator for read-only functions
- `Mapping<K, V>` for storage mappings
- Class inheritance (`UniswapV2Pair extends UniswapV2ERC20`)
- Private helper methods (`_sqrt`, `_min`)
- Library imports (`import { sqrt, min } from "./libraries/Math"`)

## Architecture

```
TypeScript Source
       ↓
   ts-to-yul compiler
       ↓
   Yul IR Code
       ↓
   solc compiler
       ↓
   EVM Bytecode (.hex)
       ↓
   Forge Tests (Solidity)
```

## License

MIT
