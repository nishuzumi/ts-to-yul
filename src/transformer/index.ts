import {
  ClassDeclaration,
  MethodDeclaration,
  ConstructorDeclaration,
  FunctionDeclaration,
  PropertyDeclaration,
  Node,
  SyntaxKind,
  PropertyAccessExpression,
  BinaryExpression,
  Identifier,
  NumericLiteral,
  BigIntLiteral,
  ReturnStatement,
  ExpressionStatement,
  IfStatement,
  WhileStatement,
  DoStatement,
  ForStatement,
  Block,
  Scope,
  CallExpression,
  ElementAccessExpression,
  VariableStatement,
  TypeNode,
  ObjectLiteralExpression,
  TaggedTemplateExpression,
  ConditionalExpression,
  DeleteExpression,
  TryStatement,
  NewExpression,
} from "ts-morph";
import type { YulObject, YulStatement, YulExpression } from "../yul/ast.js";
import { computeSelector, computeSelectorFromSignature, computeEventSignature } from "../evm/abi.js";
import {
  mapType,
  fromSolidityType,
  type EvmType,
  type TypeContext,
  getTypeByteSize as evmGetTypeByteSize,
  getTypeMinMax as evmGetTypeMinMax,
  tsTypeToSolidityType as evmTsTypeToSolidityType,
} from "../evm/types.js";

interface StructFieldInfo {
  offset: bigint; // Offset from base slot
  type: string;
}

interface StructInfo {
  name: string;
  fields: Map<string, StructFieldInfo>;
  size: bigint; // Total slots used by the struct
}

interface StorageInfo {
  slot: bigint;
  type: string; // Original type text (e.g., "u256", "address", "Mapping<address, u256>")
  isMapping: boolean;
  mappingDepth: number; // 1 for Mapping<K,V>, 2 for Mapping<K, Mapping<K2, V>>, etc.
  isArray: boolean; // Dynamic array (StorageArray<T>)
  isFixedArray: boolean; // Fixed-size array (T[N])
  fixedArraySize?: bigint; // Size of fixed array
  isStruct: boolean;
  structInfo?: StructInfo; // Info about struct fields if isStruct is true
  mappingValueStruct?: StructInfo; // Struct info for Mapping<K, StructType>
  defaultValue?: bigint; // Default value from initializer
  isExternalFunction?: boolean; // ExternalFunction<Args, Return> - stores address + selector
  // Storage packing fields
  byteOffset?: number; // Byte offset within the slot (0-31)
  byteSize?: number; // Byte size of the type (1-32)
  // Dynamic bytes/string storage
  isDynamicBytes?: boolean; // StorageBytes - dynamic bytes array
  isDynamicString?: boolean; // StorageString - dynamic string
  // EIP-1153 Transient storage
  isTransient?: boolean; // Uses tload/tstore instead of sload/sstore
}

export interface TransformerEventField {
  name: string;
  type: EvmType;
  indexed: boolean;
}

export interface TransformerEventInfo {
  name: string;
  fields: TransformerEventField[];
}

interface EventField {
  name: string;
  type: string;
  indexed: boolean;
}

interface EventInfo {
  name: string;
  signature: string; // keccak256 hash of event signature
  fields: EventField[];
  indexedCount: number;
  anonymous: boolean; // If true, topic0 (signature) is not included
}

interface ParamMeta {
  name: string;
  type: string; // TypeScript type text
  isDynamicArray: boolean; // CalldataArray<T> or T[]
}

interface FunctionMeta {
  name: string;
  selector: string;
  hasReturn: boolean;
  paramCount: number;
  returnCount: number; // 1 for single return, >1 for tuple
  isPayable: boolean;
  params: ParamMeta[]; // Parameter metadata for ABI decoding
}

interface EnumInfo {
  name: string;
  members: Map<string, bigint>; // member name -> value
}

interface CustomErrorParam {
  name: string;
  type: string; // Solidity type name (e.g., "uint256", "address")
}

interface CustomErrorInfo {
  name: string;
  params: CustomErrorParam[];
  selector: bigint; // First 4 bytes of keccak256(signature)
  signature: string; // e.g., "InsufficientBalance(uint256,uint256)"
}

interface ContractInterfaceMethod {
  name: string;
  params: { name: string; type: string }[]; // Solidity types
  returnType: string; // Solidity type
  selector: bigint;
  signature: string; // e.g., "transfer(address,uint256)"
}

interface ContractInterfaceInfo {
  name: string;
  methods: Map<string, ContractInterfaceMethod>;
}

interface LibraryMethodInfo {
  name: string;
  params: { name: string; type: string }[];
  returnType: string;
  methodDecl: MethodDeclaration;
}

interface LibraryInfo {
  name: string;
  methods: Map<string, LibraryMethodInfo>;
  classDecl: ClassDeclaration;
}

interface ImportedFunctionInfo {
  name: string;
  params: { name: string; type: string }[];
  returnType: string;
  declaration: FunctionDeclaration;
}

export class Transformer {
  private storage: Map<string, StorageInfo> = new Map();
  private events: Map<string, EventInfo> = new Map();
  private structDefinitions: Map<string, StructInfo> = new Map(); // Parsed struct/interface definitions
  private enumDefinitions: Map<string, EnumInfo> = new Map(); // Parsed enum definitions
  private customErrors: Map<string, CustomErrorInfo> = new Map(); // Custom error definitions
  private contractInterfaces: Map<string, ContractInterfaceInfo> = new Map(); // External contract interfaces
  private libraries: Map<string, LibraryInfo> = new Map(); // Library classes with static methods
  private importedFunctions: Map<string, ImportedFunctionInfo> = new Map(); // Imported standalone functions
  private modifiers: Map<string, MethodDeclaration> = new Map(); // Modifier function declarations
  private memoryArrays: Set<string> = new Set(); // Track memory array variable names
  private calldataArrayParams: Map<string, { offsetVar: string; lenVar: string }> = new Map(); // Track calldata array params
  private constants: Map<string, bigint> = new Map(); // Track private constant class members
  private immutables: Map<string, { slot: bigint; type: string }> = new Map(); // Track immutable variables
  private contractName = "";
  private currentMethodReturns: string[] = []; // Track return variables for current method
  private condCounter = 0; // Counter for generating unique condition variable names
  private currentClass: ClassDeclaration | null = null; // Current class being transformed
  private generatedAbiEncodeHelpers: Set<number> = new Set(); // Track generated abi.encode helpers by arg count
  private generatedAbiEncodePackedHelpers: Set<number> = new Set(); // Track generated abi.encodePacked helpers
  private generatedBytesConcatHelpers: Set<number> = new Set(); // Track generated bytes.concat helpers
  private generatedAbiEncodeSelectorHelpers: Set<number> = new Set(); // Track generated abi.encodeWithSelector helpers
  private generatedAbiDecodeHelpers: Set<number> = new Set(); // Track generated abi.decode helpers
  private generatedDelegatecallHelpers: Set<number> = new Set(); // Track generated delegatecall helpers
  private generatedCreateHelpers: Set<number> = new Set(); // Track generated contract create helpers
  private generatedCreate2Helpers: Set<number> = new Set(); // Track generated contract create2 helpers
  private generatedCallHelpers: Set<number> = new Set(); // Track generated external call helpers
  private generatedStaticCallHelpers: Set<number> = new Set(); // Track generated external staticcall helpers
  private dynamicHelpers: YulStatement[] = []; // Dynamically generated helpers
  private inheritanceChain: ClassDeclaration[] = []; // Current inheritance chain (base to derived)
  private parentMethods: Map<string, string> = new Map(); // Maps method name -> parent prefixed name (for super calls)
  private currentMethodClass: ClassDeclaration | null = null; // Class whose method is currently being transformed
  private inConstructor: boolean = false; // Flag to track if we're in constructor (for inlining inherited method calls)
  private inheritedMethods: Map<string, MethodDeclaration> = new Map(); // Maps method name -> method declaration (for inlining)
  private usingDeclarations: Map<string, Set<string>> = new Map(); // Maps type -> Set of library names (using Lib for Type)
  private typeNameHelpers: Set<string> = new Set(); // Track which type(C).name helpers are needed
  private typeCreationCodeHelpers: Set<string> = new Set(); // Track which type(C).creationCode helpers are needed

  /**
   * Get the storage load opcode for a storage variable.
   * Returns "tload" for transient storage, "sload" for persistent storage.
   */
  private getLoadOp(storageInfo: StorageInfo | undefined): "sload" | "tload" {
    return storageInfo?.isTransient ? "tload" : "sload";
  }

  /**
   * Get the storage store opcode for a storage variable.
   * Returns "tstore" for transient storage, "sstore" for persistent storage.
   */
  private getStoreOp(storageInfo: StorageInfo | undefined): "sstore" | "tstore" {
    return storageInfo?.isTransient ? "tstore" : "sstore";
  }

  /**
   * Create TypeContext for resolving custom types (enums, structs)
   */
  private createTypeContext(): TypeContext {
    return {
      isEnum: (name) => this.enumDefinitions.has(name),
      getStructType: (name) => {
        const info = this.structDefinitions.get(name);
        if (!info) return null;
        // Create tuple type from struct fields
        const elements = [...info.fields.values()].map((f) =>
          mapType(f.type, this.createTypeContext())
        );
        return { kind: "tuple", elements };
      },
    };
  }

  /**
   * Transform a class declaration to Yul AST
   */
  transform(classDecl: ClassDeclaration): YulObject {
    this.contractName = classDecl.getName() ?? "Contract";
    this.currentClass = classDecl;
    // Clear dynamic helpers from previous transforms
    this.generatedAbiEncodeHelpers.clear();
    this.generatedAbiEncodePackedHelpers.clear();
    this.generatedBytesConcatHelpers.clear();
    this.generatedAbiEncodeSelectorHelpers.clear();
    this.generatedAbiDecodeHelpers.clear();
    this.generatedDelegatecallHelpers.clear();
    this.generatedCreateHelpers.clear();
    this.generatedCreate2Helpers.clear();
    this.generatedCallHelpers.clear();
    this.generatedStaticCallHelpers.clear();
    this.dynamicHelpers = [];
    this.parentMethods.clear();
    this.analyzeEnumDefinitions(classDecl); // Parse enums first
    this.analyzeStructDefinitions(classDecl); // Parse interfaces as structs
    this.analyzeContractInterfaces(classDecl); // Parse contract interfaces (with methods)
    this.analyzeLibraries(classDecl); // Parse library classes with static methods
    this.analyzeImportedFunctions(classDecl); // Parse imported standalone functions
    this.analyzeCustomErrors(classDecl); // Parse custom error declarations

    // Get the inheritance chain (from base to derived)
    const inheritanceChain = this.getInheritanceChain(classDecl);
    this.inheritanceChain = inheritanceChain;

    // Analyze storage, events, modifiers, and constants for the full inheritance chain
    this.analyzeStorageWithInheritance(inheritanceChain);
    this.analyzeEventsWithInheritance(inheritanceChain);
    this.analyzeModifiersWithInheritance(inheritanceChain);
    this.analyzeConstantsWithInheritance(inheritanceChain);
    this.collectInheritedMethods(inheritanceChain);

    return {
      name: this.contractName,
      code: this.generateConstructorCode(classDecl),
      subObjects: [
        {
          name: `${this.contractName}_deployed`,
          code: this.generateDeployedCode(inheritanceChain),
          subObjects: [],
          data: new Map(),
        },
      ],
      data: new Map(),
    };
  }

  /**
   * Get events for ABI generation (call after transform)
   */
  getEvents(): TransformerEventInfo[] {
    const result: TransformerEventInfo[] = [];
    const context = this.createTypeContext();
    for (const [name, info] of this.events) {
      result.push({
        name,
        fields: info.fields.map((f) => ({
          name: f.name,
          type: mapType(f.type, context),
          indexed: f.indexed,
        })),
      });
    }
    return result;
  }

  /**
   * Analyze enum declarations.
   * Each enum member gets a numeric value starting from 0.
   *
   * Example:
   * ```typescript
   * enum Status { Pending, Active, Completed }
   * // Pending = 0, Active = 1, Completed = 2
   * ```
   */
  private analyzeEnumDefinitions(classDecl: ClassDeclaration): void {
    this.enumDefinitions.clear();

    const sourceFile = classDecl.getSourceFile();

    for (const enumDecl of sourceFile.getEnums()) {
      const name = enumDecl.getName();
      const members = new Map<string, bigint>();

      let value = 0n;
      for (const member of enumDecl.getMembers()) {
        const memberName = member.getName();
        // Check if member has explicit initializer
        const initializer = member.getInitializer();
        if (initializer) {
          // Parse numeric literal
          const initText = initializer.getText();
          if (initText.endsWith("n")) {
            value = BigInt(initText.slice(0, -1));
          } else {
            value = BigInt(initText);
          }
        }
        members.set(memberName, value);
        value++;
      }

      this.enumDefinitions.set(name, { name, members });
    }
  }

  /**
   * Analyze interface declarations as struct definitions.
   * Each interface field becomes a struct member with a storage slot offset.
   * Supports nested structs - fields that are themselves struct types.
   */
  private analyzeStructDefinitions(classDecl: ClassDeclaration): void {
    this.structDefinitions.clear();

    // Get the source file containing the class
    const sourceFile = classDecl.getSourceFile();

    // First pass: collect all interface names that are likely structs
    // (have only property signatures, no methods)
    const pendingStructs = new Map<
      string,
      { iface: ReturnType<typeof sourceFile.getInterfaces>[number]; deps: Set<string> }
    >();
    const structNames = new Set<string>();

    for (const iface of sourceFile.getInterfaces()) {
      const name = iface.getName();
      // Skip interfaces with methods (those are contract interfaces)
      if (iface.getMethods().length > 0) continue;
      if (iface.getProperties().length === 0) continue;

      structNames.add(name);
    }

    // Second pass: identify dependencies between structs
    for (const iface of sourceFile.getInterfaces()) {
      const name = iface.getName();
      if (!structNames.has(name)) continue;

      const deps = new Set<string>();
      for (const prop of iface.getProperties()) {
        const typeText = prop.getTypeNode()?.getText() ?? "u256";
        const actualType = typeText.startsWith("indexed<") ? typeText.slice(8, -1) : typeText;
        if (structNames.has(actualType)) {
          deps.add(actualType);
        }
      }
      pendingStructs.set(name, { iface, deps });
    }

    // Third pass: topological sort - process structs with no dependencies first
    const processed = new Set<string>();
    while (pendingStructs.size > 0) {
      let foundOne = false;
      for (const [name, { iface, deps }] of pendingStructs) {
        // Check if all dependencies are resolved
        const unresolvedDeps = [...deps].filter((d) => !processed.has(d));
        if (unresolvedDeps.length === 0) {
          // Process this struct
          this.parseStructDefinition(iface, name);
          processed.add(name);
          pendingStructs.delete(name);
          foundOne = true;
          break;
        }
      }
      // If no progress made, there's a circular dependency - process remaining anyway
      if (!foundOne && pendingStructs.size > 0) {
        const [name, { iface }] = pendingStructs.entries().next().value as [
          string,
          { iface: ReturnType<typeof sourceFile.getInterfaces>[number]; deps: Set<string> },
        ];
        this.parseStructDefinition(iface, name);
        processed.add(name);
        pendingStructs.delete(name);
      }
    }
  }

  /**
   * Parse a single struct definition, accounting for nested struct sizes.
   */
  private parseStructDefinition(
    iface: ReturnType<
      ReturnType<typeof import("ts-morph").ClassDeclaration.prototype.getSourceFile>["getInterfaces"]
    >[number],
    name: string
  ): void {
    const fields = new Map<string, StructFieldInfo>();
    let offset = 0n;

    for (const prop of iface.getProperties()) {
      const propName = prop.getName();
      const typeText = prop.getTypeNode()?.getText() ?? "u256";

      // Skip indexed<T> wrapper for events (those are not struct fields)
      const actualType = typeText.startsWith("indexed<") ? typeText.slice(8, -1) : typeText;

      fields.set(propName, {
        offset: offset,
        type: actualType,
      });

      // Check if this field is a nested struct
      const nestedStruct = this.structDefinitions.get(actualType);
      if (nestedStruct) {
        // Nested struct takes multiple slots
        offset += nestedStruct.size;
      } else {
        // Each primitive field takes one slot (for now, we don't pack)
        offset++;
      }
    }

    if (fields.size > 0) {
      this.structDefinitions.set(name, {
        name,
        fields,
        size: offset,
      });
    }
  }

  /**
   * Analyze contract interface declarations.
   * Contract interfaces have method signatures used for typed external calls.
   *
   * Example:
   * ```typescript
   * interface IERC20 {
   *   transfer(to: address, amount: u256): bool;
   *   balanceOf(account: address): u256;
   * }
   * ```
   */
  private analyzeContractInterfaces(classDecl: ClassDeclaration): void {
    this.contractInterfaces.clear();

    const sourceFile = classDecl.getSourceFile();

    // Find all interface declarations that have methods
    for (const iface of sourceFile.getInterfaces()) {
      const name = iface.getName();
      const methods = new Map<string, ContractInterfaceMethod>();

      // Get method signatures from the interface
      for (const method of iface.getMethods()) {
        const methodName = method.getName();
        const params: { name: string; type: string }[] = [];
        const solidityTypes: string[] = [];

        for (const param of method.getParameters()) {
          const paramName = param.getName();
          const paramType = param.getTypeNode()?.getText() ?? "u256";
          const solType = this.tsTypeToSolidityType(paramType);
          params.push({ name: paramName, type: solType });
          solidityTypes.push(solType);
        }

        // Get return type
        const returnTypeNode = method.getReturnTypeNode();
        const returnType = returnTypeNode
          ? this.tsTypeToSolidityType(returnTypeNode.getText())
          : "uint256";

        // Compute signature and selector
        const signature = `${methodName}(${solidityTypes.join(",")})`;
        const selector = computeSelectorFromSignature(signature);

        methods.set(methodName, {
          name: methodName,
          params,
          returnType,
          selector,
          signature,
        });
      }

      if (methods.size > 0) {
        this.contractInterfaces.set(name, {
          name,
          methods,
        });
      }
    }
  }

  /**
   * Analyze library classes.
   * Libraries are classes with static methods that can be inlined.
   *
   * Example:
   * ```typescript
   * export class SafeMath {
   *   static add(a: u256, b: u256): u256 {
   *     const c = a + b;
   *     require(c >= a, "overflow");
   *     return c;
   *   }
   * }
   * ```
   */
  private analyzeLibraries(classDecl: ClassDeclaration): void {
    this.libraries.clear();

    const sourceFile = classDecl.getSourceFile();
    const mainClassName = classDecl.getName();

    // Find all class declarations that are not the main contract
    for (const cls of sourceFile.getClasses()) {
      const name = cls.getName();
      if (!name || name === mainClassName) continue;

      // Check if the class has static methods (making it a library)
      const staticMethods = cls.getStaticMethods();
      if (staticMethods.length === 0) continue;

      const methods = new Map<string, LibraryMethodInfo>();

      for (const method of staticMethods) {
        const methodName = method.getName();
        const params: { name: string; type: string }[] = [];

        for (const param of method.getParameters()) {
          const paramName = param.getName();
          const paramType = param.getTypeNode()?.getText() ?? "u256";
          params.push({ name: paramName, type: paramType });
        }

        const returnTypeNode = method.getReturnTypeNode();
        const returnType = returnTypeNode?.getText() ?? "void";

        methods.set(methodName, {
          name: methodName,
          params,
          returnType,
          methodDecl: method,
        });
      }

      if (methods.size > 0) {
        this.libraries.set(name, {
          name,
          methods,
          classDecl: cls,
        });
      }
    }

    // After analyzing libraries, analyze using declarations
    this.analyzeUsingDeclarations(classDecl);
  }

  /**
   * Analyze `using` declarations from comments or decorators.
   * Supports:
   * - Comment syntax: // using LibraryName for TypeName
   * - Also supports: // @using LibraryName for TypeName
   *
   * Example:
   * ```typescript
   * // using Math for u256
   * // using SafeTransfer for address
   * export class MyContract { ... }
   * ```
   */
  private analyzeUsingDeclarations(classDecl: ClassDeclaration): void {
    this.usingDeclarations.clear();

    const sourceFile = classDecl.getSourceFile();
    const fullText = sourceFile.getFullText();

    // Parse comments for using declarations
    // Matches: // using LibraryName for TypeName
    // or: // @using LibraryName for TypeName
    const usingRegex = /\/\/\s*@?using\s+(\w+)\s+for\s+(\w+)/g;
    let match;

    while ((match = usingRegex.exec(fullText)) !== null) {
      const libraryName = match[1]!;
      const typeName = match[2]!;

      // Verify the library exists
      if (!this.libraries.has(libraryName)) {
        continue; // Skip if library doesn't exist
      }

      // Add the using declaration
      if (!this.usingDeclarations.has(typeName)) {
        this.usingDeclarations.set(typeName, new Set());
      }
      this.usingDeclarations.get(typeName)!.add(libraryName);
    }
  }

  /**
   * Analyze imported standalone functions from other modules.
   * These are functions imported via named imports that will be inlined as Yul functions.
   *
   * Example:
   * ```typescript
   * import { sqrt, min } from "./libraries/Math.js";
   * ```
   */
  private analyzeImportedFunctions(classDecl: ClassDeclaration): void {
    this.importedFunctions.clear();

    const sourceFile = classDecl.getSourceFile();

    // Iterate through all import declarations
    for (const importDecl of sourceFile.getImportDeclarations()) {
      const namedImports = importDecl.getNamedImports();
      if (namedImports.length === 0) continue;

      // Skip runtime imports (types and built-in functions)
      const moduleSpecifier = importDecl.getModuleSpecifierValue();
      if (moduleSpecifier.includes("runtime")) continue;

      // Try to get the source file of the imported module
      const importedSourceFile = importDecl.getModuleSpecifierSourceFile();
      if (!importedSourceFile) continue;

      // Check each named import
      for (const namedImport of namedImports) {
        const importName = namedImport.getName();

        // Look for a function with this name in the imported file
        const func = importedSourceFile.getFunction(importName);
        if (!func) continue;

        // Skip functions without a body (type declarations like `declare function`)
        if (!func.getBody()) continue;

        // Get function parameters
        const params: { name: string; type: string }[] = [];
        for (const param of func.getParameters()) {
          const paramName = param.getName();
          const paramType = param.getTypeNode()?.getText() ?? "u256";
          params.push({ name: paramName, type: paramType });
        }

        // Get return type
        const returnTypeNode = func.getReturnTypeNode();
        const returnType = returnTypeNode?.getText() ?? "void";

        this.importedFunctions.set(importName, {
          name: importName,
          params,
          returnType,
          declaration: func,
        });
      }
    }
  }

  /**
   * Analyze custom error declarations.
   * Custom errors are declared as function declarations that return `never`.
   *
   * Example:
   * ```typescript
   * declare function InsufficientBalance(required: u256, available: u256): never;
   * ```
   */
  private analyzeCustomErrors(classDecl: ClassDeclaration): void {
    this.customErrors.clear();

    const sourceFile = classDecl.getSourceFile();

    // Find all function declarations that return 'never'
    for (const fn of sourceFile.getFunctions()) {
      const returnType = fn.getReturnTypeNode()?.getText();
      if (returnType !== "never") continue;

      const name = fn.getName();
      if (!name) continue;

      const params: CustomErrorParam[] = [];
      const solidityTypes: string[] = [];

      for (const param of fn.getParameters()) {
        const paramName = param.getName();
        const paramType = param.getTypeNode()?.getText() ?? "u256";

        // Convert TypeScript type to Solidity type
        const solType = this.tsTypeToSolidityType(paramType);
        params.push({ name: paramName, type: solType });
        solidityTypes.push(solType);
      }

      // Compute signature and selector
      const signature = `${name}(${solidityTypes.join(",")})`;
      const selector = computeSelectorFromSignature(signature);

      this.customErrors.set(name, {
        name,
        params,
        selector,
        signature,
      });
    }
  }

  /**
   * Check if a node has a signed integer type (i8, i16, i24, i32, etc.)
   */
  private isSignedType(node: Node): boolean {
    try {
      // First, try to get the type annotation text directly
      if (Node.isExpression(node)) {
        // For property access expressions like this.tick
        if (Node.isPropertyAccessExpression(node)) {
          const propName = node.getName();
          const objExpr = node.getExpression();
          // Check if it's accessing 'this'
          if (Node.isThisExpression(objExpr)) {
            // Look up the property in the class
            const classDecl = node.getFirstAncestorByKind(SyntaxKind.ClassDeclaration);
            if (classDecl) {
              const prop = classDecl.getProperty(propName);
              if (prop) {
                const typeNode = prop.getTypeNode();
                if (typeNode) {
                  const typeText = typeNode.getText();
                  if (this.isSignedTypeText(typeText)) {
                    return true;
                  }
                }
              }
            }
          }
        }

        // For identifiers, check if we know their declared type
        if (Node.isIdentifier(node)) {
          const symbol = node.getSymbol();
          if (symbol) {
            const declarations = symbol.getDeclarations();
            for (const decl of declarations) {
              // Check parameter declarations
              if (Node.isParameterDeclaration(decl)) {
                const typeNode = decl.getTypeNode();
                if (typeNode) {
                  const typeText = typeNode.getText();
                  if (/^i\d+$/.test(typeText) || /^Int<\d+>$/.test(typeText)) {
                    return true;
                  }
                }
              }
              // Check variable declarations
              if (Node.isVariableDeclaration(decl)) {
                const typeNode = decl.getTypeNode();
                if (typeNode) {
                  const typeText = typeNode.getText();
                  if (/^i\d+$/.test(typeText) || /^Int<\d+>$/.test(typeText)) {
                    return true;
                  }
                }
                // For variable declarations without explicit type, check inferred type
                const inferredType = decl.getType().getText();
                if (this.isSignedTypeText(inferredType)) {
                  return true;
                }
              }
              // Check property declarations (class members)
              if (Node.isPropertyDeclaration(decl)) {
                const typeNode = decl.getTypeNode();
                if (typeNode) {
                  const typeText = typeNode.getText();
                  if (/^i\d+$/.test(typeText) || /^Int<\d+>$/.test(typeText)) {
                    return true;
                  }
                }
              }
            }
          }
        }
      }

      // Fallback: check the type text
      const type = node.getType();
      const typeText = type.getText();

      if (this.isSignedTypeText(typeText)) {
        return true;
      }

      return false;
    } catch {
      return false;
    }
  }

  /**
   * Helper to check if a type text string represents a signed type
   */
  private isSignedTypeText(typeText: string): boolean {
    // Check for i8, i16, i24, i32, i64, i128, i256, etc.
    if (/^i\d+$/.test(typeText)) {
      return true;
    }

    // Check for Int<N> generic
    if (/^Int<\d+>$/.test(typeText)) {
      return true;
    }

    // Check for resolved Int<N> type: bigint & { readonly __int?: N }
    // This pattern appears when TypeScript resolves type aliases
    if (typeText.includes("__int")) {
      return true;
    }

    return false;
  }

  /**
   * Convert TypeScript type to Solidity type name.
   * Used for computing error selectors.
   */
  private tsTypeToSolidityType(tsType: string): string {
    return evmTsTypeToSolidityType(tsType);
  }

  /**
   * Get min and max values for a type.
   * Used for type(T).min and type(T).max expressions.
   */
  private getTypeMinMax(typeText: string): { min: bigint; max: bigint } | null {
    return evmGetTypeMinMax(typeText);
  }

  private extractStorageDefaultValue(prop: PropertyDeclaration): bigint | undefined {
    const initializer = prop.getInitializer();
    if (!initializer) return undefined;

    if (Node.isBigIntLiteral(initializer)) {
      const text = initializer.getText();
      return BigInt(text.slice(0, -1));
    }

    if (Node.isNumericLiteral(initializer)) {
      return BigInt(initializer.getLiteralValue());
    }

    if (Node.isPrefixUnaryExpression(initializer)) {
      const operand = initializer.getOperand();
      if (initializer.getOperatorToken() === SyntaxKind.MinusToken) {
        if (Node.isBigIntLiteral(operand)) {
          return -BigInt(operand.getText().slice(0, -1));
        }
        if (Node.isNumericLiteral(operand)) {
          return -BigInt(operand.getLiteralValue());
        }
      }
    }

    return undefined;
  }

  /**
   * Analyze if a type is an array type (e.g., u256[], address[])
   */
  private analyzeArrayType(typeNode: TypeNode | undefined): boolean {
    if (!typeNode) return false;
    const typeText = typeNode.getText();
    // Check for TypeScript array syntax: u256[] or Array<u256>
    return typeText.endsWith("[]") || typeText.startsWith("Array<") || typeText.startsWith("StorageArray<");
  }

  /**
   * Analyze if a type is a Mapping and calculate its depth
   * Also extracts the final value type (after all Mapping<K, ...> wrappers)
   */
  private analyzeMappingType(typeNode: TypeNode | undefined): {
    isMapping: boolean;
    depth: number;
    valueType?: string;
  } {
    if (!typeNode) {
      return { isMapping: false, depth: 0 };
    }

    const typeText = typeNode.getText();

    // Check if it's a Mapping type
    if (!typeText.startsWith("Mapping<")) {
      return { isMapping: false, depth: 0 };
    }

    // Count nesting depth by counting "Mapping<" occurrences
    let depth = 0;
    let remaining = typeText;
    while (remaining.includes("Mapping<")) {
      depth++;
      remaining = remaining.replace("Mapping<", "");
    }

    // Extract the final value type
    // For Mapping<address, User>, remaining is "address, User>>"
    // For Mapping<address, Mapping<address, u256>>, remaining is "address, address, u256>>>"
    // We want the last type before the closing >
    const parts = remaining.replace(/>/g, "").split(",").map((s) => s.trim());
    const valueType = parts.length > 0 ? parts[parts.length - 1] : undefined;

    if (valueType) {
      return { isMapping: true, depth, valueType };
    }
    return { isMapping: true, depth };
  }

  /**
   * Analyze if a type is a fixed-size array (e.g., u256[10], address[5])
   * Returns the size of the array if it is fixed-size.
   */
  private analyzeFixedArrayType(typeText: string): {
    isFixedArray: boolean;
    fixedArraySize?: bigint;
  } {
    // Match patterns like: u256[10], address[5], Bytes<32>[8]
    const match = typeText.match(/\[(\d+)\]$/);
    if (match) {
      const size = BigInt(match[1]!);
      return { isFixedArray: true, fixedArraySize: size };
    }
    return { isFixedArray: false };
  }

  /**
   * Get the byte size of a type for storage packing.
   * Returns the number of bytes the type occupies (1-32).
   * Types that can't be packed (mappings, arrays, structs) return 32.
   */
  private getTypeByteSize(typeText: string): number {
    // Enum - typically 1 byte (check class context first)
    if (this.enumDefinitions.has(typeText)) {
      return 1;
    }
    return evmGetTypeByteSize(typeText);
  }

  /**
   * Parse an interface to extract event fields
   */
  private parseEventInterface(classDecl: ClassDeclaration, interfaceName: string): EventField[] {
    // Try to find the interface in the same source file
    const sourceFile = classDecl.getSourceFile();
    const iface = sourceFile.getInterface(interfaceName);

    if (!iface) {
      // Interface not found, return empty (will be handled at compile time)
      return [];
    }

    const fields: EventField[] = [];
    for (const prop of iface.getProperties()) {
      const propName = prop.getName();
      const typeNode = prop.getTypeNode();
      const typeText = typeNode?.getText() ?? "u256";

      // Check if indexed<T>
      const indexed = typeText.startsWith("indexed<");
      let actualType = typeText;
      if (indexed) {
        const innerMatch = typeText.match(/indexed<(\w+)>/);
        actualType = innerMatch ? innerMatch[1]! : "u256";
      }

      fields.push({
        name: propName,
        type: actualType,
        indexed,
      });
    }

    return fields;
  }

  /**
   * Get the inheritance chain from base to derived class.
   * Returns an array where index 0 is the most base class and the last element is the current class.
   * Supports cross-file inheritance via imports.
   * Supports multiple inheritance via Mixin(A, B, C).
   */
  private getInheritanceChain(classDecl: ClassDeclaration): ClassDeclaration[] {
    const chain: ClassDeclaration[] = [];
    const seen = new Set<string>();

    // Helper to add class to chain if not already present
    const addToChain = (cls: ClassDeclaration) => {
      const name = cls.getName();
      if (name && !seen.has(name)) {
        seen.add(name);
        chain.push(cls);
      }
    };

    // Check extends (single inheritance or Mixin())
    const extendsExpr = classDecl.getExtends();
    if (extendsExpr) {
      const exprText = extendsExpr.getExpression().getText();

      // Check for Mixin(A, B, C) syntax - multiple inheritance
      if (exprText.startsWith("Mixin(")) {
        const expr = extendsExpr.getExpression();
        if (expr.getKind() === SyntaxKind.CallExpression) {
          const callExpr = expr as CallExpression;
          const args = callExpr.getArguments();
          for (const arg of args) {
            const parentName = arg.getText();
            const parentClass = this.resolveClass(classDecl.getSourceFile(), parentName);
            if (parentClass) {
              const parentChain = this.getInheritanceChain(parentClass);
              for (const cls of parentChain) {
                addToChain(cls);
              }
            }
          }
        }
      } else {
        // Single inheritance - traverse up the chain
        let currentClass = classDecl;
        const extendsChainLocal: ClassDeclaration[] = [];
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        while (true) {
          const ext = currentClass.getExtends();
          if (!ext) break;

          const parentName = ext.getExpression().getText();
          if (parentName.startsWith("Mixin(")) break;

          const parentClass = this.resolveClass(currentClass.getSourceFile(), parentName);
          if (!parentClass) break;

          extendsChainLocal.unshift(parentClass);
          currentClass = parentClass;
        }

        for (const cls of extendsChainLocal) {
          addToChain(cls);
        }
      }
    }

    // Add current class at the end
    addToChain(classDecl);

    return chain;
  }

  /**
   * Resolve a class by name, checking both the current file and imports.
   */
  private resolveClass(sourceFile: ReturnType<ClassDeclaration["getSourceFile"]>, className: string): ClassDeclaration | undefined {
    // First, look in the same file
    const localClass = sourceFile.getClass(className);
    if (localClass) {
      return localClass;
    }

    // Check imports for the class
    for (const importDecl of sourceFile.getImportDeclarations()) {
      const namedImports = importDecl.getNamedImports();
      for (const namedImport of namedImports) {
        if (namedImport.getName() === className) {
          // Found the import, resolve the source file
          const moduleSpecifier = importDecl.getModuleSpecifierValue();
          const importedSourceFile = importDecl.getModuleSpecifierSourceFile();

          if (importedSourceFile) {
            const importedClass = importedSourceFile.getClass(className);
            if (importedClass) {
              return importedClass;
            }
          }
        }
      }
    }

    return undefined;
  }

