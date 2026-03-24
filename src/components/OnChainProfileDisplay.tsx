import { Calendar, Hash, Loader2, RefreshCw, Shield } from "lucide-react";
import { useOnChainProfile } from "../hooks/useOnChainProfile";

interface OnChainProfileDisplayProps {
  userAddress?: string;
}

const cardClass =
  "rounded-xl border bg-white dark:bg-[#0B140F] border-[rgba(0,107,79,0.12)] dark:border-[rgba(0,107,79,0.15)]";

const outlineButtonClass =
  "px-3 py-1.5 rounded-lg border border-[rgba(0,107,79,0.35)] dark:border-[rgba(74,222,128,0.25)] text-[#006B4F] dark:text-[#4ade80] bg-transparent hover:bg-[rgba(0,107,79,0.07)] transition-colors text-sm flex items-center gap-1 disabled:opacity-50";

export function OnChainProfileDisplay({
  userAddress,
}: OnChainProfileDisplayProps): JSX.Element {
  const {
    profile,
    loading,
    error,
    hasProfile,
    refreshProfile,
    testContractAccess,
  } = useOnChainProfile(userAddress);

  const handleTestContract = async (): Promise<void> => {
    const result = await testContractAccess();
    if (result) {
      alert("✅ Contract access test passed!");
    } else {
      alert("❌ Contract access test failed. Check console for details.");
    }
  };

  if (!userAddress) {
    return (
      <div className={cardClass}>
        <div className="p-5">
          <h3 className="flex items-center gap-2 text-lg font-semibold text-[#0A1A0F] dark:text-[#F0F7F3] mb-4">
            <Shield className="h-5 w-5" />
            On-Chain Health Profile
          </h3>
          <p className="text-[#6B8C7A]">
            Connect your wallet to view your on-chain health profile data.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={cardClass}>
      <div className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <Shield className="h-5 w-5 text-[#0A1A0F] dark:text-[#F0F7F3]" />
          <h3 className="text-lg font-semibold text-[#0A1A0F] dark:text-[#F0F7F3]">
            On-Chain Health Profile
          </h3>
          <div className="flex gap-2 ml-auto">
            <button
              className={outlineButtonClass}
              onClick={handleTestContract}
              disabled={loading}
            >
              Test Contract
            </button>
            <button
              className={outlineButtonClass}
              onClick={refreshProfile}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>

        {loading && (
          <div className="flex items-center gap-2 text-[#6B8C7A]">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading on-chain profile...
          </div>
        )}

        {error && (
          <div className="text-red-600 bg-red-50 dark:bg-red-950/20 dark:text-red-400 p-3 rounded-md">
            <strong>Error:</strong> {error}
          </div>
        )}

        {!loading && !error && !hasProfile && (
          <div className="text-center py-8">
            <Shield className="h-12 w-12 text-[#6B8C7A] mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2 text-[#0A1A0F] dark:text-[#F0F7F3]">
              No On-Chain Profile Found
            </h3>
            <p className="text-[#6B8C7A] mb-4">
              This wallet address doesn&apos;t have a health profile stored on
              the blockchain yet.
            </p>
            <p className="text-sm text-[#6B8C7A]">Address: {userAddress}</p>
          </div>
        )}

        {!loading && !error && hasProfile && profile && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                <Shield className="h-3 w-3" />
                Profile Verified on Blockchain
              </span>
              {profile.isActive && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[rgba(0,107,79,0.1)] text-[#006B4F] dark:bg-[rgba(74,222,128,0.1)] dark:text-[#4ade80]">
                  Active
                </span>
              )}
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border border-[rgba(0,107,79,0.25)] dark:border-[rgba(74,222,128,0.2)] text-[#0A1A0F] dark:text-[#F0F7F3]">
                V{profile.version}
              </span>
              {profile.encryptedEmail && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-700 text-purple-700 dark:text-purple-300">
                  Email
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-[#6B8C7A]" />
                  <span className="font-medium text-[#0A1A0F] dark:text-[#F0F7F3]">
                    Stored On:
                  </span>
                </div>
                <p className="text-sm text-[#6B8C7A]">
                  {new Date(profile.timestamp * 1000).toLocaleString()}
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Hash className="h-4 w-4 text-[#6B8C7A]" />
                  <span className="font-medium text-[#0A1A0F] dark:text-[#F0F7F3]">
                    Data Hash:
                  </span>
                </div>
                <p className="text-sm text-[#6B8C7A] font-mono break-all">
                  {profile.dataHash}
                </p>
              </div>
            </div>

            <div className="border-t border-[rgba(0,107,79,0.12)] dark:border-[rgba(0,107,79,0.15)] pt-4">
              <h4 className="font-medium mb-2 text-[#0A1A0F] dark:text-[#F0F7F3]">
                Encrypted Profile Data
              </h4>
              <div className="space-y-2 text-sm">
                <div>
                  <span className="font-medium text-[#0A1A0F] dark:text-[#F0F7F3]">
                    Birth Date:
                  </span>
                  <p className="text-[#6B8C7A] font-mono break-all">
                    {profile.encryptedBirthDate}
                  </p>
                </div>
                <div>
                  <span className="font-medium text-[#0A1A0F] dark:text-[#F0F7F3]">
                    Sex:
                  </span>
                  <p className="text-[#6B8C7A] font-mono break-all">
                    {profile.encryptedSex}
                  </p>
                </div>
                <div>
                  <span className="font-medium text-[#0A1A0F] dark:text-[#F0F7F3]">
                    Height:
                  </span>
                  <p className="text-[#6B8C7A] font-mono break-all">
                    {profile.encryptedHeight}
                  </p>
                </div>
                <div>
                  <span className="font-medium text-[#0A1A0F] dark:text-[#F0F7F3]">
                    Email:
                  </span>
                  <p className="text-[#6B8C7A] font-mono break-all">
                    {profile.encryptedEmail}
                  </p>
                </div>
                {profile.nonce && (
                  <div>
                    <span className="font-medium text-[#0A1A0F] dark:text-[#F0F7F3]">
                      Weight:
                    </span>
                    <p className="text-[#6B8C7A] font-mono break-all">
                      {profile.nonce}
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-blue-50 dark:bg-blue-950/20 p-4 rounded-md">
              <h4 className="font-medium text-blue-900 dark:text-blue-300 mb-2">
                🔐 Privacy Notice
              </h4>
              <p className="text-sm text-blue-800 dark:text-blue-400">
                Your health profile data is encrypted and stored on the
                blockchain. The encrypted data above cannot be read without your
                private key. This ensures your health information remains
                private while being verifiably stored on-chain.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
