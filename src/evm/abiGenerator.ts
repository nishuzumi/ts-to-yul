import type { ContractInfo, FunctionInfo, Parameter } from "../analyzer/index.js";
import type { EvmType } from "./types.js";
import { toSolidityType } from "./types.js";

/**
 * ABI types following Ethereum JSON ABI specification
 */
export interface AbiParameter {
  name: string;
  type: string;
  indexed?: boolean;
  components?: AbiParameter[];
}

export interface AbiFunctionItem {
  type: "function";
  name: string;
  inputs: AbiParameter[];
  outputs: AbiParameter[];
  stateMutability: "pure" | "view" | "nonpayable" | "payable";
}

export interface AbiEventItem {
  type: "event";
  name: string;
  inputs: AbiParameter[];
  anonymous?: boolean;
}

export interface AbiConstructorItem {
  type: "constructor";
  inputs: AbiParameter[];
  stateMutability: "nonpayable" | "payable";
}

export interface AbiReceiveItem {
  type: "receive";
  stateMutability: "payable";
}

export interface AbiFallbackItem {
  type: "fallback";
  stateMutability: "nonpayable" | "payable";
}

export interface AbiErrorItem {
  type: "error";
  name: string;
  inputs: AbiParameter[];
}

export type AbiItem =
  | AbiFunctionItem
  | AbiEventItem
  | AbiConstructorItem
  | AbiReceiveItem
  | AbiFallbackItem
  | AbiErrorItem;

/**
 * Event information for ABI generation
 */
export interface EventInfo {
  name: string;
  fields: EventField[];
}

export interface EventField {
  name: string;
  type: EvmType;
  indexed: boolean;
}

/**
 * Generate Ethereum ABI JSON from contract info
 */
export function generateAbi(contract: ContractInfo, events: EventInfo[] = []): AbiItem[] {
  const abi: AbiItem[] = [];

  // Add constructor
  if (contract.constructor) {
    abi.push(generateConstructorAbi(contract.constructor));
  }

  // Add functions
  for (const func of contract.functions) {
    if (func.visibility === "public") {
      abi.push(generateFunctionAbi(func));
    }
  }

  // Add events
  for (const event of events) {
    abi.push(generateEventAbi(event));
  }

  return abi;
}

/**
 * Generate ABI for constructor
 */
function generateConstructorAbi(ctor: FunctionInfo): AbiConstructorItem {
  return {
    type: "constructor",
    inputs: ctor.params.map(paramToAbiParam),
    stateMutability: ctor.mutability === "payable" ? "payable" : "nonpayable",
  };
}

/**
 * Generate ABI for function
 */
function generateFunctionAbi(func: FunctionInfo): AbiFunctionItem {
  const outputs: AbiParameter[] = [];

  if (func.returnType) {
    // Handle tuple return types - expand to multiple outputs
    if (func.returnType.kind === "tuple") {
      for (let i = 0; i < func.returnType.elements.length; i++) {
        outputs.push({
          name: "",
          type: toSolidityType(func.returnType.elements[i]!),
        });
      }
    } else {
      outputs.push({
        name: "",
        type: toSolidityType(func.returnType),
      });
    }
  }

  return {
    type: "function",
    name: func.name,
    inputs: func.params.map(paramToAbiParam),
    outputs,
    stateMutability: func.mutability,
  };
}

/**
 * Generate ABI for event
 */
function generateEventAbi(event: EventInfo): AbiEventItem {
  return {
    type: "event",
    name: event.name,
    inputs: event.fields.map((field) => ({
      name: field.name,
      type: toSolidityType(field.type),
      indexed: field.indexed,
    })),
  };
}

/**
 * Convert parameter to ABI parameter
 */
function paramToAbiParam(param: Parameter): AbiParameter {
  return {
    name: param.name,
    type: toSolidityType(param.type),
  };
}

/**
 * Serialize ABI to JSON string
 */
export function abiToJson(abi: AbiItem[], pretty = true): string {
  return JSON.stringify(abi, null, pretty ? 2 : undefined);
}
