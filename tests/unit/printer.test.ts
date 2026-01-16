import { describe, it, expect } from "vitest";
import { Printer } from "../../src/yul/printer.js";
import type { YulObject } from "../../src/yul/ast.js";

describe("Printer", () => {
  const printer = new Printer();

  it("should print simple object", () => {
    const obj: YulObject = {
      name: "Test",
      code: [],
      subObjects: [],
      data: new Map(),
    };

    const result = printer.print(obj);
    expect(result).toContain('object "Test"');
    expect(result).toContain("code {");
  });

  it("should print variable declaration", () => {
    const obj: YulObject = {
      name: "Test",
      code: [{ type: "variableDeclaration", names: ["x"], value: { type: "literal", value: 42n } }],
      subObjects: [],
      data: new Map(),
    };

    const result = printer.print(obj);
    expect(result).toContain("let x := 42");
  });

  it("should print function call", () => {
    const obj: YulObject = {
      name: "Test",
      code: [
        {
          type: "expression",
          expr: {
            type: "functionCall",
            name: "sstore",
            args: [
              { type: "literal", value: 0n },
              { type: "literal", value: 100n },
            ],
          },
        },
      ],
      subObjects: [],
      data: new Map(),
    };

    const result = printer.print(obj);
    expect(result).toContain("sstore(0, 100)");
  });

  it("should print if statement", () => {
    const obj: YulObject = {
      name: "Test",
      code: [
        {
          type: "if",
          condition: { type: "identifier", name: "condition" },
          body: [{ type: "leave" }],
        },
      ],
      subObjects: [],
      data: new Map(),
    };

    const result = printer.print(obj);
    expect(result).toContain("if condition {");
    expect(result).toContain("leave");
  });

  it("should print switch statement", () => {
    const obj: YulObject = {
      name: "Test",
      code: [
        {
          type: "switch",
          expr: { type: "identifier", name: "selector" },
          cases: [
            {
              value: { type: "literal", value: 0x12345678n },
              body: [{ type: "leave" }],
            },
          ],
          default: [
            {
              type: "expression",
              expr: {
                type: "functionCall",
                name: "revert",
                args: [
                  { type: "literal", value: 0n },
                  { type: "literal", value: 0n },
                ],
              },
            },
          ],
        },
      ],
      subObjects: [],
      data: new Map(),
    };

    const result = printer.print(obj);
    expect(result).toContain("switch selector");
    expect(result).toContain("case 305419896");
    expect(result).toContain("default {");
    expect(result).toContain("revert(0, 0)");
  });

  it("should print function definition", () => {
    const obj: YulObject = {
      name: "Test",
      code: [
        {
          type: "function",
          name: "add",
          params: ["a", "b"],
          returns: ["result"],
          body: [
            {
              type: "assignment",
              names: ["result"],
              value: {
                type: "functionCall",
                name: "add",
                args: [
                  { type: "identifier", name: "a" },
                  { type: "identifier", name: "b" },
                ],
              },
            },
          ],
        },
      ],
      subObjects: [],
      data: new Map(),
    };

    const result = printer.print(obj);
    expect(result).toContain("function add(a, b) -> result {");
    expect(result).toContain("result := add(a, b)");
  });

  it("should print nested objects", () => {
    const obj: YulObject = {
      name: "Contract",
      code: [],
      subObjects: [
        {
          name: "Contract_deployed",
          code: [],
          subObjects: [],
          data: new Map(),
        },
      ],
      data: new Map(),
    };

    const result = printer.print(obj);
    expect(result).toContain('object "Contract"');
    expect(result).toContain('object "Contract_deployed"');
  });
});
