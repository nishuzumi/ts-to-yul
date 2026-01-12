#!/usr/bin/env node

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { compileFromFile, compileToYulFromFile } from "./compiler.js";

interface CliArgs {
  command: "compile" | "build" | "help" | "version";
  input: string | undefined;
  output: string | undefined;
  abiOutput: string | undefined;
  optimize: boolean;
  showAbi: boolean;
}

const DEFAULT_ARGS: CliArgs = {
  command: "help",
  input: undefined,
  output: undefined,
  abiOutput: undefined,
  optimize: false,
  showAbi: false,
};

function parseArgs(args: string[]): CliArgs {
  const command = args[0] as CliArgs["command"] | undefined;

  if (!command || command === "help" || args.includes("--help") || args.includes("-h")) {
    return DEFAULT_ARGS;
  }

  if (command === "version" || args.includes("--version") || args.includes("-v")) {
    return { ...DEFAULT_ARGS, command: "version" };
  }

  if (command !== "compile" && command !== "build") {
    console.error(`Unknown command: ${command}`);
    return DEFAULT_ARGS;
  }

  let output: string | undefined;
  let abiOutput: string | undefined;
  let optimize = false;
  let showAbi = false;

  for (let i = 2; i < args.length; i++) {
    const arg = args[i];
    if (arg === "-o" || arg === "--output") {
      output = args[++i];
    } else if (arg === "-O" || arg === "--optimize") {
      optimize = true;
    } else if (arg === "--abi") {
      const next = args[i + 1];
      if (next && !next.startsWith("-")) {
        abiOutput = args[++i];
      } else {
        showAbi = true;
      }
    }
  }

  return { command, input: args[1], output, abiOutput, optimize, showAbi };
}

function printHelp(): void {
  console.log(`
ts-to-yul - Compile TypeScript smart contracts to Yul/EVM bytecode

USAGE:
  ts-to-yul <command> [options]

COMMANDS:
  compile <file.ts>    Compile TypeScript to Yul
  build <file.ts>      Compile TypeScript to EVM bytecode (requires solc)
  help                 Show this help message
  version              Show version

OPTIONS:
  -o, --output <file>  Output file path
  --abi [file]         Output ABI JSON (to stdout or file if specified)
  -O, --optimize       Enable solc optimizer (build only)
  -h, --help           Show help
  -v, --version        Show version

EXAMPLES:
  ts-to-yul compile counter.ts
  ts-to-yul compile counter.ts -o counter.yul
  ts-to-yul compile counter.ts --abi counter.json
  ts-to-yul build counter.ts -O -o counter.bin --abi
`);
}

function printVersion(): void {
  console.log("ts-to-yul v0.1.0");
}

function handleErrors(errors: string[]): never {
  console.error("Compilation errors:");
  errors.forEach((e) => console.error(`  ${e}`));
  process.exit(1);
}

function outputAbi(abi: unknown[], args: CliArgs): void {
  const abiJson = JSON.stringify(abi, null, 2);
  if (args.abiOutput) {
    writeFileSync(args.abiOutput, abiJson);
    console.log(`ABI written to ${args.abiOutput}`);
  } else if (args.showAbi) {
    console.log(abiJson);
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.command === "help") {
    printHelp();
    return;
  }

  if (args.command === "version") {
    printVersion();
    return;
  }

  if (!args.input) {
    console.error("Error: No input file specified");
    process.exit(1);
  }

  const inputPath = resolve(args.input);

  if (args.command === "compile") {
    const result = compileToYulFromFile(inputPath);
    if (result.errors.length > 0) handleErrors(result.errors);

    if (args.output) {
      writeFileSync(args.output, result.yul);
      console.log(`Compiled to ${args.output}`);
    } else if (!args.showAbi && !args.abiOutput) {
      console.log(result.yul);
    }

    outputAbi(result.abi, args);
    return;
  }

  if (args.command === "build") {
    const result = await compileFromFile(inputPath, { optimize: args.optimize });
    if (result.errors.length > 0) handleErrors(result.errors);

    if (args.output) {
      writeFileSync(args.output, result.bytecode);
      console.log(`Built to ${args.output}`);
    } else if (!args.showAbi && !args.abiOutput) {
      console.log(result.bytecode);
    }

    outputAbi(result.abi, args);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
