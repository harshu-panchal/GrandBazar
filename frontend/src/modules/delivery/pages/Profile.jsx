import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  User,
  Phone,
  Truck,
  CreditCard,
  FileText,
  HelpCircle,
  LogOut,
  ChevronRight,
  Shield,
  Bell,
  Settings,
  IndianRupee,
  ChevronDown,
  ChevronUp,
  Wallet,
} from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import Button from "@/shared/components/ui/Button";
import { useAuth } from "@core/context/AuthContext";
import { useSettings } from "@core/context/SettingsContext";
import axiosInstance from "@core/api/axios";
import { deliveryApi } from "../services/deliveryApi";

const formatJoined = (dateValue) => {
  if (!dateValue) return "—";
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
};

const formatPhone = (phone) => {
  if (!phone) return "—";
  const digits = String(phone).replace(/\D/g, "");
  if (digits.length === 10) return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
  if (digits.length === 12 && digits.startsWith("91")) {
    return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
  }
  return phone;
};

const maskAccount = (accountNumber) => {
  if (!accountNumber) return "Not added";
  const value = String(accountNumber);
  if (value.length <= 4) return `**** ${value}`;
  return `**** ${value.slice(-4)}`;
};

const partnerId = (user) => {
  const id = String(user?._id || user?.id || "");
  if (!id) return "—";
  return id.slice(-6).toUpperCase();
};

const defaultAvatar = (seed) =>
  `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(seed || "DP")}`;

