import React from 'react';
import PhoneOrderWizard from '@shared/components/phoneOrder/PhoneOrderWizard';
import { sellerApi } from '../services/sellerApi';
import { useStoreContext } from '../context/StoreContext';

// Seller/sub-staff "create order on behalf of a customer who called the
// shop directly" screen. Unlike the admin version, product search is
// always scoped to the seller's own store (sellerId pinned to the active
// store) — GET /products has no implicit seller-scoping, it only filters
// by whatever sellerId is passed, so that must be supplied explicitly here.
// The backend also independently re-validates that every item belongs to
// this store before placing the order, regardless of what this UI sends.
const CreatePhoneOrder = () => {
    const { activeStoreId } = useStoreContext();

    return (
        <PhoneOrderWizard
            lookupCustomerByPhone={sellerApi.lookupCustomerByPhone}
            searchProducts={(params) => sellerApi.searchOwnProducts({ ...params, sellerId: activeStoreId })}
            getDeliverySlots={sellerApi.getAvailableDeliverySlots}
            createOrder={sellerApi.createPhoneOrder}
            doneRoute="/seller/orders"
        />
    );
};

export default CreatePhoneOrder;
