# Solidity vs ts-to-yul 功能对比

本文档详细对比 Solidity 语言特性与 ts-to-yul 的实现状态。

**图例**: ✅ 已实现 | ⚠️ 部分实现 | ❌ 未实现 | 🚫 Solidity 也不支持

---

## 1. 类型系统

### 1.1 值类型

| Solidity | ts-to-yul | 状态 | 备注 |
|----------|-----------|------|------|
| `bool` | `bool` / `boolean` | ✅ | |
| `uint8` ~ `uint256` | `u8` ~ `u256` | ✅ | 支持所有 8 位增量 |
| `int8` ~ `int256` | `i8` ~ `i256` | ✅ | 支持所有 8 位增量 |
| `address` | `address` | ✅ | |
| `address payable` | `addressPayable` | ✅ | |
| `bytes1` ~ `bytes32` | `bytes1` ~ `bytes32` | ✅ | |
| `enum` | TypeScript `enum` | ✅ | |
| `function external` | `ExternalFunction<Args, Return>` | ✅ | |
| `function internal` | `InternalFunction<Args, Return>` | ✅ | |
| `ufixedMxN` / `fixedMxN` | - | 🚫 | Solidity 也未完全支持 |
| `type C is V` (用户定义值类型) | `ValueType<T, Brand>` | ✅ | 编译时类型安全 |

### 1.2 引用类型

| Solidity | ts-to-yul | 状态 | 备注 |
|----------|-----------|------|------|
| `bytes` | `StorageBytes` | ✅ | length/push/pop/索引 |
| `string` | `StorageString` | ✅ | length/索引 |
| `T[]` 动态数组 | `StorageArray<T>` | ✅ | push/pop/length/索引 |
| `T[N]` 定长数组 | `T[N]` 原生语法 | ✅ | 边界检查 |
| `mapping(K => V)` | `Mapping<K, V>` | ✅ | 包括嵌套 |
| `struct` | TypeScript `interface` | ✅ | |
| 数组切片 `x[start:end]` | `CalldataArray.slice()` | ✅ | 支持 calldata 数组切片 |

### 1.3 数据位置

| Solidity | ts-to-yul | 状态 | 备注 |
|----------|-----------|------|------|
| `storage` | `@storage` 装饰器 | ✅ | |
| `memory` | 自动处理 | ✅ | 函数内变量 |
| `calldata` | 自动处理 | ✅ | 函数参数 |
| `transient` (EIP-1153) | `@transient` 装饰器 | ✅ | tload/tstore |

---

## 2. 全局变量和函数

### 2.1 区块属性

| Solidity | ts-to-yul | 状态 |
|----------|-----------|------|
| `block.basefee` | `block.basefee` | ✅ |
| `block.blobbasefee` | `block.blobbasefee` | ✅ |
| `block.chainid` | `block.chainid` | ✅ |
| `block.coinbase` | `block.coinbase` | ✅ |
| `block.difficulty` | `block.difficulty` | ✅ |
| `block.gaslimit` | `block.gaslimit` | ✅ |
| `block.number` | `block.number` | ✅ |
| `block.prevrandao` | `block.prevrandao` | ✅ |
| `block.timestamp` | `block.timestamp` | ✅ |

### 2.2 消息/交易属性

| Solidity | ts-to-yul | 状态 |
|----------|-----------|------|
| `msg.data` | `msg.data` | ✅ |
| `msg.sender` | `msg.sender` | ✅ |
| `msg.sig` | `msg.sig` | ✅ |
| `msg.value` | `msg.value` | ✅ |
| `tx.gasprice` | `tx.gasprice` | ✅ |
| `tx.origin` | `tx.origin` | ✅ |

### 2.3 全局函数

| Solidity | ts-to-yul | 状态 |
|----------|-----------|------|
| `blockhash()` | `blockhash()` | ✅ |
| `blobhash()` | `blobhash()` | ✅ |
| `gasleft()` | `gasleft()` | ✅ |
| `addmod()` | `addmod()` | ✅ |
| `mulmod()` | `mulmod()` | ✅ |
| `keccak256()` | `keccak256()` | ✅ |
| `sha256()` | `sha256()` | ✅ |
| `ripemd160()` | `ripemd160()` | ✅ |
| `ecrecover()` | `ecrecover()` | ✅ |

---

## 3. 合约结构

### 3.1 状态变量修饰符

