import sqlite3, json
conn = sqlite3.connect("elder_care.db")
c = conn.cursor()

c.execute("SELECT id, name, floor FROM caregivers")
rows = c.fetchall()
print(f"CaregiverTable ({len(rows)} rows):")
for r in rows:
    print(f"  {r[0]} | {r[1]} | floor={r[2]}")

c.execute("SELECT id, name, floor FROM elders")
rows = c.fetchall()
print(f"ElderTable ({len(rows)} rows):")
for r in rows[:5]:
    print(f"  {r[0]} | {r[1]} | floor={r[2]}")

# Check institution_states
c.execute("SELECT institution_id, personnel_info FROM institution_states WHERE institution_id='demo-qinghe-care'")
row = c.fetchone()
if row:
    print(f"\ninstitution_states found: {row[0]}")
    if row[1]:
        pi = json.loads(row[1])
        cgs = pi.get("caregivers", [])
        elds = pi.get("elders", [])
        print(f"  personnel_info.caregivers: {len(cgs)}")
        for cg in cgs:
            print(f"    {cg.get('id','?')} | {cg.get('name','?')} | floor={cg.get('floor','?')}")
        print(f"  personnel_info.elders: {len(elds)}")
    else:
        print("  personnel_info is NULL")
else:
    print("\nNo institution_states row found!")

conn.close()
