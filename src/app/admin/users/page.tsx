import { requireManageRoles } from "@/lib/auth";
import { getRoleLabel, isOwner, ASSIGNABLE_ROLES } from "@/lib/roles";
import type { AssignableRole } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import { assignUserRole, transferOwnership } from "./actions";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { FormField, selectClassName } from "@/components/ui/form-field";
import { Button } from "@/components/ui/button";
import { FormSubmitButton } from "@/components/form-submit-button";
import { SectionHeader } from "@/components/ui/section-header";

type Props = {
  searchParams: Promise<{
    error?: string;
    updated?: string;
    transferred?: string;
  }>;
};

type ManageableUser = {
  id: string;
  full_name: string | null;
  email: string;
  role: string;
};

export default async function UserManagementPage({ searchParams }: Props) {
  const profile = await requireManageRoles();
  const params = await searchParams;
  const supabase = await createClient();

  const { data: users, error } = await supabase.rpc("list_manageable_users");

  if (error) {
    throw new Error("Unable to load users.");
  }

  const rows = (users ?? []) as ManageableUser[];
  const viewerIsOwner = isOwner(profile.role);
  const transferCandidates = rows.filter(
    (user) => user.id !== profile.id && user.role !== "owner",
  );

  return (
    <>
      <PageHeader
        title="User / Role Management"
        description="Assign employee roles. Owner promotion happens only through ownership transfer."
      />

      {params.updated && (
        <Alert variant="success" className="mb-6">
          Role updated successfully.
        </Alert>
      )}

      {params.transferred && (
        <Alert variant="success" className="mb-6">
          Ownership transferred successfully. You are now an Admin.
        </Alert>
      )}

      {params.error === "assign" && (
        <Alert variant="error" className="mb-6">
          Unable to assign that role. The user may be protected or the role may be invalid.
        </Alert>
      )}

      {params.error === "transfer" && (
        <Alert variant="error" className="mb-6">
          Unable to transfer ownership. Verify the selected user and try again.
        </Alert>
      )}

      {params.error && !["assign", "transfer"].includes(params.error) && (
        <Alert variant="error" className="mb-6">
          Unable to complete that action.
        </Alert>
      )}

      {viewerIsOwner && (
        <Card className="mb-8">
          <SectionHeader
            title="Transfer ownership"
            description="The selected user becomes Owner. You become Admin. This is the only way to change who holds the Owner role."
          />
          <form action={transferOwnership} className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <FormField label="New Owner" htmlFor="newOwnerId">
              <select id="newOwnerId" name="newOwnerId" required className={selectClassName}>
                <option value="">Select an employee</option>
                {transferCandidates.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.full_name ?? user.email} ({getRoleLabel(user.role)})
                  </option>
                ))}
              </select>
            </FormField>
            <FormSubmitButton
              pendingText="Transferring..."
              confirmMessage="Transfer ownership? The selected user will become Owner and you will become Admin."
              variant="danger"
            >
              Transfer ownership
            </FormSubmitButton>
          </form>
        </Card>
      )}

      <div className="space-y-4">
        {rows.map((user) => {
          const protectedOwner = user.role === "owner";

          return (
            <Card key={user.id} padding="sm">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold">{user.full_name ?? "Unnamed employee"}</h3>
                    <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-800 ring-1 ring-emerald-200 ring-inset">
                      {getRoleLabel(user.role)}
                    </span>
                    {protectedOwner && (
                      <span className="text-xs text-muted">Protected · cannot be changed here</span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-muted">{user.email}</p>
                </div>

                {!protectedOwner ? (
                  <form action={assignUserRole} className="flex flex-col gap-3 sm:flex-row sm:items-end">
                    <input type="hidden" name="profileId" value={user.id} />
                    <FormField label="Assign role" htmlFor={`role-${user.id}`}>
                      <select
                        id={`role-${user.id}`}
                        name="role"
                        defaultValue={user.role as AssignableRole}
                        className={selectClassName}
                      >
                        {ASSIGNABLE_ROLES.map((role) => (
                          <option key={role} value={role}>
                            {getRoleLabel(role)}
                          </option>
                        ))}
                      </select>
                    </FormField>
                    <Button type="submit" variant="secondary">
                      Save role
                    </Button>
                  </form>
                ) : (
                  <p className="text-sm text-muted">No role-changing controls for Owner.</p>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}
