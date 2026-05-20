import sqlite3


TARGET_ID = "inventory-usage-d039cfdbf48e47cb9b512ad7bd1f6c27"
TEST_TEXT = "%测试%"


def main() -> None:
    conn = sqlite3.connect("/home/ubuntu/elder_backend/elder_care.db")
    cur = conn.cursor()
    rows = cur.execute(
        """
        SELECT id, item_name, quantity, note, used_at
        FROM inventory_usages
        WHERE note LIKE ? OR item_name LIKE ? OR id = ?
        """,
        (TEST_TEXT, TEST_TEXT, TARGET_ID),
    ).fetchall()
    cur.execute(
        "DELETE FROM inventory_usages WHERE note LIKE ? OR item_name LIKE ? OR id = ?",
        (TEST_TEXT, TEST_TEXT, TARGET_ID),
    )
    conn.commit()
    print({"deleted": cur.rowcount, "rows": rows})
    conn.close()


if __name__ == "__main__":
    main()
