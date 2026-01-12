import { describe, it, expect } from "vitest";
import { compileToYul } from "../../src/compiler.js";

describe("Control Flow", () => {
  describe("if/else", () => {
    it("should compile simple if", () => {
      const source = `
        export class Test {
          @storage value: u256 = 0n;

          public setIfPositive(v: u256): void {
            if (v > 0n) {
              this.value = v;
            }
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("if ");
    });

    it("should compile if/else", () => {
      const source = `
        export class Test {
          @storage value: u256 = 0n;

          public setOrReset(v: u256): void {
            if (v > 0n) {
              this.value = v;
            } else {
              this.value = 0n;
            }
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("if ");
      expect(result.yul).toContain("switch");
    });

    it("should compile if/else if/else", () => {
      const source = `
        export class Test {
          @storage value: u256 = 0n;

          public categorize(v: u256): void {
            if (v === 0n) {
              this.value = 0n;
            } else if (v < 100n) {
              this.value = 1n;
            } else {
              this.value = 2n;
            }
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe("for loop", () => {
    it("should compile basic for loop", () => {
      const source = `
        export class Test {
          public sum(n: u256): u256 {
            let total: u256 = 0n;
            let i: u256 = 0n;
            for (; i < n; i = i + 1n) {
              total = total + i;
            }
            return total;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("for {");
    });

    it("should compile for loop with break", () => {
      const source = `
        export class Test {
          public findFirst(target: u256): u256 {
            let i: u256 = 0n;
            for (; i < 100n; i = i + 1n) {
              if (i === target) {
                break;
              }
            }
            return target;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("break");
    });

    it("should compile for loop with continue", () => {
      const source = `
        export class Test {
          public sumEven(n: u256): u256 {
            let total: u256 = 0n;
            let i: u256 = 0n;
            for (; i < n; i = i + 1n) {
              if (i % 2n !== 0n) {
                continue;
              }
              total = total + i;
            }
            return total;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("continue");
    });
  });

  describe("while loop", () => {
    it("should compile while loop", () => {
      const source = `
        export class Test {
          public countdown(n: u256): u256 {
            let count: u256 = n;
            while (count > 0n) {
              count = count - 1n;
            }
            return count;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("for {");
    });
  });

  describe("do-while loop", () => {
    it("should compile do-while loop", () => {
      const source = `
        export class Test {
          public atLeastOnce(n: u256): u256 {
            let count: u256 = 0n;
            do {
              count = count + 1n;
            } while (count < n);
            return count;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("for {");
    });
  });

  describe("return", () => {
    it("should compile single return value", () => {
      const source = `
        export class Test {
          public getValue(): u256 {
            return 42n;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("leave");
    });

    it("should compile early return", () => {
      const source = `
        export class Test {
          public earlyReturn(v: u256): u256 {
            if (v === 0n) {
              return 0n;
            }
            return v * 2n;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("leave");
    });
  });

  describe("try/catch", () => {
    it("should compile try/catch with staticcall", () => {
      const source = `
        interface IExternal {
          getValue(): u256;
        }

        export class Test {
          public tryCall(target: address): u256 {
            try {
              const result = call.staticcall<u256>(target, "getValue()", []);
              return result;
            } catch {
              return 0n;
            }
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
    });

    it("should compile try/catch with call", () => {
      const source = `
        export class Test {
          public trySend(target: address, amount: u256): bool {
            try {
              call.call<void>(target, "receive()", []);
              return true;
            } catch {
              return false;
            }
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
    });

    it("should compile try/catch with multiple statements in try block", () => {
      const source = `
        export class Test {
          @storage lastResult: u256 = 0n;

          public tryMultiple(target: address): u256 {
            try {
              const a = call.staticcall<u256>(target, "getA()", []);
              const b = call.staticcall<u256>(target, "getB()", []);
              this.lastResult = a + b;
              return this.lastResult;
            } catch {
              return 0n;
            }
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
    });

    it("should compile try/catch with delegatecall", () => {
      const source = `
        export class Test {
          public tryDelegate(target: address, value: u256): u256 {
            try {
              const result = call.delegatecall<u256>(target, "calculate(uint256)", [value]);
              return result;
            } catch {
              return 0n;
            }
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
    });

    it("should compile try/catch with function that has parameters", () => {
      const source = `
        export class Test {
          public tryTransfer(target: address, to: address, amount: u256): bool {
            try {
              call.call<bool>(target, "transfer(address,uint256)", to, amount);
              return true;
            } catch {
              return false;
            }
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
    });

    it("should compile try/catch with storage update on failure", () => {
      const source = `
        export class Test {
          @storage failCount: u256 = 0n;

          public tryWithCounter(target: address): u256 {
            try {
              const result = call.staticcall<u256>(target, "getValue()", []);
              return result;
            } catch {
              this.failCount = this.failCount + 1n;
              return 0n;
            }
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("sstore");
    });

    it("should compile try/catch in conditional context", () => {
      const source = `
        export class Test {
          public tryConditional(target: address, shouldTry: bool): u256 {
            if (shouldTry) {
              try {
                const result = call.staticcall<u256>(target, "getValue()", []);
                return result;
              } catch {
                return 0n;
              }
            }
            return 999n;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
    });
  });
});
