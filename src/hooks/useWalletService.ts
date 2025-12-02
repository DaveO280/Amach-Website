/**
 * Unified Wallet Service Hook
 *
 * Now uses Privy exclusively (SSO code has been removed)
 */

import {
  usePrivyWalletService,
  type PrivyWalletServiceReturn,
} from "./usePrivyWalletService";

// Export Privy service return type as the unified type
export type UnifiedWalletServiceReturn = PrivyWalletServiceReturn;

/**
 * Unified wallet service hook
 * Uses Privy for all wallet operations
 */
export function useWalletService(): UnifiedWalletServiceReturn {
  return usePrivyWalletService();
}

// Re-export types for convenience
export type { PrivyWalletServiceReturn } from "./usePrivyWalletService";
