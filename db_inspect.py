import pymongo
import json

MONGO_URI = "mongodb+srv://zintoindia_db_user:Zinto123@cluster0.rpenpt5.mongodb.net/zinto"

client = pymongo.MongoClient(MONGO_URI, serverSelectionTimeoutMS=20000)
db = client['zinto']

# Admins
admins = list(db['admins'].find({}, {'email':1,'role':1,'name':1,'password':1}))
print("=== ADMINS ===")
for a in admins:
    print(f"  email={a.get('email')} role={a.get('role')} name={a.get('name')} pwd_hash_start={str(a.get('password',''))[:30]}")

# Sellers
sellers = list(db['sellers'].find({}, {'email':1,'name':1,'phone':1,'mobile':1,'status':1}).limit(10))
print("\n=== SELLERS ===")
for s in sellers:
    print(f"  email={s.get('email')} name={s.get('name')} phone={s.get('phone') or s.get('mobile')} status={s.get('status')}")

# Customers
customers = list(db['customers'].find({}, {'email':1,'name':1,'mobile':1,'phone':1}).limit(5))
print("\n=== CUSTOMERS ===")
for c in customers:
    print(f"  email={c.get('email')} name={c.get('name')} mobile={c.get('mobile') or c.get('phone')}")

# Collections list
cols = db.list_collection_names()
print(f"\n=== COLLECTIONS ({len(cols)}) ===")
print(cols)

client.close()
print("\nDONE")
