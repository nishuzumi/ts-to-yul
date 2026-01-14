import { describe, it, expect } from "vitest";
import { compileToYul } from "../../src/compiler.js";

describe("ABI Encoding", () => {
  describe("abi.encode", () => {
    it("should compile abi.encode with single argument", () => {
      const source = `
        export class Test {
          public encode(value: u256): u256 {
            const data = abi.encode(value);
            return 0n;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("__abi_encode");
    });

    it("should compile abi.encode with multiple arguments", () => {
      const source = `
        export class Test {
          public encode(a: u256, b: u256): u256 {
            const data = abi.encode(a, b);
            return 0n;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe("abi.encodePacked", () => {
    it("should compile abi.encodePacked", () => {
      const source = `
        export class Test {
          public encodePacked(a: u256, b: u256): u256 {
            const data = abi.encodePacked(a, b);
            return 0n;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("__abi_encode_packed");
    });
  });

  describe("abi.encodeWithSelector", () => {
    it("should compile abi.encodeWithSelector", () => {
      const source = `
        export class Test {
          public encodeWithSel(sel: bytes4, a: u256): u256 {
            const data = abi.encodeWithSelector(sel, a);
            return 0n;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("__abi_encode_selector");
    });
  });

  describe("abi.encodeWithSignature", () => {
    it("should compile abi.encodeWithSignature", () => {
      const source = `
        export class Test {
          public encodeWithSig(a: u256): u256 {
            const data = abi.encodeWithSignature("transfer(uint256)", a);
            return 0n;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe("abi.decode", () => {
    it("should compile abi.decode", () => {
      const source = `
        export class Test {
          public decode(data: u256): u256 {
            const value: u256 = abi.decode(data, ["uint256"]);
            return value;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("__abi_decode");
    });

    it("should load decoded values starting at data + 0 (no length prefix)", () => {
      const source = `
        export class Test {
          public decode(data: u256): u256 {
            const value: u256 = abi.decode(data, ["uint256"]);
            return value;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      // abi.decode input is raw ABI data; first value should be at data + 0
      expect(result.yul).toContain("mload(add(data, 0))");
    });
  });

  describe("Signed Integer Encoding", () => {
    it("should handle i256 in function parameters", () => {
      const source = `
        export class Test {
          public negateValue(x: i256): i256 {
            return 0n - x;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("sub(0,");
    });

    it("should compile signed division with sdiv", () => {
      const source = `
        export class Test {
          public divide(a: i256, b: i256): i256 {
            return a / b;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("sdiv(");
    });

    it("should compile signed modulo with smod", () => {
      const source = `
        export class Test {
          public modulo(a: i256, b: i256): i256 {
            return a % b;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("smod(");
    });

    it("should compile signed comparison with slt", () => {
      const source = `
        export class Test {
          public lessThan(a: i256, b: i256): bool {
            return a < b;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("slt(");
    });

    it("should compile signed comparison with sgt", () => {
      const source = `
        export class Test {
          public greaterThan(a: i256, b: i256): bool {
            return a > b;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("sgt(");
    });
  });
});
