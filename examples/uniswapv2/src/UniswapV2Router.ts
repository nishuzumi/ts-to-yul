import {
  u256,
  address,
  storage,
  msg,
  revert,
  view,
  Mapping,
} from "../../../runtime/index.js";

/**
 * UniswapV2 Router - User-friendly interface for AMM operations
 *
 * Provides helper functions for:
 * - Adding/removing liquidity with slippage protection
 * - Token swaps with slippage protection
 * - Quote calculations
 *
 * This is a simplified standalone router that manages its own liquidity pool.
 * In a real implementation, this would interact with external Pair contracts.
 *
 * Based on Uniswap V2 periphery contracts.
 */
export class UniswapV2Router {
  // ============ Pool State ============
  // For simplicity, router manages its own AMM pool

  @storage reserve0: u256 = 0n;
  @storage reserve1: u256 = 0n;
  @storage totalLiquidity: u256 = 0n;
  @storage liquidity: Mapping<address, u256>;

  // Constants
  private MINIMUM_LIQUIDITY: u256 = 1000n;

  // ============ View Functions ============

  /**
   * Get current reserves
   */
  @view
  public getReserves(): [u256, u256] {
    return [this.reserve0, this.reserve1];
  }

  /**
   * Get total liquidity
   */
  @view
  public getTotalLiquidity(): u256 {
    return this.totalLiquidity;
  }

  /**
   * Get liquidity balance for an account
   */
  @view
  public getLiquidity(account: address): u256 {
    return this.liquidity[account];
  }

  /**
   * Calculate the optimal amount of tokenB given an amount of tokenA
   * Used for adding liquidity proportionally
   */
  @view
  public quote(amountA: u256, reserveA: u256, reserveB: u256): u256 {
    if (amountA === 0n) {
      revert("Router: INSUFFICIENT_AMOUNT");
    }
    if (reserveA === 0n || reserveB === 0n) {
      revert("Router: INSUFFICIENT_LIQUIDITY");
    }
    return (amountA * reserveB) / reserveA;
  }

  /**
   * Calculate output amount for a swap (including 0.3% fee)
   */
  @view
  public getAmountOut(amountIn: u256, reserveIn: u256, reserveOut: u256): u256 {
    if (amountIn === 0n) {
      return 0n;
    }
    if (reserveIn === 0n || reserveOut === 0n) {
      return 0n;
    }

    const amountInWithFee = amountIn * 997n;
    const numerator = amountInWithFee * reserveOut;
    const denominator = reserveIn * 1000n + amountInWithFee;

    return numerator / denominator;
  }

  /**
   * Calculate input amount needed for a desired output (including 0.3% fee)
   */
  @view
  public getAmountIn(amountOut: u256, reserveIn: u256, reserveOut: u256): u256 {
    if (amountOut === 0n) {
      return 0n;
    }
    if (reserveIn === 0n || reserveOut === 0n) {
      return 0n;
    }
    if (amountOut >= reserveOut) {
      revert("Router: INSUFFICIENT_LIQUIDITY");
    }

    const numerator = reserveIn * amountOut * 1000n;
    const denominator = (reserveOut - amountOut) * 997n;

    return numerator / denominator + 1n;
  }

  // ============ Liquidity Functions ============

  /**
   * Add liquidity to the pool
   *
   * @param amount0Desired Amount of token0 to add
   * @param amount1Desired Amount of token1 to add
   * @param amount0Min Minimum amount of token0 (slippage protection)
   * @param amount1Min Minimum amount of token1 (slippage protection)
   * @returns liquidity The amount of LP tokens minted
   */
  public addLiquidity(
    amount0Desired: u256,
    amount1Desired: u256,
    amount0Min: u256,
    amount1Min: u256
  ): u256 {
    let amount0: u256 = amount0Desired;
    let amount1: u256 = amount1Desired;

    // Calculate optimal amounts if pool has liquidity
    if (this.reserve0 !== 0n && this.reserve1 !== 0n) {
      const amount1Optimal = this.quote(amount0Desired, this.reserve0, this.reserve1);

      if (amount1Optimal <= amount1Desired) {
        if (amount1Optimal < amount1Min) {
          revert("Router: INSUFFICIENT_B_AMOUNT");
        }
        amount1 = amount1Optimal;
      } else {
        const amount0Optimal = this.quote(amount1Desired, this.reserve1, this.reserve0);
        if (amount0Optimal < amount0Min) {
          revert("Router: INSUFFICIENT_A_AMOUNT");
        }
        amount0 = amount0Optimal;
      }
    }

    // Calculate liquidity to mint
    let liquidityMinted: u256 = 0n;

    if (this.totalLiquidity === 0n) {
      // Initial liquidity
      liquidityMinted = this._sqrt(amount0 * amount1) - this.MINIMUM_LIQUIDITY;
      this.totalLiquidity = this.MINIMUM_LIQUIDITY;
    } else {
      const liquidity0 = (amount0 * this.totalLiquidity) / this.reserve0;
      const liquidity1 = (amount1 * this.totalLiquidity) / this.reserve1;
      liquidityMinted = this._min(liquidity0, liquidity1);
    }

    if (liquidityMinted === 0n) {
      revert("Router: INSUFFICIENT_LIQUIDITY_MINTED");
    }

    // Update state
    this.liquidity[msg.sender] = this.liquidity[msg.sender] + liquidityMinted;
    this.totalLiquidity = this.totalLiquidity + liquidityMinted;
    this.reserve0 = this.reserve0 + amount0;
    this.reserve1 = this.reserve1 + amount1;

    return liquidityMinted;
  }

