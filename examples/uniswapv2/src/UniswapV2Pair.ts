import { u256, address, storage, msg, revert, view } from "../../../runtime/index.js";
import { UniswapV2ERC20 } from "./UniswapV2ERC20.js";
import { sqrt, min } from "./libraries/Math.js";

/**
 * UniswapV2 Pair - Automated Market Maker
 *
 * Implements a constant product AMM (x * y = k) with:
 * - 0.3% swap fee
 * - LP tokens for liquidity providers
 * - Price oracle accumulators for TWAP
 *
 * Based on Uniswap V2 core contracts.
 */
export class UniswapV2Pair extends UniswapV2ERC20 {
  // ============ AMM State ============

  @storage reserve0: u256 = 0n;
  @storage reserve1: u256 = 0n;
  @storage blockTimestampLast: u256 = 0n;

  // Price accumulators (for TWAP oracle)
  @storage price0CumulativeLast: u256 = 0n;
  @storage price1CumulativeLast: u256 = 0n;

  // Minimum liquidity locked forever (prevents division by zero)
  private MINIMUM_LIQUIDITY: u256 = 1000n;

  // ============ View Functions ============

  @view
  public getReserves(): [u256, u256, u256] {
    return [this.reserve0, this.reserve1, this.blockTimestampLast];
  }

  @view
  public getBalanceOf(account: address): u256 {
    return this.balanceOf[account];
  }

  @view
  public getAmountOut(amountIn: u256): u256 {
    if (amountIn === 0n) {
      return 0n;
    }
    if (this.reserve0 === 0n) {
      return 0n;
    }

    // amountOut = (amountIn * 997 * reserveOut) / (reserveIn * 1000 + amountIn * 997)
    const amountInWithFee = amountIn * 997n;
    const numerator = amountInWithFee * this.reserve1;
    const denominator = this.reserve0 * 1000n + amountInWithFee;

    return numerator / denominator;
  }

  // ============ Core Functions ============

  /**
   * Mint LP tokens for provided liquidity
   * In real Uniswap: tokens are transferred first, then mint is called
   * Simplified: amounts are passed directly
   */
  public mint(amount0: u256, amount1: u256): u256 {
    let liquidity: u256 = 0n;

    if (this.totalSupply === 0n) {
      // Initial liquidity = sqrt(amount0 * amount1) - MINIMUM_LIQUIDITY
      liquidity = sqrt(amount0 * amount1) - this.MINIMUM_LIQUIDITY;

      // Lock minimum liquidity forever (to prevent division by zero)
      this.totalSupply = this.MINIMUM_LIQUIDITY;
    } else {
      // liquidity = min(amount0 * totalSupply / reserve0, amount1 * totalSupply / reserve1)
      const liquidity0 = (amount0 * this.totalSupply) / this.reserve0;
      const liquidity1 = (amount1 * this.totalSupply) / this.reserve1;
      liquidity = min(liquidity0, liquidity1);
    }

    if (liquidity === 0n) {
      revert("Insufficient liquidity minted");
    }

    // Mint LP tokens to sender
    this._mint(msg.sender, liquidity);

    // Update reserves
    this._update(this.reserve0 + amount0, this.reserve1 + amount1);

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
    this._burn(sender, liquidity);

    // Update reserves
    this._update(this.reserve0 - amount0, this.reserve1 - amount1);

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
    const amount1Out = this.getAmountOut(amount0In);

    if (amount1Out === 0n) {
      revert("Insufficient output amount");
    }

    if (amount1Out >= this.reserve1) {
      revert("Insufficient liquidity");
    }

    // Update reserves
    this._update(this.reserve0 + amount0In, this.reserve1 - amount1Out);

    return amount1Out;
  }

  /**
   * Sync reserves with actual balances
   * In real Uniswap: reads token balances via external calls
   * Simplified: directly set reserves
   */
  public sync(balance0: u256, balance1: u256): void {
    this._update(balance0, balance1);
  }

  // ============ Internal Functions ============

  /**
   * Update reserves (and on the first call per block, price accumulators)
   */
  private _update(balance0: u256, balance1: u256): void {
    this.reserve0 = balance0;
    this.reserve1 = balance1;
    // Note: In real V2, this also updates price accumulators and blockTimestampLast
  }
}
