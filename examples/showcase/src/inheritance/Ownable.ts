/**
 * Ownable base contract - demonstrates inheritance features
 * NOTE: Not abstract so it can be used with Mixin
 */
import {
  address,
  storage,
  msg,
  revert,
  require,
  view,
  virtual,
  indexed,
  event,
  Event,
  ADDRESS_ZERO,
} from "../../../../runtime/index.js";

// Custom errors
declare function OwnableUnauthorized(caller: address): never;
declare function OwnableInvalidOwner(owner: address): never;

// Event interface
interface OwnershipTransferredEvent {
  previousOwner: indexed<address>;
  newOwner: indexed<address>;
}

/**
 * Ownable - Access control contract
 * Provides basic ownership functionality
 */
export class Ownable {
  @storage protected _owner: address;

  @event OwnershipTransferred: Event<OwnershipTransferredEvent>;

  /**
   * Initialize Ownable state - call from child constructor
   * Pattern: _initializeOwnable(initialOwner) instead of directly setting _owner
   */
  protected _initializeOwnable(initialOwner: address): void {
    this._owner = initialOwner;
  }

  @view
  @virtual
  public owner(): address {
    return this._owner;
  }

  @view
  protected _checkOwner(): void {
    if (this.owner() !== msg.sender) {
      revert(OwnableUnauthorized(msg.sender));
    }
  }

  @virtual
  public transferOwnership(newOwner: address): void {
    if (newOwner === ADDRESS_ZERO) {
      revert(OwnableInvalidOwner(ADDRESS_ZERO));
    }
    this._checkOwner();
    this._transferOwnership(newOwner);
  }

  protected _transferOwnership(newOwner: address): void {
    const oldOwner = this._owner;
    this._owner = newOwner;
    this.OwnershipTransferred.emit({ previousOwner: oldOwner, newOwner });
  }

  public renounceOwnership(): void {
    require(msg.sender === this._owner, "Not owner");
    this._transferOwnership(ADDRESS_ZERO);
  }
}
