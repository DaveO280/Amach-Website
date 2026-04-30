import { getAllPosts, getPostBySlug, formatDate } from "@/lib/blog";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams(): Promise<{ slug: string }[]> {
  const posts = await getAllPosts();
  return posts.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPostBySlug(slug);

  if (!post) {
    return { title: "Post Not Found — Amach Health" };
  }

  const canonicalUrl = `https://amachhealth.com/blog/${slug}`;

  return {
    title: `${post.title} — Amach Health`,
    description: post.description,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title: post.title,
      description: post.description,
      type: "article",
      url: canonicalUrl,
      siteName: "Amach Health",
      publishedTime: post.date,
      authors: [post.author],
      tags: post.tags,
      ...(post.coverImage ? { images: [{ url: post.coverImage }] } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description: post.description,
      ...(post.coverImage ? { images: [post.coverImage] } : {}),
    },
  };
}

export default async function BlogPostPage({ params }: PageProps): Promise<JSX.Element> {
  const { slug } = await params;
  const post = await getPostBySlug(slug);

  if (!post) {
    notFound();
  }

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

      {/* Article */}
      <article style={{ padding: "64px 24px 100px" }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          {/* Back link */}
          <Link
            href="/blog"
            className="blog-back-link"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: "0.875rem",
              color: "var(--color-text-muted)",
              textDecoration: "none",
              marginBottom: 40,
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
            All Insights
          </Link>

          {/* Tags */}
          {post.tags.length > 0 && (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 6,
                marginBottom: 20,
              }}
            >
              {post.tags.map((tag) => (
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
          <h1
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: "clamp(1.75rem, 4vw, 2.5rem)",
              fontWeight: 700,
              lineHeight: 1.25,
              color: "var(--color-text-primary)",
              marginBottom: 20,
            }}
          >
            {post.title}
          </h1>

          {/* Description */}
          <p
            style={{
              fontSize: "1.125rem",
              color: "var(--color-text-secondary)",
              lineHeight: 1.7,
              marginBottom: 32,
            }}
          >
            {post.description}
          </p>

          {/* Meta bar */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 20,
              fontSize: "0.85rem",
              color: "var(--color-text-muted)",
              paddingBottom: 32,
              borderBottom: "1px solid var(--color-border)",
              marginBottom: 48,
            }}
          >
            <span>{post.author}</span>
            <span
              style={{ width: 3, height: 3, borderRadius: "50%", background: "var(--color-border-strong)", flexShrink: 0 }}
              aria-hidden="true"
            />
            <span>{formatDate(post.date)}</span>
            <span
              style={{ width: 3, height: 3, borderRadius: "50%", background: "var(--color-border-strong)", flexShrink: 0 }}
              aria-hidden="true"
            />
            <span>{post.readingTime}</span>
          </div>

          {/* Prose content */}
          <div
            className="amach-prose"
            dangerouslySetInnerHTML={{ __html: post.content }}
          />
        </div>
      </article>

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
          <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
            <Link href="/" className="btn-emerald" style={{ display: "inline-block" }}>
              Get Started
            </Link>
            <Link
              href="/blog"
              className="blog-more-link"
              style={{
                display: "inline-block",
                padding: "14px 32px",
                borderRadius: 9999,
                border: "1px solid var(--color-border-strong)",
                fontSize: "0.9rem",
                color: "var(--color-text-secondary)",
                textDecoration: "none",
              }}
            >
              More Insights
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
