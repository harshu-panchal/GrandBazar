import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Truck, ShieldCheck, FileText, AlertCircle, Pencil, RotateCw } from "lucide-react";
import Button from "@/shared/components/ui/Button";
import Card from "@/shared/components/ui/Card";
import Input from "@/shared/components/ui/Input";
import { useAuth } from "@core/context/AuthContext";
import { useSettings } from "@core/context/SettingsContext";
import { toast } from "sonner";
import { deliveryApi } from "../../services/deliveryApi";

const FUEL_TYPES = [
  { value: "petrol", label: "Petrol" },
  { value: "diesel", label: "Diesel" },
  { value: "electric", label: "Electric" },
  { value: "cng", label: "CNG" },
  { value: "other", label: "Other" },
];

const fuelLabel = (value) => FUEL_TYPES.find((f) => f.value === value)?.label || value;

const VehicleInfo = () => {
  const navigate = useNavigate();
  const { user, refreshUser } = useAuth();
  const { settings } = useSettings();
  const appName = settings?.appName || "App";

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    vehicleModel: user?.vehicleModel || "",
    vehicleColor: user?.vehicleColor || "",
    fuelType: user?.fuelType || "",
  });

  useEffect(() => {
    setForm({
      vehicleModel: user?.vehicleModel || "",
      vehicleColor: user?.vehicleColor || "",
      fuelType: user?.fuelType || "",
    });
  }, [user?.vehicleModel, user?.vehicleColor, user?.fuelType]);

  const vehicleDetails = {
    model: user?.vehicleModel || "Not added",
    plateNumber: user?.vehicleNumber || "Not Assigned",
    color: user?.vehicleColor || "Not added",
    fuelType: user?.fuelType ? fuelLabel(user.fuelType) : "Not added",
  };

  // Vehicle number / license are admin-verified; only treat them "Verified"
  // once both the value exists AND the account has passed admin review.
  const licenseVerified = Boolean(user?.drivingLicenseNumber) && Boolean(user?.isVerified);
  const rcVerified = Boolean(user?.vehicleNumber) && Boolean(user?.isVerified);

  const documents = [
    {
      title: "Driving License",
      number: user?.drivingLicenseNumber || "Not Available",
      status: !user?.drivingLicenseNumber ? "Missing" : licenseVerified ? "Verified" : "Pending",
    },
    {
      title: "RC Book",
      number: user?.vehicleNumber || "Not Assigned",
      status: !user?.vehicleNumber ? "Missing" : rcVerified ? "Verified" : "Pending",
    },
  ];

  const handleSave = async () => {
    setSaving(true);
    try {
      await deliveryApi.updateProfile({
        vehicleModel: form.vehicleModel.trim(),
        vehicleColor: form.vehicleColor.trim(),
        fuelType: form.fuelType,
      });
      await refreshUser({ forceRefresh: true });
      toast.success("Vehicle details updated");
      setEditing(false);
    } catch (error) {
      toast.error(
        error?.response?.data?.message || "Failed to update vehicle details",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-white shadow-sm sticky top-0 z-10">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center">
            <button
              onClick={() => navigate(-1)}
              className="p-2 rounded-full hover:bg-gray-100 transition-colors mr-2"
            >
              <ArrowLeft size={20} className="text-gray-600" />
            </button>
            <h1 className="ds-h3 text-gray-900">Vehicle Information</h1>
          </div>
          {!editing && (
            <button
              onClick={() => setEditing(true)}
              className="text-primary text-xs font-bold flex items-center gap-1"
            >
              <Pencil size={14} /> Edit
            </button>
          )}
        </div>
      </div>

      <div className="p-4 max-w-lg mx-auto space-y-6">
        {/* Vehicle Card */}
        <div className="p-5 bg-gradient-to-br from-gray-900 to-gray-800 text-white border-none shadow-xl">
          <div className="flex justify-between items-start mb-6">
            <div>
              <p className="text-gray-400 text-xs uppercase tracking-wider font-bold mb-1">Vehicle Details</p>
              <h3 className="text-2xl font-bold">{vehicleDetails.plateNumber}</h3>
              <p className="text-gray-300">{vehicleDetails.model}</p>
            </div>
            <div className="bg-white/10 p-2 rounded-full backdrop-blur-sm">
              <Truck size={24} className="text-white" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/10">
            <div>
              <p className="text-gray-400 text-xs">Color</p>
              <p className="font-medium">{vehicleDetails.color}</p>
            </div>
            <div>
              <p className="text-gray-400 text-xs">Fuel Type</p>
              <p className="font-medium">{vehicleDetails.fuelType}</p>
            </div>
          </div>
        </div>

        {editing && (
          <div className="p-4 border border-gray-100">
            <h3 className="font-bold text-gray-800 text-sm mb-3">Edit Vehicle Details</h3>
            <div className="space-y-3">
              <Input
                label="Model"
                placeholder="e.g. Honda Activa"
                value={form.vehicleModel}
                onChange={(e) => setForm({ ...form, vehicleModel: e.target.value })}
                disabled={saving}
              />
              <Input
                label="Color"
                placeholder="e.g. Black"
                value={form.vehicleColor}
                onChange={(e) => setForm({ ...form, vehicleColor: e.target.value })}
                disabled={saving}
              />
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Fuel Type
                </label>
                <select
                  value={form.fuelType}
                  onChange={(e) => setForm({ ...form, fuelType: e.target.value })}
                  disabled={saving}
                  className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="">Select fuel type</option>
                  {FUEL_TYPES.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2 pt-1">
                <Button size="sm" className="flex-1" onClick={handleSave} disabled={saving}>
                  {saving ? <RotateCw size={14} className="animate-spin mr-1" /> : null}
                  {saving ? "Saving..." : "Save"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="flex-1"
                  onClick={() => setEditing(false)}
                  disabled={saving}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Documents List */}
        <div>
          <h3 className="ds-h4 text-gray-900 mb-3 px-1">Vehicle Documents</h3>
          <div className="space-y-3">
            {documents.map((doc, index) => (
              <div key={index} className="p-4 border border-gray-100">
                <div className="flex justify-between items-start">
                  <div className="flex items-start">
                    <div className="p-2 rounded-lg mr-3 bg-brand-50 text-brand-600">
                      <FileText size={20} />
                    </div>
                    <div>
                      <h4 className="font-bold text-gray-800 text-sm">{doc.title}</h4>
                      <p className="text-xs text-gray-500 mt-0.5">{doc.number}</p>
                    </div>
                  </div>
                  {doc.status === "Verified" ? (
                    <div className="flex items-center text-brand-600 bg-brand-50 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider">
                      <ShieldCheck size={12} className="mr-1" /> Verified
                    </div>
                  ) : doc.status === "Pending" ? (
                    <div className="flex items-center text-yellow-600 bg-yellow-50 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider">
                      Pending
                    </div>
                  ) : (
                    <div className="flex items-center text-gray-500 bg-gray-100 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider">
                      Missing
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-brand-50 p-4 rounded-xl flex items-start">
          <AlertCircle size={20} className="text-brand-600 mr-3 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-brand-800">
            To change your registered vehicle number or license, please contact {appName} support.
          </p>
        </div>
      </div>
    </div>
  );
};

export default VehicleInfo;
