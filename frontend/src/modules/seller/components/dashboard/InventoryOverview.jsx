import React from "react";
import { useNavigate } from "react-router-dom";
import {
  Boxes,
  PackageCheck,
  AlertTriangle,
  PackageX,
  CalendarClock,
  IndianRupee,
} from "lucide-react";
import Card from "@shared/components/ui/Card";
import { cn } from "@/lib/utils";
import { inr, IconChip, ViewAllLink } from "./common";

const Row = ({ icon, chip, label, value, valueClass }) => (
  <div className="flex items-center gap-3">
    <IconChip icon={icon} className={chip} />
    <span className="text-xs text-slate-600 flex-1 min-w-0 truncate">{label}</span>
    <span className={cn("text-sm font-bold", valueClass || "text-slate-900")}>{value}</span>
  </div>
);

const InventoryOverview = ({ inventory }) => {
  const navigate = useNavigate();
  if (!inventory) return null;

  return (
    <Card
      title="Inventory Overview"
      headerAction={<ViewAllLink onClick={() => navigate("/seller/inventory")} />}
      contentClassName="p-4"
    >
      <div className="space-y-3.5">
        <Row
          icon={Boxes}
          chip="bg-slate-100 text-slate-600"
          label="Total Products"
          value={inventory.totalProducts}
        />
        <Row
          icon={PackageCheck}
          chip="bg-emerald-50 text-emerald-600"
          label="In Stock"
          value={inventory.inStock}
          valueClass="text-emerald-600"
        />
        <Row
          icon={AlertTriangle}
          chip="bg-amber-50 text-amber-600"
          label="Low Stock"
          value={inventory.lowStock}
          valueClass={inventory.lowStock > 0 ? "text-amber-600" : "text-slate-900"}
        />
        <Row
          icon={PackageX}
          chip="bg-red-50 text-red-500"
          label="Out of Stock"
          value={inventory.outOfStock}
          valueClass={inventory.outOfStock > 0 ? "text-red-500" : "text-slate-900"}
        />
        <Row
          icon={CalendarClock}
          chip="bg-orange-50 text-orange-500"
          label="Expiring Soon"
          value={inventory.expiringSoon}
          valueClass={inventory.expiringSoon > 0 ? "text-orange-500" : "text-slate-900"}
        />
        <div className="pt-3 border-t border-slate-100">
          <Row
            icon={IndianRupee}
            chip="bg-sky-50 text-sky-600"
            label="Inventory Value"
            value={inr(inventory.inventoryValue)}
          />
        </div>
      </div>
    </Card>
  );
};

export default InventoryOverview;
