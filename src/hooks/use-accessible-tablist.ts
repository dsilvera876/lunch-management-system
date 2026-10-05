"use client";

import { useCallback, useRef } from "react";
import {
  resolveNextTabIndex,
  resolveTabKeyboardAction,
  rovingTabIndex,
} from "@/lib/accessible-tabs";

type Options<TId extends string> = {
  tabIds: readonly TId[];
  selectedId: TId;
  onSelect: (id: TId) => void;
};

export function useAccessibleTablist<TId extends string>({
  tabIds,
  selectedId,
  onSelect,
}: Options<TId>) {
  const tabRefs = useRef(new Map<TId, HTMLButtonElement | null>());

  const setTabRef = useCallback((id: TId, node: HTMLButtonElement | null) => {
    tabRefs.current.set(id, node);
  }, []);

  const onTabKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>, tabId: TId) => {
      const action = resolveTabKeyboardAction(event.key);
      if (!action) {
        return;
      }

      event.preventDefault();
      const currentIndex = tabIds.indexOf(tabId);
      if (currentIndex < 0) {
        return;
      }

      const nextIndex = resolveNextTabIndex(currentIndex, tabIds.length, action);
      const nextId = tabIds[nextIndex];
      if (!nextId) {
        return;
      }

      onSelect(nextId);
      tabRefs.current.get(nextId)?.focus();
    },
    [onSelect, tabIds],
  );

  const tabProps = useCallback(
    (tabId: TId) => ({
      ref: (node: HTMLButtonElement | null) => setTabRef(tabId, node),
      role: "tab" as const,
      "aria-selected": tabId === selectedId,
      tabIndex: rovingTabIndex(tabId === selectedId),
      onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) =>
        onTabKeyDown(event, tabId),
    }),
    [onTabKeyDown, selectedId, setTabRef],
  );

  return { tabProps };
}
