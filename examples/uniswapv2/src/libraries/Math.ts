import { u256 } from "../../../../runtime/index.js";

/**
 * Math library for Uniswap V2
 * Contains utility functions for mathematical operations
 */

/**
 * Calculate the integer square root using the Babylonian method
 * @param x The value to take the square root of
 * @returns The integer square root of x
 */
export function sqrt(x: u256): u256 {
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
 * Return the minimum of two values
 */
export function min(a: u256, b: u256): u256 {
  if (a < b) {
    return a;
  }
  return b;
}
