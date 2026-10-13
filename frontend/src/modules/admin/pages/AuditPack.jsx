import React, { useMemo, useState } from "react";
import Card from "@shared/components/ui/Card";
import Badge from "@shared/components/ui/Badge";
import PageHeader from "@shared/components/ui/PageHeader";
import { HiOutlineArrowDownTray } from "react-icons/hi2";
import { adminApi } from "../services/adminApi";
import useExportBlob from "@shared/hooks/useExportBlob";

const PACKAGE_CONTENTS = [
  { name: "Orders / GMV report", format: "Excel" },
  { name: "Expense report + bills", format: "Excel, ZIP" },
  { name: "GST / TCS summary", format: "Excel" },
  { name: "Ledger / journal export", format: "CSV" },
  { name: "Audit reconciliation summary", format: "README.txt" },
];

// Builds the last 6 Indian financial years (Apr–Mar) as selectable options.
function buildFinancialYears() {
  const now = new Date();
  const currentFyStartYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const years = [];
  for (let i = 0; i < 6; i += 1) {
    const startYear = currentFyStartYear - i;
    years.push({
      label: `FY ${startYear}–${String(startYear + 1).slice(2)} (Apr ${startYear} – Mar ${startYear + 1})`,
      from: new Date(startYear, 3, 1).toISOString(),
      to: new Date(startYear + 1, 2, 31, 23, 59, 59, 999).toISOString(),
    });
  }
  return years;
}

// Generates the CA export bundle — every report this platform can actually
// produce, zipped with a manifest that honestly flags itself NOT READY when
// the Accountant Home reconciliation check (same logic, computed server
// side) isn't clean, instead of blocking generation outright.
const AuditPack = () => {
  const financialYears = useMemo(() => buildFinancialYears(), []);
  const [fyIndex, setFyIndex] = useState(0);
  const { exportBlob, isExporting } = useExportBlob();

  const handleGenerate = () => {
    const fy = financialYears[fyIndex];
    exportBlob(
      () => adminApi.generateAuditPack({ from: fy.from, to: fy.to }),
      `audit-pack_FY${fy.label.match(/\d{4}/)?.[0] || "export"}.zip`,
      "application/zip",
    );
  };

  return (
    <div className="space-y-6 pb-8">
      <PageHeader
        title="Audit Pack"
        description="Bundles every finance report this platform can generate into one ZIP for your CA."
        badge={<Badge variant="info">Accountant</Badge>}
      />

      <Card className="border-none shadow-sm p-5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[280px]">
            <label className="text-xs font-bold text-slate-500 block mb-1">Financial Year</label>
            <select
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary-500/30 w-full"
              value={fyIndex}
              onChange={(e) => setFyIndex(Number(e.target.value))}
            >
              {financialYears.map((fy, idx) => <option key={fy.label} value={idx}>{fy.label}</option>)}
            </select>
          </div>
          <button
            onClick={handleGenerate}
            disabled={isExporting}
            className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-xl text-sm font-medium disabled:opacity-50"
          >
            <HiOutlineArrowDownTray className="w-4 h-4" />
            {isExporting ? "Generating…" : "Generate Audit Pack"}
          </button>
        </div>
        <p className="text-xs text-slate-500 mt-3">
          The ZIP's README.txt carries the reconciliation summary — it's generated either way, but flagged NOT READY
          if the GMV/seller/revenue/refund or wallet-balance checks don't tie together for the selected period.
        </p>
      </Card>

      <Card className="border-none shadow-sm">
        <div className="p-4 border-b border-gray-100">
          <h3 className="font-semibold text-slate-800">Package contents</h3>
          <p className="text-xs text-slate-400 mt-0.5">Every one of these is bundled into every pack generated above.</p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-semibold text-slate-500 border-b border-gray-100">
              <th className="px-4 py-3">Report</th>
              <th className="px-4 py-3">Format</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {PACKAGE_CONTENTS.map((row) => (
              <tr key={row.name}>
                <td className="px-4 py-3">{row.name}</td>
                <td className="px-4 py-3 text-slate-500">{row.format}</td>
                <td className="px-4 py-3"><Badge variant="success">Included</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
};

export default AuditPack;
