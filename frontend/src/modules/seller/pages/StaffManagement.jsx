import React, { useState, useEffect } from 'react';
import { useAuth } from '@core/context/AuthContext';
import { sellerApi } from '../services/sellerApi';
import { 
  HiOutlineUserPlus, 
  HiOutlinePencil, 
  HiOutlineTrash, 
  HiOutlineCheck,
  HiOutlineLockClosed,
  HiOutlineDevicePhoneMobile,
  HiOutlineEnvelope,
  HiOutlineUserGroup
} from 'react-icons/hi2';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

// Tailwind components / layout helpers
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

const PERMISSIONS_LIST = [
  { id: 'storefront', label: 'Store Design', description: 'Modify shop banners, videos, and page layout' },
  { id: 'products', label: 'Products', description: 'Create, edit, and moderate product catalog' },
  { id: 'inventory', label: 'Stock / Inventory', description: 'Monitor inventory levels and adjust stock values' },
  { id: 'orders', label: 'Orders', description: 'Accept, decline, and process store orders' },
  { id: 'returns', label: 'Returns', description: 'Approve, reject, and assign returns' },
  { id: 'tracking', label: 'Track Orders', description: 'View rider locations and real-time delivery status' },
  { id: 'coupons', label: 'Offers & Coupons', description: 'Create, update, and manage seller discounts' },
  { id: 'analytics', label: 'Sales Reports & Analytics', description: 'View sales trends, metrics, and shop analysis' },
  { id: 'withdrawals', label: 'Money Request & Earnings', description: 'Create withdrawal requests and view earnings ledger' }
];

const ROLES_LIST = [
  { id: 'manager', label: 'Store Manager', description: 'Full access to coordinate store operations' },
  { id: 'cashier', label: 'Cashier / Accountant', description: 'Handles transactions, orders and financial metrics' },
  { id: 'helper', label: 'Store Assistant', description: 'Manages products, stocks and packaging' },
  { id: 'operator', label: 'Store Operator', description: 'Monitors real-time orders, tracking and logistics' },
];

