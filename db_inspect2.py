import pymongo, json

MONGO_URI = "mongodb+srv://zintoindia_db_user:Zinto123@cluster0.rpenpt5.mongodb.net/zinto"
client = pymongo.MongoClient(MONGO_URI, serverSelectionTimeoutMS=20000)
db = client['zinto']

out = {}

admins = list(db['admins'].find({}, {'email':1,'role':1,'name':1,'password':1}))
out['admins'] = [{'email': a.get('email'), 'role': a.get('role'), 'name': a.get('name'), 'pwd_prefix': str(a.get('password',''))[:30]} for a in admins]

sellers = list(db['sellers'].find({}, {'email':1,'name':1,'phone':1,'mobile':1,'status':1}).limit(10))
out['sellers'] = [{'email': s.get('email'), 'name': s.get('name'), 'phone': s.get('phone') or s.get('mobile'), 'status': s.get('status')} for s in sellers]

customers = list(db['customers'].find({}, {'email':1,'name':1,'mobile':1,'phone':1}).limit(5))
out['customers'] = [{'email': c.get('email'), 'name': c.get('name'), 'mobile': c.get('mobile') or c.get('phone')} for c in customers]

delivery = list(db['deliverys'].find({}, {'email':1,'name':1,'phone':1,'mobile':1}).limit(5))
out['delivery'] = [{'email': d.get('email'), 'name': d.get('name'), 'phone': d.get('phone') or d.get('mobile')} for d in delivery]

out['collections'] = db.list_collection_names()

client.close()

with open('d:/AppZeto/GrandBazar/db_info.json', 'w') as f:
    json.dump(out, f, indent=2, default=str)

print(json.dumps(out, indent=2, default=str))
