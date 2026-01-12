import { u256, i24, u160 } from "../../../../runtime/index.js";

/**
 * TickMath Library
 * Computes sqrt price for ticks of size 1.0001
 *
 * Based on Uniswap V3: https://github.com/Uniswap/v3-core/blob/main/contracts/libraries/TickMath.sol
 */

// Min and max ticks (from Uniswap V3)
export const MIN_TICK: i24 = -887272n;
export const MAX_TICK: i24 = 887272n;

// Min and max sqrt ratios (Q64.96 format)
export const MIN_SQRT_RATIO: u160 = 4295128739n;
export const MAX_SQRT_RATIO: u160 = 1461446703485210103287273052203988822378723970342n;

// 1 << 96 (represents price = 1.0)
export const Q96: u256 = 79228162514264337593543950336n;

/**
 * Get sqrt ratio at tick (simplified version)
 * Real V3 uses bit manipulation for precision
 * This approximation works for small tick values
 */
export function getSqrtRatioAtTick(tick: i24): u160 {
  // For tick = 0, return 1 << 96 (price = 1)
  if (tick === 0n) {
    return Q96;
  }

  const absTick = tick < 0n ? -tick : tick;
  let ratio: u256 = Q96;

  // Approximate sqrt(1.0001^tick) by multiplying/dividing
  // sqrt(1.0001) ≈ 1.00005
  for (let i = 0n; i < absTick && i < 500n; i = i + 1n) {
    if (tick > 0n) {
      ratio = (ratio * 100005n) / 100000n;
    } else {
      ratio = (ratio * 100000n) / 100005n;
    }
  }

  return ratio;
}

/**
 * Get tick at sqrt ratio (simplified version)
 */
export function getTickAtSqrtRatio(sqrtPriceX96: u160): i24 {
  if (sqrtPriceX96 === Q96) {
    return 0n;
  }

  let tick: i24 = 0n;

  if (sqrtPriceX96 > Q96) {
    while (tick < 5000n) {
      const ratio = getSqrtRatioAtTick(tick + 1n);
      if (ratio > sqrtPriceX96) {
        return tick;
      }
      tick = tick + 1n;
    }
  } else {
    while (tick > -5000n) {
      const ratio = getSqrtRatioAtTick(tick);
      if (ratio <= sqrtPriceX96) {
        return tick;
      }
      tick = tick - 1n;
    }
  }

  return tick;
}
