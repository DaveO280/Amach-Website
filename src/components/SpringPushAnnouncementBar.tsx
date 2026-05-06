"use client";

import { ethers } from "ethers";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { getActiveChain, getContractAddresses } from "@/lib/networkConfig";

const SUMMARY_ABI = [
  "function state() view returns (uint8)",
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

const REFRESH_MS = 30_000;
const DEFAULT_MAX_PARTICIPANTS = 100;
const PRIZE_DISPLAY = "$1,500";

interface Summary {
  state: ContestState;
  participantCount: number;
  maxParticipants: number;
}

export function SpringPushAnnouncementBar(): JSX.Element {
  const escrowAddress = useMemo(
    () => getContractAddresses().SPRING_PUSH_ESCROW_CONTRACT,
    [],
  );
  const rpcUrl = useMemo(() => getActiveChain().rpcUrls.default.http[0], []);
  const [summary, setSummary] = useState<Summary | null>(null);
  const prevCountRef = useRef<number | null>(null);
  const [tickKey, setTickKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    const contract = new ethers.Contract(escrowAddress, SUMMARY_ABI, provider);

    const load = async (): Promise<void> => {
      try {
        const [rawState, rawCount, rawMax] = await Promise.all([
          contract.state(),
          contract.participantCount(),
          contract.MAX_PARTICIPANTS(),
        ]);
        if (cancelled) return;
        const next: Summary = {
          state: Number(rawState) as ContestState,
          participantCount: (rawCount as ethers.BigNumber).toNumber(),
          maxParticipants: (rawMax as ethers.BigNumber).toNumber(),
        };
        setSummary((prev) => {
          if (prev && prev.participantCount !== next.participantCount) {
            prevCountRef.current = prev.participantCount;
            setTickKey((k) => k + 1);
          }
          return next;
        });
      } catch (err) {
        console.warn("SpringPushAnnouncementBar: failed to load summary", err);
      }
    };

    load();
    const interval = setInterval(load, REFRESH_MS);
    return (): void => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [escrowAddress, rpcUrl]);

  const isFinished =
    summary?.state === ContestState.FINISHED ||
    summary?.state === ContestState.FAILED;
  const isActive = summary?.state === ContestState.ACTIVE;

  const count = summary?.participantCount ?? 0;
  const max = summary?.maxParticipants ?? DEFAULT_MAX_PARTICIPANTS;
  const fillRatio = Math.min(1, count / Math.max(1, max));

  const label = isFinished
    ? "Spring Push — Final Results"
    : "Spring Push Season One";
  const ctaLabel = isFinished ? "View Results" : "View Contest";

  // Layout-critical styles are inline so they CANNOT be lost to styled-jsx
  // scoping (Next/Link renders <a>, which is display:inline by default; if
  // the scoped flex rule fails to attach, the children collapse to the left).
  return (
    <Link
      href="/spring-push"
      aria-label={`${label}. ${count} of ${max} participants. ${PRIZE_DISPLAY} prize verified on-chain. ${ctaLabel}.`}
      className="spring-push-announcement-bar"
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 24,
        width: "100%",
        padding: "0 24px",
        minHeight: 42,
        textDecoration: "none",
        fontSize: "0.8rem",
        lineHeight: 1.2,
      }}
    >
      {/* Left: identity */}
      <div
        className="spa-left"
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          flexShrink: 0,
          minWidth: 0,
        }}
      >
        <span className="spa-trophy" aria-hidden="true">
          🏆
        </span>
        <span className="spa-eyebrow">{label}</span>
        {isActive && (
          <span className="spa-live-pill">
            <span className="spa-live-dot" aria-hidden="true" />
            LIVE
          </span>
        )}
      </div>

      {/* Center: ticker */}
      <div
        className="spa-center"
        aria-live="polite"
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          flex: "1 1 auto",
          minWidth: 0,
        }}
      >
        <span className="spa-progress-track" aria-hidden="true">
          <span
            className="spa-progress-fill"
            style={{ width: `${fillRatio * 100}%` }}
          />
        </span>
        <span className="spa-count-wrap">
          <span key={tickKey} className="spa-count">
            {count}
          </span>
          <span className="spa-count-divider">/</span>
          <span className="spa-count-max">{max}</span>
          <span className="spa-count-label">participants</span>
        </span>
      </div>

      {/* Right: prize + CTA */}
      <div
        className="spa-right"
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          gap: 16,
          flexShrink: 0,
          minWidth: 0,
        }}
      >
        <span className="spa-prize">
          <span className="spa-prize-amount">{PRIZE_DISPLAY} Prize</span>
          <span className="spa-prize-divider" aria-hidden="true">
            ·
          </span>
          <span className="spa-prize-verified">
            <span aria-hidden="true">⛓</span> Verified on-chain
          </span>
        </span>
        <span className="spa-cta">
          {ctaLabel}
          <span aria-hidden="true">→</span>
        </span>
      </div>

      <style jsx>{`
        .spring-push-announcement-bar {
          background: rgba(0, 107, 79, 0.08);
          border-bottom: 1px solid var(--color-border);
          color: var(--color-text-primary);
          transition: background 0.15s ease;
        }
        .spring-push-announcement-bar:hover {
          background: rgba(0, 107, 79, 0.12);
        }
        :global([data-theme="dark"]) .spring-push-announcement-bar {
          background: rgba(0, 107, 79, 0.12);
        }
        :global([data-theme="dark"]) .spring-push-announcement-bar:hover {
          background: rgba(0, 107, 79, 0.18);
        }

        .spa-trophy {
          font-size: 14px;
          line-height: 1;
        }
        .spa-eyebrow {
          font-size: 0.7rem;
          font-weight: 600;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--color-text-primary);
          white-space: nowrap;
        }

        .spa-live-pill {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 2px 7px;
          border-radius: 999px;
          font-size: 0.6rem;
          font-weight: 700;
          letter-spacing: 0.08em;
          background: rgba(0, 107, 79, 0.15);
          color: #006b4f;
          border: 1px solid rgba(0, 107, 79, 0.3);
        }
        :global([data-theme="dark"]) .spa-live-pill {
          color: #4ade80;
          background: rgba(0, 107, 79, 0.25);
          border-color: rgba(74, 222, 128, 0.35);
        }
        .spa-live-dot {
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: currentColor;
          animation: spa-pulse 1.6s ease-in-out infinite;
        }

        .spa-progress-track {
          position: relative;
          width: 64px;
          height: 4px;
          border-radius: 2px;
          background: rgba(0, 107, 79, 0.15);
          overflow: hidden;
          flex-shrink: 0;
        }
        :global([data-theme="dark"]) .spa-progress-track {
          background: rgba(0, 107, 79, 0.22);
        }
        .spa-progress-fill {
          position: absolute;
          inset: 0 auto 0 0;
          background: #006b4f;
          transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1);
        }
        :global([data-theme="dark"]) .spa-progress-fill {
          background: #4ade80;
        }

        .spa-count-wrap {
          display: inline-flex;
          align-items: baseline;
          gap: 4px;
          font-variant-numeric: tabular-nums;
          white-space: nowrap;
        }
        .spa-count {
          font-size: 0.95rem;
          font-weight: 700;
          color: #006b4f;
          display: inline-block;
          animation: spa-tick 0.5s ease;
        }
        :global([data-theme="dark"]) .spa-count {
          color: #4ade80;
        }
        .spa-count-divider {
          color: var(--color-text-muted);
          font-weight: 500;
        }
        .spa-count-max {
          font-size: 0.85rem;
          font-weight: 600;
          color: var(--color-text-secondary);
        }
        .spa-count-label {
          font-size: 0.75rem;
          color: var(--color-text-muted);
          margin-left: 4px;
        }

        .spa-prize {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          white-space: nowrap;
        }
        .spa-prize-amount {
          font-size: 0.8rem;
          font-weight: 600;
          color: var(--color-text-primary);
        }
        .spa-prize-divider {
          color: var(--color-text-muted);
        }
        .spa-prize-verified {
          font-size: 0.75rem;
          color: var(--color-text-muted);
        }

        .spa-cta {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 0.8rem;
          font-weight: 600;
          color: #006b4f;
          white-space: nowrap;
          transition: gap 0.15s ease;
        }
        :global([data-theme="dark"]) .spa-cta {
          color: #4ade80;
        }
        .spring-push-announcement-bar:hover .spa-cta {
          gap: 10px;
        }

        @keyframes spa-pulse {
          0%,
          100% {
            opacity: 1;
            transform: scale(1);
          }
          50% {
            opacity: 0.55;
            transform: scale(0.85);
          }
        }
        @keyframes spa-tick {
          0% {
            transform: translateY(-4px);
            opacity: 0;
          }
          100% {
            transform: translateY(0);
            opacity: 1;
          }
        }

        /* Responsive collapse */
        @media (max-width: 900px) {
          .spa-count-label {
            display: none;
          }
          .spa-progress-track {
            width: 48px;
          }
          .spa-prize-verified {
            display: none;
          }
          .spa-prize-divider {
            display: none;
          }
        }
        @media (max-width: 640px) {
          .spring-push-announcement-bar {
            font-size: 0.75rem;
          }
          .spa-eyebrow {
            font-size: 0.65rem;
            letter-spacing: 0.08em;
          }
          .spa-progress-track {
            display: none;
          }
          .spa-prize-amount {
            font-size: 0.75rem;
          }
          .spa-cta {
            font-size: 0.75rem;
          }
        }
        @media (max-width: 480px) {
          .spa-prize {
            display: none;
          }
        }
      `}</style>
    </Link>
  );
}

export default SpringPushAnnouncementBar;
