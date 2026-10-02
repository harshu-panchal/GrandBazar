import React, { useMemo } from "react";
import { Info } from "lucide-react";

/**
 * CheckoutProductDisclaimers
 *
 * Lists the admin-authored disclaimer of every cart product that has one.
 * Renders nothing when no product in the cart carries a disclaimer.
 *
 * Props:
 *   cart – array of cart items (each may carry `productDisclaimer`)
 */
const CheckoutProductDisclaimers = React.memo(function CheckoutProductDisclaimers({ cart }) {
  const disclaimers = useMemo(() => {
    const seen = new Set();
    const rows = [];
    for (const item of cart || []) {
      const text = String(item?.productDisclaimer || "").trim();
      const id = String(item?.id || item?._id || "");
      // One entry per product — the same product in several variants shouldn't repeat.
      if (!text || seen.has(id)) continue;
      seen.add(id);
      rows.push({ id, name: item.name, text });
    }
    return rows;
  }, [cart]);

  if (disclaimers.length === 0) return null;

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 space-y-3">
      <div className="flex items-center gap-2 text-amber-800">
        <Info size={16} className="shrink-0" />
        <p className="text-xs font-black uppercase tracking-wider">Product disclaimers</p>
      </div>
      <ul className="space-y-3">
        {disclaimers.map((row) => (
          <li key={row.id}>
            <p className="text-sm font-bold text-slate-800">{row.name}</p>
            <p className="mt-0.5 text-xs leading-snug text-slate-600 whitespace-pre-line">{row.text}</p>
          </li>
        ))}
      </ul>
    </div>
  );
});

export default CheckoutProductDisclaimers;
