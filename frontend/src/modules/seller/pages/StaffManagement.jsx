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
  HiOutlineShieldCheck,
  HiOutlinePlus,
  HiOutlineXMark,
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

const emptyMatrix = () => matrixFromPermissions([]);

const applyMatrixCascade = (matrix, moduleId, level, checked) => {
  const next = {
    ...matrix,
    [moduleId]: { ...matrix[moduleId], [level]: checked },
  };
  if (level === 'write' && checked) next[moduleId].read = true;
  if (level === 'read' && !checked) next[moduleId].write = false;
  return next;
};

const PermissionMatrix = ({ matrix, onChange, disabled = false }) => (
  <div className="rounded-2xl border border-slate-100 overflow-hidden">
    <div className="sm:hidden divide-y divide-slate-100">
      {SELLER_PERMISSION_MODULES.map((module) => (
        <div key={module.id} className="px-4 py-3 hover:bg-slate-50/60">
          <p className="text-sm font-bold text-slate-900">{module.label}</p>
          <p className="text-[11px] text-slate-400">{module.description}</p>
          <div className="flex items-center gap-5 mt-2">
            <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
              <input
                type="checkbox" disabled={disabled}
                checked={Boolean(matrix[module.id]?.read)}
                onChange={(e) => onChange(module.id, 'read', e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              /> Read
            </label>
            <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
              <input
                type="checkbox" disabled={disabled}
                checked={Boolean(matrix[module.id]?.write)}
                onChange={(e) => onChange(module.id, 'write', e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              /> Write
            </label>
          </div>
        </div>
      ))}
    </div>
    <table className="w-full text-left hidden sm:table">
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
              <input type="checkbox" disabled={disabled}
                checked={Boolean(matrix[module.id]?.read)}
                onChange={(e) => onChange(module.id, 'read', e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
            </td>
            <td className="px-4 py-3 text-center">
              <input type="checkbox" disabled={disabled}
                checked={Boolean(matrix[module.id]?.write)}
                onChange={(e) => onChange(module.id, 'write', e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const emptyStaffForm = () => ({
  name: '',
  email: '',
  phone: '',
  password: '',
  customRoleId: '',
  storeId: '',
  permissionMatrix: emptyMatrix(),
});

const emptyRoleForm = () => ({
  name: '',
  label: '',
  description: '',
  storeId: '',
  permissionMatrix: emptyMatrix(),
});

const StaffManagement = () => {
  const [overview, setOverview] = useState({ stores: [], totalAssistants: 0 });
  const [loading, setLoading] = useState(false);
  const [selectedStoreId, setSelectedStoreId] = useState('all');
  const [activeTab, setActiveTab] = useState('staff');

  // Staff modal
  const [isStaffOpen, setIsStaffOpen] = useState(false);
  const [editStaffId, setEditStaffId] = useState(null);
  const [staffForm, setStaffForm] = useState(emptyStaffForm);

  // Role modal + list
  const [roles, setRoles] = useState([]);
  const [loadingRoles, setLoadingRoles] = useState(false);
  const [isRoleOpen, setIsRoleOpen] = useState(false);
  const [editRoleId, setEditRoleId] = useState(null);
  const [roleForm, setRoleForm] = useState(emptyRoleForm);

  const storeOptions = useMemo(
    () => overview.stores?.map((entry) => entry.store) || [],
    [overview.stores],
  );

  // Roles applicable to a given store: the store-scoped roles plus every
  // account-wide role. The owner can pick either when assigning staff.
  const rolesForStore = (storeId) => {
    if (!storeId) return [];
    return roles.filter(
      (r) => !r.storeId || String(r.storeId?._id || r.storeId) === String(storeId),
    );
  };

  const roleById = (id) => roles.find((r) => String(r._id) === String(id));

  const visibleAssistants = useMemo(() => {
    const rows = [];
    (overview.stores || []).forEach((entry) => {
      if (selectedStoreId !== 'all' && String(entry.store._id) !== String(selectedStoreId)) return;
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
        setOverview({ stores: payload.stores || [], totalAssistants: payload.totalAssistants || 0 });
      }
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to load assistants');
    } finally {
      setLoading(false);
    }
  };

  const fetchRoles = async () => {
    setLoadingRoles(true);
    try {
      const res = await sellerApi.getSellerRoles();
      if (res?.data?.success) {
        setRoles(res.data.results || res.data.result || []);
      }
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to load roles');
    } finally {
      setLoadingRoles(false);
    }
  };

  useEffect(() => {
    fetchOverview();
    fetchRoles();
  }, []);

  useEffect(() => {
    document.body.style.overflow = isStaffOpen || isRoleOpen ? 'hidden' : 'unset';
    return () => { document.body.style.overflow = 'unset'; };
  }, [isStaffOpen, isRoleOpen]);

  // ===== Staff handlers =====
  const openCreateStaff = () => {
    const initialStoreId = selectedStoreId !== 'all' ? selectedStoreId : storeOptions[0]?._id || '';
    if (!initialStoreId) {
      toast.error('Add a store first before creating assistants.');
      return;
    }
    const applicable = rolesForStore(initialStoreId);
    if (applicable.length === 0) {
      toast.error('Create a role for this store first.');
      setActiveTab('roles');
      return;
    }
    const firstRole = applicable[0];
    setEditStaffId(null);
    setStaffForm({
      ...emptyStaffForm(),
      storeId: initialStoreId,
      customRoleId: firstRole._id,
      permissionMatrix: matrixFromPermissions(firstRole.permissions || []),
    });
    setIsStaffOpen(true);
  };

  const openEditStaff = (assistant) => {
    const resolvedRoleId =
      assistant.customRoleId?._id ||
      assistant.customRoleId ||
      roles.find((r) => r.name === assistant.role && (!r.storeId || String(r.storeId?._id || r.storeId) === String(assistant.storeId)))?._id ||
      '';
    setEditStaffId(assistant._id);
    setStaffForm({
      name: assistant.name,
      email: assistant.email,
      phone: assistant.phone || '',
      password: '',
      storeId: String(assistant.storeId),
      customRoleId: resolvedRoleId,
      permissionMatrix: matrixFromPermissions(assistant.allowedPermissions || []),
    });
    setIsStaffOpen(true);
  };

  const onStaffStoreChange = (storeId) => {
    const applicable = rolesForStore(storeId);
    const nextRole = applicable[0];
    setStaffForm((prev) => ({
      ...prev,
      storeId,
      customRoleId: nextRole?._id || '',
      permissionMatrix: nextRole
        ? matrixFromPermissions(nextRole.permissions || [])
        : prev.permissionMatrix,
    }));
  };

  const onStaffRoleChange = (roleId) => {
    const role = roleById(roleId);
    setStaffForm((prev) => ({
      ...prev,
      customRoleId: roleId,
      permissionMatrix: role
        ? matrixFromPermissions(role.permissions || [])
        : prev.permissionMatrix,
    }));
  };

  const handleStaffMatrixChange = (moduleId, level, checked) => {
    setStaffForm((prev) => ({
      ...prev,
      permissionMatrix: applyMatrixCascade(prev.permissionMatrix, moduleId, level, checked),
    }));
  };

  const handleStaffDelete = async (id) => {
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

  const handleStaffSubmit = async (e) => {
    e.preventDefault();
    if (!staffForm.storeId) { toast.error('Select a store'); return; }
    if (!staffForm.customRoleId) { toast.error('Select a role'); return; }
    const allowedPermissions = buildPermissionsFromMatrix(staffForm.permissionMatrix);
    if (!allowedPermissions.length) { toast.error('Grant at least one read or write permission'); return; }
    if (!editStaffId && !staffForm.password) { toast.error('Password is required for new assistants'); return; }

    const payload = {
      name: staffForm.name,
      email: staffForm.email,
      phone: staffForm.phone,
      storeId: staffForm.storeId,
      customRoleId: staffForm.customRoleId,
      allowedPermissions,
    };
    if (staffForm.password) payload.password = staffForm.password;

    try {
      const res = editStaffId
        ? await sellerApi.updateStaff(editStaffId, payload)
        : await sellerApi.createStaff(payload);
      if (res?.data?.success) {
        toast.success(editStaffId ? 'Assistant updated' : 'Assistant created');
        setIsStaffOpen(false);
        fetchOverview();
      }
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to save assistant');
    }
  };

  // ===== Role handlers =====
  const openCreateRole = () => {
    const initialStoreId = selectedStoreId !== 'all' ? selectedStoreId : '';
    setEditRoleId(null);
    setRoleForm({ ...emptyRoleForm(), storeId: initialStoreId });
    setIsRoleOpen(true);
  };

  const openEditRole = (role) => {
    setEditRoleId(role._id);
    setRoleForm({
      name: role.name || '',
      label: role.label || '',
      description: role.description || '',
      storeId: role.storeId?._id || role.storeId || '',
      permissionMatrix: matrixFromPermissions(role.permissions || []),
    });
    setIsRoleOpen(true);
  };

  const handleRoleMatrixChange = (moduleId, level, checked) => {
    setRoleForm((prev) => ({
      ...prev,
      permissionMatrix: applyMatrixCascade(prev.permissionMatrix, moduleId, level, checked),
    }));
  };

  const handleRoleSubmit = async (e) => {
    e.preventDefault();
    if (!roleForm.name.trim()) { toast.error('Role name is required'); return; }
    const permissions = buildPermissionsFromMatrix(roleForm.permissionMatrix);
    if (!permissions.length) { toast.error('Grant at least one read or write permission'); return; }
    const payload = {
      name: roleForm.name,
      label: roleForm.label,
      description: roleForm.description,
      storeId: roleForm.storeId || 'all',
      permissions,
    };
    try {
      const res = editRoleId
        ? await sellerApi.updateSellerRole(editRoleId, payload)
        : await sellerApi.createSellerRole(payload);
      if (res?.data?.success) {
        toast.success(editRoleId ? 'Role updated' : 'Role created');
        setIsRoleOpen(false);
        fetchRoles();
        if (editRoleId) fetchOverview();
      }
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to save role');
    }
  };

  const handleRoleDelete = async (role) => {
    if (!window.confirm(`Delete role "${role.label || role.name}"?`)) return;
    try {
      const res = await sellerApi.deleteSellerRole(role._id);
      if (res?.data?.success) {
        toast.success('Role deleted');
        fetchRoles();
      }
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to delete role');
    }
  };

  const renderPermissionBadges = (assistant) => {
    const summary = assistant.permissionSummary || [];
    if (!summary.length) {
      return (
        <span className="text-xs text-rose-500 font-bold flex items-center gap-1">
          <HiOutlineLockClosed className="h-3.5 w-3.5" /> NO ACCESS
        </span>
      );
    }
    return (
      <div className="flex flex-wrap gap-1.5 max-w-xl">
        {summary.map((entry) => {
          const module = SELLER_PERMISSION_MODULES.find((item) => item.id === entry.module);
          const access = entry.write ? 'RW' : 'R';
          return (
            <span key={entry.module} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-50 text-[10px] font-bold text-slate-600 border border-slate-100">
              {(module?.label || entry.module).toUpperCase()}
              <span className="text-indigo-600">{access}</span>
            </span>
          );
        })}
      </div>
    );
  };

  // ---- Filtered role list for the current store tab ----
  const rolesForActiveTab = useMemo(() => {
    if (selectedStoreId === 'all') return roles;
    return roles.filter(
      (r) => !r.storeId || String(r.storeId?._id || r.storeId) === String(selectedStoreId),
    );
  }, [roles, selectedStoreId]);

  const applicableRolesForStaffForm = rolesForStore(staffForm.storeId);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <HiOutlineUserGroup className="h-8 w-8 text-indigo-600" />
            Team & Access
          </h1>
          <p className="text-slate-500 text-sm mt-1 max-w-2xl">
            Create custom roles per shop (or across all your shops), then onboard assistants and assign them a role with scoped read/write permissions.
          </p>
        </div>

        {activeTab === 'staff' ? (
          <Button
            onClick={openCreateStaff}
            className="bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center gap-2 shadow-lg shadow-indigo-100"
          >
            <HiOutlineUserPlus className="h-5 w-5" /> Add Assistant
          </Button>
        ) : (
          <Button
            onClick={openCreateRole}
            className="bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center gap-2 shadow-lg shadow-indigo-100"
          >
            <HiOutlinePlus className="h-5 w-5" /> Create Role
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-5">
          <p className="text-xs font-black uppercase tracking-wider text-slate-400">Total assistants</p>
          <p className="text-3xl font-black text-slate-900 mt-2">{overview.totalAssistants}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-black uppercase tracking-wider text-slate-400">Custom roles</p>
          <p className="text-3xl font-black text-slate-900 mt-2">{roles.length}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-black uppercase tracking-wider text-slate-400">Stores covered</p>
          <p className="text-3xl font-black text-slate-900 mt-2">{storeOptions.length}</p>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-100">
        {[
          { key: 'staff', label: 'Assistants', icon: HiOutlineUserGroup, count: overview.totalAssistants },
          { key: 'roles', label: 'Custom Roles', icon: HiOutlineShieldCheck, count: roles.length },
        ].map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-black uppercase tracking-wider transition-all border-b-2 ${
                active ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-400 hover:text-slate-600'
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
              <span className={`ml-1 text-[10px] px-2 py-0.5 rounded-full ${active ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-100 text-slate-500'}`}>{tab.count}</span>
            </button>
          );
        })}
      </div>

      {/* Store filter */}
      <Card className="p-4">
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setSelectedStoreId('all')}
            className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
              selectedStoreId === 'all' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}>
            All stores
          </button>
          {storeOptions.map((store) => (
            <button
              key={store._id} type="button"
              onClick={() => setSelectedStoreId(String(store._id))}
              className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                String(selectedStoreId) === String(store._id) ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}>
              {store.shopName}
            </button>
          ))}
        </div>
      </Card>

      {/* ===== Staff tab ===== */}
      {activeTab === 'staff' && (
        <div className="sm:bg-white sm:rounded-3xl sm:border sm:border-slate-100 sm:shadow-sm overflow-hidden">
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
                Add assistants and assign them a custom role scoped to this shop.
              </p>
              <Button onClick={openCreateStaff} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                Add first assistant
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse mobile-table-card">
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
                  {visibleAssistants.map((assistant) => {
                    const linkedRole = roleById(assistant.customRoleId?._id || assistant.customRoleId);
                    const roleLabel = linkedRole?.label || assistant.role;
                    return (
                      <tr key={assistant._id} className="hover:bg-slate-50/50 transition-colors align-top">
                        <td className="px-6 py-5" data-label="Assistant">
                          <div className="flex items-center gap-3">
                            <div className="h-11 w-11 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-700 text-sm font-black border border-indigo-100">
                              {assistant.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="text-sm font-black text-slate-900">{assistant.name}</p>
                              <p className="text-xs text-slate-400 mt-1 flex items-center gap-1.5">
                                <HiOutlineEnvelope className="h-3.5 w-3.5" /> {assistant.email}
                              </p>
                              {assistant.phone && (
                                <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1.5">
                                  <HiOutlineDevicePhoneMobile className="h-3.5 w-3.5" /> {assistant.phone}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-5" data-label="Store">
                          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700">
                            <HiOutlineBuildingStorefront className="h-4 w-4 text-indigo-500" />
                            {assistant.storeName}
                          </span>
                        </td>
                        <td className="px-6 py-5" data-label="Role">
                          <Badge variant="indigo">{String(roleLabel || '').toUpperCase()}</Badge>
                        </td>
                        <td className="px-6 py-5" data-label="Permissions">{renderPermissionBadges(assistant)}</td>
                        <td className="px-6 py-5 text-right" data-label="Actions">
                          <div className="flex items-center justify-end gap-2">
                            <button onClick={() => openEditStaff(assistant)} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all" title="Edit assistant">
                              <HiOutlinePencil className="h-5 w-5" />
                            </button>
                            <button onClick={() => handleStaffDelete(assistant._id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all" title="Remove assistant">
                              <HiOutlineTrash className="h-5 w-5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ===== Roles tab ===== */}
      {activeTab === 'roles' && (
        <Card>
          {loadingRoles && roles.length === 0 ? (
            <div className="p-12 text-center text-slate-500 font-medium">Loading roles...</div>
          ) : rolesForActiveTab.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
              <div className="h-20 w-20 bg-indigo-50 rounded-3xl flex items-center justify-center mb-6">
                <HiOutlineShieldCheck className="h-10 w-10 text-indigo-600" />
              </div>
              <h3 className="text-xl font-black text-slate-900 mb-1">
                {selectedStoreId === 'all' ? 'No custom roles yet' : 'No roles for this store yet'}
              </h3>
              <p className="text-slate-500 text-sm max-w-md mb-8">
                Define roles with specific read/write permissions. Each role can be scoped to one shop or shared across all your shops.
              </p>
              <Button onClick={openCreateRole} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                Create first role
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 p-6">
              {rolesForActiveTab.map((role) => {
                const storeName = role.storeId?.shopName;
                const scopeLabel = storeName
                  ? `Store: ${storeName}`
                  : 'All shops';
                return (
                  <div key={role._id} className="border-2 border-slate-100 rounded-2xl p-5 hover:border-indigo-200 transition-all bg-white">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-black text-slate-900 text-base tracking-tight">
                            {role.label || role.name}
                          </h4>
                        </div>
                        <p className="text-xs text-slate-400 font-mono mt-0.5 truncate">{role.name}</p>
                        <Badge variant={storeName ? 'warning' : 'success'}>
                          <span className="text-[10px]">{scopeLabel}</span>
                        </Badge>
                        {role.description && (
                          <p className="text-xs text-slate-500 mt-2 leading-snug">{role.description}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => openEditRole(role)} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all" title="Edit role">
                          <HiOutlinePencil className="h-4 w-4" />
                        </button>
                        <button onClick={() => handleRoleDelete(role)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all" title="Delete role">
                          <HiOutlineTrash className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1 pt-3 border-t border-slate-100">
                      {(role.permissions || []).length === 0 ? (
                        <span className="text-[10px] font-bold text-slate-400 italic">No permissions</span>
                      ) : (
                        (() => {
                          // Collapse "module:read" + "module:write" into one chip per module.
                          const byModule = {};
                          role.permissions.forEach((p) => {
                            const [mod, lvl] = p.split(':');
                            byModule[mod] = byModule[mod] || { module: mod };
                            if (lvl === 'read') byModule[mod].read = true;
                            if (lvl === 'write') byModule[mod].write = true;
                          });
                          return Object.values(byModule).map((entry) => {
                            const mod = SELLER_PERMISSION_MODULES.find((m) => m.id === entry.module);
                            const label = (mod?.label || entry.module).toUpperCase();
                            const level = entry.write ? 'RW' : 'R';
                            return (
                              <span key={entry.module} className="text-[10px] font-black uppercase bg-slate-50 text-slate-600 px-2 py-0.5 rounded border border-slate-200">
                                {label} <span className="text-indigo-600">{level}</span>
                              </span>
                            );
                          });
                        })()
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {/* ===== Staff Modal ===== */}
      <AnimatePresence>
        {isStaffOpen && (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-white rounded-[2rem] w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl border border-slate-100"
            >
              <div className="p-6 md:p-8 border-b border-slate-100 flex items-center justify-between shrink-0">
                <div>
                  <h3 className="text-2xl font-black text-slate-900">
                    {editStaffId ? 'Update assistant access' : 'Add store assistant'}
                  </h3>
                  <p className="text-slate-500 text-sm mt-1">
                    Assign the assistant to a shop, pick one of your custom roles, and fine-tune module permissions.
                  </p>
                </div>
                <button onClick={() => setIsStaffOpen(false)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-full transition-all">
                  <HiOutlineXMark className="h-6 w-6" />
                </button>
              </div>

              <form onSubmit={handleStaffSubmit} className="flex-1 overflow-y-auto overscroll-contain p-6 md:p-8 space-y-6 min-h-0">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-black text-slate-700 uppercase tracking-widest">Store *</label>
                    <select required value={staffForm.storeId}
                      onChange={(e) => onStaffStoreChange(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white">
                      <option value="">Select store</option>
                      {storeOptions.map((store) => (
                        <option key={store._id} value={store._id}>{store.shopName}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-black text-slate-700 uppercase tracking-widest">Role *</label>
                    <select required value={staffForm.customRoleId}
                      onChange={(e) => onStaffRoleChange(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white">
                      <option value="">Select role</option>
                      {applicableRolesForStaffForm.map((r) => (
                        <option key={r._id} value={r._id}>
                          {(r.label || r.name)}{r.storeId ? '' : ' (All shops)'}
                        </option>
                      ))}
                    </select>
                    {applicableRolesForStaffForm.length === 0 && (
                      <p className="text-[10px] text-rose-500 font-bold">
                        No roles available for this shop. <button type="button" onClick={() => { setIsStaffOpen(false); setActiveTab('roles'); }} className="underline">Create one</button>.
                      </p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-black text-slate-700 uppercase tracking-widest">Full name *</label>
                    <input type="text" required value={staffForm.name}
                      onChange={(e) => setStaffForm((prev) => ({ ...prev, name: e.target.value }))}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200" />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-black text-slate-700 uppercase tracking-widest">Email *</label>
                    <input type="email" required value={staffForm.email}
                      onChange={(e) => setStaffForm((prev) => ({ ...prev, email: e.target.value }))}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200" />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-black text-slate-700 uppercase tracking-widest">Phone *</label>
                    <input type="tel" required value={staffForm.phone}
                      onChange={(e) => setStaffForm((prev) => ({ ...prev, phone: e.target.value }))}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200" />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-black text-slate-700 uppercase tracking-widest">
                      Password {editStaffId ? '(optional)' : '*'}
                    </label>
                    <input type="password" required={!editStaffId} minLength={6}
                      value={staffForm.password}
                      onChange={(e) => setStaffForm((prev) => ({ ...prev, password: e.target.value }))}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200" />
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <p className="text-xs font-black text-slate-700 uppercase tracking-widest">Module permissions *</p>
                    <p className="text-xs text-slate-400 mt-1">
                      Inherited from the selected role — toggle individual modules to override for this assistant.
                    </p>
                  </div>
                  <PermissionMatrix matrix={staffForm.permissionMatrix} onChange={handleStaffMatrixChange} />
                </div>

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                  <Button type="button" onClick={() => setIsStaffOpen(false)} className="bg-slate-100 text-slate-700">Cancel</Button>
                  <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white">
                    {editStaffId ? 'Save access' : 'Create assistant'}
                  </Button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ===== Role Modal ===== */}
      <AnimatePresence>
        {isRoleOpen && (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-white rounded-[2rem] w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl border border-slate-100"
            >
              <div className="p-6 md:p-8 border-b border-slate-100 flex items-center justify-between shrink-0">
                <div>
                  <h3 className="text-2xl font-black text-slate-900">
                    {editRoleId ? 'Edit custom role' : 'Create custom role'}
                  </h3>
                  <p className="text-slate-500 text-sm mt-1">
                    Pick a scope — one specific shop or all shops — and set the default read/write permissions.
                  </p>
                </div>
                <button onClick={() => setIsRoleOpen(false)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-full transition-all">
                  <HiOutlineXMark className="h-6 w-6" />
                </button>
              </div>

              <form onSubmit={handleRoleSubmit} className="flex-1 overflow-y-auto overscroll-contain p-6 md:p-8 space-y-6 min-h-0">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-black text-slate-700 uppercase tracking-widest">Role key *</label>
                    <input type="text" required placeholder="e.g. store_manager"
                      value={roleForm.name}
                      onChange={(e) => setRoleForm((p) => ({ ...p, name: e.target.value }))}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200" />
                    <p className="text-[10px] text-slate-400">Lowercase, no spaces (used internally).</p>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-black text-slate-700 uppercase tracking-widest">Display label</label>
                    <input type="text" placeholder="e.g. Store Manager"
                      value={roleForm.label}
                      onChange={(e) => setRoleForm((p) => ({ ...p, label: e.target.value }))}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200" />
                  </div>
                  <div className="space-y-1.5 md:col-span-2">
                    <label className="text-xs font-black text-slate-700 uppercase tracking-widest">Scope *</label>
                    <select value={roleForm.storeId}
                      onChange={(e) => setRoleForm((p) => ({ ...p, storeId: e.target.value }))}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white">
                      <option value="">All shops (account-wide)</option>
                      {storeOptions.map((store) => (
                        <option key={store._id} value={store._id}>Only: {store.shopName}</option>
                      ))}
                    </select>
                    <p className="text-[10px] text-slate-400">
                      Account-wide roles can be assigned to assistants of any shop. Store-scoped roles only appear when adding an assistant to that specific shop.
                    </p>
                  </div>
                  <div className="space-y-1.5 md:col-span-2">
                    <label className="text-xs font-black text-slate-700 uppercase tracking-widest">Description</label>
                    <textarea rows={2} placeholder="What this role is responsible for..."
                      value={roleForm.description}
                      onChange={(e) => setRoleForm((p) => ({ ...p, description: e.target.value }))}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200" />
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <p className="text-xs font-black text-slate-700 uppercase tracking-widest">Default permissions *</p>
                    <p className="text-xs text-slate-400 mt-1">
                      Assistants assigned this role start with these modules enabled. They can still be overridden per assistant.
                    </p>
                  </div>
                  <PermissionMatrix matrix={roleForm.permissionMatrix} onChange={handleRoleMatrixChange} />
                </div>

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                  <Button type="button" onClick={() => setIsRoleOpen(false)} className="bg-slate-100 text-slate-700">Cancel</Button>
                  <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white">
                    {editRoleId ? 'Save role' : 'Create role'}
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
