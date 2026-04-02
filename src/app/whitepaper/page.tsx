"use client";

import { ThemeToggle } from "@/components/ThemeToggle";
import Link from "next/link";
import { useEffect } from "react";

// Page-specific styles — CSS variables and shimmer are already in globals.css
const pageStyles = `
  /* ── Nav ── */
  .wp-nav {
    position: sticky;
    top: 0;
    z-index: 50;
    background: var(--color-bg-nav, rgba(255,251,235,0.92));
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border-bottom: 1px solid var(--color-border);
    padding: 0 32px;
    height: 60px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .wp-nav-left {
    display: flex;
    align-items: center;
    gap: 20px;
  }

  .wp-nav-brand { text-decoration: none; }

  .wp-wordmark-size {
    font-size: 11px;
    letter-spacing: 0.14em;
  }

  .wp-nav-sep {
    width: 1px;
    height: 28px;
    background: var(--color-border);
  }

  .wp-nav-section-label {
    font-size: 12px;
    font-weight: 500;
    color: var(--color-text-muted);
    letter-spacing: 0.05em;
  }

  .wp-nav-right { display: flex; align-items: center; gap: 12px; }

  /* ── Page shell ── */
  .wp-page-wrap {
    max-width: 1160px;
    margin: 0 auto;
    padding: 0 32px;
    display: grid;
    grid-template-columns: 188px 1fr;
    gap: 72px;
    align-items: start;
  }

  @media (max-width: 820px) {
    .wp-page-wrap { grid-template-columns: 1fr; gap: 0; padding: 0 20px; }
    .wp-toc { display: none; }
    .wp-nav { padding: 0 20px; }
  }

  /* ── TOC sidebar ── */
  .wp-toc {
    position: sticky;
    top: 80px;
    padding-top: 56px;
  }

  .wp-toc-heading {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--color-text-muted);
    margin-bottom: 14px;
  }

  .wp-toc ul { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 2px; }

  .wp-toc a {
    font-size: 13px;
    font-weight: 400;
    color: var(--color-text-muted);
    text-decoration: none;
    display: block;
    padding: 5px 0 5px 12px;
    border-left: 2px solid transparent;
    transition: color 0.15s, border-color 0.15s;
    line-height: 1.35;
  }

  .wp-toc a:hover,
  .wp-toc a.active {
    color: var(--color-text-accent);
    border-left-color: var(--color-emerald, #006b4f);
    font-weight: 500;
  }

  /* ── Main content ── */
  .wp-content {
    max-width: 672px;
    padding: 56px 0 120px;
  }

  /* ── Hero ── */
  .wp-eyebrow {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--color-text-accent);
    margin-bottom: 18px;
  }

  .wp-hero-title {
    font-size: clamp(36px, 5.5vw, 58px);
    font-weight: 700;
    line-height: 1.06;
    letter-spacing: -1.5px;
    color: var(--color-text-accent);
    margin-bottom: 44px;
  }

  /* ── Abstract card ── */
  .wp-abstract-card {
    background: var(--color-bg-card, rgba(255,255,255,0.85));
    border: 1px solid var(--color-border);
    border-radius: 16px;
    padding: 28px 32px;
    margin-bottom: 60px;
    position: relative;
    overflow: hidden;
  }

  .wp-abstract-card::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 2.5px;
    background: linear-gradient(90deg, var(--color-emerald, #006b4f), var(--color-amber, #f59e0b));
  }

  .wp-abstract-label {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--color-text-muted);
    margin-bottom: 16px;
  }

  .wp-abstract-card p {
    font-size: 15.5px;
    line-height: 1.75;
    color: var(--color-text-secondary);
    margin-bottom: 12px;
  }

  .wp-abstract-card p:last-child { margin-bottom: 0; }

  /* ── Sections ── */
  .wp-section {
    margin-bottom: 68px;
    scroll-margin-top: 80px;
  }

  .wp-section-num {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--color-text-accent);
    margin-bottom: 8px;
  }

  .wp-section-title {
    font-size: clamp(24px, 3.5vw, 34px);
    font-weight: 700;
    letter-spacing: -0.6px;
    line-height: 1.12;
    color: var(--color-text-accent);
    margin-bottom: 24px;
  }

  .wp-section p {
    font-size: 16px;
    line-height: 1.8;
    color: var(--color-text-secondary);
    margin-bottom: 18px;
    font-weight: 400;
  }

  .wp-section p:last-child { margin-bottom: 0; }

  /* ── Subsections ── */
  .wp-subsection { margin-bottom: 32px; }

  .wp-subsection-title {
    font-size: 15px;
    font-weight: 700;
    color: var(--color-text-primary);
    margin-bottom: 10px;
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .wp-subsection-title::before {
    content: '';
    display: block;
    width: 20px;
    height: 2px;
    background: var(--color-emerald, #006b4f);
    flex-shrink: 0;
  }

  /* ── Pull quotes ── */
  .wp-pull-quote {
    border-left: 3px solid var(--color-emerald, #006b4f);
    padding: 10px 0 10px 24px;
    margin: 28px 0;
  }

  .wp-pull-quote p {
    font-size: 19px !important;
    font-weight: 500 !important;
    font-style: italic;
    color: var(--color-text-primary) !important;
    line-height: 1.5 !important;
    margin-bottom: 0 !important;
    letter-spacing: -0.2px;
  }

  /* ── Divider ── */
  .wp-divider {
    height: 1px;
    background: var(--color-border);
    margin: 60px 0;
  }

  /* ── Architecture layers ── */
  .wp-arch-layers {
    margin: 20px 0;
    border-radius: 14px;
    overflow: hidden;
    border: 1px solid var(--color-border);
  }

  .wp-arch-layer {
    background: var(--color-bg-card, rgba(255,255,255,0.85));
    padding: 16px 20px;
    border-bottom: 1px solid var(--color-border);
    display: flex;
    align-items: flex-start;
    gap: 14px;
  }

  .wp-arch-layer:last-child { border-bottom: none; }

  .wp-arch-num {
    font-size: 11px;
    font-weight: 700;
    color: var(--color-text-accent);
    background: rgba(0, 107, 79, 0.12);
    width: 22px;
    height: 22px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    margin-top: 2px;
  }

  .wp-arch-name {
    font-size: 14px;
    font-weight: 600;
    color: var(--color-text-primary);
    margin-bottom: 4px;
  }

  .wp-arch-desc {
    font-size: 13.5px;
    color: var(--color-text-secondary);
    line-height: 1.6;
  }

  /* ── Roadmap ── */
  .wp-roadmap { display: flex; flex-direction: column; gap: 14px; margin-top: 6px; }

  .wp-rm-card {
    background: var(--color-bg-card, rgba(255,255,255,0.85));
    border: 1px solid var(--color-border);
    border-radius: 14px;
    padding: 20px 24px;
    position: relative;
  }

  .wp-rm-card.live { border-color: var(--color-border-strong); }

  .wp-rm-card.live::after {
    content: 'Live';
    position: absolute;
    top: 18px; right: 18px;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--color-text-accent);
    background: rgba(0, 107, 79, 0.12);
    padding: 3px 10px;
    border-radius: 20px;
  }

  .wp-rm-phase {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--color-text-accent);
    margin-bottom: 5px;
  }

  .wp-rm-title {
    font-size: 16px;
    font-weight: 700;
    color: var(--color-text-primary);
    margin-bottom: 8px;
  }

  .wp-rm-body {
    font-size: 14px;
    line-height: 1.7;
    color: var(--color-text-secondary);
  }

  /* ── Conclusion closer ── */
  .wp-conclusion-closer {
    margin-top: 40px;
    padding: 32px 36px;
    background: var(--color-bg-card, rgba(255,255,255,0.85));
    border: 1px solid var(--color-border-strong);
    border-radius: 16px;
    text-align: center;
  }

  .wp-conclusion-closer p {
    font-size: 16px;
    font-weight: 600;
    color: var(--color-text-primary);
    line-height: 1.6;
    margin-bottom: 0;
  }

  .wp-tagline {
    display: block;
    font-size: 13px;
    color: var(--color-text-muted);
    font-weight: 400;
    margin-top: 14px;
    letter-spacing: 0.03em;
  }

  /* ── Footer ── */
  .wp-footer {
    border-top: 1px solid var(--color-border);
    padding: 28px 32px;
    text-align: center;
  }

  .wp-footer p {
    font-size: 13px;
    color: var(--color-text-muted);
  }

  .wp-footer a { color: var(--color-text-accent); text-decoration: none; }
`;

