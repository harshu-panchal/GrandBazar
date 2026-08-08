import React from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog";
import { cn } from '@/lib/utils';

const Modal = ({ isOpen, onClose, title, children, footer, size = 'md' }) => {
    const sizes = {
        sm: 'sm:max-w-md',
        md: 'sm:max-w-lg',
        lg: 'sm:max-w-2xl',
        xl: 'sm:max-w-4xl',
        full: 'sm:max-w-[95vw] h-[95vh]',
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className={cn("overflow-hidden p-0 flex flex-col max-h-[90vh]", sizes[size])}>
                <DialogHeader className="px-6 pt-4 pb-3 border-b border-gray-100/50 bg-gray-50/10 shrink-0">
                    <DialogTitle className="text-xl font-bold text-gray-900">{title}</DialogTitle>
                    <DialogDescription className="sr-only">Modal content</DialogDescription>
                </DialogHeader>

                <div
                    className="px-6 py-4 overflow-y-auto overscroll-contain touch-pan-y custom-scrollbar flex-1 min-h-0"
                    data-lenis-prevent
                    data-lenis-prevent-wheel
                    data-lenis-prevent-touch
                    tabIndex={0}
                    onWheel={(e) => e.stopPropagation()}
                    onTouchMove={(e) => e.stopPropagation()}
                >
                    {children}
                </div>

                {footer && (
                    <DialogFooter className="px-6 py-3.5 bg-slate-50 border-t border-slate-100 sm:justify-end gap-3 shrink-0">
                        {footer}
                    </DialogFooter>
                )}
            </DialogContent>
        </Dialog>
    );
};

export default Modal;

