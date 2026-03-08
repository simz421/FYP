import os
import sqlite3

# Adjust if your DB filename is different
DB_PATH = os.path.join(os.path.dirname(__file__), "instance", "nms.sqlite3")

COLUMNS_TO_ADD = [
    ("packets_received", "INTEGER", "0"),
    ("packets_missed", "INTEGER", "0"),
    ("uptime_seconds", "INTEGER", "0"),
]

def column_exists(conn: sqlite3.Connection, table: str, column: str) -> bool:
    cur = conn.execute(f"PRAGMA table_info({table})")
    cols = [row[1] for row in cur.fetchall()]  # row[1] = column name
    return column in cols

def main():
    if not os.path.exists(DB_PATH):
        raise FileNotFoundError(f"Database not found at: {DB_PATH}")

    conn = sqlite3.connect(DB_PATH)
    try:
        conn.execute("PRAGMA foreign_keys=ON;")

        # Ensure table exists
        cur = conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='nodes';")
        if not cur.fetchone():
            raise RuntimeError("Table 'nodes' does not exist. Check your models/table name.")

        added_any = False

        for col, coltype, default in COLUMNS_TO_ADD:
            if column_exists(conn, "nodes", col):
                print(f"✅ Column already exists: nodes.{col}")
                continue

            sql = f"ALTER TABLE nodes ADD COLUMN {col} {coltype} DEFAULT {default};"
            print("Running:", sql)
            conn.execute(sql)
            added_any = True
            print(f"✅ Added column: nodes.{col}")

        if added_any:
            conn.commit()
            print("\n✅ Database schema updated successfully.")
        else:
            print("\n✅ No changes needed. Schema already up to date.")

        # Print final columns
        print("\nCurrent nodes columns:")
        cur = conn.execute("PRAGMA table_info(nodes)")
        for row in cur.fetchall():
            print(" -", row[1], row[2])

    finally:
        conn.close()

if __name__ == "__main__":
    main()