import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { remark } from "remark";
import remarkHtml from "remark-html";

const POSTS_DIR = path.join(process.cwd(), "content/blog");

export interface BlogPost {
  slug: string;
  title: string;
  description: string;
  date: string;
  author: string;
  tags: string[];
  readingTime: string;
  coverImage?: string;
  content: string;
}

export interface BlogPostMeta extends Omit<BlogPost, "content"> {}

function ensureString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function ensureStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === "string");
  }
  return [];
}

export async function getAllPosts(): Promise<BlogPostMeta[]> {
  if (!fs.existsSync(POSTS_DIR)) return [];

  const files = fs
    .readdirSync(POSTS_DIR)
    .filter((f) => f.endsWith(".md") || f.endsWith(".mdx"));

  const posts = files.map((filename) => {
    const slug = filename.replace(/\.(md|mdx)$/, "");
    const filePath = path.join(POSTS_DIR, filename);
    const raw = fs.readFileSync(filePath, "utf8");
    const { data } = matter(raw);

    return {
      slug,
      title: ensureString(data.title, slug),
      description: ensureString(data.description, ""),
      date: ensureString(data.date, ""),
      author: ensureString(data.author, "Amach Health"),
      tags: ensureStringArray(data.tags),
      readingTime: ensureString(data.readingTime, "5 min read"),
      coverImage: typeof data.coverImage === "string" ? data.coverImage : undefined,
    } satisfies BlogPostMeta;
  });

  return posts.sort((a, b) => (a.date < b.date ? 1 : -1));
}

export async function getPostBySlug(slug: string): Promise<BlogPost | null> {
  const mdPath = path.join(POSTS_DIR, `${slug}.md`);
  const mdxPath = path.join(POSTS_DIR, `${slug}.mdx`);
  const filePath = fs.existsSync(mdPath) ? mdPath : fs.existsSync(mdxPath) ? mdxPath : null;

  if (!filePath) return null;

  const raw = fs.readFileSync(filePath, "utf8");
  const { data, content: markdownContent } = matter(raw);

  const processed = await remark().use(remarkHtml, { sanitize: false }).process(markdownContent);
  const content = processed.toString();

  return {
    slug,
    title: ensureString(data.title, slug),
    description: ensureString(data.description, ""),
    date: ensureString(data.date, ""),
    author: ensureString(data.author, "Amach Health"),
    tags: ensureStringArray(data.tags),
    readingTime: ensureString(data.readingTime, "5 min read"),
    coverImage: typeof data.coverImage === "string" ? data.coverImage : undefined,
    content,
  };
}

export function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
