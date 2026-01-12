import { describe, it, expect } from "vitest";
import { compileToYul } from "../../src/compiler.js";

describe("Contract Creation (new)", () => {
  describe("Basic contract creation", () => {
    it("should compile contract creation with no constructor args", () => {
      const source = `
        export class Child {
          @storage value: u256 = 0n;
        }

        export class Factory {
          public create(): address {
            return new Child();
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("create(");
      expect(result.yul).toContain("dataoffset");
      expect(result.yul).toContain("datasize");
    });

    it("should compile contract creation with one constructor arg", () => {
      const source = `
        export class Child {
          @storage value: u256;

          constructor(initialValue: u256) {
            this.value = initialValue;
          }
        }

        export class Factory {
          public create(val: u256): address {
            return new Child(val);
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("create(");
    });

    it("should compile contract creation with two constructor args", () => {
      const source = `
        export class Child {
          @storage a: u256;
          @storage b: u256;

          constructor(valA: u256, valB: u256) {
            this.a = valA;
            this.b = valB;
          }
        }

        export class Factory {
          public create(x: u256, y: u256): address {
            return new Child(x, y);
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("create(");
    });

    it("should compile contract creation with three constructor args", () => {
      const source = `
        export class Child {
          @storage a: u256;
          @storage b: u256;
          @storage c: u256;

          constructor(valA: u256, valB: u256, valC: u256) {
            this.a = valA;
            this.b = valB;
            this.c = valC;
          }
        }

        export class Factory {
          public create(x: u256, y: u256, z: u256): address {
            return new Child(x, y, z);
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("create(");
    });

    it("should compile contract creation with four constructor args", () => {
      const source = `
        export class Child {
          @storage a: u256;
          @storage b: u256;
          @storage c: u256;
          @storage d: u256;

          constructor(valA: u256, valB: u256, valC: u256, valD: u256) {
            this.a = valA;
            this.b = valB;
            this.c = valC;
            this.d = valD;
          }
        }

        export class Factory {
          public create(a: u256, b: u256, c: u256, d: u256): address {
            return new Child(a, b, c, d);
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("create(");
    });
  });

  describe("CREATE2 (deterministic deployment)", () => {
    it("should compile CREATE2 with salt and no constructor args", () => {
      const source = `
        export class Child {
          @storage value: u256 = 0n;
        }

        export class Factory {
          public create(salt: bytes32): address {
            return new Child({ salt });
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("create2(");
    });

    it("should compile CREATE2 with salt and constructor args", () => {
      const source = `
        export class Child {
          @storage value: u256;

          constructor(initialValue: u256) {
            this.value = initialValue;
          }
        }

        export class Factory {
          public create(salt: bytes32, val: u256): address {
            return new Child({ salt }, val);
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("create2(");
    });

    it("should compile CREATE2 with multiple constructor args", () => {
      const source = `
        export class Child {
          @storage a: u256;
          @storage b: u256;
          @storage c: u256;

          constructor(valA: u256, valB: u256, valC: u256) {
            this.a = valA;
            this.b = valB;
            this.c = valC;
          }
        }

        export class Factory {
          public create(salt: bytes32, x: u256, y: u256, z: u256): address {
            return new Child({ salt }, x, y, z);
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("create2(");
    });
  });

  describe("Memory array creation", () => {
    it("should compile new Array with size", () => {
      const source = `
        export class Test {
          public createArray(): u256 {
            const arr = new Array(10);
            return 0n;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("__allocArray");
    });

    it("should compile new Array with variable size", () => {
      const source = `
        export class Test {
          public createArray(size: u256): u256 {
            const arr = new Array(size);
            return 0n;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("__allocArray");
    });
  });
});
