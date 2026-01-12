# ts-to-yul

[English](README.md) | [中文](README.zh-CN.md)

> Write Ethereum smart contracts in TypeScript, compile to Yul, generate EVM bytecode.

Made by Box and Claude

```
TypeScript Contract → [ts-to-yul] → Yul Code → [solc] → EVM Bytecode
```

## Features

- **TypeScript Syntax** - Write contracts using familiar TypeScript class syntax
- **Complete Type System** - Support for `u256`, `i256`, `address`, `bytes32`, and all EVM types
- **Storage Decorators** - `@storage`, `@transient`, `@immutable`, `@slot` for state management
- **Function Modifiers** - `@view`, `@pure`, `@payable`, `@virtual`, `@override`
- **Multiple Inheritance** - `extends Mixin(A, B, C)` for diamond inheritance
- **Mapping Support** - Nested mappings and complex data structures
- **Event System** - `@event` decorator with `indexed` parameters
- **Custom Errors** - `declare function ErrorName(...): never`
- **132 Solidity Features** - 100% coverage of Solidity language features

## Installation

```bash
pnpm add ts-to-yul
# or
npm install ts-to-yul
```

**Requirements:**
- Node.js >= 20
- solc (for bytecode compilation)

## Quick Start

### 1. Write a Contract

```typescript
// counter.ts
import { u256, address, storage, msg } from "ts-to-yul/runtime";

export class Counter {
  @storage value: u256 = 0n;
  @storage owner: address;

  constructor() {
    this.owner = msg.sender;
  }

  public increment(): void {
    this.value = this.value + 1n;
  }

  @view
  public get(): u256 {
    return this.value;
  }
}
```

### 2. Compile to Yul

```bash
ts-to-yul compile counter.ts -o counter.yul
```

### 3. Compile to Bytecode

```bash
ts-to-yul build counter.ts -O -o counter.hex
```

## Type System

| TypeScript | EVM | Description |
|------------|-----|-------------|
| `u256`, `u128`, `u64`, `u32`, `u8` | Unsigned integers | Different bit widths |
| `i256`, `i128`, `i64`, `i32`, `i8` | Signed integers | Support negative numbers |
| `address`, `addressPayable` | Address | 20 bytes |
| `bytes32`, `bytes20`, `bytes4` | Fixed bytes | Fixed length |
| `bool` | Boolean | true/false |
| `Mapping<K, V>` | Mapping | Key-value storage |
| `StorageArray<T>` | Dynamic array | push/pop/length |
| `CalldataArray<T>` | Calldata array | length/index/slice |
| `interface` | Struct | Composite types |

## Decorators

```typescript
// Storage
@storage       // Persistent storage variable
@transient     // EIP-1153 transient storage
@immutable     // Immutable variable (set in constructor)
@constant      // Compile-time constant
@slot(n)       // Custom storage slot

// Functions
@payable       // Can receive ETH
@view          // Read-only (no state modification)
@pure          // Pure function (no state access)
@virtual       // Can be overridden by subclass
@override      // Override parent method
@internal      // Not exposed in ABI
@external      // Exposed in ABI (explicit)

// Events
@event         // Event declaration
@anonymous     // Anonymous event
```

## Built-in Objects

```typescript
// Transaction context
msg.sender     // Caller address
msg.value      // Sent ETH amount (wei)
msg.data       // Call data
msg.sig        // Function selector

// Block context
block.timestamp  // Block timestamp
block.number     // Block number
block.chainid    // Chain ID
block.coinbase   // Miner address
block.basefee    // Base fee
block.prevrandao // Previous RANDAO value

// Transaction
tx.origin      // Original sender
tx.gasprice    // Gas price

// Control flow
require(cond, "message")  // Condition check
revert("message")         // Revert transaction
assert(cond)              // Assertion

// Cryptographic
keccak256(data)    // Keccak-256 hash
sha256(data)       // SHA-256 hash
ecrecover(...)     // ECDSA recovery

// ABI encoding
abi.encode(...)           // Standard ABI encoding
abi.encodePacked(...)     // Packed encoding
abi.encodeWithSelector(...)
abi.encodeWithSignature(...)
abi.decode(data, Type)    // Decode data

// Address operations
address.balance    // ETH balance
address.code       // Contract bytecode
address.codehash   // Code hash
address.transfer(amount)  // Transfer ETH (reverts on failure)
address.send(amount)      // Transfer ETH (returns bool)

// External calls
call.call<T>(target, sig, args)        // External call
call.staticcall<T>(target, sig, args)  // Static call
call.delegatecall<T>(target, sig, args) // Delegate call

// Contract creation
new Contract()                    // Deploy contract
new Contract({ value: x })        // Deploy with ETH
new Contract({ salt: s })         // CREATE2 deployment
```

## Advanced Features

### Multiple Inheritance

```typescript
class Ownable {
  @storage owner: address;

  @virtual
  public onlyOwner(): void {
    require(msg.sender === this.owner, "Not owner");
  }
}

class Pausable {
  @storage paused: bool = false;

  public whenNotPaused(): void {
    require(!this.paused, "Paused");
  }
}

export class MyToken extends Mixin(Ownable, Pausable) {
  @override
  public onlyOwner(): void {
    super.onlyOwner();
    // Additional logic
  }
}
```

### Events

```typescript
interface TransferEvent {
  from: indexed<address>;
  to: indexed<address>;
  value: u256;
}

export class Token {
  @event Transfer: Event<TransferEvent>;

  public transfer(to: address, amount: u256): void {
    // ... transfer logic
    this.Transfer.emit({ from: msg.sender, to, value: amount });
  }
}
```

