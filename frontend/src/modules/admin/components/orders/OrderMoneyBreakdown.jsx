import React, { useState } from 'react';
import Card from '@shared/components/ui/Card';
import Badge from '@shared/components/ui/Badge';
import { cn } from '@/lib/utils';
import {
    IndianRupee,
    Store,
    Truck,
    Landmark,
    Receipt,
    Wallet,
    Banknote,
    Percent,
    ChevronDown,
    Undo2,
    Info,
} from 'lucide-react';

const inr = (v) => `₹${Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

const SETTLEMENT_BADGE_STYLES = {
    NOT_APPLICABLE: 'bg-slate-100 text-slate-500 border-slate-200',
    HOLD: 'bg-rose-100 text-rose-700 border-rose-200',
    PENDING: 'bg-amber-100 text-amber-700 border-amber-200',
    PROCESSING: 'bg-blue-100 text-blue-700 border-blue-200',
    COMPLETED: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    FAILED: 'bg-rose-100 text-rose-700 border-rose-200',
    CANCELLED: 'bg-slate-100 text-slate-500 border-slate-200',
    PARTIAL: 'bg-amber-100 text-amber-700 border-amber-200',
    REFUNDED: 'bg-violet-100 text-violet-700 border-violet-200',
};

const SettlementBadge = ({ status }) => (
    <Badge className={cn('text-[8px] font-black uppercase tracking-widest border', SETTLEMENT_BADGE_STYLES[status] || SETTLEMENT_BADGE_STYLES.PENDING)}>
        {status || 'PENDING'}
    </Badge>
);

// A single "who has this row" row: label, amount, optional sub-note.
const Row = ({ label, value, sub, bold, tone }) => (
    <div className={cn('flex items-start justify-between gap-3 py-2', bold && 'pt-3 border-t border-slate-100 mt-1')}>
        <div className="min-w-0">
            <p className={cn('text-xs font-bold text-slate-600', bold && 'text-sm font-black text-slate-900 uppercase tracking-tight')}>{label}</p>
            {sub ? <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p> : null}
        </div>
        <p className={cn(
            'text-xs font-black shrink-0',
            bold ? 'text-base' : '',
            tone === 'negative' ? 'text-rose-600' : tone === 'positive' ? 'text-emerald-600' : 'text-slate-900',
        )}>
            {tone === 'negative' && Number(value) > 0 ? '- ' : ''}{inr(value)}
        </p>
    </div>
);

const RecipientTile = ({ icon: Icon, label, amount, description, accent }) => (
    <div className={cn('p-4 rounded-2xl border', accent)}>
        <div className="flex items-center gap-2 mb-1.5">
            <Icon className="h-3.5 w-3.5" />
            <span className="text-[10px] font-black uppercase tracking-widest">{label}</span>
        </div>
        <p className="text-xl font-black">{inr(amount)}</p>
        {description ? <p className="text-[10px] font-semibold mt-1 opacity-70">{description}</p> : null}
    </div>
);

const OrderMoneyBreakdown = ({ order }) => {
    const [showLineItems, setShowLineItems] = useState(false);
    const pb = order?.paymentBreakdown || {};
    const settlement = order?.settlementStatus || {};
    const financeFlags = order?.financeFlags || {};
    const lineItems = Array.isArray(pb.lineItems) ? pb.lineItems : [];

    // Nothing meaningful to show for very old / legacy orders that never got
    // a frozen paymentBreakdown snapshot (pre-dates this app's finance
    // engine) — say so plainly instead of rendering an all-zero breakdown.
    const hasBreakdown = pb && Object.keys(pb).length > 0 && (pb.grandTotal || pb.productSubtotal);

    const isCod = order?.paymentMode === 'COD';
    const isReturned = Number(order?.returnRefundAmount || 0) > 0 || order?.returnStatus === 'refund_completed';

    const surchargeTotal =
        Number(pb.customerSurchargeAmount || 0) +
        Number(pb.oddHourSurchargeAmount || 0) +
        Number(pb.weatherSurchargeAmount || 0);

    // platformTotalEarning = adminProductCommissionTotal + platformLogisticsMargin + surchargePlatformShare
    // — the remainder here is exactly that platform surcharge share, since
    // it isn't separately persisted on the order.
    const surchargePlatformShare = Math.max(
        0,
        Number(pb.platformTotalEarning || 0) - Number(pb.adminProductCommissionTotal || 0) - Number(pb.platformLogisticsMargin || 0),
    );

    const isIntraState = pb.taxJurisdiction === 'intra_state';

    return (
        <Card className="border-none shadow-xl ring-1 ring-slate-100 bg-white rounded-2xl overflow-hidden text-left">
            <div className="p-6 border-b border-slate-50 bg-slate-50/30">
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-3">
                    <IndianRupee className="h-4 w-4 text-brand-500" />
                    Money Breakdown
                </h3>
                <p className="text-[11px] font-semibold text-slate-400 mt-1">
                    Every rupee of this order, split by exactly who receives it and from which commission or charge.
                </p>
            </div>

            {!hasBreakdown ? (
                <div className="p-8 text-center">
                    <Info className="h-6 w-6 text-slate-300 mx-auto mb-2" />
                    <p className="text-xs font-bold text-slate-400">
                        No frozen financial snapshot exists for this order (likely placed before the finance engine tracked per-order breakdowns).
                    </p>
                </div>
            ) : (
                <div className="p-6 space-y-8">
                    {/* Recipient summary tiles */}
                    <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Customer Paid {inr(pb.grandTotal)} — Where It Went</p>
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                            <RecipientTile
                                icon={Store}
                                label="Seller Got"
                                amount={pb.sellerPayoutTotal}
                                description="Product value net of commission"
                                accent="bg-orange-50 border-orange-100 text-orange-800"
                            />
                            <RecipientTile
                                icon={Landmark}
                                label="Platform Got"
                                amount={pb.platformTotalEarning}
                                description="Commission + logistics margin"
                                accent="bg-purple-50 border-purple-100 text-purple-800"
                            />
                            <RecipientTile
                                icon={Truck}
                                label="Rider Got"
                                amount={pb.riderPayoutTotal}
                                description="Delivery pay + tip"
                                accent="bg-emerald-50 border-emerald-100 text-emerald-800"
                            />
                            <RecipientTile
                                icon={Receipt}
                                label="Tax (Government)"
                                amount={pb.taxTotal}
                                description={isIntraState ? 'CGST + SGST' : 'IGST'}
                                accent="bg-slate-50 border-slate-200 text-slate-700"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        {/* What the customer paid */}
                        <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">What The Customer Paid</p>
                            <div className="divide-y divide-slate-50">
                                <Row label="Product Subtotal" value={pb.productSubtotal} />
                                <Row label="Delivery Fee" value={pb.deliveryFeeCharged} sub="Platform revenue" />
                                <Row label="Handling Fee" value={pb.handlingFeeCharged} sub="Platform revenue" />
                                <Row label="Packing Fee (category-level)" value={pb.packingFeeCharged} sub="Platform revenue" />
                                {Number(pb.productPackagingChargeAmount || 0) > 0 && (
                                    <Row label="Product Packaging Override" value={pb.productPackagingChargeAmount} sub="Seller revenue" />
                                )}
                                {Number(pb.packagingChargeAmount || 0) > 0 && (
                                    <Row label="Store Packaging Charge" value={pb.packagingChargeAmount} sub="Seller revenue" />
                                )}
                                {surchargeTotal > 0 && (
                                    <Row
                                        label="Surcharges"
                                        value={surchargeTotal}
                                        sub={[
                                            pb.oddHourSurchargeAmount ? `Odd-hour ${inr(pb.oddHourSurchargeAmount)}` : null,
                                            pb.weatherSurchargeAmount ? `Weather ${inr(pb.weatherSurchargeAmount)}` : null,
                                            pb.customerSurchargeAmount ? `${pb.customerSurchargeReason || 'Other'} ${inr(pb.customerSurchargeAmount)}` : null,
                                        ].filter(Boolean).join(' · ') || undefined}
                                    />
                                )}
                                {Number(pb.tipTotal || 0) > 0 && <Row label="Rider Tip" value={pb.tipTotal} sub="100% to rider" />}
                                <Row label={isIntraState ? 'Tax (CGST + SGST)' : 'Tax (IGST)'} value={pb.taxTotal} sub={isIntraState ? `CGST ${inr(pb.cgstTotal)} + SGST ${inr(pb.sgstTotal)}` : `IGST ${inr(pb.igstTotal)}`} />
                                {Number(pb.discountTotal || 0) > 0 && (
                                    <Row label="Discount / Coupon" value={pb.discountTotal} tone="negative" />
                                )}
                                <Row label="Grand Total" value={pb.grandTotal} bold />
                            </div>
                        </div>

                        {/* Where it went, per recipient */}
                        <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Where It Went, Per Recipient</p>
                            <div className="divide-y divide-slate-50">
                                <Row label="Seller Payout" value={pb.sellerPayoutTotal} bold />
                                <Row label="— Admin Product Commission" value={pb.adminProductCommissionTotal} sub="Deducted from seller's share" tone="negative" />
                                <Row label="Admin / Platform Earning" value={pb.platformTotalEarning} bold />
                                <Row label="— Product Commission" value={pb.adminProductCommissionTotal} />
                                <Row label="— Logistics Margin" value={pb.platformLogisticsMargin} sub="Delivery + handling fees minus rider base pay" />
                                {surchargePlatformShare > 0 && <Row label="— Surcharge Share" value={surchargePlatformShare} />}
                                <Row label="Rider Payout" value={pb.riderPayoutTotal} bold />
                                <Row label="— Base Fare" value={pb.riderPayoutBase} />
                                <Row label="— Distance Pay" value={pb.riderPayoutDistance} />
                                {Number(pb.riderPayoutBonus || 0) > 0 && <Row label="— Bonus" value={pb.riderPayoutBonus} />}
                                {Number(pb.riderTipAmount || 0) > 0 && <Row label="— Tip (pass-through)" value={pb.riderTipAmount} />}
                            </div>
                        </div>
                    </div>

                    {/* Settlement status */}
                    <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Payout Settlement Status</p>
                        <div className="flex flex-wrap gap-3">
                            <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-xl border border-slate-100">
                                <span className="text-[10px] font-bold text-slate-500">Seller Payout</span>
                                <SettlementBadge status={settlement.sellerPayout} />
                            </div>
                            <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-xl border border-slate-100">
                                <span className="text-[10px] font-bold text-slate-500">Rider Payout</span>
                                <SettlementBadge status={settlement.riderPayout} />
                            </div>
                            <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-xl border border-slate-100">
                                <span className="text-[10px] font-bold text-slate-500">Admin Earning Credited</span>
                                <Badge className={cn('text-[8px] font-black uppercase tracking-widest border', settlement.adminEarningCredited ? SETTLEMENT_BADGE_STYLES.COMPLETED : SETTLEMENT_BADGE_STYLES.PENDING)}>
                                    {settlement.adminEarningCredited ? 'YES' : 'NOT YET'}
                                </Badge>
                            </div>
                            <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-xl border border-slate-100">
                                <span className="text-[10px] font-bold text-slate-500">Overall</span>
                                <SettlementBadge status={settlement.overall} />
                            </div>
                        </div>
                        {financeFlags.manualSettlementHold && (
                            <p className="text-[10px] font-bold text-rose-600 mt-2">
                                Manually held by admin{financeFlags.manualSettlementHoldReason ? `: "${financeFlags.manualSettlementHoldReason}"` : ''}
                            </p>
                        )}
                    </div>

                    {/* Payment collection */}
                    <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Payment Collection</p>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                                <p className="text-[9px] font-bold text-slate-400 uppercase">Mode</p>
                                <p className="text-xs font-black text-slate-800 mt-0.5">{order.paymentMode || 'COD'}</p>
                            </div>
                            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                                <p className="text-[9px] font-bold text-slate-400 uppercase">Status</p>
                                <p className="text-xs font-black text-slate-800 mt-0.5">{order.paymentStatus || '—'}</p>
                            </div>
                            {Number(pb.walletAmount || 0) > 0 && (
                                <div className="p-3 bg-brand-50 rounded-xl border border-brand-100">
                                    <p className="text-[9px] font-bold text-brand-500 uppercase flex items-center gap-1"><Wallet className="h-3 w-3" /> Wallet Used</p>
                                    <p className="text-xs font-black text-brand-800 mt-0.5">{inr(pb.walletAmount)}</p>
                                </div>
                            )}
                            {isCod && (
                                <>
                                    <div className="p-3 bg-amber-50 rounded-xl border border-amber-100">
                                        <p className="text-[9px] font-bold text-amber-600 uppercase flex items-center gap-1"><Banknote className="h-3 w-3" /> Cash Collected</p>
                                        <p className="text-xs font-black text-amber-800 mt-0.5">{inr(pb.codCollectedAmount)}</p>
                                    </div>
                                    <div className="p-3 bg-amber-50 rounded-xl border border-amber-100">
                                        <p className="text-[9px] font-bold text-amber-600 uppercase">Remitted to Platform</p>
                                        <p className="text-xs font-black text-amber-800 mt-0.5">{inr(pb.codRemittedAmount)}</p>
                                    </div>
                                    <div className="p-3 bg-amber-50 rounded-xl border border-amber-100">
                                        <p className="text-[9px] font-bold text-amber-600 uppercase">Still Pending</p>
                                        <p className="text-xs font-black text-amber-800 mt-0.5">{inr(pb.codPendingAmount)}</p>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Return / refund clawback */}
                    {isReturned && (
                        <div className="p-4 bg-rose-50/50 rounded-2xl border border-rose-100">
                            <p className="text-[10px] font-black text-rose-700 uppercase tracking-widest mb-3 flex items-center gap-2">
                                <Undo2 className="h-3.5 w-3.5" />
                                Return / Refund — Money Reversed
                            </p>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                <div className="p-3 bg-white rounded-xl border border-rose-100">
                                    <p className="text-[9px] font-bold text-slate-400 uppercase">Refunded to Customer</p>
                                    <p className="text-xs font-black text-slate-900 mt-0.5">{inr(order.returnRefundAmount)}</p>
                                </div>
                                {Number(order.returnRestockFeeDeducted || 0) > 0 && (
                                    <div className="p-3 bg-white rounded-xl border border-rose-100">
                                        <p className="text-[9px] font-bold text-slate-400 uppercase">Restocking Fee Kept by Seller</p>
                                        <p className="text-xs font-black text-slate-900 mt-0.5">{inr(order.returnRestockFeeDeducted)}</p>
                                    </div>
                                )}
                                {Number(order.returnSellerClawback || 0) > 0 && (
                                    <div className="p-3 bg-white rounded-xl border border-rose-100">
                                        <p className="text-[9px] font-bold text-slate-400 uppercase">Clawed Back From Seller</p>
                                        <p className="text-xs font-black text-slate-900 mt-0.5">{inr(order.returnSellerClawback)}</p>
                                    </div>
                                )}
                                {Number(order.returnAdminCommissionClawback || 0) > 0 && (
                                    <div className="p-3 bg-white rounded-xl border border-rose-100">
                                        <p className="text-[9px] font-bold text-slate-400 uppercase">Clawed Back From Admin Commission</p>
                                        <p className="text-xs font-black text-slate-900 mt-0.5">{inr(order.returnAdminCommissionClawback)}</p>
                                    </div>
                                )}
                                {Number(order.returnDeliveryCommission || 0) > 0 && (
                                    <div className="p-3 bg-white rounded-xl border border-rose-100">
                                        <p className="text-[9px] font-bold text-slate-400 uppercase">Rider Return-Pickup Commission</p>
                                        <p className="text-xs font-black text-slate-900 mt-0.5">{inr(order.returnDeliveryCommission)}</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Per-line-item commission detail */}
                    {lineItems.length > 0 && (
                        <div>
                            <button
                                onClick={() => setShowLineItems((v) => !v)}
                                className="w-full flex items-center justify-between py-2 text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-slate-600 transition-colors"
                            >
                                <span className="flex items-center gap-2"><Percent className="h-3.5 w-3.5" /> Per-Product Commission Detail ({lineItems.length})</span>
                                <ChevronDown className={cn('h-4 w-4 transition-transform', showLineItems && 'rotate-180')} />
                            </button>
                            {showLineItems && (
                                <div className="overflow-x-auto mt-2 rounded-xl border border-slate-100">
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="bg-slate-50/50">
                                                <th className="px-4 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Product</th>
                                                <th className="px-4 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Commission Source</th>
                                                <th className="px-4 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">Item Value</th>
                                                <th className="px-4 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">Seller Gets</th>
                                                <th className="px-4 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">Admin Commission</th>
                                                <th className="px-4 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">GST</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-50">
                                            {lineItems.map((li, idx) => (
                                                <tr key={li.productId || idx} className="hover:bg-slate-50/30">
                                                    <td className="px-4 py-3">
                                                        <p className="text-xs font-bold text-slate-800">{li.productName || 'Item'}</p>
                                                        <p className="text-[10px] text-slate-400">x{li.quantity} @ {inr(li.unitPrice)}</p>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <p className="text-[10px] font-bold text-slate-600">{li.appliedCommissionCategoryName || li.headerCategoryName || '—'}</p>
                                                        <p className="text-[9px] text-slate-400 uppercase">
                                                            {li.appliedCommissionSourceLevel || 'default'}
                                                            {li.appliedCommissionType === 'percentage' && Number.isFinite(li.appliedCommissionValue)
                                                                ? ` · ${li.appliedCommissionValue}%`
                                                                : li.appliedCommissionType === 'fixed' && Number.isFinite(li.appliedCommissionValue)
                                                                  ? ` · ${inr(li.appliedCommissionValue)} flat`
                                                                  : ''}
                                                        </p>
                                                    </td>
                                                    <td className="px-4 py-3 text-right text-xs font-bold text-slate-700">{inr(li.itemSubtotal)}</td>
                                                    <td className="px-4 py-3 text-right text-xs font-black text-orange-700">{inr(li.sellerPayout)}</td>
                                                    <td className="px-4 py-3 text-right text-xs font-black text-purple-700">{inr(li.adminProductCommission)}</td>
                                                    <td className="px-4 py-3 text-right text-xs font-bold text-slate-600">{li.gstSlab ? `${li.gstSlab}% (${inr(li.lineTax)})` : 'Exempt'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}

                    {order.isBulkOrder && (
                        <p className="text-[10px] font-bold text-slate-400">
                            This order qualified as a <span className="text-slate-700">bulk order</span> ({(order.bulkOrderReason || pb.bulkOrderReason || '').replace('_', ' ') || 'threshold'}) — commission rates above may reflect the bulk-order override.
                        </p>
                    )}
                </div>
            )}
        </Card>
    );
};

export default OrderMoneyBreakdown;
