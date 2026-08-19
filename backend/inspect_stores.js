import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI;

async function run() {
    try {
        console.log('Connecting to Mongoose...');
        await mongoose.connect(MONGO_URI);
        console.log('Connected!');
        
        const Store = mongoose.model('Store', new mongoose.Schema({}, { strict: false }), 'stores');
        const stores = await Store.find({}, '_id shopName category isVerified isActive applicationStatus').lean();
        console.log('STORES_INFO:');
        console.log(JSON.stringify(stores));
        console.log('END_STORES_INFO');
        
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
run();
