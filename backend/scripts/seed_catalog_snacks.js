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
    const category = await Category.findOne({ name: 'Snacks & Drinks', type: 'category' });
    const subcat = await Category.findOne({ name: 'Chocolates', type: 'subcategory' });

    const hId = header ? header._id : new mongoose.Types.ObjectId();
    const cId = category ? category._id : new mongoose.Types.ObjectId();
    const scId = subcat ? subcat._id : new mongoose.Types.ObjectId();

    console.log(`Using Header: ${hId}, Category: ${cId}, Subcategory: ${scId}`);

    const snacks = [
      {
        name: 'Dairy Milk Silk',
        desc: 'Smooth and creamy milk chocolate.',
        image: 'https://images.unsplash.com/photo-1548883354-94bcfe321cfa?auto=format&fit=crop&q=80&w=400&h=400'
      },
      {
        name: 'Ferrero Rocher',
        desc: 'Premium hazelnut chocolates.',
        image: 'https://images.unsplash.com/photo-1582293041079-7814c2f12063?auto=format&fit=crop&q=80&w=400&h=400'
      },
      {
        name: 'KitKat',
        desc: 'Crispy wafer fingers covered in milk chocolate.',
        image: 'https://images.unsplash.com/photo-1511381939415-e440c9c4004c?auto=format&fit=crop&q=80&w=400&h=400'
      }
    ];

    await CatalogProduct.deleteMany({ slug: { $in: snacks.map(s => s.name.toLowerCase().replace(/ /g, '-')) } });

    const products = snacks.map(s => ({
      name: s.name,
      slug: s.name.toLowerCase().replace(/ /g, '-'),
      description: s.desc,
      brand: 'Nestle/Cadbury',
      weight: '100g',
      tags: ['snack', 'chocolate', 'sweet'],
      alternativeNames: [],
      mainImage: s.image,
      galleryImages: [],
      headerId: hId,
      categoryId: cId,
      subcategoryId: scId,
      status: 'active',
      createdBy: admin._id
    }));

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
