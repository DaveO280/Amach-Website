import HealthDataContextWrapper from "@/components/HealthDataContextWrapper";
import QueryProvider from "@/components/QueryProvider";
import { ZkSyncSsoWalletButton } from "@/components/ZkSyncSsoWalletButton";
import { SelectionProvider } from "@/store/selectionStore/provider";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import React from "react";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Amach Health",
  description: "Driven by Data, Guided by Nature",
  keywords: ["healthcare", "AI", "blockchain", "analytics", "medicine"],
  icons: {
    icon: {
      url: "/icon.svg",
      type: "image/svg+xml",
    },
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
        <QueryProvider>
          <HealthDataContextWrapper>
            <SelectionProvider>
              {/* Keep wallet connection logic mounted globally; hidden to avoid duplicate UI */}
              <div className="hidden">
                <ZkSyncSsoWalletButton />
              </div>
              {children}
            </SelectionProvider>
          </HealthDataContextWrapper>
        </QueryProvider>
      </body>
    </html>
  );
}
