import React, { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Check,
  X,
  Plus,
  Loader2,
  Pencil,
  Trash2,
  RefreshCw,
  Store,
  Users,
  CreditCard,
  Clock,
  IndianRupee,
  Smartphone,
  Building2,
  Info,
} from "lucide-react";
import Card from "@shared/components/ui/Card";
import Button from "@shared/components/ui/Button";
import Badge from "@shared/components/ui/Badge";
import Modal from "@shared/components/ui/Modal";
import { adminApi, unwrapList } from "../services/adminApi";
import { cn } from "@/lib/utils";

const emptyPlan = {
  name: "",
  description: "",
  shopCount: 1,
  productCountPerShop: 50,
  durationDays: 30,
  price: 0,
  sortOrder: 0,
  billingCycle: "monthly",
  isActive: true,
};

const BILLING_CYCLE_PRESETS = {
  daily: 1,
  weekly: 7,
  monthly: 30,
  quarterly: 90,
  yearly: 365,
};

const TABS = [
  { key: "plans", label: "Plans" },
  { key: "requests", label: "Requests" },
  { key: "settings", label: "Settings" },
];

const REQUEST_STATUS_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "all", label: "All" },
];

const PHONEPE_STATUS_OPTIONS = [
  { value: "all", label: "All" },
  { value: "CAPTURED", label: "Captured" },
  { value: "PENDING", label: "Pending" },
  { value: "FAILED", label: "Failed" },
  { value: "CANCELLED", label: "Cancelled" },
];

const formatCurrency = (amount) => `₹${Number(amount || 0).toLocaleString("en-IN")}`;
const formatDate = (value) => (value ? new Date(value).toLocaleString("en-IN") : "—");

const isPlanActive = (plan) => plan?.isActive !== false;

const StatCard = ({ icon: Icon, label, value, hint }) => (
  <Card className="p-4 flex items-start gap-3">
    <div className="h-10 w-10 rounded-xl bg-primary-50 flex items-center justify-center shrink-0">
      <Icon className="h-5 w-5 text-primary-600" />
    </div>
    <div>
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold text-slate-900 mt-0.5">{value}</p>
      {hint && <p className="text-xs text-slate-400 mt-0.5">{hint}</p>}
    </div>
  </Card>
);

const FieldLabel = ({ children, required, hint }) => (
  <div className="space-y-1">
    <label className="text-sm font-semibold text-slate-700">
      {children}
      {required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
    {hint && <p className="text-xs text-slate-400">{hint}</p>}
  </div>
);

const TextInput = ({ className, ...props }) => (
  <input
    className={cn(
      "w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm",
      "focus:outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary-400",
      "placeholder:text-slate-400",
      className,
    )}
    {...props}
  />
);

const PlanForm = ({ form, onChange, onSubmit, submitLabel, isSubmitting, hideSubmit = false }) => (
  <form onSubmit={onSubmit} className="space-y-4" id="plan-form">
    <div>
      <FieldLabel required>Plan name</FieldLabel>
      <TextInput
        placeholder="e.g. Starter, Growth, Enterprise"
        value={form.name}
        onChange={(e) => onChange({ name: e.target.value })}
        required
      />
    </div>

    <div>
      <FieldLabel hint="Shown to sellers when choosing a plan">Description</FieldLabel>
      <textarea
        className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm min-h-[80px] focus:outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary-400"
        placeholder="Brief summary of what this plan includes"
        value={form.description}
        onChange={(e) => onChange({ description: e.target.value })}
      />
    </div>

    <div className="grid grid-cols-2 gap-3">
      <div>
        <FieldLabel required hint="Max shops allowed">Shops</FieldLabel>
        <TextInput
          type="number"
          min={1}
          value={form.shopCount}
          onChange={(e) => onChange({ shopCount: Number(e.target.value) })}
          required
        />
      </div>
      <div>
        <FieldLabel required hint="Per shop limit">Products / shop</FieldLabel>
        <TextInput
          type="number"
          min={1}
          value={form.productCountPerShop}
          onChange={(e) => onChange({ productCountPerShop: Number(e.target.value) })}
          required
        />
      </div>
    </div>

    <div className="grid grid-cols-2 gap-3">
      <div>
        <FieldLabel required>Duration (days)</FieldLabel>
        <TextInput
          type="number"
          min={1}
          value={form.durationDays}
          onChange={(e) => onChange({ durationDays: Number(e.target.value) })}
          required
        />
      </div>
      <div>
        <FieldLabel hint="Display label for sellers">Billing cycle</FieldLabel>
        <select
          className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm"
          value={form.billingCycle || "monthly"}
          onChange={(e) => {
            const cycle = e.target.value;
            onChange({
              billingCycle: cycle,
              durationDays: BILLING_CYCLE_PRESETS[cycle] || form.durationDays,
            });
          }}
        >
          {Object.keys(BILLING_CYCLE_PRESETS).map((cycle) => (
            <option key={cycle} value={cycle}>{cycle}</option>
          ))}
        </select>
      </div>
    </div>

    <div className="grid grid-cols-2 gap-3">
      <div>
        <FieldLabel required>Price (₹)</FieldLabel>
        <TextInput
          type="number"
          min={0}
          step="1"
          value={form.price}
          onChange={(e) => onChange({ price: Number(e.target.value) })}
          required
        />
      </div>
    </div>

    <div className="grid grid-cols-2 gap-3">
      <div>
        <FieldLabel hint="Lower numbers appear first">Sort order</FieldLabel>
        <TextInput
          type="number"
          value={form.sortOrder}
          onChange={(e) => onChange({ sortOrder: Number(e.target.value) })}
        />
      </div>
      <div className="flex items-end pb-1">
        <label className="flex items-center gap-2 text-sm font-medium text-slate-700 cursor-pointer">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(e) => onChange({ isActive: e.target.checked })}
            className="rounded border-slate-300 text-primary-600 focus:ring-primary-500"
          />
          Active (visible to sellers)
        </label>
      </div>
    </div>

    {!hideSubmit && (
      <Button type="submit" disabled={isSubmitting} className="w-full">
        {isSubmitting ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Saving...
          </>
        ) : (
          submitLabel
        )}
      </Button>
    )}
  </form>
);

