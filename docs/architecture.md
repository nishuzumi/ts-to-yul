# 架构设计

本文档详细描述 ts-to-yul 编译器的内部架构。

## 编译流水线

```
TypeScript 源码 → Parser → Analyzer → Transformer → Printer → Yul 代码 → solc → EVM 字节码
```

### 数据流

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Parser    │     │  Analyzer   │     │ Transformer │     │   Printer   │
│             │     │             │     │             │     │             │
│  ts-morph   │ ──▶ │ContractInfo │ ──▶ │  YulObject  │ ──▶ │  Yul Text   │
│             │     │             │     │             │     │             │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
      │                   │                   │                   │
      ▼                   ▼                   ▼                   ▼
   TS AST            存储槽分配           Yul AST              格式化输出
                     函数选择器
                     类型信息
```

## 模块职责

### 1. Parser (`src/parser/index.ts`)

使用 ts-morph 解析 TypeScript 源码，提取合约类信息。

**输入**: TypeScript 源码字符串
**输出**: ts-morph SourceFile

```typescript
export class Parser {
  parse(source: string): SourceFile;
  getContracts(sourceFile: SourceFile): ClassDeclaration[];
}
```

**关键功能**:

- 解析导出的类作为合约
- 提取类属性和方法
- 解析装饰器 (`@storage`, `@view`, `@payable`)

### 2. Analyzer (`src/analyzer/index.ts`)

语义分析阶段，生成合约元数据。

**输入**: ts-morph ClassDeclaration
**输出**: ContractInfo

```typescript
interface ContractInfo {
  name: string;
  storageVariables: StorageVariable[];
  functions: FunctionInfo[];
  hasConstructor: boolean;
}

interface StorageVariable {
  name: string;
  type: string;
  slot: bigint;
  isMapping: boolean;
}

interface FunctionInfo {
  name: string;
  selector: string; // 4 bytes hex
  params: Parameter[];
  returnType: string | null;
  visibility: "public" | "private";
  mutability: "pure" | "view" | "nonpayable" | "payable";
}
```

**关键功能**:

- 自动分配存储槽 (slot)
- 计算函数选择器 (keccak256)
- 解析函数签名
- 类型推断

### 3. Transformer (`src/transformer/index.ts`)

将 TypeScript AST 转换为 Yul AST。

**输入**: ContractInfo + ts-morph AST
**输出**: YulObject

**关键转换**:

| TypeScript          | Yul                           |
| ------------------- | ----------------------------- |
| `this.field`        | `sload(slot)`                 |
| `this.field = x`    | `sstore(slot, x)`             |
| `this.mapping[key]` | `sload(keccak256(key, slot))` |
| `msg.sender`        | `caller()`                    |
| `msg.value`         | `callvalue()`                 |
| `block.number`      | `number()`                    |
| `a + b`             | `add(a, b)`                   |
| `a - b` (signed)    | `sub(a, b)` with `slt`/`sgt`  |
| `if (cond)`         | `if cond { ... }`             |
| `for (...)`         | `for { } cond { } { }`        |
| `revert("msg")`     | `revert(offset, size)`        |

**函数调度器生成**:

```yul
switch shr(224, calldataload(0))
case 0x12345678 { fn_increment() }
case 0xabcdef12 { fn_get() }
default { revert(0, 0) }
```

### 4. Printer (`src/yul/printer.ts`)

将 Yul AST 转换为格式化的 Yul 代码文本。

**输入**: YulObject
**输出**: 格式化的 Yul 代码字符串

**输出格式**:

```yul
object "Counter" {
    code {
        // 部署代码
        datacopy(0, dataoffset("Counter_deployed"), datasize("Counter_deployed"))
        return(0, datasize("Counter_deployed"))
    }
    object "Counter_deployed" {
        code {
            // 运行时代码
            switch shr(224, calldataload(0))
            case 0x... { ... }
            default { revert(0, 0) }
        }
    }
}
```

## Yul AST 定义

完整的 Yul AST 节点定义位于 `src/yul/ast.ts`:

```typescript
type YulExpression =
  | { kind: "literal"; value: string | bigint }
  | { kind: "identifier"; name: string }
  | { kind: "functionCall"; name: string; args: YulExpression[] };

