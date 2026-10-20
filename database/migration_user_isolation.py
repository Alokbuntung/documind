"""
DocuMind User Data Isolation Database Migration Runner.
Safely adds user_id column and index to ocr_queue, synchronizes with documents,
and audits orphan records without deleting any data.
"""

import sys
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pymysql
from config import Config


def run_isolation_migration(cfg: dict):
    conn = pymysql.connect(
        host=cfg['host'],
        port=cfg['port'],
        user=cfg['user'],
        password=cfg['password'],
        db=cfg['db'],
        charset=cfg.get('charset', 'utf8mb4'),
        cursorclass=pymysql.cursors.DictCursor,
        autocommit=False,
    )

    try:
        with conn.cursor() as cur:
            print("[Migration] Checking documents table...")
            cur.execute("""
                SELECT COUNT(*) as cnt
                FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = %s AND TABLE_NAME = 'documents' AND COLUMN_NAME = 'user_id'
            """, (cfg['db'],))
            doc_user_col = cur.fetchone()['cnt']
            if doc_user_col:
                print("[Migration] documents.user_id column is present.")
            else:
                cur.execute("ALTER TABLE documents ADD COLUMN user_id INT UNSIGNED NOT NULL AFTER id, ADD INDEX idx_user_id (user_id)")
                print("[Migration] Added user_id to documents table.")

            # Check ocr_queue user_id column
            print("[Migration] Checking ocr_queue table...")
            cur.execute("""
                SELECT COUNT(*) as cnt
                FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = %s AND TABLE_NAME = 'ocr_queue' AND COLUMN_NAME = 'user_id'
            """, (cfg['db'],))
            queue_user_col = cur.fetchone()['cnt']
            if not queue_user_col:
                print("[Migration] Adding user_id column to ocr_queue...")
                cur.execute("ALTER TABLE ocr_queue ADD COLUMN user_id INT UNSIGNED NULL AFTER document_id")
                print("[Migration] Added user_id column to ocr_queue.")
            else:
                print("[Migration] ocr_queue.user_id already exists.")

            # Check index on ocr_queue(user_id)
            cur.execute("""
                SELECT COUNT(*) as cnt
                FROM information_schema.STATISTICS
                WHERE TABLE_SCHEMA = %s AND TABLE_NAME = 'ocr_queue' AND INDEX_NAME = 'idx_queue_user_id'
            """, (cfg['db'],))
            idx_exists = cur.fetchone()['cnt']
            if not idx_exists:
                cur.execute("ALTER TABLE ocr_queue ADD INDEX idx_queue_user_id (user_id)")
                print("[Migration] Added index idx_queue_user_id on ocr_queue(user_id).")

            # Synchronize user_id from documents to ocr_queue for valid document links
            cur.execute("""
                UPDATE ocr_queue q
                JOIN documents d ON q.document_id = d.id
                SET q.user_id = d.user_id
                WHERE q.user_id IS NULL
            """)
            synced = cur.rowcount
            print(f"[Migration] Synchronized {synced} ocr_queue rows from documents table.")

            # Audit orphan rows (user_id IS NULL)
            cur.execute("SELECT COUNT(*) as orphans FROM ocr_queue WHERE user_id IS NULL")
            orphan_count = cur.fetchone()['orphans']
            print(f"[Migration] Total orphan rows in ocr_queue (user_id IS NULL): {orphan_count}")
            print("[Migration] NOTE: Orphan rows are PRESERVED and NOT deleted.")

            conn.commit()
            print("[Migration] Migration completed successfully.")
            return orphan_count

    except Exception as e:
        conn.rollback()
        print(f"[Migration] Error during migration: {e}")
        raise
    finally:
        conn.close()


if __name__ == '__main__':
    run_isolation_migration(Config.DB_CONFIG)
