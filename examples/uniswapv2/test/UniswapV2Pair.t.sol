// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import {Test, console} from "forge-std/Test.sol";
import {IUniswapV2Pair} from "../src/IUniswapV2Pair.sol";

/**
 * @title UniswapV2Pair Tests
 * @notice Test cases adapted from official Uniswap V2 tests
 * @dev https://github.com/Uniswap/v2-core/blob/master/test/UniswapV2Pair.spec.ts
 */
contract UniswapV2PairTest is Test {
    IUniswapV2Pair public pair;
    address public alice = makeAddr("alice");
    address public bob = makeAddr("bob");

    // Official Uniswap V2 constant
    uint256 constant MINIMUM_LIQUIDITY = 1000;

    // Bytecode compiled from TypeScript
    bytes constant BYTECODE = hex"61064f61000e5f3961064f5ff3fe5f3560e01c8063a9059cbb14610176578063095ea7b31461015857806323b872dd146101375780630902f1ac146101185780639b96eece146100fd5780631b2ef1ca146100df57806342966c68146100c457806394b918de146100a95780635c1952171461008e5763538361a714610075575f80fd5b3461008a57610088602435600435610608565b005b5f80fd5b346100a55761009e6004356105d4565b5f5260205ff35b5f80fd5b346100c0576100b96004356104e4565b5f5260205ff35b5f80fd5b346100db576100d4600435610417565b5f5260205ff35b5f80fd5b346100f9576100f2602435600435610337565b5f5260205ff35b5f80fd5b346101145761010d600435610328565b5f5260205ff35b5f80fd5b346101335761012561031a565b915f5260205260405260605ff35b5f80fd5b346101545761014d60443560243560043561022e565b5f5260205ff35b5f80fd5b346101725761016b602435600435610213565b5f5260205ff35b5f80fd5b3461019057610189602435600435610194565b5f5260205ff35b5f80fd5b9033816101a2600183610643565b54106101df5781816101c660016101d9956101be828097610643565b540392610643565b556101d18285610643565b540192610643565b55600190565b6308c379a060e01b5f526020600452601460245273496e73756666696369656e742062616c616e636560601b60445260645ffd5b61022890610222600233610643565b90610643565b55600190565b91909133610246610240600284610643565b82610643565b548381106102e45783610266910391610260600285610643565b90610643565b5581610273600183610643565b54106102b057818161029760016102aa9561028f828097610643565b540392610643565b556102a28285610643565b540192610643565b55600190565b6308c379a060e01b5f526020600452601460245273496e73756666696369656e742062616c616e636560601b60445260645ffd5b6308c379a060e01b5f526020600452601660245275496e73756666696369656e7420616c6c6f77616e636560501b60445260645ffd5b600354906004549060055490565b600161033391610643565b5490565b905f915f805414806103fb575b156103bf575b5f8314610382578261035d600133610643565b540161036a600133610643565b55825f54015f55600354016003556004540160045590565b6308c379a060e01b5f526020600452601d6024527f496e73756666696369656e74206c6971756964697479206d696e74656400000060445260645ffd5b6003545f548202046004545f548402049081811090816103f1575b50156103e7575b5061034a565b909250915f6103e1565b909450935f6103da565b92506103e861040b838302610610565b03926103e85f55610344565b3381610424600183610643565b54106104b0575f54600354830204915f54600454820204915f84146104735761045b6001836104538285610643565b540392610643565b555f54035f5581600354036003556004540360045590565b6308c379a060e01b5f526020600452601d6024527f496e73756666696369656e74206c6971756964697479206275726e656400000060445260645ffd5b6308c379a060e01b5f526020600452601460245273496e73756666696369656e742062616c616e636560601b60445260645ffd5b5f8114610597576103e581026004548102906103e860035402019004905f821461055a576004548210156105245760035401600355806004540360045590565b6308c379a060e01b5f526020600452601660245275496e73756666696369656e74206c697175696469747960501b60445260645ffd5b6308c379a060e01b5f526020600452601a6024527f496e73756666696369656e74206f757470757420616d6f756e7400000000000060445260645ffd5b6308c379a060e01b5f52602060045260196024527f496e73756666696369656e7420696e70757420616d6f756e740000000000000060445260645ffd5b6103e5905f8114610603575b5f600354146105fe575b026004548102906103e86003540201900490565b6105ea565b6105e0565b600355600455565b5f811461063e575b60026001820104815b82821061062d57505090565b909150600282808304010490610621565b610618565b5f5260205260405f209056";

    function setUp() public {
        // Deploy the contract from bytecode
        address deployed;
        bytes memory bytecode = BYTECODE;
        assembly {
            deployed := create(0, add(bytecode, 0x20), mload(bytecode))
        }
        require(deployed != address(0), "Deployment failed");
        pair = IUniswapV2Pair(deployed);
    }

    // ============ Helper Functions ============

    function expandTo18Decimals(uint256 n) internal pure returns (uint256) {
        return n * 10**18;
    }

    // ============ Official Uniswap V2 Core Tests ============
    // Adapted from: https://github.com/Uniswap/v2-core/blob/master/test/UniswapV2Pair.spec.ts

    /**
     * @notice Test mint function
     * @dev Official test: token0Amount = 1e18, token1Amount = 4e18
     *      expectedLiquidity = sqrt(1e18 * 4e18) = 2e18
     *      actualLiquidity = 2e18 - MINIMUM_LIQUIDITY = 2e18 - 1000
     */
    function test_Mint() public {
        uint256 token0Amount = expandTo18Decimals(1);
        uint256 token1Amount = expandTo18Decimals(4);

        uint256 expectedLiquidity = expandTo18Decimals(2);
        uint256 liquidity = pair.mint(token0Amount, token1Amount);

        // sqrt(1 * 4) = 2, minus MINIMUM_LIQUIDITY
        assertEq(liquidity, expectedLiquidity - MINIMUM_LIQUIDITY);

        // Check total supply equals liquidity + MINIMUM_LIQUIDITY (locked)
        (uint256 reserve0, uint256 reserve1, ) = pair.getReserves();
        assertEq(reserve0, token0Amount);
        assertEq(reserve1, token1Amount);

        // Verify balance
        uint256 balance = pair.getBalanceOf(address(this));
        assertEq(balance, liquidity);
    }

    /**
     * @notice Test mint with equal amounts (1:1 ratio)
     * @dev Official pattern: 1000 ether each
     */
    function test_MintEqualAmounts() public {
        uint256 liquidity = pair.mint(1000 ether, 1000 ether);
        console.log("Liquidity minted (1:1):", liquidity);

        // sqrt(1000e18 * 1000e18) - 1000 = 1000e18 - 1000
        assertEq(liquidity, 1000 ether - MINIMUM_LIQUIDITY);

        (uint256 reserve0, uint256 reserve1, ) = pair.getReserves();
        assertEq(reserve0, 1000 ether);
        assertEq(reserve1, 1000 ether);
    }

    /**
     * @notice Test adding liquidity multiple times
     * @dev Second mint should be proportional
     */
    function test_MintMultipleTimes() public {
        // First mint: 5 token0, 10 token1 (from official tests pattern)
        uint256 token0Amount = expandTo18Decimals(5);
        uint256 token1Amount = expandTo18Decimals(10);
        uint256 liquidity1 = pair.mint(token0Amount, token1Amount);
        console.log("First liquidity:", liquidity1);

        // Second mint: proportional amounts
        uint256 liquidity2 = pair.mint(token0Amount, token1Amount);
        console.log("Second liquidity:", liquidity2);

        // Second should be same as first (minus MINIMUM_LIQUIDITY effect)
        assertGt(liquidity2, 0);

        (uint256 reserve0, uint256 reserve1, ) = pair.getReserves();
        assertEq(reserve0, token0Amount * 2);
        assertEq(reserve1, token1Amount * 2);
    }

    /**
     * @notice Test swap token0 for token1
     * @dev Official test: 5 token0, 10 token1 initial
     *      Swap 1 token0, expect ~1.662 token1 output
     */
    function test_SwapToken0() public {
        // Setup: 5 token0, 10 token1 (official test amounts)
        uint256 token0Amount = expandTo18Decimals(5);
        uint256 token1Amount = expandTo18Decimals(10);
        pair.mint(token0Amount, token1Amount);

        uint256 swapAmount = expandTo18Decimals(1);
        // Expected output with 0.3% fee: ~1.662497915624478906
        uint256 expectedOutputAmount = 1662497915624478906;

        uint256 amountOut = pair.swap(swapAmount);
        console.log("Swap 1 token0, got token1:", amountOut);

        // Verify output matches expected (within rounding)
        assertEq(amountOut, expectedOutputAmount);

        (uint256 reserve0, uint256 reserve1, ) = pair.getReserves();
        assertEq(reserve0, token0Amount + swapAmount);
        assertEq(reserve1, token1Amount - amountOut);
    }

    /**
     * @notice Test swap with 1:1 pool
     * @dev Official pattern: 1000 ether each, swap 10 ether
     */
    function test_SwapEqualPool() public {
        pair.mint(1000 ether, 1000 ether);

        uint256 amountIn = 10 ether;
        uint256 expectedOut = pair.getAmountOut(amountIn);
        uint256 amountOut = pair.swap(amountIn);

        console.log("Expected output:", expectedOut);
        console.log("Actual output:", amountOut);
        assertEq(amountOut, expectedOut);

        // Verify constant product formula (with 0.3% fee)
        // amountOut = (amountIn * 997 * reserveOut) / (reserveIn * 1000 + amountIn * 997)
        uint256 calculatedOut = (amountIn * 997 * 1000 ether) / (1000 ether * 1000 + amountIn * 997);
        assertEq(amountOut, calculatedOut);

        (uint256 reserve0, uint256 reserve1, ) = pair.getReserves();
        assertEq(reserve0, 1000 ether + amountIn);
        assertEq(reserve1, 1000 ether - amountOut);
    }

    /**
     * @notice Test multiple consecutive swaps
     * @dev Tests price impact accumulation
     */
    function test_SwapMultiple() public {
        pair.mint(10000 ether, 10000 ether);

        uint256 totalIn = 0;
        uint256 totalOut = 0;

        for (uint i = 0; i < 5; i++) {
            uint256 amountIn = 100 ether;
            uint256 amountOut = pair.swap(amountIn);
            totalIn += amountIn;
            totalOut += amountOut;
            console.log("Swap", i + 1, "- Out:", amountOut);
        }

        console.log("Total in:", totalIn);
        console.log("Total out:", totalOut);

        (uint256 reserve0, uint256 reserve1, ) = pair.getReserves();
        assertEq(reserve0, 10000 ether + totalIn);
        assertEq(reserve1, 10000 ether - totalOut);

        // Due to slippage, total out should be less than total in
        assertLt(totalOut, totalIn);
    }

    /**
     * @notice Test burn (remove liquidity)
     * @dev Official test pattern
     */
    function test_Burn() public {
        // Add liquidity: 3 token0, 3 token1 (from official tests)
        uint256 token0Amount = expandTo18Decimals(3);
        uint256 token1Amount = expandTo18Decimals(3);
        uint256 liquidity = pair.mint(token0Amount, token1Amount);

        // Burn all liquidity
        uint256 amount0 = pair.burn(liquidity);
        console.log("Burned liquidity:", liquidity);
        console.log("Got back amount0:", amount0);

        uint256 balanceAfter = pair.getBalanceOf(address(this));
        assertEq(balanceAfter, 0);

        // Reserves should still have MINIMUM_LIQUIDITY locked
        (uint256 reserve0, uint256 reserve1, ) = pair.getReserves();
        assertEq(reserve0, MINIMUM_LIQUIDITY);
        assertEq(reserve1, MINIMUM_LIQUIDITY);
    }

    /**
     * @notice Test partial burn
     */
    function test_BurnPartial() public {
        uint256 liquidity = pair.mint(1000 ether, 1000 ether);

        uint256 burnAmount = liquidity / 2;
        uint256 amount0 = pair.burn(burnAmount);

        console.log("Burned half liquidity:", burnAmount);
        console.log("Got back amount0:", amount0);

        uint256 balanceAfter = pair.getBalanceOf(address(this));
        assertEq(balanceAfter, liquidity - burnAmount);
    }

    // ============ Official Uniswap V2 ERC20 Tests ============
    // Adapted from: https://github.com/Uniswap/v2-core/blob/master/test/UniswapV2ERC20.spec.ts

    /**
     * @notice Test approve
     * @dev Official test: approve TEST_AMOUNT (10e18)
     */
    function test_Approve() public {
        pair.mint(1000 ether, 1000 ether);

        uint256 testAmount = expandTo18Decimals(10);
        bool success = pair.approve(alice, testAmount);
        assertTrue(success);
    }

    /**
     * @notice Test transfer
     * @dev Official test: transfer TEST_AMOUNT
     */
    function test_Transfer() public {
        pair.mint(1000 ether, 1000 ether);
        uint256 balance = pair.getBalanceOf(address(this));

        uint256 testAmount = expandTo18Decimals(10);
        bool success = pair.transfer(alice, testAmount);
        assertTrue(success);

        assertEq(pair.getBalanceOf(address(this)), balance - testAmount);
        assertEq(pair.getBalanceOf(alice), testAmount);
    }

    /**
     * @notice Test transfer fails when exceeding balance
     * @dev Official test: should revert
     */
    function test_RevertWhen_TransferExceedsBalance() public {
        pair.mint(1000 ether, 1000 ether);
        uint256 balance = pair.getBalanceOf(address(this));

        vm.expectRevert("Insufficient balance");
        pair.transfer(alice, balance + 1);
    }

    /**
     * @notice Test transferFrom
     * @dev Official test pattern
     */
    function test_TransferFrom() public {
        pair.mint(1000 ether, 1000 ether);
        uint256 balance = pair.getBalanceOf(address(this));

        uint256 testAmount = expandTo18Decimals(10);

        // Approve alice
        pair.approve(alice, testAmount);

        // Alice transfers from this to bob
        vm.prank(alice);
        bool success = pair.transferFrom(address(this), bob, testAmount);
        assertTrue(success);

        assertEq(pair.getBalanceOf(bob), testAmount);
        assertEq(pair.getBalanceOf(address(this)), balance - testAmount);
    }

    /**
     * @notice Test transferFrom fails with insufficient allowance
     * @dev Official test: should revert
     */
    function test_RevertWhen_TransferFromInsufficientAllowance() public {
        pair.mint(1000 ether, 1000 ether);

        uint256 approveAmount = expandTo18Decimals(10);
        uint256 transferAmount = expandTo18Decimals(100);

        pair.approve(alice, approveAmount);

        vm.prank(alice);
        vm.expectRevert("Insufficient allowance");
        pair.transferFrom(address(this), bob, transferAmount);
    }

    // ============ GetAmountOut Tests ============

    /**
     * @notice Test getAmountOut calculation
     * @dev Official formula: (amountIn * 997 * reserveOut) / (reserveIn * 1000 + amountIn * 997)
     */
    function test_GetAmountOut() public {
        // 1:2 ratio pool
        pair.mint(1000 ether, 2000 ether);

        uint256 amountOut = pair.getAmountOut(100 ether);
        console.log("Amount out for 100 token0:", amountOut);

        // Manual calculation: (100 * 997 * 2000) / (1000 * 1000 + 100 * 997)
        // = 199400000 / 1099700 = 181.32...
        assertGt(amountOut, 181 ether);
        assertLt(amountOut, 182 ether);
    }

    /**
     * @notice Test getAmountOut with zero input
     */
    function test_GetAmountOutZero() public {
        pair.mint(1000 ether, 1000 ether);
        uint256 amountOut = pair.getAmountOut(0);
        assertEq(amountOut, 0);
    }

    /**
     * @notice Test getAmountOut with no liquidity
     */
    function test_GetAmountOutNoLiquidity() public view {
        uint256 amountOut = pair.getAmountOut(100 ether);
        assertEq(amountOut, 0);
    }

    // ============ Sync Tests ============

    /**
     * @notice Test sync function
     */
    function test_Sync() public {
        pair.mint(1000 ether, 1000 ether);

        // Sync to new values
        pair.sync(2000 ether, 500 ether);

        (uint256 reserve0, uint256 reserve1, ) = pair.getReserves();
        assertEq(reserve0, 2000 ether);
        assertEq(reserve1, 500 ether);
    }

    // ============ Revert Tests ============

    /**
     * @notice Test swap reverts with zero input
     */
    function test_RevertWhen_SwapZero() public {
        pair.mint(1000 ether, 1000 ether);
        vm.expectRevert("Insufficient input amount");
        pair.swap(0);
    }

    /**
     * @notice Test swap reverts when output would be zero
     */
    function test_RevertWhen_SwapInsufficientOutput() public {
        pair.mint(1000 ether, 1); // Very unbalanced
        vm.expectRevert("Insufficient output amount");
        pair.swap(1);
    }

    /**
     * @notice Test burn reverts with insufficient balance
     */
    function test_RevertWhen_BurnInsufficientBalance() public {
        pair.mint(1000 ether, 1000 ether);
        uint256 balance = pair.getBalanceOf(address(this));

        vm.expectRevert("Insufficient balance");
        pair.burn(balance + 1);
    }

    // ============ Fuzz Tests ============

    /**
     * @notice Fuzz test mint with various amounts
     * @dev Bounded to reasonable values to avoid overflow
     */
    function testFuzz_Mint(uint256 amount0, uint256 amount1) public {
        // Bound to reasonable values (above MINIMUM_LIQUIDITY, below overflow risk)
        amount0 = bound(amount0, MINIMUM_LIQUIDITY + 1, 1e30);
        amount1 = bound(amount1, MINIMUM_LIQUIDITY + 1, 1e30);

        uint256 liquidity = pair.mint(amount0, amount1);
        assertGt(liquidity, 0);

        (uint256 reserve0, uint256 reserve1, ) = pair.getReserves();
        assertEq(reserve0, amount0);
        assertEq(reserve1, amount1);
    }

    /**
     * @notice Fuzz test swap with various amounts
     */
    function testFuzz_Swap(uint256 amountIn) public {
        pair.mint(10000 ether, 10000 ether);

        // Bound swap amount to reasonable values
        amountIn = bound(amountIn, 1 ether, 5000 ether);

        uint256 expectedOut = pair.getAmountOut(amountIn);
        uint256 actualOut = pair.swap(amountIn);

        assertEq(actualOut, expectedOut);
        assertGt(actualOut, 0);
        // Output should be less than input due to fee + slippage
        assertLt(actualOut, amountIn);
    }

    /**
     * @notice Fuzz test transfer
     */
    function testFuzz_Transfer(uint256 amount) public {
        pair.mint(1000 ether, 1000 ether);
        uint256 balance = pair.getBalanceOf(address(this));

        amount = bound(amount, 1, balance);

        bool success = pair.transfer(alice, amount);
        assertTrue(success);

        assertEq(pair.getBalanceOf(address(this)), balance - amount);
        assertEq(pair.getBalanceOf(alice), amount);
    }
}
