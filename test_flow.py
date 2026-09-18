import requests, json

BASE = "http://localhost:7000/api"

def test_flow():
    # 1. Customer OTP send
    r = requests.post(f"{BASE}/auth/otp/send", json={"mobile": "6262520620", "userType": "Customer", "purpose": "LOGIN"})
    res = r.json()
    print("Customer Send Response:", json.dumps(res, indent=2))
    
    mock_otp = res.get("result", {}).get("mockOtp") or res.get("mockOtp")
    print("Mock OTP found:", mock_otp)
    
    # 2. Customer OTP verify
    r2 = requests.post(f"{BASE}/auth/otp/verify", json={"mobile": "6262520620", "otp": mock_otp, "userType": "Customer", "purpose": "LOGIN"})
    res2 = r2.json()
    print("Customer Verify Response:", json.dumps(res2, indent=2))
    
    # 3. Seller OTP send & verify
    r3 = requests.post(f"{BASE}/auth/otp/send", json={"mobile": "6666666666", "userType": "Seller", "purpose": "LOGIN"})
    res3 = r3.json()
    seller_otp = res3.get("result", {}).get("mockOtp") or res3.get("mockOtp")
    print("Seller Mock OTP:", seller_otp)
    
    r4 = requests.post(f"{BASE}/auth/otp/verify", json={"mobile": "6666666666", "otp": seller_otp, "userType": "Seller", "purpose": "LOGIN"})
    print("Seller Verify Response:", json.dumps(r4.json(), indent=2))

test_flow()
