# 类型系统

本文档详细描述 ts-to-yul 的类型系统。

## 基础类型

### 无符号整数

| 类型   | 位宽 | 范围                           |
| ------ | ---- | ------------------------------ |
| `u8`   | 8    | 0 ~ 255                        |
| `u16`  | 16   | 0 ~ 65,535                     |
| `u32`  | 32   | 0 ~ 4,294,967,295              |
| `u64`  | 64   | 0 ~ 18,446,744,073,709,551,615 |
| `u128` | 128  | 0 ~ 2^128-1                    |
| `u256` | 256  | 0 ~ 2^256-1                    |

**使用示例**:

```typescript
@storage balance: u256 = 0n;
@storage counter: u32 = 0n;
```

### 有符号整数

| 类型   | 位宽 | 范围             |
| ------ | ---- | ---------------- |
| `i8`   | 8    | -128 ~ 127       |
| `i16`  | 16   | -32,768 ~ 32,767 |
| `i32`  | 32   | -2^31 ~ 2^31-1   |
| `i64`  | 64   | -2^63 ~ 2^63-1   |
| `i128` | 128  | -2^127 ~ 2^127-1 |
| `i256` | 256  | -2^255 ~ 2^255-1 |

**使用示例**:

```typescript
@storage tick: i32 = 0;  // 可以是负数
@storage delta: i256 = 0n;
```

**有符号运算**:

```typescript
// 有符号比较会使用 slt/sgt
if (tick < 0) { ... }
if (delta > -100n) { ... }

// 有符号除法使用 sdiv
const result = signedValue / divisor;  // sdiv
```

### 地址类型

```typescript
@storage owner: address;
@storage recipient: address;

// 使用
this.owner = msg.sender;
if (msg.sender === this.owner) { ... }
```

### 字节类型

| 类型      | 长度     |
| --------- | -------- |
| `bytes4`  | 4 bytes  |
| `bytes20` | 20 bytes |
| `bytes32` | 32 bytes |

**使用示例**:

```typescript
@storage hash: bytes32;
@storage selector: bytes4;
```

### 布尔类型

```typescript
@storage initialized: boolean = false;

if (this.initialized) {
  revert("Already initialized");
}
```

## 复合类型

### Mapping

单层 Mapping:

```typescript
@storage balances: Mapping<address, u256>;

// 读取
const balance = this.balances[account];

// 写入
this.balances[account] = newBalance;
```

嵌套 Mapping:

```typescript
@storage allowances: Mapping<address, Mapping<address, u256>>;

// 读取
const allowed = this.allowances[owner][spender];

// 写入
this.allowances[owner][spender] = amount;
```

### 存储位置计算

Mapping 的值存储在 `keccak256(key, slot)` 位置:

```
balances[addr] → keccak256(abi.encode(addr, slot_of_balances))
allowances[owner][spender] → keccak256(abi.encode(spender, keccak256(abi.encode(owner, slot))))
```

## 类型推断

### 变量声明

```typescript
// 显式类型
const amount: u256 = 100n;

// 类型推断
const total = this.balance + amount; // 推断为 u256
```

### 函数返回

```typescript
public getBalance(): u256 {
  return this.balance;  // 返回类型 u256
}

public getTick(): i32 {
  return this.tick;  // 返回类型 i32
}
```

### 多返回值

```typescript
public getReserves(): [u256, u256, u256] {
  return [this.reserve0, this.reserve1, this.blockTimestampLast];
}
```

## 类型转换

### 隐式转换

较小的无符号整数可以隐式转换为较大的类型:

```typescript
const a: u8 = 10n;
const b: u256 = a; // OK: u8 → u256
```

### 显式掩码

使用位运算进行类型限制:

```typescript
const value: u256 = someValue & 0xffn; // 限制为 u8 范围
const addr: address = value & ((1n << 160n) - 1n); // 限制为 address
```

## EVM 操作码映射

### 算术运算

| 运算 | 无符号操作码 | 有符号操作码 |
| ---- | ------------ | ------------ |
| `+`  | `add`        | `add`        |
| `-`  | `sub`        | `sub`        |
| `*`  | `mul`        | `mul`        |
| `/`  | `div`        | `sdiv`       |
| `%`  | `mod`        | `smod`       |

### 比较运算

| 运算  | 无符号操作码      | 有符号操作码       |
| ----- | ----------------- | ------------------ |
| `<`   | `lt`              | `slt`              |
| `>`   | `gt`              | `sgt`              |
| `<=`  | `iszero(gt(...))` | `iszero(sgt(...))` |
| `>=`  | `iszero(lt(...))` | `iszero(slt(...))` |
| `===` | `eq`              | `eq`               |
| `!==` | `iszero(eq(...))` | `iszero(eq(...))`  |

### 位运算

| 运算          | 操作码 |
| ------------- | ------ |
| `&`           | `and`  |
| `\|`          | `or`   |
| `^`           | `xor`  |
| `~`           | `not`  |
| `<<`          | `shl`  |
| `>>` (无符号) | `shr`  |
| `>>` (有符号) | `sar`  |

## 内置对象类型

### msg

```typescript
msg.sender; // address - 调用者地址
msg.value; // u256 - 发送的 ETH (wei)
```

### block

```typescript
block.number; // u256 - 区块号
block.timestamp; // u256 - 区块时间戳 (秒)
block.coinbase; // address - 矿工地址
```

## 泛型类型

### Int<N> 和 Uint<N>

可以使用泛型形式定义任意位宽整数:

```typescript
type i24 = Int<24>; // 24 位有符号整数
type u24 = Uint<24>; // 24 位无符号整数
```

## 类型安全

### 溢出检查

默认情况下不进行溢出检查 (与 Solidity unchecked 块相同)。

如需溢出检查，需手动实现:

```typescript
public safeAdd(a: u256, b: u256): u256 {
  const c = a + b;
  if (c < a) {
    revert("Overflow");
  }
  return c;
}
```

### 零地址检查

```typescript
if (recipient === 0n) {
  revert("Zero address");
}
```

## 类型导出

所有类型在 `runtime/index.ts` 中导出:

```typescript
import {
  u256,
  u128,
  u64,
  u32,
  u8,
  i256,
  i128,
  i64,
  i32,
  i8,
  address,
  bytes32,
  bytes20,
  bytes4,
  boolean,
  Mapping,
  Int,
  Uint,
  storage,
  view,
  pure,
  payable,
  msg,
  block,
  revert,
} from "ts-to-yul/runtime";
```
