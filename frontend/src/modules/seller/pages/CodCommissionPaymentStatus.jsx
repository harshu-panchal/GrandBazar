import React, { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CheckCircle2, XCircle, Loader2, ArrowLeft } from "lucide-react";
import Button from "@shared/components/ui/Button";
import { sellerApi } from "../services/sellerApi";

const CodCommissionPaymentStatus = () => {
  const [searchParams] = useSearchParams();
  const merchantOrderId = searchParams.get("merchantOrderId");
  const [loading, setLoading] = useState(true);
  const [paymentStatus, setPaymentStatus] = useState("PENDING");
  const [errorMsg, setErrorMsg] = useState("");
  const [amountPaid, setAmountPaid] = useState(null);

  useEffect(() => {
    if (!merchantOrderId) {
      setErrorMsg("Payment order ID missing");
      setLoading(false);
      return;
    }
    checkStatus(merchantOrderId);
  }, [merchantOrderId]);

  const checkStatus = async (id) => {
    try {
      const res = await sellerApi.checkCodCommissionStatus(id);
      const data = res.data?.data || res.data?.result || {};
      const status = data.status || "FAILED";
      setPaymentStatus(status);
      if (data.payment?.amount) {
        setAmountPaid(data.payment.amount);
      }
      if (status === "PENDING" || status === "CREATED") {
        setTimeout(() => checkStatus(id), 3000);
      } else {
        setLoading(false);
      }
    } catch (error) {
      setErrorMsg(error.response?.data?.message || "Failed to check status");
      setPaymentStatus("FAILED");
      setLoading(false);
    }
  };

  if (loading || paymentStatus === "PENDING" || paymentStatus === "CREATED") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="w-full max-w-md p-8 text-center flex flex-col items-center bg-white rounded-2xl shadow-lg border border-slate-100">
          <Loader2 className="h-12 w-12 animate-spin text-brand-600 mb-4" />
          <h2 className="text-xl font-bold text-slate-900">Verifying Commission Payment</h2>
          <p className="text-sm text-slate-500 mt-2">
            Please wait while we confirm your COD platform commission settlement.
            Please do not refresh or close this tab.
          </p>
        </div>
      </div>
    );
  }

  if (paymentStatus === "CAPTURED") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="w-full max-w-md p-8 text-center flex flex-col items-center bg-white rounded-2xl shadow-lg border border-slate-100">
          <CheckCircle2 className="h-16 w-16 text-emerald-500 mb-4" />
          <h2 className="text-2xl font-black text-slate-900">Payment Successful!</h2>
          <p className="text-sm text-slate-600 mt-2 mb-2">
            {amountPaid
              ? `₹${Number(amountPaid).toLocaleString("en-IN")} has been successfully paid towards your COD commission dues.`
              : "Your COD commission payment has been settled successfully."}
          </p>
          <p className="text-xs text-slate-400 mb-6">
            Your wallet liability has been updated and the platform dues have been cleared.
          </p>
          <Link to="/seller/earnings" className="w-full">
            <Button className="w-full bg-brand-600 hover:bg-brand-700 text-white font-bold py-3 rounded-xl shadow-md">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Earnings &amp; Wallet
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="w-full max-w-md p-8 text-center flex flex-col items-center bg-white rounded-2xl shadow-lg border border-slate-100">
        <XCircle className="h-16 w-16 text-rose-500 mb-4" />
        <h2 className="text-2xl font-black text-slate-900">Payment Incomplete</h2>
        <p className="text-sm text-slate-600 mt-2 mb-6">
          {errorMsg || "The payment transaction could not be completed or was cancelled."}
        </p>
        <div className="w-full gap-3 flex flex-col">
          <Link to="/seller/earnings" className="w-full">
            <Button variant="outline" className="w-full py-3 rounded-xl font-bold">
              Back to Earnings
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
};

export default CodCommissionPaymentStatus;
