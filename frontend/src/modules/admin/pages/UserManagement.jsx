import React, { useState, useEffect } from 'react';
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
  HiOutlineX
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
  { key: 'cash_collection', label: 'Collect Cash', desc: 'Receive cash-on-delivery dues' },
  { key: 'customers', label: 'Customers', desc: 'View end-user registry & logs' },
  { key: 'faqs', label: 'FAQs', desc: 'Publish static FAQ lists' },
  { key: 'orders', label: 'Orders', desc: 'Process live deliveries & return queues' },
  { key: 'billing', label: 'Fees & Charges', desc: 'Define commissions & platform costs' },
  { key: 'settings', label: 'Settings', desc: 'Global platform configuration' },
  { key: 'system', label: 'System Settings', desc: 'Developer environment keys & config' }
];

const UserManagement = () => {
  const { user: currentUser } = useAuth();
  const [staffList, setStaffList] = useState([]);
  const [loading, setLoading] = useState(false);
  
  // Modal states
  const [isOpen, setIsOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'assistant',
    allowedPermissions: []
  });

  // Fetch staff list
  const fetchStaff = async () => {
    setLoading(true);
    try {
      const res = await adminApi.getStaffList();
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
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const handleOpenCreate = () => {
    setEditId(null);
    setFormData({
      name: '',
      email: '',
      password: '',
      role: 'assistant',
      allowedPermissions: []
    });
    setIsOpen(true);
  };

  const handleOpenEdit = (staff) => {
    setEditId(staff._id);
    setFormData({
      name: staff.name,
      email: staff.email,
      password: '', // blank by default on edit
      role: staff.role || 'assistant',
      allowedPermissions: staff.allowedPermissions || []
    });
    setIsOpen(true);
  };

  const handleTogglePermission = (key) => {
    setFormData(prev => {
      const current = [...prev.allowedPermissions];
      const index = current.indexOf(key);
      if (index > -1) {
        current.splice(index, 1);
      } else {
        current.push(key);
      }
      return { ...prev, allowedPermissions: current };
    });
  };

  const handleSelectAllPermissions = () => {
    setFormData(prev => ({
      ...prev,
      allowedPermissions: PERMISSIONS_LIST.map(p => p.key)
    }));
  };

  const handleClearAllPermissions = () => {
    setFormData(prev => ({
      ...prev,
      allowedPermissions: []
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.email.trim() || !formData.role) {
      toast.error('Please fill in all required fields');
      return;
    }

    if (!editId && (!formData.password || formData.password.length < 6)) {
      toast.error('Password is required and must be at least 6 characters');
      return;
    }

    if (editId && formData.password && formData.password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    try {
      if (editId) {
        // Edit flow
        const payload = { ...formData };
        if (!payload.password) delete payload.password; // Don't send empty password
        const res = await adminApi.updateStaff(editId, payload);
        if (res?.data?.success) {
          toast.success('Staff member updated successfully');
          setIsOpen(false);
          fetchStaff();
        }
      } else {
        // Create flow
        const res = await adminApi.createStaff(formData);
        if (res?.data?.success) {
          toast.success('Staff member created successfully');
          setIsOpen(false);
          fetchStaff();
        }
      }
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Operation failed');
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this staff member?')) {
      try {
        const res = await adminApi.deleteStaff(id);
        if (res?.data?.success) {
          toast.success('Staff member deleted successfully');
          fetchStaff();
        }
      } catch (error) {
        toast.error(error?.response?.data?.message || 'Delete failed');
      }
    }
  };

  const getRoleBadgeVariant = (role) => {
    switch (role) {
      case 'superadmin':
      case 'admin':
        return 'danger';
      case 'accountant':
        return 'success';
      case 'assistant':
        return 'warning';
      default:
        return 'neutral';
    }
  };

  return (
    <div className="space-y-6 font-['Outfit',_sans-serif]">
      {/* Header section */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black text-slate-900 tracking-tight">Staff Management</h2>
          <p className="text-slate-500 text-sm mt-1">
            Delegate workspace duties to Accountants and Assistants by configuring specific page permissions.
          </p>
        </div>
        <Button onClick={handleOpenCreate} className="w-fit flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl py-3 px-5 text-sm font-black shadow-lg shadow-indigo-100">
          <HiOutlineUserAdd className="h-5 w-5" />
          Add Staff Member
        </Button>
      </div>

      {/* Main Grid / Table */}
      <Card className="overflow-hidden border border-slate-100 shadow-sm rounded-3xl">
        {loading && staffList.length === 0 ? (
          <div className="p-12 text-center text-slate-500 font-medium">Loading staff registry...</div>
        ) : staffList.length === 0 ? (
          <div className="p-16 text-center">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <HiOutlineLockClosed className="h-8 w-8 text-slate-400" />
            </div>
            <h3 className="text-lg font-black text-slate-800">No staff members created yet</h3>
            <p className="text-slate-500 text-sm max-w-sm mx-auto mt-1">
              Add staff profiles to distribute administrative roles like Accountant and Assistant.
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
                  const isOriginalAdmin = staff.role === 'superadmin' || staff.role === 'admin';
                  return (
                    <tr key={staff._id} className="hover:bg-slate-50/50 transition-colors">
                      {/* Details Column */}
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center font-black text-slate-700 uppercase">
                            {staff.name.charAt(0)}
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

                      {/* Role Badge */}
                      <td className="px-6 py-5">
                        <Badge variant={getRoleBadgeVariant(staff.role)}>
                          <span className="uppercase font-black text-[10px] tracking-wider">{staff.role}</span>
                        </Badge>
                      </td>

                      {/* Permissions List */}
                      <td className="px-6 py-5 max-w-[400px]">
                        {isOriginalAdmin ? (
                          <span className="text-xs font-black text-red-500 bg-red-50 px-2.5 py-1 rounded-full uppercase tracking-wider">All Access</span>
                        ) : staff.allowedPermissions?.length === 0 ? (
                          <span className="text-xs font-bold text-slate-400 italic">No modules allowed</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {staff.allowedPermissions.map((perm) => (
                              <span key={perm} className="text-[10px] font-black uppercase bg-slate-100 text-slate-600 px-2 py-0.5 rounded border border-slate-200">
                                {perm.replace('_', ' ')}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-6 py-5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleOpenEdit(staff)}
                            className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"
                            title="Edit Permissions"
                          >
                            <HiOutlinePencil className="h-5 w-5" />
                          </button>
                          
                          {!isSelf && !isOriginalAdmin && (
                            <button
                              onClick={() => handleDelete(staff._id)}
                              className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                              title={`Delete ${staff.role ? (staff.role.charAt(0).toUpperCase() + staff.role.slice(1).toLowerCase()) : 'Staff'}`}
                            >
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

      {/* Modal dialog */}
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
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
                  <HiOutlineX className="h-6 w-6" />
                </button>
              </div>

              {/* Modal Scrollable Form */}
              <form 
                onSubmit={handleSubmit} 
                className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6"
                data-lenis-prevent
                data-lenis-prevent-touch
                data-lenis-prevent-wheel
              >
                
                {/* Credentials Section */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="space-y-1.5">
                    <label className="text-xs font-black uppercase tracking-wider text-slate-400">Full Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Rahul Sharma"
                      value={formData.name}
                      onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold outline-none focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50 transition-all"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-black uppercase tracking-wider text-slate-400">Email Address *</label>
                    <input
                      type="email"
                      required
                      placeholder="e.g. rahul@zinto.com"
                      value={formData.email}
                      onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold outline-none focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50 transition-all"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-black uppercase tracking-wider text-slate-400">
                      Password {editId ? '(Leave blank to keep current)' : '*'}
                    </label>
                    <input
                      type="password"
                      required={!editId}
                      placeholder={editId ? '••••••••' : 'Minimum 6 characters'}
                      value={formData.password}
                      onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold outline-none focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50 transition-all"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-black uppercase tracking-wider text-slate-400">Role *</label>
                    <select
                      value={formData.role}
                      onChange={(e) => setFormData(prev => ({ ...prev, role: e.target.value }))}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold outline-none focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50 transition-all"
                    >
                      <option value="accountant">Accountant</option>
                      <option value="assistant">Assistant</option>
                    </select>
                  </div>
                </div>

                {/* Permissions Grid Section */}
                <div className="border-t border-slate-100 pt-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h4 className="text-sm font-black text-slate-800 uppercase tracking-wider">Module Permissions</h4>
                      <p className="text-slate-400 text-[11px] mt-0.5">Select which administrative screens this user can view and edit.</p>
                    </div>
                    <div className="flex gap-2">
                      <button 
                        type="button" 
                        onClick={handleSelectAllPermissions}
                        className="text-xs text-indigo-600 hover:text-indigo-800 font-black uppercase tracking-wider"
                      >
                        Select All
                      </button>
                      <span className="text-slate-200 text-xs">|</span>
                      <button 
                        type="button" 
                        onClick={handleClearAllPermissions}
                        className="text-xs text-slate-400 hover:text-slate-600 font-black uppercase tracking-wider"
                      >
                        Clear
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {PERMISSIONS_LIST.map((perm) => {
                      const isChecked = formData.allowedPermissions.includes(perm.key);
                      return (
                        <div 
                          key={perm.key}
                          onClick={() => handleTogglePermission(perm.key)}
                          className={`flex items-start gap-3 p-3.5 rounded-2xl border-2 cursor-pointer select-none transition-all ${
                            isChecked 
                              ? 'border-indigo-500 bg-indigo-50/40 text-indigo-900 shadow-sm' 
                              : 'border-slate-100 hover:border-slate-200 bg-white text-slate-700'
                          }`}
                        >
                          <div className={`mt-0.5 w-5 h-5 rounded-lg border-2 flex items-center justify-center transition-all ${
                            isChecked ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-300 bg-white'
                          }`}>
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

                {/* Submit / Cancel Buttons */}
                <div className="border-t border-slate-100 pt-6 flex items-center justify-end gap-3 shrink-0">
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="px-6 py-3.5 rounded-xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 transition-colors text-sm"
                  >
                    Cancel
                  </button>
                  <Button
                    type="submit"
                    className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl py-3.5 px-8 text-sm font-black shadow-lg shadow-indigo-100"
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

export default UserManagement;
