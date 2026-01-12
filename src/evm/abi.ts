import { keccak256, toBytes } from "viem";
import type { Parameter } from "../analyzer/index.js";
import { mapType, toSolidityType, type TypeContext } from "./types.js";

/**
 * Compute function selector from function name and parameters
 * selector = keccak256(signature)[0:4]
 */
export function computeSelector(name: string, params: Parameter[]): string {
  const signature = computeSignature(name, params);
  const hash = keccak256(toBytes(signature));
  // Return first 4 bytes as hex (0x + 8 hex chars)
  // hash is already a hex string like "0x6d4ce63c..."
  return hash.slice(0, 10) as `0x${string}`;
}

/**
 * Compute function selector from a signature string
 * e.g., "InsufficientBalance(uint256,uint256)" -> 0x12345678
 * Returns the selector as a bigint for direct use in Yul
 */
export function computeSelectorFromSignature(signature: string): bigint {
  const hash = keccak256(toBytes(signature));
  // First 4 bytes as bigint
  return BigInt(hash.slice(0, 10));
}

/**
 * Compute function signature
 * e.g., "transfer(address,uint256)"
 */
export function computeSignature(name: string, params: Parameter[]): string {
  const paramTypes = params.map((p) => toSolidityType(p.type)).join(",");
  return `${name}(${paramTypes})`;
}

/**
 * Compute event signature (topic0)
 * Returns full keccak256 hash (32 bytes) as hex string
 * e.g., keccak256("Transfer(address,address,uint256)")
 */
export function computeEventSignature(
  name: string,
  params: { name: string; type: string }[],
  context?: TypeContext
): string {
  const paramTypes = params.map((p) => toSolidityType(mapType(p.type, context))).join(",");
  const signature = `${name}(${paramTypes})`;
  const hash = keccak256(toBytes(signature));
  return hash;
}

/**
 * Encode calldata for a function call
 */
export function encodeCalldata(selector: string, args: bigint[]): Uint8Array {
  // selector (4 bytes) + args (32 bytes each)
  const data = new Uint8Array(4 + args.length * 32);

  // Write selector
  const selectorBytes = hexToBytes(selector);
  data.set(selectorBytes, 0);

  // Write args (each padded to 32 bytes)
  for (let i = 0; i < args.length; i++) {
    const argBytes = bigintToBytes32(args[i]!);
    data.set(argBytes, 4 + i * 32);
  }

  return data;
}

/**
 * Decode return data
 */
export function decodeReturnData(data: Uint8Array): bigint[] {
  const results: bigint[] = [];
  for (let i = 0; i < data.length; i += 32) {
    const chunk = data.slice(i, i + 32);
    results.push(bytes32ToBigint(chunk));
  }
  return results;
}

function hexToBytes(hex: string): Uint8Array {
  const cleanHex = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(cleanHex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function bigintToBytes32(value: bigint): Uint8Array {
  const bytes = new Uint8Array(32);
  let v = value;
  for (let i = 31; i >= 0; i--) {
    bytes[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return bytes;
}

function bytes32ToBigint(bytes: Uint8Array): bigint {
  let result = 0n;
  for (let i = 0; i < bytes.length; i++) {
    result = (result << 8n) | BigInt(bytes[i]!);
  }
  return result;
}
