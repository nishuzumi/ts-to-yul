import { describe, it, expect } from "vitest";
import { compileToYul } from "../../src/compiler.js";

describe("Global Variables", () => {
  describe("Block Properties", () => {
    it("should compile block.timestamp", () => {
      const source = `
        export class Test {
          public getTimestamp(): u256 {
            return block.timestamp;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("timestamp()");
    });

    it("should compile block.number", () => {
      const source = `
        export class Test {
          public getBlockNumber(): u256 {
            return block.number;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("number()");
    });

    it("should compile block.chainid", () => {
      const source = `
        export class Test {
          public getChainId(): u256 {
            return block.chainid;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("chainid()");
    });

    it("should compile block.coinbase", () => {
      const source = `
        export class Test {
          public getCoinbase(): address {
            return block.coinbase;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("coinbase()");
    });

    it("should compile block.basefee", () => {
      const source = `
        export class Test {
          public getBaseFee(): u256 {
            return block.basefee;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("basefee()");
    });

    it("should compile block.gaslimit", () => {
      const source = `
        export class Test {
          public getGasLimit(): u256 {
            return block.gaslimit;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("gaslimit()");
    });

    it("should compile block.difficulty", () => {
      // Note: After EIP-4399 (The Merge), difficulty() became prevrandao()
      const source = `
        export class Test {
          public getDifficulty(): u256 {
            return block.difficulty;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      // Post-merge: difficulty maps to prevrandao
      expect(result.yul).toContain("prevrandao()");
    });

    it("should compile block.prevrandao", () => {
      const source = `
        export class Test {
          public getPrevRandao(): u256 {
            return block.prevrandao;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("prevrandao()");
    });

    it("should compile block.blobbasefee", () => {
      const source = `
        export class Test {
          public getBlobBaseFee(): u256 {
            return block.blobbasefee;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("blobbasefee()");
    });
  });

  describe("Message Properties", () => {
    it("should compile msg.sender", () => {
      const source = `
        export class Test {
          public getSender(): address {
            return msg.sender;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("caller()");
    });

    it("should compile msg.value", () => {
      const source = `
        export class Test {
          @payable
          public getValue(): u256 {
            return msg.value;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("callvalue()");
    });

    it("should compile msg.data", () => {
      const source = `
        export class Test {
          public getData(): u256 {
            return msg.data;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("__msg_data");
    });

    it("should compile msg.sig", () => {
      const source = `
        export class Test {
          public getSig(): bytes4 {
            return msg.sig;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("calldataload(0)");
    });
  });

  describe("Transaction Properties", () => {
    it("should compile tx.origin", () => {
      const source = `
        export class Test {
          public getOrigin(): address {
            return tx.origin;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("origin()");
    });

    it("should compile tx.gasprice", () => {
      const source = `
        export class Test {
          public getGasPrice(): u256 {
            return tx.gasprice;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("gasprice()");
    });
  });

  describe("Global Functions", () => {
    it("should compile blockhash()", () => {
      const source = `
        export class Test {
          public getBlockHash(blockNum: u256): bytes32 {
            return blockhash(blockNum);
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("blockhash(");
    });

    it("should compile gasleft()", () => {
      const source = `
        export class Test {
          public getGasLeft(): u256 {
            return gasleft();
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("gas()");
    });

    it("should compile blobhash()", () => {
      const source = `
        export class Test {
          public getBlobHash(index: u256): bytes32 {
            return blobhash(index);
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("blobhash(");
    });
  });
});
