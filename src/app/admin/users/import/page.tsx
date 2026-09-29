import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { PageHeader } from "@/components/ui/page-header";
import { HrBulkImportWorkspace } from "@/components/admin/hr-bulk-import-workspace";

type Props = {
  searchParams: Promise<{
    batch?: string;
  }>;
};

export default async function BulkUserImportPage({ searchParams }: Props) {
  const params = await searchParams;
  const profile = await getCurrentProfile();

  if (!profile) {
    redirect("/login");
  }

  if (profile.role !== "hr") {
    redirect("/admin/users");
  }

  return (
    <>
      <PageHeader
        title="Bulk Import Users"
        description="Upload a CSV to create and invite staff accounts for launch."
      />
      <HrBulkImportWorkspace initialBatchId={params.batch ?? null} />
    </>
  );
}
