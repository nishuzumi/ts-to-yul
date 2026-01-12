import { u256, u128, u160 } from "../../../../runtime/index.js";
import { Q96 } from "./TickMath.js";

/**
 * SqrtPriceMath Library
 * Functions for computing amounts from prices and liquidity
 *
 * Based on Uniswap V3: https://github.com/Uniswap/v3-core/blob/main/contracts/libraries/SqrtPriceMath.sol
 */

/**
 * Calculate amount0 delta between two sqrt prices
 * amount0 = liquidity * (1/sqrtPriceLower - 1/sqrtPriceUpper)
 */
export function getAmount0Delta(
  sqrtRatioAX96: u160,
  sqrtRatioBX96: u160,
  liquidity: u128
): u256 {
  // Ensure sqrtRatioA <= sqrtRatioB
  let sqrtPriceLower = sqrtRatioAX96;
  let sqrtPriceUpper = sqrtRatioBX96;
  if (sqrtRatioAX96 > sqrtRatioBX96) {
    sqrtPriceLower = sqrtRatioBX96;
    sqrtPriceUpper = sqrtRatioAX96;
  }

  const numerator = liquidity * Q96 * (sqrtPriceUpper - sqrtPriceLower);
  const denominator = sqrtPriceLower * sqrtPriceUpper;

  if (denominator === 0n) {
    return 0n;
  }

  return numerator / denominator;
}

/**
 * Calculate amount1 delta between two sqrt prices
 * amount1 = liquidity * (sqrtPriceUpper - sqrtPriceLower)
 */
export function getAmount1Delta(
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

  return (liquidity * (sqrtPriceUpper - sqrtPriceLower)) / Q96;
}

/**
 * Calculate the next sqrt price given an amount of token0
 * sqrtPriceNext = liquidity * sqrtPrice / (liquidity + amount * sqrtPrice / Q96)
 */
export function getNextSqrtPriceFromAmount0(
  sqrtPriceX96: u160,
  liquidity: u128,
  amount: u256,
  add: boolean
): u160 {
  if (amount === 0n) {
    return sqrtPriceX96;
  }

  const liq = liquidity;
  const price = sqrtPriceX96;

  if (add) {
    // Adding token0 decreases price
    const product = amount * price;
    const denominator = liq * Q96 + product;
    if (denominator === 0n) return sqrtPriceX96;
    return (liq * Q96 * price) / denominator;
  } else {
    // Removing token0 increases price
    const product = amount * price;
    if (liq * Q96 <= product) return sqrtPriceX96;
    const denominator = liq * Q96 - product;
    return (liq * Q96 * price) / denominator;
  }
}

/**
 * Calculate the next sqrt price given an amount of token1
 * sqrtPriceNext = sqrtPrice + amount * Q96 / liquidity
 */
export function getNextSqrtPriceFromAmount1(
  sqrtPriceX96: u160,
  liquidity: u128,
  amount: u256,
  add: boolean
): u160 {
  if (amount === 0n) {
    return sqrtPriceX96;
  }

  if (liquidity === 0n) {
    return sqrtPriceX96;
  }

  const delta = (amount * Q96) / liquidity;

  if (add) {
    return sqrtPriceX96 + delta;
  } else {
    if (delta >= sqrtPriceX96) {
      return 0n;
    }
    return sqrtPriceX96 - delta;
  }
}

/**
 * Calculate liquidity for amount0 given price range
 */
export function getLiquidityForAmount0(
  sqrtRatioAX96: u160,
  sqrtRatioBX96: u160,
  amount0: u256
): u128 {
  let sqrtPriceLower = sqrtRatioAX96;
  let sqrtPriceUpper = sqrtRatioBX96;
  if (sqrtRatioAX96 > sqrtRatioBX96) {
    sqrtPriceLower = sqrtRatioBX96;
    sqrtPriceUpper = sqrtRatioAX96;
  }

  const numerator = amount0 * sqrtPriceLower * sqrtPriceUpper;
  const denominator = Q96 * (sqrtPriceUpper - sqrtPriceLower);

  if (denominator === 0n) {
    return 0n;
  }

  return numerator / denominator;
}

/**
 * Calculate liquidity for amount1 given price range
 */
export function getLiquidityForAmount1(
  sqrtRatioAX96: u160,
  sqrtRatioBX96: u160,
  amount1: u256
): u128 {
  let sqrtPriceLower = sqrtRatioAX96;
  let sqrtPriceUpper = sqrtRatioBX96;
  if (sqrtRatioAX96 > sqrtRatioBX96) {
    sqrtPriceLower = sqrtRatioBX96;
    sqrtPriceUpper = sqrtRatioAX96;
  }

  const diff = sqrtPriceUpper - sqrtPriceLower;
  if (diff === 0n) {
    return 0n;
  }

  return (amount1 * Q96) / diff;
}
