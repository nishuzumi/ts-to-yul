import {
  SourceFile,
  ClassDeclaration,
  PropertyDeclaration,
  MethodDeclaration,
  Scope,
  Node,
  SyntaxKind,
} from "ts-morph";
import { EvmType, mapType, TypeContext } from "../evm/types.js";
import { computeSelector } from "../evm/abi.js";

export interface StorageVariable {
  name: string;
  type: EvmType;
  slot: bigint;
  defaultValue?: bigint;
}

export interface Parameter {
  name: string;
  type: EvmType;
}

export interface FunctionInfo {
  name: string;
  selector: string;
  params: Parameter[];
  returnType: EvmType | null;
  visibility: "public" | "private";
  mutability: "pure" | "view" | "nonpayable" | "payable";
  isConstructor: boolean;
}

export interface ContractInfo {
  name: string;
  storage: StorageVariable[];
  functions: FunctionInfo[];
  constructor: FunctionInfo | null;
}

export class Analyzer {
  private nextSlot = 0n;
  private enumNames = new Set<string>();
  private structNames = new Set<string>();

  /**
   * Analyze source file and extract contract information
   */
  analyze(sourceFile: SourceFile): ContractInfo[] {
    // Pre-collect enum and struct names for type resolution
    this.collectTypeDefinitions(sourceFile);

    const classes = sourceFile.getClasses().filter((c) => c.isExported());
    return classes.map((c) => this.analyzeClass(c));
  }

  /**
   * Collect enum and struct type definitions from source file
   */
  private collectTypeDefinitions(sourceFile: SourceFile): void {
    this.enumNames.clear();
    this.structNames.clear();

    // Collect enum names
    for (const enumDecl of sourceFile.getEnums()) {
      this.enumNames.add(enumDecl.getName());
    }

    // Collect struct names (interfaces without methods)
    for (const iface of sourceFile.getInterfaces()) {
      if (iface.getMethods().length === 0 && iface.getProperties().length > 0) {
        this.structNames.add(iface.getName());
      }
    }
  }

  /**
   * Create TypeContext for resolving custom types
   */
  private createTypeContext(): TypeContext {
    return {
      isEnum: (name) => this.enumNames.has(name),
      getStructType: (name) => {
        if (this.structNames.has(name)) {
          // Structs are represented as uint256 (slot reference) in ABI
          return { kind: "uint", bits: 256 };
        }
        return null;
      },
    };
  }

  private analyzeClass(classDecl: ClassDeclaration): ContractInfo {
    const name = classDecl.getName() ?? "Contract";
    this.nextSlot = 0n;

    const storage = this.analyzeStorage(classDecl);
    const functions = this.analyzeFunctions(classDecl);
    const ctor = functions.find((f) => f.isConstructor) ?? null;

    return {
      name,
      storage,
      functions: functions.filter((f) => !f.isConstructor),
      constructor: ctor,
    };
  }

  private analyzeStorage(classDecl: ClassDeclaration): StorageVariable[] {
    const context = this.createTypeContext();
    return classDecl
      .getProperties()
      .filter((prop) => this.hasStorageDecorator(prop))
      .map((prop) => {
        const defaultValue = this.extractDefaultValue(prop);
        const storageVar: StorageVariable = {
          name: prop.getName(),
          type: mapType(prop.getTypeNode()?.getText() ?? "u256", context),
          slot: this.nextSlot++,
        };
        if (defaultValue !== undefined) {
          storageVar.defaultValue = defaultValue;
        }
        return storageVar;
      });
  }

  private extractDefaultValue(prop: PropertyDeclaration): bigint | undefined {
    const initializer = prop.getInitializer();
    if (!initializer) return undefined;

    // Handle BigInt literal: e.g., 3000n
    if (Node.isBigIntLiteral(initializer)) {
      const text = initializer.getText();
      return BigInt(text.slice(0, -1)); // Remove trailing 'n'
    }

    // Handle numeric literal: e.g., 3000
    if (Node.isNumericLiteral(initializer)) {
      return BigInt(initializer.getLiteralValue());
    }

    // Handle negative numbers: e.g., -887272n
    if (Node.isPrefixUnaryExpression(initializer)) {
      const operand = initializer.getOperand();
      if (initializer.getOperatorToken() === SyntaxKind.MinusToken) {
        if (Node.isBigIntLiteral(operand)) {
          const text = operand.getText();
          return -BigInt(text.slice(0, -1));
        } else if (Node.isNumericLiteral(operand)) {
          return -BigInt(operand.getLiteralValue());
        }
      }
    }

    return undefined;
  }

  private hasStorageDecorator(prop: PropertyDeclaration): boolean {
    return prop.getDecorators().some((d) => d.getName() === "storage");
  }

  private analyzeFunctions(classDecl: ClassDeclaration): FunctionInfo[] {
    const methods = classDecl.getMethods();
    const ctors = classDecl.getConstructors();
    const functions: FunctionInfo[] = [];

    // Analyze constructor
    if (ctors.length > 0) {
      const ctor = ctors[0]!;
      functions.push({
        name: "constructor",
        selector: "",
        params: this.analyzeParams(ctor.getParameters()),
        returnType: null,
        visibility: "public",
        mutability: "nonpayable",
        isConstructor: true,
      });
    }

    // Analyze methods
    for (const method of methods) {
      const name = method.getName();
      // Check visibility: private keyword or @internal decorator -> not public
      // @external decorator -> public (explicit)
      const decorators = method.getDecorators().map((d) => d.getName());
      const hasInternal = decorators.includes("internal");
      const hasExternal = decorators.includes("external");
      const isPublic = hasExternal || (!hasInternal && method.getScope() !== Scope.Private);
      const params = this.analyzeParams(method.getParameters());
      const returnType = this.analyzeReturnType(method);
      const mutability = this.analyzeMutability(method);

      // Compute function selector for public functions
      const selector = isPublic ? computeSelector(name, params) : "";

      functions.push({
        name,
        selector,
        params,
        returnType,
        visibility: isPublic ? "public" : "private",
        mutability,
        isConstructor: false,
      });
    }

    return functions;
  }

  private analyzeParams(
    params: import("ts-morph").ParameterDeclaration[]
  ): Parameter[] {
    const context = this.createTypeContext();
    return params
      .filter((p) => p.getName() !== "this") // Skip 'this' parameter
      .map((p) => ({
        name: p.getName(),
        type: mapType(p.getTypeNode()?.getText() ?? "u256", context),
      }));
  }

  private analyzeReturnType(method: MethodDeclaration): EvmType | null {
    const returnTypeNode = method.getReturnTypeNode();
    if (!returnTypeNode) return null;

    const typeName = returnTypeNode.getText();
    if (typeName === "void") return null;

    const context = this.createTypeContext();
    return mapType(typeName, context);
  }

  private analyzeMutability(
    method: MethodDeclaration
  ): "pure" | "view" | "nonpayable" | "payable" {
    const mutabilities = ["payable", "view", "pure"] as const;
    const decoratorNames = method.getDecorators().map((d) => d.getName());
    return mutabilities.find((m) => decoratorNames.includes(m)) ?? "nonpayable";
  }
}
