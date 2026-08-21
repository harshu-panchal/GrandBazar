import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Bell, Smartphone, Moon, Globe } from "lucide-react";
import Button from "@/shared/components/ui/Button";
import Card from "@/shared/components/ui/Card";
import { toast } from "sonner";

const STORAGE_KEY = "delivery_app_preferences";

const loadStoredPrefs = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const DEFAULT_PREFS = {
  pushNotifications: true,
  sound: true,
};

const Settings = () => {
  const navigate = useNavigate();

  const [prefs, setPrefs] = useState(() => ({
    ...DEFAULT_PREFS,
    ...(loadStoredPrefs() || {}),
  }));
  const [cacheUsageMb, setCacheUsageMb] = useState(null);
  const [clearingCache, setClearingCache] = useState(false);

  const estimateCache = async () => {
    if (navigator.storage?.estimate) {
      try {
        const estimate = await navigator.storage.estimate();
        setCacheUsageMb((estimate.usage || 0) / (1024 * 1024));
      } catch {
        setCacheUsageMb(null);
      }
    }
  };

  useEffect(() => {
    estimateCache();
  }, []);

  const toggleSetting = (key) => {
    setPrefs((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
    toast.success("Preference saved on this device");
  };

  const handleClearCache = async () => {
    setClearingCache(true);
    try {
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
      }
      await estimateCache();
      toast.success("Cache cleared");
    } catch {
      toast.error("Failed to clear cache");
    } finally {
      setClearingCache(false);
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
          <h1 className="ds-h3 text-gray-900">App Settings</h1>
        </div>
      </div>

      <div className="p-4 max-w-lg mx-auto space-y-6">
        {/* Notifications */}
        <section>
          <h2 className="text-sm uppercase font-bold text-gray-500 mb-3 tracking-wider ml-1">Notifications</h2>
          <div className="divide-y divide-gray-100">
            <div className="p-4 flex justify-between items-center cursor-pointer" onClick={() => toggleSetting('pushNotifications')}>
              <div className="flex items-center">
                <Bell size={20} className="text-gray-400 mr-3" />
                <div>
                  <h4 className="font-medium text-gray-800">Push Notifications</h4>
                </div>
              </div>
              <div className={`w-12 h-6 rounded-full p-1 transition-colors duration-200 ease-in-out ${prefs.pushNotifications ? 'bg-primary' : 'bg-gray-300'}`}>
                <div className={`bg-white w-4 h-4 rounded-full shadow-sm transform transition-transform duration-200 ease-in-out ${prefs.pushNotifications ? 'translate-x-6' : 'translate-x-0'}`} />
              </div>
            </div>

            <div className="p-4 flex justify-between items-center cursor-pointer" onClick={() => toggleSetting('sound')}>
              <div className="flex items-center">
                <Smartphone size={20} className="text-gray-400 mr-3" />
                <div>
                  <h4 className="font-medium text-gray-800">Sound & Vibration</h4>
                </div>
              </div>
              <div className={`w-12 h-6 rounded-full p-1 transition-colors duration-200 ease-in-out ${prefs.sound ? 'bg-primary' : 'bg-gray-300'}`}>
                <div className={`bg-white w-4 h-4 rounded-full shadow-sm transform transition-transform duration-200 ease-in-out ${prefs.sound ? 'translate-x-6' : 'translate-x-0'}`} />
              </div>
            </div>
          </div>
        </section>

        {/* General */}
        <section>
          <h2 className="text-sm uppercase font-bold text-gray-500 mb-3 tracking-wider ml-1">General</h2>
          <div className="divide-y divide-gray-100">
            <div className="p-4 flex justify-between items-center">
              <div className="flex items-center">
                <Globe size={20} className="text-gray-400 mr-3" />
                <div>
                  <h4 className="font-medium text-gray-800">Language</h4>
                  <p className="text-xs text-gray-500">English</p>
                </div>
              </div>
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide bg-gray-100 px-2 py-1 rounded">
                Coming soon
              </span>
            </div>

            <div className="p-4 flex justify-between items-center">
              <div className="flex items-center">
                <Moon size={20} className="text-gray-400 mr-3" />
                <div>
                  <h4 className="font-medium text-gray-800">Dark Mode</h4>
                  <p className="text-xs text-gray-500">Easier on the eyes at night</p>
                </div>
              </div>
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide bg-gray-100 px-2 py-1 rounded">
                Coming soon
              </span>
            </div>
          </div>
        </section>

        <div className="text-center pt-8">
          <Button
            variant="ghost"
            className="text-red-500 hover:bg-red-50 hover:text-red-600"
            onClick={handleClearCache}
            disabled={clearingCache}
          >
            {clearingCache
              ? "Clearing..."
              : cacheUsageMb != null
                ? `Clear Cache (${cacheUsageMb.toFixed(1)} MB)`
                : "Clear Cache"}
          </Button>
          <p className="text-xs text-gray-400 mt-2">App Version 1.2.0 (Build 450)</p>
        </div>
      </div>
    </div>
  );
};

export default Settings;