export default function WhitepaperPage(): JSX.Element {
  // Active TOC highlighting via IntersectionObserver
  useEffect(() => {
    const allSections = document.querySelectorAll(
      ".wp-section, .wp-abstract-card",
    );
    const allLinks = document.querySelectorAll(".wp-toc a");

    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            allLinks.forEach((a) => a.classList.remove("active"));
            const match = document.querySelector(
              `.wp-toc a[href="#${e.target.id}"]`,
            );
            if (match) match.classList.add("active");
          }
        });
      },
      { rootMargin: "-15% 0px -75% 0px" },
    );

    allSections.forEach((s) => obs.observe(s));
    return () => obs.disconnect();
  }, []);

  return (
    <>
      {/* Page-scoped styles */}
      <style dangerouslySetInnerHTML={{ __html: pageStyles }} />

      {/* Nav */}
      <nav className="wp-nav">
        <div className="wp-nav-left">
          <Link className="wp-nav-brand" href="/">
            <div
              className="amach-wordmark-wrap wp-wordmark-size"
              style={{ fontSize: "11px", letterSpacing: "0.14em" }}
            >
              <span className="amach-wordmark-line">Amach</span>
              <span className="amach-wordmark-line-sub">Health</span>
            </div>
          </Link>
          <div className="wp-nav-sep" />
          <span className="wp-nav-section-label">Whitepaper</span>
        </div>
        <div className="wp-nav-right">
          <ThemeToggle />
        </div>
      </nav>

      {/* Page layout */}
      <div className="wp-page-wrap">
        {/* TOC sidebar */}
        <aside className="wp-toc">
          <div className="wp-toc-heading">Contents</div>
          <ul>
            <li>
              <a href="#abstract">Abstract</a>
            </li>
            <li>
              <a href="#introduction">1 — Introduction</a>
            </li>
            <li>
              <a href="#vision">2 — Vision</a>
            </li>
            <li>
              <a href="#architecture">3 — Architecture</a>
            </li>
            <li>
              <a href="#privacy">4 — Privacy & Security</a>
            </li>
            <li>
              <a href="#platform">5 — Platform</a>
            </li>
            <li>
              <a href="#tokenomics">6 — Tokenomics</a>
            </li>
            <li>
              <a href="#roadmap">7 — Roadmap</a>
            </li>
            <li>
              <a href="#conclusion">8 — Conclusion</a>
            </li>
          </ul>
        </aside>

        {/* Main content */}
        <main className="wp-content">
          <div className="wp-eyebrow">Amach Health Protocol</div>
          <h1 className="wp-hero-title">
            Own your data.
            <br />
            Keep the value.
            <br />
            Read the signals.
          </h1>

          {/* Abstract */}
          <div className="wp-abstract-card" id="abstract">
            <div className="wp-abstract-label">Abstract</div>
            <p>
              Amach is a Gaelic word. It means outsider. It means out, or forth.
              In Irish it carries the sense of moving beyond the boundary of
              something, leaving the enclosure behind.
            </p>
            <p>It is the right name for what we are building.</p>
            <p>
              Amach Health is a decentralized health data protocol built on the
              premise that the people who generate health data should own it,
              control it, and benefit from the value it creates. The platform
              combines encrypted decentralized storage, on-chain zero-knowledge
              proof verification, and privacy-native AI inference to give users
              genuine architectural sovereignty over their health records. Not
              as a policy promise. As a technical fact.
            </p>
            <p>
              As that data accumulates, it becomes richer as a health asset and
              harder as a verified identity. Amach is building the
              infrastructure that lets that value flow in the right direction.
            </p>
          </div>

          {/* 1. Introduction */}
          <section className="wp-section" id="introduction">
            <div className="wp-section-num">01</div>
            <h2 className="wp-section-title">Introduction</h2>
            <p>
              The history of medicine is the history of what could be measured.
            </p>
            <p>
              For most of that history, the constraint was data scarcity.
              Treatment was broad because the view of individual biology was
              narrow. As measurement improved — as blood panels and imaging and
              continuous glucose monitoring and wearable biometrics became
              available — the picture sharpened. Medicine moved from population
              averages toward something closer to the individual.
            </p>
            <p>
              That movement is accelerating. The combination of continuous
              wearable data, advanced diagnostics, and AI capable of reasoning
              over longitudinal records is creating a new category of health
              intelligence. The gap between what a person can know about their
              own biology and what was previously accessible only in clinical
              settings is narrowing faster than most people realize.
            </p>
            <div className="wp-pull-quote">
              <p>
                But the value created by that data has not followed the person
                who generated it.
              </p>
            </div>
            <p>
              Health data today flows outward into hospital systems, insurance
              databases, platform silos, and research institutions. It is
              aggregated, analyzed, and monetized by whoever holds it. The
              individuals whose bodies produced every data point participate as
              sources, not beneficiaries. The infrastructure was built that way
              not because it was the right architecture, but because the tools
              to build it differently did not exist.
            </p>
            <p>They exist now.</p>
          </section>

          <div className="wp-divider" />

          {/* 2. Vision */}
          <section className="wp-section" id="vision">
            <div className="wp-section-num">02</div>
            <h2 className="wp-section-title">Vision</h2>
            <p>
              Amach is built on a single architectural conviction: that health
              data sovereignty is not a feature. It is a foundation.
            </p>
            <p>
              When a person&apos;s health records live in encrypted storage they
              control, attested on-chain through cryptographic proofs they hold,
              processed through AI inference that logs nothing, the relationship
              between data producer and data value changes structurally. Not by
              policy. By architecture.
            </p>
            <p>
              The practical implications extend in every direction. A user with
              a verified, longitudinal health record can prove specific things
              about their health to a clinical trial without submitting their
              records. They can contribute verified data attributes to research
              without those attributes ever leaving their vault. They can arrive
              at any health conversation — with a provider, an insurer, or a
              research institution — with years of evidence rather than a
              symptom description.
            </p>
            <p>
              As that record accumulates, something else happens. The depth and
              coherence of years of continuous biometric data across multiple
              sources becomes a hardened representation of identity. Not
              identity asserted through documents, but identity earned through
              existence. One that is cryptographically verifiable and
              practically impossible to fabricate.
            </p>
            <div className="wp-pull-quote">
              <p>
                The rebellion is not in the language. It is in the architecture.
                It always has been.
              </p>
            </div>
            <p>
              The name Amach is not incidental. The entire model is built
              outside the enclosure: outside the assumption that health data
              must flow to institutions to create value, outside the
              infrastructure that was built for extraction, outside the paradigm
              that treats data producers as source material.
            </p>
          </section>

          <div className="wp-divider" />

          {/* 3. Architecture */}
          <section className="wp-section" id="architecture">
            <div className="wp-section-num">03</div>
            <h2 className="wp-section-title">Technical Architecture</h2>
            <p>
              Amach&apos;s technical infrastructure is organized across three
              layers, each designed to ensure that data sovereignty is
              architecturally enforced rather than contractually promised.
            </p>

            <div className="wp-arch-layers">
              <div className="wp-arch-layer">
                <div className="wp-arch-num">1</div>
                <div>
                  <div className="wp-arch-name">Data Collection Layer</div>
                  <div className="wp-arch-desc">
                    Apple HealthKit integration across 15 metrics with daily and
                    longitudinal trend views. Bloodwork panels, DEXA scans, and
                    health records uploaded directly to the user&apos;s
                    encrypted vault. All data encrypted client-side before
                    transmission — it never touches Amach infrastructure in
                    readable form.
                  </div>
                </div>
              </div>
              <div className="wp-arch-layer">
                <div className="wp-arch-num">2</div>
                <div>
                  <div className="wp-arch-name">
                    Privacy &amp; Security Layer
                  </div>
                  <div className="wp-arch-desc">
                    Storj decentralized storage — each user&apos;s data in a
                    cryptographically isolated bucket, secured by wallet-derived
                    credentials. On-chain verification through ZKsync Era.
                    Zero-knowledge proofs attest to data validity without
                    exposing contents. Users selectively prove specific health
                    attributes to any third party without the underlying records
                    moving.
                  </div>
                </div>
              </div>
              <div className="wp-arch-layer">
                <div className="wp-arch-num">3</div>
                <div>
                  <div className="wp-arch-name">AI Inference Layer</div>
                  <div className="wp-arch-desc">
                    Venice AI — a privacy-native inference platform where
                    prompts and responses are not stored. Luma, Amach&apos;s
                    health intelligence companion, reads across all metrics and
                    timeframes simultaneously, surfacing patterns specific to
                    the user&apos;s longitudinal record rather than population
                    averages.
                  </div>
                </div>
              </div>
            </div>

            <div className="wp-subsection" style={{ marginTop: "28px" }}>
              <h3 className="wp-subsection-title">The Wallet</h3>
              <p>
                The wallet is the single point of control across the entire
                ecosystem. Created once, it functions as verification,
                encryption key, and identity layer simultaneously. It initiates
                data flow to and from Storj, enables Luma&apos;s visibility into
                the user&apos;s health record, and carries seamlessly between
                the web platform and the iOS app. One key. Entire ecosystem.
              </p>
            </div>
          </section>

          <div className="wp-divider" />

          {/* 4. Privacy */}
          <section className="wp-section" id="privacy">
            <div className="wp-section-num">04</div>
            <h2 className="wp-section-title">Data Privacy and Security</h2>
            <p>Privacy in Amach is not a setting. It is the architecture.</p>
            <p>
              Every piece of health data a user generates or uploads is
              encrypted before it leaves their device. It is stored in a Storj
              bucket cryptographically isolated from every other user&apos;s
              bucket: no shared infrastructure, no shared access, no master
              override. The encryption credentials derive from the user&apos;s
              wallet. Without wallet access, the data is inert.
            </p>
            <p>
              Zero-knowledge proofs extend this architecture into the
              verification layer. The current system allows users to prove
              specific attributes within their health data to third parties with
              mathematical certainty and without any underlying data leaving the
              vault. A confirmed biomarker, a health metric within a defined
              range, eligibility criteria for a research program — verified
              on-chain, without the record moving.
            </p>
            <div className="wp-pull-quote">
              <p>
                Possession and verification are separated. The data stays. The
                proof travels.
              </p>
            </div>
            <p>
              The next stage of ZK development focuses on integration and
              compute. As Amach builds connections with clinical trial
              platforms, research institutions, and precision medicine
              providers, the verification layer becomes the bridge that allows
              those relationships to form without data ever changing hands.
              Alongside this, anonymous compute pools built on MCP architecture
              will allow meaningful analysis across a population of verified
              users without any individual&apos;s data being exposed or
              aggregated centrally. The insight is collective. The data remains
              individual.
            </p>
            <p>
              When a user&apos;s data never leaves their control, no commercial
              relationship can lock or constrain that data for anyone else. The
              same record can generate value across multiple simultaneous
              relationships without any one of them diminishing its availability
              to the others. The asset does not deplete when used. It compounds.
            </p>
            <p>
              Venice AI&apos;s inference architecture reinforces this at the AI
              layer. Prompts are not logged. Responses are not stored. The AI
              reads. It does not retain.
            </p>
          </section>

          <div className="wp-divider" />

          {/* 5. Platform */}
          <section className="wp-section" id="platform">
            <div className="wp-section-num">05</div>
            <h2 className="wp-section-title">Platform Components</h2>

            <div className="wp-subsection">
              <h3 className="wp-subsection-title">iOS Application</h3>
              <p>
                The Amach iOS app is the primary daily experience layer. It
                connects to Apple HealthKit, displays 15 health metrics across
                daily and trend views, houses the Luma chat interface, and
                provides access to the user&apos;s encrypted health records.
                Available via TestFlight to an early invited group. Every
                interaction reflects a single, consistent vision of what the
                platform is and what it is for.
              </p>
            </div>

            <div className="wp-subsection">
              <h3 className="wp-subsection-title">Web Platform</h3>
              <p>
                The web platform is the protocol layer. It houses the blockchain
                infrastructure, wallet creation, data management, and the full
                record upload and management capability for bloodwork, DEXA
                scans, and other health documents. The two environments share
                one wallet, one brand, and one visual language. Moving between
                them is a continuous experience.
              </p>
            </div>

            <div className="wp-subsection">
              <h3 className="wp-subsection-title">Luma</h3>
              <p>
                Luma is Amach&apos;s health intelligence companion. She reads
                across all metrics, all timeframes, and all uploaded records
                simultaneously, drawing connections across data that no single
                metric or single point in time could reveal. Her responses are
                specific to the user&apos;s own longitudinal record, humble in
                tone, and grounded in correlation rather than diagnosis. She
                does not replace a clinician. Where the data suggests one is
                needed, she says so directly.
              </p>
            </div>

            <div className="wp-subsection">
              <h3 className="wp-subsection-title">Timeline</h3>
              <p>
                A timeline feature allows users to log health events alongside
                their metric data, creating a visual layer that maps life
                against the numbers over time. Integration with Luma&apos;s
                analysis is in active development.
              </p>
            </div>
          </section>

          <div className="wp-divider" />

          {/* 6. Tokenomics */}
          <section className="wp-section" id="tokenomics">
            <div className="wp-section-num">06</div>
            <h2 className="wp-section-title">Tokenomics</h2>

            <div className="wp-subsection">
              <h3 className="wp-subsection-title">The Data Raise</h3>
              <p>
                Amach&apos;s token model inverts the conventional approach.
                Rather than raising capital from investors and distributing
                tokens to speculators, Amach raises data — distributing tokens
                exclusively to the people who contribute verified health data to
                the protocol. There is no investor allocation. The asset being
                built is a health data protocol. The people who build it are the
                people whose data makes it valuable.
              </p>
            </div>

            <div className="wp-subsection">
              <h3 className="wp-subsection-title">
                Contributor-First Distribution
              </h3>
              <p>
                Tokens are distributed to data contributors as the protocol
                grows. The model is designed so that value accrues to users in
                direct proportion to their contribution to the protocol&apos;s
                core asset. The guiding principle: those who generate the data
                should benefit most from the value it creates.
              </p>
            </div>

            <div className="wp-subsection">
              <h3 className="wp-subsection-title">
                Identity and Contribution Depth
              </h3>
              <p>
                As a user&apos;s data accumulates across sources and time, two
                things happen simultaneously. The health record becomes richer
                and more analytically valuable. The identity it represents
                becomes harder: more internally coherent, more biologically
                continuous, more resistant to fabrication or duplication.
              </p>
              <p>
                A ten-year longitudinal record across wearable data, bloodwork,
                and diagnostic imaging cannot be manufactured. Sybil resistance
                is not a feature added on top of the system. It is a property of
                the asset itself.
              </p>
            </div>

            <div className="wp-subsection">
              <h3 className="wp-subsection-title">Value Return</h3>
              <p>
                As the protocol generates value through verified data access and
                research integrations, the intent is for that value to flow
                primarily back to the contributors who made it possible. The
                token is not a speculative instrument. It is a claim on the
                value the protocol creates, held by the people whose data
                creates it.
              </p>
            </div>
          </section>

          <div className="wp-divider" />

          {/* 7. Roadmap */}
          <section className="wp-section" id="roadmap">
            <div className="wp-section-num">07</div>
            <h2 className="wp-section-title">Roadmap</h2>

            <div className="wp-roadmap">
              <div className="wp-rm-card live">
                <div className="wp-rm-phase">Now</div>
                <div className="wp-rm-title">Foundation</div>
                <div className="wp-rm-body">
                  Apple HealthKit integration with 15 metrics. Encrypted Storj
                  storage with wallet-derived isolation. On-chain ZK proof
                  attestation of data validity and single metric verification.
                  Venice AI inference through Luma. Web and iOS platforms in
                  full visual and functional cohesion. TestFlight beta open to
                  an early invited group.
                </div>
              </div>

              <div className="wp-rm-card">
                <div className="wp-rm-phase">Near Term</div>
                <div className="wp-rm-title">
                  ZK Proof Expansion and Integrations
                </div>
                <div className="wp-rm-body">
                  Integrations with clinical trial platforms, research
                  institutions, and precision medicine providers — with ZK
                  verification as the access layer. No raw data changes hands.
                  Verified attributes are what travel. Anonymous compute pools
                  built on MCP architecture enable population-level insight
                  without individual data ever centralizing.
                </div>
              </div>

              <div className="wp-rm-card">
                <div className="wp-rm-phase">Following</div>
                <div className="wp-rm-title">
                  Data Raise and Token Distribution
                </div>
                <div className="wp-rm-body">
                  Token distribution to verified data contributors as the
                  protocol reaches maturity. The people who built the asset are
                  the first to hold a claim on its value.
                </div>
              </div>

              <div className="wp-rm-card">
                <div className="wp-rm-phase">Beyond</div>
                <div className="wp-rm-title">Protocol Expansion</div>
                <div className="wp-rm-body">
                  Additional wearable integrations. Expanded diagnostic data
                  support. A physician-facing sharing portal that preserves user
                  ownership. The protocol grows as the verification layer and
                  its integration network mature.
                </div>
              </div>
            </div>
          </section>

          <div className="wp-divider" />

          {/* 8. Conclusion */}
          <section className="wp-section" id="conclusion">
            <div className="wp-section-num">08</div>
            <h2 className="wp-section-title">Conclusion</h2>
            <p>
              The value of longitudinal health data has been confirmed. The
              market has spoken clearly and at scale. Continuous biometric
              records accumulated over time, from people who are actively
              engaged with their own health, are worth billions. That is not a
              thesis anymore. It is a demonstrated fact.
            </p>
            <p>
              What has not yet been demonstrated is what that value looks like
              when it flows in the right direction.
            </p>
            <p>
              The infrastructure that confirmed the value of this data was built
              on a familiar model: data flows in, value pools at the top, and
              the people who generated every data point participate as sources
              rather than beneficiaries. It worked. But it answered only half
              the question. It proved the asset is real. It did not prove the
              asset has to be held that way.
            </p>
            <div className="wp-pull-quote">
              <p>Decentralized architecture answers the other half.</p>
            </div>
            <p>
              When the data producer holds the asset, no single commercial
              relationship can constrain it. The same verified record can
              contribute to clinical research, qualify for precision medicine
              protocols, and strengthen a longitudinal identity simultaneously —
              without any one use depleting its availability to the others.
              Every new use case adds value without subtracting from any other.
              The asset compounds rather than depletes.
            </p>
            <p>
              The value of verified human health data is real and growing. The
              question now is architecture. Who holds it. Who benefits. Who
              decides.
            </p>
            <p>
              Amach is the infrastructure built to answer that question
              differently.
            </p>

            <div className="wp-conclusion-closer">
              <p>
                Outside the enclosure. That is what the name means.
                <br />
                That is what the build is for.
              </p>
              <span className="wp-tagline">
                Own your data. Keep the value. Read the signals.
              </span>
            </div>
          </section>
        </main>
      </div>

      {/* Footer */}
      <footer className="wp-footer">
        <p>
          © 2026 Amach Health · <Link href="/">amachhealth.com</Link>
        </p>
      </footer>
    </>
  );
}
