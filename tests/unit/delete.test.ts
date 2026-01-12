import { describe, it, expect } from "vitest";
import { compileToYul } from "../../src/compiler.js";

describe("Delete Operator", () => {
  describe("Delete mapping entries", () => {
    it("should compile delete on mapping entry", () => {
      const source = `
        export class Test {
          @storage balances: Mapping<address, u256>;

          public deleteBalance(addr: address): void {
            delete this.balances[addr];
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("sstore");
    });

    it("should compile delete on nested mapping entry", () => {
      const source = `
        export class Test {
          @storage allowances: Mapping<address, Mapping<address, u256>>;

          public deleteAllowance(owner: address, spender: address): void {
            delete this.allowances[owner][spender];
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("sstore");
    });
  });

  describe("Delete storage array entries", () => {
    it("should compile delete on storage array element", () => {
      const source = `
        export class Test {
          @storage items: StorageArray<u256>;

          public deleteItem(index: u256): void {
            delete this.items[index];
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("sstore");
    });
  });

  describe("Delete storage variables", () => {
    it("should compile delete on simple storage variable", () => {
      const source = `
        export class Test {
          @storage value: u256 = 100n;

          public deleteValue(): void {
            delete this.value;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      // Delete sets storage to 0
      expect(result.yul).toContain("sstore");
    });

    it("should compile delete on address storage variable", () => {
      const source = `
        export class Test {
          @storage owner: address;

          public deleteOwner(): void {
            delete this.owner;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("sstore");
    });

    it("should compile delete on bool storage variable", () => {
      const source = `
        export class Test {
          @storage active: bool = true;

          public deactivate(): void {
            delete this.active;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("sstore");
    });
  });

  describe("Delete with complex expressions", () => {
    it("should compile delete in conditional context", () => {
      const source = `
        export class Test {
          @storage balances: Mapping<address, u256>;

          public maybeDelete(addr: address, shouldDelete: bool): void {
            if (shouldDelete) {
              delete this.balances[addr];
            }
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("sstore");
    });

    it("should compile delete in loop", () => {
      const source = `
        export class Test {
          @storage values: Mapping<u256, u256>;

          public clearRange(start: u256, end: u256): void {
            let i = start;
            while (i < end) {
              delete this.values[i];
              i = i + 1n;
            }
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("sstore");
    });
  });
});
