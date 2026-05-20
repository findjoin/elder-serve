import sqlite3


DB_PATH = "/home/ubuntu/elder_backend/elder_care.db"


def main() -> None:
    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()
    cur.execute(
        "delete from anomalies where institution_id=? and caregiver_id=? and elder_id=? and type=?",
        ("", "caregiver-02", "elder-123-1777577323008", "异常情况"),
    )
    print(f"deleted {cur.rowcount}")
    con.commit()
    con.close()


if __name__ == "__main__":
    main()
