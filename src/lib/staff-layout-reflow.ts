/**
 * Phase C2 — staff layout/reflow class hooks (see staff-accessibility.css).
 * Named constants keep wiring tests stable and document intent.
 */

/** Edit-order submit bar: sticky on large viewports only when enough height/width. */
export const STAFF_EDIT_SUBMIT_BAR_CLASS = "staff-edit-submit-bar";

/** Lunch cart panel: lg sticky + max-height disabled when viewport is short. */
export const STAFF_CART_STICKY_PANEL_CLASS = "staff-cart-sticky-panel";

/** Menu item row stacks price/add below name below this width (matches Tailwind sm). */
export const MENU_ITEM_ROW_NARROW_MEDIA = "(max-width: 639px)";
