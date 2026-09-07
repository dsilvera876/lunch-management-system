import { NextResponse } from "next/server";

import { requireExportFinancialSummaries } from "@/lib/auth";
import {
  buildManagementExportFilename,
  buildManagementWorkbook,
} from "@/lib/excel-export";
import { getManagementExportPayload } from "@/lib/financial-summaries";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  await requireExportFinancialSummaries();
  const periodId = new URL(request.url).searchParams.get("periodId");

  if (!periodId) {
    return NextResponse.json({ error: "Period is required." }, { status: 400 });
  }

  const supabase = await createClient();

  try {
    const payload = await getManagementExportPayload(supabase, periodId);
    const buffer = await buildManagementWorkbook(payload);
    const filename = buildManagementExportFilename(
      payload.period.start_date,
      payload.period.end_date,
    );

    return new NextResponse(buffer, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Unable to export lunch period summary." },
      { status: 403 },
    );
  }
}
