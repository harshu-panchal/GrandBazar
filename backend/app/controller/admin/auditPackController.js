import archiver from "archiver";
import { getAccountantOverview, getOrdersGmv } from "../../services/finance/accountantService.js";
import { getExpensesForExport } from "../../services/finance/expenseService.js";
import { getGstTcsSummary } from "../../services/finance/gstTcsService.js";
import { exportFinanceStatement } from "../../services/finance/statementService.js";
import { buildExcelBuffer } from "../../utils/excelExport.js";
import handleResponse from "../../utils/helper.js";

const ORDERS_GMV_COLUMNS = [
  { header: "Order ID", key: "orderId", width: 16 },
  { header: "Date", key: "date", width: 14 },
  { header: "Seller", key: "seller", width: 20 },
  { header: "Customer", key: "customer", width: 20 },
  { header: "Product", key: "product", width: 28 },
  { header: "Taxable", key: "taxable", width: 12 },
  { header: "GST", key: "gst", width: 10 },
  { header: "Delivery", key: "delivery", width: 10 },
  { header: "Weather", key: "weather", width: 10 },
  { header: "Packing", key: "packing", width: 10 },
  { header: "Gross", key: "gross", width: 12 },
  { header: "Refund", key: "refund", width: 10 },
  { header: "Net", key: "net", width: 12 },
];

const EXPENSE_COLUMNS = [
  { header: "Date", key: "date", width: 14 },
  { header: "Category", key: "category", width: 18 },
  { header: "Vendor", key: "vendor", width: 22 },
  { header: "Amount", key: "amount", width: 14 },
  { header: "GST", key: "gstAmount", width: 12 },
  { header: "Notes", key: "notes", width: 30 },
  { header: "Bill", key: "billStatus", width: 14 },
];

const SUMMARY_COLUMNS = [
  { header: "Metric", key: "metric", width: 40 },
  { header: "Value", key: "value", width: 20 },
];

function buildManifest({ month, from, to, overview, reportStatuses }) {
  const { reconciliation } = overview;
  const isClean = reconciliation.isGmvDecompositionClean && reconciliation.isWalletReconciled;
  const periodLabel = from || to
    ? ` — ${from ? new Date(from).toLocaleDateString("en-IN") : "start"} to ${to ? new Date(to).toLocaleDateString("en-IN") : "now"}`
    : month
      ? ` — ${month}`
      : "";
  const lines = [
    `GrandBazar Audit Pack${periodLabel}`,
    `Generated: ${new Date().toISOString()}`,
    "",
    `Reconciliation summary: ${isClean ? "READY FOR CA REVIEW" : "NOT READY — differences found"}`,
  ];
  if (!reconciliation.isGmvDecompositionClean) {
    lines.push(`  - GMV vs. Seller payable + Revenue + Refunds off by ₹${Math.abs(reconciliation.decompositionDiff).toLocaleString("en-IN")}`);
  }
  if (!reconciliation.isWalletReconciled) {
    lines.push(`  - Wallet balance vs. Gateway collected − Payouts off by ₹${Math.abs(reconciliation.walletDiff).toLocaleString("en-IN")}`);
  }
  for (const mismatch of reconciliation.mismatches) {
    lines.push(`  - ${mismatch.label}: ₹${mismatch.amount.toLocaleString("en-IN")}`);
  }
  lines.push("", "Package contents:");
  for (const report of reportStatuses) {
    lines.push(`  - ${report.name}: ${report.status}`);
  }
  lines.push(
    "",
    "Note: GST/TCS figures are estimated from platform data and are not a confirmed filing position — confirm the formula and rate with your CA before filing. There is no payment-gateway settlement report reconciliation in this pack (no settlement-report ingestion exists in this codebase yet).",
  );
  return lines.join("\n");
}

