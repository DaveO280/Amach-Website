"use client";

import {
  Activity,
  AlertCircle,
  Database,
  Loader2,
  Mail,
  Shield,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import React, { useEffect, useState } from "react";
import { AdminAuth } from "./AdminAuth";
import { Alert, AlertDescription } from "./ui/alert";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";

interface VerificationStats {
  totalWhitelisted: number;
  totalVerified: number;
  totalAllocated: number;
  conversionRate: number;
  isVerificationActive: boolean;
}

interface TokenStats {
  totalSupply: string;
  totalAllocated: string;
  totalClaimed: string;
  remainingAllocation: string; // Unclaimed allocation
  remainingSupply: string; // Total supply minus total allocation
  allocationPerUser: string;
  claimRate: number;
}

interface EmailWhitelist {
  email: string;
  isWhitelisted: boolean;
  addedAt?: string;
}

interface VerifiedUser {
  email: string;
  wallet: string;
  userId: number;
  timestamp: string;
}

interface WalletInfo {
  isConnected: boolean;
  address?: string;
  balance?: string;
  network?: string;
}

export const UnifiedAdminDashboard: React.FC = () => {
  const [stats, setStats] = useState<VerificationStats | null>(null);
  const [tokenStats, setTokenStats] = useState<TokenStats | null>(null);
  const [whitelist, setWhitelist] = useState<EmailWhitelist[]>([]);
  const [verifiedUsers, setVerifiedUsers] = useState<VerifiedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [newEmail, setNewEmail] = useState("");
  const [bulkEmails, setBulkEmails] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [walletInfo, setWalletInfo] = useState<WalletInfo>({
    isConnected: false,
  });
  const [emailSending, setEmailSending] = useState<boolean>(false);
  const [emailResults, setEmailResults] = useState<{
    success: string[];
    failed: string[];
  } | null>(null);

  // Check admin status and wallet connection on mount
  useEffect(() => {
    checkAdminStatus();
    checkWalletConnection();
  }, []);

  useEffect(() => {
    if (isAdmin) {
      loadDashboardData();
      loadTokenStats();
    }
  }, [isAdmin]);

  const checkAdminStatus = async (): Promise<void> => {
    // Check if user is admin
    const adminToken = localStorage.getItem("admin_token");
    const authTime = localStorage.getItem("admin_auth_time");

    if (adminToken && authTime) {
      // Check if auth is still valid (24 hours)
      const now = Date.now();
      const authTimestamp = parseInt(authTime);
      const isValid = now - authTimestamp < 24 * 60 * 60 * 1000;

      if (isValid) {
        setIsAdmin(true);
        setIsAuthenticated(true);
      } else {
        // Clear expired auth
        localStorage.removeItem("admin_token");
        localStorage.removeItem("admin_auth_time");
      }
    }
  };

  const handleAuthSuccess = (): void => {
    setIsAuthenticated(true);
    setIsAdmin(true);
  };

  const checkWalletConnection = async (): Promise<void> => {
    try {
      // This would integrate with your existing wallet connection logic
      const connected =
        typeof window !== "undefined" &&
        !!(window as { ethereum?: unknown }).ethereum;

      if (connected) {
        setWalletInfo({
          isConnected: true,
          address: "0x1234...5678", // This would be the actual address
          balance: "1.234 ETH",
          network: "ZKsync Sepolia",
        });
      } else {
        setWalletInfo({ isConnected: false });
      }
    } catch (error) {
      console.error("Failed to check wallet connection:", error);
      setWalletInfo({ isConnected: false });
    }
  };

  const loadDashboardData = async (): Promise<void> => {
    try {
      setLoading(true);

      // Load whitelist data from admin app's own API
      const whitelistResponse = await fetch("/api/whitelist");
      const whitelistData = await whitelistResponse.json();

      // Load tracking data from admin app's own API
      const trackingResponse = await fetch("/api/tracking");
      const trackingData = await trackingResponse.json();

      console.log("📊 Admin Dashboard - Tracking data:", trackingData);
      console.log("📊 Admin Dashboard - Whitelist data:", whitelistData);

      if (trackingData.success && trackingData.analytics) {
        // Use analytics data from admin app's database
        const analytics = trackingData.analytics;

        console.log("📊 Admin Dashboard - Processed analytics:", analytics);

        // Convert analytics to display format
        const statsData = {
          totalWhitelisted: whitelistData.success ? whitelistData.count : 0,
          totalVerified: analytics.totalVerified || 0,
          totalAllocated: analytics.totalClaimed || 0,
          conversionRate:
            whitelistData.success && whitelistData.count > 0
              ? Math.round(
                  (analytics.totalVerified / whitelistData.count) * 100,
                )
              : 0,
          isVerificationActive: true,
        };

        console.log("📊 Admin Dashboard - Setting stats:", statsData);
        setStats(statsData);

        // Convert tracking data to verified users format
        const verifiedUsersData = trackingData.tracking
          .filter(
            (user: { hasVerification: boolean; email: string | null }) =>
              user.hasVerification && user.email,
          )
          .map(
            (
              user: {
                emailHash: string;
                email: string | null;
                createdAt: string;
              },
              index: number,
            ) => ({
              email:
                user.email ||
                `user-${user.emailHash.substring(0, 8)}@example.com`, // Use actual email or fallback
              wallet: "N/A", // No wallet addresses stored for privacy
              userId: index + 1,
              timestamp: user.createdAt,
            }),
          );

        setVerifiedUsers(verifiedUsersData);
      } else {
        console.log(
          "❌ Admin Dashboard - No tracking data found, using fallback",
        );
        // Fallback: Set basic stats from whitelist only
        setStats({
          totalWhitelisted: whitelistData.success ? whitelistData.count : 0,
          totalVerified: 0,
          totalAllocated: 0,
          conversionRate: 0,
          isVerificationActive: true,
        });
      }

      if (whitelistData.success) {
        // Convert whitelist to display format (showing actual emails for admin)
        const displayWhitelist = whitelistData.whitelist.map(
          (item: {
            email: string;
            status: string;
            addedAt: string;
            addedBy: string;
          }) => ({
            email: item.email, // Show actual email in admin dashboard
            isWhitelisted: item.status === "active",
            addedAt: item.addedAt,
            addedBy: item.addedBy,
          }),
        );

        setWhitelist(displayWhitelist);
      }
    } catch (error) {
      console.error("Failed to load dashboard data:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadTokenStats = async (): Promise<void> => {
    try {
      // Import Web3 utilities to read from contracts
      // NOTE: For future micro-allocations (health data submissions, interactions, etc.):
      // 1. Contract emits AllocationRecorded events with amount per allocation
      // 2. Add event listener to track different allocation types
      // 3. Read contract events using publicClient.getLogs() to get detailed breakdown
      // 4. This current implementation reads totalAllocated from contract which will
      //    automatically include all allocations regardless of size
      const { createPublicClient, http, parseAbi } = await import("viem");
      const { zkSyncSepoliaTestnet } = await import("viem/chains");

      // Create a public client for reading contract data
      const publicClient = createPublicClient({
        chain: zkSyncSepoliaTestnet,
        transport: http("https://sepolia.era.zksync.dev"),
      });

      // Contract addresses (Fresh deployment - October 2025)
      const HEALTH_TOKEN_CONTRACT =
        "0x34f947904bb4fdb9CD9bA42168Dd457EeD00cf6A";
      const PROFILE_VERIFICATION_CONTRACT =
        "0x3212DA87f72690a0833B7cBe01ecE792b296260f";

      // ABIs
      const tokenAbi = parseAbi([
        "function totalSupply() view returns (uint256)",
        "function balanceOf(address) view returns (uint256)",
        "event Transfer(address indexed from, address indexed to, uint256 value)",
      ]);

      const verificationAbi = parseAbi([
        "function getAllocationConfig() view returns (uint256, uint256, uint256, bool)",
        "function getTotalVerifiedUsers() view returns (uint256)",
        "event TokensClaimed(address indexed user, uint256 amount, uint256 timestamp)",
      ]);

      // Read total supply from HealthToken contract
      const totalSupply = await publicClient.readContract({
        address: HEALTH_TOKEN_CONTRACT,
        abi: tokenAbi,
        functionName: "totalSupply",
      });

      // Read allocation config from ProfileVerification contract
      const allocationConfig = await publicClient.readContract({
        address: PROFILE_VERIFICATION_CONTRACT,
        abi: verificationAbi,
        functionName: "getAllocationConfig",
      });

      // Read total verified users
      const totalVerifiedUsers = await publicClient.readContract({
        address: PROFILE_VERIFICATION_CONTRACT,
        abi: verificationAbi,
        functionName: "getTotalVerifiedUsers",
      });

      // Get actual claimed tokens by reading TokensClaimed events
      const claimedEvents = await publicClient.getLogs({
        address: PROFILE_VERIFICATION_CONTRACT,
        event: parseAbi([
          "event TokensClaimed(address indexed user, uint256 amount, uint256 timestamp)",
        ])[0],
        fromBlock: "earliest",
      });

      // Calculate total claimed tokens from events
      const totalClaimedWei = claimedEvents.reduce((sum, event) => {
        return sum + (event.args.amount || 0n);
      }, 0n);

      // Debug: Log claimed events
      console.log("🔍 Claimed events from blockchain:", {
        eventCount: claimedEvents.length,
        totalClaimedWei: totalClaimedWei.toString(),
        events: claimedEvents.map((e) => ({
          user: e.args.user,
          amount: e.args.amount?.toString(),
          timestamp: e.args.timestamp?.toString(),
        })),
      });

      // Extract allocation data from array (simplified ABI)
      const totalAllocatedWei = allocationConfig[0];
      const maxAllocationsWei = allocationConfig[1];
      const allocationPerUserWei = allocationConfig[2];
      const isActive = allocationConfig[3];

      // Debug: Log the raw allocation config
      console.log("🔍 Raw allocation config from blockchain:", {
        totalAllocated: totalAllocatedWei.toString(),
        maxAllocations: maxAllocationsWei.toString(),
        allocationPerUser: allocationPerUserWei.toString(),
        isActive: isActive,
        totalAllocatedWei: totalAllocatedWei.toString(),
        allocationPerUserWei: allocationPerUserWei.toString(),
      });

      // Convert to readable numbers
      const totalClaimedTokens = Number(totalClaimedWei) / 1e18;
      const totalSupplyTokens = Number(totalSupply) / 1e18;

      // Calculate claim rate using simple approach: claimed events * 1000 / total verified * 1000
      const totalVerifiedUsersCount = Number(totalVerifiedUsers);
      const claimedEventsCount = claimedEvents.length;
      const totalAllocationAllowance = totalVerifiedUsersCount * 1000; // Each user gets 1000 tokens
      const totalClaimedFromEvents = claimedEventsCount * 1000; // Each claim is 1000 tokens

      // Use the actual claimed amount from events, or fallback to simple calculation
      const actualTotalClaimed =
        totalClaimedTokens > 0 ? totalClaimedTokens : totalClaimedFromEvents;

      // Debug logging to see what values we're working with
      console.log("🔍 Claim rate calculation debug:", {
        totalVerifiedUsersCount,
        claimedEventsCount,
        totalClaimedTokens,
        totalClaimedFromEvents,
        actualTotalClaimed,
        totalAllocationAllowance,
        ratio: actualTotalClaimed / totalAllocationAllowance,
      });

      // Calculate claim rate with safety checks
      let claimRate = 0;
      if (totalAllocationAllowance > 0) {
        const ratio = actualTotalClaimed / totalAllocationAllowance;
        // Safety check: if ratio is greater than 1 (100%), cap it at 100%
        if (ratio > 1) {
          console.warn("⚠️ Claim rate exceeds 100% - capping at 100%");
          claimRate = 100;
        } else {
          claimRate = Math.round(ratio * 1000) / 10; // Tenths of a percent
        }
      }

      setTokenStats({
        totalSupply: totalSupplyTokens.toLocaleString(),
        totalAllocated: totalAllocationAllowance.toLocaleString(), // Use calculated allowance
        totalClaimed: actualTotalClaimed.toLocaleString(), // Use calculated claimed amount
        remainingAllocation: (
          totalAllocationAllowance - actualTotalClaimed
        ).toLocaleString(), // Unclaimed allocation
        remainingSupply: (
          totalSupplyTokens - totalAllocationAllowance
        ).toLocaleString(), // Total supply minus allocation
        allocationPerUser: "1000", // Fixed at 1000 per user
        claimRate,
      });

      console.log("📊 Token stats loaded from blockchain:", {
        totalSupply: totalSupplyTokens.toLocaleString(),
        totalAllocated: totalAllocationAllowance.toLocaleString(),
        totalClaimed: actualTotalClaimed.toLocaleString(),
        remainingAllocation: (
          totalAllocationAllowance - actualTotalClaimed
        ).toLocaleString(),
        remainingSupply: (
          totalSupplyTokens - totalAllocationAllowance
        ).toLocaleString(),
        allocationPerUser: "1000",
        claimRate: `${claimRate}%`,
        totalVerifiedUsers: totalVerifiedUsersCount,
        claimedEvents: claimedEventsCount,
      });

      // Update the main stats with blockchain data
      setStats((prevStats) => ({
        totalWhitelisted: prevStats?.totalWhitelisted || 0,
        totalVerified: Number(totalVerifiedUsers),
        totalAllocated: prevStats?.totalAllocated || 0,
        conversionRate: prevStats?.conversionRate || 0,
        isVerificationActive: prevStats?.isVerificationActive || true,
      }));
    } catch (error) {
      console.error("Failed to load token stats:", error);
      // Set fallback stats
      setTokenStats({
        totalSupply: "500,000,000",
        totalAllocated: "0",
        totalClaimed: "0",
        remainingAllocation: "0",
        remainingSupply: "500,000,000",
        allocationPerUser: "1,000",
        claimRate: 0,
      });
    }
  };

  const addEmailToWhitelist = async (email: string): Promise<void> => {
    try {
      console.log("📧 Adding email to whitelist:", email);

      const response = await fetch("/api/whitelist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          action: "add",
          adminEmail: "admin@amachhealth.com", // TODO: Get from auth
        }),
      });

      if (response.ok) {
        const result = await response.json();
        console.log("✅ Email added successfully:", result);
        await loadDashboardData();
        setNewEmail("");

        // Send welcome email to the newly whitelisted user
        await sendWalletCreationEmail([email]);
      } else {
        const error = await response.json();
        console.error("❌ Failed to add email:", error);
        alert(`Failed to add email: ${error.error || "Unknown error"}`);
      }
    } catch (error) {
      console.error("❌ Failed to add email:", error);
      alert(
        `Failed to add email: ${error instanceof Error ? error.message : "Network error"}`,
      );
    }
  };

  const removeEmailFromWhitelist = async (email: string): Promise<void> => {
    try {
      console.log("🗑️ Removing email from whitelist:", email);

      const response = await fetch("/api/whitelist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          action: "remove",
          adminEmail: "admin@amachhealth.com", // TODO: Get from auth
        }),
      });

      if (response.ok) {
        const result = await response.json();
        console.log("✅ Email removed successfully:", result);
        await loadDashboardData();
      } else {
        const error = await response.json();
        console.error("❌ Failed to remove email:", error);
        alert(`Failed to remove email: ${error.error || "Unknown error"}`);
      }
    } catch (error) {
      console.error("❌ Failed to remove email:", error);
      alert(
        `Failed to remove email: ${error instanceof Error ? error.message : "Network error"}`,
      );
    }
  };

  const addBulkEmails = async (): Promise<void> => {
    const emails = bulkEmails.split("\n").filter((email) => email.trim());

    try {
      const response = await fetch("/api/admin/email-whitelist/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails, action: "add" }),
      });

      if (response.ok) {
        await loadDashboardData();
        setBulkEmails("");
      }
    } catch (error) {
      console.error("Failed to add bulk emails:", error);
    }
  };

  const toggleVerification = async (): Promise<void> => {
    try {
      const response = await fetch("/api/admin/verification-toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !stats?.isVerificationActive }),
      });

      if (response.ok) {
        await loadDashboardData();
      }
    } catch (error) {
      console.error("Failed to toggle verification:", error);
    }
  };

  const connectWallet = async (): Promise<void> => {
    try {
      // This would integrate with your existing wallet connection logic
      setWalletInfo({
        isConnected: true,
        address: "0x1234...5678",
        balance: "1.234 ETH",
        network: "ZKsync Sepolia",
      });
    } catch (error) {
      console.error("Failed to connect wallet:", error);
    }
  };

  const sendWalletCreationEmail = async (emails: string[]): Promise<void> => {
    try {
      setEmailSending(true);
      setEmailResults(null);

      const response = await fetch("/api/send-wallet-emails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emails,
          verificationUrl: "http://localhost:3000", // Main app URL (triggers onboarding modal)
        }),
      });

      if (response.ok) {
        const result = await response.json();
        setEmailResults(result.results);
      } else {
        const error = await response.json();
        console.error("Failed to send emails:", error);
        setEmailResults({ success: [], failed: emails });
      }
    } catch (error) {
      console.error("Failed to send emails:", error);
      setEmailResults({ success: [], failed: emails });
    } finally {
      setEmailSending(false);
    }
  };

  // Show authentication if not authenticated
  if (!isAuthenticated) {
    return <AdminAuth onAuthSuccess={handleAuthSuccess} />;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-white to-emerald-50">
      <header className="admin-header shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 bg-gradient-to-br from-emerald-100 to-emerald-200 rounded-full flex items-center justify-center shadow-lg">
                <Shield className="h-6 w-6 text-emerald-600" />
              </div>
              <div>
                <h1 className="text-2xl font-black admin-text-primary">
                  Amach Health
                </h1>
                <p className="text-sm font-semibold text-emerald-600">
                  Admin Dashboard
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <Button
                variant="outline"
                onClick={() => {
                  localStorage.removeItem("admin_token");
                  localStorage.removeItem("admin_auth_time");
                  setIsAuthenticated(false);
                  setIsAdmin(false);
                }}
                className="admin-button-outline"
              >
                Logout
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold admin-text-primary mb-2">
                Platform Management
              </h2>
              <p className="admin-text-secondary">
                Manage verification system and monitor platform activity
              </p>
            </div>
            <div className="flex items-center gap-4">
              {/* Wallet Status */}
              <Card className="min-w-[200px] admin-card">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <Wallet className="h-5 w-5 text-emerald-600" />
                    <div>
                      <p className="text-sm font-medium text-gray-600">
                        Wallet
                      </p>
                      {walletInfo.isConnected ? (
                        <div>
                          <p className="text-sm font-mono">
                            {walletInfo.address}
                          </p>
                          <p className="text-xs text-gray-500">
                            {walletInfo.balance}
                          </p>
                        </div>
                      ) : (
                        <Button size="sm" onClick={connectWallet}>
                          Connect Wallet
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card className="admin-stat-card">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium admin-text-secondary">
                    Total Verified
                  </p>
                  <p className="text-2xl font-bold text-emerald-600">
                    {stats?.totalVerified || 0}
                  </p>
                </div>
                <Users className="h-8 w-8 text-emerald-600" />
              </div>
            </CardContent>
          </Card>

          <Card className="admin-stat-card">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium admin-text-secondary">
                    Token Allocations
                  </p>
                  <p className="text-2xl font-bold text-amber-600">
                    {stats?.totalAllocated || 0}
                  </p>
                </div>
                <TrendingUp className="h-8 w-8 text-amber-600" />
              </div>
            </CardContent>
          </Card>

          <Card className="admin-stat-card">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium admin-text-secondary">
                    Remaining
                  </p>
                  <p className="text-2xl font-bold text-blue-600">
                    {stats?.totalWhitelisted || 0}
                  </p>
                </div>
                <Shield className="h-8 w-8 text-blue-600" />
              </div>
            </CardContent>
          </Card>

          <Card className="admin-stat-card">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium admin-text-secondary">
                    Status
                  </p>
                  <Badge
                    variant={
                      stats?.isVerificationActive ? "default" : "secondary"
                    }
                    className={
                      stats?.isVerificationActive
                        ? "admin-badge-success"
                        : "admin-badge-warning"
                    }
                  >
                    {stats?.isVerificationActive ? "Active" : "Paused"}
                  </Badge>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={toggleVerification}
                >
                  {stats?.isVerificationActive ? "Pause" : "Resume"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Token Stats Overview */}
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">
            Token Distribution (On-Chain Data)
          </h3>
          <Button
            onClick={loadTokenStats}
            variant="outline"
            size="sm"
            className="flex items-center gap-2"
          >
            <Activity className="h-4 w-4" />
            Refresh Token Stats
          </Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card className="admin-stat-card bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-purple-700">
                    Total Supply
                  </p>
                  <p className="text-2xl font-bold text-purple-900">
                    {tokenStats?.totalSupply || "0"} AHP
                  </p>
                </div>
                <Database className="h-8 w-8 text-purple-600" />
              </div>
            </CardContent>
          </Card>

          <Card className="admin-stat-card bg-gradient-to-br from-green-50 to-green-100 border-green-200">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-green-700">
                    Tokens Claimed
                  </p>
                  <p className="text-2xl font-bold text-green-900">
                    {tokenStats?.totalClaimed || "0"} AHP
                  </p>
                </div>
                <Wallet className="h-8 w-8 text-green-600" />
              </div>
            </CardContent>
          </Card>

          <Card className="admin-stat-card bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-blue-700">
                    Remaining Allocation
                  </p>
                  <p className="text-2xl font-bold text-blue-900">
                    {tokenStats?.remainingAllocation || "0"} AHP
                  </p>
                </div>
                <TrendingUp className="h-8 w-8 text-blue-600" />
              </div>
            </CardContent>
          </Card>

          <Card className="admin-stat-card bg-gradient-to-br from-amber-50 to-amber-100 border-amber-200">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-amber-700">
                    Claim Rate
                  </p>
                  <p className="text-2xl font-bold text-amber-900">
                    {tokenStats?.claimRate || 0}%
                  </p>
                  <p className="text-xs text-amber-600 mt-1">
                    {tokenStats?.allocationPerUser || "1000"} per user
                  </p>
                </div>
                <Activity className="h-8 w-8 text-amber-600" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Second row for Remaining Supply */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card className="admin-stat-card bg-gradient-to-br from-indigo-50 to-indigo-100 border-indigo-200">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-indigo-700">
                    Remaining Supply
                  </p>
                  <p className="text-2xl font-bold text-indigo-900">
                    {tokenStats?.remainingSupply || "0"} AHP
                  </p>
                  <p className="text-xs text-indigo-600 mt-1">
                    Total supply minus allocation
                  </p>
                </div>
                <Database className="h-8 w-8 text-indigo-600" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Privacy Notice */}
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 mb-8">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <Shield className="h-5 w-5 text-emerald-600" />
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-emerald-800">
                Privacy-Preserving Analytics
              </h3>
              <p className="text-sm text-emerald-700 mt-1">
                <strong>Email Visibility:</strong> Emails are visible in the
                admin dashboard for management purposes.
                <br />
                <strong>Wallet Privacy:</strong> Wallet addresses are NEVER
                stored or associated with emails - complete wallet privacy
                maintained.
                <br />
                <strong>ZK-Proofs:</strong> All allocations are verified using
                cryptographic proofs without revealing wallet connections.
              </p>
            </div>
          </div>
        </div>

        {/* Main Content Tabs */}
        <Tabs defaultValue="whitelist" className="space-y-6">
          <TabsList className="grid w-full grid-cols-6 bg-emerald-50 border border-emerald-200">
            <TabsTrigger
              value="whitelist"
              className="admin-nav-item data-[state=active]:bg-emerald-600 data-[state=active]:text-white"
            >
              Email Whitelist
            </TabsTrigger>
            <TabsTrigger
              value="users"
              className="admin-nav-item data-[state=active]:bg-emerald-600 data-[state=active]:text-white"
            >
              Verified Users
            </TabsTrigger>
            <TabsTrigger
              value="wallet"
              className="admin-nav-item data-[state=active]:bg-emerald-600 data-[state=active]:text-white"
            >
              Wallet Management
            </TabsTrigger>
            <TabsTrigger
              value="analytics"
              className="admin-nav-item data-[state=active]:bg-emerald-600 data-[state=active]:text-white"
            >
              Analytics
            </TabsTrigger>
            <TabsTrigger
              value="settings"
              className="admin-nav-item data-[state=active]:bg-emerald-600 data-[state=active]:text-white"
            >
              Settings
            </TabsTrigger>
            <TabsTrigger
              value="health"
              className="admin-nav-item data-[state=active]:bg-emerald-600 data-[state=active]:text-white"
            >
              Health Data
            </TabsTrigger>
          </TabsList>

          {/* Email Whitelist Tab */}
          <TabsContent value="whitelist" className="space-y-6">
            <Card className="admin-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 admin-text-primary">
                  <Mail className="h-5 w-5 text-emerald-600" />
                  Email Whitelist Management
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Add Single Email */}
                <div className="flex gap-4">
                  <div className="flex-1">
                    <Label
                      htmlFor="newEmail"
                      className="admin-text-primary font-medium"
                    >
                      Add Email Address
                    </Label>
                    <Input
                      id="newEmail"
                      type="email"
                      placeholder="user@example.com"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      className="admin-input mt-1"
                    />
                  </div>
                  <div className="flex items-end">
                    <Button
                      onClick={() => addEmailToWhitelist(newEmail)}
                      disabled={!newEmail}
                      className="admin-button-primary"
                    >
                      Add Email
                    </Button>
                  </div>
                </div>

                {/* Bulk Add Emails */}
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="bulkEmails">
                      Bulk Add Emails (one per line)
                    </Label>
                    <textarea
                      id="bulkEmails"
                      className="w-full p-3 border rounded-md min-h-[120px]"
                      placeholder="user1@example.com&#10;user2@example.com&#10;user3@example.com"
                      value={bulkEmails}
                      onChange={(e) => setBulkEmails(e.target.value)}
                    />
                  </div>
                  <Button onClick={addBulkEmails} disabled={!bulkEmails.trim()}>
                    Add All Emails
                  </Button>
                </div>

                {/* Send Welcome Emails Section */}
                <div className="border-t pt-6">
                  <h3 className="admin-text-primary font-semibold mb-4 flex items-center gap-2">
                    <Mail className="h-4 w-4 text-emerald-600" />
                    Send Welcome Emails
                  </h3>

                  <div className="space-y-4">
                    <p className="admin-text-secondary text-sm">
                      Send wallet creation emails to whitelisted users. This
                      will prompt them to set up their wallets and claim their
                      token allocation.
                    </p>

                    <div className="flex gap-4">
                      <Button
                        onClick={() =>
                          sendWalletCreationEmail(whitelist.map((w) => w.email))
                        }
                        disabled={whitelist.length === 0 || emailSending}
                        className="admin-button-primary"
                      >
                        {emailSending
                          ? "Sending..."
                          : `Send to All (${whitelist.length})`}
                      </Button>

                      <Button
                        variant="outline"
                        onClick={() => setEmailResults(null)}
                        disabled={!emailResults}
                        className="admin-button-outline"
                      >
                        Clear Results
                      </Button>
                    </div>

                    {/* Email Results */}
                    {emailResults && (
                      <div className="mt-4 p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
                        <h4 className="admin-text-primary font-medium mb-2">
                          Email Results:
                        </h4>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <p className="text-emerald-700 font-medium">
                              ✅ Successful (
                              {emailResults?.success?.length || 0})
                            </p>
                            {(emailResults?.success?.length || 0) > 0 && (
                              <ul className="mt-1 text-emerald-600">
                                {emailResults.success
                                  .slice(0, 3)
                                  .map((email) => (
                                    <li key={email}>• {email}</li>
                                  ))}
                                {emailResults.success.length > 3 && (
                                  <li>
                                    • ... and {emailResults.success.length - 3}{" "}
                                    more
                                  </li>
                                )}
                              </ul>
                            )}
                          </div>
                          <div>
                            <p className="text-red-700 font-medium">
                              ❌ Failed ({emailResults?.failed?.length || 0})
                            </p>
                            {(emailResults?.failed?.length || 0) > 0 && (
                              <ul className="mt-1 text-red-600">
                                {emailResults.failed
                                  .slice(0, 3)
                                  .map((email) => (
                                    <li key={email}>• {email}</li>
                                  ))}
                                {emailResults.failed.length > 3 && (
                                  <li>
                                    • ... and {emailResults.failed.length - 3}{" "}
                                    more
                                  </li>
                                )}
                              </ul>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Email List */}
                <div className="space-y-2">
                  <h3 className="font-semibold">
                    Whitelisted Emails ({whitelist.length})
                  </h3>
                  <div className="max-h-96 overflow-y-auto space-y-2">
                    {whitelist.map((item, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-3 bg-gray-50 rounded-md"
                      >
                        <span className="font-mono text-sm">{item.email}</span>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">Whitelisted</Badge>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => removeEmailFromWhitelist(item.email)}
                          >
                            Remove
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Verified Users Tab */}
          <TabsContent value="users" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Verified Users ({verifiedUsers.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {verifiedUsers.map((user, index) => (
                    <div key={index} className="p-4 border rounded-lg">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <p className="text-sm font-medium text-gray-600">
                            Email
                          </p>
                          <p className="font-mono text-sm">{user.email}</p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-600">
                            Wallet
                          </p>
                          <p className="font-mono text-sm">{user.wallet}</p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-600">
                            User ID
                          </p>
                          <p className="font-mono text-sm">{user.userId}</p>
                        </div>
                      </div>
                      <div className="mt-3 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <Badge variant="default">Verified</Badge>
                        </div>
                        <span className="text-sm text-gray-600">
                          {new Date(user.timestamp).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Wallet Management Tab */}
          <TabsContent value="wallet" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Wallet className="h-5 w-5" />
                  Wallet Management
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Wallet Connection Status */}
                <div className="p-4 border rounded-lg">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold">Connection Status</h3>
                    <Badge
                      variant={walletInfo.isConnected ? "default" : "secondary"}
                    >
                      {walletInfo.isConnected ? "Connected" : "Disconnected"}
                    </Badge>
                  </div>

                  {walletInfo.isConnected ? (
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm font-medium">Address:</span>
                        <span className="font-mono text-sm">
                          {walletInfo.address}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm font-medium">Balance:</span>
                        <span className="font-mono text-sm">
                          {walletInfo.balance}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm font-medium">Network:</span>
                        <span className="text-sm">{walletInfo.network}</span>
                      </div>
                    </div>
                  ) : (
                    <Button onClick={connectWallet} className="w-full">
                      Connect Wallet
                    </Button>
                  )}
                </div>

                {/* Wallet Actions */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Button
                    variant="outline"
                    className="h-20 flex flex-col gap-2"
                  >
                    <Database className="h-6 w-6" />
                    <span>View Health Profile</span>
                  </Button>
                  <Button
                    variant="outline"
                    className="h-20 flex flex-col gap-2"
                  >
                    <Activity className="h-6 w-6" />
                    <span>Transaction History</span>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Analytics Tab */}
          <TabsContent value="analytics" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Platform Analytics</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <h3 className="font-semibold">Verification Trends</h3>
                    <div className="p-4 bg-gray-50 rounded-lg">
                      <p className="text-sm text-gray-600">
                        Coming soon: Detailed analytics dashboard
                      </p>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <h3 className="font-semibold">User Engagement</h3>
                    <div className="p-4 bg-gray-50 rounded-lg">
                      <p className="text-sm text-gray-600">
                        Coming soon: User activity metrics
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>System Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Configuration changes are applied immediately and affect new
                    verifications.
                  </AlertDescription>
                </Alert>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Verification Status</Label>
                      <p className="text-sm text-gray-600">
                        Enable or disable new user verifications
                      </p>
                    </div>
                    <Button
                      variant={
                        stats?.isVerificationActive ? "destructive" : "default"
                      }
                      onClick={toggleVerification}
                    >
                      {stats?.isVerificationActive ? "Disable" : "Enable"}{" "}
                      Verification
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Health Data Tab */}
          <TabsContent value="health" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Health Data Management</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <p className="text-sm text-gray-600">
                    Access to your personal health data and profile management.
                  </p>
                  <Button
                    onClick={() =>
                      window.open("http://localhost:3000/dashboard", "_blank")
                    }
                  >
                    Go to Health Dashboard
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};
