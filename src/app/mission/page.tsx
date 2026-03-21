"use client";

import { ThemeToggle } from "@/components/ThemeToggle";
import Link from "next/link";
import React from "react";

// ── Icon components ───────────────────────────────────────────

function IconData(): JSX.Element {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 3v18h18" />
      <path d="M18 17V9" />
      <path d="M13 17V5" />
      <path d="M8 17v-3" />
    </svg>
  );
}

function IconLeaf(): JSX.Element {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z" />
      <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
    </svg>
  );
}

function IconShield(): JSX.Element {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

// ── Principle card ────────────────────────────────────────────

interface PrincipleProps {
  icon: React.ReactNode;
  label: string;
  headline: string;
  body: string;
}

function PrincipleCard({ icon, label, headline, body }: PrincipleProps): JSX.Element {
  return (
    <div
      className="card"
      style={{
        padding: "40px 36px",
        display: "flex",
        flexDirection: "column",
        gap: 20,
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: 14,
          background: "var(--color-emerald-muted)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--color-emerald)",
          flexShrink: 0,
        }}
      >
        {icon}
      </div>

      <p
        style={{
          fontSize: "0.72rem",
          fontWeight: 700,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--color-emerald)",
        }}
      >
        {label}
      </p>

      <h3
        style={{
          fontSize: "1.35rem",
          fontWeight: 700,
          color: "var(--color-text-primary)",
          lineHeight: 1.25,
          marginTop: -8,
        }}
      >
        {headline}
      </h3>

      <p
        style={{
          fontSize: "1rem",
          lineHeight: 1.75,
          color: "var(--color-text-secondary)",
        }}
      >
        {body}
      </p>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────

const MissionPage: React.FC = () => {
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
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div className="amach-wordmark-wrap" style={{ fontSize: "1rem", letterSpacing: "0.28em" }}>
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
          padding: "96px 24px 80px",
          textAlign: "center",
          maxWidth: 760,
          margin: "0 auto",
        }}
      >
        {/* Eyebrow */}
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
          Our Mission
        </p>

        {/* Headline */}
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
          Driven by{" "}
          <span style={{ color: "var(--color-emerald)" }}>Data</span>
          ,{" "}
          <br />
          Guided by{" "}
          <span style={{ color: "var(--color-emerald)" }}>Nature</span>.
        </h1>

        {/* Subhead */}
        <p
          style={{
            fontSize: "clamp(1rem, 2.5vw, 1.2rem)",
            lineHeight: 1.75,
            color: "var(--color-text-secondary)",
            maxWidth: 600,
            margin: "0 auto",
          }}
        >
          Modern medicine measures everything and understands too little. We think
          the answer isn&apos;t less data. It&apos;s data that belongs to you,
          interpreted for your biology, and never sold to anyone.
        </p>
      </section>

      {/* ══════════════════════════════════════════
          THREE PRINCIPLES
      ══════════════════════════════════════════ */}
      <section
        style={{
          padding: "0 24px 96px",
          maxWidth: 1100,
          margin: "0 auto",
        }}
      >
        {/* Divider label */}
        <p
          style={{
            fontSize: "0.72rem",
            fontWeight: 700,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--color-text-muted)",
            textAlign: "center",
            marginBottom: 48,
          }}
        >
          The Principles
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
            gap: 24,
          }}
        >
          <PrincipleCard
            icon={<IconData />}
            label="Data"
            headline="Measure what matters. Own what you measure."
            body="Wearables, bloodwork, genetics, sleep. The numbers that define your
              health exist right now, scattered across silos no one gave you the
              key to. We've created the tools for you to collect them in one
              encrypted vault. Yours alone. The data doesn't become valuable
              because a corporation aggregates it. It was always valuable.
              You just weren't holding it."
          />

          <PrincipleCard
            icon={<IconLeaf />}
            label="Nature"
            headline="Your biology isn't average. Your health intelligence shouldn't be either."
            body="Population averages flatten the very variation that matters most.
              Your HRV baseline, your sleep architecture, your cortisol curve
              are written in your own longitudinal data. Amach reads that signal
              and reflects it back to you, not a statistical ghost that looks
              nothing like you."
          />

          <PrincipleCard
            icon={<IconShield />}
            label="Sovereignty"
            headline="Privacy isn't a feature. It's the foundation."
            body="Your health data is the most intimate thing about you. We built
              the architecture around that fact: end-to-end encrypted, stored
              on decentralized infrastructure, verified on-chain. No one at
              Amach can read your records. No advertiser will. No data broker
              ever will. Sovereignty isn't a setting you enable. It's the
              default."
          />
        </div>
      </section>

      {/* ══════════════════════════════════════════
          THE PROBLEM
      ══════════════════════════════════════════ */}
      <section
        style={{
          padding: "80px 24px",
          background: "var(--color-bg-card)",
          borderTop: "1px solid var(--color-border)",
          borderBottom: "1px solid var(--color-border)",
        }}
      >
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <p
            style={{
              fontSize: "0.72rem",
              fontWeight: 700,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--color-text-muted)",
              marginBottom: 32,
            }}
          >
            The Problem
          </p>

          <h2
            style={{
              fontSize: "clamp(1.6rem, 3.5vw, 2.4rem)",
              fontWeight: 800,
              color: "var(--color-text-primary)",
              lineHeight: 1.2,
              letterSpacing: "-0.02em",
              marginBottom: 32,
            }}
          >
            The system was built to extract from you,{" "}
            <span style={{ color: "var(--color-emerald)" }}>not for you</span>.
          </h2>

          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <p
              style={{
                fontSize: "1.05rem",
                lineHeight: 1.8,
                color: "var(--color-text-secondary)",
              }}
            >
              Every health app you&apos;ve used, every lab you&apos;ve visited, every wearable
              you&apos;ve worn. Each one captures a fragment of your biology and keeps it.
              Your records don&apos;t follow you. They follow the business model.
            </p>
            <p
              style={{
                fontSize: "1.05rem",
                lineHeight: 1.8,
                color: "var(--color-text-secondary)",
              }}
            >
              The result is a fragmented picture of your health that no one,
              including you, can see whole. Decisions get made on partial data.
              Patterns go unnoticed. And somewhere, your information is being
              sold to people who&apos;ve never met you.
            </p>
            <p
              style={{
                fontSize: "1.05rem",
                lineHeight: 1.8,
                color: "var(--color-text-secondary)",
              }}
            >
              We&apos;re not trying to improve that system. We&apos;re building outside it.
            </p>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          CLOSING CTA
      ══════════════════════════════════════════ */}
      <section
        style={{
          padding: "96px 24px",
          textAlign: "center",
          maxWidth: 640,
          margin: "0 auto",
        }}
      >
        <h2
          style={{
            fontSize: "clamp(1.6rem, 3.5vw, 2.4rem)",
            fontWeight: 800,
            color: "var(--color-text-primary)",
            lineHeight: 1.2,
            letterSpacing: "-0.02em",
            marginBottom: 20,
          }}
        >
          The future of health isn&apos;t in a corporate silo.
        </h2>
        <p
          style={{
            fontSize: "1.1rem",
            lineHeight: 1.75,
            color: "var(--color-text-secondary)",
            marginBottom: 48,
          }}
        >
          It&apos;s sovereign, it&apos;s personal, and it starts with you
          holding your own data. Join the early protocol.
        </p>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
          <button
            className="btn-emerald"
            style={{ fontSize: "1.05rem", padding: "16px 40px" }}
            onClick={() => { window.location.href = "mailto:amachhealth@gmail.com?subject=Early Protocol Access"; }}
          >
            Request Early Access →
          </button>
          <Link href="/" className="link-muted">
            Back to home
          </Link>
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
        <p style={{ fontSize: "0.85rem", color: "var(--color-text-muted)" }}>
          © {new Date().getFullYear()} Amach Health · Driven by Data, Guided by Nature
        </p>
      </footer>

    </div>
  );
};

export default MissionPage;
