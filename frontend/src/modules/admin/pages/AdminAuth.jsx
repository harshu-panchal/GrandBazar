import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@core/context/AuthContext';
import { useSettings } from '@core/context/SettingsContext';
import {
    Mail,
    Lock,
    User,
    ShieldCheck,
    ArrowRight,
    ArrowLeft,
    Eye,
    EyeOff
} from 'lucide-react';
import { toast } from 'sonner';
import Lottie from 'lottie-react';
import backendAnimation from '../../../assets/Backend Icon.json';
import { adminApi } from '../services/adminApi';

const AdminAuth = () => {
    const [isLogin, setIsLogin] = useState(true);
    const [isLoading, setIsLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [forgotStep, setForgotStep] = useState(null); // null | 'email' | 'otp' | 'reset'
    const [forgotOtp, setForgotOtp] = useState('');
    const [resetToken, setResetToken] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [maskedForgotEmail, setMaskedForgotEmail] = useState('');
    const { login } = useAuth();
    const { settings } = useSettings();
    const navigate = useNavigate();
    const appName = settings?.appName || 'App';
    const logoUrl = settings?.logoUrl || '';

    const [formData, setFormData] = useState({
        email: '',
        password: '',
        name: '',
        adminCode: '',
        phone: ''
    });

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData({ ...formData, [name]: value });
    };

    const exitForgotPassword = () => {
        setForgotStep(null);
        setForgotOtp('');
        setResetToken('');
        setNewPassword('');
        setConfirmPassword('');
        setShowNewPassword(false);
        setShowConfirmPassword(false);
        setMaskedForgotEmail('');
    };

    const openForgotPassword = () => {
        setIsLogin(true);
        setForgotStep('email');
        setForgotOtp('');
        setResetToken('');
        setNewPassword('');
        setConfirmPassword('');
    };

    const validateAdminPassword = (pwd) => {
        if (pwd.length < 10) {
            toast.error('Password must be at least 10 characters long.');
            return false;
        }
        if (!/[a-z]/.test(pwd)) {
            toast.error('Password must contain at least one lowercase letter.');
            return false;
        }
        if (!/[A-Z]/.test(pwd)) {
            toast.error('Password must contain at least one uppercase letter.');
            return false;
        }
        if (!/[0-9]/.test(pwd)) {
            toast.error('Password must contain at least one number.');
            return false;
        }
        return true;
    };

    const handleForgotSendOtp = async (e) => {
        e.preventDefault();
        const email = (formData.email || '').trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            toast.error('Please enter a valid email address.');
            return;
        }

        setIsLoading(true);
        try {
            const response = await adminApi.sendForgotPasswordOtp({ email });
            const result = response.data?.result || {};
            setMaskedForgotEmail(result.maskedTarget || email);
            setForgotStep('otp');
            setForgotOtp('');
            toast.success(response.data?.message || 'If an account exists, a reset code has been sent.');
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to send reset code');
        } finally {
            setIsLoading(false);
        }
    };

    const handleForgotVerifyOtp = async (e) => {
        e.preventDefault();
        if (forgotOtp.length !== 4) {
            toast.error('Please enter the 4-digit OTP.');
            return;
        }

        setIsLoading(true);
        try {
            const response = await adminApi.verifyForgotPasswordOtp({
                email: formData.email,
                otp: forgotOtp,
            });
            const token = response.data?.result?.resetToken || '';
            if (!token) {
                toast.error('Could not start password reset. Please try again.');
                return;
            }
            setResetToken(token);
            setForgotStep('reset');
            toast.success('OTP verified. Set your new password.');
        } catch (error) {
            toast.error(error.response?.data?.message || 'Invalid or expired OTP');
        } finally {
            setIsLoading(false);
        }
    };

    const handleForgotResetPassword = async (e) => {
        e.preventDefault();
        const pwd = (newPassword || '').trim();
        if (!validateAdminPassword(pwd)) {
            return;
        }
        if (pwd !== confirmPassword) {
            toast.error('Passwords do not match.');
            return;
        }

        setIsLoading(true);
        try {
            await adminApi.resetPassword({
                resetToken,
                newPassword: pwd,
            });
            toast.success('Password reset successfully. Please sign in.');
            setFormData((prev) => ({ ...prev, password: '' }));
            exitForgotPassword();
            setIsLogin(true);
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to reset password');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsLoading(true);

        if (!isLogin) {
            const pwd = (formData.password || '').trim();
            if (!validateAdminPassword(pwd)) {
                setIsLoading(false);
                return;
            }
        }

        try {
            const response = isLogin
                ? await adminApi.login({ email: formData.email, password: formData.password })
                : await adminApi.signup({ name: formData.name, email: formData.email, password: formData.password });

            const { token, admin } = response.data.result;

            const authData = {
                ...admin,
                token,
                role: 'admin'
            };

            login(authData);

            toast.success(isLogin ? 'Welcome back, Administrator.' : 'Administrator Account Created.');
            navigate('/admin');
        } catch (error) {
            toast.error(error.response?.data?.message || 'Authentication failed');
        } finally {
            setIsLoading(false);
        }
    };

    const authKey = forgotStep || (isLogin ? 'login' : 'signup');
    const title = forgotStep === 'email'
        ? 'Forgot Password'
        : forgotStep === 'otp'
            ? 'Verify OTP'
            : forgotStep === 'reset'
                ? 'New Password'
                : isLogin
                    ? 'Login'
                    : 'Sign Up';
    const subtitle = forgotStep === 'email'
        ? 'Enter your admin email to receive a reset code'
        : forgotStep === 'otp'
            ? `Enter the 4-digit code sent to ${maskedForgotEmail || 'your email'}`
            : forgotStep === 'reset'
                ? 'Choose a new password for your admin account'
                : isLogin
                    ? `Welcome to ${appName} Admin Platform`
                    : 'Start managing your platform today';

    return (
        <div className="flex flex-col min-h-screen items-center justify-center bg-[#f3f6ff] p-6 font-['Outfit',_sans-serif] relative">
            <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
                <div className="absolute top-[-20%] left-[-10%] w-[800px] h-[800px] bg-brand-50 opacity-40 rounded-full blur-[120px]"></div>
                <div className="absolute bottom-[-10%] right-[-10%] w-[600px] h-[600px] bg-white opacity-60 rounded-full blur-[100px]"></div>
            </div>

            <motion.div
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5, type: "spring", bounce: 0.3 }}
                className="relative z-10 w-full max-w-[1050px] min-h-[650px] bg-white rounded-[50px] shadow-[0_40px_120px_rgba(0,0,0,0.06)] overflow-hidden flex flex-col md:flex-row border border-white"
            >
                <div className="w-full md:w-[45%] p-12 md:p-20 flex flex-col justify-center relative z-10 bg-white">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={authKey}
                            initial={{ x: -30, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            exit={{ x: 30, opacity: 0 }}
                            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                            className="space-y-10"
                        >
                            <div className="space-y-3">
                                <motion.h1
                                    className="text-5xl font-black text-brand-900 tracking-tight"
                                    layoutId="auth-title"
                                >
                                    {title}
                                </motion.h1>
                                <p className="text-gray-400 font-medium text-base">
                                    {subtitle}
                                </p>
                            </div>

                            {forgotStep === 'email' && (
                                <form onSubmit={handleForgotSendOtp} className="space-y-5">
                                    <div className="group relative">
                                        <div className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-brand-600 transition-colors">
                                            <Mail size={20} />
                                        </div>
                                        <input
                                            type="email"
                                            name="email"
                                            required
                                            value={formData.email}
                                            onChange={handleChange}
                                            placeholder="Admin email"
                                            className="w-full pl-14 pr-5 py-5 bg-[#f8f9ff] border-2 border-transparent rounded-[24px] text-sm font-medium text-gray-700 outline-none focus:bg-white focus:border-brand-100 focus:ring-4 focus:ring-brand-50/50 transition-all placeholder:text-gray-300"
                                        />
                                    </div>
                                    <button
                                        type="submit"
                                        disabled={isLoading}
                                        className="w-full bg-black text-primary-foreground rounded-[24px] py-5 text-base font-black shadow-2xl shadow-brand-200 hover:bg-brand-700 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-3"
                                    >
                                        {isLoading ? 'Sending...' : (
                                            <>
                                                <span>Send Reset Code</span>
                                                <ArrowRight size={20} />
                                            </>
                                        )}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={exitForgotPassword}
                                        className="w-full flex items-center justify-center gap-2 text-sm font-bold text-gray-500 hover:text-brand-700 transition-colors"
                                    >
                                        <ArrowLeft size={16} />
                                        Back to login
                                    </button>
                                </form>
                            )}

                            {forgotStep === 'otp' && (
                                <form onSubmit={handleForgotVerifyOtp} className="space-y-5">
                                    <input
                                        type="text"
                                        inputMode="numeric"
                                        maxLength={4}
                                        required
                                        value={forgotOtp}
                                        onChange={(e) => setForgotOtp(e.target.value.replace(/\D/g, '').slice(0, 4))}
                                        placeholder="4-digit OTP"
                                        className="w-full px-5 py-5 bg-[#f8f9ff] border-2 border-transparent rounded-[24px] text-sm font-medium text-gray-700 outline-none focus:bg-white focus:border-brand-100 focus:ring-4 focus:ring-brand-50/50 transition-all placeholder:text-gray-300 tracking-[0.4em] text-center"
                                    />
                                    <button
                                        type="submit"
                                        disabled={isLoading || forgotOtp.length !== 4}
                                        className="w-full bg-black text-primary-foreground rounded-[24px] py-5 text-base font-black shadow-2xl shadow-brand-200 hover:bg-brand-700 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-3"
                                    >
                                        {isLoading ? 'Verifying...' : (
                                            <>
                                                <span>Verify OTP</span>
                                                <ArrowRight size={20} />
                                            </>
                                        )}
                                    </button>
                                    <div className="flex flex-col items-center gap-2">
                                        <button
                                            type="button"
                                            disabled={isLoading}
                                            onClick={handleForgotSendOtp}
                                            className="text-sm font-bold text-brand-700 underline underline-offset-2 disabled:opacity-50"
                                        >
                                            Resend code
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setForgotStep('email')}
                                            className="flex items-center justify-center gap-2 text-sm font-bold text-gray-500 hover:text-brand-700 transition-colors"
                                        >
                                            <ArrowLeft size={16} />
                                            Change email
                                        </button>
                                    </div>
                                </form>
                            )}

                            {forgotStep === 'reset' && (
                                <form onSubmit={handleForgotResetPassword} className="space-y-5">
                                    <div className="group relative">
                                        <div className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-brand-600 transition-colors">
                                            <Lock size={20} />
                                        </div>
                                        <input
                                            type={showNewPassword ? 'text' : 'password'}
                                            required
                                            minLength={10}
                                            maxLength={128}
                                            autoComplete="new-password"
                                            value={newPassword}
                                            onChange={(e) => setNewPassword(e.target.value)}
                                            placeholder="New password (min 10 chars)"
                                            className="w-full pl-14 pr-14 py-5 bg-[#f8f9ff] border-2 border-transparent rounded-[24px] text-sm font-medium text-gray-700 outline-none focus:bg-white focus:border-brand-100 focus:ring-4 focus:ring-brand-50/50 transition-all placeholder:text-gray-300"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowNewPassword(!showNewPassword)}
                                            className="absolute right-5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-brand-600 transition-colors focus:outline-none"
                                        >
                                            {showNewPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                                        </button>
                                    </div>
                                    <div className="group relative">
                                        <div className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-brand-600 transition-colors">
                                            <Lock size={20} />
                                        </div>
                                        <input
                                            type={showConfirmPassword ? 'text' : 'password'}
                                            required
                                            minLength={10}
                                            maxLength={128}
                                            autoComplete="new-password"
                                            value={confirmPassword}
                                            onChange={(e) => setConfirmPassword(e.target.value)}
                                            placeholder="Confirm new password"
                                            className="w-full pl-14 pr-14 py-5 bg-[#f8f9ff] border-2 border-transparent rounded-[24px] text-sm font-medium text-gray-700 outline-none focus:bg-white focus:border-brand-100 focus:ring-4 focus:ring-brand-50/50 transition-all placeholder:text-gray-300"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                            className="absolute right-5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-brand-600 transition-colors focus:outline-none"
                                        >
                                            {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                                        </button>
                                    </div>
                                    <button
                                        type="submit"
                                        disabled={isLoading}
                                        className="w-full bg-black text-primary-foreground rounded-[24px] py-5 text-base font-black shadow-2xl shadow-brand-200 hover:bg-brand-700 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-3"
                                    >
                                        {isLoading ? 'Saving...' : (
                                            <>
                                                <span>Reset Password</span>
                                                <ArrowRight size={20} />
                                            </>
                                        )}
                                    </button>
                                </form>
                            )}

                            {!forgotStep && (
                            <form onSubmit={handleSubmit} className="space-y-5">
                                <AnimatePresence mode="popLayout">
                                    {!isLogin && (
                                        <motion.div
                                            initial={{ height: 0, opacity: 0, y: -10 }}
                                            animate={{ height: 'auto', opacity: 1, y: 0 }}
                                            exit={{ height: 0, opacity: 0, y: -10 }}
                                            className="group relative"
                                        >
                                            <div className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-brand-600 transition-colors">
                                                <User size={20} />
                                            </div>
                                            <input
                                                type="text"
                                                name="name"
                                                required
                                                value={formData.name}
                                                onChange={handleChange}
                                                placeholder="Full Name"
                                                className="w-full pl-14 pr-5 py-5 bg-[#f8f9ff] border-2 border-transparent rounded-[24px] text-sm font-medium text-gray-700 outline-none focus:bg-white focus:border-brand-100 focus:ring-4 focus:ring-brand-50/50 transition-all placeholder:text-gray-300"
                                            />
                                        </motion.div>
                                    )}
                                </AnimatePresence>

                                <div className="group relative">
                                    <div className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-brand-600 transition-colors">
                                        <Mail size={20} />
                                    </div>
                                    <input
                                        type="email"
                                        name="email"
                                        required
                                        value={formData.email}
                                        onChange={handleChange}
                                        placeholder="Username or email"
                                        className="w-full pl-14 pr-5 py-5 bg-[#f8f9ff] border-2 border-transparent rounded-[24px] text-sm font-medium text-gray-700 outline-none focus:bg-white focus:border-brand-100 focus:ring-4 focus:ring-brand-50/50 transition-all placeholder:text-gray-300"
                                    />
                                </div>

                                <div className="group relative">
                                    <div className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-brand-600 transition-colors">
                                        <Lock size={20} />
                                    </div>
                                    <input
                                        type={showPassword ? "text" : "password"}
                                        name="password"
                                        required
                                        minLength={isLogin ? 6 : 10}
                                        maxLength={128}
                                        autoComplete="current-password"
                                        value={formData.password}
                                        onChange={handleChange}
                                        placeholder={isLogin ? "Password" : "Password (min 10 chars)"}
                                        className="w-full pl-14 pr-14 py-5 bg-[#f8f9ff] border-2 border-transparent rounded-[24px] text-sm font-medium text-gray-700 outline-none focus:bg-white focus:border-brand-100 focus:ring-4 focus:ring-brand-50/50 transition-all placeholder:text-gray-300"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-brand-600 transition-colors focus:outline-none"
                                    >
                                        {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                                    </button>
                                </div>

                                {isLogin && (
                                    <div className="flex justify-end -mt-2">
                                        <button
                                            type="button"
                                            onClick={openForgotPassword}
                                            className="text-xs font-bold text-gray-500 hover:text-brand-700 underline underline-offset-2 transition-colors"
                                        >
                                            Forgot password?
                                        </button>
                                    </div>
                                )}

                                <button
                                    type="submit"
                                    disabled={isLoading}
                                    className="w-full bg-brand-600 text-white rounded-[24px] py-5 text-base font-black shadow-2xl shadow-brand-200 hover:bg-brand-700 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-3"
                                >
                                    {isLoading ? (
                                        <motion.div
                                            animate={{ rotate: 360 }}
                                            transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                                            className="w-6 h-6 border-3 border-white/30 border-t-white rounded-full"
                                        />
                                    ) : (
                                        <>
                                            <span>{isLogin ? 'Login Now' : 'Create Account'}</span>
                                            <ArrowRight size={20} />
                                        </>
                                    )}
                                </button>
                            </form>
                            )}

                        </motion.div>
                    </AnimatePresence>
                </div>

                <div className="hidden md:flex w-[55%] relative bg-[#f8f9ff] overflow-hidden items-center justify-center">
                    <div className="absolute top-8 right-8 z-30">
                        <div className="w-36 h-20 rounded-2xl bg-white/85 backdrop-blur-sm border border-brand-100 shadow-[0_12px_30px_rgba(79,70,229,0.18)] flex items-center justify-center overflow-hidden p-2">
                            {logoUrl ? (
                                <img
                                    src={logoUrl}
                                    alt={`${appName} logo`}
                                    className="w-full h-full object-contain"
                                />
                            ) : (
                                <ShieldCheck size={30} className="text-brand-600" />
                            )}
                        </div>
                    </div>
                    <div className="absolute inset-y-0 -left-1 w-[200px] z-20">
                        <svg className="h-full w-full fill-white" preserveAspectRatio="none" viewBox="0 0 100 100">
                            <path d="M 0 0 C 40 0, 100 20, 100 50 C 100 80, 40 100, 0 100 Z"></path>
                        </svg>
                    </div>

                    <div className="relative z-10 w-full h-full flex flex-col items-center justify-center p-20">
                        <div className="absolute w-64 h-64 bg-brand-400/20 rounded-full blur-[80px]" />

                        <motion.div
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ delay: 0.3, duration: 1, type: "spring" }}
                            className="w-full max-w-[400px] relative z-10"
                        >
                            <Lottie
                                animationData={backendAnimation}
                                loop={true}
                                className="w-full h-auto drop-shadow-[0_20px_40px_rgba(79,70,229,0.15)]"
                            />
                        </motion.div>

                    </div>

                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(79,70,229,0.05)_0%,transparent_100%)]"></div>
                </div>
            </motion.div>

            <div className="mt-8 text-gray-400 font-bold text-[10px] tracking-[5px] uppercase flex items-center gap-3 relative z-10">
                <div className="w-8 h-[1px] bg-gray-200"></div>
                {`Protected by ${appName} Security`}
                <div className="w-8 h-[1px] bg-gray-200"></div>
            </div>
        </div>
    );
};

export default AdminAuth;
