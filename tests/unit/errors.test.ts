import { describe, it, expect } from "vitest";
import { compileToYul } from "../../src/compiler.js";

describe("Error Handling", () => {
  describe("require", () => {
    it("should compile require without message", () => {
      const source = `
        export class Test {
          public check(condition: bool): void {
            require(condition);
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("if iszero(");
      expect(result.yul).toContain("revert(0, 0)");
    });

    it("should compile require with message", () => {
      const source = `
        export class Test {
          public check(condition: bool): void {
            require(condition, "Condition failed");
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("if iszero(");
      expect(result.yul).toContain("revert(");
    });
  });

  describe("assert", () => {
    it("should compile assert", () => {
      const source = `
        export class Test {
          public check(condition: bool): void {
            assert(condition);
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("if iszero(");
    });
  });

  describe("revert", () => {
    it("should compile revert without message", () => {
      const source = `
        export class Test {
          public fail(): void {
            revert();
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("revert(0, 0)");
    });

    it("should compile revert with message", () => {
      const source = `
        export class Test {
          public fail(): void {
            revert("Something went wrong");
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("revert(");
    });
  });

  describe("Custom Errors", () => {
    it("should compile custom error declaration", () => {
      const source = `
        declare function InsufficientBalance(available: u256, required: u256): never;

        export class Test {
          @storage balance: u256 = 0n;

          public withdraw(amount: u256): void {
            if (this.balance < amount) {
              revert InsufficientBalance(this.balance, amount);
            }
            this.balance = this.balance - amount;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("revert(");
    });

    it("should compile custom error with no parameters", () => {
      const source = `
        declare function Unauthorized(): never;

        export class Test {
          @storage owner: address = 0x0 as address;

          public onlyOwner(): void {
            if (msg.sender !== this.owner) {
              revert Unauthorized();
            }
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
    });
  });
});
