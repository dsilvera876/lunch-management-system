import { updateProviderLateOrderSettings } from "@/app/admin/providers/[id]/late-order-actions";
import { formatLateOrderTimeLabel } from "@/lib/late-orders";
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
  return (
    <form action={updateProviderLateOrderSettings} className="space-y-3">
      <input type="hidden" name="id" value={providerId} />

      <FormField label="Accept late orders" htmlFor="acceptsLateOrders">
        <select
          id="acceptsLateOrders"
          name="acceptsLateOrders"
          defaultValue={settings.acceptsLateOrders ? "true" : "false"}
          className={selectClassName}
        >
          <option value="false">No</option>
          <option value="true">Yes</option>
        </select>
      </FormField>

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

      <FormField label="Supplemental sending" htmlFor="supplementalDispatchMode">
        <select
          id="supplementalDispatchMode"
          name="supplementalDispatchMode"
          defaultValue={settings.supplementalDispatchMode}
          className={selectClassName}
        >
          <option value="manual">Manual</option>
          <option value="automatic">Automatic</option>
        </select>
      </FormField>

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

      <FormField label="Automatic send time (Jamaica)" htmlFor="automaticSupplementSendTime">
        <input
          id="automaticSupplementSendTime"
          name="automaticSupplementSendTime"
          type="time"
          defaultValue={settings.automaticSupplementSendTime?.slice(0, 5) ?? "10:00"}
          className={inputClassName}
        />
      </FormField>

      <FormField label="Order email" htmlFor="primaryOrderEmail">
        <input
          id="primaryOrderEmail"
          name="primaryOrderEmail"
          type="email"
          defaultValue={settings.primaryOrderEmail ?? ""}
          className={inputClassName}
        />
      </FormField>

      {settings.lateOrderDeadlineTime ? (
        <p className="text-xs text-muted">
          Current deadline time label: {formatLateOrderTimeLabel(settings.lateOrderDeadlineTime)}
        </p>
      ) : null}

      <Button type="submit" variant="secondary">
        Save late-order settings
      </Button>
    </form>
  );
}
