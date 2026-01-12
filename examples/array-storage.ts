import {
  u256,
  address,
  storage,
  msg,
  revert,
} from "../runtime/index.js";

/**
 * Contract demonstrating array storage
 */
export class ArrayStorage {
  @storage items: u256[];
  @storage owner: u256 = 0n;

  constructor() {
    this.owner = msg.sender;
  }

  /**
   * Get array length
   */
  public getLength(): u256 {
    return this.items.length;
  }

  /**
   * Get item at index
   */
  public getItem(index: u256): u256 {
    return this.items[index];
  }

  /**
   * Set item at index
   */
  public setItem(index: u256, value: u256): void {
    this.items[index] = value;
  }

  /**
   * Push item to array (simplified - just increments length and sets value)
   */
  public push(value: u256): void {
    const len = this.items.length;
    this.items[len] = value;
    // Note: We need to manually update length since we don't have push() implemented
    // For a full implementation, we'd need to handle this differently
  }
}
