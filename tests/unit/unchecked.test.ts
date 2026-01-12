import { describe, it, expect } from "vitest";
import { compileToYul } from "../../src/compiler.js";

describe("Unchecked Arithmetic", () => {
  describe("expression body", () => {
    it("should compile unchecked addition", () => {
      const source = `
        export class Test {
          public uncheckedAdd(a: u256, b: u256): u256 {
            return unchecked(() => a + b);
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("add(a, b)");
    });

    it("should compile unchecked subtraction", () => {
      const source = `
        export class Test {
          public uncheckedSub(a: u256, b: u256): u256 {
            return unchecked(() => a - b);
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("sub(a, b)");
    });

    it("should compile unchecked multiplication", () => {
      const source = `
        export class Test {
          public uncheckedMul(a: u256, b: u256): u256 {
            return unchecked(() => a * b);
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("mul(a, b)");
    });

    it("should compile unchecked division", () => {
      const source = `
        export class Test {
          public uncheckedDiv(a: u256, b: u256): u256 {
            return unchecked(() => a / b);
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("div(a, b)");
    });

    it("should compile complex unchecked expression", () => {
      const source = `
        export class Test {
          public complex(a: u256, b: u256, c: u256): u256 {
            return unchecked(() => (a + b) * c);
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("mul(add(a, b), c)");
    });

    it("should compile unchecked increment", () => {
      const source = `
        export class Test {
          public increment(x: u256): u256 {
            return unchecked(() => x + 1n);
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("add(x, 1)");
    });
  });

  describe("statement body", () => {
    it("should compile unchecked block with assignment", () => {
      const source = `
        export class Test {
          @storage counter: u256;

          public incrementCounter(): void {
            unchecked(() => {
              this.counter = this.counter + 1n;
            });
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("sstore");
      expect(result.yul).toContain("add(");
    });

    it("should compile unchecked block with multiple statements", () => {
      const source = `
        export class Test {
          @storage a: u256;
          @storage b: u256;

          public updateBoth(): void {
            unchecked(() => {
              this.a = this.a + 1n;
              this.b = this.b * 2n;
            });
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      // Should have two sstore operations
      const sstoreCount = (result.yul?.match(/sstore\(/g) || []).length;
      expect(sstoreCount).toBeGreaterThanOrEqual(2);
    });

    it("should compile unchecked block with local variable", () => {
      const source = `
        export class Test {
          @storage result: u256;

          public calculate(x: u256): void {
            unchecked(() => {
              let temp: u256 = x * x;
              this.result = temp + x;
            });
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("mul(x, x)");
      expect(result.yul).toContain("add(temp, x)");
    });
  });

  describe("signed arithmetic", () => {
    it("should compile unchecked signed addition", () => {
      const source = `
        export class Test {
          public signedAdd(a: i256, b: i256): i256 {
            return unchecked(() => a + b);
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      // Signed operations use add (no overflow checks in Yul)
      expect(result.yul).toContain("add(a, b)");
    });

    it("should compile unchecked signed subtraction", () => {
      const source = `
        export class Test {
          public signedSub(a: i256, b: i256): i256 {
            return unchecked(() => a - b);
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("sub(a, b)");
    });
  });

  describe("nested unchecked", () => {
    it("should compile nested unchecked expressions", () => {
      const source = `
        export class Test {
          public nested(a: u256, b: u256): u256 {
            return unchecked(() => unchecked(() => a + b) * 2n);
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("mul(add(a, b), 2)");
    });
  });
});
