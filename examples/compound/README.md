# Compound cToken Example

This example demonstrates a simplified Compound cToken implementation written in TypeScript and compiled to EVM bytecode using ts-to-yul.

## Features

- **Supply/Mint**: Deposit underlying assets to receive cTokens
- **Redeem**: Burn cTokens to withdraw underlying assets
- **Borrow**: Take loans using cTokens as collateral
- **Repay**: Repay borrowed amounts
- **Interest Accrual**: Automatic interest calculation per block
- **Liquidation**: Liquidate undercollateralized positions
- **ERC20-like Transfers**: Transfer cTokens with collateral checks

## Contract Interface

```solidity
interface ICToken {
    // View functions
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

    // State-changing functions
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
}
```

## Key Parameters

| Parameter             | Value   | Description                        |
| --------------------- | ------- | ---------------------------------- |
| Initial Exchange Rate | 0.02    | 1 cToken = 0.02 underlying         |
| Collateral Factor     | 75%     | Maximum borrow = 75% of collateral |
| Reserve Factor        | 10%     | Protocol takes 10% of interest     |
| Base Borrow Rate      | ~5% APY | Base interest rate                 |
| Liquidation Incentive | 8%      | Liquidator bonus                   |

## Building

```bash
# From the ts-to-yul root directory
pnpm build

# Compile TypeScript to EVM bytecode
node dist/cli.js build examples/compound/src/CToken.ts -O -o examples/compound/bytecode.hex
```

## Testing

The test suite includes 40 tests covering:

- Initialization and exchange rate
- Minting and redeeming
- Borrowing and repaying
- Interest accrual
- Liquidation
- Collateral checks
- ERC20-like transfers
- Fuzz tests

```bash
cd examples/compound
forge test -vv
```

## Exchange Rate Calculation

The exchange rate determines the conversion between underlying assets and cTokens:

```
exchangeRate = (totalCash + totalBorrows - totalReserves) / totalSupply
```

When `totalSupply` is 0, the initial exchange rate (0.02) is used.

## Interest Model

The interest rate follows a simple linear model:

```
utilizationRate = totalBorrows / (totalCash + totalBorrows - totalReserves)
borrowRate = baseRate + multiplier * utilizationRate
supplyRate = borrowRate * utilizationRate * (1 - reserveFactor)
```

## Collateral and Liquidation

- Users can borrow up to 75% of their collateral value
- When borrow balance exceeds this limit, the position becomes liquidatable
- Liquidators repay part of the debt and receive cTokens at an 8% discount

## Differences from Official Compound

This is a simplified implementation for demonstration:

- Single asset market (no Comptroller)
- Simplified interest rate model
- No flash loans
- No governance features
- Direct collateral checks (no external oracle)

## References

- [Compound Protocol](https://github.com/compound-finance/compound-protocol)
- [Compound Whitepaper](https://compound.finance/documents/Compound.Whitepaper.pdf)

## License

MIT
