import React, { useState, useMemo } from 'react';
import Card from '@shared/components/ui/Card';
import Badge from '@shared/components/ui/Badge';
import {
    Search,
    Filter,
    CheckCircle,
    XCircle,
    FileSearch,
    Phone,
    Mail,
    Truck,
    MapPin,
    Calendar,
    IdCard,
    RotateCw,
    Check,
    X,
    Building2,
    CreditCard,
    Home,
    ExternalLink,
    Maximize2,
    UserCheck,
    FileText
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { adminApi } from '../services/adminApi';

const PendingDeliveryBoys = () => {
    const [pendingRiders, setPendingRiders] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState('all');
    const [viewingRider, setViewingRider] = useState(null);
    const [previewDoc, setPreviewDoc] = useState(null); // Lightbox preview { name, url }
    const [isProcessing, setIsProcessing] = useState(false);

    // Fetch Pending Riders
    const fetchPendingRiders = async () => {
        setIsLoading(true);
        try {
            // verified=false fetches riders waiting for review
            const params = { verified: 'false' };
            if (searchTerm.trim()) params.search = searchTerm.trim();
            const response = await adminApi.getDeliveryPartners(params);
            const payload = response.data.result || {};
            const list = Array.isArray(payload.items) ? payload.items : (response.data.results || []);

            // Map backend data to frontend format
            const mappedRiders = list.map(r => {
                const docsMap = r.documents || {};
                const docsList = [];

                const aadharUrl = docsMap.aadhar || r.aadhar || '';
                const panUrl = docsMap.pan || r.pan || '';
                const dlUrl = docsMap.drivingLicense || r.dl || r.drivingLicense || '';

                if (aadharUrl) docsList.push({ name: 'Aadhar Card', url: aadharUrl, key: 'aadhar' });
                if (panUrl) docsList.push({ name: 'PAN Card', url: panUrl, key: 'pan' });
                if (dlUrl) docsList.push({ name: 'Driving License', url: dlUrl, key: 'dl' });

                return {
                    id: r._id,
                    name: r.name || 'Unnamed Rider',
                    phone: r.phone || 'N/A',
                    email: r.email || 'Not Provided',
                    address: r.address || 'Not Provided',
                    appliedDate: r.createdAt ? new Date(r.createdAt).toLocaleDateString() : 'N/A',
                    location: (r.currentArea && r.currentArea !== 'Unknown') ? r.currentArea : (r.city || r.address || 'Main City'),
                    vehicle: r.vehicleType || 'bike',
                    vehicleNumber: r.vehicleNumber || 'Not Specified',
                    drivingLicenseNumber: r.drivingLicenseNumber || 'Not Specified',
                    accountHolder: r.accountHolder || 'Not Specified',
                    accountNumber: r.accountNumber || 'Not Specified',
                    ifsc: r.ifsc || 'Not Specified',
                    profileImage: r.profileImage || r.avatar || '',
                    documentsList: docsList,
                    documents: docsList.map(d => d.name),
                    status: r.isVerified ? 'approved' : 'pending_review',
                    experience: 'Applicant Node',
                    preferredArea: (r.currentArea && r.currentArea !== 'Unknown') ? r.currentArea : (r.city || r.address || 'Main City'),
                    raw: r
                };
            });

            setPendingRiders(mappedRiders);
        } catch (error) {
            console.error('Fetch Pending Riders Error:', error);
            toast.error('Failed to load applications');
        } finally {
            setIsLoading(false);
        }
    };

    React.useEffect(() => {
        const timer = setTimeout(() => {
            fetchPendingRiders();
        }, 500);
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchTerm, filterStatus]);

    const filteredRiders = useMemo(() => {
        return pendingRiders.filter(r => {
            const matchesSearch = r.name.toLowerCase().includes(searchTerm.toLowerCase()) || r.phone.includes(searchTerm);
            const matchesStatus = filterStatus === 'all' || r.status === filterStatus;
            return matchesSearch && matchesStatus;
        });
    }, [pendingRiders, searchTerm, filterStatus]);

    const handleApprove = async (id) => {
        setIsProcessing(true);
        try {
            await adminApi.approveDeliveryPartner(id);
            toast.success('Rider Approved & Activated!');
            setPendingRiders(pendingRiders.filter(r => r.id !== id));
            setViewingRider(null);
        } catch (error) {
            console.error('Approval Error:', error);
            toast.error('Failed to approve rider');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleReject = async (id) => {
        if (window.confirm('Are you sure you want to reject this application?')) {
            setIsProcessing(true);
            try {
                await adminApi.rejectDeliveryPartner(id);
                toast.success('Application Rejected');
                setPendingRiders(pendingRiders.filter(r => r.id !== id));
                setViewingRider(null);
            } catch (error) {
                console.error('Rejection Error:', error);
                toast.error('Failed to reject rider');
            } finally {
                setIsProcessing(false);
            }
        }
    };

    return (
        <div className="ds-section-spacing animate-in fade-in duration-700">
            {/* Header Section */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                <div>
                    <h1 className="ds-h1 flex items-center gap-3">
                        Rider Applications
                        <Badge variant="primary" className="text-[10px] px-2 py-0.5 uppercase">Pending Review</Badge>
                    </h1>
                    <p className="ds-description mt-1">Review documents for new delivery partners.</p>
                </div>
                <div className="flex items-center gap-3">
                    <button 
                        onClick={() => fetchPendingRiders()}
                        className="p-3 bg-white ring-1 ring-slate-200 rounded-2xl text-slate-400 hover:text-primary transition-all shadow-sm active:rotate-180 duration-500"
                    >
                        <RotateCw className="h-5 w-5" />
                    </button>
                    <div className="h-10 w-[1px] bg-slate-200 mx-2" />
                    <div className="flex flex-col items-end">
                        <p className="ds-label">Total Pending</p>
                        <h4 className="ds-h2">{pendingRiders.length}</h4>
                    </div>
                </div>
            </div>

            {/* Utility Bar */}
            <Card className="p-4 border-none shadow-sm ring-1 ring-slate-100 bg-white/50 backdrop-blur-xl">
                <div className="flex flex-col lg:flex-row gap-4">
                    <div className="flex-1 relative group">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-slate-400 group-focus-within:text-primary transition-colors" />
                        <input
                            type="text"
                            placeholder="Search by name or mobile..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-12 pr-4 py-3.5 bg-slate-100/50 border-none rounded-2xl text-xs font-semibold outline-none focus:ring-2 focus:ring-primary/10 transition-all"
                        />
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="bg-slate-100/50 p-1 rounded-2xl flex items-center">
                            {['all', 'pending'].map((status) => (
                                <button
                                    key={status}
                                    onClick={() => setFilterStatus(status)}
                                    className={cn(
                                        "px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all",
                                        filterStatus === status
                                            ? "bg-white text-slate-900 shadow-sm"
                                            : "text-slate-400 hover:text-slate-600"
                                    )}
                                >
                                    {status === 'pending' ? 'PENDING' : status.replace('_', ' ')}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </Card>

            {/* Applications Table View */}
            <Card className="border-none shadow-2xl ring-1 ring-slate-100 overflow-hidden bg-white rounded-xl relative min-h-[400px]">
                {isLoading && (
                    <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/50 backdrop-blur-sm">
                        <div className="flex flex-col items-center gap-3">
                            <div className="h-10 w-10 border-4 border-slate-200 border-t-primary rounded-full animate-spin" />
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Loading Applications...</p>
                        </div>
                    </div>
                )}
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50/50 border-b border-slate-100">
                                <th className="ds-table-header-cell px-4">Applicant Details</th>
                                <th className="ds-table-header-cell px-4">Vehicle & License</th>
                                <th className="ds-table-header-cell px-4">Bank Payout Info</th>
                                <th className="ds-table-header-cell px-4 text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {!isLoading && filteredRiders.length === 0 ? (
                                <tr>
                                    <td colSpan="4" className="py-20 text-center">
                                        <div className="flex flex-col items-center gap-3">
                                            <UserCheck className="h-12 w-12 text-slate-300" />
                                            <p className="text-sm font-bold text-slate-600">No Pending Applications</p>
                                            <p className="text-xs text-slate-400">All registered delivery partners have been reviewed.</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                filteredRiders.map((rider) => (
                                    <tr key={rider.id} className="hover:bg-slate-50/80 transition-colors">
                                        <td className="p-4">
                                            <div className="flex items-center gap-3">
                                                <img 
                                                    src={rider.profileImage || "https://cdn-icons-png.flaticon.com/512/149/149071.png"} 
                                                    alt={rider.name} 
                                                    className="h-11 w-11 rounded-2xl bg-slate-100 object-cover border border-slate-200" 
                                                />
                                                <div>
                                                    <h4 className="text-sm font-black text-slate-900">{rider.name}</h4>
                                                    <p className="text-xs font-semibold text-slate-500">{rider.phone}</p>
                                                    <p className="text-[10px] text-slate-400 font-medium">{rider.email}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="p-4">
                                            <div className="space-y-0.5">
                                                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900 uppercase">
                                                    <Truck className="h-3.5 w-3.5 text-brand-600" />
                                                    <span>{rider.vehicle}</span>
                                                    {rider.vehicleNumber && rider.vehicleNumber !== 'Not Specified' && (
                                                        <span className="text-slate-500 font-normal">({rider.vehicleNumber})</span>
                                                    )}
                                                </div>
                                                <p className="text-[11px] text-slate-500 font-medium">DL: {rider.drivingLicenseNumber}</p>
                                            </div>
                                        </td>
                                        <td className="p-4">
                                            <div className="space-y-0.5">
                                                <p className="text-xs font-bold text-slate-900">{rider.accountHolder}</p>
                                                <p className="text-[11px] text-slate-500 font-medium">A/C: {rider.accountNumber}</p>
                                                <p className="text-[10px] text-slate-400 font-medium">IFSC: {rider.ifsc}</p>
                                            </div>
                                        </td>
                                        <td className="p-4 text-right">
                                            <button
                                                onClick={() => setViewingRider(rider)}
                                                className="px-4 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-all shadow-sm"
                                            >
                                                Review Full Details
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>

            {/* Application Review Modal */}
            <AnimatePresence>
                {viewingRider && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xl"
                            onClick={() => setViewingRider(null)}
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="w-full max-w-5xl relative z-10 bg-white rounded-[36px] shadow-3xl overflow-hidden flex flex-col lg:flex-row my-auto max-h-[92vh]"
                        >
                            {/* Left: Applicant Profile Header */}
                            <div className="lg:w-80 bg-slate-50 p-6 border-r border-slate-100 flex flex-col justify-between shrink-0 overflow-y-auto">
                                <div className="space-y-6">
                                    <div className="text-center">
                                        <div className="relative inline-block mb-3">
                                            <img 
                                                src={viewingRider.profileImage || "https://cdn-icons-png.flaticon.com/512/149/149071.png"} 
                                                alt={viewingRider.name} 
                                                className="h-28 w-28 rounded-3xl bg-white shadow-xl object-cover ring-4 ring-white border border-slate-100" 
                                            />
                                            {viewingRider.profileImage && (
                                                <button
                                                    onClick={() => setPreviewDoc({ name: `${viewingRider.name} Profile Photo`, url: viewingRider.profileImage })}
                                                    className="absolute bottom-0 right-0 p-1.5 bg-slate-900 text-white rounded-xl shadow-md hover:bg-black transition-colors"
                                                    title="View Full Photo"
                                                >
                                                    <Maximize2 size={12} />
                                                </button>
                                            )}
                                        </div>
                                        <h3 className="text-xl font-black text-slate-900">{viewingRider.name}</h3>
                                        <span className="inline-block mt-1 px-3 py-1 bg-brand-50 text-brand-700 rounded-full text-[10px] font-black uppercase tracking-wider border border-brand-100">
                                            Rider Registration Application
                                        </span>
                                    </div>

                                    <div className="space-y-4 pt-4 border-t border-slate-200/60">
                                        <div className="space-y-1">
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Application Date</p>
                                            <div className="flex items-center gap-2 text-slate-700">
                                                <Calendar className="h-4 w-4 text-slate-400 shrink-0" />
                                                <span className="text-xs font-bold text-slate-900">{viewingRider.appliedDate}</span>
                                            </div>
                                        </div>

                                        <div className="space-y-1">
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Operating Area / City</p>
                                            <div className="flex items-center gap-2 text-slate-700">
                                                <MapPin className="h-4 w-4 text-slate-400 shrink-0" />
                                                <span className="text-xs font-bold text-slate-900">{viewingRider.preferredArea}</span>
                                            </div>
                                        </div>

                                        <div className="space-y-1">
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Full Home Address</p>
                                            <div className="flex items-start gap-2 text-slate-700">
                                                <Home className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                                                <span className="text-xs font-semibold text-slate-800 leading-snug">{viewingRider.address}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="pt-6 border-t border-slate-200/60 mt-6">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">System Audit Score</p>
                                    <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden">
                                        <div className="h-full bg-emerald-500 w-[90%]" />
                                    </div>
                                    <p className="text-[10px] font-bold text-emerald-600 mt-2">90% Application Score</p>
                                </div>
                            </div>

                            {/* Right: Detailed Information Sections */}
                            <div className="flex-1 p-6 lg:p-10 bg-white overflow-y-auto space-y-8">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <h2 className="text-2xl font-black text-slate-900 tracking-tight">Delivery Boy Registration Details</h2>
                                        <p className="text-xs text-slate-500 font-medium mt-1">Full registration details submitted by the delivery partner.</p>
                                    </div>
                                    <button 
                                        onClick={() => setViewingRider(null)} 
                                        className="p-2.5 hover:bg-slate-100 rounded-2xl transition-colors shrink-0"
                                    >
                                        <X className="h-6 w-6 text-slate-500" />
                                    </button>
                                </div>

                                {/* Information Cards Grid */}
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    {/* Contact Records */}
                                    <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100 space-y-3">
                                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                                            <Phone className="h-3.5 w-3.5 text-primary" />
                                            Contact Info
                                        </h4>
                                        <div className="space-y-2">
                                            <div>
                                                <p className="text-[10px] text-slate-400 font-bold uppercase">Mobile Number</p>
                                                <a href={`tel:${viewingRider.phone}`} className="text-sm font-black text-slate-900 hover:text-primary transition-colors flex items-center gap-1">
                                                    {viewingRider.phone}
                                                    <ExternalLink size={12} />
                                                </a>
                                            </div>
                                            <div>
                                                <p className="text-[10px] text-slate-400 font-bold uppercase">Email Address</p>
                                                <p className="text-xs font-bold text-slate-800 truncate">{viewingRider.email}</p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Vehicle & License Info */}
                                    <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100 space-y-3">
                                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                                            <Truck className="h-3.5 w-3.5 text-brand-600" />
                                            Vehicle & License
                                        </h4>
                                        <div className="space-y-2">
                                            <div>
                                                <p className="text-[10px] text-slate-400 font-bold uppercase">Vehicle Type</p>
                                                <p className="text-sm font-black text-slate-900 uppercase">{viewingRider.vehicle}</p>
                                            </div>
                                            <div>
                                                <p className="text-[10px] text-slate-400 font-bold uppercase">Vehicle Number</p>
                                                <p className="text-xs font-bold text-brand-700 font-mono">{viewingRider.vehicleNumber}</p>
                                            </div>
                                            <div>
                                                <p className="text-[10px] text-slate-400 font-bold uppercase">Driving License No.</p>
                                                <p className="text-xs font-bold text-slate-800 font-mono">{viewingRider.drivingLicenseNumber}</p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Bank Payout Info */}
                                    <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100 space-y-3">
                                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                                            <CreditCard className="h-3.5 w-3.5 text-indigo-600" />
                                            Bank Payout Details
                                        </h4>
                                        <div className="space-y-2">
                                            <div>
                                                <p className="text-[10px] text-slate-400 font-bold uppercase">Account Holder</p>
                                                <p className="text-xs font-black text-slate-900">{viewingRider.accountHolder}</p>
                                            </div>
                                            <div>
                                                <p className="text-[10px] text-slate-400 font-bold uppercase">Account Number</p>
                                                <p className="text-xs font-bold text-indigo-700 font-mono">{viewingRider.accountNumber}</p>
                                            </div>
                                            <div>
                                                <p className="text-[10px] text-slate-400 font-bold uppercase">IFSC Code</p>
                                                <p className="text-xs font-bold text-slate-800 font-mono">{viewingRider.ifsc}</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Submitted Legal Documents */}
                                <div className="space-y-4">
                                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
                                        Submitted Identity Documents ({viewingRider.documentsList.length})
                                    </h4>
                                    
                                    {viewingRider.documentsList.length === 0 ? (
                                        <div className="p-6 bg-slate-50 rounded-2xl text-center border border-slate-100">
                                            <FileText className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                                            <p className="text-xs font-bold text-slate-600">No Document Photos Uploaded</p>
                                            <p className="text-[11px] text-slate-400">Applicant did not attach binary document files.</p>
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                            {viewingRider.documentsList.map((doc, idx) => (
                                                <div 
                                                    key={idx} 
                                                    onClick={() => setPreviewDoc(doc)}
                                                    className="group relative bg-slate-50 rounded-2xl border border-slate-200 p-4 cursor-pointer hover:border-brand-500 hover:shadow-md transition-all flex flex-col justify-between"
                                                >
                                                    <div className="flex items-center justify-between mb-3">
                                                        <span className="text-xs font-black text-slate-900 uppercase tracking-tight">{doc.name}</span>
                                                        <Maximize2 size={14} className="text-slate-400 group-hover:text-brand-600 transition-colors" />
                                                    </div>

                                                    {doc.url ? (
                                                        <div className="h-32 w-full rounded-xl bg-slate-200 overflow-hidden relative">
                                                            <img 
                                                                src={doc.url} 
                                                                alt={doc.name} 
                                                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                                                onError={(e) => {
                                                                    e.currentTarget.style.display = 'none';
                                                                }}
                                                            />
                                                            <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-bold gap-1.5">
                                                                <Maximize2 size={16} />
                                                                <span>Click to Expand</span>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="h-28 w-full bg-slate-100 rounded-xl flex items-center justify-center text-slate-400">
                                                            <FileSearch size={28} />
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Approval Actions */}
                                <div className="flex flex-col sm:flex-row gap-4 pt-4 border-t border-slate-100">
                                    <button
                                        disabled={isProcessing}
                                        onClick={() => handleApprove(viewingRider.id)}
                                        className="flex-1 py-4 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl hover:bg-black active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                                    >
                                        {isProcessing ? (
                                            <>
                                                <div className="h-4 w-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                                                Processing Vetting...
                                            </>
                                        ) : (
                                            <>
                                                <Check className="h-4 w-4" />
                                                APPROVE & ACTIVATE RIDER
                                            </>
                                        )}
                                    </button>
                                    <button
                                        onClick={() => handleReject(viewingRider.id)}
                                        className="py-4 px-6 bg-rose-50 text-rose-600 border border-rose-100 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-rose-100 transition-all active:scale-95"
                                    >
                                        REJECT APPLICATION
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Document Image Lightbox Modal */}
            <AnimatePresence>
                {previewDoc && (
                    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 sm:p-8">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 bg-black/80 backdrop-blur-md"
                            onClick={() => setPreviewDoc(null)}
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            className="relative z-10 max-w-4xl w-full bg-white rounded-3xl overflow-hidden shadow-2xl p-4 sm:p-6 space-y-4"
                        >
                            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                                <h3 className="text-base font-black text-slate-900">{previewDoc.name}</h3>
                                <button 
                                    onClick={() => setPreviewDoc(null)}
                                    className="p-2 rounded-full hover:bg-slate-100 transition-colors"
                                >
                                    <X size={20} className="text-slate-600" />
                                </button>
                            </div>
                            <div className="max-h-[75vh] overflow-auto flex items-center justify-center bg-slate-950 rounded-2xl p-2">
                                <img 
                                    src={previewDoc.url} 
                                    alt={previewDoc.name} 
                                    className="max-h-[70vh] w-auto object-contain rounded-xl"
                                />
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default PendingDeliveryBoys;
