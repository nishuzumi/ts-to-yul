import { describe, it, expect } from "vitest";
import { Parser } from "../../src/parser/index.js";

describe("Parser", () => {
  it("should parse a simple class", () => {
    const parser = new Parser();
    const source = `
      export class Counter {
        value: number = 0;
      }
    `;

    const sourceFile = parser.parse(source);
    const contracts = parser.getContracts(sourceFile);

    expect(contracts).toHaveLength(1);
    expect(contracts[0]?.getName()).toBe("Counter");
  });

  it("should parse class with methods", () => {
    const parser = new Parser();
    const source = `
      export class Counter {
        value: u256 = 0n;

        public increment(): void {
          this.value = this.value + 1n;
        }

        public get(): u256 {
          return this.value;
        }
      }
    `;

    const sourceFile = parser.parse(source);
    const contracts = parser.getContracts(sourceFile);
    const methods = contracts[0]?.getMethods();

    expect(methods).toHaveLength(2);
    expect(methods?.[0]?.getName()).toBe("increment");
    expect(methods?.[1]?.getName()).toBe("get");
  });

  it("should parse class with decorators", () => {
    const parser = new Parser();
    const source = `
      function storage(target: any, key: string) {}

      export class Counter {
        @storage value: u256 = 0n;
      }
    `;

    const sourceFile = parser.parse(source);
    const contracts = parser.getContracts(sourceFile);
    const properties = contracts[0]?.getProperties();

    expect(properties).toHaveLength(1);
    expect(properties?.[0]?.getName()).toBe("value");
    expect(properties?.[0]?.getDecorators()).toHaveLength(1);
    expect(properties?.[0]?.getDecorators()[0]?.getName()).toBe("storage");
  });

  it("should ignore non-exported classes", () => {
    const parser = new Parser();
    const source = `
      class InternalContract {
        value: number = 0;
      }

      export class PublicContract {
        value: number = 0;
      }
    `;

    const sourceFile = parser.parse(source);
    const contracts = parser.getContracts(sourceFile);

    expect(contracts).toHaveLength(1);
    expect(contracts[0]?.getName()).toBe("PublicContract");
  });
});
