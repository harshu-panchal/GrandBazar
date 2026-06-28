import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  User,
  Mail,
  Phone,
  Store,
  Shield,
  Edit2,
  Save,
  X,
  Rocket,
  Globe,
  MapPin,
  CheckCircle,
  Truck,
  Percent,
  ArrowRightLeft,
  Loader2,
  CreditCard,
} from "lucide-react";
import { sellerApi } from "../services/sellerApi";
import { toast } from "sonner";
import Card from "@shared/components/ui/Card";
import Button from "@shared/components/ui/Button";
import MapPicker from "../../../shared/components/MapPicker";

const SellerProfile = () => {
  const [profile, setProfile] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isMapOpen, setIsMapOpen] = useState(false);
  const [deliverySettings, setDeliverySettings] = useState(null);
  const [businessModelData, setBusinessModelData] = useState(null);
  const [switchLoading, setSwitchLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    shopName: "",
    phone: "",
    email: "",
    lat: null,
    lng: null,
    radius: 5,
    address: "",
    bannerImage: "",
    description: "",
  });

  useEffect(() => {
    fetchProfile();
    sellerApi.getDeliverySettings()
      .then((response) => setDeliverySettings(response.data.result))
      .catch(() => setDeliverySettings(null));
  }, []);

  const isOwnerAccount = Boolean(profile) && !profile?.subSellerId;

  useEffect(() => {
    if (!isOwnerAccount) return;
    sellerApi.getBusinessModel()
      .then((response) => setBusinessModelData(response.data.result))
      .catch(() => setBusinessModelData(null));
  }, [isOwnerAccount, profile?.businessModel]);

  const handleRequestModelSwitch = async (requestedModel) => {
    setSwitchLoading(true);
    try {
      const response = await sellerApi.requestBusinessModelSwitch({ requestedModel });
      setBusinessModelData(response.data.result);
      toast.success(response.data.message || "Switch request submitted");
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to submit switch request");
    } finally {
      setSwitchLoading(false);
    }
  };

  const modelSwitch = businessModelData?.businessModelSwitch;
  const commissionSummary = businessModelData?.commissionSummary;
  const currentModel = businessModelData?.businessModel || profile?.businessModel;

  const fetchProfile = async () => {
    try {
      const response = await sellerApi.getProfile();
      const data = response.data.result;
      setProfile(data);
      setFormData({
        name: data.name,
        shopName: data.shopName,
        phone: data.phone,
        email: data.email,
        lat: data.location?.coordinates[1] || null,
        lng: data.location?.coordinates[0] || null,
        radius: data.serviceRadius || 5,
        address: data.address || "",
        bannerImage: data.bannerImage || "",
        description: data.description || "",
      });
    } catch (error) {
      toast.error("Failed to fetch profile");
    } finally {
      setIsLoading(false);
    }
  };

  const handleLocationSelect = (location) => {
    setFormData((prev) => ({
      ...prev,
      lat: location.lat,
      lng: location.lng,
      radius: location.radius,
      address: location.address,
    }));
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === "name") {
      // Disallow numbers in seller name
      const cleaned = value.replace(/[0-9]/g, "");
      setFormData({ ...formData, [name]: cleaned });
    } else if (name === "phone") {
      // Allow only digits, max 10 characters
      const digitsOnly = value.replace(/[^0-9]/g, "").slice(0, 10);
      setFormData({ ...formData, [name]: digitsOnly });
    } else if (name === "email") {
      // Trim spaces, keep as-is otherwise; HTML5 type=email will help validate shape
      setFormData({ ...formData, [name]: value.trimStart() });
    } else {
      setFormData({ ...formData, [name]: value });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    // Basic phone validation: must be exactly 10 digits
    if (!/^[0-9]{10}$/.test(formData.phone)) {
      toast.error("Please enter a valid 10-digit phone number.");
      return;
    }
    // Basic email validation
    if (!formData.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      toast.error("Please enter a valid email address.");
      return;
    }
    setIsSaving(true);
    try {
      const payload = {
        ...formData,
        lat: formData.lat,
        lng: formData.lng,
        radius: formData.radius,
      };
      await sellerApi.updateProfile(payload);
      toast.success("Profile updated successfully");
      setIsEditing(false);
      fetchProfile();
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to update profile");
    } finally {
      setIsSaving(false);
    }
  };

  const toggleStatus = async () => {
    try {
      const newStatus = !profile.isActive;
      await sellerApi.updateProfile({ isActive: newStatus });
      setProfile((prev) => ({ ...prev, isActive: newStatus }));
      toast.success(`Shop is now ${newStatus ? "Active" : "Inactive"}`);
    } catch (error) {
      toast.error("Failed to update shop status");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900"></div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-8 font-['Outfit']">
      {/* Header Section */}
      <div className="relative mb-24 px-4">
        {/* Banner Background */}
        <div className="bg-linear-to-r from-slate-900 via-slate-950 to-black h-64 rounded-lg shadow-2xl relative overflow-hidden group">
          {formData.bannerImage && (
            <img 
              src={formData.bannerImage} 
              alt="Shop Banner" 
              className="absolute inset-0 w-full h-full object-cover opacity-80"
            />
          )}
          <div className="absolute inset-0 opacity-20">
            <div className="absolute top-0 left-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2 pointer-events-none" />
            <div className="absolute bottom-0 right-0 w-96 h-96 bg-slate-500/10 rounded-full blur-3xl translate-x-1/2 translate-y-1/2 pointer-events-none" />
          </div>
          
          {/* Banner Upload Button */}
          {isEditing && (
            <label className="absolute top-4 right-4 bg-black/50 backdrop-blur text-white px-4 py-2 rounded-xl text-xs font-black tracking-widest uppercase cursor-pointer hover:bg-black/70 transition-all shadow-xl z-20 flex items-center gap-2 border border-white/20">
              <Edit2 size={14} /> Update Banner
              <input 
                type="file" 
                accept="image/*" 
                className="hidden" 
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    if (file.size > 2 * 1024 * 1024) {
                      toast.error("Image size must be less than 2MB");
                      return;
                    }
                    const reader = new FileReader();
                    reader.onloadend = () => {
                      setFormData(prev => ({ ...prev, bannerImage: reader.result }));
                    };
                    reader.readAsDataURL(file);
                  }
                }} 
              />
            </label>
          )}
        </div>

        {/* Profile Info Row */}
        <div className="absolute bottom-8 left-4 right-4 md:left-8 md:right-8 lg:left-12 lg:right-12 grid grid-cols-1 md:grid-cols-[176px_minmax(0,1fr)_auto] items-center md:items-end gap-6 md:gap-8">
          {/* Avatar Container */}
          <div className="h-44 w-44 rounded-full bg-white p-2 shadow-[0_30px_70px_rgba(0,0,0,0.15)] flex-shrink-0 mx-auto md:mx-0">
            <div className="h-full w-full rounded-full bg-slate-50 flex items-center justify-center border-4 border-slate-50">
              <span className="text-7xl font-black text-slate-900">
                {profile?.name?.charAt(0)}
              </span>
            </div>
          </div>

          {/* Info Block */}
          <div className="min-w-0 pb-2 md:pb-4 text-center md:text-left">
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 mb-3">
              <span className="px-4 py-1.5 bg-white/10 backdrop-blur-xl text-white text-[10px] font-black uppercase tracking-[2px] rounded-full border border-white/20">
                {profile?.role}
              </span>
              <button
                onClick={toggleStatus}
                className={`group flex items-center gap-2 px-4 py-1.5 text-[10px] font-black uppercase tracking-[2px] rounded-full border transition-all hover:scale-105 active:scale-95 ${
                  profile?.isActive
                    ? "bg-emerald-500 text-white border-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.4)]"
                    : "bg-rose-500 text-white border-rose-400 shadow-[0_0_20px_rgba(244,63,94,0.4)]"
                }`}>
                <div
                  className={`w-2 h-2 rounded-full animate-pulse ${
                    profile?.isActive ? "bg-emerald-200" : "bg-rose-200"
                  }`}
                />
                {profile?.isActive ? "Active" : "Inactive"}
              </button>
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-black text-white tracking-tighter drop-shadow-sm mb-1 break-words">
              {profile?.name}
            </h1>
            <p className="text-white/60 font-black tracking-[1px] text-lg">
              {profile?.shopName}
            </p>
          </div>

          {/* Action Button */}
          <div className="pb-2 md:pb-4 w-full md:w-auto">
            {!isEditing ? (
              <Button
                onClick={() => setIsEditing(true)}
                className="w-full md:w-auto bg-white/10 backdrop-blur-md text-white border border-white/20 hover:bg-white hover:text-slate-950 transition-all rounded-lg px-6 lg:px-12 py-4 md:py-5 flex items-center justify-center gap-3 md:gap-4 font-black tracking-[2px] md:tracking-[3px] text-xs shadow-[0_20px_40px_rgba(0,0,0,0.1)] hover:scale-[1.03] active:scale-[0.95] whitespace-nowrap">
                <Edit2 size={18} /> EDIT PROFILE
              </Button>
            ) : (
              <div className="w-full md:w-auto flex gap-3 md:gap-4 justify-center md:justify-end">
                <Button
                  onClick={() => setIsEditing(false)}
                  variant="outline"
                  className="h-[64px] w-[64px] flex items-center justify-center bg-white/5 text-white border border-white/20 hover:bg-white hover:text-slate-900 rounded-lg shadow-lg transition-all backdrop-blur-md">
                  <X size={24} className="stroke-[2.5]" />
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={isSaving}
                  className="min-w-0 max-w-full bg-white text-slate-950 hover:bg-slate-100 rounded-lg px-5 md:px-8 lg:px-12 py-4 md:py-5 font-black tracking-[2px] md:tracking-[3px] text-xs flex items-center gap-3 md:gap-4 shadow-[0_25px_50px_rgba(0,0,0,0.15)] h-[64px] whitespace-nowrap">
                  {isSaving ? (
                    "UPDATING..."
                  ) : (
                    <>
                      <Save size={20} /> SAVE CHANGES
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Main Info Card */}
        <div className="md:col-span-2 space-y-8">
          <Card className="p-8 border-none shadow-[0_20px_50px_rgba(0,0,0,0.05)] rounded-lg">
            <h3 className="text-xl font-black text-slate-900 mb-8 border-b border-slate-50 pb-4">
              Business Profile
            </h3>

            <form className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-3">
                  <label className="text-xs font-black uppercase tracking-widest text-slate-600 ml-1">
                    Seller Identity
                  </label>
                  <div className="relative group">
                    <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-slate-900 transition-colors">
                      <User size={18} />
                    </div>
                    <input
                      type="text"
                      name="name"
                      value={formData.name}
                      onChange={handleChange}
                      disabled={!isEditing}
                      className="w-full pl-14 pr-6 py-4 bg-slate-50 border-2 border-transparent rounded-lg text-sm font-bold text-slate-700 outline-none focus:bg-white focus:border-slate-100 transition-all disabled:opacity-70"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-xs font-black uppercase tracking-widest text-slate-600 ml-1">
                    Store Name
                  </label>
                  <div className="relative group">
                    <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-slate-900 transition-colors">
                      <Store size={18} />
                    </div>
                    <input
                      type="text"
                      name="shopName"
                      value={formData.shopName}
                      onChange={handleChange}
                      disabled={!isEditing}
                      className="w-full pl-14 pr-6 py-4 bg-slate-50 border-2 border-transparent rounded-lg text-sm font-bold text-slate-700 outline-none focus:bg-white focus:border-slate-100 transition-all disabled:opacity-70"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-xs font-black uppercase tracking-widest text-slate-600 ml-1">
                    Contact Number
                  </label>
                  <div className="relative group">
                    <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-slate-900 transition-colors">
                      <Phone size={18} />
                    </div>
                    <input
                      type="tel"
                      name="phone"
                      value={formData.phone}
                      onChange={handleChange}
                      disabled={!isEditing}
                      className="w-full pl-14 pr-6 py-4 bg-slate-50 border-2 border-transparent rounded-lg text-sm font-bold text-slate-700 outline-none focus:bg-white focus:border-slate-100 transition-all disabled:opacity-70"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-xs font-black uppercase tracking-widest text-slate-600 ml-1">
                    Email Address
                  </label>
                  <div className="relative group">
                    <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300">
                      <Mail size={18} />
                    </div>
                    <input
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleChange}
                      disabled={!isEditing}
                      className="w-full pl-14 pr-6 py-4 bg-slate-50 border-2 border-transparent rounded-lg text-sm font-bold text-slate-700 outline-none focus:bg-white focus:border-slate-100 transition-all disabled:opacity-70"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-xs font-black uppercase tracking-widest text-slate-600 ml-1">
                  About My Shop
                </label>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleChange}
                  disabled={!isEditing}
                  placeholder="Write a short description about your shop, what you sell, and your specialties..."
                  className="w-full px-6 py-4 bg-slate-50 border-2 border-transparent rounded-lg text-sm font-bold text-slate-700 outline-none focus:bg-white focus:border-slate-100 transition-all disabled:opacity-70 min-h-[120px] resize-y"
                />
              </div>
            </form>
          </Card>

          {/* Location & Radius Settings Card */}
          <Card className="p-8 border-none shadow-[0_20px_50px_rgba(0,0,0,0.05)] rounded-lg">
            <div className="flex justify-between items-center mb-8 border-b border-slate-50 pb-4">
              <h3 className="text-xl font-black text-slate-900">
                Location & Service Settings
              </h3>
              {!isEditing && (
                <Button
                  onClick={() => setIsEditing(true)}
                  className="bg-slate-900 text-white hover:bg-black rounded-lg px-6 py-2 text-[10px] font-black tracking-[2px]">
                  MANAGE
                </Button>
              )}
            </div>

            <div className="space-y-6">
              <div className="bg-slate-50 p-6 rounded-2xl border-2 border-slate-100/50 space-y-6">
                <div className="flex items-center justify-between gap-6">
                  <div className="flex items-center gap-4">
                    <div
                      className={`h-12 w-12 rounded-xl flex items-center justify-center transition-all ${
                        formData.lat
                          ? "bg-brand-100 text-brand-600 shadow-[0_8px_20px_-6px_rgba(16,185,129,0.3)]"
                          : "bg-white text-slate-400 shadow-sm"
                      }`}>
                      <MapPin size={24} />
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-black text-slate-900">
                        {formData.lat
                          ? "Store Location Pin"
                          : "Location Not Defined"}
                      </p>
                      <p className="text-xs text-slate-500 font-medium max-w-[400px] leading-relaxed">
                        {formData.address ||
                          "Click change to precisely mark your shop location on the map for delivery accuracy."}
                      </p>
                    </div>
                  </div>
                  {isEditing && (
                    <Button
                      type="button"
                      onClick={() => setIsMapOpen(true)}
                      className="bg-white text-slate-900 border-2 border-slate-200 hover:border-slate-900 rounded-lg px-8 py-3 text-[10px] font-black tracking-[2px] shadow-sm hover:shadow-md transition-all whitespace-nowrap">
                      CHANGE PIN
                    </Button>
                  )}
                </div>

                {formData.lat && (
                  <div className="pt-6 border-t border-slate-200/60 flex flex-wrap gap-8">
                    <div className="space-y-2">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
                        Service Radius
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-black text-slate-900">
                          {formData.radius}
                        </span>
                        <span className="text-xs font-bold text-slate-500 bg-slate-200/50 px-2 py-0.5 rounded-md">
                          KM
                        </span>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
                        Latitude
                      </span>
                      <span className="text-sm font-bold text-slate-700 tabular-nums">
                        {formData.lat.toFixed(6)}
                      </span>
                    </div>
                    <div className="space-y-2">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
                        Longitude
                      </span>
                      <span className="text-sm font-bold text-slate-700 tabular-nums">
                        {formData.lng.toFixed(6)}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-start gap-3 p-4 bg-amber-50 rounded-xl border border-amber-100">
                <Shield size={16} className="text-amber-600 mt-0.5" />
                <p className="text-xs text-amber-700 font-medium leading-relaxed">
                  Your shop location and service radius determine which
                  customers can view your products. Ensure the marker is placed
                  exactly at your physical storefront for accurate delivery
                  assignments.
                </p>
              </div>
            </div>
          </Card>
        </div>

        {/* Sidebar Card */}
        <div className="space-y-8">
          {isOwnerAccount && currentModel && (
            <Card className="p-8 border-none shadow-[0_20px_50px_rgba(0,0,0,0.05)] rounded-[40px]">
              <h4 className="text-[10px] font-black uppercase tracking-[4px] text-slate-400 mb-4">
                Business Model
              </h4>
              <div className="flex items-start gap-4 mb-5">
                <div className="h-10 w-10 rounded-xl bg-violet-100 flex items-center justify-center shrink-0">
                  {currentModel === "subscription" ? (
                    <CreditCard size={20} className="text-violet-700" />
                  ) : (
                    <Percent size={20} className="text-violet-700" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-black text-slate-900 capitalize">
                    {currentModel} model
                  </p>
                  <p className="text-xs text-slate-500 font-medium mt-1 leading-relaxed">
                    {currentModel === "subscription"
                      ? "You pay a subscription fee and keep 100% of product sales."
                      : "You set customer prices; platform commission is deducted per order."}
                  </p>
                </div>
              </div>

              {modelSwitch?.status === "pending" && (
                <div className="mb-4 p-4 rounded-xl bg-amber-50 border border-amber-100">
                  <p className="text-xs font-bold text-amber-800">
                    Switch to {modelSwitch.requestedModel} pending admin review
                  </p>
                  {modelSwitch.requestedAt && (
                    <p className="text-[10px] text-amber-600 mt-1">
                      Requested {new Date(modelSwitch.requestedAt).toLocaleString()}
                    </p>
                  )}
                </div>
              )}

              {modelSwitch?.status === "rejected" && (
                <div className="mb-4 p-4 rounded-xl bg-rose-50 border border-rose-100">
                  <p className="text-xs font-bold text-rose-800">Last switch request was rejected</p>
                  {modelSwitch.rejectionReason && (
                    <p className="text-[10px] text-rose-600 mt-1">{modelSwitch.rejectionReason}</p>
                  )}
                </div>
              )}

              {modelSwitch?.status === "approved" && modelSwitch.requestedModel === "subscription" && !profile?.hasActiveSubscription && (
                <div className="mb-4 p-4 rounded-xl bg-emerald-50 border border-emerald-100">
                  <p className="text-xs font-bold text-emerald-800">
                    Switch approved — complete PhonePe payment on the Subscription page to activate.
                  </p>
                </div>
              )}

              {modelSwitch?.status !== "pending" && currentModel === "commission" && (
                <Button
                  variant="outline"
                  className="w-full text-xs font-bold"
                  disabled={switchLoading}
                  onClick={() => handleRequestModelSwitch("subscription")}
                >
                  {switchLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <ArrowRightLeft className="h-4 w-4 mr-2" />
                      Request switch to subscription
                    </>
                  )}
                </Button>
              )}

              {modelSwitch?.status !== "pending"
                && currentModel === "subscription"
                && !profile?.hasActiveSubscription && (
                <Button
                  variant="outline"
                  className="w-full text-xs font-bold"
                  disabled={switchLoading}
                  onClick={() => handleRequestModelSwitch("commission")}
                >
                  {switchLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <ArrowRightLeft className="h-4 w-4 mr-2" />
                      Request switch to commission
                    </>
                  )}
                </Button>
              )}
            </Card>
          )}

          {isOwnerAccount && currentModel === "commission" && commissionSummary && (
            <Card className="p-8 border-none shadow-[0_20px_50px_rgba(0,0,0,0.05)] rounded-[40px]">
              <h4 className="text-[10px] font-black uppercase tracking-[4px] text-slate-400 mb-4">
                Your Commission Rates
              </h4>
              <p className="text-xs text-slate-500 font-medium mb-4 leading-relaxed">
                {commissionSummary.description}
              </p>

              {commissionSummary.scope === "seller" && (
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 mb-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">
                    Seller-wise rate
                  </p>
                  <p className="text-lg font-black text-slate-900">{commissionSummary.label}</p>
                </div>
              )}

              {(commissionSummary.scope === "seller"
                ? commissionSummary.categoryOverrides
                : commissionSummary.categoryRates
              )?.length > 0 && (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {(commissionSummary.scope === "seller"
                    ? commissionSummary.categoryOverrides
                    : commissionSummary.categoryRates
                  ).map((rate) => (
                    <div
                      key={rate.categoryId}
                      className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-100"
                    >
                      <span className="text-xs font-bold text-slate-700">{rate.categoryName}</span>
                      <span className="text-xs font-black text-slate-900">{rate.label}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          {isOwnerAccount && currentModel === "subscription" && (
            <Card className="p-8 border-none shadow-[0_20px_50px_rgba(0,0,0,0.05)] rounded-[40px]">
              <h4 className="text-[10px] font-black uppercase tracking-[4px] text-slate-400 mb-4">
                Commission
              </h4>
              <p className="text-sm font-black text-emerald-700">No product commission</p>
              <p className="text-xs text-slate-500 font-medium mt-2 leading-relaxed">
                On the subscription model you keep the full product sale amount. Your subscription fee covers platform access.
              </p>
            </Card>
          )}

          <Card className="p-8 border-none shadow-[0_20px_50px_rgba(0,0,0,0.05)] rounded-[40px]">
            <h4 className="text-[10px] font-black uppercase tracking-[4px] text-slate-400 mb-4">
              Delivery Settings
            </h4>
            <div className="flex items-start gap-4">
              <div className="h-10 w-10 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                <Truck size={20} className="text-slate-700" />
              </div>
              <div>
                <p className="text-sm font-black text-slate-900">
                  {deliverySettings?.logisticsMode === "external"
                    ? "External courier partners"
                    : "Platform delivery fleet"}
                </p>
                <p className="text-xs text-slate-500 font-medium mt-2 leading-relaxed">
                  {deliverySettings?.description
                    || "Your orders are fulfilled via the platform logistics network."}
                </p>
              </div>
            </div>
          </Card>

          <Card className="p-8 border-none shadow-[0_20px_50px_rgba(0,0,0,0.05)] rounded-[40px] bg-gradient-to-br from-slate-900 via-slate-900/95 to-slate-800 text-white">
            <h4 className="text-[10px] font-black uppercase tracking-[4px] text-white/40 mb-6">
              Security & Trust
            </h4>
            <div className="space-y-6">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-xl bg-white/10 flex items-center justify-center">
                  <Shield size={20} className="text-white" />
                </div>
                <div>
                  <p className="text-xs font-black uppercase tracking-widest text-white/60">
                    Verification
                  </p>
                  <p className="text-sm font-bold">
                    {profile?.isVerified
                      ? "Verified Merchant"
                      : "Verification Pending"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-xl bg-white/10 flex items-center justify-center">
                  <Rocket size={20} className="text-white" />
                </div>
                <div>
                  <p className="text-xs font-black uppercase tracking-widest text-white/60">
                    Partner Tier
                  </p>
                  <p className="text-sm font-bold">Standard Growth</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-xl bg-white/10 flex items-center justify-center">
                  <Globe size={20} className="text-white" />
                </div>
                <div>
                  <p className="text-xs font-black uppercase tracking-widest text-white/60">
                    Region
                  </p>
                  <p className="text-sm font-bold">Pan India Reach</p>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {isMapOpen && (
        <MapPicker
          isOpen={isMapOpen}
          onClose={() => setIsMapOpen(false)}
          onConfirm={handleLocationSelect}
          initialLocation={
            formData.lat ? { lat: formData.lat, lng: formData.lng } : null
          }
          initialRadius={formData.radius}
        />
      )}
    </div>
  );
};

export default SellerProfile;
