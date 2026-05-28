import mongoose from "mongoose";

async function main() {
  await mongoose.connect('mongodb+srv://playeronline4076_db_user:GeNraYqFkAWOeNr0@cluster0.4a1dx9s.mongodb.net/quickcom?retryWrites=true&w=majority&appName=Cluster0');
  const db = mongoose.connection;
  const seller = await db.collection('sellers').findOne({});
  if(seller) {
    await db.collection('coupons').updateMany({ sponsor: 'seller', sellerId: null }, { $set: { sellerId: seller._id } });
    console.log('Updated coupons with sellerId:', seller._id);
  }
  process.exit(0);
}
main();
