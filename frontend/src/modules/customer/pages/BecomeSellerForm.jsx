import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Store, Mail, User, CheckCircle, ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { customerApi } from "../services/customerApi";
import Button from "@shared/components/ui/Button";

const BecomeSellerForm = () => {
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    category: "",
  });

  const handleChange = (e) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.email) {
      toast.error("Please fill in the required fields");
      return;
    }

    setIsSubmitting(true);
    try {
      await customerApi.requestBecomeSeller(formData);
      setIsSuccess(true);
      toast.success("Details sent successfully!");
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to send request. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="h-10 w-10 text-emerald-600" />
          </div>
          <h1 className="text-3xl font-black text-slate-900">Email Sent!</h1>
          <p className="text-slate-500 font-medium pb-4">
            We've sent an email to <strong>{formData.email}</strong> containing the seller registration link and app download links. 
          </p>
          <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100 space-y-4">
            <p className="text-sm font-bold text-slate-700">Next steps:</p>
            <ul className="text-sm text-slate-500 text-left space-y-2">
              <li className="flex gap-2"><CheckCircle className="h-4 w-4 shrink-0 text-emerald-500 mt-0.5" /> Check your inbox for the email</li>
              <li className="flex gap-2"><CheckCircle className="h-4 w-4 shrink-0 text-emerald-500 mt-0.5" /> Click the registration link to create your seller account</li>
              <li className="flex gap-2"><CheckCircle className="h-4 w-4 shrink-0 text-emerald-500 mt-0.5" /> Download our dedicated seller apps manage your store</li>
            </ul>
          </div>
          <Button onClick={() => navigate("/")} className="mt-6 py-3.5 w-full">
            Return to Home
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4">
      <div className="max-w-xl mx-auto">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-slate-900 transition-colors mb-6"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>

        <div className="bg-white rounded-3xl p-6 sm:p-10 shadow-xl shadow-slate-200/50 border border-slate-100 relative overflow-hidden">
          {/* Decorative background element */}
          <div className="absolute -top-24 -right-24 w-48 h-48 bg-gradient-to-br from-violet-500 to-fuchsia-500 rounded-full opacity-10 blur-3xl pointer-events-none"></div>

          <div className="flex items-center gap-4 mb-8">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-600 flex items-center justify-center text-white shadow-lg shadow-violet-500/30">
              <Store className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-900">Become a Seller</h1>
              <p className="text-sm text-slate-500 mt-1">
                Enter your details to receive the registration links
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">
                Full Name <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <User className="h-5 w-5 text-slate-400" />
                </div>
                <input
                  type="text"
                  name="name"
                  required
                  placeholder="e.g. John Doe"
                  className="w-full pl-11 pr-4 py-3.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition-all font-medium"
                  value={formData.name}
                  onChange={handleChange}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">
                Email Address <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-slate-400" />
                </div>
                <input
                  type="email"
                  name="email"
                  required
                  placeholder="name@example.com"
                  className="w-full pl-11 pr-4 py-3.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition-all font-medium"
                  value={formData.email}
                  onChange={handleChange}
                />
              </div>
              <p className="text-[11px] text-slate-500 mt-2 font-medium">
                We'll send the seller app and portal links to this email.
              </p>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">
                Phone Number <span className="text-slate-400 font-normal">(Optional)</span>
              </label>
              <input
                type="tel"
                name="phone"
                placeholder="e.g. 9876543210"
                className="w-full px-4 py-3.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition-all font-medium"
                value={formData.phone}
                onChange={handleChange}
              />
            </div>

            <Button
              type="submit"
              disabled={isSubmitting}
              className="mt-8 py-4 w-full bg-gradient-to-r from-violet-600 via-fuchsia-600 to-orange-500 hover:from-violet-500 hover:via-fuchsia-500 hover:to-orange-400 text-white font-bold text-base shadow-lg shadow-violet-500/30 border-none"
            >
              {isSubmitting ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-5 w-5 animate-spin" /> Sending Links...
                </span>
              ) : (
                "Get Seller Links"
              )}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default BecomeSellerForm;
