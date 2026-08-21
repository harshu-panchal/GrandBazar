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

/** Hides the fixed bottom nav while the on-screen keyboard is open, so it can't ride up over a focused input. */
function useKeyboardOpen() {
    const [keyboardOpen, setKeyboardOpen] = useState(false);
    useEffect(() => {
        const vv = window.visualViewport;
        if (!vv) return undefined;
        const handleResize = () => {
            const shrink = window.innerHeight - vv.height;
            setKeyboardOpen(shrink > 120);
        };
        vv.addEventListener('resize', handleResize);
        return () => vv.removeEventListener('resize', handleResize);
    }, []);
    return keyboardOpen;
}

const BottomNav = () => {
    const location = useLocation();
    const keyboardOpen = useKeyboardOpen();

    if (keyboardOpen) return null;

    return (
        <div className="fixed bottom-0 left-0 right-0 z-[500] bg-white border-t border-slate-200 flex items-center justify-around h-[70px] md:hidden shadow-[0_-8px_30px_rgba(0,0,0,0.06)] px-2 pb-[env(safe-area-inset-bottom)]">
            {navItems.map((item) => {
                const isActive = location.pathname === item.path ||
                    (item.path !== '/' && location.pathname.startsWith(item.path));

                return (
                    <Link
                        key={item.path}
                        to={item.path}
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

