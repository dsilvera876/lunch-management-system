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
  const ordersSheet = workbook.addWorksheet("Orders");

  applyHeaderRow(summarySheet, [
    "Employee",
    "Lunch period",
    "Start date",
    "End date",
    "Period status",
    "Number of orders",
    "Total",
  ]);

  summarySheet.addRow([
    payload.employee.employee_name ?? payload.employee.employee_email ?? "Employee",
    payload.period.label,
    payload.period.start_date,
    payload.period.end_date,
    payload.period.status,
    payload.order_count,
    Number(payload.period_total),
  ]);

  setCurrencyColumn(summarySheet, 7, 2);

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
  autosizeColumns(ordersSheet);

  return workbook.xlsx.writeBuffer();
}

export async function buildManagementWorkbook(
  payload: LunchPeriodFinancialSummary,
): Promise<ExcelJS.Buffer> {
  const workbook = new ExcelJS.Workbook();
  const employeeSheet = workbook.addWorksheet("Employee Summary");
  const ordersSheet = workbook.addWorksheet("Orders");
  const periodSheet = workbook.addWorksheet("Period");

  applyHeaderRow(employeeSheet, [
    "Employee",
    "Email",
    "Order count",
    "Period total",
  ]);

  for (const employee of payload.employees) {
    employeeSheet.addRow([
      employee.employee_name ?? "",
      employee.employee_email ?? "",
      employee.order_count,
      Number(employee.period_total),
    ]);
  }

  setCurrencyColumn(employeeSheet, 4, 2);

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

  applyHeaderRow(periodSheet, [
    "Label",
    "Start",
    "End",
    "Status",
    "Overall total",
  ]);

  periodSheet.addRow([
    payload.period.label,
    payload.period.start_date,
    payload.period.end_date,
    payload.period.status,
    Number(payload.grand_total),
  ]);

  setCurrencyColumn(periodSheet, 5, 2);
  autosizeColumns(employeeSheet);
  autosizeColumns(ordersSheet);
  autosizeColumns(periodSheet);

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
