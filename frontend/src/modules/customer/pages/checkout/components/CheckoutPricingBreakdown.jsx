import React, { useState } from "react";
import { Clipboard, Tag, Heart, Wallet, ChevronDown, ChevronUp } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

/** Consistent currency display: always 2 decimal places, no floating point drift */
const fmt = (amount) => {
  const n = Number(amount || 0);
  if (!Number.isFinite(n)) return "0.00";
  return n.toFixed(2);
};

/** Collapsible row for ancillary fees, surcharges and taxes to keep the bill compact */
function TaxesAndChargesDropdown({
  handlingFee,
  packingFee,
  packagingChargeAmount,
  customerSurchargeAmount,
  customerSurchargeReason,
  oddHourSurchargeAmount,
  weatherSurchargeAmount,
  taxAmount,
  cgstAmount,
  sgstAmount,
  igstAmount,
  isInterState,
}) {
  const [open, setOpen] = useState(false);

  const totalTaxes = isInterState
    ? Number(igstAmount || 0)
    : Number(cgstAmount || 0) + Number(sgstAmount || 0) > 0
    ? Number(cgstAmount || 0) + Number(sgstAmount || 0)
    : Number(taxAmount || 0);

  const handling = Number(handlingFee || 0);
  const packing = Number(packingFee || 0);
  const packaging = Number(packagingChargeAmount || 0);
  const extra = Number(customerSurchargeAmount || 0);
  const oddHour = Number(oddHourSurchargeAmount || 0);
  const weather = Number(weatherSurchargeAmount || 0);

  const grandTotal =
    handling + packing + packaging + extra + oddHour + weather + totalTaxes;

  if (grandTotal <= 0) return null;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="w-full flex justify-between items-center px-2 py-1 rounded-xl hover:bg-slate-50 transition-colors focus:outline-none cursor-pointer group select-none"
      >
        <span className="text-slate-500 font-bold text-[13px] uppercase tracking-wider flex items-center gap-1.5 group-hover:text-slate-700 transition-colors">
          Taxes & Other Charges
          {open ? (
            <ChevronUp size={14} className="text-slate-400 group-hover:text-slate-600 transition-transform" />
          ) : (
            <ChevronDown size={14} className="text-slate-400 group-hover:text-slate-600 transition-transform" />
          )}
        </span>
        <span className="font-black text-slate-800">₹{fmt(grandTotal)}</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="bg-slate-50/90 rounded-2xl p-3.5 mt-2 space-y-2 border border-slate-100 text-xs shadow-inner">
              {handling > 0 && (
                <div className="flex justify-between items-center text-slate-600">
                  <span className="font-medium">Handling Fee</span>
                  <span className="font-bold text-slate-800">₹{fmt(handling)}</span>
                </div>
              )}
              {packing > 0 && (
                <div className="flex justify-between items-center text-slate-600">
                  <span className="font-medium">Packing Charge</span>
                  <span className="font-bold text-slate-800">₹{fmt(packing)}</span>
                </div>
              )}
              {packaging > 0 && (
                <div className="flex justify-between items-center text-slate-600">
                  <span className="font-medium">Packaging Charge</span>
                  <span className="font-bold text-slate-800">₹{fmt(packaging)}</span>
                </div>
              )}
              {extra > 0 && (
                <div className="flex justify-between items-center text-slate-600">
                  <div className="flex flex-col">
                    <span className="font-medium">Extra Charge</span>
                    <span className="text-[10px] text-slate-400 font-medium">
                      {customerSurchargeReason || "Platform fee"}
                    </span>
                  </div>
                  <span className="font-bold text-slate-800">₹{fmt(extra)}</span>
                </div>
              )}
              {weather > 0 && (
                <div className="flex justify-between items-center text-slate-600">
                  <span className="font-medium">Weather Surcharge</span>
                  <span className="font-bold text-slate-800">₹{fmt(weather)}</span>
                </div>
              )}
              {oddHour > 0 && (
                <div className="flex justify-between items-center text-slate-600">
                  <span className="font-medium">Odd-Hour Delivery Charge</span>
                  <span className="font-bold text-slate-800">₹{fmt(oddHour)}</span>
                </div>
              )}
              {isInterState ? (
                <div className="flex justify-between items-center text-slate-600 pt-1 border-t border-slate-200/60">
                  <span className="font-semibold">IGST</span>
                  <span className="font-bold text-slate-800">₹{fmt(igstAmount)}</span>
                </div>
              ) : cgstAmount > 0 || sgstAmount > 0 ? (
                <div className="space-y-1 pt-1.5 border-t border-slate-200/60">
                  <div className="flex justify-between items-center text-slate-600">
                    <span className="font-semibold">GST</span>
                    <span className="font-bold text-slate-800">
                      ₹{fmt(Number(cgstAmount) + Number(sgstAmount))}
                    </span>
                  </div>
                  <div className="flex justify-between items-center pl-2 text-[11px] text-slate-400">
                    <span>CGST</span>
                    <span>₹{fmt(cgstAmount)}</span>
                  </div>
                  <div className="flex justify-between items-center pl-2 text-[11px] text-slate-400">
                    <span>SGST</span>
                    <span>₹{fmt(sgstAmount)}</span>
                  </div>
                </div>
              ) : totalTaxes > 0 ? (
                <div className="flex justify-between items-center text-slate-600 pt-1 border-t border-slate-200/60">
                  <span className="font-semibold">Tax</span>
                  <span className="font-bold text-slate-800">₹{fmt(totalTaxes)}</span>
                </div>
              ) : null}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * CheckoutPricingBreakdown
 *
 * Props:
 *   pricingPreview    – breakdown object from the preview API (or null)
 *   isPreviewLoading  – boolean
 *   selectedTip       – number
 *   onSelectTip       – (value) => void
 *   tipAmounts        – array of { value, label }
 *   walletAmountToUse – number
 *   finalAmountToPay  – number
 *   cartTotal         – number (fallback when preview is loading)
 *   selectedCoupon    – coupon object or null
 *   discountAmount    – number
 */
const CheckoutPricingBreakdown = React.memo(function CheckoutPricingBreakdown({
  pricingPreview,
  isPreviewLoading,
  selectedTip,
  onSelectTip,
  tipAmounts,
  walletAmountToUse,
  finalAmountToPay,
  cartTotal,
  selectedCoupon,
  discountAmount,
}) {
  const deliveryFee = pricingPreview?.deliveryFeeCharged || 0;
  const handlingFee = pricingPreview?.handlingFeeCharged || 0;
  const packingFee = pricingPreview?.packingFeeCharged || 0;
  const tipAmount = pricingPreview?.tipTotal || selectedTip || 0;
  const taxAmount = pricingPreview?.taxTotal || 0;
  const cgstAmount = pricingPreview?.cgstTotal || 0;
  const sgstAmount = pricingPreview?.sgstTotal || 0;
  const igstAmount = pricingPreview?.igstTotal || 0;
  const isInterState = pricingPreview?.taxJurisdiction === "inter_state";
  const oddHourSurchargeAmount = pricingPreview?.oddHourSurchargeAmount || 0;
  const weatherSurchargeAmount = pricingPreview?.weatherSurchargeAmount || 0;

  return (
    <>


      {/* Bill Details */}
      <motion.div className="bg-white rounded-[2rem] p-6 shadow-xl shadow-gray-200/50 border border-slate-100">
        <div className="flex items-center gap-2 mb-6">
          <div className="h-10 w-10 rounded-2xl bg-brand-50 flex items-center justify-center">
            <Clipboard size={20} className="text-primary" />
          </div>
          <h3 className="font-[1000] text-slate-800 text-xl tracking-tight uppercase">
            Order Summary
          </h3>
        </div>

        <div className="space-y-4">
          <div className="flex justify-between items-center px-2">
            <span className="text-slate-500 font-bold text-[13px] uppercase tracking-wider">
              Item Total
            </span>
            <span className="font-black text-slate-800">
              ₹{fmt(pricingPreview?.productSubtotal ?? cartTotal)}
            </span>
          </div>
          <div className="flex justify-between items-center px-2">
            <span className="text-slate-500 font-bold text-[13px] uppercase tracking-wider">
              Delivery Fee
            </span>
            <span className="font-black text-slate-800">₹{fmt(deliveryFee)}</span>
          </div>
          {pricingPreview &&
            typeof pricingPreview.distanceKmActual === "number" &&
            typeof pricingPreview.distanceKmRounded === "number" && (
              <div className="px-2 -mt-3 flex items-center justify-between text-[11px] font-semibold text-slate-400">
                <span>
                  Distance: {pricingPreview.distanceKmActual.toFixed(2)} km
                  {pricingPreview.distanceKmRounded
                    ? ` (billed ${pricingPreview.distanceKmRounded.toFixed(2)} km)`
                    : ""}
                </span>
                <span className="uppercase tracking-wider">
                  {pricingPreview?.snapshots?.deliverySettings?.deliveryPricingMode ||
                    pricingPreview?.snapshots?.deliverySettings?.pricingMode ||
                    ""}
                </span>
              </div>
            )}
          <TaxesAndChargesDropdown
            handlingFee={handlingFee}
            packingFee={packingFee}
            packagingChargeAmount={pricingPreview?.packagingChargeAmount}
            customerSurchargeAmount={pricingPreview?.customerSurchargeAmount}
            customerSurchargeReason={
              pricingPreview?.customerSurchargeReason ||
              pricingPreview?.snapshots?.customerSurcharge?.reason
            }
            oddHourSurchargeAmount={oddHourSurchargeAmount}
            weatherSurchargeAmount={weatherSurchargeAmount}
            taxAmount={taxAmount}
            cgstAmount={cgstAmount}
            sgstAmount={sgstAmount}
            igstAmount={igstAmount}
            isInterState={isInterState}
          />

          {selectedCoupon && (
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex justify-between items-center px-3 py-2 bg-brand-50 rounded-xl border border-brand-100">
              <span className="text-primary font-black text-xs flex items-center gap-2 uppercase tracking-wider">
                <Tag size={14} />
                Coupon Reserved
              </span>
              <span className="font-black text-primary">-₹{fmt(discountAmount)}</span>
            </motion.div>
          )}

          {tipAmount > 0 && (
            <div className="flex justify-between items-center px-3 py-2 bg-pink-50 rounded-xl border border-pink-100 italic">
              <span className="text-pink-600 font-bold text-xs flex items-center gap-2">
                <Heart size={14} className="fill-pink-500" />
                Partner Support
              </span>
              <span className="font-black text-pink-600">₹{fmt(tipAmount)}</span>
            </div>
          )}

          {walletAmountToUse > 0 && (
            <motion.div
              initial={{ opacity: 0, x: -5 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex justify-between items-center px-3 py-2 bg-brand-50 rounded-xl border border-brand-100 mb-2">
              <span className="text-primary font-black text-[11px] flex items-center gap-2 uppercase tracking-tight">
                <Wallet size={14} />
                Wallet Applied
              </span>
              <span className="font-black text-primary">-₹{fmt(walletAmountToUse)}</span>
            </motion.div>
          )}

          <div className="mt-4 pt-6 border-t-2 border-dashed border-slate-100">
            <div className="flex justify-between items-center">
              <div className="flex flex-col">
                <span className="font-[1000] text-slate-800 text-lg uppercase tracking-tight">
                  {finalAmountToPay === 0 ? "Fully Covered" : "Total Payable"}
                </span>
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em]">
                  {finalAmountToPay === 0 ? "Paid via Wallet" : "Safe & Secure Payment"}
                </span>
              </div>
              <span className="font-[1000] text-primary text-3xl tracking-tighter italic">
                {isPreviewLoading ? "Calculating..." : `₹${fmt(finalAmountToPay)}`}
              </span>
            </div>
          </div>
        </div>
      </motion.div>
    </>
  );
});

export default CheckoutPricingBreakdown;
