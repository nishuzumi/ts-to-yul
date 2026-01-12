import { describe, it, expect } from "vitest";
import { compileToYul } from "../../src/compiler.js";

describe("Address Members", () => {
  describe("Properties", () => {
    it("should compile address.balance", () => {
      const source = `
        export class Test {
          public getBalance(addr: address): u256 {
            return addr.balance;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("balance(");
    });

    it("should compile address.code", () => {
      const source = `
        export class Test {
          public getCodeSize(addr: address): u256 {
            return addr.code;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("extcodesize(");
    });

    it("should compile address.codehash", () => {
      const source = `
        export class Test {
          public getCodeHash(addr: address): bytes32 {
            return addr.codehash;
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("extcodehash(");
    });
  });

  describe("Transfer Methods", () => {
    it("should compile transfer", () => {
      const source = `
        export class Test {
          @payable
          public send(to: addressPayable, amount: u256): void {
            to.transfer(amount);
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("call(");
    });

    it("should compile send", () => {
      const source = `
        export class Test {
          @payable
          public trySend(to: addressPayable, amount: u256): bool {
            return to.send(amount);
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("call(");
    });
  });

  describe("Low-level Calls", () => {
    it("should compile call.call", () => {
      const source = `
        interface IExternal {
          getValue(): u256;
        }

        export class Test {
          public callExternal(target: address): u256 {
            return call.call<u256>(target, "getValue()", []);
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
    });

    it("should compile call.staticcall", () => {
      const source = `
        export class Test {
          public staticCall(target: address, value: u256): u256 {
            return call.staticcall<u256>(target, "balanceOf(address)", [value]);
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("staticcall(");
    });

    it("should compile call.delegatecall", () => {
      const source = `
        export class Test {
          public delegateCall(target: address, a: u256, b: u256): u256 {
            return call.delegatecall<u256>(target, "add(uint256,uint256)", [a, b]);
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("delegatecall(");
    });
  });
});
