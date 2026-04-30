import fs from "fs";
import path from "path";
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

// Minimal YAML-subset frontmatter parser — handles quoted strings and JSON arrays.
// Avoids gray-matter / js-yaml entirely because gray-matter bundles js-yaml v3
// internally but webpack resolves it against the project's js-yaml v4 which
// removed yaml.safeLoad, crashing the production build during page data collection.
function parseFrontmatter(raw: string): {
  data: Record<string, unknown>;
  content: string;
} {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) return { data: {}, content: raw };

  const [, block, content] = match;
  const data: Record<string, unknown> = {};

  for (const line of block.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const rawVal = line.slice(colonIdx + 1).trim();
    if (!key) continue;

    if (rawVal.startsWith("[")) {
      try {
        data[key] = JSON.parse(rawVal);
      } catch {
        data[key] = rawVal;
      }
    } else if (
      (rawVal.startsWith('"') && rawVal.endsWith('"')) ||
      (rawVal.startsWith("'") && rawVal.endsWith("'"))
    ) {
      data[key] = rawVal.slice(1, -1);
    } else {
      data[key] = rawVal;
    }
  }

  return { data, content: content.trim() };
}

function str(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function strArr(value: unknown): string[] {
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
    const raw = fs.readFileSync(path.join(POSTS_DIR, filename), "utf8");
    const { data } = parseFrontmatter(raw);

    return {
      slug,
      title: str(data.title, slug),
      description: str(data.description, ""),
      date: str(data.date, ""),
      author: str(data.author, "Amach Health"),
      tags: strArr(data.tags),
      readingTime: str(data.readingTime, "5 min read"),
      coverImage:
        typeof data.coverImage === "string" ? data.coverImage : undefined,
    } satisfies BlogPostMeta;
  });

  return posts.sort((a, b) => (a.date < b.date ? 1 : -1));
}

export async function getPostBySlug(slug: string): Promise<BlogPost | null> {
  const mdPath = path.join(POSTS_DIR, `${slug}.md`);
  const mdxPath = path.join(POSTS_DIR, `${slug}.mdx`);
  const filePath = fs.existsSync(mdPath)
    ? mdPath
    : fs.existsSync(mdxPath)
      ? mdxPath
      : null;

  if (!filePath) return null;

  const raw = fs.readFileSync(filePath, "utf8");
  const { data, content: md } = parseFrontmatter(raw);

  const processed = await remark()
    .use(remarkHtml, { sanitize: false })
    .process(md);

  return {
    slug,
    title: str(data.title, slug),
    description: str(data.description, ""),
    date: str(data.date, ""),
    author: str(data.author, "Amach Health"),
    tags: strArr(data.tags),
    readingTime: str(data.readingTime, "5 min read"),
    coverImage:
      typeof data.coverImage === "string" ? data.coverImage : undefined,
    content: processed.toString(),
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
