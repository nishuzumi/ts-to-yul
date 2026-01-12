// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import {Test, console} from "forge-std/Test.sol";

interface IUniswapV2Router {
    function getReserves() external view returns (uint256, uint256);
    function getTotalLiquidity() external view returns (uint256);
    function getLiquidity(address account) external view returns (uint256);
    function quote(uint256 amountA, uint256 reserveA, uint256 reserveB) external view returns (uint256);
    function getAmountOut(uint256 amountIn, uint256 reserveIn, uint256 reserveOut) external view returns (uint256);
    function getAmountIn(uint256 amountOut, uint256 reserveIn, uint256 reserveOut) external view returns (uint256);
    function addLiquidity(uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min) external returns (uint256);
    function removeLiquidity(uint256 liquidityAmount, uint256 amount0Min, uint256 amount1Min) external returns (uint256);
    function swapExactToken0ForToken1(uint256 amountIn, uint256 amountOutMin) external returns (uint256);
    function swapExactToken1ForToken0(uint256 amountIn, uint256 amountOutMin) external returns (uint256);
    function swapToken0ForExactToken1(uint256 amountOut, uint256 amountInMax) external returns (uint256);
    function swapToken1ForExactToken0(uint256 amountOut, uint256 amountInMax) external returns (uint256);
}

/**
 * @title UniswapV2Router Tests
 * @notice Test cases adapted from official Uniswap V2 periphery tests
 * @dev https://github.com/Uniswap/v2-periphery/blob/master/test/UniswapV2Router02.spec.ts
 */
