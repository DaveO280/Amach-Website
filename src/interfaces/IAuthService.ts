/**
 * IAuthService - Abstract interface for authentication and wallet operations
 *
 * Implementations:
 * - PrivyAuthService (web): Current Privy wallet implementation
 * - WalletConnectAuthService (iOS): Future native iOS WalletConnect
 * - MockAuthService (tests): Mock authentication for unit tests
 *
 * This abstraction allows:
 * - Easy testing with mock implementations
 * - Platform-specific auth (Privy vs WalletConnect native)
 * - Consistent API for auth operations
 */

export interface UserIdentity {
  /** Wallet address (primary identifier) */
  address: string;
  /** Chain ID */
  chainId: number;
  /** Display name (ENS, etc.) */
  displayName?: string;
  /** Email if available */
  email?: string;
}

export interface SignatureResult {
  signature: string;
  message: string;
  address: string;
}

export interface EncryptionKey {
  /** The derived encryption key */
  key: Uint8Array;
  /** Salt used for derivation */
  salt: Uint8Array;
  /** Version for future key rotation */
  version: number;
}

export interface AuthState {
  /** Whether auth is initialized and ready */
  isReady: boolean;
  /** Whether user is authenticated */
  isAuthenticated: boolean;
  /** Current user identity (null if not authenticated) */
  user: UserIdentity | null;
  /** Whether a login operation is in progress */
  isLoading: boolean;
}

export interface AuthEventHandlers {
  onConnect?: (user: UserIdentity) => void;
  onDisconnect?: () => void;
  onError?: (error: Error) => void;
  onStateChange?: (state: AuthState) => void;
}

/**
 * Abstract interface for authentication and wallet operations
 *
 * Handles wallet connection, signing, and encryption key derivation.
 * Implementations must be secure and never expose private keys.
 */
export interface IAuthService {
  // ============ State ============

  /**
   * Get current authentication state
   */
  getState(): AuthState;

  /**
   * Subscribe to auth state changes
   * @param handlers - Event handlers
   * @returns Unsubscribe function
   */
  subscribe(handlers: AuthEventHandlers): () => void;

  // ============ Authentication ============

  /**
   * Initialize the auth service
   * Must be called before other operations
   */
  initialize(): Promise<void>;

  /**
   * Connect wallet / login
   * @returns User identity on success
   */
  connect(): Promise<UserIdentity>;

  /**
   * Disconnect wallet / logout
   */
  disconnect(): Promise<void>;

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean;

  /**
   * Get current user identity
   * @throws if not authenticated
   */
  getUser(): UserIdentity;

  // ============ Signing ============

  /**
   * Sign a message with the connected wallet
   * @param message - Message to sign
   * @returns Signature result
   */
  signMessage(message: string): Promise<SignatureResult>;

  /**
   * Sign typed data (EIP-712)
   * @param domain - EIP-712 domain
   * @param types - EIP-712 types
   * @param value - Data to sign
   * @returns Signature
   */
  signTypedData(
    domain: Record<string, unknown>,
    types: Record<string, unknown>,
    value: Record<string, unknown>,
  ): Promise<string>;

  // ============ Encryption ============

  /**
   * Derive encryption key from wallet signature
   * Uses deterministic signature-based key derivation
   * @returns Encryption key
   */
  deriveEncryptionKey(): Promise<EncryptionKey>;

  /**
   * Get cached encryption key (if available)
   * Returns null if key needs to be derived
   */
  getCachedEncryptionKey(): EncryptionKey | null;

  /**
   * Clear cached encryption key
   */
  clearEncryptionKey(): void;

  // ============ Verification ============

  /**
   * Verify a signature was signed by an address
   * @param message - Original message
   * @param signature - Signature to verify
   * @param address - Expected signer address
   * @returns True if signature is valid
   */
  verifySignature(
    message: string,
    signature: string,
    address: string,
  ): Promise<boolean>;
}

/**
 * Factory function type for creating auth service instances
 */
export type AuthServiceFactory = () => IAuthService;
