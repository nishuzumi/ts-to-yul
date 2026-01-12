/**
 * Math Library - demonstrates library features
 * Library = class with only static methods
 * Corresponds to Solidity: library MathLib { ... }
 */
import {
  u256,
  i256,
  bool,
  pure,
  view,
  revert,
  unchecked,
} from "../../../../runtime/index.js";

// Custom error for math operations
declare function MathOverflow(): never;
declare function DivisionByZero(): never;

// ==================== FEATURE: library (static methods class) ====================
export class MathLib {
  // ==================== FEATURE: @pure ====================
  // Pure functions don't read or modify state
  @pure
  static max(a: u256, b: u256): u256 {
    // ==================== FEATURE: ternary operator ? : ====================
    return a >= b ? a : b;
  }

  @pure
  static min(a: u256, b: u256): u256 {
    return a <= b ? a : b;
  }

  // ==================== FEATURE: arithmetic operators ====================
  @pure
  static average(a: u256, b: u256): u256 {
    // ==================== FEATURE: bitwise AND & ====================
    // (a & b) + (a ^ b) / 2 avoids overflow
    return (a & b) + ((a ^ b) >> 1n);
  }

  // ==================== FEATURE: ** power operator ====================
  @pure
  static pow(base: u256, exp: u256): u256 {
    let result: u256 = 1n;
    let b = base;
    let e = exp;

    // ==================== FEATURE: while loop ====================
    while (e > 0n) {
      // ==================== FEATURE: bitwise AND check ====================
      if ((e & 1n) === 1n) {
        result = result * b;
      }
      b = b * b;
      // ==================== FEATURE: bitwise right shift >> ====================
      e = e >> 1n;
    }
    return result;
  }

  // ==================== FEATURE: unchecked block ====================
  @pure
  static uncheckedAdd(a: u256, b: u256): u256 {
    // Unchecked arithmetic - no overflow checks
    return unchecked(() => a + b);
  }

  @pure
  static uncheckedSub(a: u256, b: u256): u256 {
    return unchecked(() => a - b);
  }

  @pure
  static uncheckedMul(a: u256, b: u256): u256 {
    return unchecked(() => a * b);
  }

  // ==================== FEATURE: revert with custom error ====================
  @pure
  static safeDiv(a: u256, b: u256): u256 {
    if (b === 0n) {
      revert(DivisionByZero());
    }
    return a / b;
  }

  // ==================== FEATURE: modulo operator % ====================
  @pure
  static mod(a: u256, b: u256): u256 {
    if (b === 0n) {
      revert(DivisionByZero());
    }
    return a % b;
  }

  // ==================== FEATURE: logical operators && || ! ====================
  @pure
  static isInRange(value: u256, min: u256, max: u256): bool {
    return value >= min && value <= max;
  }

  @pure
  static isOutOfRange(value: u256, min: u256, max: u256): bool {
    return value < min || value > max;
  }

  // ==================== FEATURE: comparison operators ====================
  @pure
  static compare(a: u256, b: u256): i256 {
    if (a < b) {
      return -1n as i256;
    } else if (a > b) {
      return 1n as i256;
    } else {
      return 0n as i256;
    }
  }

  // ==================== FEATURE: ++ -- operators ====================
  @pure
  static incrementTest(value: u256): u256 {
    let v = value;
    v++;
    return v;
  }

  @pure
  static decrementTest(value: u256): u256 {
    let v = value;
    v--;
    return v;
  }

  // ==================== FEATURE: compound assignment operators +=, -=, *=, /= ====================
  @pure
  static compoundOps(a: u256, b: u256): u256 {
    let result = a;
    result += b;      // result = result + b
    result -= 1n;     // result = result - 1
    result *= 2n;     // result = result * 2
    result /= 2n;     // result = result / 2
    return result;
  }

  // ==================== FEATURE: bitwise operators ====================
  @pure
  static bitwiseOps(a: u256, b: u256): [u256, u256, u256, u256, u256, u256] {
    const andResult = a & b;       // AND
    const orResult = a | b;        // OR
    const xorResult = a ^ b;       // XOR
    const notResult = ~a;          // NOT (complement)
    const leftShift = a << 2n;     // Left shift
    const rightShift = b >> 1n;    // Right shift
    return [andResult, orResult, xorResult, notResult, leftShift, rightShift];
  }

  // Square root using Newton's method
  @pure
  static sqrt(x: u256): u256 {
    if (x === 0n) return 0n;

    let z = (x + 1n) / 2n;
    let y = x;

    // ==================== FEATURE: for loop with break ====================
    for (let i: u256 = 0n; i < 256n; i++) {
      if (z >= y) {
        break;
      }
      y = z;
      z = (x / z + z) / 2n;
    }

    return y;
  }
}