contract UniswapV2RouterTest is Test {
    IUniswapV2Router public router;

    // Official Uniswap V2 constant
    uint256 constant MINIMUM_LIQUIDITY = 1000;

    function setUp() public {
        // Read bytecode from file
        string memory path = "bytecode-router.hex";
        bytes memory bytecode = vm.parseBytes(vm.readFile(path));

        // Deploy the contract
        address deployed;
        assembly {
            deployed := create(0, add(bytecode, 0x20), mload(bytecode))
        }
        require(deployed != address(0), "Deployment failed");
        router = IUniswapV2Router(deployed);
    }

    // ============ Helper Functions ============

    function expandTo18Decimals(uint256 n) internal pure returns (uint256) {
        return n * 10**18;
    }

    // ============ Official Uniswap V2 Router Tests ============
    // Adapted from: https://github.com/Uniswap/v2-periphery/blob/master/test/UniswapV2Router02.spec.ts

    /**
     * @notice Test initial state
     */
    function test_InitialState() public view {
        (uint256 reserve0, uint256 reserve1) = router.getReserves();
        assertEq(reserve0, 0);
        assertEq(reserve1, 0);
        assertEq(router.getTotalLiquidity(), 0);
    }

    /**
     * @notice Test quote function
     * @dev Official test: quote(1, 100, 200) should return 2
     *      quote(2, 200, 100) should return 1
     */
    function test_Quote() public view {
        // Official test case: (1, 100, 200) => 2
        uint256 quote1 = router.quote(1, 100, 200);
        assertEq(quote1, 2);

        // Official test case: (2, 200, 100) => 1
        uint256 quote2 = router.quote(2, 200, 100);
        assertEq(quote2, 1);

        // Additional test with larger numbers
        uint256 quote3 = router.quote(100 ether, 1000 ether, 2000 ether);
        assertEq(quote3, 200 ether); // 100 * 2000 / 1000 = 200
    }

    /**
     * @notice Test getAmountOut function
     * @dev Official test: getAmountOut(2, 100, 100) should return 1
     *      With 0.3% fee: (2 * 997 * 100) / (100 * 1000 + 2 * 997)
     */
    function test_GetAmountOut() public view {
        // Official test case: (2, 100, 100) => 1
        uint256 amountOut = router.getAmountOut(2, 100, 100);
        assertEq(amountOut, 1);

        // Test with larger numbers (10 in, 1000/1000 reserves)
        uint256 amountOut2 = router.getAmountOut(10 ether, 1000 ether, 1000 ether);
        console.log("Amount out for 10 token input:", amountOut2);
        // Expected: ~9.87 with fee
        assertGt(amountOut2, 9.8 ether);
        assertLt(amountOut2, 10 ether);
    }

    /**
     * @notice Test getAmountIn function
     * @dev Official test: getAmountIn(1, 100, 100) should return 2
     */
    function test_GetAmountIn() public view {
        // Official test case: (1, 100, 100) => 2
        uint256 amountIn = router.getAmountIn(1, 100, 100);
        assertEq(amountIn, 2);

        // Test with larger numbers
        uint256 amountIn2 = router.getAmountIn(10 ether, 1000 ether, 1000 ether);
        console.log("Amount in for 10 token output:", amountIn2);
        // Should be slightly more than 10 due to fee
        assertGt(amountIn2, 10 ether);
    }

    /**
     * @notice Test addLiquidity
     * @dev Official pattern: 10000 tokens each
     */
    function test_AddLiquidity() public {
        uint256 amount0 = expandTo18Decimals(10000);
        uint256 amount1 = expandTo18Decimals(10000);

        uint256 liquidity = router.addLiquidity(amount0, amount1, 0, 0);
        console.log("Initial liquidity minted:", liquidity);

        // sqrt(10000 * 10000) - 1000 = 10000e18 - 1000
        assertEq(liquidity, amount0 - MINIMUM_LIQUIDITY);

        // Check reserves
        (uint256 reserve0, uint256 reserve1) = router.getReserves();
        assertEq(reserve0, amount0);
        assertEq(reserve1, amount1);

        // Check user liquidity
        assertEq(router.getLiquidity(address(this)), liquidity);
    }

    /**
     * @notice Test addLiquidity with proportional amounts
     * @dev Second add should maintain ratio
     */
    function test_AddLiquidityProportional() public {
        // Add initial liquidity
        router.addLiquidity(1000 ether, 1000 ether, 0, 0);

        // Add more liquidity proportionally
        uint256 liquidity = router.addLiquidity(500 ether, 500 ether, 0, 0);
        console.log("Additional liquidity minted:", liquidity);

        (uint256 reserve0, uint256 reserve1) = router.getReserves();
        assertEq(reserve0, 1500 ether);
        assertEq(reserve1, 1500 ether);
    }

    /**
     * @notice Test addLiquidity with slippage protection
     */
    function test_AddLiquidityWithSlippage() public {
        // Add initial liquidity with 2:1 ratio
        router.addLiquidity(2000 ether, 1000 ether, 0, 0);

        // Add more, optimal amounts will be calculated
        uint256 liquidity = router.addLiquidity(1000 ether, 1000 ether, 0, 0);
        console.log("Liquidity with slippage:", liquidity);

        assertGt(liquidity, 0);
    }

    /**
     * @notice Test removeLiquidity
     */
    function test_RemoveLiquidity() public {
        // Add liquidity first
        uint256 liquidity = router.addLiquidity(1000 ether, 1000 ether, 0, 0);

        // Remove half
        uint256 halfLiquidity = liquidity / 2;
        uint256 amount0 = router.removeLiquidity(halfLiquidity, 0, 0);
        console.log("Removed liquidity, got amount0:", amount0);

        // Check remaining liquidity
        assertEq(router.getLiquidity(address(this)), liquidity - halfLiquidity);
    }

    /**
     * @notice Test removeLiquidity with slippage protection
     */
    function test_RevertWhen_RemoveLiquiditySlippageA() public {
        uint256 liquidity = router.addLiquidity(1000 ether, 1000 ether, 0, 0);

        // Try to remove with too high minimum
        vm.expectRevert("Router: INSUFFICIENT_A_AMOUNT");
        router.removeLiquidity(liquidity / 2, 600 ether, 0); // Wants 600 but will get ~500
    }

    /**
     * @notice Test swapExactToken0ForToken1
     * @dev Official pattern
     */
    function test_SwapExactToken0ForToken1() public {
        // Add liquidity
        router.addLiquidity(1000 ether, 1000 ether, 0, 0);

        // Swap 10 token0 for token1
        uint256 amountIn = 10 ether;
        uint256 amountOut = router.swapExactToken0ForToken1(amountIn, 0);
        console.log("Swapped token0 for token1, in:", amountIn);
        console.log("out:", amountOut);

        // Check reserves changed correctly
        (uint256 reserve0, uint256 reserve1) = router.getReserves();
        assertEq(reserve0, 1000 ether + amountIn);
        assertEq(reserve1, 1000 ether - amountOut);

        // Verify output calculation (with 0.3% fee)
        uint256 expectedOut = router.getAmountOut(amountIn, 1000 ether, 1000 ether);
        assertEq(amountOut, expectedOut);
    }

    /**
     * @notice Test swapExactToken1ForToken0
     */
    function test_SwapExactToken1ForToken0() public {
        // Add liquidity
        router.addLiquidity(1000 ether, 1000 ether, 0, 0);

        // Swap 10 token1 for token0
        uint256 amountIn = 10 ether;
        uint256 amountOut = router.swapExactToken1ForToken0(amountIn, 0);
        console.log("Swapped token1 for token0, in:", amountIn);
        console.log("out:", amountOut);

        // Check reserves changed correctly
        (uint256 reserve0, uint256 reserve1) = router.getReserves();
        assertEq(reserve0, 1000 ether - amountOut);
        assertEq(reserve1, 1000 ether + amountIn);
    }

    /**
     * @notice Test swapToken0ForExactToken1
     */
    function test_SwapToken0ForExactToken1() public {
        // Add liquidity
        router.addLiquidity(1000 ether, 1000 ether, 0, 0);

        // Swap for exact 5 token1
        uint256 amountOut = 5 ether;
        uint256 amountIn = router.swapToken0ForExactToken1(amountOut, 100 ether);
        console.log("Paid token0 for exact token1, in:", amountIn);
        console.log("out:", amountOut);

        // Check reserves changed correctly
        (uint256 reserve0, uint256 reserve1) = router.getReserves();
        assertEq(reserve0, 1000 ether + amountIn);
        assertEq(reserve1, 1000 ether - amountOut);
    }

    /**
     * @notice Test swapToken1ForExactToken0
     */
    function test_SwapToken1ForExactToken0() public {
        // Add liquidity
        router.addLiquidity(1000 ether, 1000 ether, 0, 0);

        // Swap for exact 5 token0
        uint256 amountOut = 5 ether;
        uint256 amountIn = router.swapToken1ForExactToken0(amountOut, 100 ether);
        console.log("Paid token1 for exact token0, in:", amountIn);
        console.log("out:", amountOut);

        // Check reserves changed correctly
        (uint256 reserve0, uint256 reserve1) = router.getReserves();
        assertEq(reserve0, 1000 ether - amountOut);
        assertEq(reserve1, 1000 ether + amountIn);
    }

    /**
     * @notice Test slippage protection on exact input swap
     * @dev Should revert when output is less than minimum
     */
    function test_RevertWhen_SlippageExceeded() public {
        router.addLiquidity(1000 ether, 1000 ether, 0, 0);

        // Try to swap with too high minimum output
        vm.expectRevert("Router: INSUFFICIENT_OUTPUT_AMOUNT");
        router.swapExactToken0ForToken1(10 ether, 100 ether); // Want 100 but will get ~9.87
    }

    /**
     * @notice Test slippage protection on exact output swap
     * @dev Should revert when input exceeds maximum
     */
    function test_RevertWhen_ExcessiveInput() public {
        router.addLiquidity(1000 ether, 1000 ether, 0, 0);

        // Try to swap with too low maximum input
        vm.expectRevert("Router: EXCESSIVE_INPUT_AMOUNT");
        router.swapToken0ForExactToken1(10 ether, 1 ether); // Want to pay max 1 but need ~10.13
    }

    /**
     * @notice Test multiple consecutive swaps
     * @dev Tests price impact accumulation
     */
    function test_MultipleSwaps() public {
        router.addLiquidity(10000 ether, 10000 ether, 0, 0);

        uint256 totalOut = 0;
        for (uint i = 0; i < 5; i++) {
            uint256 out = router.swapExactToken0ForToken1(100 ether, 0);
            totalOut += out;
            console.log("Swap", i + 1, "- Out:", out);
        }
        console.log("Total output from 5 swaps of 100:", totalOut);

        (uint256 reserve0, uint256 reserve1) = router.getReserves();
        console.log("Final reserves - token0:", reserve0);
        console.log("token1:", reserve1);

        // Due to slippage, each subsequent swap gets less output
        assertEq(reserve0, 10500 ether);
        assertEq(reserve1, 10000 ether - totalOut);
    }

    /**
     * @notice Test arbitrage scenario (swap both directions)
     */
    function test_Arbitrage() public {
        router.addLiquidity(1000 ether, 1000 ether, 0, 0);

        // Swap token0 -> token1
        uint256 out1 = router.swapExactToken0ForToken1(100 ether, 0);
        console.log("First swap out:", out1);

        // Swap token1 -> token0
        uint256 out2 = router.swapExactToken1ForToken0(out1, 0);
        console.log("Second swap out:", out2);

        // Due to fees, should get less back than started with
        assertLt(out2, 100 ether);
        // But not too much less (should be around 99.4%)
        assertGt(out2, 99 ether);
    }

    // ============ Fuzz Tests ============

    /**
     * @notice Fuzz test addLiquidity
     */
    function testFuzz_AddLiquidity(uint256 amount0, uint256 amount1) public {
        amount0 = bound(amount0, MINIMUM_LIQUIDITY + 1, 1e30);
        amount1 = bound(amount1, MINIMUM_LIQUIDITY + 1, 1e30);

        uint256 liquidity = router.addLiquidity(amount0, amount1, 0, 0);
        assertGt(liquidity, 0);

        (uint256 reserve0, uint256 reserve1) = router.getReserves();
        assertEq(reserve0, amount0);
        assertEq(reserve1, amount1);
    }

    /**
     * @notice Fuzz test swap
     */
    function testFuzz_Swap(uint256 amountIn) public {
        router.addLiquidity(10000 ether, 10000 ether, 0, 0);

        amountIn = bound(amountIn, 1 ether, 5000 ether);

        uint256 expectedOut = router.getAmountOut(amountIn, 10000 ether, 10000 ether);
        uint256 actualOut = router.swapExactToken0ForToken1(amountIn, 0);

        assertEq(actualOut, expectedOut);
        assertGt(actualOut, 0);
        assertLt(actualOut, amountIn); // Output < input due to fee
    }
}
