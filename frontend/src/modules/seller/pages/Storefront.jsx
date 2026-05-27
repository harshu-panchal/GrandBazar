import React, { useState, useEffect } from "react";
import { toast } from "sonner";
import { Plus, X, Image as ImageIcon, Save, Trash2, Video, Star } from "lucide-react";
import { sellerApi } from "../services/sellerApi";
import Card from "@shared/components/ui/Card";
import Button from "@shared/components/ui/Button";

const getEmbedUrl = (url) => {
  if (!url) return "";
  const shortMatch = url.match(/shorts\/([^/?]+)/);
  const watchMatch = url.match(/[?&]v=([^&]+)/);
  const youtuMatch = url.match(/youtu\.be\/([^/?]+)/);
  const videoId = shortMatch ? shortMatch[1] : watchMatch ? watchMatch[1] : youtuMatch ? youtuMatch[1] : null;
  return videoId ? `https://www.youtube.com/embed/${videoId}` : url;
};

const Storefront = () => {
  const [banners, setBanners] = useState([]);
  const [storeVideo, setStoreVideo] = useState("");
  const [signatureProduct, setSignatureProduct] = useState("");
  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const [profileRes, productsRes] = await Promise.all([
        sellerApi.getProfile(),
        sellerApi.getProducts()
      ]);
      const data = profileRes.data.result;
      setBanners(data.banners || []);
      setStoreVideo(data.storeVideo || "");
    } catch (error) {
      toast.error("Failed to fetch store design data");
    } finally {
      setIsLoading(false);
    }
  };

  const handleBannerUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        toast.error("Image size must be less than 2MB");
        return;
      }
      if (banners.length >= 5) {
        toast.error("Maximum 5 banners allowed");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setBanners((prev) => [...prev, reader.result]);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveBanner = (index) => {
    setBanners((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await sellerApi.updateProfile({ banners, storeVideo });
      toast.success("Storefront updated successfully");
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to update storefront");
    } finally {
      setIsSaving(false);
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
    <div className="max-w-5xl mx-auto p-4 md:p-8 font-['Outfit'] space-y-8">
      <div>
        <h1 className="text-3xl font-black text-slate-900 mb-2">Store Design</h1>
        <p className="text-slate-500 font-medium">Manage how your shop appears to customers.</p>
      </div>

      <Card className="p-8 border-none shadow-[0_20px_50px_rgba(0,0,0,0.05)] rounded-2xl">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h3 className="text-xl font-black text-slate-900">Carousel Banners</h3>
            <p className="text-sm text-slate-500">Upload up to 5 promotional banners. These will auto-play on your shop page.</p>
          </div>
          <Button 
            onClick={handleSave} 
            disabled={isSaving}
            className="bg-slate-900 text-white hover:bg-black rounded-lg px-6 py-2 text-xs font-black tracking-[2px] flex items-center gap-2"
          >
            {isSaving ? "SAVING..." : <><Save size={16} /> SAVE CHANGES</>}
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {banners.map((banner, index) => (
            <div key={index} className="relative group rounded-xl overflow-hidden shadow-sm border border-slate-100 aspect-[21/9] bg-slate-50">
              <img src={banner} alt={`Banner ${index + 1}`} className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[2px]">
                <button 
                  onClick={() => handleRemoveBanner(index)}
                  className="bg-red-500 text-white p-3 rounded-full hover:bg-red-600 hover:scale-110 transition-all shadow-lg"
                >
                  <Trash2 size={20} />
                </button>
              </div>
              <div className="absolute top-3 left-3 bg-white/90 backdrop-blur text-slate-900 px-3 py-1 rounded-md text-[10px] font-black uppercase tracking-widest shadow-sm">
                Slide {index + 1}
              </div>
            </div>
          ))}

          {banners.length < 5 && (
            <label className="border-2 border-dashed border-slate-300 hover:border-slate-400 bg-slate-50 hover:bg-slate-100 rounded-xl aspect-[21/9] flex flex-col items-center justify-center cursor-pointer transition-all group">
              <div className="h-12 w-12 rounded-full bg-white shadow-sm flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                <Plus size={24} className="text-slate-600" />
              </div>
              <span className="text-sm font-bold text-slate-600">Add New Banner</span>
              <span className="text-xs text-slate-400 mt-1">1920x820px recommended</span>
              <input type="file" accept="image/*" className="hidden" onChange={handleBannerUpload} />
            </label>
          )}
        </div>
      </Card>

      {/* Store Video Section */}
      <Card className="p-8 border-none shadow-[0_20px_50px_rgba(0,0,0,0.05)] rounded-2xl">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h3 className="text-xl font-black text-slate-900">Store Promotional Video</h3>
            <p className="text-sm text-slate-500">Add a YouTube link or MP4 URL to showcase your shop and products to customers.</p>
          </div>
        </div>

        <div className="flex flex-col gap-4 max-w-xl">
          <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
            <Video size={18} className="text-brand-500" />
            Video URL
          </label>
          <input
            type="text"
            value={storeVideo}
            onChange={(e) => setStoreVideo(e.target.value)}
            placeholder="e.g., https://www.youtube.com/watch?v=..."
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium text-slate-900 outline-none focus:border-brand-500 transition-all"
          />
          {storeVideo && (
            <div className="mt-4 rounded-xl overflow-hidden aspect-video bg-slate-100 border border-slate-200 relative">
              {storeVideo.includes("youtube.com") || storeVideo.includes("youtu.be") ? (
                <iframe
                  className="w-full h-full"
                  src={getEmbedUrl(storeVideo)}
                  title="Store Promotional Video"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                ></iframe>
              ) : (
                <video src={storeVideo} controls className="w-full h-full object-contain" />
              )}
            </div>
          )}
        </div>
      </Card>

    </div>
  );
};

export default Storefront;
