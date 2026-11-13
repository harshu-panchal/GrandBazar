import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { MapPin, Navigation, Phone, Mail, Package, ShieldCheck, RefreshCw, IndianRupee, Camera, Truck } from 'lucide-react';
import { toast } from 'sonner';
import { openRazorpayCheckout } from '@shared/hooks/useRazorpayCheckout';
import { captureGuestTokenFromUrl, clearGuestToken, guestDeliveryApi } from '../services/guestDeliveryApi';
import GuestNavigationMap from '../components/GuestNavigationMap';

const money = (value) => `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

function currentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Location is not supported on this device'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      () => reject(new Error('Enable location access to continue')),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 },
    );
  });
}

const InfoRow = ({ icon: Icon, label, children }) => (
  <div className="flex gap-3 rounded-2xl border border-slate-100 bg-white p-4">
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-600"><Icon size={17} /></div>
    <div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p><div className="mt-1 text-sm font-bold text-slate-800">{children}</div></div>
  </div>
);

export default function GuestDeliveryPage() {
  const [task, setTask] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [fatal, setFatal] = useState('');
  const [otp, setOtp] = useState('');
  const [completed, setCompleted] = useState(false);
  const [returnProof, setReturnProof] = useState([]);
  const [courierLocation, setCourierLocation] = useState(null);

  const load = useCallback(async () => {
    try {
      captureGuestTokenFromUrl();
      const res = await guestDeliveryApi.getTask();
      setTask(res.data.result);
      setFatal('');
    } catch (error) {
      const status = error.response?.status;
      if (status === 401 || status === 410) clearGuestToken();
      setFatal(error.response?.data?.message || error.message || 'Unable to open this delivery task');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!task || completed || !navigator.geolocation) return undefined;
    const watch = navigator.geolocation.watchPosition(
      (p) => {
        const location = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy, heading: p.coords.heading, speed: p.coords.speed };
        setCourierLocation(location);
        guestDeliveryApi.updateLocation(location).catch(() => {});
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(watch);
  }, [task, completed]);

  const order = task?.order;
  const assignment = task?.assignment;
  const isReturn = assignment?.taskType === 'return_pickup';
  const sellerCoords = order?.seller?.location?.coordinates;
  const sellerLocation = Array.isArray(sellerCoords) ? { lat: sellerCoords[1], lng: sellerCoords[0] } : null;
  const destination = isReturn && ['return_in_transit', 'return_drop_pending'].includes(order?.returnStatus) ? sellerLocation : isReturn ? order?.address?.location : ['OUT_FOR_DELIVERY', 'DELIVERED'].includes(order?.workflowStatus) ? order?.address?.location : sellerLocation;
  const goingToStore = isReturn
    ? ['return_in_transit', 'return_drop_pending'].includes(order?.returnStatus)
    : !['OUT_FOR_DELIVERY', 'DELIVERED'].includes(order?.workflowStatus);
  const destinationLabel = goingToStore
    ? order?.seller?.shopName || order?.seller?.name || 'Pickup store'
    : order?.address?.name || order?.customer?.name || 'Customer';

  const navigate = () => {
    if (destination?.lat == null || destination?.lng == null) return;
    const origin = courierLocation?.lat != null && courierLocation?.lng != null
      ? `&origin=${courierLocation.lat},${courierLocation.lng}`
      : '';
    window.open(`https://www.google.com/maps/dir/?api=1${origin}&destination=${destination.lat},${destination.lng}&travelmode=driving&dir_action=navigate`, '_blank', 'noopener,noreferrer');
  };

  const refreshCourierLocation = async () => {
    try {
      const location = await currentPosition();
      setCourierLocation(location);
      await guestDeliveryApi.updateLocation(location);
      toast.success('Live location refreshed');
    } catch (error) {
      toast.error(error.message || 'Unable to read your location');
    }
  };

  const act = async (key, callback, success, { terminal = false } = {}) => {
    setBusy(key);
    try {
      await callback();
      toast.success(success);
      setOtp('');
      if (terminal) {
        setCompleted(true);
        clearGuestToken();
      } else await load();
    } catch (error) {
      toast.error(error.response?.data?.message || error.message || 'Action failed');
    } finally { setBusy(''); }
  };

  const withLocation = (fn) => async () => fn(await currentPosition());

  const uploadProof = async (files) => {
    setBusy('proof');
    try {
      const urls = [];
      for (const file of Array.from(files).slice(0, 6)) {
        const form = new FormData();
        form.append('file', file);
        const res = await guestDeliveryApi.uploadImage(form);
        urls.push(res.data.result.url);
      }
      setReturnProof(urls);
      await guestDeliveryApi.saveReturnProof({ images: urls, condition: 'good' });
      toast.success('Pickup proof uploaded');
      await load();
    } catch (error) { toast.error(error.response?.data?.message || 'Proof upload failed'); }
    finally { setBusy(''); }
  };

  const payCod = async () => {
    const pending = Number(order?.cashSettlement?.pendingAmount || order?.codAmount || 0);
    setBusy('cod');
    try {
      const res = await guestDeliveryApi.initiateCod(pending);
      const checkout = res.data.result;
      await openRazorpayCheckout({
        razorpayOrderId: checkout.razorpayOrderId,
        amount: checkout.amount,
        currency: checkout.currency,
        keyId: checkout.keyId,
        description: `COD remittance for ${order.orderId}`,
        prefill: { name: assignment.courier.name, email: assignment.courier.email, contact: assignment.courier.phone },
        onSuccess: async (payment) => {
          try { await guestDeliveryApi.verifyCod(payment); toast.success('COD money remitted'); await load(); }
          catch (error) { toast.error(error.response?.data?.message || 'Payment verification failed'); }
          finally { setBusy(''); }
        },
        onFailure: (error) => { toast.error(error.description || 'Payment failed'); setBusy(''); },
        onDismiss: () => setBusy(''),
      });
    } catch (error) { toast.error(error.response?.data?.message || error.message || 'Unable to start payment'); setBusy(''); }
  };

  const action = useMemo(() => {
    if (!order) return null;
    if (isReturn) {
      if (order.returnStatus === 'return_pickup_assigned' && !order.returnPickupImages?.length) return { label: 'Upload pickup proof', renderUpload: true };
      if (order.returnStatus === 'return_pickup_assigned') return { label: 'Request customer OTP', run: () => guestDeliveryApi.requestReturnPickupOtp(), success: 'OTP sent to customer' };
      if (order.returnStatus === 'return_in_transit') return { label: 'Request seller OTP', run: () => guestDeliveryApi.requestReturnDropOtp(), success: 'OTP sent to seller' };
      return null;
    }
    if (order.workflowStatus === 'DELIVERY_ASSIGNED') return { label: 'I arrived at the store', run: withLocation((p) => guestDeliveryApi.arrived(p)), success: 'Arrival recorded' };
    if (order.workflowStatus === 'PICKUP_READY') return { label: 'Waiting for seller handover', disabled: true };
    if (order.workflowStatus === 'HANDED_OVER_TO_LOGISTICS') return { label: 'Confirm package pickup', run: withLocation((p) => guestDeliveryApi.pickup(p)), success: 'Pickup confirmed' };
    if (order.workflowStatus === 'OUT_FOR_DELIVERY' && Number(order.deliveryRiderStep || 0) < 4) return { label: 'I reached the customer', run: () => guestDeliveryApi.advance(), success: 'Progress updated' };
    if (order.workflowStatus === 'OUT_FOR_DELIVERY') return { label: 'Request customer OTP', run: withLocation((p) => guestDeliveryApi.requestDeliveryOtp(p)), success: 'OTP sent to customer' };
    return null;
  }, [order, isReturn]);

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-slate-50"><RefreshCw className="animate-spin text-orange-600" /></div>;
  if (completed) return <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6"><div className="max-w-md rounded-3xl bg-white p-10 text-center shadow-xl"><ShieldCheck className="mx-auto h-16 w-16 text-emerald-500" /><h1 className="mt-5 text-2xl font-black text-slate-900">Task completed</h1><p className="mt-2 text-sm text-slate-500">Access has been revoked. You can close this page.</p></div></div>;
  if (fatal) return <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6"><div className="max-w-md rounded-3xl bg-white p-10 text-center shadow-xl"><ShieldCheck className="mx-auto h-14 w-14 text-rose-500" /><h1 className="mt-5 text-xl font-black">Link unavailable</h1><p className="mt-2 text-sm text-slate-500">{fatal}</p></div></div>;

  const needsOtpEntry = isReturn ? ['return_pickup_assigned', 'return_in_transit', 'return_drop_pending'].includes(order.returnStatus) : order.workflowStatus === 'OUT_FOR_DELIVERY' && Number(order.deliveryRiderStep || 0) >= 4;
  const verifyOtp = isReturn
    ? order.returnStatus === 'return_pickup_assigned' ? () => guestDeliveryApi.verifyReturnPickupOtp(otp) : () => guestDeliveryApi.verifyReturnDropOtp(otp)
    : () => guestDeliveryApi.verifyDeliveryOtp(otp);
  const terminalOtp = !isReturn || ['return_in_transit', 'return_drop_pending'].includes(order.returnStatus);

  return (
    <div className="min-h-screen bg-slate-50 pb-28 text-slate-900">
      <header className="bg-gradient-to-br from-slate-950 via-slate-900 to-orange-950 px-5 pb-8 pt-7 text-white">
        <div className="mx-auto max-w-3xl"><p className="text-[10px] font-black uppercase tracking-[0.25em] text-orange-300">Temporary courier task</p><div className="mt-3 flex items-center justify-between gap-4"><div><h1 className="text-2xl font-black">{isReturn ? 'Return pickup' : 'Order delivery'}</h1><p className="mt-1 text-sm text-slate-300">#{order.shortOrderId || order.orderId}</p></div><Truck className="h-10 w-10 text-orange-400" /></div></div>
      </header>
      <main className="mx-auto -mt-3 max-w-3xl space-y-4 px-4">
        <section className="rounded-3xl bg-white p-5 shadow-lg ring-1 ring-slate-100"><div className="flex items-center gap-3"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-100 text-lg font-black text-orange-700">{assignment.courier.name.charAt(0).toUpperCase()}</div><div><h2 className="font-black">{assignment.courier.name}</h2><p className="text-xs text-slate-500">Assigned guest courier</p></div></div><div className="mt-4 grid gap-2 sm:grid-cols-2"><a href={`tel:${assignment.courier.phone}`} className="rounded-xl bg-slate-50 p-3 text-sm font-bold"><Phone className="mr-2 inline h-4 w-4" />{assignment.courier.phone}</a><a href={`mailto:${assignment.courier.email}`} className="truncate rounded-xl bg-slate-50 p-3 text-sm font-bold"><Mail className="mr-2 inline h-4 w-4" />{assignment.courier.email}</a></div></section>
        <div className="grid gap-4 sm:grid-cols-2"><InfoRow icon={Package} label={isReturn ? 'Pickup from customer' : 'Pickup store'}>{isReturn ? order.address?.name || order.customer?.name : order.seller?.shopName || order.seller?.name}<p className="mt-1 text-xs font-medium text-slate-500">{isReturn ? order.address?.address : order.seller?.address}</p></InfoRow><InfoRow icon={MapPin} label={isReturn ? 'Return to store' : 'Deliver to customer'}>{isReturn ? order.seller?.shopName || order.seller?.name : order.address?.name || order.customer?.name}<p className="mt-1 text-xs font-medium text-slate-500">{isReturn ? order.seller?.address : order.address?.address}</p></InfoRow></div>
        <GuestNavigationMap
          courierLocation={courierLocation}
          destination={destination}
          destinationLabel={destinationLabel}
          destinationKind={goingToStore ? 'store' : 'customer'}
          onRequestLocation={refreshCourierLocation}
          onNavigate={navigate}
        />
        <div className="grid grid-cols-2 gap-3"><a href={`tel:${isReturn ? order.address?.phone || order.customer?.phone : order.seller?.phone}`} className="flex items-center justify-center gap-2 rounded-2xl bg-white p-4 text-sm font-black shadow-sm"><Phone size={17} />Call pickup</a><button onClick={navigate} className="flex items-center justify-center gap-2 rounded-2xl bg-slate-900 p-4 text-sm font-black text-white"><Navigation size={17} />Navigate</button></div>
        {order.paymentMode === 'COD' && !isReturn && order.cashSettlement && Number(order.cashSettlement.pendingAmount) > 0 && <section className="rounded-3xl border border-amber-200 bg-amber-50 p-5"><div className="flex items-center gap-3"><IndianRupee className="text-amber-700" /><div><h3 className="font-black text-amber-950">COD cash to submit</h3><p className="text-sm text-amber-800">{money(order.cashSettlement.pendingAmount)} due to admin</p></div></div><button disabled={busy === 'cod'} onClick={payCod} className="mt-4 w-full rounded-2xl bg-amber-700 py-3 text-sm font-black text-white disabled:opacity-50">{busy === 'cod' ? 'Opening payment…' : 'Pay online now'}</button><p className="mt-2 text-xs text-amber-700">You may also hand over physical cash to an administrator for a recorded receipt.</p></section>}
        {action?.renderUpload ? <label className="flex cursor-pointer flex-col items-center rounded-3xl border-2 border-dashed border-orange-200 bg-orange-50 p-8 text-orange-700"><Camera className="h-8 w-8" /><span className="mt-3 text-sm font-black">{busy === 'proof' ? 'Uploading…' : 'Take or upload pickup photos'}</span><input type="file" accept="image/*" capture="environment" multiple className="hidden" disabled={busy === 'proof'} onChange={(e) => uploadProof(e.target.files)} /></label> : action && <button disabled={busy || action.disabled} onClick={() => act('action', action.run, action.success)} className="w-full rounded-2xl bg-orange-600 py-4 text-sm font-black text-white shadow-lg disabled:bg-slate-300">{busy === 'action' ? 'Please wait…' : action.label}</button>}
        {needsOtpEntry && <section className="rounded-3xl bg-white p-5 shadow-sm"><h3 className="font-black">Enter the 4-digit OTP</h3><p className="mt-1 text-xs text-slate-500">Request the code first, then ask {isReturn && order.returnStatus !== 'return_pickup_assigned' ? 'the seller' : 'the customer'} for it.</p><div className="mt-4 flex gap-3"><input value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" className="min-w-0 flex-1 rounded-2xl border border-slate-200 px-4 text-center text-xl font-black tracking-[0.4em] outline-none focus:border-orange-500" placeholder="0000" /><button disabled={otp.length !== 4 || busy === 'otp'} onClick={() => act('otp', verifyOtp, terminalOtp ? 'Task completed' : 'Pickup verified', { terminal: terminalOtp })} className="rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-black text-white disabled:opacity-40">Verify</button></div></section>}
      </main>
    </div>
  );
}
