import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Card from '@shared/components/ui/Card';
import Button from '@shared/components/ui/Button';
import Input from '@shared/components/ui/Input';
import { useToast } from '@shared/components/ui/Toast';
import { adminApi } from '../services/adminApi';
import {
    Phone,
    Search,
    Store,
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
} from 'lucide-react';

const STEPS = ['Find Customer', 'Pick Shop & Products', 'Review', 'Send Link'];

// Admin/operator "create order on behalf of a customer during a phone
// call" flow. Items are sent to the backend as DIRECT_ITEMS (not via the
// customer's own cart), scoped to a single store — the backend rejects a
// cross-store cart, so this screen only ever lets one shop be active at a
// time. The order is placed with paymentMode forced to ONLINE server-side;
// it only becomes visible to the seller once the customer pays via the
// link generated here.
const CreatePhoneOrder = () => {
    const navigate = useNavigate();
    const { showToast } = useToast();

    const [step, setStep] = useState(0);
    const [submitting, setSubmitting] = useState(false);

    // Step 1: customer
    const [phoneInput, setPhoneInput] = useState('');
    const [lookupLoading, setLookupLoading] = useState(false);
    const [lookupError, setLookupError] = useState('');
    const [customer, setCustomer] = useState(null);

    // Step 2: shop + products
    const [storeQuery, setStoreQuery] = useState('');
    const [storeResults, setStoreResults] = useState([]);
    const [storeSearchLoading, setStoreSearchLoading] = useState(false);
    const [selectedStore, setSelectedStore] = useState(null);
    const [products, setProducts] = useState([]);
    const [productsLoading, setProductsLoading] = useState(false);
    const [cart, setCart] = useState([]); // [{ product, name, price, quantity, image }]

    // Step 3: review
    const [selectedAddressIdx, setSelectedAddressIdx] = useState(0);

    // Step 4: send
    const [notifyVia, setNotifyVia] = useState(['sms']);
    const [result, setResult] = useState(null);

    const resetAfterCustomerChange = () => {
        setSelectedStore(null);
        setProducts([]);
        setCart([]);
        setSelectedAddressIdx(0);
    };

    const handleLookupCustomer = async (e) => {
        e.preventDefault();
        const phone = phoneInput.trim();
        if (!phone) return;
        setLookupLoading(true);
        setLookupError('');
        setCustomer(null);
        try {
            const res = await adminApi.lookupCustomerByPhone(phone);
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

    const handleStoreSearch = async (query) => {
        setStoreQuery(query);
        if (!query.trim()) {
            setStoreResults([]);
            return;
        }
        setStoreSearchLoading(true);
        try {
            const res = await adminApi.getActiveSellers({ q: query, limit: 10 });
            setStoreResults(res?.data?.result?.items || []);
        } catch {
            setStoreResults([]);
        } finally {
            setStoreSearchLoading(false);
        }
    };

    const handleSelectStore = async (store) => {
        setSelectedStore(store);
        setStoreResults([]);
        setStoreQuery(store.shopName || '');
        setCart([]);
        setProductsLoading(true);
        try {
            const res = await adminApi.getProducts({ sellerId: store._id, limit: 50 });
            setProducts(res?.data?.result?.items || []);
        } catch {
            setProducts([]);
            showToast('Failed to load products for this shop', 'error');
        } finally {
            setProductsLoading(false);
        }
    };

    const priceOf = (p) => Number(p.customerSalePrice ?? p.customerPrice ?? p.salePrice ?? p.price ?? 0);

    const addToCart = (product) => {
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

    const cartTotal = cart.reduce((sum, i) => sum + i.price * i.quantity, 0);

    const addresses = customer?.addresses || [];
    const selectedAddress = addresses[selectedAddressIdx] || null;

    const toggleNotifyVia = (channel) => {
        setNotifyVia((prev) =>
            prev.includes(channel) ? prev.filter((c) => c !== channel) : [...prev, channel],
        );
    };

    const handleSubmit = async () => {
        if (!customer || !selectedAddress || cart.length === 0 || notifyVia.length === 0) return;
        setSubmitting(true);
        try {
            const payload = {
                customerPhone: customer.phone,
                items: cart.map((i) => ({
                    product: i.product,
                    quantity: i.quantity,
                })),
                address: {
                    type: selectedAddress.label,
                    name: customer.name,
                    address: selectedAddress.fullAddress,
                    city: selectedAddress.city,
                    state: selectedAddress.state,
                    phone: customer.phone,
                    landmark: selectedAddress.landmark,
                    location: selectedAddress.location,
                },
                notifyVia,
            };
            const res = await adminApi.createPhoneOrder(payload);
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
                    onClick={() => navigate('/admin/orders/all')}
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

                    <Card title="Pick a shop" className="lg:col-span-2">
                        <div className="relative max-w-md">
                            <Input
                                placeholder="Search shop by name"
                                value={storeQuery}
                                onChange={(e) => handleStoreSearch(e.target.value)}
                            />
                            {storeResults.length > 0 && (
                                <div className="absolute z-10 mt-1 w-full bg-white rounded-xl shadow-lg ring-1 ring-slate-200 overflow-hidden">
                                    {storeResults.map((s) => (
                                        <button
                                            key={s._id}
                                            onClick={() => handleSelectStore(s)}
                                            className="w-full flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-slate-50 text-left"
                                        >
                                            <Store className="h-3.5 w-3.5 text-slate-400" />
                                            {s.shopName}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {selectedStore && (
                            <div className="mt-4 flex items-center gap-2 text-xs font-bold text-emerald-600">
                                <CheckCircle2 className="h-3.5 w-3.5" /> {selectedStore.shopName} selected
                            </div>
                        )}

                        {selectedStore && (
                            <div className="mt-5">
                                {productsLoading ? (
                                    <p className="text-xs text-slate-400">Loading products…</p>
                                ) : (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-80 overflow-y-auto pr-1">
                                        {products.map((p) => (
                                            <div
                                                key={p._id}
                                                className="flex items-center justify-between gap-3 p-3 rounded-xl ring-1 ring-slate-100"
                                            >
                                                <div className="min-w-0">
                                                    <p className="text-xs font-bold text-slate-800 truncate">{p.name}</p>
                                                    <p className="text-[11px] text-slate-500">₹{priceOf(p)}</p>
                                                </div>
                                                <button
                                                    onClick={() => addToCart(p)}
                                                    className="p-2 bg-fuchsia-50 text-fuchsia-600 rounded-lg hover:bg-fuchsia-100"
                                                >
                                                    <Plus className="h-3.5 w-3.5" />
                                                </button>
                                            </div>
                                        ))}
                                        {products.length === 0 && (
                                            <p className="text-xs text-slate-400 col-span-2">No products found for this shop.</p>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
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
                            <p className="text-xs font-black uppercase text-slate-500 mb-2">Delivery address</p>
                            {addresses.length === 0 && (
                                <p className="text-xs text-red-600 font-semibold">
                                    This customer has no saved addresses — ask them for one before proceeding.
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
                            disabled={!selectedAddress || cart.length === 0 || notifyVia.length === 0}
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
                        <Button onClick={() => navigate('/admin/orders/all')}>Done</Button>
                    </div>
                </Card>
            )}
        </div>
    );
};

export default CreatePhoneOrder;
