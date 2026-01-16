import {
  u256,
  u128,
  u160,
  i24,
  i256,
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

  // Min and max sqrt ratios (from Uniswap V3 TickMath.sol)
  private MIN_SQRT_RATIO: u160 = 4295128739n;
  private MAX_SQRT_RATIO: u160 = 1461446703485210103287273052203988822378723970342n;

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
    // Sign-extend tick from i24 to i256 for proper ABI encoding
    let tick: i256 = this.tick;
    asm`
      ${tick} := signextend(2, ${tick})
    `;
    return [this.sqrtPriceX96, tick, this.fee];
  }

  @view
  public getLiquidity(): u128 {
    return this.liquidity;
  }

  @view
  public getPosition(owner: address): [u128, i24, i24] {
    return [this.positions[owner], this.positionTickLower[owner], this.positionTickUpper[owner]];
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

    // Check price bounds
    if (sqrtPriceX96_ < this.MIN_SQRT_RATIO) {
      revert("R");
    }
    if (sqrtPriceX96_ >= this.MAX_SQRT_RATIO) {
      revert("R");
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
  public mint(tickLower: i24, tickUpper: i24, amount: u128): [u256, u256] {
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
    const amountOut = this._getAmount1Delta(sqrtPriceNextX96, this.sqrtPriceX96, this.liquidity);

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
      this.feeGrowthGlobal0X128 =
        this.feeGrowthGlobal0X128 + (feeAmount * (1n << 128n)) / this.liquidity;
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
    const amountOut = this._getAmount0Delta(this.sqrtPriceX96, sqrtPriceNextX96, this.liquidity);

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
      this.feeGrowthGlobal1X128 =
        this.feeGrowthGlobal1X128 + (feeAmount * (1n << 128n)) / this.liquidity;
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
  // Ported from Uniswap V3 TickMath.sol
  // https://github.com/Uniswap/v3-core/blob/main/contracts/libraries/TickMath.sol

  /**
   * Get sqrt ratio at tick - O(1) using bit operations and pre-computed constants
   * Calculates sqrt(1.0001^tick) * 2^96
   */
  private _getSqrtRatioAtTick(tick: i24): u160 {
    let absTick: u256 = 0n;
    if (tick < 0n) {
      absTick = 0n - tick;
    } else {
      absTick = tick;
    }

    // Start with Q128 (1 << 128)
    let ratio: u256 = 0x100000000000000000000000000000000n;

    // Multiply by pre-computed constants based on bits of absTick
    // Each constant is sqrt(1.0001^(2^n)) in Q128 format
    if ((absTick & 0x1n) !== 0n) {
      ratio = (ratio * 0xfffcb933bd6fad37aa2d162d1a594001n) >> 128n;
    }
    if ((absTick & 0x2n) !== 0n) {
      ratio = (ratio * 0xfff97272373d413259a46990580e213an) >> 128n;
    }
    if ((absTick & 0x4n) !== 0n) {
      ratio = (ratio * 0xfff2e50f5f656932ef12357cf3c7fdccn) >> 128n;
    }
    if ((absTick & 0x8n) !== 0n) {
      ratio = (ratio * 0xffe5caca7e10e4e61c3624eaa0941cd0n) >> 128n;
    }
    if ((absTick & 0x10n) !== 0n) {
      ratio = (ratio * 0xffcb9843d60f6159c9db58835c926644n) >> 128n;
    }
    if ((absTick & 0x20n) !== 0n) {
      ratio = (ratio * 0xff973b41fa98c081472e6896dfb254c0n) >> 128n;
    }
    if ((absTick & 0x40n) !== 0n) {
      ratio = (ratio * 0xff2ea16466c96a3843ec78b326b52861n) >> 128n;
    }
    if ((absTick & 0x80n) !== 0n) {
      ratio = (ratio * 0xfe5dee046a99a2a811c461f1969c3053n) >> 128n;
    }
    if ((absTick & 0x100n) !== 0n) {
      ratio = (ratio * 0xfcbe86c7900a88aedcffc83b479aa3a4n) >> 128n;
    }
    if ((absTick & 0x200n) !== 0n) {
      ratio = (ratio * 0xf987a7253ac413176f2b074cf7815e54n) >> 128n;
    }
    if ((absTick & 0x400n) !== 0n) {
      ratio = (ratio * 0xf3392b0822b70005940c7a398e4b70f3n) >> 128n;
    }
    if ((absTick & 0x800n) !== 0n) {
      ratio = (ratio * 0xe7159475a2c29b7443b29c7fa6e889d9n) >> 128n;
    }
    if ((absTick & 0x1000n) !== 0n) {
      ratio = (ratio * 0xd097f3bdfd2022b8845ad8f792aa5825n) >> 128n;
    }
    if ((absTick & 0x2000n) !== 0n) {
      ratio = (ratio * 0xa9f746462d870fdf8a65dc1f90e061e5n) >> 128n;
    }
    if ((absTick & 0x4000n) !== 0n) {
      ratio = (ratio * 0x70d869a156d2a1b890bb3df62baf32f7n) >> 128n;
    }
    if ((absTick & 0x8000n) !== 0n) {
      ratio = (ratio * 0x31be135f97d08fd981231505542fcfa6n) >> 128n;
    }
    if ((absTick & 0x10000n) !== 0n) {
      ratio = (ratio * 0x9aa508b5b7a84e1c677de54f3e99bc9n) >> 128n;
    }
    if ((absTick & 0x20000n) !== 0n) {
      ratio = (ratio * 0x5d6af8dedb81196699c329225ee604n) >> 128n;
    }
    if ((absTick & 0x40000n) !== 0n) {
      ratio = (ratio * 0x2216e584f5fa1ea926041bedfe98n) >> 128n;
    }
    if ((absTick & 0x80000n) !== 0n) {
      ratio = (ratio * 0x48a170391f7dc42444e8fa2n) >> 128n;
    }

    // For positive ticks, we computed 1/ratio, so take reciprocal
    if (tick > 0n) {
      ratio = 0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffn / ratio;
    }

    // Convert from Q128 to Q96 (shift right by 32, round up)
    const shifted = ratio >> 32n;
    const remainder = ratio & 0xffffffffn;
    if (remainder > 0n) {
      return shifted + 1n;
    }
    return shifted;
  }

  /**
   * Get tick at sqrt ratio - Exact port from Uniswap V3 TickMath.sol
   * https://github.com/Uniswap/v3-core/blob/main/contracts/libraries/TickMath.sol
   */
  private _getTickAtSqrtRatio(sqrtPriceX96: u160): i24 {
    // require(sqrtPriceX96 >= MIN_SQRT_RATIO && sqrtPriceX96 < MAX_SQRT_RATIO, 'R');
    if (sqrtPriceX96 < this.MIN_SQRT_RATIO) {
      revert("R");
    }
    if (sqrtPriceX96 >= this.MAX_SQRT_RATIO) {
      revert("R");
    }

    let ratio: u256 = sqrtPriceX96;
    ratio = ratio << 32n;

    let r: u256 = ratio;
    let msb: u256 = 0n;
    let f: u256 = 0n;

    // assembly { let f := shl(7, gt(r, 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF)) msb := or(msb, f) r := shr(f, r) }
    asm`
      ${f} := shl(7, gt(${r}, 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF))
      ${msb} := or(${msb}, ${f})
      ${r} := shr(${f}, ${r})
    `;
    asm`
      ${f} := shl(6, gt(${r}, 0xFFFFFFFFFFFFFFFF))
      ${msb} := or(${msb}, ${f})
      ${r} := shr(${f}, ${r})
    `;
    asm`
      ${f} := shl(5, gt(${r}, 0xFFFFFFFF))
      ${msb} := or(${msb}, ${f})
      ${r} := shr(${f}, ${r})
    `;
    asm`
      ${f} := shl(4, gt(${r}, 0xFFFF))
      ${msb} := or(${msb}, ${f})
      ${r} := shr(${f}, ${r})
    `;
    asm`
      ${f} := shl(3, gt(${r}, 0xFF))
      ${msb} := or(${msb}, ${f})
      ${r} := shr(${f}, ${r})
    `;
    asm`
      ${f} := shl(2, gt(${r}, 0xF))
      ${msb} := or(${msb}, ${f})
      ${r} := shr(${f}, ${r})
    `;
    asm`
      ${f} := shl(1, gt(${r}, 0x3))
      ${msb} := or(${msb}, ${f})
      ${r} := shr(${f}, ${r})
    `;
    asm`
      ${f} := gt(${r}, 0x1)
      ${msb} := or(${msb}, ${f})
    `;

    // if (msb >= 128) r = ratio >> (msb - 127); else r = ratio << (127 - msb);
    if (msb >= 128n) {
      r = ratio >> (msb - 127n);
    } else {
      r = ratio << (127n - msb);
    }

    // int256 log_2 = (int256(msb) - 128) << 64;
    let log_2: i256 = (msb - 128n) << 64n;

    // assembly { r := shr(127, mul(r, r)) let f := shr(128, r) log_2 := or(log_2, shl(63, f)) r := shr(f, r) }
    asm`
      ${r} := shr(127, mul(${r}, ${r}))
      ${f} := shr(128, ${r})
      ${log_2} := or(${log_2}, shl(63, ${f}))
      ${r} := shr(${f}, ${r})
    `;
    asm`
      ${r} := shr(127, mul(${r}, ${r}))
      ${f} := shr(128, ${r})
      ${log_2} := or(${log_2}, shl(62, ${f}))
      ${r} := shr(${f}, ${r})
    `;
    asm`
      ${r} := shr(127, mul(${r}, ${r}))
      ${f} := shr(128, ${r})
      ${log_2} := or(${log_2}, shl(61, ${f}))
      ${r} := shr(${f}, ${r})
    `;
    asm`
      ${r} := shr(127, mul(${r}, ${r}))
      ${f} := shr(128, ${r})
      ${log_2} := or(${log_2}, shl(60, ${f}))
      ${r} := shr(${f}, ${r})
    `;
    asm`
      ${r} := shr(127, mul(${r}, ${r}))
      ${f} := shr(128, ${r})
      ${log_2} := or(${log_2}, shl(59, ${f}))
      ${r} := shr(${f}, ${r})
    `;
    asm`
      ${r} := shr(127, mul(${r}, ${r}))
      ${f} := shr(128, ${r})
      ${log_2} := or(${log_2}, shl(58, ${f}))
      ${r} := shr(${f}, ${r})
    `;
    asm`
      ${r} := shr(127, mul(${r}, ${r}))
      ${f} := shr(128, ${r})
      ${log_2} := or(${log_2}, shl(57, ${f}))
      ${r} := shr(${f}, ${r})
    `;
    asm`
      ${r} := shr(127, mul(${r}, ${r}))
      ${f} := shr(128, ${r})
      ${log_2} := or(${log_2}, shl(56, ${f}))
      ${r} := shr(${f}, ${r})
    `;
    asm`
      ${r} := shr(127, mul(${r}, ${r}))
      ${f} := shr(128, ${r})
      ${log_2} := or(${log_2}, shl(55, ${f}))
      ${r} := shr(${f}, ${r})
    `;
    asm`
      ${r} := shr(127, mul(${r}, ${r}))
      ${f} := shr(128, ${r})
      ${log_2} := or(${log_2}, shl(54, ${f}))
      ${r} := shr(${f}, ${r})
    `;
    asm`
      ${r} := shr(127, mul(${r}, ${r}))
      ${f} := shr(128, ${r})
      ${log_2} := or(${log_2}, shl(53, ${f}))
      ${r} := shr(${f}, ${r})
    `;
    asm`
      ${r} := shr(127, mul(${r}, ${r}))
      ${f} := shr(128, ${r})
      ${log_2} := or(${log_2}, shl(52, ${f}))
      ${r} := shr(${f}, ${r})
    `;
    asm`
      ${r} := shr(127, mul(${r}, ${r}))
      ${f} := shr(128, ${r})
      ${log_2} := or(${log_2}, shl(51, ${f}))
      ${r} := shr(${f}, ${r})
    `;
    asm`
      ${r} := shr(127, mul(${r}, ${r}))
      ${f} := shr(128, ${r})
      ${log_2} := or(${log_2}, shl(50, ${f}))
    `;

    // int256 log_sqrt10001 = log_2 * 255738958999603826347141;
    let log_sqrt10001: i256 = log_2 * 255738958999603826347141n;

    // int24 tickLow = int24((log_sqrt10001 - 3402992956809132418596140100660247210) >> 128);
    // int24 tickHi = int24((log_sqrt10001 + 291339464771989622907027621153398088495) >> 128);
    // Note: Solidity uses sar (arithmetic right shift) for int256, we use asm for this
    let tickLow: i24 = 0n;
    let tickHi: i24 = 0n;
    asm`
      ${tickLow} := sar(128, sub(${log_sqrt10001}, 3402992956809132418596140100660247210))
      ${tickHi} := sar(128, add(${log_sqrt10001}, 291339464771989622907027621153398088495))
    `;

    // tick = tickLow == tickHi ? tickLow : getSqrtRatioAtTick(tickHi) <= sqrtPriceX96 ? tickHi : tickLow;
    if (tickLow === tickHi) {
      return tickLow;
    }
    if (this._getSqrtRatioAtTick(tickHi) <= sqrtPriceX96) {
      return tickHi;
    }
    return tickLow;
  }

  /**
   * Calculate amount0 delta
   */
  private _getAmount0Delta(sqrtRatioAX96: u160, sqrtRatioBX96: u160, liquidity: u128): u256 {
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
  private _getAmount1Delta(sqrtRatioAX96: u160, sqrtRatioBX96: u160, liquidity: u128): u256 {
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
  private _getNextSqrtPriceFromAmount0(sqrtPriceX96: u160, liquidity: u128, amount: u256): u160 {
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
  private _getNextSqrtPriceFromAmount1(sqrtPriceX96: u160, liquidity: u128, amount: u256): u160 {
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