  /**
   * Extract explicit slot number from @slot decorator if present
   */
  private getExplicitSlot(prop: PropertyDeclaration): bigint | undefined {
    const slotDecorator = prop.getDecorators().find((d) => d.getName() === "slot");
    if (!slotDecorator) return undefined;

    const args = slotDecorator.getArguments();
    if (args.length === 0) return undefined;

    const argText = args[0]!.getText();
    // Handle bigint literals like 0n, 100n
    if (argText.endsWith("n")) {
      return BigInt(argText.slice(0, -1));
    }
    // Handle number literals
    return BigInt(argText);
  }

  /**
   * Analyze storage variables across the full inheritance chain.
   * Base class storage comes first, then derived class storage.
   * Implements storage packing for small types.
   * Supports @slot decorator for custom slot assignment.
   */
  private analyzeStorageWithInheritance(chain: ClassDeclaration[]): void {
    this.storage.clear();
    let slot = 0n;
    let currentByteOffset = 0; // Byte offset within current slot (0-31)

    // Check for storage variable name conflicts across inheritance chain
    const seenProps = new Map<string, string>(); // propName -> className
    for (const classDecl of chain) {
      for (const prop of classDecl.getProperties()) {
        if (prop.getDecorators().some((d) => d.getName() === "storage")) {
          const propName = prop.getName();
          const className = classDecl.getName() ?? "unknown";
          if (seenProps.has(propName)) {
            throw new Error(
              `Storage variable "${propName}" defined in both ${seenProps.get(propName)} and ${className}. ` +
                `Multiple inheritance does not allow duplicate storage variable names.`
            );
          }
          seenProps.set(propName, className);
        }
      }
    }

    // First pass: collect all explicit slot assignments and check for conflicts
    const explicitSlots = new Map<bigint, string>(); // slot -> propName
    for (const classDecl of chain) {
      for (const prop of classDecl.getProperties()) {
        const decoratorNames = prop.getDecorators().map((d) => d.getName());
        const hasStorage = decoratorNames.includes("storage");
        const hasTransient = decoratorNames.includes("transient");
        if (hasStorage || hasTransient) {
          const explicitSlot = this.getExplicitSlot(prop);
          if (explicitSlot !== undefined) {
            const propName = prop.getName();
            if (explicitSlots.has(explicitSlot)) {
              throw new Error(
                `Slot ${explicitSlot} is assigned to both "${explicitSlots.get(explicitSlot)}" and "${propName}". ` +
                  `Each @slot must specify a unique slot number.`
              );
            }
            explicitSlots.set(explicitSlot, propName);
          }
        }
      }
    }

    for (const classDecl of chain) {
      for (const prop of classDecl.getProperties()) {
        const decoratorNames = prop.getDecorators().map((d) => d.getName());
        const hasStorage = decoratorNames.includes("storage");
        const hasTransient = decoratorNames.includes("transient");
        if (hasStorage || hasTransient) {
          const typeNode = prop.getTypeNode();
          const typeText = typeNode?.getText() ?? "";
          const { isMapping, depth, valueType } = this.analyzeMappingType(typeNode);
          const isArray = this.analyzeArrayType(typeNode);
          const { isFixedArray, fixedArraySize } = this.analyzeFixedArrayType(typeText);

          // Check if this is a struct type
          const isStruct = this.structDefinitions.has(typeText);
          const structInfo = isStruct ? this.structDefinitions.get(typeText) : undefined;

          // Check if this is an external function type
          const isExternalFunction = typeText.startsWith("ExternalFunction<");

          // Check if this is dynamic bytes or string storage
          const isDynamicBytes = typeText === "StorageBytes";
          const isDynamicString = typeText === "StorageString";

          // Check if mapping value is a struct
          let mappingValueStruct: StructInfo | undefined;
          if (isMapping && valueType) {
            mappingValueStruct = this.structDefinitions.get(valueType);
          }

          // Get byte size for packing
          const byteSize = this.getTypeByteSize(typeText);

          // Determine if this type can be packed
          const canPack = !isMapping && !isArray && !isStruct && !isFixedArray && !isDynamicBytes && !isDynamicString;

          // Calculate slots needed for non-packable types
          let slotsNeeded = 1n;
          if (structInfo) {
            slotsNeeded = structInfo.size;
          } else if (isFixedArray && fixedArraySize) {
            slotsNeeded = fixedArraySize;
          }

          // Check for explicit slot assignment via @slot decorator
          const explicitSlot = this.getExplicitSlot(prop);
          let assignedSlot: bigint;
          let varByteOffset = 0;

          if (explicitSlot !== undefined) {
            // Use explicit slot - reset packing state but DON'T advance auto slot counter
            assignedSlot = explicitSlot;
            currentByteOffset = 0;
          } else {
            // Auto slot assignment with packing
            if (canPack && byteSize < 32) {
              // Check if we need to move to next slot (packing doesn't fit)
              if (currentByteOffset + byteSize > 32) {
                if (currentByteOffset > 0) {
                  slot += 1n;
                  // Skip any explicit slots
                  while (explicitSlots.has(slot)) {
                    slot += 1n;
                  }
                }
                currentByteOffset = 0;
              }
              // Skip explicit slots for current auto slot
              while (explicitSlots.has(slot)) {
                slot += 1n;
              }
              assignedSlot = slot;
              varByteOffset = currentByteOffset;
              currentByteOffset += byteSize;
            } else {
              // Non-packable type
              if (currentByteOffset > 0) {
                slot += 1n;
                currentByteOffset = 0;
              }
              // Skip explicit slots
              while (explicitSlots.has(slot)) {
                slot += 1n;
              }
              assignedSlot = slot;
            }
          }

          const storageEntry: StorageInfo = {
            slot: assignedSlot,
            type: typeText,
            isMapping,
            mappingDepth: depth,
            isArray,
            isFixedArray,
            isStruct,
          };

          // Only add optional properties if they are defined
          if (structInfo) {
            storageEntry.structInfo = structInfo;
          }
          if (mappingValueStruct) {
            storageEntry.mappingValueStruct = mappingValueStruct;
          }
          if (fixedArraySize) {
            storageEntry.fixedArraySize = fixedArraySize;
          }
          if (isExternalFunction) {
            storageEntry.isExternalFunction = true;
          }
          if (isDynamicBytes) {
            storageEntry.isDynamicBytes = true;
          }
          if (isDynamicString) {
            storageEntry.isDynamicString = true;
          }
          if (hasTransient) {
            storageEntry.isTransient = true;
          }

          // Add packing info for packable types
          if (canPack && byteSize < 32) {
            storageEntry.byteOffset = varByteOffset;
            storageEntry.byteSize = byteSize;
          }

          // Extract default value from initializer
          const defaultValue = this.extractStorageDefaultValue(prop);
          if (defaultValue !== undefined) {
            storageEntry.defaultValue = defaultValue;
          }

          this.storage.set(prop.getName(), storageEntry);

          // Advance slot for non-packable types (only for auto-assigned slots)
          if (explicitSlot === undefined && (!canPack || byteSize >= 32)) {
            slot += slotsNeeded;
            // Skip any explicit slots after advancing
            while (explicitSlots.has(slot)) {
              slot += 1n;
            }
            currentByteOffset = 0;
          }
        }
      }
    }
  }

  private analyzeConstantsWithInheritance(chain: ClassDeclaration[]): void {
    this.constants.clear();
    this.immutables.clear();

    // First pass: allocate slots for immutables (after storage slots)
    let immutableSlot = 0x1000n; // Start immutables at a high slot to avoid collision
    for (const classDecl of chain) {
      for (const prop of classDecl.getProperties()) {
        const decoratorNames = prop.getDecorators().map((d) => d.getName());
        if (decoratorNames.includes("immutable")) {
          const typeText = prop.getTypeNode()?.getText() ?? "u256";
          this.immutables.set(prop.getName(), {
            slot: immutableSlot,
            type: typeText,
          });
          immutableSlot += 1n;
        }
      }
    }

    // Second pass: process constants
    // Constants are properties with:
    // 1. @constant decorator, OR
    // 2. Non-storage, non-event, non-immutable with literal values
    for (const classDecl of chain) {
      for (const prop of classDecl.getProperties()) {
        const decoratorNames = prop.getDecorators().map((d) => d.getName());

        // Skip storage, event, and immutable properties
        if (decoratorNames.includes("storage") || decoratorNames.includes("event") || decoratorNames.includes("immutable")) {
          continue;
        }

        const value = this.extractStorageDefaultValue(prop);

        // If @constant decorator is present, require a value
        if (decoratorNames.includes("constant")) {
          if (value === undefined) {
            throw new Error(`@constant property ${prop.getName()} must have a literal initializer`);
          }
          this.constants.set(prop.getName(), value);
        } else if (value !== undefined) {
          // Also treat non-decorated properties with literal values as constants
          this.constants.set(prop.getName(), value);
        }
      }
    }
  }

  /**
   * Collect all methods from the inheritance chain for constructor inlining.
   * When a method is called in the constructor, we need to inline its body
   * because Yul functions in _deployed object can't be called from code block.
   */
  private collectInheritedMethods(chain: ClassDeclaration[]): void {
    this.inheritedMethods.clear();
    for (const classDecl of chain) {
      for (const method of classDecl.getMethods()) {
        const methodName = method.getName();
        // Store all methods (later ones override earlier ones)
        this.inheritedMethods.set(methodName, method);
      }
    }
  }

  /**
   * Analyze events across the full inheritance chain.
   */
  private analyzeEventsWithInheritance(chain: ClassDeclaration[]): void {
    this.events.clear();

    for (const classDecl of chain) {
      for (const prop of classDecl.getProperties()) {
        const hasEvent = prop.getDecorators().some((d) => d.getName() === "event");
        if (!hasEvent) continue;

        const eventName = prop.getName();
        const typeNode = prop.getTypeNode();
        if (!typeNode) continue;

        const typeText = typeNode.getText();
        // Parse Event<InterfaceName>
        const match = typeText.match(/Event<(\w+)>/);
        if (!match) continue;

        const interfaceName = match[1];
        const fields = this.parseEventInterface(classDecl, interfaceName!);
        const indexedCount = fields.filter((f) => f.indexed).length;

        // Check for @anonymous decorator
        const isAnonymous = prop.getDecorators().some((d) => d.getName() === "anonymous");

        // Validate indexed count based on anonymous
        const maxIndexed = isAnonymous ? 4 : 3;
        if (indexedCount > maxIndexed) {
          throw new Error(`Event ${eventName} has more than ${maxIndexed} indexed fields`);
        }

        // Compute event signature using field types
        const signature = computeEventSignature(
          eventName,
          fields.map((f) => ({ name: f.name, type: f.type }))
        );

        this.events.set(eventName, {
          name: eventName,
          signature,
          fields,
          indexedCount,
          anonymous: isAnonymous,
        });
      }
    }
  }

  /**
   * Analyze modifiers across the full inheritance chain.
   */
  private analyzeModifiersWithInheritance(chain: ClassDeclaration[]): void {
    this.modifiers.clear();

    for (const classDecl of chain) {
      for (const method of classDecl.getMethods()) {
        const methodName = method.getName();
        const returnType = method.getReturnTypeNode()?.getText();

        const isPrivate = method.getScope() === Scope.Private;
        const isVoid = !returnType || returnType === "void";
        const hasNoParams =
          method.getParameters().filter((p) => p.getName() !== "this").length === 0;

        if (isPrivate && isVoid && hasNoParams) {
          this.modifiers.set(methodName, method);
        }
      }
    }
  }

  private generateConstructorCode(classDecl: ClassDeclaration): YulStatement[] {
    const deployedName = `${this.contractName}_deployed`;
    const statements: YulStatement[] = [];

    // Initialize storage variables with non-zero default values
    for (const [, info] of this.storage) {
      if (info.defaultValue !== undefined && info.defaultValue !== 0n) {
        statements.push({
          type: "expression",
          expr: {
            type: "functionCall",
            name: this.getStoreOp(info),
            args: [
              { type: "literal", value: info.slot },
              { type: "literal", value: info.defaultValue },
            ],
          },
        });
      }
    }

    // Execute constructor logic if present
    const ctors = classDecl.getConstructors();
    if (ctors.length > 0) {
      const ctor = ctors[0]!;
      const params = ctor.getParameters();

      // If constructor has parameters, load them from the end of the code
      // Constructor arguments are ABI-encoded and appended after the deployment bytecode
      if (params.length > 0) {
        // Calculate total size of constructor arguments
        const argSize = params.length * 32;

        // let _argOffset := sub(codesize(), argSize)
        statements.push({
          type: "variableDeclaration",
          names: ["_argOffset"],
          value: {
            type: "functionCall",
            name: "sub",
            args: [
              { type: "functionCall", name: "codesize", args: [] },
              { type: "literal", value: BigInt(argSize) },
            ],
          },
        });

        // Load each parameter from code
        for (let i = 0; i < params.length; i++) {
          const paramName = params[i]!.getName();
          // let paramName := codecopy to memory then mload, or use a helper
          // Simpler: copy to memory at position 0, then mload

          // codecopy(i*32, add(_argOffset, i*32), 32)
          statements.push({
            type: "expression",
            expr: {
              type: "functionCall",
              name: "codecopy",
              args: [
                { type: "literal", value: BigInt(i * 32) },
                {
                  type: "functionCall",
                  name: "add",
                  args: [
                    { type: "identifier", name: "_argOffset" },
                    { type: "literal", value: BigInt(i * 32) },
                  ],
                },
                { type: "literal", value: 32n },
              ],
            },
          });

          // let paramName := mload(i*32)
          statements.push({
            type: "variableDeclaration",
            names: [paramName],
            value: {
              type: "functionCall",
              name: "mload",
              args: [{ type: "literal", value: BigInt(i * 32) }],
            },
          });
        }
      }

      const body = ctor.getBody();
      if (body && Node.isBlock(body)) {
        // Set flag to enable constructor-specific handling (method inlining)
        this.inConstructor = true;
        const ctorStatements = this.transformBlock(body);
        this.inConstructor = false;
        statements.push(...ctorStatements);
      }
    }

    // Copy deployed code to memory and return
    statements.push({
      type: "expression",
      expr: {
        type: "functionCall",
        name: "datacopy",
        args: [
          { type: "literal", value: 0n },
          {
            type: "functionCall",
            name: "dataoffset",
            args: [{ type: "literal", value: `"${deployedName}"` }],
          },
          {
            type: "functionCall",
            name: "datasize",
            args: [{ type: "literal", value: `"${deployedName}"` }],
          },
        ],
      },
    });

    statements.push({
      type: "expression",
      expr: {
        type: "functionCall",
        name: "return",
        args: [
          { type: "literal", value: 0n },
          {
            type: "functionCall",
            name: "datasize",
            args: [{ type: "literal", value: `"${deployedName}"` }],
          },
        ],
      },
    });

    // Add mapping slot helper if any mappings are used
    const hasMappings = Array.from(this.storage.values()).some((s) => s.isMapping);
    if (hasMappings) {
      statements.push(this.generateMappingSlotHelper());
    }

    // Add array slot helper if any arrays are used
    const hasArrays = Array.from(this.storage.values()).some((s) => s.isArray);
    if (hasArrays) {
      statements.push(this.generateArraySlotHelper());
    }

    // Add fixed array slot helper if any fixed arrays are used
    const hasFixedArrays = Array.from(this.storage.values()).some((s) => s.isFixedArray);
    if (hasFixedArrays) {
      statements.push(this.generateFixedArraySlotHelper());
    }

    // Add dynamic bytes helpers if any dynamic bytes/string are used
    const hasDynamicBytes = Array.from(this.storage.values()).some((s) => s.isDynamicBytes || s.isDynamicString);
    if (hasDynamicBytes) {
      statements.push(this.generateBytesLoadHelper());
      statements.push(this.generateBytesStoreHelper());
    }

    // Add bytes push/pop helpers only for StorageBytes (not StorageString)
    const hasStorageBytes = Array.from(this.storage.values()).some((s) => s.isDynamicBytes);
    if (hasStorageBytes) {
      statements.push(this.generateBytesPushHelper());
      statements.push(this.generateBytesPopHelper());
    }

    return statements;
  }

  private generateDeployedCode(inheritanceChain: ClassDeclaration[]): YulStatement[] {
    // Collect all methods from the inheritance chain, tracking which class they belong to
    const methodsByClass: Map<string, { classDecl: ClassDeclaration; method: MethodDeclaration }[]> = new Map();
    const methodNames: Set<string> = new Set();
    const overriddenMethods: Set<string> = new Set(); // Methods that exist in multiple classes

    for (const classDecl of inheritanceChain) {
      const className = classDecl.getName() ?? "Unknown";
      const classMethods: { classDecl: ClassDeclaration; method: MethodDeclaration }[] = [];

      for (const method of classDecl.getMethods()) {
        const methodName = method.getName();
        if (methodNames.has(methodName)) {
          // This method overrides a parent method
          overriddenMethods.add(methodName);
        }
        methodNames.add(methodName);
        classMethods.push({ classDecl, method });
      }

      methodsByClass.set(className, classMethods);
    }

    // Build parent methods map for super calls
    // For each overridden method, find the parent's version
    this.parentMethods.clear();
    for (let i = inheritanceChain.length - 1; i > 0; i--) {
      const childClass = inheritanceChain[i]!;
      const parentClass = inheritanceChain[i - 1]!;
      const childClassName = childClass.getName() ?? "Unknown";
      const parentClassName = parentClass.getName() ?? "Unknown";

      for (const method of childClass.getMethods()) {
        const methodName = method.getName();
        // Check if parent has this method
        const parentHasMethod = parentClass.getMethods().some((m) => m.getName() === methodName);
        if (parentHasMethod) {
          // Store: when in childClass and calling super.methodName, call parentClassName_methodName
          this.parentMethods.set(`${childClassName}:${methodName}`, `${parentClassName}_${methodName}`);
        }
      }
    }

    // Collect all methods, with parent versions renamed for overridden methods
    const allMethods: MethodDeclaration[] = [];
    const parentMethodsToGenerate: { method: MethodDeclaration; prefixedName: string }[] = [];

    for (let i = 0; i < inheritanceChain.length; i++) {
      const classDecl = inheritanceChain[i]!;
      const className = classDecl.getName() ?? "Unknown";
      const isLastClass = i === inheritanceChain.length - 1;

      for (const method of classDecl.getMethods()) {
        const methodName = method.getName();

        // Skip abstract methods (they have no implementation)
        if (method.isAbstract()) {
          continue;
        }

        if (overriddenMethods.has(methodName) && !isLastClass) {
          // This is a parent method that gets overridden - generate with prefixed name
          parentMethodsToGenerate.push({ method, prefixedName: `${className}_${methodName}` });
        } else if (isLastClass || !overriddenMethods.has(methodName)) {
          // Either the final (most derived) version or not overridden
          allMethods.push(method);
        }
      }
    }

    // Filter out abstract methods (they have no implementation)
    const concreteMethods = allMethods.filter((m) => !m.isAbstract());

    // Helper to check if method should be exposed in ABI
    // - @internal decorator -> NOT exposed (like private)
    // - @external decorator -> exposed (like public)
    // - private keyword -> NOT exposed
    // - public/protected keyword -> exposed (default)
    const isExposedInAbi = (m: MethodDeclaration): boolean => {
      const decorators = m.getDecorators().map((d) => d.getName());
      if (decorators.includes("internal")) return false;
      if (decorators.includes("external")) return true;
      return m.getScope() !== Scope.Private;
    };

    const publicMethods = concreteMethods.filter(isExposedInAbi);
    const privateMethods = concreteMethods.filter((m) => !isExposedInAbi(m));

    // Check for special functions
    const fallbackMethod = concreteMethods.find((m) => m.getName() === "fallback");
    const receiveMethod = concreteMethods.find((m) => m.getName() === "receive");

    // Filter out fallback/receive from regular public methods
    const regularMethods = publicMethods.filter(
      (m) => m.getName() !== "fallback" && m.getName() !== "receive"
    );

    const typeContext = this.createTypeContext();
    const functionMetas: FunctionMeta[] = regularMethods.map((m) => {
      const params = m.getParameters().filter((p) => p.getName() !== "this");
      const paramTypes = params.map((p) => {
        const typeName = p.getTypeNode()?.getText() ?? "u256";
        return { name: p.getName(), type: mapType(typeName, typeContext) };
      });
      const returnTypeNode = m.getReturnTypeNode();
      const hasReturn = returnTypeNode !== undefined && returnTypeNode.getText() !== "void";

      // Calculate return count for tuple types
      let returnCount = 0;
      if (hasReturn) {
        const returnTypeText = returnTypeNode!.getText();
        if (returnTypeText.startsWith("[") && returnTypeText.endsWith("]")) {
          const evmType = mapType(returnTypeText, typeContext);
          if (evmType.kind === "tuple") {
            returnCount = evmType.elements.length;
          } else {
            returnCount = 1;
          }
        } else {
          returnCount = 1;
        }
      }

      // Check for @payable decorator
      const isPayable = m.getDecorators().some((d) => d.getName() === "payable");

      // Build param metadata for ABI decoding
      const paramMetas: ParamMeta[] = params.map((p) => {
        const typeName = p.getTypeNode()?.getText() ?? "u256";
        const isDynamicArray = typeName.startsWith("CalldataArray<") ||
          (typeName.endsWith("[]") && !typeName.includes("StorageArray"));
        return {
          name: p.getName(),
          type: typeName,
          isDynamicArray,
        };
      });

      return {
        name: m.getName(),
        selector: computeSelector(m.getName(), paramTypes),
        hasReturn,
        paramCount: params.length,
        returnCount,
        isPayable,
        params: paramMetas,
      };
    });

    const statements: YulStatement[] = [];

    // Generate dispatcher with fallback/receive support
    statements.push(
      this.generateDispatcher(functionMetas, !!fallbackMethod, !!receiveMethod)
    );

    // Generate regular public function definitions
    for (const method of regularMethods) {
      statements.push(this.transformMethod(method));
    }

    // Generate fallback function if present
    if (fallbackMethod) {
      statements.push(this.transformMethod(fallbackMethod));
    }

    // Generate receive function if present
    if (receiveMethod) {
      statements.push(this.transformMethod(receiveMethod));
    }

    // Generate private function definitions (internal helpers)
    for (const method of privateMethods) {
      statements.push(this.transformMethod(method));
    }

    // Generate parent methods with prefixed names (for super calls)
    for (const { method, prefixedName } of parentMethodsToGenerate) {
      statements.push(this.transformMethodWithName(method, prefixedName));
    }

    // Check if any mappings are used and add helper function
    const hasMappings = Array.from(this.storage.values()).some((s) => s.isMapping);
    if (hasMappings) {
      statements.push(this.generateMappingSlotHelper());
    }

    // Check if any arrays are used and add helper function
    const hasArrays = Array.from(this.storage.values()).some((s) => s.isArray);
    if (hasArrays) {
      statements.push(this.generateArraySlotHelper());
    }

    // Check if any fixed arrays are used and add helper function
    const hasFixedArrays = Array.from(this.storage.values()).some((s) => s.isFixedArray);
    if (hasFixedArrays) {
      statements.push(this.generateFixedArraySlotHelper());
    }

    // Add dynamic bytes helpers if any dynamic bytes/string are used
    const hasDynamicBytes = Array.from(this.storage.values()).some((s) => s.isDynamicBytes || s.isDynamicString);
    if (hasDynamicBytes) {
      statements.push(this.generateBytesLoadHelper());
      statements.push(this.generateBytesStoreHelper());
    }

    // Add bytes push/pop helpers only for StorageBytes (not StorageString)
    const hasStorageBytes = Array.from(this.storage.values()).some((s) => s.isDynamicBytes);
    if (hasStorageBytes) {
      statements.push(this.generateBytesPushHelper());
      statements.push(this.generateBytesPopHelper());
    }

    // Add external call helpers (always included for simplicity)
    statements.push(this.generateStaticCallHelper());
    statements.push(this.generateCallHelper());
    statements.push(this.generateTransferHelper());
    statements.push(this.generateAbiEncodeHelper());
    statements.push(this.generateAbiEncodeGeneralHelper());
    statements.push(this.generateAbiEncodePackedHelper());
    statements.push(this.generateAbiDecodeSingleHelper());
    statements.push(this.generateDelegatecallHelper());
    statements.push(this.generateCreateHelper());
    statements.push(this.generateCreate2Helper());
    statements.push(this.generateAllocArrayHelper());
    statements.push(this.generateCalldataSliceHelper());
    statements.push(this.generateMsgDataHelper());
    statements.push(this.generateEmptyBytesHelper());
    statements.push(this.generateSha256Helper());
    statements.push(this.generateRipemd160Helper());
    statements.push(this.generateEcrecoverHelper());
    statements.push(this.generateRuntimeCodeHelper());
    statements.push(this.generateCreationCodeHelper());

    // Generate library functions
    for (const [libName, libInfo] of this.libraries) {
      for (const [methodName, methodInfo] of libInfo.methods) {
        const libFunc = this.generateLibraryFunction(libName, methodInfo);
        statements.push(libFunc);
      }
    }

    // Generate imported standalone functions
    for (const [funcName, funcInfo] of this.importedFunctions) {
      const importedFunc = this.generateImportedFunction(funcInfo);
      statements.push(importedFunc);
    }

    // Add dynamically generated helpers (e.g., abi.encode with N args)
    for (const helper of this.dynamicHelpers) {
      statements.push(helper);
    }

    // Add type(C).name helpers
    for (const typeName of this.typeNameHelpers) {
      statements.push(this.generateTypeNameHelper(typeName));
    }

    // Add type(C).creationCode helpers
    for (const contractName of this.typeCreationCodeHelpers) {
      statements.push(this.generateTypeCreationCodeHelper(contractName));
    }

    return statements;
  }

  /**
   * Generate a helper function for type(C).name that returns a memory pointer to the name string.
   * The string is stored as: [length (32 bytes)] [data (padded to 32 bytes)]
   */
  private generateTypeNameHelper(typeName: string): YulStatement {
    // Encode string as bytes: length + data
    const nameBytes = new TextEncoder().encode(typeName);
    const length = BigInt(nameBytes.length);

    // Pad to 32 bytes
    const paddedLength = Math.ceil(nameBytes.length / 32) * 32;
    const paddedBytes = new Uint8Array(paddedLength);
    paddedBytes.set(nameBytes);

    // Convert to 256-bit words
    const words: bigint[] = [];
    for (let i = 0; i < paddedLength; i += 32) {
      let word = 0n;
      for (let j = 0; j < 32; j++) {
        word = (word << 8n) | BigInt(paddedBytes[i + j] ?? 0);
      }
      words.push(word);
    }

    // Generate function body
    const body: YulStatement[] = [];

    // ptr := mload(0x40)  // Get free memory pointer
    body.push({
      type: "variableDeclaration",
      names: ["ptr"],
      value: { type: "functionCall", name: "mload", args: [{ type: "literal", value: 0x40n }] },
    });

    // mstore(ptr, length)  // Store string length
    body.push({
      type: "expression",
      expr: {
        type: "functionCall",
        name: "mstore",
        args: [{ type: "identifier", name: "ptr" }, { type: "literal", value: length }],
      },
    });

    // Store data words
    for (let i = 0; i < words.length; i++) {
      const offset = BigInt(32 + i * 32);
      body.push({
        type: "expression",
        expr: {
          type: "functionCall",
          name: "mstore",
          args: [
            {
              type: "functionCall",
              name: "add",
              args: [{ type: "identifier", name: "ptr" }, { type: "literal", value: offset }],
            },
            { type: "literal", value: words[i]! },
          ],
        },
      });
    }

    // Update free memory pointer
    const totalSize = BigInt(32 + paddedLength);
    body.push({
      type: "expression",
      expr: {
        type: "functionCall",
        name: "mstore",
        args: [
          { type: "literal", value: 0x40n },
          {
            type: "functionCall",
            name: "add",
            args: [{ type: "identifier", name: "ptr" }, { type: "literal", value: totalSize }],
          },
        ],
      },
    });

    return {
      type: "function",
      name: `__type_name_${typeName}`,
      params: [],
      returns: ["ptr"],
      body,
    };
  }

