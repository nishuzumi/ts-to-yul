/**
 * Interface definition - demonstrates interface feature
 * Corresponds to Solidity: interface ICallback { ... }
 */
import { u256, bool } from "../../../../runtime/index.js";

// ==================== FEATURE: interface ====================
// Interfaces define external function signatures without implementation
export interface ICallback {
  onCallback(data: u256): bool;
  onBatchCallback(items: u256[]): u256;
}
