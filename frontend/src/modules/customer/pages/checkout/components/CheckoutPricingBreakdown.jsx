import React from "react";
import { Clipboard, Tag, Heart, Wallet } from "lucide-react";
import { motion } from "framer-motion";

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
              ₹{pricingPreview?.productSubtotal ?? cartTotal}
            </span>
          </div>
          <div className="flex justify-between items-center px-2">
            <span className="text-slate-500 font-bold text-[13px] uppercase tracking-wider">
              Delivery Fee
            </span>
            <span className="font-black text-slate-800">₹{deliveryFee}</span>
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
          <div className="flex justify-between items-center px-2">
            <span className="text-slate-500 font-bold text-[13px] uppercase tracking-wider">
              Handling Fee
            </span>
            <span className="font-black text-slate-800">₹{handlingFee}</span>
          </div>
          {Number(packingFee) > 0 && (
            <div className="flex justify-between items-center px-2">
              <span className="text-slate-500 font-bold text-[13px] uppercase tracking-wider">
                Packing Charge
              </span>
              <span className="font-black text-slate-800">₹{packingFee}</span>
            </div>
          )}
          {Number(pricingPreview?.packagingChargeAmount || 0) > 0 && (
            <div className="flex justify-between items-center px-2">
              <span className="text-slate-500 font-bold text-[13px] uppercase tracking-wider">
                Packaging Charge
              </span>
              <span className="font-black text-slate-800">
                ₹{pricingPreview.packagingChargeAmount}
              </span>
            </div>
          )}
          {Number(pricingPreview?.customerSurchargeAmount || 0) > 0 && (
            <div className="flex justify-between items-start px-3 py-2 bg-sky-50 rounded-xl border border-sky-100">
              <div className="flex flex-col pr-3">
                <span className="text-sky-700 font-black text-xs uppercase tracking-wider">
                  Extra Charge
                </span>
                <span className="text-[11px] font-semibold text-sky-600/80 mt-0.5">
                  {pricingPreview?.customerSurchargeReason ||
                    pricingPreview?.snapshots?.customerSurcharge?.reason ||
                    "Additional charge"}
                </span>
              </div>
              <span className="font-black text-sky-700">
                ₹{pricingPreview.customerSurchargeAmount}
              </span>
            </div>
          )}
          {oddHourSurchargeAmount > 0 && (
            <div className="flex justify-between items-start px-3 py-2 bg-indigo-50 rounded-xl border border-indigo-100">
              <span className="text-indigo-700 font-black text-xs uppercase tracking-wider">
                Odd-Hour Delivery Charge
              </span>
              <span className="font-black text-indigo-700">₹{oddHourSurchargeAmount}</span>
            </div>
          )}
          {weatherSurchargeAmount > 0 && (
            <div className="flex justify-between items-start px-3 py-2 bg-amber-50 rounded-xl border border-amber-100">
              <span className="text-amber-700 font-black text-xs uppercase tracking-wider">
                Weather Surcharge
              </span>
              <span className="font-black text-amber-700">₹{weatherSurchargeAmount}</span>
            </div>
          )}
          {isInterState ? (
            <div className="flex justify-between items-center px-2">
              <span className="text-slate-500 font-bold text-[13px] uppercase tracking-wider">
                IGST
              </span>
              <span className="font-black text-slate-800">₹{igstAmount}</span>
            </div>
          ) : cgstAmount > 0 || sgstAmount > 0 ? (
            <>
              <div className="flex justify-between items-center px-2">
                <span className="text-slate-500 font-bold text-[13px] uppercase tracking-wider">
                  CGST
                </span>
                <span className="font-black text-slate-800">₹{cgstAmount}</span>
              </div>
              <div className="flex justify-between items-center px-2">
                <span className="text-slate-500 font-bold text-[13px] uppercase tracking-wider">
                  SGST
                </span>
                <span className="font-black text-slate-800">₹{sgstAmount}</span>
              </div>
            </>
          ) : (
            <div className="flex justify-between items-center px-2">
              <span className="text-slate-500 font-bold text-[13px] uppercase tracking-wider">
                Tax
              </span>
              <span className="font-black text-slate-800">₹{taxAmount}</span>
            </div>
          )}

          {selectedCoupon && (
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex justify-between items-center px-3 py-2 bg-brand-50 rounded-xl border border-brand-100">
              <span className="text-primary font-black text-xs flex items-center gap-2 uppercase tracking-wider">
                <Tag size={14} />
                Coupon Reserved
              </span>
              <span className="font-black text-primary">-₹{discountAmount}</span>
            </motion.div>
          )}

          {tipAmount > 0 && (
            <div className="flex justify-between items-center px-3 py-2 bg-pink-50 rounded-xl border border-pink-100 italic">
              <span className="text-pink-600 font-bold text-xs flex items-center gap-2">
                <Heart size={14} className="fill-pink-500" />
                Partner Support
              </span>
              <span className="font-black text-pink-600">₹{tipAmount}</span>
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
              <span className="font-black text-primary">-₹{walletAmountToUse}</span>
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
                {isPreviewLoading ? "Calculating..." : `₹${Math.ceil(finalAmountToPay)}`}
              </span>
            </div>
          </div>
        </div>
      </motion.div>
    </>
  );
});

export default CheckoutPricingBreakdown;
