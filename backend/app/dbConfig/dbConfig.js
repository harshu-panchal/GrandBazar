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
        { name: 'accountant', label: 'Accountant', description: 'Finance, payouts & settlements', permissions: ['dashboard', 'wallet', 'withdrawals', 'seller_payments', 'bulk_settlements', 'cash_collection', 'billing'] },
        { name: 'assistant', label: 'Assistant', description: 'General admin support', permissions: ['dashboard', 'support', 'customers', 'orders', 'faqs'] },
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