import HealthDataContextWrapper from "@/components/HealthDataContextWrapper";
import PrivyProvider from "@/components/PrivyProvider";
import { PrivyErrorBoundary } from "@/components/PrivyErrorBoundary";
import QueryProvider from "@/components/QueryProvider";
import { SelectionProvider } from "@/store/selectionStore/provider";
import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import React, { Suspense } from "react";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next";
import ErudaLoader from "@/components/ErudaLoader";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "800"],
  variable: "--font-sans",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "Amach Health",
  description: "Own your data. Keep the value. Read the signals.",
  keywords: ["health data", "AI", "privacy", "encrypted", "on-chain"],
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon.svg", type: "image/svg+xml", sizes: "any" },
    ],
    apple: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon.svg", type: "image/svg+xml", sizes: "180x180" },
    ],
    shortcut: "/icon.svg",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Amach Health",
  },
};

// Inline script to apply theme before first paint — prevents flash
const themeScript = `
(function() {
  try {
    var stored = localStorage.getItem('amach-theme');
    if (stored === 'dark' || stored === 'light') {
      document.documentElement.setAttribute('data-theme', stored);
    } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.setAttribute('data-theme', 'light');
    }
  } catch(e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>): JSX.Element {
  return (
    <html
      lang="en"
      suppressHydrationWarning
    >
      <head>
        {/* Theme init — must run before paint to avoid flash */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className={`${inter.variable} ${jetbrainsMono.variable} ${inter.className}`}>
        <ErudaLoader />
        <PrivyErrorBoundary>
          <Suspense fallback={<div>Loading...</div>}>
            <PrivyProvider>
              <QueryProvider>
                <HealthDataContextWrapper>
                  <SelectionProvider>{children}</SelectionProvider>
                </HealthDataContextWrapper>
              </QueryProvider>
            </PrivyProvider>
          </Suspense>
        </PrivyErrorBoundary>
        <Analytics />
      </body>
    </html>
  );
}