| Solidity | ts-to-yul | 状态 |
|----------|-----------|------|
| `public` | 自动生成 getter | ✅ |
| `internal` | 默认 | ✅ |
| `private` | `private` 关键字 | ✅ |
| `constant` | `@constant` | ✅ |
| `immutable` | `@immutable` | ✅ |

### 3.2 函数可见性

| Solidity | ts-to-yul | 状态 |
|----------|-----------|------|
| `public` | `public` | ✅ |
| `external` | `@external` | ✅ |
| `internal` | `@internal` | ✅ |
| `private` | `private` | ✅ |

### 3.3 函数状态修饰符

| Solidity | ts-to-yul | 状态 |
|----------|-----------|------|
| `view` | `@view` | ✅ |
| `pure` | `@pure` | ✅ |
| `payable` | `@payable` | ✅ |

### 3.4 特殊函数

| Solidity | ts-to-yul | 状态 |
|----------|-----------|------|
| `constructor` | `constructor()` | ✅ |
| `receive()` | `public receive()` | ✅ |
| `fallback()` | `public fallback()` | ✅ |

---

## 4. 继承

| Solidity | ts-to-yul | 状态 | 备注 |
|----------|-----------|------|------|
| 单继承 `is A` | `extends A` | ✅ | |
| 多继承 `is A, B, C` | `extends Mixin(A, B, C)` | ✅ | |
| `virtual` | `@virtual` | ✅ | |
| `override` | `@override` | ✅ | |
| `super.method()` | `super.method()` | ✅ | |
| `abstract` | `abstract class` | ✅ | |
| `interface` | TypeScript `interface` | ✅ | |
| `library` | `static` 方法类 | ✅ | |
| `using A for B` | `// using A for B` 注释 | ✅ | |

---

## 5. 事件和错误

### 5.1 事件

| Solidity | ts-to-yul | 状态 |
|----------|-----------|------|
| `event E(...)` | `@event` 装饰器 | ✅ |
| `emit E(...)` | `this.E.emit({...})` | ✅ |
| `indexed` 参数 | `indexed<T>` | ✅ |
| `anonymous` 事件 | `@anonymous` | ✅ |

### 5.2 错误处理

| Solidity | ts-to-yul | 状态 |
|----------|-----------|------|
| `require(cond)` | `require(cond)` | ✅ |
| `require(cond, msg)` | `require(cond, msg)` | ✅ |
| `assert(cond)` | `assert(cond)` | ✅ |
| `revert()` | `revert()` | ✅ |
| `revert(msg)` | `revert(msg)` | ✅ |
| `error E(...)` | `declare function E(...): never` | ✅ |
| `revert E(...)` | `revert(E(...))` | ✅ |

---

## 6. 控制结构

| Solidity | ts-to-yul | 状态 |
|----------|-----------|------|
| `if / else` | `if / else` | ✅ |
| `for` | `for` | ✅ |
| `while` | `while` | ✅ |
| `do { } while` | `do { } while` | ✅ |
| `break` | `break` | ✅ |
| `continue` | `continue` | ✅ |
| `return` | `return` | ✅ |
| `try / catch` | `try / catch` | ✅ |
| `unchecked { }` | `unchecked(() => { })` | ✅ | 禁用溢出检查 |

---

## 7. 运算符

### 7.1 算术运算

| Solidity | ts-to-yul | 状态 |
|----------|-----------|------|
| `+`, `-`, `*`, `/`, `%` | ✅ | ✅ |
| `**` 幂运算 | `**` | ✅ |
| `++`, `--` | `++`, `--` | ✅ |
| `+=`, `-=`, `*=`, `/=` | ✅ | ✅ |

### 7.2 比较运算

| Solidity | ts-to-yul | 状态 |
|----------|-----------|------|
| `==`, `!=` | `===`, `!==` | ✅ |
| `<`, `>`, `<=`, `>=` | ✅ | ✅ |

### 7.3 位运算

| Solidity | ts-to-yul | 状态 |
|----------|-----------|------|
| `&`, `\|`, `^`, `~` | ✅ | ✅ |
| `<<`, `>>` | ✅ | ✅ |

### 7.4 逻辑运算

| Solidity | ts-to-yul | 状态 |
|----------|-----------|------|
| `&&`, `\|\|`, `!` | ✅ | ✅ |

### 7.5 其他

| Solidity | ts-to-yul | 状态 |
|----------|-----------|------|
| `? :` 三元运算符 | `? :` | ✅ |
| `delete` | `delete` | ✅ |

---

## 8. 地址操作

