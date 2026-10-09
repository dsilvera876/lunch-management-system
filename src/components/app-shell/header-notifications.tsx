"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import {
  loadOperationalAttentionInbox,
  markAllOperationalAttentionItemsRead,
  markOperationalAttentionItemRead,
  refreshOperationalAttentionUnreadCount,
} from "@/app/operational-attention/actions";
import {
  canAccessOperationalAttentionInbox,
  operationalAttentionBellAriaLabel,
  type OperationalAttentionItem,
} from "@/lib/operational-attention";

type Props = {
  role: string;
  initialUnreadCount?: number;
  mutedTextClass?: string;
};

export function HeaderNotifications({
  role,
  initialUnreadCount = 0,
  mutedTextClass = "text-muted",
}: Props) {
  if (!canAccessOperationalAttentionInbox(role)) {
    return null;
  }

  return (
    <OperationalAttentionBell
      initialUnreadCount={initialUnreadCount}
      mutedTextClass={mutedTextClass}
    />
  );
}

function OperationalAttentionBell({
  initialUnreadCount,
  mutedTextClass,
}: {
  initialUnreadCount: number;
  mutedTextClass: string;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<OperationalAttentionItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [markAllPending, setMarkAllPending] = useState(false);
  const [markingItemId, setMarkingItemId] = useState<string | null>(null);
  const panelId = useId();
  const titleId = useId();
  const liveId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const bellRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const loadGenerationRef = useRef(0);
  const refreshGenerationRef = useRef(0);
  const openRef = useRef(open);

  useEffect(() => {
    openRef.current = open;
  }, [open]);

  useEffect(() => {
    if (openRef.current) {
      return;
    }
    setUnreadCount(initialUnreadCount);
  }, [initialUnreadCount]);

  const refreshUnreadOnly = useCallback(async () => {
    const generation = ++refreshGenerationRef.current;

    try {
      const result = await refreshOperationalAttentionUnreadCount();
      if (generation !== refreshGenerationRef.current) {
        return;
      }
      if (result.ok) {
        setUnreadCount(result.unreadCount);
      }
    } catch {
      // Badge refresh is best-effort; ignore transient network failures.
    }
  }, []);

  const loadInbox = useCallback(async (options?: { keepActionError?: boolean }) => {
    const generation = ++loadGenerationRef.current;
    setLoading(true);
    setLoadError(null);
    if (!options?.keepActionError) {
      setActionError(null);
    }

    try {
      const result = await loadOperationalAttentionInbox();

      if (generation !== loadGenerationRef.current) {
        return;
      }

      if (!result.ok) {
        setLoadError(result.error);
        return;
      }

      setItems(result.items);
      setUnreadCount(result.unreadCount);
    } catch (caught) {
      if (generation !== loadGenerationRef.current) {
        return;
      }

      setLoadError(
        caught instanceof Error ? caught.message : "Unable to reach the server.",
      );
    } finally {
      if (generation === loadGenerationRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- refresh badge after client navigations
    void refreshUnreadOnly();
  }, [pathname, refreshUnreadOnly]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        bellRef.current?.focus();
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      const focusTarget = panelRef.current?.querySelector<HTMLElement>(
        "button, a[href]",
      );
      focusTarget?.focus();
    });

    return () => cancelAnimationFrame(frame);
  }, [open]);

  function handleToggleOpen() {
    if (open) {
      setOpen(false);
      void refreshUnreadOnly();
      return;
    }

    setOpen(true);
    void loadInbox();
  }

  async function handleMarkItemRead(itemId: string) {
    if (markingItemId) {
      return;
    }

    setActionError(null);
    setMarkingItemId(itemId);

    try {
      const result = await markOperationalAttentionItemRead(itemId);

      if (!result.ok) {
        setActionError(`Could not mark notification as read. ${result.error}`);
        return;
      }

      if (result.updated) {
        setItems((current) =>
          current.map((item) =>
            item.id === itemId
              ? { ...item, readAt: new Date().toISOString(), isUnread: false }
              : item,
          ),
        );
        setUnreadCount((current) => Math.max(0, current - 1));
        void refreshUnreadOnly();
        return;
      }

      setActionError(
        "Could not mark notification as read. The notification may no longer be available.",
      );
      void loadInbox({ keepActionError: true });
    } catch (caught) {
      setActionError(
        caught instanceof Error
          ? `Could not mark notification as read. ${caught.message}`
          : "Could not mark notification as read. Unable to reach the server.",
      );
    } finally {
      setMarkingItemId(null);
    }
  }

  async function handleMarkAllRead() {
    if (markAllPending) {
      return;
    }

    setActionError(null);
    setMarkAllPending(true);

    try {
      const result = await markAllOperationalAttentionItemsRead();

      if (!result.ok) {
        setActionError(`Could not mark all notifications as read. ${result.error}`);
        return;
      }

      if (result.updatedCount === 0) {
        setActionError(
          "Could not mark all notifications as read. No notifications were updated.",
        );
        void loadInbox({ keepActionError: true });
        return;
      }

      setItems((current) =>
        current.map((item) => ({
          ...item,
          readAt: item.readAt ?? new Date().toISOString(),
          isUnread: false,
        })),
      );
      setUnreadCount(0);
      void refreshUnreadOnly();
    } catch (caught) {
      setActionError(
        caught instanceof Error
          ? `Could not mark all notifications as read. ${caught.message}`
          : "Could not mark all notifications as read. Unable to reach the server.",
      );
    } finally {
      setMarkAllPending(false);
    }
  }

  const hasUnread = unreadCount > 0;
  const showMarkAll = unreadCount > 0 && !loading && !loadError;

  return (
    <div className="relative" ref={rootRef}>
      <span id={liveId} className="sr-only" aria-live="polite" aria-atomic="true">
        {hasUnread
          ? `${unreadCount} unread operational ${unreadCount === 1 ? "notification" : "notifications"}`
          : "No unread operational notifications"}
      </span>

      <button
        ref={bellRef}
        type="button"
        aria-label={operationalAttentionBellAriaLabel(unreadCount)}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-haspopup="dialog"
        onClick={handleToggleOpen}
        className="relative inline-flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-primary/70 hover:bg-background hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
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
        {hasUnread ? (
          <span
            className="absolute -right-0.5 -top-0.5 inline-flex min-h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-surface"
            aria-hidden
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-modal="false"
          aria-labelledby={titleId}
          className="absolute right-0 z-30 mt-2 max-h-[min(24rem,calc(100dvh-6rem))] w-[min(20rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-border bg-surface p-3 shadow-lg"
        >
          <div className="mb-2 flex items-start justify-between gap-2 px-1">
            <h2 id={titleId} className="text-sm font-semibold text-foreground">
              Operational notifications
            </h2>
            {showMarkAll ? (
              <button
                type="button"
                disabled={markAllPending || loading}
                onClick={() => void handleMarkAllRead()}
                className="shrink-0 text-xs font-medium text-primary underline-offset-2 hover:underline disabled:opacity-60"
              >
                Mark all as read
              </button>
            ) : null}
          </div>

          {loading ? (
            <p className={`px-2 py-3 text-sm ${mutedTextClass}`} role="status">
              Loading notifications…
            </p>
          ) : loadError ? (
            <div className="space-y-2 px-2 py-3">
              <p className="text-sm text-red-700" role="alert">
                Could not load notifications. {loadError}
              </p>
              <button
                type="button"
                onClick={() => void loadInbox()}
                className="text-sm font-medium text-primary underline-offset-2 hover:underline"
              >
                Try again
              </button>
            </div>
          ) : (
            <>
              {actionError ? (
                <div className="mb-2 space-y-1 px-2">
                  <p className="text-sm text-red-700" role="alert">
                    {actionError}
                  </p>
                  <p className={`text-xs ${mutedTextClass}`}>
                    You can retry using Mark as read or Mark all as read.
                  </p>
                </div>
              ) : null}

              {items.length === 0 ? (
                <p className={`px-2 py-3 text-sm ${mutedTextClass}`}>
                  No active operational notifications.
                </p>
              ) : (
                <ul className="space-y-2">
                  {items.map((item) => (
                <li
                  key={item.id}
                  className={`rounded-lg border px-3 py-2.5 ${
                    item.isUnread
                      ? "border-primary/35 bg-background shadow-sm"
                      : "border-border/70 bg-background/70 opacity-90"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p
                      className={`text-sm ${
                        item.isUnread
                          ? "font-semibold text-foreground"
                          : "font-medium text-foreground/90"
                      }`}
                    >
                      {item.title}
                      {item.isUnread ? (
                        <span className="sr-only"> (unread)</span>
                      ) : (
                        <span className="sr-only"> (read)</span>
                      )}
                    </p>
                    {item.isUnread ? (
                      <span
                        className="mt-1 size-2 shrink-0 rounded-full bg-primary"
                        aria-hidden
                      />
                    ) : null}
                  </div>
                  <p className={`mt-1 text-sm ${mutedTextClass}`}>{item.body}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <Link
                      href={item.actionHref}
                      className="text-sm font-medium text-primary underline-offset-2 hover:underline"
                      onClick={() => setOpen(false)}
                    >
                      {item.actionLabel}
                    </Link>
                    {item.isUnread ? (
                      <button
                        type="button"
                        disabled={markingItemId === item.id || markAllPending}
                        onClick={() => void handleMarkItemRead(item.id)}
                        className="text-sm text-foreground/80 underline-offset-2 hover:underline disabled:opacity-60"
                      >
                        Mark as read
                      </button>
                    ) : null}
                  </div>
                </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
