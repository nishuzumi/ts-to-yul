import {
  u256,
  address,
  storage,
  Mapping,
  msg,
  revert,
  payable,
} from "../runtime/index.js";

/**
 * Simple ETH vault with deposit tracking
 * @warning INCOMPLETE - No withdraw function. Funds deposited will be locked permanently.
 * This is a demo contract. Production code must implement withdraw functionality.
 */
export class Vault {
  @storage balances: Mapping<address, u256>;
  @storage totalDeposited: u256 = 0n;

  /**
   * Deposit ETH into the vault
   */
  @payable
  public deposit(): u256 {
    const sender = msg.sender;
    const value = msg.value;

    if (value === 0n) {
      revert("Must send ETH");
    }

    this.balances[sender] = this.balances[sender] + value;
    this.totalDeposited = this.totalDeposited + value;

    return value;
  }

  /**
   * Get balance of an account
   */
  public getBalance(account: address): u256 {
    return this.balances[account];
  }

  /**
   * Get total deposited
   */
  public getTotalDeposited(): u256 {
    return this.totalDeposited;
  }
}
