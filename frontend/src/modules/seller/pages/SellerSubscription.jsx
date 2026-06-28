import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Loader2, Store, CheckCircle, Clock, CreditCard } from "lucide-react";
import Card from "@shared/components/ui/Card";
import Button from "@shared/components/ui/Button";
import { sellerApi } from "../services/sellerApi";
import { useAuth } from "@core/context/AuthContext";

const SellerSubscription = () => {
  const navigate = useNavigate();
  const { refreshUser } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [isPaying, setIsPaying] = useState(false);
  const [data, setData] = useState(null);
  const [selectedPlanId, setSelectedPlanId] = useState("");

  const loadData = async () => {
    setIsLoading(true);
    try {
      const response = await sellerApi.getSubscriptionPlans();
      setData(response.data.result || {});
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to load subscription plans");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handlePayWithPhonePe = async () => {
    if (!selectedPlanId) {
      toast.error("Select a plan first");
      return;
    }

    const selectedPlan = plans.find((p) => String(p._id) === String(selectedPlanId));
    let requestType = "new";
    if (activeSubscription && selectedPlan) {
      const currentPrice = Number(activeSubscription.planSnapshot?.price || 0);
      const currentSort = Number(activeSubscription.planSnapshot?.sortOrder || 0);
      const selectedPrice = Number(selectedPlan.price || 0);
      const selectedSort = Number(selectedPlan.sortOrder || 0);
      const isHigherTier = selectedPrice > currentPrice || selectedSort > currentSort;
      requestType = isHigherTier ? "upgrade" : "renewal";
    }

    setIsPaying(true);
    try {
      const response = await sellerApi.initiateSubscriptionPayment({
        planId: selectedPlanId,
        requestType,
      });
      const { redirectUrl } = response.data.result || {};
      if (!redirectUrl) {
        throw new Error("Payment URL not received");
      }
      if (typeof refreshUser === "function") {
        await refreshUser();
      }
      window.location.href = redirectUrl;
    } catch (error) {
      toast.error(error.response?.data?.message || error.message || "Failed to start payment");
      setIsPaying(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
      </div>
    );
  }

  const {
    plans = [],
    activeSubscription,
    pendingPhonePePayment,
    usage,
    paymentSettings = {},
  } = data || {};

  const currency = paymentSettings.currencySymbol || "₹";

  if (activeSubscription) {
    return (
      <div className="max-w-3xl mx-auto space-y-6 p-4">
        <Card className="p-6 border-emerald-200 bg-emerald-50/50">
          <div className="flex items-start gap-3">
            <CheckCircle className="h-6 w-6 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <h1 className="text-xl font-bold text-slate-900">Subscription active</h1>
              <p className="text-sm text-slate-600 mt-1">
                {activeSubscription.planSnapshot?.name || "Your plan"} — valid until{" "}
                {new Date(activeSubscription.currentPeriodEnd).toLocaleDateString()}
              </p>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div className="p-3 bg-white rounded-lg">
                  <p className="text-slate-500">Shops</p>
                  <p className="font-bold">{usage?.shopCount || 0} / {usage?.shopLimit || "—"}</p>
                </div>
                <div className="p-3 bg-white rounded-lg">
                  <p className="text-slate-500">Published products</p>
                  <p className="font-bold">
                    {usage?.publishedProductCount || 0}
                    {usage?.productLimit ? ` / ${usage.productLimit}` : ""}
                  </p>
                </div>
              </div>
              <Button className="mt-4" onClick={() => navigate("/seller")}>
                Go to dashboard
              </Button>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="font-bold text-slate-900 mb-2">Renew or upgrade</h2>
          <p className="text-sm text-slate-500 mb-4">Pay with PhonePe to extend or change your plan.</p>
          <div className="grid md:grid-cols-2 gap-3">
            {plans.map((plan) => (
              <button
                key={plan._id}
                type="button"
                onClick={() => setSelectedPlanId(plan._id)}
                className={`text-left p-4 rounded-xl border ${
                  selectedPlanId === plan._id ? "border-primary-400 ring-2 ring-primary-100" : "border-slate-200"
                }`}
              >
                <p className="font-bold">{plan.name}</p>
                <p className="text-sm text-slate-500">{plan.durationDays} days · {plan.shopCount} shops</p>
                <p className="text-lg font-bold text-primary-600 mt-2">{currency}{plan.price}</p>
              </button>
            ))}
          </div>
          {selectedPlanId && (() => {
            const selectedPlan = plans.find((p) => String(p._id) === String(selectedPlanId));
            const currentPrice = Number(activeSubscription?.planSnapshot?.price || 0);
            const currentSort = Number(activeSubscription?.planSnapshot?.sortOrder || 0);
            const selectedPrice = Number(selectedPlan?.price || 0);
            const selectedSort = Number(selectedPlan?.sortOrder || 0);
            const isUpgrade = selectedPrice > currentPrice || selectedSort > currentSort;
            return (
              <Button
                className="mt-4"
                disabled={isPaying}
                onClick={handlePayWithPhonePe}
              >
                {isPaying
                  ? "Redirecting to PhonePe..."
                  : isUpgrade
                    ? "Upgrade with PhonePe"
                    : "Renew with PhonePe"}
              </Button>
            );
          })()}
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 p-4 pb-16">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Subscription plans</h1>
        <p className="text-sm text-slate-500 mt-1">
          Choose a plan and pay securely with PhonePe. Your subscription activates instantly after payment.
        </p>
      </div>

      {pendingPhonePePayment && (
        <Card className="p-4 border-amber-200 bg-amber-50 flex items-start gap-3">
          <Clock className="h-5 w-5 text-amber-600 shrink-0" />
          <div>
            <p className="font-semibold text-amber-900">Payment in progress</p>
            <p className="text-sm text-amber-700">
              Complete your PhonePe payment for {pendingPhonePePayment.planSnapshot?.name || "the selected plan"}.
            </p>
            {pendingPhonePePayment.rawGatewayResponse?.redirectUrl && (
              <Button
                size="sm"
                className="mt-2"
                onClick={() => {
                  window.location.href = pendingPhonePePayment.rawGatewayResponse.redirectUrl;
                }}
              >
                Continue payment
              </Button>
            )}
          </div>
        </Card>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        {plans.map((plan) => (
          <Card
            key={plan._id}
            className={`p-5 cursor-pointer transition-all ${
              selectedPlanId === plan._id ? "ring-2 ring-primary-300 border-primary-200" : ""
            }`}
            onClick={() => setSelectedPlanId(plan._id)}
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="h-10 w-10 rounded-xl bg-primary-100 flex items-center justify-center">
                <Store className="h-5 w-5 text-primary-600" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900">{plan.name}</h3>
                <p className="text-xs text-slate-500">{plan.durationDays} days</p>
              </div>
            </div>
            <ul className="text-sm text-slate-600 space-y-1 mb-4">
              <li>• {plan.shopCount} shop{plan.shopCount > 1 ? "s" : ""}</li>
              <li>• {plan.productCountPerShop} products per shop</li>
              <li>• 0% commission on sales</li>
            </ul>
            <p className="text-2xl font-bold text-primary-600">{currency}{plan.price}</p>
          </Card>
        ))}
      </div>

      {selectedPlanId && !pendingPhonePePayment && (
        <Card className="p-5">
          <div className="flex items-center gap-3 mb-4">
            <CreditCard className="h-5 w-5 text-primary-600" />
            <h2 className="font-bold text-slate-900">Pay with PhonePe</h2>
          </div>
          <p className="text-sm text-slate-500 mb-4">
            You will be redirected to PhonePe to complete payment. Subscription activates automatically once payment succeeds.
          </p>
          <Button
            disabled={isPaying}
            onClick={() => handlePayWithPhonePe()}
            className="w-full md:w-auto"
          >
            {isPaying ? "Redirecting to PhonePe..." : "Pay with PhonePe"}
          </Button>
        </Card>
      )}
    </div>
  );
};

export default SellerSubscription;
