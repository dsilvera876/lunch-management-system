import Link from "next/link";
import { formatHumanDate } from "@/lib/format";
import type { DeliveryPrintDocument, DeliveryPrintRow } from "@/lib/deliveries";
import { PrintDeliverySheetButton } from "@/components/admin/print-delivery-sheet-button";

type Props = {
  document: DeliveryPrintDocument;
  backHref: string;
};

function PrintOrderTable({
  rows,
  tableKey,
}: {
  rows: DeliveryPrintRow[];
  tableKey: string;
}) {
  return (
    <table className="mb-2 w-full border-collapse border border-gray-300">
      <thead>
        <tr className="bg-gray-100">
          <th className="w-8 border border-gray-300 px-1 py-0.5 text-left font-semibold">
            ✓
          </th>
          <th className="w-[18%] border border-gray-300 px-1 py-0.5 text-left font-semibold">
            Name
          </th>
          <th className="border border-gray-300 px-1 py-0.5 text-left font-semibold">
            Order
          </th>
          <th className="w-12 border border-gray-300 px-1 py-0.5 text-left font-semibold">
            Qty
          </th>
          <th className="w-[22%] border border-gray-300 px-1 py-0.5 text-left font-semibold">
            Notes
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => {
          const rowCount = Math.max(row.orderLines.length, 1);

          return Array.from({ length: rowCount }).map((_, lineIndex) => (
            <tr key={`${tableKey}-${row.employeeName}-${index}-${lineIndex}`}>
              {lineIndex === 0 ? (
                <>
                  <td
                    rowSpan={rowCount}
                    className="border border-gray-300 px-1 py-0.5 align-top"
                  >
                    <span className="delivery-print-box" aria-hidden="true" />
                  </td>
                  <td
                    rowSpan={rowCount}
                    className="border border-gray-300 px-1 py-0.5 align-top font-medium"
                  >
                    {row.employeeName}
                  </td>
                </>
              ) : null}
              <td className="border border-gray-300 px-1 py-0.5 align-top">
                {row.orderLines[lineIndex] ?? ""}
              </td>
              <td className="border border-gray-300 px-1 py-0.5 align-top text-right">
                {row.quantityLines[lineIndex] ?? ""}
              </td>
              {lineIndex === 0 ? (
                <td
                  rowSpan={rowCount}
                  className="border border-gray-300 px-1 py-0.5 align-top"
                >
                  {row.notesHint ? (
                    <span className="block text-[9px] text-gray-700">{row.notesHint}</span>
                  ) : null}
                  <span className="mt-1 block min-h-[0.9rem] border-b border-gray-400" />
                </td>
              ) : null}
            </tr>
          ));
        })}
      </tbody>
    </table>
  );
}

export function DeliveryPrintSheet({ document, backHref }: Props) {
  const generatedAt = new Intl.DateTimeFormat("en-JM", {
    timeZone: "America/Jamaica",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date());

  const showProviderSubheadings = document.providerName === null;

  return (
    <div className="delivery-print mx-auto max-w-[11in] bg-white p-3 text-[10px] leading-tight text-black print:p-0">
      <style>{`
        @page {
          size: landscape;
          margin: 0.35in;
        }

        @media print {
          .delivery-print table {
            page-break-inside: auto;
          }

          .delivery-print tr {
            page-break-inside: avoid;
            page-break-after: auto;
          }

          .delivery-print thead {
            display: table-header-group;
          }

          .delivery-print .office-heading {
            break-after: avoid-page;
          }

          .delivery-print .provider-heading {
            break-after: avoid-page;
          }
        }

        .delivery-print-box {
          display: inline-block;
          width: 0.75rem;
          height: 0.75rem;
          border: 1px solid #444;
          vertical-align: middle;
        }
      `}</style>

      <div className="mb-3 flex items-center justify-between gap-3 border-b border-gray-300 pb-2 print:hidden">
        <Link href={backHref} className="text-sm font-medium text-primary hover:underline">
          ← Back to Deliveries
        </Link>
        <PrintDeliverySheetButton />
      </div>

      <header className="mb-3 border-b border-gray-300 pb-2">
        <h1 className="text-base font-bold">
          {document.providerName ?? "All providers"}
        </h1>
        <p className="text-[11px] text-gray-700">
          Delivery: {formatHumanDate(document.deliveryDate)}
        </p>
        <p className="text-[10px] text-gray-500">Generated {generatedAt}</p>
      </header>

      {document.offices.length === 0 ? (
        <p className="text-sm text-gray-600">No qualifying orders for this delivery date.</p>
      ) : (
        document.offices.map((office) => (
          <section key={office.name} className="mb-4 office-heading">
            <h2 className="mb-1 text-[12px] font-semibold uppercase tracking-wide">
              {office.name}
            </h2>

            {office.providers.map((provider) => (
              <div key={`${office.name}-${provider.name}`} className="provider-heading">
                {showProviderSubheadings && (
                  <h3 className="mb-0.5 text-[11px] font-semibold">{provider.name}</h3>
                )}
                <PrintOrderTable
                  rows={provider.rows}
                  tableKey={`${office.name}-${provider.name}`}
                />
              </div>
            ))}
          </section>
        ))
      )}
    </div>
  );
}
