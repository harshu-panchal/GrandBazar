import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Check, Loader2, X, AlertTriangle, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import Card from "@shared/components/ui/Card";
import Button from "@shared/components/ui/Button";
import { sellerApi } from "../services/sellerApi";
import { useAuth } from "@core/context/AuthContext";

const SellerSubscriptionPaymentStatus = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { refreshUser } = useAuth();
  const merchantOrderId = searchParams.get("merchantOrderId");
  const [status, setStatus] = useState("verifying");
  const [payment, setPayment] = useState(null);
  const [error, setError] = useState("");
  const pollRef = useRef(null);
  const maxRetries = 12;

  const verifyPayment = async () => {
    if (!merchantOrderId) {
      setStatus("failure");
      setError("Missing payment reference");
      return;
    }

    try {
      const response = await sellerApi.verifySubscriptionPayment(merchantOrderId);
      const result = response.data.result || {};
      const paymentStatus = result.status;
      setPayment(result.payment);

      if (paymentStatus === "CAPTURED") {
        setStatus("success");
        if (pollRef.current) clearInterval(pollRef.current);
        if (typeof refreshUser === "function") {
          await refreshUser();
        }
        setTimeout(() => navigate("/seller/subscription", { replace: true }), 3500);
      } else if (paymentStatus === "FAILED" || paymentStatus === "CANCELLED") {
        setStatus("failure");
        if (pollRef.current) clearInterval(pollRef.current);
      }
    } catch (err) {
      const statusCode = err?.response?.status;
      if (!err?.response) {
        setStatus("timeout");
        setError("Cannot reach the server. Please check your connection and try again.");
        if (pollRef.current) clearInterval(pollRef.current);
        return;
      }
      if (statusCode === 401) {
        setStatus("failure");
        setError("Session expired. Please log in again.");
        if (pollRef.current) clearInterval(pollRef.current);
        return;
      }
      if (statusCode === 404) {
        setError("Payment not found yet. Still checking...");
      }
    }
  };

  useEffect(() => {
    let retries = 0;
    verifyPayment();
    pollRef.current = setInterval(() => {
      retries += 1;
      if (retries >= maxRetries) {
        clearInterval(pollRef.current);
        setStatus((current) => (current === "verifying" ? "timeout" : current));
        return;
      }
      verifyPayment();
    }, 3000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [merchantOrderId]);

  const planName = payment?.planSnapshot?.name || "Subscription plan";

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-4">
      <Card className="w-full max-w-md p-8 text-center">
        {status === "verifying" && (
          <>
            <Loader2 className="h-12 w-12 animate-spin text-primary-500 mx-auto mb-4" />
            <h1 className="text-xl font-bold text-slate-900">Verifying payment</h1>
            <p className="text-sm text-slate-500 mt-2">Please wait while we confirm your PhonePe payment.</p>
          </>
        )}

        {status === "success" && (
          <>
            <div className="h-14 w-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
              <Check className="h-8 w-8 text-emerald-600" />
            </div>
            <h1 className="text-xl font-bold text-slate-900">Payment successful</h1>
            <p className="text-sm text-slate-500 mt-2">
              {planName} is now active. Redirecting to your subscription dashboard...
            </p>
            <Button className="mt-6" onClick={() => navigate("/seller/subscription", { replace: true })}>
              View subscription <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </>
        )}

        {(status === "failure" || status === "timeout") && (
          <>
            <div className="h-14 w-14 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
              {status === "timeout" ? (
                <AlertTriangle className="h-8 w-8 text-amber-600" />
              ) : (
                <X className="h-8 w-8 text-red-600" />
              )}
            </div>
            <h1 className="text-xl font-bold text-slate-900">
              {status === "timeout" ? "Verification timed out" : "Payment failed"}
            </h1>
            <p className="text-sm text-slate-500 mt-2">
              {error || "Your payment could not be confirmed. You can try again from the subscription page."}
            </p>
            <div className="flex gap-3 justify-center mt-6">
              <Button variant="outline" onClick={() => verifyPayment()}>
                Retry
              </Button>
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
