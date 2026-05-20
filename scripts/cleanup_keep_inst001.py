import sqlite3
from pathlib import Path

KEEP = "inst-001"
DB_PATH = Path("/home/ubuntu/elder_backend/elder_care.db")

TENANT_TABLES = [
    "users",
    "caregivers",
    "elders",
    "published_tasks",
    "task_completions",
    "care_records",
    "daily_report_templates",
    "anomalies",
    "vitals",
]
ALL_TABLES = [
    "institutions",
    *TENANT_TABLES,
    "institution_states",
    "sessions",
    "app_releases",
    "admins",
    "ai_analysis_logs",
]


def count(cur: sqlite3.Cursor, table: str) -> int | None:
    try:
        return cur.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
    except sqlite3.Error:
        return None


def main() -> None:
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    before = {table: count(cur, table) for table in ALL_TABLES}

    for table in TENANT_TABLES:
        cur.execute(
            f"DELETE FROM {table} WHERE COALESCE(institution_id, '') != ?",
            (KEEP,),
        )

    cur.execute("DELETE FROM institution_states WHERE COALESCE(institution_id, '') != ?", (KEEP,))
    cur.execute("DELETE FROM institutions WHERE id != ?", (KEEP,))
    cur.execute(
        "UPDATE institutions SET name = ?, status = COALESCE(NULLIF(status, ''), 'active') WHERE id = ?",
        ("福乐镇智慧养老院", KEEP),
    )
    cur.execute("DELETE FROM sessions WHERE COALESCE(institution_id, '') NOT IN ('', ?)", (KEEP,))

    conn.commit()
    cur.execute("VACUUM")
    after = {table: count(cur, table) for table in ALL_TABLES}

    print("table,before,after")
    for table in ALL_TABLES:
        print(f"{table},{before[table]},{after[table]}")
    print("remaining institutions:")
    for row in cur.execute("SELECT id, name, status FROM institutions ORDER BY id"):
        print(row)
    conn.close()


if __name__ == "__main__":
    main()
