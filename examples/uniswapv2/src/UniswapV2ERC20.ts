import {
  u256,
  address,
  bool,
  storage,
  Mapping,
  msg,
  revert,
} from "../../../runtime/index.js";

/**
 * UniswapV2 ERC20 LP Token
 *
 * Implements the ERC20 interface for liquidity provider tokens.
 * This is inherited by UniswapV2Pair.
 */
export class UniswapV2ERC20 {
  @storage totalSupply: u256 = 0n;
  @storage balanceOf: Mapping<address, u256>;
  @storage allowance: Mapping<address, Mapping<address, u256>>;

  // ============ ERC20 Functions ============

  public transfer(to: address, amount: u256): bool {
    return this._transfer(msg.sender, to, amount);
  }

  public approve(spender: address, amount: u256): bool {
    this._approve(msg.sender, spender, amount);
    return true;
  }

  public transferFrom(from: address, to: address, amount: u256): bool {
    const spender = msg.sender;
    const currentAllowance = this.allowance[from][spender];

    if (currentAllowance < amount) {
      revert("Insufficient allowance");
    }

    this.allowance[from][spender] = currentAllowance - amount;
    return this._transfer(from, to, amount);
  }

  // ============ Internal Functions ============

  protected _transfer(from: address, to: address, amount: u256): bool {
    if (this.balanceOf[from] < amount) {
      revert("Insufficient balance");
    }

    this.balanceOf[from] = this.balanceOf[from] - amount;
    this.balanceOf[to] = this.balanceOf[to] + amount;
    return true;
  }

  protected _approve(owner: address, spender: address, amount: u256): void {
    this.allowance[owner][spender] = amount;
  }

  protected _mint(to: address, amount: u256): void {
    this.balanceOf[to] = this.balanceOf[to] + amount;
    this.totalSupply = this.totalSupply + amount;
  }

  protected _burn(from: address, amount: u256): void {
    if (this.balanceOf[from] < amount) {
      revert("Insufficient balance");
    }
    this.balanceOf[from] = this.balanceOf[from] - amount;
    this.totalSupply = this.totalSupply - amount;
  }
}
