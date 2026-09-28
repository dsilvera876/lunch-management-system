import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";
import { AppShellWrapper } from "@/components/app-shell/app-shell-wrapper";
import { getCurrentProfile } from "@/lib/auth";
import { getHrPendingSignupApprovalCount } from "@/lib/hr-pending-signup-approvals";
import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/roles";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Lunch Management System",
  description: "Manage lunch menus and employee orders.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const profile = await getCurrentProfile();
  let hrPendingSignupCount = 0;

  if (profile?.role === "hr") {
    const supabase = await createClient();
    hrPendingSignupCount = await getHrPendingSignupApprovalCount(
      supabase,
      profile.role as UserRole,
    );
  }

  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Suspense fallback={children}>
          <AppShellWrapper profile={profile} hrPendingSignupCount={hrPendingSignupCount}>
            {children}
          </AppShellWrapper>
        </Suspense>
      </body>
    </html>
  );
}