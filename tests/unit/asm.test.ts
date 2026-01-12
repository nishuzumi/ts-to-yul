import { describe, it, expect } from "vitest";
import { compileToYul } from "../../src/compiler.js";

describe("Inline Assembly (asm)", () => {
  describe("Basic asm statements", () => {
    it("should compile simple asm with variable assignment", () => {
      const source = `
        export class Test {
          public getGas(): u256 {
            let result: u256;
            asm\`
              \${result} := gas()
            \`;
            return result;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("gas()");
    });

    it("should compile asm with mload", () => {
      const source = `
        export class Test {
          public readFreeMemory(): u256 {
            let ptr: u256;
            asm\`
              \${ptr} := mload(0x40)
            \`;
            return ptr;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("mload");
    });

    it("should compile asm with caller()", () => {
      const source = `
        export class Test {
          public getCaller(): address {
            let addr: address;
            asm\`
              \${addr} := caller()
            \`;
            return addr;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("caller()");
    });

    it("should compile asm with arithmetic operations", () => {
      const source = `
        export class Test {
          public addValues(a: u256, b: u256): u256 {
            let result: u256;
            asm\`
              \${result} := add(\${a}, \${b})
            \`;
            return result;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("add(");
    });
  });

  describe("asm with interpolation", () => {
    it("should compile asm with variable interpolation", () => {
      const source = `
        export class Test {
          public multiply(x: u256, y: u256): u256 {
            let result: u256;
            asm\`
              \${result} := mul(\${x}, \${y})
            \`;
            return result;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("mul(");
    });

    it("should compile asm with nested expressions", () => {
      const source = `
        export class Test {
          public complexOp(a: u256, b: u256, c: u256): u256 {
            let result: u256;
            asm\`
              let temp := mul(\${a}, \${b})
              \${result} := add(temp, \${c})
            \`;
            return result;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("add(");
      expect(result.yul).toContain("mul(");
    });
  });

  describe("asm with EVM opcodes", () => {
    it("should compile asm with callvalue", () => {
      const source = `
        export class Test {
          public getValue(): u256 {
            let val: u256;
            asm\`
              \${val} := callvalue()
            \`;
            return val;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("callvalue()");
    });

    it("should compile asm with timestamp", () => {
      const source = `
        export class Test {
          public getTime(): u256 {
            let t: u256;
            asm\`
              \${t} := timestamp()
            \`;
            return t;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("timestamp()");
    });

    it("should compile asm with chainid", () => {
      const source = `
        export class Test {
          public getChainId(): u256 {
            let id: u256;
            asm\`
              \${id} := chainid()
            \`;
            return id;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("chainid()");
    });

    it("should compile asm with selfbalance", () => {
      const source = `
        export class Test {
          public getBalance(): u256 {
            let bal: u256;
            asm\`
              \${bal} := selfbalance()
            \`;
            return bal;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("selfbalance()");
    });

    it("should compile asm with address()", () => {
      const source = `
        export class Test {
          public getContractAddress(): address {
            let addr: address;
            asm\`
              \${addr} := address()
            \`;
            return addr;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("address()");
    });
  });

  describe("asm in complex contexts", () => {
    it("should compile asm with iszero", () => {
      const source = `
        export class Test {
          public isZero(x: u256): u256 {
            let result: u256;
            asm\`
              \${result} := iszero(\${x})
            \`;
            return result;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("iszero(");
    });

    it("should compile asm with storage operations", () => {
      const source = `
        export class Test {
          @storage value: u256 = 0n;

          public rawStore(newValue: u256): void {
            asm\`
              sstore(0, \${newValue})
            \`;
          }

          public rawLoad(): u256 {
            let val: u256;
            asm\`
              \${val} := sload(0)
            \`;
            return val;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("sstore(");
      expect(result.yul).toContain("sload(");
    });
  });
});