type YulStatement =
  | { kind: "block"; statements: YulStatement[] }
  | { kind: "variableDeclaration"; names: string[]; value?: YulExpression }
  | { kind: "assignment"; names: string[]; value: YulExpression }
  | { kind: "if"; condition: YulExpression; body: YulStatement[] }
  | { kind: "switch"; expr: YulExpression; cases: YulCase[]; default?: YulStatement[] }
  | {
      kind: "for";
      pre: YulStatement[];
      cond: YulExpression;
      post: YulStatement[];
      body: YulStatement[];
    }
  | { kind: "function"; name: string; params: string[]; returns: string[]; body: YulStatement[] }
  | { kind: "leave" }
  | { kind: "break" }
  | { kind: "continue" }
  | { kind: "expression"; expr: YulExpression };

interface YulObject {
  name: string;
  code: YulStatement[];
  subObjects: YulObject[];
}
```

## 存储布局

### 简单变量

每个 `@storage` 变量分配一个独立的 slot:

```typescript
@storage value: u256 = 0n;   // slot 0
@storage owner: address;      // slot 1
@storage total: u256 = 0n;   // slot 2
```

### Mapping

Mapping 使用 keccak256 计算存储位置:

```typescript
@storage balances: Mapping<address, u256>;  // slot 0

// balances[addr] 的存储位置:
// keccak256(abi.encode(addr, 0))
```

### 嵌套 Mapping

```typescript
@storage allowances: Mapping<address, Mapping<address, u256>>;  // slot 0

// allowances[owner][spender] 的存储位置:
// keccak256(abi.encode(spender, keccak256(abi.encode(owner, 0))))
```

## 函数选择器

函数选择器通过 keccak256 计算:

```typescript
selector = keccak256("functionName(type1,type2)")[0:4]

// 示例
increment()     → keccak256("increment()")[0:4]
transfer(address,uint256) → keccak256("transfer(address,uint256)")[0:4]
```

## 有符号整数处理

有符号整数 (`i256`, `i128`, etc.) 使用 EVM 的有符号操作码:

| 操作 | 无符号 | 有符号 |
| ---- | ------ | ------ |
| 除法 | `div`  | `sdiv` |
| 取模 | `mod`  | `smod` |
| 小于 | `lt`   | `slt`  |
| 大于 | `gt`   | `sgt`  |
| 右移 | `shr`  | `sar`  |

## 目录结构

```
src/
├── index.ts              # 公共 API
├── cli.ts                # CLI 入口
├── compiler.ts           # 编译器主流程
├── solc.ts               # solc 集成
│
├── parser/
│   └── index.ts          # TypeScript 解析
│
├── analyzer/
│   └── index.ts          # 语义分析
│
├── transformer/
│   └── index.ts          # AST 转换
│
├── yul/
│   ├── ast.ts            # Yul AST 定义
│   └── printer.ts        # Yul 代码生成
│
└── evm/
    ├── types.ts          # EVM 类型定义
    ├── builtins.ts       # 73 个 EVM 操作码
    ├── abi.ts            # ABI 编码
    └── abiGenerator.ts   # ABI 生成

runtime/
└── index.ts              # 用户导入的运行时类型
```

## 扩展点

### 添加新的 EVM 类型

1. 在 `src/evm/types.ts` 添加类型定义
2. 在 `runtime/index.ts` 导出类型别名
3. 在 `src/transformer/index.ts` 添加转换逻辑

### 添加新的内置函数

1. 在 `src/evm/builtins.ts` 添加操作码定义
2. 在 `src/transformer/index.ts` 添加调用转换

### 添加新的装饰器

1. 在 `runtime/index.ts` 添加装饰器定义
2. 在 `src/analyzer/index.ts` 解析装饰器
3. 在 `src/transformer/index.ts` 处理装饰器语义
