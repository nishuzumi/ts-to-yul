import {
  u256,
  address,
  bool,
  storage,
  Mapping,
  msg,
  revert,
  view,
} from "../runtime/index.js";

/**
 * Simplified Uniswap V2 Pair (AMM)
 *
 * This implements a constant product AMM with ERC20 LP tokens.
 * Based on Uniswap V2 core contracts.
 */
export class UniswapV2Pair {
  // ============ ERC20 LP Token ============

  @storage totalSupply: u256 = 0n;
  @storage balanceOf: Mapping<address, u256>;
  @storage allowance: Mapping<address, Mapping<address, u256>>;

  // ============ AMM State ============

  @storage reserve0: u256 = 0n;
  @storage reserve1: u256 = 0n;
  @storage blockTimestampLast: u256 = 0n;

  // Price accumulators (for TWAP oracle)
  @storage price0CumulativeLast: u256 = 0n;
  @storage price1CumulativeLast: u256 = 0n;

  // Minimum liquidity locked forever
  private MINIMUM_LIQUIDITY: u256 = 1000n;

  // ============ ERC20 Functions ============

  public transfer(to: address, amount: u256): bool {
    const sender = msg.sender;

    if (this.balanceOf[sender] < amount) {
      revert("Insufficient balance");
    }

    this.balanceOf[sender] = this.balanceOf[sender] - amount;
    this.balanceOf[to] = this.balanceOf[to] + amount;

    return true;
  }

  public approve(spender: address, amount: u256): bool {
    this.allowance[msg.sender][spender] = amount;
    return true;
  }

  public transferFrom(from: address, to: address, amount: u256): bool {
    const spender = msg.sender;
    const currentAllowance = this.allowance[from][spender];

    if (currentAllowance < amount) {
      revert("Insufficient allowance");
    }

    this.allowance[from][spender] = currentAllowance - amount;

    if (this.balanceOf[from] < amount) {
      revert("Insufficient balance");
    }

    this.balanceOf[from] = this.balanceOf[from] - amount;
    this.balanceOf[to] = this.balanceOf[to] + amount;

    return true;
  }

  // ============ AMM View Functions ============

  @view
  public getReserves(): [u256, u256, u256] {
    return [this.reserve0, this.reserve1, this.blockTimestampLast];
  }

  @view
  public getBalanceOf(account: address): u256 {
    return this.balanceOf[account];
  }

  // ============ AMM Core Functions ============

  /**
   * Mint LP tokens for provided liquidity
   * In real Uniswap: tokens are transferred first, then mint is called
   * Simplified: amounts are passed directly
   */
  public mint(amount0: u256, amount1: u256): u256 {
    let liquidity: u256 = 0n;

    if (this.totalSupply === 0n) {
      // Initial liquidity = sqrt(amount0 * amount1) - MINIMUM_LIQUIDITY
      liquidity = this.sqrt(amount0 * amount1) - 1000n;

      // Lock minimum liquidity forever (to prevent division by zero)
      this.totalSupply = 1000n;
    } else {
      // liquidity = min(amount0 * totalSupply / reserve0, amount1 * totalSupply / reserve1)
      const liquidity0 = (amount0 * this.totalSupply) / this.reserve0;
      const liquidity1 = (amount1 * this.totalSupply) / this.reserve1;

      if (liquidity0 < liquidity1) {
        liquidity = liquidity0;
      } else {
        liquidity = liquidity1;
      }
    }

    if (liquidity === 0n) {
      revert("Insufficient liquidity minted");
    }

    // Mint LP tokens to sender
    this.balanceOf[msg.sender] = this.balanceOf[msg.sender] + liquidity;
    this.totalSupply = this.totalSupply + liquidity;

    // Update reserves
    this.reserve0 = this.reserve0 + amount0;
    this.reserve1 = this.reserve1 + amount1;

    return liquidity;
  }

  /**
   * Burn LP tokens and receive underlying assets
   */
  public burn(liquidity: u256): u256 {
    const sender = msg.sender;

    if (this.balanceOf[sender] < liquidity) {
      revert("Insufficient balance");
    }

    // Calculate amounts to return
    const amount0 = (liquidity * this.reserve0) / this.totalSupply;
    const amount1 = (liquidity * this.reserve1) / this.totalSupply;

    if (amount0 === 0n) {
      revert("Insufficient liquidity burned");
    }

    // Burn LP tokens
    this.balanceOf[sender] = this.balanceOf[sender] - liquidity;
    this.totalSupply = this.totalSupply - liquidity;

    // Update reserves
    this.reserve0 = this.reserve0 - amount0;
    this.reserve1 = this.reserve1 - amount1;

    // Return amount0 (simplified - real would transfer tokens)
    return amount0;
  }

  /**
   * Swap token0 for token1
   * Uses constant product formula: x * y = k
   * With 0.3% fee
   */
  public swap(amount0In: u256): u256 {
    if (amount0In === 0n) {
      revert("Insufficient input amount");
    }

    // Calculate output with 0.3% fee
    // amountOut = (amountIn * 997 * reserveOut) / (reserveIn * 1000 + amountIn * 997)
    const amountInWithFee = amount0In * 997n;
    const numerator = amountInWithFee * this.reserve1;
    const denominator = (this.reserve0 * 1000n) + amountInWithFee;
    const amount1Out = numerator / denominator;

    if (amount1Out === 0n) {
      revert("Insufficient output amount");
    }

    if (amount1Out >= this.reserve1) {
      revert("Insufficient liquidity");
    }

    // Update reserves
    this.reserve0 = this.reserve0 + amount0In;
    this.reserve1 = this.reserve1 - amount1Out;

    return amount1Out;
  }

  /**
   * Get quote for swap (view function)
   */
  @view
  public getAmountOut(amountIn: u256): u256 {
    if (amountIn === 0n) {
      return 0n;
    }
    if (this.reserve0 === 0n) {
      return 0n;
    }

    const amountInWithFee = amountIn * 997n;
    const numerator = amountInWithFee * this.reserve1;
    const denominator = (this.reserve0 * 1000n) + amountInWithFee;

    return numerator / denominator;
  }

  /**
   * Sync reserves with actual balances
   * In real Uniswap: reads token balances via external calls
   * Simplified: directly set reserves
   */
  public sync(balance0: u256, balance1: u256): void {
    this.reserve0 = balance0;
    this.reserve1 = balance1;
  }

  // ============ Internal Functions ============

  /**
   * Integer square root using Babylonian method
   */
  private sqrt(x: u256): u256 {
    if (x === 0n) {
      return 0n;
    }

    let z = (x + 1n) / 2n;
    let y = x;

    // Babylonian method using while loop
    while (z < y) {
      y = z;
      z = (x / z + z) / 2n;
    }

    return y;
  }
}
