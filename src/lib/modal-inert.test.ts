import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  APP_SHELL_INERTIBLE_ID,
  computeAnchorFixedStyle,
  createDocumentScrollLock,
  createModalInertController,
  shouldRecoverFocusIntoModal,
  STAFF_MODAL_LAYER_ID,
} from "./modal-inert";

describe("document scroll lock", () => {
  it("locks and restores html overflow with reference counting", () => {
    const root = { style: { overflow: "auto" } } as HTMLElement;
    const lock = createDocumentScrollLock(() => ({
      documentElement: root,
    }) as Document);

    lock.acquire();
    assert.equal(root.style.overflow, "hidden");
    lock.acquire();
    assert.equal(root.style.overflow, "hidden");

    lock.release();
    assert.equal(root.style.overflow, "hidden");

    lock.release();
    assert.equal(root.style.overflow, "auto");
  });
});

describe("modal inert controller", () => {
  it("locks and unlocks app shell roots with reference counting", () => {
    const roots = new Map<string, { inert: boolean }>([
      [APP_SHELL_INERTIBLE_ID, { inert: false }],
    ]);

    const controller = createModalInertController(() => ({
      getElementById: (id) => roots.get(id) ?? null,
    }));

    controller.acquire([APP_SHELL_INERTIBLE_ID]);
    assert.equal(roots.get(APP_SHELL_INERTIBLE_ID)?.inert, true);
    assert.equal(controller.depth(), 1);

    controller.acquire([APP_SHELL_INERTIBLE_ID]);
    assert.equal(controller.depth(), 2);
    assert.equal(roots.get(APP_SHELL_INERTIBLE_ID)?.inert, true);

    controller.release();
    assert.equal(controller.depth(), 1);
    assert.equal(roots.get(APP_SHELL_INERTIBLE_ID)?.inert, true);

    controller.release();
    assert.equal(controller.depth(), 0);
    assert.equal(roots.get(APP_SHELL_INERTIBLE_ID)?.inert, false);
  });

  it("clears stale inert after repeated open/close cycles", () => {
    const root = { inert: false };
    const controller = createModalInertController(() => ({
      getElementById: () => root,
    }));

    for (let i = 0; i < 3; i += 1) {
      controller.acquire([APP_SHELL_INERTIBLE_ID]);
      assert.equal(root.inert, true);
      controller.release();
      assert.equal(root.inert, false);
    }
  });
});

describe("modal focus recovery", () => {
  it("recovers focus when active element is outside the dialog", () => {
    const dialogChild = { id: "dialog-child" } as unknown as Node;
    const outside = { id: "outside" } as unknown as Node;
    const modalRoot = {
      contains(node: Node | null) {
        return node === dialogChild;
      },
    } as unknown as Node;

    assert.equal(
      shouldRecoverFocusIntoModal({
        modalOpen: true,
        modalRoot,
        activeElement: outside,
        triggerElement: null,
      }),
      true,
    );

    assert.equal(
      shouldRecoverFocusIntoModal({
        modalOpen: true,
        modalRoot,
        activeElement: dialogChild,
        triggerElement: null,
      }),
      false,
    );
  });

  it("does not recover focus for transient document body focus", () => {
    const modalRoot = {
      contains() {
        return false;
      },
    } as unknown as Node;
    const body = { id: "body" } as unknown as Node;

    const previousDocument = globalThis.document;
    globalThis.document = {
      body,
      documentElement: body,
    } as Document;

    try {
      assert.equal(
        shouldRecoverFocusIntoModal({
          modalOpen: true,
          modalRoot,
          activeElement: body,
          triggerElement: null,
        }),
        false,
      );
    } finally {
      globalThis.document = previousDocument;
    }
  });
});

describe("modal shell wiring", () => {
  it("declares inertible shell and modal layer roots", () => {
    const shell = readFileSync(
      new URL("../components/app-shell/app-shell.tsx", import.meta.url),
      "utf8",
    );
    const trap = readFileSync(
      new URL("../components/ui/focus-trap-popover.tsx", import.meta.url),
      "utf8",
    );

    assert.match(shell, new RegExp(`id="${APP_SHELL_INERTIBLE_ID}"`));
    assert.match(shell, new RegExp(`id="${STAFF_MODAL_LAYER_ID}"`));
    assert.match(trap, /staffModalInert/);
    assert.match(trap, /focusin/);
    assert.match(trap, /createPortal/);
  });

  it("keeps the modal layer outside the inertible shell subtree", () => {
    const shell = readFileSync(
      new URL("../components/app-shell/app-shell.tsx", import.meta.url),
      "utf8",
    );
    const inertStart = shell.indexOf(`id="${APP_SHELL_INERTIBLE_ID}"`);
    const layerStart = shell.indexOf(`id="${STAFF_MODAL_LAYER_ID}"`);
    const segment = shell.slice(inertStart, layerStart);

    let depth = 0;
    for (const token of segment.matchAll(/<\/?div\b/g)) {
      depth += token[0] === "<div" ? 1 : -1;
    }

    assert.ok(inertStart >= 0 && layerStart >= 0);
    assert.equal(
      depth,
      0,
      "app-shell-inertible wrapper must close before staff-modal-layer",
    );
  });
});

describe("focus trap popover modal lifecycle", () => {
  it("acquires inert while open and releases on cleanup", () => {
    const trap = readFileSync(
      new URL("../components/ui/focus-trap-popover.tsx", import.meta.url),
      "utf8",
    );

    assert.match(trap, /staffModalInert\.acquire\(\)/);
    assert.match(trap, /staffModalInert\.release\(\)/);
    assert.match(trap, /if \(!open \|\| !modal\)/);
  });

  it("returns focus to the trigger and dismisses via Escape and outside click", () => {
    const trap = readFileSync(
      new URL("../components/ui/focus-trap-popover.tsx", import.meta.url),
      "utf8",
    );

    assert.match(trap, /triggerRef\.current\?\.focus\(\)/);
    assert.match(trap, /event\.key === "Escape"/);
    assert.match(trap, /mousedown/);
    assert.match(trap, /data-staff-modal-dialog/);
    assert.doesNotMatch(trap, /document\.body\.inert/);
  });

  it("waits for the portal target before attaching trap listeners", () => {
    const trap = readFileSync(
      new URL("../components/ui/focus-trap-popover.tsx", import.meta.url),
      "utf8",
    );

    assert.match(trap, /if \(modal && !modalLayer\)/);
    assert.match(trap, /modalLayer,/);
  });
});

describe("anchor positioning", () => {
  it("anchors panel below trigger aligned to the right edge when possible", () => {
    const style = computeAnchorFixedStyle(
      { bottom: 100, right: 300 } as DOMRect,
      280,
      1024,
    );
    assert.equal(style.top, 108);
    assert.equal(style.left, 20);
  });
});
