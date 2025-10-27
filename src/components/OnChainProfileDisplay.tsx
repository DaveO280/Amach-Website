import { Calendar, Hash, Loader2, RefreshCw, Shield } from "lucide-react";
import { useOnChainProfile } from "../hooks/useOnChainProfile";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

interface OnChainProfileDisplayProps {
  userAddress?: string;
}

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
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            On-Chain Health Profile
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Connect your wallet to view your on-chain health profile data.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          On-Chain Health Profile
          <div className="flex gap-2 ml-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={handleTestContract}
              disabled={loading}
            >
              Test Contract
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={refreshProfile}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading on-chain profile...
          </div>
        )}

        {error && (
          <div className="text-red-600 bg-red-50 p-3 rounded-md">
            <strong>Error:</strong> {error}
          </div>
        )}

        {!loading && !error && !hasProfile && (
          <div className="text-center py-8">
            <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">
              No On-Chain Profile Found
            </h3>
            <p className="text-muted-foreground mb-4">
              This wallet address doesn&apos;t have a health profile stored on
              the blockchain yet.
            </p>
            <p className="text-sm text-muted-foreground">
              Address: {userAddress}
            </p>
          </div>
        )}

        {!loading && !error && hasProfile && profile && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Badge variant="default" className="bg-green-100 text-green-800">
                <Shield className="h-3 w-3 mr-1" />
                Profile Verified on Blockchain
              </Badge>
              {profile.isActive && <Badge variant="secondary">Active</Badge>}
              <Badge variant="outline">V{profile.version}</Badge>
              {profile.hasWeight && (
                <Badge variant="outline" className="bg-blue-50">
                  Weight
                </Badge>
              )}
              {profile.hasEmail && (
                <Badge variant="outline" className="bg-purple-50">
                  Email
                </Badge>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">Stored On:</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {new Date(profile.timestamp * 1000).toLocaleString()}
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Hash className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">Data Hash:</span>
                </div>
                <p className="text-sm text-muted-foreground font-mono break-all">
                  {profile.dataHash}
                </p>
              </div>
            </div>

            <div className="border-t pt-4">
              <h4 className="font-medium mb-2">Encrypted Profile Data</h4>
              <div className="space-y-2 text-sm">
                <div>
                  <span className="font-medium">Birth Date:</span>
                  <p className="text-muted-foreground font-mono break-all">
                    {profile.encryptedBirthDate}
                  </p>
                </div>
                <div>
                  <span className="font-medium">Sex:</span>
                  <p className="text-muted-foreground font-mono break-all">
                    {profile.encryptedSex}
                  </p>
                </div>
                <div>
                  <span className="font-medium">Height:</span>
                  <p className="text-muted-foreground font-mono break-all">
                    {profile.encryptedHeight}
                  </p>
                </div>
                <div>
                  <span className="font-medium">Email:</span>
                  <p className="text-muted-foreground font-mono break-all">
                    {profile.encryptedEmail}
                  </p>
                </div>
                {profile.hasWeight && (
                  <div>
                    <span className="font-medium">Weight:</span>
                    <p className="text-muted-foreground font-mono break-all">
                      {profile.encryptedWeight}
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-blue-50 p-4 rounded-md">
              <h4 className="font-medium text-blue-900 mb-2">
                🔐 Privacy Notice
              </h4>
              <p className="text-sm text-blue-800">
                Your health profile data is encrypted and stored on the
                blockchain. The encrypted data above cannot be read without your
                private key. This ensures your health information remains
                private while being verifiably stored on-chain.
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
