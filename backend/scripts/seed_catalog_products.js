import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const catalogProductSchema = new mongoose.Schema(
  {
    name: String,
    slug: String,
    description: String,
    brand: String,
    weight: String,
    tags: [String],
    alternativeNames: [String],
    mainImage: String,
    galleryImages: [String],
    headerId: mongoose.Schema.Types.ObjectId,
    categoryId: mongoose.Schema.Types.ObjectId,
    subcategoryId: mongoose.Schema.Types.ObjectId,
    status: {
      type: String,
      default: "active",
    },
    createdBy: mongoose.Schema.Types.ObjectId,
  },
  { timestamps: true }
);

const CatalogProduct = mongoose.model('CatalogProduct', catalogProductSchema);
const Category = mongoose.model('Category', new mongoose.Schema({}, { strict: false }));
const Admin = mongoose.model('Admin', new mongoose.Schema({}, { strict: false }));

async function seed() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    const admin = await Admin.findOne({});
    if (!admin) throw new Error('No admin found');

    const header = await Category.findOne({ name: 'Grocery', type: 'header' });
    const category = await Category.findOne({ name: 'Fruits & Vegetables', type: 'category' });
    const subcat = await Category.findOne({ name: 'Fresh Fruits', type: 'subcategory' });

    if (!header || !category || !subcat) {
      console.log('Creating categories...');
      // Just fallback if not exist
    }

    const hId = header ? header._id : new mongoose.Types.ObjectId();
    const cId = category ? category._id : new mongoose.Types.ObjectId();
    const scId = subcat ? subcat._id : new mongoose.Types.ObjectId();

    console.log(`Using Header: ${hId}, Category: ${cId}, Subcategory: ${scId}`);

    const products = [];
    const fruits = [
      'Apple', 'Banana', 'Orange', 'Mango', 'Grapes', 'Pineapple', 'Strawberry',
      'Watermelon', 'Papaya', 'Guava', 'Kiwi', 'Pomegranate', 'Plum', 'Peach',
      'Pear', 'Cherry', 'Avocado', 'Lemon', 'Lime', 'Fig', 'Date', 'Apricot',
      'Blackberry', 'Blueberry', 'Raspberry', 'Cranberry', 'Mulberry', 'Jackfruit',
      'Dragon Fruit', 'Lychee'
    ];

    await CatalogProduct.deleteMany({ slug: { $in: fruits.map(f => f.toLowerCase().replace(/ /g, '-')) } });

    for (let i = 0; i < fruits.length; i++) {
      const name = fruits[i];
      products.push({
        name: name,
        slug: name.toLowerCase().replace(/ /g, '-'),
        description: `Fresh and juicy ${name}. Handpicked for the best quality.`,
        brand: 'Fresh Farm',
        weight: '1kg',
        tags: ['fruit', 'fresh', 'healthy', name.toLowerCase()],
        alternativeNames: [],
        mainImage: 'https://res.cloudinary.com/demo/image/upload/v1312461204/sample.jpg',
        galleryImages: [],
        headerId: hId,
        categoryId: cId,
        subcategoryId: scId,
        status: 'active',
        createdBy: admin._id
      });
    }

    await CatalogProduct.insertMany(products);
    console.log(`Seeded ${products.length} products to the Master Catalog.`);

    await mongoose.disconnect();
    console.log('Disconnected.');
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

seed();
