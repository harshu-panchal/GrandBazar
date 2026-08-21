import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, User, Phone, Mail, Camera, Save, Cake, RotateCw } from 'lucide-react';
import { toast } from 'sonner';

import { useAuth } from '@core/context/AuthContext';
import axiosInstance from '@core/api/axios';
import { customerApi } from '../services/customerApi';
import { formatIndiaPhoneForDisplay } from '@shared/utils/customerProfile';

const EditProfilePage = () => {
    const navigate = useNavigate();
    const { user, updateUser } = useAuth();
    const [isLoading, setIsLoading] = useState(false);
    const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
    const [profileImage, setProfileImage] = useState(user?.profileImage || null);
    const photoInputRef = useRef(null);
    const [formData, setFormData] = useState({
        name: user?.name || '',
        phone: formatIndiaPhoneForDisplay(user?.phone) || '',
        email: user?.email || '',
        bio: user?.bio || '',
        dateOfBirth: user?.dateOfBirth
            ? new Date(user.dateOfBirth).toISOString().slice(0, 10)
            : '',
    });

    useEffect(() => {
        if (!user) return;
        setFormData({
            name: user.name || '',
            phone: formatIndiaPhoneForDisplay(user.phone) || '',
            email: user.email || '',
            bio: user.bio || '',
            dateOfBirth: user.dateOfBirth
                ? new Date(user.dateOfBirth).toISOString().slice(0, 10)
                : '',
        });
        setProfileImage(user.profileImage || null);
    }, [user]);

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handlePhotoSelected = async (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;

        setIsUploadingPhoto(true);
        try {
            const uploadForm = new FormData();
            uploadForm.append('file', file);
            const uploadRes = await axiosInstance.post('/media/upload', uploadForm, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            const url = uploadRes.data?.result?.url || uploadRes.data?.result?.secureUrl;
            if (!url) throw new Error('Upload did not return a file URL');

            const response = await customerApi.updateProfile({ profileImage: url });
            const updatedUser = response.data.result;
            updateUser(updatedUser);
            setProfileImage(url);
            toast.success('Profile photo updated');
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to update profile photo');
        } finally {
            setIsUploadingPhoto(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        try {
            const response = await customerApi.updateProfile(formData);
            const updatedUser = response.data.result;

            updateUser(updatedUser);

            toast.success('Profile updated successfully!');
            navigate('/profile');
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to update profile');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 font-sans pb-10">
            {/* Header */}
            <div className="bg-white sticky top-0 z-30 px-4 py-3 flex items-center gap-3 shadow-sm">
                <Link to="/profile" className="p-2 -ml-2 rounded-full hover:bg-slate-100 transition-colors">
                    <ArrowLeft size={24} className="text-slate-600" />
                </Link>
                <h1 className="text-lg font-black text-slate-800">Edit Profile</h1>
            </div>

            <div className="max-w-xl mx-auto p-5">

                {/* Profile Picture Upload */}
                <div className="flex flex-col items-center mb-8">
                    <input
                        ref={photoInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handlePhotoSelected}
                    />
                    <div className="relative">
                        <button
                            type="button"
                            onClick={() => !isUploadingPhoto && photoInputRef.current?.click()}
                            className="h-28 w-28 rounded-full bg-slate-200 border-4 border-white shadow-md flex items-center justify-center overflow-hidden"
                        >
                            {isUploadingPhoto ? (
                                <RotateCw size={28} className="text-slate-400 animate-spin" />
                            ) : profileImage ? (
                                <img src={profileImage} alt="Profile" className="h-full w-full object-cover" />
                            ) : (
                                <User size={48} className="text-slate-400" />
                            )}
                        </button>
                        <button
                            type="button"
                            onClick={() => !isUploadingPhoto && photoInputRef.current?.click()}
                            className="absolute bottom-0 right-0 p-2 bg-primary text-primary-foreground rounded-full border-2 border-white shadow-sm hover:bg-[#0a701a] transition-colors disabled:opacity-60"
                            disabled={isUploadingPhoto}
                        >
                            <Camera size={18} />
                        </button>
                    </div>
                    <button
                        type="button"
                        onClick={() => !isUploadingPhoto && photoInputRef.current?.click()}
                        className="mt-3 text-sm font-bold text-primary"
                    >
                        {isUploadingPhoto ? 'Uploading...' : 'Change Photo'}
                    </button>
                </div>

                {/* Edit Form */}
                <form onSubmit={handleSubmit} className="space-y-5">
                    <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 space-y-5">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Full Name</label>
                            <div className="flex items-center gap-3 bg-slate-50 px-4 py-3 rounded-xl border border-slate-200 focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/10 transition-all">
                                <User size={20} className="text-slate-400" />
                                <input
                                    type="text"
                                    name="name"
                                    value={formData.name}
                                    onChange={handleChange}
                                    className="bg-transparent w-full text-slate-800 font-bold outline-none placeholder:font-medium"
                                    placeholder="Enter your name"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Phone Number</label>
                            <div className="flex items-center gap-3 bg-slate-50 px-4 py-3 rounded-xl border border-slate-200 focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/10 transition-all">
                                <Phone size={20} className="text-slate-400" />
                                <input
                                    type="tel"
                                    name="phone"
                                    value={formData.phone}
                                    onChange={handleChange}
                                    className="bg-transparent w-full text-slate-800 font-bold outline-none placeholder:font-medium"
                                    placeholder="Enter phone number"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Email Address</label>
                            <div className="flex items-center gap-3 bg-slate-50 px-4 py-3 rounded-xl border border-slate-200 focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/10 transition-all">
                                <Mail size={20} className="text-slate-400" />
                                <input
                                    type="email"
                                    name="email"
                                    value={formData.email}
                                    onChange={handleChange}
                                    className="bg-transparent w-full text-slate-800 font-bold outline-none placeholder:font-medium"
                                    placeholder="Enter email address"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Date of Birth</label>
                            <div className="flex items-center gap-3 bg-slate-50 px-4 py-3 rounded-xl border border-slate-200 focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/10 transition-all">
                                <Cake size={20} className="text-slate-400" />
                                <input
                                    type="date"
                                    name="dateOfBirth"
                                    value={formData.dateOfBirth}
                                    onChange={handleChange}
                                    max={new Date().toISOString().slice(0, 10)}
                                    className="bg-transparent w-full text-slate-800 font-bold outline-none"
                                />
                            </div>
                            <p className="mt-1.5 text-[11px] text-slate-400 font-medium">
                                Used for birthday rewards — keep this updated to receive them.
                            </p>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Bio</label>
                            <textarea
                                name="bio"
                                value={formData.bio}
                                onChange={handleChange}
                                rows="3"
                                className="w-full bg-slate-50 px-4 py-3 rounded-xl border border-slate-200 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-slate-800 font-medium resize-none"
                                placeholder="Tell us about yourself..."
                            ></textarea>
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full py-4 bg-primary text-primary-foreground font-bold rounded-2xl shadow-lg shadow-brand-200 hover:bg-[#0a701a] active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                        {isLoading ? (
                            <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        ) : (
                            <Save size={20} />
                        )}
                        {isLoading ? 'Saving...' : 'Save Changes'}
                    </button>
                </form>

            </div>
        </div>
    );
};

export default EditProfilePage;

