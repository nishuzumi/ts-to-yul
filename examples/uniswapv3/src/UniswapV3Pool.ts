import {
  u256,
  u128,
  u160,
  i24,
  address,
  storage,
  msg,
  revert,
  view,
  Mapping,
} from "../../../runtime/index.js";

/**
 * UniswapV3Pool - Simplified Concentrated Liquidity AMM
 *
 * Key V3 concepts implemented:
 * - Concentrated liquidity with tick ranges
 * - sqrtPriceX96 (Q64.96 format) price representation
 * - Position-based liquidity (tickLower, tickUpper)
 * - Fee collection per position
 *
 * Based on Uniswap V3: https://github.com/Uniswap/v3-core
 */
export class UniswapV3Pool {
  // ============ Constants ============

  // 1 << 96 (represents price = 1.0)
  private Q96: u256 = 79228162514264337593543950336n;

  // Min and max ticks
  private MIN_TICK: i24 = -887272n;
  private MAX_TICK: i24 = 887272n;

  // ============ Pool State ============

  // Current sqrt price (Q64.96 format)
  @storage sqrtPriceX96: u160 = 0n;

  // Current tick
  @storage tick: i24 = 0n;

  // Total liquidity currently in range
  @storage liquidity: u128 = 0n;

  // Fee rate in hundredths of a bip (e.g., 3000 = 0.3%)
  @storage fee: u256 = 3000n;

  // Protocol fee (percentage of swap fee)
  @storage protocolFee: u256 = 0n;

  // Fee growth per unit of liquidity (token0)
  @storage feeGrowthGlobal0X128: u256 = 0n;

  // Fee growth per unit of liquidity (token1)
  @storage feeGrowthGlobal1X128: u256 = 0n;

  // Position data: using owner address directly for demo
  @storage positions: Mapping<address, u128>;
  @storage positionTickLower: Mapping<address, i24>;
  @storage positionTickUpper: Mapping<address, i24>;

  // Whether pool is initialized
  @storage initialized: u256 = 0n;

  // ============ View Functions ============

  @view
  public slot0(): [u160, i24, u256] {
    return [this.sqrtPriceX96, this.tick, this.fee];
  }

  @view
  public getLiquidity(): u128 {
    return this.liquidity;
  }

  @view
  public getPosition(owner: address): [u128, i24, i24] {
    return [
      this.positions[owner],
      this.positionTickLower[owner],
      this.positionTickUpper[owner],
    ];
  }

  @view
  public getFeeGrowthGlobal(): [u256, u256] {
    return [this.feeGrowthGlobal0X128, this.feeGrowthGlobal1X128];
  }

  // ============ Initialize ============

  /**
   * Initialize the pool with starting sqrt price
   */
  public initialize(sqrtPriceX96_: u160): u256 {
    if (this.initialized !== 0n) {
      revert("AI");
    }

    if (sqrtPriceX96_ === 0n) {
      revert("IP");
    }

    this.sqrtPriceX96 = sqrtPriceX96_;
    this.tick = this._getTickAtSqrtRatio(sqrtPriceX96_);
    this.initialized = 1n;

    return 1n;
  }

  // ============ Mint (Add Liquidity) ============

  /**
   * Add liquidity to a position
   */
  public mint(
    tickLower: i24,
    tickUpper: i24,
    amount: u128
  ): [u256, u256] {
    if (this.initialized === 0n) {
      revert("NI");
    }

    if (tickLower >= tickUpper) {
      revert("TLU");
    }

    if (tickLower < this.MIN_TICK) {
      revert("TL");
    }

    if (tickUpper > this.MAX_TICK) {
      revert("TU");
    }

    if (amount === 0n) {
      revert("ZL");
    }

    const sender = msg.sender;

    // Calculate amounts needed based on current price and tick range
    const sqrtRatioLowerX96 = this._getSqrtRatioAtTick(tickLower);
    const sqrtRatioUpperX96 = this._getSqrtRatioAtTick(tickUpper);

    let amount0: u256 = 0n;
    let amount1: u256 = 0n;

    if (this.tick < tickLower) {
      // Current price below range: need only token0
      amount0 = this._getAmount0Delta(sqrtRatioLowerX96, sqrtRatioUpperX96, amount);
    } else if (this.tick < tickUpper) {
      // Current price in range: need both tokens
      amount0 = this._getAmount0Delta(this.sqrtPriceX96, sqrtRatioUpperX96, amount);
      amount1 = this._getAmount1Delta(sqrtRatioLowerX96, this.sqrtPriceX96, amount);

      // Update active liquidity
      this.liquidity = this.liquidity + amount;
    } else {
      // Current price above range: need only token1
      amount1 = this._getAmount1Delta(sqrtRatioLowerX96, sqrtRatioUpperX96, amount);
    }

    // Update position
    this.positions[sender] = this.positions[sender] + amount;
    this.positionTickLower[sender] = tickLower;
    this.positionTickUpper[sender] = tickUpper;

    return [amount0, amount1];
  }

