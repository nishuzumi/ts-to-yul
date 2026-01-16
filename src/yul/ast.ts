/**
 * Yul AST definitions (Libyul-compatible)
 */

export type YulLiteral =
  | { type: "number"; value: bigint }
  | { type: "string"; value: string }
  | { type: "bool"; value: boolean }
  | { type: "hex"; value: string };

export type YulExpression =
  | { type: "literal"; value: bigint | string | boolean }
  | { type: "stringLiteral"; value: string } // For dataoffset/datasize arguments
  | { type: "identifier"; name: string }
  | { type: "functionCall"; name: string; args: YulExpression[] };

export type YulStatement =
  | { type: "block"; statements: YulStatement[] }
  | { type: "variableDeclaration"; names: string[]; value?: YulExpression }
  | { type: "assignment"; names: string[]; value: YulExpression }
  | { type: "if"; condition: YulExpression; body: YulStatement[] }
  | {
      type: "switch";
      expr: YulExpression;
      cases: YulCase[];
      default?: YulStatement[];
    }
  | {
      type: "for";
      pre: YulStatement[];
      cond: YulExpression;
      post: YulStatement[];
      body: YulStatement[];
    }
  | {
      type: "function";
      name: string;
      params: string[];
      returns: string[];
      body: YulStatement[];
    }
  | { type: "leave" }
  | { type: "break" }
  | { type: "continue" }
  | { type: "expression"; expr: YulExpression }
  | { type: "rawCode"; code: string };

export interface YulCase {
  value: YulExpression;
  body: YulStatement[];
}

export interface YulObject {
  name: string;
  code: YulStatement[];
  subObjects: YulObject[];
  data: Map<string, string>;
}

/**
 * Builder helpers for constructing Yul AST nodes
 */
export const Yul = {
  literal(value: bigint | string | boolean): YulExpression {
    return { type: "literal", value };
  },

  identifier(name: string): YulExpression {
    return { type: "identifier", name };
  },

  call(name: string, ...args: YulExpression[]): YulExpression {
    return { type: "functionCall", name, args };
  },

  varDecl(names: string[], value?: YulExpression): YulStatement {
    if (value === undefined) {
      return { type: "variableDeclaration", names };
    }
    return { type: "variableDeclaration", names, value };
  },

  assign(names: string[], value: YulExpression): YulStatement {
    return { type: "assignment", names, value };
  },

  if_(condition: YulExpression, body: YulStatement[]): YulStatement {
    return { type: "if", condition, body };
  },

  switch_(expr: YulExpression, cases: YulCase[], default_?: YulStatement[]): YulStatement {
    if (default_ === undefined) {
      return { type: "switch", expr, cases };
    }
    return { type: "switch", expr, cases, default: default_ };
  },

  for_(
    pre: YulStatement[],
    cond: YulExpression,
    post: YulStatement[],
    body: YulStatement[]
  ): YulStatement {
    return { type: "for", pre, cond, post, body };
  },

  fn(name: string, params: string[], returns: string[], body: YulStatement[]): YulStatement {
    return { type: "function", name, params, returns, body };
  },

  expr(expr: YulExpression): YulStatement {
    return { type: "expression", expr };
  },

  leave(): YulStatement {
    return { type: "leave" };
  },

  break_(): YulStatement {
    return { type: "break" };
  },

  continue_(): YulStatement {
    return { type: "continue" };
  },

  block(statements: YulStatement[]): YulStatement {
    return { type: "block", statements };
  },

  rawCode(code: string): YulStatement {
    return { type: "rawCode", code };
  },
};
