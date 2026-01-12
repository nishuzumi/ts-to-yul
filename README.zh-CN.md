# ts-to-yul

[English](README.md) | [中文](README.zh-CN.md)

> 用 TypeScript 编写以太坊智能合约，编译到 Yul，生成 EVM 字节码。

由 Box 和 Claude 共同打造

```
TypeScript 合约 → [ts-to-yul] → Yul 代码 → [solc] → EVM 字节码
```

## 特性

- **TypeScript 语法** - 使用熟悉的 TypeScript 类语法编写合约
- **完整类型系统** - 支持 `u256`、`i256`、`address`、`bytes32` 等所有 EVM 类型
- **存储装饰器** - `@storage`、`@transient`、`@immutable`、`@slot` 状态管理
- **函数修饰符** - `@view`、`@pure`、`@payable`、`@virtual`、`@override`
- **多重继承** - `extends Mixin(A, B, C)` 支持菱形继承
- **Mapping 支持** - 嵌套映射和复杂数据结构
- **事件系统** - `@event` 装饰器配合 `indexed` 参数
- **自定义错误** - `declare function ErrorName(...): never`
- **132 个 Solidity 特性** - 100% 覆盖 Solidity 语言特性

## 安装

```bash
pnpm add ts-to-yul
# 或
npm install ts-to-yul
```

**环境要求：**
- Node.js >= 20
- solc（用于字节码编译）

## 快速开始

### 1. 编写合约

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

### 2. 编译到 Yul

```bash
ts-to-yul compile counter.ts -o counter.yul
```

### 3. 编译到字节码

```bash
ts-to-yul build counter.ts -O -o counter.hex
```

## 类型系统

| TypeScript | EVM | 说明 |
|------------|-----|------|
| `u256`, `u128`, `u64`, `u32`, `u8` | 无符号整数 | 不同位宽 |
| `i256`, `i128`, `i64`, `i32`, `i8` | 有符号整数 | 支持负数 |
| `address`, `addressPayable` | 地址 | 20 字节 |
| `bytes32`, `bytes20`, `bytes4` | 固定字节 | 固定长度 |
| `bool` | 布尔值 | true/false |
| `Mapping<K, V>` | 映射 | 键值存储 |
| `StorageArray<T>` | 动态数组 | push/pop/length |
| `CalldataArray<T>` | Calldata 数组 | length/index/slice |
| `interface` | 结构体 | 复合类型 |

## 装饰器

```typescript
// 存储相关
@storage       // 持久存储变量
@transient     // EIP-1153 瞬态存储
@immutable     // 不可变变量（构造函数中设置）
@constant      // 编译时常量
@slot(n)       // 自定义存储槽

// 函数相关
@payable       // 可接收 ETH
@view          // 只读（不修改状态）
@pure          // 纯函数（无状态访问）
@virtual       // 可被子类覆盖
@override      // 覆盖父类方法
@internal      // 不暴露在 ABI 中
@external      // 显式暴露在 ABI 中

// 事件相关
@event         // 事件声明
@anonymous     // 匿名事件
```

## 内置对象

```typescript
// 交易上下文
msg.sender     // 调用者地址
msg.value      // 发送的 ETH 数量（wei）
msg.data       // 调用数据
msg.sig        // 函数选择器

// 区块上下文
block.timestamp  // 区块时间戳
block.number     // 区块号
block.chainid    // 链 ID
block.coinbase   // 矿工地址
block.basefee    // 基础费用
block.prevrandao // 前一个 RANDAO 值

// 交易信息
tx.origin      // 原始发送者
tx.gasprice    // Gas 价格

// 控制流
require(cond, "message")  // 条件检查
revert("message")         // 回滚交易
assert(cond)              // 断言

// 密码学函数
keccak256(data)    // Keccak-256 哈希
sha256(data)       // SHA-256 哈希
ecrecover(...)     // ECDSA 恢复

// ABI 编码
abi.encode(...)           // 标准 ABI 编码
abi.encodePacked(...)     // 紧凑编码
abi.encodeWithSelector(...)
abi.encodeWithSignature(...)
abi.decode(data, Type)    // 解码数据

// 地址操作
address.balance    // ETH 余额
address.code       // 合约字节码
address.codehash   // 代码哈希
address.transfer(amount)  // 转账 ETH（失败时回滚）
address.send(amount)      // 转账 ETH（返回 bool）

// 外部调用
call.call<T>(target, sig, args)        // 外部调用
call.staticcall<T>(target, sig, args)  // 静态调用
call.delegatecall<T>(target, sig, args) // 委托调用

// 合约创建
new Contract()                    // 部署合约
new Contract({ value: x })        // 带 ETH 部署
new Contract({ salt: s })         // CREATE2 部署
```

## 高级特性

### 多重继承

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
    // 额外逻辑
  }
}
```

### 事件

```typescript
interface TransferEvent {
  from: indexed<address>;
  to: indexed<address>;
  value: u256;
}

export class Token {
  @event Transfer: Event<TransferEvent>;

