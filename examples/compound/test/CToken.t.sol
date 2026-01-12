// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/ICToken.sol";

/// @title CTokenTest
/// @notice Tests for the simplified Compound cToken implementation
contract CTokenTest is Test {
    ICToken cToken;

    uint256 constant MANTISSA = 1e18;
    uint256 constant INITIAL_EXCHANGE_RATE = 2e16;
    uint256 constant COLLATERAL_FACTOR = 75e16;

    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address carol = makeAddr("carol");

    function setUp() public {
        string memory hexStr = vm.readFile("bytecode.hex");
        bytes memory code = vm.parseBytes(hexStr);
        address deployed;
        assembly {
            deployed := create(0, add(code, 0x20), mload(code))
        }
        require(deployed != address(0), "Deploy failed");
        cToken = ICToken(deployed);
        cToken.initialize(0);
    }

    function test_Initialize() public view {
        assertEq(cToken.getCash(), 0);
        assertEq(cToken.getTotalSupply(), 0);
        assertEq(cToken.getTotalBorrows(), 0);
        assertEq(cToken.getTotalReserves(), 0);
    }

    function test_InitialExchangeRate() public view {
        // When totalSupply is 0, should return initial exchange rate
        assertEq(cToken.exchangeRateStored(), INITIAL_EXCHANGE_RATE);
    }

    function test_RevertWhen_InitializeTwice() public {
        vm.expectRevert();
        cToken.initialize(1000e18);
    }

    function test_Mint() public {
        uint256 mintAmount = 100e18;

        vm.prank(alice);
        uint256 mintedTokens = cToken.mint(mintAmount);

        // At initial exchange rate of 0.02, 100 underlying = 5000 cTokens
        assertEq(mintedTokens, mintAmount * MANTISSA / INITIAL_EXCHANGE_RATE);
        assertEq(cToken.balanceOf(alice), mintedTokens);
        assertEq(cToken.getTotalSupply(), mintedTokens);
        assertEq(cToken.getCash(), mintAmount);
    }

    function test_MintMultipleUsers() public {
        vm.prank(alice);
        uint256 aliceTokens = cToken.mint(100e18);

        vm.prank(bob);
        uint256 bobTokens = cToken.mint(200e18);

        assertEq(cToken.balanceOf(alice), aliceTokens);
        assertEq(cToken.balanceOf(bob), bobTokens);
        assertEq(cToken.getTotalSupply(), aliceTokens + bobTokens);
    }

    function test_RevertWhen_MintZero() public {
        vm.prank(alice);
        vm.expectRevert();
        cToken.mint(0);
    }

    function test_ExchangeRateAfterMint() public {
        uint256 mintAmount = 100e18;

        vm.prank(alice);
        cToken.mint(mintAmount);

        uint256 expectedRate = mintAmount * MANTISSA / cToken.getTotalSupply();
        assertEq(cToken.exchangeRateStored(), expectedRate);
    }

    function test_BalanceOfUnderlying() public {
        uint256 mintAmount = 100e18;

        vm.prank(alice);
        cToken.mint(mintAmount);

        uint256 underlying = cToken.balanceOfUnderlying(alice);
        assertApproxEqRel(underlying, mintAmount, 0.01e18);
    }

    function test_Redeem() public {
        uint256 mintAmount = 100e18;

        vm.startPrank(alice);
        uint256 mintedTokens = cToken.mint(mintAmount);

        uint256 redeemAmount = cToken.redeem(mintedTokens / 2);
        vm.stopPrank();

        assertGt(redeemAmount, 0);
        assertEq(cToken.balanceOf(alice), mintedTokens / 2);
    }

    function test_RedeemAll() public {
        uint256 mintAmount = 100e18;

        vm.startPrank(alice);
        uint256 mintedTokens = cToken.mint(mintAmount);
        cToken.redeem(mintedTokens);
        vm.stopPrank();

        assertEq(cToken.balanceOf(alice), 0);
        assertEq(cToken.getTotalSupply(), 0);
    }

    function test_RedeemUnderlying() public {
        uint256 mintAmount = 100e18;

        vm.startPrank(alice);
        cToken.mint(mintAmount);

        uint256 redeemTokens = cToken.redeemUnderlying(50e18);
        vm.stopPrank();

        assertGt(redeemTokens, 0);
    }

    function test_RevertWhen_RedeemMoreThanBalance() public {
        vm.startPrank(alice);
        uint256 mintedTokens = cToken.mint(100e18);

        vm.expectRevert();
        cToken.redeem(mintedTokens + 1);
        vm.stopPrank();
    }

    function test_RevertWhen_RedeemInsufficientCash() public {
        vm.prank(alice);
        cToken.mint(100e18);

        vm.prank(alice);
        cToken.borrow(70e18);

        vm.prank(alice);
        vm.expectRevert();
        cToken.redeemUnderlying(50e18);
    }

    function test_Borrow() public {
        uint256 mintAmount = 1000e18;
        uint256 borrowAmount = 100e18;

        vm.startPrank(alice);
        cToken.mint(mintAmount);
        uint256 borrowed = cToken.borrow(borrowAmount);
        vm.stopPrank();

        assertEq(borrowed, borrowAmount);
        assertEq(cToken.borrowBalanceStored(alice), borrowAmount);
        assertEq(cToken.getTotalBorrows(), borrowAmount);
    }

    function test_BorrowMultiple() public {
        vm.startPrank(alice);
        cToken.mint(1000e18);
        cToken.borrow(100e18);
        cToken.borrow(50e18);
        vm.stopPrank();

        assertEq(cToken.borrowBalanceStored(alice), 150e18);
    }

    function test_RevertWhen_BorrowExceedsCollateral() public {
        vm.startPrank(alice);
        cToken.mint(100e18);

        vm.expectRevert();
        cToken.borrow(80e18);
        vm.stopPrank();
    }

    function test_RevertWhen_BorrowExceedsCash() public {
        vm.prank(alice);
        cToken.mint(1000e18);

        vm.prank(bob);
        cToken.mint(100e18);

        vm.prank(alice);
        cToken.borrow(500e18);

        vm.prank(carol);
        cToken.mint(10000e18);

        vm.prank(carol);
        vm.expectRevert();
        cToken.borrow(10601e18);
    }

    function test_RepayBorrow() public {
        vm.startPrank(alice);
        cToken.mint(1000e18);
        cToken.borrow(100e18);

        uint256 repaid = cToken.repayBorrow(50e18);
        vm.stopPrank();

        assertEq(repaid, 50e18);
        assertEq(cToken.borrowBalanceStored(alice), 50e18);
    }

    function test_RepayBorrowFull() public {
        vm.startPrank(alice);
        cToken.mint(1000e18);
        cToken.borrow(100e18);

        cToken.repayBorrow(100e18);
        vm.stopPrank();

        assertEq(cToken.borrowBalanceStored(alice), 0);
    }

    function test_RepayBorrowBehalf() public {
        vm.prank(alice);
        cToken.mint(1000e18);

        vm.prank(alice);
        cToken.borrow(100e18);

        vm.prank(bob);
        uint256 repaid = cToken.repayBorrowBehalf(alice, 50e18);

        assertEq(repaid, 50e18);
        assertEq(cToken.borrowBalanceStored(alice), 50e18);
    }

    function test_RepayMoreThanOwed() public {
        vm.startPrank(alice);
        cToken.mint(1000e18);
        cToken.borrow(100e18);

        uint256 repaid = cToken.repayBorrow(200e18);
        vm.stopPrank();

        assertEq(repaid, 100e18);
        assertEq(cToken.borrowBalanceStored(alice), 0);
    }

    function test_AccrueInterest() public {
        vm.prank(alice);
        cToken.mint(1000e18);

        vm.prank(alice);
        cToken.borrow(100e18);

        uint256 borrowsBefore = cToken.getTotalBorrows();

        vm.roll(block.number + 1000);
        cToken.accrueInterest();

        assertGt(cToken.getTotalBorrows(), borrowsBefore);
    }

    function test_AccrueInterestUpdatesReserves() public {
        vm.prank(alice);
        cToken.mint(1000e18);

        vm.prank(alice);
        cToken.borrow(100e18);

        uint256 reservesBefore = cToken.getTotalReserves();

        vm.roll(block.number + 1000);
        cToken.accrueInterest();

        assertGt(cToken.getTotalReserves(), reservesBefore);
    }

    function test_BorrowBalanceIncreasesWithInterest() public {
        vm.prank(alice);
        cToken.mint(1000e18);

        vm.prank(alice);
        cToken.borrow(100e18);

        uint256 balanceBefore = cToken.borrowBalanceStored(alice);

        vm.roll(block.number + 1000);
        cToken.accrueInterest();

        assertGt(cToken.borrowBalanceStored(alice), balanceBefore);
    }

    function test_BorrowRatePerBlock() public {
        vm.prank(alice);
        cToken.mint(1000e18);

        vm.prank(alice);
        cToken.borrow(100e18);

        uint256 borrowRate = cToken.borrowRatePerBlock();
        assertGt(borrowRate, 0);
    }

    function test_SupplyRatePerBlock() public {
        vm.prank(alice);
        cToken.mint(1000e18);

        vm.prank(alice);
        cToken.borrow(100e18);

        uint256 supplyRate = cToken.supplyRatePerBlock();
        assertGt(supplyRate, 0);
    }

    function test_SupplyRateZeroWhenNoBorrows() public view {
        uint256 supplyRate = cToken.supplyRatePerBlock();
        assertEq(supplyRate, 0);
    }

    function test_LiquidateBorrow() public {
        vm.startPrank(alice);
        cToken.mint(1000e18);
        cToken.borrow(749e18);
        vm.stopPrank();

        vm.roll(block.number + 1000000);
        cToken.accrueInterest();

        uint256 borrowBalance = cToken.borrowBalanceStored(alice);
        uint256 maxBorrow = cToken.balanceOfUnderlying(alice) * COLLATERAL_FACTOR / MANTISSA;

        assertGt(borrowBalance, maxBorrow, "Alice should be underwater");

        vm.prank(bob);
        uint256 seizedTokens = cToken.liquidateBorrow(alice, borrowBalance / 2);

        assertGt(seizedTokens, 0);
        assertGt(cToken.balanceOf(bob), 0);
    }

    function test_RevertWhen_LiquidateSelf() public {
        vm.startPrank(alice);
        cToken.mint(1000e18);
        cToken.borrow(700e18);
        vm.stopPrank();

        vm.roll(block.number + 100000);
        cToken.accrueInterest();

        vm.prank(alice);
        vm.expectRevert();
        cToken.liquidateBorrow(alice, 100e18);
    }

    function test_RevertWhen_LiquidateHealthyPosition() public {
        vm.startPrank(alice);
        cToken.mint(1000e18);
        cToken.borrow(100e18);
        vm.stopPrank();

        vm.prank(bob);
        vm.expectRevert();
        cToken.liquidateBorrow(alice, 50e18);
    }

    function test_Transfer() public {
        vm.prank(alice);
        uint256 mintedTokens = cToken.mint(100e18);

        vm.prank(alice);
        cToken.transfer(bob, mintedTokens / 2);

        assertEq(cToken.balanceOf(alice), mintedTokens / 2);
        assertEq(cToken.balanceOf(bob), mintedTokens / 2);
    }

    function test_TransferFrom() public {
        vm.prank(alice);
        uint256 mintedTokens = cToken.mint(100e18);

        vm.prank(alice);
        cToken.approve(bob, mintedTokens);

        vm.prank(bob);
        cToken.transferFrom(alice, carol, mintedTokens / 2);

        assertEq(cToken.balanceOf(alice), mintedTokens / 2);
        assertEq(cToken.balanceOf(carol), mintedTokens / 2);
    }

    function test_RevertWhen_TransferExceedsBalance() public {
        vm.prank(alice);
        uint256 mintedTokens = cToken.mint(100e18);

        vm.prank(alice);
        vm.expectRevert();
        cToken.transfer(bob, mintedTokens + 1);
    }

    function test_RevertWhen_TransferFromExceedsAllowance() public {
        vm.prank(alice);
        uint256 mintedTokens = cToken.mint(100e18);

        vm.prank(alice);
        cToken.approve(bob, mintedTokens / 2);

        vm.prank(bob);
        vm.expectRevert();
        cToken.transferFrom(alice, carol, mintedTokens);
    }

    function test_RevertWhen_TransferBreaksCollateral() public {
        vm.startPrank(alice);
        cToken.mint(1000e18);
        cToken.borrow(700e18);
        uint256 balance = cToken.balanceOf(alice);
        vm.stopPrank();

        vm.prank(alice);
        vm.expectRevert();
        cToken.transfer(bob, balance / 2);
    }

    function test_Approve() public {
        vm.prank(alice);
        cToken.approve(bob, 100e18);

        assertEq(cToken.allowance(alice, bob), 100e18);
    }

    function test_GetAccountSnapshot() public {
        vm.startPrank(alice);
        cToken.mint(1000e18);
        cToken.borrow(100e18);
        vm.stopPrank();

        (uint256 cTokenBalance, uint256 borrowBalance, uint256 exchangeRate) =
            cToken.getAccountSnapshot(alice);

        assertGt(cTokenBalance, 0);
        assertEq(borrowBalance, 100e18);
        assertGt(exchangeRate, 0);
    }

    function test_AddReserves() public {
        uint256 addAmount = 1000e18;

        uint256 reservesBefore = cToken.getTotalReserves();
        cToken.addReserves(addAmount);
        uint256 reservesAfter = cToken.getTotalReserves();

        assertEq(reservesAfter, reservesBefore + addAmount);
    }

    function testFuzz_Mint(uint256 amount) public {
        amount = bound(amount, 1, 1e30);

        vm.prank(alice);
        uint256 mintedTokens = cToken.mint(amount);

        assertGt(mintedTokens, 0);
        assertEq(cToken.balanceOf(alice), mintedTokens);
    }

    function testFuzz_MintRedeem(uint256 mintAmount, uint256 redeemPercent) public {
        mintAmount = bound(mintAmount, 1, 1e30);
        redeemPercent = bound(redeemPercent, 1, 100);

        vm.startPrank(alice);
        uint256 mintedTokens = cToken.mint(mintAmount);

        uint256 redeemTokens = (mintedTokens * redeemPercent) / 100;
        if (redeemTokens > 0) {
            cToken.redeem(redeemTokens);
        }
        vm.stopPrank();

        assertEq(cToken.balanceOf(alice), mintedTokens - redeemTokens);
    }
}
