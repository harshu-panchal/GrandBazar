import dotenv from 'dotenv';
import mongoose from 'mongoose';
import AdminRole from '../models/adminRole.js';

dotenv.config();

// Seed the two legacy roles ("accountant", "assistant") as immutable system
// roles the first time this process boots after the custom-roles feature
// landed. Admins can create more roles via the UI; these two just guarantee
// pre-existing staff still have a role to appear under.
async function seedSystemAdminRoles() {
    const defaults = [
        {
            name: 'accountant',
            label: 'Accountant',
            description: 'Finance, payouts & settlements',
            permissions: [
                'dashboard',
                'accountant',
                'accountant.expenses',
                'accountant.expenses_write',
                'accountant.gst_tcs',
                'accountant.gst_tcs_write',
                'accountant.audit_pack',
                'wallet',
                'wallet.write',
                'bulk_settlements',
                'seller_payments',
                'billing',
                'sellers.subscriptions',
                'sellers',
            ],
        },
        { name: 'assistant', label: 'Assistant', description: 'General admin support', permissions: ['dashboard', 'support', 'customers', 'orders', 'faqs'] },
        // Operator tiers — escalating order-ops access, each with a ₹ ceiling
        // on credits/refunds above which the action is sent for approval to
        // the next tier (see approvalRequestService.js). Admins can clone or
        // edit these like any other role.
        {
            name: 'operator_l1',
            label: 'Operations Executive',
            description: 'Monitor orders, coordinate, escalate. Mostly read-only.',
            permissions: ['dashboard', 'orders', 'operations.monitor'],
            moneyLimit: 0,
            requiresTwoFactor: false,
        },
        {
            name: 'operator_l2',
            label: 'Senior Operations Executive',
            description: 'Controlled intervention: reroute, reschedule, partial cancel, refunds within limit.',
            permissions: [
                'dashboard', 'orders', 'operations.monitor', 'operations.intervene',
                'orders.reschedule', 'orders.adjust_price', 'orders.replacement', 'orders.split_delivery',
            ],
            moneyLimit: 500,
            requiresTwoFactor: false,
        },
        {
            name: 'operator_l3',
            label: 'Operations Manager',
            description: 'Shop, seller and logistics control. Approves L2 requests within limit.',
            permissions: [
                'dashboard', 'orders', 'sellers', 'operations.monitor', 'operations.intervene', 'operations.manage_shops',
                'orders.reschedule', 'orders.adjust_price', 'orders.replacement', 'orders.split_delivery',
            ],
            moneyLimit: 2000,
            requiresTwoFactor: false,
        },
        {
            name: 'operator_l4',
            label: 'Operations Controller',
            description: 'Payment, refund and settlement status with Maker-Checker approval.',
            permissions: [
                'dashboard', 'orders', 'sellers', 'wallet', 'withdrawals',
                'operations.monitor', 'operations.intervene', 'operations.manage_shops', 'operations.payments',
                'orders.reschedule', 'orders.adjust_price', 'orders.replacement', 'orders.split_delivery',
            ],
            moneyLimit: 15000,
            requiresTwoFactor: true,
        },
    ];
    for (const role of defaults) {
        await AdminRole.updateOne(
            { name: role.name },
            { $setOnInsert: { ...role, isSystem: true } },
            { upsert: true },
        );
    }
}

const connectDB = async () => {
    try {
        const mongoUri = process.env.MONGO_URI;
        
        if (!mongoUri) {
            throw new Error('MONGO_URI environment variable is not defined');
        }

        const options = {
            maxPoolSize: 10,
            minPoolSize: 5,
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
            retryWrites: true,
            w: 'majority',
        };

        await mongoose.connect(mongoUri, options);

        // Fire-and-forget: don't block the boot if seeding fails.
        seedSystemAdminRoles().catch((err) =>
            console.warn('Admin role seed skipped:', err?.message || err),
        );

        // Connection event listeners
        mongoose.connection.on('disconnected', () => {
            console.warn('⚠ MongoDB disconnected');
        });

        mongoose.connection.on('error', (err) => {
            console.error('✗ MongoDB connection error:', err.message);
        });

    } catch (error) {
        console.error('✗ MongoDB connection failed:', error.message);
        process.exit(1);
    }
};

export default connectDB;