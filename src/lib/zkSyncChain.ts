/**
 * Shared zkSync chain configuration
 * Used by both SSO and Privy wallet services
 *
 * @deprecated Use networkConfig from @/lib/networkConfig instead
 * This file is kept for backward compatibility
 */

// Re-export from networkConfig for backward compatibility
export { zkSyncSepoliaTestnet, zkSyncMainnet } from "./networkConfig";
export { getActiveChain, getCurrentNetwork } from "./networkConfig";
