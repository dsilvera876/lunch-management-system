import { ProviderIconPicker } from "@/components/admin/lunch-providers/provider-icon-picker";
import {
  FormField,
  inputClassName,
  textareaClassName,
} from "@/components/ui/form-field";

type Props = {
  idPrefix: string;
  defaultName?: string;
  defaultDescription?: string;
  defaultIconKey?: unknown;
  layout?: "stack" | "edit";
  /** Description textarea row count (Edit defaults to 3; Add drawer uses 2). */
  descriptionRows?: number;
};

export function ProviderDetailsFields({
  idPrefix,
  defaultName = "",
  defaultDescription = "",
  defaultIconKey,
  layout = "stack",
  descriptionRows = 3,
}: Props) {
  const nameId = `${idPrefix}-name`;
  const descriptionId = `${idPrefix}-description`;
  const iconFieldId = `${idPrefix}-icon`;

  const nameField = (
    <FormField label="Provider name" htmlFor={nameId}>
      <input
        id={nameId}
        name="name"
        defaultValue={defaultName}
        required
        className={inputClassName}
      />
    </FormField>
  );

  const iconField = (
    <FormField label="Provider icon" htmlFor={iconFieldId}>
      <ProviderIconPicker defaultValue={defaultIconKey} />
    </FormField>
  );

  const descriptionField = (
    <FormField label="Description" htmlFor={descriptionId}>
      <textarea
        id={descriptionId}
        name="description"
        rows={descriptionRows}
        defaultValue={defaultDescription}
        className={textareaClassName}
      />
    </FormField>
  );

  if (layout === "edit") {
    return (
      <div className="grid gap-4">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-start">
          <div className="min-w-0">{nameField}</div>
          <div className="min-w-0">{iconField}</div>
        </div>
        {descriptionField}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {nameField}
      {iconField}
      {descriptionField}
    </div>
  );
}
