import { describe, it, expect } from "vitest";
import { compileToYul } from "../../src/compiler.js";

describe("Units", () => {
  describe("Ether Units", () => {
    it("should compile wei", () => {
      const source = `
        export class Test {
          public getWei(): u256 {
            return 1n * wei;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("1");
    });

    it("should compile gwei", () => {
      const source = `
        export class Test {
          public getGwei(): u256 {
            return 1n * gwei;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("1000000000");
    });

    it("should compile ether", () => {
      const source = `
        export class Test {
          public getEther(): u256 {
            return 1n * ether;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("1000000000000000000");
    });
  });

  describe("Time Units", () => {
    it("should compile seconds", () => {
      const source = `
        export class Test {
          public getSeconds(): u256 {
            return 60n * seconds;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("60");
    });

    it("should compile minutes", () => {
      const source = `
        export class Test {
          public getMinutes(): u256 {
            return 1n * minutes;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("60");
    });

    it("should compile hours", () => {
      const source = `
        export class Test {
          public getHours(): u256 {
            return 1n * hours;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("3600");
    });

    it("should compile days", () => {
      const source = `
        export class Test {
          public getDays(): u256 {
            return 1n * days;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("86400");
    });

    it("should compile weeks", () => {
      const source = `
        export class Test {
          public getWeeks(): u256 {
            return 1n * weeks;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("604800");
    });
  });

  describe("Combined Units", () => {
    it("should compile complex unit expressions", () => {
      const source = `
        export class Test {
          public getTimeout(): u256 {
            return 7n * days + 12n * hours;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
    });
  });
});
