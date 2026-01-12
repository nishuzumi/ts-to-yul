// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "../src/IShowcaseWithInheritance.sol";

/**
 * @title ShowcaseWithInheritanceTest
 * @notice Tests for multiple inheritance via Mixin pattern
 */
contract ShowcaseWithInheritanceTest is Test {
    IShowcaseWithInheritance public showcase;

    address public admin = address(0x1);
    address payable public treasury = payable(address(0x2));
    address public user1 = address(0x4);
    address public user2 = address(0x5);

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event Paused(address indexed account);
    event Unpaused(address indexed account);
    event Transfer(address indexed from, address indexed to, uint256 amount);

    function setUp() public {
        // Read bytecode from compiled output
        string memory hexBytecode = vm.readFile("out/ShowcaseWithInheritance.bin");
        bytes memory bytecode = vm.parseBytes(hexBytecode);

        // Encode constructor arguments: (address initialOwner, address treasuryAddr)
        bytes memory args = abi.encode(admin, treasury);
        bytes memory deployCode = abi.encodePacked(bytecode, args);

        address payable deployed;
        assembly {
            deployed := create(0, add(deployCode, 0x20), mload(deployCode))
        }
        require(deployed != address(0), "Deployment failed");
        showcase = IShowcaseWithInheritance(deployed);
    }

    // =========================================================================
    // INITIAL STATE
    // =========================================================================

    function test_InitialOwner() public view {
        assertEq(showcase.owner(), admin);
        assertEq(showcase.getOwner(), admin);
    }

    function test_InitialPausedState() public view {
        assertFalse(showcase.paused());
        assertFalse(showcase.isPaused());
    }

    function test_InitialTreasury() public view {
        assertEq(showcase.getTreasury(), treasury);
    }

    // =========================================================================
    // OWNABLE FUNCTIONALITY
    // =========================================================================

    function test_TransferOwnership() public {
        vm.prank(admin);
        vm.expectEmit(true, true, false, false);
        emit OwnershipTransferred(admin, user1);

        showcase.transferOwnership(user1);
        assertEq(showcase.owner(), user1);
    }

    function test_TransferOwnership_RevertWhen_NotOwner() public {
        vm.prank(user1);
        vm.expectRevert(); // OwnableUnauthorized(user1)
        showcase.transferOwnership(user2);
    }

    function test_TransferOwnership_RevertWhen_ZeroAddress() public {
        vm.prank(admin);
        vm.expectRevert(); // OwnableInvalidOwner(address(0))
        showcase.transferOwnership(address(0));
    }

    function test_RenounceOwnership() public {
        vm.prank(admin);
        vm.expectEmit(true, true, false, false);
        emit OwnershipTransferred(admin, address(0));

        showcase.renounceOwnership();
        assertEq(showcase.owner(), address(0));
    }

    // =========================================================================
    // PAUSABLE FUNCTIONALITY
    // =========================================================================

    function test_Pause() public {
        vm.prank(admin);
        vm.expectEmit(true, false, false, false);
        emit Paused(admin);

        showcase.pause();
        assertTrue(showcase.paused());
    }

    function test_Unpause() public {
        vm.prank(admin);
        showcase.pause();

        vm.prank(admin);
        vm.expectEmit(true, false, false, false);
        emit Unpaused(admin);

        showcase.unpause();
        assertFalse(showcase.paused());
    }

    function test_Pause_RevertWhen_NotOwner() public {
        vm.prank(user1);
        vm.expectRevert(); // OwnableUnauthorized(user1)
        showcase.pause();
    }

    // =========================================================================
    // DEPOSIT FUNCTIONALITY
    // =========================================================================

    function test_Deposit() public {
        vm.deal(user1, 10 ether);
        vm.prank(user1);

        vm.expectEmit(true, true, false, true);
        emit Transfer(address(0), user1, 5 ether);

        uint256 deposited = showcase.deposit{value: 5 ether}();

        assertEq(deposited, 5 ether);
        assertEq(showcase.getBalance(user1), 5 ether);
    }

    function test_Deposit_RevertWhen_Paused() public {
        vm.prank(admin);
        showcase.pause();

        vm.deal(user1, 1 ether);
        vm.prank(user1);
        vm.expectRevert(); // EnforcedPause()
        showcase.deposit{value: 1 ether}();
    }

    // =========================================================================
    // TRANSFER FUNCTIONALITY
    // =========================================================================

    function test_Transfer() public {
        // Setup: deposit first
        vm.deal(user1, 10 ether);
        vm.prank(user1);
        showcase.deposit{value: 10 ether}();

        // Transfer
        vm.prank(user1);
        vm.expectEmit(true, true, false, true);
        emit Transfer(user1, user2, 3 ether);

        bool success = showcase.transfer(user2, 3 ether);

        assertTrue(success);
        assertEq(showcase.getBalance(user1), 7 ether);
        assertEq(showcase.getBalance(user2), 3 ether);
    }

    function test_Transfer_RevertWhen_InsufficientBalance() public {
        vm.deal(user1, 1 ether);
        vm.prank(user1);
        showcase.deposit{value: 1 ether}();

        vm.prank(user1);
        vm.expectRevert(abi.encodeWithSelector(
            IShowcaseWithInheritance.InsufficientBalance.selector,
            1 ether,
            10 ether
        ));
        showcase.transfer(user2, 10 ether);
    }

    function test_Transfer_RevertWhen_Paused() public {
        vm.deal(user1, 10 ether);
        vm.prank(user1);
        showcase.deposit{value: 10 ether}();

        vm.prank(admin);
        showcase.pause();

        vm.prank(user1);
        vm.expectRevert(); // EnforcedPause()
        showcase.transfer(user2, 1 ether);
    }

    function test_Transfer_RevertWhen_ZeroAddress() public {
        vm.deal(user1, 10 ether);
        vm.prank(user1);
        showcase.deposit{value: 10 ether}();

        vm.prank(user1);
        vm.expectRevert("Zero address");
        showcase.transfer(address(0), 1 ether);
    }

    // =========================================================================
    // TREASURY MANAGEMENT
    // =========================================================================

    function test_SetTreasury() public {
        vm.prank(admin);
        showcase.setTreasury(user1);
        assertEq(showcase.getTreasury(), user1);
    }

    function test_SetTreasury_RevertWhen_NotOwner() public {
        vm.prank(user1);
        vm.expectRevert(); // OwnableUnauthorized(user1)
        showcase.setTreasury(user2);
    }

    function test_SetTreasury_RevertWhen_ZeroAddress() public {
        vm.prank(admin);
        vm.expectRevert("Zero address");
        showcase.setTreasury(address(0));
    }

    // =========================================================================
    // FUZZ TESTS
    // =========================================================================

    function testFuzz_Deposit(uint256 amount) public {
        vm.assume(amount > 0 && amount <= 1000 ether);

        vm.deal(user1, amount);
        vm.prank(user1);

        uint256 deposited = showcase.deposit{value: amount}();

        assertEq(deposited, amount);
        assertEq(showcase.getBalance(user1), amount);
    }

    function testFuzz_Transfer(uint256 depositAmount, uint256 transferAmount) public {
        vm.assume(depositAmount > 0 && depositAmount <= 1000 ether);
        vm.assume(transferAmount > 0 && transferAmount <= depositAmount);

        vm.deal(user1, depositAmount);
        vm.prank(user1);
        showcase.deposit{value: depositAmount}();

        vm.prank(user1);
        bool success = showcase.transfer(user2, transferAmount);

        assertTrue(success);
        assertEq(showcase.getBalance(user1), depositAmount - transferAmount);
        assertEq(showcase.getBalance(user2), transferAmount);
    }
}
