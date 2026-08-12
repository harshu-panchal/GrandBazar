import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, ShieldQuestion, User, ChevronRight, ToggleRight, ToggleLeft, LogOut, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@core/context/AuthContext';
import { customerApi } from '../services/customerApi';
import { ensureFcmTokenRegistered } from '@core/firebase/pushClient';

const SettingsPage = () => {
    const navigate = useNavigate();
    const { user, role, updateUser, logout } = useAuth();
    const [isSavingNotifications, setIsSavingNotifications] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const notificationsEnabled = user?.notificationsEnabled !== false;

    const handleToggleNotifications = async () => {
        if (isSavingNotifications) return;
        const nextValue = !notificationsEnabled;
        setIsSavingNotifications(true);
        try {
            const res = await customerApi.updateProfile({ notificationsEnabled: nextValue });
            updateUser(res.data.result);
            toast.success(nextValue ? 'Notifications turned on' : 'Notifications turned off');
            if (nextValue) {
                // Best-effort: (re)register this device for push delivery now that
                // the customer has opted back in.
                ensureFcmTokenRegistered({ role, platform: 'web' }).catch(() => {});
            }
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to update notification preference');
        } finally {
            setIsSavingNotifications(false);
        }
    };

    const handleDeleteAccount = async () => {
        if (isDeleting) return;
        const confirmed = window.confirm(
            'Are you sure you want to delete your account? This action cannot be undone.',
        );
        if (!confirmed) return;

        setIsDeleting(true);
        try {
            await customerApi.deleteAccount();
            toast.success('Your account has been deleted');
            await logout();
            navigate('/login', { replace: true });
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to delete account');
            setIsDeleting(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 pb-24 font-sans">
            {/* Header */}
            <div className="bg-gradient-to-br from-primary to-[#149d29] px-5 pt-10 pb-20 relative z-10 rounded-b-[2.5rem] shadow-lg overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -mr-16 -mt-32 pointer-events-none" />
                <div className="absolute bottom-0 left-0 w-32 h-32 bg-black/5 rounded-full blur-2xl -ml-10 -mb-10 pointer-events-none" />
                <h1 className="text-3xl font-black text-white tracking-tight relative z-10">Settings</h1>
                <p className="text-brand-50 text-sm font-medium mt-1 relative z-10">Configure your app preferences</p>
            </div>

            <div className="max-w-2xl mx-auto px-4 -mt-10 relative z-20 space-y-6">

                {/* General Section */}
                <div className="bg-white rounded-3xl overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100">
                    <div className="px-6 py-4 bg-slate-50/50 border-b border-slate-100">
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">General</h3>
                    </div>
                    <div className="divide-y divide-slate-50">
                        <SettingItem
                            icon={Bell}
                            label="Notifications"
                            hasToggle
                            toggleOn={notificationsEnabled}
                            disabled={isSavingNotifications}
                            onClick={handleToggleNotifications}
                        />
                    </div>
                </div>

                {/* Security Section */}
                <div className="bg-white rounded-3xl overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100">
                    <div className="px-6 py-4 bg-slate-50/50 border-b border-slate-100">
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Security</h3>
                    </div>
                    <div className="divide-y divide-slate-50">
                        <SettingItem
                            icon={User}
                            label="Manage Login Details"
                            value="Phone / Email"
                            onClick={() => navigate('/profile/edit')}
                        />
                        <SettingItem
                            icon={ShieldQuestion}
                            label="Privacy Policy"
                            onClick={() => navigate('/privacy')}
                        />
                        <SettingItem
                            icon={RotateCcw}
                            label="Return & Exchange Policy"
                            onClick={() => navigate('/return-policy')}
                        />
                    </div>
                </div>

                {/* Danger Zone */}
                <div className="bg-white rounded-3xl overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100">
                    <div className="p-4">
                        <button
                            onClick={handleDeleteAccount}
                            disabled={isDeleting}
                            className="w-full py-4 text-red-600 font-bold bg-red-50 rounded-2xl flex items-center justify-center gap-2 hover:bg-red-100 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                            <LogOut size={20} /> {isDeleting ? 'Deleting…' : 'Delete Account'}
                        </button>
                    </div>
                </div>

            </div>
        </div>
    );
};

const SettingItem = ({ icon: Icon, label, value, hasToggle, toggleOn, disabled, onClick }) => (
    <div
        onClick={disabled ? undefined : onClick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
            if (!disabled && (e.key === 'Enter' || e.key === ' ')) onClick?.();
        }}
        className={`px-6 py-5 flex items-center justify-between hover:bg-slate-50 transition-colors ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
    >
        <div className="flex items-center gap-4">
            <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
                <Icon size={20} />
            </div>
            <span className="font-bold text-slate-800 text-base">{label}</span>
        </div>

        <div className="flex items-center gap-2">
            {value && <span className="text-slate-400 text-sm font-medium">{value}</span>}
            {hasToggle ? (
                toggleOn ? (
                    <ToggleRight size={32} className="text-primary fill-current" />
                ) : (
                    <ToggleLeft size={32} className="text-slate-300 fill-current" />
                )
            ) : (
                <ChevronRight size={20} className="text-slate-300" />
            )}
        </div>
    </div>
);

export default SettingsPage;
