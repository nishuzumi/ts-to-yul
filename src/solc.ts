import { execSync, execFileSync } from "node:child_process";
import { writeFileSync, unlinkSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

/**
 * Invoke solc to compile Yul code to bytecode
 */
export async function invokeSolc(yulCode: string, optimize = false): Promise<string> {
  // Create temp file
  const tempDir = mkdtempSync(join(tmpdir(), "ts-to-yul-"));
  const tempFile = join(tempDir, "contract.yul");

  try {
    writeFileSync(tempFile, yulCode);

    // Build solc command as array (safer than string interpolation)
    const args = ["--strict-assembly"];
    if (optimize) {
      args.push("--optimize");
    }
    args.push("--bin", tempFile);

    // Execute solc using execFileSync (avoids shell injection)
    const output = execFileSync("solc", args, { encoding: "utf-8" });

    // Extract bytecode from output
    const bytecode = extractBytecode(output);
    if (!bytecode) {
      throw new Error("Failed to extract bytecode from solc output");
    }

    return "0x" + bytecode;
  } finally {
    // Cleanup
    try {
      unlinkSync(tempFile);
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Extract bytecode from solc output
 */
function extractBytecode(output: string): string | null {
  // solc output format:
  // Binary representation:
  // <hex bytecode>
  const lines = output.split("\n");
  let foundBinary = false;

  for (const line of lines) {
    if (line.includes("Binary") && line.includes(":")) {
      foundBinary = true;
      continue;
    }
    if (foundBinary) {
      const trimmed = line.trim();
      if (trimmed && /^[0-9a-fA-F]+$/.test(trimmed)) {
        return trimmed;
      }
    }
  }

  return null;
}

/**
 * Check if solc is available
 */
export function checkSolc(): boolean {
  try {
    execSync("solc --version", { encoding: "utf-8" });
    return true;
  } catch {
    return false;
  }
}
