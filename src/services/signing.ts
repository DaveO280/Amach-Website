import { privateKeyToAccount } from "viem/accounts";
import { verifyMessage } from "viem";

/**
 * Sign a proof hash using the server-side wallet (PRIVATE_KEY).
 * This runs in API routes where the browser Privy wallet is not available.
 */
export async function signProofHash(params: {
  walletAddress: string;
  proofHash: string;
}): Promise<string> {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    throw new Error(
      "PRIVATE_KEY not configured — cannot sign proofs server-side",
    );
  }

  const formattedKey = (
    privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`
  ) as `0x${string}`;
  const account = privateKeyToAccount(formattedKey);

  // The server wallet acts as the attester/signer for all proofs.
  // The proof document still records the user's walletAddress as the prover,
  // and the server signature attests that the server verified the claim.
  const signature = await account.signMessage({ message: params.proofHash });
  return signature;
}

/**
 * Verify an ECDSA signature over a proof hash.
 * Recovers the signer address and compares it against both the user's
 * wallet and the server attester wallet.
 */
export async function verifySignature(params: {
  walletAddress: string;
  messageHash: string;
  signature: string;
}): Promise<boolean> {
  try {
    // Try verifying against the user's wallet address first
    const validForUser = await verifyMessage({
      address: params.walletAddress as `0x${string}`,
      message: params.messageHash,
      signature: params.signature as `0x${string}`,
    });

    if (validForUser) return true;

    // Also accept server-attester signatures (proofs signed by the backend)
    const privateKey = process.env.PRIVATE_KEY;
    if (privateKey) {
      const formattedKey = (
        privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`
      ) as `0x${string}`;
      const serverAccount = privateKeyToAccount(formattedKey);

      const validForServer = await verifyMessage({
        address: serverAccount.address,
        message: params.messageHash,
        signature: params.signature as `0x${string}`,
      });

      if (validForServer) return true;
    }

    return false;
  } catch (error) {
    console.error("[Signing] verifySignature error:", error);
    return false;
  }
}

/**
 * Get the server attester wallet address (derived from PRIVATE_KEY).
 * Useful for recording who signed the proof.
 */
export function getServerAttesterAddress(): string | null {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) return null;

  const formattedKey = (
    privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`
  ) as `0x${string}`;
  const account = privateKeyToAccount(formattedKey);
  return account.address;
}
