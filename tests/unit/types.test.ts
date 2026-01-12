import { describe, it, expect } from "vitest";
import { compileToYul } from "../../src/compiler.js";

describe("Value Types", () => {
  describe("Boolean", () => {
    it("should compile bool type", () => {
      const source = `
        export class Test {
          @storage flag: bool = false;

          public setTrue(): void {
            this.flag = true;
          }

          public setFalse(): void {
            this.flag = false;
          }

          public get(): bool {
            return this.flag;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("sstore");
      expect(result.yul).toContain("sload");
    });

    it("should compile boolean operations", () => {
      const source = `
        export class Test {
          public and(a: bool, b: bool): bool {
            return a && b;
          }

          public or(a: bool, b: bool): bool {
            return a || b;
          }

          public not(a: bool): bool {
            return !a;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("and(");
      expect(result.yul).toContain("or(");
      expect(result.yul).toContain("iszero(");
    });
  });

  describe("Unsigned Integers", () => {
    it("should compile u256", () => {
      const source = `
        export class Test {
          @storage value: u256 = 0n;

          public set(v: u256): void {
            this.value = v;
          }

          public get(): u256 {
            return this.value;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
    });

    it("should compile u8 with masking", () => {
      const source = `
        export class Test {
          @storage small: u8 = 0n;

          public set(v: u8): void {
            this.small = v;
          }

          public get(): u8 {
            return this.small;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      // u8 should use masking (and with 0xff)
      expect(result.yul).toContain("255");
    });

    it("should compile u128", () => {
      const source = `
        export class Test {
          @storage mid: u128 = 0n;

          public set(v: u128): void {
            this.mid = v;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
    });

    it("should compile arithmetic operations", () => {
      const source = `
        export class Test {
          public add(a: u256, b: u256): u256 {
            return a + b;
          }

          public sub(a: u256, b: u256): u256 {
            return a - b;
          }

          public mul(a: u256, b: u256): u256 {
            return a * b;
          }

          public div(a: u256, b: u256): u256 {
            return a / b;
          }

          public mod(a: u256, b: u256): u256 {
            return a % b;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("add(");
      expect(result.yul).toContain("sub(");
      expect(result.yul).toContain("mul(");
      expect(result.yul).toContain("div(");
      expect(result.yul).toContain("mod(");
    });
  });

  describe("Signed Integers", () => {
    it("should compile i256", () => {
      const source = `
        export class Test {
          @storage value: i256 = 0n;

          public set(v: i256): void {
            this.value = v;
          }

          public get(): i256 {
            return this.value;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
    });

    it("should compile signed arithmetic", () => {
      const source = `
        export class Test {
          public sdiv(a: i256, b: i256): i256 {
            return a / b;
          }

          public smod(a: i256, b: i256): i256 {
            return a % b;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("sdiv(");
      expect(result.yul).toContain("smod(");
    });

    it("should compile signed comparisons", () => {
      const source = `
        export class Test {
          public slt(a: i256, b: i256): bool {
            return a < b;
          }

          public sgt(a: i256, b: i256): bool {
            return a > b;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("slt(");
      expect(result.yul).toContain("sgt(");
    });
  });

  describe("Address", () => {
    it("should compile address type", () => {
      const source = `
        export class Test {
          @storage owner: address = 0x0000000000000000000000000000000000000000 as address;

          public setOwner(addr: address): void {
            this.owner = addr;
          }

          public getOwner(): address {
            return this.owner;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
    });

    it("should compile address comparison", () => {
      const source = `
        export class Test {
          public isEqual(a: address, b: address): bool {
            return a === b;
          }

          public isNotEqual(a: address, b: address): bool {
            return a !== b;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("eq(");
    });
  });

  describe("Fixed Bytes", () => {
    it("should compile bytes32", () => {
      const source = `
        export class Test {
          @storage hash: bytes32 = 0x0 as bytes32;

          public setHash(h: bytes32): void {
            this.hash = h;
          }

          public getHash(): bytes32 {
            return this.hash;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
    });

    it("should compile bytes4 (selector)", () => {
      const source = `
        export class Test {
          @storage selector: bytes4 = 0x0 as bytes4;

          public setSelector(s: bytes4): void {
            this.selector = s;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
    });

    it("should compile bytes20 (address-sized)", () => {
      const source = `
        export class Test {
          @storage data: bytes20 = 0x0 as bytes20;

          public setData(d: bytes20): void {
            this.data = d;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe("Enum", () => {
    it("should compile enum type", () => {
      const source = `
        enum Status { Pending, Active, Completed }

        export class Test {
          @storage status: Status = Status.Pending;

          public setActive(): void {
            this.status = Status.Active;
          }

          public setCompleted(): void {
            this.status = Status.Completed;
          }

          public getStatus(): Status {
            return this.status;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      // Enum values should be integers
      expect(result.yul).toContain("0"); // Pending
      expect(result.yul).toContain("1"); // Active
      expect(result.yul).toContain("2"); // Completed
    });

    it("should compile enum comparison", () => {
      const source = `
        enum Status { Pending, Active, Completed }

        export class Test {
          @storage status: Status = Status.Pending;

          public isPending(): bool {
            return this.status === Status.Pending;
          }

          public isActive(): bool {
            return this.status === Status.Active;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("eq(");
    });
  });

  describe("Bitwise Operations", () => {
    it("should compile bitwise AND, OR, XOR", () => {
      const source = `
        export class Test {
          public bitAnd(a: u256, b: u256): u256 {
            return a & b;
          }

          public bitOr(a: u256, b: u256): u256 {
            return a | b;
          }

          public bitXor(a: u256, b: u256): u256 {
            return a ^ b;
          }

          public bitNot(a: u256): u256 {
            return ~a;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("and(");
      expect(result.yul).toContain("or(");
      expect(result.yul).toContain("xor(");
      expect(result.yul).toContain("not(");
    });

    it("should compile shift operations", () => {
      const source = `
        export class Test {
          public shl(a: u256, bits: u256): u256 {
            return a << bits;
          }

          public shr(a: u256, bits: u256): u256 {
            return a >> bits;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("shl(");
      expect(result.yul).toContain("shr(");
    });
  });

  describe("Comparison Operations", () => {
    it("should compile unsigned comparisons", () => {
      const source = `
        export class Test {
          public lt(a: u256, b: u256): bool {
            return a < b;
          }

          public gt(a: u256, b: u256): bool {
            return a > b;
          }

          public lte(a: u256, b: u256): bool {
            return a <= b;
          }

          public gte(a: u256, b: u256): bool {
            return a >= b;
          }

          public eq(a: u256, b: u256): bool {
            return a === b;
          }

          public neq(a: u256, b: u256): bool {
            return a !== b;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("lt(");
      expect(result.yul).toContain("gt(");
      expect(result.yul).toContain("eq(");
      expect(result.yul).toContain("iszero(");
    });
  });
});
