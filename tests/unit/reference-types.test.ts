import { describe, it, expect } from "vitest";
import { compileToYul } from "../../src/compiler.js";

describe("Reference Types", () => {
  describe("Mapping", () => {
    it("should compile simple mapping", () => {
      const source = `
        export class Test {
          @storage balances: Mapping<address, u256> = {};

          public set(addr: address, amount: u256): void {
            this.balances[addr] = amount;
          }

          public get(addr: address): u256 {
            return this.balances[addr];
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("keccak256");
      expect(result.yul).toContain("__mapping_slot");
    });

    it("should compile nested mapping", () => {
      const source = `
        export class Test {
          @storage allowances: Mapping<address, Mapping<address, u256>> = {};

          public approve(owner: address, spender: address, amount: u256): void {
            this.allowances[owner][spender] = amount;
          }

          public allowance(owner: address, spender: address): u256 {
            return this.allowances[owner][spender];
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      // Nested mapping should use multiple keccak256 calls
      expect(result.yul).toContain("keccak256");
    });

    it("should compile mapping with bytes32 key", () => {
      const source = `
        export class Test {
          @storage data: Mapping<bytes32, u256> = {};

          public set(key: bytes32, value: u256): void {
            this.data[key] = value;
          }

          public get(key: bytes32): u256 {
            return this.data[key];
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe("StorageArray", () => {
    it("should compile dynamic array", () => {
      const source = `
        export class Test {
          @storage items: StorageArray<u256> = [] as unknown as StorageArray<u256>;

          public push(value: u256): void {
            this.items.push(value);
          }

          public pop(): u256 {
            return this.items.pop();
          }

          public length(): u256 {
            return this.items.length;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      // Array push is inlined, check for the pattern
      expect(result.yul).toContain("keccak256");
      expect(result.yul).toContain("__array_pop");
    });

    it("should compile array index access", () => {
      const source = `
        export class Test {
          @storage items: StorageArray<u256> = [] as unknown as StorageArray<u256>;

          public get(index: u256): u256 {
            return this.items[index];
          }

          public set(index: u256, value: u256): void {
            this.items[index] = value;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("__array_slot");
    });

    it("should compile array of addresses", () => {
      const source = `
        export class Test {
          @storage owners: StorageArray<address> = [] as unknown as StorageArray<address>;

          public addOwner(addr: address): void {
            this.owners.push(addr);
          }

          public getOwner(index: u256): address {
            return this.owners[index];
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe("Fixed Array", () => {
    it("should compile fixed size array", () => {
      // Fixed arrays use native TS syntax: u256[10]
      // The compiler recognizes this pattern
      const source = `
        export class Test {
          // @ts-ignore - Fixed array syntax
          @storage values: u256[10];

          public get(index: u256): u256 {
            return this.values[index];
          }

          public set(index: u256, value: u256): void {
            this.values[index] = value;
          }
        }
      `;
      const result = compileToYul(source);
      // Fixed arrays allocate consecutive slots
      expect(result.yul).toContain("sload");
      expect(result.yul).toContain("sstore");
    });
  });

  describe("StorageBytes", () => {
    it("should compile dynamic bytes", () => {
      const source = `
        export class Test {
          @storage data: StorageBytes = {} as StorageBytes;

          public getLength(): u256 {
            return this.data.length;
          }

          public push(b: u8): void {
            this.data.push(b);
          }

          public pop(): u8 {
            return this.data.pop();
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("__bytes_push");
      expect(result.yul).toContain("__bytes_pop");
    });

    it("should compile bytes index access", () => {
      const source = `
        export class Test {
          @storage data: StorageBytes = {} as StorageBytes;

          public getByte(index: u256): u8 {
            return this.data[index];
          }

          public setByte(index: u256, value: u8): void {
            this.data[index] = value;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("__bytes_load");
      expect(result.yul).toContain("__bytes_store");
    });
  });

  describe("StorageString", () => {
    it("should compile dynamic string", () => {
      const source = `
        export class Test {
          @storage name: StorageString = {} as StorageString;

          public getLength(): u256 {
            return this.name.length;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe("Struct", () => {
    it("should compile struct type", () => {
      const source = `
        interface User {
          balance: u256;
          active: bool;
        }

        export class Test {
          @storage user: User = { balance: 0n, active: false } as unknown as User;

          public setBalance(amount: u256): void {
            this.user.balance = amount;
          }

          public getBalance(): u256 {
            return this.user.balance;
          }

          public setActive(flag: bool): void {
            this.user.active = flag;
          }

          public isActive(): bool {
            return this.user.active;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
    });

    it("should compile struct with address field", () => {
      const source = `
        interface Account {
          owner: address;
          balance: u256;
        }

        export class Test {
          @storage account: Account = { owner: 0x0 as address, balance: 0n } as unknown as Account;

          public setOwner(addr: address): void {
            this.account.owner = addr;
          }

          public getOwner(): address {
            return this.account.owner;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
    });

    it("should compile mapping to struct", () => {
      const source = `
        interface Balance {
          amount: u256;
          locked: bool;
        }

        export class Test {
          @storage balances: Mapping<address, Balance> = {};

          public setAmount(addr: address, amount: u256): void {
            this.balances[addr].amount = amount;
          }

          public getAmount(addr: address): u256 {
            return this.balances[addr].amount;
          }

          public setLocked(addr: address, flag: bool): void {
            this.balances[addr].locked = flag;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
    });

    it("should compile nested struct", () => {
      const source = `
        interface Inner {
          value: u256;
        }

        interface Outer {
          inner: Inner;
          count: u256;
        }

        export class Test {
          @storage data: Outer = { inner: { value: 0n }, count: 0n } as unknown as Outer;

          public setInnerValue(v: u256): void {
            this.data.inner.value = v;
          }

          public getInnerValue(): u256 {
            return this.data.inner.value;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
    });
  });
});
