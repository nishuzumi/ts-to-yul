import { describe, it, expect } from "vitest";
import { compileToYul } from "../../src/compiler.js";

describe("Events", () => {
  describe("Basic Event Declaration", () => {
    it("should compile contract with event declaration", () => {
      const source = `
        interface TransferEvent {
          from: indexed<address>;
          to: indexed<address>;
          value: u256;
        }

        export class Token {
          @event Transfer: Event<TransferEvent>;
          @storage balance: u256 = 0n;

          public dummy(): void {}
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toBeDefined();
    });

    it("should compile event with no indexed fields", () => {
      const source = `
        interface ValueChangedEvent {
          oldValue: u256;
          newValue: u256;
        }

        export class Storage {
          @event ValueChanged: Event<ValueChangedEvent>;
          @storage value: u256 = 0n;

          public dummy(): void {}
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toBeDefined();
    });
  });

  describe("Event Emission", () => {
    it("should compile event emission with indexed fields", () => {
      const source = `
        interface TransferEvent {
          from: indexed<address>;
          to: indexed<address>;
          value: u256;
        }

        export class Token {
          @event Transfer: Event<TransferEvent>;
          @storage balances: Mapping<address, u256>;

          public transfer(to: address, amount: u256): void {
            const sender = msg.sender;
            this.balances[sender] = this.balances[sender] - amount;
            this.balances[to] = this.balances[to] + amount;
            this.Transfer.emit({ from: sender, to, value: amount });
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      // Events use log opcodes - log3 for 2 indexed + topic0
      expect(result.yul).toContain("log");
    });

    it("should compile event emission with single indexed field", () => {
      const source = `
        interface DepositEvent {
          depositor: indexed<address>;
          amount: u256;
        }

        export class Vault {
          @event Deposit: Event<DepositEvent>;

          @payable
          public deposit(): void {
            this.Deposit.emit({ depositor: msg.sender, amount: msg.value });
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("log");
    });

    it("should compile event emission with no indexed fields", () => {
      const source = `
        interface UpdateEvent {
          oldValue: u256;
          newValue: u256;
        }

        export class Storage {
          @event Update: Event<UpdateEvent>;
          @storage value: u256 = 0n;

          public setValue(newVal: u256): void {
            const oldVal = this.value;
            this.value = newVal;
            this.Update.emit({ oldValue: oldVal, newValue: newVal });
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      // log1 for no indexed fields (just topic0)
      expect(result.yul).toContain("log");
    });

    it("should compile event emission with three indexed fields", () => {
      const source = `
        interface ApprovalEvent {
          owner: indexed<address>;
          spender: indexed<address>;
          tokenId: indexed<u256>;
        }

        export class NFT {
          @event Approval: Event<ApprovalEvent>;

          public approve(spender: address, tokenId: u256): void {
            this.Approval.emit({ owner: msg.sender, spender, tokenId });
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("log");
    });
  });

  describe("Multiple Events", () => {
    it("should compile contract with multiple event types", () => {
      const source = `
        interface TransferEvent {
          from: indexed<address>;
          to: indexed<address>;
          value: u256;
        }

        interface ApprovalEvent {
          owner: indexed<address>;
          spender: indexed<address>;
          value: u256;
        }

        export class ERC20 {
          @event Transfer: Event<TransferEvent>;
          @event Approval: Event<ApprovalEvent>;
          @storage balances: Mapping<address, u256>;
          @storage allowances: Mapping<address, Mapping<address, u256>>;

          public transfer(to: address, amount: u256): void {
            const sender = msg.sender;
            this.balances[sender] = this.balances[sender] - amount;
            this.balances[to] = this.balances[to] + amount;
            this.Transfer.emit({ from: sender, to, value: amount });
          }

          public approve(spender: address, amount: u256): void {
            const owner = msg.sender;
            this.allowances[owner][spender] = amount;
            this.Approval.emit({ owner, spender, value: amount });
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("log");
    });
  });

  describe("Event ABI Generation", () => {
    it("should generate ABI for events", () => {
      const source = `
        interface TransferEvent {
          from: indexed<address>;
          to: indexed<address>;
          value: u256;
        }

        export class Token {
          @event Transfer: Event<TransferEvent>;

          public dummy(): void {}
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.abi).toBeDefined();
      if (result.abi) {
        const eventAbi = result.abi.find((item: { type?: string; name?: string }) =>
          item.type === "event" && item.name === "Transfer"
        );
        expect(eventAbi).toBeDefined();
      }
    });

    it("should include indexed property in event ABI", () => {
      const source = `
        interface LogEvent {
          sender: indexed<address>;
          amount: u256;
        }

        export class Contract {
          @event Log: Event<LogEvent>;

          public dummy(): void {}
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.abi).toBeDefined();
      if (result.abi) {
        const eventAbi = result.abi.find((item: { type?: string; name?: string }) =>
          item.type === "event" && item.name === "Log"
        );
        expect(eventAbi).toBeDefined();
        if (eventAbi && "inputs" in eventAbi) {
          const inputs = eventAbi.inputs as Array<{ name: string; indexed?: boolean }>;
          const senderInput = inputs.find(i => i.name === "sender");
          expect(senderInput?.indexed).toBe(true);
        }
      }
    });
  });

  describe("Event with complex data types", () => {
    it("should compile event with bytes32 field", () => {
      const source = `
        interface HashEvent {
          hash: bytes32;
          sender: indexed<address>;
        }

        export class Hasher {
          @event Hash: Event<HashEvent>;

          public emitHash(h: bytes32): void {
            this.Hash.emit({ hash: h, sender: msg.sender });
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("log");
    });

    it("should compile event with bool field", () => {
      const source = `
        interface StatusEvent {
          active: bool;
          changer: indexed<address>;
        }

        export class Status {
          @event StatusChanged: Event<StatusEvent>;
          @storage isActive: bool = false;

          public toggle(): void {
            this.isActive = !this.isActive;
            this.StatusChanged.emit({ active: this.isActive, changer: msg.sender });
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("log");
    });
  });
});
