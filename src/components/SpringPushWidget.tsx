"use client";

import { getIdentityToken } from "@privy-io/react-auth";
import { ethers } from "ethers";
import { Loader2, Trophy } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPublicClient, http } from "viem";
import { usePrivyWalletService } from "@/hooks/usePrivyWalletService";
import { getActiveChain, getContractAddresses } from "@/lib/networkConfig";
import { getCachedWalletEncryptionKey } from "@/utils/walletEncryption";
import { generateAndSubmitProof } from "@/zk/improvementProofClient";
import {
  BASELINE_LEAVES_DATATYPE,
  FINISH_LEAVES_DATATYPE,
  fetchLatestLeavesBundle,
} from "@/zk/improvementLeafFetcher";
import {
  __internal as witnessInternal,
  hashLeafV2,
  serializeLeafV2,
  type AmachLeafV2Fields,
} from "@/zk/improvementWitnessBuilder";
import {
  projectStorjHealthToV2Leaves,
  type WindowType,
} from "@/zk/storjToV2Leaf";

const DEADLINE_ABI = [
  {
    type: "function",
    name: "contestCloseTime",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "claimWindowEndTime",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
] as const;

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
const FAST_REFRESH_INTERVAL_MS = 5_000;
// zkSync Era produces a block every ~2s, so 3,000,000 blocks ≈ 6,000,000s
// ≈ 69 days of history — enough to cover the full 90-day Spring Push contest
// from registration through claim window with a comfortable safety margin.
// NOTE: this is a stopgap. The correct long-term fix is to index ProofSubmitted
// events off-chain (Storj, Subgraph, etc.) instead of scanning historical logs.
const LEADERBOARD_BLOCK_LOOKBACK = 3_000_000;

const DEV_SEED_ENABLED = process.env.NEXT_PUBLIC_DEV_SEED_ENABLED === "true";

// Two hours past `claimWindowEndTime` is the threshold for surfacing a
// "finalize is overdue" message to participants. Below this, the standard
// "Awaiting finalization to claim prize." copy is shown.
const FINALIZE_OVERDUE_GRACE_SECONDS = 2 * 60 * 60;

// sessionStorage keys (per-wallet) for persisting preloaded leaves across
// refreshes. Cleared once the contest leaves the CLAIMING state.
const SS_BASELINE_LEAVES_PREFIX = "amach_sp_leaves_baseline_";
const SS_FINISH_LEAVES_PREFIX = "amach_sp_leaves_finish_";

// #14 — Safety net: if a prod deploy somehow has the dev-seed env var enabled,
// crash loudly in the console so it shows up in logs even if the button is
// hidden by other guards. This runs at module load (once).
if (
  typeof process !== "undefined" &&
  process.env.NEXT_PUBLIC_DEV_SEED_ENABLED === "true" &&
  process.env.NODE_ENV === "production"
) {
  console.error(
    "[SpringPushWidget] FATAL MISCONFIGURATION: NEXT_PUBLIC_DEV_SEED_ENABLED=true in a production build. " +
      "The dev seed flow MUST NOT ship to prod. Unset this env var and redeploy.",
  );
}

// Fixture VO2max values (u16, deci-units = mL/kg/min × 10) chosen so the
// integer-bp constraint in the improvement circuit is satisfied. Matches
// the working fixture in `scripts/test-spring-push-proof.ts`:
//   baseline picks (2 lowest): 490 + 510 = 1000
//   finish picks   (2 highest): 620 + 600 = 1220
//   baselineCross = 2000, finishCross = 2440, diff = 440
//   claimedMagnitudeBp = 440 · 10000 / 2000 = 2200 (+22.00%)
const SEED_BASELINE_DAY_IDS = [0, 1, 2, 3];
const SEED_FINISH_DAY_IDS = [90, 91, 92, 93];
const SEED_BASELINE_VO2 = [490, 510, 530, 550];
const SEED_FINISH_VO2 = [600, 580, 590, 620];

function buildSeedLeaf(
  wallet: string,
  dayId: number,
  vo2max: number,
): AmachLeafV2Fields {
  return {
    wallet,
    dayId,
    timezoneOffset: -300,
    steps: 8000,
    activeEnergy: 35000,
    exerciseMins: 40,
    hrv: 42,
    restingHR: 58,
    sleepMins: 450,
    workoutCount: 1,
    sourceCount: 2,
    dataFlags: 0x0000_03ff,
    vo2max,
    weight: 7800,
    bodyFatPct: 1850,
    leanMass: 6300,
    deepSleepMins: 75,
    remSleepMins: 95,
    lightSleepMins: 240,
    awakeMins: 20,
    sourceHash:
      "1111111111111111111111111111111111111111111111111111111111111111",
  };
}

// Compute the depth-7 Merkle root the improvement circuit will verify
// against. Mirrors `buildImprovementWitnessFromLeaves`: serialize each leaf,
// Poseidon4-hash it, pad with the deterministic dummy leaf up to 128, then
// fold pairs up the tree.
function computeBaselineRoot(leaves: AmachLeafV2Fields[]): bigint {
  const TARGET = 128;
  const DEPTH = 7;
  const dummy = witnessInternal.makeDummyLeafV2();
  const bufs: Uint8Array[] = leaves.map(serializeLeafV2);
  while (bufs.length < TARGET) bufs.push(dummy);
  const hashes = bufs.map(hashLeafV2);
  const tree = witnessInternal.buildMerkleTree(hashes, DEPTH);
  return tree[tree.length - 1][0];
}

function bigintToBytes32Hex(value: bigint): string {
  return "0x" + value.toString(16).padStart(64, "0");
}

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

function formatMSS(secondsRemaining: number): string {
  const safe = Math.max(0, secondsRemaining);
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
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
  const [seedLoading, setSeedLoading] = useState(false);
  const [seedError, setSeedError] = useState<string | null>(null);
  const [seedStatus, setSeedStatus] = useState<string | null>(null);
  const [seedBaselineRoot, setSeedBaselineRoot] = useState<string | null>(null);
  const [cachedBaselineLeaves, setCachedBaselineLeaves] = useState<
    AmachLeafV2Fields[] | null
  >(null);
  const [cachedFinishLeaves, setCachedFinishLeaves] = useState<
    AmachLeafV2Fields[] | null
  >(null);
  const [generateLoading, setGenerateLoading] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [generateStatus, setGenerateStatus] = useState<string | null>(null);

  // #7 — Rehydrate cached leaves from sessionStorage on mount and whenever the
  // wallet changes. Stored per-wallet so a wallet-switch can't leak leaves.
  useEffect(() => {
    if (typeof window === "undefined" || !userAddress) return;
    const key = userAddress.toLowerCase();
    try {
      const baselineRaw = window.sessionStorage.getItem(
        `${SS_BASELINE_LEAVES_PREFIX}${key}`,
      );
      const finishRaw = window.sessionStorage.getItem(
        `${SS_FINISH_LEAVES_PREFIX}${key}`,
      );
      if (baselineRaw)
        setCachedBaselineLeaves(JSON.parse(baselineRaw) as AmachLeafV2Fields[]);
      if (finishRaw)
        setCachedFinishLeaves(JSON.parse(finishRaw) as AmachLeafV2Fields[]);
    } catch (err) {
      console.warn("SpringPushWidget: failed to rehydrate cached leaves", err);
    }
  }, [userAddress]);

  const readProvider = useMemo(
    () => new ethers.providers.JsonRpcProvider(rpcUrl),
    [rpcUrl],
  );

  const publicClient = useMemo(
    () =>
      createPublicClient({
        chain: getActiveChain(),
        transport: http(rpcUrl),
      }),
    [rpcUrl],
  );

  // Deadlines read via viem publicClient (stored in ms, or null until loaded).
  const [contestCloseTime, setContestCloseTime] = useState<number | null>(null);
  const [claimWindowEndTime, setClaimWindowEndTime] = useState<number | null>(
    null,
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
    const tick = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return (): void => clearInterval(tick);
  }, []);

  // #7 — Once the contest transitions out of CLAIMING (FINISHED or FAILED),
  // the cached leaves are no longer useful for proof submission. Drop them
  // from both component state and sessionStorage so a future contest can't
  // accidentally reuse stale fixture data.
  useEffect(() => {
    if (!snapshot || !userAddress || typeof window === "undefined") return;
    const isPostClaiming =
      snapshot.state === ContestState.FINISHED ||
      snapshot.state === ContestState.FAILED;
    if (!isPostClaiming) return;
    const key = userAddress.toLowerCase();
    try {
      window.sessionStorage.removeItem(`${SS_BASELINE_LEAVES_PREFIX}${key}`);
      window.sessionStorage.removeItem(`${SS_FINISH_LEAVES_PREFIX}${key}`);
    } catch (err) {
      console.warn("SpringPushWidget: failed to clear cached leaves", err);
    }
    setCachedBaselineLeaves(null);
    setCachedFinishLeaves(null);
  }, [snapshot, userAddress]);

  // Read both deadlines via viem publicClient on mount and whenever the
  // contest state changes (e.g. ACTIVE → CLAIMING after the chain transitions).
  useEffect(() => {
    let cancelled = false;
    const readDeadlines = async (): Promise<void> => {
      try {
        const [closeTime, claimEnd] = await Promise.all([
          publicClient.readContract({
            address: escrowAddress as `0x${string}`,
            abi: DEADLINE_ABI,
            functionName: "contestCloseTime",
          }),
          publicClient.readContract({
            address: escrowAddress as `0x${string}`,
            abi: DEADLINE_ABI,
            functionName: "claimWindowEndTime",
          }),
        ]);
        if (cancelled) return;
        setContestCloseTime(Number(closeTime) * 1000);
        setClaimWindowEndTime(Number(claimEnd) * 1000);
      } catch (err) {
        console.warn("SpringPushWidget: failed to read deadlines", err);
      }
    };
    void readDeadlines();
    return (): void => {
      cancelled = true;
    };
  }, [publicClient, escrowAddress, snapshot?.state]);

  // Prefer the viem-read deadlines (stored in ms); fall back to the snapshot
  // (in seconds) so the countdown renders immediately on first paint while
  // the viem read is still in flight.
  const contestCloseSec =
    contestCloseTime !== null
      ? Math.floor(contestCloseTime / 1000)
      : (snapshot?.contestCloseTime ?? 0);
  const claimWindowEndSec =
    claimWindowEndTime !== null
      ? Math.floor(claimWindowEndTime / 1000)
      : (snapshot?.claimWindowEndTime ?? 0);

  const phaseRemaining: {
    label: string;
    seconds: number;
    format: "mss" | "long";
    amber: boolean;
  } | null = useMemo(() => {
    if (!snapshot) return null;
    switch (snapshot.state) {
      case ContestState.REGISTRATION_OPEN:
        return {
          label: "Registration open",
          seconds: -1,
          format: "long",
          amber: false,
        };
      case ContestState.ACTIVE:
        return {
          label: "Contest ends in",
          seconds: Math.max(0, contestCloseSec - now),
          format: "mss",
          amber: false,
        };
      case ContestState.CLAIMING:
        return {
          label: "Claim window closes in",
          seconds: Math.max(0, claimWindowEndSec - now),
          format: "mss",
          amber: true,
        };
      case ContestState.FINISHED:
        return {
          label: "Contest finished",
          seconds: -1,
          format: "long",
          amber: false,
        };
      case ContestState.FAILED:
        return {
          label: "Contest failed — minimum not met",
          seconds: -1,
          format: "long",
          amber: false,
        };
      case ContestState.UNINITIALIZED:
      default:
        return {
          label: "Contest not yet open",
          seconds: -1,
          format: "long",
          amber: false,
        };
    }
  }, [snapshot, now, contestCloseSec, claimWindowEndSec]);

  const countdownExpired = Boolean(
    snapshot &&
    ((snapshot.state === ContestState.ACTIVE && contestCloseSec - now <= 0) ||
      (snapshot.state === ContestState.CLAIMING &&
        claimWindowEndSec - now <= 0)),
  );

  useEffect(() => {
    refresh();
    const intervalMs = countdownExpired
      ? FAST_REFRESH_INTERVAL_MS
      : REFRESH_INTERVAL_MS;
    const interval = setInterval(refresh, intervalMs);
    return (): void => clearInterval(interval);
  }, [refresh, countdownExpired]);

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
        cachedBaselineLeaves && cachedFinishLeaves
          ? { baseline: cachedBaselineLeaves, finish: cachedFinishLeaves }
          : undefined,
      );
      setActionTxHash(hash);
      await refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setActionError(message);
    } finally {
      setActionLoading(false);
    }
  }, [
    isConnected,
    userAddress,
    walletService,
    escrowAddress,
    refresh,
    cachedBaselineLeaves,
    cachedFinishLeaves,
  ]);

  const handleSeedTestLeaves = useCallback(async (): Promise<void> => {
    if (!isConnected || !userAddress) {
      setSeedError("Connect your wallet to seed test leaves.");
      return;
    }
    setSeedLoading(true);
    setSeedError(null);
    setSeedStatus(null);
    setSeedBaselineRoot(null);
    try {
      const encryptionKey = await getCachedWalletEncryptionKey(
        userAddress,
        walletService.signMessage,
      );

      const baselineLeaves = SEED_BASELINE_DAY_IDS.map((day, i) =>
        buildSeedLeaf(userAddress, day, SEED_BASELINE_VO2[i]),
      );
      const finishLeaves = SEED_FINISH_DAY_IDS.map((day, i) =>
        buildSeedLeaf(userAddress, day, SEED_FINISH_VO2[i]),
      );

      // The leaf-upload route is now Privy-auth-gated — caller must hold an
      // identity token whose linked accounts include `userAddress`.
      const identityToken = await getIdentityToken();
      if (!identityToken) {
        throw new Error(
          "Could not retrieve Privy identity token — please reconnect your wallet and try again.",
        );
      }

      const postWindow = async (
        windowName: "baseline" | "finish",
        leaves: AmachLeafV2Fields[],
      ): Promise<void> => {
        const res = await fetch("/api/merkle/v2/upload", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${identityToken}`,
          },
          body: JSON.stringify({
            walletAddress: userAddress,
            encryptionKey,
            window: windowName,
            leaves,
          }),
        });
        const json = (await res.json()) as {
          success?: boolean;
          error?: string;
        };
        if (!res.ok || json.success === false) {
          throw new Error(
            `[${windowName}] upload failed (${res.status}): ${json.error ?? "unknown error"}`,
          );
        }
      };

      setSeedStatus("Uploading baseline…");
      await postWindow("baseline", baselineLeaves);
      setSeedStatus("Uploading baseline… ✅  Uploading finish…");
      await postWindow("finish", finishLeaves);
      setCachedBaselineLeaves(baselineLeaves);
      setCachedFinishLeaves(finishLeaves);
      // Persist for refresh-survival; matches the per-wallet rehydrate effect.
      if (typeof window !== "undefined" && userAddress) {
        const key = userAddress.toLowerCase();
        try {
          window.sessionStorage.setItem(
            `${SS_BASELINE_LEAVES_PREFIX}${key}`,
            JSON.stringify(baselineLeaves),
          );
          window.sessionStorage.setItem(
            `${SS_FINISH_LEAVES_PREFIX}${key}`,
            JSON.stringify(finishLeaves),
          );
        } catch (err) {
          console.warn(
            "SpringPushWidget: failed to persist cached leaves",
            err,
          );
        }
      }
      setSeedStatus(
        "Uploading baseline… ✅  Uploading finish… ✅  Verifying baseline…",
      );

      // Verification round-trip: confirm both windows are actually readable back from Storj.
      let baselineOk = false;
      try {
        const bytes = await fetchLatestLeavesBundle(
          userAddress,
          encryptionKey,
          BASELINE_LEAVES_DATATYPE,
        );
        baselineOk = bytes.length > 0;
      } catch {
        baselineOk = false;
      }

      setSeedStatus(
        `Uploading baseline… ✅  Uploading finish… ✅  Verifying baseline… ${baselineOk ? "✅" : "❌"}  Verifying finish…`,
      );

      let finishOk = false;
      try {
        const bytes = await fetchLatestLeavesBundle(
          userAddress,
          encryptionKey,
          FINISH_LEAVES_DATATYPE,
        );
        finishOk = bytes.length > 0;
      } catch {
        finishOk = false;
      }

      setSeedStatus(
        `Uploading baseline… ✅  Uploading finish… ✅  Verifying baseline… ${baselineOk ? "✅" : "❌"}  Verifying finish… ${finishOk ? "✅" : "❌"}`,
      );

      if (!baselineOk || !finishOk) {
        const failedWindow = !baselineOk ? "baseline" : "finish";
        setSeedError(
          `Upload succeeded but ${failedWindow} leaves not readable back from Storj — Storj HeadObject may be failing. Check server logs.`,
        );
        return;
      }

      const rootHex = bigintToBytes32Hex(computeBaselineRoot(baselineLeaves));
      console.log("🌱 Seed Test Leaves — baselineRoot:", rootHex);
      setSeedBaselineRoot(rootHex);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setSeedError(message);
    } finally {
      setSeedLoading(false);
    }
  }, [isConnected, userAddress, walletService]);

  // Window the "Use My Health Data" button applies to in the current
  // contest state. baseline at REGISTRATION_OPEN, finish at ACTIVE/CLAIMING.
  // Any other state hides the button entirely.
  const generateWindow: WindowType | null = useMemo(() => {
    if (!snapshot) return null;
    if (snapshot.state === ContestState.REGISTRATION_OPEN) return "baseline";
    if (
      snapshot.state === ContestState.ACTIVE ||
      snapshot.state === ContestState.CLAIMING
    ) {
      return "finish";
    }
    return null;
  }, [snapshot]);

  const handleGenerateFromHealthData = useCallback(async (): Promise<void> => {
    if (!isConnected || !userAddress) {
      setGenerateError("Connect your wallet first.");
      return;
    }
    if (!generateWindow) {
      setGenerateError(
        "Health-data generation is only available during the contest's baseline (registration) and finish (active/claiming) windows.",
      );
      return;
    }
    setGenerateLoading(true);
    setGenerateError(null);
    setGenerateStatus(null);
    try {
      const encryptionKey = await getCachedWalletEncryptionKey(
        userAddress,
        walletService.signMessage,
      );

      setGenerateStatus(
        `Reading your Apple Health export and projecting ${generateWindow} leaves…`,
      );
      // projectStorjHealthToV2Leaves takes the bare PBKDF2 key string; pass
      // `.key` rather than the full `WalletEncryptionKey` object.
      const leaves = await projectStorjHealthToV2Leaves(
        userAddress,
        encryptionKey.key,
        generateWindow,
      );

      // Cache in memory + sessionStorage. Submit Proof's in-memory shortcut
      // will use these directly — no Storj upload required for the projection
      // path (iOS-direct-sync users still publish bundles via the sync flow).
      if (generateWindow === "baseline") {
        setCachedBaselineLeaves(leaves);
      } else {
        setCachedFinishLeaves(leaves);
      }
      if (typeof window !== "undefined") {
        const key = userAddress.toLowerCase();
        try {
          const ssKey =
            generateWindow === "baseline"
              ? `${SS_BASELINE_LEAVES_PREFIX}${key}`
              : `${SS_FINISH_LEAVES_PREFIX}${key}`;
          window.sessionStorage.setItem(ssKey, JSON.stringify(leaves));
        } catch (err) {
          console.warn(
            "SpringPushWidget: failed to persist generated leaves",
            err,
          );
        }
      }

      setGenerateStatus(
        `✅ Projected ${leaves.length} day(s) for the ${generateWindow} window — cached and ready for Submit Proof.`,
      );
    } catch (err) {
      const rawMessage = err instanceof Error ? err.message : "Unknown error";
      // The projection layer throws a specific message when the wallet has no
      // apple-health-full-export at all; expand that into actionable guidance
      // so users know where to go next instead of treating the failure as a
      // generic error.
      const isMissingExport =
        /No apple-health-full-export found on Storj/i.test(rawMessage);
      setGenerateError(
        isMissingExport
          ? "No Apple Health data found on Storj for this wallet. " +
              "Open Settings → Storage and upload your Apple Health export first, " +
              "then come back and try again."
          : rawMessage,
      );
    } finally {
      setGenerateLoading(false);
    }
  }, [isConnected, userAddress, walletService, generateWindow]);

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
            <span
              style={{
                fontSize: 13,
                color: phaseRemaining.amber
                  ? "var(--color-amber)"
                  : "var(--color-text-muted)",
                fontVariantNumeric:
                  phaseRemaining.format === "mss" ? "tabular-nums" : undefined,
                fontWeight: phaseRemaining.amber ? 600 : undefined,
              }}
            >
              {phaseRemaining.label}{" "}
              {phaseRemaining.format === "mss"
                ? formatMSS(phaseRemaining.seconds)
                : formatCountdown(phaseRemaining.seconds)}
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
            now={now}
            claimWindowEndSec={claimWindowEndSec}
            onRegister={handleRegister}
            onSubmitProof={handleSubmitProof}
            onClaim={handleClaim}
          />

          {generateWindow && isConnected && (
            <div
              style={{
                border: "1px solid var(--color-border)",
                borderRadius: 10,
                padding: 14,
                background: "var(--color-bg-surface)",
                display: "grid",
                gap: 10,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--color-text-muted)",
                  }}
                >
                  Project the{" "}
                  <strong style={{ color: "var(--color-text-primary)" }}>
                    {generateWindow}
                  </strong>{" "}
                  leaf bundle from your existing Apple Health export on Storj.
                  Requires an `apple-health-full-export` upload via the
                  health-sync flow.
                </div>
                <button
                  onClick={handleGenerateFromHealthData}
                  disabled={generateLoading}
                  className="px-4 py-2 rounded-lg font-medium text-sm transition-colors disabled:opacity-50"
                  style={{
                    background: "var(--color-emerald)",
                    color: "#FFFFFF",
                    border: "1px solid var(--color-emerald)",
                    cursor: generateLoading ? "not-allowed" : "pointer",
                  }}
                >
                  {generateLoading ? "Projecting…" : "Use My Health Data"}
                </button>
              </div>
              {generateStatus && (
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--color-text-muted)",
                    fontFamily: "monospace",
                  }}
                >
                  {generateStatus}
                </div>
              )}
              {(cachedBaselineLeaves || cachedFinishLeaves) && (
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--color-emerald)",
                    fontFamily: "monospace",
                  }}
                >
                  Leaves cached in memory —{" "}
                  {cachedBaselineLeaves
                    ? `baseline (${cachedBaselineLeaves.length})`
                    : "baseline (—)"}
                  {" / "}
                  {cachedFinishLeaves
                    ? `finish (${cachedFinishLeaves.length})`
                    : "finish (—)"}
                  {cachedBaselineLeaves && cachedFinishLeaves
                    ? " — Submit Proof will use these directly"
                    : ""}
                </div>
              )}
              {generateError && (
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
                  {generateError}
                </div>
              )}
            </div>
          )}

          {DEV_SEED_ENABLED && (
            <div
              style={{
                border: "1px dashed var(--color-border)",
                borderRadius: 10,
                padding: 14,
                background: "transparent",
                color: "var(--color-text-muted)",
                display: "grid",
                gap: 10,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <div style={{ fontSize: 12 }}>
                  Dev helper — seeds the integer-bp-clean fixture leaves to
                  Storj for this wallet (baseline + finish windows).
                </div>
                <button
                  onClick={handleSeedTestLeaves}
                  disabled={seedLoading || !isConnected}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 500,
                    background: "transparent",
                    color: "var(--color-text-muted)",
                    border: "1px dashed var(--color-border)",
                    cursor:
                      seedLoading || !isConnected ? "not-allowed" : "pointer",
                    opacity: seedLoading || !isConnected ? 0.6 : 1,
                  }}
                >
                  {seedLoading
                    ? "Seeding test leaves…"
                    : "🌱 Seed Test Leaves (dev only)"}
                </button>
              </div>
              {seedStatus && (
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--color-text-muted)",
                    fontFamily: "monospace",
                  }}
                >
                  {seedStatus}
                </div>
              )}
              {cachedBaselineLeaves && cachedFinishLeaves && (
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--color-emerald)",
                    fontFamily: "monospace",
                  }}
                >
                  Leaves cached in memory — Submit Proof will use these directly
                </div>
              )}
              {seedError && (
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
                  {seedError}
                </div>
              )}
              {seedBaselineRoot && (
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--color-text-primary)",
                    background: "var(--color-bg-surface)",
                    border: "1px solid var(--color-border)",
                    padding: 10,
                    borderRadius: 6,
                    display: "grid",
                    gap: 4,
                  }}
                >
                  <div
                    style={{
                      textTransform: "uppercase",
                      letterSpacing: 0.5,
                      fontSize: 10,
                      color: "var(--color-text-muted)",
                    }}
                  >
                    baselineRoot (copy into openRegistration)
                  </div>
                  <code
                    style={{
                      fontFamily: "monospace",
                      fontSize: 12,
                      wordBreak: "break-all",
                      userSelect: "all",
                    }}
                  >
                    {seedBaselineRoot}
                  </code>
                </div>
              )}
            </div>
          )}
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
  now: number;
  claimWindowEndSec: number;
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
  now,
  claimWindowEndSec,
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
        // #12 — If the claim window has been over for more than the grace
        // period and we're STILL in CLAIMING, finalize() hasn't been called.
        // Surface this so users don't think the app is broken.
        const claimWindowOverdueSec = now - claimWindowEndSec;
        const finalizeOverdue =
          claimWindowEndSec > 0 &&
          claimWindowOverdueSec > FINALIZE_OVERDUE_GRACE_SECONDS;
        body = finalizeOverdue ? (
          <div style={{ color: "var(--color-amber)", fontSize: 13 }}>
            Finalization pending — check back soon or contact support if this
            persists.
          </div>
        ) : (
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