  public transfer(to: address, amount: u256): void {
    // ... 转账逻辑
    this.Transfer.emit({ from: msg.sender, to, value: amount });
  }
}
```

### 自定义错误

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

### 通过接口进行外部调用

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

### 内联汇编

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

### 瞬态存储 (EIP-1153)

```typescript
export class ReentrancyGuard {
  @transient locked: bool = false;

  public nonReentrant(): void {
    require(!this.locked, "Reentrancy");
    this.locked = true;
    // ... 函数体
    this.locked = false;
  }
}
```

## 示例项目

### 特性展示

| 示例 | 说明 | 测试 |
|------|------|------|
| `examples/showcase/` | 132 个 Solidity 特性演示 | Foundry 测试 |

### 基础示例

| 示例 | 说明 |
|------|------|
| `examples/counter.ts` | 简单计数器 |
| `examples/token.ts` | 基础 ERC20 代币 |
| `examples/erc20-mapping.ts` | 带映射的 ERC20 |
| `examples/storage.ts` | 存储变量演示 |
| `examples/payable-vault.ts` | 可支付金库 |

### DeFi 协议

| 示例 | 说明 | 测试 |
|------|------|------|
| `examples/uniswapv2/` | Uniswap V2 AMM (Pair + Router) | Foundry 测试 |
| `examples/uniswapv3/` | Uniswap V3 集中流动性 | Foundry 测试 |
| `examples/compound/` | Compound cToken 借贷 | - |

### 运行示例测试

```bash
# Showcase（所有 Solidity 特性）
cd examples/showcase && forge test

# UniswapV2
cd examples/uniswapv2 && forge test

# UniswapV3
cd examples/uniswapv3 && forge test
```

## 架构

```
┌─────────────────────────────────────────────────────────────┐
│                         ts-to-yul                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────┐   ┌──────────┐   ┌───────────┐   ┌─────────┐ │
│  │  Parser  │ → │ Analyzer │ → │Transformer│ → │ Printer │ │
│  │(ts-morph)│   │  (语义)  │   │           │   │         │ │
│  └──────────┘   └──────────┘   └───────────┘   └─────────┘ │
│       │              │              │              │        │
│       ▼              ▼              ▼              ▼        │
│   TS AST        ContractInfo     Yul AST       Yul 文本    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

| 模块 | 文件 | 职责 |
|------|------|------|
| Parser | `src/parser/` | 通过 ts-morph 解析 TypeScript |
| Analyzer | `src/analyzer/` | 语义分析、存储槽分配 |
| Transformer | `src/transformer/` | TS AST → Yul AST 转换 |
| Printer | `src/yul/printer.ts` | Yul AST → 格式化文本 |
| EVM Types | `src/evm/types.ts` | EVM 类型系统 |
| EVM Builtins | `src/evm/builtins.ts` | 73 个 EVM 操作码定义 |
| ABI | `src/evm/abi.ts` | 函数选择器计算、ABI 编码 |

详见 [docs/architecture.md](docs/architecture.md)。

## 开发

```bash
pnpm install          # 安装依赖
pnpm build            # 构建项目
pnpm dev              # 开发模式（监听）

pnpm test             # 运行所有测试（288 个）
pnpm test:unit        # 单元测试
pnpm test:integration # 集成测试

pnpm typecheck        # 类型检查
pnpm lint             # ESLint 检查
pnpm format           # Prettier 格式化
```

### 测试覆盖

| 分类 | 测试数 |
|------|--------|
| 类型系统 | 19 |
| 控制流 | 17 |
| 引用类型 | 14 |
| 内联汇编 | 13 |
| Unchecked 算术 | 12 |
| 外部调用 | 11 |
| 事件 | 11 |
| 修饰符 | 11 |
| Calldata 数组 | 11 |
| ABI 编码 | 11 |
| 合约创建 | 10 |
| Bytes 拼接 | 10 |
| 继承 | 8 |
| 其他... | ... |
| **总计** | **288** |

## 文档

- [架构设计](docs/architecture.md) - 编译器内部结构
- [类型系统](docs/type-system.md) - 类型映射和语义
- [Solidity 对比](docs/solidity-comparison.md) - 特性覆盖（132 特性，100%）
- [示例指南](docs/examples.md) - 示例项目详解

## Solidity 特性覆盖

ts-to-yul 实现了 **132 个 Solidity 语言特性**，覆盖率 **100%**：

| 分类 | 特性数 |
|------|--------|
| 值类型 | 10 |
| 引用类型 | 7 |
| 全局变量 | 18 |
| 合约结构 | 14 |
| 继承 | 9 |
| 事件/错误 | 10 |
| 控制结构 | 9 |
| 运算符 | 18 |
| 地址操作 | 8 |
| ABI 编码 | 6 |
| 类型信息 | 6 |
| 合约创建 | 3 |
| 单位 | 8 |
| 其他特性 | 5 |

详见 [docs/solidity-comparison.md](docs/solidity-comparison.md) 完整特性矩阵。

## 作者

**Box**

## 许可证

MIT License - 详见 [LICENSE](LICENSE)