  /**
   * Remove liquidity from the pool
   *
   * @param liquidityAmount Amount of LP tokens to burn
   * @param amount0Min Minimum amount of token0 to receive
   * @param amount1Min Minimum amount of token1 to receive
   * @returns amount0 The amount of token0 received
   */
  public removeLiquidity(
    liquidityAmount: u256,
    amount0Min: u256,
    amount1Min: u256
  ): u256 {
    const sender = msg.sender;

    if (this.liquidity[sender] < liquidityAmount) {
      revert("Router: INSUFFICIENT_LIQUIDITY");
    }

    // Calculate amounts to return
    const amount0 = (liquidityAmount * this.reserve0) / this.totalLiquidity;
    const amount1 = (liquidityAmount * this.reserve1) / this.totalLiquidity;

    // Check slippage
    if (amount0 < amount0Min) {
      revert("Router: INSUFFICIENT_A_AMOUNT");
    }
    if (amount1 < amount1Min) {
      revert("Router: INSUFFICIENT_B_AMOUNT");
    }

    // Update state
    this.liquidity[sender] = this.liquidity[sender] - liquidityAmount;
    this.totalLiquidity = this.totalLiquidity - liquidityAmount;
    this.reserve0 = this.reserve0 - amount0;
    this.reserve1 = this.reserve1 - amount1;

    return amount0;
  }

  // ============ Swap Functions ============

  /**
   * Swap exact amount of token0 for token1
   *
   * @param amountIn Exact amount of token0 to swap
   * @param amountOutMin Minimum token1 output (slippage protection)
   * @returns amountOut The actual token1 received
   */
  public swapExactToken0ForToken1(
    amountIn: u256,
    amountOutMin: u256
  ): u256 {
    if (amountIn === 0n) {
      revert("Router: INSUFFICIENT_INPUT_AMOUNT");
    }

    const amountOut = this.getAmountOut(amountIn, this.reserve0, this.reserve1);

    if (amountOut < amountOutMin) {
      revert("Router: INSUFFICIENT_OUTPUT_AMOUNT");
    }

    if (amountOut >= this.reserve1) {
      revert("Router: INSUFFICIENT_LIQUIDITY");
    }

    // Update reserves
    this.reserve0 = this.reserve0 + amountIn;
    this.reserve1 = this.reserve1 - amountOut;

    return amountOut;
  }

  /**
   * Swap exact amount of token1 for token0
   *
   * @param amountIn Exact amount of token1 to swap
   * @param amountOutMin Minimum token0 output (slippage protection)
   * @returns amountOut The actual token0 received
   */
  public swapExactToken1ForToken0(
    amountIn: u256,
    amountOutMin: u256
  ): u256 {
    if (amountIn === 0n) {
      revert("Router: INSUFFICIENT_INPUT_AMOUNT");
    }

    const amountOut = this.getAmountOut(amountIn, this.reserve1, this.reserve0);

    if (amountOut < amountOutMin) {
      revert("Router: INSUFFICIENT_OUTPUT_AMOUNT");
    }

    if (amountOut >= this.reserve0) {
      revert("Router: INSUFFICIENT_LIQUIDITY");
    }

    // Update reserves
    this.reserve1 = this.reserve1 + amountIn;
    this.reserve0 = this.reserve0 - amountOut;

    return amountOut;
  }

  /**
   * Swap token0 for exact amount of token1
   *
   * @param amountOut Exact amount of token1 desired
   * @param amountInMax Maximum token0 input (slippage protection)
   * @returns amountIn The actual token0 spent
   */
  public swapToken0ForExactToken1(
    amountOut: u256,
    amountInMax: u256
  ): u256 {
    if (amountOut === 0n) {
      revert("Router: INSUFFICIENT_OUTPUT_AMOUNT");
    }

    const amountIn = this.getAmountIn(amountOut, this.reserve0, this.reserve1);

    if (amountIn > amountInMax) {
      revert("Router: EXCESSIVE_INPUT_AMOUNT");
    }

    // Update reserves
    this.reserve0 = this.reserve0 + amountIn;
    this.reserve1 = this.reserve1 - amountOut;

    return amountIn;
  }

  /**
   * Swap token1 for exact amount of token0
   *
   * @param amountOut Exact amount of token0 desired
   * @param amountInMax Maximum token1 input (slippage protection)
   * @returns amountIn The actual token1 spent
   */
  public swapToken1ForExactToken0(
    amountOut: u256,
    amountInMax: u256
  ): u256 {
    if (amountOut === 0n) {
      revert("Router: INSUFFICIENT_OUTPUT_AMOUNT");
    }

    const amountIn = this.getAmountIn(amountOut, this.reserve1, this.reserve0);

    if (amountIn > amountInMax) {
      revert("Router: EXCESSIVE_INPUT_AMOUNT");
    }

    // Update reserves
    this.reserve1 = this.reserve1 + amountIn;
    this.reserve0 = this.reserve0 - amountOut;

    return amountIn;
  }

  // ============ Internal Functions ============

  /**
   * Integer square root using Babylonian method
   */
  private _sqrt(x: u256): u256 {
    if (x === 0n) {
      return 0n;
    }

    let z = (x + 1n) / 2n;
    let y = x;

    while (z < y) {
      y = z;
      z = (x / z + z) / 2n;
    }

    return y;
  }

  /**
   * Return minimum of two values
   */
  private _min(a: u256, b: u256): u256 {
    if (a < b) {
      return a;
    }
    return b;
  }
}
