"use client";

import { ethers } from "ethers";
import { Trophy } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getActiveChain, getContractAddresses } from "@/lib/networkConfig";

const SUMMARY_ABI = [
  "function state() view returns (uint8)",
  "function prizePool() view returns (uint256)",
  "function participantCount() view returns (uint256)",
  "function MAX_PARTICIPANTS() view returns (uint256)",
];

enum ContestState {
  UNINITIALIZED = 0,
  REGISTRATION_OPEN = 1,
  ACTIVE = 2,
  CLAIMING = 3,
  FINISHED = 4,
  FAILED = 5,
}

interface Summary {
  state: ContestState;
  prizePool: bigint;
  participantCount: number;
  maxParticipants: number;
}

const REFRESH_MS = 30_000;

function stateLabel(state: ContestState): string {
  switch (state) {
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
    case ContestState.UNINITIALIZED:
    default:
      return "OPENING SOON";
  }
}

interface BadgeStyle {
  bg: string;
  fg: string;
  border: string;
  pulse: boolean;
}

function badgeStyle(state: ContestState): BadgeStyle {
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

function formatEth(value: bigint, fractionDigits = 4): string {
  return parseFloat(ethers.utils.formatEther(value.toString())).toFixed(
    fractionDigits,
  );
}

export function SpringPushHomepageBanner(): JSX.Element {
  const escrowAddress = useMemo(
    () => getContractAddresses().SPRING_PUSH_ESCROW_CONTRACT,
    [],
  );
  const rpcUrl = useMemo(() => getActiveChain().rpcUrls.default.http[0], []);
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    let cancelled = false;
    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    const contract = new ethers.Contract(escrowAddress, SUMMARY_ABI, provider);

    const load = async (): Promise<void> => {
      try {
        const [rawState, prizePool, rawCount, rawMax] = await Promise.all([
          contract.state(),
          contract.prizePool(),
          contract.participantCount(),
          contract.MAX_PARTICIPANTS(),
        ]);
        if (cancelled) return;
        setSummary({
          state: Number(rawState) as ContestState,
          prizePool: (prizePool as ethers.BigNumber).toBigInt(),
          participantCount: (rawCount as ethers.BigNumber).toNumber(),
          maxParticipants: (rawMax as ethers.BigNumber).toNumber(),
        });
      } catch (err) {
        console.warn("SpringPushHomepageBanner: failed to load summary", err);
      }
    };

    load();
    const interval = setInterval(load, REFRESH_MS);
    return (): void => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [escrowAddress, rpcUrl]);

  const badge = badgeStyle(summary?.state ?? ContestState.UNINITIALIZED);
  const stateText = summary ? stateLabel(summary.state) : "LOADING";

  return (
    <Link
      href="/spring-push"
      style={{
        display: "block",
        textDecoration: "none",
        color: "inherit",
      }}
    >
      <div
        className="amach-card"
        style={{
          padding: "20px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 24,
          flexWrap: "wrap",
          transition: "transform 0.15s ease, border-color 0.15s ease",
          cursor: "pointer",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = "var(--color-border-strong)";
          e.currentTarget.style.transform = "translateY(-1px)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = "var(--color-border)";
          e.currentTarget.style.transform = "translateY(0)";
        }}
      >
        {/* Left: identity + state */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              background: "var(--color-emerald-muted)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--color-emerald)",
              flexShrink: 0,
            }}
          >
            <Trophy size={20} />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              <p
                style={{
                  fontSize: "0.7rem",
                  fontWeight: 600,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "var(--color-text-muted)",
                  margin: 0,
                }}
              >
                Spring Push · Season One
              </p>
              <span
                style={{
                  padding: "2px 8px",
                  borderRadius: 999,
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: 0.5,
                  background: badge.bg,
                  color: badge.fg,
                  border: `1px solid ${badge.border}`,
                  animation: badge.pulse
                    ? "springPushBannerPulse 2s infinite"
                    : "none",
                }}
              >
                {stateText}
              </span>
            </div>
            <p
              style={{
                fontSize: "1rem",
                fontWeight: 600,
                color: "var(--color-text-primary)",
                margin: 0,
                lineHeight: 1.35,
              }}
            >
              Prove your improvement. Split the prize pool.
            </p>
          </div>
        </div>

        {/* Middle: live stats */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 28,
            flexWrap: "wrap",
          }}
        >
          <Stat
            label="Prize Pool"
            value={summary ? `${formatEth(summary.prizePool)} ETH` : "—"}
          />
          <Stat
            label="Participants"
            value={
              summary
                ? `${summary.participantCount} / ${summary.maxParticipants}`
                : "—"
            }
          />
        </div>

        {/* Right: CTA */}
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: "0.9rem",
            fontWeight: 600,
            color: "var(--color-emerald)",
            whiteSpace: "nowrap",
          }}
        >
          View Contest
          <span aria-hidden="true">→</span>
        </span>

        <style jsx>{`
          @keyframes springPushBannerPulse {
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
    </Link>
  );
}

interface StatProps {
  label: string;
  value: string;
}

function Stat({ label, value }: StatProps): JSX.Element {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span
        style={{
          fontSize: "0.65rem",
          fontWeight: 600,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--color-text-muted)",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: "1rem",
          fontWeight: 600,
          color: "var(--color-text-primary)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </span>
    </div>
  );
}

export default SpringPushHomepageBanner;
