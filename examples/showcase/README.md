# Solidity Feature Showcase

This example demonstrates **ALL 132 Solidity features** supported by ts-to-yul.

## File Structure

```
src/
├── types/           # Type system features
│   ├── ValueTypes.ts      # bool, integers, address, bytes, enum
│   ├── ReferenceTypes.ts  # arrays, mappings, structs, bytes/string
│   └── CustomTypes.ts     # user-defined value types, function types
├── inheritance/     # Inheritance features
│   ├── ICallback.ts       # Interface definition
│   ├── Ownable.ts         # Base contract
│   ├── Pausable.ts        # Base contract
│   └── MultiInherit.ts    # Multiple inheritance with Mixin
├── library/         # Library features
│   └── MathLib.ts         # Static method library
└── Showcase.ts      # Main contract demonstrating all features
```

## Features Covered (132 total)

### 1. Value Types (10)

- `bool` / `boolean`
- `u8` ~ `u256` (all 8-bit increments)
- `i8` ~ `i256` (signed integers)
- `address`
- `addressPayable`
- `bytes1` ~ `bytes32`
- TypeScript `enum`
- `ExternalFunction<Args, Return>`
- `InternalFunction<Args, Return>`
- `ValueType<T, Brand>` (user-defined value types)

### 2. Reference Types (7)

- `StorageBytes` (dynamic bytes)
- `StorageString` (dynamic string)
- `StorageArray<T>` (dynamic array with push/pop)
- `T[N]` (fixed-size array)
- `Mapping<K, V>` (including nested)
- TypeScript `interface` (struct)
- `CalldataArray.slice()` (array slicing)

### 3. Data Locations (4)

- `@storage` decorator
- Memory (automatic for local variables)
- Calldata (automatic for parameters)
- `@transient` decorator (EIP-1153)

### 4. Block Properties (9)

- `block.basefee`, `block.blobbasefee`, `block.chainid`
- `block.coinbase`, `block.difficulty`, `block.gaslimit`
- `block.number`, `block.prevrandao`, `block.timestamp`

### 5. Message/Transaction Properties (6)

- `msg.data`, `msg.sender`, `msg.sig`, `msg.value`
- `tx.gasprice`, `tx.origin`

### 6. Global Functions (9)

- `blockhash()`, `blobhash()`, `gasleft()`
- `addmod()`, `mulmod()`
- `keccak256()`, `sha256()`, `ripemd160()`, `ecrecover()`

### 7. State Variable Modifiers (5)

- `public` (auto getter), `internal` (default), `private`
- `@constant`, `@immutable`

### 8. Function Visibility (4)

- `public`, `@external`, `@internal`, `private`

### 9. Function State Modifiers (3)

- `@view`, `@pure`, `@payable`

### 10. Special Functions (3)

- `constructor()`
- `public receive()`
- `public fallback()`

### 11. Inheritance (9)

- Single inheritance: `extends A`
- Multiple inheritance: `extends Mixin(A, B, C)`
- `@virtual`, `@override`, `super.method()`
- `abstract class`, TypeScript `interface`
- Library: `static` methods
- `// using A for B` comment directive

### 12. Events (4)

- `@event` decorator
- `this.EventName.emit({...})`
- `indexed<T>` parameters
- `@anonymous` events

### 13. Error Handling (7)

- `require(cond)`, `require(cond, msg)`
- `assert(cond)`
- `revert()`, `revert(msg)`
- `declare function ErrorName(...): never`
- `revert(ErrorName(...))`

### 14. Control Structures (9)

- `if / else`
- `for`, `while`, `do { } while`
- `break`, `continue`, `return`
- `try / catch`
- `unchecked(() => { })`

### 15. Operators (18)

- Arithmetic: `+`, `-`, `*`, `/`, `%`, `**`, `++`, `--`, `+=`, `-=`, `*=`, `/=`
- Comparison: `===`, `!==`, `<`, `>`, `<=`, `>=`
- Bitwise: `&`, `|`, `^`, `~`, `<<`, `>>`
- Logical: `&&`, `||`, `!`
- Other: `? :`, `delete`

### 16. Address Operations (8)

- `.balance`, `.code`, `.codehash`
- `.transfer()`, `.send()`
- `call.call()`, `call.delegatecall()`, `call.staticcall()`

### 17. ABI Encoding (6)

- `abi.encode()`, `abi.encodePacked()`
- `abi.encodeWithSelector()`, `abi.encodeWithSignature()`
- `abi.encodeCall()`, `abi.decode()`

### 18. Type Information (6)

- `type(T).min`, `type(T).max`
- `type(C).name`, `type(C).creationCode`, `type(C).runtimeCode`
- `type(I).interfaceId`

### 19. Contract Creation (3)

- `new Contract()`
- `new Contract({ value: x })`
- `new Contract({ salt: s })`

### 20. Units (8)

- Ether: `wei`, `gwei`, `ether`
- Time: `seconds`, `minutes`, `hours`, `days`, `weeks`

### 21. Other Features (5)

- `this` reference
- `selfdestruct()`
- Inline assembly: `` asm`...` ``
- Named parameters: `f({a: 1, b: 2})`
- Custom storage layout: `@slot(n)`

## Build & Test

```bash
# Compile TypeScript to Yul
pnpm build
cd examples/showcase
ts-to-yul src/Showcase.ts -o out/

# Run Foundry tests
forge test -vvv
```
