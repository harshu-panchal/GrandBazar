import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Percent, Store, Loader2, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import Button from "@shared/components/ui/Button";
import Card from "@shared/components/ui/Card";
import { sellerApi } from "../services/sellerApi";
import { useAuth } from "@core/context/AuthContext";

const ChooseBusinessModel = () => {
  const navigate = useNavigate();
  const { user, refreshUser } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChooseSubscription = async () => {
    setIsSubmitting(true);
    try {
      await sellerApi.chooseBusinessModel({ businessModel: "subscription" });
      toast.success("Subscription model selected. Choose a plan and pay with PhonePe.");
      if (typeof refreshUser === "function") {
        await refreshUser();
      }
      navigate("/seller/subscription", { replace: true });
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to select subscription model");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChooseCommission = async () => {
    setIsSubmitting(true);
    try {
      await sellerApi.chooseBusinessModel({ businessModel: "commission" });
      toast.success("Commission model activated. You can start selling.");
      if (typeof refreshUser === "function") {
        await refreshUser();
      }
      const hasApprovedStore = (user?.stores || []).some(
        (store) =>
          store.isVerified === true &&
          store.isActive === true &&
          (store.applicationStatus || "approved") === "approved",
      );
      navigate(hasApprovedStore ? "/seller" : "/seller/stores", { replace: true });
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to activate commission model");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-primary-50/30 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-3xl space-y-6"
      >
        <div className="text-center space-y-2">
          <p className="text-xs font-bold uppercase tracking-widest text-primary-600">Step 7</p>
          <h1 className="text-3xl font-bold text-slate-900">Choose your business model</h1>
          <p className="text-slate-500 max-w-xl mx-auto">
            Select how you want to earn on GrandBazar. You can request a switch to subscription later.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <Card className="p-6 border-2 border-primary-200 bg-white shadow-lg ring-2 ring-primary-100">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-12 w-12 rounded-2xl bg-primary-100 flex items-center justify-center">
                <Percent className="h-6 w-6 text-primary-600" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">Commission model</h2>
                <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wide">Available now</p>
              </div>
            </div>
            <ul className="text-sm text-slate-600 space-y-2 mb-6">
              <li>• No upfront subscription fee</li>
              <li>• Set customer prices on your products</li>
              <li>• Platform commission deducted per order</li>
              <li>• Start selling immediately after store approval</li>
            </ul>
            <Button
              className="w-full"
              onClick={handleChooseCommission}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Activating...
                </>
              ) : (
                <>
                  Choose commission model
                  <ArrowRight className="h-4 w-4 ml-2" />
                </>
              )}
            </Button>
          </Card>

          <Card className="p-6 border border-slate-200 bg-white shadow-md hover:border-primary-200 transition-all">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-12 w-12 rounded-2xl bg-violet-100 flex items-center justify-center">
                <Store className="h-6 w-6 text-violet-600" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">Subscription model</h2>
                <p className="text-xs font-semibold text-violet-600 uppercase tracking-wide">PhonePe payment</p>
              </div>
            </div>
            <ul className="text-sm text-slate-600 space-y-2 mb-6">
              <li>• Pay rental for shop & product capacity</li>
              <li>• Keep 100% of product sales (no commission)</li>
              <li>• Pay securely with PhonePe</li>
              <li>• Instant activation after successful payment</li>
            </ul>
            <Button
              variant="outline"
              className="w-full"
              onClick={handleChooseSubscription}
              disabled={isSubmitting}
            >
              Choose subscription model
            </Button>
          </Card>
        </div>
      </motion.div>
    </div>
  );
};

export default ChooseBusinessModel;
