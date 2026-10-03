import { PROVIDER_ORDER_EMAIL_HELPER } from "@/lib/provider-order-email";
import { FormField, inputClassName } from "@/components/ui/form-field";

type Props = {
  idPrefix: string;
  defaultValue?: string | null;
  required?: boolean;
};

export function ProviderOrderEmailField({
  idPrefix,
  defaultValue = "",
  required = false,
}: Props) {
  const fieldId = `${idPrefix}-order-email`;

  return (
    <FormField
      label="Provider order email"
      htmlFor={fieldId}
      description={PROVIDER_ORDER_EMAIL_HELPER}
    >
      <input
        id={fieldId}
        name="primaryOrderEmail"
        type="email"
        autoComplete="off"
        defaultValue={defaultValue ?? ""}
        required={required}
        className={inputClassName}
      />
    </FormField>
  );
}
