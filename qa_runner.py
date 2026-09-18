"""
Zinto QA Test Runner - Code-only API testing
"""
import requests
import json
import sys
from datetime import datetime

BASE = "http://localhost:7000/api"
RESULTS = []
TOKENS = {}

def log(msg):
    print(msg, flush=True)

def record(tc_id, sheet, scenario, status, actual, expected="", severity="", notes=""):
    entry = {"tc_id": tc_id, "sheet": sheet, "scenario": scenario,
             "status": status, "actual": actual, "expected": expected,
             "severity": severity, "notes": notes,
             "timestamp": datetime.now().isoformat()}
    RESULTS.append(entry)
    icon = "✅" if status == "PASS" else ("❌" if status == "FAIL" else "⚠️")
    log(f"{icon} [{tc_id}] {scenario} => {status}")
    if status == "FAIL":
        log(f"   Expected: {expected}")
        log(f"   Actual:   {actual}")
    return entry

def api(method, path, data=None, token=None, params=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    url = f"{BASE}{path}"
    try:
        r = getattr(requests, method)(url, json=data, headers=headers, params=params, timeout=10)
        try:
            body = r.json()
        except:
            body = r.text
        return r.status_code, body
    except Exception as e:
        return 0, str(e)

# ─────────────────────────────────────────
# PHASE 1: ENVIRONMENT & HEALTH
# ─────────────────────────────────────────
log("\n========== PHASE 1: ENVIRONMENT ==========")

# TC-ENV-001: Health
sc, body = api("get", "")
# Try health endpoint
try:
    r = requests.get("http://localhost:7000/health", timeout=5)
    health_body = r.json() if r.headers.get("content-type","").startswith("application/json") else r.text
    sc = r.status_code
except Exception as e:
    health_body = str(e); sc = 0

if sc == 200:
    record("TC-ENV-001", "Extras", "Backend health check", "PASS",
           f"HTTP 200, body={str(health_body)[:200]}", "HTTP 200 healthy response")
else:
    record("TC-ENV-001", "Extras", "Backend health check", "FAIL",
           f"HTTP {sc}, body={str(health_body)[:200]}", "HTTP 200 healthy response", "High")

# TC-ENV-002: API base reachable
sc, body = api("get", "/settings")
if sc in (200, 401, 403):
    record("TC-ENV-002", "Extras", "Backend API routing active", "PASS",
           f"HTTP {sc} - API routes responding", "API responds to requests")
else:
    record("TC-ENV-002", "Extras", "Backend API routing active", "FAIL",
           f"HTTP {sc}, body={str(body)[:200]}", "API responds", "High")

# ─────────────────────────────────────────
# PHASE 2: AUTHENTICATION
# ─────────────────────────────────────────
log("\n========== PHASE 2: AUTHENTICATION ==========")

# TC-AUTH-001: Admin Login
sc, body = api("post", "/admin/login", {"email": "admin@admin.com", "password": "Sup3r@dm!n123"})
if sc == 200 and isinstance(body, dict) and body.get("token"):
    TOKENS["admin"] = body["token"]
    record("TC-AUTH-001", "Roles & Permissions", "Admin login with valid credentials", "PASS",
           f"HTTP 200, token received, role={body.get('admin',{}).get('role','?')}", "Admin login success + JWT token")
else:
    record("TC-AUTH-001", "Roles & Permissions", "Admin login with valid credentials", "FAIL",
           f"HTTP {sc}, body={str(body)[:300]}", "HTTP 200 + JWT token", "Critical")

# TC-AUTH-002: Admin Login - wrong password
sc, body = api("post", "/admin/login", {"email": "admin@admin.com", "password": "wrongpass"})
if sc in (400, 401, 403):
    record("TC-AUTH-002", "Roles & Permissions", "Admin login with wrong password rejected", "PASS",
           f"HTTP {sc} - correctly rejected", "Login rejected with 4xx")
else:
    record("TC-AUTH-002", "Roles & Permissions", "Admin login with wrong password rejected", "FAIL",
           f"HTTP {sc} - unexpected: {str(body)[:200]}", "4xx rejection", "Critical")

# TC-AUTH-003: Unauthenticated access to admin endpoint
sc, body = api("get", "/admin/orders")
if sc in (401, 403):
    record("TC-AUTH-003", "Roles & Permissions", "Unauthenticated admin endpoint blocked", "PASS",
           f"HTTP {sc} - correctly blocked", "401/403 for unauth access")
else:
    record("TC-AUTH-003", "Roles & Permissions", "Unauthenticated admin endpoint blocked", "FAIL",
           f"HTTP {sc} - security gap: {str(body)[:150]}", "401/403", "Critical")

# TC-AUTH-004: Customer Registration (OTP flow - mock)
sc, body = api("post", "/auth/otp/send", {"phone": "9876543210"})
log(f"   OTP Send: HTTP {sc} => {str(body)[:200]}")
if sc in (200, 201):
    record("TC-AUTH-004", "Customer Order Mgmt", "Customer OTP send for registration", "PASS",
           f"HTTP {sc}, {str(body)[:200]}", "OTP sent successfully")
    # Try verify with mock OTP
    sc2, body2 = api("post", "/auth/otp/verify", {"phone": "9876543210", "otp": "1234"})
    log(f"   OTP Verify: HTTP {sc2} => {str(body2)[:300]}")
    if sc2 == 200 and isinstance(body2, dict) and body2.get("token"):
        TOKENS["customer"] = body2["token"]
        record("TC-AUTH-005", "Customer Order Mgmt", "Customer OTP verify + auto-register", "PASS",
               f"HTTP 200, customer token received", "Login/registration success + token")
    else:
        record("TC-AUTH-005", "Customer Order Mgmt", "Customer OTP verify + auto-register", "FAIL",
               f"HTTP {sc2}, {str(body2)[:300]}", "HTTP 200 + token", "High")
else:
    record("TC-AUTH-004", "Customer Order Mgmt", "Customer OTP send for registration", "FAIL",
           f"HTTP {sc}, {str(body)[:200]}", "HTTP 200 OTP sent", "High")

# TC-AUTH-006: Seller Login
sc, body = api("post", "/seller/login", {"email": "seller@test.com", "password": "Test@1234"})
log(f"   Seller Login attempt: HTTP {sc} => {str(body)[:200]}")
if sc == 200 and isinstance(body, dict) and body.get("token"):
    TOKENS["seller"] = body["token"]
    record("TC-AUTH-006", "Roles & Permissions", "Seller login", "PASS",
           f"HTTP 200, seller token received", "Seller login success")
else:
    record("TC-AUTH-006", "Roles & Permissions", "Seller login", "BLOCKED",
           f"No valid seller credentials available. HTTP {sc}", "Seller login success")

# ─────────────────────────────────────────
# PHASE 3: ADMIN DATA ACCESS
# ─────────────────────────────────────────
log("\n========== PHASE 3: ADMIN DATA ACCESS ==========")

admin_tok = TOKENS.get("admin")

if admin_tok:
    # TC-ADM-001: Get all categories
    sc, body = api("get", "/admin/categories", token=admin_tok)
    if sc == 200:
        cats = body if isinstance(body, list) else body.get("categories", body.get("data", []))
        record("TC-ADM-001", "Catalog, Search & Discovery", "Admin can fetch categories", "PASS",
               f"HTTP 200, {len(cats) if isinstance(cats, list) else '?'} categories", "Categories list returned")
    else:
        record("TC-ADM-001", "Catalog, Search & Discovery", "Admin can fetch categories", "FAIL",
               f"HTTP {sc}, {str(body)[:200]}", "HTTP 200 categories", "Medium")

    # TC-ADM-002: Get all sellers
    sc, body = api("get", "/admin/sellers", token=admin_tok)
    log(f"   Admin sellers: HTTP {sc} => {str(body)[:300]}")
    if sc == 200:
        sellers = body if isinstance(body, list) else body.get("sellers", body.get("data", []))
        record("TC-ADM-002", "Onboarding, Subscription & Comm", "Admin can view all sellers", "PASS",
               f"HTTP 200, {len(sellers) if isinstance(sellers, list) else '?'} sellers", "Sellers list returned")
        # Try to get a seller token for further tests
        if isinstance(sellers, list) and sellers:
            TOKENS["first_seller_id"] = str(sellers[0].get("_id", ""))
    else:
        record("TC-ADM-002", "Onboarding, Subscription & Comm", "Admin can view all sellers", "FAIL",
               f"HTTP {sc}, {str(body)[:200]}", "HTTP 200 sellers", "Medium")

    # TC-ADM-003: Get all orders
    sc, body = api("get", "/admin/orders", token=admin_tok)
    log(f"   Admin orders: HTTP {sc} => {str(body)[:300]}")
    if sc == 200:
        orders = body if isinstance(body, list) else body.get("orders", body.get("data", []))
        record("TC-ADM-003", "Customer Order Mgmt", "Admin can view all orders", "PASS",
               f"HTTP 200, {len(orders) if isinstance(orders, list) else '?'} orders", "Orders list")
    else:
        record("TC-ADM-003", "Customer Order Mgmt", "Admin can view all orders", "FAIL",
               f"HTTP {sc}, {str(body)[:200]}", "HTTP 200 orders", "High")

    # TC-ADM-004: Get platform settings
    sc, body = api("get", "/settings", token=admin_tok)
    if sc == 200:
        record("TC-ADM-004", "Pricing, Charges & Settlement", "Platform settings accessible", "PASS",
               f"HTTP 200, keys={list(body.keys())[:8] if isinstance(body, dict) else 'N/A'}", "Settings returned")
    else:
        record("TC-ADM-004", "Pricing, Charges & Settlement", "Platform settings accessible", "FAIL",
               f"HTTP {sc}, {str(body)[:150]}", "HTTP 200", "Medium")

    # TC-ADM-005: Get subscription plans
    sc, body = api("get", "/admin/subscription-plans", token=admin_tok)
    log(f"   Subscription plans: HTTP {sc} => {str(body)[:300]}")
    if sc == 200:
        plans = body if isinstance(body, list) else body.get("plans", body.get("data", []))
        record("TC-ADM-005", "Onboarding, Subscription & Comm", "Admin can view subscription plans", "PASS",
               f"HTTP 200, {len(plans) if isinstance(plans, list) else '?'} plans", "Plans list")
    else:
        record("TC-ADM-005", "Onboarding, Subscription & Comm", "Admin can view subscription plans", "FAIL" if sc != 404 else "BLOCKED",
               f"HTTP {sc}, {str(body)[:150]}", "HTTP 200 plans", "Medium")

    # TC-ADM-006: Get reward config
    sc, body = api("get", "/rewards/config", token=admin_tok)
    log(f"   Rewards config: HTTP {sc} => {str(body)[:300]}")
    if sc == 200:
        record("TC-ADM-006", "Reward Engine", "Reward configuration accessible", "PASS",
               f"HTTP 200, config={str(body)[:200]}", "Reward config returned")
    else:
        record("TC-ADM-006", "Reward Engine", "Reward configuration accessible", "FAIL" if sc not in (404,) else "BLOCKED",
               f"HTTP {sc}, {str(body)[:150]}", "HTTP 200", "Medium")

    # TC-ADM-007: Products listing
    sc, body = api("get", "/products", token=admin_tok)
    if sc == 200:
        prods = body if isinstance(body, list) else body.get("products", body.get("data", []))
        record("TC-ADM-007", "Catalog, Search & Discovery", "Admin can view products", "PASS",
               f"HTTP 200, {len(prods) if isinstance(prods, list) else '?'} products", "Product list")
    else:
        record("TC-ADM-007", "Catalog, Search & Discovery", "Admin can view products", "FAIL",
               f"HTTP {sc}, {str(body)[:150]}", "HTTP 200", "Medium")

    # TC-ADM-008: Coupons
    sc, body = api("get", "/coupons", token=admin_tok)
    log(f"   Coupons: HTTP {sc} => {str(body)[:200]}")
    if sc == 200:
        record("TC-ADM-008", "Pricing, Charges & Settlement", "Admin can view coupons", "PASS",
               f"HTTP 200, {str(body)[:150]}", "Coupons list")
    else:
        record("TC-ADM-008", "Pricing, Charges & Settlement", "Admin can view coupons", "FAIL" if sc != 404 else "BLOCKED",
               f"HTTP {sc}, {str(body)[:150]}", "HTTP 200", "Low")

else:
    for tcid in ["TC-ADM-001","TC-ADM-002","TC-ADM-003","TC-ADM-004","TC-ADM-005","TC-ADM-006","TC-ADM-007","TC-ADM-008"]:
        record(tcid, "Admin", "Admin data access tests", "BLOCKED", "Admin login failed - no token", "Requires admin auth")

# ─────────────────────────────────────────
# PHASE 4: CUSTOMER FLOWS
# ─────────────────────────────────────────
log("\n========== PHASE 4: CUSTOMER FLOWS ==========")

cust_tok = TOKENS.get("customer")

if cust_tok:
    # TC-CUST-001: Get customer profile
    sc, body = api("get", "/customer/profile", token=cust_tok)
    log(f"   Customer profile: HTTP {sc} => {str(body)[:300]}")
    if sc == 200:
        record("TC-CUST-001", "Customer Order Mgmt", "Customer can view own profile", "PASS",
               f"HTTP 200, profile={str(body)[:200]}", "Profile data returned")
    else:
        record("TC-CUST-001", "Customer Order Mgmt", "Customer can view own profile", "FAIL",
               f"HTTP {sc}, {str(body)[:200]}", "HTTP 200 profile", "High")

    # TC-CUST-002: Get cart
    sc, body = api("get", "/cart", token=cust_tok)
    log(f"   Cart: HTTP {sc} => {str(body)[:200]}")
    if sc in (200, 404):
        record("TC-CUST-002", "Customer Order Mgmt", "Customer cart accessible", "PASS",
               f"HTTP {sc} cart retrieved", "Cart returned (empty or existing)")
    else:
        record("TC-CUST-002", "Customer Order Mgmt", "Customer cart accessible", "FAIL",
               f"HTTP {sc}, {str(body)[:200]}", "HTTP 200/404 cart", "High")

    # TC-CUST-003: Browse categories (public)
    sc, body = api("get", "/categories")
    if sc == 200:
        cats = body if isinstance(body, list) else body.get("categories", body.get("data", []))
        record("TC-CUST-003", "Catalog, Search & Discovery", "Public category listing works", "PASS",
               f"HTTP 200, {len(cats) if isinstance(cats, list) else '?'} categories", "Categories visible to customer")
    else:
        record("TC-CUST-003", "Catalog, Search & Discovery", "Public category listing works", "FAIL",
               f"HTTP {sc}", "HTTP 200", "High")

    # TC-CUST-004: Search products
    sc, body = api("get", "/products", params={"search": "milk", "limit": 5})
    log(f"   Product search: HTTP {sc} => {str(body)[:200]}")
    if sc == 200:
        record("TC-CUST-004", "Catalog, Search & Discovery", "Product search works", "PASS",
               f"HTTP 200, results={str(body)[:150]}", "Search results returned")
    else:
        record("TC-CUST-004", "Catalog, Search & Discovery", "Product search works", "FAIL",
               f"HTTP {sc}", "HTTP 200 search results", "High")

    # TC-CUST-005: Get order history
    sc, body = api("get", "/orders", token=cust_tok)
    log(f"   Customer orders: HTTP {sc} => {str(body)[:200]}")
    if sc == 200:
        record("TC-CUST-005", "Customer Order Mgmt", "Customer order history accessible", "PASS",
               f"HTTP 200", "Orders list returned")
    else:
        record("TC-CUST-005", "Customer Order Mgmt", "Customer order history accessible", "FAIL",
               f"HTTP {sc}, {str(body)[:150]}", "HTTP 200", "High")

    # TC-CUST-006: Wallet balance
    sc, body = api("get", "/customer/wallet", token=cust_tok)
    log(f"   Wallet: HTTP {sc} => {str(body)[:200]}")
    if sc == 200:
        record("TC-CUST-006", "Pricing, Charges & Settlement", "Customer wallet balance accessible", "PASS",
               f"HTTP 200, balance={str(body)[:150]}", "Wallet data returned")
    else:
        record("TC-CUST-006", "Pricing, Charges & Settlement", "Customer wallet balance accessible", "FAIL" if sc != 404 else "BLOCKED",
               f"HTTP {sc}", "HTTP 200", "Medium")

    # TC-CUST-007: Reward balance
    sc, body = api("get", "/rewards/balance", token=cust_tok)
    log(f"   Rewards balance: HTTP {sc} => {str(body)[:200]}")
    if sc == 200:
        record("TC-CUST-007", "Reward Engine", "Customer reward balance accessible", "PASS",
               f"HTTP 200, {str(body)[:150]}", "Reward balance returned")
    else:
        record("TC-CUST-007", "Reward Engine", "Customer reward balance accessible", "FAIL" if sc != 404 else "BLOCKED",
               f"HTTP {sc}", "HTTP 200", "Medium")

    # TC-CUST-008: Wishlist
    sc, body = api("get", "/wishlist", token=cust_tok)
    if sc in (200, 404):
        record("TC-CUST-008", "Catalog, Search & Discovery", "Customer wishlist accessible", "PASS",
               f"HTTP {sc}", "Wishlist returned")
    else:
        record("TC-CUST-008", "Catalog, Search & Discovery", "Customer wishlist accessible", "FAIL",
               f"HTTP {sc}", "HTTP 200/404", "Low")

    # TC-CUST-009: Notifications
    sc, body = api("get", "/notifications", token=cust_tok)
    if sc == 200:
        record("TC-CUST-009", "Notifications & Post-Order", "Customer notifications accessible", "PASS",
               f"HTTP 200", "Notifications returned")
    else:
        record("TC-CUST-009", "Notifications & Post-Order", "Customer notifications accessible", "FAIL" if sc != 404 else "BLOCKED",
               f"HTTP {sc}", "HTTP 200", "Medium")

else:
    for tcid in ["TC-CUST-001","TC-CUST-002","TC-CUST-003","TC-CUST-004","TC-CUST-005","TC-CUST-006","TC-CUST-007","TC-CUST-008","TC-CUST-009"]:
        record(tcid, "Customer Order Mgmt", "Customer flow tests", "BLOCKED", "No customer token available", "Requires customer auth")

# ─────────────────────────────────────────
# PHASE 5: ROLES & PERMISSIONS SECURITY
# ─────────────────────────────────────────
log("\n========== PHASE 5: ROLES & PERMISSIONS ==========")

# TC-PERM-001: Customer cannot access admin endpoint
sc, body = api("get", "/admin/orders", token=cust_tok)
if sc in (401, 403):
    record("TC-PERM-001", "Roles & Permissions", "Customer cannot access admin orders endpoint", "PASS",
           f"HTTP {sc} - correctly blocked", "401/403 unauthorized")
else:
    record("TC-PERM-001", "Roles & Permissions", "Customer cannot access admin orders endpoint", "FAIL",
           f"HTTP {sc} - security bypass! body={str(body)[:150]}", "401/403", "Critical")

# TC-PERM-002: Seller cannot access admin endpoint
sc, body = api("get", "/admin/orders", token=TOKENS.get("seller"))
if sc in (401, 403):
    record("TC-PERM-002", "Roles & Permissions", "Seller cannot access admin endpoint", "PASS",
           f"HTTP {sc} - correctly blocked", "401/403")
else:
    if not TOKENS.get("seller"):
        record("TC-PERM-002", "Roles & Permissions", "Seller cannot access admin endpoint", "BLOCKED",
               "No seller token available", "Seller token required")
    else:
        record("TC-PERM-002", "Roles & Permissions", "Seller cannot access admin endpoint", "FAIL",
               f"HTTP {sc} - security bypass!", "401/403", "Critical")

# TC-PERM-003: No token - protected endpoints return 401
endpoints_to_check = [
    ("/orders", "orders listing"),
    ("/cart", "cart"),
    ("/customer/profile", "customer profile"),
]
for ep, name in endpoints_to_check:
    sc, body = api("get", ep)
    if sc in (401, 403):
        record(f"TC-PERM-003-{name.replace(' ','-')}", "Roles & Permissions",
               f"Unauthenticated access to {name} blocked", "PASS",
               f"HTTP {sc}", "401/403")
    else:
        record(f"TC-PERM-003-{name.replace(' ','-')}", "Roles & Permissions",
               f"Unauthenticated access to {name} blocked", "FAIL",
               f"HTTP {sc} - no auth required?", "401/403", "Critical")

# TC-PERM-004: Invalid JWT token rejected
sc, body = api("get", "/orders", token="invalidtoken12345")
if sc in (401, 403):
    record("TC-PERM-004", "Roles & Permissions", "Invalid JWT token rejected", "PASS",
           f"HTTP {sc}", "401/403 for invalid token")
else:
    record("TC-PERM-004", "Roles & Permissions", "Invalid JWT token rejected", "FAIL",
           f"HTTP {sc} - invalid token accepted?", "401/403", "Critical")

# ─────────────────────────────────────────
# PHASE 6: SELLER OPERATIONS
# ─────────────────────────────────────────
log("\n========== PHASE 6: SELLER OPERATIONS ==========")

seller_tok = TOKENS.get("seller")

if admin_tok:
    # Try to get seller list and login as first seller
    sc, body = api("get", "/admin/sellers", token=admin_tok)
    if sc == 200 and isinstance(body, dict):
        sellers_list = body.get("sellers", body.get("data", []))
    elif sc == 200 and isinstance(body, list):
        sellers_list = body
    else:
        sellers_list = []
    
    log(f"   Found {len(sellers_list)} sellers in system")
    
    if sellers_list:
        first_seller = sellers_list[0]
        log(f"   First seller: {first_seller.get('name','?')} / {first_seller.get('email','?')}")
        # Try known test credentials
        for email, pwd in [("seller@test.com","Test@1234"), ("seller@zinto.com","Seller@123"), 
                           (first_seller.get("email",""),"Test@1234"), ("seller@gmail.com","123456")]:
            if not email:
                continue
            sc2, body2 = api("post", "/seller/login", {"email": email, "password": pwd})
            if sc2 == 200 and isinstance(body2, dict) and body2.get("token"):
                TOKENS["seller"] = body2["token"]
                seller_tok = body2["token"]
                log(f"   ✅ Seller login success: {email}")
                break

if seller_tok:
    sc, body = api("get", "/seller/profile", token=seller_tok)
    log(f"   Seller profile: HTTP {sc} => {str(body)[:300]}")
    if sc == 200:
        record("TC-SELL-001", "Partial Order & Seller Ops", "Seller can view own profile", "PASS",
               f"HTTP 200", "Seller profile returned")
    else:
        record("TC-SELL-001", "Partial Order & Seller Ops", "Seller can view own profile", "FAIL",
               f"HTTP {sc}", "HTTP 200", "High")

    sc, body = api("get", "/seller/orders", token=seller_tok)
    log(f"   Seller orders: HTTP {sc} => {str(body)[:200]}")
    if sc == 200:
        record("TC-SELL-002", "Partial Order & Seller Ops", "Seller can view own orders", "PASS",
               f"HTTP 200", "Seller order list")
    else:
        record("TC-SELL-002", "Partial Order & Seller Ops", "Seller can view own orders", "FAIL",
               f"HTTP {sc}", "HTTP 200", "High")

    sc, body = api("get", "/seller/products", token=seller_tok)
    log(f"   Seller products: HTTP {sc} => {str(body)[:200]}")
    if sc == 200:
        record("TC-SELL-003", "Catalog, Search & Discovery", "Seller can view own products", "PASS",
               f"HTTP 200", "Seller product list")
    else:
        record("TC-SELL-003", "Catalog, Search & Discovery", "Seller can view own products", "FAIL",
               f"HTTP {sc}", "HTTP 200", "Medium")
else:
    for tcid in ["TC-SELL-001","TC-SELL-002","TC-SELL-003"]:
        record(tcid, "Partial Order & Seller Ops", "Seller operation tests", "BLOCKED",
               "No seller credentials found to login", "Valid seller credentials needed")

# ─────────────────────────────────────────
# PHASE 7: NEGATIVE TESTING
# ─────────────────────────────────────────
log("\n========== PHASE 7: NEGATIVE TESTING ==========")

# TC-NEG-001: Login with empty credentials
sc, body = api("post", "/admin/login", {"email": "", "password": ""})
if sc in (400, 401, 422):
    record("TC-NEG-001", "Exception & Negative Testing", "Empty credential login rejected", "PASS",
           f"HTTP {sc}", "4xx validation error")
else:
    record("TC-NEG-001", "Exception & Negative Testing", "Empty credential login rejected", "FAIL",
           f"HTTP {sc} - empty creds accepted?", "400/401/422", "High")

# TC-NEG-002: SQL/NoSQL injection in login
sc, body = api("post", "/admin/login", {"email": {"$gt": ""}, "password": "x"})
if sc in (400, 401, 422, 500):
    record("TC-NEG-002", "Exception & Negative Testing", "NoSQL injection in login field rejected", "PASS" if sc != 500 else "FAIL",
           f"HTTP {sc}", "Injection rejected cleanly")
else:
    record("TC-NEG-002", "Exception & Negative Testing", "NoSQL injection in login field rejected", "FAIL",
           f"HTTP {sc} - injection may have worked!", "Rejection", "Critical")

# TC-NEG-003: Access nonexistent order
sc, body = api("get", "/orders/nonexistentorderid999999", token=cust_tok or admin_tok)
if sc in (400, 404, 422):
    record("TC-NEG-003", "Exception & Negative Testing", "Accessing nonexistent order returns 404", "PASS",
           f"HTTP {sc}", "404 not found")
else:
    record("TC-NEG-003", "Exception & Negative Testing", "Accessing nonexistent order returns 404", "FAIL",
           f"HTTP {sc}, body={str(body)[:150]}", "404 not found", "Medium")

# TC-NEG-004: Large page size parameter
sc, body = api("get", "/products", params={"limit": 99999, "page": 1})
if sc in (200, 400):
    record("TC-NEG-004", "Exception & Negative Testing", "Extreme page size handled gracefully", "PASS",
           f"HTTP {sc} - handled without crash", "No server crash")
else:
    record("TC-NEG-004", "Exception & Negative Testing", "Extreme page size handled gracefully", "FAIL",
           f"HTTP {sc}", "Graceful handling", "Low")

# TC-NEG-005: POST to GET-only endpoint
sc, body = api("post", "/categories", {"name": "hack"})
if sc in (401, 403, 404, 405):
    record("TC-NEG-005", "Exception & Negative Testing", "POST to read-only category endpoint rejected", "PASS",
           f"HTTP {sc}", "Method not allowed / unauthorized")
else:
    record("TC-NEG-005", "Exception & Negative Testing", "POST to read-only category endpoint rejected", "FAIL",
           f"HTTP {sc} - unexpected accept without auth", "4xx", "High")

# ─────────────────────────────────────────
# PHASE 8: SEO ENDPOINTS
# ─────────────────────────────────────────
log("\n========== PHASE 8: SEO ==========")

# TC-SEO-001: sitemap
try:
    r = requests.get("http://localhost:7000/sitemap.xml", timeout=5)
    if r.status_code == 200 and "xml" in r.text[:50].lower():
        record("TC-SEO-001", "SEO & Discoverability", "Sitemap.xml accessible and valid XML", "PASS",
               f"HTTP 200, XML content present", "XML sitemap")
    else:
        record("TC-SEO-001", "SEO & Discoverability", "Sitemap.xml accessible", "FAIL",
               f"HTTP {r.status_code}, content={r.text[:100]}", "HTTP 200 XML sitemap", "Medium")
except:
    # Try via API
    sc, body = api("get", "/public/sitemap")
    if sc == 200:
        record("TC-SEO-001", "SEO & Discoverability", "Sitemap accessible via API", "PASS",
               f"HTTP 200", "Sitemap returned")
    else:
        record("TC-SEO-001", "SEO & Discoverability", "Sitemap.xml accessible", "FAIL",
               f"No sitemap found HTTP {sc}", "XML sitemap", "Medium")

# TC-SEO-002: robots.txt
try:
    r = requests.get("http://localhost:7000/robots.txt", timeout=5)
    if r.status_code == 200:
        record("TC-SEO-002", "SEO & Discoverability", "robots.txt accessible", "PASS",
               f"HTTP 200, content={r.text[:100]}", "robots.txt present")
    else:
        record("TC-SEO-002", "SEO & Discoverability", "robots.txt accessible", "FAIL",
               f"HTTP {r.status_code}", "robots.txt", "Low")
except Exception as e:
    record("TC-SEO-002", "SEO & Discoverability", "robots.txt accessible", "FAIL",
           f"Error: {e}", "robots.txt", "Low")

# TC-SEO-003: Public store page / SEO slug
sc, body = api("get", "/public/stores")
log(f"   Public stores SEO: HTTP {sc} => {str(body)[:200]}")
if sc == 200:
    record("TC-SEO-003", "SEO & Discoverability", "Public store discovery endpoint works", "PASS",
           f"HTTP 200", "Public store list for SEO")
else:
    record("TC-SEO-003", "SEO & Discoverability", "Public store discovery endpoint works", "FAIL" if sc != 404 else "BLOCKED",
           f"HTTP {sc}", "HTTP 200", "Medium")

# ─────────────────────────────────────────
# PHASE 9: PERFORMANCE BASICS
# ─────────────────────────────────────────
log("\n========== PHASE 9: PERFORMANCE ==========")

import time

perf_tests = [
    ("/health", "Health endpoint"),
    ("/categories", "Categories listing"),
    ("/products", "Products listing"),
]

for path, name in perf_tests:
    start = time.time()
    try:
        r = requests.get(f"http://localhost:7000{path if path.startswith('/health') else '/api'+path}", timeout=10)
        elapsed_ms = (time.time() - start) * 1000
        sc = r.status_code
    except Exception as e:
        elapsed_ms = 9999
        sc = 0

    if elapsed_ms < 2000 and sc in (200, 401):
        record(f"TC-PERF-{name.replace(' ','-')}", "Performance & UX",
               f"{name} response time acceptable", "PASS",
               f"HTTP {sc}, {elapsed_ms:.0f}ms < 2000ms SLA", "< 2000ms response")
    else:
        record(f"TC-PERF-{name.replace(' ','-')}", "Performance & UX",
               f"{name} response time acceptable", "FAIL",
               f"HTTP {sc}, {elapsed_ms:.0f}ms (exceeds 2000ms SLA or failed)", "< 2000ms", "Medium")

# ─────────────────────────────────────────
# SUMMARY
# ─────────────────────────────────────────
log("\n" + "="*60)
log("TEST EXECUTION SUMMARY")
log("="*60)

from collections import Counter
status_counts = Counter(r["status"] for r in RESULTS)
total = len(RESULTS)
log(f"Total Executed: {total}")
log(f"  PASS:    {status_counts.get('PASS', 0)}")
log(f"  FAIL:    {status_counts.get('FAIL', 0)}")
log(f"  BLOCKED: {status_counts.get('BLOCKED', 0)}")
log(f"  Pass%:   {status_counts.get('PASS',0)/total*100:.1f}%")

log("\nFAILURES:")
for r in RESULTS:
    if r["status"] == "FAIL":
        log(f"  ❌ [{r['tc_id']}] {r['scenario']}")
        log(f"     Actual:   {r['actual']}")
        log(f"     Severity: {r['severity']}")

log("\nBLOCKED:")
for r in RESULTS:
    if r["status"] == "BLOCKED":
        log(f"  ⚠️  [{r['tc_id']}] {r['scenario']}: {r['actual']}")

# Save results
with open(r"d:\AppZeto\GrandBazar\qa_results_batch1.json", "w", encoding="utf-8") as f:
    json.dump(RESULTS, f, indent=2, ensure_ascii=False)

log(f"\nResults saved to qa_results_batch1.json")
