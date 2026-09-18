import json
from collections import Counter

with open('d:/AppZeto/GrandBazar/qa_results_final.json') as f:
    results = json.load(f)

counts = Counter(r['status'] for r in results)
total = len(results)
print(f'Total: {total}')
print(f'PASS: {counts["PASS"]} ({counts["PASS"]/total*100:.1f}%)')
print(f'FAIL: {counts["FAIL"]} ({counts["FAIL"]/total*100:.1f}%)')
print(f'BLOCKED: {counts["BLOCKED"]} ({counts["BLOCKED"]/total*100:.1f}%)')

print()
print('=== FAILURES ===')
for r in results:
    if r['status'] == 'FAIL':
        print(f'  [{r["tc_id"]}] [{r.get("severity","?")}] {r["scenario"]}')
        print(f'    Actual: {r["actual"][:200]}')
        print()

print()
print('=== BLOCKED ===')
for r in results:
    if r['status'] == 'BLOCKED':
        print(f'  [{r["tc_id"]}] {r["scenario"]}: {r["actual"][:120]}')

print()
print('=== BY MODULE ===')
by_sheet = {}
for r in results:
    s = r['sheet']
    by_sheet.setdefault(s, {'PASS':0,'FAIL':0,'BLOCKED':0})
    by_sheet[s][r['status']] = by_sheet[s].get(r['status'],0)+1
for sheet, c in sorted(by_sheet.items()):
    t = c['PASS']+c['FAIL']+c['BLOCKED']
    pct = c['PASS']/t*100 if t else 0
    print(f"  {sheet:<45} P={c['PASS']:2d} F={c['FAIL']:2d} B={c['BLOCKED']:2d} ({pct:.0f}%)")
