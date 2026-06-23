import React, { useState, useEffect, useCallback } from 'react';
import Card from '@shared/components/ui/Card';
import Button from '@shared/components/ui/Button';
import Badge from '@shared/components/ui/Badge';
import { adminApi } from '../services/adminApi';
import { toast } from 'sonner';
import { 
  Activity, 
  LogOut, 
  Search, 
  Building2, 
  Users, 
  Truck, 
  User, 
  ShieldCheck, 
  RefreshCw, 
  Smartphone, 
  Globe, 
  Clock,
  ShieldAlert
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const SessionMonitor = () => {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRole, setSelectedRole] = useState('all'); // all, seller, user, delivery, admin
  const [selectedStatus, setSelectedStatus] = useState('all'); // all, active, logged_out

  // Fetch sessions
  const fetchSessions = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (selectedRole !== 'all') params.role = selectedRole;
      if (selectedStatus !== 'all') params.status = selectedStatus;
      if (searchQuery.trim() !== '') params.search = searchQuery;

      const res = await adminApi.getLoginActivities(params);
      if (res?.data?.success) {
        setSessions(res.data.results || res.data.result || res.data.data || []);
      }
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to fetch sessions');
    } finally {
      setLoading(false);
    }
  }, [selectedRole, selectedStatus, searchQuery]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  // Terminate Session
  const handleTerminateSession = async (id) => {
    if (window.confirm('Are you sure you want to terminate this session? The user will be forced to log in again.')) {
      try {
        const res = await adminApi.terminateSession(id);
        if (res?.data?.success) {
          toast.success('Session terminated successfully');
          fetchSessions();
        }
      } catch (error) {
        toast.error(error?.response?.data?.message || 'Failed to terminate session');
      }
    }
  };

  // Helper to parse User Agent
  const parseUserAgent = (uaString) => {
    if (!uaString) return { device: 'Unknown', browser: 'Unknown' };
    const ua = uaString.toLowerCase();
    
    let device = 'Desktop';
    if (ua.includes('mobi') || ua.includes('android') || ua.includes('iphone')) {
      device = 'Mobile';
    } else if (ua.includes('ipad') || ua.includes('tablet')) {
      device = 'Tablet';
    }

    let browser = 'Other';
    if (ua.includes('firefox')) browser = 'Firefox';
    else if (ua.includes('chrome')) browser = 'Chrome';
    else if (ua.includes('safari')) browser = 'Safari';
    else if (ua.includes('edge')) browser = 'Edge';
    else if (ua.includes('opera')) browser = 'Opera';
    else if (ua.includes('postman')) browser = 'Postman';

    return { device, browser };
  };

  // Helper to get time elapsed
  const getRelativeTime = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  // Determine online status
  const getSessionStatus = (session) => {
    if (session.status === 'logged_out') return 'logged_out';
    
    const lastActive = new Date(session.lastActiveAt);
    const now = new Date();
    const diffMins = Math.floor((now - lastActive) / 60000);
    
    // Active in the last 15 minutes is considered Online
    if (diffMins < 15) return 'online';
    return 'idle';
  };

  // Get statistics
  const getStats = () => {
    const stats = {
      totalActive: 0,
      activeSellers: 0,
      activeCustomers: 0,
      activeDrivers: 0,
      activeAdmins: 0,
    };

    sessions.forEach(session => {
      const status = getSessionStatus(session);
      if (status === 'online') {
        stats.totalActive++;
        if (session.userModel === 'Seller') stats.activeSellers++;
        else if (session.userModel === 'Customer') stats.activeCustomers++;
        else if (session.userModel === 'Delivery') stats.activeDrivers++;
        else if (session.userModel === 'Admin') stats.activeAdmins++;
      }
    });

    return stats;
  };

  const stats = getStats();

  const getRoleBadgeColor = (model) => {
    switch (model) {
      case 'Seller': return 'blue';
      case 'Customer': return 'sky';
      case 'Delivery': return 'emerald';
      case 'Admin': return 'indigo';
      default: return 'neutral';
    }
  };

  return (
    <div className="space-y-6 font-['Outfit',_sans-serif]">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <Activity className="h-8 w-8 text-indigo-600 animate-pulse" />
            Active Sessions
          </h2>
          <p className="text-slate-500 text-sm mt-1">
            Monitor real-time active users and logins across Sellers, Customers, Delivery partners, and Admins.
          </p>
        </div>
        <Button 
          onClick={fetchSessions} 
          disabled={loading}
          className="w-fit flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl py-3 px-5 text-sm font-black shadow-lg shadow-indigo-100 transition-all"
        >
          <RefreshCw className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
          Refresh Activity
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <Card className="border border-slate-100 shadow-sm rounded-3xl p-5 bg-gradient-to-br from-indigo-50 to-white">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-black text-indigo-600 uppercase tracking-wider block">Total Online</span>
              <span className="text-3xl font-black text-slate-950 mt-1 block">{stats.totalActive}</span>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-indigo-100 flex items-center justify-center text-indigo-600">
              <Activity className="h-6 w-6 animate-pulse" />
            </div>
          </div>
          <p className="text-slate-400 text-xs mt-3">Currently making requests on the platform</p>
        </Card>

        <Card className="border border-slate-100 shadow-sm rounded-3xl p-5 bg-gradient-to-br from-blue-50 to-white">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-black text-blue-600 uppercase tracking-wider block">Sellers Online</span>
              <span className="text-3xl font-black text-slate-950 mt-1 block">{stats.activeSellers}</span>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-blue-100 flex items-center justify-center text-blue-600">
              <Building2 className="h-6 w-6" />
            </div>
          </div>
          <p className="text-slate-400 text-xs mt-3">Active store operators online</p>
        </Card>

        <Card className="border border-slate-100 shadow-sm rounded-3xl p-5 bg-gradient-to-br from-sky-50 to-white">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-black text-sky-600 uppercase tracking-wider block">Customers Online</span>
              <span className="text-3xl font-black text-slate-950 mt-1 block">{stats.activeCustomers}</span>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-sky-100 flex items-center justify-center text-sky-600">
              <Users className="h-6 w-6" />
            </div>
          </div>
          <p className="text-slate-400 text-xs mt-3">Active shoppers on application</p>
        </Card>

        <Card className="border border-slate-100 shadow-sm rounded-3xl p-5 bg-gradient-to-br from-emerald-50 to-white">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-black text-emerald-600 uppercase tracking-wider block">Riders Online</span>
              <span className="text-3xl font-black text-slate-950 mt-1 block">{stats.activeDrivers}</span>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-emerald-100 flex items-center justify-center text-emerald-600">
              <Truck className="h-6 w-6" />
            </div>
          </div>
          <p className="text-slate-400 text-xs mt-3">Active delivery boys online</p>
        </Card>
      </div>

      {/* Filters & Search */}
      <Card className="border border-slate-100 shadow-sm rounded-3xl p-5 space-y-4">
        <div className="flex flex-col lg:flex-row gap-4 items-center justify-between">
          
          {/* Search Box */}
          <div className="relative w-full lg:max-w-md">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400">
              <Search className="h-5 w-5" />
            </span>
            <input
              type="text"
              placeholder="Search by Name, Email, or Phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold outline-none focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50 transition-all"
            />
          </div>

          {/* Role Filters */}
          <div className="flex flex-wrap gap-2 w-full lg:w-auto">
            {[
              { id: 'all', label: 'All Users' },
              { id: 'seller', label: 'Sellers' },
              { id: 'user', label: 'Customers' },
              { id: 'delivery', label: 'Delivery' },
              { id: 'admin', label: 'Admins' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setSelectedRole(tab.id)}
                className={`px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider border transition-all ${
                  selectedRole === tab.id
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-100'
                    : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-600'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Status Filters */}
          <div className="flex flex-wrap gap-2 w-full lg:w-auto">
            {[
              { id: 'all', label: 'All Sessions' },
              { id: 'active', label: 'Active Now' },
              { id: 'logged_out', label: 'Logged Out' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setSelectedStatus(tab.id)}
                className={`px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider border transition-all ${
                  selectedStatus === tab.id
                    ? 'bg-slate-900 text-white border-slate-900 shadow-md'
                    : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-600'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

        </div>
      </Card>

      {/* Main Grid / Table */}
      <Card className="overflow-hidden border border-slate-100 shadow-sm rounded-3xl">
        {loading && sessions.length === 0 ? (
          <div className="p-12 text-center text-slate-500 font-medium">Loading session monitoring logs...</div>
        ) : sessions.length === 0 ? (
          <div className="p-16 text-center">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <ShieldAlert className="h-8 w-8 text-slate-400" />
            </div>
            <h3 className="text-lg font-black text-slate-800">No active logins or activities found</h3>
            <p className="text-slate-500 text-sm max-w-sm mx-auto mt-1">
              Refine your filters or search keywords to view logged session records.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="px-6 py-4 text-xs font-black uppercase tracking-wider text-slate-400">User Profile</th>
                  <th className="px-6 py-4 text-xs font-black uppercase tracking-wider text-slate-400">Role</th>
                  <th className="px-6 py-4 text-xs font-black uppercase tracking-wider text-slate-400">Status</th>
                  <th className="px-6 py-4 text-xs font-black uppercase tracking-wider text-slate-400">Device / Browser</th>
                  <th className="px-6 py-4 text-xs font-black uppercase tracking-wider text-slate-400">Network Info</th>
                  <th className="px-6 py-4 text-xs font-black uppercase tracking-wider text-slate-400">Last Activity</th>
                  <th className="px-6 py-4 text-xs font-black uppercase tracking-wider text-slate-400 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sessions.map((session) => {
                  const parsedUa = parseUserAgent(session.userAgent);
                  const sessionStatus = getSessionStatus(session);

                  return (
                    <tr key={session._id} className="hover:bg-slate-50/50 transition-colors">
                      {/* User Profile */}
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center font-black text-slate-700 uppercase">
                            {session.name ? session.name.charAt(0) : 'U'}
                          </div>
                          <div>
                            <span className="font-black text-slate-900 text-sm block">{session.name || 'Anonymous User'}</span>
                            <span className="text-xs text-slate-400 font-medium block">
                              {session.email || session.phone || 'No Contact Info'}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Role */}
                      <td className="px-6 py-5">
                        <Badge variant={getRoleBadgeColor(session.userModel)}>
                          <span className="uppercase font-black text-[10px] tracking-wider">{session.userModel}</span>
                        </Badge>
                      </td>

                      {/* Status */}
                      <td className="px-6 py-5">
                        {sessionStatus === 'online' ? (
                          <div className="flex items-center gap-1.5 text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full w-fit">
                            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
                            <span className="text-[10px] font-black uppercase tracking-wider">Active Now</span>
                          </div>
                        ) : sessionStatus === 'idle' ? (
                          <div className="flex items-center gap-1.5 text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full w-fit">
                            <Clock className="h-3 w-3" />
                            <span className="text-[10px] font-black uppercase tracking-wider">Idle</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-slate-400 bg-slate-100 px-2.5 py-1 rounded-full w-fit">
                            <span className="h-2 w-2 rounded-full bg-slate-400" />
                            <span className="text-[10px] font-black uppercase tracking-wider">Logged Out</span>
                          </div>
                        )}
                      </td>

                      {/* Device / Browser */}
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-2 text-slate-700">
                          {parsedUa.device === 'Mobile' ? (
                            <Smartphone className="h-4 w-4 text-slate-400" />
                          ) : (
                            <Globe className="h-4 w-4 text-slate-400" />
                          )}
                          <span className="text-xs font-semibold">{parsedUa.device} ({parsedUa.browser})</span>
                        </div>
                      </td>

                      {/* Network Info */}
                      <td className="px-6 py-5">
                        <span className="text-xs font-mono font-bold text-slate-500">{session.ipAddress || 'unknown'}</span>
                      </td>

                      {/* Last Activity */}
                      <td className="px-6 py-5">
                        <span className="text-xs font-semibold text-slate-600">{getRelativeTime(session.lastActiveAt)}</span>
                      </td>

                      {/* Actions */}
                      <td className="px-6 py-5 text-right">
                        {sessionStatus !== 'logged_out' && (
                          <button
                            onClick={() => handleTerminateSession(session._id)}
                            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                            title="Force Terminate Session"
                          >
                            <LogOut className="h-5 w-5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};

export default SessionMonitor;
