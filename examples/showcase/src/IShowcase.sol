// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title IShowcase
 * @notice Interface for the ShowcaseSimple contract
 * @dev This interface matches the simplified showcase demonstrating 132 Solidity features
 */
interface IShowcase {
    // Events
    event Transfer(address indexed from, address indexed to, uint256 amount);
    event Approval(address indexed owner, address indexed spender, uint256 amount);
    event OrderCreated(uint256 indexed orderId, address indexed buyer, uint256 amount, uint256 price);

    // Custom errors
    error InsufficientBalance(uint256 available, uint256 required);
    error InvalidAmount(uint256 amount);
    error Unauthorized(address caller);
    error ZeroAddress();

    // View functions - state getters
    function totalSupply() external view returns (uint256);
    function balances(address account) external view returns (uint256);
    function owner() external view returns (address);
    function paused() external view returns (bool);
    function getBalance(address account) external view returns (uint256);

    // Block properties
    function getBlockInfo() external view returns (
        uint256 blockNumber,
        uint256 timestamp,
        uint256 chainId,
        address coinbase,
        uint256 basefee,
        uint256 gaslimit,
        uint256 difficulty,
        uint256 prevrandao,
        uint256 blobbasefee
    );

    // Message properties
    function getMsgInfo() external view returns (
        address sender,
        uint256 value,
        bytes4 sig,
        address origin,
        uint256 gasprice
    );

    // Units
    function getUnits() external pure returns (
        uint256 weiUnit,
        uint256 gweiUnit,
        uint256 etherUnit,
        uint256 secondsUnit,
        uint256 minutesUnit,
        uint256 hoursUnit,
        uint256 daysUnit,
        uint256 weeksUnit
    );

    // Constants and immutables
    function getConstants() external view returns (uint256 maxSupply, uint256 version);
    function getImmutables() external view returns (uint256 deployTime, address deployer);

    // Contract info
    function getContractAddress() external view returns (address);
    function getContractBalance() external view returns (uint256);

    // Struct getters
    function getOrder(uint256 orderId) external view returns (
        uint256 id,
        address buyer,
        uint256 amount,
        uint256 price,
        uint256 status,
        uint256 timestamp
    );
    function getUserInfo(address account) external view returns (
        uint256 balance,
        uint256 lastUpdate,
        uint256 role,
        bool isActive
    );

    // Address info
    function getAddressInfo(address addr) external view returns (
        uint256 balance,
        uint256 codeSize,
        bytes32 codehash
    );

    // Pure functions
    function pureAdd(uint256 a, uint256 b) external pure returns (uint256);
    function arithmeticOps(uint256 a, uint256 b) external pure returns (
        uint256 add,
        uint256 sub,
        uint256 mul,
        uint256 div,
        uint256 mod,
        uint256 pow
    );
    function comparisonOps(uint256 a, uint256 b) external pure returns (
        bool eq,
        bool neq,
        bool lt,
        bool gt,
        bool lte,
        bool gte
    );
    function compoundOps(uint256 a, uint256 b) external pure returns (uint256);
    function bitwiseOps(uint256 a, uint256 b) external pure returns (
        uint256 and_,
        uint256 or_,
        uint256 xor_,
        uint256 not_,
        uint256 shl_,
        uint256 shr_
    );
    function logicalOps(bool a, bool b) external pure returns (bool and_, bool or_, bool not_);
    function testUnchecked(uint256 a, uint256 b) external pure returns (uint256);
    function calcWithUnits(uint256 ethAmount, uint256 daysCount) external pure returns (
        uint256 weiAmount,
        uint256 secondsTotal
    );

    // State modifying functions
    function deposit() external payable returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function pause() external;
    function unpause() external;
    function setFee(uint128 newFee) external;
    function createOrder(uint256 id, address buyer, uint256 amount, uint256 price) external;
    function arrayOps(uint256 value) external returns (uint256);
    function mappingOps(address account, address spender, uint256 value) external;
    function structOps(address account) external;
    function bytesOps() external;
    function inlineAssembly(uint256 a, uint256 b) external returns (uint256);
    function batchTransfer(address[] calldata recipients, uint256[] calldata amounts) external returns (uint256);
    function processArray(uint256[] calldata items, uint256 start, uint256 end) external returns (uint256);
    function getSlice(uint256[] calldata items, uint256 start, uint256 end) external returns (uint256[] calldata);
    function otherOps(uint256 a, uint256 b, bool flag, address account) external returns (uint256);
    function testControl(uint256 count, bool flag) external returns (uint256);
    function testErrors(uint256 amount, bool flag) external;
    function publicFunction(uint256 value) external returns (uint256);
    function externalFunction(uint256 value) external returns (uint256);
    function testGlobalFunctions(
        uint256 blockNum,
        uint256 blobIdx,
        uint256 a,
        uint256 b,
        uint256 n,
        bytes32 hash,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external returns (
        bytes32 blockhashResult,
        bytes32 blobhashResult,
        uint256 gasleftResult,
        uint256 addmodResult,
        uint256 mulmodResult,
        address ecrecoverResult
    );
    function testAbiEncoding(uint256 value, address addr, bytes4 sel) external returns (uint256);
    function lowLevelCalls(address target, uint256 data) external returns (uint256);
    function transferETH(address payable to, uint256 amount) external;
    function sendETH(address payable to, uint256 amount) external returns (bool);
    function testTryCatch(address target) external returns (uint256);

    // Receive ETH
    receive() external payable;
}
