import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  notificationDeliveryBatchStatusLabel,
  notificationDeliveryRecipientStatusLabel,
} from "@/lib/notification-delivery";

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
    assert.match(historyPage, /loadNotificationDeliveryHistory/);
    assert.match(worker, /today-menu-notifications/);
    assert.match(worker, /processTodayMenuNotifications/);
  });
});
