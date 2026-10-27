import React, { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CheckCircle2, XCircle } from "lucide-react";
import Button from "@/shared/components/ui/Button";

// COD remittance payment now completes in-page via Razorpay's embedded
// Checkout.js modal (see CodCash.jsx's handlePayNow) instead of a
// redirect-based gateway hop, so nothing navigates here anymore. Kept as a
// dead-link-safe fallback in case an old link/bookmark still points at it.
const CodPaymentStatus = () => {
    const [searchParams] = useSearchParams();
    const razorpayPaymentId = searchParams.get("razorpayPaymentId");
    const [paymentStatus] = useState(razorpayPaymentId ? "CAPTURED" : "FAILED");
    const [errorMsg] = useState(
        razorpayPaymentId ? "" : "This payment status link is no longer used — check the COD Cash page for the latest status.",
    );

    if (paymentStatus === "CAPTURED") {
        return (
            <div className="flex min-h-screen items-center justify-center py-6 border-b border-gray-100 px-2 bg-white pb-24">
                <div className="w-full max-w-sm p-8 text-center flex flex-col items-center">
                    <CheckCircle2 className="h-14 w-14 text-green-500 mb-4" />
                    <h2 className="text-2xl font-bold text-gray-900">Payment Successful!</h2>
                    <p className="text-sm text-gray-500 mt-2 mb-6">
                        Your COD cash payment has been submitted to the platform.
                    </p>
                    <div className="w-full gap-3 flex flex-col">
                        <Link to="/delivery/cod-cash">
                            <Button fullWidth className="bg-green-600 hover:bg-green-700">Back to COD Cash</Button>
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex min-h-screen items-center justify-center py-6 border-b border-gray-100 px-2 bg-white pb-24">
            <div className="w-full max-w-sm p-8 text-center flex flex-col items-center">
                <XCircle className="h-14 w-14 text-red-500 mb-4" />
                <h2 className="text-2xl font-bold text-gray-900">Payment Failed</h2>
                <p className="text-sm text-gray-500 mt-2 mb-6">
                    {errorMsg || "Your payment could not be completed."}
                </p>
                <div className="w-full gap-3 flex flex-col">
                    <Link to="/delivery/cod-cash">
                        <Button fullWidth variant="outline">Try Again</Button>
                    </Link>
                </div>
            </div>
        </div>
    );
};

export default CodPaymentStatus;
