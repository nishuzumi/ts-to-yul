import {
  u256,
  address,
  bool,
  storage,
  event,
  Mapping,
  Event,
  indexed,
  msg,
  revert,
  MAX_U256,
} from "../runtime/index.js";

/**
 * Event interfaces
 */
interface TransferEvent {
  from: indexed<address>;
  to: indexed<address>;
  value: u256;
}

interface ApprovalEvent {
  owner: indexed<address>;
  spender: indexed<address>;
  value: u256;
}

/**
 * ERC20 Token with Events
 */
export class ERC20 {
  // Token metadata
  @storage name: u256 = 0x546f6b656e000000000000000000000000000000000000000000000000000000n;
  @storage symbol: u256 = 0x544b4e0000000000000000000000000000000000000000000000000000000000n;
  @storage decimals: u256 = 18n;
  @storage totalSupply: u256 = 0n;

  // Balances and allowances
  @storage balanceOf: Mapping<address, u256>;
  @storage allowance: Mapping<address, Mapping<address, u256>>;

  // Events
  @event Transfer: Event<TransferEvent>;
  @event Approval: Event<ApprovalEvent>;

  constructor() {
    const initialSupply = 1000000n * 10n ** 18n;
    this.balanceOf[msg.sender] = initialSupply;
    this.totalSupply = initialSupply;
  }

  public transfer(to: address, amount: u256): bool {
    const sender = msg.sender;

    if (this.balanceOf[sender] < amount) {
      revert("Insufficient balance");
    }

    this.balanceOf[sender] = this.balanceOf[sender] - amount;
    this.balanceOf[to] = this.balanceOf[to] + amount;

    // Emit Transfer event
    this.Transfer.emit({ from: sender, to, value: amount });

    return true;
  }

  public approve(spender: address, amount: u256): bool {
    const owner = msg.sender;
    this.allowance[owner][spender] = amount;

    // Emit Approval event
    this.Approval.emit({ owner, spender, value: amount });

    return true;
  }

  public transferFrom(from: address, to: address, amount: u256): bool {
    const spender = msg.sender;
    const currentAllowance = this.allowance[from][spender];

    if (currentAllowance !== MAX_U256) {
      if (currentAllowance < amount) {
        revert("Insufficient allowance");
      }
      this.allowance[from][spender] = currentAllowance - amount;
    }

    if (this.balanceOf[from] < amount) {
      revert("Insufficient balance");
    }

    this.balanceOf[from] = this.balanceOf[from] - amount;
    this.balanceOf[to] = this.balanceOf[to] + amount;

    // Emit Transfer event
    this.Transfer.emit({ from, to, value: amount });

    return true;
  }

  public getBalanceOf(account: address): u256 {
    return this.balanceOf[account];
  }

  public getAllowance(owner: address, spender: address): u256 {
    return this.allowance[owner][spender];
  }
}
