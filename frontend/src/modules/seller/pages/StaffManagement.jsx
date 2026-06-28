import React, { useState, useEffect, useMemo } from 'react';
import { sellerApi } from '../services/sellerApi';
import {
  SELLER_PERMISSION_MODULES,
  buildPermissionsFromMatrix,
  matrixFromPermissions,
} from '../constants/sellerPermissions';
import {
  HiOutlineUserPlus,
  HiOutlinePencil,
  HiOutlineTrash,
  HiOutlineCheck,
  HiOutlineLockClosed,
  HiOutlineDevicePhoneMobile,
  HiOutlineEnvelope,
  HiOutlineUserGroup,
  HiOutlineBuildingStorefront,
} from 'react-icons/hi2';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

const Card = ({ children, className = '' }) => (
  <div className={`bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden ${className}`}>
    {children}
  </div>
);

const Badge = ({ children, variant = 'neutral' }) => {
  const styles = {
    danger: 'bg-rose-50 text-rose-600 border border-rose-100',
    success: 'bg-emerald-50 text-emerald-600 border border-emerald-100',
    warning: 'bg-amber-50 text-amber-600 border border-amber-100',
    indigo: 'bg-indigo-50 text-indigo-600 border border-indigo-100',
    neutral: 'bg-slate-50 text-slate-600 border border-slate-100',
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${styles[variant]}`}>
      {children}
    </span>
  );
};

const Button = ({ children, className = '', ...props }) => (
  <button
    className={`px-4 py-2.5 rounded-xl font-bold text-sm transition-all duration-300 active:scale-95 disabled:opacity-50 ${className}`}
    {...props}
  >
    {children}
  </button>
);

const ROLES_LIST = [
  { id: 'manager', label: 'Store Manager' },
  { id: 'cashier', label: 'Cashier / Accountant' },
  { id: 'helper', label: 'Store Assistant' },
  { id: 'operator', label: 'Store Operator' },
];

const emptyMatrix = () => matrixFromPermissions([]);

const PermissionMatrix = ({ matrix, onChange, disabled = false }) => (
  <div className="overflow-x-auto rounded-2xl border border-slate-100">
    <table className="w-full min-w-[520px] text-left">
      <thead>
        <tr className="bg-slate-50 border-b border-slate-100">
          <th className="px-4 py-3 text-xs font-black uppercase tracking-wider text-slate-500">Module</th>
          <th className="px-4 py-3 text-xs font-black uppercase tracking-wider text-slate-500 text-center w-24">Read</th>
          <th className="px-4 py-3 text-xs font-black uppercase tracking-wider text-slate-500 text-center w-24">Write</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {SELLER_PERMISSION_MODULES.map((module) => (
          <tr key={module.id} className="hover:bg-slate-50/60">
            <td className="px-4 py-3">
              <p className="text-sm font-bold text-slate-900">{module.label}</p>
              <p className="text-[11px] text-slate-400">{module.description}</p>
            </td>
            <td className="px-4 py-3 text-center">
              <input
                type="checkbox"
                disabled={disabled}
                checked={Boolean(matrix[module.id]?.read)}
                onChange={(e) => {
                  const checked = e.target.checked;
                  onChange(module.id, 'read', checked);
                }}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
            </td>
            <td className="px-4 py-3 text-center">
              <input
                type="checkbox"
                disabled={disabled}
                checked={Boolean(matrix[module.id]?.write)}
                onChange={(e) => {
                  const checked = e.target.checked;
                  onChange(module.id, 'write', checked);
                }}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const StaffManagement = () => {
  const [overview, setOverview] = useState({ stores: [], totalAssistants: 0 });
  const [loading, setLoading] = useState(false);
  const [selectedStoreId, setSelectedStoreId] = useState('all');
  const [isOpen, setIsOpen] = useState(false);
  const [editId, setEditId] = useState(null);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    role: 'helper',
    storeId: '',
    permissionMatrix: emptyMatrix(),
  });

  const storeOptions = useMemo(
    () => overview.stores?.map((entry) => entry.store) || [],
    [overview.stores],
  );

  const visibleAssistants = useMemo(() => {
    const rows = [];
    (overview.stores || []).forEach((entry) => {
      if (selectedStoreId !== 'all' && String(entry.store._id) !== String(selectedStoreId)) {
        return;
      }
      (entry.assistants || []).forEach((assistant) => {
        rows.push({
          ...assistant,
          storeName: entry.store.shopName,
          storeId: entry.store._id,
        });
      });
    });
    return rows;
  }, [overview.stores, selectedStoreId]);

  const fetchOverview = async () => {
    setLoading(true);
    try {
      const res = await sellerApi.getStaffOverview();
      if (res?.data?.success) {
        const payload = res.data.result || {};
        setOverview({
          stores: payload.stores || [],
          totalAssistants: payload.totalAssistants || 0,
        });
      }
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to load assistants');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOverview();
  }, []);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  const resetForm = (storeId = '') => {
    setFormData({
      name: '',
      email: '',
      phone: '',
      password: '',
      role: 'helper',
      storeId: storeId || (selectedStoreId !== 'all' ? selectedStoreId : storeOptions[0]?._id || ''),
      permissionMatrix: emptyMatrix(),
    });
  };

  const handleOpenCreate = () => {
    setEditId(null);
    resetForm();
    setIsOpen(true);
  };

  const handleOpenEdit = (assistant) => {
    setEditId(assistant._id);
    setFormData({
      name: assistant.name,
      email: assistant.email,
      phone: assistant.phone || '',
      password: '',
      role: assistant.role || 'helper',
      storeId: assistant.storeId,
      permissionMatrix: matrixFromPermissions(assistant.allowedPermissions || []),
    });
    setIsOpen(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Remove this assistant? They will lose access immediately.')) return;
    try {
      const res = await sellerApi.deleteStaff(id);
      if (res?.data?.success) {
        toast.success('Assistant removed');
        fetchOverview();
      }
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to remove assistant');
    }
  };

  const handleMatrixChange = (moduleId, level, checked) => {
    setFormData((prev) => {
      const nextMatrix = {
        ...prev.permissionMatrix,
        [moduleId]: {
          ...prev.permissionMatrix[moduleId],
          [level]: checked,
        },
      };

      if (level === 'write' && checked) {
        nextMatrix[moduleId].read = true;
      }
      if (level === 'read' && !checked) {
        nextMatrix[moduleId].write = false;
      }

      return { ...prev, permissionMatrix: nextMatrix };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.storeId) {
      toast.error('Select a store for this assistant');
      return;
    }

    const allowedPermissions = buildPermissionsFromMatrix(formData.permissionMatrix);
    if (!allowedPermissions.length) {
      toast.error('Grant at least one read or write permission');
      return;
    }

    if (!editId && !formData.password) {
      toast.error('Password is required for new assistants');
      return;
    }

    const payload = {
      name: formData.name,
      email: formData.email,
      phone: formData.phone,
      role: formData.role,
      storeId: formData.storeId,
      allowedPermissions,
    };
    if (formData.password) payload.password = formData.password;

    try {
      const res = editId
        ? await sellerApi.updateStaff(editId, payload)
        : await sellerApi.createStaff(payload);

      if (res?.data?.success) {
        toast.success(editId ? 'Assistant updated' : 'Assistant created');
        setIsOpen(false);
        fetchOverview();
      }
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to save assistant');
    }
  };

  const renderPermissionBadges = (assistant) => {
    const summary = assistant.permissionSummary || [];
    if (!summary.length) {
      return (
        <span className="text-xs text-rose-500 font-bold flex items-center gap-1">
          <HiOutlineLockClosed className="h-3.5 w-3.5" />
          NO ACCESS
        </span>
      );
    }

    return (
      <div className="flex flex-wrap gap-1.5 max-w-xl">
        {summary.map((entry) => {
          const module = SELLER_PERMISSION_MODULES.find((item) => item.id === entry.module);
          const access = entry.write ? 'RW' : 'R';
          return (
            <span
              key={entry.module}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-50 text-[10px] font-bold text-slate-600 border border-slate-100"
            >
              {(module?.label || entry.module).toUpperCase()}
              <span className="text-indigo-600">{access}</span>
            </span>
          );
        })}
      </div>
    );
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <HiOutlineUserGroup className="h-8 w-8 text-indigo-600" />
            Team & Access
          </h1>
          <p className="text-slate-500 text-sm mt-1 max-w-2xl">
            Create store assistants with separate read and write permissions for each module, scoped per store location.
          </p>
        </div>

        <Button
          onClick={handleOpenCreate}
          className="bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center gap-2 shadow-lg shadow-indigo-100"
        >
          <HiOutlineUserPlus className="h-5 w-5" />
          Add Assistant
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-5">
          <p className="text-xs font-black uppercase tracking-wider text-slate-400">Total assistants</p>
          <p className="text-3xl font-black text-slate-900 mt-2">{overview.totalAssistants}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-black uppercase tracking-wider text-slate-400">Stores covered</p>
          <p className="text-3xl font-black text-slate-900 mt-2">{storeOptions.length}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-black uppercase tracking-wider text-slate-400">Access model</p>
          <p className="text-sm font-bold text-slate-700 mt-3">Read / Write per module, per store</p>
        </Card>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setSelectedStoreId('all')}
            className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
              selectedStoreId === 'all'
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            All stores
          </button>
          {storeOptions.map((store) => (
            <button
              key={store._id}
              type="button"
              onClick={() => setSelectedStoreId(String(store._id))}
              className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                String(selectedStoreId) === String(store._id)
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {store.shopName}
            </button>
          ))}
        </div>
      </Card>

      <Card>
        {loading && visibleAssistants.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600" />
            <p className="text-slate-500 text-sm font-medium mt-4">Loading assistants...</p>
          </div>
        ) : visibleAssistants.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
            <div className="h-20 w-20 bg-indigo-50 rounded-3xl flex items-center justify-center mb-6">
              <HiOutlineUserGroup className="h-10 w-10 text-indigo-600" />
            </div>
            <h3 className="text-xl font-black text-slate-900 mb-1">No assistants for this store yet</h3>
            <p className="text-slate-500 text-sm max-w-md mb-8">
              Add assistants and assign read-only or read/write access to orders, products, inventory, and more.
            </p>
            <Button onClick={handleOpenCreate} className="bg-indigo-600 hover:bg-indigo-700 text-white">
              Add first assistant
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/75 border-b border-slate-100">
                  <th className="px-6 py-4 text-xs font-black text-slate-500 uppercase tracking-wider">Assistant</th>
                  <th className="px-6 py-4 text-xs font-black text-slate-500 uppercase tracking-wider">Store</th>
                  <th className="px-6 py-4 text-xs font-black text-slate-500 uppercase tracking-wider">Role</th>
                  <th className="px-6 py-4 text-xs font-black text-slate-500 uppercase tracking-wider">Permissions</th>
                  <th className="px-6 py-4 text-xs font-black text-slate-500 uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleAssistants.map((assistant) => (
                  <tr key={assistant._id} className="hover:bg-slate-50/50 transition-colors align-top">
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-3">
                        <div className="h-11 w-11 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-700 text-sm font-black border border-indigo-100">
                          {assistant.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-black text-slate-900">{assistant.name}</p>
                          <p className="text-xs text-slate-400 mt-1 flex items-center gap-1.5">
                            <HiOutlineEnvelope className="h-3.5 w-3.5" />
                            {assistant.email}
                          </p>
                          {assistant.phone && (
                            <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1.5">
                              <HiOutlineDevicePhoneMobile className="h-3.5 w-3.5" />
                              {assistant.phone}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700">
                        <HiOutlineBuildingStorefront className="h-4 w-4 text-indigo-500" />
                        {assistant.storeName}
                      </span>
                    </td>
                    <td className="px-6 py-5">
                      <Badge variant="indigo">
                        {(ROLES_LIST.find((role) => role.id === assistant.role)?.label || assistant.role).toUpperCase()}
                      </Badge>
                    </td>
                    <td className="px-6 py-5">{renderPermissionBadges(assistant)}</td>
                    <td className="px-6 py-5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleOpenEdit(assistant)}
                          className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"
                          title="Edit assistant"
                        >
                          <HiOutlinePencil className="h-5 w-5" />
                        </button>
                        <button
                          onClick={() => handleDelete(assistant._id)}
                          className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                          title="Remove assistant"
                        >
                          <HiOutlineTrash className="h-5 w-5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <AnimatePresence>
        {isOpen && (
          <div
            className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
            data-lenis-prevent
            data-lenis-prevent-touch
            data-lenis-prevent-wheel
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-white rounded-[2rem] w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl border border-slate-100"
              data-lenis-prevent
              data-lenis-prevent-touch
              data-lenis-prevent-wheel
            >
              <div className="p-6 md:p-8 border-b border-slate-100 shrink-0">
                <h3 className="text-2xl font-black text-slate-900">
                  {editId ? 'Update assistant access' : 'Add store assistant'}
                </h3>
                <p className="text-slate-500 text-sm mt-1">
                  Assign the assistant to one store and configure module-level read/write permissions.
                </p>
              </div>

              <form
                onSubmit={handleSubmit}
                className="flex-1 overflow-y-auto overscroll-contain p-6 md:p-8 space-y-6 min-h-0 custom-scrollbar-light"
                data-lenis-prevent
                data-lenis-prevent-touch
                data-lenis-prevent-wheel
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5 md:col-span-2">
                    <label className="text-xs font-black text-slate-700 uppercase tracking-widest">Store *</label>
                    <select
                      required
                      value={formData.storeId}
                      onChange={(e) => setFormData((prev) => ({ ...prev, storeId: e.target.value }))}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white"
                    >
                      <option value="">Select store</option>
                      {storeOptions.map((store) => (
                        <option key={store._id} value={store._id}>
                          {store.shopName}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-black text-slate-700 uppercase tracking-widest">Full name *</label>
                    <input
                      type="text"
                      required
                      value={formData.name}
                      onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-black text-slate-700 uppercase tracking-widest">Email *</label>
                    <input
                      type="email"
                      required
                      value={formData.email}
                      onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-black text-slate-700 uppercase tracking-widest">Phone *</label>
                    <input
                      type="tel"
                      required
                      value={formData.phone}
                      onChange={(e) => setFormData((prev) => ({ ...prev, phone: e.target.value }))}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-black text-slate-700 uppercase tracking-widest">
                      Password {editId ? '(optional)' : '*'}
                    </label>
                    <input
                      type="password"
                      required={!editId}
                      minLength={6}
                      value={formData.password}
                      onChange={(e) => setFormData((prev) => ({ ...prev, password: e.target.value }))}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200"
                    />
                  </div>

                  <div className="space-y-1.5 md:col-span-2">
                    <label className="text-xs font-black text-slate-700 uppercase tracking-widest">Operational role</label>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {ROLES_LIST.map((roleOpt) => {
                        const isSelected = formData.role === roleOpt.id;
                        return (
                          <button
                            key={roleOpt.id}
                            type="button"
                            onClick={() => setFormData((prev) => ({ ...prev, role: roleOpt.id }))}
                            className={`p-3 rounded-2xl border-2 text-left transition-all ${
                              isSelected ? 'border-indigo-600 bg-indigo-50/20' : 'border-slate-100 bg-slate-50/50'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-black text-slate-900">{roleOpt.label}</span>
                              {isSelected && <HiOutlineCheck className="h-4 w-4 text-indigo-600" />}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <p className="text-xs font-black text-slate-700 uppercase tracking-widest">Module permissions *</p>
                    <p className="text-xs text-slate-400 mt-1">
                      Read allows viewing data. Write allows create, update, and delete actions in that module.
                    </p>
                  </div>
                  <PermissionMatrix
                    matrix={formData.permissionMatrix}
                    onChange={handleMatrixChange}
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                  <Button type="button" onClick={() => setIsOpen(false)} className="bg-slate-100 text-slate-700">
                    Cancel
                  </Button>
                  <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white">
                    {editId ? 'Save access' : 'Create assistant'}
                  </Button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default StaffManagement;