### Custom Errors

```typescript
declare function InsufficientBalance(available: u256, required: u256): never;
declare function Unauthorized(): never;

export class Vault {
  public withdraw(amount: u256): void {
    if (this.balances[msg.sender] < amount) {
      revert(InsufficientBalance(this.balances[msg.sender], amount));
    }
    // ...
  }
}
```

### External Calls via Interface

```typescript
interface IERC20 {
  balanceOf(account: address): u256;
  transfer(to: address, amount: u256): bool;
  transferFrom(from: address, to: address, amount: u256): bool;
}

export class Vault {
  public deposit(token: address, amount: u256): void {
    IERC20(token).transferFrom(msg.sender, address(this), amount);
  }
}
```

### Inline Assembly

```typescript
export class LowLevel {
  public rawCall(target: address, data: bytes32): u256 {
    let result: u256;
    asm`
      let success := call(gas(), ${target}, 0, 0, 32, 0, 32)
      result := mload(0)
    `;
    return result;
  }
}
```

### Transient Storage (EIP-1153)

```typescript
export class ReentrancyGuard {
  @transient locked: bool = false;

  public nonReentrant(): void {
    require(!this.locked, "Reentrancy");
    this.locked = true;
    // ... function body
    this.locked = false;
  }
}
```

## Example Projects

### Feature Showcase

| Example | Description | Tests |
|---------|-------------|-------|
| `examples/showcase/` | 132 Solidity features demo | Foundry tests |

### Basic Examples

| Example | Description |
|---------|-------------|
| `examples/counter.ts` | Simple counter |
| `examples/token.ts` | Basic ERC20 token |
| `examples/erc20-mapping.ts` | ERC20 with mappings |
| `examples/storage.ts` | Storage variables demo |
| `examples/payable-vault.ts` | Payable vault |

### DeFi Protocols

| Example | Description | Tests |
|---------|-------------|-------|
| `examples/uniswapv2/` | Uniswap V2 AMM (Pair + Router) | Foundry tests |
| `examples/uniswapv3/` | Uniswap V3 Concentrated Liquidity | Foundry tests |
| `examples/compound/` | Compound cToken Lending | - |

### Run Example Tests

```bash
# Showcase (all Solidity features)
cd examples/showcase && forge test

# UniswapV2
cd examples/uniswapv2 && forge test

# UniswapV3
cd examples/uniswapv3 && forge test
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         ts-to-yul                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────┐   ┌──────────┐   ┌───────────┐   ┌─────────┐ │
│  │  Parser  │ → │ Analyzer │ → │Transformer│ → │ Printer │ │
│  │(ts-morph)│   │  (Sema)  │   │           │   │         │ │
│  └──────────┘   └──────────┘   └───────────┘   └─────────┘ │
│       │              │              │              │        │
│       ▼              ▼              ▼              ▼        │
│   TS AST        ContractInfo     Yul AST       Yul Text    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

| Module | File | Responsibility |
|--------|------|----------------|
| Parser | `src/parser/` | TypeScript parsing via ts-morph |
| Analyzer | `src/analyzer/` | Semantic analysis, storage slot allocation |
| Transformer | `src/transformer/` | TS AST → Yul AST conversion |
| Printer | `src/yul/printer.ts` | Yul AST → formatted text |
| EVM Types | `src/evm/types.ts` | EVM type system |
| EVM Builtins | `src/evm/builtins.ts` | 73 EVM opcode definitions |
| ABI | `src/evm/abi.ts` | Function selector computation, ABI encoding |

See [docs/architecture.md](docs/architecture.md) for details.

## Development

```bash
pnpm install          # Install dependencies
pnpm build            # Build project
pnpm dev              # Development mode (watch)

pnpm test             # Run all tests (288 tests)
pnpm test:unit        # Unit tests
pnpm test:integration # Integration tests

pnpm typecheck        # Type checking
pnpm lint             # ESLint
pnpm format           # Prettier formatting
```

### Test Coverage

| Category | Tests |
|----------|-------|
| Type System | 19 |
| Control Flow | 17 |
| Reference Types | 14 |
| ASM/Inline Assembly | 13 |
| Unchecked Arithmetic | 12 |
| External Calls | 11 |
| Events | 11 |
| Modifiers | 11 |
| Calldata Arrays | 11 |
| ABI Encoding | 11 |
| Contract Creation | 10 |
| Bytes Concat | 10 |
| Inheritance | 8 |
| And more... | ... |
| **Total** | **288** |

## Documentation

- [Architecture](docs/architecture.md) - Compiler internals
- [Type System](docs/type-system.md) - Type mapping and semantics
- [Solidity Comparison](docs/solidity-comparison.md) - Feature coverage (132 features, 100%)
- [Examples Guide](docs/examples.md) - Example projects walkthrough

## Solidity Feature Coverage

ts-to-yul implements **132 Solidity language features** with **100% coverage**:

| Category | Features |
|----------|----------|
| Value Types | 10 |
| Reference Types | 7 |
| Global Variables | 18 |
| Contract Structure | 14 |
| Inheritance | 9 |
| Events/Errors | 10 |
| Control Structures | 9 |
| Operators | 18 |
| Address Operations | 8 |
| ABI Encoding | 6 |
| Type Information | 6 |
| Contract Creation | 3 |
| Units | 8 |
| Other Features | 5 |

See [docs/solidity-comparison.md](docs/solidity-comparison.md) for the complete feature matrix.

## Author

**Box**

## License

MIT License - see [LICENSE](LICENSE)
