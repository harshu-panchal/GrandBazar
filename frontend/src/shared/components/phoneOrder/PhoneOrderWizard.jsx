import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Card from '@shared/components/ui/Card';
import Button from '@shared/components/ui/Button';
import Input from '@shared/components/ui/Input';
import { useToast } from '@shared/components/ui/Toast';
import DeliverySlotPicker from '@/modules/customer/components/checkout/DeliverySlotPicker';
import {
    Phone,
    Search,
    ShoppingCart,
    Plus,
    Minus,
    Trash2,
    MapPin,
    Mail,
    MessageSquare,
    CheckCircle2,
    Copy,
    ArrowLeft,
    Clock,
    CalendarClock,
} from 'lucide-react';

const STEPS = ['Find Customer', 'Find Products', 'Review', 'Send Link'];
const SEARCH_DEBOUNCE_MS = 350;

const priceOf = (p) => Number(p.customerSalePrice ?? p.customerPrice ?? p.salePrice ?? p.price ?? 0);

/**
 * Shared "create order on behalf of a customer during a phone call" wizard,
 * used by both the admin panel (any store) and the seller panel (own store
 * only) — the only difference between the two is which API functions are
 * wired in, since the backend already scopes/restricts appropriately on
 * its end (admin: unrestricted; seller: product search is pre-scoped to
 * their own store, and the create-order endpoint re-validates item
 * ownership server-side regardless of what this UI sends).
 *
 * Items are sent to the backend as DIRECT_ITEMS (not via the customer's own
 * cart). The backend rejects a cart spanning more than one store, so this
 * UI locks the active shop to whichever store the first cart item came
 * from and blocks adding a different store's item client-side. The order
 * is placed with paymentMode forced to ONLINE server-side; it only becomes
 * visible to the seller once the customer pays via the generated link.
 *
 * @param {(phone: string) => Promise} lookupCustomerByPhone
 * @param {(params: { search: string, limit: number }) => Promise} searchProducts
 * @param {(params: object) => Promise} getDeliverySlots - passed through to DeliverySlotPicker's apiFn
 * @param {(payload: object) => Promise} createOrder
 * @param {string} doneRoute - where "Done" navigates after sending the link
 */
