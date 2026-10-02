import React, { useState, useEffect, useMemo } from 'react';
import Card from '@shared/components/ui/Card';
import Button from '@shared/components/ui/Button';
import Badge from '@shared/components/ui/Badge';
import { adminApi } from '../services/adminApi';
import { useAuth } from '@core/context/AuthContext';
import { toast } from 'sonner';
import {
  HiOutlineUserAdd,
  HiOutlineTrash,
  HiOutlinePencil,
  HiOutlineLockClosed,
  HiOutlineCheck,
  HiOutlineX,
  HiOutlineEye,
  HiOutlineEyeOff,
  HiOutlinePlus,
  HiOutlineUserGroup,
  HiOutlineShieldCheck,
} from 'react-icons/hi';
import { motion, AnimatePresence } from 'framer-motion';

const PERMISSIONS_LIST = [
  { key: 'dashboard', label: 'Dashboard', desc: 'Overview of platform statistics' },
  { key: 'categories', label: 'Categories', desc: 'Create, update & structure categories' },
  { key: 'products', label: 'Products', desc: 'Manage catalogue products & pricing' },
  { key: 'marketing', label: 'Marketing Tools', desc: 'Banners, coupons, and push campaigns' },
  { key: 'support', label: 'Customer Support', desc: 'Help tickets & review moderation' },
  { key: 'sellers', label: 'Sellers', desc: 'Approve, reject & manage vendor store files' },
  { key: 'delivery', label: 'Delivery Drivers', desc: 'Onboard riders, tracking, and cash collection' },
  { key: 'wallet', label: 'Wallet', desc: 'Platform balances & commission ledgers' },
  { key: 'withdrawals', label: 'Money Requests', desc: 'Approve seller/rider payouts' },
  { key: 'seller_payments', label: 'Seller Payments', desc: 'Settle merchant accounts' },
  { key: 'bulk_settlements', label: 'Bulk Settlements', desc: 'View wholesale/bulk-order settlement breakdowns' },
  { key: 'cash_collection', label: 'Collect Cash', desc: 'Receive cash-on-delivery dues' },
  { key: 'customers', label: 'Customers', desc: 'View end-user registry & logs' },
  { key: 'faqs', label: 'FAQs', desc: 'Publish static FAQ lists' },
  { key: 'orders', label: 'Orders', desc: 'Process live deliveries & return queues' },
  { key: 'billing', label: 'Fees & Charges', desc: 'Define commissions & platform costs' },
  { key: 'settings', label: 'Settings', desc: 'Global platform configuration' },
  { key: 'system', label: 'System Settings', desc: 'Developer environment keys & config' },
];

const PERMISSION_KEYS = PERMISSIONS_LIST.map((p) => p.key);

const formatRoleLabel = (role, rolesLookup) => {
  if (!role) return 'Staff';
  const found = rolesLookup?.[role];
  if (found?.label) return found.label;
  return role.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
};

const emptyStaffForm = {
  name: '',
  email: '',
  password: '',
  customRoleId: '',
  allowedPermissions: [],
};

const emptyRoleForm = {
  name: '',
  label: '',
  description: '',
  permissions: [],
};

