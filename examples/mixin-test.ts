import { storage, u256, address, Mapping, Mixin, msg, payable, view } from "../runtime";

// 父类 1: ERC20 基础
class ERC20Base {
  @storage totalSupply: u256 = 0n;
  @storage balances: Mapping<address, u256> = {};

  public _mint(to: address, amount: u256): void {
    this.balances[to] = this.balances[to] + amount;
    this.totalSupply = this.totalSupply + amount;
  }

  @view
  public balanceOf(account: address): u256 {
    return this.balances[account];
  }
}

// 父类 2: Ownable
class Ownable {
  @storage owner: address = msg.sender;

  public onlyOwner(): void {
    require(msg.sender === this.owner, "Not owner");
  }

  public transferOwnership(newOwner: address): void {
    this.onlyOwner();
    this.owner = newOwner;
  }
}

// 父类 3: Pausable
class Pausable {
  @storage paused: bool = false;

  public requireNotPaused(): void {
    require(!this.paused, "Paused");
  }

  public pause(): void {
    this.paused = true;
  }

  public unpause(): void {
    this.paused = false;
  }
}

// 多重继承: MyToken 继承自 ERC20Base, Ownable, Pausable
export class MyToken extends Mixin(ERC20Base, Ownable, Pausable) {
  @storage extraField: u256 = 0n; // 额外的存储变量

  // 使用所有父类的方法
  public mint(to: address, amount: u256): void {
    this.onlyOwner(); // from Ownable
    this.requireNotPaused(); // from Pausable
    this._mint(to, amount); // from ERC20Base
  }

  // 覆盖 pause，添加权限检查
  public pause(): void {
    this.onlyOwner();
    this.paused = true;
  }

  @view
  public getExtra(): u256 {
    return this.extraField;
  }
}
