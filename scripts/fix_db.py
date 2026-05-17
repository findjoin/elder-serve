import sqlite3

conn = sqlite3.connect("elder_care.db")
c = conn.cursor()

# Only delete today's tasks so they regenerate
c.execute("DELETE FROM published_tasks WHERE record_date='2026-05-10'")
c.execute("DELETE FROM published_tasks WHERE record_date='2026-05-11'")
conn.commit()
print("Deleted tasks for May 10 and 11")
conn.close()
