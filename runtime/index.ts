/**
 * ts-to-yul Runtime Types
 * Import these types in your TypeScript smart contracts.
 */

// Integer Types
export type UintBitSize =
  | 8
  | 16
  | 24
  | 32
  | 40
  | 48
  | 56
  | 64
  | 72
  | 80
  | 88
  | 96
  | 104
  | 112
  | 120
  | 128
  | 136
  | 144
  | 152
  | 160
  | 168
  | 176
  | 184
  | 192
  | 200
  | 208
  | 216
  | 224
  | 232
  | 240
  | 248
  | 256;

export type IntBitSize = UintBitSize;

/** Unsigned integer with N bits */
export type Uint<N extends UintBitSize> = bigint & { readonly __uint?: N };

/** Signed integer with N bits */
export type Int<N extends IntBitSize> = bigint & { readonly __int?: N };

// Unsigned integer aliases
export type u8 = Uint<8>;
export type u16 = Uint<16>;
export type u24 = Uint<24>;
export type u32 = Uint<32>;
export type u40 = Uint<40>;
export type u48 = Uint<48>;
export type u56 = Uint<56>;
export type u64 = Uint<64>;
export type u72 = Uint<72>;
export type u80 = Uint<80>;
export type u88 = Uint<88>;
export type u96 = Uint<96>;
export type u104 = Uint<104>;
export type u112 = Uint<112>;
export type u120 = Uint<120>;
export type u128 = Uint<128>;
export type u136 = Uint<136>;
export type u144 = Uint<144>;
export type u152 = Uint<152>;
export type u160 = Uint<160>;
export type u168 = Uint<168>;
export type u176 = Uint<176>;
export type u184 = Uint<184>;
export type u192 = Uint<192>;
export type u200 = Uint<200>;
export type u208 = Uint<208>;
export type u216 = Uint<216>;
export type u224 = Uint<224>;
export type u232 = Uint<232>;
export type u240 = Uint<240>;
export type u248 = Uint<248>;
export type u256 = Uint<256>;

// Signed integer aliases
export type i8 = Int<8>;
export type i16 = Int<16>;
export type i24 = Int<24>;
export type i32 = Int<32>;
export type i40 = Int<40>;
export type i48 = Int<48>;
export type i56 = Int<56>;
export type i64 = Int<64>;
export type i72 = Int<72>;
export type i80 = Int<80>;
export type i88 = Int<88>;
export type i96 = Int<96>;
export type i104 = Int<104>;
export type i112 = Int<112>;
export type i120 = Int<120>;
export type i128 = Int<128>;
export type i136 = Int<136>;
export type i144 = Int<144>;
export type i152 = Int<152>;
export type i160 = Int<160>;
export type i168 = Int<168>;
export type i176 = Int<176>;
export type i184 = Int<184>;
export type i192 = Int<192>;
export type i200 = Int<200>;
export type i208 = Int<208>;
export type i216 = Int<216>;
export type i224 = Int<224>;
export type i232 = Int<232>;
export type i240 = Int<240>;
export type i248 = Int<248>;
export type i256 = Int<256>;

// Address Type - base interface for all addresses
export interface AddressBase {
  readonly balance: u256;
  readonly codehash: bytes32;
  readonly code: u256; // Returns code size
}

// Address Payable - can receive ETH via transfer/send
export interface AddressPayable extends AddressBase {
  transfer(amount: u256): void;
  send(amount: u256): bool;
}

// Regular address (not payable by default, but can be cast)
export type address = `0x${string}` & AddressBase;

// Address payable type
export type addressPayable = `0x${string}` & AddressPayable;

// Bytes Types
export type BytesSize =
  | 1
  | 2
  | 3
  | 4
  | 5
  | 6
  | 7
  | 8
  | 9
  | 10
  | 11
  | 12
  | 13
  | 14
  | 15
  | 16
  | 17
  | 18
  | 19
  | 20
  | 21
  | 22
  | 23
  | 24
  | 25
  | 26
  | 27
  | 28
  | 29
  | 30
  | 31
  | 32;

export type Bytes<N extends BytesSize> = `0x${string}` & { readonly __bytes: N };

