import React, { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Check, X, ArrowRight } from "lucide-react";
import Card from "@shared/components/ui/Card";
import Button from "@shared/components/ui/Button";

// Subscription payment now completes in-page via Razorpay's embedded
// Checkout.js modal (see SellerSubscription.jsx's handlePayWithRazorpay)
// instead of a redirect-based gateway hop, so nothing navigates here
// anymore. Kept as a dead-link-safe fallback in case an old link/bookmark
// still points at it.
const SellerSubscriptionPaymentStatus = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const razorpayPaymentId = searchParams.get("razorpayPaymentId");
  const [status] = useState(razorpayPaymentId ? "success" : "failure");
  const [error] = useState(
    razorpayPaymentId
      ? ""
      : "This payment status link is no longer used — check your Subscription page for the latest status.",
  );
  const planName = "Subscription plan";

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-4">
      <Card className="w-full max-w-md p-8 text-center">
        {status === "success" && (
          <>
            <div className="h-14 w-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
              <Check className="h-8 w-8 text-emerald-600" />
            </div>
            <h1 className="text-xl font-bold text-slate-900">Payment successful</h1>
            <p className="text-sm text-slate-500 mt-2">
              {planName} is now active.
            </p>
            <Button className="mt-6" onClick={() => navigate("/seller/subscription", { replace: true })}>
              View subscription <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </>
        )}

        {status === "failure" && (
          <>
            <div className="h-14 w-14 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
              <X className="h-8 w-8 text-red-600" />
            </div>
            <h1 className="text-xl font-bold text-slate-900">Payment failed</h1>
            <p className="text-sm text-slate-500 mt-2">
              {error || "Your payment could not be confirmed. You can try again from the subscription page."}
            </p>
            <div className="flex gap-3 justify-center mt-6">
              <Button onClick={() => navigate("/seller/subscription")}>
                Back to plans
              </Button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
};

export default SellerSubscriptionPaymentStatus;
