// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/IUniswapV3Pool.sol";

/**
 * @title UniswapV3PoolTest
 * @notice Tests for the simplified UniswapV3Pool implementation
 * @dev Based on official Uniswap V3 tests:
 *      https://github.com/Uniswap/v3-core/blob/main/test/UniswapV3Pool.spec.ts
 */
contract UniswapV3PoolTest is Test {
    IUniswapV3Pool pool;

    // Q96 = 2^96 (price = 1.0)
    uint160 constant Q96 = 79228162514264337593543950336;

    // Tick boundaries
    int24 constant MIN_TICK = -887272;
    int24 constant MAX_TICK = 887272;

    // Common tick values for testing
    int24 constant TICK_LOWER = -100;
    int24 constant TICK_UPPER = 100;

    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    function setUp() public {
        // Deploy pool from bytecode
        string memory hexStr = vm.readFile("bytecode.hex");
        bytes memory code = vm.parseBytes(hexStr);
        address deployed;
        assembly {
            deployed := create(0, add(code, 0x20), mload(code))
        }
        require(deployed != address(0), "Deploy failed");
        pool = IUniswapV3Pool(deployed);
    }

    // ============ Initialization Tests ============

    function test_Initialize() public {
        // Initialize at price = 1.0
        uint256 result = pool.initialize(Q96);
        assertEq(result, 1);

        (uint160 sqrtPriceX96, int24 tick, uint256 fee) = pool.slot0();
        assertEq(sqrtPriceX96, Q96);
        assertEq(tick, 0);
        assertEq(fee, 3000); // 0.3%
    }

    function test_InitializeAtDifferentPrice() public {
        // Initialize at price = 4.0 (sqrtPrice = 2)
        uint160 sqrtPrice2 = Q96 * 2;
        pool.initialize(sqrtPrice2);

        (uint160 sqrtPriceX96, int24 tick,) = pool.slot0();
        assertEq(sqrtPriceX96, sqrtPrice2);
        assertGt(tick, 0); // Tick should be positive for price > 1
    }

    function test_RevertWhen_InitializeTwice() public {
        pool.initialize(Q96);

        vm.expectRevert();
        pool.initialize(Q96);
    }

    function test_RevertWhen_InitializeWithZeroPrice() public {
        vm.expectRevert();
        pool.initialize(0);
    }

    // ============ Mint Tests ============

    function test_Mint() public {
        pool.initialize(Q96);

        vm.prank(alice);
        (uint256 amount0, uint256 amount1) = pool.mint(TICK_LOWER, TICK_UPPER, 1000e18);

        // Current price is in range, so both amounts should be non-zero
        assertGt(amount0, 0);
        assertGt(amount1, 0);

        // Check position was recorded
        (uint128 liquidity, int24 tickLower, int24 tickUpper) = pool.getPosition(alice);
        assertEq(liquidity, 1000e18);
        assertEq(tickLower, TICK_LOWER);
        assertEq(tickUpper, TICK_UPPER);
    }

    function test_MintUpdatesLiquidity() public {
        pool.initialize(Q96);

        uint128 initialLiquidity = pool.getLiquidity();
        assertEq(initialLiquidity, 0);

        vm.prank(alice);
        pool.mint(TICK_LOWER, TICK_UPPER, 1000e18);

        uint128 newLiquidity = pool.getLiquidity();
        assertEq(newLiquidity, 1000e18);
    }

    function test_MintBelowRange() public {
        // Initialize at price = 1.0 (tick = 0)
        pool.initialize(Q96);

        // Mint position entirely below current tick (ticks -200 to -150)
        // Current tick 0 is ABOVE the position, so we need token1
        vm.prank(alice);
        (uint256 amount0, uint256 amount1) = pool.mint(-200, -150, 1000e18);

        // Position below current price: only token1 needed
        assertEq(amount0, 0);
        assertGt(amount1, 0);

        // Liquidity should not increase (position not in range)
        assertEq(pool.getLiquidity(), 0);
    }

    function test_MintAboveRange() public {
        // Initialize at price = 1.0 (tick = 0)
        pool.initialize(Q96);

        // Mint position entirely above current tick (ticks 150 to 200)
        // Current tick 0 is BELOW the position, so we need token0
        vm.prank(alice);
        (uint256 amount0, uint256 amount1) = pool.mint(150, 200, 1000e18);

        // Position above current price: only token0 needed
        assertGt(amount0, 0);
        assertEq(amount1, 0);

        // Liquidity should not increase (position not in range)
        assertEq(pool.getLiquidity(), 0);
    }

    function test_RevertWhen_MintNotInitialized() public {
        vm.expectRevert();
        pool.mint(TICK_LOWER, TICK_UPPER, 1000e18);
    }

    function test_RevertWhen_MintInvalidTickRange() public {
        pool.initialize(Q96);

        // tickLower >= tickUpper
        vm.expectRevert();
        pool.mint(100, 100, 1000e18);

        vm.expectRevert();
        pool.mint(100, 50, 1000e18);
    }

    function test_RevertWhen_MintTickTooLow() public {
        pool.initialize(Q96);

        vm.expectRevert();
        pool.mint(MIN_TICK - 1, 100, 1000e18);
    }

    function test_RevertWhen_MintTickTooHigh() public {
        pool.initialize(Q96);

        vm.expectRevert();
        pool.mint(-100, MAX_TICK + 1, 1000e18);
    }

    function test_RevertWhen_MintZeroLiquidity() public {
        pool.initialize(Q96);

        vm.expectRevert();
        pool.mint(TICK_LOWER, TICK_UPPER, 0);
    }

    // ============ Burn Tests ============

    function test_Burn() public {
        pool.initialize(Q96);

        vm.startPrank(alice);
        pool.mint(TICK_LOWER, TICK_UPPER, 1000e18);

        (uint256 amount0, uint256 amount1) = pool.burn(500e18);
        vm.stopPrank();

        assertGt(amount0, 0);
        assertGt(amount1, 0);

        (uint128 liquidity,,) = pool.getPosition(alice);
        assertEq(liquidity, 500e18);
    }

    function test_BurnAll() public {
        pool.initialize(Q96);

        vm.startPrank(alice);
        pool.mint(TICK_LOWER, TICK_UPPER, 1000e18);
        pool.burn(1000e18);
        vm.stopPrank();

        (uint128 liquidity,,) = pool.getPosition(alice);
        assertEq(liquidity, 0);
        assertEq(pool.getLiquidity(), 0);
    }

    function test_RevertWhen_BurnTooMuch() public {
        pool.initialize(Q96);

        vm.startPrank(alice);
        pool.mint(TICK_LOWER, TICK_UPPER, 1000e18);

        vm.expectRevert();
        pool.burn(1001e18);
        vm.stopPrank();
    }

    // ============ Swap Tests ============

    function test_SwapExact0For1() public {
        pool.initialize(Q96);

        vm.prank(alice);
        pool.mint(TICK_LOWER, TICK_UPPER, 1000e18);

        // Swap token0 for token1
        // sqrtPriceLimitX96 < current price (swapping pushes price down)
        uint160 sqrtPriceLimit = Q96 / 2; // Allow price to drop to 0.25

        vm.prank(bob);
        uint256 amountOut = pool.swapExact0For1(1e18, sqrtPriceLimit);

        assertGt(amountOut, 0);

        // Price should have decreased
        (uint160 newSqrtPrice,,) = pool.slot0();
        assertLt(newSqrtPrice, Q96);
    }

    function test_SwapExact1For0() public {
        pool.initialize(Q96);

        vm.prank(alice);
        pool.mint(TICK_LOWER, TICK_UPPER, 1000e18);

        // Swap token1 for token0
        // sqrtPriceLimitX96 > current price (swapping pushes price up)
        uint160 sqrtPriceLimit = Q96 * 2; // Allow price to rise to 4

        vm.prank(bob);
        uint256 amountOut = pool.swapExact1For0(1e18, sqrtPriceLimit);

        assertGt(amountOut, 0);

        // Price should have increased
        (uint160 newSqrtPrice,,) = pool.slot0();
        assertGt(newSqrtPrice, Q96);
    }

    function test_SwapUpdatesFeeGrowth() public {
        pool.initialize(Q96);

        vm.prank(alice);
        pool.mint(TICK_LOWER, TICK_UPPER, 1000e18);

        (uint256 feeGrowth0Before, uint256 feeGrowth1Before) = pool.getFeeGrowthGlobal();
        assertEq(feeGrowth0Before, 0);
        assertEq(feeGrowth1Before, 0);

        // Swap token0 for token1
        vm.prank(bob);
        pool.swapExact0For1(10e18, Q96 / 2);

        (uint256 feeGrowth0After,) = pool.getFeeGrowthGlobal();
        assertGt(feeGrowth0After, 0); // Fee growth for token0 should increase
    }

    function test_RevertWhen_SwapNotInitialized() public {
        vm.expectRevert();
        pool.swapExact0For1(1e18, Q96 / 2);
    }

    function test_RevertWhen_SwapZeroAmount() public {
        pool.initialize(Q96);

        vm.prank(alice);
        pool.mint(TICK_LOWER, TICK_UPPER, 1000e18);

        vm.expectRevert();
        pool.swapExact0For1(0, Q96 / 2);
    }

    function test_RevertWhen_SwapNoLiquidity() public {
        pool.initialize(Q96);

        vm.expectRevert();
        pool.swapExact0For1(1e18, Q96 / 2);
    }

    function test_RevertWhen_Swap0For1InvalidPriceLimit() public {
        pool.initialize(Q96);

        vm.prank(alice);
        pool.mint(TICK_LOWER, TICK_UPPER, 1000e18);

        // Price limit must be < current price for 0->1 swap
        vm.expectRevert();
        pool.swapExact0For1(1e18, Q96 * 2);
    }

    function test_RevertWhen_Swap1For0InvalidPriceLimit() public {
        pool.initialize(Q96);

        vm.prank(alice);
        pool.mint(TICK_LOWER, TICK_UPPER, 1000e18);

        // Price limit must be > current price for 1->0 swap
        vm.expectRevert();
        pool.swapExact1For0(1e18, Q96 / 2);
    }

    // ============ Flash Fee Tests ============

    function test_FlashFee() public {
        pool.initialize(Q96);

        (uint256 fee0, uint256 fee1) = pool.flashFee(1000e18, 2000e18);

        // Fee = amount * 3000 / 1000000 = 0.3%
        assertEq(fee0, 3e18);  // 1000 * 0.003
        assertEq(fee1, 6e18);  // 2000 * 0.003
    }

    // ============ Admin Tests ============

    function test_SetFeeProtocol() public {
        pool.initialize(Q96);

        uint256 result = pool.setFeeProtocol(5);
        assertEq(result, 1);
    }

    function test_RevertWhen_SetFeeProtocolTooHigh() public {
        pool.initialize(Q96);

        vm.expectRevert();
        pool.setFeeProtocol(11);
    }

    // ============ Fuzz Tests ============

    // Min and max sqrt ratios from Uniswap V3 TickMath.sol
    uint160 constant MIN_SQRT_RATIO = 4295128739;
    uint160 constant MAX_SQRT_RATIO = 1461446703485210103287273052203988822378723970342;

    function testFuzz_Initialize(uint160 sqrtPriceX96) public {
        // Bound to valid range (like Uniswap V3)
        vm.assume(sqrtPriceX96 >= MIN_SQRT_RATIO);
        vm.assume(sqrtPriceX96 < MAX_SQRT_RATIO);

        pool.initialize(sqrtPriceX96);

        (uint160 price,,) = pool.slot0();
        assertEq(price, sqrtPriceX96);
    }

    function testFuzz_Mint(uint128 liquidity) public {
        vm.assume(liquidity > 0);
        vm.assume(liquidity <= 1e30); // Reasonable upper bound

        pool.initialize(Q96);

        vm.prank(alice);
        pool.mint(TICK_LOWER, TICK_UPPER, liquidity);

        (uint128 posLiquidity,,) = pool.getPosition(alice);
        assertEq(posLiquidity, liquidity);
    }

    function testFuzz_MintBurn(uint128 mintAmount, uint128 burnAmount) public {
        vm.assume(mintAmount > 0);
        vm.assume(mintAmount <= 1e30);
        vm.assume(burnAmount <= mintAmount);

        pool.initialize(Q96);

        vm.startPrank(alice);
        pool.mint(TICK_LOWER, TICK_UPPER, mintAmount);

        if (burnAmount > 0) {
            pool.burn(burnAmount);
        }
        vm.stopPrank();

        (uint128 remaining,,) = pool.getPosition(alice);
        assertEq(remaining, mintAmount - burnAmount);
    }

}