export type bytes1 = Bytes<1>;
export type bytes2 = Bytes<2>;
export type bytes3 = Bytes<3>;
export type bytes4 = Bytes<4>;
export type bytes5 = Bytes<5>;
export type bytes6 = Bytes<6>;
export type bytes7 = Bytes<7>;
export type bytes8 = Bytes<8>;
export type bytes9 = Bytes<9>;
export type bytes10 = Bytes<10>;
export type bytes11 = Bytes<11>;
export type bytes12 = Bytes<12>;
export type bytes13 = Bytes<13>;
export type bytes14 = Bytes<14>;
export type bytes15 = Bytes<15>;
export type bytes16 = Bytes<16>;
export type bytes17 = Bytes<17>;
export type bytes18 = Bytes<18>;
export type bytes19 = Bytes<19>;
export type bytes20 = Bytes<20>;
export type bytes21 = Bytes<21>;
export type bytes22 = Bytes<22>;
export type bytes23 = Bytes<23>;
export type bytes24 = Bytes<24>;
export type bytes25 = Bytes<25>;
export type bytes26 = Bytes<26>;
export type bytes27 = Bytes<27>;
export type bytes28 = Bytes<28>;
export type bytes29 = Bytes<29>;
export type bytes30 = Bytes<30>;
export type bytes31 = Bytes<31>;
export type bytes32 = Bytes<32>;

export type bool = boolean;

/**
 * User-defined value type (type C is V in Solidity)
 * Creates a distinct type at compile time with zero runtime cost.
 * Usage: type Price = ValueType<u256, "Price">;
 */
export type ValueType<T, Brand extends string> = T & { readonly __valueType: Brand };

// Decorators (compile-time only)
export function storage(_target: object, _propertyKey: string): void {}
export function payable(_target: object, _propertyKey: string): void {}
export function view(_target: object, _propertyKey: string): void {}
export function pure(_target: object, _propertyKey: string): void {}
export function event(_target: object, _propertyKey: string): void {}
export function anonymous(_target: object, _propertyKey: string): void {}
export function immutable(_target: object, _propertyKey: string): void {}
/**
 * Transient storage (EIP-1153) - data persists only for the duration of a transaction.
 * Lower gas cost than persistent storage. Ideal for reentrancy locks.
 * Usage: @transient lock: bool = false;
 */
export function transient(_target: object, _propertyKey: string): void {}
/** Marks a method as virtual (can be overridden in derived classes) */
export function virtual(_target: object, _propertyKey: string): void {}
/** Marks a method as overriding a parent's virtual method */
export function override(_target: object, _propertyKey: string): void {}
/** Marks a method as internal (callable from this contract and derived contracts, not exposed in ABI) */
export function internal(_target: object, _propertyKey: string): void {}
/** Marks a method as external (only callable from outside, exposed in ABI) */
export function external(_target: object, _propertyKey: string): void {}
/** Marks a property as constant (compile-time constant, no storage slot) */
export function constant(_target: object, _propertyKey: string): void {}

/**
 * Custom storage slot decorator - assigns a specific storage slot to a variable.
 * Useful for proxy contracts and upgradeable patterns.
 * Usage: @slot(0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc)
 *        implementation: address;
 * Or:    @slot(100n)
 *        customData: u256;
 */
export function slot(_slotNumber: bigint | number): PropertyDecorator {
  return (_target: object, _propertyKey: string | symbol) => {};
}

// Multiple inheritance via Mixin
// Usage: class MyToken extends Mixin(ERC20, Ownable, Pausable) { ... }
type Constructor<T = object> = new (...args: never[]) => T;
type UnionToIntersection<U> = (U extends unknown ? (k: U) => void : never) extends (
  k: infer I
) => void
  ? I
  : never;

/** Mixin for multiple inheritance - TypeScript correctly infers all parent members */
export function Mixin<T extends Constructor[]>(
  ...classes: T
): Constructor<UnionToIntersection<InstanceType<T[number]>>> {
  // Return first class as base (actual inheritance handled by compiler)
  return classes[0] as Constructor<UnionToIntersection<InstanceType<T[number]>>>;
}

// Units (compile-time constants)
export const wei = 1n;
export const gwei = 1_000_000_000n;
export const ether = 1_000_000_000_000_000_000n;
export const seconds = 1n;
export const minutes = 60n;
export const hours = 3600n;
export const days = 86400n;
export const weeks = 604800n;

