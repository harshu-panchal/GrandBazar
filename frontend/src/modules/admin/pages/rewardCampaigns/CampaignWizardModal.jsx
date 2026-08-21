import React, { useEffect, useMemo, useState } from "react";
import Modal from "@shared/components/ui/Modal";
import Button from "@shared/components/ui/Button";
import { useToast } from "@shared/components/ui/Toast";
import {
  HiOutlineGift,
  HiOutlineUsers,
  HiOutlineTicket,
  HiOutlineArrowLeft,
  HiOutlineInformationCircle,
} from "react-icons/hi2";
import { cn } from "@/lib/utils";
import { adminApi } from "../../services/adminApi";
import {
  REWARD_TYPE_FAMILIES,
  REWARD_SUBTYPES,
  CREDIT_TIMINGS,
  STATUSES,
  FUNDING_SOURCES,
  CUSTOMER_TYPES,
  resolveFamilyFromSubtype,
  getOfferConfig,
  parseCsvIds,
  joinCsvIds,
  emptyForm,
  validateFormForSubtype,
  SCOPE_FIELD_META,
} from "./offerConfig";

const SectionTitle = ({ children }) => (
  <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 border-b border-slate-100 pb-2 mb-3">
    {children}
  </h3>
);

const inputCls =
  "w-full px-4 py-2.5 bg-slate-50 dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary-500/30";

