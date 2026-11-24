import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { customerApi } from "../services/customerApi";
import LiveTrackingMap from "../components/order/LiveTrackingMap";

// Public, no-login tracking page opened from the WhatsApp link. The signed
// token in the URL is the credential (see backend orderTrackingLinkService).
const POLL_MS = 10000;

const PublicTrackingPage = () => {
    const { token } = useParams();
    const [data, setData] = useState(null);
    const [error, setError] = useState("");

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            try {
                const res = await customerApi.getPublicTracking(token);
                if (!cancelled) { setData(res?.data?.result); setError(""); }
            } catch (err) {
                if (!cancelled) setError(err?.response?.data?.message || "Unable to load tracking");
            }
        };
        load();
        const timer = setInterval(load, POLL_MS);
        return () => { cancelled = true; clearInterval(timer); };
    }, [token]);

    if (error && !data) return <div className="p-8 text-center text-sm font-semibold text-slate-600">{error}</div>;
    if (!data) return <div className="flex justify-center p-12"><Loader2 className="animate-spin" /></div>;

    const delivering = data.workflowStatus === "OUT_FOR_DELIVERY";
    return (
        <div className="mx-auto max-w-xl p-4">
            <p className="mb-3 text-xs font-black uppercase text-slate-500">Order {data.orderId}</p>
            <div className="h-[420px] overflow-hidden rounded-2xl">
                <LiveTrackingMap
                    status={data.status}
                    workflowStatus={data.workflowStatus}
                    riderName={data.riderName}
                    riderLocation={data.riderLocation}
                    sellerLocation={data.sellerLocation}
                    destinationLocation={data.destinationLocation}
                    routePhase={delivering ? "delivery" : "pickup"}
                />
            </div>
        </div>
    );
};

export default PublicTrackingPage;
