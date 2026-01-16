# 示例指南

本文档介绍 ts-to-yul 项目中的各个示例。

## 基础示例

### Counter (`examples/counter.ts`)

最简单的合约示例，演示基本的存储和函数。

```typescript
import { u256, storage } from "../runtime/index.js";

export class Counter {
  @storage value: u256 = 0n;

  public increment(): void {
    this.value = this.value + 1n;
  }

  public get(): u256 {
    return this.value;
  }
}
```

**编译运行**:

```bash
node dist/cli.js build examples/counter.ts -O -o counter.hex
```

### Token (`examples/token.ts`)

基础 ERC20 代币实现，演示 Mapping 和事件。

**功能**:

- `balanceOf(address)` - 查询余额
- `transfer(address, uint256)` - 转账
- `approve(address, uint256)` - 授权
- `transferFrom(address, address, uint256)` - 代理转账

### Storage (`examples/storage.ts`)

存储变量演示，展示不同类型的存储。

### Payable Vault (`examples/payable-vault.ts`)

可支付金库，演示 `@payable` 装饰器和 ETH 处理。

```typescript
@payable
public deposit(): void {
  this.balances[msg.sender] = this.balances[msg.sender] + msg.value;
}
```

## DeFi 协议示例

### UniswapV2 (`examples/uniswapv2/`)

Uniswap V2 AMM (自动做市商) 实现。

**文件结构**:

```
examples/uniswapv2/
├── src/
│   ├── UniswapV2Pair.ts      # 交易对合约
│   ├── UniswapV2ERC20.ts     # LP 代币
│   ├── UniswapV2Router.ts    # 路由器
│   └── libraries/
│       └── Math.ts           # 数学库
├── test/
│   └── UniswapV2Pair.t.sol   # Foundry 测试
└── foundry.toml
```

**核心功能**:

- `mint()` - 添加流动性，铸造 LP 代币
- `burn()` - 移除流动性，销毁 LP 代币
- `swap()` - 代币交换
- `getReserves()` - 获取储备量

**运行测试**:

```bash
cd examples/uniswapv2
node ../../dist/cli.js build src/UniswapV2Pair.ts -O -o bytecode.hex
forge test -vv
```

### UniswapV3 (`examples/uniswapv3/`)

Uniswap V3 集中流动性实现，演示有符号整数处理。

**文件结构**:

```
examples/uniswapv3/
├── src/
│   ├── UniswapV3Pool.ts      # 流动性池
│   └── libraries/
│       ├── TickMath.ts       # Tick 数学
│       └── SqrtPriceMath.ts  # 价格计算
├── test/
│   └── UniswapV3Pool.t.sol   # Foundry 测试
└── foundry.toml
```

**核心功能**:

- `mint()` - 在指定价格区间添加流动性
- `burn()` - 移除流动性
- `swap()` - 代币交换
- `collect()` - 收集手续费

**有符号整数使用**:

```typescript
@storage tick: i32 = 0;  // 当前价格 tick (可为负)

// 有符号比较
if (tick < tickLower) { ... }
if (tick > tickUpper) { ... }
```

**运行测试**:

```bash
cd examples/uniswapv3
node ../../dist/cli.js build src/UniswapV3Pool.ts -O -o bytecode.hex
forge test -vv
```

### Compound (`examples/compound/`)

Compound cToken 借贷协议实现。

**文件结构**:

```
examples/compound/
├── src/
│   ├── CToken.ts             # cToken 合约
│   └── ICToken.sol           # Solidity 接口
├── test/
│   └── CToken.t.sol          # 40 个测试
└── foundry.toml
```

**核心功能**:

- `mint(amount)` - 存款，铸造 cToken
- `redeem(tokens)` - 赎回 cToken
- `borrow(amount)` - 借款
- `repayBorrow(amount)` - 还款
- `liquidateBorrow(borrower, amount)` - 清算
- `accrueInterest()` - 计算利息

**关键参数**:
| 参数 | 值 | 说明 |
|------|-----|------|
| 初始汇率 | 0.02 | 1 cToken = 0.02 underlying |
| 抵押率 | 75% | 最大借款 = 75% 抵押品 |
| 储备金率 | 10% | 协议抽取 10% 利息 |
| 清算奖励 | 8% | 清算人获得 8% 奖励 |

**汇率计算**:

```
exchangeRate = (totalCash + totalBorrows - totalReserves) / totalSupply
```

**运行测试**:

```bash
cd examples/compound
node ../../dist/cli.js build src/CToken.ts -O -o bytecode.hex
forge test -vv
```

## 测试方法

所有 DeFi 示例使用 Foundry 进行测试。

### 测试结构

```solidity
contract CTokenTest is Test {
    ICToken cToken;

    function setUp() public {
        // 读取编译后的字节码
        string memory hexStr = vm.readFile("bytecode.hex");
        bytes memory code = vm.parseBytes(hexStr);

        // 部署合约
        address deployed;
        assembly {
            deployed := create(0, add(code, 0x20), mload(code))
        }
        cToken = ICToken(deployed);
    }

    function test_Mint() public {
        cToken.mint(100e18);
        assertGt(cToken.balanceOf(address(this)), 0);
    }
}
```

### 运行测试

```bash
# 单个测试
forge test --match-test test_Mint -vvv

# 所有测试
forge test -vv

# Fuzz 测试
forge test --match-test testFuzz -vv
```

## 创建新示例

1. 创建 TypeScript 合约文件
2. 创建 Foundry 项目结构
3. 编写 Solidity 接口
4. 编写测试用例
5. 配置 `foundry.toml`

**foundry.toml 模板**:

```toml
[profile.default]
src = "src"
out = "out"
libs = ["lib"]
solc = "0.8.20"
optimizer = true
optimizer_runs = 200
ffi = true
fs_permissions = [{ access = "read", path = "./" }]

[fuzz]
runs = 256
```