  // ============ Burn (Remove Liquidity) ============

  /**
   * Remove liquidity from a position
   */
  public burn(amount: u128): [u256, u256] {
    const sender = msg.sender;
    const positionLiquidity = this.positions[sender];

    if (amount > positionLiquidity) {
      revert("IL");
    }

    const tickLower = this.positionTickLower[sender];
    const tickUpper = this.positionTickUpper[sender];

    const sqrtRatioLowerX96 = this._getSqrtRatioAtTick(tickLower);
    const sqrtRatioUpperX96 = this._getSqrtRatioAtTick(tickUpper);

    let amount0: u256 = 0n;
    let amount1: u256 = 0n;

    if (this.tick < tickLower) {
      amount0 = this._getAmount0Delta(sqrtRatioLowerX96, sqrtRatioUpperX96, amount);
    } else if (this.tick < tickUpper) {
      amount0 = this._getAmount0Delta(this.sqrtPriceX96, sqrtRatioUpperX96, amount);
      amount1 = this._getAmount1Delta(sqrtRatioLowerX96, this.sqrtPriceX96, amount);

      // Update active liquidity
      if (this.liquidity >= amount) {
        this.liquidity = this.liquidity - amount;
      }
    } else {
      amount1 = this._getAmount1Delta(sqrtRatioLowerX96, sqrtRatioUpperX96, amount);
    }

    // Update position
    this.positions[sender] = positionLiquidity - amount;

    return [amount0, amount1];
  }

  // ============ Swap ============

  /**
   * Swap exact input token0 for token1
   */
  public swapExact0For1(amountIn: u256, sqrtPriceLimitX96: u160): u256 {
    if (this.initialized === 0n) {
      revert("NI");
    }

    if (amountIn === 0n) {
      revert("IA");
    }

    if (sqrtPriceLimitX96 >= this.sqrtPriceX96) {
      revert("SPL");
    }

    if (this.liquidity === 0n) {
      revert("NL");
    }

    // Calculate fee
    const feeAmount = (amountIn * this.fee) / 1000000n;
    const amountInLessFee = amountIn - feeAmount;

    // Calculate new sqrt price
    const sqrtPriceNextX96 = this._getNextSqrtPriceFromAmount0(
      this.sqrtPriceX96,
      this.liquidity,
      amountInLessFee
    );

    // Calculate output amount
    const amountOut = this._getAmount1Delta(
      sqrtPriceNextX96,
      this.sqrtPriceX96,
      this.liquidity
    );

    // Update price (respect limit)
    if (sqrtPriceNextX96 >= sqrtPriceLimitX96) {
      this.sqrtPriceX96 = sqrtPriceNextX96;
    } else {
      this.sqrtPriceX96 = sqrtPriceLimitX96;
    }

    // Update tick
    this.tick = this._getTickAtSqrtRatio(this.sqrtPriceX96);

    // Update fee growth
    if (this.liquidity > 0n) {
      this.feeGrowthGlobal0X128 = this.feeGrowthGlobal0X128 +
        ((feeAmount * (1n << 128n)) / this.liquidity);
    }

    return amountOut;
  }

  /**
   * Swap exact input token1 for token0
   */
  public swapExact1For0(amountIn: u256, sqrtPriceLimitX96: u160): u256 {
    if (this.initialized === 0n) {
      revert("NI");
    }

    if (amountIn === 0n) {
      revert("IA");
    }

    if (sqrtPriceLimitX96 <= this.sqrtPriceX96) {
      revert("SPL");
    }

    if (this.liquidity === 0n) {
      revert("NL");
    }

    // Calculate fee
    const feeAmount = (amountIn * this.fee) / 1000000n;
    const amountInLessFee = amountIn - feeAmount;

    // Calculate new sqrt price
    const sqrtPriceNextX96 = this._getNextSqrtPriceFromAmount1(
      this.sqrtPriceX96,
      this.liquidity,
      amountInLessFee
    );

    // Calculate output amount
    const amountOut = this._getAmount0Delta(
      this.sqrtPriceX96,
      sqrtPriceNextX96,
      this.liquidity
    );

    // Update price (respect limit)
    if (sqrtPriceNextX96 <= sqrtPriceLimitX96) {
      this.sqrtPriceX96 = sqrtPriceNextX96;
    } else {
      this.sqrtPriceX96 = sqrtPriceLimitX96;
    }

    // Update tick
    this.tick = this._getTickAtSqrtRatio(this.sqrtPriceX96);

    // Update fee growth
    if (this.liquidity > 0n) {
      this.feeGrowthGlobal1X128 = this.feeGrowthGlobal1X128 +
        ((feeAmount * (1n << 128n)) / this.liquidity);
    }

    return amountOut;
  }

