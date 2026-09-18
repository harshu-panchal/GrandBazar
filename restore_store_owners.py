import pymongo
from bson import ObjectId

client = pymongo.MongoClient('mongodb+srv://zintoindia_db_user:Zinto123@cluster0.rpenpt5.mongodb.net/zinto')
db = client['zinto']

tata_seller = db['sellers'].find_one({'phone': '9988776655'})
if tata_seller:
    res = db['stores'].update_one({'shopName': 'Tata store'}, {"$set": {"ownerId": tata_seller['_id']}})
    print(f"Restored Tata store owner to {tata_seller['phone']}, modified count: {res.modified_count}")

indore_seller = db['sellers'].find_one({'phone': '6666666666'})
if indore_seller:
    res = db['stores'].update_one({'_id': ObjectId('6a410420d86142a60b2aae45')}, {"$set": {"ownerId": indore_seller['_id']}})
    print(f"Set Store 1 owner to {indore_seller['phone']}, modified count: {res.modified_count}")
