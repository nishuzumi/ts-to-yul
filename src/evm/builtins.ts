/**
 * EVM builtin functions (opcodes)
 */

export interface Builtin {
  name: string;
  yulName: string;
  inputs: number;
  outputs: number;
  category: OpcodeCategory;
}

export type OpcodeCategory =
  | "arithmetic"
  | "comparison"
  | "bitwise"
  | "memory"
  | "storage"
  | "execution"
  | "block"
  | "transaction"
  | "logging"
  | "system"
  | "control";

/**
 * All EVM opcodes as Yul builtins
 */
export const BUILTINS: Record<string, Builtin> = {
  // Arithmetic
  add: { name: "add", yulName: "add", inputs: 2, outputs: 1, category: "arithmetic" },
  sub: { name: "sub", yulName: "sub", inputs: 2, outputs: 1, category: "arithmetic" },
  mul: { name: "mul", yulName: "mul", inputs: 2, outputs: 1, category: "arithmetic" },
  div: { name: "div", yulName: "div", inputs: 2, outputs: 1, category: "arithmetic" },
  sdiv: { name: "sdiv", yulName: "sdiv", inputs: 2, outputs: 1, category: "arithmetic" },
  mod: { name: "mod", yulName: "mod", inputs: 2, outputs: 1, category: "arithmetic" },
  smod: { name: "smod", yulName: "smod", inputs: 2, outputs: 1, category: "arithmetic" },
  exp: { name: "exp", yulName: "exp", inputs: 2, outputs: 1, category: "arithmetic" },
  addmod: { name: "addmod", yulName: "addmod", inputs: 3, outputs: 1, category: "arithmetic" },
  mulmod: { name: "mulmod", yulName: "mulmod", inputs: 3, outputs: 1, category: "arithmetic" },
  signextend: {
    name: "signextend",
    yulName: "signextend",
    inputs: 2,
    outputs: 1,
    category: "arithmetic",
  },

  // Comparison
  lt: { name: "lt", yulName: "lt", inputs: 2, outputs: 1, category: "comparison" },
  gt: { name: "gt", yulName: "gt", inputs: 2, outputs: 1, category: "comparison" },
  slt: { name: "slt", yulName: "slt", inputs: 2, outputs: 1, category: "comparison" },
  sgt: { name: "sgt", yulName: "sgt", inputs: 2, outputs: 1, category: "comparison" },
  eq: { name: "eq", yulName: "eq", inputs: 2, outputs: 1, category: "comparison" },
  iszero: { name: "iszero", yulName: "iszero", inputs: 1, outputs: 1, category: "comparison" },

  // Bitwise
  and: { name: "and", yulName: "and", inputs: 2, outputs: 1, category: "bitwise" },
  or: { name: "or", yulName: "or", inputs: 2, outputs: 1, category: "bitwise" },
  xor: { name: "xor", yulName: "xor", inputs: 2, outputs: 1, category: "bitwise" },
  not: { name: "not", yulName: "not", inputs: 1, outputs: 1, category: "bitwise" },
  byte: { name: "byte", yulName: "byte", inputs: 2, outputs: 1, category: "bitwise" },
  shl: { name: "shl", yulName: "shl", inputs: 2, outputs: 1, category: "bitwise" },
  shr: { name: "shr", yulName: "shr", inputs: 2, outputs: 1, category: "bitwise" },
  sar: { name: "sar", yulName: "sar", inputs: 2, outputs: 1, category: "bitwise" },

  // Memory
  mload: { name: "mload", yulName: "mload", inputs: 1, outputs: 1, category: "memory" },
  mstore: { name: "mstore", yulName: "mstore", inputs: 2, outputs: 0, category: "memory" },
  mstore8: { name: "mstore8", yulName: "mstore8", inputs: 2, outputs: 0, category: "memory" },
  msize: { name: "msize", yulName: "msize", inputs: 0, outputs: 1, category: "memory" },
  mcopy: { name: "mcopy", yulName: "mcopy", inputs: 3, outputs: 0, category: "memory" },

  // Storage
  sload: { name: "sload", yulName: "sload", inputs: 1, outputs: 1, category: "storage" },
  sstore: { name: "sstore", yulName: "sstore", inputs: 2, outputs: 0, category: "storage" },
  tload: { name: "tload", yulName: "tload", inputs: 1, outputs: 1, category: "storage" },
  tstore: { name: "tstore", yulName: "tstore", inputs: 2, outputs: 0, category: "storage" },

  // Execution context
  gas: { name: "gas", yulName: "gas", inputs: 0, outputs: 1, category: "execution" },
  address: { name: "address", yulName: "address", inputs: 0, outputs: 1, category: "execution" },
  balance: { name: "balance", yulName: "balance", inputs: 1, outputs: 1, category: "execution" },
  selfbalance: {
    name: "selfbalance",
    yulName: "selfbalance",
    inputs: 0,
    outputs: 1,
    category: "execution",
  },
  caller: { name: "caller", yulName: "caller", inputs: 0, outputs: 1, category: "execution" },
  callvalue: {
    name: "callvalue",
    yulName: "callvalue",
    inputs: 0,
    outputs: 1,
    category: "execution",
  },
  calldataload: {
    name: "calldataload",
    yulName: "calldataload",
    inputs: 1,
    outputs: 1,
    category: "execution",
  },
  calldatasize: {
    name: "calldatasize",
    yulName: "calldatasize",
    inputs: 0,
    outputs: 1,
    category: "execution",
  },
  calldatacopy: {
    name: "calldatacopy",
    yulName: "calldatacopy",
    inputs: 3,
    outputs: 0,
    category: "execution",
  },
  codesize: { name: "codesize", yulName: "codesize", inputs: 0, outputs: 1, category: "execution" },
  codecopy: { name: "codecopy", yulName: "codecopy", inputs: 3, outputs: 0, category: "execution" },
  extcodesize: {
    name: "extcodesize",
    yulName: "extcodesize",
    inputs: 1,
    outputs: 1,
    category: "execution",
  },
  extcodecopy: {
    name: "extcodecopy",
    yulName: "extcodecopy",
    inputs: 4,
    outputs: 0,
    category: "execution",
  },
  extcodehash: {
    name: "extcodehash",
    yulName: "extcodehash",
    inputs: 1,
    outputs: 1,
    category: "execution",
  },
  returndatasize: {
    name: "returndatasize",
    yulName: "returndatasize",
    inputs: 0,
    outputs: 1,
    category: "execution",
  },
  returndatacopy: {
    name: "returndatacopy",
    yulName: "returndatacopy",
    inputs: 3,
    outputs: 0,
    category: "execution",
  },

  // Block context
  blockhash: { name: "blockhash", yulName: "blockhash", inputs: 1, outputs: 1, category: "block" },
  coinbase: { name: "coinbase", yulName: "coinbase", inputs: 0, outputs: 1, category: "block" },
  timestamp: { name: "timestamp", yulName: "timestamp", inputs: 0, outputs: 1, category: "block" },
  number: { name: "number", yulName: "number", inputs: 0, outputs: 1, category: "block" },
  difficulty: {
    name: "difficulty",
    yulName: "difficulty",
    inputs: 0,
    outputs: 1,
    category: "block",
  },
  prevrandao: {
    name: "prevrandao",
    yulName: "prevrandao",
    inputs: 0,
    outputs: 1,
    category: "block",
  },
  gaslimit: { name: "gaslimit", yulName: "gaslimit", inputs: 0, outputs: 1, category: "block" },
  chainid: { name: "chainid", yulName: "chainid", inputs: 0, outputs: 1, category: "block" },
  basefee: { name: "basefee", yulName: "basefee", inputs: 0, outputs: 1, category: "block" },
  blobhash: { name: "blobhash", yulName: "blobhash", inputs: 1, outputs: 1, category: "block" },
  blobbasefee: {
    name: "blobbasefee",
    yulName: "blobbasefee",
    inputs: 0,
    outputs: 1,
    category: "block",
  },

  // Transaction
  origin: { name: "origin", yulName: "origin", inputs: 0, outputs: 1, category: "transaction" },
  gasprice: {
    name: "gasprice",
    yulName: "gasprice",
    inputs: 0,
    outputs: 1,
    category: "transaction",
  },

  // Logging
  log0: { name: "log0", yulName: "log0", inputs: 2, outputs: 0, category: "logging" },
  log1: { name: "log1", yulName: "log1", inputs: 3, outputs: 0, category: "logging" },
  log2: { name: "log2", yulName: "log2", inputs: 4, outputs: 0, category: "logging" },
  log3: { name: "log3", yulName: "log3", inputs: 5, outputs: 0, category: "logging" },
  log4: { name: "log4", yulName: "log4", inputs: 6, outputs: 0, category: "logging" },

  // System operations
  call: { name: "call", yulName: "call", inputs: 7, outputs: 1, category: "system" },
  callcode: { name: "callcode", yulName: "callcode", inputs: 7, outputs: 1, category: "system" },
  delegatecall: {
    name: "delegatecall",
    yulName: "delegatecall",
    inputs: 6,
    outputs: 1,
    category: "system",
  },
  staticcall: {
    name: "staticcall",
    yulName: "staticcall",
    inputs: 6,
    outputs: 1,
    category: "system",
  },
  create: { name: "create", yulName: "create", inputs: 3, outputs: 1, category: "system" },
  create2: { name: "create2", yulName: "create2", inputs: 4, outputs: 1, category: "system" },
  selfdestruct: {
    name: "selfdestruct",
    yulName: "selfdestruct",
    inputs: 1,
    outputs: 0,
    category: "system",
  },

  // Control flow
  return: { name: "return", yulName: "return", inputs: 2, outputs: 0, category: "control" },
  revert: { name: "revert", yulName: "revert", inputs: 2, outputs: 0, category: "control" },
  stop: { name: "stop", yulName: "stop", inputs: 0, outputs: 0, category: "control" },
  invalid: { name: "invalid", yulName: "invalid", inputs: 0, outputs: 0, category: "control" },

  // Crypto
  keccak256: { name: "keccak256", yulName: "keccak256", inputs: 2, outputs: 1, category: "system" },
};

/**
 * Get builtin by name
 */
export function getBuiltin(name: string): Builtin | undefined {
  return BUILTINS[name];
}

/**
 * Check if a name is a builtin
 */
export function isBuiltin(name: string): boolean {
  return name in BUILTINS;
}
