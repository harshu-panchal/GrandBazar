import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Landmark, AlertTriangle, CheckCircle2, RotateCw } from "lucide-react";
import Button from "@/shared/components/ui/Button";
import Input from "@/shared/components/ui/Input";
import { useAuth } from "@core/context/AuthContext";
import { toast } from "sonner";
import { deliveryApi } from "../../services/deliveryApi";

const maskAccount = (accountNumber) => {
  if (!accountNumber) return "Not added";
  const value = String(accountNumber);
  if (value.length <= 4) return value;
  return `${"X".repeat(Math.max(value.length - 4, 4))}${value.slice(-4)}`;
};

const BankAccount = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [form, setForm] = useState({ accountHolder: "", accountNumber: "", ifsc: "" });
  const [submitting, setSubmitting] = useState(false);

  const bankDetails = {
    accountHolder: user?.accountHolder || user?.name || "—",
    accountNumber: user?.accountNumber
      ? maskAccount(user.accountNumber)
      : "Not added",
    ifsc: user?.ifsc || "—",
    hasAccount: Boolean(user?.accountNumber),
  };

  const handleChange = (field) => (e) => {
    let value = e.target.value;
    if (field === "accountNumber") value = value.replace(/\D/g, "").slice(0, 18);
    if (field === "ifsc") value = value.toUpperCase().slice(0, 11);
    if (field === "accountHolder") value = value.replace(/[^a-zA-Z .]/g, "");
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async () => {
    const holder = form.accountHolder.trim();
    const accountNumber = form.accountNumber.trim();
    const ifsc = form.ifsc.trim();

    if (!holder || !accountNumber || !ifsc) {
      toast.error("Please fill in all fields before submitting");
      return;
    }
    if (!/^[A-Za-z .]{2,}$/.test(holder)) {
      toast.error("Account holder name should contain letters and spaces only");
      return;
    }
    if (!/^\d{9,18}$/.test(accountNumber)) {
      toast.error("Please enter a valid bank account number (9-18 digits)");
      return;
    }
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) {
      toast.error("Please enter a valid IFSC code (e.g. HDFC0001234)");
      return;
    }

    setSubmitting(true);
    try {
      await deliveryApi.createSupportTicket({
        subject: "Bank Account Change Request",
        description: [
          "Please update my bank account details for payouts.",
          `Account Holder: ${holder}`,
          `Account Number: ${accountNumber}`,
          `IFSC Code: ${ifsc}`,
        ].join("\n"),
        priority: "medium",
        userType: "Rider",
      });
      toast.success("Request submitted — support will contact you shortly");
      setForm({ accountHolder: "", accountNumber: "", ifsc: "" });
    } catch (error) {
      toast.error(
        error?.response?.data?.message ||
          "Failed to submit request. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-white shadow-sm sticky top-0 z-10">
        <div className="flex items-center p-4">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-full hover:bg-gray-100 transition-colors mr-2"
          >
            <ArrowLeft size={20} className="text-gray-600" />
          </button>
          <h1 className="ds-h3 text-gray-900">Bank Account</h1>
        </div>
      </div>

      <div className="p-4 max-w-lg mx-auto space-y-6">
        {/* Bank Card Visual */}
        <div className="bg-gradient-to-br from-brand-900 to-brand-800 text-white p-6 rounded-2xl shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>

          <div className="flex justify-between items-start mb-8 relative z-10">
            <Landmark size={32} className="text-white/80" />
            <span className="bg-brand-500/20 text-brand-300 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider border border-brand-500/30 flex items-center">
              <CheckCircle2 size={12} className="mr-1" />
              {bankDetails.hasAccount ? "Active" : "Incomplete"}
            </span>
          </div>

          <div className="space-y-1 relative z-10">
            <p className="text-brand-200 text-xs uppercase tracking-wider">
              Account Number
            </p>
            <p className="font-mono text-2xl tracking-widest">
              {bankDetails.accountNumber}
            </p>
          </div>

          <div className="flex justify-between items-end mt-8 relative z-10">
            <div>
              <p className="text-brand-200 text-xs uppercase tracking-wider mb-1">
                Account Holder
              </p>
              <p className="font-bold text-lg">{bankDetails.accountHolder}</p>
            </div>
            <div className="text-right">
              <p className="text-brand-200 text-xs uppercase tracking-wider mb-1">
                IFSC
              </p>
              <p className="text-white font-bold">{bankDetails.ifsc}</p>
            </div>
          </div>
        </div>

        {/* Info Box */}
        <div className="bg-yellow-50 border border-yellow-100 p-4 rounded-xl flex items-start">
          <AlertTriangle
            size={20}
            className="text-yellow-600 mr-3 flex-shrink-0 mt-0.5"
          />
          <div>
            <h4 className="text-yellow-800 font-bold text-sm mb-1">
              Payment Information
            </h4>
            <p className="text-xs text-yellow-700 leading-relaxed">
              Your weekly earnings will be deposited to this account. Bank
              detail changes are verified by support before they take effect.
            </p>
          </div>
        </div>

        {/* Change Request Form */}
        <div className="pt-4">
          <h3 className="ds-h4 text-gray-900 mb-1">Request Change</h3>
          <p className="text-xs text-gray-500 mb-4">
            This creates a support ticket. Our team will verify your identity
            before updating your bank details.
          </p>
          <div className="space-y-4">
            <Input
              label="Account Holder Name"
              placeholder="As per bank records"
              value={form.accountHolder}
              onChange={handleChange("accountHolder")}
              disabled={submitting}
            />
            <Input
              label="Account Number"
              placeholder="Enter new account number"
              value={form.accountNumber}
              onChange={handleChange("accountNumber")}
              disabled={submitting}
            />
            <Input
              label="IFSC Code"
              placeholder="e.g. HDFC0001234"
              value={form.ifsc}
              onChange={handleChange("ifsc")}
              disabled={submitting}
            />
            <Button className="w-full" onClick={handleSubmit} disabled={submitting}>
              {submitting ? (
                <RotateCw className="animate-spin mr-2" size={16} />
              ) : null}
              {submitting ? "Submitting..." : "Submit Request"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BankAccount;
