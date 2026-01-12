import { describe, it, expect } from "vitest";
import { mapType, fromSolidityType } from "../../src/evm/types.js";

describe("Type Validation", () => {
  describe("Invalid uint types", () => {
    it("should reject u7 (not multiple of 8)", () => {
      expect(() => mapType("u7")).toThrow("bit width must be 8-256 and multiple of 8");
    });

    it("should reject u300 (exceeds 256)", () => {
      expect(() => mapType("u300")).toThrow("bit width must be 8-256 and multiple of 8");
    });

    it("should reject u0 (below minimum)", () => {
      expect(() => mapType("u0")).toThrow("bit width must be 8-256 and multiple of 8");
    });

    it("should reject u4 (not multiple of 8)", () => {
      expect(() => mapType("u4")).toThrow("bit width must be 8-256 and multiple of 8");
    });

    it("should reject Uint<7>", () => {
      expect(() => mapType("Uint<7>")).toThrow("bit width must be 8-256 and multiple of 8");
    });

    it("should reject Uint<512>", () => {
      expect(() => mapType("Uint<512>")).toThrow("bit width must be 8-256 and multiple of 8");
    });
  });

  describe("Invalid int types", () => {
    it("should reject i7 (not multiple of 8)", () => {
      expect(() => mapType("i7")).toThrow("bit width must be 8-256 and multiple of 8");
    });

    it("should reject i300 (exceeds 256)", () => {
      expect(() => mapType("i300")).toThrow("bit width must be 8-256 and multiple of 8");
    });

    it("should reject Int<15>", () => {
      expect(() => mapType("Int<15>")).toThrow("bit width must be 8-256 and multiple of 8");
    });
  });

  describe("Invalid bytes types", () => {
    it("should reject bytes0 (below minimum)", () => {
      expect(() => mapType("bytes0")).toThrow("bytes size must be 1-32");
    });

    it("should reject bytes33 (exceeds maximum)", () => {
      expect(() => mapType("bytes33")).toThrow("bytes size must be 1-32");
    });

    it("should reject bytes64", () => {
      expect(() => mapType("bytes64")).toThrow("bytes size must be 1-32");
    });

    it("should reject Bytes<0>", () => {
      expect(() => mapType("Bytes<0>")).toThrow("bytes size must be 1-32");
    });

    it("should reject Bytes<33>", () => {
      expect(() => mapType("Bytes<33>")).toThrow("bytes size must be 1-32");
    });
  });

  describe("Unknown types", () => {
    it("should reject completely unknown type names", () => {
      expect(() => mapType("unknownType")).toThrow("Unknown type");
    });

    it("should reject foo123", () => {
      expect(() => mapType("foo123")).toThrow("Unknown type");
    });

    it("should reject random strings", () => {
      expect(() => mapType("notAType")).toThrow("Unknown type");
    });
  });

  describe("Valid boundary types - uint", () => {
    it("should accept u8 (minimum)", () => {
      expect(mapType("u8")).toEqual({ kind: "uint", bits: 8 });
    });

    it("should accept u16", () => {
      expect(mapType("u16")).toEqual({ kind: "uint", bits: 16 });
    });

    it("should accept u32", () => {
      expect(mapType("u32")).toEqual({ kind: "uint", bits: 32 });
    });

    it("should accept u64", () => {
      expect(mapType("u64")).toEqual({ kind: "uint", bits: 64 });
    });

    it("should accept u128", () => {
      expect(mapType("u128")).toEqual({ kind: "uint", bits: 128 });
    });

    it("should accept u256 (maximum)", () => {
      expect(mapType("u256")).toEqual({ kind: "uint", bits: 256 });
    });

    it("should accept Uint<160> (address-sized)", () => {
      expect(mapType("Uint<160>")).toEqual({ kind: "uint", bits: 160 });
    });
  });

  describe("Valid boundary types - int", () => {
    it("should accept i8 (minimum)", () => {
      expect(mapType("i8")).toEqual({ kind: "int", bits: 8 });
    });

    it("should accept i256 (maximum)", () => {
      expect(mapType("i256")).toEqual({ kind: "int", bits: 256 });
    });

    it("should accept Int<128>", () => {
      expect(mapType("Int<128>")).toEqual({ kind: "int", bits: 128 });
    });
  });

  describe("Valid boundary types - bytes", () => {
    it("should accept bytes1 (minimum)", () => {
      expect(mapType("bytes1")).toEqual({ kind: "bytes", size: 1 });
    });

    it("should accept bytes4 (selector size)", () => {
      expect(mapType("bytes4")).toEqual({ kind: "bytes", size: 4 });
    });

    it("should accept bytes20 (address size)", () => {
      expect(mapType("bytes20")).toEqual({ kind: "bytes", size: 20 });
    });

    it("should accept bytes32 (maximum)", () => {
      expect(mapType("bytes32")).toEqual({ kind: "bytes", size: 32 });
    });

    it("should accept Bytes<16>", () => {
      expect(mapType("Bytes<16>")).toEqual({ kind: "bytes", size: 16 });
    });
  });

  describe("fromSolidityType validation", () => {
    it("should reject uint7", () => {
      expect(() => fromSolidityType("uint7")).toThrow("bit width must be 8-256");
    });

    it("should reject uint300", () => {
      expect(() => fromSolidityType("uint300")).toThrow("bit width must be 8-256");
    });

    it("should reject int15", () => {
      expect(() => fromSolidityType("int15")).toThrow("bit width must be 8-256");
    });

    it("should reject bytes0", () => {
      expect(() => fromSolidityType("bytes0")).toThrow("bytes size must be 1-32");
    });

    it("should reject bytes33", () => {
      expect(() => fromSolidityType("bytes33")).toThrow("bytes size must be 1-32");
    });

    it("should reject unknown types", () => {
      expect(() => fromSolidityType("unknownType")).toThrow("Unknown Solidity type");
    });

    it("should accept uint256", () => {
      expect(fromSolidityType("uint256")).toEqual({ kind: "uint", bits: 256 });
    });

    it("should accept uint (defaults to 256)", () => {
      expect(fromSolidityType("uint")).toEqual({ kind: "uint", bits: 256 });
    });

    it("should accept int (defaults to 256)", () => {
      expect(fromSolidityType("int")).toEqual({ kind: "int", bits: 256 });
    });
  });
});
