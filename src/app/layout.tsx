import HealthDataContextWrapper from "@/components/HealthDataContextWrapper";
import PrivyProvider from "@/components/PrivyProvider";
import QueryProvider from "@/components/QueryProvider";
import { SelectionProvider } from "@/store/selectionStore/provider";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import React from "react";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next";
import ErudaLoader from "@/components/ErudaLoader";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Amach Health",
  description: "Driven by Data, Guided by Nature",
  keywords: ["healthcare", "AI", "blockchain", "analytics", "medicine"],
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
  manifest: "/icon.svg",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Amach Health",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>): JSX.Element {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <ErudaLoader />
        <PrivyProvider>
          <QueryProvider>
            <HealthDataContextWrapper>
              <SelectionProvider>{children}</SelectionProvider>
            </HealthDataContextWrapper>
          </QueryProvider>
        </PrivyProvider>
        <Analytics />
      </body>
    </html>
  );
}
