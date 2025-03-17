"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import React from "react";
import { HealthDataProvider } from "../store/healthDataStore/provider";
import { SelectionProvider } from "../store/selectionStore/provider";
import GlobalStyles from "./GlobalStyles";

export default function ClientWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <>
      <GlobalStyles />
      <nav className="bg-white shadow-sm">
        <div className="container mx-auto px-4">
          <div className="flex justify-between h-16">
            <div className="flex">
              <div className="flex-shrink-0 flex items-center">
                {/* Exact styling from main page (document #34) */}
                <h1 className="text-2xl font-black text-emerald-900">
                  Amach Health
                </h1>
              </div>
              <div className="ml-6 flex items-center space-x-4">
                <Link
                  href="/"
                  className={`px-3 py-2 rounded-md text-sm font-medium ${
                    pathname === "/"
                      ? "bg-[--primary-light] text-[--primary]"
                      : "text-gray-500 hover:text-[--primary] hover:bg-[--primary-light]/30"
                  }`}
                >
                  Data Selector
                </Link>
                <Link
                  href="/dashboard"
                  className={`px-3 py-2 rounded-md text-sm font-medium ${
                    pathname === "/dashboard"
                      ? "bg-[--primary-light] text-[--primary]"
                      : "text-gray-500 hover:text-[--primary] hover:bg-[--primary-light]/30"
                  }`}
                >
                  Dashboard
                </Link>
              </div>
            </div>
          </div>
        </div>
      </nav>
      <SelectionProvider>
        <HealthDataProvider>{children}</HealthDataProvider>
      </SelectionProvider>
    </>
  );
}
