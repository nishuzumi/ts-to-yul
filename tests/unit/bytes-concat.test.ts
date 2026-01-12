import { describe, it, expect } from "vitest";
import { compileToYul } from "../../src/compiler.js";

describe("bytes.concat", () => {
  describe("basic concatenation", () => {
    it("should compile bytes.concat with two bytes32 arguments", () => {
      const source = `
        export class Test {
          public concat2(a: bytes32, b: bytes32): bytes {
            return bytes.concat(a, b);
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("__bytes_concat_2");
    });

    it("should compile bytes.concat with three arguments", () => {
      const source = `
        export class Test {
          public concat3(a: bytes32, b: bytes32, c: bytes32): bytes {
            return bytes.concat(a, b, c);
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("__bytes_concat_3");
    });

    it("should compile bytes.concat with single argument", () => {
      const source = `
        export class Test {
          public concat1(a: bytes32): bytes {
            return bytes.concat(a);
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("__bytes_concat_1");
    });

    it("should compile bytes.concat with four arguments", () => {
      const source = `
        export class Test {
          public concat4(a: bytes32, b: bytes32, c: bytes32, d: bytes32): bytes {
            return bytes.concat(a, b, c, d);
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("__bytes_concat_4");
    });
  });

  describe("empty bytes.concat", () => {
    it("should compile bytes.concat with no arguments", () => {
      const source = `
        export class Test {
          public emptyConcat(): bytes {
            return bytes.concat();
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("__empty_bytes");
    });
  });

  describe("mixed types", () => {
    it("should compile bytes.concat with bytes20 values", () => {
      const source = `
        export class Test {
          public concatBytes20(a: bytes20, b: bytes20): bytes {
            return bytes.concat(a, b);
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("__bytes_concat_2");
    });

    it("should compile bytes.concat with different sizes", () => {
      const source = `
        export class Test {
          public concatMixed(a: bytes4, b: bytes32): bytes {
            return bytes.concat(a, b);
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("__bytes_concat_2");
    });
  });

  describe("helper function generation", () => {
    it("should generate proper memory layout", () => {
      const source = `
        export class Test {
          public concat(a: bytes32, b: bytes32): bytes {
            return bytes.concat(a, b);
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      // Should have mload(64) for free memory pointer (0x40 = 64)
      expect(result.yul).toContain("mload(64)");
      // Should have mstore operations
      expect(result.yul).toContain("mstore(");
    });

    it("should update free memory pointer", () => {
      const source = `
        export class Test {
          public concat(a: bytes32): bytes {
            return bytes.concat(a);
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      // Should update 64 (0x40) with new free memory pointer
      const yul = result.yul || "";
      // Check for mstore(64, ...) for free memory pointer update
      expect(yul).toMatch(/mstore\(64/);
    });
  });

  describe("string.concat", () => {
    it("should compile string.concat with bytes arguments", () => {
      const source = `
        export class Test {
          public concatStr(a: bytes32, b: bytes32): bytes {
            return string.concat(a, b);
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      // string.concat uses the same helper as bytes.concat
      expect(result.yul).toContain("__bytes_concat_2");
    });
  });
});
