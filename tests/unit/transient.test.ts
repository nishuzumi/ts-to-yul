import { describe, it, expect } from "vitest";
import { compileToYul } from "../../src/compiler.js";

describe("Transient Storage (@transient)", () => {
  describe("Basic transient storage", () => {
    it("should compile transient storage variable", () => {
      const source = `
        export class Test {
          @transient locked: bool = false;

          public lock(): void {
            this.locked = true;
          }

          public unlock(): void {
            this.locked = false;
          }

          public isLocked(): bool {
            return this.locked;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      // Transient storage uses tload/tstore instead of sload/sstore
      expect(result.yul).toContain("tstore");
      expect(result.yul).toContain("tload");
    });

    it("should compile transient u256 storage", () => {
      const source = `
        export class Test {
          @transient tempValue: u256 = 0n;

          public setTemp(val: u256): void {
            this.tempValue = val;
          }

          public getTemp(): u256 {
            return this.tempValue;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("tstore");
      expect(result.yul).toContain("tload");
    });

    it("should compile transient address storage", () => {
      const source = `
        export class Test {
          @transient tempOwner: address;

          public setTempOwner(addr: address): void {
            this.tempOwner = addr;
          }

          public getTempOwner(): address {
            return this.tempOwner;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("tstore");
      expect(result.yul).toContain("tload");
    });
  });

  describe("Mixed transient and persistent storage", () => {
    it("should compile contract with both transient and persistent storage", () => {
      const source = `
        export class ReentrancyGuard {
          @transient locked: bool = false;
          @storage counter: u256 = 0n;

          public enter(): void {
            if (this.locked) {
              revert("Reentrancy");
            }
            this.locked = true;
          }

          public exit(): void {
            this.locked = false;
          }

          public increment(): void {
            this.enter();
            this.counter = this.counter + 1n;
            this.exit();
          }

          public getCounter(): u256 {
            return this.counter;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      // Should have both tload/tstore and sload/sstore
      expect(result.yul).toContain("tstore");
      expect(result.yul).toContain("tload");
      expect(result.yul).toContain("sstore");
      expect(result.yul).toContain("sload");
    });

    it("should use correct opcodes for each storage type", () => {
      const source = `
        export class Test {
          @transient transientVal: u256 = 0n;
          @storage persistentVal: u256 = 0n;

          public setTransient(val: u256): void {
            this.transientVal = val;
          }

          public setPersistent(val: u256): void {
            this.persistentVal = val;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("tstore");
      expect(result.yul).toContain("sstore");
    });
  });

  describe("Transient storage in reentrancy guard pattern", () => {
    it("should compile typical reentrancy guard", () => {
      const source = `
        export class Vault {
          @transient locked: bool = false;
          @storage balances: Mapping<address, u256>;

          @payable
          public deposit(): void {
            if (this.locked) {
              revert("Reentrancy");
            }
            this.locked = true;

            const sender = msg.sender;
            this.balances[sender] = this.balances[sender] + msg.value;

            this.locked = false;
          }

          public withdraw(amount: u256): void {
            if (this.locked) {
              revert("Reentrancy");
            }
            this.locked = true;

            const sender = msg.sender;
            const balance = this.balances[sender];
            if (balance < amount) {
              revert("Insufficient balance");
            }

            this.balances[sender] = balance - amount;
            // Transfer logic would go here

            this.locked = false;
          }

          @view
          public getBalance(addr: address): u256 {
            return this.balances[addr];
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      // Transient storage for lock
      expect(result.yul).toContain("tstore");
      expect(result.yul).toContain("tload");
      // Persistent storage for balances
      expect(result.yul).toContain("sstore");
      expect(result.yul).toContain("sload");
    });
  });
});
