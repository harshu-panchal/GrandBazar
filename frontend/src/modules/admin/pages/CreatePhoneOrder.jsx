import React from 'react';
import PhoneOrderWizard from '@shared/components/phoneOrder/PhoneOrderWizard';
import { adminApi } from '../services/adminApi';

// Admin "create order on behalf of a customer during a phone call" screen.
// Product search is unrestricted (any store); see PhoneOrderWizard for the
// shared store-lock logic that still enforces one store per order.
const CreatePhoneOrder = () => (
    <PhoneOrderWizard
        lookupCustomerByPhone={adminApi.lookupCustomerByPhone}
        searchProducts={(params) => adminApi.getProducts(params)}
        getDeliverySlots={adminApi.getDeliverySlots}
        createOrder={adminApi.createPhoneOrder}
        doneRoute="/admin/orders/all"
    />
);

export default CreatePhoneOrder;
