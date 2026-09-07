import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { getCurrentLunchPeriod } from "@/lib/lunch-periods";
import { getRoleLabel } from "@/lib/navigation";
import { createClient } from "@/lib/supabase/server";
import { CurrentLunchPeriodCard } from "@/components/current-lunch-period-card";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { linkButtonClass } from "@/components/ui/button";
import { UPDATE_PASSWORD_PATH } from "@/lib/auth-recovery";

type Props = {
  searchParams: Promise<{
    message?: string;
  }>;
};

export default async function AccountPage({ searchParams }: Props) {
  const params = await searchParams;
  const profile = await requireProfile();
  const supabase = await createClient();
  const currentPeriod = await getCurrentLunchPeriod(supabase);

  return (
    <>
      <PageHeader
        title="Account"
        description="Your profile information for the lunch management system."
      />

      {params.message === "password-updated" && (
        <Alert variant="success" className="mb-6">
          Your password has been updated.
        </Alert>
      )}

      <CurrentLunchPeriodCard period={currentPeriod} showStaffExport />

      <Card className="max-w-xl">
        <dl className="space-y-4">
          <div>
            <dt className="text-sm text-muted">Name</dt>
            <dd className="mt-1 font-medium">{profile.full_name ?? "Not provided"}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted">Role</dt>
            <dd className="mt-1 font-medium">{getRoleLabel(profile.role)}</dd>
          </div>
        </dl>

        <div className="mt-6 border-t border-border pt-4">
          <Link href={UPDATE_PASSWORD_PATH} className={linkButtonClass("secondary")}>
            Change password
          </Link>
        </div>
      </Card>
    </>
  );
}
