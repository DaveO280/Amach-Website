import { getAllPosts, formatDate } from "@/lib/blog";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Insights — Amach Health",
  description:
    "Perspectives on health data sovereignty, decentralized infrastructure, AI-powered health insights, and the future of personal health.",
  openGraph: {
    title: "Insights — Amach Health",
    description:
      "Perspectives on health data sovereignty, decentralized infrastructure, AI-powered health insights, and the future of personal health.",
    type: "website",
    siteName: "Amach Health",
  },
  twitter: {
    card: "summary_large_image",
    title: "Insights — Amach Health",
    description:
      "Perspectives on health data sovereignty, decentralized infrastructure, and AI-powered health insights.",
  },
};

export default async function BlogPage(): Promise<JSX.Element> {
  const posts = await getAllPosts();

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--color-bg-primary)",
        color: "var(--color-text-primary)",
      }}
    >
      {/* Header */}
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
          <Link
            href="/"
            style={{ textDecoration: "none" }}
            aria-label="Amach Health home"
          >
            <div
              className="amach-wordmark-wrap"
              style={{ fontSize: "1rem", letterSpacing: "0.28em" }}
            >
              <span className="amach-wordmark-line">Amach</span>
              <span className="amach-wordmark-line-sub">Health</span>
            </div>
          </Link>
          <nav style={{ display: "flex", alignItems: "center", gap: 32 }}>
            {[
              { label: "How it Works", href: "/how-it-works" },
              { label: "Mission", href: "/mission" },
              { label: "Insights", href: "/blog" },
            ].map((item) => (
              <Link
                key={item.label}
                href={item.href}
                style={{
                  fontSize: "0.875rem",
                  color:
                    item.href === "/blog"
                      ? "var(--color-emerald)"
                      : "var(--color-text-secondary)",
                  textDecoration: "none",
                  fontWeight: item.href === "/blog" ? 500 : 400,
                }}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section
        className="shimmer-texture"
        style={{ padding: "80px 24px 60px", textAlign: "center" }}
      >
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <span
            className="status-pill"
            style={{
              background: "var(--color-emerald-muted)",
              color: "var(--color-emerald)",
              border: "1px solid var(--color-border-strong)",
              marginBottom: 24,
              display: "inline-flex",
            }}
          >
            Insights
          </span>
          <h1
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: "clamp(2rem, 5vw, 3rem)",
              fontWeight: 700,
              lineHeight: 1.2,
              color: "var(--color-text-primary)",
              marginBottom: 20,
            }}
          >
            Health Data. Your Terms.
          </h1>
          <p
            style={{
              fontSize: "1.125rem",
              color: "var(--color-text-secondary)",
              lineHeight: 1.7,
              maxWidth: 560,
              margin: "0 auto",
            }}
          >
            Perspectives on health data sovereignty, decentralized
            infrastructure, AI-powered insights, and the future of personal
            health.
          </p>
        </div>
      </section>

      {/* Post grid */}
      <section style={{ padding: "60px 24px 100px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          {posts.length === 0 ? (
            <p
              style={{
                textAlign: "center",
                color: "var(--color-text-muted)",
                fontSize: "1.125rem",
              }}
            >
              No posts yet. Check back soon.
            </p>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
                gap: 32,
              }}
            >
              {posts.map((post) => (
                <Link
                  key={post.slug}
                  href={`/blog/${post.slug}`}
                  style={{ textDecoration: "none", display: "block" }}
                >
                  <article
                    className="amach-card blog-card"
                    style={{
                      height: "100%",
                      padding: 32,
                      cursor: "pointer",
                      border: "1px solid var(--color-border)",
                    }}
                  >
                    {/* Tags */}
                    {post.tags.length > 0 && (
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: 6,
                          marginBottom: 16,
                        }}
                      >
                        {post.tags.slice(0, 3).map((tag) => (
                          <span
                            key={tag}
                            className="status-pill"
                            style={{
                              background: "var(--color-emerald-muted)",
                              color: "var(--color-emerald)",
                              border: "1px solid var(--color-border)",
                              fontSize: "0.7rem",
                            }}
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Title */}
                    <h2
                      style={{
                        fontFamily: "var(--font-serif)",
                        fontSize: "1.25rem",
                        fontWeight: 700,
                        lineHeight: 1.35,
                        color: "var(--color-text-primary)",
                        marginBottom: 12,
                      }}
                    >
                      {post.title}
                    </h2>

                    {/* Description */}
                    <p
                      style={{
                        fontSize: "0.9rem",
                        color: "var(--color-text-secondary)",
                        lineHeight: 1.65,
                        marginBottom: 24,
                        display: "-webkit-box",
                        WebkitLineClamp: 3,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}
                    >
                      {post.description}
                    </p>

                    {/* Meta */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        fontSize: "0.8rem",
                        color: "var(--color-text-muted)",
                        borderTop: "1px solid var(--color-border)",
                        paddingTop: 16,
                        marginTop: "auto",
                      }}
                    >
                      <span>{formatDate(post.date)}</span>
                      <span>{post.readingTime}</span>
                    </div>
                  </article>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Footer CTA */}
      <section
        className="shimmer-texture"
        style={{
          padding: "60px 24px",
          borderTop: "1px solid var(--color-border)",
          textAlign: "center",
        }}
      >
        <div style={{ maxWidth: 520, margin: "0 auto" }}>
          <p
            style={{
              fontSize: "1.1rem",
              color: "var(--color-text-secondary)",
              marginBottom: 24,
            }}
          >
            Ready to take ownership of your health data?
          </p>
          <Link href="/" className="btn-emerald" style={{ display: "inline-block" }}>
            Get Started
          </Link>
        </div>
      </section>
    </div>
  );
}
