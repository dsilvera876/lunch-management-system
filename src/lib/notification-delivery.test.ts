import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  notificationDeliveryBatchStatusLabel,
  notificationDeliveryRecipientStatusLabel,
} from "@/lib/notification-delivery";
import { getBreadcrumbs } from "@/lib/breadcrumbs";

describe("notification delivery monitoring", () => {
  it("uses Sent terminology for SMTP-confirmed transport", () => {
    assert.equal(notificationDeliveryBatchStatusLabel("sent"), "Sent");
    assert.equal(notificationDeliveryRecipientStatusLabel("sent"), "Sent");
    assert.notEqual(notificationDeliveryBatchStatusLabel("sent"), "Delivered");
  });

  it("wires admin delivery dashboard routes and auth", () => {
    const dashboardPage = readFileSync(
      new URL("../app/admin/settings/email/delivery/page.tsx", import.meta.url),
      "utf8",
    );
    const historyPage = readFileSync(
      new URL("../app/admin/settings/email/delivery/history/page.tsx", import.meta.url),
      "utf8",
    );
    const detailPage = readFileSync(
      new URL("../app/admin/settings/email/delivery/[batchId]/page.tsx", import.meta.url),
      "utf8",
    );
    const dashboard = readFileSync(
      new URL("../components/admin/notification-delivery-dashboard.tsx", import.meta.url),
      "utf8",
    );
    const serverLoader = readFileSync(
      new URL("./notification-delivery-server.ts", import.meta.url),
      "utf8",
    );
    const worker = readFileSync(new URL("../worker/run.ts", import.meta.url), "utf8");

    assert.match(dashboardPage, /requireAdminOrOwner/);
    assert.match(historyPage, /requireAdminOrOwner/);
    assert.match(detailPage, /requireAdminOrOwner/);
    assert.match(dashboard, /Recent notification deliveries/);
    assert.match(dashboard, /Sent/);
    assert.match(serverLoader, /get_notification_delivery_dashboard/);
    assert.match(serverLoader, /list_notification_delivery_batches/);
    assert.match(serverLoader, /list_notification_processing_runs/);
    const processingActivity = readFileSync(
      new URL("../components/admin/notification-processing-activity.tsx", import.meta.url),
      "utf8",
    );
    assert.match(processingActivity, /Recent processing activity/);
    assert.match(dashboard, /NotificationProcessingActivity/);
    assert.match(historyPage, /loadNotificationDeliveryHistory/);
    assert.match(worker, /today-menu-notifications/);
    assert.match(worker, /formatTodayMenuWorkerLogLine/);
    assert.match(worker, /processTodayMenuNotifications/);
  });

  it("uses Admin Settings breadcrumbs for Email Delivery monitoring", () => {
    assert.deepEqual(getBreadcrumbs("/admin/settings/email/delivery"), [
      { label: "Home", href: "/home" },
      { label: "Admin Settings", href: "/admin/settings/system" },
      { label: "Email Delivery" },
    ]);

    assert.deepEqual(getBreadcrumbs("/admin/settings/email/delivery/history"), [
      { label: "Home", href: "/home" },
      { label: "Admin Settings", href: "/admin/settings/system" },
      { label: "Email Delivery", href: "/admin/settings/email/delivery" },
      { label: "History" },
    ]);

    const detailCrumbs = getBreadcrumbs(
      "/admin/settings/email/delivery/00000000-0000-0000-0000-000000000001",
    );
    assert.deepEqual(detailCrumbs, [
      { label: "Home", href: "/home" },
      { label: "Admin Settings", href: "/admin/settings/system" },
      { label: "Email Delivery", href: "/admin/settings/email/delivery" },
      { label: "Delivery Details" },
    ]);
    assert.doesNotMatch(JSON.stringify(detailCrumbs), /Administration/);
  });

  it("adds Refresh controls and removes redundant back links", () => {
    const dashboard = readFileSync(
      new URL("../components/admin/notification-delivery-dashboard.tsx", import.meta.url),
      "utf8",
    );
    const history = readFileSync(
      new URL("../components/admin/notification-delivery-history.tsx", import.meta.url),
      "utf8",
    );
    const detail = readFileSync(
      new URL("../components/admin/notification-delivery-detail.tsx", import.meta.url),
      "utf8",
    );
    const refresh = readFileSync(
      new URL("../components/admin/notification-delivery-refresh-button.tsx", import.meta.url),
      "utf8",
    );

    assert.match(dashboard, /NotificationDeliveryRefreshButton/);
    assert.match(history, /NotificationDeliveryRefreshButton/);
    assert.match(refresh, /router\.refresh/);
    assert.match(refresh, /Refreshing…/);
    assert.doesNotMatch(history, /Back to Email Delivery/);
    assert.doesNotMatch(detail, /Back to history/);
  });
});