  /**
   * Generate helper for type(C).runtimeCode - returns the runtime bytecode
   * Uses codecopy to copy the deployed contract's code to memory
   */
  private generateRuntimeCodeHelper(): YulStatement {
    return {
      type: "function",
      name: "__type_runtimeCode",
      params: [],
      returns: ["ptr"],
      body: [
        // ptr := mload(0x40)  // Get free memory pointer
        {
          type: "assignment",
          names: ["ptr"],
          value: { type: "functionCall", name: "mload", args: [{ type: "literal", value: 0x40n }] },
        },
        // let size := codesize()
        {
          type: "variableDeclaration",
          names: ["size"],
          value: { type: "functionCall", name: "codesize", args: [] },
        },
        // mstore(ptr, size)  // Store length
        {
          type: "expression",
          expr: {
            type: "functionCall",
            name: "mstore",
            args: [{ type: "identifier", name: "ptr" }, { type: "identifier", name: "size" }],
          },
        },
        // codecopy(add(ptr, 32), 0, size)  // Copy code to memory after length
        {
          type: "expression",
          expr: {
            type: "functionCall",
            name: "codecopy",
            args: [
              {
                type: "functionCall",
                name: "add",
                args: [{ type: "identifier", name: "ptr" }, { type: "literal", value: 32n }],
              },
              { type: "literal", value: 0n },
              { type: "identifier", name: "size" },
            ],
          },
        },
        // Update free memory pointer (ptr + 32 + size, rounded up to 32 bytes)
        {
          type: "expression",
          expr: {
            type: "functionCall",
            name: "mstore",
            args: [
              { type: "literal", value: 0x40n },
              {
                type: "functionCall",
                name: "add",
                args: [
                  { type: "identifier", name: "ptr" },
                  {
                    type: "functionCall",
                    name: "and",
                    args: [
                      {
                        type: "functionCall",
                        name: "add",
                        args: [
                          {
                            type: "functionCall",
                            name: "add",
                            args: [{ type: "identifier", name: "size" }, { type: "literal", value: 32n }],
                          },
                          { type: "literal", value: 31n },
                        ],
                      },
                      {
                        type: "functionCall",
                        name: "not",
                        args: [{ type: "literal", value: 31n }],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        },
      ],
    };
  }

  /**
   * Generate helper for type(C).creationCode - returns the creation bytecode
   * Note: In deployed code, we don't have access to creation code directly.
   * This implementation returns an empty bytes array as a placeholder.
   * For actual creation code, use datasize/datacopy in the deployment context.
   */
  private generateCreationCodeHelper(): YulStatement {
    // In a deployed contract, we can't easily access the creation code.
    // We return empty bytes as a fallback. For proper creation code access,
    // the user should use the deployment context or store it during construction.
    return {
      type: "function",
      name: "__type_creationCode",
      params: [],
      returns: ["ptr"],
      body: [
        // ptr := mload(0x40)  // Get free memory pointer
        {
          type: "assignment",
          names: ["ptr"],
          value: { type: "functionCall", name: "mload", args: [{ type: "literal", value: 0x40n }] },
        },
        // mstore(ptr, 0)  // Store length = 0 (empty bytes)
        {
          type: "expression",
          expr: {
            type: "functionCall",
            name: "mstore",
            args: [{ type: "identifier", name: "ptr" }, { type: "literal", value: 0n }],
          },
        },
        // Update free memory pointer
        {
          type: "expression",
          expr: {
            type: "functionCall",
            name: "mstore",
            args: [
              { type: "literal", value: 0x40n },
              {
                type: "functionCall",
                name: "add",
                args: [{ type: "identifier", name: "ptr" }, { type: "literal", value: 32n }],
              },
            ],
          },
        },
      ],
    };
  }

  /**
   * Generate contract-specific helper for type(ContractName).creationCode
   * Uses dataoffset and datasize to copy the contract's creation bytecode to memory.
   * function __type_creationCode_ContractName() -> ptr {
   *     let size := datasize("ContractName")
   *     ptr := mload(0x40)
   *     mstore(ptr, size)
   *     datacopy(add(ptr, 32), dataoffset("ContractName"), size)
   *     mstore(0x40, add(add(ptr, 32), and(add(size, 31), not(31))))
   * }
   */
  private generateTypeCreationCodeHelper(contractName: string): YulStatement {
    return {
      type: "function",
      name: `__type_creationCode_${contractName}`,
      params: [],
      returns: ["ptr"],
      body: [
        // let size := datasize("ContractName")
        {
          type: "variableDeclaration",
          names: ["size"],
          value: {
            type: "functionCall",
            name: "datasize",
            args: [{ type: "stringLiteral", value: contractName }],
          },
        },
        // ptr := mload(0x40)
        {
          type: "assignment",
          names: ["ptr"],
          value: { type: "functionCall", name: "mload", args: [{ type: "literal", value: 0x40n }] },
        },
        // mstore(ptr, size) - store length
        {
          type: "expression",
          expr: {
            type: "functionCall",
            name: "mstore",
            args: [{ type: "identifier", name: "ptr" }, { type: "identifier", name: "size" }],
          },
        },
        // datacopy(add(ptr, 32), dataoffset("ContractName"), size)
        {
          type: "expression",
          expr: {
            type: "functionCall",
            name: "datacopy",
            args: [
              {
                type: "functionCall",
                name: "add",
                args: [{ type: "identifier", name: "ptr" }, { type: "literal", value: 32n }],
              },
              {
                type: "functionCall",
                name: "dataoffset",
                args: [{ type: "stringLiteral", value: contractName }],
              },
              { type: "identifier", name: "size" },
            ],
          },
        },
        // Update free memory pointer: mstore(0x40, add(add(ptr, 32), and(add(size, 31), not(31))))
        // This rounds up size to 32-byte boundary
        {
          type: "expression",
          expr: {
            type: "functionCall",
            name: "mstore",
            args: [
              { type: "literal", value: 0x40n },
              {
                type: "functionCall",
                name: "add",
                args: [
                  {
                    type: "functionCall",
                    name: "add",
                    args: [{ type: "identifier", name: "ptr" }, { type: "literal", value: 32n }],
                  },
                  {
                    type: "functionCall",
                    name: "and",
                    args: [
                      {
                        type: "functionCall",
                        name: "add",
                        args: [{ type: "identifier", name: "size" }, { type: "literal", value: 31n }],
                      },
                      {
                        type: "functionCall",
                        name: "not",
                        args: [{ type: "literal", value: 31n }],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        },
      ],
    };
  }

  /**
   * Generate __staticcall helper for external view calls
   * __staticcall(target, selector, arg0, arg1, ...) -> result
   */
  private generateStaticCallHelper(): YulStatement {
    // function __staticcall(target, selector, arg0, arg1) -> result {
    //     mstore(0, selector)
    //     mstore(4, arg0)
    //     mstore(36, arg1)
    //     let success := staticcall(gas(), target, 0, 68, 0, 32)
    //     if iszero(success) { revert(0, 0) }
    //     result := mload(0)
    // }
    // Simplified version for 2 args (most common case)
    return {
      type: "function",
      name: "__staticcall",
      params: ["target", "selector", "arg0"],
      returns: ["result"],
      body: [
        // mstore(0, shl(224, selector)) - store selector in first 4 bytes
        {
          type: "expression",
          expr: {
            type: "functionCall",
            name: "mstore",
            args: [
              { type: "literal", value: 0n },
              {
                type: "functionCall",
                name: "shl",
                args: [
                  { type: "literal", value: 224n },
                  { type: "identifier", name: "selector" },
                ],
              },
            ],
          },
        },
        // mstore(4, arg0)
        {
          type: "expression",
          expr: {
            type: "functionCall",
            name: "mstore",
            args: [
              { type: "literal", value: 4n },
              { type: "identifier", name: "arg0" },
            ],
          },
        },
        // let success := staticcall(gas(), target, 0, 36, 0, 32)
        {
          type: "variableDeclaration",
          names: ["success"],
          value: {
            type: "functionCall",
            name: "staticcall",
            args: [
              { type: "functionCall", name: "gas", args: [] },
              { type: "identifier", name: "target" },
              { type: "literal", value: 0n },
              { type: "literal", value: 36n },
              { type: "literal", value: 0n },
              { type: "literal", value: 32n },
            ],
          },
        },
        // if iszero(success) { revert(0, 0) }
        {
          type: "if",
          condition: {
            type: "functionCall",
            name: "iszero",
            args: [{ type: "identifier", name: "success" }],
          },
          body: [
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
        // result := mload(0)
        {
          type: "assignment",
          names: ["result"],
          value: {
            type: "functionCall",
            name: "mload",
            args: [{ type: "literal", value: 0n }],
          },
        },
      ],
    };
  }

  /**
   * Generate __call helper for external state-changing calls
   * __call(target, selector, arg0, arg1) -> success
   */
  private generateCallHelper(): YulStatement {
    return {
      type: "function",
      name: "__call",
      params: ["target", "selector", "arg0", "arg1"],
      returns: ["success"],
      body: [
        // mstore(0, shl(224, selector))
        {
          type: "expression",
          expr: {
            type: "functionCall",
            name: "mstore",
            args: [
              { type: "literal", value: 0n },
              {
                type: "functionCall",
                name: "shl",
                args: [
                  { type: "literal", value: 224n },
                  { type: "identifier", name: "selector" },
                ],
              },
            ],
          },
        },
        // mstore(4, arg0)
        {
          type: "expression",
          expr: {
            type: "functionCall",
            name: "mstore",
            args: [
              { type: "literal", value: 4n },
              { type: "identifier", name: "arg0" },
            ],
          },
        },
        // mstore(36, arg1)
        {
          type: "expression",
          expr: {
            type: "functionCall",
            name: "mstore",
            args: [
              { type: "literal", value: 36n },
              { type: "identifier", name: "arg1" },
            ],
          },
        },
        // success := call(gas(), target, 0, 0, 68, 0, 32)
        {
          type: "assignment",
          names: ["success"],
          value: {
            type: "functionCall",
            name: "call",
            args: [
              { type: "functionCall", name: "gas", args: [] },
              { type: "identifier", name: "target" },
              { type: "literal", value: 0n }, // value
              { type: "literal", value: 0n }, // input offset
              { type: "literal", value: 68n }, // input size
              { type: "literal", value: 0n }, // output offset
              { type: "literal", value: 32n }, // output size
            ],
          },
        },
      ],
    };
  }

  /**
   * Generate __transfer helper for ETH transfers that revert on failure
   * __transfer(to, amount)
   */
  private generateTransferHelper(): YulStatement {
    // function __transfer(to, amount) {
    //     let success := call(gas(), to, amount, 0, 0, 0, 0)
    //     if iszero(success) { revert(0, 0) }
    // }
    return {
      type: "function",
      name: "__transfer",
      params: ["to", "amount"],
      returns: [],
      body: [
        // let success := call(gas(), to, amount, 0, 0, 0, 0)
        {
          type: "variableDeclaration",
          names: ["success"],
          value: {
            type: "functionCall",
            name: "call",
            args: [
              { type: "functionCall", name: "gas", args: [] },
              { type: "identifier", name: "to" },
              { type: "identifier", name: "amount" },
              { type: "literal", value: 0n }, // argsOffset
              { type: "literal", value: 0n }, // argsLength
              { type: "literal", value: 0n }, // retOffset
              { type: "literal", value: 0n }, // retLength
            ],
          },
        },
        // if iszero(success) { revert(0, 0) }
        {
          type: "if",
          condition: {
            type: "functionCall",
            name: "iszero",
            args: [{ type: "identifier", name: "success" }],
          },
          body: [
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
    };
  }

  /**
   * Generate __abi_encode_selector helper for ABI encoding
   * __abi_encode_selector(selector, arg0, arg1) -> ptr
   * Returns memory pointer to encoded data (selector + 2 args)
   */
  private generateAbiEncodeHelper(): YulStatement {
    // function __abi_encode_selector(selector, arg0, arg1) -> ptr {
    //     ptr := mload(0x40) // free memory pointer
    //     mstore(ptr, shl(224, selector)) // store selector at ptr (left-aligned)
    //     mstore(add(ptr, 4), arg0)       // store arg0
    //     mstore(add(ptr, 36), arg1)      // store arg1
    //     mstore(0x40, add(ptr, 68))      // update free memory pointer
    // }
    return {
      type: "function",
      name: "__abi_encode_selector",
      params: ["selector", "arg0", "arg1"],
      returns: ["ptr"],
      body: [
        // ptr := mload(0x40)
        {
          type: "assignment",
          names: ["ptr"],
          value: {
            type: "functionCall",
            name: "mload",
            args: [{ type: "literal", value: 0x40n }],
          },
        },
        // mstore(ptr, shl(224, selector))
        {
          type: "expression",
          expr: {
            type: "functionCall",
            name: "mstore",
            args: [
              { type: "identifier", name: "ptr" },
              {
                type: "functionCall",
                name: "shl",
                args: [
                  { type: "literal", value: 224n },
                  { type: "identifier", name: "selector" },
                ],
              },
            ],
          },
        },
        // mstore(add(ptr, 4), arg0)
        {
          type: "expression",
          expr: {
            type: "functionCall",
            name: "mstore",
            args: [
              {
                type: "functionCall",
                name: "add",
                args: [
                  { type: "identifier", name: "ptr" },
                  { type: "literal", value: 4n },
                ],
              },
              { type: "identifier", name: "arg0" },
            ],
          },
        },
        // mstore(add(ptr, 36), arg1)
        {
          type: "expression",
          expr: {
            type: "functionCall",
            name: "mstore",
            args: [
              {
                type: "functionCall",
                name: "add",
                args: [
                  { type: "identifier", name: "ptr" },
                  { type: "literal", value: 36n },
                ],
              },
              { type: "identifier", name: "arg1" },
            ],
          },
        },
        // mstore(0x40, add(ptr, 68))
        {
          type: "expression",
          expr: {
            type: "functionCall",
            name: "mstore",
            args: [
              { type: "literal", value: 0x40n },
              {
                type: "functionCall",
                name: "add",
                args: [
                  { type: "identifier", name: "ptr" },
                  { type: "literal", value: 68n },
                ],
              },
            ],
          },
        },
      ],
    };
  }

  /**
   * Generate __abi_encode helper for general ABI encoding
   * __abi_encode(numArgs, arg0, arg1, arg2, arg3) -> ptr
   * Returns memory pointer to encoded data
   */
  private generateAbiEncodeGeneralHelper(): YulStatement {
    return {
      type: "function",
      name: "__abi_encode",
      params: ["numArgs", "arg0", "arg1", "arg2", "arg3"],
      returns: ["ptr"],
      body: [
        // ptr := mload(0x40)
        {
          type: "assignment",
          names: ["ptr"],
          value: { type: "functionCall", name: "mload", args: [{ type: "literal", value: 0x40n }] },
        },
        // Store length at ptr (numArgs * 32)
        {
          type: "expression",
          expr: {
            type: "functionCall",
            name: "mstore",
            args: [
              { type: "identifier", name: "ptr" },
              { type: "functionCall", name: "mul", args: [{ type: "identifier", name: "numArgs" }, { type: "literal", value: 32n }] },
            ],
          },
        },
        // if gt(numArgs, 0) { mstore(add(ptr, 32), arg0) }
        {
          type: "if",
          condition: { type: "functionCall", name: "gt", args: [{ type: "identifier", name: "numArgs" }, { type: "literal", value: 0n }] },
          body: [{
            type: "expression",
            expr: { type: "functionCall", name: "mstore", args: [{ type: "functionCall", name: "add", args: [{ type: "identifier", name: "ptr" }, { type: "literal", value: 32n }] }, { type: "identifier", name: "arg0" }] },
          }],
        },
        {
          type: "if",
          condition: { type: "functionCall", name: "gt", args: [{ type: "identifier", name: "numArgs" }, { type: "literal", value: 1n }] },
          body: [{
            type: "expression",
            expr: { type: "functionCall", name: "mstore", args: [{ type: "functionCall", name: "add", args: [{ type: "identifier", name: "ptr" }, { type: "literal", value: 64n }] }, { type: "identifier", name: "arg1" }] },
          }],
        },
        {
          type: "if",
          condition: { type: "functionCall", name: "gt", args: [{ type: "identifier", name: "numArgs" }, { type: "literal", value: 2n }] },
          body: [{
            type: "expression",
            expr: { type: "functionCall", name: "mstore", args: [{ type: "functionCall", name: "add", args: [{ type: "identifier", name: "ptr" }, { type: "literal", value: 96n }] }, { type: "identifier", name: "arg2" }] },
          }],
        },
        {
          type: "if",
          condition: { type: "functionCall", name: "gt", args: [{ type: "identifier", name: "numArgs" }, { type: "literal", value: 3n }] },
          body: [{
            type: "expression",
            expr: { type: "functionCall", name: "mstore", args: [{ type: "functionCall", name: "add", args: [{ type: "identifier", name: "ptr" }, { type: "literal", value: 128n }] }, { type: "identifier", name: "arg3" }] },
          }],
        },
        // Update free memory pointer: mstore(0x40, add(ptr, add(32, mul(numArgs, 32))))
        {
          type: "expression",
          expr: {
            type: "functionCall",
            name: "mstore",
            args: [
              { type: "literal", value: 0x40n },
              { type: "functionCall", name: "add", args: [{ type: "identifier", name: "ptr" }, { type: "functionCall", name: "add", args: [{ type: "literal", value: 32n }, { type: "functionCall", name: "mul", args: [{ type: "identifier", name: "numArgs" }, { type: "literal", value: 32n }] }] }] },
            ],
          },
        },
      ],
    };
  }

  /**
   * Generate __abi_encode_packed helper for packed ABI encoding
   * __abi_encode_packed(numArgs, arg0, arg1, arg2, arg3) -> ptr
   * Packed encoding concatenates values without padding
   */
  private generateAbiEncodePackedHelper(): YulStatement {
    return {
      type: "function",
      name: "__abi_encode_packed",
      params: ["numArgs", "arg0", "arg1", "arg2", "arg3"],
      returns: ["ptr"],
      body: [
        // ptr := mload(0x40)
        {
          type: "assignment",
          names: ["ptr"],
          value: { type: "functionCall", name: "mload", args: [{ type: "literal", value: 0x40n }] },
        },
        // For simplicity, treat as regular encode (32 bytes each)
        // Full packed encoding would need type info to determine sizes
        {
          type: "variableDeclaration",
          names: ["offset"],
          value: { type: "literal", value: 0n },
        },
        {
          type: "if",
          condition: { type: "functionCall", name: "gt", args: [{ type: "identifier", name: "numArgs" }, { type: "literal", value: 0n }] },
          body: [
            { type: "expression", expr: { type: "functionCall", name: "mstore", args: [{ type: "functionCall", name: "add", args: [{ type: "identifier", name: "ptr" }, { type: "identifier", name: "offset" }] }, { type: "identifier", name: "arg0" }] } },
            { type: "assignment", names: ["offset"], value: { type: "functionCall", name: "add", args: [{ type: "identifier", name: "offset" }, { type: "literal", value: 32n }] } },
          ],
        },
        {
          type: "if",
          condition: { type: "functionCall", name: "gt", args: [{ type: "identifier", name: "numArgs" }, { type: "literal", value: 1n }] },
          body: [
            { type: "expression", expr: { type: "functionCall", name: "mstore", args: [{ type: "functionCall", name: "add", args: [{ type: "identifier", name: "ptr" }, { type: "identifier", name: "offset" }] }, { type: "identifier", name: "arg1" }] } },
            { type: "assignment", names: ["offset"], value: { type: "functionCall", name: "add", args: [{ type: "identifier", name: "offset" }, { type: "literal", value: 32n }] } },
          ],
        },
        {
          type: "if",
          condition: { type: "functionCall", name: "gt", args: [{ type: "identifier", name: "numArgs" }, { type: "literal", value: 2n }] },
          body: [
            { type: "expression", expr: { type: "functionCall", name: "mstore", args: [{ type: "functionCall", name: "add", args: [{ type: "identifier", name: "ptr" }, { type: "identifier", name: "offset" }] }, { type: "identifier", name: "arg2" }] } },
            { type: "assignment", names: ["offset"], value: { type: "functionCall", name: "add", args: [{ type: "identifier", name: "offset" }, { type: "literal", value: 32n }] } },
          ],
        },
        {
          type: "if",
          condition: { type: "functionCall", name: "gt", args: [{ type: "identifier", name: "numArgs" }, { type: "literal", value: 3n }] },
          body: [
            { type: "expression", expr: { type: "functionCall", name: "mstore", args: [{ type: "functionCall", name: "add", args: [{ type: "identifier", name: "ptr" }, { type: "identifier", name: "offset" }] }, { type: "identifier", name: "arg3" }] } },
            { type: "assignment", names: ["offset"], value: { type: "functionCall", name: "add", args: [{ type: "identifier", name: "offset" }, { type: "literal", value: 32n }] } },
          ],
        },
        // Update free memory pointer
        {
          type: "expression",
          expr: {
            type: "functionCall",
            name: "mstore",
            args: [{ type: "literal", value: 0x40n }, { type: "functionCall", name: "add", args: [{ type: "identifier", name: "ptr" }, { type: "identifier", name: "offset" }] }],
          },
        },
      ],
    };
  }

  /**
   * Generate __abi_decode_single helper for single value ABI decoding
   * __abi_decode_single(data) -> value
   * Decodes a single 32-byte value from ABI-encoded data
   */
  private generateAbiDecodeSingleHelper(): YulStatement {
    return {
      type: "function",
      name: "__abi_decode_single",
      params: ["data"],
      returns: ["value"],
      body: [
        // Skip length prefix (32 bytes) and load first value
        // value := mload(add(data, 32))
        {
          type: "assignment",
          names: ["value"],
          value: {
            type: "functionCall",
            name: "mload",
            args: [{ type: "functionCall", name: "add", args: [{ type: "identifier", name: "data" }, { type: "literal", value: 32n }] }],
          },
        },
      ],
    };
  }

  /**
   * Generate __delegatecall helper for delegatecall
   * __delegatecall(target, selector, arg0, arg1) -> result
   * Uses DELEGATECALL opcode
   */
  private generateDelegatecallHelper(): YulStatement {
    return {
      type: "function",
      name: "__delegatecall",
      params: ["target", "selector", "arg0", "arg1"],
      returns: ["result"],
      body: [
        // Store selector (left-aligned) and args in memory
        {
          type: "expression",
          expr: {
            type: "functionCall",
            name: "mstore",
            args: [
              { type: "literal", value: 0n },
              { type: "functionCall", name: "shl", args: [{ type: "literal", value: 224n }, { type: "identifier", name: "selector" }] },
            ],
          },
        },
        {
          type: "expression",
          expr: { type: "functionCall", name: "mstore", args: [{ type: "literal", value: 4n }, { type: "identifier", name: "arg0" }] },
        },
        {
          type: "expression",
          expr: { type: "functionCall", name: "mstore", args: [{ type: "literal", value: 36n }, { type: "identifier", name: "arg1" }] },
        },
        // delegatecall(gas, target, inOffset, inSize, outOffset, outSize)
        {
          type: "variableDeclaration",
          names: ["success"],
          value: {
            type: "functionCall",
            name: "delegatecall",
            args: [
              { type: "functionCall", name: "gas", args: [] },
              { type: "identifier", name: "target" },
              { type: "literal", value: 0n },
              { type: "literal", value: 68n },
              { type: "literal", value: 0n },
              { type: "literal", value: 32n },
            ],
          },
        },
        // if iszero(success) { revert(0, 0) }
        {
          type: "if",
          condition: { type: "functionCall", name: "iszero", args: [{ type: "identifier", name: "success" }] },
          body: [{ type: "expression", expr: { type: "functionCall", name: "revert", args: [{ type: "literal", value: 0n }, { type: "literal", value: 0n }] } }],
        },
        // result := mload(0)
        {
          type: "assignment",
          names: ["result"],
          value: { type: "functionCall", name: "mload", args: [{ type: "literal", value: 0n }] },
        },
      ],
    };
  }

  /**
   * Generate __create helper for contract creation
   * __create(offset, size, arg0, arg1) -> addr
   * Copies bytecode to memory, appends constructor args, and calls CREATE
   */
  private generateCreateHelper(): YulStatement {
    // function __create(offset, size, arg0, arg1) -> addr {
    //     let ptr := mload(0x40)
    //     datacopy(ptr, offset, size)         // Copy bytecode to memory
    //     mstore(add(ptr, size), arg0)        // Append arg0
    //     mstore(add(ptr, add(size, 32)), arg1) // Append arg1
    //     let totalSize := add(size, 64)       // bytecode + 2 args
    //     addr := create(0, ptr, totalSize)
    //     if iszero(addr) { revert(0, 0) }
    // }
    return {
      type: "function",
      name: "__create",
      params: ["offset", "size", "arg0", "arg1"],
      returns: ["addr"],
      body: [
        // let ptr := mload(0x40)
        {
          type: "variableDeclaration",
          names: ["ptr"],
          value: {
            type: "functionCall",
            name: "mload",
            args: [{ type: "literal", value: 0x40n }],
          },
        },
        // datacopy(ptr, offset, size)
        {
          type: "expression",
          expr: {
            type: "functionCall",
            name: "datacopy",
            args: [
              { type: "identifier", name: "ptr" },
              { type: "identifier", name: "offset" },
              { type: "identifier", name: "size" },
            ],
          },
        },
        // mstore(add(ptr, size), arg0)
        {
          type: "expression",
          expr: {
            type: "functionCall",
            name: "mstore",
            args: [
              {
                type: "functionCall",
                name: "add",
                args: [
                  { type: "identifier", name: "ptr" },
                  { type: "identifier", name: "size" },
                ],
              },
              { type: "identifier", name: "arg0" },
            ],
          },
        },
        // mstore(add(ptr, add(size, 32)), arg1)
        {
          type: "expression",
          expr: {
            type: "functionCall",
            name: "mstore",
            args: [
              {
                type: "functionCall",
                name: "add",
                args: [
                  { type: "identifier", name: "ptr" },
                  {
                    type: "functionCall",
                    name: "add",
                    args: [
                      { type: "identifier", name: "size" },
                      { type: "literal", value: 32n },
                    ],
                  },
                ],
              },
              { type: "identifier", name: "arg1" },
            ],
          },
        },
        // let totalSize := add(size, 64)
        {
          type: "variableDeclaration",
          names: ["totalSize"],
          value: {
            type: "functionCall",
            name: "add",
            args: [
              { type: "identifier", name: "size" },
              { type: "literal", value: 64n },
            ],
          },
        },
        // addr := create(0, ptr, totalSize)
        {
          type: "assignment",
          names: ["addr"],
          value: {
            type: "functionCall",
            name: "create",
            args: [
              { type: "literal", value: 0n },
              { type: "identifier", name: "ptr" },
              { type: "identifier", name: "totalSize" },
            ],
          },
        },
        // if iszero(addr) { revert(0, 0) }
        {
          type: "if",
          condition: {
            type: "functionCall",
            name: "iszero",
            args: [{ type: "identifier", name: "addr" }],
          },
          body: [
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
    };
  }

  /**
   * Generate CREATE2 helper for deterministic contract deployment
   * __create2(offset, size, salt, arg0, arg1) -> addr
   * - Uses CREATE2 opcode for deterministic address based on salt
   */
  private generateCreate2Helper(): YulStatement {
    // function __create2(offset, size, salt, arg0, arg1) -> addr {
    //     let ptr := mload(0x40)
    //     datacopy(ptr, offset, size)           // Copy bytecode to memory
    //     mstore(add(ptr, size), arg0)          // Append constructor arg0
    //     mstore(add(ptr, add(size, 32)), arg1) // Append constructor arg1
    //     let totalSize := add(size, 64)        // bytecode + 2 args
    //     addr := create2(0, ptr, totalSize, salt)
    //     if iszero(addr) { revert(0, 0) }
    // }
    return {
      type: "function",
      name: "__create2",
      params: ["offset", "size", "salt", "arg0", "arg1"],
      returns: ["addr"],
      body: [
        // let ptr := mload(0x40)
        {
          type: "variableDeclaration",
          names: ["ptr"],
          value: {
            type: "functionCall",
            name: "mload",
            args: [{ type: "literal", value: 0x40n }],
          },
        },
        // datacopy(ptr, offset, size)
        {
          type: "expression",
          expr: {
            type: "functionCall",
            name: "datacopy",
            args: [
              { type: "identifier", name: "ptr" },
              { type: "identifier", name: "offset" },
              { type: "identifier", name: "size" },
            ],
          },
        },
        // mstore(add(ptr, size), arg0)
        {
          type: "expression",
          expr: {
            type: "functionCall",
            name: "mstore",
            args: [
              {
                type: "functionCall",
                name: "add",
                args: [
                  { type: "identifier", name: "ptr" },
                  { type: "identifier", name: "size" },
                ],
              },
              { type: "identifier", name: "arg0" },
            ],
          },
        },
        // mstore(add(ptr, add(size, 32)), arg1)
        {
          type: "expression",
          expr: {
            type: "functionCall",
            name: "mstore",
            args: [
              {
                type: "functionCall",
                name: "add",
                args: [
                  { type: "identifier", name: "ptr" },
                  {
                    type: "functionCall",
                    name: "add",
                    args: [
                      { type: "identifier", name: "size" },
                      { type: "literal", value: 32n },
                    ],
                  },
                ],
              },
              { type: "identifier", name: "arg1" },
            ],
          },
        },
        // let totalSize := add(size, 64)
        {
          type: "variableDeclaration",
          names: ["totalSize"],
          value: {
            type: "functionCall",
            name: "add",
            args: [
              { type: "identifier", name: "size" },
              { type: "literal", value: 64n },
            ],
          },
        },
        // addr := create2(0, ptr, totalSize, salt)
        {
          type: "assignment",
          names: ["addr"],
          value: {
            type: "functionCall",
            name: "create2",
            args: [
              { type: "literal", value: 0n },
              { type: "identifier", name: "ptr" },
              { type: "identifier", name: "totalSize" },
              { type: "identifier", name: "salt" },
            ],
          },
        },
        // if iszero(addr) { revert(0, 0) }
        {
          type: "if",
          condition: {
            type: "functionCall",
            name: "iszero",
            args: [{ type: "identifier", name: "addr" }],
          },
          body: [
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
    };
  }

  /**
   * Generate memory array allocation helper
   * __allocArray(size) -> ptr
   * - Allocates memory for array: length slot + size * 32 bytes for elements
   * - Stores length at ptr[0], elements at ptr[1..size]
   */
  private generateAllocArrayHelper(): YulStatement {
    // function __allocArray(size) -> ptr {
    //     ptr := mload(0x40)                    // Get free memory pointer
    //     mstore(ptr, size)                     // Store length at ptr[0]
    //     let dataSize := mul(size, 32)         // Size of data slots
    //     let totalSize := add(dataSize, 32)    // Include length slot
    //     mstore(0x40, add(ptr, totalSize))     // Update free memory pointer
    // }
    return {
      type: "function",
      name: "__allocArray",
      params: ["size"],
      returns: ["ptr"],
      body: [
        // ptr := mload(0x40)
        {
          type: "assignment",
          names: ["ptr"],
          value: {
            type: "functionCall",
            name: "mload",
            args: [{ type: "literal", value: 0x40n }],
          },
        },
        // mstore(ptr, size)
        {
          type: "expression",
          expr: {
            type: "functionCall",
            name: "mstore",
            args: [
              { type: "identifier", name: "ptr" },
              { type: "identifier", name: "size" },
            ],
          },
        },
        // let dataSize := mul(size, 32)
        {
          type: "variableDeclaration",
          names: ["dataSize"],
          value: {
            type: "functionCall",
            name: "mul",
            args: [
              { type: "identifier", name: "size" },
              { type: "literal", value: 32n },
            ],
          },
        },
        // let totalSize := add(dataSize, 32)
        {
          type: "variableDeclaration",
          names: ["totalSize"],
          value: {
            type: "functionCall",
            name: "add",
            args: [
              { type: "identifier", name: "dataSize" },
              { type: "literal", value: 32n },
            ],
          },
        },
        // mstore(0x40, add(ptr, totalSize))
        {
          type: "expression",
          expr: {
            type: "functionCall",
            name: "mstore",
            args: [
              { type: "literal", value: 0x40n },
              {
                type: "functionCall",
                name: "add",
                args: [
                  { type: "identifier", name: "ptr" },
                  { type: "identifier", name: "totalSize" },
                ],
              },
            ],
          },
        },
      ],
    };
  }

  /**
   * Generate __calldata_slice helper for calldata array slicing
   * Returns memory pointer to (new_offset, new_len) pair
   */
  private generateCalldataSliceHelper(): YulStatement {
    // function __calldata_slice(offset, len, start, end) -> ptr {
    //     // Bounds check
    //     if gt(start, len) { revert(0, 0) }
    //     if gt(end, len) { revert(0, 0) }
    //     if gt(start, end) { revert(0, 0) }
    //     // Allocate memory for (offset, len) pair
    //     ptr := mload(64)
    //     // new_offset = offset + start * 32
    //     mstore(ptr, add(offset, mul(start, 32)))
    //     // new_len = end - start
    //     mstore(add(ptr, 32), sub(end, start))
    //     mstore(64, add(ptr, 64))
    // }
    return {
      type: "function",
      name: "__calldata_slice",
      params: ["offset", "len", "start", "end"],
      returns: ["ptr"],
      body: [
        // Bounds check: start <= len
        {
          type: "if",
          condition: {
            type: "functionCall",
            name: "gt",
            args: [
              { type: "identifier", name: "start" },
              { type: "identifier", name: "len" },
            ],
          },
          body: [
            {
              type: "expression",
              expr: {
                type: "functionCall",
                name: "revert",
                args: [{ type: "literal", value: 0n }, { type: "literal", value: 0n }],
              },
            },
          ],
        },
        // Bounds check: end <= len
        {
          type: "if",
          condition: {
            type: "functionCall",
            name: "gt",
            args: [
              { type: "identifier", name: "end" },
              { type: "identifier", name: "len" },
            ],
          },
          body: [
            {
              type: "expression",
              expr: {
                type: "functionCall",
                name: "revert",
                args: [{ type: "literal", value: 0n }, { type: "literal", value: 0n }],
              },
            },
          ],
        },
        // Bounds check: start <= end
        {
          type: "if",
          condition: {
            type: "functionCall",
            name: "gt",
            args: [
              { type: "identifier", name: "start" },
              { type: "identifier", name: "end" },
            ],
          },
          body: [
            {
              type: "expression",
              expr: {
                type: "functionCall",
                name: "revert",
                args: [{ type: "literal", value: 0n }, { type: "literal", value: 0n }],
              },
            },
          ],
        },
        // ptr := mload(64)
        {
          type: "assignment",
          names: ["ptr"],
          value: {
            type: "functionCall",
            name: "mload",
            args: [{ type: "literal", value: 64n }],
          },
        },
        // mstore(ptr, add(offset, mul(start, 32)))  -- new offset
        {
          type: "expression",
          expr: {
            type: "functionCall",
            name: "mstore",
            args: [
              { type: "identifier", name: "ptr" },
              {
                type: "functionCall",
                name: "add",
                args: [
                  { type: "identifier", name: "offset" },
                  {
                    type: "functionCall",
                    name: "mul",
                    args: [
                      { type: "identifier", name: "start" },
                      { type: "literal", value: 32n },
                    ],
                  },
                ],
              },
            ],
          },
        },
        // mstore(add(ptr, 32), sub(end, start))  -- new length
        {
          type: "expression",
          expr: {
            type: "functionCall",
            name: "mstore",
            args: [
              {
                type: "functionCall",
                name: "add",
                args: [{ type: "identifier", name: "ptr" }, { type: "literal", value: 32n }],
              },
              {
                type: "functionCall",
                name: "sub",
                args: [
                  { type: "identifier", name: "end" },
                  { type: "identifier", name: "start" },
                ],
              },
            ],
          },
        },
        // mstore(64, add(ptr, 64))  -- update free memory pointer
        {
          type: "expression",
          expr: {
            type: "functionCall",
            name: "mstore",
            args: [
              { type: "literal", value: 64n },
              {
                type: "functionCall",
                name: "add",
                args: [{ type: "identifier", name: "ptr" }, { type: "literal", value: 64n }],
              },
            ],
          },
        },
      ],
    };
  }

  /**
   * Generate __msg_data helper to get calldata as bytes in memory
   * Returns memory pointer to bytes (length-prefixed)
   */
  private generateMsgDataHelper(): YulStatement {
    // function __msg_data() -> ptr {
    //     let size := calldatasize()
    //     ptr := mload(0x40)
    //     mstore(ptr, size)                        // Store length
    //     calldatacopy(add(ptr, 32), 0, size)      // Copy calldata after length
    //     mstore(0x40, add(add(ptr, 32), size))    // Update free memory pointer
    // }
    return {
      type: "function",
      name: "__msg_data",
      params: [],
      returns: ["ptr"],
      body: [
        // let size := calldatasize()
        {
          type: "variableDeclaration",
          names: ["size"],
          value: { type: "functionCall", name: "calldatasize", args: [] },
        },
        // ptr := mload(0x40)
        {
          type: "assignment",
          names: ["ptr"],
          value: { type: "functionCall", name: "mload", args: [{ type: "literal", value: 0x40n }] },
        },
        // mstore(ptr, size)
        {
          type: "expression",
          expr: {
            type: "functionCall",
            name: "mstore",
            args: [{ type: "identifier", name: "ptr" }, { type: "identifier", name: "size" }],
          },
        },
        // calldatacopy(add(ptr, 32), 0, size)
        {
          type: "expression",
          expr: {
            type: "functionCall",
            name: "calldatacopy",
            args: [
              { type: "functionCall", name: "add", args: [{ type: "identifier", name: "ptr" }, { type: "literal", value: 32n }] },
              { type: "literal", value: 0n },
              { type: "identifier", name: "size" },
            ],
          },
        },
        // mstore(0x40, add(add(ptr, 32), size))
        {
          type: "expression",
          expr: {
            type: "functionCall",
            name: "mstore",
            args: [
              { type: "literal", value: 0x40n },
              {
                type: "functionCall",
                name: "add",
                args: [
                  { type: "functionCall", name: "add", args: [{ type: "identifier", name: "ptr" }, { type: "literal", value: 32n }] },
                  { type: "identifier", name: "size" },
                ],
              },
            ],
          },
        },
      ],
    };
  }

  /**
   * Generate __empty_bytes helper for empty bytes/string
   * Returns pointer to empty bytes (length = 0)
   */
  private generateEmptyBytesHelper(): YulStatement {
    return {
      type: "function",
      name: "__empty_bytes",
      params: [],
      returns: ["ptr"],
      body: [
        // ptr := mload(0x40)
        {
          type: "assignment",
          names: ["ptr"],
          value: { type: "functionCall", name: "mload", args: [{ type: "literal", value: 0x40n }] },
        },
        // mstore(ptr, 0) - length = 0
        {
          type: "expression",
          expr: {
            type: "functionCall",
            name: "mstore",
            args: [{ type: "identifier", name: "ptr" }, { type: "literal", value: 0n }],
          },
        },
        // mstore(0x40, add(ptr, 32)) - update free memory pointer
        {
          type: "expression",
          expr: {
            type: "functionCall",
            name: "mstore",
            args: [
              { type: "literal", value: 0x40n },
              { type: "functionCall", name: "add", args: [{ type: "identifier", name: "ptr" }, { type: "literal", value: 32n }] },
            ],
          },
        },
      ],
    };
  }

  /**
   * Generate __sha256 helper that calls the SHA256 precompile (address 0x02)
   * __sha256(offset, size) -> hash
   */
  private generateSha256Helper(): YulStatement {
    // function __sha256(offset, size) -> hash {
    //     let success := staticcall(gas(), 2, offset, size, 0, 32)
    //     if iszero(success) { revert(0, 0) }
    //     hash := mload(0)
    // }
    return {
      type: "function",
      name: "__sha256",
      params: ["offset", "size"],
      returns: ["hash"],
      body: [
        // let success := staticcall(gas(), 2, offset, size, 0, 32)
        {
          type: "variableDeclaration",
          names: ["success"],
          value: {
            type: "functionCall",
            name: "staticcall",
            args: [
              { type: "functionCall", name: "gas", args: [] },
              { type: "literal", value: 2n }, // SHA256 precompile address
              { type: "identifier", name: "offset" },
              { type: "identifier", name: "size" },
              { type: "literal", value: 0n },
              { type: "literal", value: 32n },
            ],
          },
        },
        // if iszero(success) { revert(0, 0) }
        {
          type: "if",
          condition: {
            type: "functionCall",
            name: "iszero",
            args: [{ type: "identifier", name: "success" }],
          },
          body: [
            {
              type: "expression",
              expr: {
                type: "functionCall",
                name: "revert",
                args: [{ type: "literal", value: 0n }, { type: "literal", value: 0n }],
              },
            },
          ],
        },
        // hash := mload(0)
        {
          type: "assignment",
          names: ["hash"],
          value: { type: "functionCall", name: "mload", args: [{ type: "literal", value: 0n }] },
        },
      ],
    };
  }

  /**
   * Generate __ripemd160 helper that calls the RIPEMD160 precompile (address 0x03)
   * __ripemd160(offset, size) -> hash
   * Output is 20 bytes (160 bits), right-aligned in a 32-byte word
   */
  private generateRipemd160Helper(): YulStatement {
    // function __ripemd160(offset, size) -> hash {
    //     let success := staticcall(gas(), 3, offset, size, 0, 32)
    //     if iszero(success) { revert(0, 0) }
    //     hash := mload(0)
    // }
    return {
      type: "function",
      name: "__ripemd160",
      params: ["offset", "size"],
      returns: ["hash"],
      body: [
        // let success := staticcall(gas(), 3, offset, size, 0, 32)
        {
          type: "variableDeclaration",
          names: ["success"],
          value: {
            type: "functionCall",
            name: "staticcall",
            args: [
              { type: "functionCall", name: "gas", args: [] },
              { type: "literal", value: 3n }, // RIPEMD160 precompile address
              { type: "identifier", name: "offset" },
              { type: "identifier", name: "size" },
              { type: "literal", value: 0n },
              { type: "literal", value: 32n },
            ],
          },
        },
        // if iszero(success) { revert(0, 0) }
        {
          type: "if",
          condition: {
            type: "functionCall",
            name: "iszero",
            args: [{ type: "identifier", name: "success" }],
          },
          body: [
            {
              type: "expression",
              expr: {
                type: "functionCall",
                name: "revert",
                args: [{ type: "literal", value: 0n }, { type: "literal", value: 0n }],
              },
            },
          ],
        },
        // hash := mload(0)
        {
          type: "assignment",
          names: ["hash"],
          value: { type: "functionCall", name: "mload", args: [{ type: "literal", value: 0n }] },
        },
      ],
    };
  }

  /**
   * Generate __ecrecover helper that calls the ECRECOVER precompile (address 0x01)
   * __ecrecover(hash, v, r, s) -> addr
   *
   * Input layout at memory (128 bytes):
   *   0-31: hash
   *   32-63: v
   *   64-95: r
   *   96-127: s
   *
   * Output: 32-byte address (right-aligned)
   */
  private generateEcrecoverHelper(): YulStatement {
    // function __ecrecover(hash, v, r, s) -> addr {
    //     mstore(0, hash)
    //     mstore(32, v)
    //     mstore(64, r)
    //     mstore(96, s)
    //     let success := staticcall(gas(), 1, 0, 128, 0, 32)
    //     if iszero(success) { revert(0, 0) }
    //     addr := mload(0)
    // }
    return {
      type: "function",
      name: "__ecrecover",
      params: ["hash", "v", "r", "s"],
      returns: ["addr"],
      body: [
        // mstore(0, hash)
        {
          type: "expression",
          expr: {
            type: "functionCall",
            name: "mstore",
            args: [{ type: "literal", value: 0n }, { type: "identifier", name: "hash" }],
          },
        },
        // mstore(32, v)
        {
          type: "expression",
          expr: {
            type: "functionCall",
            name: "mstore",
            args: [{ type: "literal", value: 32n }, { type: "identifier", name: "v" }],
          },
        },
        // mstore(64, r)
        {
          type: "expression",
          expr: {
            type: "functionCall",
            name: "mstore",
            args: [{ type: "literal", value: 64n }, { type: "identifier", name: "r" }],
          },
        },
        // mstore(96, s)
        {
          type: "expression",
          expr: {
            type: "functionCall",
            name: "mstore",
            args: [{ type: "literal", value: 96n }, { type: "identifier", name: "s" }],
          },
        },
        // let success := staticcall(gas(), 1, 0, 128, 0, 32)
        {
          type: "variableDeclaration",
          names: ["success"],
          value: {
            type: "functionCall",
            name: "staticcall",
            args: [
              { type: "functionCall", name: "gas", args: [] },
              { type: "literal", value: 1n }, // ECRECOVER precompile address
              { type: "literal", value: 0n },
              { type: "literal", value: 128n },
              { type: "literal", value: 0n },
              { type: "literal", value: 32n },
            ],
          },
        },
        // if iszero(success) { revert(0, 0) }
        {
          type: "if",
          condition: {
            type: "functionCall",
            name: "iszero",
            args: [{ type: "identifier", name: "success" }],
          },
          body: [
            {
              type: "expression",
              expr: {
                type: "functionCall",
                name: "revert",
                args: [{ type: "literal", value: 0n }, { type: "literal", value: 0n }],
              },
            },
          ],
        },
        // addr := mload(0)
        {
          type: "assignment",
          names: ["addr"],
          value: { type: "functionCall", name: "mload", args: [{ type: "literal", value: 0n }] },
        },
      ],
    };
  }

  /**
   * Generate a library function
   * lib_SafeMath_add(a, b) -> result
   */
  private generateLibraryFunction(libName: string, methodInfo: LibraryMethodInfo): YulStatement {
    const funcName = `lib_${libName}_${methodInfo.name}`;
    const params = methodInfo.params.map((p) => p.name);
    const hasReturn = methodInfo.returnType !== "void";

    // Transform the method body
    const body = methodInfo.methodDecl.getBody();
    if (!body) {
      throw new Error(`Library method ${libName}.${methodInfo.name} has no body`);
    }

    // Save current state and set return tracking
    const savedReturns = this.currentMethodReturns;
    this.currentMethodReturns = hasReturn ? ["result"] : [];

    let bodyStatements: YulStatement[] = [];
    if (Node.isBlock(body)) {
      bodyStatements = this.transformBlock(body);
    }

    // Restore state
    this.currentMethodReturns = savedReturns;

    return {
      type: "function",
      name: funcName,
      params,
      returns: hasReturn ? ["result"] : [],
      body: bodyStatements,
    };
  }

  /**
   * Generate a function for an imported standalone function
   * sqrt(x) -> result
   */
  private generateImportedFunction(funcInfo: ImportedFunctionInfo): YulStatement {
    const funcName = funcInfo.name;
    const params = funcInfo.params.map((p) => p.name);
    const hasReturn = funcInfo.returnType !== "void";

    // Transform the function body
    const body = funcInfo.declaration.getBody();
    if (!body) {
      throw new Error(`Imported function ${funcInfo.name} has no body`);
    }

    // Save current state and set return tracking
    const savedReturns = this.currentMethodReturns;
    this.currentMethodReturns = hasReturn ? ["result"] : [];

    let bodyStatements: YulStatement[] = [];
    if (Node.isBlock(body)) {
      bodyStatements = this.transformBlock(body);
    }

    // Restore state
    this.currentMethodReturns = savedReturns;

    return {
      type: "function",
      name: funcName,
      params,
      returns: hasReturn ? ["result"] : [],
      body: bodyStatements,
    };
  }

  /**
   * Generate the __mapping_slot helper function
   * Computes keccak256(key . slot) for mapping storage access
   */
  private generateMappingSlotHelper(): YulStatement {
    // function __mapping_slot(key, slot) -> result {
    //     mstore(0, key)
    //     mstore(32, slot)
    //     result := keccak256(0, 64)
    // }
    return {
      type: "function",
      name: "__mapping_slot",
      params: ["key", "slot"],
      returns: ["result"],
      body: [
        {
          type: "expression",
          expr: {
            type: "functionCall",
            name: "mstore",
            args: [
              { type: "literal", value: 0n },
              { type: "identifier", name: "key" },
            ],
          },
        },
        {
          type: "expression",
          expr: {
            type: "functionCall",
            name: "mstore",
            args: [
              { type: "literal", value: 32n },
              { type: "identifier", name: "slot" },
            ],
          },
        },
        {
          type: "assignment",
          names: ["result"],
          value: {
            type: "functionCall",
            name: "keccak256",
            args: [
              { type: "literal", value: 0n },
              { type: "literal", value: 64n },
            ],
          },
        },
      ],
    };
  }

  /**
   * Generate the __array_slot helper function
   * Computes keccak256(slot) + index for array element access
   */
  private generateArraySlotHelper(): YulStatement {
    // function __array_slot(slot, index) -> result {
    //     mstore(0, slot)
    //     result := add(keccak256(0, 32), index)
    // }
    return {
      type: "function",
      name: "__array_slot",
      params: ["slot", "index"],
      returns: ["result"],
      body: [
        {
          type: "expression",
          expr: {
            type: "functionCall",
            name: "mstore",
            args: [
              { type: "literal", value: 0n },
              { type: "identifier", name: "slot" },
            ],
          },
        },
        {
          type: "assignment",
          names: ["result"],
          value: {
            type: "functionCall",
            name: "add",
            args: [
              {
                type: "functionCall",
                name: "keccak256",
                args: [
                  { type: "literal", value: 0n },
                  { type: "literal", value: 32n },
                ],
              },
              { type: "identifier", name: "index" },
            ],
          },
        },
      ],
    };
  }

  /**
   * Generate __bytes_load helper for loading a byte from dynamic bytes storage
   * function __bytes_load(slot, index) -> result {
   *     mstore(0, slot)
   *     let data_slot := keccak256(0, 32)
   *     let slot_offset := div(index, 32)
   *     let byte_offset := mod(index, 32)
   *     result := byte(byte_offset, sload(add(data_slot, slot_offset)))
   * }
   */
  private generateBytesLoadHelper(): YulStatement {
    return {
      type: "function",
      name: "__bytes_load",
      params: ["slot", "index"],
      returns: ["result"],
      body: [
        // mstore(0, slot)
        {
          type: "expression",
          expr: {
            type: "functionCall",
            name: "mstore",
            args: [
              { type: "literal", value: 0n },
              { type: "identifier", name: "slot" },
            ],
          },
        },
        // let data_slot := keccak256(0, 32)
        {
          type: "variableDeclaration",
          names: ["data_slot"],
          value: {
            type: "functionCall",
            name: "keccak256",
            args: [
              { type: "literal", value: 0n },
              { type: "literal", value: 32n },
            ],
          },
        },
        // let slot_offset := div(index, 32)
        {
          type: "variableDeclaration",
          names: ["slot_offset"],
          value: {
            type: "functionCall",
            name: "div",
            args: [
              { type: "identifier", name: "index" },
              { type: "literal", value: 32n },
            ],
          },
        },
        // let byte_offset := mod(index, 32)
        {
          type: "variableDeclaration",
          names: ["byte_offset"],
          value: {
            type: "functionCall",
            name: "mod",
            args: [
              { type: "identifier", name: "index" },
              { type: "literal", value: 32n },
            ],
          },
        },
        // result := byte(byte_offset, sload(add(data_slot, slot_offset)))
        {
          type: "assignment",
          names: ["result"],
          value: {
            type: "functionCall",
            name: "byte",
            args: [
              { type: "identifier", name: "byte_offset" },
              {
                type: "functionCall",
                name: "sload",
                args: [
                  {
                    type: "functionCall",
                    name: "add",
                    args: [
                      { type: "identifier", name: "data_slot" },
                      { type: "identifier", name: "slot_offset" },
                    ],
                  },
                ],
              },
            ],
          },
        },
      ],
    };
  }

  /**
   * Generate __bytes_store helper for storing a byte to dynamic bytes storage
   * function __bytes_store(slot, index, value) {
   *     mstore(0, slot)
   *     let data_slot := add(keccak256(0, 32), div(index, 32))
   *     let byte_offset := mod(index, 32)
   *     let shift := mul(sub(31, byte_offset), 8)
   *     let mask := not(shl(shift, 0xff))
   *     let new_val := shl(shift, and(value, 0xff))
   *     sstore(data_slot, or(and(sload(data_slot), mask), new_val))
   * }
   */
  private generateBytesStoreHelper(): YulStatement {
    return {
      type: "function",
      name: "__bytes_store",
      params: ["slot", "index", "value"],
      returns: [],
      body: [
        // mstore(0, slot)
        {
          type: "expression",
          expr: {
            type: "functionCall",
            name: "mstore",
            args: [
              { type: "literal", value: 0n },
              { type: "identifier", name: "slot" },
            ],
          },
        },
        // let data_slot := add(keccak256(0, 32), div(index, 32))
        {
          type: "variableDeclaration",
          names: ["data_slot"],
          value: {
            type: "functionCall",
            name: "add",
            args: [
              {
                type: "functionCall",
                name: "keccak256",
                args: [
                  { type: "literal", value: 0n },
                  { type: "literal", value: 32n },
                ],
              },
              {
                type: "functionCall",
                name: "div",
                args: [
                  { type: "identifier", name: "index" },
                  { type: "literal", value: 32n },
                ],
              },
            ],
          },
        },
        // let byte_offset := mod(index, 32)
        {
          type: "variableDeclaration",
          names: ["byte_offset"],
          value: {
            type: "functionCall",
            name: "mod",
            args: [
              { type: "identifier", name: "index" },
              { type: "literal", value: 32n },
            ],
          },
        },
        // let shift := mul(sub(31, byte_offset), 8)
        {
          type: "variableDeclaration",
          names: ["shift"],
          value: {
            type: "functionCall",
            name: "mul",
            args: [
              {
                type: "functionCall",
                name: "sub",
                args: [
                  { type: "literal", value: 31n },
                  { type: "identifier", name: "byte_offset" },
                ],
              },
              { type: "literal", value: 8n },
            ],
          },
        },
        // let mask := not(shl(shift, 0xff))
        {
          type: "variableDeclaration",
          names: ["mask"],
          value: {
            type: "functionCall",
            name: "not",
            args: [
              {
                type: "functionCall",
                name: "shl",
                args: [
                  { type: "identifier", name: "shift" },
                  { type: "literal", value: 0xffn },
                ],
              },
            ],
          },
        },
        // let new_val := shl(shift, and(value, 0xff))
        {
          type: "variableDeclaration",
          names: ["new_val"],
          value: {
            type: "functionCall",
            name: "shl",
            args: [
              { type: "identifier", name: "shift" },
              {
                type: "functionCall",
                name: "and",
                args: [
                  { type: "identifier", name: "value" },
                  { type: "literal", value: 0xffn },
                ],
              },
            ],
          },
        },
        // sstore(data_slot, or(and(sload(data_slot), mask), new_val))
        {
          type: "expression",
          expr: {
            type: "functionCall",
            name: "sstore",
            args: [
              { type: "identifier", name: "data_slot" },
              {
                type: "functionCall",
                name: "or",
                args: [
                  {
                    type: "functionCall",
                    name: "and",
                    args: [
                      {
                        type: "functionCall",
                        name: "sload",
                        args: [{ type: "identifier", name: "data_slot" }],
                      },
                      { type: "identifier", name: "mask" },
                    ],
                  },
                  { type: "identifier", name: "new_val" },
                ],
              },
            ],
          },
        },
      ],
    };
  }

  /**
   * Generate __bytes_push helper for appending a byte to dynamic bytes storage
   * function __bytes_push(slot, value) {
   *     let len := sload(slot)
   *     __bytes_store(slot, len, value)
   *     sstore(slot, add(len, 1))
   * }
   */
  private generateBytesPushHelper(): YulStatement {
    return {
      type: "function",
      name: "__bytes_push",
      params: ["slot", "value"],
      returns: [],
      body: [
        // let len := sload(slot)
        {
          type: "variableDeclaration",
          names: ["len"],
          value: {
            type: "functionCall",
            name: "sload",
            args: [{ type: "identifier", name: "slot" }],
          },
        },
        // __bytes_store(slot, len, value)
        {
          type: "expression",
          expr: {
            type: "functionCall",
            name: "__bytes_store",
            args: [
              { type: "identifier", name: "slot" },
              { type: "identifier", name: "len" },
              { type: "identifier", name: "value" },
            ],
          },
        },
        // sstore(slot, add(len, 1))
        {
          type: "expression",
          expr: {
            type: "functionCall",
            name: "sstore",
            args: [
              { type: "identifier", name: "slot" },
              {
                type: "functionCall",
                name: "add",
                args: [
                  { type: "identifier", name: "len" },
                  { type: "literal", value: 1n },
                ],
              },
            ],
          },
        },
      ],
    };
  }

  /**
   * Generate __bytes_pop helper for removing and returning the last byte
   * function __bytes_pop(slot) -> result {
   *     let len := sload(slot)
   *     if iszero(len) { revert(0, 0) }
   *     let new_len := sub(len, 1)
   *     result := __bytes_load(slot, new_len)
   *     sstore(slot, new_len)
   * }
   */
  private generateBytesPopHelper(): YulStatement {
    return {
      type: "function",
      name: "__bytes_pop",
      params: ["slot"],
      returns: ["result"],
      body: [
        // let len := sload(slot)
        {
          type: "variableDeclaration",
          names: ["len"],
          value: {
            type: "functionCall",
            name: "sload",
            args: [{ type: "identifier", name: "slot" }],
          },
        },
        // if iszero(len) { revert(0, 0) }
        {
          type: "if",
          condition: {
            type: "functionCall",
            name: "iszero",
            args: [{ type: "identifier", name: "len" }],
          },
          body: [
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
        // let new_len := sub(len, 1)
        {
          type: "variableDeclaration",
          names: ["new_len"],
          value: {
            type: "functionCall",
            name: "sub",
            args: [
              { type: "identifier", name: "len" },
              { type: "literal", value: 1n },
            ],
          },
        },
        // result := __bytes_load(slot, new_len)
        {
          type: "assignment",
          names: ["result"],
          value: {
            type: "functionCall",
            name: "__bytes_load",
            args: [
              { type: "identifier", name: "slot" },
              { type: "identifier", name: "new_len" },
            ],
          },
        },
        // sstore(slot, new_len)
        {
          type: "expression",
          expr: {
            type: "functionCall",
            name: "sstore",
            args: [
              { type: "identifier", name: "slot" },
              { type: "identifier", name: "new_len" },
            ],
          },
        },
      ],
    };
  }

  /**
   * Generate code for this.arr.push(value)
   * 1. Get current length: let len := sload(slot)
   * 2. Compute data slot: keccak256(slot) + len
   * 3. Store value at data slot
   * 4. Increment length: sstore(slot, add(len, 1))
   */
  private generateArrayPush(slot: bigint, args: Node[]): YulStatement[] {
    if (args.length !== 1) {
      throw new Error("push() requires exactly one argument");
    }

    const valueExpr = this.transformExpression(args[0]!);
    const statements: YulStatement[] = [];

    // let _push_len := sload(slot)
    statements.push({
      type: "variableDeclaration",
      names: ["_push_len"],
      value: {
        type: "functionCall",
        name: "sload",
        args: [{ type: "literal", value: slot }],
      },
    });

    // let _push_data_slot := add(keccak256(slot, 32), _push_len)
    // First compute keccak256 of slot
    statements.push({
      type: "expression",
      expr: {
        type: "functionCall",
        name: "mstore",
        args: [{ type: "literal", value: 0n }, { type: "literal", value: slot }],
      },
    });

    statements.push({
      type: "variableDeclaration",
      names: ["_push_data_slot"],
      value: {
        type: "functionCall",
        name: "add",
        args: [
          {
            type: "functionCall",
            name: "keccak256",
            args: [{ type: "literal", value: 0n }, { type: "literal", value: 32n }],
          },
          { type: "identifier", name: "_push_len" },
        ],
      },
    });

    // sstore(_push_data_slot, value)
    statements.push({
      type: "expression",
      expr: {
        type: "functionCall",
        name: "sstore",
        args: [{ type: "identifier", name: "_push_data_slot" }, valueExpr],
      },
    });

    // sstore(slot, add(_push_len, 1))
    statements.push({
      type: "expression",
      expr: {
        type: "functionCall",
        name: "sstore",
        args: [
          { type: "literal", value: slot },
          {
            type: "functionCall",
            name: "add",
            args: [{ type: "identifier", name: "_push_len" }, { type: "literal", value: 1n }],
          },
        ],
      },
    });

    return statements;
  }

  /**
   * Generate code for this.arr.pop()
   * 1. Get current length: let len := sload(slot)
   * 2. Compute new length: let newLen := sub(len, 1)
   * 3. Clear the popped element: sstore(keccak256(slot) + newLen, 0)
   * 4. Update length: sstore(slot, newLen)
   */
  private generateArrayPop(slot: bigint): YulStatement[] {
    const statements: YulStatement[] = [];

    // let _pop_len := sload(slot)
    statements.push({
      type: "variableDeclaration",
      names: ["_pop_len"],
      value: {
        type: "functionCall",
        name: "sload",
        args: [{ type: "literal", value: slot }],
      },
    });

    // let _pop_new_len := sub(_pop_len, 1)
    statements.push({
      type: "variableDeclaration",
      names: ["_pop_new_len"],
      value: {
        type: "functionCall",
        name: "sub",
        args: [{ type: "identifier", name: "_pop_len" }, { type: "literal", value: 1n }],
      },
    });

    // Compute data slot for the element to clear
    statements.push({
      type: "expression",
      expr: {
        type: "functionCall",
        name: "mstore",
        args: [{ type: "literal", value: 0n }, { type: "literal", value: slot }],
      },
    });

    statements.push({
      type: "variableDeclaration",
      names: ["_pop_data_slot"],
      value: {
        type: "functionCall",
        name: "add",
        args: [
          {
            type: "functionCall",
            name: "keccak256",
            args: [{ type: "literal", value: 0n }, { type: "literal", value: 32n }],
          },
          { type: "identifier", name: "_pop_new_len" },
        ],
      },
    });

    // Clear the popped element: sstore(_pop_data_slot, 0)
    statements.push({
      type: "expression",
      expr: {
        type: "functionCall",
        name: "sstore",
        args: [{ type: "identifier", name: "_pop_data_slot" }, { type: "literal", value: 0n }],
      },
    });

    // Update length: sstore(slot, _pop_new_len)
    statements.push({
      type: "expression",
      expr: {
        type: "functionCall",
        name: "sstore",
        args: [{ type: "literal", value: slot }, { type: "identifier", name: "_pop_new_len" }],
      },
    });

    return statements;
  }

  private generateDispatcher(
    functions: FunctionMeta[],
    hasFallback: boolean,
    hasReceive: boolean
  ): YulStatement {
    const selectorExpr: YulExpression = {
      type: "functionCall",
      name: "shr",
      args: [
        { type: "literal", value: 224n },
        {
          type: "functionCall",
          name: "calldataload",
          args: [{ type: "literal", value: 0n }],
        },
      ],
    };

    const cases = functions.map((fn) => ({
      value: { type: "literal" as const, value: BigInt(fn.selector) },
      body: this.generateDispatcherCase(fn),
    }));

    // Generate default branch based on fallback/receive
    let defaultBody: YulStatement[];

    if (hasReceive || hasFallback) {
      defaultBody = [];

      // If calldatasize is 0 (plain ETH transfer)
      if (hasReceive) {
        defaultBody.push({
          type: "if",
          condition: {
            type: "functionCall",
            name: "iszero",
            args: [
              { type: "functionCall", name: "calldatasize", args: [] },
            ],
          },
          body: [
            // Call receive function
            {
              type: "expression",
              expr: {
                type: "functionCall",
                name: "fn_receive",
                args: [],
              },
            },
            // Stop execution
            {
              type: "expression",
              expr: { type: "functionCall", name: "stop", args: [] },
            },
          ],
        });
      }

      // Handle fallback for non-empty calldata or when no receive
      if (hasFallback) {
        if (hasReceive) {
          // If we have receive, fallback only handles non-zero calldatasize
          // (receive already handled the zero case above)
          defaultBody.push({
            type: "expression",
            expr: {
              type: "functionCall",
              name: "fn_fallback",
              args: [],
            },
          });
          defaultBody.push({
            type: "expression",
            expr: { type: "functionCall", name: "stop", args: [] },
          });
        } else {
          // No receive, fallback handles everything
          defaultBody.push({
            type: "expression",
            expr: {
              type: "functionCall",
              name: "fn_fallback",
              args: [],
            },
          });
          defaultBody.push({
            type: "expression",
            expr: { type: "functionCall", name: "stop", args: [] },
          });
        }
      } else {
        // Has receive but no fallback - revert for non-matching selectors with data
        defaultBody.push({
          type: "expression",
          expr: {
            type: "functionCall",
            name: "revert",
            args: [
              { type: "literal", value: 0n },
              { type: "literal", value: 0n },
            ],
          },
        });
      }
    } else {
      // No fallback or receive - just revert
      defaultBody = [
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
      ];
    }

    return {
      type: "switch",
      expr: selectorExpr,
      cases,
      default: defaultBody,
    };
  }

  private generateDispatcherCase(fn: FunctionMeta): YulStatement[] {
    const statements: YulStatement[] = [];

    // For non-payable functions, revert if value is sent
    if (!fn.isPayable) {
      statements.push({
        type: "if",
        condition: { type: "functionCall", name: "callvalue", args: [] },
        body: [
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
      });
    }

    // Decode parameters from calldata
    const args: YulExpression[] = [];
    for (let i = 0; i < fn.paramCount; i++) {
      const param = fn.params[i];
      if (param && param.isDynamicArray) {
        // Dynamic array: first read offset, then decode array info
        // For calldata arrays, we pass (offset, length) as two args
        // Offset points to: length (32 bytes) + data
        const offsetVar = `_arr_offset_${i}`;
        const lengthVar = `_arr_len_${i}`;
        const dataOffsetVar = `_arr_data_${i}`;

        // let _arr_offset_i := add(4, calldataload(4 + i * 32))
        statements.push({
          type: "variableDeclaration",
          names: [offsetVar],
          value: {
            type: "functionCall",
            name: "add",
            args: [
              { type: "literal", value: 4n },
              { type: "functionCall", name: "calldataload", args: [{ type: "literal", value: BigInt(4 + i * 32) }] },
            ],
          },
        });

        // let _arr_len_i := calldataload(_arr_offset_i)
        statements.push({
          type: "variableDeclaration",
          names: [lengthVar],
          value: {
            type: "functionCall",
            name: "calldataload",
            args: [{ type: "identifier", name: offsetVar }],
          },
        });

        // let _arr_data_i := add(_arr_offset_i, 32)
        statements.push({
          type: "variableDeclaration",
          names: [dataOffsetVar],
          value: {
            type: "functionCall",
            name: "add",
            args: [
              { type: "identifier", name: offsetVar },
              { type: "literal", value: 32n },
            ],
          },
        });

        // Pass data offset and length as two separate args
        args.push({ type: "identifier", name: dataOffsetVar });
        args.push({ type: "identifier", name: lengthVar });
      } else {
        args.push({
          type: "functionCall",
          name: "calldataload",
          args: [{ type: "literal", value: BigInt(4 + i * 32) }],
        });
      }
    }

    if (fn.hasReturn) {
      if (fn.returnCount > 1) {
        // Tuple return: let _out_0, _out_1, ... := fn_xxx(args...)
        const returnNames = Array.from({ length: fn.returnCount }, (_, i) => `_out_${i}`);
        statements.push({
          type: "variableDeclaration",
          names: returnNames,
          value: {
            type: "functionCall",
            name: `fn_${fn.name}`,
            args,
          },
        });

        // mstore each return value
        for (let i = 0; i < fn.returnCount; i++) {
          statements.push({
            type: "expression",
            expr: {
              type: "functionCall",
              name: "mstore",
              args: [
                { type: "literal", value: BigInt(i * 32) },
                { type: "identifier", name: `_out_${i}` },
              ],
            },
          });
        }

        // return(0, returnCount * 32)
        statements.push({
          type: "expression",
          expr: {
            type: "functionCall",
            name: "return",
            args: [
              { type: "literal", value: 0n },
              { type: "literal", value: BigInt(fn.returnCount * 32) },
            ],
          },
        });
      } else {
        // Single return: let _result := fn_xxx(args...)
        statements.push({
          type: "variableDeclaration",
          names: ["_result"],
          value: {
            type: "functionCall",
            name: `fn_${fn.name}`,
            args,
          },
        });

        // mstore(0, result)
        statements.push({
          type: "expression",
          expr: {
            type: "functionCall",
            name: "mstore",
            args: [
              { type: "literal", value: 0n },
              { type: "identifier", name: "_result" },
            ],
          },
        });

        // return(0, 32)
        statements.push({
          type: "expression",
          expr: {
            type: "functionCall",
            name: "return",
            args: [
              { type: "literal", value: 0n },
              { type: "literal", value: 32n },
            ],
          },
        });
      }
    } else {
      // fn_xxx(args...)
      statements.push({
        type: "expression",
        expr: {
          type: "functionCall",
          name: `fn_${fn.name}`,
          args,
        },
      });

      // stop()
      statements.push({
        type: "expression",
        expr: {
          type: "functionCall",
          name: "stop",
          args: [],
        },
      });
    }

    return statements;
  }

  private transformMethod(method: MethodDeclaration): YulStatement {
    // Clear memory array tracking for each method
    this.memoryArrays.clear();

    // Track which class this method belongs to (for super calls)
    const methodClass = method.getFirstAncestorByKind(SyntaxKind.ClassDeclaration);
    this.currentMethodClass = methodClass ?? null;

    const name = method.getName();

    // Build params list, expanding dynamic arrays to (offset, len) pairs
    const rawParams = method.getParameters().filter((p) => p.getName() !== "this");
    const params: string[] = [];
    this.calldataArrayParams.clear();

    for (const p of rawParams) {
      const paramName = p.getName();
      const typeName = p.getTypeNode()?.getText() ?? "u256";
      const isDynamicArray = typeName.startsWith("CalldataArray<") ||
        (typeName.endsWith("[]") && !typeName.includes("StorageArray"));

      if (isDynamicArray) {
        // Expand to two params: offset and length
        params.push(`${paramName}_offset`);
        params.push(`${paramName}_len`);
        this.calldataArrayParams.set(paramName, { offsetVar: `${paramName}_offset`, lenVar: `${paramName}_len` });
      } else {
        params.push(paramName);
      }
    }

    const returnTypeNode = method.getReturnTypeNode();
    const hasReturn = returnTypeNode !== undefined && returnTypeNode.getText() !== "void";

    // Determine return variables based on return type
    let returns: string[] = [];
    if (hasReturn) {
      const returnTypeText = returnTypeNode!.getText();
      // Check if it's a tuple type [T1, T2, ...]
      if (returnTypeText.startsWith("[") && returnTypeText.endsWith("]")) {
        const evmType = mapType(returnTypeText, this.createTypeContext());
        if (evmType.kind === "tuple") {
          returns = evmType.elements.map((_, i) => `_out_${i}`);
        } else {
          returns = ["_out"];
        }
      } else {
        returns = ["_out"];
      }
    }

    // Store return variables for use in transformReturnStatement
    this.currentMethodReturns = returns;

    // Check for modifier decorators and prepend modifier body
    const modifierStatements: YulStatement[] = [];
    for (const decorator of method.getDecorators()) {
      const decoratorName = decorator.getName();
      // Skip built-in decorators
      if (["storage", "payable", "view", "pure", "event", "immutable", "anonymous", "virtual", "override", "internal", "external", "constant"].includes(decoratorName)) {
        continue;
      }

      // Look up the modifier method
      const modifierMethod = this.modifiers.get(decoratorName);
      if (modifierMethod) {
        const modifierBody = modifierMethod.getBody();
        if (modifierBody && Node.isBlock(modifierBody)) {
          const transformed = this.transformBlock(modifierBody);
          modifierStatements.push(...transformed);
        }
      }
    }

    const methodBody = this.transformBlock(method.getBody() as Block);

    // Combine modifier statements with method body
    const body = [...modifierStatements, ...methodBody];

    // Reset after transformation
    this.currentMethodReturns = [];

    return {
      type: "function",
      name: `fn_${name}`,
      params,
      returns,
      body,
    };
  }

  /**
   * Transform a method with a custom function name (for super calls).
   * Similar to transformMethod but allows specifying the output function name.
   */
  private transformMethodWithName(method: MethodDeclaration, customName: string): YulStatement {
    // Clear memory array tracking for each method
    this.memoryArrays.clear();

    // Track which class this method belongs to (for super calls in multi-level inheritance)
    const methodClass = method.getFirstAncestorByKind(SyntaxKind.ClassDeclaration);
    this.currentMethodClass = methodClass ?? null;

    const params = method
      .getParameters()
      .filter((p) => p.getName() !== "this")
      .map((p) => p.getName());

    const returnTypeNode = method.getReturnTypeNode();
    const hasReturn = returnTypeNode !== undefined && returnTypeNode.getText() !== "void";

    // Determine return variables based on return type
    let returns: string[] = [];
    if (hasReturn) {
      const returnTypeText = returnTypeNode!.getText();
      if (returnTypeText.startsWith("[") && returnTypeText.endsWith("]")) {
        const evmType = mapType(returnTypeText, this.createTypeContext());
        if (evmType.kind === "tuple") {
          returns = evmType.elements.map((_, i) => `_out_${i}`);
        } else {
          returns = ["_out"];
        }
      } else {
        returns = ["_out"];
      }
    }

    // Store return variables for use in transformReturnStatement
    this.currentMethodReturns = returns;

    // Note: We don't apply modifiers for parent methods - they're applied in the derived class
    const methodBody = this.transformBlock(method.getBody() as Block);

    // Reset after transformation
    this.currentMethodReturns = [];

    return {
      type: "function",
      name: `fn_${customName}`,
      params,
      returns,
      body: methodBody,
    };
  }

  private transformBlock(block: Block): YulStatement[] {
    const statements: YulStatement[] = [];

    for (const stmt of block.getStatements()) {
      const transformed = this.transformStatement(stmt);
      if (transformed) {
        if (Array.isArray(transformed)) {
          statements.push(...transformed);
        } else {
          statements.push(transformed);
        }
      }
    }

    return statements;
  }

  private transformStatement(node: Node): YulStatement | YulStatement[] | null {
    if (Node.isExpressionStatement(node)) {
      return this.transformExpressionStatement(node);
    }

    if (Node.isReturnStatement(node)) {
      return this.transformReturnStatement(node);
    }

    if (Node.isIfStatement(node)) {
      return this.transformIfStatement(node);
    }

    if (Node.isVariableStatement(node)) {
      return this.transformVariableStatement(node);
    }

    if (Node.isWhileStatement(node)) {
      return this.transformWhileStatement(node);
    }

    if (Node.isDoStatement(node)) {
      return this.transformDoWhileStatement(node);
    }

    if (Node.isForStatement(node)) {
      return this.transformForStatement(node);
    }

    if (Node.isBreakStatement(node)) {
      return { type: "break" };
    }

    if (Node.isContinueStatement(node)) {
      return { type: "continue" };
    }

    if (Node.isTryStatement(node)) {
      return this.transformTryStatement(node);
    }

    // Unsupported statement type
    return null;
  }

  /**
   * Transform try/catch statement for external calls.
   *
   * TypeScript syntax:
   * ```typescript
   * try {
   *   const result = call.call(target, "transfer(address,uint256)", [to, amount]);
   *   // more statements
   * } catch {
   *   // error handling
   * }
   * ```
   *
   * Yul output pattern:
   * ```yul
   * let _try_success := 0
   * let _try_result := 0
   * {
   *   // perform call, store success
   *   _try_success := __call(...)
   *   _try_result := mload(0)
   * }
   * if _try_success {
   *   // rest of try block
   * }
   * if iszero(_try_success) {
   *   // catch block
   * }
   * ```
   */
  private transformTryStatement(node: TryStatement): YulStatement[] {
    const tryBlock = node.getTryBlock();
    const catchClause = node.getCatchClause();
    const tryCounter = this.condCounter++;

    const statements: YulStatement[] = [];
    const successVar = `_try_success_${tryCounter}`;
    const resultVar = `_try_result_${tryCounter}`;

    // Declare success and result variables
    statements.push({
      type: "variableDeclaration",
      names: [successVar],
      value: { type: "literal", value: 0n },
    });
    statements.push({
      type: "variableDeclaration",
      names: [resultVar],
      value: { type: "literal", value: 0n },
    });

    // Process try block statements
    const tryStatements = tryBlock.getStatements();
    const beforeCallStmts: YulStatement[] = [];
    const afterCallStmts: YulStatement[] = [];
    let foundCall = false;
    let callResultVarName: string | null = null;

    for (const stmt of tryStatements) {
      if (!foundCall) {
        // Look for a variable declaration with an external call
        if (Node.isVariableStatement(stmt)) {
          const decls = stmt.getDeclarationList().getDeclarations();
          for (const decl of decls) {
            const init = decl.getInitializer();
            if (init && Node.isCallExpression(init)) {
              const callExpr = init.getExpression();
              if (Node.isPropertyAccessExpression(callExpr)) {
                const obj = callExpr.getExpression();
                const methodName = callExpr.getName();
                if (Node.isIdentifier(obj) && obj.getText() === "call" &&
                    (methodName === "call" || methodName === "staticcall" || methodName === "delegatecall")) {
                  // Found the external call
                  foundCall = true;
                  callResultVarName = decl.getName();

                  // Generate the call with success check
                  const callStmts = this.generateTryExternalCall(
                    init,
                    methodName as "call" | "staticcall" | "delegatecall",
                    successVar,
                    resultVar
                  );
                  beforeCallStmts.push(...callStmts);

                  // Assign result to the user's variable (will be in if success block)
                  afterCallStmts.push({
                    type: "variableDeclaration",
                    names: [callResultVarName],
                    value: { type: "identifier", name: resultVar },
                  });
                  continue;
                }
              }
            }
          }
        }

        // Look for expression statement with external call (no result capture)
        if (Node.isExpressionStatement(stmt)) {
          const expr = stmt.getExpression();
          if (Node.isCallExpression(expr)) {
            const callExpr = expr.getExpression();
            if (Node.isPropertyAccessExpression(callExpr)) {
              const obj = callExpr.getExpression();
              const methodName = callExpr.getName();
              if (Node.isIdentifier(obj) && obj.getText() === "call" &&
                  (methodName === "call" || methodName === "staticcall" || methodName === "delegatecall")) {
                // Found the external call (no result capture)
                foundCall = true;
                const callStmts = this.generateTryExternalCall(
                  expr,
                  methodName as "call" | "staticcall" | "delegatecall",
                  successVar,
                  resultVar
                );
                beforeCallStmts.push(...callStmts);
                continue;
              }
            }
          }
        }

        // Regular statement before the call
        const transformed = this.transformStatement(stmt);
        if (transformed) {
          if (Array.isArray(transformed)) {
            beforeCallStmts.push(...transformed);
          } else {
            beforeCallStmts.push(transformed);
          }
        }
      } else {
        // Statements after the call go into the success block
        const transformed = this.transformStatement(stmt);
        if (transformed) {
          if (Array.isArray(transformed)) {
            afterCallStmts.push(...transformed);
          } else {
            afterCallStmts.push(transformed);
          }
        }
      }
    }

    if (!foundCall) {
      throw new Error("try block must contain an external call (call.call, call.staticcall, or call.delegatecall)");
    }

    // Add the call statements
    statements.push(...beforeCallStmts);

    // If success, execute remaining try statements
    if (afterCallStmts.length > 0) {
      statements.push({
        type: "if",
        condition: { type: "identifier", name: successVar },
        body: afterCallStmts,
      });
    }

    // If failure, execute catch block
    if (catchClause) {
      const catchBlock = catchClause.getBlock();
      const catchBody = this.transformBlock(catchBlock);

      statements.push({
        type: "if",
        condition: {
          type: "functionCall",
          name: "iszero",
          args: [{ type: "identifier", name: successVar }],
        },
        body: catchBody,
      });
    }

    return statements;
  }

  /**
   * Generate external call with success tracking for try/catch.
   */
  private generateTryExternalCall(
    node: CallExpression,
    callType: "call" | "staticcall" | "delegatecall",
    successVar: string,
    resultVar: string
  ): YulStatement[] {
    const args = node.getArguments();
    if (args.length < 2) {
      throw new Error(`${callType} requires at least 2 arguments: target and signature`);
    }

    // target address
    const target = this.transformExpression(args[0]!);

    // signature string
    const sigArg = args[1]!;
    if (!Node.isStringLiteral(sigArg)) {
      throw new Error("Call signature must be a string literal");
    }
    const signature = sigArg.getLiteralValue();

    // Parse function signature to get selector
    const selectorMatch = signature.match(/^(\w+)\((.*)\)$/);
    if (!selectorMatch) {
      throw new Error(`Invalid function signature: ${signature}`);
    }

    const funcName = selectorMatch[1]!;
    const paramTypes = selectorMatch[2] ? selectorMatch[2].split(",") : [];

    // Compute selector
    const selectorHex = computeSelector(
      funcName,
      paramTypes.map((t, i) => ({ name: `arg${i}`, type: fromSolidityType(t.trim()) }))
    );
    const selector = BigInt(selectorHex);

    // Get call arguments
    const callArgs: YulExpression[] = [];
    if (args.length >= 3) {
      const argsArray = args[2]!;
      if (Node.isArrayLiteralExpression(argsArray)) {
        for (const elem of argsArray.getElements()) {
          callArgs.push(this.transformExpression(elem));
        }
      }
    }

    const statements: YulStatement[] = [];

    // Store selector in memory: mstore(0, shl(224, selector))
    statements.push({
      type: "expression",
      expr: {
        type: "functionCall",
        name: "mstore",
        args: [
          { type: "literal", value: 0n },
          {
            type: "functionCall",
            name: "shl",
            args: [
              { type: "literal", value: 224n },
              { type: "literal", value: selector },
            ],
          },
        ],
      },
    });

    // Store each argument
    for (let i = 0; i < callArgs.length; i++) {
      statements.push({
        type: "expression",
        expr: {
          type: "functionCall",
          name: "mstore",
          args: [
            { type: "literal", value: BigInt(4 + i * 32) },
            callArgs[i]!,
          ],
        },
      });
    }

    // Calculate input size: 4 + numArgs * 32
    const inputSize = 4n + BigInt(callArgs.length * 32);

    // Perform call and capture success
    // success := call(gas(), target, 0, 0, inputSize, 0, 32)
    // or staticcall(gas(), target, 0, inputSize, 0, 32)
    // or delegatecall(gas(), target, 0, inputSize, 0, 32)
    const callBuiltin = callType;
    const callExprArgs: YulExpression[] = [
      { type: "functionCall", name: "gas", args: [] },
      target,
    ];

    if (callType === "call") {
      callExprArgs.push({ type: "literal", value: 0n }); // value (0 for non-payable)
    }
    // staticcall and delegatecall have no value parameter

    callExprArgs.push(
      { type: "literal", value: 0n }, // input offset
      { type: "literal", value: inputSize }, // input size
      { type: "literal", value: 0n }, // output offset
      { type: "literal", value: 32n } // output size
    );

    statements.push({
      type: "assignment",
      names: [successVar],
      value: {
        type: "functionCall",
        name: callBuiltin,
        args: callExprArgs,
      },
    });

    // Load result from memory
    statements.push({
      type: "assignment",
      names: [resultVar],
      value: {
        type: "functionCall",
        name: "mload",
        args: [{ type: "literal", value: 0n }],
      },
    });

    return statements;
  }

  /**
   * Transform while statement: while (cond) { body }
   * Yul: for {} cond {} { body }
   */
  private transformWhileStatement(node: WhileStatement): YulStatement {
    const condition = this.transformExpression(node.getExpression());
    const bodyNode = node.getStatement();

    let body: YulStatement[] = [];
    if (Node.isBlock(bodyNode)) {
      body = this.transformBlock(bodyNode);
    } else {
      const stmt = this.transformStatement(bodyNode);
      if (stmt) {
        body = Array.isArray(stmt) ? stmt : [stmt];
      }
    }

    return {
      type: "for",
      pre: [],
      cond: condition,
      post: [],
      body,
    };
  }

  /**
   * Transform do-while statement: do { body } while (cond);
   * Yul: for {} 1 {} { body if iszero(cond) { break } }
   * The body executes at least once, then condition is checked
   */
  private transformDoWhileStatement(node: DoStatement): YulStatement {
    const condition = this.transformExpression(node.getExpression());
    const bodyNode = node.getStatement();

    let body: YulStatement[] = [];
    if (Node.isBlock(bodyNode)) {
      body = this.transformBlock(bodyNode);
    } else {
      const stmt = this.transformStatement(bodyNode);
      if (stmt) {
        body = Array.isArray(stmt) ? stmt : [stmt];
      }
    }

    // Add condition check at end of body: if iszero(cond) { break }
    body.push({
      type: "if",
      condition: {
        type: "functionCall",
        name: "iszero",
        args: [condition],
      },
      body: [{ type: "break" }],
    });

    return {
      type: "for",
      pre: [],
      cond: { type: "literal", value: 1n }, // Always true, condition checked in body
      post: [],
      body,
    };
  }

  /**
   * Transform for statement: for (init; cond; post) { body }
   * Yul: for { init } cond { post } { body }
   */
  private transformForStatement(node: ForStatement): YulStatement {
    // Initialize
    const pre: YulStatement[] = [];
    const initializer = node.getInitializer();
    if (initializer) {
      if (Node.isVariableDeclarationList(initializer)) {
        for (const decl of initializer.getDeclarations()) {
          const name = decl.getName();
          const init = decl.getInitializer();
          if (init) {
            pre.push({
              type: "variableDeclaration",
              names: [name],
              value: this.transformExpression(init),
            });
          } else {
            pre.push({
              type: "variableDeclaration",
              names: [name],
            });
          }
        }
      } else {
        // Expression initializer
        pre.push({
          type: "expression",
          expr: this.transformExpression(initializer),
        });
      }
    }

    // Condition
    const condNode = node.getCondition();
    const cond: YulExpression = condNode
      ? this.transformExpression(condNode)
      : { type: "literal", value: 1n }; // No condition = always true

    // Post/increment
    const post: YulStatement[] = [];
    const incrementor = node.getIncrementor();
    if (incrementor) {
      // Handle i++ and ++i specially - need to assign back
      if (Node.isPostfixUnaryExpression(incrementor) || Node.isPrefixUnaryExpression(incrementor)) {
        const unaryNode = incrementor as import("ts-morph").PostfixUnaryExpression | import("ts-morph").PrefixUnaryExpression;
        const operand = unaryNode.getOperand();
        const operator = unaryNode.getOperatorToken();

        if (Node.isIdentifier(operand)) {
          const varName = operand.getText();
          if (operator === SyntaxKind.PlusPlusToken) {
            post.push({
              type: "assignment",
              names: [varName],
              value: {
                type: "functionCall",
                name: "add",
                args: [{ type: "identifier", name: varName }, { type: "literal", value: 1n }],
              },
            });
          } else if (operator === SyntaxKind.MinusMinusToken) {
            post.push({
              type: "assignment",
              names: [varName],
              value: {
                type: "functionCall",
                name: "sub",
                args: [{ type: "identifier", name: varName }, { type: "literal", value: 1n }],
              },
            });
          }
        }
      } else if (Node.isBinaryExpression(incrementor)) {
        // Handle assignment expression like i = i + 1n
        const opToken = incrementor.getOperatorToken().getText();
        if (opToken === "=") {
          const leftExpr = incrementor.getLeft();
          if (Node.isIdentifier(leftExpr)) {
            const varName = leftExpr.getText();
            post.push({
              type: "assignment",
              names: [varName],
              value: this.transformExpression(incrementor.getRight()),
            });
          } else {
            // Handle property access or other left-hand sides
            post.push({
              type: "expression",
              expr: this.transformExpression(incrementor),
            });
          }
        } else if (opToken === "+=" || opToken === "-=" || opToken === "*=" || opToken === "/=") {
          // Handle compound assignment operators like i += 1
          const leftExpr = incrementor.getLeft();
          if (Node.isIdentifier(leftExpr)) {
            const varName = leftExpr.getText();
            const baseOp = opToken[0] as "+" | "-" | "*" | "/"; // '+', '-', '*', '/'
            const opMap: Record<"+" | "-" | "*" | "/", string> = { "+": "add", "-": "sub", "*": "mul", "/": "div" };
            const yulOp = opMap[baseOp];
            post.push({
              type: "assignment",
              names: [varName],
              value: {
                type: "functionCall",
                name: yulOp,
                args: [
                  { type: "identifier", name: varName },
                  this.transformExpression(incrementor.getRight()),
                ],
              },
            });
          } else {
            // Fallback
            post.push({
              type: "expression",
              expr: this.transformExpression(incrementor),
            });
          }
        } else {
          // Generic binary expression
          post.push({
            type: "expression",
            expr: this.transformExpression(incrementor),
          });
        }
      } else {
        // Generic expression incrementor
        post.push({
          type: "expression",
          expr: this.transformExpression(incrementor),
        });
      }
    }

    // Body
    const bodyNode = node.getStatement();
    let body: YulStatement[] = [];
    if (Node.isBlock(bodyNode)) {
      body = this.transformBlock(bodyNode);
    } else {
      const stmt = this.transformStatement(bodyNode);
      if (stmt) {
        body = Array.isArray(stmt) ? stmt : [stmt];
      }
    }

    return {
      type: "for",
      pre,
      cond,
      post,
      body,
    };
  }

  /**
   * Transform variable declaration: let x = value | const x = value
   */
  private transformVariableStatement(node: VariableStatement): YulStatement | YulStatement[] {
    const declarations = node.getDeclarationList().getDeclarations();
    const results: YulStatement[] = [];

    for (const decl of declarations) {
      const name = decl.getName();
      const initializer = decl.getInitializer();

      if (initializer) {
        // Check if initializer is a memory array allocation: new Array(size)
        if (Node.isNewExpression(initializer)) {
          const expr = initializer.getExpression();
          if (Node.isIdentifier(expr) && expr.getText() === "Array") {
            this.memoryArrays.add(name);
          }
        }

        const valueExpr = this.transformExpression(initializer);
        results.push({
          type: "variableDeclaration",
          names: [name],
          value: valueExpr,
        });
      } else {
        // Variable without initializer: let x (defaults to 0 in Yul)
        results.push({
          type: "variableDeclaration",
          names: [name],
        });
      }
    }

    return results.length === 1 ? results[0]! : results;
  }

  /**
   * Transform if/else statement
   * Since Yul doesn't have else, we use a condition variable pattern:
   * let _cond := condition
   * if _cond { then }
   * if iszero(_cond) { else }
   */
  private transformIfStatement(node: IfStatement): YulStatement | YulStatement[] {
    const condition = this.transformExpression(node.getExpression());
    const thenStmt = node.getThenStatement();
    const elseStmt = node.getElseStatement();

    // Transform then body
    let thenBody: YulStatement[] = [];
    if (Node.isBlock(thenStmt)) {
      thenBody = this.transformBlock(thenStmt);
    } else {
      const stmt = this.transformStatement(thenStmt);
      if (stmt) {
        thenBody = Array.isArray(stmt) ? stmt : [stmt];
      }
    }

    // No else branch - simple case
    if (!elseStmt) {
      return {
        type: "if",
        condition,
        body: thenBody,
      };
    }

    // Has else branch - use condition variable pattern
    const condVar = `_cond_${this.condCounter++}`;
    const statements: YulStatement[] = [];

    // 1. let _cond_N := condition
    statements.push({
      type: "variableDeclaration",
      names: [condVar],
      value: condition,
    });

    // 2. if _cond_N { then }
    statements.push({
      type: "if",
      condition: { type: "identifier", name: condVar },
      body: thenBody,
    });

    // 3. Transform else body
    let elseBody: YulStatement[];
    if (Node.isBlock(elseStmt)) {
      elseBody = this.transformBlock(elseStmt);
    } else if (Node.isIfStatement(elseStmt)) {
      // else if chain - recursive handling
      const nestedIf = this.transformIfStatement(elseStmt);
      elseBody = Array.isArray(nestedIf) ? nestedIf : [nestedIf];
    } else {
      const stmt = this.transformStatement(elseStmt);
      elseBody = stmt ? (Array.isArray(stmt) ? stmt : [stmt]) : [];
    }

    // 4. if iszero(_cond_N) { else }
    statements.push({
      type: "if",
      condition: {
        type: "functionCall",
        name: "iszero",
        args: [{ type: "identifier", name: condVar }],
      },
      body: elseBody,
    });

    return statements;
  }

  private transformExpressionStatement(node: ExpressionStatement): YulStatement | YulStatement[] | null {
    const expr = node.getExpression();

    // Handle unchecked(() => { ... }) blocks
    if (Node.isCallExpression(expr)) {
      const callee = expr.getExpression();
      if (Node.isIdentifier(callee) && callee.getText() === "unchecked") {
        const args = expr.getArguments();
        if (args.length === 1 && Node.isArrowFunction(args[0])) {
          const body = args[0].getBody();
          if (Node.isBlock(body)) {
            // Transform the block statements directly
            // ts-to-yul doesn't add overflow checks, so unchecked is a no-op
            const statements = this.transformBlock(body);
            return statements.length === 1 && statements[0] ? statements[0] : { type: "block", statements };
          } else {
            // Expression body
            return { type: "expression", expr: this.transformExpression(body) };
          }
        }
      }
    }

    // Handle asm tagged template: asm`code`
    if (Node.isTaggedTemplateExpression(expr)) {
      const tag = expr.getTag();
      if (Node.isIdentifier(tag) && tag.getText() === "asm") {
        return this.transformAsmTemplate(expr);
      }
    }

    // Handle delete expression: delete this.value or delete this.mapping[key]
    if (Node.isDeleteExpression(expr)) {
      return this.transformDeleteExpression(expr);
    }

    // Handle assignment: this.field = value or this.mapping[key] = value or x = value
    if (Node.isBinaryExpression(expr)) {
      const binary = expr;
      const operator = binary.getOperatorToken().getText();

      if (operator === "=") {
        const left = binary.getLeft();
        const right = binary.getRight();
        const valueExpr = this.transformExpression(right);

        // Check if left is arr[i] (element access)
        if (Node.isElementAccessExpression(left)) {
          const arrExpr = left.getExpression();
          // Check if this is a memory array
          if (Node.isIdentifier(arrExpr) && this.memoryArrays.has(arrExpr.getText())) {
            const name = arrExpr.getText();
            const argNode = left.getArgumentExpression();
            if (!argNode) {
              throw new Error("Element access requires an argument");
            }
            const indexExpr = this.transformExpression(argNode);
            // mstore(add(ptr, mul(add(index, 1), 32)), value)
            return {
              type: "expression",
              expr: {
                type: "functionCall",
                name: "mstore",
                args: [
                  {
                    type: "functionCall",
                    name: "add",
                    args: [
                      { type: "identifier", name },
                      {
                        type: "functionCall",
                        name: "mul",
                        args: [
                          {
                            type: "functionCall",
                            name: "add",
                            args: [indexExpr, { type: "literal", value: 1n }],
                          },
                          { type: "literal", value: 32n },
                        ],
                      },
                    ],
                  },
                  valueExpr,
                ],
              },
            };
          }

          // Check if this is dynamic bytes/string storage access: this.data[i] = value
          if (Node.isPropertyAccessExpression(arrExpr)) {
            const obj = arrExpr.getExpression();
            const propName = arrExpr.getName();
            if (Node.isThisExpression(obj)) {
              const storageInfo = this.storage.get(propName);
              if (storageInfo && (storageInfo.isDynamicBytes || storageInfo.isDynamicString)) {
                const argNode = left.getArgumentExpression();
                if (!argNode) {
                  throw new Error("Element access requires an argument");
                }
                const indexExpr = this.transformExpression(argNode);
                // __bytes_store(slot, index, value)
                return {
                  type: "expression",
                  expr: {
                    type: "functionCall",
                    name: "__bytes_store",
                    args: [
                      { type: "literal", value: storageInfo.slot },
                      indexExpr,
                      valueExpr,
                    ],
                  },
                };
              }
            }
          }

          // Storage access
          const slotExpr = this.computeMappingSlot(left);
          const storageInfo = this.getRootStorageInfo(left);
          return {
            type: "expression",
            expr: {
              type: "functionCall",
              name: this.getStoreOp(storageInfo),
              args: [slotExpr, valueExpr],
            },
          };
        }

        // Check if left is this.field (property access)
        if (Node.isPropertyAccessExpression(left)) {
          const obj = left.getExpression();
          const fieldName = left.getName();

          // Direct storage field: this.field = value
          if (Node.isThisExpression(obj)) {
            const storageInfo = this.storage.get(fieldName);

            if (storageInfo) {
              const slotExpr: YulExpression = { type: "literal", value: storageInfo.slot };
              const loadOp = this.getLoadOp(storageInfo);
              const storeOp = this.getStoreOp(storageInfo);

              // Handle packed storage variables
              if (storageInfo.byteOffset !== undefined && storageInfo.byteSize !== undefined) {
                const bitOffset = storageInfo.byteOffset * 8;
                const mask = (1n << BigInt(storageInfo.byteSize * 8)) - 1n;

                // For packed storage:
                // sstore(slot, or(and(sload(slot), not(shl(offset, mask))), shl(offset, and(value, mask))))
                const sloadExpr: YulExpression = { type: "functionCall", name: loadOp, args: [slotExpr] };

                // Mask the value to ensure it fits
                const maskedValue: YulExpression = {
                  type: "functionCall",
                  name: "and",
                  args: [valueExpr, { type: "literal", value: mask }],
                };

                // Shift the value to the correct position
                const shiftedValue: YulExpression = bitOffset === 0
                  ? maskedValue
                  : {
                      type: "functionCall",
                      name: "shl",
                      args: [{ type: "literal", value: BigInt(bitOffset) }, maskedValue],
                    };

                // Clear the bits in the slot
                const shiftedMask: YulExpression = bitOffset === 0
                  ? { type: "literal", value: mask }
                  : {
                      type: "functionCall",
                      name: "shl",
                      args: [{ type: "literal", value: BigInt(bitOffset) }, { type: "literal", value: mask }],
                    };
                const clearedSlot: YulExpression = {
                  type: "functionCall",
                  name: "and",
                  args: [
                    sloadExpr,
                    { type: "functionCall", name: "not", args: [shiftedMask] },
                  ],
                };

                // Combine cleared slot with new value
                const newSlotValue: YulExpression = {
                  type: "functionCall",
                  name: "or",
                  args: [clearedSlot, shiftedValue],
                };

                return {
                  type: "expression",
                  expr: {
                    type: "functionCall",
                    name: storeOp,
                    args: [slotExpr, newSlotValue],
                  },
                };
              }

              // Full slot access
              return {
                type: "expression",
                expr: {
                  type: "functionCall",
                  name: storeOp,
                  args: [slotExpr, valueExpr],
                },
              };
            }

            // Immutable variable assignment (only valid in constructor)
            const immutableInfo = this.immutables.get(fieldName);
            if (immutableInfo) {
              return {
                type: "expression",
                expr: {
                  type: "functionCall",
                  name: "sstore",
                  args: [{ type: "literal", value: immutableInfo.slot }, valueExpr],
                },
              };
            }
          }

          // Struct field access: this.structVar.fieldName = value
          // Also handles nested structs: this.outer.inner.field = value
          if (Node.isPropertyAccessExpression(obj)) {
            const nestedSlot = this.tryResolveNestedStructSlotForAssignment(left);
            if (nestedSlot !== null) {
              return {
                type: "expression",
                expr: {
                  type: "functionCall",
                  name: "sstore",
                  args: [{ type: "literal", value: nestedSlot }, valueExpr],
                },
              };
            }

            // Fallback to simple case: this.structVar.fieldName
            const innerObj = obj.getExpression();
            const innerProp = obj.getName();

            if (Node.isThisExpression(innerObj)) {
              const storageInfo = this.storage.get(innerProp);
              if (storageInfo && storageInfo.isStruct && storageInfo.structInfo) {
                const fieldInfo = storageInfo.structInfo.fields.get(fieldName);
                if (fieldInfo) {
                  const slotExpr: YulExpression =
                    fieldInfo.offset === 0n
                      ? { type: "literal", value: storageInfo.slot }
                      : {
                          type: "functionCall",
                          name: "add",
                          args: [
                            { type: "literal", value: storageInfo.slot },
                            { type: "literal", value: fieldInfo.offset },
                          ],
                        };
                  return {
                    type: "expression",
                    expr: {
                      type: "functionCall",
                      name: this.getStoreOp(storageInfo),
                      args: [slotExpr, valueExpr],
                    },
                  };
                }
              }
            }
          }

          // Mapping to struct field: this.mapping[key].fieldName = value
          if (Node.isElementAccessExpression(obj)) {
            const mappingExpr = obj.getExpression();
            const keyExpr = obj.getArgumentExpression();

            if (Node.isPropertyAccessExpression(mappingExpr) && keyExpr) {
              const mappingObj = mappingExpr.getExpression();
              const mappingName = mappingExpr.getName();

              if (Node.isThisExpression(mappingObj)) {
                const storageInfo = this.storage.get(mappingName);
                if (storageInfo && storageInfo.isMapping && storageInfo.mappingValueStruct) {
                  const fieldInfo = storageInfo.mappingValueStruct.fields.get(fieldName);
                  if (fieldInfo) {
                    const keyYul = this.transformExpression(keyExpr);
                    const baseSlot = this.generateMappingSlotHash(
                      keyYul,
                      { type: "literal", value: storageInfo.slot }
                    );

                    const slotExpr: YulExpression =
                      fieldInfo.offset === 0n
                        ? baseSlot
                        : {
                            type: "functionCall",
                            name: "add",
                            args: [baseSlot, { type: "literal", value: fieldInfo.offset }],
                          };

                    return {
                      type: "expression",
                      expr: {
                        type: "functionCall",
                        name: this.getStoreOp(storageInfo),
                        args: [slotExpr, valueExpr],
                      },
                    };
                  }
                }
              }
            }
          }
        }

        // Check if left is a local variable (identifier)
        if (Node.isIdentifier(left)) {
          const varName = left.getText();
          return {
            type: "assignment",
            names: [varName],
            value: valueExpr,
          };
        }
      }

      // Handle compound assignment operators: +=, -=, *=, /=, %=, &=, |=, ^=, <<=, >>=
      const compoundOps: Record<string, string> = {
        "+=": "add",
        "-=": "sub",
        "*=": "mul",
        "/=": "div",
        "%=": "mod",
        "&=": "and",
        "|=": "or",
        "^=": "xor",
      };

      if (operator in compoundOps || operator === "<<=" || operator === ">>=") {
        const left = binary.getLeft();
        const right = binary.getRight();
        const rightExpr = this.transformExpression(right);

        let opExpr: YulExpression;

        if (operator === "<<=") {
          // x <<= n -> x = shl(n, x)
          opExpr = {
            type: "functionCall",
            name: "shl",
            args: [rightExpr, this.transformExpression(left)],
          };
        } else if (operator === ">>=") {
          // x >>= n -> x = shr(n, x)
          opExpr = {
            type: "functionCall",
            name: "shr",
            args: [rightExpr, this.transformExpression(left)],
          };
        } else {
          // x op= y -> x = op(x, y)
          opExpr = {
            type: "functionCall",
            name: compoundOps[operator]!,
            args: [this.transformExpression(left), rightExpr],
          };
        }

        // Handle different left-hand side types
        if (Node.isElementAccessExpression(left)) {
          const arrExpr = left.getExpression();
          // Check if this is a memory array
          if (Node.isIdentifier(arrExpr) && this.memoryArrays.has(arrExpr.getText())) {
            const name = arrExpr.getText();
            const argNode = left.getArgumentExpression();
            if (!argNode) {
              throw new Error("Element access requires an argument");
            }
            const indexExpr = this.transformExpression(argNode);
            // mstore(add(ptr, mul(add(index, 1), 32)), value)
            return {
              type: "expression",
              expr: {
                type: "functionCall",
                name: "mstore",
                args: [
                  {
                    type: "functionCall",
                    name: "add",
                    args: [
                      { type: "identifier", name },
                      {
                        type: "functionCall",
                        name: "mul",
                        args: [
                          {
                            type: "functionCall",
                            name: "add",
                            args: [indexExpr, { type: "literal", value: 1n }],
                          },
                          { type: "literal", value: 32n },
                        ],
                      },
                    ],
                  },
                  opExpr,
                ],
              },
            };
          }
          // Storage access
          const slotExpr = this.computeMappingSlot(left);
          const rootStorageInfo = this.getRootStorageInfo(left);
          return {
            type: "expression",
            expr: {
              type: "functionCall",
              name: this.getStoreOp(rootStorageInfo),
              args: [slotExpr, opExpr],
            },
          };
        }

        if (Node.isPropertyAccessExpression(left)) {
          const obj = left.getExpression();
          if (Node.isThisExpression(obj)) {
            const fieldName = left.getName();
            const storageInfo = this.storage.get(fieldName);
            if (storageInfo) {
              return {
                type: "expression",
                expr: {
                  type: "functionCall",
                  name: this.getStoreOp(storageInfo),
                  args: [{ type: "literal", value: storageInfo.slot }, opExpr],
                },
              };
            }
          }
        }

        if (Node.isIdentifier(left)) {
          const varName = left.getText();
          return {
            type: "assignment",
            names: [varName],
            value: opExpr,
          };
        }
      }
    }

    // Handle function calls like revert()
    if (Node.isCallExpression(expr)) {
      return this.transformCallStatement(expr);
    }

    // Generic expression
    return {
      type: "expression",
      expr: this.transformExpression(expr),
    };
  }

  /**
   * Transform delete expression: delete this.value or delete this.mapping[key]
   * In Solidity/Yul, delete sets storage to 0.
   */
  private transformDeleteExpression(node: DeleteExpression): YulStatement {
    const operand = node.getExpression();

    // delete this.mapping[key] or delete this.array[index]
    if (Node.isElementAccessExpression(operand)) {
      const slotExpr = this.computeMappingSlot(operand);
      const storageInfo = this.getRootStorageInfo(operand);
      return {
        type: "expression",
        expr: {
          type: "functionCall",
          name: this.getStoreOp(storageInfo),
          args: [slotExpr, { type: "literal", value: 0n }],
        },
      };
    }

    // delete this.field
    if (Node.isPropertyAccessExpression(operand)) {
      const obj = operand.getExpression();
      const fieldName = operand.getName();

      if (Node.isThisExpression(obj)) {
        const storageInfo = this.storage.get(fieldName);
        if (storageInfo) {
          const storeOp = this.getStoreOp(storageInfo);
          // For structs, delete all fields (set each slot to 0)
          if (storageInfo.isStruct && storageInfo.structInfo) {
            const statements: YulStatement[] = [];
            for (let i = 0n; i < storageInfo.structInfo.size; i++) {
              statements.push({
                type: "expression",
                expr: {
                  type: "functionCall",
                  name: storeOp,
                  args: [
                    { type: "literal", value: storageInfo.slot + i },
                    { type: "literal", value: 0n },
                  ],
                },
              });
            }
            // Return block with all sstore statements
            return { type: "block", statements };
          }

          // For fixed arrays, delete all elements
          if (storageInfo.isFixedArray && storageInfo.fixedArraySize) {
            const statements: YulStatement[] = [];
            for (let i = 0n; i < storageInfo.fixedArraySize; i++) {
              statements.push({
                type: "expression",
                expr: {
                  type: "functionCall",
                  name: storeOp,
                  args: [
                    { type: "literal", value: storageInfo.slot + i },
                    { type: "literal", value: 0n },
                  ],
                },
              });
            }
            return { type: "block", statements };
          }

          // Simple storage variable
          return {
            type: "expression",
            expr: {
              type: "functionCall",
              name: storeOp,
              args: [{ type: "literal", value: storageInfo.slot }, { type: "literal", value: 0n }],
            },
          };
        }
      }

      // delete this.structVar.field
      if (Node.isPropertyAccessExpression(obj)) {
        const innerObj = obj.getExpression();
        const innerProp = obj.getName();

        if (Node.isThisExpression(innerObj)) {
          const storageInfo = this.storage.get(innerProp);
          if (storageInfo && storageInfo.isStruct && storageInfo.structInfo) {
            const fieldInfo = storageInfo.structInfo.fields.get(fieldName);
            if (fieldInfo) {
              return {
                type: "expression",
                expr: {
                  type: "functionCall",
                  name: this.getStoreOp(storageInfo),
                  args: [
                    { type: "literal", value: storageInfo.slot + fieldInfo.offset },
                    { type: "literal", value: 0n },
                  ],
                },
              };
            }
          }
        }
      }
    }

    throw new Error(`Unsupported delete expression: ${node.getText()}`);
  }

  private transformCallStatement(node: CallExpression): YulStatement | YulStatement[] | null {
    const callee = node.getExpression();

    // Ignore super() constructor calls - TypeScript requirement, not needed in Yul
    if (callee.getKind() === SyntaxKind.SuperKeyword) {
      return null;
    }

    // In constructor, inline calls to inherited methods (Yul scoping limitation)
    // this._initializeOwnable(arg) -> inline the method body with arg substitution
    if (this.inConstructor && Node.isPropertyAccessExpression(callee)) {
      const obj = callee.getExpression();
      const methodName = callee.getName();
      if (Node.isThisExpression(obj)) {
        const method = this.inheritedMethods.get(methodName);
        if (method) {
          return this.inlineMethodCall(method, node.getArguments());
        }
      }
    }

    // revert("message") or revert() or revert(CustomError(args))
    if (Node.isIdentifier(callee) && callee.getText() === "revert") {
      const args = node.getArguments();
      if (args.length === 0) {
        // Simple revert without message
        return {
          type: "expression",
          expr: {
            type: "functionCall",
            name: "revert",
            args: [
              { type: "literal", value: 0n },
              { type: "literal", value: 0n },
            ],
          },
        };
      }

      // Check if argument is a custom error call: revert(CustomError(arg1, arg2))
      const firstArg = args[0]!;
      if (Node.isCallExpression(firstArg)) {
        const errorCallee = firstArg.getExpression();
        if (Node.isIdentifier(errorCallee)) {
          const errorName = errorCallee.getText();
          const errorInfo = this.customErrors.get(errorName);
          if (errorInfo) {
            return this.generateRevertWithCustomError(errorInfo, firstArg.getArguments());
          }
        }
      }

      // revert("message") - encode as Error(string)
      return this.generateRevertWithMessage(args[0]!);
    }

    // require(condition, "message") -> if iszero(condition) { revert(...) }
    if (Node.isIdentifier(callee) && callee.getText() === "require") {
      const args = node.getArguments();
      if (args.length === 0) {
        throw new Error("require() requires at least one argument");
      }
      const condition = this.transformExpression(args[0]!);

      let revertBody: YulStatement[];
      if (args.length >= 2) {
        // require(condition, "message")
        const revertStmts = this.generateRevertWithMessage(args[1]!);
        revertBody = Array.isArray(revertStmts) ? revertStmts : [revertStmts];
      } else {
        // require(condition) - simple revert
        revertBody = [
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
        ];
      }

      return {
        type: "if",
        condition: {
          type: "functionCall",
          name: "iszero",
          args: [condition],
        },
        body: revertBody,
      };
    }

    // assert(condition) -> if iszero(condition) { invalid() }
    if (Node.isIdentifier(callee) && callee.getText() === "assert") {
      const args = node.getArguments();
      if (args.length === 0) {
        throw new Error("assert() requires one argument");
      }
      const condition = this.transformExpression(args[0]!);
      return {
        type: "if",
        condition: {
          type: "functionCall",
          name: "iszero",
          args: [condition],
        },
        body: [
          {
            type: "expression",
            expr: {
              type: "functionCall",
              name: "invalid",
              args: [],
            },
          },
        ],
      };
    }

    // Handle this.arr.push(value) for dynamic arrays
    if (Node.isPropertyAccessExpression(callee)) {
      const methodName = callee.getName();
      const arrExpr = callee.getExpression();

      // this.arr.push(value) or this.arr.pop()
      if (Node.isPropertyAccessExpression(arrExpr)) {
        const thisExpr = arrExpr.getExpression();
        const arrName = arrExpr.getName();

        if (Node.isThisExpression(thisExpr)) {
          const storageInfo = this.storage.get(arrName);

          if (storageInfo && storageInfo.isArray) {
            if (methodName === "push") {
              // this.arr.push(value):
              // 1. let len := sload(slot)
              // 2. let dataSlot := add(keccak256(slot), len)
              // 3. sstore(dataSlot, value)
              // 4. sstore(slot, add(len, 1))
              return this.generateArrayPush(storageInfo.slot, node.getArguments());
            }

            if (methodName === "pop") {
              // this.arr.pop():
              // 1. let len := sload(slot)
              // 2. let newLen := sub(len, 1)
              // 3. sstore(slot, newLen)
              // 4. optionally clear: sstore(add(keccak256(slot), newLen), 0)
              return this.generateArrayPop(storageInfo.slot);
            }
          }

          // Handle StorageBytes push/pop
          if (storageInfo && storageInfo.isDynamicBytes) {
            if (methodName === "push") {
              // this.data.push(value) -> __bytes_push(slot, value)
              const args = node.getArguments();
              if (args.length !== 1) {
                throw new Error("StorageBytes.push() requires exactly one argument");
              }
              return {
                type: "expression",
                expr: {
                  type: "functionCall",
                  name: "__bytes_push",
                  args: [
                    { type: "literal", value: storageInfo.slot },
                    this.transformExpression(args[0]!),
                  ],
                },
              };
            }

            if (methodName === "pop") {
              // this.data.pop() -> __bytes_pop(slot)
              return {
                type: "expression",
                expr: {
                  type: "functionCall",
                  name: "__bytes_pop",
                  args: [{ type: "literal", value: storageInfo.slot }],
                },
              };
            }
          }
        }
      }
    }

    // Handle this.EventName.emit({...})
    if (Node.isPropertyAccessExpression(callee)) {
      const methodName = callee.getName();
      if (methodName === "emit") {
        const eventAccess = callee.getExpression();
        if (Node.isPropertyAccessExpression(eventAccess)) {
          const eventObj = eventAccess.getExpression();
          const eventName = eventAccess.getName();

          if (Node.isThisExpression(eventObj)) {
            const eventInfo = this.events.get(eventName);
            if (eventInfo) {
              return this.generateEventEmit(eventInfo, node);
            }
          }
        }
      }
    }

    // Generic call
    return {
      type: "expression",
      expr: this.transformExpression(node),
    };
  }

  /**
   * Inline a method call in the constructor.
   * Creates local variables for parameters and transforms the method body.
   * This is used to work around Yul's scoping limitation where functions
   * in _deployed object can't be called from the code block.
   */
  private inlineMethodCall(method: MethodDeclaration, callArgs: Node[]): YulStatement[] {
    const statements: YulStatement[] = [];
    const params = method.getParameters().filter((p) => p.getName() !== "this");

    // Create local variable for each parameter
    for (let i = 0; i < params.length; i++) {
      const paramName = params[i]!.getName();
      const argExpr = callArgs[i];
      if (argExpr) {
        statements.push({
          type: "variableDeclaration",
          names: [`_inline_${paramName}`],
          value: this.transformExpression(argExpr),
        });
      }
    }

    // Transform the method body with parameter substitution
    const body = method.getBody();
    if (body && Node.isBlock(body)) {
      // Save current state
      const savedParamMap = new Map(this.inlineParamMap);

      // Set up parameter mapping for inline transformation
      this.inlineParamMap = new Map();
      for (const param of params) {
        this.inlineParamMap.set(param.getName(), `_inline_${param.getName()}`);
      }

      // Transform the body
      const bodyStatements = this.transformBlock(body);
      statements.push(...bodyStatements);

      // Restore state
      this.inlineParamMap = savedParamMap;
    }

    return statements;
  }

  // Map for parameter substitution during method inlining
  private inlineParamMap: Map<string, string> = new Map();

  /**
   * Generate LOG instruction for event emit
   * this.Transfer.emit({from, to, value}) -> log3(dataOffset, dataSize, topic0, topic1, topic2)
   */
  private generateEventEmit(eventInfo: EventInfo, node: CallExpression): YulStatement[] {
    const args = node.getArguments();
    if (args.length === 0) {
      throw new Error(`Event ${eventInfo.name}.emit() requires an argument object`);
    }

    const argObj = args[0];
    if (!argObj || !Node.isObjectLiteralExpression(argObj)) {
      throw new Error(`Event ${eventInfo.name}.emit() argument must be an object literal`);
    }

    // Parse the object literal to get field values
    const fieldValues = new Map<string, YulExpression>();
    for (const prop of argObj.getProperties()) {
      if (Node.isPropertyAssignment(prop)) {
        const propName = prop.getName();
        const initializer = prop.getInitializer();
        if (initializer) {
          fieldValues.set(propName, this.transformExpression(initializer));
        }
      } else if (Node.isShorthandPropertyAssignment(prop)) {
        // { from } -> { from: from }
        const propName = prop.getName();
        fieldValues.set(propName, { type: "identifier", name: propName });
      }
    }

    const statements: YulStatement[] = [];

    // Separate indexed and non-indexed fields
    const indexedFields = eventInfo.fields.filter((f) => f.indexed);
    const nonIndexedFields = eventInfo.fields.filter((f) => !f.indexed);

    // Build topics array
    const topics: YulExpression[] = [];

    // Topic 0 is the event signature (unless anonymous)
    if (!eventInfo.anonymous) {
      topics.push({ type: "literal", value: BigInt(eventInfo.signature) });
    }

    // Add indexed fields as topics
    // For non-anonymous: max 3 indexed = topics 1-3
    // For anonymous: max 4 indexed = topics 0-3
    for (const field of indexedFields) {
      const value = fieldValues.get(field.name);
      if (value) {
        topics.push(value);
      } else {
        topics.push({ type: "literal", value: 0n });
      }
    }

    // Store non-indexed data in memory
    let dataSize = 0n;
    const dataOffset = 0n; // Use memory starting at 0

    for (let i = 0; i < nonIndexedFields.length; i++) {
      const field = nonIndexedFields[i]!;
      const value = fieldValues.get(field.name);
      const offset = BigInt(i * 32);

      statements.push({
        type: "expression",
        expr: {
          type: "functionCall",
          name: "mstore",
          args: [
            { type: "literal", value: offset },
            value ?? { type: "literal", value: 0n },
          ],
        },
      });
      dataSize = offset + 32n;
    }

    // Generate LOG instruction based on number of topics
    // LOG0-LOG4 based on topic count
    const logName = `log${topics.length}`;

    statements.push({
      type: "expression",
      expr: {
        type: "functionCall",
        name: logName,
        args: [
          { type: "literal", value: dataOffset },
          { type: "literal", value: dataSize },
          ...topics,
        ],
      },
    });

    return statements;
  }

  private transformReturnStatement(node: ReturnStatement): YulStatement | YulStatement[] {
    const expr = node.getExpression();

    if (expr) {
      // Handle tuple returns with array literal: return [a, b, c]
      if (Node.isArrayLiteralExpression(expr) && this.currentMethodReturns.length > 1) {
        const elements = expr.getElements();
        const statements: YulStatement[] = [];

        for (let i = 0; i < elements.length && i < this.currentMethodReturns.length; i++) {
          const element = elements[i]!;
          const valueExpr = this.transformExpression(element);
          statements.push({
            type: "assignment",
            names: [this.currentMethodReturns[i]!],
            value: valueExpr,
          });
        }

        // Add leave to exit the function after assignment
        statements.push({ type: "leave" });
        return statements;
      }

      // Single return value - assign and leave
      const valueExpr = this.transformExpression(expr);
      return [
        {
          type: "assignment",
          names: this.currentMethodReturns.length > 0 ? [this.currentMethodReturns[0]!] : ["_out"],
          value: valueExpr,
        },
        { type: "leave" },
      ];
    }

    return { type: "leave" };
  }

  private transformExpression(node: Node): YulExpression {
    // this.field -> sload(slot)
    if (Node.isPropertyAccessExpression(node)) {
      return this.transformPropertyAccess(node);
    }

    // Element access: this.mapping[key] -> sload(keccak256(key . slot))
    if (Node.isElementAccessExpression(node)) {
      return this.transformElementAccess(node);
    }

    // Binary expression: a + b, a - b, etc.
    if (Node.isBinaryExpression(node)) {
      return this.transformBinaryExpression(node);
    }

    // BigInt literal: 1n, 100n
    if (Node.isBigIntLiteral(node)) {
      const text = node.getLiteralText();
      // Remove 'n' suffix
      const value = BigInt(text.replace(/n$/, ""));
      return { type: "literal", value };
    }

    // Numeric literal: 1, 100
    if (Node.isNumericLiteral(node)) {
      const value = BigInt(node.getLiteralValue());
      return { type: "literal", value };
    }

    // Boolean literals: true, false
    if (node.getKind() === SyntaxKind.TrueKeyword) {
      return { type: "literal", value: 1n };
    }
    if (node.getKind() === SyntaxKind.FalseKeyword) {
      return { type: "literal", value: 0n };
    }

    // Identifier (parameter reference or constant)
    if (Node.isIdentifier(node)) {
      let name = node.getText();

      // Check if this is a parameter being inlined (constructor method inlining)
      const inlinedName = this.inlineParamMap.get(name);
      if (inlinedName) {
        name = inlinedName;
      }

      // Handle known constants and units
      const constants: Record<string, bigint> = {
        // Special values
        MAX_U256: 2n ** 256n - 1n,
        ADDRESS_ZERO: 0n,
        // Ether units
        wei: 1n,
        gwei: 1_000_000_000n,
        ether: 1_000_000_000_000_000_000n,
        // Time units
        seconds: 1n,
        minutes: 60n,
        hours: 3600n,
        days: 86400n,
        weeks: 604800n,
      };

      if (name in constants) {
        return { type: "literal", value: constants[name]! };
      }

      return { type: "identifier", name };
    }

    // Parenthesized expression
    if (Node.isParenthesizedExpression(node)) {
      return this.transformExpression(node.getExpression());
    }

    // Call expression
    if (Node.isCallExpression(node)) {
      return this.transformCallExpression(node);
    }

    // Prefix unary: ++i, --i, !x
    if (Node.isPrefixUnaryExpression(node)) {
      return this.transformPrefixUnary(node);
    }

    // Postfix unary: i++, i--
    if (Node.isPostfixUnaryExpression(node)) {
      return this.transformPostfixUnary(node);
    }

    // Conditional expression: cond ? a : b (ternary operator)
    if (Node.isConditionalExpression(node)) {
      return this.transformConditionalExpression(node);
    }

    // New expression: new ContractName(args)
    if (Node.isNewExpression(node)) {
      return this.transformNewExpression(node);
    }

    // Fallback: unsupported expression
    throw new Error(`Unsupported expression: ${node.getKindName()}`);
  }

  /**
   * Transform element access expression: this.mapping[key] or arr[i]
   * - For storage mappings/arrays: sload(computed_slot)
   * - For memory arrays: mload(add(ptr, mul(add(index, 1), 32)))
   */
  private transformElementAccess(node: ElementAccessExpression): YulExpression {
    const expr = node.getExpression();

    // Check if this is a memory array access: arr[i]
    if (Node.isIdentifier(expr)) {
      const name = expr.getText();
      if (this.memoryArrays.has(name)) {
        const argNode = node.getArgumentExpression();
        if (!argNode) {
          throw new Error("Element access requires an argument");
        }
        const indexExpr = this.transformExpression(argNode);
        // mload(add(ptr, mul(add(index, 1), 32)))
        // Offset by 1 to skip length slot, then multiply by 32
        return {
          type: "functionCall",
          name: "mload",
          args: [
            {
              type: "functionCall",
              name: "add",
              args: [
                { type: "identifier", name },
                {
                  type: "functionCall",
                  name: "mul",
                  args: [
                    {
                      type: "functionCall",
                      name: "add",
                      args: [indexExpr, { type: "literal", value: 1n }],
                    },
                    { type: "literal", value: 32n },
                  ],
                },
              ],
            },
          ],
        };
      }

      // Check if this is a calldata array access: arr[i] -> calldataload(add(arr_offset, mul(i, 32)))
      const calldataInfo = this.calldataArrayParams.get(name);
      if (calldataInfo) {
        const argNode = node.getArgumentExpression();
        if (!argNode) {
          throw new Error("Element access requires an argument");
        }
        const indexExpr = this.transformExpression(argNode);
        // calldataload(add(arr_offset, mul(index, 32)))
        return {
          type: "functionCall",
          name: "calldataload",
          args: [
            {
              type: "functionCall",
              name: "add",
              args: [
                { type: "identifier", name: calldataInfo.offsetVar },
                {
                  type: "functionCall",
                  name: "mul",
                  args: [indexExpr, { type: "literal", value: 32n }],
                },
              ],
            },
          ],
        };
      }
    }

    // Check if this is a dynamic bytes/string access: this.data[i]
    if (Node.isPropertyAccessExpression(expr)) {
      const obj = expr.getExpression();
      const propName = expr.getName();
      if (Node.isThisExpression(obj)) {
        const storageInfo = this.storage.get(propName);
        if (storageInfo && (storageInfo.isDynamicBytes || storageInfo.isDynamicString)) {
          // Dynamic bytes access returns a single byte
          const argNode = node.getArgumentExpression();
          if (!argNode) {
            throw new Error("Element access requires an argument");
          }
          const indexExpr = this.transformExpression(argNode);
          return {
            type: "functionCall",
            name: "__bytes_load",
            args: [{ type: "literal", value: storageInfo.slot }, indexExpr],
          };
        }
      }
    }

    // Storage access: compute slot and use sload
    const slotExpr = this.computeMappingSlot(node);
    const storageInfo = this.getRootStorageInfo(node);

    // Load value from computed slot
    return {
      type: "functionCall",
      name: this.getLoadOp(storageInfo),
      args: [slotExpr],
    };
  }

  /**
   * Extract the root storage variable info from an element access expression.
   * For this.mapping[key] -> returns storageInfo for 'mapping'
   * For this.mapping[k1][k2] -> returns storageInfo for 'mapping'
   */
  private getRootStorageInfo(node: ElementAccessExpression): StorageInfo | undefined {
    const expr = node.getExpression();
    if (Node.isElementAccessExpression(expr)) {
      // Nested: recurse to find root
      return this.getRootStorageInfo(expr);
    }
    if (Node.isPropertyAccessExpression(expr)) {
      const obj = expr.getExpression();
      const propName = expr.getName();
      if (Node.isThisExpression(obj)) {
        return this.storage.get(propName);
      }
    }
    return undefined;
  }

  /**
   * Compute the storage slot for a mapping or array access
   * For this.mapping[key]: keccak256(key . slot)
   * For this.mapping[k1][k2]: keccak256(k2 . keccak256(k1 . slot))
   * For this.array[i]: keccak256(slot) + i
   */
  private computeMappingSlot(node: ElementAccessExpression): YulExpression {
    const expr = node.getExpression();
    const argNode = node.getArgumentExpression();

    if (!argNode) {
      throw new Error("Element access requires an argument");
    }

    const keyExpr = this.transformExpression(argNode);

    // Check if this is a nested mapping access: this.mapping[k1][k2]
    if (Node.isElementAccessExpression(expr)) {
      // Recursive: compute inner slot first
      const innerSlot = this.computeMappingSlot(expr);
      return this.generateMappingSlotHash(keyExpr, innerSlot);
    }

    // Base case: this.mapping[key] or this.array[index]
    if (Node.isPropertyAccessExpression(expr)) {
      const obj = expr.getExpression();
      const propName = expr.getName();

      if (Node.isThisExpression(obj)) {
        const storageInfo = this.storage.get(propName);
        if (storageInfo && storageInfo.isMapping) {
          const baseSlot: YulExpression = { type: "literal", value: storageInfo.slot };
          return this.generateMappingSlotHash(keyExpr, baseSlot);
        }
        if (storageInfo && storageInfo.isFixedArray && storageInfo.fixedArraySize) {
          // Fixed array: slot + index with bounds checking
          return this.generateFixedArraySlot(storageInfo.slot, keyExpr, storageInfo.fixedArraySize);
        }
        if (storageInfo && storageInfo.isArray) {
          // Dynamic array: keccak256(slot) + index
          return this.generateArraySlot(storageInfo.slot, keyExpr);
        }
        if (storageInfo && (storageInfo.isDynamicBytes || storageInfo.isDynamicString)) {
          // Dynamic bytes/string: byte at keccak256(slot) + index / 32
          // Return the byte access expression (handled specially in transformElementAccess)
          return this.generateDynamicBytesAccess(storageInfo.slot, keyExpr);
        }
      }
    }

    throw new Error(`Unsupported element access: ${node.getText()}`);
  }

  /**
   * Generate keccak256(key . slot) for mapping slot computation
   * In Yul: keccak256(ptr, 64) where memory[ptr] = key, memory[ptr+32] = slot
   */
  private generateMappingSlotHash(key: YulExpression, slot: YulExpression): YulExpression {
    // We need to:
    // 1. mstore(0, key)      - store key at memory position 0
    // 2. mstore(32, slot)    - store slot at memory position 32
    // 3. keccak256(0, 64)    - hash 64 bytes
    //
    // But since Yul expressions can't have side effects, we need to use
    // a helper function. For now, we'll inline the hash using a special pattern
    // that the code generator will recognize.
    //
    // Alternative: Use inline assembly pattern
    // For simplicity, we'll generate a call to a helper function
    return {
      type: "functionCall",
      name: "__mapping_slot",
      args: [key, slot],
    };
  }

  /**
   * Generate array element slot: keccak256(slot) + index
   * Array length is stored at slot, elements at keccak256(slot) + i
   */
  private generateArraySlot(slot: bigint, index: YulExpression): YulExpression {
    return {
      type: "functionCall",
      name: "__array_slot",
      args: [{ type: "literal", value: slot }, index],
    };
  }

  /**
   * Generate fixed array element slot: slot + index
   * Fixed arrays store elements at consecutive slots starting from base slot.
   * Includes bounds checking for runtime indices.
   */
  private generateFixedArraySlot(slot: bigint, index: YulExpression, size: bigint): YulExpression {
    // If index is a literal, check bounds at compile time
    if (index.type === "literal" && typeof index.value === "bigint") {
      if (index.value >= size) {
        throw new Error(`Array index out of bounds: ${index.value} >= ${size}`);
      }
      if (index.value === 0n) {
        return { type: "literal", value: slot };
      }
      return { type: "literal", value: slot + index.value };
    }

    // Runtime index: use helper with bounds checking
    return {
      type: "functionCall",
      name: "__fixed_array_slot",
      args: [
        { type: "literal", value: slot },
        index,
        { type: "literal", value: size },
      ],
    };
  }

  /**
   * Generate the __fixed_array_slot helper function with bounds checking
   */
  private generateFixedArraySlotHelper(): YulStatement {
    // function __fixed_array_slot(slot, index, size) -> result {
    //     if iszero(lt(index, size)) { revert(0, 0) }
    //     result := add(slot, index)
    // }
    return {
      type: "function",
      name: "__fixed_array_slot",
      params: ["slot", "index", "size"],
      returns: ["result"],
      body: [
        {
          type: "if",
          condition: {
            type: "functionCall",
            name: "iszero",
            args: [
              {
                type: "functionCall",
                name: "lt",
                args: [
                  { type: "identifier", name: "index" },
                  { type: "identifier", name: "size" },
                ],
              },
            ],
          },
          body: [
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
        {
          type: "assignment",
          names: ["result"],
          value: {
            type: "functionCall",
            name: "add",
            args: [
              { type: "identifier", name: "slot" },
              { type: "identifier", name: "index" },
            ],
          },
        },
      ],
    };
  }

  /**
   * Generate dynamic bytes/string element access
   * Used for calculating slot access in certain contexts
   */
  private generateDynamicBytesAccess(slot: bigint, index: YulExpression): YulExpression {
    return {
      type: "functionCall",
      name: "__bytes_load",
      args: [{ type: "literal", value: slot }, index],
    };
  }

  /**
   * Generate revert with Error(string) encoded message
   * ABI encoding:
   * - bytes 0-3: Error(string) selector (0x08c379a0)
   * - bytes 4-35: offset to string data (32)
   * - bytes 36-67: string length
   * - bytes 68+: string data (padded to 32 bytes)
   */
  private generateRevertWithMessage(messageArg: Node): YulStatement[] {
    // Extract string literal from the argument
    let message = "";
    if (Node.isStringLiteral(messageArg)) {
      message = messageArg.getLiteralText();
    } else {
      // For non-literal messages, fall back to simple revert
      return [
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
      ];
    }

    const statements: YulStatement[] = [];

    // Error(string) selector: keccak256("Error(string)")[0:4] = 0x08c379a0
    const errorSelector = 0x08c379a0n;
    const messageLength = BigInt(message.length);
    const paddedLength = ((messageLength + 31n) / 32n) * 32n;
    const totalLength = 4n + 32n + 32n + paddedLength;

    // mstore(0, shl(224, 0x08c379a0)) - store selector
    statements.push({
      type: "expression",
      expr: {
        type: "functionCall",
        name: "mstore",
        args: [
          { type: "literal", value: 0n },
          {
            type: "functionCall",
            name: "shl",
            args: [
              { type: "literal", value: 224n },
              { type: "literal", value: errorSelector },
            ],
          },
        ],
      },
    });

    // mstore(4, 32) - offset to string data
    statements.push({
      type: "expression",
      expr: {
        type: "functionCall",
        name: "mstore",
        args: [
          { type: "literal", value: 4n },
          { type: "literal", value: 32n },
        ],
      },
    });

    // mstore(36, length) - string length
    statements.push({
      type: "expression",
      expr: {
        type: "functionCall",
        name: "mstore",
        args: [
          { type: "literal", value: 36n },
          { type: "literal", value: messageLength },
        ],
      },
    });

    // Store string data in 32-byte chunks
    const encoder = new TextEncoder();
    const bytes = encoder.encode(message);
    const numChunks = Math.ceil(bytes.length / 32);

    for (let i = 0; i < numChunks; i++) {
      const chunk = bytes.slice(i * 32, (i + 1) * 32);
      // Pad to 32 bytes
      const padded = new Uint8Array(32);
      padded.set(chunk);

      // Convert to bigint (big-endian)
      let value = 0n;
      for (let j = 0; j < 32; j++) {
        value = (value << 8n) | BigInt(padded[j]!);
      }

      const offset = 68n + BigInt(i * 32);
      statements.push({
        type: "expression",
        expr: {
          type: "functionCall",
          name: "mstore",
          args: [
            { type: "literal", value: offset },
            { type: "literal", value: value },
          ],
        },
      });
    }

    // revert(0, totalLength)
    statements.push({
      type: "expression",
      expr: {
        type: "functionCall",
        name: "revert",
        args: [
          { type: "literal", value: 0n },
          { type: "literal", value: totalLength },
        ],
      },
    });

    return statements;
  }

  /**
   * Generate revert with custom error.
   * ABI encoding:
   * - bytes 0-3: error selector (first 4 bytes of keccak256(signature))
   * - bytes 4-35: first argument (32 bytes, ABI encoded)
   * - bytes 36-67: second argument (32 bytes)
   * - etc.
   */
  private generateRevertWithCustomError(errorInfo: CustomErrorInfo, args: Node[]): YulStatement[] {
    const statements: YulStatement[] = [];

    // Calculate total length: 4 bytes for selector + 32 bytes per argument
    const totalLength = 4n + BigInt(args.length * 32);

    // mstore(0, shl(224, selector)) - store selector in first 4 bytes
    statements.push({
      type: "expression",
      expr: {
        type: "functionCall",
        name: "mstore",
        args: [
          { type: "literal", value: 0n },
          {
            type: "functionCall",
            name: "shl",
            args: [
              { type: "literal", value: 224n },
              { type: "literal", value: errorInfo.selector },
            ],
          },
        ],
      },
    });

    // Store each argument at position 4 + i*32
    for (let i = 0; i < args.length; i++) {
      const arg = args[i]!;
      const argExpr = this.transformExpression(arg);
      const offset = 4n + BigInt(i * 32);

      statements.push({
        type: "expression",
        expr: {
          type: "functionCall",
          name: "mstore",
          args: [
            { type: "literal", value: offset },
            argExpr,
          ],
        },
      });
    }

    // revert(0, totalLength)
    statements.push({
      type: "expression",
      expr: {
        type: "functionCall",
        name: "revert",
        args: [
          { type: "literal", value: 0n },
          { type: "literal", value: totalLength },
        ],
      },
    });

    return statements;
  }

  /**
   * Try to resolve nested struct slot for assignment like: this.outer.inner.field = value
   * Returns the computed slot as a bigint, or null if not a nested struct access pattern.
   */
  private tryResolveNestedStructSlotForAssignment(node: PropertyAccessExpression): bigint | null {
    // Build the chain of property accesses from innermost to outermost
    const chain: string[] = [node.getName()];
    let current: Node = node.getExpression();

    while (Node.isPropertyAccessExpression(current)) {
      chain.unshift((current as PropertyAccessExpression).getName());
      current = (current as PropertyAccessExpression).getExpression();
    }

    // Chain should start with 'this'
    if (!Node.isThisExpression(current)) return null;

    // Need at least 3 levels: this.storageVar.field (but this handles deeper nesting)
    if (chain.length < 2) return null;

    const storageName = chain[0]!;
    const storageInfo = this.storage.get(storageName);
    if (!storageInfo || !storageInfo.isStruct || !storageInfo.structInfo) return null;

    // Now walk through the chain accumulating offsets
    let baseSlot = storageInfo.slot;
    let currentStruct = storageInfo.structInfo;

    for (let i = 1; i < chain.length; i++) {
      const fieldName = chain[i]!;
      const fieldInfo = currentStruct.fields.get(fieldName);
      if (!fieldInfo) return null;

      baseSlot += fieldInfo.offset;

      // Check if this is a nested struct
      const nestedStruct = this.structDefinitions.get(fieldInfo.type);
      if (i < chain.length - 1) {
        // Not the final field - must be a nested struct
        if (!nestedStruct) return null;
        currentStruct = nestedStruct;
      }
      // Final field - return computed slot
    }

    return baseSlot;
  }

  /**
   * Try to resolve nested struct field access like: this.outer.inner.field
   * Returns null if not a nested struct access pattern.
   */
  private tryResolveNestedStructAccess(
    obj: PropertyAccessExpression,
    finalPropName: string
  ): YulExpression | null {
    // Build the chain of property accesses from innermost to outermost
    const chain: string[] = [finalPropName];
    let current: Node = obj;

    while (Node.isPropertyAccessExpression(current)) {
      chain.unshift((current as PropertyAccessExpression).getName());
      current = (current as PropertyAccessExpression).getExpression();
    }

    // Chain should start with 'this'
    if (!Node.isThisExpression(current)) return null;

    // First element should be storage variable name
    if (chain.length < 2) return null;

    const storageName = chain[0]!;
    const storageInfo = this.storage.get(storageName);
    if (!storageInfo || !storageInfo.isStruct || !storageInfo.structInfo) return null;

    // Now walk through the chain accumulating offsets
    let baseSlot = storageInfo.slot;
    let currentStruct = storageInfo.structInfo;

    for (let i = 1; i < chain.length; i++) {
      const fieldName = chain[i]!;
      const fieldInfo = currentStruct.fields.get(fieldName);
      if (!fieldInfo) return null;

      baseSlot += fieldInfo.offset;

      // Check if this is a nested struct
      const nestedStruct = this.structDefinitions.get(fieldInfo.type);
      if (i < chain.length - 1) {
        // Not the final field - must be a nested struct
        if (!nestedStruct) return null;
        currentStruct = nestedStruct;
      } else {
        // Final field - could be primitive or struct
        if (nestedStruct) {
          // Return slot for struct (no sload)
          return { type: "literal", value: baseSlot };
        }
        // Primitive - sload (or tload for transient)
        return {
          type: "functionCall",
          name: this.getLoadOp(storageInfo),
          args: [{ type: "literal", value: baseSlot }],
        };
      }
    }

    return null;
  }

  private transformPropertyAccess(node: PropertyAccessExpression): YulExpression {
    const obj = node.getExpression();
    const propName = node.getName();

    // Handle enum member access: Status.Active -> literal value
    if (Node.isIdentifier(obj)) {
      const enumName = obj.getText();
      const enumInfo = this.enumDefinitions.get(enumName);
      if (enumInfo) {
        const memberValue = enumInfo.members.get(propName);
        if (memberValue !== undefined) {
          return { type: "literal", value: memberValue };
        }
        throw new Error(`Unknown enum member: ${enumName}.${propName}`);
      }

      // Handle memory array .length: arr.length -> mload(arr)
      if (this.memoryArrays.has(enumName) && propName === "length") {
        return {
          type: "functionCall",
          name: "mload",
          args: [{ type: "identifier", name: enumName }],
        };
      }

      // Handle calldata array param .length: arr.length -> arr_len
      const calldataInfo = this.calldataArrayParams.get(enumName);
      if (calldataInfo && propName === "length") {
        return { type: "identifier", name: calldataInfo.lenVar };
      }
    }

    // this.field -> sload(slot) or constant/immutable value
    if (Node.isThisExpression(obj)) {
      const storageInfo = this.storage.get(propName);
      if (storageInfo) {
        const slotExpr: YulExpression = { type: "literal", value: storageInfo.slot };
        const loadOp = this.getLoadOp(storageInfo);
        const sloadExpr: YulExpression = { type: "functionCall", name: loadOp, args: [slotExpr] };

        // Handle packed storage variables
        if (storageInfo.byteOffset !== undefined && storageInfo.byteSize !== undefined) {
          const bitOffset = storageInfo.byteOffset * 8;
          const mask = (1n << BigInt(storageInfo.byteSize * 8)) - 1n;

          if (bitOffset === 0) {
            // Variable is at the start of the slot, just mask
            return {
              type: "functionCall",
              name: "and",
              args: [sloadExpr, { type: "literal", value: mask }],
            };
          } else {
            // Shift right then mask
            return {
              type: "functionCall",
              name: "and",
              args: [
                {
                  type: "functionCall",
                  name: "shr",
                  args: [{ type: "literal", value: BigInt(bitOffset) }, sloadExpr],
                },
                { type: "literal", value: mask },
              ],
            };
          }
        }

        // Full slot access
        return sloadExpr;
      }

      // Check for constant class members (private fields with literal values)
      const constantValue = this.constants.get(propName);
      if (constantValue !== undefined) {
        return { type: "literal", value: constantValue };
      }

      // Check for immutable variables (stored at dedicated slots)
      const immutableInfo = this.immutables.get(propName);
      if (immutableInfo) {
        return {
          type: "functionCall",
          name: "sload",
          args: [{ type: "literal", value: immutableInfo.slot }],
        };
      }
    }

    // Handle struct field access: this.structVar.fieldName -> sload(baseSlot + fieldOffset)
    // Also handles nested structs: this.structVar.nestedField.deeperField
    if (Node.isPropertyAccessExpression(obj)) {
      const result = this.tryResolveNestedStructAccess(obj, propName);
      if (result) return result;

      const innerObj = obj.getExpression();
      const innerProp = obj.getName();

      // this.structVar.fieldName (simple case)
      if (Node.isThisExpression(innerObj)) {
        const storageInfo = this.storage.get(innerProp);
        if (storageInfo && storageInfo.isStruct && storageInfo.structInfo) {
          const fieldInfo = storageInfo.structInfo.fields.get(propName);
          if (fieldInfo) {
            const slotExpr: YulExpression =
              fieldInfo.offset === 0n
                ? { type: "literal", value: storageInfo.slot }
                : {
                    type: "functionCall",
                    name: "add",
                    args: [
                      { type: "literal", value: storageInfo.slot },
                      { type: "literal", value: fieldInfo.offset },
                    ],
                  };
            // Check if this field is itself a nested struct (don't sload, just return slot)
            const nestedStruct = this.structDefinitions.get(fieldInfo.type);
            if (nestedStruct) {
              // Return slot expression for further nested access
              return slotExpr;
            }
            return {
              type: "functionCall",
              name: this.getLoadOp(storageInfo),
              args: [slotExpr],
            };
          }
        }

        // Handle arr.length for dynamic arrays: this.arr.length -> sload(slot)
        if (storageInfo && storageInfo.isArray && propName === "length") {
          // Array length is stored at the base slot
          return {
            type: "functionCall",
            name: this.getLoadOp(storageInfo),
            args: [{ type: "literal", value: storageInfo.slot }],
          };
        }

        // Handle arr.length for fixed arrays: compile-time constant
        if (storageInfo && storageInfo.isFixedArray && storageInfo.fixedArraySize && propName === "length") {
          return { type: "literal", value: storageInfo.fixedArraySize };
        }

        // Handle dynamic bytes/string .length: this.data.length -> sload(slot)
        if (storageInfo && (storageInfo.isDynamicBytes || storageInfo.isDynamicString) && propName === "length") {
          return {
            type: "functionCall",
            name: this.getLoadOp(storageInfo),
            args: [{ type: "literal", value: storageInfo.slot }],
          };
        }

        // Handle external function type properties: this.fn.address, this.fn.selector
        if (storageInfo && storageInfo.isExternalFunction) {
          const slotExpr: YulExpression = { type: "literal", value: storageInfo.slot };
          const loadOp = this.getLoadOp(storageInfo);
          if (propName === "address") {
            // Address is stored in lower 160 bits
            return {
              type: "functionCall",
              name: "and",
              args: [
                { type: "functionCall", name: loadOp, args: [slotExpr] },
                { type: "literal", value: 0xffffffffffffffffffffffffffffffffffffffffn }, // 160 bits mask
              ],
            };
          }
          if (propName === "selector") {
            // Selector is stored in bits 160-191 (next 32 bits after address)
            return {
              type: "functionCall",
              name: "and",
              args: [
                {
                  type: "functionCall",
                  name: "shr",
                  args: [
                    { type: "literal", value: 160n },
                    { type: "functionCall", name: loadOp, args: [slotExpr] },
                  ],
                },
                { type: "literal", value: 0xffffffffn }, // 32 bits mask
              ],
            };
          }
        }
      }
    }

    // Handle mapping[key].fieldName -> sload(__mapping_slot(key, slot) + fieldOffset)
    if (Node.isElementAccessExpression(obj)) {
      const mappingExpr = obj.getExpression();
      const keyExpr = obj.getArgumentExpression();

      if (Node.isPropertyAccessExpression(mappingExpr) && keyExpr) {
        const mappingObj = mappingExpr.getExpression();
        const mappingName = mappingExpr.getName();

        if (Node.isThisExpression(mappingObj)) {
          const storageInfo = this.storage.get(mappingName);
          if (storageInfo && storageInfo.isMapping && storageInfo.mappingValueStruct) {
            const fieldInfo = storageInfo.mappingValueStruct.fields.get(propName);
            if (fieldInfo) {
              const keyYul = this.transformExpression(keyExpr);
              const baseSlot = this.generateMappingSlotHash(
                keyYul,
                { type: "literal", value: storageInfo.slot }
              );

              const slotExpr: YulExpression =
                fieldInfo.offset === 0n
                  ? baseSlot
                  : {
                      type: "functionCall",
                      name: "add",
                      args: [baseSlot, { type: "literal", value: fieldInfo.offset }],
                    };

              return {
                type: "functionCall",
                name: this.getLoadOp(storageInfo),
                args: [slotExpr],
              };
            }
          }
        }
      }
    }

    // msg.sender -> caller()
    // msg.value -> callvalue()
    // msg.sig -> shr(224, calldataload(0)) - first 4 bytes of calldata
    if (Node.isIdentifier(obj) && obj.getText() === "msg") {
      if (propName === "sender") {
        return { type: "functionCall", name: "caller", args: [] };
      }
      if (propName === "value") {
        return { type: "functionCall", name: "callvalue", args: [] };
      }
      if (propName === "sig") {
        // msg.sig = first 4 bytes of calldata = shr(224, calldataload(0))
        return {
          type: "functionCall",
          name: "shr",
          args: [
            { type: "literal", value: 224n },
            {
              type: "functionCall",
              name: "calldataload",
              args: [{ type: "literal", value: 0n }],
            },
          ],
        };
      }
      if (propName === "data") {
        // msg.data = copy all calldata to memory
        // Returns pointer to memory where data is stored (length-prefixed)
        return { type: "functionCall", name: "__msg_data", args: [] };
      }
    }

    // tx.origin -> origin()
    // tx.gasprice -> gasprice()
    if (Node.isIdentifier(obj) && obj.getText() === "tx") {
      if (propName === "origin") {
        return { type: "functionCall", name: "origin", args: [] };
      }
      if (propName === "gasprice") {
        return { type: "functionCall", name: "gasprice", args: [] };
      }
    }

    // block.timestamp -> timestamp()
    // block.number -> number()
    // block.chainid -> chainid()
    // block.coinbase -> coinbase()
    // block.difficulty/prevrandao -> prevrandao()
    // block.gaslimit -> gaslimit()
    // block.basefee -> basefee()
    if (Node.isIdentifier(obj) && obj.getText() === "block") {
      if (propName === "timestamp") {
        return { type: "functionCall", name: "timestamp", args: [] };
      }
      if (propName === "number") {
        return { type: "functionCall", name: "number", args: [] };
      }
      if (propName === "chainid") {
        return { type: "functionCall", name: "chainid", args: [] };
      }
      if (propName === "coinbase") {
        return { type: "functionCall", name: "coinbase", args: [] };
      }
      if (propName === "difficulty" || propName === "prevrandao") {
        return { type: "functionCall", name: "prevrandao", args: [] };
      }
      if (propName === "gaslimit") {
        return { type: "functionCall", name: "gaslimit", args: [] };
      }
      if (propName === "basefee") {
        return { type: "functionCall", name: "basefee", args: [] };
      }
      // EIP-4844: block.blobbasefee -> blobbasefee()
      if (propName === "blobbasefee") {
        return { type: "functionCall", name: "blobbasefee", args: [] };
      }
    }

    // Handle type(T).min, type(T).max, and type(I).interfaceId
    // e.g., type(uint256).max, type(int8).min, type(IERC165).interfaceId
    if (Node.isCallExpression(obj)) {
      const typeCallee = obj.getExpression();
      if (Node.isIdentifier(typeCallee) && typeCallee.getText() === "type") {
        const typeArgs = obj.getArguments();
        if (typeArgs.length === 1) {
          const typeArg = typeArgs[0]!;
          const typeText = typeArg.getText();

          // Handle type(I).interfaceId for interfaces
          if (propName === "interfaceId") {
            const interfaceInfo = this.contractInterfaces.get(typeText);
            if (interfaceInfo) {
              // EIP-165: interfaceId = XOR of all function selectors
              let interfaceId = 0n;
              for (const method of interfaceInfo.methods.values()) {
                // Parse selector (e.g., "0x12345678") to bigint
                const selectorValue = BigInt(method.selector);
                interfaceId ^= selectorValue;
              }
              return { type: "literal", value: interfaceId };
            }
            throw new Error(`Unknown interface for type().interfaceId: ${typeText}`);
          }

          // Handle type(C).name - returns the contract name as a memory pointer to a string
          // The string is ABI-encoded: 32 bytes offset, 32 bytes length, then data
          if (propName === "name") {
            // Store the name in memory and return pointer
            // Use a helper function that returns pointer to the name string
            this.typeNameHelpers.add(typeText);
            return {
              type: "functionCall",
              name: `__type_name_${typeText}`,
              args: [],
            };
          }

          // Handle type(C).runtimeCode - returns the runtime bytecode of the current contract
          // Returns a memory pointer to bytes (length + data)
          if (propName === "runtimeCode") {
            return {
              type: "functionCall",
              name: "__type_runtimeCode",
              args: [],
            };
          }

          // Handle type(C).creationCode - returns the creation bytecode
          // Uses dataoffset and datasize to get the contract's creation bytecode
          if (propName === "creationCode") {
            // Track which contracts need creationCode helpers
            this.typeCreationCodeHelpers.add(typeText);
            return {
              type: "functionCall",
              name: `__type_creationCode_${typeText}`,
              args: [],
            };
          }

          const typeInfo = this.getTypeMinMax(typeText);
          if (typeInfo) {
            if (propName === "min") {
              return { type: "literal", value: typeInfo.min };
            }
            if (propName === "max") {
              return { type: "literal", value: typeInfo.max };
            }
          }
        }
      }
    }

    // Address properties: addr.balance, addr.codehash
    // These work on any expression, not just known variables
    if (propName === "balance") {
      // addr.balance -> balance(addr)
      const addrExpr = this.transformExpression(obj);
      return { type: "functionCall", name: "balance", args: [addrExpr] };
    }
    if (propName === "codehash") {
      // addr.codehash -> extcodehash(addr)
      const addrExpr = this.transformExpression(obj);
      return { type: "functionCall", name: "extcodehash", args: [addrExpr] };
    }
    if (propName === "code") {
      // addr.code -> extcodesize(addr) returns size, actual code needs extcodecopy
      // For now, return extcodesize as a simple implementation
      // Full implementation would need memory allocation and extcodecopy
      const addrExpr = this.transformExpression(obj);
      return { type: "functionCall", name: "extcodesize", args: [addrExpr] };
    }

    throw new Error(`Unsupported property access: ${node.getText()}`);
  }

  private transformCallExpression(node: CallExpression): YulExpression {
    const callee = node.getExpression();

    if (Node.isIdentifier(callee)) {
      const name = callee.getText();

      // Handle idx() helper - TypeScript workaround for bigint index
      // idx(key) is expanded to just key
      if (name === "idx") {
        const callArgs = node.getArguments();
        if (callArgs.length === 1) {
          return this.transformExpression(callArgs[0]!);
        }
      }

      // Handle unchecked(() => { ... }) - must be before general arg transformation
      // because arrow functions can't be transformed normally
      if (name === "unchecked") {
        const callArgs = node.getArguments();
        if (callArgs.length === 1) {
          const arg = callArgs[0];
          if (Node.isArrowFunction(arg)) {
            const body = arg.getBody();
            if (Node.isBlock(body)) {
              // For unchecked blocks with statements in expression context,
              // this is not a valid use case - Solidity's unchecked is a statement
              // Return 0 as fallback (user should use statement form instead)
              return { type: "literal", value: 0n };
            } else {
              // Expression body: unchecked(() => a + b)
              // In Yul there's no overflow checking, so just transform the expression
              return this.transformExpression(body);
            }
          }
        }
      }

      const args = node.getArguments().map((a) => this.transformExpression(a));

      // Handle type conversion functions
      const typeConversion = this.tryTransformTypeConversion(name, args);
      if (typeConversion) {
        return typeConversion;
      }

      // Map global functions to Yul equivalents
      const functionMap: Record<string, string> = {
        gasleft: "gas", // gasleft() -> gas()
        blockhash: "blockhash", // blockhash(n) -> blockhash(n)
        blobhash: "blobhash", // EIP-4844: blobhash(index) -> blobhash(index)
        keccak256: "keccak256", // keccak256(...) -> keccak256(...)
        sha256: "__sha256", // precompile helper
        ripemd160: "__ripemd160", // precompile helper
        ecrecover: "__ecrecover", // precompile helper
        addmod: "addmod",
        mulmod: "mulmod",
        selfdestruct: "selfdestruct",
      };

      // Check if this is an imported function
      const importedFunc = this.importedFunctions.get(name);
      if (importedFunc) {
        return { type: "functionCall", name: name, args };
      }

      const mappedName = functionMap[name] ?? name;
      return { type: "functionCall", name: mappedName, args };
    }

    // Handle this.methodName() - internal method calls
    if (Node.isPropertyAccessExpression(callee)) {
      const obj = callee.getExpression();
      const methodName = callee.getName();

      if (Node.isThisExpression(obj)) {
        // Internal method call -> fn_methodName(args)
        // Check for named parameters: this.method({a: 1, b: 2})
        const rawArgs = node.getArguments();
        let args: YulExpression[];

        if (rawArgs.length === 1 && Node.isObjectLiteralExpression(rawArgs[0])) {
          // Try to resolve named parameters
          const namedArgs = this.resolveNamedParameters(methodName, rawArgs[0] as ObjectLiteralExpression);
          if (namedArgs) {
            args = namedArgs;
          } else {
            args = rawArgs.map((a) => this.transformExpression(a));
          }
        } else {
          args = rawArgs.map((a) => this.transformExpression(a));
        }
        return { type: "functionCall", name: `fn_${methodName}`, args };
      }

      // Handle super.methodName() - call parent implementation
      if (obj.getKind() === SyntaxKind.SuperKeyword) {
        // Look up the parent method name for the class whose method is being transformed
        const currentClassName = this.currentMethodClass?.getName() ?? "";
        const parentMethodKey = `${currentClassName}:${methodName}`;
        const parentFuncName = this.parentMethods.get(parentMethodKey);

        if (parentFuncName) {
          const args = node.getArguments().map((a) => this.transformExpression(a));
          return { type: "functionCall", name: `fn_${parentFuncName}`, args };
        }
        throw new Error(`super.${methodName}() called but no parent implementation found`);
      }

      // Handle call.call(target, signature, args) and call.staticcall(target, signature, args)
      if (Node.isIdentifier(obj) && obj.getText() === "call") {
        if (methodName === "call" || methodName === "staticcall") {
          return this.transformExternalCall(node, methodName);
        }
      }

      // Handle abi.* methods
      if (Node.isIdentifier(obj) && obj.getText() === "abi") {
        if (methodName === "encodeWithSelector") {
          return this.transformAbiEncodeWithSelector(node);
        }
        if (methodName === "encodeWithSignature") {
          return this.transformAbiEncodeWithSignature(node);
        }
        if (methodName === "encodeCall") {
          return this.transformAbiEncodeCall(node);
        }
        if (methodName === "encode") {
          return this.transformAbiEncode(node);
        }
        if (methodName === "encodePacked") {
          return this.transformAbiEncodePacked(node);
        }
        if (methodName === "decode") {
          return this.transformAbiDecode(node);
        }
      }

      // Handle call.delegatecall
      if (Node.isIdentifier(obj) && obj.getText() === "call") {
        if (methodName === "delegatecall") {
          return this.transformDelegatecall(node);
        }
      }

      // Handle bytes.concat(...) and string.concat(...)
      if (Node.isIdentifier(obj) && (obj.getText() === "bytes" || obj.getText() === "string")) {
        if (methodName === "concat") {
          return this.transformBytesConcat(node);
        }
      }

      // Handle library static method calls: SafeMath.add(a, b)
      if (Node.isIdentifier(obj)) {
        const libName = obj.getText();
        const libInfo = this.libraries.get(libName);
        if (libInfo) {
          const methodInfo = libInfo.methods.get(methodName);
          if (methodInfo) {
            const args = node.getArguments().map((a) => this.transformExpression(a));
            return {
              type: "functionCall",
              name: `lib_${libName}_${methodName}`,
              args,
            };
          }
        }
      }

      // Handle "using Library for Type" - x.method(args) -> lib_Library_method(x, args)
      // where x has a type with a using declaration
      const usingResult = this.tryTransformUsingCall(obj, methodName, node);
      if (usingResult) {
        return usingResult;
      }

      // Handle this.storageField.push() and this.storageField.pop() for arrays and dynamic bytes
      if (Node.isPropertyAccessExpression(obj)) {
        const thisExpr = obj.getExpression();
        const fieldName = obj.getName();
        if (Node.isThisExpression(thisExpr)) {
          const storageInfo = this.storage.get(fieldName);
          // Handle StorageBytes push/pop as expressions
          if (storageInfo && storageInfo.isDynamicBytes) {
            if (methodName === "push") {
              const args = node.getArguments();
              if (args.length !== 1) {
                throw new Error("StorageBytes.push() requires exactly one argument");
              }
              return {
                type: "functionCall",
                name: "__bytes_push",
                args: [
                  { type: "literal", value: storageInfo.slot },
                  this.transformExpression(args[0]!),
                ],
              };
            }
            if (methodName === "pop") {
              return {
                type: "functionCall",
                name: "__bytes_pop",
                args: [{ type: "literal", value: storageInfo.slot }],
              };
            }
          }
          // Handle StorageArray pop as expression (returns value)
          if (storageInfo && storageInfo.isArray && methodName === "pop") {
            // For arrays, pop in expression context still needs to return the value
            // We use a helper function that loads before decrementing
            return {
              type: "functionCall",
              name: "__array_pop",
              args: [{ type: "literal", value: storageInfo.slot }],
            };
          }
        }
      }

      // Handle calldata array .slice(start, end?) method
      if (Node.isIdentifier(obj) && methodName === "slice") {
        const arrName = obj.getText();
        const calldataInfo = this.calldataArrayParams.get(arrName);
        if (calldataInfo) {
          const args = node.getArguments();
          if (args.length < 1 || args.length > 2) {
            throw new Error("slice() requires 1 or 2 arguments (start, end?)");
          }
          const startExpr = this.transformExpression(args[0]!);
          // If end is not provided, use the full length
          const endExpr = args.length === 2
            ? this.transformExpression(args[1]!)
            : { type: "identifier" as const, name: calldataInfo.lenVar };

          // Slice returns (new_offset, new_len)
          // new_offset = arr_offset + start * 32
          // new_len = end - start
          // We return a tuple by storing in memory and returning pointer
          // For simplicity, return new_offset (caller can track length separately)
          return {
            type: "functionCall",
            name: "__calldata_slice",
            args: [
              { type: "identifier", name: calldataInfo.offsetVar },
              { type: "identifier", name: calldataInfo.lenVar },
              startExpr,
              endExpr,
            ],
          };
        }
      }

      // Handle addr.transfer(amount) - transfer ETH, revert on failure
      // Returns nothing (void), but we return 1 for expression context
      if (methodName === "transfer") {
        const args = node.getArguments();
        if (args.length !== 1) {
          throw new Error("transfer() requires exactly 1 argument (amount)");
        }
        const addrExpr = this.transformExpression(obj);
        const amountExpr = this.transformExpression(args[0]!);
        // call(gas, to, value, argsOffset, argsLength, retOffset, retLength)
        // If call fails (returns 0), revert
        // Use helper function __transfer that reverts on failure
        return {
          type: "functionCall",
          name: "__transfer",
          args: [addrExpr, amountExpr],
        };
      }

      // Handle addr.send(amount) - transfer ETH, return bool success
      if (methodName === "send") {
        const args = node.getArguments();
        if (args.length !== 1) {
          throw new Error("send() requires exactly 1 argument (amount)");
        }
        const addrExpr = this.transformExpression(obj);
        const amountExpr = this.transformExpression(args[0]!);
        // call(gas, to, value, argsOffset, argsLength, retOffset, retLength)
        // Returns success (1 or 0)
        return {
          type: "functionCall",
          name: "call",
          args: [
            { type: "functionCall", name: "gas", args: [] },
            addrExpr,
            amountExpr,
            { type: "literal", value: 0n },
            { type: "literal", value: 0n },
            { type: "literal", value: 0n },
            { type: "literal", value: 0n },
          ],
        };
      }

      // Handle typed external calls: IERC20(addr).transfer(to, amount)
      // obj is a CallExpression like IERC20(addr), methodName is "transfer"
      if (Node.isCallExpression(obj)) {
        const interfaceCall = obj.getExpression();
        if (Node.isIdentifier(interfaceCall)) {
          const interfaceName = interfaceCall.getText();
          const contractInterface = this.contractInterfaces.get(interfaceName);

          if (contractInterface) {
            const methodInfo = contractInterface.methods.get(methodName);
            if (methodInfo) {
              // Get the target address (first arg of interface call)
              const interfaceArgs = obj.getArguments();
              if (interfaceArgs.length !== 1) {
                throw new Error(`${interfaceName}() requires exactly 1 argument (address)`);
              }
              const targetAddr = this.transformExpression(interfaceArgs[0]!);

              // Get method call arguments
              const callArgs = node.getArguments().map((a) => this.transformExpression(a));

              // Generate typed external call using the method signature
              return this.generateTypedExternalCall(
                targetAddr,
                methodInfo,
                callArgs
              );
            }
          }
        }
      }

      // Handle external function call: this.callback(args) where callback is ExternalFunction
      if (Node.isThisExpression(obj)) {
        const storageInfo = this.storage.get(methodName);
        if (storageInfo && storageInfo.isExternalFunction) {
          // Call through stored external function
          // We need to extract address and selector from the stored value
          return this.generateExternalFunctionCall(storageInfo, node);
        }
      }
    }

    throw new Error(`Unsupported call expression: ${node.getText()}`);
  }

  /**
   * Transform external contract calls
   * call.call(target, "signature", [args]) -> CALL
   * call.staticcall(target, "signature", [args]) -> STATICCALL
   */
  private transformExternalCall(node: CallExpression, callType: "call" | "staticcall"): YulExpression {
    const args = node.getArguments();
    if (args.length < 2) {
      throw new Error(`${callType} requires at least 2 arguments: target and signature`);
    }

    // target address
    const target = this.transformExpression(args[0]!);

    // signature string (extract from string literal)
    const sigArg = args[1]!;
    if (!Node.isStringLiteral(sigArg)) {
      throw new Error("Call signature must be a string literal");
    }
    const signature = sigArg.getLiteralValue();

    // Parse function signature to get selector
    // e.g., "transfer(address,uint256)" -> 0xa9059cbb
    const selectorMatch = signature.match(/^(\w+)\((.*)\)$/);
    if (!selectorMatch) {
      throw new Error(`Invalid function signature: ${signature}`);
    }

    const funcName = selectorMatch[1]!;
    const paramTypes = selectorMatch[2] ? selectorMatch[2].split(",") : [];

    // Compute selector
    const selector = computeSelector(
      funcName,
      paramTypes.map((t, i) => ({ name: `arg${i}`, type: fromSolidityType(t.trim()) }))
    );

    // Parse call arguments array
    const callArgs: YulExpression[] = [];
    if (args.length >= 3) {
      const argsArray = args[2]!;
      if (Node.isArrayLiteralExpression(argsArray)) {
        for (const elem of argsArray.getElements()) {
          callArgs.push(this.transformExpression(elem));
        }
      }
    }

    // Generate call using helper function
    // __external_call(target, selector, arg1, arg2, ...)
    const helperName = callType === "staticcall" ? "__staticcall" : "__call";
    return {
      type: "functionCall",
      name: helperName,
      args: [target, { type: "literal", value: BigInt(selector) }, ...callArgs],
    };
  }

  /**
   * Generate a typed external call using interface method info
   * IERC20(addr).transfer(to, amount) -> __call_N(addr, selector, to, amount)
   */
  private generateTypedExternalCall(
    target: YulExpression,
    methodInfo: ContractInterfaceMethod,
    args: YulExpression[]
  ): YulExpression {
    // Use staticcall for view functions (return type is not void and method doesn't modify state)
    // For now, we use call for all methods - could be improved with view/pure detection

    const n = args.length;
    const helperName = `__call_${n}`;

    // Generate dynamic helper if not already generated
    if (!this.generatedCallHelpers.has(n)) {
      this.generatedCallHelpers.add(n);
      this.dynamicHelpers.push(this.generateCallNHelper(n));
    }

    return {
      type: "functionCall",
      name: helperName,
      args: [target, { type: "literal", value: methodInfo.selector }, ...args],
    };
  }

  /**
   * Resolve named parameters for a method call.
   * Converts this.method({a: 1, b: 2}) to this.method(1, 2) based on parameter order.
   * Returns null if the method cannot be found or parameters don't match.
   */
  private resolveNamedParameters(
    methodName: string,
    objLiteral: ObjectLiteralExpression
  ): YulExpression[] | null {
    // Find the method declaration in the inheritance chain
    let methodDecl: MethodDeclaration | undefined;
    for (const classDecl of this.inheritanceChain) {
      const method = classDecl.getMethod(methodName);
      if (method) {
        methodDecl = method;
        break;
      }
    }

    if (!methodDecl) {
      return null;
    }

    // Get parameter names in order
    const params = methodDecl.getParameters();
    const paramNames = params.map((p) => p.getName());

    // Extract properties from object literal
    const properties = objLiteral.getProperties();
    const propMap = new Map<string, Node>();

    for (const prop of properties) {
      if (Node.isPropertyAssignment(prop)) {
        const name = prop.getName();
        const value = prop.getInitializer();
        if (value) {
          propMap.set(name, value);
        }
      } else if (Node.isShorthandPropertyAssignment(prop)) {
        // Handle shorthand: { a } is same as { a: a }
        const name = prop.getName();
        propMap.set(name, prop.getNameNode());
      }
    }

    // Check that all parameters have values
    if (propMap.size !== paramNames.length) {
      return null;
    }

    // Build arguments in parameter order
    const args: YulExpression[] = [];
    for (const paramName of paramNames) {
      const value = propMap.get(paramName);
      if (!value) {
        return null; // Missing parameter
      }
      args.push(this.transformExpression(value));
    }

    return args;
  }

  /**
   * Generate a call through a stored external function reference.
   * External functions are stored as: address (160 bits) | selector (32 bits) | unused (64 bits)
   * This extracts the address and selector and makes the call.
   */
  private generateExternalFunctionCall(
    storageInfo: StorageInfo,
    node: CallExpression
  ): YulExpression {
    const args = node.getArguments().map((a) => this.transformExpression(a));

    // Load the stored function reference
    const slotExpr: YulExpression = { type: "literal", value: storageInfo.slot };
    const storedValue: YulExpression = { type: "functionCall", name: this.getLoadOp(storageInfo), args: [slotExpr] };

    // Extract address (lower 160 bits)
    const addressExpr: YulExpression = {
      type: "functionCall",
      name: "and",
      args: [storedValue, { type: "literal", value: 0xffffffffffffffffffffffffffffffffffffffffn }],
    };

    // Extract selector (bits 160-191)
    const selectorExpr: YulExpression = {
      type: "functionCall",
      name: "and",
      args: [
        { type: "functionCall", name: "shr", args: [{ type: "literal", value: 160n }, storedValue] },
        { type: "literal", value: 0xffffffffn },
      ],
    };

    // Use dynamic helper for N arguments
    const n = args.length;
    const helperName = `__call_${n}`;

    // Generate dynamic helper if not already generated
    if (!this.generatedCallHelpers.has(n)) {
      this.generatedCallHelpers.add(n);
      this.dynamicHelpers.push(this.generateCallNHelper(n));
    }

    return {
      type: "functionCall",
      name: helperName,
      args: [addressExpr, selectorExpr, ...args],
    };
  }

  /**
   * Transform abi.encodeWithSelector(selector, arg1, arg2, ...)
   * Returns memory pointer to encoded data
   * Encoding: selector (4 bytes) + args (32 bytes each)
   * Supports any number of arguments via dynamic helper generation
   */
  private transformAbiEncodeWithSelector(node: CallExpression): YulExpression {
    const args = node.getArguments();
    if (args.length < 1) {
      throw new Error("abi.encodeWithSelector requires at least 1 argument (selector)");
    }

    // selector is first arg
    const selectorExpr = this.transformExpression(args[0]!);

    // remaining args are the values to encode
    const valueExprs = args.slice(1).map((a) => this.transformExpression(a));

    // Generate dynamic helper for N arguments
    const n = valueExprs.length;
    if (!this.generatedAbiEncodeSelectorHelpers.has(n)) {
      this.generatedAbiEncodeSelectorHelpers.add(n);
      this.dynamicHelpers.push(this.generateAbiEncodeSelectorNHelper(n));
    }

    return {
      type: "functionCall",
      name: `__abi_encode_selector_${n}`,
      args: [selectorExpr, ...valueExprs],
    };
  }

  /**
   * Transform abi.encodeWithSignature("transfer(address,uint256)", arg1, arg2, ...)
   * Computes selector from signature and encodes
   * Supports any number of arguments via dynamic helper generation
   */
  private transformAbiEncodeWithSignature(node: CallExpression): YulExpression {
    const args = node.getArguments();
    if (args.length < 1) {
      throw new Error("abi.encodeWithSignature requires at least 1 argument (signature)");
    }

    // signature is first arg (must be string literal)
    const sigArg = args[0]!;
    if (!Node.isStringLiteral(sigArg)) {
      throw new Error("abi.encodeWithSignature: signature must be a string literal");
    }
    const signature = sigArg.getLiteralValue();

    // Compute selector from signature
    const selector = computeSelectorFromSignature(signature);

    // remaining args are the values to encode
    const valueExprs = args.slice(1).map((a) => this.transformExpression(a));

    // Generate dynamic helper for N arguments
    const n = valueExprs.length;
    if (!this.generatedAbiEncodeSelectorHelpers.has(n)) {
      this.generatedAbiEncodeSelectorHelpers.add(n);
      this.dynamicHelpers.push(this.generateAbiEncodeSelectorNHelper(n));
    }

    return {
      type: "functionCall",
      name: `__abi_encode_selector_${n}`,
      args: [{ type: "literal", value: selector }, ...valueExprs],
    };
  }

  /**
   * Transform abi.encodeCall(Interface.method, arg1, arg2, ...)
   * Type-safe version of encodeWithSelector
   * First argument is a property access to an interface method
   * Example: abi.encodeCall(IERC20.transfer, to, amount)
   * Supports any number of arguments via dynamic helper generation
   */
  private transformAbiEncodeCall(node: CallExpression): YulExpression {
    const args = node.getArguments();
    if (args.length < 1) {
      throw new Error("abi.encodeCall requires at least 1 argument (Interface.method)");
    }

    // First arg should be a property access like IERC20.transfer
    const funcRef = args[0]!;
    if (!Node.isPropertyAccessExpression(funcRef)) {
      throw new Error("abi.encodeCall: first argument must be Interface.method");
    }

    const interfaceExpr = funcRef.getExpression();
    const methodName = funcRef.getName();

    if (!Node.isIdentifier(interfaceExpr)) {
      throw new Error("abi.encodeCall: first argument must be Interface.method");
    }

    const interfaceName = interfaceExpr.getText();
    const contractInterface = this.contractInterfaces.get(interfaceName);

    if (!contractInterface) {
      throw new Error(`abi.encodeCall: unknown interface '${interfaceName}'`);
    }

    const methodInfo = contractInterface.methods.get(methodName);
    if (!methodInfo) {
      throw new Error(`abi.encodeCall: unknown method '${interfaceName}.${methodName}'`);
    }

    // Get selector from method info
    const selector = methodInfo.selector;

    // Remaining args are the values to encode
    const valueExprs = args.slice(1).map((a) => this.transformExpression(a));

    // Generate dynamic helper for N arguments
    const n = valueExprs.length;
    if (!this.generatedAbiEncodeSelectorHelpers.has(n)) {
      this.generatedAbiEncodeSelectorHelpers.add(n);
      this.dynamicHelpers.push(this.generateAbiEncodeSelectorNHelper(n));
    }

    return {
      type: "functionCall",
      name: `__abi_encode_selector_${n}`,
      args: [{ type: "literal", value: selector }, ...valueExprs],
    };
  }

  /**
   * Transform abi.encode(arg1, arg2, ...)
   * Standard ABI encoding - each arg is padded to 32 bytes
   * Returns memory pointer to encoded data
   * Supports any number of arguments by generating inline code
   */
  private transformAbiEncode(node: CallExpression): YulExpression {
    const args = node.getArguments();
    if (args.length === 0) {
      return { type: "literal", value: 0n };
    }

    const valueExprs = args.map((a) => this.transformExpression(a));

    // Generate unique helper for this specific number of args
    const helperName = `__abi_encode_${valueExprs.length}`;

    // Check if we need to generate this helper
    if (!this.generatedAbiEncodeHelpers.has(valueExprs.length)) {
      this.generatedAbiEncodeHelpers.add(valueExprs.length);
      this.dynamicHelpers.push(this.generateAbiEncodeNHelper(valueExprs.length));
    }

    return {
      type: "functionCall",
      name: helperName,
      args: valueExprs,
    };
  }

  /**
   * Transform abi.encodePacked(arg1, arg2, ...)
   * Packed encoding - no padding, just concatenation
   * Returns memory pointer to encoded data
   * Supports any number of arguments
   */
  private transformAbiEncodePacked(node: CallExpression): YulExpression {
    const args = node.getArguments();
    if (args.length === 0) {
      return { type: "literal", value: 0n };
    }

    const valueExprs = args.map((a) => this.transformExpression(a));

    // Generate unique helper for this specific number of args
    const helperName = `__abi_encode_packed_${valueExprs.length}`;

    if (!this.generatedAbiEncodePackedHelpers.has(valueExprs.length)) {
      this.generatedAbiEncodePackedHelpers.add(valueExprs.length);
      this.dynamicHelpers.push(this.generateAbiEncodePackedNHelper(valueExprs.length));
    }

    return {
      type: "functionCall",
      name: helperName,
      args: valueExprs,
    };
  }

  /**
   * Generate __abi_encode_N helper for N arguments
   */
  private generateAbiEncodeNHelper(n: number): YulStatement {
    const params = Array.from({ length: n }, (_, i) => `arg${i}`);
    const body: YulStatement[] = [
      // ptr := mload(0x40)
      {
        type: "assignment",
        names: ["ptr"],
        value: { type: "functionCall", name: "mload", args: [{ type: "literal", value: 0x40n }] },
      },
    ];

    // Store each argument at ptr + 32*i
    for (let i = 0; i < n; i++) {
      body.push({
        type: "expression",
        expr: {
          type: "functionCall",
          name: "mstore",
          args: [
            { type: "functionCall", name: "add", args: [{ type: "identifier", name: "ptr" }, { type: "literal", value: BigInt(i * 32) }] },
            { type: "identifier", name: `arg${i}` },
          ],
        },
      });
    }

    // Update free memory pointer
    body.push({
      type: "expression",
      expr: {
        type: "functionCall",
        name: "mstore",
        args: [
          { type: "literal", value: 0x40n },
          { type: "functionCall", name: "add", args: [{ type: "identifier", name: "ptr" }, { type: "literal", value: BigInt(n * 32) }] },
        ],
      },
    });

    return {
      type: "function",
      name: `__abi_encode_${n}`,
      params,
      returns: ["ptr"],
      body,
    };
  }

  /**
   * Generate __abi_encode_packed_N helper for N arguments
   */
  private generateAbiEncodePackedNHelper(n: number): YulStatement {
    const params = Array.from({ length: n }, (_, i) => `arg${i}`);
    const body: YulStatement[] = [
      {
        type: "assignment",
        names: ["ptr"],
        value: { type: "functionCall", name: "mload", args: [{ type: "literal", value: 0x40n }] },
      },
    ];

    // For packed encoding, we store 32 bytes each (simplified)
    // Full implementation would need type info for proper packing
    for (let i = 0; i < n; i++) {
      body.push({
        type: "expression",
        expr: {
          type: "functionCall",
          name: "mstore",
          args: [
            { type: "functionCall", name: "add", args: [{ type: "identifier", name: "ptr" }, { type: "literal", value: BigInt(i * 32) }] },
            { type: "identifier", name: `arg${i}` },
          ],
        },
      });
    }

    body.push({
      type: "expression",
      expr: {
        type: "functionCall",
        name: "mstore",
        args: [
          { type: "literal", value: 0x40n },
          { type: "functionCall", name: "add", args: [{ type: "identifier", name: "ptr" }, { type: "literal", value: BigInt(n * 32) }] },
        ],
      },
    });

    return {
      type: "function",
      name: `__abi_encode_packed_${n}`,
      params,
      returns: ["ptr"],
      body,
    };
  }

  /**
   * Generate __abi_encode_selector_N helper for encoding with selector and N arguments
   * __abi_encode_selector_N(selector, arg0, arg1, ...) -> ptr
   */
  private generateAbiEncodeSelectorNHelper(n: number): YulStatement {
    const params = ["selector", ...Array.from({ length: n }, (_, i) => `arg${i}`)];
    const body: YulStatement[] = [
      // ptr := mload(0x40)
      {
        type: "assignment",
        names: ["ptr"],
        value: { type: "functionCall", name: "mload", args: [{ type: "literal", value: 0x40n }] },
      },
      // mstore(ptr, shl(224, selector)) - store selector left-aligned
      {
        type: "expression",
        expr: {
          type: "functionCall",
          name: "mstore",
          args: [
            { type: "identifier", name: "ptr" },
            { type: "functionCall", name: "shl", args: [{ type: "literal", value: 224n }, { type: "identifier", name: "selector" }] },
          ],
        },
      },
    ];

    // Store each argument at ptr + 4 + 32*i
    for (let i = 0; i < n; i++) {
      body.push({
        type: "expression",
        expr: {
          type: "functionCall",
          name: "mstore",
          args: [
            { type: "functionCall", name: "add", args: [{ type: "identifier", name: "ptr" }, { type: "literal", value: BigInt(4 + i * 32) }] },
            { type: "identifier", name: `arg${i}` },
          ],
        },
      });
    }

    // Update free memory pointer: mstore(0x40, add(ptr, 4 + n*32))
    body.push({
      type: "expression",
      expr: {
        type: "functionCall",
        name: "mstore",
        args: [
          { type: "literal", value: 0x40n },
          { type: "functionCall", name: "add", args: [{ type: "identifier", name: "ptr" }, { type: "literal", value: BigInt(4 + n * 32) }] },
        ],
      },
    });

    return {
      type: "function",
      name: `__abi_encode_selector_${n}`,
      params,
      returns: ["ptr"],
      body,
    };
  }

  /**
   * Generate __abi_decode_N helper for decoding N values from ABI-encoded data
   * __abi_decode_N(data) -> (v0, v1, ...)
   * Each value is at data + 32*(i+1) (skip length prefix)
   */
  private generateAbiDecodeNHelper(n: number): YulStatement {
    const returns = Array.from({ length: n }, (_, i) => `v${i}`);
    const body: YulStatement[] = [];

    // Decode each value: v_i := mload(add(data, 32*(i+1)))
    for (let i = 0; i < n; i++) {
      body.push({
        type: "assignment",
        names: [`v${i}`],
        value: {
          type: "functionCall",
          name: "mload",
          args: [
            { type: "functionCall", name: "add", args: [{ type: "identifier", name: "data" }, { type: "literal", value: BigInt((i + 1) * 32) }] },
          ],
        },
      });
    }

    return {
      type: "function",
      name: `__abi_decode_${n}`,
      params: ["data"],
      returns,
      body,
    };
  }

  /**
   * Generate __delegatecall_N helper for delegatecall with N arguments
   * __delegatecall_N(target, selector, arg0, arg1, ...) -> result
   */
  private generateDelegatecallNHelper(n: number): YulStatement {
    const params = ["target", "selector", ...Array.from({ length: n }, (_, i) => `arg${i}`)];
    const dataSize = BigInt(4 + n * 32);
    const body: YulStatement[] = [
      // Store selector (left-aligned)
      {
        type: "expression",
        expr: {
          type: "functionCall",
          name: "mstore",
          args: [
            { type: "literal", value: 0n },
            { type: "functionCall", name: "shl", args: [{ type: "literal", value: 224n }, { type: "identifier", name: "selector" }] },
          ],
        },
      },
    ];

    // Store each argument at 4 + 32*i
    for (let i = 0; i < n; i++) {
      body.push({
        type: "expression",
        expr: {
          type: "functionCall",
          name: "mstore",
          args: [
            { type: "literal", value: BigInt(4 + i * 32) },
            { type: "identifier", name: `arg${i}` },
          ],
        },
      });
    }

    // delegatecall(gas, target, 0, dataSize, 0, 32)
    body.push({
      type: "variableDeclaration",
      names: ["success"],
      value: {
        type: "functionCall",
        name: "delegatecall",
        args: [
          { type: "functionCall", name: "gas", args: [] },
          { type: "identifier", name: "target" },
          { type: "literal", value: 0n },
          { type: "literal", value: dataSize },
          { type: "literal", value: 0n },
          { type: "literal", value: 32n },
        ],
      },
    });

    // if iszero(success) { revert(0, 0) }
    body.push({
      type: "if",
      condition: { type: "functionCall", name: "iszero", args: [{ type: "identifier", name: "success" }] },
      body: [{ type: "expression", expr: { type: "functionCall", name: "revert", args: [{ type: "literal", value: 0n }, { type: "literal", value: 0n }] } }],
    });

    // result := mload(0)
    body.push({
      type: "assignment",
      names: ["result"],
      value: { type: "functionCall", name: "mload", args: [{ type: "literal", value: 0n }] },
    });

    return {
      type: "function",
      name: `__delegatecall_${n}`,
      params,
      returns: ["result"],
      body,
    };
  }

  /**
   * Generate __call_N helper for external state-changing calls with N arguments
   * __call_N(target, selector, arg0, arg1, ...) -> success
   */
  private generateCallNHelper(n: number): YulStatement {
    const params = ["target", "selector", ...Array.from({ length: n }, (_, i) => `arg${i}`)];
    const dataSize = BigInt(4 + n * 32);
    const body: YulStatement[] = [
      // Store selector (left-aligned)
      {
        type: "expression",
        expr: {
          type: "functionCall",
          name: "mstore",
          args: [
            { type: "literal", value: 0n },
            { type: "functionCall", name: "shl", args: [{ type: "literal", value: 224n }, { type: "identifier", name: "selector" }] },
          ],
        },
      },
    ];

    // Store each argument at 4 + 32*i
    for (let i = 0; i < n; i++) {
      body.push({
        type: "expression",
        expr: {
          type: "functionCall",
          name: "mstore",
          args: [
            { type: "literal", value: BigInt(4 + i * 32) },
            { type: "identifier", name: `arg${i}` },
          ],
        },
      });
    }

    // success := call(gas(), target, 0, 0, dataSize, 0, 32)
    body.push({
      type: "assignment",
      names: ["success"],
      value: {
        type: "functionCall",
        name: "call",
        args: [
          { type: "functionCall", name: "gas", args: [] },
          { type: "identifier", name: "target" },
          { type: "literal", value: 0n }, // value
          { type: "literal", value: 0n }, // in offset
          { type: "literal", value: dataSize }, // in size
          { type: "literal", value: 0n }, // out offset
          { type: "literal", value: 32n }, // out size
        ],
      },
    });

    return {
      type: "function",
      name: `__call_${n}`,
      params,
      returns: ["success"],
      body,
    };
  }

  /**
   * Generate __staticcall_N helper for external view calls with N arguments
   * __staticcall_N(target, selector, arg0, arg1, ...) -> result
   */
  private generateStaticCallNHelper(n: number): YulStatement {
    const params = ["target", "selector", ...Array.from({ length: n }, (_, i) => `arg${i}`)];
    const dataSize = BigInt(4 + n * 32);
    const body: YulStatement[] = [
      // Store selector (left-aligned)
      {
        type: "expression",
        expr: {
          type: "functionCall",
          name: "mstore",
          args: [
            { type: "literal", value: 0n },
            { type: "functionCall", name: "shl", args: [{ type: "literal", value: 224n }, { type: "identifier", name: "selector" }] },
          ],
        },
      },
    ];

    // Store each argument at 4 + 32*i
    for (let i = 0; i < n; i++) {
      body.push({
        type: "expression",
        expr: {
          type: "functionCall",
          name: "mstore",
          args: [
            { type: "literal", value: BigInt(4 + i * 32) },
            { type: "identifier", name: `arg${i}` },
          ],
        },
      });
    }

    // let success := staticcall(gas(), target, 0, dataSize, 0, 32)
    body.push({
      type: "variableDeclaration",
      names: ["success"],
      value: {
        type: "functionCall",
        name: "staticcall",
        args: [
          { type: "functionCall", name: "gas", args: [] },
          { type: "identifier", name: "target" },
          { type: "literal", value: 0n }, // in offset
          { type: "literal", value: dataSize }, // in size
          { type: "literal", value: 0n }, // out offset
          { type: "literal", value: 32n }, // out size
        ],
      },
    });

    // if iszero(success) { revert(0, 0) }
    body.push({
      type: "if",
      condition: { type: "functionCall", name: "iszero", args: [{ type: "identifier", name: "success" }] },
      body: [{ type: "expression", expr: { type: "functionCall", name: "revert", args: [{ type: "literal", value: 0n }, { type: "literal", value: 0n }] } }],
    });

    // result := mload(0)
    body.push({
      type: "assignment",
      names: ["result"],
      value: { type: "functionCall", name: "mload", args: [{ type: "literal", value: 0n }] },
    });

    return {
      type: "function",
      name: `__staticcall_${n}`,
      params,
      returns: ["result"],
      body,
    };
  }

  /**
   * Generate __create_N helper for contract creation with N constructor arguments
   * __create_N(offset, size, arg0, arg1, ...) -> addr
   */
  private generateCreateNHelper(n: number): YulStatement {
    const params = ["offset", "size", ...Array.from({ length: n }, (_, i) => `arg${i}`)];
    const body: YulStatement[] = [
      // let ptr := mload(0x40)
      {
        type: "variableDeclaration",
        names: ["ptr"],
        value: { type: "functionCall", name: "mload", args: [{ type: "literal", value: 0x40n }] },
      },
      // datacopy(ptr, offset, size)
      {
        type: "expression",
        expr: {
          type: "functionCall",
          name: "datacopy",
          args: [
            { type: "identifier", name: "ptr" },
            { type: "identifier", name: "offset" },
            { type: "identifier", name: "size" },
          ],
        },
      },
    ];

    // Store each constructor argument at ptr + size + 32*i
    for (let i = 0; i < n; i++) {
      body.push({
        type: "expression",
        expr: {
          type: "functionCall",
          name: "mstore",
          args: [
            {
              type: "functionCall",
              name: "add",
              args: [
                { type: "identifier", name: "ptr" },
                { type: "functionCall", name: "add", args: [{ type: "identifier", name: "size" }, { type: "literal", value: BigInt(i * 32) }] },
              ],
            },
            { type: "identifier", name: `arg${i}` },
          ],
        },
      });
    }

    // let totalSize := add(size, n*32)
    body.push({
      type: "variableDeclaration",
      names: ["totalSize"],
      value: {
        type: "functionCall",
        name: "add",
        args: [{ type: "identifier", name: "size" }, { type: "literal", value: BigInt(n * 32) }],
      },
    });

    // addr := create(0, ptr, totalSize)
    body.push({
      type: "assignment",
      names: ["addr"],
      value: {
        type: "functionCall",
        name: "create",
        args: [
          { type: "literal", value: 0n },
          { type: "identifier", name: "ptr" },
          { type: "identifier", name: "totalSize" },
        ],
      },
    });

    // if iszero(addr) { revert(0, 0) }
    body.push({
      type: "if",
      condition: { type: "functionCall", name: "iszero", args: [{ type: "identifier", name: "addr" }] },
      body: [{ type: "expression", expr: { type: "functionCall", name: "revert", args: [{ type: "literal", value: 0n }, { type: "literal", value: 0n }] } }],
    });

    return {
      type: "function",
      name: `__create_${n}`,
      params,
      returns: ["addr"],
      body,
    };
  }

  /**
   * Generate __create2_N helper for deterministic contract creation with N constructor arguments
   * __create2_N(offset, size, salt, arg0, arg1, ...) -> addr
   */
  private generateCreate2NHelper(n: number): YulStatement {
    const params = ["offset", "size", "salt", ...Array.from({ length: n }, (_, i) => `arg${i}`)];
    const body: YulStatement[] = [
      // let ptr := mload(0x40)
      {
        type: "variableDeclaration",
        names: ["ptr"],
        value: { type: "functionCall", name: "mload", args: [{ type: "literal", value: 0x40n }] },
      },
      // datacopy(ptr, offset, size)
      {
        type: "expression",
        expr: {
          type: "functionCall",
          name: "datacopy",
          args: [
            { type: "identifier", name: "ptr" },
            { type: "identifier", name: "offset" },
            { type: "identifier", name: "size" },
          ],
        },
      },
    ];

    // Store each constructor argument at ptr + size + 32*i
    for (let i = 0; i < n; i++) {
      body.push({
        type: "expression",
        expr: {
          type: "functionCall",
          name: "mstore",
          args: [
            {
              type: "functionCall",
              name: "add",
              args: [
                { type: "identifier", name: "ptr" },
                { type: "functionCall", name: "add", args: [{ type: "identifier", name: "size" }, { type: "literal", value: BigInt(i * 32) }] },
              ],
            },
            { type: "identifier", name: `arg${i}` },
          ],
        },
      });
    }

    // let totalSize := add(size, n*32)
    body.push({
      type: "variableDeclaration",
      names: ["totalSize"],
      value: {
        type: "functionCall",
        name: "add",
        args: [{ type: "identifier", name: "size" }, { type: "literal", value: BigInt(n * 32) }],
      },
    });

    // addr := create2(0, ptr, totalSize, salt)
    body.push({
      type: "assignment",
      names: ["addr"],
      value: {
        type: "functionCall",
        name: "create2",
        args: [
          { type: "literal", value: 0n },
          { type: "identifier", name: "ptr" },
          { type: "identifier", name: "totalSize" },
          { type: "identifier", name: "salt" },
        ],
      },
    });

    // if iszero(addr) { revert(0, 0) }
    body.push({
      type: "if",
      condition: { type: "functionCall", name: "iszero", args: [{ type: "identifier", name: "addr" }] },
      body: [{ type: "expression", expr: { type: "functionCall", name: "revert", args: [{ type: "literal", value: 0n }, { type: "literal", value: 0n }] } }],
    });

    return {
      type: "function",
      name: `__create2_${n}`,
      params,
      returns: ["addr"],
      body,
    };
  }

  /**
   * Transform abi.decode(data, (Type1, Type2, ...))
   * Decodes ABI-encoded data
   * Returns tuple of decoded values or single value
   */
  private transformAbiDecode(node: CallExpression): YulExpression {
    const args = node.getArguments();
    if (args.length !== 2) {
      throw new Error("abi.decode requires exactly 2 arguments: (data, types)");
    }

    const dataExpr = this.transformExpression(args[0]!);
    const typeArg = args[1]!;

    // Parse the type tuple to count how many values to decode
    // Supports: (Type), (Type1, Type2), etc.
    let numTypes = 1;
    const typeText = typeArg.getText();

    // Check if it's a tuple type like (uint256, address)
    if (typeText.startsWith("(") && typeText.endsWith(")")) {
      const inner = typeText.slice(1, -1).trim();
      if (inner.length > 0) {
        // Count comma-separated types, handling nested generics
        let depth = 0;
        let count = 1;
        for (const char of inner) {
          if (char === "<" || char === "(") depth++;
          else if (char === ">" || char === ")") depth--;
          else if (char === "," && depth === 0) count++;
        }
        numTypes = count;
      }
    }

    // Generate dynamic helper if needed
    if (!this.generatedAbiDecodeHelpers.has(numTypes)) {
      this.generatedAbiDecodeHelpers.add(numTypes);
      this.dynamicHelpers.push(this.generateAbiDecodeNHelper(numTypes));
    }

    return {
      type: "functionCall",
      name: `__abi_decode_${numTypes}`,
      args: [dataExpr],
    };
  }

  /**
   * Transform call.delegatecall(target, signature, args)
   * Uses DELEGATECALL opcode - runs code in context of current contract
   * Supports any number of arguments via dynamic helper generation
   */
  private transformDelegatecall(node: CallExpression): YulExpression {
    const args = node.getArguments();
    if (args.length < 2) {
      throw new Error("delegatecall requires at least 2 arguments: (target, signature, [args])");
    }

    const targetExpr = this.transformExpression(args[0]!);

    // Get signature
    const sigArg = args[1]!;
    if (!Node.isStringLiteral(sigArg)) {
      throw new Error("delegatecall: signature must be a string literal");
    }
    const signature = sigArg.getLiteralValue();
    const selector = computeSelectorFromSignature(signature);

    // Get call arguments
    const callArgs = args.slice(2);
    const argExprs = callArgs.length > 0 && Node.isArrayLiteralExpression(callArgs[0]!)
      ? callArgs[0]!.getElements().map((e) => this.transformExpression(e))
      : callArgs.map((a) => this.transformExpression(a));

    // Generate dynamic helper for N arguments
    const n = argExprs.length;
    if (!this.generatedDelegatecallHelpers.has(n)) {
      this.generatedDelegatecallHelpers.add(n);
      this.dynamicHelpers.push(this.generateDelegatecallNHelper(n));
    }

    return {
      type: "functionCall",
      name: `__delegatecall_${n}`,
      args: [targetExpr, { type: "literal", value: selector }, ...argExprs],
    };
  }

  /**
   * Transform bytes.concat(...) or string.concat(...)
   * Concatenates multiple bytes/string values in memory
   * Returns memory pointer to concatenated result (length-prefixed)
   */
  private transformBytesConcat(node: CallExpression): YulExpression {
    const args = node.getArguments();
    if (args.length === 0) {
      // Empty concat returns pointer to empty bytes
      return { type: "functionCall", name: "__empty_bytes", args: [] };
    }

    const valueExprs = args.map((a) => this.transformExpression(a));

    // For now, use the abi.encodePacked approach which concatenates values
    // This is a simplified implementation - full bytes concat needs proper memory handling
    const helperName = `__bytes_concat_${valueExprs.length}`;

    if (!this.generatedBytesConcatHelpers.has(valueExprs.length)) {
      this.generatedBytesConcatHelpers.add(valueExprs.length);
      this.dynamicHelpers.push(this.generateBytesConcatHelper(valueExprs.length));
    }

    return {
      type: "functionCall",
      name: helperName,
      args: valueExprs,
    };
  }

  /**
   * Generate __bytes_concat_N helper for N arguments
   * Similar to abi.encodePacked but returns length-prefixed bytes
   */
  private generateBytesConcatHelper(n: number): YulStatement {
    const params = Array.from({ length: n }, (_, i) => `arg${i}`);
    const body: YulStatement[] = [
      // ptr := mload(0x40)
      {
        type: "assignment",
        names: ["ptr"],
        value: { type: "functionCall", name: "mload", args: [{ type: "literal", value: 0x40n }] },
      },
      // Store length placeholder at ptr (will update later)
      // For simplicity, assume each arg is 32 bytes (like abi.encodePacked)
      {
        type: "expression",
        expr: {
          type: "functionCall",
          name: "mstore",
          args: [{ type: "identifier", name: "ptr" }, { type: "literal", value: BigInt(n * 32) }],
        },
      },
    ];

    // Store each argument at ptr + 32 + i*32
    for (let i = 0; i < n; i++) {
      body.push({
        type: "expression",
        expr: {
          type: "functionCall",
          name: "mstore",
          args: [
            { type: "functionCall", name: "add", args: [{ type: "identifier", name: "ptr" }, { type: "literal", value: BigInt(32 + i * 32) }] },
            { type: "identifier", name: `arg${i}` },
          ],
        },
      });
    }

    // Update free memory pointer
    body.push({
      type: "expression",
      expr: {
        type: "functionCall",
        name: "mstore",
        args: [
          { type: "literal", value: 0x40n },
          { type: "functionCall", name: "add", args: [{ type: "identifier", name: "ptr" }, { type: "literal", value: BigInt(32 + n * 32) }] },
        ],
      },
    });

    return {
      type: "function",
      name: `__bytes_concat_${n}`,
      params,
      returns: ["ptr"],
      body,
    };
  }

  /**
   * Transform new expression: new ContractName(args)
   * Uses CREATE opcode to deploy a new contract
   *
   * For contracts defined in the same file:
   * - Uses dataoffset/datasize to get bytecode
   * - Copies bytecode + constructor args to memory
   * - Calls CREATE and returns the new contract address
   */
  private transformNewExpression(node: NewExpression): YulExpression {
    const expr = node.getExpression();

    if (!Node.isIdentifier(expr)) {
      throw new Error("new expression must have an identifier (contract name or Array)");
    }

    const name = expr.getText();

    // Handle memory array: new Array(size) or new Array<T>(size)
    if (name === "Array") {
      const args = node.getArguments();
      if (args.length !== 1) {
        throw new Error("new Array() requires exactly one size argument");
      }
      const firstArg = args[0]!;
      const sizeExpr = this.transformExpression(firstArg);
      // __allocArray(size) -> ptr
      return {
        type: "functionCall",
        name: "__allocArray",
        args: [sizeExpr],
      };
    }

    // Contract creation: new ContractName(args) or new ContractName({ salt }, args)
    const rawArgs = node.getArguments();

    // Check if first argument is an object literal with salt property (CREATE2)
    let saltExpr: YulExpression | null = null;
    let constructorArgs: Node[] = rawArgs;

    if (rawArgs.length > 0 && Node.isObjectLiteralExpression(rawArgs[0])) {
      const objLiteral = rawArgs[0];
      const properties = objLiteral.getProperties();

      for (const prop of properties) {
        if (Node.isPropertyAssignment(prop) && prop.getName() === "salt") {
          const saltValue = prop.getInitializer();
          if (saltValue) {
            saltExpr = this.transformExpression(saltValue);
          }
        }
      }

      // Remove the options object from constructor args
      constructorArgs = rawArgs.slice(1);
    }

    const args = constructorArgs.map((a) => this.transformExpression(a));
    const n = args.length;

    // Use CREATE2 if salt is provided, otherwise CREATE
    if (saltExpr) {
      // Generate dynamic create2 helper for N arguments
      if (!this.generatedCreate2Helpers.has(n)) {
        this.generatedCreate2Helpers.add(n);
        this.dynamicHelpers.push(this.generateCreate2NHelper(n));
      }

      // __create2_N(offset, size, salt, arg0, arg1, ...) -> addr
      return {
        type: "functionCall",
        name: `__create2_${n}`,
        args: [
          { type: "functionCall", name: "dataoffset", args: [{ type: "stringLiteral", value: name }] },
          { type: "functionCall", name: "datasize", args: [{ type: "stringLiteral", value: name }] },
          saltExpr,
          ...args,
        ],
      };
    }

    // Generate dynamic create helper for N arguments
    if (!this.generatedCreateHelpers.has(n)) {
      this.generatedCreateHelpers.add(n);
      this.dynamicHelpers.push(this.generateCreateNHelper(n));
    }

    // __create_N(offset, size, arg0, arg1, ...) -> addr
    return {
      type: "functionCall",
      name: `__create_${n}`,
      args: [
        { type: "functionCall", name: "dataoffset", args: [{ type: "stringLiteral", value: name }] },
        { type: "functionCall", name: "datasize", args: [{ type: "stringLiteral", value: name }] },
        ...args,
      ],
    };
  }

  private transformBinaryExpression(node: BinaryExpression): YulExpression {
    const left = this.transformExpression(node.getLeft());
    const right = this.transformExpression(node.getRight());
    const operator = node.getOperatorToken().getText();

    // Check if either operand is a signed type for comparison operators
    const isSignedComparison = this.isSignedType(node.getLeft()) || this.isSignedType(node.getRight());

    const opMap: Record<string, string> = {
      "+": "add",
      "-": "sub",
      "*": "mul",
      "/": isSignedComparison ? "sdiv" : "div",
      "%": isSignedComparison ? "smod" : "mod",
      "<": isSignedComparison ? "slt" : "lt",
      ">": isSignedComparison ? "sgt" : "gt",
      "==": "eq",
      "===": "eq",
      "&&": "and",
      "||": "or",
      "**": "exp",
      // Bitwise operators
      "&": "and",
      "|": "or",
      "^": "xor",
    };

    // Handle << (left shift) - Yul shl takes (shift, value) but TS is value << shift
    if (operator === "<<") {
      return {
        type: "functionCall",
        name: "shl",
        args: [right, left], // reversed order for Yul
      };
    }

    // Handle >> (right shift) - Yul shr takes (shift, value) but TS is value >> shift
    if (operator === ">>") {
      return {
        type: "functionCall",
        name: "shr",
        args: [right, left], // reversed order for Yul
      };
    }

    // Handle !== and !=
    if (operator === "!==" || operator === "!=") {
      return {
        type: "functionCall",
        name: "iszero",
        args: [
          {
            type: "functionCall",
            name: "eq",
            args: [left, right],
          },
        ],
      };
    }

    // Handle <=
    if (operator === "<=") {
      return {
        type: "functionCall",
        name: "iszero",
        args: [
          {
            type: "functionCall",
            name: isSignedComparison ? "sgt" : "gt",
            args: [left, right],
          },
        ],
      };
    }

    // Handle >=
    if (operator === ">=") {
      return {
        type: "functionCall",
        name: "iszero",
        args: [
          {
            type: "functionCall",
            name: isSignedComparison ? "slt" : "lt",
            args: [left, right],
          },
        ],
      };
    }

    const yulOp = opMap[operator];
    if (!yulOp) {
      throw new Error(`Unsupported operator: ${operator}`);
    }

    return {
      type: "functionCall",
      name: yulOp,
      args: [left, right],
    };
  }

  /**
   * Try to transform a "using Library for Type" call.
   * When we see x.method(args) where x has type T and there's "using Library for T",
   * transform it to lib_Library_method(x, args).
   *
   * Returns null if not a using call.
   */
  private tryTransformUsingCall(
    obj: Node,
    methodName: string,
    callNode: CallExpression
  ): YulExpression | null {
    // Try to infer the type of the object
    const objType = this.inferExpressionType(obj);
    if (!objType) return null;

    // Check if this type has any using declarations
    const libraryNames = this.usingDeclarations.get(objType);
    if (!libraryNames || libraryNames.size === 0) return null;

    // Look for the method in any of the associated libraries
    for (const libName of libraryNames) {
      const libInfo = this.libraries.get(libName);
      if (!libInfo) continue;

      const methodInfo = libInfo.methods.get(methodName);
      if (methodInfo) {
        // Found the method - transform: x.method(args) -> lib_Library_method(x, args)
        const objExpr = this.transformExpression(obj);
        const args = callNode.getArguments().map((a) => this.transformExpression(a));

        return {
          type: "functionCall",
          name: `lib_${libName}_${methodName}`,
          args: [objExpr, ...args], // Prepend the object as first argument
        };
      }
    }

    return null;
  }

  /**
   * Try to infer the type of an expression for "using" declarations.
   * Returns the type name or null if can't determine.
   */
  private inferExpressionType(node: Node): string | null {
    // Identifier - look up type from variable declarations or parameters
    if (Node.isIdentifier(node)) {
      const name = node.getText();

      // Check if it's a local variable
      const symbol = node.getSymbol();
      if (symbol) {
        const declarations = symbol.getDeclarations();
        for (const decl of declarations) {
          if (Node.isVariableDeclaration(decl) || Node.isParameterDeclaration(decl)) {
            const typeNode = decl.getTypeNode?.();
            if (typeNode) {
              return typeNode.getText();
            }
          }
        }
      }

      // Could be a known type based on usage patterns
      return null;
    }

    // Property access on this - check storage type
    if (Node.isPropertyAccessExpression(node)) {
      const obj = node.getExpression();
      const propName = node.getName();

      if (Node.isThisExpression(obj)) {
        const storageInfo = this.storage.get(propName);
        if (storageInfo) {
          return storageInfo.type;
        }
      }
    }

    // Literal types
    if (Node.isNumericLiteral(node)) {
      return "u256";
    }

    return null;
  }

  /**
   * Try to transform a type conversion function call
   * Returns null if not a type conversion
   *
   * Examples:
   * - address(x) -> and(x, 0xffffffffffffffffffffffffffffffffffffffff)
   * - uint256(x) -> x (no change)
   * - uint160(x) -> and(x, mask_160)
   * - int256(x) -> x (no change)
   * - int128(x) -> signextend(15, x)
   * - bytes32(x) -> x
   * - bytes20(x) -> and(x, mask_160_left)
   */
  private tryTransformTypeConversion(name: string, args: YulExpression[]): YulExpression | null {
    if (args.length !== 1) {
      return null;
    }
    const arg = args[0]!;

    // address(x) - mask to 160 bits
    if (name === "address") {
      // 0xffffffffffffffffffffffffffffffffffffffff = 2^160 - 1
      const mask = (1n << 160n) - 1n;
      return {
        type: "functionCall",
        name: "and",
        args: [arg, { type: "literal", value: mask }],
      };
    }

    // payable(address) - no-op, just for type safety
    // Converts address to address payable (allows .transfer()/.send())
    if (name === "payable") {
      // At EVM level, address and address payable are the same
      // Just return the address unchanged
      return arg;
    }

    // uint<N>(x) - mask to N bits (for N < 256), or identity for uint256
    const uintMatch = name.match(/^uint(\d+)$/);
    if (uintMatch) {
      const bits = parseInt(uintMatch[1]!, 10);
      if (bits === 256) {
        // uint256(x) -> x (no change)
        return arg;
      }
      if (bits > 0 && bits < 256 && bits % 8 === 0) {
        // uint<N>(x) -> and(x, 2^N - 1)
        const mask = (1n << BigInt(bits)) - 1n;
        return {
          type: "functionCall",
          name: "and",
          args: [arg, { type: "literal", value: mask }],
        };
      }
    }

    // int<N>(x) - sign extend for N < 256, identity for int256
    const intMatch = name.match(/^int(\d+)$/);
    if (intMatch) {
      const bits = parseInt(intMatch[1]!, 10);
      if (bits === 256) {
        // int256(x) -> x (no change)
        return arg;
      }
      if (bits > 0 && bits < 256 && bits % 8 === 0) {
        // int<N>(x) -> signextend(N/8 - 1, x)
        const byteIndex = BigInt(bits / 8 - 1);
        return {
          type: "functionCall",
          name: "signextend",
          args: [{ type: "literal", value: byteIndex }, arg],
        };
      }
    }

    // bytes<N>(x) - left-aligned, mask high N bytes
    const bytesMatch = name.match(/^bytes(\d+)$/);
    if (bytesMatch) {
      const size = parseInt(bytesMatch[1]!, 10);
      if (size === 32) {
        // bytes32(x) -> x (no change)
        return arg;
      }
      if (size > 0 && size < 32) {
        // bytes<N>(x) -> and(x, mask) where mask has high N bytes set
        // For left-aligned bytes, mask = 0xff...ff000...00 (N bytes of 1s, rest 0s)
        const mask = ((1n << BigInt(size * 8)) - 1n) << BigInt((32 - size) * 8);
        return {
          type: "functionCall",
          name: "and",
          args: [arg, { type: "literal", value: mask }],
        };
      }
    }

    return null;
  }

  /**
   * Transform prefix unary: ++i, --i, !x
   * Note: ++i and --i as expressions return the new value
   */
  private transformPrefixUnary(node: Node): YulExpression {
    const prefixNode = node as import("ts-morph").PrefixUnaryExpression;
    const operand = prefixNode.getOperand();
    const operator = prefixNode.getOperatorToken();

    // !x -> iszero(x)
    if (operator === SyntaxKind.ExclamationToken) {
      return {
        type: "functionCall",
        name: "iszero",
        args: [this.transformExpression(operand)],
      };
    }

    // ++i -> add(i, 1) (Note: side effect handled separately in statement context)
    if (operator === SyntaxKind.PlusPlusToken) {
      return {
        type: "functionCall",
        name: "add",
        args: [this.transformExpression(operand), { type: "literal", value: 1n }],
      };
    }

    // --i -> sub(i, 1)
    if (operator === SyntaxKind.MinusMinusToken) {
      return {
        type: "functionCall",
        name: "sub",
        args: [this.transformExpression(operand), { type: "literal", value: 1n }],
      };
    }

    // -x -> sub(0, x)
    if (operator === SyntaxKind.MinusToken) {
      return {
        type: "functionCall",
        name: "sub",
        args: [{ type: "literal", value: 0n }, this.transformExpression(operand)],
      };
    }

    // ~x -> not(x) (bitwise NOT)
    if (operator === SyntaxKind.TildeToken) {
      return {
        type: "functionCall",
        name: "not",
        args: [this.transformExpression(operand)],
      };
    }

    throw new Error(`Unsupported prefix operator: ${SyntaxKind[operator]}`);
  }

  /**
   * Transform postfix unary: i++, i--
   * Note: For expression context, returns the original value
   * Side effects (increment) are handled in for loop post section
   */
  private transformPostfixUnary(node: Node): YulExpression {
    const postfixNode = node as import("ts-morph").PostfixUnaryExpression;
    const operand = postfixNode.getOperand();
    const operator = postfixNode.getOperatorToken();

    // For simple use in for loop incrementor, just return the operation
    // i++ -> add(i, 1)
    if (operator === SyntaxKind.PlusPlusToken) {
      const varExpr = this.transformExpression(operand);
      return {
        type: "functionCall",
        name: "add",
        args: [varExpr, { type: "literal", value: 1n }],
      };
    }

    // i-- -> sub(i, 1)
    if (operator === SyntaxKind.MinusMinusToken) {
      const varExpr = this.transformExpression(operand);
      return {
        type: "functionCall",
        name: "sub",
        args: [varExpr, { type: "literal", value: 1n }],
      };
    }

    throw new Error(`Unsupported postfix operator: ${SyntaxKind[operator]}`);
  }

  /**
   * Transform asm tagged template expression to raw Yul code
   * Supports:
   * - Simple templates: asm`let x := 42`
   * - Interpolated templates: asm`sstore(${slot}, ${value})`
   */
  private transformAsmTemplate(node: TaggedTemplateExpression): YulStatement {
    const template = node.getTemplate();

    // Simple template without interpolation: asm`code`
    if (Node.isNoSubstitutionTemplateLiteral(template)) {
      const code = template.getLiteralText();
      return { type: "rawCode", code };
    }

    // Template with interpolation: asm`code ${expr} more`
    if (Node.isTemplateExpression(template)) {
      const head = template.getHead().getLiteralText();
      const spans = template.getTemplateSpans();

      let code = head;
      for (const span of spans) {
        const expr = span.getExpression();
        const yulExpr = this.transformExpression(expr);
        // Convert YulExpression to string for inline use
        code += this.exprToString(yulExpr);
        code += span.getLiteral().getLiteralText();
      }

      return { type: "rawCode", code };
    }

    throw new Error("Unsupported asm template format");
  }

  /**
   * Transform conditional expression: cond ? a : b (ternary operator)
   * Uses the formula: xor(b, mul(xor(a, b), iszero(iszero(cond))))
   * - If cond != 0: result = xor(b, xor(a, b)) = a
   * - If cond == 0: result = xor(b, 0) = b
   */
  private transformConditionalExpression(node: ConditionalExpression): YulExpression {
    const cond = this.transformExpression(node.getCondition());
    const whenTrue = this.transformExpression(node.getWhenTrue());
    const whenFalse = this.transformExpression(node.getWhenFalse());

    // iszero(iszero(cond)) - normalize to 0 or 1
    const normalizedCond: YulExpression = {
      type: "functionCall",
      name: "iszero",
      args: [
        {
          type: "functionCall",
          name: "iszero",
          args: [cond],
        },
      ],
    };

    // xor(a, b)
    const xorAB: YulExpression = {
      type: "functionCall",
      name: "xor",
      args: [whenTrue, whenFalse],
    };

    // mul(xor(a, b), iszero(iszero(cond)))
    const mulPart: YulExpression = {
      type: "functionCall",
      name: "mul",
      args: [xorAB, normalizedCond],
    };

    // xor(b, mul(xor(a, b), iszero(iszero(cond))))
    return {
      type: "functionCall",
      name: "xor",
      args: [whenFalse, mulPart],
    };
  }

  /**
   * Convert YulExpression to string representation for use in raw code
   */
  private exprToString(expr: YulExpression): string {
    switch (expr.type) {
      case "literal":
        if (typeof expr.value === "bigint") {
          return expr.value.toString();
        }
        if (typeof expr.value === "boolean") {
          return expr.value ? "1" : "0";
        }
        // String value - check if already quoted
        if (expr.value.startsWith('"')) {
          return expr.value;
        }
        return `"${expr.value}"`;

      case "identifier":
        return expr.name;

      case "functionCall": {
        const args = expr.args.map((a) => this.exprToString(a)).join(", ");
        return `${expr.name}(${args})`;
      }
      default:
        throw new Error(`Unsupported expression type for string conversion: ${(expr as YulExpression).type}`);
    }
  }
}