const PlanCard = ({ plan, onEdit, onDeactivate, isDeactivating }) => (
  <div
    className={cn(
      "p-4 rounded-xl border transition-colors",
      isPlanActive(plan) ? "border-slate-200 bg-white" : "border-slate-100 bg-slate-50 opacity-75",
    )}
  >
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="font-bold text-slate-900">{plan.name}</h3>
          <Badge variant={isPlanActive(plan) ? "success" : "gray"}>
            {isPlanActive(plan) ? "Active" : "Inactive"}
          </Badge>
        </div>
        {plan.description && (
          <p className="text-sm text-slate-500 mt-1 line-clamp-2">{plan.description}</p>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={() => onEdit(plan)}
          className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-primary-600"
          title="Edit plan"
        >
          <Pencil className="h-4 w-4" />
        </button>
        {isPlanActive(plan) && (
          <button
            type="button"
            onClick={() => onDeactivate(plan)}
            disabled={isDeactivating}
            className="p-2 rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
            title="Deactivate plan"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>

    <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
      <div className="p-2 rounded-lg bg-slate-50">
        <p className="text-slate-400">Shops</p>
        <p className="font-bold text-slate-800">{plan.shopCount}</p>
      </div>
      <div className="p-2 rounded-lg bg-slate-50">
        <p className="text-slate-400">Products/shop</p>
        <p className="font-bold text-slate-800">{plan.productCountPerShop}</p>
      </div>
      <div className="p-2 rounded-lg bg-slate-50">
        <p className="text-slate-400">Duration</p>
        <p className="font-bold text-slate-800">{plan.durationDays} days</p>
      </div>
      <div className="p-2 rounded-lg bg-primary-50">
        <p className="text-primary-500">Price</p>
        <p className="font-bold text-primary-700">{formatCurrency(plan.price)}</p>
      </div>
    </div>
  </div>
);

const SubscriptionManagement = () => {
  const [tab, setTab] = useState("plans");
  const [requestSubTab, setRequestSubTab] = useState("phonepe");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSavingPlan, setIsSavingPlan] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [deactivatingId, setDeactivatingId] = useState(null);
  const [actioningRequestId, setActioningRequestId] = useState(null);

  const [overview, setOverview] = useState(null);
  const [plans, setPlans] = useState([]);
  const [requests, setRequests] = useState([]);
  const [phonePePayments, setPhonePePayments] = useState([]);
  const [modelSwitchRequests, setModelSwitchRequests] = useState([]);
  const [paymentSettings, setPaymentSettings] = useState({});

  const [planForm, setPlanForm] = useState(emptyPlan);
  const [editingPlan, setEditingPlan] = useState(null);
  const [editForm, setEditForm] = useState(emptyPlan);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  const [requestStatusFilter, setRequestStatusFilter] = useState("pending");
  const [phonePeStatusFilter, setPhonePeStatusFilter] = useState("all");
  const [rejectReasons, setRejectReasons] = useState({});

  const activePlans = useMemo(() => plans.filter(isPlanActive), [plans]);
  const inactivePlans = useMemo(() => plans.filter((p) => !isPlanActive(p)), [plans]);

  const loadAll = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    else setIsRefreshing(true);

    try {
      const [
        overviewRes,
        plansRes,
        requestsRes,
        phonePeRes,
        modelSwitchRes,
        settingsRes,
      ] = await Promise.all([
        adminApi.getSubscriptionOverview(),
        adminApi.getSubscriptionPlans(),
        adminApi.getSubscriptionPaymentRequests({ status: requestStatusFilter }),
        adminApi.getSubscriptionPayments({ status: phonePeStatusFilter }),
        adminApi.getModelSwitchRequests({ status: "pending" }),
        adminApi.getSubscriptionPaymentSettings(),
      ]);

      setOverview(overviewRes.data.result || {});
      setPlans(unwrapList(plansRes));
      setRequests(unwrapList(requestsRes));
      setPhonePePayments(unwrapList(phonePeRes));
      setModelSwitchRequests(unwrapList(modelSwitchRes));
      setPaymentSettings(settingsRes.data.result || {});
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to load subscription data");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [requestStatusFilter, phonePeStatusFilter]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleCreatePlan = async (e) => {
    e.preventDefault();
    if (!planForm.name.trim()) {
      toast.error("Plan name is required");
      return;
    }
    if (planForm.price < 0) {
      toast.error("Price cannot be negative");
      return;
    }

    setIsSavingPlan(true);
    try {
      await adminApi.createSubscriptionPlan(planForm);
      toast.success("Plan created successfully");
      setPlanForm(emptyPlan);
      loadAll(true);
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to create plan");
    } finally {
      setIsSavingPlan(false);
    }
  };

  const openEditModal = (plan) => {
    setEditingPlan(plan);
    setEditForm({
      name: plan.name || "",
      description: plan.description || "",
      shopCount: plan.shopCount ?? 1,
      productCountPerShop: plan.productCountPerShop ?? 50,
      durationDays: plan.durationDays ?? 30,
      price: plan.price ?? 0,
      sortOrder: plan.sortOrder ?? 0,
      isActive: plan.isActive !== false,
    });
    setIsEditModalOpen(true);
  };

  const handleUpdatePlan = async (e) => {
    e.preventDefault();
    if (!editingPlan?._id) return;

    setIsSavingPlan(true);
    try {
      await adminApi.updateSubscriptionPlan(editingPlan._id, editForm);
      toast.success("Plan updated");
      setIsEditModalOpen(false);
      setEditingPlan(null);
      loadAll(true);
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to update plan");
    } finally {
      setIsSavingPlan(false);
    }
  };

  const handleDeactivatePlan = async (plan) => {
    if (!window.confirm(`Deactivate "${plan.name}"? Sellers won't be able to purchase this plan.`)) {
      return;
    }

    setDeactivatingId(plan._id);
    try {
      await adminApi.deleteSubscriptionPlan(plan._id);
      toast.success("Plan deactivated");
      loadAll(true);
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to deactivate plan");
    } finally {
      setDeactivatingId(null);
    }
  };

  const handleApprove = async (id) => {
    setActioningRequestId(id);
    try {
      await adminApi.approveSubscriptionPayment(id);
      toast.success("Payment approved — subscription activated");
      loadAll(true);
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to approve");
    } finally {
      setActioningRequestId(null);
    }
  };

  const handleReject = async (id) => {
    const reason = rejectReasons[id] || "";
    setActioningRequestId(id);
    try {
      await adminApi.rejectSubscriptionPayment(id, { rejectionReason: reason });
      toast.success("Payment rejected");
      setRejectReasons((prev) => ({ ...prev, [id]: "" }));
      loadAll(true);
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to reject");
    } finally {
      setActioningRequestId(null);
    }
  };

  const savePaymentSettings = async (e) => {
    e.preventDefault();
    setIsSavingSettings(true);
    try {
      await adminApi.updateSubscriptionPaymentSettings(paymentSettings);
      toast.success("Payment settings saved");
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to save settings");
    } finally {
      setIsSavingSettings(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Seller subscriptions</h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage plans, review payments, and configure subscription settings.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => loadAll(true)}
          disabled={isRefreshing}
        >
          <RefreshCw className={cn("h-4 w-4 mr-2", isRefreshing && "animate-spin")} />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Store} label="Active plans" value={overview?.activePlanCount ?? 0} />
        <StatCard icon={Users} label="Active subscriptions" value={overview?.activeSubscriptions ?? 0} />
        <StatCard
          icon={Clock}
          label="Pending requests"
          value={overview?.pendingRequests ?? 0}
          hint="Manual approvals"
        />
        <StatCard
          icon={CreditCard}
          label="PhonePe payments"
          value={overview?.capturedPhonePePayments ?? 0}
          hint="Successfully captured"
        />
      </div>

      <div className="flex gap-2 flex-wrap">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              "px-4 py-2 rounded-lg text-sm font-semibold transition-colors",
              tab === key ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "plans" && (
        <div className="grid lg:grid-cols-2 gap-6">
          <Card className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-slate-900">Active plans</h2>
              <Badge variant="gray">{activePlans.length} active</Badge>
            </div>

            {activePlans.length === 0 ? (
              <div className="text-center py-10 px-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/50">
                <Store className="h-10 w-10 text-slate-300 mx-auto mb-3" />
                <p className="font-semibold text-slate-700">No active plans yet</p>
                <p className="text-sm text-slate-500 mt-1">
                  Create your first subscription plan using the form on the right.
                </p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
                {activePlans.map((plan) => (
                  <PlanCard
                    key={plan._id}
                    plan={plan}
                    onEdit={openEditModal}
                    onDeactivate={handleDeactivatePlan}
                    isDeactivating={deactivatingId === plan._id}
                  />
                ))}
              </div>
            )}

            {inactivePlans.length > 0 && (
              <div className="mt-6 pt-5 border-t border-slate-100">
                <h3 className="text-sm font-semibold text-slate-500 mb-3">Inactive plans</h3>
                <div className="space-y-2">
                  {inactivePlans.map((plan) => (
                    <PlanCard
                      key={plan._id}
                      plan={plan}
                      onEdit={openEditModal}
                      onDeactivate={handleDeactivatePlan}
                      isDeactivating={deactivatingId === plan._id}
                    />
                  ))}
                </div>
              </div>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="font-bold text-slate-900 mb-1 flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Create plan
            </h2>
            <p className="text-xs text-slate-500 mb-5">
              Sellers pay via PhonePe and get instant activation after successful payment.
            </p>
            <PlanForm
              form={planForm}
              onChange={(patch) => setPlanForm((prev) => ({ ...prev, ...patch }))}
              onSubmit={handleCreatePlan}
              submitLabel="Create plan"
              isSubmitting={isSavingPlan}
            />
          </Card>
        </div>
      )}

      {tab === "requests" && (
        <div className="space-y-4">
          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setRequestSubTab("phonepe")}
              className={cn(
                "px-3 py-1.5 rounded-lg text-sm font-medium",
                requestSubTab === "phonepe" ? "bg-primary-100 text-primary-800" : "bg-slate-100 text-slate-600",
              )}
            >
              <Smartphone className="h-3.5 w-3.5 inline mr-1.5 -mt-0.5" />
              PhonePe payments
            </button>
            <button
              type="button"
              onClick={() => setRequestSubTab("manual")}
              className={cn(
                "px-3 py-1.5 rounded-lg text-sm font-medium",
                requestSubTab === "manual" ? "bg-primary-100 text-primary-800" : "bg-slate-100 text-slate-600",
              )}
            >
              <Building2 className="h-3.5 w-3.5 inline mr-1.5 -mt-0.5" />
              Manual requests
            </button>
            <button
              type="button"
              onClick={() => setRequestSubTab("switches")}
              className={cn(
                "px-3 py-1.5 rounded-lg text-sm font-medium",
                requestSubTab === "switches" ? "bg-primary-100 text-primary-800" : "bg-slate-100 text-slate-600",
              )}
            >
              Model switches
            </button>
          </div>

          {requestSubTab === "phonepe" && (
            <Card className="overflow-hidden">
              <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-bold text-slate-900">PhonePe subscription payments</h2>
                  <p className="text-xs text-slate-500 mt-0.5">Auto-activated on successful capture</p>
                </div>
                <select
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm"
                  value={phonePeStatusFilter}
                  onChange={(e) => setPhonePeStatusFilter(e.target.value)}
                >
                  {PHONEPE_STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              {phonePePayments.length === 0 ? (
                <p className="p-8 text-sm text-slate-500 text-center">No PhonePe payments found.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-left text-xs text-slate-500 uppercase">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Seller</th>
                        <th className="px-4 py-3 font-semibold">Plan</th>
                        <th className="px-4 py-3 font-semibold">Amount</th>
                        <th className="px-4 py-3 font-semibold">Status</th>
                        <th className="px-4 py-3 font-semibold">Date</th>
                        <th className="px-4 py-3 font-semibold">Reference</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {phonePePayments.map((payment) => (
                        <tr key={payment._id} className="hover:bg-slate-50/50">
                          <td className="px-4 py-3">
                            <p className="font-semibold text-slate-900">{payment.seller?.name || "—"}</p>
                            <p className="text-xs text-slate-500">{payment.seller?.email}</p>
                          </td>
                          <td className="px-4 py-3">
                            {payment.planSnapshot?.name || "—"}
                            <span className="block text-xs text-slate-400 capitalize">{payment.requestType}</span>
                          </td>
                          <td className="px-4 py-3 font-medium">
                            {formatCurrency((payment.amount || 0) / 100)}
                          </td>
                          <td className="px-4 py-3">
                            <Badge
                              variant={
                                payment.status === "CAPTURED"
                                  ? "success"
                                  : payment.status === "FAILED" || payment.status === "CANCELLED"
                                    ? "error"
                                    : "gray"
                              }
                            >
                              {payment.status}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                            {formatDate(payment.createdAt)}
                          </td>
                          <td className="px-4 py-3 text-xs font-mono text-slate-500 max-w-[140px] truncate">
                            {payment.gatewayOrderId}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )}

          {requestSubTab === "switches" && (
            <Card className="overflow-hidden">
              <div className="p-4 border-b border-slate-100">
                <h2 className="font-bold text-slate-900">Business model switch requests</h2>
                <p className="text-xs text-slate-500 mt-0.5">Approve commission ↔ subscription changes</p>
              </div>
              {modelSwitchRequests.length === 0 ? (
                <p className="p-8 text-sm text-slate-500 text-center">No pending model switch requests.</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {modelSwitchRequests.map((seller) => (
                    <div key={seller._id} className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
                      <div>
                        <p className="font-bold text-slate-900">{seller.name}</p>
                        <p className="text-sm text-slate-500">{seller.email}</p>
                        <p className="text-sm mt-1">
                          {seller.businessModel} → {seller.businessModelSwitch?.requestedModel}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={async () => {
                          await adminApi.approveModelSwitch(seller._id);
                          toast.success("Model switch approved");
                          loadAll(true);
                        }}>
                          Approve
                        </Button>
                        <Button size="sm" variant="outline" onClick={async () => {
                          await adminApi.rejectModelSwitch(seller._id, { rejectionReason: "Rejected by admin" });
                          toast.success("Model switch rejected");
                          loadAll(true);
                        }}>
                          Reject
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          {requestSubTab === "manual" && (
            <Card className="overflow-hidden">
              <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-bold text-slate-900">Manual payment requests</h2>
                  <p className="text-xs text-slate-500 mt-0.5">Legacy bank/UPI proof uploads — requires admin approval</p>
                </div>
                <select
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm"
                  value={requestStatusFilter}
                  onChange={(e) => setRequestStatusFilter(e.target.value)}
                >
                  {REQUEST_STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              {requests.length === 0 ? (
                <p className="p-8 text-sm text-slate-500 text-center">No manual payment requests.</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {requests.map((request) => (
                    <div key={request._id} className="p-4 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-bold text-slate-900">{request.seller?.name || "Seller"}</p>
                          <Badge
                            variant={
                              request.status === "approved"
                                ? "success"
                                : request.status === "rejected"
                                  ? "error"
                                  : "warning"
                            }
                          >
                            {request.status}
                          </Badge>
                          <Badge variant="gray" className="capitalize">{request.requestType}</Badge>
                        </div>
                        <p className="text-sm text-slate-500">{request.seller?.email}</p>
                        <p className="text-sm mt-2">
                          <span className="font-semibold">{request.planSnapshot?.name}</span>
                          {" · "}
                          {formatCurrency(request.amount)}
                          {" · "}
                          UTR: {request.transactionRef || "—"}
                        </p>
                        {request.sellerNote && (
                          <p className="text-xs text-slate-500 mt-1">Note: {request.sellerNote}</p>
                        )}
                        {request.proofDocumentUrl && (
                          <a
                            href={request.proofDocumentUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-block text-xs text-primary-600 font-semibold mt-1 hover:underline"
                          >
                            View payment proof
                          </a>
                        )}
                        <p className="text-xs text-slate-400 mt-1">{formatDate(request.createdAt)}</p>
                      </div>

                      {request.status === "pending" && (
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0">
                          <input
                            className="px-3 py-2 text-sm border rounded-lg min-w-[180px]"
                            placeholder="Rejection reason (optional)"
                            value={rejectReasons[request._id] || ""}
                            onChange={(e) =>
                              setRejectReasons((prev) => ({ ...prev, [request._id]: e.target.value }))
                            }
                          />
                          <Button
                            size="sm"
                            onClick={() => handleApprove(request._id)}
                            disabled={actioningRequestId === request._id}
                          >
                            {actioningRequestId === request._id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <>
                                <Check className="h-4 w-4 mr-1" />
                                Approve
                              </>
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleReject(request._id)}
                            disabled={actioningRequestId === request._id}
                          >
                            <X className="h-4 w-4 mr-1" />
                            Reject
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}
        </div>
      )}

      {tab === "settings" && (
        <div className="grid lg:grid-cols-2 gap-6">
          <Card className="p-5 border-primary-100 bg-primary-50/30">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-xl bg-primary-100 flex items-center justify-center shrink-0">
                <Smartphone className="h-5 w-5 text-primary-600" />
              </div>
              <div>
                <h2 className="font-bold text-slate-900">PhonePe (primary)</h2>
                <p className="text-sm text-slate-600 mt-1">
                  Sellers pay subscription fees via PhonePe checkout. Subscriptions activate automatically
                  when payment is captured — no admin approval needed.
                </p>
                <ul className="mt-3 text-sm text-slate-600 space-y-1.5">
                  <li className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                    Instant activation after successful payment
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                    Webhook + redirect verification handled automatically
                  </li>
                  <li className="flex items-start gap-2">
                    <Info className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                    Configure PhonePe credentials in backend <code className="text-xs bg-white px-1 rounded">.env</code>
                  </li>
                </ul>
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="font-bold text-slate-900 mb-1 flex items-center gap-2">
              <IndianRupee className="h-4 w-4" />
              Bank / UPI details (optional)
            </h2>
            <p className="text-xs text-slate-500 mb-5">
              Legacy reference for manual payments. Not shown to sellers on the PhonePe flow.
            </p>
            <form onSubmit={savePaymentSettings} className="space-y-4">
              {[
                { key: "bankName", label: "Bank name", placeholder: "e.g. HDFC Bank" },
                { key: "accountHolder", label: "Account holder name", placeholder: "Registered account name" },
                { key: "accountNumber", label: "Account number", placeholder: "Bank account number" },
                { key: "ifsc", label: "IFSC code", placeholder: "e.g. HDFC0001234" },
                { key: "upiId", label: "UPI ID", placeholder: "e.g. business@upi" },
              ].map(({ key, label, placeholder }) => (
                <div key={key}>
                  <FieldLabel>{label}</FieldLabel>
                  <TextInput
                    placeholder={placeholder}
                    value={paymentSettings[key] || ""}
                    onChange={(e) => setPaymentSettings((s) => ({ ...s, [key]: e.target.value }))}
                  />
                </div>
              ))}
              <div>
                <FieldLabel hint="Shown to sellers if manual payment is used">Payment instructions</FieldLabel>
                <textarea
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm min-h-[90px] focus:outline-none focus:ring-2 focus:ring-primary-200"
                  placeholder="e.g. Include your store name in the payment note"
                  value={paymentSettings.paymentInstructions || ""}
                  onChange={(e) =>
                    setPaymentSettings((s) => ({ ...s, paymentInstructions: e.target.value }))
                  }
                />
              </div>
              <Button type="submit" disabled={isSavingSettings}>
                {isSavingSettings ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save settings"
                )}
              </Button>
            </form>
          </Card>
        </div>
      )}

      <Modal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setEditingPlan(null);
        }}
        title={`Edit plan — ${editingPlan?.name || ""}`}
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setIsEditModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdatePlan} disabled={isSavingPlan}>
              {isSavingPlan ? "Saving..." : "Save changes"}
            </Button>
          </>
        }
      >
        <PlanForm
          form={editForm}
          onChange={(patch) => setEditForm((prev) => ({ ...prev, ...patch }))}
          onSubmit={handleUpdatePlan}
          submitLabel="Save changes"
          isSubmitting={isSavingPlan}
          hideSubmit
        />
      </Modal>
    </div>
  );
};

export default SubscriptionManagement;
