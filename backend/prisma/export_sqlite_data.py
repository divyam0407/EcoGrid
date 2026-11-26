"""Read-only JSON exporter for the legacy SQLite to PostgreSQL migration."""

import json
import sqlite3
import sys
from pathlib import Path


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("Usage: export_sqlite_data.py <verified-backup.db>")
    path = Path(sys.argv[1]).resolve()
    if not path.is_file() or "backups" not in path.parts:
        raise SystemExit("Migration input must be a database file in the verified backups directory.")

    conn = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    try:
        conn.execute("PRAGMA query_only = ON")
        integrity = conn.execute("PRAGMA integrity_check").fetchone()[0]
        violations = conn.execute("PRAGMA foreign_key_check").fetchall()
        if integrity != "ok":
            raise RuntimeError("SQLite integrity_check failed; migration refused.")
        if violations:
            raise RuntimeError(f"SQLite foreign_key_check found {len(violations)} violations; migration refused.")

        table_names = [
            row[0]
            for row in conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
            )
            if row[0] != "_prisma_migrations"
        ]
        tables = {}
        columns = {}
        for name in table_names:
            columns[name] = [row[1] for row in conn.execute(f'PRAGMA table_info("{name}")')]
            tables[name] = [dict(row) for row in conn.execute(f'SELECT * FROM "{name}"')]
        json.dump({"integrity": integrity, "foreign_key_violations": 0, "columns": columns, "tables": tables}, sys.stdout, allow_nan=False)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
