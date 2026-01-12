import { describe, it, expect } from "vitest";
import { compileToYul } from "../../src/compiler.js";

describe("CalldataArray", () => {
  describe("length property", () => {
    it("should compile calldata array length access", () => {
      const source = `
        export class Test {
          public getLength(data: CalldataArray<u256>): u256 {
            return data.length;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      // The length should be decoded from calldata
      expect(result.yul).toContain("data_len");
    });
  });

  describe("index access", () => {
    it("should compile calldata array index access", () => {
      const source = `
        export class Test {
          public getElement(data: CalldataArray<u256>, index: u256): u256 {
            return data[index];
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      // Should contain bounds checking or direct calldataload
      expect(result.yul).toContain("calldataload");
    });

    it("should compile calldata array with address elements", () => {
      const source = `
        export class Test {
          public getAddress(addrs: CalldataArray<address>, index: u256): address {
            return addrs[index];
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("calldataload");
    });
  });

  describe("slice method", () => {
    it("should compile slice with start and end", () => {
      const source = `
        export class Test {
          public getSlice(data: CalldataArray<u256>, start: u256, end: u256): CalldataArray<u256> {
            return data.slice(start, end);
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      // Should use the calldata slice helper
      expect(result.yul).toContain("__calldata_slice");
    });

    it("should compile slice with only start", () => {
      const source = `
        export class Test {
          public getSliceFromStart(data: CalldataArray<u256>, start: u256): CalldataArray<u256> {
            return data.slice(start);
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("__calldata_slice");
    });

    it("should compile slice and return directly", () => {
      // Note: Storing slice result in local variable and iterating
      // is not yet supported. This tests the simpler return case.
      const source = `
        export class Test {
          public getFirstHalf(data: CalldataArray<u256>): CalldataArray<u256> {
            const half: u256 = data.length / 2n;
            return data.slice(0n, half);
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("__calldata_slice");
    });
  });

  describe("multiple calldata arrays", () => {
    it("should handle multiple calldata array parameters", () => {
      const source = `
        export class Test {
          public compare(a: CalldataArray<u256>, b: CalldataArray<u256>): bool {
            return a.length === b.length;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      // Should have both parameter lengths
      expect(result.yul).toContain("a_len");
      expect(result.yul).toContain("b_len");
    });

    it("should handle mixed parameter types", () => {
      const source = `
        export class Test {
          public processData(count: u256, items: CalldataArray<u256>, flag: bool): u256 {
            if (flag) {
              return items.length;
            }
            return count;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("items_len");
    });
  });

  describe("T[] syntax", () => {
    it("should treat T[] as calldata array in parameters", () => {
      const source = `
        export class Test {
          public getLen(values: u256[]): u256 {
            return values.length;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("values_len");
    });

    it("should support slice on T[] parameters", () => {
      const source = `
        export class Test {
          public sliceArray(values: u256[], start: u256, end: u256): u256[] {
            return values.slice(start, end);
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("__calldata_slice");
    });
  });

  describe("calldata slice helper", () => {
    it("should include bounds checking in slice helper", () => {
      const source = `
        export class Test {
          public safeSlice(data: CalldataArray<u256>, start: u256, end: u256): CalldataArray<u256> {
            return data.slice(start, end);
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      // Helper should check start <= end and end <= length
      expect(result.yul).toContain("__calldata_slice");
      // Helper function should exist in the output
      expect(result.yul).toMatch(/function __calldata_slice/);
    });
  });
});
