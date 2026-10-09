import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";
import { AppShellWrapper } from "@/components/app-shell/app-shell-wrapper";
import { getCurrentProfile } from "@/lib/auth";
import { canAccessOperationalAttentionInbox } from "@/lib/operational-attention";
import { getOperationalAttentionUnreadCount } from "@/lib/operational-attention-server";
import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/roles";
import { fetchActiveSupportSession } from "@/lib/support-mode-server";

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

export const dynamic = "force-dynamic";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const profile = await getCurrentProfile();
  const supportSession = profile ? await fetchActiveSupportSession() : null;
  let operationalAttentionUnreadCount = 0;

  if (profile && canAccessOperationalAttentionInbox(profile.role)) {
    const supabase = await createClient();
    operationalAttentionUnreadCount = await getOperationalAttentionUnreadCount(
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
          <AppShellWrapper
            profile={profile}
            operationalAttentionUnreadCount={operationalAttentionUnreadCount}
            supportSession={supportSession}
          >
            {children}
          </AppShellWrapper>
        </Suspense>
      </body>
    </html>
  );
}