const UserManagement = () => {
  const { user: currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState('staff');

  // --- Staff state ---
  const [staffList, setStaffList] = useState([]);
  const [loadingStaff, setLoadingStaff] = useState(false);
  const [isStaffOpen, setIsStaffOpen] = useState(false);
  const [editStaffId, setEditStaffId] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [staffForm, setStaffForm] = useState(emptyStaffForm);

  // --- Role state ---
  const [roles, setRoles] = useState([]);
  const [loadingRoles, setLoadingRoles] = useState(false);
  const [isRoleOpen, setIsRoleOpen] = useState(false);
  const [editRoleId, setEditRoleId] = useState(null);
  const [roleForm, setRoleForm] = useState(emptyRoleForm);

  const rolesLookup = useMemo(() => {
    const map = {};
    roles.forEach((r) => {
      map[r.name] = r;
    });
    return map;
  }, [roles]);

  const assignableRoles = useMemo(
    () => roles.filter((r) => !['admin', 'superadmin'].includes(r.name)),
    [roles],
  );

  // ===== Fetchers =====
  const fetchStaff = async () => {
    setLoadingStaff(true);
    try {
      const res = await adminApi.getStaffList();
      if (res?.data?.success) setStaffList(res.data.results || res.data.result || []);
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to fetch staff members');
    } finally {
      setLoadingStaff(false);
    }
  };

  const fetchRoles = async () => {
    setLoadingRoles(true);
    try {
      const res = await adminApi.getAdminRoles();
      if (res?.data?.success) setRoles(res.data.results || res.data.result || []);
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to fetch roles');
    } finally {
      setLoadingRoles(false);
    }
  };

  useEffect(() => {
    fetchStaff();
    fetchRoles();
  }, []);

  useEffect(() => {
    document.body.style.overflow = isStaffOpen || isRoleOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [isStaffOpen, isRoleOpen]);

  // ===== Staff handlers =====
  const openCreateStaff = () => {
    if (assignableRoles.length === 0) {
      toast.error('Create a custom role first before adding staff.');
      setActiveTab('roles');
      return;
    }
    setEditStaffId(null);
    setShowPassword(false);
    const defaultRole = assignableRoles[0];
    setStaffForm({
      ...emptyStaffForm,
      customRoleId: defaultRole._id,
      allowedPermissions: [...(defaultRole.permissions || [])],
    });
    setIsStaffOpen(true);
  };

  const openEditStaff = (staff) => {
    setEditStaffId(staff._id);
    setShowPassword(false);
    const resolvedRoleId =
      staff.customRoleId?._id ||
      staff.customRoleId ||
      roles.find((r) => r.name === staff.role)?._id ||
      '';
    setStaffForm({
      name: staff.name || '',
      email: staff.email || '',
      password: '',
      customRoleId: resolvedRoleId,
      allowedPermissions: staff.allowedPermissions || [],
    });
    setIsStaffOpen(true);
  };

  const handleStaffRoleChange = (roleId) => {
    const role = roles.find((r) => r._id === roleId);
    setStaffForm((prev) => ({
      ...prev,
      customRoleId: roleId,
      // Reset permissions to the role's default when the role changes. The
      // user can still toggle individual permissions below for per-staff
      // overrides.
      allowedPermissions: role ? [...(role.permissions || [])] : prev.allowedPermissions,
    }));
  };

  const toggleStaffPermission = (key) => {
    setStaffForm((prev) => {
      const current = new Set(prev.allowedPermissions);
      if (current.has(key)) current.delete(key);
      else current.add(key);
      return { ...prev, allowedPermissions: Array.from(current) };
    });
  };

  const handleStaffSubmit = async (e) => {
    e.preventDefault();
    if (!staffForm.name.trim() || !staffForm.email.trim() || !staffForm.customRoleId) {
      toast.error('Please fill name, email, and role');
      return;
    }
    if (!editStaffId && (!staffForm.password || staffForm.password.length < 6)) {
      toast.error('Password is required and must be at least 6 characters');
      return;
    }
    if (editStaffId && staffForm.password && staffForm.password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    try {
      const payload = {
        name: staffForm.name,
        email: staffForm.email,
        customRoleId: staffForm.customRoleId,
        allowedPermissions: staffForm.allowedPermissions,
      };
      if (staffForm.password) payload.password = staffForm.password;

      const res = editStaffId
        ? await adminApi.updateStaff(editStaffId, payload)
        : await adminApi.createStaff(payload);

      if (res?.data?.success) {
        toast.success(`Staff member ${editStaffId ? 'updated' : 'created'} successfully`);
        setIsStaffOpen(false);
        fetchStaff();
      }
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Operation failed');
    }
  };

  const handleStaffDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this staff member?')) return;
    try {
      const res = await adminApi.deleteStaff(id);
      if (res?.data?.success) {
        toast.success('Staff member deleted successfully');
        fetchStaff();
      }
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Delete failed');
    }
  };

  // ===== Role handlers =====
  const openCreateRole = () => {
    setEditRoleId(null);
    setRoleForm(emptyRoleForm);
    setIsRoleOpen(true);
  };

  const openEditRole = (role) => {
    setEditRoleId(role._id);
    setRoleForm({
      name: role.name || '',
      label: role.label || '',
      description: role.description || '',
      permissions: role.permissions || [],
    });
    setIsRoleOpen(true);
  };

  const toggleRolePermission = (key) => {
    setRoleForm((prev) => {
      const current = new Set(prev.permissions);
      if (current.has(key)) current.delete(key);
      else current.add(key);
      return { ...prev, permissions: Array.from(current) };
    });
  };

  const handleRoleSubmit = async (e) => {
    e.preventDefault();
    if (!roleForm.name.trim()) {
      toast.error('Role name is required');
      return;
    }
    try {
      const payload = { ...roleForm };
      const res = editRoleId
        ? await adminApi.updateAdminRole(editRoleId, payload)
        : await adminApi.createAdminRole(payload);
      if (res?.data?.success) {
        toast.success(`Role ${editRoleId ? 'updated' : 'created'} successfully`);
        setIsRoleOpen(false);
        fetchRoles();
        if (editRoleId) fetchStaff(); // staff rows show the role label
      }
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Role save failed');
    }
  };

  const handleRoleDelete = async (role) => {
    if (role.isSystem) {
      toast.error('System roles cannot be deleted');
      return;
    }
    if (!window.confirm(`Delete role "${role.label || role.name}"?`)) return;
    try {
      const res = await adminApi.deleteAdminRole(role._id);
      if (res?.data?.success) {
        toast.success('Role deleted successfully');
        fetchRoles();
      }
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Role delete failed');
    }
  };

  const getRoleBadgeVariant = (role) => {
    if (['superadmin', 'admin'].includes(role)) return 'danger';
    if (role === 'accountant') return 'success';
    if (role === 'assistant') return 'warning';
    return 'neutral';
  };

  const inputBase =
    'w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold outline-none focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50 transition-all';

  return (
    <div className="space-y-6 font-['Outfit',_sans-serif]">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black text-slate-900 tracking-tight">Staff Management</h2>
          <p className="text-slate-500 text-sm mt-1">
            Define custom roles with scoped permissions and delegate workspace duties to staff accounts.
          </p>
        </div>
        {activeTab === 'staff' ? (
          <Button
            onClick={openCreateStaff}
            className="w-fit flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl py-3 px-5 text-sm font-black shadow-lg shadow-indigo-100"
          >
            <HiOutlineUserAdd className="h-5 w-5" /> Add Staff Member
          </Button>
        ) : (
          <Button
            onClick={openCreateRole}
            className="w-fit flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl py-3 px-5 text-sm font-black shadow-lg shadow-indigo-100"
          >
            <HiOutlinePlus className="h-5 w-5" /> Create Custom Role
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-100">
        {[
          { key: 'staff', label: 'Staff Members', icon: HiOutlineUserGroup, count: staffList.length },
          { key: 'roles', label: 'Custom Roles', icon: HiOutlineShieldCheck, count: roles.length },
        ].map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-black uppercase tracking-wider transition-all border-b-2 ${
                active
                  ? 'border-indigo-600 text-indigo-700'
                  : 'border-transparent text-slate-400 hover:text-slate-600'
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
              <span
                className={`ml-1 text-[10px] px-2 py-0.5 rounded-full ${
                  active ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-100 text-slate-500'
                }`}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* ======= Staff Tab ======= */}
      {activeTab === 'staff' && (
        <Card className="overflow-hidden border border-slate-100 shadow-sm rounded-3xl">
          {loadingStaff && staffList.length === 0 ? (
            <div className="p-12 text-center text-slate-500 font-medium">Loading staff registry...</div>
          ) : staffList.length === 0 ? (
            <div className="p-16 text-center">
              <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <HiOutlineLockClosed className="h-8 w-8 text-slate-400" />
              </div>
              <h3 className="text-lg font-black text-slate-800">No staff members created yet</h3>
              <p className="text-slate-500 text-sm max-w-sm mx-auto mt-1">
                Add staff profiles and assign them to any of your custom roles.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="px-6 py-4 text-xs font-black uppercase tracking-wider text-slate-400">User / Details</th>
                    <th className="px-6 py-4 text-xs font-black uppercase tracking-wider text-slate-400">Role</th>
                    <th className="px-6 py-4 text-xs font-black uppercase tracking-wider text-slate-400">Allowed Sections</th>
                    <th className="px-6 py-4 text-xs font-black uppercase tracking-wider text-slate-400 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {staffList.map((staff) => {
                    const isSelf = staff._id === currentUser?._id;
                    const isOriginalAdmin = ['superadmin', 'admin'].includes(staff.role);
                    return (
                      <tr key={staff._id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-5">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center font-black text-slate-700 uppercase">
                              {staff.name?.charAt(0)}
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="font-black text-slate-900 text-sm">{staff.name}</span>
                                {isSelf && (
                                  <span className="bg-indigo-50 text-indigo-600 text-[10px] px-2 py-0.5 rounded-full font-bold">You</span>
                                )}
                              </div>
                              <span className="text-xs text-slate-400 font-medium block">{staff.email}</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-5">
                          <Badge variant={getRoleBadgeVariant(staff.role)}>
                            <span className="uppercase font-black text-[10px] tracking-wider">
                              {formatRoleLabel(staff.role, rolesLookup)}
                            </span>
                          </Badge>
                        </td>
                        <td className="px-6 py-5 max-w-[400px]">
                          {isOriginalAdmin ? (
                            <span className="text-xs font-black text-red-500 bg-red-50 px-2.5 py-1 rounded-full uppercase tracking-wider">All Access</span>
                          ) : (staff.allowedPermissions || []).length === 0 ? (
                            <span className="text-xs font-bold text-slate-400 italic">No modules allowed</span>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {staff.allowedPermissions.map((perm) => (
                                <span key={perm} className="text-[10px] font-black uppercase bg-slate-100 text-slate-600 px-2 py-0.5 rounded border border-slate-200">
                                  {perm.replace(/_/g, ' ')}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {!isOriginalAdmin && (
                              <button onClick={() => openEditStaff(staff)} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all" title="Edit Permissions">
                                <HiOutlinePencil className="h-5 w-5" />
                              </button>
                            )}
                            {!isSelf && !isOriginalAdmin && (
                              <button onClick={() => handleStaffDelete(staff._id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all" title="Delete">
                                <HiOutlineTrash className="h-5 w-5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* ======= Roles Tab ======= */}
      {activeTab === 'roles' && (
        <Card className="overflow-hidden border border-slate-100 shadow-sm rounded-3xl">
          {loadingRoles && roles.length === 0 ? (
            <div className="p-12 text-center text-slate-500 font-medium">Loading roles...</div>
          ) : roles.length === 0 ? (
            <div className="p-16 text-center">
              <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <HiOutlineShieldCheck className="h-8 w-8 text-slate-400" />
              </div>
              <h3 className="text-lg font-black text-slate-800">No custom roles yet</h3>
              <p className="text-slate-500 text-sm max-w-sm mx-auto mt-1">
                Create a role with scoped permissions so staff accounts can inherit them.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 p-6">
              {roles.map((role) => (
                <div key={role._id} className="border-2 border-slate-100 rounded-2xl p-5 hover:border-indigo-200 transition-all bg-white">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-black text-slate-900 text-base tracking-tight">
                          {role.label || formatRoleLabel(role.name)}
                        </h4>
                        {role.isSystem && (
                          <span className="text-[9px] font-black uppercase tracking-wider bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full">System</span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 font-mono mt-0.5 truncate">{role.name}</p>
                      {role.description && (
                        <p className="text-xs text-slate-500 mt-1.5 leading-snug">{role.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => openEditRole(role)} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all" title="Edit role">
                        <HiOutlinePencil className="h-4 w-4" />
                      </button>
                      {!role.isSystem && (
                        <button onClick={() => handleRoleDelete(role)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all" title="Delete role">
                          <HiOutlineTrash className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1 pt-3 border-t border-slate-100">
                    {(role.permissions || []).length === 0 ? (
                      <span className="text-[10px] font-bold text-slate-400 italic">No permissions</span>
                    ) : (
                      role.permissions.map((p) => (
                        <span key={p} className="text-[10px] font-black uppercase bg-slate-50 text-slate-600 px-2 py-0.5 rounded border border-slate-200">
                          {p.replace(/_/g, ' ')}
                        </span>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* ======= Staff Modal ======= */}
      <AnimatePresence>
        {isStaffOpen && (
          <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-white rounded-[2.5rem] w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col shadow-2xl border border-slate-100"
            >
              <div className="p-6 md:p-8 border-b border-slate-100 flex items-center justify-between shrink-0">
                <div>
                  <h3 className="text-2xl font-black text-slate-900 tracking-tight">
                    {editStaffId ? 'Modify Staff Member' : 'Onboard New Staff Member'}
                  </h3>
                  <p className="text-slate-500 text-xs mt-0.5">
                    {editStaffId ? 'Change credentials, role, and section permissions.' : 'Set login, assign a custom role, and tune permissions.'}
                  </p>
                </div>
                <button onClick={() => setIsStaffOpen(false)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-full transition-all">
                  <HiOutlineX className="h-6 w-6" />
                </button>
              </div>

              <form onSubmit={handleStaffSubmit} autoComplete="off" className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="space-y-1.5">
                    <label className="text-xs font-black uppercase tracking-wider text-slate-400">Full Name *</label>
                    <input type="text" required autoComplete="off" placeholder="e.g. Rahul Sharma"
                      value={staffForm.name}
                      onChange={(e) => setStaffForm((p) => ({ ...p, name: e.target.value }))}
                      className={inputBase} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-black uppercase tracking-wider text-slate-400">Email Address *</label>
                    <input type="email" required autoComplete="off" placeholder="e.g. rahul@zinto.com"
                      value={staffForm.email}
                      onChange={(e) => setStaffForm((p) => ({ ...p, email: e.target.value }))}
                      className={inputBase} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-black uppercase tracking-wider text-slate-400">
                      Password {editStaffId ? '(Leave blank to keep current)' : '*'}
                    </label>
                    <div className="relative">
                      <input type={showPassword ? 'text' : 'password'} required={!editStaffId} autoComplete="new-password"
                        placeholder={editStaffId ? '••••••••' : 'Minimum 6 characters'}
                        value={staffForm.password}
                        onChange={(e) => setStaffForm((p) => ({ ...p, password: e.target.value }))}
                        className={`${inputBase} pr-11`} />
                      <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 rounded-lg">
                        {showPassword ? <HiOutlineEyeOff className="h-5 w-5" /> : <HiOutlineEye className="h-5 w-5" />}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-black uppercase tracking-wider text-slate-400">Role *</label>
                    <select value={staffForm.customRoleId} onChange={(e) => handleStaffRoleChange(e.target.value)} className={inputBase}>
                      <option value="" disabled>Select a role...</option>
                      {assignableRoles.map((r) => (
                        <option key={r._id} value={r._id}>
                          {r.label || formatRoleLabel(r.name)}
                        </option>
                      ))}
                    </select>
                    <p className="text-[10px] text-slate-400 mt-1">
                      Need a new role? Add one from the <button type="button" onClick={() => { setIsStaffOpen(false); setActiveTab('roles'); }} className="text-indigo-600 font-bold underline">Custom Roles</button> tab.
                    </p>
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h4 className="text-sm font-black text-slate-800 uppercase tracking-wider">Module Permissions</h4>
                      <p className="text-slate-400 text-[11px] mt-0.5">Inherited from the selected role — customize per staff if needed.</p>
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setStaffForm((p) => ({ ...p, allowedPermissions: [...PERMISSION_KEYS] }))} className="text-xs text-indigo-600 hover:text-indigo-800 font-black uppercase tracking-wider">Select All</button>
                      <span className="text-slate-200 text-xs">|</span>
                      <button type="button" onClick={() => setStaffForm((p) => ({ ...p, allowedPermissions: [] }))} className="text-xs text-slate-400 hover:text-slate-600 font-black uppercase tracking-wider">Clear</button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {PERMISSIONS_LIST.map((perm) => {
                      const isChecked = staffForm.allowedPermissions.includes(perm.key);
                      return (
                        <div key={perm.key} onClick={() => toggleStaffPermission(perm.key)}
                          className={`flex items-start gap-3 p-3.5 rounded-2xl border-2 cursor-pointer select-none transition-all ${isChecked ? 'border-indigo-500 bg-indigo-50/40 text-indigo-900 shadow-sm' : 'border-slate-100 hover:border-slate-200 bg-white text-slate-700'}`}>
                          <div className={`mt-0.5 w-5 h-5 rounded-lg border-2 flex items-center justify-center transition-all ${isChecked ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-300 bg-white'}`}>
                            {isChecked && <HiOutlineCheck className="w-3.5 h-3.5 stroke-[3]" />}
                          </div>
                          <div>
                            <span className="text-xs font-black uppercase tracking-wider block">{perm.label}</span>
                            <span className="text-[10px] text-slate-400 font-medium block mt-0.5 leading-tight">{perm.desc}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-6 flex items-center justify-end gap-3 shrink-0">
                  <button type="button" onClick={() => setIsStaffOpen(false)} className="px-6 py-3.5 rounded-xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 transition-colors text-sm">Cancel</button>
                  <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl py-3.5 px-8 text-sm font-black shadow-lg shadow-indigo-100">
                    {editStaffId ? 'Save Changes' : 'Create Staff'}
                  </Button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ======= Role Modal ======= */}
      <AnimatePresence>
        {isRoleOpen && (
          <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-white rounded-[2.5rem] w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col shadow-2xl border border-slate-100"
            >
              <div className="p-6 md:p-8 border-b border-slate-100 flex items-center justify-between shrink-0">
                <div>
                  <h3 className="text-2xl font-black text-slate-900 tracking-tight">
                    {editRoleId ? 'Edit Custom Role' : 'Create Custom Role'}
                  </h3>
                  <p className="text-slate-500 text-xs mt-0.5">Define a role name, description, and which modules it unlocks by default.</p>
                </div>
                <button onClick={() => setIsRoleOpen(false)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-full transition-all">
                  <HiOutlineX className="h-6 w-6" />
                </button>
              </div>

              <form onSubmit={handleRoleSubmit} className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="space-y-1.5">
                    <label className="text-xs font-black uppercase tracking-wider text-slate-400">Role Key *</label>
                    <input type="text" required placeholder="e.g. finance_manager"
                      value={roleForm.name}
                      onChange={(e) => setRoleForm((p) => ({ ...p, name: e.target.value }))}
                      className={inputBase}
                      disabled={editRoleId && roles.find((r) => r._id === editRoleId)?.isSystem}
                    />
                    <p className="text-[10px] text-slate-400">Lowercase, underscores allowed. Used internally.</p>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-black uppercase tracking-wider text-slate-400">Display Label</label>
                    <input type="text" placeholder="e.g. Finance Manager"
                      value={roleForm.label}
                      onChange={(e) => setRoleForm((p) => ({ ...p, label: e.target.value }))}
                      className={inputBase} />
                  </div>
                  <div className="space-y-1.5 md:col-span-2">
                    <label className="text-xs font-black uppercase tracking-wider text-slate-400">Description</label>
                    <textarea rows={2} placeholder="What this role is responsible for..."
                      value={roleForm.description}
                      onChange={(e) => setRoleForm((p) => ({ ...p, description: e.target.value }))}
                      className={inputBase} />
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h4 className="text-sm font-black text-slate-800 uppercase tracking-wider">Default Permissions</h4>
                      <p className="text-slate-400 text-[11px] mt-0.5">Staff created with this role start with these modules allowed.</p>
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setRoleForm((p) => ({ ...p, permissions: [...PERMISSION_KEYS] }))} className="text-xs text-indigo-600 hover:text-indigo-800 font-black uppercase tracking-wider">Select All</button>
                      <span className="text-slate-200 text-xs">|</span>
                      <button type="button" onClick={() => setRoleForm((p) => ({ ...p, permissions: [] }))} className="text-xs text-slate-400 hover:text-slate-600 font-black uppercase tracking-wider">Clear</button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {PERMISSIONS_LIST.map((perm) => {
                      const isChecked = roleForm.permissions.includes(perm.key);
                      return (
                        <div key={perm.key} onClick={() => toggleRolePermission(perm.key)}
                          className={`flex items-start gap-3 p-3.5 rounded-2xl border-2 cursor-pointer select-none transition-all ${isChecked ? 'border-indigo-500 bg-indigo-50/40 text-indigo-900 shadow-sm' : 'border-slate-100 hover:border-slate-200 bg-white text-slate-700'}`}>
                          <div className={`mt-0.5 w-5 h-5 rounded-lg border-2 flex items-center justify-center transition-all ${isChecked ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-300 bg-white'}`}>
                            {isChecked && <HiOutlineCheck className="w-3.5 h-3.5 stroke-[3]" />}
                          </div>
                          <div>
                            <span className="text-xs font-black uppercase tracking-wider block">{perm.label}</span>
                            <span className="text-[10px] text-slate-400 font-medium block mt-0.5 leading-tight">{perm.desc}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-6 flex items-center justify-end gap-3 shrink-0">
                  <button type="button" onClick={() => setIsRoleOpen(false)} className="px-6 py-3.5 rounded-xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 transition-colors text-sm">Cancel</button>
                  <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl py-3.5 px-8 text-sm font-black shadow-lg shadow-indigo-100">
                    {editRoleId ? 'Save Role' : 'Create Role'}
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

export default UserManagement;
