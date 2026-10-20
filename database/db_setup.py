"""
DocuMind MySQL InnoDB Schema Initializer.
Migrated from SQLite3 FTS5 → MySQL InnoDB FULLTEXT search.

Tables created:
  - documents      : master document registry with FULLTEXT index
  - users          : user authentication & settings
  - ocr_queue      : background OCR processing queue

Run standalone:  python database/db_setup.py
"""

import pymysql


# === [TAG FUNGSI: Koneksi Server Dasar (_get_server_connection)] ===
# Penjelasan: Menghubungkan Python ke server MySQL tanpa memilih database, digunakan untuk menjalankan perintah CREATE DATABASE
def _get_server_connection(cfg: dict):
    """Connect to MySQL server WITHOUT selecting a database (for CREATE DATABASE)."""
    return pymysql.connect(
        host=cfg['host'],
        port=cfg['port'],
        user=cfg['user'],
        password=cfg['password'],
        charset=cfg.get('charset', 'utf8mb4'),
        cursorclass=pymysql.cursors.DictCursor,
        autocommit=True,
    )


# === [TAG FUNGSI: Koneksi Database Spesifik (_get_db_connection)] ===
# Penjelasan: Menghubungkan langsung ke basis data target `documind` untuk menjalankan pembuatan tabel
def _get_db_connection(cfg: dict):
    """Connect to the target `documind` database."""
    return pymysql.connect(
        host=cfg['host'],
        port=cfg['port'],
        user=cfg['user'],
        password=cfg['password'],
        db=cfg['db'],
        charset=cfg.get('charset', 'utf8mb4'),
        cursorclass=pymysql.cursors.DictCursor,
        autocommit=True,
    )


# === [TAG FUNGSI UTAMA: Inisialisasi Skema Database (init_db)] ===
# Penjelasan: Membuat database documind jika belum ada, lalu mendefinisikan tabel `users`, tabel `documents` (dengan indeks InnoDB FULLTEXT dan Foreign Key ON DELETE CASCADE), serta tabel antrean `ocr_queue`
def init_db(db_config: dict):
    """
    Create the 'documind' database (if absent) and initialise all InnoDB tables
    with appropriate FULLTEXT / foreign-key constraints.
    """
    db_name = db_config['db']

    # ── Step 1: Ensure the database exists ───────────────────────────────────
    server_conn = _get_server_connection(db_config)
    try:
        with server_conn.cursor() as cur:
            cur.execute(
                f"CREATE DATABASE IF NOT EXISTS `{db_name}` "
                f"CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
            )
        print(f"[DB Init] Database `{db_name}` is ready.")
    finally:
        server_conn.close()

    # ── Step 2: Create all tables ─────────────────────────────────────────────
    conn = _get_db_connection(db_config)
    try:
        with conn.cursor() as cur:

            # ── users ────────────────────────────────────────────────────────
            # === [TAG TABEL: Skema Tabel Pengguna (users)] ===
            # Penjelasan: Menyimpan data akun, hash password, URL avatar, role, preferensi format JSON, dan riwayat login
            cur.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    id            INT          UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                    full_name     VARCHAR(255) NOT NULL,
                    email         VARCHAR(255) NOT NULL UNIQUE,
                    password_hash VARCHAR(255) NOT NULL,
                    avatar_url    VARCHAR(512) DEFAULT NULL,
                    role          VARCHAR(50)  NOT NULL DEFAULT 'user',
                    settings_json JSON         DEFAULT NULL,
                    created_at    DATETIME     DEFAULT CURRENT_TIMESTAMP,
                    last_login    DATETIME     DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_email (email)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            """)

            # ── documents (Scoped to User ID for multi-tenant isolation) ──────
            # === [TAG TABEL: Skema Tabel Dokumen Terindeks (documents)] ===
            # Penjelasan: Master tabel dokumen yang menyimpan relasi user_id, metadata, teks hasil OCR (extracted_text), dan indeks FULLTEXT (ft_search) untuk pencarian instan
            cur.execute("""
                CREATE TABLE IF NOT EXISTS documents (
                    id                INT          UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                    user_id           INT          UNSIGNED NOT NULL,
                    filename_original VARCHAR(512) NOT NULL,
                    filepath          TEXT         NOT NULL,
                    file_type         VARCHAR(50)  NOT NULL,
                    category          VARCHAR(100) NOT NULL DEFAULT 'General',
                    file_size         BIGINT       UNSIGNED NOT NULL DEFAULT 0,
                    extracted_text    LONGTEXT,
                    ocr_confidence    FLOAT        DEFAULT 0.95,
                    uploaded_at       DATETIME     DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_user_id (user_id),
                    FULLTEXT INDEX ft_search (extracted_text, filename_original),
                    CONSTRAINT fk_documents_user
                        FOREIGN KEY (user_id) REFERENCES users(id)
                        ON DELETE CASCADE ON UPDATE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            """)

            # ── Migration: Ensure user_id column exists on documents ─────────
            cur.execute("SHOW COLUMNS FROM documents LIKE 'user_id'")
            if not cur.fetchone():
                cur.execute("ALTER TABLE documents ADD COLUMN user_id INT UNSIGNED NOT NULL AFTER id, ADD INDEX idx_user_id (user_id)")
                print("[DB Migration] Added user_id column to documents table.")

            # ── ocr_queue ────────────────────────────────────────────────────
            # === [TAG TABEL: Skema Tabel Antrean Pemrosesan (ocr_queue)] ===
            # Penjelasan: Melacak progres pemindaian teks dokumen yang sedang berlangsung (Queueing, Scanning, Extracting, Completed, Failed)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS ocr_queue (
                    id               INT          UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                    document_id      INT          UNSIGNED,
                    user_id          INT          UNSIGNED,
                    queue_pos        INT          UNSIGNED DEFAULT 0,
                    source_type      VARCHAR(100) DEFAULT 'Web Dropzone',
                    progress_percent TINYINT      UNSIGNED DEFAULT 0,
                    status           ENUM('Queueing', 'Scanning', 'Extracting', 'Completed', 'Failed')
                                     DEFAULT 'Queueing',
                    created_at       DATETIME     DEFAULT CURRENT_TIMESTAMP,
                    updated_at       DATETIME     DEFAULT CURRENT_TIMESTAMP
                                     ON UPDATE CURRENT_TIMESTAMP,
                    INDEX idx_user_id (user_id),
                    CONSTRAINT fk_queue_doc
                        FOREIGN KEY (document_id) REFERENCES documents(id)
                        ON DELETE SET NULL ON UPDATE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            """)

            # ── Migration: Ensure user_id column exists on ocr_queue ─────────
            cur.execute("SHOW COLUMNS FROM ocr_queue LIKE 'user_id'")
            if not cur.fetchone():
                cur.execute("ALTER TABLE ocr_queue ADD COLUMN user_id INT UNSIGNED NULL AFTER document_id, ADD INDEX idx_queue_user_id (user_id)")
                print("[DB Migration] Added user_id column to ocr_queue table.")

        print("[DB Init] All InnoDB tables initialised successfully.")
        print(f"[DB Init] FULLTEXT index active on documents(extracted_text, filename_original).")

    finally:
        conn.close()


# === [TAG ENTRY POINT: Eksekusi Inisialisasi Mandiri] ===
# Penjelasan: Memungkinkan skrip dijalankan langsung dari command line (python database/db_setup.py)
if __name__ == '__main__':
    import sys
    from pathlib import Path

    # Allow running directly: python database/db_setup.py
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    from config import Config
    init_db(Config.DB_CONFIG)
