import React, { lazy, Suspense } from 'react';
import { createBrowserRouter, RouterProvider, Outlet, Navigate } from 'react-router-dom';
import ProtectedRoute from '../guards/ProtectedRoute';
import RoleGuard from '../guards/RoleGuard';
import { UserRole } from '../constants/roles';
import RootErrorBoundary from '../../shared/components/RootErrorBoundary';

// Providers for Customer Module
import { WishlistProvider } from '../../modules/customer/context/WishlistContext';
import { FavoriteStoresProvider } from '../../modules/customer/context/FavoriteStoresContext';
import { CartProvider } from '../../modules/customer/context/CartContext';
import { CartAnimationProvider } from '../../modules/customer/context/CartAnimationContext';
import { ProductDetailProvider } from '../../modules/customer/context/ProductDetailContext';
import { LocationProvider } from '../../modules/customer/context/LocationContext';
import ScrollToTop from '../../modules/customer/components/shared/ScrollToTop';

// Public Pages
import Auth from '../../modules/seller/pages/Auth';
import ApplicationPending from '../../modules/seller/pages/ApplicationPending';
import ChooseBusinessModel from '../../modules/seller/pages/ChooseBusinessModel';
import AdminAuth from '../../modules/admin/pages/AdminAuth';
import DeliveryAuth from '../../modules/delivery/pages/DeliveryAuth';
import CustomerAuth from '../../modules/customer/pages/CustomerAuth';

// Customer Pages (lazy-loaded)
const Home = lazy(() => import('../../modules/customer/pages/Home'));
const CategoriesPage = lazy(() => import('../../modules/customer/pages/CategoriesPage'));
const CategoryProductsPage = lazy(() => import('../../modules/customer/pages/CategoryProductsPage'));
const WishlistPage = lazy(() => import('../../modules/customer/pages/WishlistPage'));
const FavoriteStoresPage = lazy(() => import('../../modules/customer/pages/FavoriteStoresPage'));
const OffersPage = lazy(() => import('../../modules/customer/pages/OffersPage'));
const ShopByStorePage = lazy(() => import('../../modules/customer/pages/ShopByStorePage'));
const StoresPage = lazy(() => import('../../modules/customer/pages/StoresPage'));
const StoreDetailPage = lazy(() => import('../../modules/customer/pages/StoreDetailPage'));
const ProfilePage = lazy(() => import('../../modules/customer/pages/ProfilePage'));
const OrdersPage = lazy(() => import('../../modules/customer/pages/OrdersPage'));
const OrderTransactionsPage = lazy(() => import('../../modules/customer/pages/OrderTransactionsPage'));
const AddressesPage = lazy(() => import('../../modules/customer/pages/AddressesPage'));
const SettingsPage = lazy(() => import('../../modules/customer/pages/SettingsPage'));
const NotificationsPage = lazy(() => import('../../modules/customer/pages/NotificationsPage'));
const SupportPage = lazy(() => import('../../modules/customer/pages/SupportPage'));
const ChatPage = lazy(() => import('../../modules/customer/pages/ChatPage'));
const TermsPage = lazy(() => import('../../modules/customer/pages/TermsPage'));
const PrivacyPage = lazy(() => import('../../modules/customer/pages/PrivacyPage'));
const ReturnPolicyPage = lazy(() => import('../../modules/customer/pages/ReturnPolicyPage'));
const AboutPage = lazy(() => import('../../modules/customer/pages/AboutPage'));
const EditProfilePage = lazy(() => import('../../modules/customer/pages/EditProfilePage'));
const OrderDetailPage = lazy(() => import('../../modules/customer/pages/OrderDetailPage'));
const ProductDetailPage = lazy(() => import('../../modules/customer/pages/ProductDetailPage'));
const CartPage = lazy(() => import('../../modules/customer/pages/CartPage'));
const CheckoutPage = lazy(() => import('../../modules/customer/pages/CheckoutPage'));
const PaymentStatusPage = lazy(() => import('../../modules/customer/pages/PaymentStatusPage'));
const SearchPage = lazy(() => import('../../modules/customer/pages/SearchPage'));
const WalletPage = lazy(() => import('../../modules/customer/pages/WalletPage'));
const RewardsPage = lazy(() => import('../../modules/customer/pages/RewardsPage'));
const ReferAndEarnPage = lazy(() => import('../../modules/customer/pages/ReferAndEarnPage'));
const PreOrderBrowsePage = lazy(() => import('../../modules/customer/pages/PreOrderBrowsePage'));
const PreOrderDetailPage = lazy(() => import('../../modules/customer/pages/PreOrderDetailPage'));
const DiscoverCityPage = lazy(() => import('../../modules/customer/pages/DiscoverCityPage'));
const DiscoverPincodePage = lazy(() => import('../../modules/customer/pages/DiscoverPincodePage'));
const BecomeSellerForm = lazy(() => import('../../modules/customer/pages/BecomeSellerForm'));

// Lazy load heavy modules
const SellerModule = lazy(() => import('../../modules/seller/routes/index'));
const AdminModule = lazy(() => import('../../modules/admin/routes/index'));
const DeliveryModule = lazy(() => import('../../modules/delivery/routes/index'));

import CustomerLayout from '../../modules/customer/components/layout/CustomerLayout';

const CustomerLayoutWrapper = () => (
    <LocationProvider>
        <WishlistProvider>
            <FavoriteStoresProvider>
            <CartProvider>
                <CartAnimationProvider>
                    <ProductDetailProvider>
                        <ScrollToTop />
                        <CustomerLayout>
                            <Suspense fallback={<div className="flex h-screen items-center justify-center font-outfit">Loading...</div>}>
                                <Outlet />
                            </Suspense>
                        </CustomerLayout>
                    </ProductDetailProvider>
                </CartAnimationProvider>
            </CartProvider>
            </FavoriteStoresProvider>
        </WishlistProvider>
    </LocationProvider>
);

