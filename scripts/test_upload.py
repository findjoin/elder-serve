import urllib.request, json, sqlite3

conn = sqlite3.connect("/home/ubuntu/elder_backend/elder_care.db")
c = conn.cursor()

task_id = "report-2026-05-11-elder-demo-201-demo-care-support-demo-medication"
c.execute("SELECT id, schedule, title, status FROM published_tasks WHERE id=?", (task_id,))
r = c.fetchone()
if r:
    print("DB schedule:", repr(r[1]))
    print("DB title:", repr(r[2]))
    print("DB status:", repr(r[3]))
else:
    print("Task not found in DB!")

c.execute("SELECT id, schedule, title FROM published_tasks WHERE record_date='2026-05-11' AND schedule!='' LIMIT 3")
fresh = c.fetchall()
print("\nFresh tasks with non-empty schedule:")
for f in fresh:
    print(f"  schedule={f[1]} title={f[2]}")

c.execute("SELECT COUNT(*) FROM published_tasks WHERE record_date='2026-05-11'")
print(f"\nTotal tasks: {c.fetchone()[0]}")

conn.close()

# Also test upload
print("\n--- Test upload ---")
data = json.dumps({
    "taskId": task_id,
    "institutionId": "demo-qinghe-care",
    "recordDate": "2026-05-11",
    "elderId": "elder-demo-201",
    "caregiverId": "caregiver-demo-02",
    "planItemId": task_id,
    "status": "risk",
    "exceptionNote": "final_test_v2",
    "exceptionType": "abnormal",
    "sourceApp": "caregiver-app"
}).encode()

req = urllib.request.Request(
    'http://localhost/api/tasks', data=data,
    headers={'x-api-key': 'elder_safe_token_2026', 'Content-Type': 'application/json'},
    method='POST'
)
resp = urllib.request.urlopen(req)
result = json.loads(resp.read())
item = result.get('item', {})

print("API status:", item.get("status"))
print("API title:", repr(item.get("title")))
print("API schedule:", repr(item.get("schedule")))
print("API elderName:", repr(item.get("elderName")))
print("API caregiverName:", repr(item.get("caregiverName")))
print("API exceptionNote:", repr(item.get("exceptionNote")))

if item.get("title") and item.get("schedule"):
    print("PASS: structural fields preserved")
else:
    print("FAIL: structural fields lost - schedule is empty")
