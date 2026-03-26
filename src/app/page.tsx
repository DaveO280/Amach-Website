"use client";

import AiCompanionModal from "@/components/AiCompanionModal";
import BetaNotification from "@/components/BetaNotification";
import HealthDashboardModal from "@/components/HealthDashboardModal";
import { useHealthDataContext } from "@/components/HealthDataContextWrapper";
import { OnboardingModal } from "@/components/OnboardingModal";
import { ThemeToggle } from "@/components/ThemeToggle";
import WalletConnectButton from "@/components/WalletConnectButton";
import { WalletSetupWizard } from "@/components/WalletSetupWizard";
import { Menu, X } from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";

// ── Icon components ──────────────────────────────────────────
function IconLock(): JSX.Element {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function IconSparkle(): JSX.Element {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" />
    </svg>
  );
}

function IconArrow(): JSX.Element {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

// ── Main page ────────────────────────────────────────────────
const MainPage: React.FC = (): JSX.Element => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const {
    isDashboardOpen,
    setIsDashboardOpen,
    isAiCompanionOpen,
    setIsAiCompanionOpen,
  } = useHealthDataContext();

  const [showBetaNotification, setShowBetaNotification] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingInitialStep, setOnboardingInitialStep] = useState(0);
  const [showWalletWizard, setShowWalletWizard] = useState(false);

  useEffect(() => {
    const hasSeenOnboarding = localStorage.getItem("amach-onboarding-complete");
    if (!hasSeenOnboarding) {
      const timer = setTimeout(() => setShowOnboarding(true), 500);
      return (): void => clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    const handleResize = (): void => {
      if (window.innerWidth >= 768) setIsMobileMenuOpen(false);
    };
    window.addEventListener("resize", handleResize);
    return (): void => window.removeEventListener("resize", handleResize);
  }, []);

  const navItems = [
    { label: "How it Works", href: "/how-it-works" },
    { label: "Mission", href: "/mission" },
    { label: "Whitepaper", href: "/whitepaper" },
  ];

  const handleDashboardClick = (): void => {
    setShowBetaNotification(true);
    setIsMobileMenuOpen(false);
    const clickEvent = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
      view: window,
    });
    document.body.dispatchEvent(clickEvent);
  };

  const openDashboard = (): void => setIsDashboardOpen(true);

  const handleOnboardingClose = (): void => {
    setShowOnboarding(false);
    localStorage.setItem("amach-onboarding-complete", "true");
  };

  const handleOnboardingConnectWallet = (): void => {
    handleOnboardingClose();
    setShowWalletWizard(true);
  };

  const handleOnboardingUploadData = (): void => {
    handleOnboardingClose();
    handleDashboardClick();
  };

  const handleOnboardingOpenAI = (): void => {
    handleOnboardingClose();
    setIsAiCompanionOpen(true);
  };

  const handleWizardComplete = (): void => {
    setShowWalletWizard(false);
    setShowOnboarding(true);
    setOnboardingInitialStep(2);
    localStorage.setItem("amach-wallet-setup-complete", "true");
  };

  return (
    <div
      className="page-bg"
      style={{
        background: "var(--color-bg-primary)",
        color: "var(--color-text-primary)",
      }}
    >
      {/* ── Modals — keep wired, just preserved ── */}
      <OnboardingModal
        isOpen={showOnboarding}
        onClose={handleOnboardingClose}
        onConnectWallet={handleOnboardingConnectWallet}
        initialStep={onboardingInitialStep}
        onUploadData={handleOnboardingUploadData}
        onOpenAI={handleOnboardingOpenAI}
      />
      <WalletSetupWizard
        isOpen={showWalletWizard}
        onClose={() => setShowWalletWizard(false)}
        onComplete={handleWizardComplete}
      />
      <HealthDashboardModal
        isOpen={isDashboardOpen}
        onClose={() => setIsDashboardOpen(false)}
      />
      <AiCompanionModal
        isOpen={isAiCompanionOpen}
        onClose={() => setIsAiCompanionOpen(false)}
      />
      <BetaNotification
        isOpen={showBetaNotification}
        onClose={() => setShowBetaNotification(false)}
        onConfirm={openDashboard}
      />

      {/* ══════════════════════════════════════════
          NAV
      ══════════════════════════════════════════ */}
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 100,
          background: "var(--color-bg-nav)",
          borderBottom: "1px solid var(--color-border)",
          backdropFilter: "blur(12px)",
        }}
      >
        <div
          style={{
            maxWidth: 1200,
            margin: "0 auto",
            padding: "0 24px",
            height: 76,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          {/* Left cluster: wordmark + Venice side by side */}
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <div
              className="amach-wordmark-wrap"
              style={{ fontSize: "1rem", letterSpacing: "0.28em" }}
            >
              <span className="amach-wordmark-line">Amach</span>
              <span className="amach-wordmark-line-sub">Health</span>
            </div>
            {/* Divider */}
            <span
              style={{
                width: 1,
                height: 28,
                background: "var(--color-border)",
                flexShrink: 0,
              }}
              aria-hidden="true"
            />
            {/* Venice — sits right beside the wordmark */}
            <a
              href="https://venice.ai/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Visit Venice AI"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                opacity: 0.55,
                textDecoration: "none",
              }}
              onClick={(e) => {
                e.preventDefault();
                try {
                  window.open(
                    "https://venice.ai/",
                    "_blank",
                    "noopener,noreferrer",
                  );
                } catch {
                  window.location.href = "https://venice.ai/";
                }
              }}
            >
              <span
                style={{
                  fontSize: "0.68rem",
                  color: "var(--color-text-muted)",
                  whiteSpace: "nowrap",
                }}
              >
                Powered by
              </span>
              <Image
                src="/venice-logo/Venice Lockup SVG/venice-logo-lockup-black.svg"
                alt="Venice AI"
                width={52}
                height={13}
                className="venice-logo"
              />
            </a>
          </div>

          {/* Desktop nav */}
          <nav
            className="hidden md:flex"
            style={{ alignItems: "center", gap: 40 }}
          >
            {navItems.map((item) => (
              <a
                key={item.label}
                href={item.href}
                style={{
                  fontSize: "0.875rem",
                  color: "var(--color-text-secondary)",
                  textDecoration: "none",
                  transition: "color 0.15s ease",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.color = "var(--color-emerald)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.color = "var(--color-text-secondary)")
                }
              >
                {item.label}
              </a>
            ))}
            <ThemeToggle />
            <WalletConnectButton
              onDashboardClick={handleDashboardClick}
              onAiCompanionClick={() => setIsAiCompanionOpen(true)}
            />
          </nav>

          {/* Mobile: theme toggle + hamburger */}
          <div
            className="flex md:hidden"
            style={{ alignItems: "center", gap: 12 }}
          >
            <ThemeToggle />
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              aria-label="Toggle menu"
              style={{
                width: 36,
                height: 36,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: "1px solid var(--color-border)",
                borderRadius: 8,
                background: "transparent",
                cursor: "pointer",
                color: "var(--color-text-secondary)",
              }}
            >
              {isMobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {isMobileMenuOpen && (
          <div
            style={{
              background: "var(--color-bg-surface)",
              borderTop: "1px solid var(--color-border)",
              padding: "16px 24px 24px",
            }}
            className="md:hidden"
          >
            {navItems.map((item) => (
              <a
                key={item.label}
                href={item.href}
                style={{
                  display: "block",
                  padding: "10px 0",
                  fontSize: "1rem",
                  color: "var(--color-text-secondary)",
                  textDecoration: "none",
                  borderBottom: "1px solid var(--color-border)",
                }}
                onClick={() => setIsMobileMenuOpen(false)}
              >
                {item.label}
              </a>
            ))}
            <div style={{ paddingTop: 16 }}>
              <WalletConnectButton
                onDashboardClick={() => {
                  handleDashboardClick();
                  setIsMobileMenuOpen(false);
                }}
                onAiCompanionClick={() => {
                  setIsAiCompanionOpen(true);
                  setIsMobileMenuOpen(false);
                }}
              />
            </div>
          </div>
        )}
      </header>

      {/* ══════════════════════════════════════════
          HERO
      ══════════════════════════════════════════ */}
      <section
        className="shimmer-texture"
        style={{
          minHeight: "90vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "80px 24px",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Luma sparkle — decorative background mark */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            fontSize: "320px",
            lineHeight: 1,
            color: "#6366F1",
            opacity: 0.05,
            fontWeight: 800,
            pointerEvents: "none",
            userSelect: "none",
            zIndex: 0,
          }}
        >
          ✦
        </div>

        <div
          style={{
            position: "relative",
            zIndex: 1,
            maxWidth: 760,
            margin: "0 auto",
            textAlign: "center",
          }}
        >
          {/* Headline */}
          <h1
            style={{
              fontSize: "clamp(2rem, 5vw, 3.5rem)",
              fontWeight: 800,
              lineHeight: 1.15,
              color: "var(--color-text-primary)",
              marginBottom: 24,
              letterSpacing: "-0.02em",
            }}
          >
            Your health data has been{" "}
            <span style={{ color: "var(--color-emerald)" }}>
              someone else&apos;s asset
            </span>{" "}
            for long enough.
          </h1>

          {/* Subhead */}
          <p
            style={{
              fontSize: "clamp(1rem, 2.5vw, 1.25rem)",
              lineHeight: 1.7,
              color: "var(--color-text-secondary)",
              marginBottom: 48,
              maxWidth: 600,
              margin: "0 auto 48px",
            }}
          >
            Amach returns it to you. Encrypted, on-chain, and readable by an
            intelligence built for your biology, not the average.
          </p>

          {/* CTAs */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 16,
            }}
          >
            <button
              className="btn-emerald"
              style={{ fontSize: "1.05rem", padding: "16px 40px" }}
              onClick={() => setShowOnboarding(true)}
            >
              New User? Start here →
            </button>
            <a href="/how-it-works" className="link-muted">
              Learn how it works
            </a>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          TWO FUTURES
      ══════════════════════════════════════════ */}
      <section
        style={{ padding: "80px 24px", maxWidth: 1100, margin: "0 auto" }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
            gap: 24,
          }}
        >
          {/* Card 1 — default future */}
          <div
            className="amach-card"
            style={{
              padding: "40px 36px",
              opacity: 0.75,
            }}
          >
            <p
              style={{
                fontSize: "0.7rem",
                fontWeight: 600,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "var(--color-text-muted)",
                marginBottom: 24,
              }}
            >
              The default
            </p>
            <p
              style={{
                fontSize: "1.15rem",
                lineHeight: 1.8,
                color: "var(--color-text-secondary)",
              }}
            >
              Your data leaves your device.
              <br />
              It passes through servers you don&apos;t control,
              <br />
              anonymised and sold upstream.
              <br />
              Your doctor gets 7 minutes.
              <br />
              You get a bill.
            </p>
          </div>

          {/* Card 2 — Amach future */}
          <div
            className="amach-card"
            style={{
              padding: "40px 36px",
              borderColor: "var(--color-border-strong)",
            }}
          >
            <p
              style={{
                fontSize: "0.7rem",
                fontWeight: 600,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "var(--color-emerald)",
                marginBottom: 24,
              }}
            >
              With Amach
            </p>
            <p
              style={{
                fontSize: "1.15rem",
                lineHeight: 1.8,
                color: "var(--color-text-primary)",
              }}
            >
              Your data stays encrypted.
              <br />
              It lives on-chain. Verifiable, yours.
              <br />
              Luma reads a year of your biology
              <br />
              and tells you what it actually means.
              <br />
              You walk into that appointment prepared.
            </p>
          </div>
        </div>
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
            How it works
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: 48,
            }}
          >
            {/* Own it */}
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ color: "var(--color-emerald)" }}>
                <IconLock />
              </div>
              <h3
                style={{
                  fontSize: "1.2rem",
                  fontWeight: 700,
                  color: "var(--color-text-primary)",
                  margin: 0,
                }}
              >
                Own it
              </h3>
              <p
                style={{
                  fontSize: "0.95rem",
                  lineHeight: 1.7,
                  color: "var(--color-text-secondary)",
                  margin: 0,
                }}
              >
                Your data is encrypted before it leaves your device. Stored on
                Storj. Verified on-chain. Not a policy. The architecture.
              </p>
            </div>

            {/* Read it */}
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ color: "var(--color-indigo)" }}>
                <IconSparkle />
              </div>
              <h3
                style={{
                  fontSize: "1.2rem",
                  fontWeight: 700,
                  color: "var(--color-text-primary)",
                  margin: 0,
                }}
              >
                Read it
              </h3>
              <p
                style={{
                  fontSize: "0.95rem",
                  lineHeight: 1.7,
                  color: "var(--color-text-secondary)",
                  margin: 0,
                }}
              >
                Luma reads your HRV, glucose, sleep, and bloodwork as a system —
                not a dashboard. Patterns, not prescriptions.
              </p>
            </div>

            {/* Keep the value */}
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ color: "var(--color-amber)" }}>
                <IconArrow />
              </div>
              <h3
                style={{
                  fontSize: "1.2rem",
                  fontWeight: 700,
                  color: "var(--color-text-primary)",
                  margin: 0,
                }}
              >
                Keep the value
              </h3>
              <p
                style={{
                  fontSize: "0.95rem",
                  lineHeight: 1.7,
                  color: "var(--color-text-secondary)",
                  margin: 0,
                }}
              >
                The value your data creates flows back to you. Verified
                on-chain. Not a promise. A protocol.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          LUMA INTRODUCTION
      ══════════════════════════════════════════ */}
      <section
        className="shimmer-texture"
        style={{
          padding: "80px 24px",
          background: "var(--color-bg-primary)",
        }}
      >
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <div
            className="luma-card"
            style={{ padding: "56px 48px", textAlign: "center" }}
          >
            {/* Luma mark */}
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: "50%",
                background: "rgba(99, 102, 241, 0.12)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 28px",
                fontSize: "28px",
                color: "var(--color-indigo)",
              }}
            >
              ✦
            </div>

            <h2
              style={{
                fontSize: "clamp(1.75rem, 4vw, 2.5rem)",
                fontWeight: 800,
                color: "var(--color-text-primary)",
                marginBottom: 20,
                letterSpacing: "-0.02em",
              }}
            >
              This is Luma.
            </h2>
            <p
              style={{
                fontSize: "1.1rem",
                lineHeight: 1.75,
                color: "var(--color-text-secondary)",
                maxWidth: 520,
                margin: "0 auto 32px",
              }}
            >
              She reads your health data and tells you what it means: your
              trends, your patterns, your specific numbers. Not general health
              advice. Your health, read clearly.
            </p>
            <button
              className="btn-emerald"
              onClick={() => setIsAiCompanionOpen(true)}
            >
              Talk to Luma
            </button>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          YOUR DATA, YOUR TERMS
      ══════════════════════════════════════════ */}
      <section
        style={{
          padding: "96px 24px",
          background: "var(--color-bg-surface)",
          borderTop: "1px solid var(--color-border)",
          borderBottom: "1px solid var(--color-border)",
        }}
      >
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          {/* Header */}
          <div style={{ maxWidth: 620, marginBottom: 64 }}>
            <p
              style={{
                fontSize: "0.7rem",
                fontWeight: 600,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "var(--color-text-muted)",
                marginBottom: 16,
              }}
            >
              Your data, your terms
            </p>
            <h2
              style={{
                fontSize: "clamp(1.6rem, 3.5vw, 2.25rem)",
                fontWeight: 800,
                lineHeight: 1.2,
                color: "var(--color-text-primary)",
                letterSpacing: "-0.02em",
                marginBottom: 20,
              }}
            >
              Every health signal you generate, brought together and kept yours.
            </h2>
            <p
              style={{
                fontSize: "1rem",
                lineHeight: 1.75,
                color: "var(--color-text-secondary)",
              }}
            >
              Most platforms take your data and keep it. Amach inverts that —
              your data is encrypted before it leaves your device, stored on
              infrastructure you control, and readable only by you and the AI
              you choose to trust. No siloed records. No third-party access.
              Just a complete picture of your biology, finally in one place.
            </p>
          </div>

          {/* Source cards grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: 20,
              marginBottom: 56,
            }}
          >
            {/* Apple Health / Wearables */}
            <div
              className="amach-card-surface"
              style={{
                padding: "28px 24px",
                display: "flex",
                flexDirection: "column",
                gap: 14,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <span style={{ fontSize: "22px" }}>⌚</span>
                <span
                  className="status-pill"
                  style={{
                    background: "rgba(0,107,79,0.10)",
                    color: "var(--color-emerald)",
                  }}
                >
                  <span
                    style={{
                      width: 5,
                      height: 5,
                      borderRadius: "50%",
                      background: "var(--color-emerald)",
                      flexShrink: 0,
                    }}
                  />
                  Live sync
                </span>
              </div>
              <h3
                style={{
                  fontSize: "1rem",
                  fontWeight: 700,
                  color: "var(--color-text-primary)",
                  margin: 0,
                }}
              >
                Wearables &amp; Apple Health
              </h3>
              <p
                style={{
                  fontSize: "0.875rem",
                  lineHeight: 1.65,
                  color: "var(--color-text-secondary)",
                  margin: 0,
                }}
              >
                Steps, VO₂ max, resting heart rate, HRV, active energy, sleep
                stages, and respiratory rate. Streamed continuously and stored
                encrypted. Luma reads months of this data at once to surface
                trends your watch never shows you.
              </p>
            </div>

            {/* Bloodwork */}
            <div
              className="amach-card-surface"
              style={{
                padding: "28px 24px",
                display: "flex",
                flexDirection: "column",
                gap: 14,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <span style={{ fontSize: "22px" }}>🩸</span>
                <span
                  className="status-pill"
                  style={{
                    background: "var(--color-amber-muted)",
                    color: "var(--color-amber)",
                  }}
                >
                  Upload PDF
                </span>
              </div>
              <h3
                style={{
                  fontSize: "1rem",
                  fontWeight: 700,
                  color: "var(--color-text-primary)",
                  margin: 0,
                }}
              >
                Bloodwork &amp; Labs
              </h3>
              <p
                style={{
                  fontSize: "0.875rem",
                  lineHeight: 1.65,
                  color: "var(--color-text-secondary)",
                  margin: 0,
                }}
              >
                Upload your lab reports directly. Amach parses CBC, metabolic
                panel, lipids, thyroid, hormones, and inflammation markers. Luma
                cross-references your results with your wearable data to find
                the connections your GP doesn&apos;t have time to draw.
              </p>
            </div>

            {/* DEXA */}
            <div
              className="amach-card-surface"
              style={{
                padding: "28px 24px",
                display: "flex",
                flexDirection: "column",
                gap: 14,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <span style={{ fontSize: "22px" }}>🦴</span>
                <span
                  className="status-pill"
                  style={{
                    background: "var(--color-amber-muted)",
                    color: "var(--color-amber)",
                  }}
                >
                  Upload PDF
                </span>
              </div>
              <h3
                style={{
                  fontSize: "1rem",
                  fontWeight: 700,
                  color: "var(--color-text-primary)",
                  margin: 0,
                }}
              >
                DEXA Scan
              </h3>
              <p
                style={{
                  fontSize: "0.875rem",
                  lineHeight: 1.65,
                  color: "var(--color-text-secondary)",
                  margin: 0,
                }}
              >
                Body composition at the segment level: lean mass, fat mass, and
                bone density by region. Luma tracks your scans over time and
                contextualises changes against your training load, diet signals,
                and bloodwork for a complete recomposition picture.
              </p>
            </div>

            {/* CGM */}
            <div
              className="amach-card-surface"
              style={{
                padding: "28px 24px",
                display: "flex",
                flexDirection: "column",
                gap: 14,
                opacity: 0.7,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <span style={{ fontSize: "22px" }}>📈</span>
                <span
                  className="status-pill"
                  style={{
                    background: "rgba(100,100,100,0.07)",
                    color: "var(--color-text-muted)",
                  }}
                >
                  Coming soon
                </span>
              </div>
              <h3
                style={{
                  fontSize: "1rem",
                  fontWeight: 700,
                  color: "var(--color-text-primary)",
                  margin: 0,
                }}
              >
                Continuous Glucose
              </h3>
              <p
                style={{
                  fontSize: "0.875rem",
                  lineHeight: 1.65,
                  color: "var(--color-text-secondary)",
                  margin: 0,
                }}
              >
                CGM integration (Dexcom, Libre) to bring real-time glucose
                variability into the picture. Luma will correlate your glucose
                curves with sleep quality, exercise timing, and meal patterns to
                give you personalised metabolic feedback.
              </p>
            </div>
          </div>

          {/* Bottom bar: encryption assurance */}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 32,
              paddingTop: 40,
              borderTop: "1px solid var(--color-border)",
            }}
          >
            {[
              {
                icon: "🔐",
                label: "AES-256 encrypted",
                detail: "Before it leaves your device",
              },
              {
                icon: "⛓",
                label: "On-chain verification",
                detail: "ZKsync Era, tamper-evident",
              },
              {
                icon: "🗄️",
                label: "Decentralised storage",
                detail: "Storj, no single point of control",
              },
              {
                icon: "🔑",
                label: "Your keys only",
                detail: "Wallet-derived, no Amach access",
              },
            ].map((item) => (
              <div
                key={item.label}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 12,
                  flex: "1 1 180px",
                }}
              >
                <span style={{ fontSize: "18px", marginTop: 1 }}>
                  {item.icon}
                </span>
                <div>
                  <p
                    style={{
                      fontSize: "0.875rem",
                      fontWeight: 600,
                      color: "var(--color-text-primary)",
                      margin: "0 0 2px",
                    }}
                  >
                    {item.label}
                  </p>
                  <p
                    style={{
                      fontSize: "0.8rem",
                      color: "var(--color-text-muted)",
                      margin: 0,
                    }}
                  >
                    {item.detail}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          FOOTER CTA
      ══════════════════════════════════════════ */}
      <section
        className="shimmer-texture"
        style={{
          padding: "100px 24px",
          background: "var(--color-bg-primary)",
          textAlign: "center",
        }}
      >
        <div
          style={{
            maxWidth: 560,
            margin: "0 auto",
            position: "relative",
            zIndex: 1,
          }}
        >
          <h2
            style={{
              fontSize: "clamp(1.75rem, 4vw, 2.75rem)",
              fontWeight: 800,
              lineHeight: 1.25,
              color: "var(--color-text-primary)",
              marginBottom: 40,
              letterSpacing: "-0.02em",
            }}
          >
            Own your data.
            <br />
            Keep the value.
            <br />
            Read the signals.
          </h2>

          <button
            className="btn-emerald"
            style={{
              fontSize: "1.05rem",
              padding: "16px 40px",
              marginBottom: 20,
            }}
            onClick={() =>
              (window.location.href =
                "mailto:amachhealth@gmail.com?subject=Early Protocol Access")
            }
          >
            Request Early Access
          </button>

          <p
            style={{
              fontSize: "0.8rem",
              color: "var(--color-text-muted)",
              marginTop: 16,
            }}
          >
            Private beta. Built in public.
          </p>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer
        style={{
          borderTop: "1px solid var(--color-border)",
          padding: "24px",
          textAlign: "center",
          background: "var(--color-bg-surface)",
        }}
      >
        <p
          style={{
            fontSize: "0.8rem",
            color: "var(--color-text-muted)",
            margin: 0,
          }}
        >
          © 2025 Amach Health · Own your data. Keep the value. Read the signals.
        </p>
      </footer>
    </div>
  );
};

export default MainPage;