| Solidity | ts-to-yul | 状态 |
|----------|-----------|------|
| `<address>.balance` | `.balance` | ✅ |
| `<address>.code` | `.code` | ✅ |
| `<address>.codehash` | `.codehash` | ✅ |
| `<address>.transfer()` | `.transfer()` | ✅ |
| `<address>.send()` | `.send()` | ✅ |
| `<address>.call()` | `call.call()` | ✅ |
| `<address>.delegatecall()` | `call.delegatecall()` | ✅ |
| `<address>.staticcall()` | `call.staticcall()` | ✅ |

---

## 9. ABI 编码

| Solidity | ts-to-yul | 状态 |
|----------|-----------|------|
| `abi.encode(...)` | `abi.encode(...)` | ✅ |
| `abi.encodePacked(...)` | `abi.encodePacked(...)` | ✅ |
| `abi.encodeWithSelector(...)` | `abi.encodeWithSelector(...)` | ✅ |
| `abi.encodeWithSignature(...)` | `abi.encodeWithSignature(...)` | ✅ |
| `abi.encodeCall(...)` | `abi.encodeCall(...)` | ✅ |
| `abi.decode(...)` | `abi.decode(...)` | ✅ |

---

## 10. 类型信息

| Solidity | ts-to-yul | 状态 |
|----------|-----------|------|
| `type(T).min` | `type(T).min` | ✅ |
| `type(T).max` | `type(T).max` | ✅ |
| `type(C).name` | `type(C).name` | ✅ |
| `type(C).creationCode` | `type(C).creationCode` | ✅ |
| `type(C).runtimeCode` | `type(C).runtimeCode` | ✅ |
| `type(I).interfaceId` | `type(I).interfaceId` | ✅ |

---

## 11. 合约创建

| Solidity | ts-to-yul | 状态 |
|----------|-----------|------|
| `new Contract()` | `new Contract()` | ✅ |
| `new Contract{value: x}()` | `new Contract({ value: x })` | ✅ |
| `new Contract{salt: s}()` | `new Contract({ salt: s })` | ✅ |

---

## 12. 单位

| Solidity | ts-to-yul | 状态 |
|----------|-----------|------|
| `wei` | `wei` | ✅ |
| `gwei` | `gwei` | ✅ |
| `ether` | `ether` | ✅ |
| `seconds` | `seconds` | ✅ |
| `minutes` | `minutes` | ✅ |
| `hours` | `hours` | ✅ |
| `days` | `days` | ✅ |
| `weeks` | `weeks` | ✅ |

---

## 13. 其他特性

| Solidity | ts-to-yul | 状态 | 备注 |
|----------|-----------|------|------|
| `this` | `this` | ✅ | |
| `selfdestruct()` | `selfdestruct()` | ✅ | 已弃用 |
| 内联汇编 `assembly { }` | `` asm`...` `` | ✅ | |
| 命名参数 `f({a: 1})` | `f({a: 1})` | ✅ | 自动参数排序 |
| 自定义存储布局 | `@slot(n)` 装饰器 | ✅ | 支持显式指定存储槽 |

---

## 未实现特性汇总

### 低优先级 (边缘场景)

| 特性 | 说明 | 难度 |
|------|------|------|
| 定点数 | `ufixedMxN` / `fixedMxN` | 🚫 Solidity 也未完全支持 |

---

## 统计

| 类别 | 已实现 | 部分 | 未实现 | 完成度 |
|------|--------|------|--------|--------|
| 值类型 | 10 | 0 | 0 | 100% |
| 引用类型 | 7 | 0 | 0 | 100% |
| 全局变量 | 18 | 0 | 0 | 100% |
| 合约结构 | 14 | 0 | 0 | 100% |
| 继承 | 9 | 0 | 0 | 100% |
| 事件/错误 | 10 | 0 | 0 | 100% |
| 控制结构 | 9 | 0 | 0 | 100% |
| 运算符 | 18 | 0 | 0 | 100% |
| 地址操作 | 8 | 0 | 0 | 100% |
| ABI | 6 | 0 | 0 | 100% |
| 类型信息 | 6 | 0 | 0 | 100% |
| 合约创建 | 3 | 0 | 0 | 100% |
| 单位 | 8 | 0 | 0 | 100% |
| 其他 | 5 | 0 | 0 | 100% |
| **总计** | **132** | **0** | **0** | **100%** |

---

## 参考资料

- [Solidity 官方文档](https://docs.soliditylang.org/)
- [EVM Opcodes](https://www.evm.codes/)
- [EIP-1153: Transient Storage](https://eips.ethereum.org/EIPS/eip-1153)
