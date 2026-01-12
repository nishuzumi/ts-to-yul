import { describe, it, expect } from "vitest";
import { compileToYul } from "../../src/compiler.js";

describe("Cryptographic Functions", () => {
  describe("keccak256", () => {
    it("should compile keccak256 with abi.encodePacked", () => {
      const source = `
        export class Test {
          public hash(a: u256, b: u256): bytes32 {
            return keccak256(abi.encodePacked(a, b));
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("keccak256(");
    });

    it("should compile keccak256 with abi.encode", () => {
      const source = `
        export class Test {
          public hash(a: u256): bytes32 {
            return keccak256(abi.encode(a));
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("keccak256(");
    });
  });

  describe("sha256", () => {
    it("should compile sha256", () => {
      const source = `
        export class Test {
          public hash(a: u256): bytes32 {
            return sha256(abi.encodePacked(a));
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("__sha256");
    });
  });

  describe("ripemd160", () => {
    it("should compile ripemd160", () => {
      const source = `
        export class Test {
          public hash(a: u256): bytes20 {
            return ripemd160(abi.encodePacked(a));
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("__ripemd160");
    });
  });

  describe("ecrecover", () => {
    it("should compile ecrecover", () => {
      const source = `
        export class Test {
          public recover(hash: bytes32, v: u8, r: bytes32, s: bytes32): address {
            return ecrecover(hash, v, r, s);
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("__ecrecover");
    });
  });

  describe("addmod and mulmod", () => {
    it("should compile addmod", () => {
      const source = `
        export class Test {
          public add(a: u256, b: u256, n: u256): u256 {
            return addmod(a, b, n);
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("addmod(");
    });

    it("should compile mulmod", () => {
      const source = `
        export class Test {
          public mul(a: u256, b: u256, n: u256): u256 {
            return mulmod(a, b, n);
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("mulmod(");
    });
  });
});
