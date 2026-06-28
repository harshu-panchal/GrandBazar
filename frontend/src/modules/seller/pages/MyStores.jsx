import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Store,
  MapPin,
  Plus,
  CheckCircle,
  Clock,
  XCircle,
  Loader2,
  Upload,
  Navigation,
} from 'lucide-react';
import { toast } from 'sonner';
import { sellerApi } from '../services/sellerApi';
import { useStoreContext } from '../context/StoreContext';
import MapPicker from '../../../shared/components/MapPicker';
import Button from '@shared/components/ui/Button';
import Card from '@shared/components/ui/Card';
import StoreCatalogImportPanel from '../components/StoreCatalogImportPanel';

const STATUS_BADGE = {
  approved: { label: 'Approved', className: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
  pending: { label: 'Pending', className: 'bg-amber-50 text-amber-700 border-amber-100' },
  rejected: { label: 'Rejected', className: 'bg-rose-50 text-rose-700 border-rose-100' },
};

const REQUIRED_DOCS = [
  { id: 'aadhar', label: 'Aadhaar Card' },
  { id: 'pan', label: 'PAN Card' },
  { id: 'bankProof', label: 'Bank Proof' },
  { id: 'gstCertificate', label: 'GST Certificate' },
];

const INITIAL_FORM_DATA = {
  shopName: '',
  categories: [],
  description: '',
  address: '',
  locality: '',
  city: '',
  state: '',
  pincode: '',
  lat: null,
  lng: null,
  radius: 5,
  aadharNumber: '',
  panNumber: '',
  gstNumber: '',
  accountHolder: '',
  accountNumber: '',
  ifsc: '',
  bankName: '',
};

const EMPTY_DOCUMENTS = { aadhar: null, pan: null, bankProof: null, gstCertificate: null };

const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

const KYC_TEXT_FIELDS = [
  { id: 'aadharNumber', label: 'Aadhaar Number', placeholder: '12-digit Aadhaar number' },
  { id: 'panNumber', label: 'PAN Number', placeholder: 'e.g. ABCDE1234F', maxLength: 10, uppercase: true },
  {
    id: 'gstNumber',
    label: 'GSTIN',
    placeholder: '22AAAAA0000A1Z5',
    maxLength: 15,
    uppercase: true,
    hint: 'Exactly 15 characters: 2-digit state + PAN + entity + Z + checksum digit.',
  },
  { id: 'accountHolder', label: 'Account Holder Name', placeholder: 'Name as per bank' },
  { id: 'accountNumber', label: 'Account Number', placeholder: 'Bank account number' },
  { id: 'ifsc', label: 'IFSC Code', placeholder: 'e.g. SBIN0001234', maxLength: 11, uppercase: true },
  { id: 'bankName', label: 'Bank Name', placeholder: 'e.g. State Bank of India' },
];

function normalizeGstInput(value) {
  return String(value || '').toUpperCase().replace(/\s/g, '').slice(0, 15);
}

function validateGstNumber(value) {
  const normalized = normalizeGstInput(value);
  if (!normalized) return 'GSTIN is required.';
  if (normalized.length !== 15) {
    return `GSTIN must be 15 characters (you entered ${normalized.length}). Example: 22AAAAA0000A1Z5`;
  }
  if (!GSTIN_REGEX.test(normalized)) {
    return 'Invalid GSTIN format. Use: 2-digit state + 10-char PAN + entity + Z + checksum (15 total).';
  }
  return null;
}

function handleKycFieldChange(field, rawValue, setFormData) {
  let value = rawValue;
  if (field.uppercase) {
    value = value.toUpperCase();
  }
  if (field.id === 'gstNumber') {
    value = normalizeGstInput(value);
  }
  if (field.maxLength) {
    value = value.slice(0, field.maxLength);
  }
  setFormData((prev) => ({ ...prev, [field.id]: value }));
}

const MyStores = () => {
  const location = useLocation();
  const { stores, activeStoreId, switchStore, refreshStores, isSwitching } = useStoreContext();
  const [isLoading, setIsLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isMapOpen, setIsMapOpen] = useState(false);
  const [categoryOptions, setCategoryOptions] = useState([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [documents, setDocuments] = useState(EMPTY_DOCUMENTS);
  const [formData, setFormData] = useState(INITIAL_FORM_DATA);
  const [resubmitStoreId, setResubmitStoreId] = useState(null);

  useEffect(() => {
    if (location.state?.welcomeNewAdmin) {
      setShowCreate(true);
      toast.success('Welcome! Add your first shop to begin the approval process.');
      window.history.replaceState({}, document.title);
    }
  }, [location.state?.welcomeNewAdmin]);

  useEffect(() => {
    const load = async () => {
      try {
        await refreshStores();
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [refreshStores]);

  useEffect(() => {
    if (!showCreate) return;

    const loadCategories = async () => {
      setCategoriesLoading(true);
      try {
        const response = await sellerApi.getCategoryTree();
        if (!response.data.success) return;

        const raw = response.data.results || response.data.result || [];
        const options = (Array.isArray(raw) ? raw : [])
          .filter((item) => item?.type === 'header' && item?.status !== 'inactive')
          .map((item) => item.name)
          .filter((name) => name && String(name).toLowerCase() !== 'all');

        setCategoryOptions(options);
      } catch (error) {
        console.error('Failed to load categories:', error);
        toast.error('Could not load categories');
      } finally {
        setCategoriesLoading(false);
      }
    };

    loadCategories();
  }, [showCreate]);

  const handleLocationSelect = (location) => {
    setFormData((prev) => ({
      ...prev,
      lat: location.lat,
      lng: location.lng,
      radius: location.radius,
      address: location.address,
    }));
  };

  const handleToggleActive = async (storeId) => {
    try {
      await sellerApi.toggleStoreActive(storeId);
      toast.success('Store status updated');
      await refreshStores();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to update store');
    }
  };

  const toggleCategory = (name) => {
    setFormData((prev) => {
      const selected = prev.categories.includes(name)
        ? prev.categories.filter((entry) => entry !== name)
        : [...prev.categories, name];
      return { ...prev, categories: selected };
    });
  };

  const buildStoreFormPayload = () => {
    const payload = new FormData();
    Object.entries(formData).forEach(([key, value]) => {
      if (key === 'categories') return;
      if (value !== null && value !== undefined && value !== '') {
        payload.append(key, value);
      }
    });
    formData.categories.forEach((categoryName) => {
      payload.append('categories', categoryName);
    });
    Object.entries(documents).forEach(([key, file]) => {
      if (file) payload.append(key, file);
    });
    return payload;
  };

  const handleCreateStore = async (e) => {
    e.preventDefault();
    if (!formData.categories.length) {
      toast.error('Please select at least one store category');
      return;
    }
    const missingDocs = REQUIRED_DOCS.filter((d) => !documents[d.id]);
    if (missingDocs.length) {
      toast.error(`Upload required documents: ${missingDocs.map((d) => d.label).join(', ')}`);
      return;
    }

    const gstError = validateGstNumber(formData.gstNumber);
    if (gstError) {
      toast.error(gstError);
      return;
    }

    setIsSubmitting(true);
    try {
      await sellerApi.createStore(buildStoreFormPayload());
      toast.success('Store submitted for admin approval');
      setShowCreate(false);
      setFormData(INITIAL_FORM_DATA);
      setDocuments(EMPTY_DOCUMENTS);
      await refreshStores();
    } catch (error) {
      const message =
        error.response?.data?.message ||
        error.message ||
        'Failed to create store';
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const openResubmit = (store) => {
    setResubmitStoreId(store._id);
    setFormData({
      ...INITIAL_FORM_DATA,
      shopName: store.shopName || '',
      categories: Array.isArray(store.categories) && store.categories.length
        ? store.categories
        : store.category ? [store.category] : [],
      description: store.description || '',
      address: store.address || '',
      locality: store.locality || '',
      city: store.city || '',
      state: store.state || '',
      pincode: store.pincode || '',
      lat: store.location?.coordinates?.[1] ?? null,
      lng: store.location?.coordinates?.[0] ?? null,
      radius: store.serviceRadius || 5,
      aadharNumber: store.aadharNumber || '',
      panNumber: store.panNumber || '',
      gstNumber: store.gstNumber || '',
      accountHolder: store.accountHolder || '',
      accountNumber: store.accountNumber || '',
      ifsc: store.ifsc || '',
      bankName: store.bankName || '',
    });
    setDocuments(EMPTY_DOCUMENTS);
    setShowCreate(true);
  };

  const handleResubmitStore = async (e) => {
    e.preventDefault();
    if (!resubmitStoreId) return;
    if (!formData.categories.length) {
      toast.error('Please select at least one store category');
      return;
    }
    const missingDocs = REQUIRED_DOCS.filter((d) => !documents[d.id]);
    if (missingDocs.length) {
      toast.error(`Upload required documents: ${missingDocs.map((d) => d.label).join(', ')}`);
      return;
    }

    const gstError = validateGstNumber(formData.gstNumber);
    if (gstError) {
      toast.error(gstError);
      return;
    }

    setIsSubmitting(true);
    try {
      await sellerApi.resubmitStoreKyc(resubmitStoreId, buildStoreFormPayload());
      toast.success('Application resubmitted for admin approval');
      setShowCreate(false);
      setResubmitStoreId(null);
      setFormData(INITIAL_FORM_DATA);
      setDocuments(EMPTY_DOCUMENTS);
      await refreshStores();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to resubmit application');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStoreCategoriesLabel = (store) => {
    const labels = Array.isArray(store.categories) && store.categories.length
      ? store.categories
      : store.category
        ? [store.category]
        : [];
    return labels.join(', ');
  };

  const isApplicationApproved = (store) => {
    const status = store.applicationStatus || (store.isVerified ? 'approved' : 'pending');
    return store.isVerified === true && status === 'approved';
  };

  const getStatus = (store) =>
    store.applicationStatus || (store.isVerified ? 'approved' : 'pending');

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900">My Stores</h1>
          <p className="text-sm text-slate-500 mt-1">
            Add and manage shop locations under your admin account. Each shop is reviewed and approved separately.
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="flex items-center gap-2">
          <Plus className="h-4 w-4" />
          Add New Store
        </Button>
      </div>

      {stores.length === 0 ? (
        <Card className="p-8 text-center">
          <Store className="h-12 w-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-800 font-bold text-lg">No shops yet</p>
          <p className="text-slate-500 text-sm mt-2 max-w-md mx-auto">
            Your seller admin account is ready. Add your first shop with location, category, KYC, and bank details. You can add more shops anytime from this page.
          </p>
          <Button onClick={() => setShowCreate(true)} className="mt-6 inline-flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Add your first shop
          </Button>
        </Card>
      ) : (
        <div className="space-y-4">
          {stores.some((store) => isApplicationApproved(store) && String(store._id) === String(activeStoreId)) && (
            <StoreCatalogImportPanel />
          )}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {stores.map((store) => {
            const status = getStatus(store);
            const badge = STATUS_BADGE[status] || STATUS_BADGE.pending;
            const isActive = String(store._id) === String(activeStoreId);

            return (
              <motion.div
                key={store._id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`rounded-2xl border bg-white p-5 shadow-sm transition-all ${
                  isActive ? 'border-primary ring-2 ring-primary/20' : 'border-slate-100'
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div>
                    <h3 className="font-bold text-slate-900">{store.shopName}</h3>
                    {getStoreCategoriesLabel(store) && (
                      <p className="text-[11px] font-semibold text-primary mt-1">
                        {getStoreCategoriesLabel(store)}
                      </p>
                    )}
                    <p className="text-xs text-slate-500 flex items-center gap-1 mt-1">
                      <MapPin className="h-3 w-3" />
                      {store.address || store.city || 'Location not set'}
                    </p>
                  </div>
                  <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full border ${badge.className}`}>
                    {badge.label}
                  </span>
                </div>

                <div className="flex flex-wrap gap-2 mt-4">
                  {!isActive && status === 'approved' && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isSwitching}
                      onClick={() => switchStore(store._id)}
                    >
                      Switch to this store
                    </Button>
                  )}
                  {isActive && (
                    <span className="text-xs font-bold text-primary flex items-center gap-1">
                      <CheckCircle className="h-3.5 w-3.5" /> Active store
                    </span>
                  )}
                  {isApplicationApproved(store) && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleToggleActive(store._id)}
                    >
                      {store.isActive ? 'Close store' : 'Open store'}
                    </Button>
                  )}
                  {!isApplicationApproved(store) && status === 'pending' && (
                    <span className="text-xs text-amber-600 flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" /> Awaiting admin approval
                    </span>
                  )}
                  {!isApplicationApproved(store) && status === 'rejected' && (
                    <div className="flex flex-col gap-2 w-full">
                      <span className="text-xs text-rose-600 flex items-center gap-1">
                        <XCircle className="h-3.5 w-3.5" /> {store.rejectionReason || 'Rejected'}
                      </span>
                      <Button size="sm" variant="outline" onClick={() => openResubmit(store)}>
                        Resubmit application
                      </Button>
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
        </div>
      )}

      <AnimatePresence>
        {showCreate && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[300] bg-black/50 flex items-center justify-center p-4"
            data-lenis-prevent
            data-lenis-prevent-touch
            data-lenis-prevent-wheel
            onClick={() => {
              setFormData(INITIAL_FORM_DATA);
              setDocuments(EMPTY_DOCUMENTS);
              setResubmitStoreId(null);
              setShowCreate(false);
            }}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl"
              data-lenis-prevent
              data-lenis-prevent-touch
              data-lenis-prevent-wheel
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6 pb-4 border-b border-slate-100 shrink-0">
                <h2 className="text-xl font-black text-slate-900">
                  {resubmitStoreId ? 'Resubmit Shop Application' : 'Add New Shop'}
                </h2>
                <p className="text-sm text-slate-500 mt-1">
                  {resubmitStoreId
                    ? 'Update KYC, GST, and documents, then resubmit for admin review.'
                    : 'Each shop needs its own location, category, KYC, GST, and bank details for admin approval.'}
                </p>
              </div>
              <form
                onSubmit={resubmitStoreId ? handleResubmitStore : handleCreateStore}
                className="flex-1 overflow-y-auto overscroll-contain p-6 space-y-4 min-h-0 custom-scrollbar-light"
                data-lenis-prevent
                data-lenis-prevent-touch
                data-lenis-prevent-wheel
              >
                <input
                  required
                  placeholder="Store name *"
                  className="w-full px-4 py-3 rounded-xl border border-slate-200"
                  value={formData.shopName}
                  onChange={(e) => setFormData({ ...formData, shopName: e.target.value })}
                />
                <div className="rounded-xl border border-slate-200 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-bold text-slate-700">Categories *</p>
                    <span className="text-xs text-slate-400">
                      {formData.categories.length} selected
                    </span>
                  </div>
                  <div
                    className="max-h-44 overflow-y-auto overscroll-contain space-y-1 pr-1 custom-scrollbar-light"
                    data-lenis-prevent
                    data-lenis-prevent-touch
                    data-lenis-prevent-wheel
                  >
                    {categoriesLoading ? (
                      <p className="text-sm text-slate-400 py-2">Loading categories...</p>
                    ) : categoryOptions.length === 0 ? (
                      <p className="text-sm text-slate-400 py-2">No categories available</p>
                    ) : (
                      categoryOptions.map((name) => {
                        const checked = formData.categories.includes(name);
                        return (
                          <label
                            key={name}
                            className={`flex items-center gap-3 rounded-lg px-3 py-2 cursor-pointer transition-colors ${
                              checked ? 'bg-primary/5 border border-primary/20' : 'hover:bg-slate-50 border border-transparent'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleCategory(name)}
                              className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary/30"
                            />
                            <span className="text-sm text-slate-700">{name}</span>
                          </label>
                        );
                      })
                    )}
                  </div>
                </div>
                <textarea
                  placeholder="Description"
                  className="w-full px-4 py-3 rounded-xl border border-slate-200"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                />

                <button
                  type="button"
                  onClick={() => setIsMapOpen(true)}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed border-primary/30 text-primary font-bold"
                >
                  <Navigation className="h-4 w-4" />
                  {formData.lat ? formData.address || 'Location selected' : 'Pick store location *'}
                </button>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {KYC_TEXT_FIELDS.map((field) => (
                    <div key={field.id} className={field.id === 'gstNumber' ? 'sm:col-span-2' : ''}>
                      <label className="block text-xs font-bold text-slate-600 mb-1.5">
                        {field.label}
                        <span className="text-rose-500"> *</span>
                      </label>
                      <input
                        required
                        placeholder={field.placeholder}
                        maxLength={field.maxLength}
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 font-mono text-sm uppercase"
                        value={formData[field.id]}
                        onChange={(e) => handleKycFieldChange(field, e.target.value, setFormData)}
                      />
                      {field.id === 'gstNumber' && (
                        <p className={`mt-1.5 text-[11px] font-medium ${
                          formData.gstNumber.length === 15 && GSTIN_REGEX.test(normalizeGstInput(formData.gstNumber))
                            ? 'text-emerald-600'
                            : 'text-slate-500'
                        }`}>
                          {formData.gstNumber.length}/15 characters
                          {formData.gstNumber.length > 0 && formData.gstNumber.length < 15
                            ? ' — add the final checksum digit'
                            : ''}
                        </p>
                      )}
                      {field.hint && field.id !== 'gstNumber' && (
                        <p className="mt-1 text-[11px] text-slate-500">{field.hint}</p>
                      )}
                    </div>
                  ))}
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-bold text-slate-700">Required documents</p>
                  {REQUIRED_DOCS.map((doc) => (
                    <label key={doc.id} className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 cursor-pointer hover:bg-slate-50">
                      <Upload className="h-4 w-4 text-slate-400" />
                      <span className="text-sm flex-1">{doc.label}</span>
                      <input
                        type="file"
                        accept="image/*,.pdf"
                        className="text-xs"
                        onChange={(e) => setDocuments({ ...documents, [doc.id]: e.target.files?.[0] || null })}
                      />
                    </label>
                  ))}
                </div>

                <div className="flex gap-3 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      setFormData(INITIAL_FORM_DATA);
                      setDocuments(EMPTY_DOCUMENTS);
                      setResubmitStoreId(null);
                      setShowCreate(false);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" className="flex-1" disabled={isSubmitting || !formData.lat}>
                    {isSubmitting ? 'Submitting...' : resubmitStoreId ? 'Resubmit for Approval' : 'Submit for Approval'}
                  </Button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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

export default MyStores;
