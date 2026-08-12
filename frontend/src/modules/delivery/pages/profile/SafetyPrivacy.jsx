import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, UserPlus, Phone, Trash2, Shield, Lock, Eye, RotateCw } from "lucide-react";
import Button from "@/shared/components/ui/Button";
import Card from "@/shared/components/ui/Card";
import Input from "@/shared/components/ui/Input";
import { toast } from "sonner";
import { useAuth } from "@core/context/AuthContext";
import { useSettings } from "@core/context/SettingsContext";
import { deliveryApi } from "../../services/deliveryApi";

const SafetyPrivacy = () => {
  const navigate = useNavigate();
  const { user, refreshUser } = useAuth();
  const { settings } = useSettings();
  const appName = settings?.appName || "App";

  const [contacts, setContacts] = useState(user?.emergencyContacts || []);
  const [saving, setSaving] = useState(false);
  const [newContact, setNewContact] = useState({ name: "", relation: "", phone: "" });
  const [showAddContact, setShowAddContact] = useState(false);

  useEffect(() => {
    setContacts(user?.emergencyContacts || []);
  }, [user?.emergencyContacts]);

  const persistContacts = async (nextContacts) => {
    setSaving(true);
    try {
      await deliveryApi.updateProfile({ emergencyContacts: nextContacts });
      await refreshUser({ forceRefresh: true });
      return true;
    } catch (error) {
      toast.error(
        error?.response?.data?.message || "Failed to save emergency contacts",
      );
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleAddContact = async () => {
    if (!newContact.name.trim() || !newContact.phone.trim()) {
      toast.error("Name and phone are required");
      return;
    }
    const nextContacts = [
      ...contacts,
      {
        name: newContact.name.trim(),
        relation: newContact.relation.trim(),
        phone: newContact.phone.trim(),
      },
    ];
    const ok = await persistContacts(nextContacts);
    if (ok) {
      setContacts(nextContacts);
      setNewContact({ name: "", relation: "", phone: "" });
      setShowAddContact(false);
      toast.success("Emergency contact added");
    }
  };

  const handleRemoveContact = async (index) => {
    const nextContacts = contacts.filter((_, i) => i !== index);
    const ok = await persistContacts(nextContacts);
    if (ok) {
      setContacts(nextContacts);
      toast.success("Contact removed");
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
          <h1 className="ds-h3 text-gray-900">Safety & Privacy</h1>
        </div>
      </div>

      <div className="p-4 max-w-lg mx-auto space-y-6">
        {/* Emergency Contacts */}
        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-3 flex items-center">
            <Shield size={20} className="mr-2 text-primary" /> Emergency Contacts
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            These contacts will be notified if you trigger the SOS alert during a delivery.
          </p>

          <div className="space-y-3">
            {contacts.length === 0 && !showAddContact && (
              <div className="rounded-xl border border-dashed border-gray-200 p-6 text-center text-sm text-gray-400">
                No emergency contacts added yet.
              </div>
            )}

            {contacts.map((contact, index) => (
              <Card key={`${contact.phone}-${index}`} className="p-4 flex justify-between items-center">
                <div>
                  <h4 className="font-bold text-gray-800">
                    {contact.name}
                    {contact.relation ? ` (${contact.relation})` : ""}
                  </h4>
                  <p className="text-sm text-gray-500 flex items-center mt-1">
                    <Phone size={14} className="mr-1" /> {contact.phone}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-red-500 hover:bg-red-50"
                  disabled={saving}
                  onClick={() => handleRemoveContact(index)}
                >
                  <Trash2 size={18} />
                </Button>
              </Card>
            ))}

            {showAddContact ? (
              <Card className="p-4 border-dashed border-2 border-gray-200 bg-gray-50">
                <Input
                  placeholder="Name"
                  value={newContact.name}
                  onChange={(e) => setNewContact({ ...newContact, name: e.target.value })}
                  className="mb-3 bg-white"
                  disabled={saving}
                />
                <Input
                  placeholder="Relation (e.g. Wife, Brother)"
                  value={newContact.relation}
                  onChange={(e) => setNewContact({ ...newContact, relation: e.target.value })}
                  className="mb-3 bg-white"
                  disabled={saving}
                />
                <Input
                  placeholder="Phone Number"
                  value={newContact.phone}
                  onChange={(e) => setNewContact({ ...newContact, phone: e.target.value })}
                  className="mb-3 bg-white"
                  disabled={saving}
                />
                <div className="flex space-x-2">
                  <Button size="sm" onClick={handleAddContact} className="flex-1" disabled={saving}>
                    {saving ? <RotateCw size={14} className="animate-spin mr-1" /> : null}
                    Save
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setShowAddContact(false);
                      setNewContact({ name: "", relation: "", phone: "" });
                    }}
                    className="flex-1"
                    disabled={saving}
                  >
                    Cancel
                  </Button>
                </div>
              </Card>
            ) : (
              <Button
                variant="outline"
                className="w-full border-dashed border-gray-300 text-gray-500 hover:border-primary hover:text-primary"
                onClick={() => setShowAddContact(true)}
                disabled={saving || contacts.length >= 5}
              >
                <UserPlus size={18} className="mr-2" />
                {contacts.length >= 5 ? "Maximum 5 contacts reached" : "Add New Contact"}
              </Button>
            )}
          </div>
        </section>

        {/* Privacy Settings */}
        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-3 flex items-center">
            <Lock size={20} className="mr-2 text-primary" /> Privacy Settings
          </h2>
          <Card className="divide-y divide-gray-100">
            <div className="p-4 flex justify-between items-center">
              <div>
                <h4 className="font-medium text-gray-800">Share Live Location</h4>
                <p className="text-xs text-gray-500">
                  Shared with customers automatically while a delivery is active
                </p>
              </div>
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide bg-gray-100 px-2 py-1 rounded-full">
                Always On
              </span>
            </div>
            <div className="p-4 flex justify-between items-center">
              <div>
                <h4 className="font-medium text-gray-800">Profile Visibility</h4>
                <p className="text-xs text-gray-500">
                  Customers can see your name and photo during an active delivery
                </p>
              </div>
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide bg-gray-100 px-2 py-1 rounded-full">
                Always On
              </span>
            </div>
          </Card>
        </section>

        <div className="bg-brand-50 p-4 rounded-xl flex items-start">
          <Eye size={20} className="text-brand-600 mr-3 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-brand-800">
            {appName} values your privacy. Your location is only shared while you are on an active delivery.
          </p>
        </div>
      </div>
    </div>
  );
};

export default SafetyPrivacy;
