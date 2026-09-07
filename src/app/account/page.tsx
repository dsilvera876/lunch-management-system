import { requireProfile } from "@/lib/auth";
import { getRoleLabel } from "@/lib/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";

export default async function AccountPage() {
  const profile = await requireProfile();

  return (
    <>
      <PageHeader
        title="Account"
        description="Your profile information for the lunch management system."
      />

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
      </Card>
    </>
  );
}
