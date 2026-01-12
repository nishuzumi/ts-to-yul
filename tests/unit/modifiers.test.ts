import { describe, it, expect } from "vitest";
import { compileToYul } from "../../src/compiler.js";
import type { AbiFunctionItem, AbiItem } from "../../src/evm/abiGenerator.js";

// Helper to find function in ABI
function findFunction(abi: AbiItem[], name: string): AbiFunctionItem | undefined {
  return abi.find((item): item is AbiFunctionItem => item.type === "function" && item.name === name);
}

describe("Modifiers", () => {
  describe("Visibility", () => {
    it("should expose public functions in ABI", () => {
      const source = `
        export class Test {
          public getValue(): u256 {
            return 42n;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      const fn = findFunction(result.abi, "getValue");
      expect(fn).toBeDefined();
      expect(fn?.name).toBe("getValue");
    });

    it("should not expose private functions in ABI", () => {
      const source = `
        export class Test {
          private helper(): u256 {
            return 42n;
          }

          public getValue(): u256 {
            return this.helper();
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      const fn = findFunction(result.abi, "getValue");
      expect(fn).toBeDefined();
      expect(fn?.name).toBe("getValue");
      // helper should not be in ABI
      expect(findFunction(result.abi, "helper")).toBeUndefined();
    });

    it("should not expose @internal functions in ABI", () => {
      const source = `
        export class Test {
          @internal
          internalFn(): u256 {
            return 42n;
          }

          public getValue(): u256 {
            return this.internalFn();
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      // @internal methods should not be in ABI
      expect(findFunction(result.abi, "internalFn")).toBeUndefined();
      const fn = findFunction(result.abi, "getValue");
      expect(fn).toBeDefined();
    });

    it("should expose @external functions in ABI", () => {
      const source = `
        export class Test {
          @external
          public externalFn(): u256 {
            return 42n;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      const fn = findFunction(result.abi, "externalFn");
      expect(fn).toBeDefined();
      expect(fn?.name).toBe("externalFn");
    });
  });

  describe("State Mutability", () => {
    it("should compile @view functions", () => {
      const source = `
        export class Test {
          @storage value: u256 = 0n;

          @view
          public getValue(): u256 {
            return this.value;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      const fn = findFunction(result.abi, "getValue");
      expect(fn).toBeDefined();
      expect(fn?.stateMutability).toBe("view");
    });

    it("should compile @pure functions", () => {
      const source = `
        export class Test {
          @pure
          public add(a: u256, b: u256): u256 {
            return a + b;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      const fn = findFunction(result.abi, "add");
      expect(fn).toBeDefined();
      expect(fn?.stateMutability).toBe("pure");
    });

    it("should compile @payable functions", () => {
      const source = `
        export class Test {
          @payable
          public deposit(): void {
            // Accept ETH
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      const fn = findFunction(result.abi, "deposit");
      expect(fn).toBeDefined();
      expect(fn?.stateMutability).toBe("payable");
      // Payable functions should NOT have callvalue() check
      expect(result.yul).not.toContain("if callvalue()");
    });

    it("should reject ETH for non-payable functions", () => {
      const source = `
        export class Test {
          public nonPayable(): void {
            // Should reject ETH
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      // Non-payable functions should have callvalue() check
      expect(result.yul).toContain("if callvalue()");
    });
  });

  describe("Variable Modifiers", () => {
    it("should compile @constant", () => {
      const source = `
        export class Test {
          @constant
          public MAX_VALUE: u256 = 1000n;

          public getMax(): u256 {
            return this.MAX_VALUE;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      // Constant should be inlined, not stored
      expect(result.yul).toContain("1000");
    });

    it("should compile @immutable", () => {
      const source = `
        export class Test {
          @immutable
          public owner: address = msg.sender;

          public getOwner(): address {
            return this.owner;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe("Inheritance Modifiers", () => {
    it("should compile @virtual and @override", () => {
      const source = `
        class Base {
          @virtual
          public getValue(): u256 {
            return 1n;
          }
        }

        export class Test extends Base {
          @override
          public getValue(): u256 {
            return 2n;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      // Override should use child's implementation
      expect(result.yul).toContain("2");
    });
  });
});
