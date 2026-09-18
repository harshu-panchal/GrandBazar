"""
Fix admin credentials and discover correct login details from DB
"""
import subprocess, json

# Query MongoDB for admin users
mongo_uri = "mongodb+srv://zintoindia_db_user:Zinto123@cluster0.rpenpt5.mongodb.net/zinto"

script = """
const { MongoClient } = require('mongodb');
const uri = process.argv[1];
async function main() {
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db('zinto');
  
  // Find admin users
  const admins = await db.collection('admins').find({}).toArray();
  console.log('ADMINS:', JSON.stringify(admins.map(a => ({_id: a._id, email: a.email, role: a.role, name: a.name}))));
  
  // Find sellers with email
  const sellers = await db.collection('sellers').find({}).limit(5).toArray();
  console.log('SELLERS:', JSON.stringify(sellers.map(s => ({_id: s._id, email: s.email, name: s.name, phone: s.phone}))));
  
  // Find customers
  const customers = await db.collection('customers').find({}).limit(5).toArray();
  console.log('CUSTOMERS:', JSON.stringify(customers.map(c => ({_id: c._id, email: c.email, phone: c.mobile || c.phone, name: c.name}))));
  
  await client.close();
}
main().catch(console.error);
"""

with open('d:/AppZeto/GrandBazar/db_query.js', 'w') as f:
    f.write(script)

import subprocess
result = subprocess.run(
    ['node', 'db_query.js', mongo_uri],
    cwd='d:/AppZeto/GrandBazar/backend',
    capture_output=True, text=True, timeout=30
)
print("STDOUT:", result.stdout[:3000])
print("STDERR:", result.stderr[:1000])
