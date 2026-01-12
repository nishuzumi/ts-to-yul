import { describe, it, expect } from "vitest";
import { compileToYul } from "../../src/compiler.js";

describe("External Calls", () => {
  describe("typed external calls via interface", () => {
    it("should compile external call with 0 arguments", () => {
      const source = `
        interface IERC20 {
          totalSupply(): u256;
        }
        export class Test {
          public getSupply(token: address): u256 {
            return IERC20(token).totalSupply();
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("__call_0");
    });

    it("should compile external call with 1 argument", () => {
      const source = `
        interface IERC20 {
          balanceOf(account: address): u256;
        }
        export class Test {
          public getBalance(token: address, account: address): u256 {
            return IERC20(token).balanceOf(account);
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("__call_1");
    });

    it("should compile external call with 2 arguments", () => {
      const source = `
        interface IERC20 {
          approve(spender: address, amount: u256): bool;
        }
        export class Test {
          public doApprove(token: address, spender: address, amount: u256): bool {
            return IERC20(token).approve(spender, amount);
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("__call_2");
    });

    it("should compile external call with 3 arguments", () => {
      const source = `
        interface IERC20 {
          transferFrom(from: address, to: address, amount: u256): bool;
        }
        export class Test {
          public doTransferFrom(token: address, from: address, to: address, amount: u256): bool {
            return IERC20(token).transferFrom(from, to, amount);
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("__call_3");
    });

    it("should compile external call with 4 arguments", () => {
      const source = `
        interface IMultiSig {
          submitTransaction(to: address, value: u256, data: bytes32, nonce: u256): u256;
        }
        export class Test {
          public submit(ms: address, to: address, value: u256, data: bytes32, nonce: u256): u256 {
            return IMultiSig(ms).submitTransaction(to, value, data, nonce);
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("__call_4");
    });

    it("should compile external call with 5 arguments", () => {
      const source = `
        interface IComplex {
          complexCall(a: u256, b: u256, c: u256, d: u256, e: u256): u256;
        }
        export class Test {
          public callComplex(target: address, a: u256, b: u256, c: u256, d: u256, e: u256): u256 {
            return IComplex(target).complexCall(a, b, c, d, e);
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("__call_5");
    });
  });

  describe("call.call with array arguments", () => {
    it("should compile call.call with 3 arguments", () => {
      const source = `
        export class Test {
          public callExternal(target: address, from: address, to: address, amount: u256): u256 {
            return call.call<u256>(target, "transferFrom(address,address,uint256)", [from, to, amount]);
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      // call.call passes args directly to the existing helper
      expect(result.yul).toContain("__call");
    });

    it("should compile call.staticcall with 2 arguments", () => {
      const source = `
        export class Test {
          public staticCallExternal(target: address, owner: address, spender: address): u256 {
            return call.staticcall<u256>(target, "allowance(address,address)", [owner, spender]);
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("__staticcall");
    });
  });

  describe("helper function generation", () => {
    it("should generate __call_N helper with correct structure", () => {
      const source = `
        interface IERC20 {
          transferFrom(from: address, to: address, amount: u256): bool;
        }
        export class Test {
          public doTransferFrom(token: address, from: address, to: address, amount: u256): bool {
            return IERC20(token).transferFrom(from, to, amount);
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      // Should have function definition
      expect(result.yul).toContain("function __call_3(target, selector, arg0, arg1, arg2)");
      // Should store selector
      expect(result.yul).toContain("shl(224, selector)");
      // Should make call
      expect(result.yul).toContain("call(gas()");
    });

    it("should reuse helper for multiple calls with same arg count", () => {
      const source = `
        interface IERC20 {
          approve(spender: address, amount: u256): bool;
          increaseAllowance(spender: address, amount: u256): bool;
        }
        export class Test {
          public doubleApprove(token: address, spender: address, amount: u256): void {
            IERC20(token).approve(spender, amount);
            IERC20(token).increaseAllowance(spender, amount);
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      // Should have only one __call_2 definition
      const matches = result.yul?.match(/function __call_2/g) || [];
      expect(matches.length).toBe(1);
    });
  });

  describe("multiple argument counts in same contract", () => {
    it("should generate multiple helpers for different arg counts", () => {
      const source = `
        interface IERC20 {
          totalSupply(): u256;
          balanceOf(account: address): u256;
          approve(spender: address, amount: u256): bool;
          transferFrom(from: address, to: address, amount: u256): bool;
        }
        export class Test {
          public multiCall(token: address, account: address, spender: address, from: address, amount: u256): void {
            IERC20(token).totalSupply();
            IERC20(token).balanceOf(account);
            IERC20(token).approve(spender, amount);
            IERC20(token).transferFrom(from, spender, amount);
          }
        }
      `;
      const result = compileToYul(source);
      expect(result.errors).toHaveLength(0);
      expect(result.yul).toContain("__call_0");
      expect(result.yul).toContain("__call_1");
      expect(result.yul).toContain("__call_2");
      expect(result.yul).toContain("__call_3");
    });
  });
});
