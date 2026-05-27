import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

mongoose.connect(process.env.MONGO_URI).then(async () => {
  const Seller = mongoose.model('Seller', new mongoose.Schema({ shopName: String, signatureProduct: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' } }));
  const sellers = await Seller.find({ signatureProduct: { $ne: null } }).lean();
  console.log('Sellers with signature:', sellers);
  
  const Product = mongoose.model('Product', new mongoose.Schema({ name: String }));
  for (const s of sellers) {
    if (s.signatureProduct) {
      const p = await Product.findById(s.signatureProduct);
      console.log('Product details:', p);
    }
  }
  process.exit(0);
});