const CampaignWizardModal = ({ open, editing, onClose, onSaved }) => {
  const { showToast } = useToast();
  const [form, setForm] = useState(emptyForm());
  const [wizardStep, setWizardStep] = useState(1); // 1=family, 2=subtype, 3=configure
  const [selectedFamily, setSelectedFamily] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      const rules = editing.rules || {};
      const subtype = editing.rewardConfig?.rewardSubtype || "";
      setSelectedFamily(resolveFamilyFromSubtype(subtype));
      setWizardStep(3);
      setForm({
        ...emptyForm(),
        ...editing,
        startAt: editing.startAt?.substring(0, 16) || "",
        endAt: editing.endAt?.substring(0, 16) || "",
        budgetLimit: editing.budgetLimit ?? "",
        dailyLimit: editing.dailyLimit ?? "",
        monthlyLimit: editing.monthlyLimit ?? "",
        rules: {
          ...emptyForm().rules,
          ...rules,
          maxRewardPerCustomer: rules.maxRewardPerCustomer ?? "",
          maxRewardsPerDay: rules.maxRewardsPerDay ?? "",
          milestoneOrderCount: rules.milestoneOrderCount ?? "",
          milestoneSpendAmount: rules.milestoneSpendAmount ?? "",
          newShopMaxAgeDays: rules.newShopMaxAgeDays ?? 30,
          productIdsText: joinCsvIds(rules.productIds),
          categoryIdsText: joinCsvIds(rules.categoryIds),
          brandIdsText: joinCsvIds(rules.brandIds),
          shopIdsText: joinCsvIds(rules.shopIds),
          cityIdsText: joinCsvIds(rules.cityIds),
        },
        rewardConfig: {
          ...emptyForm().rewardConfig,
          ...(editing.rewardConfig || {}),
          linkedCouponId: editing.rewardConfig?.linkedCouponId || "",
          refereeValue: editing.rewardConfig?.refereeValue ?? "",
        },
        redemptionRules: {
          ...emptyForm().redemptionRules,
          ...(editing.redemptionRules || {}),
          maxWalletAmount: editing.redemptionRules?.maxWalletAmount ?? "",
        },
        sharedFunding: editing.sharedFunding || emptyForm().sharedFunding,
      });
    } else {
      setForm(emptyForm());
      setSelectedFamily("");
      setWizardStep(1);
    }
  }, [open, editing]);

  const selectFamily = (familyId) => {
    setSelectedFamily(familyId);
    setForm((prev) => ({
      ...prev,
      rewardConfig: { ...prev.rewardConfig, rewardSubtype: "" },
    }));
    setWizardStep(2);
  };

  const selectSubtype = (subtypeMeta) => {
    const config = getOfferConfig(subtypeMeta.value);
    const nextRules = { ...form.rules };
    if (subtypeMeta.value === "first_purchase") nextRules.customerType = "new";
    else if (subtypeMeta.value === "repeat_purchase") nextRules.customerType = "existing";
    else nextRules.customerType = "all";

    setForm({
      ...form,
      campaignType: subtypeMeta.campaignType,
      rules: nextRules,
      rewardConfig: {
        ...form.rewardConfig,
        rewardSubtype: subtypeMeta.value,
        value: config.hideValue ? 0 : form.rewardConfig.value,
        valueType:
          subtypeMeta.value === "flat_coupon" || subtypeMeta.value === "free_delivery"
            ? "fixed"
            : form.rewardConfig.valueType || "percent",
      },
    });
    setWizardStep(3);
  };

  const familySubtypes = useMemo(
    () => REWARD_SUBTYPES.filter((s) => s.family === selectedFamily),
    [selectedFamily],
  );

  const selectedSubtypeMeta = useMemo(
    () => REWARD_SUBTYPES.find((s) => s.value === form.rewardConfig.rewardSubtype),
    [form.rewardConfig.rewardSubtype],
  );

  const offerConfig = useMemo(
    () => getOfferConfig(form.rewardConfig.rewardSubtype),
    [form.rewardConfig.rewardSubtype],
  );

  const setRewardConfig = (patch) => setForm((f) => ({ ...f, rewardConfig: { ...f.rewardConfig, ...patch } }));
  const setRules = (patch) => setForm((f) => ({ ...f, rules: { ...f.rules, ...patch } }));
  const setRedemption = (patch) => setForm((f) => ({ ...f, redemptionRules: { ...f.redemptionRules, ...patch } }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    const error = validateFormForSubtype(form);
    if (error) {
      showToast(error, "error");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        budgetLimit: form.budgetLimit !== "" ? Number(form.budgetLimit) : null,
        dailyLimit: form.dailyLimit !== "" ? Number(form.dailyLimit) : null,
        monthlyLimit: form.monthlyLimit !== "" ? Number(form.monthlyLimit) : null,
        priority: Number(form.priority) || 100,
        rules: {
          customerType: form.rules.customerType,
          minPurchase: Number(form.rules.minPurchase) || 0,
          maxRewardPerCustomer: form.rules.maxRewardPerCustomer
            ? Number(form.rules.maxRewardPerCustomer)
            : null,
          maxRewardsPerDay: form.rules.maxRewardsPerDay
            ? Number(form.rules.maxRewardsPerDay)
            : null,
          milestoneOrderCount: form.rules.milestoneOrderCount
            ? Number(form.rules.milestoneOrderCount)
            : null,
          milestoneSpendAmount: form.rules.milestoneSpendAmount
            ? Number(form.rules.milestoneSpendAmount)
            : null,
          newShopMaxAgeDays: form.rules.newShopMaxAgeDays
            ? Number(form.rules.newShopMaxAgeDays)
            : null,
          productIds: parseCsvIds(form.rules.productIdsText),
          categoryIds: parseCsvIds(form.rules.categoryIdsText),
          brandIds: parseCsvIds(form.rules.brandIdsText),
          shopIds: parseCsvIds(form.rules.shopIdsText),
          cityIds: parseCsvIds(form.rules.cityIdsText),
        },
        rewardConfig: {
          ...form.rewardConfig,
          value: Number(form.rewardConfig.value) || 0,
          maxRewardAmount: form.rewardConfig.maxRewardAmount
            ? Number(form.rewardConfig.maxRewardAmount)
            : null,
          validityDays: Number(form.rewardConfig.validityDays) || 30,
          delayedDays: Number(form.rewardConfig.delayedDays) || 0,
          linkedCouponId: form.rewardConfig.linkedCouponId || null,
          festivalName: form.rewardConfig.festivalName || "",
          refereeValue:
            form.rewardConfig.refereeValue !== "" && form.rewardConfig.refereeValue != null
              ? Number(form.rewardConfig.refereeValue)
              : null,
          usageLimit: form.rewardConfig.usageLimit ? Number(form.rewardConfig.usageLimit) : null,
          perUserLimit: form.rewardConfig.perUserLimit ? Number(form.rewardConfig.perUserLimit) : null,
          couponCodePrefix: form.rewardConfig.couponCodePrefix || "",
        },
        redemptionRules: {
          minOrderAmount: Number(form.redemptionRules?.minOrderAmount) || 0,
          maxWalletPercent: Number(form.redemptionRules?.maxWalletPercent) || 100,
          maxWalletAmount: form.redemptionRules?.maxWalletAmount !== ""
            ? Number(form.redemptionRules.maxWalletAmount)
            : null,
          allowWithCoupon: form.redemptionRules?.allowWithCoupon !== false,
        },
      };

      if (editing) {
        await adminApi.updateRewardCampaign(editing._id, payload);
        showToast("Campaign updated successfully", "success");
      } else {
        await adminApi.createRewardCampaign(payload);
        showToast("Campaign created successfully", "success");
      }
      onSaved();
    } catch (err) {
      showToast(err.response?.data?.message || "Save failed", "error");
    } finally {
      setSaving(false);
    }
  };

  const scopeMeta = SCOPE_FIELD_META[offerConfig.scopeField];

  return (
    <Modal isOpen={open} onClose={onClose} title={editing ? "Edit Campaign" : "Create Reward Campaign"} size="lg">
      <div className="space-y-5 max-h-[75vh] overflow-y-auto pr-1">
        {!editing && (
          <div className="flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-widest">
            {[
              { n: 1, label: "Reward Type" },
              { n: 2, label: "Specific Offer" },
              { n: 3, label: "Configure" },
            ].map((s, idx) => (
              <div key={s.n} className="flex items-center gap-2">
                {idx > 0 && <div className="h-px w-6 bg-slate-200" />}
                <span
                  className={cn(
                    "px-2.5 py-1 rounded-full",
                    wizardStep === s.n
                      ? "bg-slate-900 text-white"
                      : wizardStep > s.n
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-slate-100 text-slate-400",
                  )}
                >
                  {s.n}. {s.label}
                </span>
              </div>
            ))}
          </div>
        )}

        {wizardStep === 1 && (
          <div className="space-y-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">Select Reward Type</h3>
              <p className="text-sm text-slate-500 mt-1">Choose Cashback & Rewards, Coupons, or Referral first.</p>
            </div>
            <div className="grid grid-cols-1 gap-3">
              {REWARD_TYPE_FAMILIES.map((family) => {
                const Icon = family.icon === "ticket" ? HiOutlineTicket : family.icon === "users" ? HiOutlineUsers : HiOutlineGift;
                return (
                  <button
                    key={family.id}
                    type="button"
                    onClick={() => selectFamily(family.id)}
                    className="text-left p-4 rounded-2xl border-2 border-slate-100 hover:border-slate-900 hover:bg-slate-50 transition-all"
                  >
                    <div className="flex items-start gap-3">
                      <div className="h-11 w-11 rounded-xl bg-slate-900 text-white flex items-center justify-center shrink-0">
                        <Icon className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="font-bold text-slate-900">{family.label}</p>
                        <p className="text-xs text-slate-500 mt-1">{family.desc}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="flex justify-end pt-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {wizardStep === 2 && (
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => setWizardStep(1)}
              className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-slate-900"
            >
              <HiOutlineArrowLeft className="w-4 h-4" /> Change reward type
            </button>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                {REWARD_TYPE_FAMILIES.find((f) => f.id === selectedFamily)?.label || "Choose offer"}
              </h3>
              <p className="text-sm text-slate-500 mt-1">Pick the specific offer. Configuration options appear next.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {familySubtypes.map((sub) => (
                <button
                  key={sub.value}
                  type="button"
                  onClick={() => selectSubtype(sub)}
                  className="text-left p-4 rounded-2xl border-2 border-slate-100 hover:border-emerald-500 hover:bg-emerald-50/40 transition-all"
                >
                  <p className="font-bold text-sm text-slate-900">{sub.label}</p>
                  <p className="text-[10px] uppercase tracking-wider text-slate-400 mt-1">{sub.campaignType}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {wizardStep === 3 && (
          <form onSubmit={handleSubmit} className="space-y-6">
            {!editing && (
              <button
                type="button"
                onClick={() => setWizardStep(2)}
                className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-slate-900"
              >
                <HiOutlineArrowLeft className="w-4 h-4" /> Change offer type
              </button>
            )}

            <div className="rounded-2xl bg-slate-900 text-white p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-300">Selected type</p>
              <p className="text-lg font-bold mt-1">{selectedSubtypeMeta?.label || form.rewardConfig.rewardSubtype}</p>
              {offerConfig.helpText && (
                <p className="text-xs text-slate-300 mt-2 flex items-start gap-1.5">
                  <HiOutlineInformationCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  {offerConfig.helpText}
                </p>
              )}
            </div>

            <SectionTitle>Basic Information</SectionTitle>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="text-xs font-bold text-slate-500 mb-1 block">Campaign Name *</label>
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className={inputCls}
                  placeholder="e.g. Summer 5% Cashback"
                />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs font-bold text-slate-500 mb-1 block">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className={cn(inputCls, "min-h-[72px]")}
                  placeholder="Internal notes and customer-facing description"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 mb-1 block">Status</label>
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className={inputCls}>
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 mb-1 block">Funding Source</label>
                <select value={form.fundingSource} onChange={(e) => setForm({ ...form, fundingSource: e.target.value })} className={inputCls}>
                  {FUNDING_SOURCES.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 mb-1 block">Priority (lower = higher)</label>
                <input
                  type="number"
                  min="1"
                  value={form.priority}
                  onChange={(e) => setForm({ ...form, priority: e.target.value })}
                  className={inputCls}
                />
              </div>
            </div>

            <SectionTitle>Schedule</SectionTitle>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-slate-500 mb-1 block">Start Date & Time *</label>
                <input
                  type="datetime-local"
                  required
                  value={form.startAt}
                  onChange={(e) => setForm({ ...form, startAt: e.target.value })}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 mb-1 block">End Date & Time *</label>
                <input
                  type="datetime-local"
                  required
                  value={form.endAt}
                  onChange={(e) => setForm({ ...form, endAt: e.target.value })}
                  className={inputCls}
                />
              </div>
            </div>

            {/* ── Offer Configuration — differs per group ───────────────── */}
            {(offerConfig.group === "cashback" || offerConfig.group === "milestone" || offerConfig.group === "birthday") && (
              <>
                <SectionTitle>
                  {offerConfig.group === "milestone" ? "Milestone Configuration" : offerConfig.group === "birthday" ? "Birthday Reward" : "Reward Configuration"}
                </SectionTitle>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-slate-500 mb-1 block">Value Type</label>
                    <select value={form.rewardConfig.valueType} onChange={(e) => setRewardConfig({ valueType: e.target.value })} className={inputCls}>
                      <option value="percent">Percentage (%)</option>
                      <option value="fixed">Fixed Amount (₹)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500 mb-1 block">Reward Value</label>
                    <input
                      type="number"
                      min="0"
                      value={form.rewardConfig.value}
                      onChange={(e) => setRewardConfig({ value: Number(e.target.value) })}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500 mb-1 block">Max Reward Cap (₹)</label>
                    <input
                      type="number"
                      min="0"
                      value={form.rewardConfig.maxRewardAmount}
                      onChange={(e) => setRewardConfig({ maxRewardAmount: Number(e.target.value) })}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500 mb-1 block">Validity (days)</label>
                    <input
                      type="number"
                      min="1"
                      value={form.rewardConfig.validityDays}
                      onChange={(e) => setRewardConfig({ validityDays: Number(e.target.value) })}
                      className={inputCls}
                    />
                  </div>
                  {offerConfig.group !== "birthday" && (
                    <div>
                      <label className="text-xs font-bold text-slate-500 mb-1 block">Credit Timing</label>
                      <select value={form.rewardConfig.creditTiming} onChange={(e) => setRewardConfig({ creditTiming: e.target.value })} className={inputCls}>
                        {CREDIT_TIMINGS.map((t) => (
                          <option key={t.value} value={t.value}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  {offerConfig.group !== "birthday" && form.rewardConfig.creditTiming === "delayed_days" && (
                    <div>
                      <label className="text-xs font-bold text-slate-500 mb-1 block">Delay (days)</label>
                      <input
                        type="number"
                        min="1"
                        value={form.rewardConfig.delayedDays}
                        onChange={(e) => setRewardConfig({ delayedDays: Number(e.target.value) })}
                        className={inputCls}
                      />
                    </div>
                  )}
                  {offerConfig.requiresFestivalName && (
                    <div>
                      <label className="text-xs font-bold text-slate-500 mb-1 block">Festival Name *</label>
                      <input
                        type="text"
                        required
                        placeholder="Diwali, Holi, Eid…"
                        value={form.rewardConfig.festivalName || ""}
                        onChange={(e) => setRewardConfig({ festivalName: e.target.value })}
                        className={inputCls}
                      />
                    </div>
                  )}
                  {offerConfig.requiresShopAge && (
                    <div>
                      <label className="text-xs font-bold text-slate-500 mb-1 block">New Shop Max Age (days) *</label>
                      <input
                        type="number"
                        min="1"
                        required
                        value={form.rules.newShopMaxAgeDays}
                        onChange={(e) => setRules({ newShopMaxAgeDays: e.target.value })}
                        className={inputCls}
                        placeholder="e.g. 30"
                      />
                    </div>
                  )}
                  {offerConfig.group === "milestone" && (
                    <>
                      <div>
                        <label className="text-xs font-bold text-slate-500 mb-1 block">Milestone Order Count</label>
                        <input
                          type="number"
                          min="0"
                          value={form.rules.milestoneOrderCount}
                          onChange={(e) => setRules({ milestoneOrderCount: e.target.value })}
                          className={inputCls}
                          placeholder="e.g. 5th order"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-slate-500 mb-1 block">Milestone Spend (₹)</label>
                        <input
                          type="number"
                          min="0"
                          value={form.rules.milestoneSpendAmount}
                          onChange={(e) => setRules({ milestoneSpendAmount: e.target.value })}
                          className={inputCls}
                          placeholder="Lifetime spend threshold"
                        />
                      </div>
                    </>
                  )}
                </div>
              </>
            )}

            {offerConfig.group === "coupon" && (
              <>
                <SectionTitle>Coupon Configuration</SectionTitle>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {!offerConfig.hideValue && (
                    <>
                      <div>
                        <label className="text-xs font-bold text-slate-500 mb-1 block">Discount Type</label>
                        <select value={form.rewardConfig.valueType} onChange={(e) => setRewardConfig({ valueType: e.target.value })} className={inputCls}>
                          <option value="percent">Percentage (%)</option>
                          <option value="fixed">Fixed Amount (₹)</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-bold text-slate-500 mb-1 block">Discount Value *</label>
                        <input
                          type="number"
                          min="0"
                          required
                          value={form.rewardConfig.value}
                          onChange={(e) => setRewardConfig({ value: Number(e.target.value) })}
                          className={inputCls}
                        />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-slate-500 mb-1 block">Max Discount Cap (₹)</label>
                        <input
                          type="number"
                          min="0"
                          value={form.rewardConfig.maxRewardAmount}
                          onChange={(e) => setRewardConfig({ maxRewardAmount: Number(e.target.value) })}
                          className={inputCls}
                        />
                      </div>
                    </>
                  )}
                  <div>
                    <label className="text-xs font-bold text-slate-500 mb-1 block">Min Order Value (₹)</label>
                    <input
                      type="number"
                      min="0"
                      value={form.redemptionRules?.minOrderAmount ?? 0}
                      onChange={(e) => setRedemption({ minOrderAmount: Number(e.target.value) })}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500 mb-1 block">Validity (days)</label>
                    <input
                      type="number"
                      min="1"
                      value={form.rewardConfig.validityDays}
                      onChange={(e) => setRewardConfig({ validityDays: Number(e.target.value) })}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500 mb-1 block">Total Usage Limit</label>
                    <input
                      type="number"
                      min="1"
                      value={form.rewardConfig.usageLimit ?? 1}
                      onChange={(e) => setRewardConfig({ usageLimit: e.target.value })}
                      className={inputCls}
                      placeholder="1"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500 mb-1 block">Per-Customer Limit</label>
                    <input
                      type="number"
                      min="1"
                      value={form.rewardConfig.perUserLimit ?? 1}
                      onChange={(e) => setRewardConfig({ perUserLimit: e.target.value })}
                      className={inputCls}
                      placeholder="1"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500 mb-1 block">Coupon Code Prefix</label>
                    <input
                      type="text"
                      maxLength={6}
                      placeholder="RV"
                      value={form.rewardConfig.couponCodePrefix || ""}
                      onChange={(e) => setRewardConfig({ couponCodePrefix: e.target.value.toUpperCase() })}
                      className={inputCls}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-xs font-bold text-slate-500 mb-1 block">Linked Coupon ID (optional)</label>
                    <input
                      type="text"
                      placeholder="Leave blank to auto-issue a personal coupon"
                      value={form.rewardConfig.linkedCouponId || ""}
                      onChange={(e) => setRewardConfig({ linkedCouponId: e.target.value })}
                      className={inputCls}
                    />
                  </div>
                </div>
              </>
            )}

            {offerConfig.group === "referral" && (
              <>
                <SectionTitle>Referral Reward Configuration</SectionTitle>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-slate-500 mb-1 block">Referrer Reward (₹) *</label>
                    <input
                      type="number"
                      min="0"
                      required
                      value={form.rewardConfig.value}
                      onChange={(e) => setRewardConfig({ value: Number(e.target.value), valueType: "fixed" })}
                      className={inputCls}
                      placeholder="Amount paid to the person who referred"
                    />
                  </div>
                  {offerConfig.showRefereeValue && (
                    <div>
                      <label className="text-xs font-bold text-slate-500 mb-1 block">Referee Reward (₹)</label>
                      <input
                        type="number"
                        min="0"
                        value={form.rewardConfig.refereeValue}
                        onChange={(e) => setRewardConfig({ refereeValue: e.target.value })}
                        className={inputCls}
                        placeholder="Defaults to referrer reward if left blank"
                      />
                    </div>
                  )}
                  <div>
                    <label className="text-xs font-bold text-slate-500 mb-1 block">Validity (days)</label>
                    <input
                      type="number"
                      min="1"
                      value={form.rewardConfig.validityDays}
                      onChange={(e) => setRewardConfig({ validityDays: Number(e.target.value) })}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500 mb-1 block">Credit Timing</label>
                    <select value={form.rewardConfig.creditTiming} onChange={(e) => setRewardConfig({ creditTiming: e.target.value })} className={inputCls}>
                      {CREDIT_TIMINGS.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </>
            )}

            {offerConfig.showRedemption && (
              <>
                <SectionTitle>Redemption Rules</SectionTitle>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="text-xs font-bold text-slate-500 mb-1 block">Min order to redeem wallet (₹)</label>
                    <input
                      type="number"
                      min="0"
                      value={form.redemptionRules?.minOrderAmount ?? 0}
                      onChange={(e) => setRedemption({ minOrderAmount: Number(e.target.value) })}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500 mb-1 block">Max wallet % of order</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={form.redemptionRules?.maxWalletPercent ?? 100}
                      onChange={(e) => setRedemption({ maxWalletPercent: Number(e.target.value) })}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500 mb-1 block">Max wallet amount / order (₹)</label>
                    <input
                      type="number"
                      min="0"
                      value={form.redemptionRules?.maxWalletAmount ?? ""}
                      onChange={(e) => setRedemption({ maxWalletAmount: e.target.value })}
                      className={inputCls}
                    />
                  </div>
                  <div className="flex items-center gap-2 pt-6">
                    <input
                      id="allowWithCoupon"
                      type="checkbox"
                      checked={form.redemptionRules?.allowWithCoupon !== false}
                      onChange={(e) => setRedemption({ allowWithCoupon: e.target.checked })}
                    />
                    <label htmlFor="allowWithCoupon" className="text-xs font-bold text-slate-600">
                      Allow wallet with coupon
                    </label>
                  </div>
                </div>
              </>
            )}

            {offerConfig.showEligibility && (
              <>
                <SectionTitle>Eligibility Rules</SectionTitle>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-slate-500 mb-1 block">Customer Type</label>
                    <select value={form.rules.customerType} onChange={(e) => setRules({ customerType: e.target.value })} className={inputCls}>
                      {CUSTOMER_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500 mb-1 block">Min Purchase (₹)</label>
                    <input
                      type="number"
                      min="0"
                      value={form.rules.minPurchase}
                      onChange={(e) => setRules({ minPurchase: Number(e.target.value) })}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500 mb-1 block">Max Rewards per Customer</label>
                    <input
                      type="number"
                      min="0"
                      value={form.rules.maxRewardPerCustomer}
                      onChange={(e) => setRules({ maxRewardPerCustomer: e.target.value })}
                      className={inputCls}
                      placeholder="Unlimited"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500 mb-1 block">Max Rewards per Day (per customer)</label>
                    <input
                      type="number"
                      min="0"
                      value={form.rules.maxRewardsPerDay}
                      onChange={(e) => setRules({ maxRewardsPerDay: e.target.value })}
                      className={inputCls}
                      placeholder="Unlimited"
                    />
                  </div>
                </div>
              </>
            )}

            {scopeMeta && (
              <>
                <SectionTitle>Scope Filters</SectionTitle>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-slate-500 mb-1 block">{scopeMeta.label} *</label>
                    <input
                      required
                      value={form.rules[scopeMeta.key]}
                      onChange={(e) => setRules({ [scopeMeta.key]: e.target.value })}
                      className={inputCls}
                      placeholder={scopeMeta.placeholder}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500 mb-1 block">City filters (optional)</label>
                    <input
                      value={form.rules.cityIdsText}
                      onChange={(e) => setRules({ cityIdsText: e.target.value })}
                      className={inputCls}
                      placeholder="e.g. Indore, Bhopal"
                    />
                  </div>
                </div>
              </>
            )}

            <SectionTitle>Budget & Limits</SectionTitle>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-xs font-bold text-slate-500 mb-1 block">Total Budget (₹)</label>
                <input
                  type="number"
                  min="0"
                  value={form.budgetLimit}
                  onChange={(e) => setForm({ ...form, budgetLimit: e.target.value })}
                  className={inputCls}
                  placeholder="No limit"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 mb-1 block">Daily Limit (₹)</label>
                <input
                  type="number"
                  min="0"
                  value={form.dailyLimit}
                  onChange={(e) => setForm({ ...form, dailyLimit: e.target.value })}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 mb-1 block">Monthly Limit (₹)</label>
                <input
                  type="number"
                  min="0"
                  value={form.monthlyLimit}
                  onChange={(e) => setForm({ ...form, monthlyLimit: e.target.value })}
                  className={inputCls}
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Saving…" : editing ? "Save Changes" : "Create Campaign"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
};

export default CampaignWizardModal;