// Type information (compile-time only)
export declare function type<T>(_t: T): { min: T; max: T };

// Transaction Context
export const msg = {
  sender: 0n as unknown as address,
  value: 0n as unknown as u256,
  data: new Uint8Array() as unknown as bytes32,
  sig: 0n as unknown as bytes4,
};

export const tx = {
  origin: "0x" as address,
  gasprice: 0n as unknown as u256,
};

// Block Context
export const block = {
  timestamp: 0n as unknown as u256,
  number: 0n as unknown as u256,
  coinbase: "0x" as address,
  chainid: 0n as unknown as u256,
  basefee: 0n as unknown as u256,
  blobbasefee: 0n as unknown as u256, // EIP-4844
  gaslimit: 0n as unknown as u256,
  difficulty: 0n as unknown as u256,
  prevrandao: 0n as unknown as u256,
};

// Built-in Functions
export function revert(_message?: string): never {
  throw new Error("revert");
}

export function require(_condition: boolean, _message?: string): void {}
export function assert(_condition: boolean): void {}

export function keccak256(_data: Uint8Array): bytes32 {
  return "0x" as bytes32;
}

export function sha256(_data: Uint8Array): bytes32 {
  return "0x" as bytes32;
}

/** RIPEMD-160 hash function - returns 20 bytes (160 bits) */
export function ripemd160(_data: Uint8Array): bytes20 {
  return "0x" as bytes20;
}

/** Recover signer address from ECDSA signature */
export function ecrecover(_hash: bytes32, _v: u8, _r: bytes32, _s: bytes32): address {
  return "0x" as address;
}

export function gasleft(): u256 {
  return 0n as unknown as u256;
}

export function blockhash(_blockNumber: u256): bytes32 {
  return "0x" as bytes32;
}

/** EIP-4844: Returns the hash of the blob at the given index */
export function blobhash(_index: u256): bytes32 {
  return "0x" as bytes32;
}

export function addmod(_a: u256, _b: u256, _n: u256): u256 {
  return 0n as unknown as u256;
}

export function mulmod(_a: u256, _b: u256, _n: u256): u256 {
  return 0n as unknown as u256;
}

/**
 * Destroy the contract and send all funds to recipient.
 * DEPRECATED in Solidity 0.8.18+ but still supported for compatibility.
 */
export function selfdestruct(_recipient: addressPayable): never {
  throw new Error("selfdestruct");
}

// Constants
export const ADDRESS_ZERO = "0x0000000000000000000000000000000000000000" as address;
export const MAX_U256 = (2n ** 256n - 1n) as unknown as u256;

// Mapping and Array Types
// Note: TypeScript doesn't allow bigint as index type natively
// The ts-to-yul compiler handles the actual type semantics correctly

/**
 * Index type helper - allows bigint to be used as index
 * Usage: mapping[idx(key)] instead of mapping[key]
 */
export function idx<T extends bigint | number | string>(key: T): number {
  return key as unknown as number;
}

/**
 * Solidity-style mapping type.
 * Supports bracket notation with any key type (address, u256, bytes32, etc.)
 *
 * TypeScript limitation: bigint cannot be used as index type.
 * Workaround: Use `mapping[idx(key)]` helper function
 * The ts-to-yul compiler ignores this conversion and uses the original type.
 *
 * @example
 * @storage balances: Mapping<address, u256>;
 * this.balances[msg.sender] = 100n;
 *
 * @storage orders: Mapping<u256, Order>;
 * this.orders[idx(id)].buyer = buyer;
 */
export interface Mapping<K, V> {
  [key: string]: V;
  [key: number]: V;
}

export interface StorageArray<T> {
  length: u256;
  [index: number]: T;
  push(value: T): void;
  pop(): T;
}

/**
 * Calldata array type (T[] calldata in Solidity)
 * Represents a read-only view into calldata.
 * Supports slicing: arr.slice(start, end)
 */
export interface CalldataArray<T> {
  readonly length: u256;
  readonly [index: number]: T;
  /** Returns a slice of the array from start to end (exclusive) */
  slice(start: u256, end?: u256): CalldataArray<T>;
}

/**
 * Fixed-size array type (T[N] in Solidity)
 * Use native TypeScript array syntax: e.g., u256[10], address[5]
 * The compiler recognizes this pattern and allocates consecutive storage slots.
 * Access with array[index] - includes bounds checking.
 * Length is a compile-time constant.
 */