const router = createBrowserRouter([
        {
            path: '/',
            element: <Outlet />,
            errorElement: <RootErrorBoundary />,
            children: [
                {
                    path: 'login',
                    element: (
                        <LocationProvider>
                            <CustomerAuth />
                        </LocationProvider>
                    ),
                },
                {
                    path: 'signup',
                    element: (
                        <LocationProvider>
                            <CustomerAuth />
                        </LocationProvider>
                    ),
                },
                {
                    path: 'seller/auth',
                    element: <Auth />,
                },
                {
                    path: 'seller/pending-approval',
                    element: <ApplicationPending />,
                },
                {
                    path: 'seller/choose-model',
                    element: (
                        <ProtectedRoute>
                            <RoleGuard allowedRoles={[UserRole.SELLER]}>
                                <ChooseBusinessModel />
                            </RoleGuard>
                        </ProtectedRoute>
                    ),
                },
                {
                    path: 'admin/auth',
                    element: <AdminAuth />,
                },
                {
                    path: 'delivery/auth',
                    element: <DeliveryAuth />,
                },
                {
                    path: 'seller/*',
                    element: (
                        <ProtectedRoute>
                            <RoleGuard allowedRoles={[UserRole.SELLER]}>
                                <SellerModule />
                            </RoleGuard>
                        </ProtectedRoute>
                    ),
                },
                {
                    path: 'admin/*',
                    element: (
                        <ProtectedRoute>
                            <RoleGuard allowedRoles={[UserRole.ADMIN]}>
                                <AdminModule />
                            </RoleGuard>
                        </ProtectedRoute>
                    ),
                },
                {
                    path: 'delivery/*',
                    element: (
                        <ProtectedRoute>
                            <RoleGuard allowedRoles={[UserRole.DELIVERY]}>
                                <DeliveryModule />
                            </RoleGuard>
                        </ProtectedRoute>
                    ),
                },
                {
                    path: 'unauthorized',
                    element: <div className="flex h-screen items-center justify-center font-outfit">Unauthorized Access</div>,
                },
                {
                    element: <CustomerLayoutWrapper />,
                    children: [
                        { index: true, element: <Home /> },
                        { path: 'categories', element: <CategoriesPage /> },
                        { path: 'category/:categoryName', element: <CategoryProductsPage /> },
                        { path: 'product/:slugAndId', element: <ProductDetailPage /> },
                        { path: 'terms', element: <TermsPage /> },
                        { path: 'privacy', element: <PrivacyPage /> },
                        { path: 'privacy-policy', element: <PrivacyPage /> },
                        { path: 'return-policy', element: <ReturnPolicyPage /> },
                        { path: 'returns', element: <ReturnPolicyPage /> },
                        { path: 'about', element: <AboutPage /> },
                        { path: 'offers', element: <OffersPage /> },
                        { path: 'become-a-seller', element: <BecomeSellerForm /> },
                        { path: 'preorder', element: <PreOrderBrowsePage /> },
                        { path: 'preorder/:campaignId', element: <PreOrderDetailPage /> },
                        { path: 'discover/:citySlug', element: <DiscoverCityPage /> },
                        { path: 'discover/:citySlug/:pincode', element: <DiscoverPincodePage /> },
                        { path: 'shop-by-store', element: <ShopByStorePage /> },
                        { path: 'stores', element: <StoresPage /> },
                        { path: 'store/:slugAndId', element: <StoreDetailPage /> },
                        { path: 'wishlist', element: <ProtectedRoute><WishlistPage /></ProtectedRoute> },
                        { path: 'favorite-stores', element: <ProtectedRoute><FavoriteStoresPage /></ProtectedRoute> },
                        { path: 'orders', element: <ProtectedRoute><OrdersPage /></ProtectedRoute> },
                        { path: 'orders/:orderId', element: <ProtectedRoute><OrderDetailPage /></ProtectedRoute> },
                        { path: 'transactions', element: <ProtectedRoute><OrderTransactionsPage /></ProtectedRoute> },
                        { path: 'addresses', element: <ProtectedRoute><AddressesPage /></ProtectedRoute> },
                        { path: 'settings', element: <ProtectedRoute><SettingsPage /></ProtectedRoute> },
                        { path: 'notifications', element: <ProtectedRoute><NotificationsPage /></ProtectedRoute> },
                        { path: 'support', element: <ProtectedRoute><SupportPage /></ProtectedRoute> },
                        { path: 'chat', element: <ProtectedRoute><ChatPage /></ProtectedRoute> },
                        { path: 'cart', element: <CartPage /> },
                        { path: 'checkout', element: <ProtectedRoute><CheckoutPage /></ProtectedRoute> },
                        { path: 'payment-status', element: <PaymentStatusPage /> },
                        { path: 'profile', element: <ProtectedRoute><ProfilePage /></ProtectedRoute> },
                        { path: 'profile/edit', element: <ProtectedRoute><EditProfilePage /></ProtectedRoute> },
                        { path: 'wallet', element: <ProtectedRoute><WalletPage /></ProtectedRoute> },
                        { path: 'rewards', element: <ProtectedRoute><RewardsPage /></ProtectedRoute> },
                        { path: 'refer-and-earn', element: <ProtectedRoute><ReferAndEarnPage /></ProtectedRoute> },
                        { path: 'search', element: <SearchPage /> },
                    ]
                },
                {
                    path: '*',
                    element: <Navigate to="/" replace />
                }
            ]
        }
    ]);

const AppRouter = () => <RouterProvider router={router} />;

export default AppRouter;
