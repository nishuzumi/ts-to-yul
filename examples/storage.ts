import { u256, address, storage, msg } from "../runtime/index.js";

/**
 * Simple Storage contract
 *
 * Demonstrates:
 * - Multiple storage variables
 * - Address type
 * - msg.sender access
 */
export class SimpleStorage {
  @storage storedValue: u256 = 0n;
  @storage owner: address = "0x0000000000000000000000000000000000000000";

  constructor() {
    this.owner = msg.sender;
  }

  /**
   * Store a new value
   */
  public store(value: u256): void {
    this.storedValue = value;
  }

  /**
   * Retrieve the stored value
   */
  public retrieve(): u256 {
    return this.storedValue;
  }

  /**
   * Get the contract owner
   */
  public getOwner(): address {
    return this.owner;
  }
}
