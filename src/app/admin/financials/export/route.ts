import { NextResponse } from "next/server";

import { requireExportFinancialSummaries } from "@/lib/auth";
import {
  buildEmployeeIdManagementWorkbook,
  buildManagementExportFilename,
  buildManagementWorkbook,
} from "@/lib/excel-export";
import {
  getEmployeeIdManagementExportPayload,
  getManagementExportPayload,
} from "@/lib/financial-summaries";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const profile = await requireExportFinancialSummaries();
  const periodId = new URL(request.url).searchParams.get("periodId");

  if (!periodId) {
    return NextResponse.json({ error: "Period is required." }, { status: 400 });
  }

  const supabase = await createClient();

  try {
    const filenameParts =
      profile.role === "accounts"
        ? await (async () => {
            const payload = await getEmployeeIdManagementExportPayload(
              supabase,
              periodId,
            );
            const buffer = await buildEmployeeIdManagementWorkbook(payload);
            return {
              buffer,
              startDate: payload.period.start_date,
              endDate: payload.period.end_date,
            };
          })()
        : await (async () => {
            const payload = await getManagementExportPayload(supabase, periodId);
            const buffer = await buildManagementWorkbook(payload);
            return {
              buffer,
              startDate: payload.period.start_date,
              endDate: payload.period.end_date,
            };
          })();

    const filename = buildManagementExportFilename(
      filenameParts.startDate,
      filenameParts.endDate,
    );
    const buffer = filenameParts.buffer;

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
