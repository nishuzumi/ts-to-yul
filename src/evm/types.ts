/**
 * EVM type definitions
 */

export type EvmType =
  | { kind: "uint"; bits: number }
  | { kind: "int"; bits: number }
  | { kind: "address" }
  | { kind: "bool" }
  | { kind: "bytes"; size: number }
  | { kind: "bytes_dynamic" }
  | { kind: "string" }
  | { kind: "array"; element: EvmType; length?: number }
  | { kind: "mapping"; key: EvmType; value: EvmType }
  | { kind: "tuple"; elements: EvmType[] };

/**
 * Common EVM types
 */
export const EvmTypes = {
  uint256: { kind: "uint", bits: 256 } as EvmType,
  uint128: { kind: "uint", bits: 128 } as EvmType,
  uint64: { kind: "uint", bits: 64 } as EvmType,
  uint32: { kind: "uint", bits: 32 } as EvmType,
  uint8: { kind: "uint", bits: 8 } as EvmType,

  int256: { kind: "int", bits: 256 } as EvmType,
  int128: { kind: "int", bits: 128 } as EvmType,
  int64: { kind: "int", bits: 64 } as EvmType,
  int32: { kind: "int", bits: 32 } as EvmType,
  int8: { kind: "int", bits: 8 } as EvmType,

  address: { kind: "address" } as EvmType,
  bool: { kind: "bool" } as EvmType,

  bytes32: { kind: "bytes", size: 32 } as EvmType,
  bytes20: { kind: "bytes", size: 20 } as EvmType,
  bytes4: { kind: "bytes", size: 4 } as EvmType,
  bytes1: { kind: "bytes", size: 1 } as EvmType,

  bytes: { kind: "bytes_dynamic" } as EvmType,
  string: { kind: "string" } as EvmType,
};

/**
 * Validate integer bit width (must be 8-256 and multiple of 8)
 */
function validateIntegerBits(bits: number, typeName: string): void {
  if (bits < 8 || bits > 256 || bits % 8 !== 0) {
    throw new Error(
      `Invalid type '${typeName}': bit width must be 8-256 and multiple of 8, got ${bits}`
    );
  }
}

/**
 * Validate bytes size (must be 1-32)
 */
function validateBytesSize(size: number, typeName: string): void {
  if (size < 1 || size > 32) {
    throw new Error(`Invalid type '${typeName}': bytes size must be 1-32, got ${size}`);
  }
}

/**
 * Split Mapping<K, V> inner types, handling nested generics
 */
function splitMappingTypes(inner: string): [string, string] {
  let depth = 0;
  for (let i = 0; i < inner.length; i++) {
    const char = inner[i];
    if (char === "<") depth++;
    else if (char === ">") depth--;
    else if (char === "," && depth === 0) {
      return [inner.slice(0, i).trim(), inner.slice(i + 1).trim()];
    }
  }
  throw new Error(`Invalid Mapping type: cannot split 'Mapping<${inner}>'`);
}

/**
 * Type resolution context for custom types (enums, structs)
 */
export interface TypeContext {
  /** Check if a type name is a known enum */
  isEnum?: (name: string) => boolean;
  /** Get struct type as tuple, returns null if not a struct */
  getStructType?: (name: string) => EvmType | null;
}

/**
 * Map TypeScript type name to EVM type
 */
