import React from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { MapPin, LocateFixed } from "lucide-react";
import { useLocation } from "../../context/LocationContext";

// Shown when the device's location/GPS is off (or was revoked after being
// granted) so the user has a direct way to turn it back on instead of only
// seeing a buried error line inside the location drawer.
const EnableLocationPopup = () => {
  const {
    showEnableLocationPrompt,
    dismissEnableLocationPrompt,
    refreshLocation,
    isFetchingLocation,
    openLocationPicker,
  } = useLocation();

  if (typeof document === "undefined") return null;

  const handleEnable = () => {
    // Re-invoking geolocation is also what surfaces the OS "turn on location"
    // prompt on most mobile browsers once the toggle is off.
    refreshLocation();
  };

  const handleEnterManually = () => {
    dismissEnableLocationPrompt();
    openLocationPicker();
  };

  return createPortal(
    <AnimatePresence>
      {showEnableLocationPrompt && (
        <motion.div
          key="enable-location-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[1100] flex items-center justify-center px-6"
        >
          <motion.div
            key="enable-location-card"
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.96 }}
            transition={{ type: "spring", damping: 22, stiffness: 260 }}
            className="bg-white rounded-3xl shadow-2xl max-w-sm w-full p-6 text-center"
          >
            <div className="h-16 w-16 mx-auto rounded-2xl bg-primary/10 flex items-center justify-center text-primary mb-4">
              <MapPin size={30} />
            </div>
            <h2 className="text-lg font-black text-slate-900 mb-1">
              Turn on device location
            </h2>
            <p className="text-[13px] text-slate-500 font-medium leading-relaxed mb-6">
              Your device location is off. Turn it on so we can show nearby
              stores and accurate delivery times.
            </p>

            <button
              type="button"
              onClick={handleEnable}
              disabled={isFetchingLocation}
              className="w-full flex items-center justify-center gap-2 bg-primary text-white font-bold text-sm rounded-2xl py-3.5 mb-3 disabled:opacity-60"
            >
              <LocateFixed size={18} />
              {isFetchingLocation ? "Checking..." : "Turn On Location"}
            </button>

            <button
              type="button"
              onClick={handleEnterManually}
              className="w-full text-[13px] font-bold text-slate-500 py-2"
            >
              Enter address manually
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
};

export default EnableLocationPopup;
