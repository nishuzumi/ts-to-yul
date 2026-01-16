# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

ts-to-yul 是一个将 TypeScript 智能合约编译为 Yul 中间语言的编译器，目标平台是以太坊虚拟机（EVM）。

编译流水线：`TypeScript 源码 → [ts-to-yul] → Yul 代码 → [solc] → EVM 字节码`

**当前状态**：

- 132 个 Solidity 特性，100% 覆盖率
- 288 个单元测试，全部通过
- 26 个测试文件

## 构建命令

```bash
pnpm install              # 安装依赖
pnpm build                # 构建项目
pnpm dev                  # 开发模式（监听）

pnpm typecheck            # 类型检查
pnpm lint                 # ESLint 检查
pnpm format               # Prettier 格式化

pnpm test                 # 运行所有测试 (288 tests)
pnpm test:unit            # 单元测试
pnpm test:integration     # 集成测试
pnpm test:e2e             # E2E 测试（需要 Anvil）
```

## 架构

```
TypeScript 源码 → Parser → Analyzer → Transformer → Printer → Yul 代码
                    ↓          ↓           ↓            ↓
               ts-morph   ContractInfo   YulObject   Yul Text
```

### 核心模块

| 模块          | 文件                       | 职责                                    |
| ------------- | -------------------------- | --------------------------------------- |
| Parser        | `src/parser/index.ts`      | 使用 ts-morph 解析 TypeScript           |
| Analyzer      | `src/analyzer/index.ts`    | 语义分析、存储槽分配、函数选择器计算    |
| Transformer   | `src/transformer/index.ts` | TS AST → Yul AST 转换（核心，~9000 行） |
| Printer       | `src/yul/printer.ts`       | Yul AST → 格式化文本                    |
| Yul AST       | `src/yul/ast.ts`           | Yul AST 节点定义（兼容 Libyul）         |
| EVM Types     | `src/evm/types.ts`         | EVM 类型系统、类型映射                  |
| EVM Builtins  | `src/evm/builtins.ts`      | 73 个 EVM 操作码定义                    |
| ABI Generator | `src/evm/abiGenerator.ts`  | ABI JSON 生成                           |
| ABI           | `src/evm/abi.ts`           | 函数选择器计算、ABI 编码                |
| Solc          | `src/solc.ts`              | solc 子进程调用                         |
| CLI           | `src/cli.ts`               | 命令行接口                              |

### 关键设计模式

- **存储变量**：使用 `@storage` 装饰器标记，自动分配 slot
- **瞬态存储**：使用 `@transient` 装饰器，EIP-1153 tload/tstore
- **函数选择器**：通过 `keccak256(signature)[0:4]` 计算
- **调度器**：`switch shr(224, calldataload(0))` 路由到对应函数
- **合约结构**：`export class ContractName { ... }` 形式
- **动态 Helper 生成**：按需生成 `__call_N`、`__abi_encode_N` 等辅助函数

## 目录结构

```
src/
├── index.ts              # 公共 API
├── cli.ts                # CLI 入口
├── compiler.ts           # 编译器主流程
├── solc.ts               # solc 集成
├── parser/               # TypeScript 解析
├── analyzer/             # 语义分析
├── transformer/          # AST 转换（核心逻辑）
├── yul/                  # Yul AST 和打印
│   ├── ast.ts            # Yul AST 类型定义
│   └── printer.ts        # Yul 代码生成
└── evm/                  # EVM 类型和操作码
    ├── types.ts          # 类型系统
    ├── builtins.ts       # EVM 操作码
    ├── abi.ts            # ABI 编码
    └── abiGenerator.ts   # ABI JSON 生成

runtime/                  # 用户导入的运行时类型
examples/                 # 示例合约
├── showcase/             # 132 特性展示
├── uniswapv2/            # Uniswap V2 实现
├── uniswapv3/            # Uniswap V3 实现
└── compound/             # Compound 实现
tests/
├── unit/                 # 单元测试 (26 文件, 288 测试)
└── integration/          # 集成测试
docs/                     # 文档
├── architecture.md       # 架构设计
├── type-system.md        # 类型系统
├── solidity-comparison.md # Solidity 特性对比
└── examples.md           # 示例指南
```

## 测试分类

| 测试文件                  | 测试数 | 描述               |
| ------------------------- | ------ | ------------------ |
| validation.test.ts        | 41     | 输入验证           |
| types.test.ts             | 19     | 类型系统           |
| globals.test.ts           | 18     | 全局变量/函数      |
| control-flow.test.ts      | 17     | 控制流             |
| reference-types.test.ts   | 14     | 引用类型           |
| asm.test.ts               | 13     | 内联汇编           |
| unchecked.test.ts         | 12     | unchecked 算术     |
| external-calls.test.ts    | 11     | 外部调用           |
| events.test.ts            | 11     | 事件               |
| modifiers.test.ts         | 11     | 修饰符             |
| calldata-array.test.ts    | 11     | Calldata 数组      |
| abi.test.ts               | 11     | ABI 编码           |
| bytes-concat.test.ts      | 10     | bytes.concat       |
| contract-creation.test.ts | 10     | 合约创建           |
| 其他                      | 79     | 继承、地址、错误等 |

## 关键实现细节

### Transformer 核心方法

- `transform()` - 入口，生成完整 Yul Object
- `generateDeployedCode()` - 生成运行时代码
- `generateDispatcher()` - 函数选择器路由
- `transformExpression()` - 表达式转换
- `transformStatement()` - 语句转换
- `generateTypedExternalCall()` - 类型化外部调用
- `generateCallNHelper()` - 动态生成外部调用辅助函数

### 动态 Helper 机制

编译器按需生成辅助函数，避免代码膨胀：

```typescript
private generatedCallHelpers: Set<number> = new Set();

private generateTypedExternalCall(...) {
  const n = args.length;
  if (!this.generatedCallHelpers.has(n)) {
    this.generatedCallHelpers.add(n);
    this.dynamicHelpers.push(this.generateCallNHelper(n));
  }
  // ...
}
```

### 类型上下文

`TypeContext` 接口用于解析自定义类型：

```typescript
interface TypeContext {
  isEnum?: (name: string) => boolean;
  getStructType?: (name: string) => EvmType | null;
}
```

## 常见开发任务

### 添加新的内置函数

1. 在 `src/evm/builtins.ts` 添加操作码定义
2. 在 `src/transformer/index.ts` 的 `transformCallExpression()` 添加处理
3. 添加测试到 `tests/unit/` 相应文件

### 添加新的装饰器

1. 在 `src/transformer/index.ts` 解析装饰器
2. 在 `src/analyzer/index.ts` 分析装饰器（如需要）
3. 更新运行时类型 `runtime/index.ts`
4. 添加测试

### 调试编译输出

```bash
# 查看生成的 Yul 代码
ts-to-yul compile examples/counter.ts

# 带优化编译到字节码
ts-to-yul build examples/counter.ts -O
```
