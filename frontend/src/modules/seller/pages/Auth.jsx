import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@core/context/AuthContext";
import { setRoleToken } from "@core/utils/authSession";
import { useSettings } from "@core/context/SettingsContext";
import {
  Mail,
  Lock,
  User,
  Phone,
  ArrowRight,
  Store,
  Rocket,
  Globe,
  CheckCircle,
  Loader2,
  Eye,
  EyeOff,
  Building2,
  Layers,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import Lottie from "lottie-react";
import sellerAnimation from "../../../assets/INSTANT_6.json";
import { sellerApi } from "../services/sellerApi";

const createInitialVerificationState = () => ({
  status: "idle",
  otp: "",
  token: "",
  isOtpVisible: false,
  isSending: false,
  isVerifying: false,
  verifiedValue: "",
});

const ONBOARDING_STEPS = [
  {
    title: "Create admin account",
    description: "Verify your email and phone, then set a secure password.",
  },
  {
    title: "Add shop locations",
    description: "Register each shop with its own address, category, and KYC.",
  },
  {
    title: "Admin approval per shop",
    description: "Every shop is reviewed independently before going live.",
  },
  {
    title: "Run all shops from one panel",
    description: "Switch between stores, staff, products, and orders anytime.",
  },
];

const Auth = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { login } = useAuth();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const appName = settings?.appName || "App";
  const logoUrl = settings?.logoUrl || "";
  const [verifications, setVerifications] = useState({
    email: createInitialVerificationState(),
    phone: createInitialVerificationState(),
  });

  const [formData, setFormData] = useState({
    email: "",
    password: "",
    name: "",
    phone: "",
  });

  const updateVerificationState = (field, updates) => {
    setVerifications((prev) => ({
      ...prev,
      [field]: {
        ...prev[field],
        ...updates,
      },
    }));
  };

  const resetVerificationState = (field) => {
    setVerifications((prev) => ({
      ...prev,
      [field]: createInitialVerificationState(),
    }));
  };

  const getVerificationPayload = (field) => {
    const channel = field === "email" ? "email" : "phone";
    return channel === "email"
      ? { channel, email: formData.email }
      : { channel, phone: formData.phone };
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === "name") {
      // Owner name: only alphabets and spaces
      const cleaned = value.replace(/[^a-zA-Z\s]/g, "");
      setFormData({ ...formData, [name]: cleaned });
    } else if (name === "email") {
      // Business email: trim leading spaces, disallow spaces inside
      const cleaned = value.replace(/\s+/g, "").toLowerCase();
      if (cleaned !== formData.email) {
        resetVerificationState("email");
      }
      setFormData({ ...formData, [name]: cleaned });
    } else if (name === "phone") {
      // Contact number: only digits, max 10 characters
      const digitsOnly = value.replace(/[^0-9]/g, "").slice(0, 10);
      if (digitsOnly !== formData.phone) {
        resetVerificationState("phone");
      }
      setFormData({ ...formData, [name]: digitsOnly });
    } else if (name === "password") {
      setFormData({ ...formData, [name]: value });
    } else {
      setFormData({ ...formData, [name]: value });
    }
  };

  const handleSendVerificationOtp = async (field) => {
    const currentValue = formData[field];
    const isEmailField = field === "email";

    if (
      (isEmailField &&
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(currentValue || "")) ||
      (!isEmailField && !/^[0-9]{10}$/.test(currentValue || ""))
    ) {
      toast.error(
        isEmailField
          ? "Enter a valid email before requesting OTP."
          : "Enter a valid 10-digit phone number before requesting OTP.",
      );
      return;
    }

    updateVerificationState(field, {
      isSending: true,
      isOtpVisible: true,
      otp: "",
      token: "",
      status: "sending",
    });

    try {
      await sellerApi.sendVerificationOtp(getVerificationPayload(field));
      updateVerificationState(field, {
        isSending: false,
        isOtpVisible: true,
        status: "otp-sent",
      });
      toast.success(
        isEmailField
          ? "Verification OTP sent to your email."
          : "Verification OTP sent to your phone.",
      );
    } catch (error) {
      updateVerificationState(field, {
        isSending: false,
        status: "idle",
      });
      toast.error(error.response?.data?.message || "Failed to send OTP");
    }
  };

  const handleVerifyOtp = async (field) => {
    const verificationState = verifications[field];
    if (!/^\d{4}$/.test(verificationState.otp || "")) {
      toast.error("Enter a valid 4-digit OTP.");
      return;
    }

    updateVerificationState(field, {
      isVerifying: true,
    });

    try {
      const response = await sellerApi.verifyVerificationOtp({
        ...getVerificationPayload(field),
        otp: verificationState.otp,
      });
      const verificationToken =
        response.data?.result?.verificationToken || "";

      updateVerificationState(field, {
        isVerifying: false,
        isOtpVisible: false,
        status: "verified",
        otp: "",
        token: verificationToken,
        verifiedValue: formData[field],
      });
      toast.success(
        field === "email"
          ? "Email verified successfully."
          : "Phone number verified successfully.",
      );
    } catch (error) {
      updateVerificationState(field, {
        isVerifying: false,
      });
      toast.error(error.response?.data?.message || "Failed to verify OTP");
    }
  };

  const handlePanelWheel = (e) => {
    const panel = e.currentTarget;
    if (panel.scrollHeight <= panel.clientHeight) {
      return;
    }

    e.preventDefault();
    panel.scrollTop += e.deltaY;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      if (!isLogin) {
        const email = formData.email || "";
        const phone = formData.phone || "";
        if (!formData.name?.trim()) {
          toast.error("Please enter your full name.");
          return;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          toast.error("Please enter a valid business email address.");
          return;
        }
        if (!/^[0-9]{10}$/.test(phone)) {
          toast.error("Please enter a valid 10-digit contact number.");
          return;
        }
        if (verifications.email.status !== "verified" || !verifications.email.token) {
          toast.error("Please verify your business email before continuing.");
          return;
        }
        if (verifications.phone.status !== "verified" || !verifications.phone.token) {
          toast.error("Please verify your contact number before continuing.");
          return;
        }
      }

      const pwd = (formData.password || "").trim();
      if (pwd.length < 6) {
        toast.error("Password must be at least 6 characters.");
        return;
      }

      setIsLoading(true);

      const response = isLogin
        ? await sellerApi.login({
          email: formData.email,
          password: formData.password,
        })
        : await sellerApi.signup({
          name: formData.name.trim(),
          email: formData.email,
          phone: formData.phone,
          password: formData.password,
          emailVerificationToken: verifications.email.token,
          phoneVerificationToken: verifications.phone.token,
        });

      if (isLogin) {
        const {
          token,
          seller,
          stores,
          activeStoreId,
          hasApprovedStore,
          isAccountApproved,
          accountApplicationStatus,
          rejectionReason,
        } = response.data.result;
        if (activeStoreId) {
          localStorage.setItem('seller_active_store', String(activeStoreId));
        }
        setRoleToken('seller', token);
        login({
          ...seller,
          stores: stores || [],
          token,
          role: "seller",
          isAccountApproved,
          accountApplicationStatus,
          rejectionReason: rejectionReason || seller?.rejectionReason || "",
          businessModel: response.data.result?.businessModel ?? seller?.businessModel ?? null,
        });
        toast.success("Welcome back, Partner!");

        const isOwner = !seller?.subSellerId && !seller?.parentId;
        const accountApproved =
          isAccountApproved ??
          (seller?.isVerified === true && (accountApplicationStatus || "pending") === "approved");
        const businessModel = response.data.result?.businessModel ?? seller?.businessModel ?? null;

        if (isOwner && !accountApproved) {
          navigate("/seller/pending-approval", {
            replace: true,
            state: {
              applicationStatus: accountApplicationStatus || "pending",
              rejectionReason: rejectionReason || "",
            },
          });
        } else if (isOwner && !businessModel) {
          navigate("/seller/choose-model", { replace: true });
        } else if (hasApprovedStore === false && isOwner) {
          navigate("/seller/stores");
        } else {
          navigate("/seller");
        }
      } else {
        const {
          token,
          seller,
          account,
          stores,
          activeStoreId,
          isAccountApproved,
          accountApplicationStatus,
        } = response.data.result;
        if (token) {
          if (activeStoreId) {
            localStorage.setItem('seller_active_store', String(activeStoreId));
          }
          setRoleToken('seller', token);
          login({
            ...(seller || account),
            stores: stores || [],
            token,
            role: "seller",
            isAccountApproved,
            accountApplicationStatus,
          });
        }
        setVerifications({
          email: createInitialVerificationState(),
          phone: createInitialVerificationState(),
        });
        setFormData({
          email: formData.email,
          password: "",
          name: formData.name,
          phone: formData.phone,
        });
        toast.success("Registration submitted. Admin will review your seller admin account.");
        navigate("/seller/pending-approval", {
          replace: true,
          state: {
            applicationStatus: accountApplicationStatus || "pending",
          },
        });
      }
    } catch (error) {
      if (isLogin && error.response?.status === 403) {
        const applicationStatus =
          error.response?.data?.result?.applicationStatus || "pending";
        const rejectionReason =
          error.response?.data?.result?.rejectionReason || "";
        navigate("/seller/pending-approval", {
          replace: true,
          state: {
            approvalRequired: true,
            applicationStatus,
            rejectionReason,
          },
        });
      }
      toast.error(error.response?.data?.message || "Authentication failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#fcfaff] p-6 font-['Outfit'] overflow-hidden relative">
      {/* Elegant Ambient Background */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-5%] w-[60%] h-[60%] bg-slate-100/50 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-5%] right-[-5%] w-[40%] h-[40%] bg-slate-50/50 rounded-full blur-[100px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative z-10 w-full max-w-[1000px] min-h-[600px] max-h-[90vh] bg-white rounded-lg shadow-[0_50px_120px_rgba(0,0,0,0.04)] border border-white flex flex-col md:flex-row overflow-hidden">
        {/* Visual Side Panel */}
        <div className="hidden md:flex w-[45%] bg-linear-to-br from-slate-900 via-slate-950 to-black relative flex-col items-center justify-center p-10 overflow-hidden">
          {/* Abstract Decorative Circles */}
          <div className="absolute inset-0 opacity-20">
            <div className="absolute top-0 left-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />
            <div className="absolute bottom-0 right-0 w-96 h-96 bg-slate-500/10 rounded-full blur-3xl translate-x-1/2 translate-y-1/2" />
          </div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="relative z-10 w-full flex flex-col items-center">
            {/* Lottie Animation for Seller */}
            <div className="w-full max-w-[350px] drop-shadow-[0_20px_60px_rgba(0,0,0,0.5)]">
              <Lottie
                animationData={sellerAnimation}
                loop={true}
                className="w-full h-auto"
              />
            </div>

            <div className="mt-8 text-center space-y-4">
              <h2 className="text-2xl font-black text-white tracking-tight leading-tight uppercase underline decoration-white/20 underline-offset-8">
                Multi-Shop <span className="text-slate-600">Admin.</span>
              </h2>
              {!isLogin && (
                <p className="text-xs text-slate-400 font-medium max-w-[260px] mx-auto leading-relaxed">
                  One admin account. Unlimited shops. Each location gets its own approval and operations.
                </p>
              )}
            </div>

            {!isLogin && (
              <div className="mt-10 w-full max-w-xs space-y-3">
                {ONBOARDING_STEPS.map((item, index) => (
                  <div
                    key={item.title}
                    className={`flex gap-3 rounded-xl border px-3 py-3 transition-all ${
                      index === 0
                        ? "border-white/20 bg-white/10"
                        : "border-white/5 bg-white/[0.03]"
                    }`}
                  >
                    <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[11px] font-black ${
                      index === 0 ? "bg-white text-slate-900" : "bg-white/10 text-white/70"
                    }`}>
                      {index + 1}
                    </div>
                    <div>
                      <p className="text-[11px] font-black uppercase tracking-wide text-white">{item.title}</p>
                      <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">{item.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>

          {/* Partner Badges */}
          <div className="absolute bottom-12 left-0 right-0 px-12 flex justify-between items-center opacity-60">
            <div className="flex items-center gap-2 text-white/80">
              <Rocket size={16} />
              <span className="text-[10px] font-black uppercase tracking-widest">
                Growth First
              </span>
            </div>
            <div className="flex items-center gap-2 text-white/80">
              <Globe size={16} />
              <span className="text-[10px] font-black uppercase tracking-widest">
                Pan India
              </span>
            </div>
          </div>
        </div>

        {/* Form Content Side */}
        <div
          className="w-full md:w-[55%] min-h-0 p-8 pt-12 md:p-12 md:pt-16 flex flex-col justify-center bg-white overflow-y-auto overscroll-contain touch-pan-y custom-scrollbar relative"
          onWheelCapture={handlePanelWheel}
          style={{ WebkitOverflowScrolling: "touch" }}>
          <div className="hidden md:flex absolute top-8 right-8 z-20">
            <div className="w-20 h-20 rounded-2xl bg-slate-50 border border-slate-200 shadow-sm flex items-center justify-center overflow-hidden">
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt={`${appName} logo`}
                  className="w-full h-full object-cover"
                />
              ) : (
                <Store size={30} className="text-slate-700" />
              )}
            </div>
          </div>
          <AnimatePresence mode="wait">
            <motion.div
              key={isLogin ? "login" : "signup"}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
              className="space-y-8 py-4 md:py-6">
              <div className="space-y-4">
                <span className="inline-block px-4 py-1 bg-slate-100 text-slate-800 rounded-full text-[10px] font-black uppercase tracking-widest border border-slate-200">
                  {isLogin ? "Welcome Back" : "Seller Admin Registration"}
                </span>
                <h1 className="text-3xl font-black text-slate-900 tracking-tighter">
                  {isLogin ? (
                    <>Seller <span className="text-slate-900">Login</span></>
                  ) : (
                    <>Create <span className="text-slate-900">Admin Account</span></>
                  )}
                </h1>
                <p className="text-slate-600 font-medium text-base leading-relaxed">
                  {isLogin
                    ? "Access your multi-shop dashboard, switch stores, and manage operations."
                    : "Set up your seller admin profile. You will add individual shops with location and KYC from My Stores after signup."}
                </p>
              </div>

              {!isLogin && (
                <div className="grid grid-cols-2 gap-3 md:hidden">
                  {[
                    { icon: Building2, label: "Admin account" },
                    { icon: Layers, label: "Multiple shops" },
                    { icon: ShieldCheck, label: "Per-shop approval" },
                    { icon: Store, label: "One dashboard" },
                  ].map(({ icon: Icon, label }) => (
                    <div key={label} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5 flex items-center gap-2">
                      <Icon className="h-4 w-4 text-slate-500" />
                      <span className="text-[10px] font-bold text-slate-600">{label}</span>
                    </div>
                  ))}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                    {!isLogin && (
                      <div className="relative group">
                        <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-violet-600 transition-colors">
                          <User size={18} />
                        </div>
                        <input
                          type="text"
                          name="name"
                          required
                          placeholder="Admin / Owner full name"
                          className="w-full pl-12 pr-6 py-4 bg-slate-50 border-2 border-transparent rounded-lg text-sm font-bold text-slate-700 outline-none focus:bg-white focus:border-slate-200 transition-all placeholder:text-slate-300"
                          value={formData.name}
                          onChange={handleChange}
                        />
                      </div>
                    )}

                    <div className="relative group">
                      <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-violet-600 transition-colors">
                        <Mail size={18} />
                      </div>
                      <input
                        type="email"
                        name="email"
                        required
                        inputMode="email"
                        autoComplete="email"
                        placeholder="Business Email"
                        className="w-full pl-12 pr-28 py-4 bg-slate-50 border-2 border-transparent rounded-lg text-sm font-bold text-slate-700 outline-none focus:bg-white focus:border-slate-200 transition-all placeholder:text-slate-300"
                        value={formData.email}
                        onChange={handleChange}
                      />
                      {!isLogin && (
                        <button
                          type="button"
                          onClick={() => handleSendVerificationOtp("email")}
                          disabled={
                            verifications.email.isSending ||
                            verifications.email.status === "verified" ||
                            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email || "")
                          }
                          className={`absolute right-3 top-1/2 -translate-y-1/2 px-3 py-1.5 rounded-md text-[10px] font-black uppercase tracking-wider transition-all ${verifications.email.status === "verified"
                            ? "bg-brand-100 text-brand-700 cursor-default"
                            : "bg-slate-900 text-white hover:bg-black disabled:opacity-50 disabled:cursor-not-allowed"
                            }`}>
                          {verifications.email.isSending ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : verifications.email.status === "verified" ? (
                            "Verified"
                          ) : verifications.email.isOtpVisible ? (
                            "Resend"
                          ) : (
                            "Verify"
                          )}
                        </button>
                      )}
                    </div>
                    {!isLogin && verifications.email.isOtpVisible && verifications.email.status !== "verified" && (
                      <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                        <input
                          type="text"
                          inputMode="numeric"
                          maxLength={4}
                          placeholder="Enter email OTP"
                          value={verifications.email.otp}
                          onChange={(e) =>
                            updateVerificationState("email", {
                              otp: e.target.value.replace(/\D/g, "").slice(0, 4),
                            })
                          }
                          className="flex-1 bg-transparent text-sm font-bold text-slate-700 outline-none placeholder:text-slate-400"
                        />
                        <button
                          type="button"
                          onClick={() => handleVerifyOtp("email")}
                          disabled={verifications.email.isVerifying || verifications.email.otp.length !== 4}
                          className="rounded-md bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-100 disabled:opacity-50"
                        >
                          {verifications.email.isVerifying ? "Checking..." : "Confirm OTP"}
                        </button>
                      </div>
                    )}
                    {!isLogin && verifications.email.status === "verified" && (
                      <div className="flex items-center gap-2 text-[11px] font-bold text-brand-600">
                        <CheckCircle className="h-4 w-4" />
                        <span>Email verified successfully.</span>
                      </div>
                    )}

                    {!isLogin && (
                      <>
                        <div className="relative group">
                          <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-violet-600 transition-colors">
                            <Phone size={18} />
                          </div>
                          <input
                            type="tel"
                            name="phone"
                            required
                            placeholder="Contact Number"
                            className="w-full pl-12 pr-28 py-4 bg-slate-50 border-2 border-transparent rounded-lg text-sm font-bold text-slate-700 outline-none focus:bg-white focus:border-slate-200 transition-all placeholder:text-slate-300"
                            value={formData.phone}
                            onChange={handleChange}
                          />
                          <button
                            type="button"
                            onClick={() => handleSendVerificationOtp("phone")}
                            disabled={
                              verifications.phone.isSending ||
                              verifications.phone.status === "verified" ||
                              !/^[0-9]{10}$/.test(formData.phone || "")
                            }
                            className={`absolute right-3 top-1/2 -translate-y-1/2 px-3 py-1.5 rounded-md text-[10px] font-black uppercase tracking-wider transition-all ${verifications.phone.status === "verified"
                              ? "bg-brand-100 text-brand-700 cursor-default"
                              : "bg-slate-900 text-white hover:bg-black disabled:opacity-50 disabled:cursor-not-allowed"
                              }`}>
                            {verifications.phone.isSending ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : verifications.phone.status === "verified" ? (
                              "Verified"
                            ) : verifications.phone.isOtpVisible ? (
                              "Resend"
                            ) : (
                              "Verify"
                            )}
                          </button>
                        </div>
                        {verifications.phone.isOtpVisible && verifications.phone.status !== "verified" && (
                          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                            <input
                              type="text"
                              inputMode="numeric"
                              maxLength={4}
                              placeholder="Enter phone OTP"
                              value={verifications.phone.otp}
                              onChange={(e) =>
                                updateVerificationState("phone", {
                                  otp: e.target.value.replace(/\D/g, "").slice(0, 4),
                                })
                              }
                              className="flex-1 bg-transparent text-sm font-bold text-slate-700 outline-none placeholder:text-slate-400"
                            />
                            <button
                              type="button"
                              onClick={() => handleVerifyOtp("phone")}
                              disabled={verifications.phone.isVerifying || verifications.phone.otp.length !== 4}
                              className="rounded-md bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-100 disabled:opacity-50"
                            >
                              {verifications.phone.isVerifying ? "Checking..." : "Confirm OTP"}
                            </button>
                          </div>
                        )}
                        {verifications.phone.status === "verified" && (
                          <div className="flex items-center gap-2 text-[11px] font-bold text-brand-600">
                            <CheckCircle className="h-4 w-4" />
                            <span>Phone number verified successfully.</span>
                          </div>
                        )}
                      </>
                    )}

                    <div className="relative group">
                      <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-violet-600 transition-colors">
                        <Lock size={18} />
                      </div>
                      <input
                        type={showPassword ? "text" : "password"}
                        name="password"
                        required
                        minLength={6}
                        autoComplete="current-password"
                        placeholder="Enter your password"
                        className="w-full pl-12 pr-14 py-4 bg-slate-50 border-2 border-transparent rounded-lg text-sm font-bold text-slate-700 outline-none focus:bg-white focus:border-slate-200 transition-all placeholder:text-slate-300"
                        value={formData.password}
                        onChange={handleChange}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-600 transition-colors px-2"
                        tabIndex="-1">
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>

                    {!isLogin && (
                      <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-xs text-slate-600 leading-relaxed">
                        Shop location, categories, KYC documents, and bank details are collected when you add each shop from <span className="font-bold text-slate-800">My Stores</span> after creating your admin account.
                      </div>
                    )}

                <div className="flex gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full bg-slate-900 text-white rounded-lg py-4 text-sm font-black tracking-[2px] shadow-[0_25px_50px_-12px_rgba(0,0,0,0.3)] hover:bg-black transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-3 group">
                    {isLoading
                      ? "WORKING..."
                      : isLogin
                        ? "ENTER DASHBOARD"
                        : "CREATE ADMIN ACCOUNT"}
                    <ArrowRight
                      className="group-hover:translate-x-2 transition-transform"
                      size={20}
                    />
                  </button>
                </div>
              </form>

              <div className="pt-1 border-t border-slate-50 flex flex-col items-center gap-1">
                <p className="text-slate-600 font-bold text-sm">
                  {isLogin ? "New to the platform?" : "Already part of us?"}{" "}
                  <button
                    onClick={() => {
                      setIsLogin(!isLogin);
                      setVerifications({
                        email: createInitialVerificationState(),
                        phone: createInitialVerificationState(),
                      });
                    }}
                    className="text-slate-900 hover:text-black transition-colors px-2">
                    {isLogin ? "Register Seller Admin" : "Sign In"}
                  </button>
                </p>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Bottom Tagline */}
      <div className="absolute bottom-6 flex items-center gap-4 text-slate-300 text-[10px] font-black uppercase tracking-[6px]">
        Empowering Business Digitalization
      </div>
    </div>
  );
};

export default Auth;
