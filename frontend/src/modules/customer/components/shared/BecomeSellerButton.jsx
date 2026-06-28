import React from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Store } from "lucide-react";
import { cn } from "@/lib/utils";

const BecomeSellerButton = ({ className = "", fullWidth = false }) => {
  const navigate = useNavigate();

  return (
    <button
      type="button"
      onClick={() => navigate("/seller/auth")}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl font-bold text-white",
        "bg-gradient-to-r from-violet-600 via-fuchsia-600 to-orange-500",
        "shadow-md shadow-violet-500/30 hover:shadow-lg hover:shadow-violet-500/40 hover:brightness-105",
        "active:scale-[0.98] transition-all",
        fullWidth ? "w-full py-3 text-sm" : "px-5 py-2.5 text-sm",
        className,
      )}
    >
      <Store className="h-4 w-4 shrink-0" />
      Become a Seller
      <ArrowRight className="h-4 w-4 shrink-0 opacity-90" />
    </button>
  );
};

export default BecomeSellerButton;
