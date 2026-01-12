import { describe, it, expect } from "vitest";
import { compileToYul } from "../../src/compiler";

describe("@slot decorator for custom storage layout", () => {
  it("should use explicit slot number from @slot decorator", () => {
    const source = `
      import { storage, slot, u256 } from "../runtime";

      export class CustomLayout {
        @storage @slot(5) myValue: u256 = 0n;

        public getValue(): u256 {
          return this.myValue;
        }
      }
    `;
    const result = compileToYul(source);
    // Should use slot 5 for sload
    expect(result.yul).toContain("sload(5)");
  });

  it("should use explicit slot number with bigint syntax", () => {
    const source = `
      import { storage, slot, u256 } from "../runtime";

      export class CustomLayout {
        @storage @slot(100n) myValue: u256 = 0n;

        public getValue(): u256 {
          return this.myValue;
        }
      }
    `;
    const result = compileToYul(source);
    expect(result.yul).toContain("sload(100)");
  });

  it("should allow multiple @slot decorators with unique slots", () => {
    const source = `
      import { storage, slot, u256, address } from "../runtime";

      export class MultiSlot {
        @storage @slot(10) value1: u256 = 0n;
        @storage @slot(20) value2: address;
        @storage @slot(5) value3: u256 = 42n;

        public getValue1(): u256 {
          return this.value1;
        }

        public getValue2(): address {
          return this.value2;
        }

        public getValue3(): u256 {
          return this.value3;
        }
      }
    `;
    const result = compileToYul(source);
    // Each value should load from its specified slot
    expect(result.yul).toContain("sload(10)");
    expect(result.yul).toContain("sload(20)");
    expect(result.yul).toContain("sload(5)");
  });

  it("should error for duplicate slot assignments", () => {
    const source = `
      import { storage, slot, u256 } from "../runtime";

      export class DuplicateSlot {
        @storage @slot(5) value1: u256 = 0n;
        @storage @slot(5) value2: u256 = 1n;

        public getValue1(): u256 {
          return this.value1;
        }
      }
    `;
    const result = compileToYul(source);
    // The error should be in the errors array
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toMatch(/Slot 5 is assigned to both/);
  });

  it("should mix explicit and auto slots correctly", () => {
    const source = `
      import { storage, slot, u256 } from "../runtime";

      export class MixedSlots {
        @storage auto1: u256 = 0n;               // slot 0 (auto)
        @storage @slot(10) explicit: u256 = 1n;  // slot 10 (explicit)
        @storage auto2: u256 = 2n;               // slot 1 (auto continues from 0, skips nothing)

        public getAuto1(): u256 {
          return this.auto1;
        }

        public getExplicit(): u256 {
          return this.explicit;
        }

        public getAuto2(): u256 {
          return this.auto2;
        }
      }
    `;
    const result = compileToYul(source);
    // auto1 at slot 0
    expect(result.yul).toContain("sload(0)");
    // explicit at slot 10
    expect(result.yul).toContain("sload(10)");
    // auto2 at slot 1 (continues auto-assignment after slot 0)
    expect(result.yul).toContain("sload(1)");
  });

  it("should skip explicit slots during auto-assignment", () => {
    const source = `
      import { storage, slot, u256 } from "../runtime";

      export class SkipExplicit {
        @storage @slot(1) reserved: u256 = 0n;  // slot 1 (explicit)
        @storage auto1: u256 = 1n;              // slot 0 (auto, starts at 0)
        @storage auto2: u256 = 2n;              // slot 2 (auto, skips 1)

        public getReserved(): u256 {
          return this.reserved;
        }

        public getAuto1(): u256 {
          return this.auto1;
        }

        public getAuto2(): u256 {
          return this.auto2;
        }
      }
    `;
    const result = compileToYul(source);
    // Should have slots 0, 1, 2 used
    expect(result.yul).toContain("sload(0)");
    expect(result.yul).toContain("sload(1)");
    expect(result.yul).toContain("sload(2)");
  });
});
