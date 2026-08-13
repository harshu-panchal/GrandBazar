import React, { createContext, useContext, useState, useMemo } from 'react';

// Survive Vite HMR: re-evaluating this module must not create a new context
// identity, or consumers throw against the still-mounted Provider's old one.
const ProductDetailContext =
  globalThis.__zintoProductDetailContext ??
  (globalThis.__zintoProductDetailContext = createContext());

export const useProductDetail = () => {
    const context = useContext(ProductDetailContext);
    if (!context) {
        // console.warn('useProductDetail used outside Provider');
        return {};
    }
    return context;
};

export const ProductDetailProvider = ({ children }) => {
    const [selectedProduct, setSelectedProduct] = useState(null);
    const [isOpen, setIsOpen] = useState(false);

    const openProduct = (product) => {
        setSelectedProduct(product);
        setIsOpen(true);
    };

    const closeProduct = () => {
        setIsOpen(false);
        // Delay clearing product to allow close animation to finish
        setTimeout(() => setSelectedProduct(null), 300);
    };

    const value = useMemo(
        () => ({ selectedProduct, isOpen, openProduct, closeProduct }),
        [selectedProduct, isOpen]
    );

    return (
        <ProductDetailContext.Provider value={value}>
            {children}
        </ProductDetailContext.Provider>
    );
};
