import { Inter } from "next/font/google";
import ClientWrapper from "../components/ClientWrapper";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

// Import metadata from separate file
export { metadata } from "./metadata";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>): JSX.Element {
  // Generate a random version number for cache busting
  const cacheVersion = Date.now();

  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/favicon.ico" />
        {/* Add cache-busting meta tags */}
        <meta name="version" content={`${cacheVersion}`} />
        <meta
          httpEquiv="Cache-Control"
          content="no-cache, no-store, must-revalidate"
        />
        <meta httpEquiv="Pragma" content="no-cache" />
        <meta httpEquiv="Expires" content="0" />
      </head>
      <body className={inter.className}>
        <ClientWrapper>{children}</ClientWrapper>
      </body>
    </html>
  );
}
