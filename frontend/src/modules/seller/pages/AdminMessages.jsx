import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MessageSquareText, ChevronLeft, ShieldCheck } from "lucide-react";
import { useToast } from "@shared/components/ui/Toast";
import { sellerApi } from "../services/sellerApi";

function formatTimestamp(value) {
  if (!value) return "";
  try {
    const date = new Date(value);
    return `${date.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}, ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  } catch {
    return "";
  }
}

const AdminMessages = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [messages, setMessages] = useState(null);

  const fetchMessages = async () => {
    try {
      const res = await sellerApi.getAdminMessages();
      setMessages(res.data?.result?.items || []);
    } catch (error) {
      showToast("Failed to load messages", "error");
      setMessages([]);
    }
  };

  useEffect(() => {
    fetchMessages();
  }, []);

  const handleOpenMessage = async (message) => {
    if (message.isRead) return;
    setMessages((current) =>
      current.map((m) => (m._id === message._id ? { ...m, isRead: true } : m)),
    );
    try {
      await sellerApi.markAdminMessageRead(message._id);
    } catch (error) {
      // Non-fatal — the list still reflects the read state locally.
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await sellerApi.markAllAdminMessagesRead();
      setMessages((current) => current.map((m) => ({ ...m, isRead: true })));
    } catch (error) {
      showToast("Failed to mark messages as read", "error");
    }
  };

  const hasUnread = (messages || []).some((m) => !m.isRead);

  return (
    <div className="min-h-screen bg-slate-50 pb-24 font-sans">
      <div className="sticky top-0 z-30 bg-slate-50/95 backdrop-blur-sm px-4 pt-4 pb-3 border-b border-slate-200/60 mb-4 flex items-center gap-2">
        <button
          onClick={() => navigate(-1)}
          className="w-10 h-10 flex items-center justify-center hover:bg-slate-200/70 rounded-full transition-colors -ml-1"
        >
          <ChevronLeft size={22} className="text-slate-800" />
        </button>
        <h1 className="text-xl font-semibold text-slate-900 tracking-tight">Messages from Admin</h1>
        {hasUnread && (
          <button
            onClick={handleMarkAllRead}
            className="ml-auto text-xs font-bold text-primary hover:bg-primary/5 px-3 py-1.5 rounded-full transition-colors"
          >
            Mark all read
          </button>
        )}
      </div>

      <div className="max-w-2xl mx-auto px-4">
        {messages === null ? (
          <div className="flex justify-center py-20">
            <div className="h-10 w-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-20 px-6">
            <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <MessageSquareText size={36} className="text-slate-300" />
            </div>
            <h3 className="text-lg font-black text-slate-800 mb-2">No Messages Yet</h3>
            <p className="text-slate-500 text-sm max-w-[240px] mx-auto">
              Any message the admin team sends you directly will show up here.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((message) => (
              <div
                key={message._id}
                onClick={() => handleOpenMessage(message)}
                role="button"
                tabIndex={0}
                className={`relative p-4 rounded-2xl border cursor-pointer transition-colors ${
                  message.isRead
                    ? "bg-white border-slate-100"
                    : "bg-primary/[0.04] border-primary/20"
                }`}
              >
                {!message.isRead && (
                  <span className="absolute top-4 right-4 w-2 h-2 bg-primary rounded-full" />
                )}
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-full flex items-center justify-center flex-shrink-0 bg-slate-900 text-white">
                    <ShieldCheck size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className={`text-sm font-bold ${message.isRead ? "text-slate-700" : "text-slate-900"}`}>
                      {message.title}
                    </h3>
                    <p className={`text-xs mt-0.5 leading-relaxed whitespace-pre-wrap ${message.isRead ? "text-slate-500" : "text-slate-700"}`}>
                      {message.message}
                    </p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-2">
                      {formatTimestamp(message.createdAt)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminMessages;