// Bundles every report this platform can actually generate into one ZIP,
// per the reference mock's "Audit Pack" — but, matching the mock's own
// behavior, it does NOT block generation on a clean reconciliation; it
// generates anyway and flags itself NOT READY in the manifest when the
// Accountant Home check (same logic, see accountantService.js) isn't clean.
export const generateAuditPackController = async (req, res) => {
  try {
    const { month } = req.query;
    let { from, to } = req.query;
    if (month && !from && !to) {
      const [year, mon] = String(month).split("-").map(Number);
      if (year && mon) {
        from = new Date(year, mon - 1, 1).toISOString();
        to = new Date(year, mon, 0, 23, 59, 59, 999).toISOString();
      }
    }

    const [overview, ordersGmv, expenses, gstTcs, ledgerStatement] = await Promise.all([
      getAccountantOverview({ from, to }),
      getOrdersGmv({ from, to, page: 1, limit: 10000 }),
      getExpensesForExport({ from, to }),
      getGstTcsSummary({ month: from || to ? null : month, from, to }),
      exportFinanceStatement({ fromDate: from, toDate: to }),
    ]);

    const reportStatuses = [
      { name: "Orders / GMV report", status: "Included" },
      { name: "Expense report + bills", status: "Included" },
      { name: "GST / TCS summary", status: "Included" },
      { name: "Ledger / journal export", status: "Included" },
      {
        name: "Audit reconciliation summary",
        status:
          overview.reconciliation.isGmvDecompositionClean && overview.reconciliation.isWalletReconciled
            ? "READY"
            : "NOT READY — see manifest",
      },
    ];

    res.setHeader("Content-Type", "application/zip");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="audit-pack${month ? `_${month}` : ""}.zip"`,
    );

    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.on("error", (err) => {
      throw err;
    });
    archive.pipe(res);

    archive.append(buildManifest({ month, from, to, overview, reportStatuses }), { name: "README.txt" });

    const ordersGmvRows = ordersGmv.items.map((row) => ({
      ...row,
      date: row.date ? new Date(row.date).toLocaleDateString("en-IN") : "",
    }));
    archive.append(
      await buildExcelBuffer({ sheetName: "Orders-GMV", columns: ORDERS_GMV_COLUMNS, rows: ordersGmvRows }),
      { name: "orders-gmv.xlsx" },
    );

    const expenseRows = expenses.map((e) => ({
      date: e.date ? new Date(e.date).toLocaleDateString("en-IN") : "",
      category: e.category,
      vendor: e.vendor || "",
      amount: e.amount,
      gstAmount: e.gstAmount,
      notes: e.notes || "",
      billStatus: e.billUrl ? "Attached" : "Missing",
    }));
    archive.append(
      await buildExcelBuffer({ sheetName: "Expenses", columns: EXPENSE_COLUMNS, rows: expenseRows }),
      { name: "expenses/report.xlsx" },
    );
    for (const expense of expenses) {
      if (!expense.billUrl) continue;
      try {
        const response = await fetch(expense.billUrl);
        if (!response.ok) continue;
        const arrayBuffer = await response.arrayBuffer();
        const ext = expense.billUrl.split(".").pop().split("?")[0] || "pdf";
        const dateLabel = expense.date ? new Date(expense.date).toISOString().slice(0, 10) : "bill";
        archive.append(Buffer.from(arrayBuffer), {
          name: `expenses/bills/${dateLabel}_${expense.vendor || expense._id}.${ext}`,
        });
      } catch {
        // Skip bills that fail to fetch rather than aborting the whole pack.
      }
    }

    const gstTcsRows = [
      { metric: "Output GST on Commission", value: gstTcs.gst.outputGstCommission },
      { metric: "Output GST on Subscription", value: gstTcs.gst.outputGstSubscription },
      { metric: "Net GST Payable (estimated)", value: gstTcs.gst.netGstPayable },
      { metric: "GMV subject to TCS", value: gstTcs.tcs.gmv },
      { metric: `TCS Liability (at ${gstTcs.tcs.tcsRatePercent}%)`, value: gstTcs.tcs.tcsLiability },
    ];
    archive.append(
      await buildExcelBuffer({ sheetName: "GST-TCS", columns: SUMMARY_COLUMNS, rows: gstTcsRows }),
      { name: "gst-tcs-summary.xlsx" },
    );

    archive.append(ledgerStatement.csv, { name: "ledger-statement.csv" });

    await archive.finalize();
  } catch (error) {
    if (!res.headersSent) {
      return handleResponse(res, 500, error.message);
    }
    res.end();
  }
};
