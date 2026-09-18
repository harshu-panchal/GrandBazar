const { MongoClient } = require('mongodb');
const uri = process.argv[1];
async function main() {
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db('zinto');
  
  const admins = await db.collection('admins').find({}).toArray();
  console.log('ADMINS:', JSON.stringify(admins.map(a => ({_id: a._id, email: a.email, role: a.role, name: a.name, passwordHash: a.password ? a.password.substring(0,20) : 'none'}))));
  
  const sellers = await db.collection('sellers').find({}).limit(5).toArray();
  console.log('SELLERS:', JSON.stringify(sellers.map(s => ({_id: s._id, email: s.email, name: s.name, phone: s.phone, mobile: s.mobile}))));
  
  const customers = await db.collection('customers').find({}).limit(3).toArray();
  console.log('CUSTOMERS:', JSON.stringify(customers.map(c => ({_id: c._id, email: c.email, phone: c.mobile || c.phone, name: c.name}))));
  
  await client.close();
}
main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
