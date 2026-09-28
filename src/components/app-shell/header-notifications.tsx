"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

import type { AppNotificationItem } from "@/lib/app-notification-sources";

type Props = {
  items: AppNotificationItem[];
};

export function HeaderNotifications({ items }: Props) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const badgeCount = items.length;

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        aria-label={
          badgeCount > 0
            ? `Notifications, ${badgeCount} pending approval${badgeCount === 1 ? "" : "s"}`
            : "Notifications"
        }
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
        className="relative inline-flex size-10 items-center justify-center rounded-lg border border-border bg-surface text-primary/70 hover:bg-background hover:text-primary"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          aria-hidden
        >
          <path d="M15 17H9l-1 4h8z" strokeLinecap="round" strokeLinejoin="round" />
          <path
            d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {badgeCount > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 inline-flex min-h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-surface">
            {badgeCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          id={panelId}
          role="region"
          aria-label="Notifications"
          className="absolute right-0 z-30 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-xl border border-border bg-surface p-3 shadow-lg"
        >
          {items.length === 0 ? (
            <p className="px-2 py-3 text-sm text-muted">No new notifications.</p>
          ) : (
            <ul className="space-y-2">
              {items.map((item) => (
                <li
                  key={item.id}
                  className="rounded-lg border border-border/80 bg-background px-3 py-2.5"
                >
                  <p className="text-sm font-semibold text-foreground">{item.title}</p>
                  <p className="mt-1 text-sm text-muted">{item.message}</p>
                  <Link
                    href={item.href}
                    className="mt-2 inline-flex text-sm font-medium text-primary underline-offset-2 hover:underline"
                    onClick={() => setOpen(false)}
                  >
                    {item.actionLabel}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
