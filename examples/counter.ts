import { u256, storage } from "../runtime/index.js";

/**
 * Simple Counter contract
 *
 * Demonstrates:
 * - Storage variables with @storage decorator
 * - Public functions (automatically get selectors)
 * - Reading and writing storage
 */
export class Counter {
  @storage value: u256 = 0n;

  /**
   * Increment the counter by 1
   */
  public increment(): void {
    this.value = this.value + 1n;
  }

  /**
   * Decrement the counter by 1
   * @warning NO UNDERFLOW CHECK - Will wrap to MAX_U256 when value is 0.
   * Production code should add: if (this.value === 0n) revert("Underflow");
   */
  public decrement(): void {
    this.value = this.value - 1n;
  }

  /**
   * Get the current counter value
   */
  public get(): u256 {
    return this.value;
  }

  /**
   * Set the counter to a specific value
   */
  public set(newValue: u256): void {
    this.value = newValue;
  }
}
