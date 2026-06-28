# Seller Journey — Manual QA Checklist

Run after deploying seller journey gap fixes.

## Prerequisites

```bash
node backend/scripts/seed_subscription_plans.js
node backend/scripts/migrate_store_gst_legacy.js   # legacy stores only
```

## 1. Commission seller — full onboarding

1. Register new seller (OTP) → land on application pending.
2. Admin approves seller account → seller receives notification.
3. Seller chooses **Commission** business model.
4. Seller creates shop with GSTIN + GST certificate + PAN/bank/Aadhaar docs.
5. Admin reviews pending application — verify GSTIN visible in modal.
6. Admin approves shop → seller receives store approval notification.
7. Seller publishes a product → customer can checkout.

## 2. Subscription seller — PhonePe + expiry

1. Register seller → admin approves account.
2. Seller chooses **Subscription** → redirected to subscription page.
3. Pay via PhonePe → subscription activates instantly.
4. Verify shop visible on storefront; product limit shown on subscription page.
5. Let subscription expire (or run expiry job) → shops hidden from customers.
6. Renew same plan → period extends from current end date.
7. Upgrade to higher plan → period end unchanged, limits updated.

## 3. Model switch

1. Commission seller requests switch to subscription → appears in admin **Model switches** tab.
2. Admin approves → seller completes PhonePe payment.
3. Subscription seller requests switch to commission (expired sub) → admin approves → commission model active.

## 4. External logistics

1. Admin sets `defaultDeliveryProvider` to **external**.
2. Place order → seller accepts → order moves to `EXTERNAL_LOGISTICS_PENDING` (no rider search).
3. Admin assigns tracking link on order detail → customer sees **Track shipment**.
4. Admin marks delivered → settlement runs.

## 5. KYC rejection & resubmit

1. Admin rejects shop with reason.
2. Seller sees rejection on My Stores → resubmit with corrected GST/docs.
3. Admin approves resubmitted application.

## 6. Admin SellerDetail

1. Open active seller from pending or active list.
2. Verify live shop name, owner, order stats, business model tab, commission edit.

## 7. Seller profile delivery settings

1. Open seller Profile → **Delivery Settings** card shows platform fleet or external couriers per admin setting.
