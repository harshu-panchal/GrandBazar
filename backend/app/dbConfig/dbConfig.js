import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { seedSystemAdminRoles } from '../services/admin/systemRoleSeedService.js';

dotenv.config();

// Role definitions live in services/admin/systemRoleSeedService.js so the
// same seed list can also be triggered on-demand (see roleController.js'
// ensureSystemRoles) instead of only ever running once at boot.

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