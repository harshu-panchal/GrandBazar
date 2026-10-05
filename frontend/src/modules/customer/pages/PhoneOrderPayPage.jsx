import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Loader2, X, AlertTriangle } from "lucide-react";
import { customerApi } from "../services/customerApi";
import Button from "@shared/components/ui/Button";

// Public, no-login resolver for an admin-phone-order pay-by-link. The
// customer clicking this from SMS/email has no session on this device —
// the token itself (not a logged-in session) proves who they're paying
// for. On success we redirect straight into PhonePe's hosted pay page.
const PhoneOrderPayPage = () => {
    const { token } = useParams();
    const navigate = useNavigate();
    const [status, setStatus] = useState("resolving"); // resolving, error
    const [error, setError] = useState("");

    useEffect(() => {
        if (!token) {
            setStatus("error");
            setError("Invalid payment link");
            return;
        }

        let cancelled = false;
        (async () => {
            try {
                const response = await customerApi.resolvePhoneOrderPayLink(token);
                const redirectUrl = response?.data?.result?.redirectUrl;
                if (!redirectUrl) throw new Error("Unable to start payment");
                if (!cancelled) window.location.href = redirectUrl;
            } catch (err) {
                if (cancelled) return;
                setStatus("error");
                setError(
                    err?.response?.data?.message ||
                        err?.message ||
                        "This payment link is invalid or has expired",
                );
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [token]);

    return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="max-w-md w-full bg-white rounded-[2.5rem] p-8 shadow-2xl shadow-slate-200 border border-slate-100 text-center"
            >
                <div className="mb-8 flex justify-center">
                    {status === "resolving" ? (
                        <motion.div
                            animate={{ rotate: 360 }}
                            transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                            className="w-20 h-20 bg-brand-50 text-brand-500 rounded-full flex items-center justify-center shadow-inner"
                        >
                            <Loader2 size={40} />
                        </motion.div>
                    ) : (
                        <div className="w-20 h-20 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center shadow-lg shadow-rose-100/50">
                            <X size={40} strokeWidth={3} />
                        </div>
                    )}
                </div>

                {status === "resolving" ? (
                    <>
                        <h1 className="text-2xl font-black text-slate-800 mb-2 uppercase tracking-tight">
                            Preparing Payment
                        </h1>
                        <p className="text-slate-500 text-sm font-medium">
                            Taking you to a secure payment page. Do not refresh or go back.
                        </p>
                    </>
                ) : (
                    <>
                        <h1 className="text-2xl font-[1000] text-slate-800 mb-2 uppercase tracking-tight">
                            Link Unavailable
                        </h1>
                        <div className="bg-amber-50 rounded-2xl p-4 mb-6 border border-amber-100 flex items-start gap-3 text-left">
                            <AlertTriangle className="text-amber-600 shrink-0 mt-0.5" size={18} />
                            <p className="text-xs text-amber-800 font-medium leading-relaxed">{error}</p>
                        </div>
                        <p className="text-slate-500 text-sm font-medium mb-6">
                            Ask the person who sent you this link for a new one, or contact support.
                        </p>
                        <Button
                            onClick={() => navigate("/")}
                            className="w-full bg-slate-900 hover:bg-black text-white font-bold h-12 rounded-xl"
                        >
                            Back to Home
                        </Button>
                    </>
                )}
            </motion.div>
        </div>
    );
};

export default PhoneOrderPayPage;
