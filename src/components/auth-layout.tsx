import type { ReactNode } from "react";

type AuthLayoutVariant = "signin" | "onboarding";

export function AuthLayout({
  children,
  variant = "signin",
}: {
  children: ReactNode;
  variant?: AuthLayoutVariant;
}) {
  const isOnboarding = variant === "onboarding";

  return (
    <div className="min-h-screen bg-background">
      <div
        className={
          isOnboarding
            ? "mx-auto flex min-h-screen w-full max-w-md flex-col px-4 pb-10 pt-20 sm:pt-24"
            : "mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10"
        }
      >
        <div className={`text-center ${isOnboarding ? "mb-6" : "mb-8"}`}>
          <p className="text-lg font-semibold text-foreground">Lunch Management</p>
          {!isOnboarding ? (
            <p className="mt-1 text-sm text-muted">Sign in to manage lunch orders</p>
          ) : null}
        </div>
        <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
          {children}
        </div>
      </div>
    </div>
  );
}
