import { NextResponse } from "next/server";

import { getCurrentUserRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const role = await getCurrentUserRole();

  if (!role) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json(
    { role },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
