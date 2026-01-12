/**
 * Showcase with Multiple Inheritance
 * Demonstrates Solidity's multiple inheritance via Mixin pattern
 */
import {
  u256,
  address,
  addressPayable,
  bool,
  storage,
  msg,
  block,
  revert,
  require,
  view,
  payable,
  override,
  indexed,
  event,
  Event,
  Mapping,
  Mixin,
  ADDRESS_ZERO,
} from "../../../runtime/index.js";

// Import base classes
import { Ownable } from "./inheritance/Ownable.js";
import { Pausable } from "./inheritance/Pausable.js";

// Custom errors
declare function InsufficientBalance(available: u256, required: u256): never;

// Event interface
interface TransferEvent {
  from: indexed<address>;
  to: indexed<address>;
  amount: u256;
}

/**
 * ShowcaseWithInheritance - Demonstrates multiple inheritance
 *
 * FEATURE: Multiple inheritance via Mixin
 * Inherits from both Ownable and Pausable
 */
export class ShowcaseWithInheritance extends Mixin(Ownable, Pausable) {
  // Own storage
  @storage public totalSupply: u256 = 0n;
  @storage public balances: Mapping<address, u256>;
  @storage public treasury: addressPayable;

  // Own events
  @event Transfer: Event<TransferEvent>;

  /**
   * Constructor - initializes parent classes and own state.
   *
   * Call parent initializers directly in the constructor body.
   * The compiler automatically inlines these calls (similar to Solidity's
   * constructor() Parent1(arg) Parent2() syntax).
   */
  constructor(initialOwner: address, treasuryAddr: addressPayable) {
    super();
    // Initialize parent classes
    this._initializeOwnable(initialOwner);
    this._initializePausable(false);
    // Initialize own state
    this.treasury = treasuryAddr;
  }

  // =========================================================================
  // FEATURE: @override - Override virtual functions from parent
  // =========================================================================

  @view
  @override
  public owner(): address {
    // Can add custom logic before calling parent implementation
    return this._owner;
  }

  @view
  @override
  public paused(): bool {
    return this._paused;
  }

  // =========================================================================
  // Functions using inherited functionality
  // =========================================================================

  @payable
  public deposit(): u256 {
    // Use Pausable's _requireNotPaused
    this._requireNotPaused();

    const amount = msg.value;
    this.balances[msg.sender] = this.balances[msg.sender] + amount;
    this.totalSupply = this.totalSupply + amount;

    this.Transfer.emit({
      from: ADDRESS_ZERO,
      to: msg.sender,
      amount: amount,
    });

    return amount;
  }

  public transfer(to: address, amount: u256): bool {
    // Use Pausable's reentrancy guard
    this._nonReentrant();
    this._requireNotPaused();

    require(to !== ADDRESS_ZERO, "Zero address");
    require(amount > 0n, "Zero amount");

    const sender = msg.sender;
    const senderBalance = this.balances[sender];

    if (amount > senderBalance) {
      revert(InsufficientBalance(senderBalance, amount));
    }

    this.balances[sender] = senderBalance - amount;
    this.balances[to] = this.balances[to] + amount;

    this.Transfer.emit({ from: sender, to: to, amount: amount });

    this._endNonReentrant();
    return true;
  }

  @view
  public getBalance(account: address): u256 {
    return this.balances[account];
  }

  // =========================================================================
  // Admin functions using Ownable's _checkOwner
  // =========================================================================

  public pause(): void {
    this._checkOwner();
    this._pause();
  }

  public unpause(): void {
    this._checkOwner();
    this._unpause();
  }

  public setTreasury(newTreasury: addressPayable): void {
    this._checkOwner();
    require(newTreasury !== ADDRESS_ZERO, "Zero address");
    this.treasury = newTreasury;
  }

  // =========================================================================
  // Getters
  // =========================================================================

  @view
  public getOwner(): address {
    return this.owner();
  }

  @view
  public isPaused(): bool {
    return this.paused();
  }

  @view
  public getTreasury(): addressPayable {
    return this.treasury;
  }

  // receive ETH
  public receive(): void {
    // Accept ETH
  }
}
