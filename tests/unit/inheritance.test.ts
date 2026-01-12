import { describe, it, expect } from "vitest";
import { compileToYul } from "../../src/compiler.js";

describe("Inheritance", () => {
  describe("Single Inheritance (extends)", () => {
    it("should compile basic inheritance", () => {
      const source = `
        class Base {
          @storage value: u256 = 0n;

          public getValue(): u256 {
            return this.value;
          }
        }

        export class Child extends Base {
          public setValue(v: u256): void {
            this.value = v;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      // Child should have both getValue and setValue
      expect(result.yul).toContain("fn_getValue");
      expect(result.yul).toContain("fn_setValue");
    });

    it("should inherit storage from parent", () => {
      const source = `
        class Base {
          @storage baseValue: u256 = 0n;
        }

        export class Child extends Base {
          @storage childValue: u256 = 0n;

          public setBaseValue(v: u256): void {
            this.baseValue = v;
          }

          public setChildValue(v: u256): void {
            this.childValue = v;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      // Both storage variables should be accessible
      expect(result.yul).toContain("sstore(0,"); // baseValue at slot 0
      expect(result.yul).toContain("sstore(1,"); // childValue at slot 1
    });
  });

  describe("Multiple Inheritance (Mixin)", () => {
    it("should compile Mixin inheritance", () => {
      const source = `
        class A {
          @storage aValue: u256 = 0n;

          public getA(): u256 {
            return this.aValue;
          }
        }

        class B {
          @storage bValue: u256 = 0n;

          public getB(): u256 {
            return this.bValue;
          }
        }

        export class Child extends Mixin(A, B) {
          public setA(v: u256): void {
            this.aValue = v;
          }

          public setB(v: u256): void {
            this.bValue = v;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      // Should have methods from both parents
      expect(result.yul).toContain("fn_getA");
      expect(result.yul).toContain("fn_getB");
    });

    it("should order storage correctly with Mixin", () => {
      const source = `
        class First {
          @storage first: u256 = 1n;
        }

        class Second {
          @storage second: u256 = 2n;
        }

        export class Combined extends Mixin(First, Second) {
          @storage third: u256 = 3n;

          public getAll(): u256 {
            return this.first + this.second + this.third;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      // Storage order: First.first, Second.second, Combined.third
    });
  });

  describe("Method Override", () => {
    it("should override parent methods", () => {
      const source = `
        class Base {
          @virtual
          public getValue(): u256 {
            return 1n;
          }
        }

        export class Child extends Base {
          @override
          public getValue(): u256 {
            return 2n;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      // Should use child's implementation returning 2
      expect(result.yul).toContain("2");
    });
  });

  describe("Super Call", () => {
    it("should call super method", () => {
      const source = `
        class Base {
          @virtual
          public getValue(): u256 {
            return 10n;
          }
        }

        export class Child extends Base {
          @override
          public getValue(): u256 {
            return super.getValue() + 5n;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      // Should have both base and child implementations
      expect(result.yul).toContain("fn_Base_getValue");
    });
  });

  describe("Abstract Class", () => {
    it("should compile abstract class", () => {
      const source = `
        abstract class AbstractBase {
          @storage value: u256 = 0n;

          public abstract getValue(): u256;

          public setValue(v: u256): void {
            this.value = v;
          }
        }

        export class Concrete extends AbstractBase {
          public getValue(): u256 {
            return this.value;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe("Interface", () => {
    it("should compile interface for external calls", () => {
      const source = `
        interface IERC20 {
          balanceOf(account: address): u256;
          transfer(to: address, amount: u256): bool;
        }

        export class Test {
          public getBalance(token: address, account: address): u256 {
            return call.staticcall<u256>(token, "balanceOf(address)", [account]);
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("staticcall(");
    });
  });
});