  // ============ Flash ============

  /**
   * Calculate flash loan fees
   */
  @view
  public flashFee(amount0: u256, amount1: u256): [u256, u256] {
    const fee0 = (amount0 * this.fee) / 1000000n;
    const fee1 = (amount1 * this.fee) / 1000000n;
    return [fee0, fee1];
  }

  // ============ Admin Functions ============

  /**
   * Set protocol fee
   */
  public setFeeProtocol(feeProtocol: u256): u256 {
    if (feeProtocol > 10n) {
      revert("IPF");
    }
    this.protocolFee = feeProtocol;
    return 1n;
  }

  // ============ Internal Math Functions ============

  /**
   * Get sqrt ratio at tick (simplified)
   */
  private _getSqrtRatioAtTick(tick: i24): u160 {
    if (tick === 0n) {
      return this.Q96;
    }

    let absTick: u256 = 0n;
    if (tick < 0n) {
      absTick = 0n - tick;
    } else {
      absTick = tick;
    }

    let ratio: u256 = this.Q96;

    // Approximate sqrt(1.0001^tick)
    let i: u256 = 0n;
    while (i < absTick && i < 500n) {
      if (tick > 0n) {
        ratio = (ratio * 100005n) / 100000n;
      } else {
        ratio = (ratio * 100000n) / 100005n;
      }
      i = i + 1n;
    }

    return ratio;
  }

  /**
   * Get tick at sqrt ratio (simplified)
   */
  private _getTickAtSqrtRatio(sqrtPriceX96: u160): i24 {
    if (sqrtPriceX96 === this.Q96) {
      return 0n;
    }

    let tick: i24 = 0n;

    if (sqrtPriceX96 > this.Q96) {
      while (tick < 5000n) {
        const ratio = this._getSqrtRatioAtTick(tick + 1n);
        if (ratio > sqrtPriceX96) {
          return tick;
        }
        tick = tick + 1n;
      }
    } else {
      while (tick > -5000n) {
        const ratio = this._getSqrtRatioAtTick(tick);
        if (ratio <= sqrtPriceX96) {
          return tick;
        }
        tick = tick - 1n;
      }
    }

    return tick;
  }

  /**
   * Calculate amount0 delta
   */
  private _getAmount0Delta(
    sqrtRatioAX96: u160,
    sqrtRatioBX96: u160,
    liquidity: u128
  ): u256 {
    let sqrtPriceLower = sqrtRatioAX96;
    let sqrtPriceUpper = sqrtRatioBX96;
    if (sqrtRatioAX96 > sqrtRatioBX96) {
      sqrtPriceLower = sqrtRatioBX96;
      sqrtPriceUpper = sqrtRatioAX96;
    }

    const numerator = liquidity * this.Q96 * (sqrtPriceUpper - sqrtPriceLower);
    const denominator = sqrtPriceLower * sqrtPriceUpper;

    if (denominator === 0n) {
      return 0n;
    }

    return numerator / denominator;
  }

  /**
   * Calculate amount1 delta
   */
  private _getAmount1Delta(
    sqrtRatioAX96: u160,
    sqrtRatioBX96: u160,
    liquidity: u128
  ): u256 {
    let sqrtPriceLower = sqrtRatioAX96;
    let sqrtPriceUpper = sqrtRatioBX96;
    if (sqrtRatioAX96 > sqrtRatioBX96) {
      sqrtPriceLower = sqrtRatioBX96;
      sqrtPriceUpper = sqrtRatioAX96;
    }

    return (liquidity * (sqrtPriceUpper - sqrtPriceLower)) / this.Q96;
  }

  /**
   * Get next sqrt price from amount0
   */
  private _getNextSqrtPriceFromAmount0(
    sqrtPriceX96: u160,
    liquidity: u128,
    amount: u256
  ): u160 {
    if (amount === 0n) {
      return sqrtPriceX96;
    }

    const product = amount * sqrtPriceX96;
    const denominator = liquidity * this.Q96 + product;

    if (denominator === 0n) {
      return sqrtPriceX96;
    }

    return (liquidity * this.Q96 * sqrtPriceX96) / denominator;
  }

  /**
   * Get next sqrt price from amount1
   */
  private _getNextSqrtPriceFromAmount1(
    sqrtPriceX96: u160,
    liquidity: u128,
    amount: u256
  ): u160 {
    if (amount === 0n) {
      return sqrtPriceX96;
    }

    if (liquidity === 0n) {
      return sqrtPriceX96;
    }

    const delta = (amount * this.Q96) / liquidity;
    return sqrtPriceX96 + delta;
  }
}
