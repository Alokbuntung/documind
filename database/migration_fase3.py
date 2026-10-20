"""
DocuMind Fase 3 -- Database Refactoring Migration.

Tugas:
  1. Tambah Foreign Key: documents.user_id -> users.id (ON DELETE CASCADE)
  2. Hapus DEFAULT 1 pada documents.user_id
  3. Perbaiki last_login agar tidak auto-update saat row user diedit

Cara jalankan:
  cd e:/documind
  python database/migration_fase3.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pymysql
from config import Config


# === [TAG FUNGSI UTAMA: Eksekutor Migrasi Skema Database (run_migration)] ===
# Penjelasan: Memperbarui struktur tabel MySQL lama agar memiliki relasi Foreign Key (ON DELETE CASCADE), menghapus data yatim, dan mengamankan kolom last_login
def run_migration(cfg: dict):
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

            # ----------------------------------------------------------
            # 1. Perbaiki last_login: hapus ON UPDATE CURRENT_TIMESTAMP
            # ----------------------------------------------------------
            # === [TAG MIGRASI: Perbaikan Kolam Timestamp Sesi] ===
            # Penjelasan: Memastikan last_login hanya diperbarui saat user login nyata, bukan saat user mengedit profil
            print("[Migration] Perbaiki kolom last_login pada tabel users...")
            cur.execute("""
                ALTER TABLE users
                MODIFY COLUMN last_login DATETIME DEFAULT CURRENT_TIMESTAMP
            """)
            print("[Migration] OK - last_login tidak lagi ter-update otomatis saat edit profil.")

            # ----------------------------------------------------------
            # 2. Hapus DEFAULT 1 pada documents.user_id
            # ----------------------------------------------------------
            # === [TAG MIGRASI: Isolasi Multi-Tenant Pengguna] ===
            # Penjelasan: Mewajibkan setiap dokumen memiliki ID pemilik yang valid (tanpa nilai default)
            print("[Migration] Hapus DEFAULT 1 dari documents.user_id...")
            cur.execute("""
                ALTER TABLE documents
                MODIFY COLUMN user_id INT UNSIGNED NOT NULL
            """)
            print("[Migration] OK - documents.user_id sekarang wajib diisi eksplisit (tanpa default).")

            # ----------------------------------------------------------
            # 3. Tambah Foreign Key: documents.user_id -> users.id
            #    ON DELETE CASCADE: hapus user = hapus semua dokumennya
            # ----------------------------------------------------------
            # === [TAG MIGRASI: Penambahan Foreign Key & Penghapusan Dokumen Yatim] ===
            # Penjelasan: Membersihkan dokumen yang tidak memiliki pemilik sah dan menghubungkan foreign key CASCADE (user dihapus = dokumen otomatis terhapus)

            # Cek apakah FK sudah ada
            cur.execute("""
                SELECT CONSTRAINT_NAME
                FROM information_schema.TABLE_CONSTRAINTS
                WHERE TABLE_SCHEMA = %s
                  AND TABLE_NAME = 'documents'
                  AND CONSTRAINT_TYPE = 'FOREIGN KEY'
                  AND CONSTRAINT_NAME = 'fk_documents_user'
            """, (cfg['db'],))

            if cur.fetchone():
                print("[Migration] FK fk_documents_user sudah ada, di-drop dulu...")
                cur.execute("ALTER TABLE documents DROP FOREIGN KEY fk_documents_user")

            # Pastikan semua user_id di documents merujuk ke users.id yang valid
            cur.execute("""
                SELECT DISTINCT d.user_id
                FROM documents d
                LEFT JOIN users u ON d.user_id = u.id
                WHERE u.id IS NULL
            """)
            orphans = cur.fetchall()
            if orphans:
                orphan_ids = [row['user_id'] for row in orphans]
                print(f"[Migration] PERINGATAN: Ditemukan {len(orphan_ids)} dokumen yatim (user_id tidak valid): {orphan_ids}")
                print("[Migration]   Menghapus dokumen yatim agar FK bisa diterapkan...")
                cur.execute("""
                    DELETE d FROM documents d
                    LEFT JOIN users u ON d.user_id = u.id
                    WHERE u.id IS NULL
                """)
                print(f"[Migration]   OK - {cur.rowcount} dokumen yatim dihapus.")

            print("[Migration] Menambah Foreign Key fk_documents_user...")
            cur.execute("""
                ALTER TABLE documents
                ADD CONSTRAINT fk_documents_user
                    FOREIGN KEY (user_id) REFERENCES users(id)
                    ON DELETE CASCADE
                    ON UPDATE CASCADE
            """)
            print("[Migration] OK - FK documents.user_id -> users.id (ON DELETE CASCADE) berhasil ditambahkan.")

        conn.commit()
        print("")
        print("[Migration] === Fase 3 selesai. Semua perubahan telah di-commit. ===")

    except Exception as e:
        conn.rollback()
        print(f"")
        print(f"[Migration] GAGAL -- rollback dilakukan. Error: {e}")
        raise
    finally:
        conn.close()


# === [TAG ENTRY POINT: Eksekusi Migrasi] ===
# Penjelasan: Menjalankan fungsi run_migration menggunakan konfigurasi DB_CONFIG
if __name__ == '__main__':
    run_migration(Config.DB_CONFIG)
