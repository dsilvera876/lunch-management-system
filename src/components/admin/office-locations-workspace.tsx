"use client";

import { useMemo, useState } from "react";
import { IconMapPin, IconPencil } from "@/components/icons/line-icons";
import { TealIconWell } from "@/components/my-spend/teal-icon-well";
import { OfficeLocationsEditorPanel } from "@/components/admin/office-locations-editor-panel";
import {
  mergeOfficeLocation,
  removeOfficeLocation,
  type OfficeLocationRecord,
} from "@/lib/office-locations-presentation";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { linkButtonClass } from "@/components/ui/button";
import { ToastProvider } from "@/components/ui/toast";

type Props = {
  initialLocations: OfficeLocationRecord[];
};

const compactEditButtonClass =
  "!min-h-0 h-8 shrink-0 whitespace-nowrap px-2.5 py-0 text-xs leading-none";

function OfficeLocationsWorkspaceContent({ initialLocations }: Props) {
  const [locations, setLocations] = useState(initialLocations);
  const [editingLocationId, setEditingLocationId] = useState<string | null>(null);

  const editingLocation = useMemo(
    () =>
      editingLocationId === null
        ? null
        : (locations.find((location) => location.id === editingLocationId) ?? null),
    [editingLocationId, locations],
  );

  function handleLocationSaved(location: OfficeLocationRecord) {
    setLocations((current) => mergeOfficeLocation(current, location));
  }

  function handleLocationDeleted(locationId: string) {
    setLocations((current) => removeOfficeLocation(current, locationId));
    if (editingLocationId === locationId) {
      setEditingLocationId(null);
    }
  }

  function selectLocationForEdit(location: OfficeLocationRecord) {
    setEditingLocationId(location.id);
  }

  function cancelEditing() {
    setEditingLocationId(null);
  }

  return (
    <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start lg:gap-6">
      <div className="order-2 min-w-0 lg:order-1">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
          Locations
        </h2>
        {locations.length === 0 ? (
          <EmptyState
            title="No office locations yet"
            description="Add a delivery location for staff lunch orders."
          />
        ) : (
          <ul className="space-y-2">
            {locations.map((location) => {
              const isSelected = editingLocationId === location.id;
              return (
                <li key={location.id}>
                  <div
                    className={`flex flex-col gap-3 rounded-xl border bg-surface px-3 py-3 shadow-sm sm:flex-row sm:items-start sm:justify-between ${
                      isSelected
                        ? "border-primary/25 bg-primary/[0.06] ring-1 ring-primary/15"
                        : "border-border"
                    }`}
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <TealIconWell size="sm" className="mt-0.5 shrink-0 rounded-lg">
                        <IconMapPin aria-hidden />
                      </TealIconWell>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-sm font-semibold text-foreground">
                            {location.name}
                          </h3>
                          <StatusBadge
                            status={location.is_active ? "active" : "inactive"}
                          />
                        </div>
                        {location.address ? (
                          <p className="mt-0.5 text-sm text-muted">{location.address}</p>
                        ) : null}
                        {location.description ? (
                          <p className="mt-1 line-clamp-2 text-sm text-muted">
                            {location.description}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => selectLocationForEdit(location)}
                      aria-pressed={isSelected}
                      className={`${linkButtonClass("secondary")} ${compactEditButtonClass} inline-flex items-center justify-center gap-1 self-start`}
                    >
                      <IconPencil size={13} aria-hidden />
                      Edit
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <aside className="order-1 lg:order-2 lg:sticky lg:top-4 lg:self-start">
        <OfficeLocationsEditorPanel
          key={editingLocationId ?? "add"}
          editingLocation={editingLocation}
          onCancelEdit={cancelEditing}
          onLocationCreated={handleLocationSaved}
          onLocationUpdated={handleLocationSaved}
          onLocationDeleted={handleLocationDeleted}
        />
      </aside>
    </div>
  );
}

export function OfficeLocationsWorkspace(props: Props) {
  return (
    <ToastProvider>
      <OfficeLocationsWorkspaceContent {...props} />
    </ToastProvider>
  );
}