export function mapType(typeName: string, context?: TypeContext): EvmType {
  // Handle Mapping<K, V>
  const mappingMatch = typeName.match(/^Mapping<(.+)>$/);
  if (mappingMatch) {
    const [keyType, valueType] = splitMappingTypes(mappingMatch[1]!);
    return {
      kind: "mapping",
      key: mapType(keyType, context),
      value: mapType(valueType, context),
    };
  }

  // Handle StorageArray<T>
  const storageArrayMatch = typeName.match(/^StorageArray<(.+)>$/);
  if (storageArrayMatch) {
    return {
      kind: "array",
      element: mapType(storageArrayMatch[1]!, context),
    };
  }

  // Handle CalldataArray<T>
  const calldataArrayMatch = typeName.match(/^CalldataArray<(.+)>$/);
  if (calldataArrayMatch) {
    return {
      kind: "array",
      element: mapType(calldataArrayMatch[1]!, context),
    };
  }

  // Handle T[] dynamic array syntax (but not fixed T[N])
  const dynamicArrayMatch = typeName.match(/^(.+)\[\]$/);
  if (dynamicArrayMatch) {
    return {
      kind: "array",
      element: mapType(dynamicArrayMatch[1]!, context),
    };
  }

  // Handle fixed array T[N]
  const fixedArrayMatch = typeName.match(/^(.+)\[(\d+)\]$/);
  if (fixedArrayMatch) {
    return {
      kind: "array",
      element: mapType(fixedArrayMatch[1]!, context),
      length: parseInt(fixedArrayMatch[2]!, 10),
    };
  }

  // Handle StorageBytes
  if (typeName === "StorageBytes") {
    return { kind: "bytes_dynamic" };
  }

  // Handle StorageString
  if (typeName === "StorageString") {
    return { kind: "string" };
  }

  // Handle tuple types: [u256, u256] or [address, u256, bool]
  const tupleMatch = typeName.match(/^\[(.+)\]$/);
  if (tupleMatch) {
    const inner = tupleMatch[1]!;
    const elements = parseTupleElements(inner);
    return { kind: "tuple", elements: elements.map((e) => mapType(e, context)) };
  }

  // Handle u256, u128, etc.
  const uintMatch = typeName.match(/^u(\d+)$/);
  if (uintMatch) {
    const bits = parseInt(uintMatch[1]!, 10);
    validateIntegerBits(bits, typeName);
    return { kind: "uint", bits };
  }

  // Handle Uint<N> generic syntax
  const uintGenericMatch = typeName.match(/^Uint<(\d+)>$/);
  if (uintGenericMatch) {
    const bits = parseInt(uintGenericMatch[1]!, 10);
    validateIntegerBits(bits, typeName);
    return { kind: "uint", bits };
  }

  // Handle i256, i128, etc.
  const intMatch = typeName.match(/^i(\d+)$/);
  if (intMatch) {
    const bits = parseInt(intMatch[1]!, 10);
    validateIntegerBits(bits, typeName);
    return { kind: "int", bits };
  }

  // Handle Int<N> generic syntax
  const intGenericMatch = typeName.match(/^Int<(\d+)>$/);
  if (intGenericMatch) {
    const bits = parseInt(intGenericMatch[1]!, 10);
    validateIntegerBits(bits, typeName);
    return { kind: "int", bits };
  }

  // Handle bytes32, bytes20, etc.
  const bytesMatch = typeName.match(/^bytes(\d+)$/);
  if (bytesMatch) {
    const size = parseInt(bytesMatch[1]!, 10);
    validateBytesSize(size, typeName);
    return { kind: "bytes", size };
  }

  // Handle Bytes<N> generic syntax
  const bytesGenericMatch = typeName.match(/^Bytes<(\d+)>$/);
  if (bytesGenericMatch) {
    const size = parseInt(bytesGenericMatch[1]!, 10);
    validateBytesSize(size, typeName);
    return { kind: "bytes", size };
  }

  // Handle ValueType<T, Brand> - user-defined value types
  const valueTypeMatch = typeName.match(/^ValueType<(.+),\s*"[^"]+">$/);
  if (valueTypeMatch) {
    // Extract the underlying type and recursively map it
    return mapType(valueTypeMatch[1]!.trim(), context);
  }

  // Check for enum type (via context)
  if (context?.isEnum?.(typeName)) {
    return { kind: "uint", bits: 8 };
  }

  // Check for struct type (via context)
  if (context?.getStructType) {
    const structType = context.getStructType(typeName);
    if (structType) return structType;
  }

  // Common types
  switch (typeName) {
    case "address":
    case "addressPayable":
      return EvmTypes.address;
    case "bool":
    case "boolean":
      return EvmTypes.bool;
    case "bytes":
      return EvmTypes.bytes;
    case "string":
      return EvmTypes.string;
    case "bigint":
      return EvmTypes.uint256;
    default:
      throw new Error(`Unknown type '${typeName}': cannot map to EVM type`);
  }
}

/**
 * Parse tuple elements from a comma-separated string
 * Handles nested types like [u256, [address, bool]]
 */
