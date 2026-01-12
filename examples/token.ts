import { u256, address, storage, msg, revert } from "../runtime/index.js";

/**
 * Simple Token contract
 *
 * Demonstrates:
 * - Multiple storage variables
 * - Conditional logic
 * - Error handling with revert
 * - Token transfer pattern
 *
 * Note: This is a simplified example. A real ERC20 would need
 * mapping support which is not yet implemented.
 */
export class SimpleToken {
  @storage totalSupply: u256 = 0n;
  @storage owner: address = "0x0000000000000000000000000000000000000000";
  @storage ownerBalance: u256 = 0n;

  constructor() {
    this.owner = msg.sender;
    this.totalSupply = 1000000n;
    this.ownerBalance = 1000000n;
  }

  /**
   * Get total supply
   */
  public getTotalSupply(): u256 {
    return this.totalSupply;
  }

  /**
   * Get owner's balance
   */
  public getOwnerBalance(): u256 {
    return this.ownerBalance;
  }

  /**
   * Mint new tokens (only owner)
   */
  public mint(amount: u256): void {
    if (msg.sender !== this.owner) {
      revert("Only owner can mint");
    }
    this.totalSupply = this.totalSupply + amount;
    this.ownerBalance = this.ownerBalance + amount;
  }

  /**
   * Burn tokens from owner's balance
   */
  public burn(amount: u256): void {
    if (msg.sender !== this.owner) {
      revert("Only owner can burn");
    }
    if (this.ownerBalance < amount) {
      revert("Insufficient balance");
    }
    this.totalSupply = this.totalSupply - amount;
    this.ownerBalance = this.ownerBalance - amount;
  }
}
