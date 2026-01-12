import type { YulObject, YulStatement, YulExpression, YulCase } from "./ast.js";

export class Printer {
  private indentLevel = 0;
  private indentStr = "    ";

  print(obj: YulObject): string {
    let result = `object "${obj.name}" {\n`;
    this.indentLevel++;

    result += this.indent() + "code {\n";
    this.indentLevel++;
    result += this.printStatements(obj.code);
    this.indentLevel--;
    result += this.indent() + "}\n";

    for (const sub of obj.subObjects) {
      result += "\n" + this.indent() + this.print(sub);
    }

    for (const [name, value] of obj.data) {
      result += this.indent() + `data "${name}" hex"${value}"\n`;
    }

    this.indentLevel--;
    result += this.indent() + "}\n";

    return result;
  }

  private indent(): string {
    return this.indentStr.repeat(this.indentLevel);
  }

  private printStatements(statements: YulStatement[]): string {
    return statements.map((s) => this.printStatement(s)).join("");
  }

  private printStatement(stmt: YulStatement): string {
    switch (stmt.type) {
      case "block":
        return this.printBlock(stmt.statements);

      case "variableDeclaration": {
        const names = stmt.names.join(", ");
        if (stmt.value) {
          return this.indent() + `let ${names} := ${this.printExpr(stmt.value)}\n`;
        }
        return this.indent() + `let ${names}\n`;
      }

      case "assignment": {
        const names = stmt.names.join(", ");
        return this.indent() + `${names} := ${this.printExpr(stmt.value)}\n`;
      }

      case "if":
        return this.printIf(stmt.condition, stmt.body);

      case "switch":
        return this.printSwitch(stmt.expr, stmt.cases, stmt.default);

      case "for":
        return this.printFor(stmt.pre, stmt.cond, stmt.post, stmt.body);

      case "function":
        return this.printFunction(stmt.name, stmt.params, stmt.returns, stmt.body);

      case "leave":
        return this.indent() + "leave\n";

      case "break":
        return this.indent() + "break\n";

      case "continue":
        return this.indent() + "continue\n";

      case "expression":
        return this.indent() + this.printExpr(stmt.expr) + "\n";

      case "rawCode":
        // Print raw Yul code with proper indentation
        return stmt.code
          .split("\n")
          .filter((line) => line.trim())
          .map((line) => this.indent() + line.trim())
          .join("\n") + "\n";
    }
  }

  private printBlock(statements: YulStatement[]): string {
    let result = this.indent() + "{\n";
    this.indentLevel++;
    result += this.printStatements(statements);
    this.indentLevel--;
    result += this.indent() + "}\n";
    return result;
  }

  private printIf(condition: YulExpression, body: YulStatement[]): string {
    let result = this.indent() + `if ${this.printExpr(condition)} {\n`;
    this.indentLevel++;
    result += this.printStatements(body);
    this.indentLevel--;
    result += this.indent() + "}\n";
    return result;
  }

  private printSwitch(
    expr: YulExpression,
    cases: YulCase[],
    default_?: YulStatement[]
  ): string {
    let result = this.indent() + `switch ${this.printExpr(expr)}\n`;

    for (const c of cases) {
      result += this.indent() + `case ${this.printExpr(c.value)} {\n`;
      this.indentLevel++;
      result += this.printStatements(c.body);
      this.indentLevel--;
      result += this.indent() + "}\n";
    }

    if (default_) {
      result += this.indent() + "default {\n";
      this.indentLevel++;
      result += this.printStatements(default_);
      this.indentLevel--;
      result += this.indent() + "}\n";
    }

    return result;
  }

  private printInlineBlock(stmts: YulStatement[]): string {
    if (stmts.length === 0) return "{}";
    return "{ " + stmts.map((s) => this.printStatementInline(s)).join(" ") + " }";
  }

  private printFor(
    pre: YulStatement[],
    cond: YulExpression,
    post: YulStatement[],
    body: YulStatement[]
  ): string {
    let result = this.indent();
    result += `for ${this.printInlineBlock(pre)} ${this.printExpr(cond)} ${this.printInlineBlock(post)} {\n`;
    this.indentLevel++;
    result += this.printStatements(body);
    this.indentLevel--;
    result += this.indent() + "}\n";
    return result;
  }

  private printStatementInline(stmt: YulStatement): string {
    switch (stmt.type) {
      case "variableDeclaration": {
        const names = stmt.names.join(", ");
        if (stmt.value) {
          return `let ${names} := ${this.printExpr(stmt.value)}`;
        }
        return `let ${names}`;
      }
      case "assignment": {
        const names = stmt.names.join(", ");
        return `${names} := ${this.printExpr(stmt.value)}`;
      }
      case "expression":
        return this.printExpr(stmt.expr);
      default:
        return "";
    }
  }

  private printFunction(
    name: string,
    params: string[],
    returns: string[],
    body: YulStatement[]
  ): string {
    const paramsStr = params.join(", ");
    const returnsStr = returns.length > 0 ? ` -> ${returns.join(", ")}` : "";

    let result = this.indent() + `function ${name}(${paramsStr})${returnsStr} {\n`;
    this.indentLevel++;
    result += this.printStatements(body);
    this.indentLevel--;
    result += this.indent() + "}\n";

    return result;
  }

  private printExpr(expr: YulExpression): string {
    switch (expr.type) {
      case "literal":
        return this.printLiteral(expr.value);

      case "stringLiteral":
        // String literal for dataoffset/datasize - always quoted
        return `"${expr.value}"`;

      case "identifier":
        return expr.name;

      case "functionCall": {
        const args = expr.args.map((a) => this.printExpr(a)).join(", ");
        return `${expr.name}(${args})`;
      }
    }
  }

  private printLiteral(value: bigint | string | boolean): string {
    if (typeof value === "bigint") {
      // Yul doesn't support negative literals, use sub(0, abs_value) instead
      if (value < 0n) {
        return `sub(0, ${(-value).toString()})`;
      }
      return value.toString();
    }
    if (typeof value === "boolean") {
      return value ? "1" : "0";
    }
    // String literal (already quoted if needed)
    if (value.startsWith('"')) {
      return value;
    }
    return `"${value}"`;
  }
}
