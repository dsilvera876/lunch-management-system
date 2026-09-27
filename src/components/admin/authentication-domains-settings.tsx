"use client";

import { useState, useTransition } from "react";

import {
  addSignupEmailDomain,
  deleteSignupEmailDomain,
  setSignupEmailDomainActive,
  type SignupEmailDomainRow,
} from "@/app/admin/settings/auth-settings-actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormActionStatus } from "@/components/ui/form-action-status";
import { FormField, inputClassName } from "@/components/ui/form-field";

type Props = {
  domains: SignupEmailDomainRow[];
  canManage: boolean;
};

export function AuthenticationDomainsSettings({ domains, canManage }: Props) {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingDeleteDomain, setPendingDeleteDomain] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function runAction(action: () => Promise<{ success: boolean; error?: string }>) {
    setMessage(null);
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.success) {
        setMessage("Domain settings updated.");
      } else {
        setError(result.error ?? "Unable to update domain settings.");
      }
    });
  }

  return (
    <Card padding="md" className="shadow-sm">
      <h2 className="text-base font-semibold text-foreground">Trusted company email domains</h2>
      <p className="mt-1 text-sm text-muted">
        Users signing up with an active company domain bypass HR approval. Disabling a domain affects
        only future signup classification.
      </p>

      {canManage ? (
        <form
          className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const domain = new FormData(form).get("domain");
            if (typeof domain !== "string" || !domain.trim()) {
              setError("Enter a domain.");
              return;
            }
            if (
              !window.confirm(
                "Users signing up with this email domain will not require HR approval. Continue?",
              )
            ) {
              return;
            }
            runAction(() => addSignupEmailDomain(domain));
            form.reset();
          }}
        >
          <div className="min-w-[14rem] flex-1 sm:max-w-md">
            <FormField label="Add domain" htmlFor="signupDomain">
              <input
                id="signupDomain"
                name="domain"
                type="text"
                placeholder="company.com"
                className={inputClassName}
                disabled={pending}
              />
            </FormField>
          </div>
          <Button type="submit" variant="primary" disabled={pending}>
            Add domain
          </Button>
        </form>
      ) : null}

      <div className="mt-6 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted">
              <th className="py-2 pr-4 font-medium">Domain</th>
              <th className="py-2 pr-4 font-medium">Status</th>
              <th className="py-2 pr-4 font-medium">Updated</th>
              {canManage ? <th className="py-2 font-medium">Actions</th> : null}
            </tr>
          </thead>
          <tbody>
            {domains.map((row) => (
              <tr key={row.domain} className="border-b border-border/60">
                <td className="py-2 pr-4 font-medium text-foreground">{row.domain}</td>
                <td className="py-2 pr-4">{row.active ? "Active" : "Disabled"}</td>
                <td className="py-2 pr-4 text-muted">
                  {new Date(row.updated_at).toLocaleString()}
                </td>
                {canManage ? (
                  <td className="py-2">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={pending}
                        onClick={() => {
                          const enabling = !row.active;
                          if (
                            enabling &&
                            !window.confirm(
                              "Users signing up with this email domain will not require HR approval. Continue?",
                            )
                          ) {
                            return;
                          }
                          runAction(() => setSignupEmailDomainActive(row.domain, enabling));
                        }}
                      >
                        {row.active ? "Disable" : "Enable"}
                      </Button>
                      {!row.active ? (
                        <Button
                          type="button"
                          variant="danger"
                          disabled={pending}
                          onClick={() => setPendingDeleteDomain(row.domain)}
                        >
                          Delete
                        </Button>
                      ) : null}
                    </div>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {message ? (
        <FormActionStatus variant="success" className="mt-4">
          {message}
        </FormActionStatus>
      ) : null}
      {error ? (
        <FormActionStatus variant="error" className="mt-4">
          {error}
        </FormActionStatus>
      ) : null}

      {pendingDeleteDomain ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-domain-title"
        >
          <div className="w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-lg">
            <h3 id="delete-domain-title" className="text-base font-semibold text-foreground">
              Delete trusted domain?
            </h3>
            <p className="mt-2 text-sm text-muted">
              This permanently removes {pendingDeleteDomain} from trusted company email domains.
              Existing users will not be affected, but future signups from this domain will require
              HR approval.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={pending}
                onClick={() => setPendingDeleteDomain(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="danger"
                disabled={pending}
                onClick={() => {
                  const domain = pendingDeleteDomain;
                  setPendingDeleteDomain(null);
                  runAction(() => deleteSignupEmailDomain(domain));
                }}
              >
                Delete Domain
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
