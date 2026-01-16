import { u256, address, bool, storage, Mapping, msg, revert } from "../runtime/index.js";

/**
 * ERC20 Token with constructor parameters
 */
export class Token {
  @storage totalSupply: u256 = 0n;
  @storage balanceOf: Mapping<address, u256>;
  @storage owner: u256 = 0n;

  constructor(initialSupply: u256, tokenOwner: address) {
    this.totalSupply = initialSupply;
    this.balanceOf[tokenOwner] = initialSupply;
    this.owner = tokenOwner;
  }

  public transfer(to: address, amount: u256): bool {
    const sender = msg.sender;

    if (this.balanceOf[sender] < amount) {
      revert("Insufficient balance");
    }

    this.balanceOf[sender] = this.balanceOf[sender] - amount;
    this.balanceOf[to] = this.balanceOf[to] + amount;

    return true;
  }

  public getBalanceOf(account: address): u256 {
    return this.balanceOf[account];
  }

  public getTotalSupply(): u256 {
    return this.totalSupply;
  }
}
