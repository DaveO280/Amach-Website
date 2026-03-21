"use client";

import { ThemeToggle } from "@/components/ThemeToggle";
import Link from "next/link";
import React from "react";

// ── Icons ─────────────────────────────────────────────────────

function IconUpload(): JSX.Element {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function IconLock(): JSX.Element {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function IconDatabase(): JSX.Element {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
    </svg>
  );
}

function IconChain(): JSX.Element {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

function IconChat(): JSX.Element {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

// ── Step card ─────────────────────────────────────────────────

interface StepProps {
  number: string;
  icon: React.ReactNode;
  headline: string;
  body: string;
  tag?: string;
}

function StepCard({ number, icon, headline, body, tag }: StepProps): JSX.Element {
  return (
    <div
      style={{
        display: "flex",
        gap: 28,
        padding: "36px 0",
        borderBottom: "1px solid var(--color-border)",
      }}
    >
      {/* Step number + icon column */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, flexShrink: 0 }}>
        <span
          style={{
            fontSize: "0.72rem",
            fontWeight: 700,
            letterSpacing: "0.1em",
            color: "var(--color-text-muted)",
          }}
        >
          {number}
        </span>
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: 14,
            background: "var(--color-emerald-muted)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--color-emerald)",
          }}
        >
          {icon}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, paddingTop: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
          <h3
            style={{
              fontSize: "1.2rem",
              fontWeight: 700,
              color: "var(--color-text-primary)",
              lineHeight: 1.25,
            }}
          >
            {headline}
          </h3>
          {tag && (
            <span
              style={{
                fontSize: "0.68rem",
                fontWeight: 700,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "var(--color-emerald)",
                background: "var(--color-emerald-muted)",
                padding: "3px 8px",
                borderRadius: 4,
                whiteSpace: "nowrap",
              }}
            >
              {tag}
            </span>
          )}
        </div>
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
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────

const HowItWorksPage: React.FC = () => {
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
          padding: "96px 24px 72px",
          textAlign: "center",
          maxWidth: 720,
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
          How It Works
        </p>

        <h1
          style={{
            fontSize: "clamp(2.2rem, 5vw, 3.5rem)",
            fontWeight: 800,
            lineHeight: 1.1,
            color: "var(--color-text-primary)",
            letterSpacing: "-0.02em",
            marginBottom: 28,
          }}
        >
          Your data, encrypted,{" "}
          <span style={{ color: "var(--color-emerald)" }}>
            from the moment it leaves your device.
          </span>
        </h1>

        <p
          style={{
            fontSize: "clamp(1rem, 2.5vw, 1.2rem)",
            lineHeight: 1.75,
            color: "var(--color-text-secondary)",
            maxWidth: 580,
            margin: "0 auto",
          }}
        >
          Five steps. One vault. An intelligence that reads your biology, not
          a population average. Here&apos;s exactly what happens when you use
          Amach.
        </p>
      </section>

      {/* ══════════════════════════════════════════
          THE FLOW
      ══════════════════════════════════════════ */}
      <section
        style={{
          padding: "0 24px 96px",
          maxWidth: 820,
          margin: "0 auto",
        }}
      >
        <StepCard
          number="01"
          icon={<IconUpload />}
          headline="Export and upload your health data"
          tag="Live"
          body="Export your Apple Health archive on iOS and upload it to Amach. We also accept PDFs: lab results, DEXA scans, doctor notes, prescriptions. Everything is parsed entirely inside your browser. Nothing touches a server at this stage."
        />

        <StepCard
          number="02"
          icon={<IconLock />}
          headline="Encrypted before it leaves your device"
          tag="Live"
          body="Your data is encrypted with AES-256 using keys derived from your wallet signature before it ever leaves your browser. No one at Amach has access to the plaintext. Not in transit, not at rest. The architecture makes it impossible, not just policy."
        />

        <StepCard
          number="03"
          icon={<IconDatabase />}
          headline="Stored permanently on Storj"
          tag="Live"
          body="Your encrypted data is written to Storj, a decentralised storage network with no single point of failure or control. It&apos;s tied to your wallet address and persists across devices and sessions. Upload once, read anywhere. Clear your browser, your data is still there."
        />

        <StepCard
          number="04"
          icon={<IconChain />}
          headline="Your identity anchored on ZKsync Era"
          tag="Testnet Live"
          body="Your health profile — birth date, sex, height, weight — is encrypted and written to a smart contract on ZKsync Era Sepolia. It&apos;s your permanent on-chain health identity. Tamper-evident, verifiable, and updatable only by you. Mainnet follows when the protocol matures."
        />

        <StepCard
          number="05"
          icon={<IconChat />}
          headline="Luma reads your data and talks to you about it"
          tag="Live"
          body="Luma is Amach&apos;s AI, powered by Venice AI. She has access to your full health record: every metric, every uploaded document, every data point you&apos;ve collected. Ask her about your HRV trends, your bloodwork patterns, how your sleep correlates with recovery. She reads your biology, not a textbook average."
        />
      </section>

      {/* ══════════════════════════════════════════
          ARCHITECTURE
      ══════════════════════════════════════════ */}
      <section
        style={{
          padding: "80px 24px",
          background: "var(--color-bg-card)",
          borderTop: "1px solid var(--color-border)",
          borderBottom: "1px solid var(--color-border)",
        }}
      >
        <div style={{ maxWidth: 960, margin: "0 auto" }}>
          <p
            style={{
              fontSize: "0.72rem",
              fontWeight: 700,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--color-text-muted)",
              marginBottom: 12,
            }}
          >
            The Stack
          </p>
          <h2
            style={{
              fontSize: "clamp(1.5rem, 3vw, 2.2rem)",
              fontWeight: 800,
              color: "var(--color-text-primary)",
              letterSpacing: "-0.02em",
              marginBottom: 48,
            }}
          >
            Three layers. All live.
          </h2>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: 24,
            }}
          >
            {/* Storage */}
            <div className="card" style={{ padding: "32px 28px" }}>
              <p
                style={{
                  fontSize: "0.72rem",
                  fontWeight: 700,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "var(--color-emerald)",
                  marginBottom: 14,
                }}
              >
                Storage
              </p>
              <h3
                style={{
                  fontSize: "1.15rem",
                  fontWeight: 700,
                  color: "var(--color-text-primary)",
                  marginBottom: 12,
                }}
              >
                Storj
              </h3>
              <p
                style={{
                  fontSize: "0.95rem",
                  lineHeight: 1.7,
                  color: "var(--color-text-secondary)",
                }}
              >
                Decentralised, encrypted object storage. Your health files live
                here permanently, accessible only with your wallet-derived key.
                No Amach server in the path.
              </p>
            </div>

            {/* Identity */}
            <div className="card" style={{ padding: "32px 28px" }}>
              <p
                style={{
                  fontSize: "0.72rem",
                  fontWeight: 700,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "var(--color-emerald)",
                  marginBottom: 14,
                }}
              >
                Identity
              </p>
              <h3
                style={{
                  fontSize: "1.15rem",
                  fontWeight: 700,
                  color: "var(--color-text-primary)",
                  marginBottom: 12,
                }}
              >
                ZKsync Era
              </h3>
              <p
                style={{
                  fontSize: "0.95rem",
                  lineHeight: 1.7,
                  color: "var(--color-text-secondary)",
                }}
              >
                Your profile contract lives on ZKsync Era Sepolia testnet.
                Encrypted on-chain, updatable only by the wallet that created
                it. Mainnet deployment follows protocol maturity.
              </p>
            </div>

            {/* Intelligence */}
            <div className="card" style={{ padding: "32px 28px" }}>
              <p
                style={{
                  fontSize: "0.72rem",
                  fontWeight: 700,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "var(--color-emerald)",
                  marginBottom: 14,
                }}
              >
                Intelligence
              </p>
              <h3
                style={{
                  fontSize: "1.15rem",
                  fontWeight: 700,
                  color: "var(--color-text-primary)",
                  marginBottom: 12,
                }}
              >
                Venice AI
              </h3>
              <p
                style={{
                  fontSize: "0.95rem",
                  lineHeight: 1.7,
                  color: "var(--color-text-secondary)",
                }}
              >
                Privacy-native AI that processes your data without retaining
                it. Luma uses Venice to read your full health record and
                surface patterns specific to your biology, not population norms.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          PRIVACY
      ══════════════════════════════════════════ */}
      <section
        style={{
          padding: "80px 24px",
          maxWidth: 820,
          margin: "0 auto",
        }}
      >
        <p
          style={{
            fontSize: "0.72rem",
            fontWeight: 700,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--color-text-muted)",
            marginBottom: 12,
          }}
        >
          Privacy
        </p>
        <h2
          style={{
            fontSize: "clamp(1.5rem, 3vw, 2.2rem)",
            fontWeight: 800,
            color: "var(--color-text-primary)",
            letterSpacing: "-0.02em",
            marginBottom: 40,
          }}
        >
          What Amach can and cannot see.
        </h2>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
            gap: 24,
          }}
        >
          <div className="card" style={{ padding: "32px 28px" }}>
            <p
              style={{
                fontSize: "0.72rem",
                fontWeight: 700,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "var(--color-text-muted)",
                marginBottom: 20,
              }}
            >
              We can see
            </p>
            <ul
              style={{
                listStyle: "none",
                padding: 0,
                margin: 0,
                display: "flex",
                flexDirection: "column",
                gap: 12,
              }}
            >
              {[
                "That you connected a wallet",
                "That an encrypted blob exists on Storj",
                "That a profile record exists on ZKsync",
                "That the AI chat was used (not the content)",
              ].map((item) => (
                <li
                  key={item}
                  style={{
                    display: "flex",
                    gap: 10,
                    fontSize: "0.95rem",
                    lineHeight: 1.5,
                    color: "var(--color-text-secondary)",
                  }}
                >
                  <span style={{ color: "var(--color-text-muted)", flexShrink: 0 }}>·</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="card" style={{ padding: "32px 28px" }}>
            <p
              style={{
                fontSize: "0.72rem",
                fontWeight: 700,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "var(--color-text-muted)",
                marginBottom: 20,
              }}
            >
              We cannot see
            </p>
            <ul
              style={{
                listStyle: "none",
                padding: 0,
                margin: 0,
                display: "flex",
                flexDirection: "column",
                gap: 12,
              }}
            >
              {[
                "Your Apple Health data",
                "Your uploaded PDFs or lab results",
                "The contents of your on-chain profile",
                "Your AI conversations with Luma",
                "Anything in your encrypted Storj vault",
              ].map((item) => (
                <li
                  key={item}
                  style={{
                    display: "flex",
                    gap: 10,
                    fontSize: "0.95rem",
                    lineHeight: 1.5,
                    color: "var(--color-text-secondary)",
                  }}
                >
                  <span style={{ color: "var(--color-text-muted)", flexShrink: 0 }}>·</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          FAQ
      ══════════════════════════════════════════ */}
      <section
        style={{
          padding: "0 24px 96px",
          maxWidth: 820,
          margin: "0 auto",
        }}
      >
        <p
          style={{
            fontSize: "0.72rem",
            fontWeight: 700,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--color-text-muted)",
            marginBottom: 40,
          }}
        >
          Questions
        </p>

        {[
          {
            q: "What happens if I clear my browser?",
            a: "Your health data is stored on Storj, not in your browser. Clear away. When you reconnect your wallet, everything is still there. Your ZKsync profile is on-chain, permanent.",
          },
          {
            q: "Do I need to re-upload my data on a new device?",
            a: "No. Connect your wallet on any device and your data loads from Storj. It follows your wallet, not your browser.",
          },
          {
            q: "Can Amach read my health data?",
            a: "No. Your data is encrypted with a key derived from your wallet signature. We never see it. If we tried, we&apos;d read noise.",
          },
          {
            q: "What is Venice AI and why does Luma use it?",
            a: "Venice AI is a privacy-native inference provider that doesn&apos;t retain conversation data. We chose it specifically because the AI that reads your health information shouldn&apos;t be building a dataset from it.",
          },
          {
            q: "When does ZKsync move to mainnet?",
            a: "When the protocol is stable enough to warrant it. We&apos;re on Sepolia testnet deliberately, building the right foundation before committing to mainnet immutability.",
          },
          {
            q: "How do I give feedback?",
            a: "Email directly: amachhealth@gmail.com. Every message is read and responded to personally.",
          },
        ].map(({ q, a }) => (
          <div
            key={q}
            style={{
              padding: "28px 0",
              borderBottom: "1px solid var(--color-border)",
            }}
          >
            <h3
              style={{
                fontSize: "1.05rem",
                fontWeight: 700,
                color: "var(--color-text-primary)",
                marginBottom: 10,
              }}
            >
              {q}
            </h3>
            <p
              style={{
                fontSize: "0.975rem",
                lineHeight: 1.75,
                color: "var(--color-text-secondary)",
              }}
              dangerouslySetInnerHTML={{ __html: a }}
            />
          </div>
        ))}
      </section>

      {/* ══════════════════════════════════════════
          CTA
      ══════════════════════════════════════════ */}
      <section
        style={{
          padding: "96px 24px",
          textAlign: "center",
          maxWidth: 600,
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
          Your data is ready to work for you.
        </h2>
        <p
          style={{
            fontSize: "1.1rem",
            lineHeight: 1.75,
            color: "var(--color-text-secondary)",
            marginBottom: 48,
          }}
        >
          Connect your wallet, upload your health export, and ask Luma anything.
          It takes about five minutes.
        </p>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
          <button
            className="btn-emerald"
            style={{ fontSize: "1.05rem", padding: "16px 40px" }}
            onClick={() => { window.location.href = "mailto:amachhealth@gmail.com?subject=Early Protocol Access"; }}
          >
            Request Early Access →
          </button>
          <div style={{ display: "flex", gap: 24 }}>
            <Link href="/mission" className="link-muted">
              Our mission
            </Link>
            <Link href="/" className="link-muted">
              Back to home
            </Link>
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
        <p style={{ fontSize: "0.85rem", color: "var(--color-text-muted)" }}>
          © {new Date().getFullYear()} Amach Health · Driven by Data, Guided by Nature
        </p>
      </footer>

    </div>
  );
};

export default HowItWorksPage;
