import React, { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import Button from "@/shared/components/ui/Button";
import { deliveryApi } from "../services/deliveryApi";

const CodPaymentStatus = () => {
    const [searchParams] = useSearchParams();
    const merchantOrderId = searchParams.get("merchantOrderId");
    const [loading, setLoading] = useState(true);
    const [paymentStatus, setPaymentStatus] = useState("PENDING");
    const [errorMsg, setErrorMsg] = useState("");

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
            const res = await deliveryApi.checkCodRemittancePhonePeStatus(id);
            const data = res.data?.result || {};
            setPaymentStatus(data.status || "FAILED");
            // If it's pending, keep polling or let webhook complete
            if (data.status === "PENDING" || data.status === "CREATED") {
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
            <div className="flex min-h-screen items-center justify-center py-6 border-b border-gray-100 px-2 bg-white pb-24">
                <div className="w-full max-w-sm p-8 text-center flex flex-col items-center">
                    <Loader2 className="h-10 w-10 animate-spin text-orange-500 mb-4" />
                    <h2 className="text-xl font-bold text-gray-900">Verifying Payment</h2>
                    <p className="text-sm text-gray-500 mt-2">
                        Please wait while we confirm your COD remittance payment.
                        Do not hit back or refresh.
                    </p>
                </div>
            </div>
        );
    }

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