const Profile = () => {
  const navigate = useNavigate();
  const { logout, user, refreshUser } = useAuth();
  const { settings } = useSettings();
  const appName = settings?.appName || "App";
  const [faqs, setFaqs] = useState([]);
  const [stats, setStats] = useState({ deliveries: 0 });

  useEffect(() => {
    refreshUser({ forceRefresh: true });
  }, [refreshUser]);

  useEffect(() => {
    const fetchFaqs = async () => {
      try {
        const response = await axiosInstance.get("/public/faqs", {
          params: { category: "Delivery", status: "published" },
        });
        setFaqs(response.data?.result?.items || []);
      } catch (error) {
        console.error("Error fetching FAQs:", error);
      }
    };

    const fetchStats = async () => {
      try {
        const response = await deliveryApi.getStats();
        if (response.data.success) {
          setStats(response.data.result || {});
        }
      } catch (error) {
        console.error("Failed to fetch delivery stats:", error);
      }
    };

    fetchFaqs();
    fetchStats();
  }, []);

  const docs = user?.documents || {};
  const hasDocs = Boolean(docs.aadhar || docs.pan || docs.drivingLicense);
  const bankSub = user?.accountNumber
    ? maskAccount(user.accountNumber)
    : "Add bank details";
  const docsSub = user?.isVerified
    ? "Documents verified"
    : hasDocs
      ? "Uploaded · pending verification"
      : "Upload required documents";

  const menuItems = useMemo(
    () => [
      {
        icon: User,
        label: "Personal Details",
        sub: "Name, Address, Email",
        color: "text-brand-600 bg-brand-50",
        path: "/delivery/profile/personal-details",
      },
      {
        icon: Truck,
        label: "Vehicle Information",
        sub: user?.vehicleNumber
          ? `${(user.vehicleType || "vehicle").toString()} · ${user.vehicleNumber}`
          : "Bike, License, Insurance",
        color: "text-orange-600 bg-orange-50",
        path: "/delivery/profile/vehicle-info",
      },
      {
        icon: CreditCard,
        label: "Bank Account",
        sub: bankSub,
        color: "text-brand-600 bg-brand-50",
        path: "/delivery/profile/bank-account",
      },
      {
        icon: IndianRupee,
        label: "Money Request",
        sub: "Withdraw your earnings",
        color: "text-brand-600 bg-brand-50",
        path: "/delivery/profile/withdrawals",
      },
      {
        icon: Wallet,
        label: "COD Cash",
        sub: "Manage collected cash",
        color: "text-orange-600 bg-orange-50",
        path: "/delivery/cod-cash",
      },
      {
        icon: FileText,
        label: "Documents",
        sub: docsSub,
        color: "text-purple-600 bg-purple-50",
        path: "/delivery/profile/documents",
      },
      {
        icon: Shield,
        label: "Safety & Privacy",
        sub: "Emergency contacts, App permissions",
        color: "text-red-600 bg-red-50",
        path: "/delivery/profile/safety-privacy",
      },
      {
        icon: Settings,
        label: "Settings",
        sub: "Notifications, Language, Theme",
        color: "text-gray-600 bg-gray-50",
        path: "/delivery/profile/settings",
      },
      {
        icon: HelpCircle,
        label: "Help & Support",
        sub: "FAQs, Chat support",
        color: "text-teal-600 bg-teal-50",
        path: "/delivery/profile/help-support",
      },
    ],
    [user, bankSub, docsSub],
  );

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.05 },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, x: -20 },
    visible: { opacity: 1, x: 0 },
  };

  const displayName = user?.name || "Delivery Partner";
  const avatarSrc =
    user?.profileImage || defaultAvatar(displayName);

  return (
    <div className="bg-white min-h-screen pb-24">
      {/* Header */}
      <div className="bg-primary pt-12 pb-24 px-6 rounded-b-[2.5rem] relative shadow-lg">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-white text-2xl font-bold">My Profile</h1>
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/20"
            onClick={() => navigate("/delivery/notifications")}>
            <Bell size={24} />
          </Button>
        </div>

        <div className="flex items-center space-x-4">
          <div className="relative">
            <div className="w-20 h-20 bg-white rounded-full p-1 shadow-lg">
              <img
                src={avatarSrc}
                alt="Profile"
                className="w-full h-full rounded-full object-cover bg-gray-100"
                onError={(e) => {
                  e.currentTarget.src = defaultAvatar(displayName);
                }}
              />
            </div>
            <div
              className={`absolute bottom-0 right-0 w-6 h-6 border-2 border-white rounded-full ${
                user?.isOnline ? "bg-brand-500" : "bg-gray-400"
              }`}
            />
          </div>
          <div className="text-white">
            <h2 className="font-bold text-xl">{displayName}</h2>
            <p className="text-white/80 text-sm flex items-center mb-1">
              <Phone size={14} className="mr-1" /> {formatPhone(user?.phone)}
            </p>
            <div className="flex items-center space-x-2">
              <span className="bg-white/20 px-2 py-0.5 rounded text-xs font-medium backdrop-blur-sm">
                ID: {partnerId(user)}
              </span>
              {user?.isVerified ? (
                <span className="bg-brand-500 text-primary-foreground px-2 py-0.5 rounded text-xs font-bold shadow-sm">
                  VERIFIED
                </span>
              ) : (
                <span className="bg-yellow-400 text-gray-900 px-2 py-0.5 rounded text-xs font-bold shadow-sm">
                  PENDING
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Stats Card */}
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="mx-6 -mt-12 bg-white rounded-2xl p-4 shadow-xl mb-6 flex justify-between text-center relative z-10">
        <div className="flex-1">
          <p className="text-gray-400 text-[10px] uppercase font-bold tracking-wider">
            Joined
          </p>
          <p className="font-bold text-gray-900 text-lg">
            {formatJoined(user?.createdAt)}
          </p>
        </div>
        <div className="w-px bg-gray-100"></div>
        <div className="flex-1">
          <p className="text-gray-400 text-[10px] uppercase font-bold tracking-wider">
            Trips
          </p>
          <p className="font-bold text-gray-900 text-lg">
            {Number(stats.deliveries || 0).toLocaleString("en-IN")}
          </p>
        </div>
        <div className="w-px bg-gray-100"></div>
        <div className="flex-1">
          <p className="text-gray-400 text-[10px] uppercase font-bold tracking-wider">
            Area
          </p>
          <p className="font-bold text-gray-900 text-sm truncate px-1">
            {user?.currentArea || "—"}
          </p>
        </div>
      </motion.div>

      {/* Menu Options */}
      <motion.div
        className="px-6 space-y-3 max-w-lg mx-auto"
        variants={containerVariants}
        initial="hidden"
        animate="visible">
        {menuItems.map((item, index) => (
          <motion.button
            key={index}
            variants={itemVariants}
            className="w-full bg-white p-4 rounded-xl shadow-sm flex items-center justify-between hover:bg-gray-50 hover:shadow-md transition-all group"
            whileTap={{ scale: 0.98 }}
            onClick={() => navigate(item.path)}>
            <div className="flex items-center">
              <div
                className={`p-3 rounded-full mr-4 transition-colors ${item.color}`}>
                <item.icon size={20} />
              </div>
              <div className="text-left">
                <p className="font-bold text-gray-900 group-hover:text-primary transition-colors">
                  {item.label}
                </p>
                <p className="text-xs text-gray-400">{item.sub}</p>
              </div>
            </div>
            <ChevronRight
              size={20}
              className="text-gray-300 group-hover:text-primary transition-colors"
            />
          </motion.button>
        ))}

        {/* FAQ Section */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 overflow-hidden">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4 px-2">
            Delivery Partner FAQs
          </p>
          <div className="divide-y divide-gray-50">
            {faqs.length > 0 ? (
              faqs.map((faq) => (
                <DeliveryFAQItem
                  key={faq._id}
                  question={faq.question}
                  answer={faq.answer}
                />
              ))
            ) : (
              <div className="py-4 text-center text-xs text-gray-400">
                No FAQs available
              </div>
            )}
          </div>
        </div>

        <motion.div variants={itemVariants} className="pt-4">
          <Button
            onClick={logout}
            variant="outline"
            className="w-full border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 py-6">
            <LogOut size={20} className="mr-2" /> Logout
          </Button>
        </motion.div>
      </motion.div>

      <div className="text-center text-gray-400 text-xs mt-8 pb-4">
        {appName} Delivery Partner App
        <br />
        Version 1.2.0 (Build 450)
      </div>
    </div>
  );
};

const DeliveryFAQItem = ({ question, answer }) => {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div
      className="py-4 px-2 cursor-pointer hover:bg-gray-50 transition-colors"
      onClick={() => setIsOpen(!isOpen)}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-700">{question}</h3>
        {isOpen ? (
          <ChevronUp size={16} className="text-gray-400" />
        ) : (
          <ChevronDown size={16} className="text-gray-400" />
        )}
      </div>
      {isOpen && (
        <motion.p
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="mt-2 text-xs text-gray-500 font-medium leading-relaxed">
          {answer}
        </motion.p>
      )}
    </div>
  );
};

export default Profile;