export type FixedArray<T, N extends number> = T[] & { readonly length: N };

/**
 * Dynamic bytes storage type (bytes in Solidity)
 * Storage layout:
 * - Slot contains the length
 * - Data is stored at keccak256(slot), packed 32 bytes per slot
 */
export interface StorageBytes {
  /** Length in bytes */
  length: u256;
  /** Access byte at index */
  [index: number]: u8;
  /** Append a byte */
  push(value: u8): void;
  /** Remove and return last byte */
  pop(): u8;
}

/**
 * Dynamic string storage type (string in Solidity)
 * Storage layout same as StorageBytes
 */
export interface StorageString {
  /** Length in bytes */
  length: u256;
  /** Access byte at index */
  [index: number]: u8;
}

// Event Types
export type indexed<T> = T;

export interface Event<T> {
  emit(data: T): void;
}

/**
 * External function type - stores address (20 bytes) + selector (4 bytes) = 24 bytes
 * In storage: packed into a single slot with 8 bytes unused
 * Usage: ExternalFunction<[u256, u256], u256> for function(uint256,uint256) returns (uint256)
 */
export interface ExternalFunction<Args extends unknown[], Return> {
  /** The address of the contract containing the function */
  readonly address: address;
  /** The 4-byte function selector */
  readonly selector: bytes4;
  /** Call the external function */
  (...args: Args): Return;
}

/**
 * Internal function type - used for internal/private function pointers
 * Represented as a jump destination within the contract
 * Usage: InternalFunction<[u256], u256>
 */
export type InternalFunction<Args extends unknown[], Return> = (...args: Args) => Return;

// External Call Utilities
export const call = {
  call<T>(_target: address, _signature: string, _args: unknown[]): T {
    throw new Error("call not implemented");
  },
  staticcall<T>(_target: address, _signature: string, _args: unknown[]): T {
    throw new Error("staticcall not implemented");
  },
  delegatecall<T>(_target: address, _signature: string, _args: unknown[]): T {
    throw new Error("delegatecall not implemented");
  },
};

// ABI Encoding
export const abi = {
  encodePacked(..._values: unknown[]): Uint8Array {
    return new Uint8Array();
  },
  encode(..._values: unknown[]): Uint8Array {
    return new Uint8Array();
  },
  decode<T>(_data: Uint8Array, _types: string[]): T {
    throw new Error("decode not implemented");
  },
  encodeWithSelector(_selector: bytes4, ..._values: unknown[]): u256 {
    return 0n as unknown as u256;
  },
  encodeWithSignature(_signature: string, ..._values: unknown[]): u256 {
    return 0n as unknown as u256;
  },
};

// Inline Assembly
export declare function asm(code: TemplateStringsArray, ...args: unknown[]): void;

/**
 * Unchecked block - disables overflow/underflow checks for arithmetic operations.
 * Usage: unchecked(() => { ... })
 * Inside the callback, arithmetic operations use wrapping behavior.
 */
export declare function unchecked<T>(fn: () => T): T;

// Type Conversion Functions
export declare function address(value: u256 | bytes32 | u160): address;
// Note: payable() conversion is handled by the compiler but conflicts with @payable decorator
// Use `payable as (addr: address) => addressPayable` if needed for explicit conversion
export function uint256(value: bigint | address | addressPayable | u256 | i256 | bytes32): u256 {
  return value as unknown as u256;
}
export declare function uint160(value: address | u256 | bytes32): u160;
export declare function uint128(value: u256 | i256): u128;
export declare function uint64(value: u256 | i256): u64;
export declare function uint32(value: u256 | i256): u32;
export declare function uint8(value: u256 | i256): u8;
export declare function int256(value: u256 | i256): i256;
export declare function int128(value: u256 | i256): i128;
export declare function int64(value: u256 | i256): i64;
export declare function int32(value: u256 | i256): i32;
export declare function int8(value: u256 | i256): i8;
export declare function bytes32(value: u256 | address | bytes32): bytes32;
export declare function bytes20(value: u256 | address | bytes32): bytes20;
export declare function bytes4(value: u256 | bytes32): bytes4;
export declare function bytes1(value: u256 | bytes32): bytes1;
