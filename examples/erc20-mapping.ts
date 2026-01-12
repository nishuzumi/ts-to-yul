import {
  u256,
  address,
  bool,
  storage,
  Mapping,
  msg,
  revert,
  MAX_U256,
  Event,
  event,
  indexed,
} from "../runtime/index.js";

/**
 * ERC20 Transfer event
 * Emitted when tokens are transferred
 */
interface TransferEvent {
  from: indexed<address>;
  to: indexed<address>;
  value: u256;
}

/**
 * ERC20 Approval event
 * Emitted when allowance is set
 */
interface ApprovalEvent {
  owner: indexed<address>;
  spender: indexed<address>;
  value: u256;
}

/**
 * Standard ERC20 Token Implementation
 *
 * Uses Mapping type for balances and allowances.
 */
export class ERC20 {
  // Events
  @event Transfer: Event<TransferEvent>;
  @event Approval: Event<ApprovalEvent>;

  // Token metadata (stored as bytes32 for simplicity)
  @storage name: u256 = 0x546f6b656e000000000000000000000000000000000000000000000000000000n; // "Token"
  @storage symbol: u256 = 0x544b4e0000000000000000000000000000000000000000000000000000000000n; // "TKN"
  @storage decimals: u256 = 18n;
  @storage totalSupply: u256 = 0n;

  // Balances mapping: address => balance
  @storage balanceOf: Mapping<address, u256>;

  // Allowances mapping: owner => spender => amount
  @storage allowance: Mapping<address, Mapping<address, u256>>;

  constructor() {
    // Mint initial supply to deployer
    const initialSupply = 1000000n * 10n ** 18n; // 1M tokens
    this.balanceOf[msg.sender] = initialSupply;
    this.totalSupply = initialSupply;
  }

  /**
   * Returns the balance of an account
   */
  public getBalanceOf(account: address): u256 {
    return this.balanceOf[account];
  }

  /**
   * Returns the allowance
   */
  public getAllowance(owner: address, spender: address): u256 {
    return this.allowance[owner][spender];
  }

  /**
   * Transfer tokens to another address
   */
  public transfer(to: address, amount: u256): bool {
    const sender = msg.sender;

    // Check balance
    if (this.balanceOf[sender] < amount) {
      revert("Insufficient balance");
    }

    // Transfer
    this.balanceOf[sender] = this.balanceOf[sender] - amount;
    this.balanceOf[to] = this.balanceOf[to] + amount;

    this.Transfer.emit({ from: sender, to, value: amount });
    return true;
  }

  /**
   * Approve spender to spend tokens
   */
  public approve(spender: address, amount: u256): bool {
    this.allowance[msg.sender][spender] = amount;

    this.Approval.emit({ owner: msg.sender, spender, value: amount });
    return true;
  }

  /**
   * Transfer tokens from one address to another (using allowance)
   */
  public transferFrom(from: address, to: address, amount: u256): bool {
    const spender = msg.sender;
    const currentAllowance = this.allowance[from][spender];

    // Check allowance (skip if max allowance - infinite approval)
    if (currentAllowance !== MAX_U256) {
      if (currentAllowance < amount) {
        revert("Insufficient allowance");
      }
      this.allowance[from][spender] = currentAllowance - amount;
    }

    // Check balance
    if (this.balanceOf[from] < amount) {
      revert("Insufficient balance");
    }

    // Transfer
    this.balanceOf[from] = this.balanceOf[from] - amount;
    this.balanceOf[to] = this.balanceOf[to] + amount;

    this.Transfer.emit({ from, to, value: amount });
    return true;
  }

  /**
   * Mint new tokens
   * @warning NO ACCESS CONTROL - For demo only. Production code must add owner/role check.
   */
  public mint(to: address, amount: u256): void {
    this.balanceOf[to] = this.balanceOf[to] + amount;
    this.totalSupply = this.totalSupply + amount;
  }

  /**
   * Burn tokens
   */
  public burn(amount: u256): void {
    const sender = msg.sender;

    if (this.balanceOf[sender] < amount) {
      revert("Insufficient balance");
    }

    this.balanceOf[sender] = this.balanceOf[sender] - amount;
    this.totalSupply = this.totalSupply - amount;
  }
}
