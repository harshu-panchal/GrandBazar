import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  MessageCircle,
  Phone,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  Send,
  X,
} from "lucide-react";
import Button from "@/shared/components/ui/Button";
import Card from "@/shared/components/ui/Card";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import axiosInstance from "@core/api/axios";
import { useSettings } from "@core/context/SettingsContext";
import { deliveryApi } from "../../services/deliveryApi";

const HelpSupport = () => {
  const navigate = useNavigate();
  const { settings } = useSettings();

  const [faqs, setFaqs] = useState([]);
  const [faqsLoading, setFaqsLoading] = useState(true);
  const [showingAll, setShowingAll] = useState(false);
  const [openIndex, setOpenIndex] = useState(null);

  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessage, setChatMessage] = useState("");
  const [sendingChat, setSendingChat] = useState(false);

  const fetchFaqs = async (all) => {
    try {
      setFaqsLoading(true);
      const params = { status: "published" };
      if (!all) params.category = "Delivery";
      const response = await axiosInstance.get("/public/faqs", { params });
      const items = response.data?.result?.items || [];
      setFaqs(items);
      setShowingAll(all);
    } catch {
      toast.error("Failed to load FAQs");
    } finally {
      setFaqsLoading(false);
    }
  };

  useEffect(() => {
    fetchFaqs(false);
  }, []);

  const toggleAccordion = (index) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  const handleViewAllFaqs = () => {
    if (showingAll || faqsLoading) return;
    fetchFaqs(true);
  };

  const handleSendChatMessage = async () => {
    if (!chatMessage.trim()) {
      toast.error("Please enter a message");
      return;
    }
    setSendingChat(true);
    try {
      await deliveryApi.createSupportTicket({
        subject: "Delivery Partner Support Request",
        description: chatMessage.trim(),
        priority: "medium",
        userType: "Rider",
      });
      toast.success("Message sent. Our support team will reply soon.");
      setChatMessage("");
      setChatOpen(false);
    } catch (error) {
      toast.error(
        error?.response?.data?.message || "Failed to send message",
      );
    } finally {
      setSendingChat(false);
    }
  };

  const handleCallSupport = () => {
    const phone = String(settings?.supportPhone || "").trim();
    if (!phone) {
      toast.error("Support phone number is not available right now");
      return;
    }
    window.location.href = `tel:${phone}`;
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-white shadow-sm sticky top-0 z-10">
        <div className="flex items-center p-4">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-full hover:bg-gray-100 transition-colors mr-2">
            <ArrowLeft size={20} className="text-gray-600" />
          </button>
          <h1 className="ds-h3 text-gray-900">Help & Support</h1>
        </div>
      </div>

      <div className="p-4 max-w-lg mx-auto space-y-6">
        {/* Support Channels */}
        <section className="grid grid-cols-2 gap-4">
          <Card
            className="p-4 flex flex-col items-center justify-center text-center cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => setChatOpen((v) => !v)}
          >
            <div className="w-12 h-12 bg-brand-100 rounded-full flex items-center justify-center text-brand-600 mb-3">
              <MessageCircle size={24} />
            </div>
            <h4 className="font-bold text-gray-800">Chat Support</h4>
            <p className="text-xs text-gray-500 mt-1">Send us a message</p>
          </Card>
          <Card
            className="p-4 flex flex-col items-center justify-center text-center cursor-pointer hover:shadow-md transition-shadow"
            onClick={handleCallSupport}
          >
            <div className="w-12 h-12 bg-brand-100 rounded-full flex items-center justify-center text-brand-600 mb-3">
              <Phone size={24} />
            </div>
            <h4 className="font-bold text-gray-800">Call Support</h4>
            <p className="text-xs text-gray-500 mt-1">
              {settings?.supportPhone || "Not available"}
            </p>
          </Card>
        </section>

        <AnimatePresence>
          {chatOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
            >
              <Card className="p-4 border-dashed border-2 border-gray-200 bg-gray-50">
                <div className="flex justify-between items-center mb-2">
                  <h4 className="font-bold text-gray-800 text-sm">Message Support</h4>
                  <button onClick={() => setChatOpen(false)} className="text-gray-400" aria-label="Close">
                    <X size={16} />
                  </button>
                </div>
                <textarea
                  value={chatMessage}
                  onChange={(e) => setChatMessage(e.target.value)}
                  placeholder="Describe your issue..."
                  rows={3}
                  className="w-full rounded-lg border border-gray-200 p-2 text-sm mb-3 bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
                  disabled={sendingChat}
                />
                <Button
                  size="sm"
                  className="w-full"
                  disabled={sendingChat}
                  onClick={handleSendChatMessage}
                >
                  <Send size={14} className="mr-1" />
                  {sendingChat ? "Sending..." : "Send Message"}
                </Button>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {/* FAQs */}
        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center">
            <HelpCircle size={20} className="mr-2 text-primary" /> Frequently
            Asked Questions
          </h2>
          <div className="space-y-3">
            {faqsLoading ? (
              <div className="text-center py-8 text-sm text-gray-400">Loading FAQs...</div>
            ) : faqs.length > 0 ? (
              faqs.map((faq, index) => (
                <Card
                  key={faq._id || index}
                  className="overflow-hidden cursor-pointer"
                  onClick={() => toggleAccordion(index)}>
                  <div className="p-4 flex justify-between items-center bg-white">
                    <h4 className="font-medium text-gray-800 text-sm pr-4">
                      {faq.question}
                    </h4>
                    {openIndex === index ? (
                      <ChevronUp size={18} className="text-gray-400" />
                    ) : (
                      <ChevronDown size={18} className="text-gray-400" />
                    )}
                  </div>
                  <AnimatePresence>
                    {openIndex === index && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="bg-gray-50">
                        <div className="p-4 text-sm text-gray-600 border-t border-gray-100 leading-relaxed">
                          {faq.answer}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </Card>
              ))
            ) : (
              <div className="text-center py-8 text-sm text-gray-400">
                No FAQs available
              </div>
            )}
          </div>
        </section>

        <div className="text-center pt-8">
          <p className="text-gray-500 text-sm">Still need help?</p>
          <Button
            variant="link"
            className="text-primary font-bold"
            onClick={handleViewAllFaqs}
            disabled={showingAll || faqsLoading}
          >
            {showingAll ? "Showing All FAQs" : "View All FAQs"}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default HelpSupport;
