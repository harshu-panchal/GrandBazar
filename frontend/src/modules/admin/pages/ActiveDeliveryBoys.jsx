import React, { useState, useMemo } from 'react';
import Card from '@shared/components/ui/Card';
import Badge from '@shared/components/ui/Badge';
import {
    Users,
    UserCheck,
    Activity,
    Trophy,
    Search,
    Filter,
    Plus,
    MoreVertical,
    Phone,
    MapPin,
    Truck,
    User,
    Star,
    DollarSign,
    ShieldCheck,
    XCircle,
    Pencil,
    Trash2,
    Eye,
    X,
    Mail,
    CreditCard,
    Home,
    ExternalLink,
    Maximize2,
    FileText,
    FileSearch,
    Calendar
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import Pagination from '@shared/components/ui/Pagination';
import { adminApi } from '../services/adminApi';

const ActiveDeliveryBoys = () => {
    const [riders, setRiders] = useState([]);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(25);
    const [total, setTotal] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [selectedRider, setSelectedRider] = useState(null);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isOnboardModalOpen, setIsOnboardModalOpen] = useState(false);
    const [viewingRider, setViewingRider] = useState(null);
    const [previewDoc, setPreviewDoc] = useState(null);

    // Form states for all registration details
    const [formState, setFormState] = useState({
        name: '',
        phone: '',
        email: '',
        address: '',
        vehicle: 'bike',
        vehicleNum: '',
        drivingLicenseNumber: '',
        accountHolder: '',
        accountNumber: '',
        ifsc: '',
        location: ''
    });

    // Fetch Riders
    const fetchRiders = async (requestedPage = 1) => {
        setIsLoading(true);
        try {
            const params = { page: requestedPage, limit: pageSize };
            if (searchTerm.trim()) params.search = searchTerm.trim();
            if (statusFilter !== 'all') params.status = statusFilter;

            const response = await adminApi.getDeliveryPartners(params);
            const payload = response.data.result || {};
            const data = Array.isArray(payload.items) ? payload.items : (response.data.results || response.data.result || []);

            const mappedRiders = data.map(r => {
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
                    status: r.isOnline ? 'available' : 'offline',
                    vehicle: r.vehicleType || 'bike',
                    vehicleNum: r.vehicleNumber || 'N/A',
                    drivingLicenseNumber: r.drivingLicenseNumber || 'Not Specified',
                    accountHolder: r.accountHolder || 'Not Specified',
                    accountNumber: r.accountNumber || 'Not Specified',
                    ifsc: r.ifsc || 'Not Specified',
                    profileImage: r.profileImage || r.avatar || '',
                    documentsList: docsList,
                    documents: docsList.map(d => d.name),
                    rating: 4.8,
                    totalOrders: 24,
                    todayEarnings: 850,
                    location: (r.currentArea && r.currentArea !== 'Unknown') ? r.currentArea : (r.city || r.address || 'Main City'),
                    lastSync: 'Just now',
                    joinDate: r.createdAt ? new Date(r.createdAt).toLocaleDateString() : 'N/A',
                    raw: r
                };
            });

            setRiders(mappedRiders);
            setTotal(typeof payload.total === 'number' ? payload.total : mappedRiders.length);
            setPage(typeof payload.page === 'number' ? payload.page : requestedPage);
        } catch (error) {
            console.error('Fetch Riders Error:', error);
            toast.error('Failed to fetch delivery partners');
        } finally {
            setIsLoading(false);
        }
    };

    React.useEffect(() => {
        const timer = setTimeout(() => {
            fetchRiders(1);
        }, 500);
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pageSize, searchTerm, statusFilter]);

    // Filtering logic
    const filteredRiders = useMemo(() => {
        return riders.filter(r => {
            const matchesSearch = r.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                r.phone.includes(searchTerm);
            const matchesStatus = statusFilter === 'all' || r.status === statusFilter;
            return matchesSearch && matchesStatus;
        });
    }, [riders, searchTerm, statusFilter]);

    const handleAction = (type, rider) => {
        if (type === 'view') {
            setViewingRider(rider);
        } else if (type === 'edit') {
            setFormState({
                name: rider.name || '',
                phone: rider.phone || '',
                email: rider.email || '',
                address: rider.address || '',
                vehicle: rider.vehicle || 'bike',
                vehicleNum: rider.vehicleNum === 'N/A' ? '' : (rider.vehicleNum || ''),
                drivingLicenseNumber: rider.drivingLicenseNumber === 'Not Specified' ? '' : (rider.drivingLicenseNumber || ''),
                accountHolder: rider.accountHolder === 'Not Specified' ? '' : (rider.accountHolder || ''),
                accountNumber: rider.accountNumber === 'Not Specified' ? '' : (rider.accountNumber || ''),
                ifsc: rider.ifsc === 'Not Specified' ? '' : (rider.ifsc || ''),
                location: rider.location === 'Unknown' ? '' : (rider.location || '')
            });
            setSelectedRider(rider);
            setIsEditModalOpen(true);
        } else if (type === 'delete') {
            if (window.confirm(`Are you sure you want to deactivate ${rider.name}?`)) {
                setRiders(riders.filter(r => r.id !== rider.id));
            }
        }
    };

    const handleOnboardSubmit = (e) => {
        e.preventDefault();
        const newRider = {
            ...formState,
            id: 'r' + (riders.length + 1),
            status: 'offline',
            rating: 5.0,
            totalOrders: 0,
            todayEarnings: 0,
            lastSync: 'Just now',
            joinDate: new Date().toLocaleDateString(),
            documentsList: []
        };
        setRiders([newRider, ...riders]);
        setIsOnboardModalOpen(false);
        setFormState({
            name: '', phone: '', email: '', address: '', vehicle: 'bike', vehicleNum: '', drivingLicenseNumber: '', accountHolder: '', accountNumber: '', ifsc: '', location: ''
        });
        toast.success('New delivery partner registered!');
    };

    const handleEditSubmit = async (e) => {
        e.preventDefault();
        try {
            if (selectedRider?.id) {
                await adminApi.updateDeliveryPartner(selectedRider.id, {
                    name: formState.name,
                    phone: formState.phone,
                    email: formState.email,
                    address: formState.address,
                    vehicleType: formState.vehicle,
                    vehicleNumber: formState.vehicleNum,
                    drivingLicenseNumber: formState.drivingLicenseNumber,
                    accountHolder: formState.accountHolder,
                    accountNumber: formState.accountNumber,
                    ifsc: formState.ifsc,
                    currentArea: formState.location
                });
            }
            setRiders(riders.map(r => r.id === selectedRider?.id ? { ...r, ...formState } : r));
            toast.success('Rider details saved successfully!');
            setIsEditModalOpen(false);
            setSelectedRider(null);
            fetchRiders(page);
        } catch (error) {
            console.error('Update Rider Error:', error);
            toast.error('Failed to save rider details');
        }
    };

    const stats = [
        { label: 'Total Riders', value: riders.length, color: 'indigo', icon: Users, description: 'Total fleet size' },
        { label: 'Available', value: riders.filter(r => r.status === 'available').length, color: 'emerald', icon: UserCheck, description: 'Ready for orders' },
        { label: 'Busy (On Task)', value: riders.filter(r => r.status === 'busy').length, color: 'amber', icon: Activity, description: 'Currently delivering' },
        { label: 'Top Earners', value: riders.filter(r => r.rating >= 4.5).length, color: 'rose', icon: Trophy, description: 'High performance' },
    ];

    return (
        <div className="ds-section-spacing animate-in fade-in duration-700">
            {/* Header Section */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                <div>
                    <h1 className="ds-h1 flex items-center gap-3">
                        Delivery Partners
                        <div className="h-2 w-2 rounded-full bg-brand-500 animate-pulse" />
                    </h1>
                    <p className="ds-description mt-1">Manage all active delivery fleet partners.</p>
                </div>
                <button
                    onClick={() => {
                        setFormState({ name: '', phone: '', email: '', address: '', vehicle: 'bike', vehicleNum: '', drivingLicenseNumber: '', accountHolder: '', accountNumber: '', ifsc: '', location: '' });
                        setIsOnboardModalOpen(true);
                    }}
                    className="flex items-center space-x-2 bg-slate-900 text-white px-6 py-3.5 rounded-2xl text-xs font-bold hover:bg-slate-800 transition-all shadow-xl hover:shadow-slate-200 active:scale-95 group"
                >
                    <Plus className="h-4 w-4 group-hover:rotate-90 transition-transform" />
                    <span>ADD NEW RIDER</span>
                </button>
            </div>

            {/* Quick Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {stats.map((stat, idx) => (
                    <Card key={idx} className="p-6 border-none shadow-xl ring-1 ring-slate-100 hover:ring-primary/20 transition-all group overflow-hidden relative">
                        <div className="flex justify-between items-start relative z-10">
                            <div>
                                <p className="ds-label mb-2">{stat.label}</p>
                                <h3 className="ds-stat-medium">{stat.value}</h3>
                            </div>
                            <div className="h-12 w-12 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-700 shadow-sm group-hover:scale-110 transition-transform">
                                <stat.icon className="h-6 w-6" />
                            </div>
                        </div>
                    </Card>
                ))}
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
                </div>
            </Card>

            {/* Main Table */}
            <Card className="border-none shadow-2xl ring-1 ring-slate-100 overflow-hidden bg-white rounded-xl relative min-h-[400px]">
                {isLoading && (
                    <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/50 backdrop-blur-sm">
                        <div className="flex flex-col items-center gap-3">
                            <div className="h-10 w-10 border-4 border-slate-200 border-t-primary rounded-full animate-spin" />
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Loading Delivery Fleet...</p>
                        </div>
                    </div>
                )}
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50/50 border-b border-slate-100">
                                <th className="ds-table-header-cell px-4">Rider Info</th>
                                <th className="ds-table-header-cell px-4">Vehicle & License</th>
                                <th className="ds-table-header-cell px-4">Bank Payout Info</th>
                                <th className="ds-table-header-cell px-4">Operating Area</th>
                                <th className="ds-table-header-cell px-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {filteredRiders.map((rider) => (
                                <tr key={rider.id} className="hover:bg-slate-50/80 transition-colors">
                                    <td className="p-4">
                                        <div className="flex items-center gap-3">
                                            <img
                                                src={rider.profileImage || "https://cdn-icons-png.flaticon.com/512/149/149071.png"}
                                                alt={rider.name}
                                                className="h-10 w-10 rounded-2xl bg-slate-100 object-cover border border-slate-200"
                                            />
                                            <div>
                                                <h4 className="text-sm font-black text-slate-900">{rider.name}</h4>
                                                <p className="text-xs font-semibold text-slate-500">{rider.phone}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="p-4">
                                        <div className="space-y-0.5">
                                            <p className="text-xs font-bold text-slate-900 uppercase flex items-center gap-1">
                                                <Truck size={12} className="text-brand-600" />
                                                {rider.vehicle}
                                            </p>
                                            <p className="text-[11px] font-mono text-brand-700 font-bold">{rider.vehicleNum}</p>
                                            <p className="text-[10px] text-slate-400 font-medium">DL: {rider.drivingLicenseNumber}</p>
                                        </div>
                                    </td>
                                    <td className="p-4">
                                        <div className="space-y-0.5">
                                            <p className="text-xs font-bold text-slate-900">{rider.accountHolder}</p>
                                            <p className="text-[11px] font-mono text-indigo-700 font-bold">A/C: {rider.accountNumber}</p>
                                            <p className="text-[10px] text-slate-400 font-medium">IFSC: {rider.ifsc}</p>
                                        </div>
                                    </td>
                                    <td className="p-4">
                                        <div className="flex items-center gap-1.5 text-slate-700 text-xs font-bold">
                                            <MapPin size={13} className="text-slate-400" />
                                            <span>{rider.location}</span>
                                        </div>
                                    </td>
                                    <td className="p-4 text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            <button
                                                onClick={() => handleAction('view', rider)}
                                                className="p-2 hover:bg-slate-100 rounded-xl text-slate-600 transition-colors"
                                                title="View Rider Intel"
                                            >
                                                <Eye size={16} />
                                            </button>
                                            <button
                                                onClick={() => handleAction('edit', rider)}
                                                className="p-2 hover:bg-brand-50 rounded-xl text-brand-600 transition-colors"
                                                title="Edit Registration Details"
                                            >
                                                <Pencil size={16} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <Pagination
                    currentPage={page}
                    pageSize={pageSize}
                    totalItems={total}
                    onPageChange={(newPage) => fetchRiders(newPage)}
                    onPageSizeChange={(newSize) => setPageSize(newSize)}
                />
            </Card>

            {/* View Rider Modal */}
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
                            className="w-full max-w-4xl relative z-10 bg-white rounded-[36px] shadow-3xl overflow-hidden flex flex-col lg:flex-row my-auto max-h-[92vh]"
                        >
                            {/* Left Header */}
                            <div className="lg:w-72 bg-slate-50 p-6 border-r border-slate-100 flex flex-col justify-between shrink-0 overflow-y-auto">
                                <div className="space-y-6">
                                    <div className="text-center">
                                        <img
                                            src={viewingRider.profileImage || "https://cdn-icons-png.flaticon.com/512/149/149071.png"}
                                            alt={viewingRider.name}
                                            className="h-24 w-24 rounded-3xl bg-white shadow-xl object-cover ring-4 ring-white mx-auto mb-3"
                                        />
                                        <h3 className="text-lg font-black text-slate-900">{viewingRider.name}</h3>
                                        <p className="text-xs font-bold text-brand-600 mt-0.5">Active Fleet Partner</p>
                                    </div>

                                    <div className="space-y-3 pt-4 border-t border-slate-200/60 text-xs font-medium">
                                        <div>
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Join Date</p>
                                            <p className="font-bold text-slate-800">{viewingRider.joinDate}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Assigned Area</p>
                                            <p className="font-bold text-slate-800">{viewingRider.location}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Home Address</p>
                                            <p className="font-semibold text-slate-700 leading-snug">{viewingRider.address}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Right Info */}
                            <div className="flex-1 p-6 lg:p-8 bg-white overflow-y-auto space-y-6">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <h2 className="text-xl font-black text-slate-900">Rider Registration Profile</h2>
                                        <p className="text-xs text-slate-500 font-medium">Complete registered credentials and documents.</p>
                                    </div>
                                    <button onClick={() => setViewingRider(null)} className="p-2 hover:bg-slate-100 rounded-2xl transition-colors">
                                        <X size={20} className="text-slate-500" />
                                    </button>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-2">
                                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                                            <Phone size={12} className="text-primary" /> Contact Details
                                        </h4>
                                        <p className="text-xs font-black text-slate-900">{viewingRider.phone}</p>
                                        <p className="text-[11px] font-semibold text-slate-600 truncate">{viewingRider.email}</p>
                                    </div>

                                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-2">
                                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                                            <Truck size={12} className="text-brand-600" /> Vehicle & License
                                        </h4>
                                        <p className="text-xs font-black text-slate-900 uppercase">{viewingRider.vehicle}</p>
                                        <p className="text-[11px] font-mono text-brand-700 font-bold">Plate: {viewingRider.vehicleNum}</p>
                                        <p className="text-[11px] font-mono text-slate-700 font-medium">DL: {viewingRider.drivingLicenseNumber}</p>
                                    </div>

                                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-2">
                                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                                            <CreditCard size={12} className="text-indigo-600" /> Bank Payout Info
                                        </h4>
                                        <p className="text-xs font-black text-slate-900">{viewingRider.accountHolder}</p>
                                        <p className="text-[11px] font-mono text-indigo-700 font-bold">A/C: {viewingRider.accountNumber}</p>
                                        <p className="text-[10px] font-mono text-slate-600">IFSC: {viewingRider.ifsc}</p>
                                    </div>
                                </div>

                                {/* Submitted Legal Documents */}
                                {viewingRider.documentsList && viewingRider.documentsList.length > 0 && (
                                    <div className="space-y-3">
                                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                            Identity Documents ({viewingRider.documentsList.length})
                                        </h4>
                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                            {viewingRider.documentsList.map((doc, idx) => (
                                                <div
                                                    key={idx}
                                                    onClick={() => setPreviewDoc(doc)}
                                                    className="p-3 bg-slate-50 rounded-2xl border border-slate-200 cursor-pointer hover:border-brand-500 transition-all flex flex-col justify-between"
                                                >
                                                    <span className="text-xs font-bold text-slate-900 uppercase">{doc.name}</span>
                                                    {doc.url ? (
                                                        <img src={doc.url} alt={doc.name} className="h-24 w-full object-cover rounded-xl mt-2" />
                                                    ) : (
                                                        <div className="h-20 w-full bg-slate-200 rounded-xl flex items-center justify-center mt-2">
                                                            <FileSearch size={20} className="text-slate-400" />
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Onboard / Edit Rider Modal */}
            <AnimatePresence>
                {(isOnboardModalOpen || isEditModalOpen) && (
                    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 overflow-y-auto">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 bg-slate-900/60 backdrop-blur-lg"
                            onClick={() => {
                                setIsOnboardModalOpen(false);
                                setIsEditModalOpen(false);
                            }}
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="w-full max-w-2xl relative z-[120] bg-white rounded-3xl p-6 sm:p-8 shadow-3xl my-auto max-h-[92vh] overflow-y-auto"
                        >
                            <div className="flex justify-between items-start mb-4">
                                <div>
                                    <h3 className="text-xl font-black text-slate-900">
                                        {isEditModalOpen ? 'Edit Rider Credentials' : 'Add New Delivery Partner'}
                                    </h3>
                                    <p className="text-xs text-slate-500 font-medium mt-0.5">
                                        {isEditModalOpen ? 'Update all registered details for this delivery partner below.' : 'Enter full registration details to add a new delivery partner.'}
                                    </p>
                                </div>
                                <button
                                    onClick={() => {
                                        setIsOnboardModalOpen(false);
                                        setIsEditModalOpen(false);
                                    }}
                                    className="p-2 hover:bg-slate-100 rounded-xl transition-colors"
                                >
                                    <X size={20} className="text-slate-500" />
                                </button>
                            </div>

                            <form onSubmit={isEditModalOpen ? handleEditSubmit : handleOnboardSubmit} className="space-y-4">
                                {/* Section 1: Identity & Contact */}
                                <div className="space-y-3 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Personal & Contact Info</h4>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Full Identity Name</label>
                                            <input
                                                required
                                                type="text"
                                                value={formState.name}
                                                onChange={(e) => setFormState({ ...formState, name: e.target.value })}
                                                className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-primary/20"
                                                placeholder="Full Name"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Secure Contact Mobile</label>
                                            <input
                                                required
                                                type="text"
                                                value={formState.phone}
                                                onChange={(e) => setFormState({ ...formState, phone: e.target.value })}
                                                className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-primary/20"
                                                placeholder="Mobile Number"
                                            />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Email Address</label>
                                            <input
                                                type="email"
                                                value={formState.email}
                                                onChange={(e) => setFormState({ ...formState, email: e.target.value })}
                                                className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-primary/20"
                                                placeholder="Email Address"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Assigned Operational Area</label>
                                            <input
                                                type="text"
                                                value={formState.location}
                                                onChange={(e) => setFormState({ ...formState, location: e.target.value })}
                                                className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-primary/20"
                                                placeholder="Operating City / Area"
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Full Residential Address</label>
                                        <input
                                            type="text"
                                            value={formState.address}
                                            onChange={(e) => setFormState({ ...formState, address: e.target.value })}
                                            className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-primary/20"
                                            placeholder="Full Home Address"
                                        />
                                    </div>
                                </div>

                                {/* Section 2: Vehicle & Driving License */}
                                <div className="space-y-3 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Vehicle & License Details</h4>
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Work Vehicle</label>
                                            <select
                                                required
                                                value={formState.vehicle}
                                                onChange={(e) => setFormState({ ...formState, vehicle: e.target.value })}
                                                className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-primary/20"
                                            >
                                                <option value="bike">Bike</option>
                                                <option value="scooter">Electric Scooter</option>
                                                <option value="cycle">Cycle</option>
                                                <option value="auto">Auto / Van</option>
                                            </select>
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Registration Vehicle No.</label>
                                            <input
                                                type="text"
                                                value={formState.vehicleNum}
                                                onChange={(e) => setFormState({ ...formState, vehicleNum: e.target.value.toUpperCase() })}
                                                className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold font-mono outline-none focus:ring-2 focus:ring-primary/20"
                                                placeholder="e.g. KA 05 MN 8921"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Driving License No.</label>
                                            <input
                                                type="text"
                                                value={formState.drivingLicenseNumber}
                                                onChange={(e) => setFormState({ ...formState, drivingLicenseNumber: e.target.value.toUpperCase() })}
                                                className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold font-mono outline-none focus:ring-2 focus:ring-primary/20"
                                                placeholder="DL Number"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Section 3: Bank Payout Info */}
                                <div className="space-y-3 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Bank Account Payout Details</h4>
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Account Holder Name</label>
                                            <input
                                                type="text"
                                                value={formState.accountHolder}
                                                onChange={(e) => setFormState({ ...formState, accountHolder: e.target.value })}
                                                className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-primary/20"
                                                placeholder="Holder Name"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Account Number</label>
                                            <input
                                                type="text"
                                                value={formState.accountNumber}
                                                onChange={(e) => setFormState({ ...formState, accountNumber: e.target.value })}
                                                className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold font-mono outline-none focus:ring-2 focus:ring-primary/20"
                                                placeholder="Account Number"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">IFSC Code</label>
                                            <input
                                                type="text"
                                                value={formState.ifsc}
                                                onChange={(e) => setFormState({ ...formState, ifsc: e.target.value.toUpperCase() })}
                                                className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold font-mono outline-none focus:ring-2 focus:ring-primary/20"
                                                placeholder="IFSC Code"
                                            />
                                        </div>
                                    </div>
                                </div>

                                <button 
                                    type="submit" 
                                    className="w-full py-4 bg-slate-900 text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-xl hover:bg-black transition-all active:scale-[0.98]"
                                >
                                    {isEditModalOpen ? 'SAVE RIDER CHANGES' : 'ADD NEW RIDER'}
                                </button>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Document Image Lightbox Modal */}
            <AnimatePresence>
                {previewDoc && (
                    <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 sm:p-8">
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

export default ActiveDeliveryBoys;
