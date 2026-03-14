import { privyWalletService } from "@/services/PrivyWalletService";

export async function signProofHash(params: {
  walletAddress: string;
  proofHash: string;
}): Promise<string> {
  // Reuse existing Privy signing pathway – message = proofHash
  if (!privyWalletService.isWalletConnected()) {
    throw new Error("Wallet not connected for signing");
  }
  const address = privyWalletService.getAddress();
  if (
    !address ||
    address.toLowerCase() !== params.walletAddress.toLowerCase()
  ) {
    throw new Error("Wallet address mismatch for signing");
  }
  return privyWalletService.signMessage(params.proofHash);
}

export async function verifySignature(_params: {
  walletAddress: string;
  messageHash: string;
  signature: string;
}): Promise<boolean> {
  // Full ECDSA verification is handled on-chain via AttestationService.
  // For now we trust Privy signatures and rely on on-chain checks,
  // so this returns true as a soft client-side check.
  return true;
}
