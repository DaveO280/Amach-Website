"use client";

import { ethers } from "ethers";
import { Loader2, Trophy } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePrivyWalletService } from "@/hooks/usePrivyWalletService";
import { getActiveChain, getContractAddresses } from "@/lib/networkConfig";
import { getCachedWalletEncryptionKey } from "@/utils/walletEncryption";
import { generateAndSubmitProof } from "@/zk/improvementProofClient";

const ESCROW_ABI = [
  "function state() view returns (uint8)",
  "function prizePool() view returns (uint256)",
  "function participantCount() view returns (uint256)",
  "function MAX_PARTICIPANTS() view returns (uint256)",
  "function MIN_PARTICIPANTS() view returns (uint256)",
  "function CONTEST_DURATION() view returns (uint256)",
  "function CLAIM_WINDOW() view returns (uint256)",
  "function contestStartTime() view returns (uint256)",
  "function contestCloseTime() view returns (uint256)",
  "function claimWindowEndTime() view returns (uint256)",
  "function registered(address) view returns (bool)",
  "function improvementBp(address) view returns (uint256)",
  "function claimed(address) view returns (bool)",
  "function participantRank(address) view returns (uint256)",
  "function previewPrizeFor(address) view returns (uint256 amount, uint8 tier)",
  "function register()",
  "function claimPrize()",
  "event ParticipantRegistered(address indexed participant)",
  "event ProofSubmitted(address indexed participant, uint256 improvementBp)",
  "event PrizeClaimed(address indexed participant, uint256 amount, uint8 tier)",
];

enum ContestState {
  UNINITIALIZED = 0,
  REGISTRATION_OPEN = 1,
  ACTIVE = 2,
  CLAIMING = 3,
  FINISHED = 4,
  FAILED = 5,
}

interface ContractSnapshot {
  state: ContestState;
  prizePool: bigint;
  participantCount: number;
  maxParticipants: number;
  minParticipants: number;
  contestDuration: number;
  claimWindow: number;
  contestStartTime: number;
  contestCloseTime: number;
  claimWindowEndTime: number;
}

interface UserSnapshot {
  registered: boolean;
  improvementBp: bigint;
  claimed: boolean;
  rank: number;
  previewPrize: bigint;
  previewTier: number;
}

interface LeaderboardEntry {
  address: string;
  improvementBp: bigint;
}

const REFRESH_INTERVAL_MS = 30_000;
const LEADERBOARD_BLOCK_LOOKBACK = 1000;

