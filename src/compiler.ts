import type { SourceFile, ClassDeclaration } from "ts-morph";
import { Parser } from "./parser/index.js";
import { Transformer } from "./transformer/index.js";
import { Printer } from "./yul/printer.js";
import { invokeSolc } from "./solc.js";
import { Analyzer } from "./analyzer/index.js";
import { generateAbi, type AbiItem } from "./evm/abiGenerator.js";

export interface CompileOptions {
  optimize?: boolean;
}

export interface CompileResult {
  yul: string;
  bytecode: string;
  abi: AbiItem[];
  errors: string[];
}

export interface YulResult {
  yul: string;
  abi: AbiItem[];
  errors: string[];
}

function transformToYul(sourceFile: SourceFile, contracts: ClassDeclaration[]): YulResult {
  const analyzer = new Analyzer();
  const contractInfos = analyzer.analyze(sourceFile);
  const contractInfo = contractInfos[0]!;

  const transformer = new Transformer();
  const yulObject = transformer.transform(contracts[0]!);

  const events = transformer.getEvents().map((e) => ({
    name: e.name,
    fields: e.fields,
  }));

  const abi = generateAbi(contractInfo, events);
  const printer = new Printer();
  const yul = printer.print(yulObject);

  return { yul, abi, errors: [] };
}

export function compileToYul(source: string): YulResult {
  try {
    const parser = new Parser();
    const sourceFile = parser.parse(source);
    const contracts = parser.getContracts(sourceFile);

    if (contracts.length === 0) {
      return {
        yul: "",
        abi: [],
        errors: ["No contract found. Export a class to define a contract."],
      };
    }

    return transformToYul(sourceFile, contracts);
  } catch (err) {
    return {
      yul: "",
      abi: [],
      errors: [err instanceof Error ? err.message : String(err)],
    };
  }
}

export function compileToYulFromFile(filePath: string): YulResult {
  try {
    const parser = new Parser(true);
    const sourceFile = parser.parseFile(filePath);
    const contracts = parser.getContracts(sourceFile);

    if (contracts.length === 0) {
      return {
        yul: "",
        abi: [],
        errors: ["No contract found. Export a class to define a contract."],
      };
    }

    return transformToYul(sourceFile, contracts);
  } catch (err) {
    return {
      yul: "",
      abi: [],
      errors: [err instanceof Error ? err.message : String(err)],
    };
  }
}

async function compileToBytecode(yulResult: YulResult, optimize: boolean): Promise<CompileResult> {
  if (yulResult.errors.length > 0) {
    return { yul: yulResult.yul, bytecode: "", abi: yulResult.abi, errors: yulResult.errors };
  }

  try {
    const bytecode = await invokeSolc(yulResult.yul, optimize);
    return { yul: yulResult.yul, bytecode, abi: yulResult.abi, errors: [] };
  } catch (err) {
    return {
      yul: yulResult.yul,
      bytecode: "",
      abi: yulResult.abi,
      errors: [err instanceof Error ? err.message : String(err)],
    };
  }
}

export function compile(source: string, options: CompileOptions = {}): Promise<CompileResult> {
  return compileToBytecode(compileToYul(source), options.optimize ?? false);
}

export function compileFromFile(
  filePath: string,
  options: CompileOptions = {}
): Promise<CompileResult> {
  return compileToBytecode(compileToYulFromFile(filePath), options.optimize ?? false);
}
