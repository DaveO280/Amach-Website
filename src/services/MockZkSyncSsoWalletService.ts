// Mock service for testing - bypasses blockchain calls
export class MockZkSyncSsoWalletService {
  private mockAccount = {
    address: "0x1234567890123456789012345678901234567890" as `0x${string}`,
    isConnected: true,
  };

  private mockHealthProfile = {
    encryptedBirthDate: "mock_encrypted_birth" as `0x${string}`,
    encryptedSex: "mock_encrypted_sex" as `0x${string}`,
    encryptedHeight: "mock_encrypted_height" as `0x${string}`,
    encryptedWeight: "mock_encrypted_weight" as `0x${string}`,
    encryptedEmail: "mock_encrypted_email" as `0x${string}`,
    dataHash:
      "0x1234567890123456789012345678901234567890123456789012345678901234" as `0x${string}`,
    timestamp: Date.now(),
    isActive: true,
    version: 1,
    zkProofHash:
      "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`,
  };

  async connect(): Promise<{ success: boolean; error?: string }> {
    console.log("🔧 MOCK: Wallet connected");
    return { success: true };
  }

  async verifyProfileZKsync(
    email: string,
  ): Promise<{ success: boolean; txHash?: string; error?: string }> {
    console.log(`🔧 MOCK: Profile verified for ${email}`);
    return { success: true, txHash: "0xmock_verification_hash" };
  }

  async claimAllocation(): Promise<{
    success: boolean;
    txHash?: string;
    error?: string;
  }> {
    console.log("🔧 MOCK: Allocation claimed");
    return { success: true, txHash: "0xmock_claim_hash" };
  }

  async createHealthProfile(
    profile: Record<string, unknown>,
  ): Promise<{ success: boolean; txHash?: string; error?: string }> {
    console.log("🔧 MOCK: Health profile created", profile);
    return { success: true, txHash: "0xmock_profile_hash" };
  }

  get account(): { address: `0x${string}`; isConnected: boolean } {
    return this.mockAccount;
  }
  get isConnected(): boolean {
    return true;
  }
  get healthProfile(): typeof this.mockHealthProfile {
    return this.mockHealthProfile;
  }
}
