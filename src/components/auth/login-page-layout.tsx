import Image from "next/image";
import type { ReactNode } from "react";

const LOGIN_BACKGROUND = "/images/login-lunchroom-background.jpg";

export function LoginPageLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen overflow-x-hidden">
      <Image
        src={LOGIN_BACKGROUND}
        alt=""
        fill
        priority
        sizes="100vw"
        className="object-cover object-center"
        aria-hidden
      />
      <div
        className="absolute inset-0 bg-slate-900/55 backdrop-blur-[1px]"
        aria-hidden
      />
      <div
        className="absolute inset-0 bg-gradient-to-b from-teal-950/40 via-teal-900/50 to-slate-900/60"
        aria-hidden
      />

      <main className="relative z-10 flex min-h-screen items-center justify-center px-4 py-10 sm:px-6">
        <div className="w-full max-w-[420px] rounded-2xl border border-white/10 bg-surface p-6 shadow-2xl sm:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
