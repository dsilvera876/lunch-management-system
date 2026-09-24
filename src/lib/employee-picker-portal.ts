export const EMPLOYEE_PICKER_DROPDOWN_GAP_PX = 6;

export const EMPLOYEE_PICKER_VIEWPORT_MARGIN_PX = 8;

/** Matches Tailwind max-h-64 on the result list. */
export const EMPLOYEE_PICKER_LIST_MAX_HEIGHT_PX = 256;

/** Search input row + padding (approximate). */
export const EMPLOYEE_PICKER_SEARCH_HEADER_HEIGHT_PX = 56;

export const EMPLOYEE_PICKER_MIN_LIST_HEIGHT_PX = 96;

export function employeePickerDesiredPanelHeightPx(): number {
  return (
    EMPLOYEE_PICKER_SEARCH_HEADER_HEIGHT_PX + EMPLOYEE_PICKER_LIST_MAX_HEIGHT_PX
  );
}

export type EmployeePickerDropdownPlacement = "below" | "above";

export type EmployeePickerDropdownPosition = {
  top: number;
  left: number;
  width: number;
  listMaxHeight: number;
  placement: EmployeePickerDropdownPlacement;
};

type Viewport = {
  width: number;
  height: number;
};

export function computeEmployeePickerDropdownPosition(
  trigger: DOMRect,
  viewport: Viewport,
): EmployeePickerDropdownPosition {
  const width = trigger.width;
  const left = Math.max(
    EMPLOYEE_PICKER_VIEWPORT_MARGIN_PX,
    Math.min(trigger.left, viewport.width - width - EMPLOYEE_PICKER_VIEWPORT_MARGIN_PX),
  );

  const spaceBelow =
    viewport.height -
    trigger.bottom -
    EMPLOYEE_PICKER_DROPDOWN_GAP_PX -
    EMPLOYEE_PICKER_VIEWPORT_MARGIN_PX;
  const spaceAbove =
    trigger.top - EMPLOYEE_PICKER_DROPDOWN_GAP_PX - EMPLOYEE_PICKER_VIEWPORT_MARGIN_PX;

  const desiredPanelHeight = employeePickerDesiredPanelHeightPx();
  const minUsablePanelHeight =
    EMPLOYEE_PICKER_SEARCH_HEADER_HEIGHT_PX + EMPLOYEE_PICKER_MIN_LIST_HEIGHT_PX;

  const hasSufficientRoomBelow = spaceBelow >= desiredPanelHeight;

  if (hasSufficientRoomBelow) {
    return {
      top: trigger.bottom + EMPLOYEE_PICKER_DROPDOWN_GAP_PX,
      left,
      width,
      listMaxHeight: EMPLOYEE_PICKER_LIST_MAX_HEIGHT_PX,
      placement: "below",
    };
  }

  const preferAbove =
    spaceAbove > spaceBelow && spaceAbove >= minUsablePanelHeight;

  if (preferAbove) {
    const listMaxHeight = Math.min(
      EMPLOYEE_PICKER_LIST_MAX_HEIGHT_PX,
      Math.max(
        EMPLOYEE_PICKER_MIN_LIST_HEIGHT_PX,
        spaceAbove - EMPLOYEE_PICKER_SEARCH_HEADER_HEIGHT_PX,
      ),
    );
    const panelHeight = EMPLOYEE_PICKER_SEARCH_HEADER_HEIGHT_PX + listMaxHeight;

    return {
      top: Math.max(
        EMPLOYEE_PICKER_VIEWPORT_MARGIN_PX,
        trigger.top - EMPLOYEE_PICKER_DROPDOWN_GAP_PX - panelHeight,
      ),
      left,
      width,
      listMaxHeight,
      placement: "above",
    };
  }

  const listMaxHeight = Math.min(
    EMPLOYEE_PICKER_LIST_MAX_HEIGHT_PX,
    Math.max(
      EMPLOYEE_PICKER_MIN_LIST_HEIGHT_PX,
      spaceBelow - EMPLOYEE_PICKER_SEARCH_HEADER_HEIGHT_PX,
    ),
  );

  return {
    top: trigger.bottom + EMPLOYEE_PICKER_DROPDOWN_GAP_PX,
    left,
    width,
    listMaxHeight,
    placement: "below",
  };
}