const StaffManagement = () => {
  const { user } = useAuth();
  const [staffList, setStaffList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    role: 'helper',
    allowedPermissions: []
  });

  const fetchStaff = async () => {
    setLoading(true);
    try {
      const res = await sellerApi.getStaffList();
      if (res?.data?.success) {
        setStaffList(res.data.results || res.data.result || []);
      }
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to fetch staff members');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStaff();
  }, []);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
      document.documentElement.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
      document.documentElement.style.overflow = 'unset';
    };
  }, [isOpen]);

  const handleOpenCreate = () => {
    setEditId(null);
    setFormData({
      name: '',
      email: '',
      phone: '',
      password: '',
      role: 'helper',
      allowedPermissions: []
    });
    setIsOpen(true);
  };

  const handleOpenEdit = (staff) => {
    setEditId(staff._id);
    setFormData({
      name: staff.name,
      email: staff.email,
      phone: staff.phone || '',
      password: '', // Keep empty unless updating
      role: staff.role || 'helper',
      allowedPermissions: staff.allowedPermissions || []
    });
    setIsOpen(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this staff member? This action cannot be undone.')) {
      return;
    }
    try {
      const res = await sellerApi.deleteStaff(id);
      if (res?.data?.success) {
        toast.success('Staff member deleted successfully');
        fetchStaff();
      }
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to delete staff member');
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handlePermissionToggle = (permId) => {
    setFormData(prev => {
      const perms = prev.allowedPermissions.includes(permId)
        ? prev.allowedPermissions.filter(p => p !== permId)
        : [...prev.allowedPermissions, permId];
      return { ...prev, allowedPermissions: perms };
    });
  };

  const handleSelectAllPermissions = () => {
    const allIds = PERMISSIONS_LIST.map(p => p.id);
    const hasAll = formData.allowedPermissions.length === allIds.length;
    setFormData(prev => ({
      ...prev,
      allowedPermissions: hasAll ? [] : allIds
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!editId && !formData.password) {
      toast.error('Password is required when onboarding a new staff member.');
      return;
    }

    try {
      let res;
      if (editId) {
        // Remove password from payload if not updating it
        const payload = { ...formData };
        if (!payload.password) delete payload.password;
        res = await sellerApi.updateStaff(editId, payload);
      } else {
        res = await sellerApi.createStaff(formData);
      }

      if (res?.data?.success) {
        toast.success(editId ? 'Staff member details updated' : 'Staff member onboarded successfully');
        setIsOpen(false);
        fetchStaff();
      }
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to save staff details');
    }
  };

  const getRoleBadgeVariant = (role) => {
    switch (role) {
      case 'manager':
        return 'danger';
      case 'cashier':
        return 'success';
      case 'helper':
        return 'warning';
      case 'operator':
        return 'indigo';
      default:
        return 'neutral';
    }
  };

  const getRoleLabel = (roleId) => {
    return ROLES_LIST.find(r => r.id === roleId)?.label || roleId;
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <HiOutlineUserGroup className="h-8 w-8 text-indigo-600" />
            Staff Management
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Delegate storefront duties to Managers, Cashiers, and Helpers by configuring specific section access.
          </p>
        </div>
        
        <Button
          onClick={handleOpenCreate}
          className="bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center gap-2 shadow-lg shadow-indigo-100"
        >
          <HiOutlineUserPlus className="h-5 w-5" />
          Add Staff Member
        </Button>
      </div>

      {/* Main Table / Container */}
      <Card>
        {loading && staffList.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
            <p className="text-slate-500 text-sm font-medium mt-4">Loading staff members...</p>
          </div>
        ) : staffList.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
            <div className="h-20 w-20 bg-indigo-50 rounded-3xl flex items-center justify-center mb-6">
              <HiOutlineUserGroup className="h-10 w-10 text-indigo-600 animate-pulse" />
            </div>
            <h3 className="text-xl font-black text-slate-900 mb-1">No staff members created yet</h3>
            <p className="text-slate-500 text-sm max-w-md mb-8">
              Add sub-seller profiles to distribute administrative roles and streamline order processing.
            </p>
            <Button
              onClick={handleOpenCreate}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              Onboard Your First Staff
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/75 border-b border-slate-100">
                  <th className="px-6 py-4 text-xs font-black text-slate-500 uppercase tracking-wider">User / Details</th>
                  <th className="px-6 py-4 text-xs font-black text-slate-500 uppercase tracking-wider">Role</th>
                  <th className="px-6 py-4 text-xs font-black text-slate-500 uppercase tracking-wider">Allowed Sections</th>
                  <th className="px-6 py-4 text-xs font-black text-slate-500 uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {staffList.map((staff) => {
                  return (
                    <tr key={staff._id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-3">
                          <div className="h-11 w-11 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-700 text-sm font-black border border-indigo-100">
                            {staff.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-black text-slate-900 leading-none">{staff.name}</p>
                            <p className="text-xs text-slate-400 mt-1 flex items-center gap-1.5">
                              <HiOutlineEnvelope className="h-3.5 w-3.5" />
                              {staff.email}
                            </p>
                            {staff.phone && (
                              <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1.5">
                                <HiOutlineDevicePhoneMobile className="h-3.5 w-3.5" />
                                {staff.phone}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      
                      <td className="px-6 py-5">
                        <Badge variant={getRoleBadgeVariant(staff.role)}>
                          {getRoleLabel(staff.role).toUpperCase()}
                        </Badge>
                      </td>
                      
                      <td className="px-6 py-5">
                        <div className="flex flex-wrap gap-1.5 max-w-lg">
                          {staff.allowedPermissions && staff.allowedPermissions.length > 0 ? (
                            staff.allowedPermissions.map((permId) => {
                              const perm = PERMISSIONS_LIST.find(p => p.id === permId);
                              return (
                                <span 
                                  key={permId} 
                                  className="inline-flex items-center px-2 py-0.5 rounded-lg bg-slate-50 text-[10px] font-bold text-slate-600 border border-slate-100"
                                >
                                  {perm ? perm.label.toUpperCase() : permId.toUpperCase()}
                                </span>
                              );
                            })
                          ) : (
                            <span className="text-xs text-rose-500 font-bold flex items-center gap-1">
                              <HiOutlineLockClosed className="h-3.5 w-3.5" />
                              NO SECTIONS ALLOWED
                            </span>
                          )}
                        </div>
                      </td>
                      
                      <td className="px-6 py-5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleOpenEdit(staff)}
                            className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"
                            title="Edit Permissions"
                          >
                            <HiOutlinePencil className="h-5 w-5" />
                          </button>
                          
                          <button
                            onClick={() => handleDelete(staff._id)}
                            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                            title="Delete Staff Member"
                          >
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
      </Card>

      {/* Modal Dialog */}
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
              className="bg-white rounded-[2.5rem] w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col shadow-2xl border border-slate-100"
              data-lenis-prevent
              data-lenis-prevent-touch
              data-lenis-prevent-wheel
            >
              {/* Modal Header */}
              <div className="p-6 md:p-8 border-b border-slate-100 flex items-center justify-between shrink-0">
                <div>
                  <h3 className="text-2xl font-black text-slate-900 tracking-tight">
                    {editId 
                      ? `Modify ${formData.role ? (formData.role.charAt(0).toUpperCase() + formData.role.slice(1).toLowerCase()) : 'Staff'} Details` 
                      : `Onboard New ${formData.role ? (formData.role.charAt(0).toUpperCase() + formData.role.slice(1).toLowerCase()) : 'Staff'}`}
                  </h3>
                  <p className="text-slate-500 text-xs mt-0.5">
                    {editId ? 'Change login credentials and toggle section permissions.' : 'Create email, password, and assign workspace permissions.'}
                  </p>
                </div>
                <button 
                  onClick={() => setIsOpen(false)}
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-full transition-all"
                >
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Modal Body */}
              <form 
                onSubmit={handleSubmit} 
                className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6 min-h-0 custom-scrollbar"
                data-lenis-prevent
                data-lenis-prevent-touch
                data-lenis-prevent-wheel
              >
                {/* Basic Fields */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-black text-slate-700 uppercase tracking-widest">Full Name</label>
                    <input 
                      type="text" 
                      name="name"
                      required
                      value={formData.name}
                      onChange={handleInputChange}
                      placeholder="e.g. John Doe"
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 text-slate-950 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:border-transparent transition-all"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-black text-slate-700 uppercase tracking-widest">Email Address</label>
                    <input 
                      type="email" 
                      name="email"
                      required
                      value={formData.email}
                      onChange={handleInputChange}
                      placeholder="e.g. name@shop.com"
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 text-slate-950 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:border-transparent transition-all"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-black text-slate-700 uppercase tracking-widest">Phone Number</label>
                    <input 
                      type="tel" 
                      name="phone"
                      required
                      value={formData.phone}
                      onChange={handleInputChange}
                      placeholder="e.g. 9876543210"
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 text-slate-950 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:border-transparent transition-all"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-black text-slate-700 uppercase tracking-widest">
                      Password {editId && <span className="text-slate-400 font-normal">(Leave blank to keep current)</span>}
                    </label>
                    <input 
                      type="password" 
                      name="password"
                      required={!editId}
                      value={formData.password}
                      onChange={handleInputChange}
                      placeholder={editId ? "••••••••" : "Min. 6 characters"}
                      minLength={6}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 text-slate-950 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:border-transparent transition-all"
                    />
                  </div>
                </div>

                {/* Role selection */}
                <div className="space-y-3">
                  <label className="text-xs font-black text-slate-700 uppercase tracking-widest">Assign Operational Role</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                    {ROLES_LIST.map((roleOpt) => {
                      const isSelected = formData.role === roleOpt.id;
                      return (
                        <div
                          key={roleOpt.id}
                          onClick={() => setFormData(prev => ({ ...prev, role: roleOpt.id }))}
                          className={`p-4 rounded-2xl border-2 cursor-pointer transition-all duration-300 flex flex-col justify-between ${
                            isSelected 
                              ? 'border-indigo-600 bg-indigo-50/20' 
                              : 'border-slate-100 bg-slate-50/50 hover:border-slate-200'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-black text-slate-900">{roleOpt.label}</span>
                            <div className={`h-5 w-5 rounded-full border flex items-center justify-center transition-all ${
                              isSelected ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-300 bg-white'
                            }`}>
                              {isSelected && <HiOutlineCheck className="h-3 w-3 stroke-[3]" />}
                            </div>
                          </div>
                          <p className="text-[11px] text-slate-500 leading-normal">{roleOpt.description}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Permissions Grid */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <label className="text-xs font-black text-slate-700 uppercase tracking-widest">Workspace Permissions</label>
                    <button
                      type="button"
                      onClick={handleSelectAllPermissions}
                      className="text-xs text-indigo-600 hover:text-indigo-800 font-bold"
                    >
                      {formData.allowedPermissions.length === PERMISSIONS_LIST.length ? 'Deselect All' : 'Select All'}
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {PERMISSIONS_LIST.map((perm) => {
                      const isChecked = formData.allowedPermissions.includes(perm.id);
                      return (
                        <div 
                          key={perm.id}
                          onClick={() => handlePermissionToggle(perm.id)}
                          className={`p-4 rounded-2xl border-2 cursor-pointer flex items-start gap-3 transition-all duration-300 ${
                            isChecked 
                              ? 'border-indigo-600 bg-indigo-50/10' 
                              : 'border-slate-100 hover:border-slate-200 bg-white'
                          }`}
                        >
                          <div className={`mt-0.5 h-5 w-5 rounded-lg border flex-shrink-0 flex items-center justify-center transition-all ${
                            isChecked ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-300 bg-white'
                          }`}>
                            {isChecked && <HiOutlineCheck className="h-3 w-3 stroke-[3]" />}
                          </div>
                          <div>
                            <p className="text-sm font-bold text-slate-900 leading-none">{perm.label}</p>
                            <p className="text-[11px] text-slate-400 mt-1 leading-normal">{perm.description}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Modal Footer (Form Action buttons) */}
                <div className="flex items-center justify-end gap-3 pt-6 border-t border-slate-100 shrink-0">
                  <Button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="bg-slate-100 hover:bg-slate-200 text-slate-700"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-100"
                  >
                    {editId ? 'Save Changes' : `Create ${formData.role ? (formData.role.charAt(0).toUpperCase() + formData.role.slice(1).toLowerCase()) : 'Staff'}`}
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
