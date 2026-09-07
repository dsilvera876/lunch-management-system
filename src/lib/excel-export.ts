import ExcelJS from "exceljs";

import type {
  LunchPeriodFinancialSummary,
  StaffExportPayload,
} from "@/lib/financial-summaries";
import { formatMoney } from "@/lib/format";

const HEADER_FONT: Partial<ExcelJS.Font> = { bold: true };

function applyHeaderRow(sheet: ExcelJS.Worksheet, values: string[]) {
  const row = sheet.addRow(values);
  row.font = HEADER_FONT;
  row.commit();
}

function setCurrencyColumn(sheet: ExcelJS.Worksheet, columnIndex: number, rowStart: number) {
  for (let row = rowStart; row <= sheet.rowCount; row += 1) {
    sheet.getCell(row, columnIndex).numFmt = "#,##0.00";
  }
}

function autosizeColumns(sheet: ExcelJS.Worksheet) {
  sheet.columns.forEach((column) => {
    let maxLength = 10;

    if (column.eachCell) {
      column.eachCell({ includeEmpty: true }, (cell) => {
        const value = cell.value?.toString() ?? "";
        maxLength = Math.max(maxLength, value.length + 2);
      });
    }

    column.width = Math.min(maxLength, 40);
  });
}

export function buildStaffExportFilename(
  startDate: string,
  endDate: string,
): string {
  return `my-lunch-summary-${startDate}-to-${endDate}.xlsx`;
}

export function buildManagementExportFilename(
  startDate: string,
  endDate: string,
): string {
  return `lunch-period-${startDate}-to-${endDate}.xlsx`;
}

export async function buildStaffWorkbook(
  payload: StaffExportPayload,
): Promise<ExcelJS.Buffer> {
  const workbook = new ExcelJS.Workbook();
  const summarySheet = workbook.addWorksheet("Summary");
  const dailySheet = workbook.addWorksheet("Daily Summary");
  const ordersSheet = workbook.addWorksheet("Orders");

  applyHeaderRow(summarySheet, [
    "Employee",
    "Lunch period",
    "Start date",
    "End date",
    "Period status",
    "Daily lunch subsidy",
    "Qualifying order days",
    "Number of orders",
    "Gross spend",
    "Subsidy used",
    "Net deduction",
  ]);

  summarySheet.addRow([
    payload.employee.employee_name ?? payload.employee.employee_email ?? "Employee",
    payload.period.label,
    payload.period.start_date,
    payload.period.end_date,
    payload.period.status,
    Number(payload.daily_lunch_subsidy),
    payload.qualifying_order_days,
    payload.order_count,
    Number(payload.gross),
    Number(payload.subsidy_used),
    Number(payload.net_deduction),
  ]);

  for (const columnIndex of [6, 9, 10, 11]) {
    setCurrencyColumn(summarySheet, columnIndex, 2);
  }

  applyHeaderRow(dailySheet, [
    "Order date",
    "Gross",
    "Subsidy used",
    "Net deduction",
    "Orders",
  ]);

  for (const day of payload.daily_summary) {
    dailySheet.addRow([
      day.order_date,
      Number(day.gross),
      Number(day.subsidy_used),
      Number(day.net_deduction),
      day.order_count,
    ]);
  }

  for (const columnIndex of [2, 3, 4]) {
    setCurrencyColumn(dailySheet, columnIndex, 2);
  }

  applyHeaderRow(ordersSheet, [
    "Order date",
    "Delivery date",
    "Provider",
    "Order ID",
    "Status",
    "Total",
  ]);

  for (const order of payload.orders) {
    ordersSheet.addRow([
      order.order_date,
      order.delivery_date,
      order.provider_name ?? "",
      order.order_id,
      order.order_status,
      Number(order.order_total),
    ]);
  }

  setCurrencyColumn(ordersSheet, 6, 2);
  autosizeColumns(summarySheet);
  autosizeColumns(dailySheet);
  autosizeColumns(ordersSheet);

  return workbook.xlsx.writeBuffer();
}

export async function buildManagementWorkbook(
  payload: LunchPeriodFinancialSummary,
): Promise<ExcelJS.Buffer> {
  const workbook = new ExcelJS.Workbook();
  const periodSheet = workbook.addWorksheet("Period");
  const employeeSheet = workbook.addWorksheet("Employee Summary");
  const dailySheet = workbook.addWorksheet("Daily Summary");
  const ordersSheet = workbook.addWorksheet("Orders");

  applyHeaderRow(periodSheet, [
    "Period",
    "Start",
    "End",
    "Status",
    "Daily subsidy used for calculations",
    "Total gross",
    "Total subsidy used",
    "Total net deduction",
  ]);

  periodSheet.addRow([
    payload.period.label,
    payload.period.start_date,
    payload.period.end_date,
    payload.period.status,
    Number(payload.daily_lunch_subsidy),
    Number(payload.grand_gross),
    Number(payload.grand_subsidy_used),
    Number(payload.grand_net_deduction),
  ]);

  for (const columnIndex of [5, 6, 7, 8]) {
    setCurrencyColumn(periodSheet, columnIndex, 2);
  }

  applyHeaderRow(employeeSheet, [
    "Employee",
    "Email",
    "Order count",
    "Qualifying order days",
    "Gross",
    "Subsidy used",
    "Net deduction",
  ]);

  for (const employee of payload.employees) {
    employeeSheet.addRow([
      employee.employee_name ?? "",
      employee.employee_email ?? "",
      employee.order_count,
      employee.qualifying_order_days,
      Number(employee.gross),
      Number(employee.subsidy_used),
      Number(employee.net_deduction),
    ]);
  }

  for (const columnIndex of [5, 6, 7]) {
    setCurrencyColumn(employeeSheet, columnIndex, 2);
  }

  applyHeaderRow(dailySheet, [
    "Employee",
    "Order date",
    "Gross",
    "Subsidy used",
    "Net deduction",
    "Orders",
  ]);

  for (const day of payload.daily_summary) {
    dailySheet.addRow([
      day.employee_name ?? "",
      day.order_date,
      Number(day.gross),
      Number(day.subsidy_used),
      Number(day.net_deduction),
      day.order_count,
    ]);
  }

  for (const columnIndex of [3, 4, 5]) {
    setCurrencyColumn(dailySheet, columnIndex, 2);
  }

  applyHeaderRow(ordersSheet, [
    "Employee",
    "Order date",
    "Delivery date",
    "Provider",
    "Order ID",
    "Status",
    "Order total",
  ]);

  for (const order of payload.orders) {
    ordersSheet.addRow([
      order.employee_name ?? "",
      order.order_date,
      order.delivery_date,
      order.provider_name ?? "",
      order.order_id,
      order.order_status,
      Number(order.order_total),
    ]);
  }

  setCurrencyColumn(ordersSheet, 7, 2);
  autosizeColumns(periodSheet);
  autosizeColumns(employeeSheet);
  autosizeColumns(dailySheet);
  autosizeColumns(ordersSheet);

  return workbook.xlsx.writeBuffer();
}

export function formatWorkbookMoney(value: string | number): string {
  return formatMoney(value);
}

export async function readWorkbookSheetNames(
  buffer: ExcelJS.Buffer,
): Promise<string[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  return workbook.worksheets.map((sheet) => sheet.name);
}
