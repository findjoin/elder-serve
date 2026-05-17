import sqlite3, json, time

conn = sqlite3.connect("elder_care.db")
c = conn.cursor()

# Read institution_state
c.execute("SELECT personnel_info, task_info FROM institution_states WHERE institution_id='demo-qinghe-care'")
row = c.fetchone()
if not row:
    print("No institution_state row!")
    conn.close()
    exit()

pi = json.loads(row[0]) if row[0] else {}
ti = json.loads(row[1]) if row[1] else {}

# Seed caregivers
c.execute("DELETE FROM caregivers")
for cg in pi.get("caregivers", []):
    c.execute(
        "INSERT INTO caregivers (id, institution_id, name, floor, shift, status) VALUES (?, ?, ?, ?, ?, ?)",
        (cg.get("id", ""), "demo-qinghe-care", cg.get("name", ""), cg.get("floor", 1), cg.get("shift", "07:00 - 15:30"), cg.get("status", "off-duty"))
    )
print(f"Seeded {len(pi.get('caregivers', []))} caregivers")

# Seed elders
c.execute("DELETE FROM elders")
for e in pi.get("elders", []):
    c.execute(
        "INSERT INTO elders (id, institution_id, name, gender, age, floor, room, bed, level, report_template_id, report_template_title, assigned_caregiver_id, tags) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (
            e.get("id", ""), "demo-qinghe-care", e.get("name", ""),
            e.get("gender", "男"), int(e.get("age", 70)), int(e.get("floor", 1)),
            e.get("room", ""), e.get("bed", ""), e.get("level", "二级护理"),
            e.get("reportTemplateId", ""), e.get("reportTemplateTitle", ""),
            e.get("assignedCaregiverId", ""), json.dumps(e.get("tags", []))
        )
    )
print(f"Seeded {len(pi.get('elders', []))} elders")

# Clear today's tasks to force regeneration
c.execute("DELETE FROM published_tasks WHERE record_date='2026-05-10'")
c.execute("DELETE FROM published_tasks WHERE record_date='2026-05-11'")
print("Cleared old tasks for May 10-11")

conn.commit()

# Verify
c.execute("SELECT id, name, floor FROM caregivers")
rows = c.fetchall()
print(f"\nCaregiverTable ({len(rows)} rows):")
for r in rows:
    print(f"  {r[0]} | {r[1]} | floor={r[2]}")

c.execute("SELECT id, name, floor FROM elders")
rows = c.fetchall()
print(f"ElderTable ({len(rows)} rows):")
for r in rows:
    print(f"  {r[0]} | {r[1]} | floor={r[2]}")

conn.close()
