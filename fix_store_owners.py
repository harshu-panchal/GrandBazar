import pymongo

client = pymongo.MongoClient('mongodb+srv://zintoindia_db_user:Zinto123@cluster0.rpenpt5.mongodb.net/zinto')
db = client['zinto']
indore_id = db['sellers'].find_one({'phone': '6666666666'})['_id']

res = db['stores'].update_many({}, {"$set": {"ownerId": indore_id}})
print(f"Updated {res.modified_count} stores to ownerId: {indore_id}")