function parseTupleElements(inner: string): string[] {
  const elements: string[] = [];
  let current = "";
  let depth = 0;

  for (const char of inner) {
    if (char === "[") {
      depth++;
      current += char;
    } else if (char === "]") {
      depth--;
      current += char;
    } else if (char === "," && depth === 0) {
      elements.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  if (current.trim()) {
    elements.push(current.trim());
  }

  return elements;
}

/**
 * Get the Solidity type name for ABI encoding
 */
export function toSolidityType(type: EvmType): string {
  switch (type.kind) {
    case "uint":
      return `uint${type.bits}`;
    case "int":
      return `int${type.bits}`;
    case "address":
      return "address";
    case "bool":
      return "bool";
    case "bytes":
      return `bytes${type.size}`;
    case "bytes_dynamic":
      return "bytes";
    case "string":
      return "string";
    case "array":
      if (type.length !== undefined) {
        return `${toSolidityType(type.element)}[${type.length}]`;
      }
      return `${toSolidityType(type.element)}[]`;
    case "mapping":
      return `mapping(${toSolidityType(type.key)} => ${toSolidityType(type.value)})`;
    case "tuple":
      return `(${type.elements.map(toSolidityType).join(",")})`;
  }
}

/**
 * Convert a Solidity type string to EvmType
 * e.g., "uint256" -> { kind: "uint", bits: 256 }
 */
export function fromSolidityType(typeName: string): EvmType {
  // uint<N>
  const uintMatch = typeName.match(/^uint(\d+)?$/);
  if (uintMatch) {
    const bits = uintMatch[1] ? parseInt(uintMatch[1]) : 256;
    validateIntegerBits(bits, typeName);
    return { kind: "uint", bits };
  }

  // int<N>
  const intMatch = typeName.match(/^int(\d+)?$/);
  if (intMatch) {
    const bits = intMatch[1] ? parseInt(intMatch[1]) : 256;
    validateIntegerBits(bits, typeName);
    return { kind: "int", bits };
  }

  // bytes<N>
  const bytesMatch = typeName.match(/^bytes(\d+)$/);
  if (bytesMatch) {
    const size = parseInt(bytesMatch[1]!);
    validateBytesSize(size, typeName);
    return { kind: "bytes", size };
  }

  // Standard types
  switch (typeName) {
    case "address":
      return { kind: "address" };
    case "bool":
      return { kind: "bool" };
    case "bytes":
      return { kind: "bytes_dynamic" };
    case "string":
      return { kind: "string" };
    default:
      throw new Error(`Unknown Solidity type '${typeName}'`);
  }
}

/**
 * Get the byte size of a type in storage/memory
 */
export function typeSize(type: EvmType): number {
  switch (type.kind) {
    case "uint":
    case "int":
      return Math.ceil(type.bits / 8);
    case "address":
      return 20;
    case "bool":
      return 1;
    case "bytes":
      return type.size;
    case "bytes_dynamic":
    case "string":
    case "array":
    case "mapping":
      return 32; // Pointer/slot size
    case "tuple":
      // Each element takes 32 bytes in ABI encoding
      return type.elements.length * 32;
  }
}

/**
 * Check if type is a tuple
 */
export function isTupleType(type: EvmType): type is { kind: "tuple"; elements: EvmType[] } {
  return type.kind === "tuple";
}

/**
 * Get the number of 32-byte words needed for a type
 */
export function typeWordCount(type: EvmType): number {
  if (type.kind === "tuple") {
    return type.elements.length;
  }
  return 1;
}

// ============================================================================
// Unified Type Parsing Utilities
// ============================================================================

/**
 * Parse a TypeScript type name and extract its numeric parameter.
 * Returns null if the pattern doesn't match.
 *
 * Examples:
 *   parseNumericType("u256", "u") -> 256
 *   parseNumericType("i128", "i") -> 128
 *   parseNumericType("bytes32", "bytes") -> 32
 *   parseNumericType("Uint<64>", "Uint") -> 64
 */
function parseNumericType(typeName: string, prefix: string): number | null {
  // Try direct pattern: u256, i128, bytes32
  const directMatch = typeName.match(new RegExp(`^${prefix}(\\d+)$`));
  if (directMatch) {
    return parseInt(directMatch[1]!, 10);
  }

  // Try generic pattern: Uint<256>, Int<128>, Bytes<32>
  const genericMatch = typeName.match(new RegExp(`^${prefix}<(\\d+)>$`, "i"));
  if (genericMatch) {
    return parseInt(genericMatch[1]!, 10);
  }

  return null;
}

/**
 * Get the byte size of a TypeScript type for storage packing.
 * Returns the number of bytes the type occupies (1-32).
 * Types that can't be packed return 32.
 */
export function getTypeByteSize(typeName: string): number {
  // Boolean - 1 byte
  if (typeName === "bool" || typeName === "boolean") {
    return 1;
  }

  // Unsigned integers: u8, u256, Uint<8>, etc.
  const uintBits = parseNumericType(typeName, "u") ?? parseNumericType(typeName, "Uint");
  if (uintBits !== null) {
    return Math.ceil(uintBits / 8);
  }

  // Signed integers: i8, i256, Int<8>, etc.
  const intBits = parseNumericType(typeName, "i") ?? parseNumericType(typeName, "Int");
  if (intBits !== null) {
    return Math.ceil(intBits / 8);
  }

  // Address - 20 bytes
  if (typeName === "address" || typeName === "addressPayable") {
    return 20;
  }

  // Fixed bytes: bytes1, bytes32, Bytes<32>, etc.
  const bytesSize = parseNumericType(typeName, "bytes") ?? parseNumericType(typeName, "Bytes");
  if (bytesSize !== null) {
    return bytesSize;
  }

  // External function - 24 bytes (address + selector)
  if (typeName.startsWith("ExternalFunction<")) {
    return 24;
  }

  // Default: 32 bytes (full slot)
  return 32;
}

/**
 * Get min and max values for a TypeScript type.
 * Returns null for types without numeric bounds.
 */
export function getTypeMinMax(typeName: string): { min: bigint; max: bigint } | null {
  // Unsigned integers
  const uintBits = parseNumericType(typeName, "u") ?? parseNumericType(typeName, "uint");
  if (uintBits !== null && uintBits >= 8 && uintBits <= 256 && uintBits % 8 === 0) {
    return { min: 0n, max: (1n << BigInt(uintBits)) - 1n };
  }

  // Signed integers
  const intBits = parseNumericType(typeName, "i") ?? parseNumericType(typeName, "int");
  if (intBits !== null && intBits >= 8 && intBits <= 256 && intBits % 8 === 0) {
    const halfRange = 1n << BigInt(intBits - 1);
    return { min: -halfRange, max: halfRange - 1n };
  }

  // Address
  if (typeName === "address" || typeName === "addressPayable") {
    return { min: 0n, max: (1n << 160n) - 1n };
  }

  // Boolean
  if (typeName === "bool" || typeName === "boolean") {
    return { min: 0n, max: 1n };
  }

  // Bytes types
  const bytesSize = parseNumericType(typeName, "bytes");
  if (bytesSize !== null && bytesSize >= 1 && bytesSize <= 32) {
    return { min: 0n, max: (1n << BigInt(bytesSize * 8)) - 1n };
  }

  return null;
}

/**
 * Convert TypeScript type name to Solidity type name.
 */
export function tsTypeToSolidityType(tsType: string): string {
  // Unsigned integers
  const uintBits = parseNumericType(tsType, "u") ?? parseNumericType(tsType, "Uint");
  if (uintBits !== null) {
    return `uint${uintBits}`;
  }

  // Signed integers
  const intBits = parseNumericType(tsType, "i") ?? parseNumericType(tsType, "Int");
  if (intBits !== null) {
    return `int${intBits}`;
  }

  // Bytes
  const bytesSize = parseNumericType(tsType, "bytes") ?? parseNumericType(tsType, "Bytes");
  if (bytesSize !== null) {
    return `bytes${bytesSize}`;
  }

  // Common types
  switch (tsType) {
    case "address":
      return "address";
    case "addressPayable":
      return "address";
    case "bool":
    case "boolean":
      return "bool";
    case "string":
      return "string";
    case "bytes":
      return "bytes";
    default:
      return "uint256";
  }
}
