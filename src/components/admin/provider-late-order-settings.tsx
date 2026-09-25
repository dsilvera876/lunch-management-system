"use client";

import { useState } from "react";
import { updateProviderLateOrderSettings } from "@/app/admin/providers/[id]/late-order-actions";
import { Button } from "@/components/ui/button";
import { FormField, inputClassName, selectClassName } from "@/components/ui/form-field";

type Props = {
  providerId: string;
  settings: {
    acceptsLateOrders: boolean;
    lateOrderDeadlineDay: string | null;
    lateOrderDeadlineTime: string | null;
    supplementalDispatchMode: string;
    automaticSupplementSendDay: string | null;
    automaticSupplementSendTime: string | null;
    primaryOrderEmail: string | null;
  };
};

export function ProviderLateOrderSettings({ providerId, settings }: Props) {
  const [acceptsLateOrders, setAcceptsLateOrders] = useState(
    settings.acceptsLateOrders ? "true" : "false",
  );
  const [supplementalDispatchMode, setSupplementalDispatchMode] = useState(
    settings.supplementalDispatchMode,
  );

  const lateOrdersEnabled = acceptsLateOrders === "true";
  const showAutomaticFields = supplementalDispatchMode === "automatic";

  return (
    <form action={updateProviderLateOrderSettings} className="space-y-4">
      <input type="hidden" name="id" value={providerId} />

      <FormField label="Accept late orders" htmlFor="acceptsLateOrders">
        <select
          id="acceptsLateOrders"
          name="acceptsLateOrders"
          value={acceptsLateOrders}
          onChange={(event) => setAcceptsLateOrders(event.target.value)}
          className={selectClassName}
        >
          <option value="false">No</option>
          <option value="true">Yes</option>
        </select>
      </FormField>

      {lateOrdersEnabled ? (
        <div className="grid gap-4 border-t border-border/70 pt-4 lg:grid-cols-2 lg:gap-5">
          <div className="space-y-3">
            <FormField label="Late-order deadline day" htmlFor="lateOrderDeadlineDay">
              <select
                id="lateOrderDeadlineDay"
                name="lateOrderDeadlineDay"
                defaultValue={settings.lateOrderDeadlineDay ?? "delivery_day"}
                className={selectClassName}
              >
                <option value="order_day">Order day</option>
                <option value="delivery_day">Delivery day</option>
              </select>
            </FormField>

            <FormField label="Late-order deadline time (Jamaica)" htmlFor="lateOrderDeadlineTime">
              <input
                id="lateOrderDeadlineTime"
                name="lateOrderDeadlineTime"
                type="time"
                defaultValue={settings.lateOrderDeadlineTime?.slice(0, 5) ?? "10:30"}
                className={inputClassName}
              />
            </FormField>
          </div>

          <div className="space-y-3">
            <FormField label="Supplemental sending" htmlFor="supplementalDispatchMode">
              <select
                id="supplementalDispatchMode"
                name="supplementalDispatchMode"
                value={supplementalDispatchMode}
                onChange={(event) => setSupplementalDispatchMode(event.target.value)}
                className={selectClassName}
              >
                <option value="manual">Manual</option>
                <option value="automatic">Automatic</option>
              </select>
            </FormField>

            {showAutomaticFields ? (
              <>
                <FormField label="Automatic send day" htmlFor="automaticSupplementSendDay">
                  <select
                    id="automaticSupplementSendDay"
                    name="automaticSupplementSendDay"
                    defaultValue={settings.automaticSupplementSendDay ?? "delivery_day"}
                    className={selectClassName}
                  >
                    <option value="order_day">Order day</option>
                    <option value="delivery_day">Delivery day</option>
                  </select>
                </FormField>

                <FormField
                  label="Automatic send time (Jamaica)"
                  htmlFor="automaticSupplementSendTime"
                >
                  <input
                    id="automaticSupplementSendTime"
                    name="automaticSupplementSendTime"
                    type="time"
                    defaultValue={settings.automaticSupplementSendTime?.slice(0, 5) ?? "10:00"}
                    className={inputClassName}
                  />
                </FormField>
              </>
            ) : (
              <>
                <input
                  type="hidden"
                  name="automaticSupplementSendDay"
                  value={settings.automaticSupplementSendDay ?? "delivery_day"}
                />
                <input
                  type="hidden"
                  name="automaticSupplementSendTime"
                  value={settings.automaticSupplementSendTime?.slice(0, 5) ?? "10:00"}
                />
              </>
            )}

            <FormField label="Order email" htmlFor="primaryOrderEmail">
              <input
                id="primaryOrderEmail"
                name="primaryOrderEmail"
                type="email"
                defaultValue={settings.primaryOrderEmail ?? ""}
                className={inputClassName}
              />
            </FormField>
          </div>
        </div>
      ) : (
        <>
          <input type="hidden" name="supplementalDispatchMode" value={settings.supplementalDispatchMode} />
          <input
            type="hidden"
            name="automaticSupplementSendDay"
            value={settings.automaticSupplementSendDay ?? "delivery_day"}
          />
          <input
            type="hidden"
            name="automaticSupplementSendTime"
            value={settings.automaticSupplementSendTime?.slice(0, 5) ?? "10:00"}
          />
          <input type="hidden" name="primaryOrderEmail" value={settings.primaryOrderEmail ?? ""} />
        </>
      )}

      <div className="flex justify-end border-t border-border pt-4">
        <Button type="submit" variant="secondary">
          Save late-order settings
        </Button>
      </div>
    </form>
  );
}
