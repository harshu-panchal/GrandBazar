import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Send,
  Phone,
  MessageSquare,
  Check,
  CheckCheck,
  AlertCircle,
  Loader2,
  Lock,
  Bike,
  User,
  ShieldCheck,
} from "lucide-react";
import axiosInstance from "@core/api/axios";
import { getOrderSocket } from "@core/services/orderSocket";
import { toast } from "sonner";

const RIDER_QUICK_REPLIES = [
  "I'm on my way with your order! 🛵",
  "I have arrived at your location 📍",
  "Please come down to collect your order 🛍️",
  "Heavy traffic delay, reaching in 5 mins ⏳",
];

const CUSTOMER_QUICK_REPLIES = [
  "Please call when you reach 📞",
  "Please leave order at the door 🚪",
  "I'm coming down to meet you 🏃",
  "Landmark details: Near main gate 🏠",
];

export default function OrderDeliveryChatModal({
  isOpen,
  onClose,
  orderId,
  currentUserRole = "customer", // 'customer' | 'delivery' | 'admin'
  currentUserId,
  partnerInfo = null, // { name, phone, avatar }
}) {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [canChat, setCanChat] = useState(true);
  const [orderStatus, setOrderStatus] = useState("");
  const [partner, setPartner] = useState(partnerInfo);
  const messagesEndRef = useRef(null);

  const isRider = currentUserRole === "delivery";

  const scrollToBottom = (smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? "smooth" : "auto" });
  };

  const fetchChatMessages = async (showLoader = true) => {
    if (!orderId) return;
    if (showLoader) setLoading(true);
    try {
      const res = await axiosInstance.get(`/orders/${orderId}/chat`);
      const result = res.data?.result || {};
      setCanChat(result.canChat ?? true);
      setMessages(result.messages || []);
      setOrderStatus(result.orderStatus || "");

      if (isRider && result.customer) {
        setPartner((prev) => ({ ...prev, ...result.customer }));
      } else if (!isRider && result.deliveryBoy) {
        setPartner((prev) => ({ ...prev, ...result.deliveryBoy }));
      }
    } catch (err) {
      console.error("[OrderDeliveryChat] Fetch error:", err);
      toast.error(err?.response?.data?.message || "Failed to load chat history");
    } finally {
      if (showLoader) setLoading(false);
    }
  };

  // Setup Socket listener & fetch chat history
  useEffect(() => {
    if (!isOpen || !orderId) return;

    fetchChatMessages(true);

    const socket = getOrderSocket();
    if (socket) {
      socket.emit("join_order", orderId);

      const handleIncomingMessage = (data) => {
        if (data?.orderId === orderId && data?.message) {
          setMessages((prev) => {
            // Prevent duplicate message if already added by sender response
            if (prev.some((m) => String(m._id) === String(data.message._id))) {
              return prev;
            }
            return [...prev, data.message];
          });
          scrollToBottom(true);
        }
      };

      socket.on("order:chat:message", handleIncomingMessage);

      return () => {
        socket.off("order:chat:message", handleIncomingMessage);
      };
    }
  }, [isOpen, orderId]);

  useEffect(() => {
    if (!loading && isOpen) {
      scrollToBottom(false);
    }
  }, [loading, messages.length, isOpen]);

  const handleSendMessage = async (textToSend = null) => {
    const content = (textToSend || inputText).trim();
    if (!content || sending || !canChat) return;

    setSending(true);
    try {
      const res = await axiosInstance.post(`/orders/${orderId}/chat`, {
        message: content,
      });

      const newMsg = res.data?.result;
      if (newMsg) {
        setMessages((prev) => [...prev, newMsg]);
        setInputText("");
        setTimeout(() => scrollToBottom(true), 50);
      }
    } catch (err) {
      console.error("[OrderDeliveryChat] Send error:", err);
      toast.error(err?.response?.data?.message || "Failed to send message");
    } finally {
      setSending(false);
    }
  };

  const handleQuickReply = (text) => {
    handleSendMessage(text);
  };

  if (!isOpen) return null;

  const quickReplies = isRider ? RIDER_QUICK_REPLIES : CUSTOMER_QUICK_REPLIES;
  const partnerRoleLabel = isRider ? "Customer" : "Delivery Partner";

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4">
        {/* Backdrop overlay */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0"
        />

        {/* Modal Container */}
        <motion.div
          initial={{ y: "100%", opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: "100%", opacity: 0 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="relative w-full max-w-lg bg-slate-900 text-white rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col h-[85vh] sm:h-[650px] overflow-hidden border border-slate-800"
        >
          {/* Header */}
          <div className="p-4 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 flex items-center justify-between z-10">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-11 h-11 rounded-full bg-brand-600/20 border border-brand-500/30 flex items-center justify-center text-brand-400 font-bold overflow-hidden shadow-inner">
                  {partner?.avatar ? (
                    <img
                      src={partner.avatar}
                      alt={partner?.name}
                      className="w-full h-full object-cover"
                    />
                  ) : isRider ? (
                    <User size={22} />
                  ) : (
                    <Bike size={22} />
                  )}
                </div>
                {canChat && (
                  <span className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-emerald-500 rounded-full ring-2 ring-slate-900 animate-pulse" />
                )}
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-slate-100 text-base leading-tight">
                    {partner?.name || partnerRoleLabel}
                  </h3>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-brand-500/20 text-brand-300 border border-brand-500/30">
                    {partnerRoleLabel}
                  </span>
                </div>
                <p className="text-xs text-slate-400 font-medium mt-0.5 flex items-center gap-1.5">
                  <span>Order #{orderId}</span>
                  {canChat ? (
                    <span className="text-emerald-400 font-semibold">• Live Delivery Chat</span>
                  ) : (
                    <span className="text-amber-400 font-semibold">• Delivery Window Ended</span>
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {partner?.phone && (
                <a
                  href={`tel:${partner.phone}`}
                  className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20 transition-all flex items-center justify-center"
                  title="Call Phone"
                >
                  <Phone size={18} />
                </a>
              )}
              <button
                onClick={onClose}
                className="p-2.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition-all"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Delivery Window Warning Banner if closed */}
          {!canChat && (
            <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2.5 flex items-center gap-2 text-amber-300 text-xs">
              <Lock size={15} className="shrink-0" />
              <span>
                Chatting is active only during live delivery. Delivery is completed or inactive.
              </span>
            </div>
          )}

          {/* Messages Container */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gradient-to-b from-slate-900 to-slate-950">
            {loading ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-2">
                <Loader2 className="animate-spin text-brand-500" size={28} />
                <p className="text-xs font-medium">Connecting live chat...</p>
              </div>
            ) : messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-3">
                <div className="w-16 h-16 rounded-full bg-slate-800/80 border border-slate-700 flex items-center justify-center text-brand-400 mb-1 shadow-lg">
                  <MessageSquare size={28} />
                </div>
                <h4 className="text-sm font-bold text-slate-200">Order Delivery Chat</h4>
                <p className="text-xs text-slate-400 max-w-xs leading-relaxed">
                  Direct real-time communication between customer and delivery partner for Order #{orderId}.
                </p>
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800 text-[11px] font-semibold text-slate-300 border border-slate-700">
                  <ShieldCheck size={14} className="text-emerald-400" />
                  Encrypted & Window-Locked
                </div>
              </div>
            ) : (
              messages.map((msg, index) => {
                const isMe =
                  String(msg.senderId) === String(currentUserId) ||
                  msg.senderRole === currentUserRole;
                const timeStr = new Date(msg.createdAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                });

                return (
                  <div
                    key={msg._id || index}
                    className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}
                  >
                    <div
                      className={`max-w-[82%] sm:max-w-[75%] px-4 py-2.5 rounded-2xl shadow-sm text-sm font-medium leading-relaxed ${
                        isMe
                          ? "bg-brand-600 text-white rounded-br-xs border border-brand-500/30"
                          : "bg-slate-800 text-slate-100 rounded-bl-xs border border-slate-700"
                      }`}
                    >
                      <p className="break-words whitespace-pre-wrap">{msg.message}</p>
                      <div
                        className={`flex items-center justify-end gap-1 mt-1 text-[10px] ${
                          isMe ? "text-brand-200" : "text-slate-400"
                        }`}
                      >
                        <span>{timeStr}</span>
                        {isMe &&
                          (msg.isRead ? (
                            <CheckCheck size={14} className="text-sky-300" />
                          ) : (
                            <Check size={14} />
                          ))}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Replies Chips */}
          {canChat && (
            <div className="px-3 py-2 bg-slate-950/80 border-t border-slate-800/80 overflow-x-auto no-scrollbar flex gap-2">
              {quickReplies.map((reply, idx) => (
                <button
                  key={idx}
                  onClick={() => handleQuickReply(reply)}
                  disabled={sending}
                  className="shrink-0 px-3 py-1.5 rounded-full bg-slate-800/90 text-slate-300 hover:text-white hover:bg-brand-600/30 border border-slate-700 text-xs font-medium transition-all shadow-sm active:scale-95 disabled:opacity-50"
                >
                  {reply}
                </button>
              ))}
            </div>
          )}

          {/* Input Area */}
          <div className="p-3 bg-slate-900 border-t border-slate-800 flex items-center gap-2">
            <input
              type="text"
              placeholder={
                canChat ? "Type your message..." : "Chat is closed for completed orders"
              }
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSendMessage()}
              disabled={!canChat || sending}
              className="flex-1 bg-slate-950 text-slate-100 placeholder-slate-500 text-sm px-4 py-3 rounded-xl border border-slate-800 focus:outline-none focus:border-brand-500 disabled:opacity-50 transition-colors"
            />

            <button
              onClick={() => handleSendMessage()}
              disabled={!canChat || !inputText.trim() || sending}
              className="p-3 rounded-xl bg-brand-600 text-white font-bold hover:bg-brand-500 disabled:opacity-40 disabled:hover:bg-brand-600 transition-all flex items-center justify-center shadow-lg shadow-brand-600/20 active:scale-95 shrink-0"
            >
              {sending ? (
                <Loader2 className="animate-spin" size={18} />
              ) : (
                <Send size={18} />
              )}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
