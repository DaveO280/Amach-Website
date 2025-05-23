// src/app/api/hello/route.ts
import { NextResponse } from "next/server";

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ message: "Hello, API is working!" });
}
