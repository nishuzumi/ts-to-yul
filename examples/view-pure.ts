import {
  u256,
  address,
  storage,
  Mapping,
  msg,
  view,
  pure,
} from "../runtime/index.js";

/**
 * Contract demonstrating view and pure functions
 */
export class Calculator {
  @storage value: u256 = 0n;
  @storage balances: Mapping<address, u256>;

  public setValue(newValue: u256): void {
    this.value = newValue;
  }

  /**
   * View function - reads state but doesn't modify
   */
  @view
  public getValue(): u256 {
    return this.value;
  }

  /**
   * View function - reads from mapping
   */
  @view
  public getBalance(account: address): u256 {
    return this.balances[account];
  }

  /**
   * Pure function - no state access
   */
  @pure
  public add(a: u256, b: u256): u256 {
    return a + b;
  }

  /**
   * Pure function - computation only
   */
  @pure
  public multiply(a: u256, b: u256): u256 {
    return a * b;
  }
}
