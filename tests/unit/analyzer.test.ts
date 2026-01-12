import { describe, it, expect } from "vitest";
import { Parser } from "../../src/parser/index.js";
import { Analyzer } from "../../src/analyzer/index.js";

describe("Analyzer", () => {
  const parser = new Parser();
  const analyzer = new Analyzer();

  it("should analyze storage variables", () => {
    const source = `
      function storage(target: any, key: string) {}

      export class Counter {
        @storage value: u256 = 0n;
        @storage count: u256 = 0n;
      }
    `;

    const sourceFile = parser.parse(source);
    const contracts = analyzer.analyze(sourceFile);

    expect(contracts).toHaveLength(1);
    expect(contracts[0]?.storage).toHaveLength(2);
    expect(contracts[0]?.storage[0]?.name).toBe("value");
    expect(contracts[0]?.storage[0]?.slot).toBe(0n);
    expect(contracts[0]?.storage[1]?.name).toBe("count");
    expect(contracts[0]?.storage[1]?.slot).toBe(1n);
  });

  it("should analyze public functions", () => {
    const source = `
      export class Counter {
        public increment(): void {}
        public get(): u256 { return 0n; }
        private helper(): void {}
      }
    `;

    const sourceFile = parser.parse(source);
    const contracts = analyzer.analyze(sourceFile);
    const publicFns = contracts[0]?.functions.filter((f) => f.visibility === "public");
    const privateFns = contracts[0]?.functions.filter((f) => f.visibility === "private");

    expect(publicFns).toHaveLength(2);
    expect(privateFns).toHaveLength(1);
    expect(publicFns?.[0]?.name).toBe("increment");
    expect(publicFns?.[1]?.name).toBe("get");
  });

  it("should compute function selectors", () => {
    const source = `
      export class Counter {
        public get(): u256 { return 0n; }
      }
    `;

    const sourceFile = parser.parse(source);
    const contracts = analyzer.analyze(sourceFile);
    const fn = contracts[0]?.functions[0];

    // get() selector = keccak256("get()")[0:4]
    expect(fn?.selector).toBe("0x6d4ce63c");
  });

  it("should analyze function parameters", () => {
    const source = `
      export class Token {
        public transfer(to: address, amount: u256): void {}
      }
    `;

    const sourceFile = parser.parse(source);
    const contracts = analyzer.analyze(sourceFile);
    const fn = contracts[0]?.functions[0];

    expect(fn?.params).toHaveLength(2);
    expect(fn?.params[0]?.name).toBe("to");
    expect(fn?.params[0]?.type.kind).toBe("address");
    expect(fn?.params[1]?.name).toBe("amount");
    expect(fn?.params[1]?.type.kind).toBe("uint");
  });

  it("should analyze return types", () => {
    const source = `
      export class Counter {
        public get(): u256 { return 0n; }
        public increment(): void {}
      }
    `;

    const sourceFile = parser.parse(source);
    const contracts = analyzer.analyze(sourceFile);
    const getFn = contracts[0]?.functions.find((f) => f.name === "get");
    const incFn = contracts[0]?.functions.find((f) => f.name === "increment");

    expect(getFn?.returnType).not.toBeNull();
    expect(getFn?.returnType?.kind).toBe("uint");
    expect(incFn?.returnType).toBeNull();
  });
});
