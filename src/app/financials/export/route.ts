import { NextResponse } from "next/server";

import { requireProfile } from "@/lib/auth";
import {
  buildStaffExportFilename,
  buildStaffWorkbook,
} from "@/lib/excel-export";
import { getStaffExportPayload } from "@/lib/financial-summaries";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  await requireProfile();
  const supabase = await createClient();

  try {
    const payload = await getStaffExportPayload(supabase);
    const buffer = await buildStaffWorkbook(payload);
    const filename = buildStaffExportFilename(
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
      { error: "Unable to export financial summary." },
      { status: 400 },
    );
  }
}
