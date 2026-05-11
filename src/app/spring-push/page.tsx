"use client";

import { SpringPushWidget } from "@/components/SpringPushWidget";
import { ThemeToggle } from "@/components/ThemeToggle";
import Link from "next/link";
import React from "react";

const SpringPushPage: React.FC = () => {
  return (
    <div style={{ minHeight: "100vh", background: "var(--color-bg-primary)" }}>
      {/* ── Nav ─────────────────────────────────────────────── */}
      <nav
        style={{
          position: "sticky",
          top: 0,
          zIndex: 100,
          background: "var(--color-bg-nav)",
          backdropFilter: "blur(12px)",
          borderBottom: "1px solid var(--color-border)",
          padding: "0 24px",
          height: 64,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Link
          href="/"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            textDecoration: "none",
          }}
        >
          <div
            className="amach-wordmark-wrap"
            style={{ fontSize: "1rem", letterSpacing: "0.28em" }}
          >
            <span className="amach-wordmark-line">Amach</span>
            <span className="amach-wordmark-line-sub">Health</span>
          </div>
        </Link>

        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <Link href="/" className="link-muted" style={{ fontSize: "0.9rem" }}>
            ← Back
          </Link>
          <ThemeToggle />
        </div>
      </nav>

      {/* ══════════════════════════════════════════
          HERO
      ══════════════════════════════════════════ */}
      <section
        style={{
          padding: "96px 24px 64px",
          textAlign: "center",
          maxWidth: 760,
          margin: "0 auto",
        }}
      >
        <p
          style={{
            fontSize: "0.78rem",
            fontWeight: 700,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--color-emerald)",
            marginBottom: 24,
          }}
        >
          Season One
        </p>

        <h1
          style={{
            fontSize: "clamp(2.2rem, 5vw, 3.75rem)",
            fontWeight: 800,
            lineHeight: 1.1,
            color: "var(--color-text-primary)",
            letterSpacing: "-0.02em",
            marginBottom: 28,
          }}
        >
          <span style={{ color: "var(--color-emerald)" }}>Spring Push</span>
        </h1>

        <p
          style={{
            fontSize: "clamp(1rem, 2.5vw, 1.2rem)",
            lineHeight: 1.75,
            color: "var(--color-text-secondary)",
            maxWidth: 620,
            margin: "0 auto",
          }}
        >
          Prove a real improvement in your health markers with a zero-knowledge
          proof. Top finishers split a prize pool seeded by Amach Health. Free
          to enter, verified on-chain.
        </p>
      </section>

      {/* ══════════════════════════════════════════
          CONTEST WIDGET
      ══════════════════════════════════════════ */}
      <section
        style={{
          padding: "0 24px 64px",
          maxWidth: 1100,
          margin: "0 auto",
        }}
      >
        <SpringPushWidget />
      </section>

      {/* ══════════════════════════════════════════
          HOW IT WORKS
      ══════════════════════════════════════════ */}
      <section
        style={{
          padding: "80px 24px",
          background: "var(--color-bg-surface)",
          borderTop: "1px solid var(--color-border)",
          borderBottom: "1px solid var(--color-border)",
        }}
      >
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <p
            style={{
              fontSize: "0.7rem",
              fontWeight: 600,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--color-text-muted)",
              textAlign: "center",
              marginBottom: 56,
            }}
          >
            How the contest works
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: 48,
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <p
                style={{
                  fontSize: "0.72rem",
                  fontWeight: 700,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "var(--color-emerald)",
                }}
              >
                Step 1
              </p>
              <h3
                style={{
                  fontSize: "1.2rem",
                  fontWeight: 700,
                  color: "var(--color-text-primary)",
                  margin: 0,
                }}
              >
                Register
              </h3>
              <p
                style={{
                  fontSize: "0.95rem",
                  lineHeight: 1.7,
                  color: "var(--color-text-secondary)",
                  margin: 0,
                }}
              >
                Connect your wallet and register while the window is open. No
                entry fee — the prize pool is seeded by Amach Health.
              </p>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <p
                style={{
                  fontSize: "0.72rem",
                  fontWeight: 700,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "var(--color-emerald)",
                }}
              >
                Step 2
              </p>
              <h3
                style={{
                  fontSize: "1.2rem",
                  fontWeight: 700,
                  color: "var(--color-text-primary)",
                  margin: 0,
                }}
              >
                Improve & Prove
              </h3>
              <p
                style={{
                  fontSize: "0.95rem",
                  lineHeight: 1.7,
                  color: "var(--color-text-secondary)",
                  margin: 0,
                }}
              >
                Train, sleep, recover. When the contest closes, submit a Groth16
                proof that your health markers improved over the window —
                without revealing the underlying data.
              </p>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <p
                style={{
                  fontSize: "0.72rem",
                  fontWeight: 700,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "var(--color-emerald)",
                }}
              >
                Step 3
              </p>
              <h3
                style={{
                  fontSize: "1.2rem",
                  fontWeight: 700,
                  color: "var(--color-text-primary)",
                  margin: 0,
                }}
              >
                Claim
              </h3>
              <p
                style={{
                  fontSize: "0.95rem",
                  lineHeight: 1.7,
                  color: "var(--color-text-secondary)",
                  margin: 0,
                }}
              >
                Top finishers fall into Tier 1, 2, or 3 by ranked improvement.
                Once the claim window opens, eligible participants withdraw
                their share directly from the escrow contract.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────── */}
      <footer
        style={{
          borderTop: "1px solid var(--color-border)",
          padding: "32px 24px",
          textAlign: "center",
        }}
      >
        <p
          style={{
            fontSize: "0.85rem",
            color: "var(--color-text-muted)",
            margin: 0,
          }}
        >
          © {new Date().getFullYear()} Amach Health · Spring Push
        </p>
      </footer>
    </div>
  );
};

export default SpringPushPage;
