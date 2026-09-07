import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, LayoutGrid, ShoppingBag, User, Store } from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
    { label: 'Home', icon: Home, path: '/' },
    { label: 'Stores', icon: Store, path: '/stores' },
    { label: 'Category', icon: LayoutGrid, path: '/categories' },
    { label: 'Orders', icon: ShoppingBag, path: '/orders' },
    { label: 'Profile', icon: User, path: '/profile' },
];

/**
 * Hides the fixed bottom nav while the on-screen keyboard is open, so it
 * can't ride up over a focused input.
 *
 * Prefers the Visual Viewport API (most accurate — some mobile browsers
 * keep `window.innerHeight` constant and only shrink the visual viewport),
 * but also compares plain `window.innerHeight` against its initial value on
 * every resize. Older/embedded WebViews without `visualViewport` support
 * would otherwise never fire the resize handler at all, leaving the nav
 * permanently visible and riding up with the keyboard.
 */
function useKeyboardOpen() {
    const [keyboardOpen, setKeyboardOpen] = useState(false);

    useEffect(() => {
        let vv = window.visualViewport;
        let lastWidth = vv?.width || window.innerWidth;
        let baselineHeight = vv?.height || window.innerHeight;

        const handleResize = () => {
            vv = window.visualViewport;
            const currentHeight = vv?.height || window.innerHeight;
            const currentWidth = vv?.width || window.innerWidth;

            // If width changed significantly (e.g. rotating device horizontally),
            // reset baseline height for the new orientation.
            if (Math.abs(currentWidth - lastWidth) > 30) {
                lastWidth = currentWidth;
                baselineHeight = currentHeight;
                setKeyboardOpen(false);
                return;
            }

            // If height expanded (e.g. browser address bar collapsed), update baseline
            if (currentHeight > baselineHeight) {
                baselineHeight = currentHeight;
            }

            const shrink = baselineHeight - currentHeight;
            setKeyboardOpen(shrink > 120);
        };

        const handleOrientationChange = () => {
            setTimeout(() => {
                const currentVv = window.visualViewport;
                lastWidth = currentVv?.width || window.innerWidth;
                baselineHeight = currentVv?.height || window.innerHeight;
                setKeyboardOpen(false);
            }, 150);
        };

        vv?.addEventListener('resize', handleResize);
        window.addEventListener('resize', handleResize);
        window.addEventListener('orientationchange', handleOrientationChange);

        return () => {
            vv?.removeEventListener('resize', handleResize);
            window.removeEventListener('resize', handleResize);
            window.removeEventListener('orientationchange', handleOrientationChange);
        };
    }, []);

    return keyboardOpen;
}

const BottomNav = () => {
    const location = useLocation();
    const keyboardOpen = useKeyboardOpen();

    if (keyboardOpen) return null;

    return (
        <div className="fixed bottom-0 left-0 right-0 z-[500] bg-white border-t border-slate-200 flex items-center justify-around h-[calc(64px+env(safe-area-inset-bottom))] landscape:h-[calc(54px+env(safe-area-inset-bottom))] [@media(min-width:768px)_and_(min-height:501px)]:hidden shadow-[0_-8px_30px_rgba(0,0,0,0.06)] px-2 pb-[env(safe-area-inset-bottom)]">
            {navItems.map((item) => {
                const isActive = location.pathname === item.path ||
                    (item.path !== '/' && location.pathname.startsWith(item.path));

                return (
                    <Link
                        key={item.path}
                        to={item.path}
                        replace={location.pathname !== '/' && item.path !== '/'}
                        className="flex-1 flex flex-col items-center justify-center h-full transition-all"
                    >
                        <div className={cn(
                            "relative flex items-center justify-center px-4 py-1.5 rounded-full transition-all duration-300",
                            isActive ? "bg-primary/10" : "bg-transparent"
                        )}>
                            <item.icon
                                size={22}
                                strokeWidth={isActive ? 2.5 : 2}
                                className={cn(
                                    "transition-transform duration-300",
                                    isActive ? "text-primary scale-110" : "text-slate-500 scale-100"
                                )}
                            />
                        </div>
                        <span
                            className={cn(
                                "text-[10px] tracking-tight mt-1 transition-all duration-300",
                                isActive ? "text-primary font-black" : "text-slate-500 font-semibold"
                            )}
                        >
                            {item.label}
                        </span>
                    </Link>
                );
            })}
        </div>
    );
};

export default BottomNav;

