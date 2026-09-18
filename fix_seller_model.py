import pymongo

client = pymongo.MongoClient('mongodb+srv://zintoindia_db_user:Zinto123@cluster0.rpenpt5.mongodb.net/zinto')
db = client['zinto']
res = db['sellers'].update_many({}, {"$set": {"businessModel": "commission"}})
print(f"Updated {res.modified_count} sellers with businessModel='commission'")
