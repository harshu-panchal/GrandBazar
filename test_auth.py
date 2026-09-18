import requests, json, pymongo
from datetime import datetime

BASE = "http://localhost:7000/api"
MONGO_URI = "mongodb+srv://zintoindia_db_user:Zinto123@cluster0.rpenpt5.mongodb.net/zinto"

client = pymongo.MongoClient(MONGO_URI, serverSelectionTimeoutMS=20000)
db = client['zinto']

def api(method, path, data=None, token=None, params=None):
    headers = {"Content-Type": "application/json"}
    if token: headers["Authorization"] = f"Bearer {token}"
    try:
        r = getattr(requests, method)(f"{BASE}{path}", json=data, headers=headers, params=params, timeout=10)
        try: return r.status_code, r.json()
        except: return r.status_code, {"_raw": r.text[:200]}
    except Exception as e:
        return 0, {"_error": str(e)}

print("=== TESTING AUTH FLOWS ===")

# 1. CUSTOMER OTP (User: test, phone: 6262520620)
print("\n--- Customer OTP Send ---")
sc, res = api("post", "/auth/otp/send", {"mobile": "6262520620", "userType": "Customer", "purpose": "LOGIN"})
print(f"HTTP {sc} => {res}")

if res.get("mockOtp"):
    mock_otp = res["mockOtp"]
    print(f"Mock OTP returned: {mock_otp}")
    sc2, res2 = api("post", "/auth/otp/verify", {"mobile": "6262520620", "otp": mock_otp, "userType": "Customer", "purpose": "LOGIN"})
    print(f"Verify HTTP {sc2} => token present: {bool(res2.get('token'))}")

# 2. SELLER OTP (Seller: Indore, phone: 6666666666)
print("\n--- Seller OTP Send ---")
sc, res = api("post", "/auth/otp/send", {"mobile": "6666666666", "userType": "Seller", "purpose": "LOGIN"})
print(f"HTTP {sc} => {res}")

if res.get("mockOtp"):
    mock_otp = res["mockOtp"]
    print(f"Mock OTP returned: {mock_otp}")
    sc2, res2 = api("post", "/auth/otp/verify", {"mobile": "6666666666", "otp": mock_otp, "userType": "Seller", "purpose": "LOGIN"})
    print(f"Verify HTTP {sc2} => token present: {bool(res2.get('token'))}")

client.close()
