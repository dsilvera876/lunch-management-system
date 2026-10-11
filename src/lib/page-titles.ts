import type { Metadata } from "next";

export const APP_TITLE = "Lunch Management System";

/** Root layout title: child segments render as `Page Name | Lunch Management System`. */
export const ROOT_TITLE_METADATA = {
  template: `%s | ${APP_TITLE}`,
  default: APP_TITLE,
} as const;

/**
 * Browser titles per route. Keep them generic: titles appear in tabs, history and screen-reader
 * route announcements, so they must not include employee names, emails or other personal data.
 */
export const PAGE_TITLES = {
  login: "Sign in",
  signup: "Create account",
  forgotPassword: "Reset password",
  updatePassword: "Change password",
  inviteSetPassword: "Set your password",
  recoveryNewPassword: "Choose a new password",
  home: "Home",
  lunch: "Today's Order",
  lunchOrderDetail: "Order details",
  myOrders: "My Orders",
  mySpend: "My Spend",
  account: "Preferences",
  adminTodaysOrders: "Today's Orders",
  adminDeliveries: "Deliveries",
  adminDeliveriesPrint: "Delivery sheet",
  adminProviderDeliveryPrint: "Provider delivery sheet",
  adminProviderOrderPrint: "Provider order sheet",
  adminOrderHistory: "Order History",
  adminLateOrders: "Late Orders",
  adminFinancialReports: "Financial Reports",
  adminEmployeeIds: "Employee IDs",
  adminLocations: "Office Locations",
  adminLunchPeriods: "Lunch Periods",
  adminProviders: "Lunch Providers",
  adminProviderMenu: "Provider menu",
  adminProviderEdit: "Edit provider",
  adminProviderRatings: "Menu item ratings",
  adminUsers: "User Management",
  adminUserImport: "Bulk Import Users",
  adminSupport: "Support Mode",
  adminSettings: "Settings",
  adminSystemSettings: "Admin Settings",
  adminAuthentication: "Authentication",
  adminBusinessCalendar: "Business Calendar",
  adminEmailSettings: "Email Settings",
  adminEmailDelivery: "Email Delivery",
  adminEmailDeliveryHistory: "Delivery History",
  adminEmailDeliveryBatch: "Email delivery details",
  adminEmailProcessingRun: "Email processing details",
  adminEmailTemplates: "Email Templates",
  adminEmailTemplateEdit: "Edit Email Template",
  adminSystemEmail: "System email (SMTP)",
} as const;

export type PageTitleKey = keyof typeof PAGE_TITLES;

export function pageMetadata(key: PageTitleKey): Metadata {
  return { title: PAGE_TITLES[key] };
}