const PhoneOrderWizard = ({ lookupCustomerByPhone, searchProducts, getDeliverySlots, createOrder, doneRoute }) => {
    const navigate = useNavigate();
    const { showToast } = useToast();

    const [step, setStep] = useState(0);
    const [submitting, setSubmitting] = useState(false);

    // Step 1: customer
    const [phoneInput, setPhoneInput] = useState('');
    const [lookupLoading, setLookupLoading] = useState(false);
    const [lookupError, setLookupError] = useState('');
    const [customer, setCustomer] = useState(null);

    // Step 2: products
    const [productQuery, setProductQuery] = useState('');
    const [productResults, setProductResults] = useState([]);
    const [productSearchLoading, setProductSearchLoading] = useState(false);
    const [productSearchError, setProductSearchError] = useState('');
    const [cart, setCart] = useState([]); // [{ product, name, price, quantity, image, sellerId, shopName }]
    const searchDebounceRef = useRef(null);

    // Step 3: review
    const [selectedAddressIdx, setSelectedAddressIdx] = useState(0);
    const [useManualAddress, setUseManualAddress] = useState(false);
    const [manualAddress, setManualAddress] = useState({
        label: 'other',
        address: '',
        city: '',
        state: '',
        landmark: '',
    });
    const [fulfillmentType, setFulfillmentType] = useState('instant');
    const [scheduleSelection, setScheduleSelection] = useState({
        fulfillmentType: 'instant',
        timeSlot: 'now',
        deliveryDate: null,
        windowLabel: null,
    });

    // Step 4: send
    const [notifyVia, setNotifyVia] = useState(['sms']);
    const [result, setResult] = useState(null);

    const resetAfterCustomerChange = () => {
        setProductQuery('');
        setProductResults([]);
        setProductSearchError('');
        setCart([]);
        setSelectedAddressIdx(0);
        setUseManualAddress(false);
        setManualAddress({ label: 'other', address: '', city: '', state: '', landmark: '' });
        setFulfillmentType('instant');
        setScheduleSelection({ fulfillmentType: 'instant', timeSlot: 'now', deliveryDate: null, windowLabel: null });
    };

    const handleLookupCustomer = async (e) => {
        e.preventDefault();
        const phone = phoneInput.trim();
        if (!phone) return;
        setLookupLoading(true);
        setLookupError('');
        setCustomer(null);
        try {
            const res = await lookupCustomerByPhone(phone);
            const found = res?.data?.result?.customer;
            if (!found) throw new Error('No account found for this phone number');
            setCustomer(found);
            resetAfterCustomerChange();
            setStep(1);
        } catch (err) {
            setLookupError(
                err?.response?.data?.message ||
                    err?.message ||
                    'No account found for this phone number. Ask the customer to sign up first.',
            );
        } finally {
            setLookupLoading(false);
        }
    };

    // Derived, not stored separately — the locked store is whichever store
    // the first cart item belongs to. Once the cart is empty, any store's
    // products can be added again.
    const lockedStore = cart[0] ? { id: cart[0].sellerId, shopName: cart[0].shopName } : null;

    const handleProductSearch = (query) => {
        setProductQuery(query);
        if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
        if (!query.trim()) {
            setProductResults([]);
            return;
        }
        searchDebounceRef.current = setTimeout(async () => {
            setProductSearchLoading(true);
            try {
                const res = await searchProducts({ search: query, limit: 20 });
                setProductResults(res?.data?.result?.items || []);
            } catch {
                setProductResults([]);
            } finally {
                setProductSearchLoading(false);
            }
        }, SEARCH_DEBOUNCE_MS);
    };

    const addToCart = (product) => {
        const productSellerId = product.sellerId?._id || product.sellerId || '';
        const productShopName = product.sellerId?.shopName || '';

        if (lockedStore && String(productSellerId) !== String(lockedStore.id)) {
            setProductSearchError(
                `This cart already has items from ${lockedStore.shopName}. Remove them first to add items from a different shop.`,
            );
            return;
        }
        setProductSearchError('');

        setCart((prev) => {
            const existing = prev.find((i) => i.product === product._id);
            if (existing) {
                return prev.map((i) =>
                    i.product === product._id ? { ...i, quantity: i.quantity + 1 } : i,
                );
            }
            return [
                ...prev,
                {
                    product: product._id,
                    name: product.name,
                    price: priceOf(product),
                    quantity: 1,
                    image: product.mainImage || '',
                    sellerId: productSellerId,
                    shopName: productShopName,
                },
            ];
        });
    };

    const updateQty = (productId, delta) => {
        setCart((prev) =>
            prev
                .map((i) => (i.product === productId ? { ...i, quantity: i.quantity + delta } : i))
                .filter((i) => i.quantity > 0),
        );
    };

    const removeFromCart = (productId) => {
        setCart((prev) => prev.filter((i) => i.product !== productId));
    };

    const clearCart = () => {
        setCart([]);
        setProductSearchError('');
    };

    const cartTotal = cart.reduce((sum, i) => sum + i.price * i.quantity, 0);

    const addresses = customer?.addresses || [];
    const selectedAddress = addresses[selectedAddressIdx] || null;
    // Either a saved address picked from the list, or one typed in by hand
    // for this order only (not saved back to the customer's profile) —
    // the operator isn't required to use only what's on file.
    const effectiveAddress = useManualAddress
        ? {
              label: manualAddress.label,
              fullAddress: manualAddress.address.trim(),
              city: manualAddress.city,
              state: manualAddress.state,
              landmark: manualAddress.landmark,
              location: null,
          }
        : selectedAddress;
    const isManualAddressValid = !useManualAddress || manualAddress.address.trim().length > 0;

    const toggleNotifyVia = (channel) => {
        setNotifyVia((prev) =>
            prev.includes(channel) ? prev.filter((c) => c !== channel) : [...prev, channel],
        );
    };

    const handleFulfillmentToggle = (type) => {
        setFulfillmentType(type);
        if (type === 'instant') {
            setScheduleSelection({ fulfillmentType: 'instant', timeSlot: 'now', deliveryDate: null, windowLabel: null });
        }
    };

    const handleSubmit = async () => {
        if (!customer || !effectiveAddress || !isManualAddressValid || cart.length === 0 || notifyVia.length === 0) return;
        if (fulfillmentType === 'scheduled' && (!scheduleSelection.deliveryDate || !scheduleSelection.windowLabel)) {
            showToast('Pick a delivery date and window before continuing', 'error');
            return;
        }
        setSubmitting(true);
        try {
            const payload = {
                customerPhone: customer.phone,
                items: cart.map((i) => ({
                    product: i.product,
                    quantity: i.quantity,
                })),
                address: {
                    type: effectiveAddress.label,
                    name: customer.name,
                    address: effectiveAddress.fullAddress,
                    city: effectiveAddress.city,
                    state: effectiveAddress.state,
                    phone: customer.phone,
                    landmark: effectiveAddress.landmark,
                    location: effectiveAddress.location,
                },
                notifyVia,
                fulfillmentType: scheduleSelection.fulfillmentType,
                timeSlot: scheduleSelection.timeSlot,
                deliveryDate: scheduleSelection.deliveryDate,
                windowLabel: scheduleSelection.windowLabel,
            };
            const res = await createOrder(payload);
            setResult(res?.data?.result);
            setStep(3);
            showToast('Phone order created and payment link sent', 'success');
        } catch (err) {
            showToast(
                err?.response?.data?.message || err?.message || 'Failed to create phone order',
                'error',
            );
        } finally {
            setSubmitting(false);
        }
    };

    const handleCopyLink = async () => {
        if (!result?.paymentLinkUrl) return;
        try {
            await navigator.clipboard.writeText(result.paymentLinkUrl);
            showToast('Link copied to clipboard', 'success');
        } catch {
            showToast('Could not copy link', 'error');
        }
    };

    return (
        <div className="ds-section-spacing animate-in fade-in slide-in-from-bottom-4 duration-700 pb-12">
            <div className="flex items-center gap-4 px-1">
                <button
                    onClick={() => navigate(doneRoute)}
                    className="p-2 rounded-xl bg-slate-50 text-slate-500 hover:text-slate-700 transition-all"
                >
                    <ArrowLeft className="h-4 w-4" />
                </button>
                <div>
                    <h1 className="ds-h1 flex items-center gap-3">
                        Create Phone Order
                        <div className="p-2 bg-fuchsia-100 rounded-xl">
                            <Phone className="h-5 w-5 text-fuchsia-600" />
                        </div>
                    </h1>
                    <p className="ds-description mt-1">
                        Place an order on behalf of a customer calling in. They'll receive a payment
                        link — the order is only confirmed to the seller once they pay.
                    </p>
                </div>
            </div>

            <div className="flex items-center gap-2 px-1">
                {STEPS.map((label, idx) => (
                    <div key={label} className="flex items-center gap-2">
                        <div
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold ${
                                idx === step
                                    ? 'bg-fuchsia-600 text-white'
                                    : idx < step
                                      ? 'bg-emerald-50 text-emerald-600'
                                      : 'bg-slate-50 text-slate-400'
                            }`}
                        >
                            {idx < step ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}
                            {label}
                        </div>
                        {idx < STEPS.length - 1 && <div className="h-px w-6 bg-slate-200" />}
                    </div>
                ))}
            </div>

            {step === 0 && (
                <Card title="Find the customer" subtitle="Lookup is by exact registered phone number">
                    <form onSubmit={handleLookupCustomer} className="flex items-end gap-3 max-w-md">
                        <Input
                            label="Customer phone number"
                            placeholder="+91XXXXXXXXXX"
                            value={phoneInput}
                            onChange={(e) => setPhoneInput(e.target.value)}
                        />
                        <Button type="submit" isLoading={lookupLoading}>
                            <Search className="h-4 w-4 mr-2" /> Find
                        </Button>
                    </form>
                    {lookupError && (
                        <p className="text-xs text-red-600 mt-3 font-semibold">
                            {lookupError}
                        </p>
                    )}
                </Card>
            )}

            {step === 1 && customer && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <Card
                        title="Customer"
                        className="lg:col-span-1"
                        headerAction={
                            <button
                                className="text-[10px] font-bold text-fuchsia-600 uppercase"
                                onClick={() => {
                                    setCustomer(null);
                                    setStep(0);
                                }}
                            >
                                Change
                            </button>
                        }
                    >
                        <p className="text-sm font-bold text-slate-900">{customer.name || 'Unnamed customer'}</p>
                        <p className="text-xs text-slate-500 mt-1">{customer.phone}</p>
                        {customer.email && <p className="text-xs text-slate-500">{customer.email}</p>}
                    </Card>

                    <Card title="Search products" className="lg:col-span-2">
                        {lockedStore && (
                            <div className="mb-4 flex items-center justify-between gap-3 px-3 py-2 rounded-xl bg-fuchsia-50 text-fuchsia-700">
                                <span className="text-xs font-bold">Shop locked: {lockedStore.shopName || 'Selected shop'}</span>
                                <button
                                    onClick={clearCart}
                                    className="text-[10px] font-bold uppercase underline underline-offset-2"
                                >
                                    Clear cart to change shop
                                </button>
                            </div>
                        )}

                        <div className="relative max-w-md">
                            <Input
                                placeholder="Search products by name"
                                value={productQuery}
                                onChange={(e) => handleProductSearch(e.target.value)}
                            />
                        </div>
                        {productSearchError && (
                            <p className="text-xs text-red-600 mt-2 font-semibold">{productSearchError}</p>
                        )}

                        <div className="mt-4">
                            {productSearchLoading ? (
                                <p className="text-xs text-slate-400">Searching…</p>
                            ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-80 overflow-y-auto pr-1">
                                    {productResults.map((p) => (
                                        <div
                                            key={p._id}
                                            className="flex items-center justify-between gap-3 p-3 rounded-xl ring-1 ring-slate-100"
                                        >
                                            <div className="min-w-0">
                                                <p className="text-xs font-bold text-slate-800 truncate">{p.name}</p>
                                                <p className="text-[11px] text-slate-500">
                                                    {p.sellerId?.shopName ? `${p.sellerId.shopName} · ` : ''}₹{priceOf(p)}
                                                </p>
                                            </div>
                                            <button
                                                onClick={() => addToCart(p)}
                                                className="p-2 bg-fuchsia-50 text-fuchsia-600 rounded-lg hover:bg-fuchsia-100"
                                            >
                                                <Plus className="h-3.5 w-3.5" />
                                            </button>
                                        </div>
                                    ))}
                                    {!productSearchLoading && productQuery.trim() && productResults.length === 0 && (
                                        <p className="text-xs text-slate-400 col-span-2">No products found.</p>
                                    )}
                                </div>
                            )}
                        </div>
                    </Card>

                    {cart.length > 0 && (
                        <Card title="Cart" className="lg:col-span-3">
                            <div className="space-y-2">
                                {cart.map((i) => (
                                    <div key={i.product} className="flex items-center justify-between gap-3">
                                        <p className="text-xs font-bold text-slate-800 flex-1 truncate">{i.name}</p>
                                        <div className="flex items-center gap-2">
                                            <button onClick={() => updateQty(i.product, -1)} className="p-1.5 bg-slate-50 rounded-lg">
                                                <Minus className="h-3 w-3" />
                                            </button>
                                            <span className="text-xs font-bold w-6 text-center">{i.quantity}</span>
                                            <button onClick={() => updateQty(i.product, 1)} className="p-1.5 bg-slate-50 rounded-lg">
                                                <Plus className="h-3 w-3" />
                                            </button>
                                        </div>
                                        <p className="text-xs font-bold text-slate-900 w-20 text-right">
                                            ₹{(i.price * i.quantity).toFixed(0)}
                                        </p>
                                        <button onClick={() => removeFromCart(i.product)} className="p-1.5 text-red-400 hover:text-red-600">
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                            <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100">
                                <p className="text-xs font-black uppercase text-slate-500">Estimated total</p>
                                <p className="text-sm font-black text-slate-900">₹{cartTotal.toFixed(0)}</p>
                            </div>
                            <div className="flex justify-end mt-4">
                                <Button onClick={() => setStep(2)} disabled={cart.length === 0}>
                                    <ShoppingCart className="h-4 w-4 mr-2" /> Continue to review
                                </Button>
                            </div>
                        </Card>
                    )}
                </div>
            )}

            {step === 2 && customer && (
                <Card title="Review order">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <p className="text-xs font-black uppercase text-slate-500">Delivery address</p>
                                <button
                                    onClick={() => setUseManualAddress((prev) => !prev)}
                                    className="text-[10px] font-bold text-fuchsia-600 uppercase underline underline-offset-2"
                                >
                                    {useManualAddress ? 'Use a saved address' : 'Enter address manually'}
                                </button>
                            </div>

                            {useManualAddress ? (
                                <div className="space-y-2">
                                    <Input
                                        placeholder="Full address (house no, street, area) *"
                                        value={manualAddress.address}
                                        onChange={(e) => setManualAddress((prev) => ({ ...prev, address: e.target.value }))}
                                    />
                                    <div className="grid grid-cols-2 gap-2">
                                        <Input
                                            placeholder="City"
                                            value={manualAddress.city}
                                            onChange={(e) => setManualAddress((prev) => ({ ...prev, city: e.target.value }))}
                                        />
                                        <Input
                                            placeholder="State"
                                            value={manualAddress.state}
                                            onChange={(e) => setManualAddress((prev) => ({ ...prev, state: e.target.value }))}
                                        />
                                    </div>
                                    <Input
                                        placeholder="Landmark (optional)"
                                        value={manualAddress.landmark}
                                        onChange={(e) => setManualAddress((prev) => ({ ...prev, landmark: e.target.value }))}
                                    />
                                    <div className="flex gap-2">
                                        {['home', 'work', 'other'].map((label) => (
                                            <button
                                                key={label}
                                                onClick={() => setManualAddress((prev) => ({ ...prev, label }))}
                                                className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase ring-1 capitalize ${
                                                    manualAddress.label === label
                                                        ? 'bg-fuchsia-600 text-white ring-fuchsia-600'
                                                        : 'ring-slate-200 text-slate-600'
                                                }`}
                                            >
                                                {label}
                                            </button>
                                        ))}
                                    </div>
                                    {!isManualAddressValid && (
                                        <p className="text-[11px] text-red-600 font-semibold">Enter the full address.</p>
                                    )}
                                </div>
                            ) : (
                                <>
                                    {addresses.length === 0 && (
                                        <p className="text-xs text-red-600 font-semibold">
                                            This customer has no saved addresses — enter one manually instead.
                                        </p>
                                    )}
                                    <div className="space-y-2">
                                        {addresses.map((addr, idx) => (
                                            <button
                                                key={idx}
                                                onClick={() => setSelectedAddressIdx(idx)}
                                                className={`w-full text-left p-3 rounded-xl ring-1 flex items-start gap-2 ${
                                                    idx === selectedAddressIdx
                                                        ? 'ring-fuchsia-500 bg-fuchsia-50'
                                                        : 'ring-slate-100'
                                                }`}
                                            >
                                                <MapPin className="h-3.5 w-3.5 text-slate-400 mt-0.5" />
                                                <div>
                                                    <p className="text-xs font-bold text-slate-800 capitalize">{addr.label}</p>
                                                    <p className="text-[11px] text-slate-500">{addr.fullAddress}</p>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>
                        <div>
                            <p className="text-xs font-black uppercase text-slate-500 mb-2">Items</p>
                            <div className="space-y-1.5">
                                {cart.map((i) => (
                                    <div key={i.product} className="flex justify-between text-xs">
                                        <span className="text-slate-600">{i.name} × {i.quantity}</span>
                                        <span className="font-bold text-slate-900">₹{(i.price * i.quantity).toFixed(0)}</span>
                                    </div>
                                ))}
                            </div>
                            <div className="flex justify-between mt-3 pt-3 border-t border-slate-100 text-sm font-black">
                                <span>Estimated total</span>
                                <span>₹{cartTotal.toFixed(0)}</span>
                            </div>
                            <p className="text-[11px] text-slate-400 mt-1">
                                Final amount is computed server-side (delivery fee, tax, etc.) at checkout.
                            </p>
                        </div>
                    </div>

                    <div className="mt-6">
                        <p className="text-xs font-black uppercase text-slate-500 mb-2">Delivery timing</p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => handleFulfillmentToggle('instant')}
                                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold ring-1 ${
                                    fulfillmentType === 'instant' ? 'bg-fuchsia-600 text-white ring-fuchsia-600' : 'ring-slate-200 text-slate-600'
                                }`}
                            >
                                <Clock className="h-3.5 w-3.5" /> Deliver now
                            </button>
                            <button
                                onClick={() => handleFulfillmentToggle('scheduled')}
                                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold ring-1 ${
                                    fulfillmentType === 'scheduled' ? 'bg-fuchsia-600 text-white ring-fuchsia-600' : 'ring-slate-200 text-slate-600'
                                }`}
                            >
                                <CalendarClock className="h-3.5 w-3.5" /> Schedule for later
                            </button>
                        </div>
                        {fulfillmentType === 'scheduled' && lockedStore && (
                            <div className="mt-4 max-w-md">
                                <DeliverySlotPicker
                                    sellerId={lockedStore.id}
                                    fulfillmentType="scheduled"
                                    apiFn={getDeliverySlots}
                                    // DeliverySlotPicker calls onChange with a single object
                                    // ({ fulfillmentType, deliveryDate, windowLabel, timeSlot,
                                    // campaignId }), not positional args — same as how
                                    // CheckoutPage.jsx consumes it (onChange={setSchedule}).
                                    onChange={setScheduleSelection}
                                />
                            </div>
                        )}
                    </div>

                    <div className="mt-6">
                        <p className="text-xs font-black uppercase text-slate-500 mb-2">Send payment link via</p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => toggleNotifyVia('sms')}
                                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold ring-1 ${
                                    notifyVia.includes('sms') ? 'bg-fuchsia-600 text-white ring-fuchsia-600' : 'ring-slate-200 text-slate-600'
                                }`}
                            >
                                <MessageSquare className="h-3.5 w-3.5" /> SMS
                            </button>
                            <button
                                onClick={() => toggleNotifyVia('email')}
                                disabled={!customer.email}
                                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold ring-1 disabled:opacity-40 ${
                                    notifyVia.includes('email') ? 'bg-fuchsia-600 text-white ring-fuchsia-600' : 'ring-slate-200 text-slate-600'
                                }`}
                            >
                                <Mail className="h-3.5 w-3.5" /> Email{!customer.email ? ' (no email on file)' : ''}
                            </button>
                        </div>
                    </div>

                    <div className="flex justify-end mt-6">
                        <Button
                            onClick={handleSubmit}
                            isLoading={submitting}
                            disabled={!effectiveAddress || !isManualAddressValid || cart.length === 0 || notifyVia.length === 0}
                        >
                            Create order & send link
                        </Button>
                    </div>
                </Card>
            )}

            {step === 3 && result && (
                <Card title="Payment link sent">
                    <div className="flex items-center gap-2 text-emerald-600 font-bold text-sm mb-4">
                        <CheckCircle2 className="h-5 w-5" /> Order created — awaiting customer payment
                    </div>
                    <p className="text-xs text-slate-500 mb-2">
                        Sent via: <span className="font-bold text-slate-700">{(result.sentVia || []).join(', ') || 'none — copy the link below'}</span>
                    </p>
                    <div className="flex items-center gap-2 max-w-xl">
                        <Input value={result.paymentLinkUrl || ''} readOnly />
                        <Button variant="outline" onClick={handleCopyLink}>
                            <Copy className="h-4 w-4" />
                        </Button>
                    </div>
                    <div className="flex justify-end mt-6">
                        <Button onClick={() => navigate(doneRoute)}>Done</Button>
                    </div>
                </Card>
            )}
        </div>
    );
};

export default PhoneOrderWizard;
