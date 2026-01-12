/**
 * Pausable base contract - demonstrates transient storage and modifiers
 * Uses EIP-1153 transient storage for reentrancy guard
 * NOTE: Not abstract so it can be used with Mixin
 */
import {
  bool,
  address,
  storage,
  transient,
  msg,
  revert,
  require,
  view,
  virtual,
  indexed,
  event,
  Event,
} from "../../../../runtime/index.js";

// Custom errors
declare function EnforcedPause(): never;
declare function ExpectedPause(): never;

// Event interfaces (required for @event decorator)
interface PausedEvent {
  account: indexed<address>;
}

interface UnpausedEvent {
  account: indexed<address>;
}

/**
 * Pausable - Contract pause functionality
 * Uses transient storage for reentrancy protection
 */
export class Pausable {
  // Storage for pause state
  @storage protected _paused: bool = false;

  // EIP-1153: Transient storage (cleared after transaction)
  @transient protected _reentrancyLock: bool = false;

  // Events
  @event Paused: Event<PausedEvent>;
  @event Unpaused: Event<UnpausedEvent>;

  /**
   * Initialize Pausable state - call from child constructor
   * Pattern: _initializePausable(false) to start unpaused
   */
  protected _initializePausable(initialPaused: bool): void {
    this._paused = initialPaused;
  }

  @view
  @virtual
  public paused(): bool {
    return this._paused;
  }

  protected _requireNotPaused(): void {
    if (this._paused) {
      revert(EnforcedPause());
    }
  }

  protected _requirePaused(): void {
    if (!this._paused) {
      revert(ExpectedPause());
    }
  }

  // Reentrancy guard using transient storage
  protected _nonReentrant(): void {
    require(!this._reentrancyLock, "ReentrancyGuard: reentrant call");
    this._reentrancyLock = true;
  }

  protected _endNonReentrant(): void {
    this._reentrancyLock = false;
  }

  @virtual
  protected _pause(): void {
    this._paused = true;
    this.Paused.emit({ account: msg.sender });
  }

  @virtual
  protected _unpause(): void {
    this._paused = false;
    this.Unpaused.emit({ account: msg.sender });
  }
}