function truncateAddress(addr: string): string {
  if (!addr) return "";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function formatEth(value: bigint, fractionDigits = 4): string {
  return parseFloat(ethers.utils.formatEther(value.toString())).toFixed(
    fractionDigits,
  );
}

function formatBpAsPercent(bp: bigint): string {
  const pct = Number(bp) / 100;
  return `${pct.toFixed(2)}%`;
}

function tierForRank(rank: number, qualifierCount: number): 1 | 2 | 3 | 0 {
  if (qualifierCount === 0 || rank === 0 || rank > qualifierCount) return 0;
  const tier1 = Math.min(qualifierCount, 10);
  const tier2 = Math.min(Math.max(qualifierCount - 10, 0), 20);
  if (rank <= tier1) return 1;
  if (rank <= tier1 + tier2) return 2;
  return 3;
}

function formatCountdown(secondsRemaining: number): string {
  if (secondsRemaining <= 0) return "0m";
  const days = Math.floor(secondsRemaining / 86400);
  const hours = Math.floor((secondsRemaining % 86400) / 3600);
  const minutes = Math.floor((secondsRemaining % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function stateLabel(state: ContestState): string {
  switch (state) {
    case ContestState.UNINITIALIZED:
      return "NOT STARTED";
    case ContestState.REGISTRATION_OPEN:
      return "REGISTRATION OPEN";
    case ContestState.ACTIVE:
      return "ACTIVE";
    case ContestState.CLAIMING:
      return "CLAIMING";
    case ContestState.FINISHED:
      return "FINISHED";
    case ContestState.FAILED:
      return "FAILED";
    default:
      return "UNKNOWN";
  }
}

interface BadgeStyle {
  bg: string;
  fg: string;
  border: string;
  pulse: boolean;
}

function stateBadgeStyle(state: ContestState): BadgeStyle {
  switch (state) {
    case ContestState.REGISTRATION_OPEN:
      return {
        bg: "rgba(0,107,79,0.12)",
        fg: "var(--color-emerald)",
        border: "rgba(0,107,79,0.35)",
        pulse: false,
      };
    case ContestState.ACTIVE:
      return {
        bg: "var(--color-amber-muted)",
        fg: "var(--color-amber)",
        border: "rgba(245,158,11,0.35)",
        pulse: true,
      };
    case ContestState.CLAIMING:
      return {
        bg: "rgba(99,102,241,0.12)",
        fg: "var(--color-indigo)",
        border: "rgba(99,102,241,0.35)",
        pulse: false,
      };
    case ContestState.FINISHED:
    case ContestState.FAILED:
    case ContestState.UNINITIALIZED:
    default:
      return {
        bg: "rgba(107,140,122,0.10)",
        fg: "var(--color-text-muted)",
        border: "rgba(107,140,122,0.25)",
        pulse: false,
      };
  }
}

export function SpringPushWidget(): JSX.Element {
  const walletService = usePrivyWalletService();
  const userAddress = walletService.address;
  const isConnected = walletService.isConnected;

  const escrowAddress = useMemo(
    () => getContractAddresses().SPRING_PUSH_ESCROW_CONTRACT,
    [],
  );
  const rpcUrl = useMemo(() => getActiveChain().rpcUrls.default.http[0], []);

  const [snapshot, setSnapshot] = useState<ContractSnapshot | null>(null);
  const [userState, setUserState] = useState<UserSnapshot | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState<number>(() => Math.floor(Date.now() / 1000));
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionTxHash, setActionTxHash] = useState<string | null>(null);

  const readProvider = useMemo(
    () => new ethers.providers.JsonRpcProvider(rpcUrl),
    [rpcUrl],
  );

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const contract = new ethers.Contract(
        escrowAddress,
        ESCROW_ABI,
        readProvider,
      );

      const [
        rawState,
        prizePool,
        rawParticipants,
        rawMaxParticipants,
        rawMinParticipants,
        rawDuration,
        rawClaimWindow,
        rawStartTime,
        rawCloseTime,
        rawClaimEndTime,
      ] = await Promise.all([
        contract.state(),
        contract.prizePool(),
        contract.participantCount(),
        contract.MAX_PARTICIPANTS(),
        contract.MIN_PARTICIPANTS(),
        contract.CONTEST_DURATION(),
        contract.CLAIM_WINDOW(),
        contract.contestStartTime(),
        contract.contestCloseTime(),
        contract.claimWindowEndTime(),
      ]);

      const contractSnapshot: ContractSnapshot = {
        state: Number(rawState) as ContestState,
        prizePool: (prizePool as ethers.BigNumber).toBigInt(),
        participantCount: (rawParticipants as ethers.BigNumber).toNumber(),
        maxParticipants: (rawMaxParticipants as ethers.BigNumber).toNumber(),
        minParticipants: (rawMinParticipants as ethers.BigNumber).toNumber(),
        contestDuration: (rawDuration as ethers.BigNumber).toNumber(),
        claimWindow: (rawClaimWindow as ethers.BigNumber).toNumber(),
        contestStartTime: (rawStartTime as ethers.BigNumber).toNumber(),
        contestCloseTime: (rawCloseTime as ethers.BigNumber).toNumber(),
        claimWindowEndTime: (rawClaimEndTime as ethers.BigNumber).toNumber(),
      };
      setSnapshot(contractSnapshot);

      // Leaderboard from ProofSubmitted events.
      try {
        const blockNumber = await readProvider.getBlockNumber();
        const fromBlock = Math.max(0, blockNumber - LEADERBOARD_BLOCK_LOOKBACK);
        const proofFilter = contract.filters.ProofSubmitted();
        const proofEvents = await contract.queryFilter(
          proofFilter,
          fromBlock,
          "latest",
        );
        const byAddress = new Map<string, bigint>();
        for (const ev of proofEvents) {
          const participant = ev.args?.participant as string | undefined;
          const improvement = ev.args?.improvementBp as
            | ethers.BigNumber
            | undefined;
          if (!participant || !improvement) continue;
          const existing = byAddress.get(participant.toLowerCase()) ?? 0n;
          const value = improvement.toBigInt();
          if (value > existing) {
            byAddress.set(participant.toLowerCase(), value);
          }
        }
        const sorted: LeaderboardEntry[] = Array.from(byAddress.entries())
          .map(([address, improvementBp]) => ({ address, improvementBp }))
          .sort((a, b) => {
            if (a.improvementBp === b.improvementBp) return 0;
            return a.improvementBp > b.improvementBp ? -1 : 1;
          })
          .slice(0, 10);
        setLeaderboard(sorted);
      } catch (leaderboardError) {
        console.warn(
          "SpringPushWidget: failed to load leaderboard",
          leaderboardError,
        );
      }

      // User-specific data
      if (userAddress) {
        const [isRegistered, rawImprovementBp, isClaimed, rawRank, rawPreview] =
          await Promise.all([
            contract.registered(userAddress),
            contract.improvementBp(userAddress),
            contract.claimed(userAddress),
            contract.participantRank(userAddress),
            contract.previewPrizeFor(userAddress),
          ]);

        setUserState({
          registered: Boolean(isRegistered),
          improvementBp: (rawImprovementBp as ethers.BigNumber).toBigInt(),
          claimed: Boolean(isClaimed),
          rank: (rawRank as ethers.BigNumber).toNumber(),
          previewPrize: (rawPreview.amount as ethers.BigNumber).toBigInt(),
          previewTier: Number(rawPreview.tier),
        });
      } else {
        setUserState(null);
      }

      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("SpringPushWidget refresh failed:", err);
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [escrowAddress, readProvider, userAddress]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, REFRESH_INTERVAL_MS);
    return (): void => clearInterval(interval);
  }, [refresh]);

  useEffect(() => {
    const tick = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return (): void => clearInterval(tick);
  }, []);

  const phaseRemaining: { label: string; seconds: number } | null =
    useMemo(() => {
      if (!snapshot) return null;
      switch (snapshot.state) {
        case ContestState.REGISTRATION_OPEN:
          return { label: "Registration open", seconds: -1 };
        case ContestState.ACTIVE:
          return {
            label: "Contest closes in",
            seconds: Math.max(0, snapshot.contestCloseTime - now),
          };
        case ContestState.CLAIMING:
          return {
            label: "Claim window closes in",
            seconds: Math.max(0, snapshot.claimWindowEndTime - now),
          };
        case ContestState.FINISHED:
          return { label: "Contest finished", seconds: -1 };
        case ContestState.FAILED:
          return { label: "Contest failed — minimum not met", seconds: -1 };
        case ContestState.UNINITIALIZED:
        default:
          return { label: "Contest not yet open", seconds: -1 };
      }
    }, [snapshot, now]);

  const handleRegister = useCallback(async (): Promise<void> => {
    if (!isConnected || !userAddress) {
      setActionError("Connect your wallet to register.");
      return;
    }
    setActionLoading(true);
    setActionError(null);
    setActionTxHash(null);
    try {
      const walletClient = await walletService.getWalletClient();
      if (!walletClient) {
        throw new Error("Could not get wallet client");
      }
      const hash = await walletClient.writeContract({
        address: escrowAddress as `0x${string}`,
        abi: [
          {
            type: "function",
            name: "register",
            stateMutability: "nonpayable",
            inputs: [],
            outputs: [],
          },
        ] as const,
        functionName: "register",
        args: [],
        account: userAddress as `0x${string}`,
        chain: getActiveChain(),
      });
      setActionTxHash(hash);
      await refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setActionError(message);
    } finally {
      setActionLoading(false);
    }
  }, [isConnected, userAddress, walletService, escrowAddress, refresh]);

  const handleClaim = useCallback(async (): Promise<void> => {
    if (!isConnected || !userAddress) {
      setActionError("Connect your wallet to claim.");
      return;
    }
    setActionLoading(true);
    setActionError(null);
    setActionTxHash(null);
    try {
      const walletClient = await walletService.getWalletClient();
      if (!walletClient) {
        throw new Error("Could not get wallet client");
      }
      const hash = await walletClient.writeContract({
        address: escrowAddress as `0x${string}`,
        abi: [
          {
            type: "function",
            name: "claimPrize",
            stateMutability: "nonpayable",
            inputs: [],
            outputs: [],
          },
        ] as const,
        functionName: "claimPrize",
        args: [],
        account: userAddress as `0x${string}`,
        chain: getActiveChain(),
      });
      setActionTxHash(hash);
      await refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setActionError(message);
    } finally {
      setActionLoading(false);
    }
  }, [isConnected, userAddress, walletService, escrowAddress, refresh]);

  const handleSubmitProof = useCallback(async (): Promise<void> => {
    if (!isConnected || !userAddress) {
      setActionError("Connect your wallet to submit a proof.");
      return;
    }
    setActionLoading(true);
    setActionError(null);
    setActionTxHash(null);
    try {
      const walletClient = await walletService.getWalletClient();
      if (!walletClient) {
        throw new Error("Could not get wallet client");
      }
      const encryptionKey = await getCachedWalletEncryptionKey(
        userAddress,
        walletService.signMessage,
      );
      const hash = await generateAndSubmitProof(
        userAddress,
        encryptionKey,
        walletClient,
        escrowAddress,
      );
      setActionTxHash(hash);
      await refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setActionError(message);
    } finally {
      setActionLoading(false);
    }
  }, [isConnected, userAddress, walletService, escrowAddress, refresh]);

  const minMet = snapshot
    ? snapshot.participantCount >= snapshot.minParticipants
    : false;
  const participantPct = snapshot
    ? Math.min(
        100,
        (snapshot.participantCount / snapshot.maxParticipants) * 100,
      )
    : 0;

  const showLeaderboard =
    snapshot &&
    (snapshot.state === ContestState.ACTIVE ||
      snapshot.state === ContestState.CLAIMING ||
      snapshot.state === ContestState.FINISHED);

  const badge = snapshot
    ? stateBadgeStyle(snapshot.state)
    : stateBadgeStyle(ContestState.UNINITIALIZED);

  return (
    <div
      className="amach-card"
      style={{
        color: "var(--color-text-primary)",
        padding: 24,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
          marginBottom: 20,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Trophy size={20} color="var(--color-emerald)" />
          <h2
            style={{
              margin: 0,
              fontSize: 18,
              fontWeight: 600,
              color: "var(--color-text-primary)",
            }}
          >
            Spring Push Season One
          </h2>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span
            style={{
              padding: "4px 10px",
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: 0.5,
              background: badge.bg,
              color: badge.fg,
              border: `1px solid ${badge.border}`,
              animation: badge.pulse ? "springPushPulse 2s infinite" : "none",
            }}
          >
            {snapshot ? stateLabel(snapshot.state) : "LOADING"}
          </span>
          {phaseRemaining && phaseRemaining.seconds >= 0 && (
            <span style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
              {phaseRemaining.label}: {formatCountdown(phaseRemaining.seconds)}
            </span>
          )}
          {phaseRemaining && phaseRemaining.seconds < 0 && (
            <span style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
              {phaseRemaining.label}
            </span>
          )}
        </div>
      </div>

      {loading && !snapshot && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            color: "var(--color-text-muted)",
            fontSize: 14,
          }}
        >
          <Loader2 size={16} className="animate-spin" />
          Loading contest…
        </div>
      )}

      {error && !snapshot && (
        <div
          style={{
            background: "rgba(239,68,68,0.10)",
            border: "1px solid rgba(239,68,68,0.30)",
            color: "#dc2626",
            padding: 12,
            borderRadius: 8,
            fontSize: 13,
          }}
        >
          Could not load contest data: {error}
        </div>
      )}

      {snapshot && (
        <div style={{ display: "grid", gap: 24 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 16,
            }}
          >
            <div
              style={{
                background: "var(--color-bg-surface)",
                border: "1px solid var(--color-border)",
                borderRadius: 10,
                padding: 16,
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                  color: "var(--color-text-muted)",
                  marginBottom: 6,
                }}
              >
                Prize Pool
              </div>
              <div
                style={{
                  fontSize: 24,
                  fontWeight: 600,
                  color: "var(--color-text-primary)",
                }}
              >
                {formatEth(snapshot.prizePool)} ETH
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "var(--color-text-muted)",
                  marginTop: 4,
                }}
              >
                Seeded by Amach Health
              </div>
            </div>

            <div
              style={{
                background: "var(--color-bg-surface)",
                border: "1px solid var(--color-border)",
                borderRadius: 10,
                padding: 16,
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                  color: "var(--color-text-muted)",
                  marginBottom: 6,
                }}
              >
                Participants
              </div>
              <div
                style={{
                  fontSize: 24,
                  fontWeight: 600,
                  color: "var(--color-text-primary)",
                }}
              >
                {snapshot.participantCount} / {snapshot.maxParticipants}
              </div>
              <div
                style={{
                  height: 6,
                  background: "var(--color-emerald-muted)",
                  borderRadius: 999,
                  marginTop: 10,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${participantPct}%`,
                    height: "100%",
                    background: "var(--color-emerald)",
                    transition: "width 0.4s ease",
                  }}
                />
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: minMet ? "var(--color-emerald)" : "var(--color-amber)",
                  marginTop: 8,
                }}
              >
                {minMet
                  ? `Minimum (${snapshot.minParticipants}) met`
                  : `Needs ${snapshot.minParticipants - snapshot.participantCount} more to hit minimum`}
              </div>
            </div>
          </div>

          {showLeaderboard && (
            <div>
              <h3
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                  color: "var(--color-text-primary)",
                  margin: "0 0 12px",
                }}
              >
                Top 10 Leaderboard
              </h3>
              {leaderboard.length === 0 ? (
                <div
                  style={{
                    color: "var(--color-text-muted)",
                    fontSize: 13,
                  }}
                >
                  No proofs submitted yet.
                </div>
              ) : (
                <div
                  style={{
                    background: "var(--color-bg-surface)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 10,
                    overflow: "hidden",
                  }}
                >
                  {leaderboard.map((entry, idx) => {
                    const rank = idx + 1;
                    const isUser =
                      userAddress &&
                      entry.address.toLowerCase() === userAddress.toLowerCase();
                    const tier = tierForRank(
                      rank,
                      Math.max(leaderboard.length, 30),
                    );
                    const tierColor =
                      tier === 1
                        ? "var(--color-indigo)"
                        : tier === 2
                          ? "var(--color-emerald)"
                          : "var(--color-text-muted)";
                    const tierBg =
                      tier === 1
                        ? "rgba(99,102,241,0.10)"
                        : tier === 2
                          ? "var(--color-emerald-muted)"
                          : "rgba(107,140,122,0.08)";
                    const tierBorder =
                      tier === 1
                        ? "rgba(99,102,241,0.35)"
                        : tier === 2
                          ? "rgba(0,107,79,0.35)"
                          : "rgba(107,140,122,0.25)";
                    return (
                      <div
                        key={entry.address}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "40px 1fr 1fr 90px",
                          gap: 12,
                          padding: "10px 14px",
                          alignItems: "center",
                          borderBottom:
                            idx === leaderboard.length - 1
                              ? "none"
                              : "1px solid var(--color-border)",
                          background: isUser
                            ? "var(--color-emerald-muted)"
                            : "transparent",
                          fontSize: 13,
                        }}
                      >
                        <span
                          style={{
                            color: "var(--color-text-muted)",
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          #{rank}
                        </span>
                        <span
                          style={{
                            color: "var(--color-text-primary)",
                            fontFamily: "monospace",
                          }}
                        >
                          {truncateAddress(entry.address)}
                          {isUser && (
                            <span
                              style={{
                                marginLeft: 8,
                                fontSize: 11,
                                color: "var(--color-emerald)",
                              }}
                            >
                              (you)
                            </span>
                          )}
                        </span>
                        <span
                          style={{
                            color: "var(--color-text-primary)",
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          {formatBpAsPercent(entry.improvementBp)}
                        </span>
                        <span
                          style={{
                            justifySelf: "end",
                            padding: "3px 8px",
                            borderRadius: 999,
                            fontSize: 10,
                            fontWeight: 600,
                            letterSpacing: 0.5,
                            color: tierColor,
                            border: `1px solid ${tierBorder}`,
                            background: tierBg,
                          }}
                        >
                          TIER {tier || "—"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <ActionPanel
            snapshot={snapshot}
            userState={userState}
            isConnected={isConnected}
            connect={() => walletService.connect()}
            actionLoading={actionLoading}
            actionError={actionError}
            actionTxHash={actionTxHash}
            onRegister={handleRegister}
            onSubmitProof={handleSubmitProof}
            onClaim={handleClaim}
          />
        </div>
      )}

      <style jsx>{`
        @keyframes springPushPulse {
          0%,
          100% {
            opacity: 1;
          }
          50% {
            opacity: 0.55;
          }
        }
      `}</style>
    </div>
  );
}

interface ActionPanelProps {
  snapshot: ContractSnapshot;
  userState: UserSnapshot | null;
  isConnected: boolean;
  connect: () => Promise<{ success: boolean; error?: string }>;
  actionLoading: boolean;
  actionError: string | null;
  actionTxHash: string | null;
  onRegister: () => Promise<void>;
  onSubmitProof: () => Promise<void>;
  onClaim: () => Promise<void>;
}

function ActionPanel({
  snapshot,
  userState,
  isConnected,
  connect,
  actionLoading,
  actionError,
  actionTxHash,
  onRegister,
  onSubmitProof,
  onClaim,
}: ActionPanelProps): JSX.Element {
  const primaryButtonClass =
    "px-4 py-2 rounded-lg font-medium text-sm transition-colors disabled:opacity-50";
  const primaryButtonStyle = {
    background: "var(--color-emerald)",
    color: "#FFFFFF",
    border: "1px solid var(--color-emerald)",
  };

  if (!isConnected) {
    return (
      <div
        style={{
          background: "var(--color-bg-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: 10,
          padding: 16,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ color: "var(--color-text-muted)", fontSize: 13 }}>
          Connect your wallet to register or check your standing.
        </div>
        <button
          className={primaryButtonClass}
          style={primaryButtonStyle}
          onClick={() => connect()}
        >
          Connect Wallet
        </button>
      </div>
    );
  }

  let body: JSX.Element;

  const mutedText = { color: "var(--color-text-muted)", fontSize: 13 } as const;
  const successText = {
    color: "var(--color-emerald)",
    fontSize: 14,
    fontWeight: 500,
  } as const;
  const bodyText = {
    color: "var(--color-text-primary)",
    fontSize: 13,
  } as const;

  switch (snapshot.state) {
    case ContestState.UNINITIALIZED:
      body = (
        <div style={mutedText}>
          Contest has not yet opened. Check back soon.
        </div>
      );
      break;
    case ContestState.REGISTRATION_OPEN: {
      if (userState?.registered) {
        body = <div style={successText}>Registered ✓</div>;
      } else {
        body = (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div style={mutedText}>Free to enter — claim your spot.</div>
            <button
              className={primaryButtonClass}
              style={primaryButtonStyle}
              onClick={onRegister}
              disabled={actionLoading}
            >
              {actionLoading ? "Submitting…" : "Register"}
            </button>
          </div>
        );
      }
      break;
    }
    case ContestState.ACTIVE: {
      if (!userState?.registered) {
        body = (
          <div style={mutedText}>Registration is closed for this contest.</div>
        );
      } else if (userState.improvementBp === 0n) {
        body = (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div style={mutedText}>
              Submit a Groth16 proof of improvement to qualify.
            </div>
            <button
              className={primaryButtonClass}
              style={primaryButtonStyle}
              onClick={onSubmitProof}
              disabled={actionLoading}
            >
              {actionLoading ? "Generating proof…" : "Submit Proof"}
            </button>
          </div>
        );
      } else {
        body = (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div style={successText}>Proof Submitted ✓</div>
            <div style={mutedText}>
              Improvement: {formatBpAsPercent(userState.improvementBp)}
            </div>
          </div>
        );
      }
      break;
    }
    case ContestState.CLAIMING: {
      if (!userState?.registered) {
        body = (
          <div style={mutedText}>
            Contest is in the claim window. You are not a participant.
          </div>
        );
      } else if (userState.improvementBp === 0n) {
        body = (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div style={mutedText}>
              Last chance — submit your proof before the claim window closes.
            </div>
            <button
              className={primaryButtonClass}
              style={primaryButtonStyle}
              onClick={onSubmitProof}
              disabled={actionLoading}
            >
              {actionLoading ? "Generating proof…" : "Submit Proof"}
            </button>
          </div>
        );
      } else {
        body = (
          <div style={mutedText}>
            Proof submitted. Awaiting finalization to claim prize.
          </div>
        );
      }
      break;
    }
    case ContestState.FINISHED: {
      if (userState?.claimed) {
        body = (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div style={successText}>Prize Claimed ✓</div>
            <div style={mutedText}>Tier {userState.previewTier || "—"}</div>
          </div>
        );
      } else if (userState?.rank && userState.rank > 0) {
        body = (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div style={bodyText}>
              You finished rank #{userState.rank} (Tier {userState.previewTier}
              ). Claim {formatEth(userState.previewPrize, 5)} ETH.
            </div>
            <button
              className={primaryButtonClass}
              style={primaryButtonStyle}
              onClick={onClaim}
              disabled={actionLoading}
            >
              {actionLoading ? "Claiming…" : "Claim Prize"}
            </button>
          </div>
        );
      } else {
        body = (
          <div style={mutedText}>
            Contest finished. Final standings posted on the leaderboard.
          </div>
        );
      }
      break;
    }
    case ContestState.FAILED:
      body = (
        <div style={{ color: "var(--color-amber)", fontSize: 13 }}>
          Contest did not meet the participant minimum.
        </div>
      );
      break;
    default:
      body = <div style={mutedText}>Unknown contest state.</div>;
  }

  return (
    <div
      style={{
        background: "var(--color-bg-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: 10,
        padding: 16,
        display: "grid",
        gap: 12,
      }}
    >
      {body}
      {actionError && (
        <div
          style={{
            color: "#dc2626",
            fontSize: 12,
            background: "rgba(239,68,68,0.08)",
            border: "1px solid rgba(239,68,68,0.25)",
            padding: 8,
            borderRadius: 6,
          }}
        >
          {actionError}
        </div>
      )}
      {actionTxHash && (
        <div style={{ color: "var(--color-text-muted)", fontSize: 12 }}>
          Tx submitted:{" "}
          <span
            style={{
              fontFamily: "monospace",
              color: "var(--color-emerald)",
            }}
          >
            {actionTxHash.slice(0, 10)}…{actionTxHash.slice(-6)}
          </span>
        </div>
      )}
    </div>
  );
}

export default SpringPushWidget;
