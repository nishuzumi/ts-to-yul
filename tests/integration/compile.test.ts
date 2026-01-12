import { describe, it, expect } from "vitest";
import { compileToYul } from "../../src/compiler.js";

describe("Compile to Yul", () => {
  it("should compile a simple counter contract", () => {
    const source = `
      function storage(target: any, key: string) {}

      export class Counter {
        @storage value: u256 = 0n;

        public increment(): void {
          this.value = this.value + 1n;
        }

        public get(): u256 {
          return this.value;
        }
      }
    `;

    const result = compileToYul(source);

    expect(result.errors).toHaveLength(0);
    expect(result.yul).toContain('object "Counter"');
    expect(result.yul).toContain('object "Counter_deployed"');
    expect(result.yul).toContain("switch");
    expect(result.yul).toContain("shr(224, calldataload(0))");
  });

  it("should generate function dispatcher", () => {
    const source = `
      export class Contract {
        public foo(): void {}
        public bar(): u256 { return 0n; }
      }
    `;

    const result = compileToYul(source);

    expect(result.errors).toHaveLength(0);
    expect(result.yul).toContain("switch");
    expect(result.yul).toContain("case");
    expect(result.yul).toContain("default");
    expect(result.yul).toContain("revert(0, 0)");
  });

  it("should report error for missing contract", () => {
    const source = `
      const x = 1;
    `;

    const result = compileToYul(source);

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("No contract found");
  });

  it("should handle multiple storage variables", () => {
    const source = `
      function storage(target: any, key: string) {}

      export class MultiStorage {
        @storage a: u256 = 0n;
        @storage b: u256 = 0n;
        @storage c: u256 = 0n;

        public getA(): u256 { return this.a; }
      }
    `;

    const result = compileToYul(source);

    expect(result.errors).toHaveLength(0);
    expect(result.yul).toContain('object "MultiStorage"');
  });
});
