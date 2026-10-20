"""
DocuMind MySQL Document & Category Models.
Migrated from SQLite3 raw queries → PyMySQL with InnoDB FULLTEXT search.

All parameter placeholders use %s (MySQL style, NOT ? SQLite style).
DictCursor is used throughout so rows are returned as plain dicts.
"""

# === [TAG MODUL: Basis Data MySQL & Model Dokumen/Pengguna] ===
# Penjelasan: Mengelola seluruh komunikasi data dengan MySQL menggunakan PyMySQL dan DBUtils Connection Pooling.

import pymysql
import pymysql.cursors

from dbutils.pooled_db import PooledDB

_db_pool = None

# === [TAG FUNGSI: Manajemen Kolam Koneksi Database (get_db_pool)] ===
# Penjelasan: Menginisialisasi connection pool (maksimal 20 koneksi aktif bersamaan) menggunakan PooledDB agar query cepat, hemat memori, dan koneksi tidak mudah terputus
def get_db_pool(cfg):
    global _db_pool
    if _db_pool is None:
        pool_cfg = cfg.copy()
        pool_cfg.pop('cursorclass', None)
        _db_pool = PooledDB(
            creator=pymysql,
            maxconnections=20,
            mincached=2,
            maxcached=5,
            blocking=True,
            cursorclass=pymysql.cursors.DictCursor,
            **pool_cfg
        )
    return _db_pool


# === [TAG KELAS: Model Operasi Dokumen (DocumentModel)] ===
# Penjelasan: Menangani operasi CRUD dokumen, indeks teks MySQL Full-Text Search, dan pemantauan antrean pemrosesan
class DocumentModel:
    """
    Core document model — wraps all queries against the `documents` table
    and the six category sub-tables.
    """

    def __init__(self, db_config: dict):
        self.cfg = db_config

    # ──────────────────────────────────────────────────────────────────────────
    # Connection helper
    # ──────────────────────────────────────────────────────────────────────────

    # === [TAG HELPER: Ambil Koneksi Pool (_connect)] ===
    # Penjelasan: Mengambil satu slot koneksi aktif dari pool dengan cursor bertipe Dictionary (DictCursor)
    def _connect(self):
        """Return a pooled PyMySQL connection with DictCursor enabled."""
        pool = get_db_pool(self.cfg)
        return pool.connection()

    # ──────────────────────────────────────────────────────────────────────────
    # Document CRUD (Multi-Tenant User Isolated)
    # ──────────────────────────────────────────────────────────────────────────

    # === [TAG FUNGSI: Simpan Data Dokumen Baru (insert_document)] ===
    # Penjelasan: Menyimpan metadata berkas (nama, path, ukuran, kategori) beserta teks hasil OCR dan skor kepercayaan ke tabel documents
    def insert_document(
        self,
        filename: str,
        filepath: str,
        file_type: str,
        category: str,
        file_size: int,
        content: str,
        ocr_confidence: float = 0.95,
        user_id: int = None,
    ) -> int:
        """
        Insert a new document record scoped to user_id and return its auto-generated id.
        The `extracted_text` column is covered by the MySQL FULLTEXT index.
        """
        conn = self._connect()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO documents
                        (user_id, filename_original, filepath, file_type, category,
                         file_size, extracted_text, ocr_confidence)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    (user_id, filename, filepath, file_type, category,
                     file_size, content, ocr_confidence),
                )
                doc_id = cur.lastrowid
            conn.commit()
            return doc_id
        finally:
            conn.close()

    # === [TAG FUNGSI UTAMA: Pencarian Cerdas Teks Penuh (search_documents)] ===
    # Penjelasan: Menjalankan Full-Text Search MySQL (MATCH ... AGAINST ... IN BOOLEAN MODE) dikombinasikan dengan pencarian substring LIKE dan filter kategori dokumen
    def search_documents(
        self,
        query: str = '',
        file_type: str = 'all',
        category: str = 'all',
        user_id: int = None,
    ) -> list:
        """
        Smart Full-Text Search strictly scoped to user_id using hybrid MySQL FULLTEXT + Substring matching.
        """
        if user_id is None:
            return []

        conn = self._connect()
        try:
            with conn.cursor() as cur:
                params = [user_id]
                where_clauses = ["user_id = %s"]

                clean_query = query.strip() if query else ''

                if clean_query:
                    # Hybrid search: MATCH AGAINST + LIKE for exact phrase + LIKE for words
                    words = [w for w in clean_query.split() if w]
                    like_phrase = f"%{clean_query}%"

                    boolean_tokens = ' '.join([f'+{w}*' for w in words])

                    search_clauses = [
                        "MATCH(extracted_text, filename_original) AGAINST (%s IN BOOLEAN MODE)",
                        "extracted_text LIKE %s",
                        "filename_original LIKE %s"
                    ]
                    params.extend([boolean_tokens, like_phrase, like_phrase])

                    if len(words) > 1:
                        word_clauses = []
                        for w in words:
                            word_clauses.append("(extracted_text LIKE %s OR filename_original LIKE %s)")
                            params.extend([f"%{w}%", f"%{w}%"])
                        search_clauses.append(f"({' AND '.join(word_clauses)})")

                    where_clauses.append(f"({' OR '.join(search_clauses)})")

                # ── file_type filter ─────────────────────────────────────────
                if file_type and file_type != 'all':
                    where_clauses.append("file_type = %s")
                    params.append(file_type)

                # ── category filter ──────────────────────────────────────────
                if category and category.lower() != 'all':
                    cat_list = [c.strip().lower() for c in category.split(',') if c.strip()]
                    placeholders = ', '.join(['%s'] * len(cat_list))
                    where_clauses.append(f"(LOWER(category) IN ({placeholders}) OR LOWER(file_type) IN ({placeholders}))")
                    params.extend(cat_list)
                    params.extend(cat_list)

                where_sql = " AND ".join(where_clauses)

                sql = f"""
                    SELECT
                        id,
                        user_id,
                        filename_original  AS filename,
                        filepath,
                        file_type,
                        category,
                        file_size,
                        ocr_confidence,
                        uploaded_at,
                        extracted_text     AS full_content
                    FROM documents
                    WHERE {where_sql}
                    ORDER BY uploaded_at DESC
                """

                cur.execute(sql, params)
                rows = cur.fetchall()

                import re

                results = []
                for row in rows:
                    fc = row.get('full_content') or ''
                    snippet = ''

                    if clean_query and fc:
                        match = re.search(re.escape(clean_query), fc, re.IGNORECASE)
                        if match:
                            start_idx = max(0, match.start() - 60)
                            end_idx = min(len(fc), match.end() + 90)
                            prefix = '...' if start_idx > 0 else ''
                            suffix = '...' if end_idx < len(fc) else ''
                            raw_snip = fc[start_idx:end_idx]
                            import markupsafe
                            safe_snip = str(markupsafe.escape(raw_snip))
                            highlighted = re.sub(
                                f"({re.escape(clean_query)})",
                                r'<mark class="ocr-highlight font-bold">\1</mark>',
                                safe_snip,
                                flags=re.IGNORECASE
                            )
                            snippet = f"{prefix}{highlighted}{suffix}"
                        else:
                            for w in clean_query.split():
                                w_match = re.search(re.escape(w), fc, re.IGNORECASE)
                                if w_match:
                                    start_idx = max(0, w_match.start() - 50)
                                    end_idx = min(len(fc), w_match.end() + 80)
                                    prefix = '...' if start_idx > 0 else ''
                                    suffix = '...' if end_idx < len(fc) else ''
                                    raw_snip = fc[start_idx:end_idx]
                                    import markupsafe
                                    safe_snip = str(markupsafe.escape(raw_snip))
                                    highlighted = re.sub(
                                        f"({re.escape(w)})",
                                        r'<mark class="ocr-highlight font-bold">\1</mark>',
                                        safe_snip,
                                        flags=re.IGNORECASE
                                    )
                                    snippet = f"{prefix}{highlighted}{suffix}"
                                    break

                    if not snippet:
                        raw_snip = (fc[:140] + '...') if len(fc) > 140 else fc
                        import markupsafe
                        snippet = str(markupsafe.escape(raw_snip))
                        if not snippet.strip():
                            snippet = '...Text content extracted and ready for indexing...'

                    row['snippet'] = snippet

                    if row.get('uploaded_at') and not isinstance(row['uploaded_at'], str):
                        row['uploaded_at'] = str(row['uploaded_at'])
                    results.append(row)
                return results
        finally:
            conn.close()

    # === [TAG FUNGSI: Ambil Seluruh Dokumen (get_all_documents)] ===
    # Penjelasan: Mengambil seluruh daftar berkas milik pengguna dengan filter kategori atau tipe file
    def get_all_documents(self, file_type: str = 'all', category: str = 'all', user_id: int = None) -> list:
        """Retrieve all documents strictly scoped to user_id."""
        if user_id is None:
            return []
        return self.search_documents(query='', file_type=file_type, category=category, user_id=user_id)

    # === [TAG FUNGSI: Ambil Detail Dokumen Tunggal (get_document_by_id)] ===
    # Penjelasan: Mengambil record lengkap dokumen (metadata dan isi teks hasil OCR) berdasarkan ID untuk ditampilkan di modal pratinjau
    def get_document_by_id(self, doc_id: int, user_id: int = None) -> dict | None:
        """Fetch a single document by primary key strictly scoped to user_id."""
        if user_id is None:
            return None
        conn = self._connect()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT
                        id,
                        user_id,
                        filename_original  AS filename,
                        filepath,
                        file_type,
                        category,
                        file_size,
                        ocr_confidence,
                        uploaded_at,
                        extracted_text     AS content
                    FROM documents
                    WHERE id = %s AND user_id = %s
                    """,
                    (doc_id, user_id),
                )
                row = cur.fetchone()
                if row and row.get('uploaded_at') and not isinstance(row['uploaded_at'], str):
                    row['uploaded_at'] = str(row['uploaded_at'])
                return row or None
        finally:
            conn.close()

    # === [TAG FUNGSI: Hapus Dokumen & Berkas Fisik (delete_document)] ===
    # Penjelasan: Menghapus berkas fisik asli dari direktori storage server dan menghapus baris datanya dari database MySQL
    def delete_document(self, doc_id: int, user_id: int = None) -> str | None:
        """
        Delete a document record strictly scoped to user_id.
        Returns the physical filepath string.
        """
        if user_id is None:
            return None
        import os
        conn = self._connect()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT filepath FROM documents WHERE id = %s AND user_id = %s", (doc_id, user_id)
                )
                row = cur.fetchone()
                filepath = row['filepath'] if row else None

                try:
                    if filepath and os.path.exists(filepath):
                        os.remove(filepath)
                except Exception as e:
                    print(f"Gagal menghapus file fisik: {e}")

                if filepath:
                    cur.execute("DELETE FROM documents WHERE id = %s AND user_id = %s", (doc_id, user_id))
                    conn.commit()
            return filepath
        finally:
            conn.close()

    # === [TAG FUNGSI: Perbarui Metadata & Teks OCR (update_document)] ===
    # Penjelasan: Memperbarui nama file, kategori, atau teks hasil koreksi manual pengguna dari modal pratinjau
    def update_document(
        self,
        doc_id: int,
        content: str = None,
        category: str = None,
        filename: str = None,
        ocr_confidence: float = None,
        user_id: int = None,
    ) -> bool:
        """Update document metadata and/or extracted text strictly scoped to user_id."""
        if user_id is None:
            return False
        conn = self._connect()
        try:
            with conn.cursor() as cur:
                updates, params = [], []
                if category:
                    updates.append("category = %s")
                    params.append(category)
                if filename:
                    updates.append("filename_original = %s")
                    params.append(filename)
                if content is not None:
                    updates.append("extracted_text = %s")
                    params.append(content)
                if ocr_confidence is not None:
                    updates.append("ocr_confidence = %s")
                    params.append(ocr_confidence)

                if updates:
                    where_clause = "WHERE id = %s AND user_id = %s"
                    params.extend([doc_id, user_id])

                    cur.execute(
                        f"UPDATE documents SET {', '.join(updates)} {where_clause}",
                        params,
                    )
            conn.commit()
            return True
        finally:
            conn.close()

    # === [TAG FUNGSI: Statistik Penyimpanan & Akurasi (get_storage_stats)] ===
    # Penjelasan: Mengalkulasi total dokumen tersimpan, akumulasi ukuran bytes, dan rata-rata skor akurasi OCR pengguna
    def get_storage_stats(self, user_id: int = None) -> dict:
        """Total bytes used, count, and accuracy strictly scoped to user_id."""
        if user_id is None:
            return {
                'count':      0,
                'total_docs': 0,
                'used_bytes': 0,
                'used_mb':    0.0,
                'used_gb':    0.0,
                'max_gb':     5,
                'percentage': 0.0,
                'accuracy':   0.0
            }
        conn = self._connect()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT COUNT(*) AS total_docs, COALESCE(SUM(file_size), 0) AS total_size, COALESCE(AVG(ocr_confidence), 0) AS avg_acc "
                    "FROM documents WHERE user_id = %s", (user_id,)
                )
                row = cur.fetchone()
                
                total_docs = int(row['total_docs']) if row else 0
                total_bytes = int(row['total_size']) if row else 0
                avg_acc = float(row['avg_acc']) if row else 0.0
                
            max_bytes = 5 * 1024 * 1024 * 1024  # 5 GB
            
            return {
                'count':      total_docs,
                'total_docs': total_docs,
                'used_bytes': total_bytes,
                'used_mb':    round(total_bytes / (1024 ** 2), 2),
                'used_gb':    round(total_bytes / (1024 ** 3), 2),
                'max_gb':     5,
                'percentage': round((total_bytes / max_bytes) * 100, 2) if max_bytes > 0 else 0,
                'accuracy':   round(avg_acc * 100, 1) if avg_acc > 0 else 0.0
            }
        finally:
            conn.close()

    # ──────────────────────────────────────────────────────────────────────────
    # Queue queries
    # ──────────────────────────────────────────────────────────────────────────

    # === [TAG FUNGSI: Daftarkan Antrean OCR (insert_queue_item)] ===
    # Penjelasan: Memasukkan tugas dokumen baru ke tabel antrean (ocr_queue) dengan status awal 'Queueing' dan progres 0%
    def insert_queue_item(
        self,
        document_id: int,
        user_id: int = None,
        queue_pos: int = 1,
        source_type: str = 'Web Dropzone',
        progress_percent: int = 0,
        status: str = 'Queueing'
    ) -> int:
        """Insert a new entry in ocr_queue scoped to user_id and return its ID."""
        conn = self._connect()
        try:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO ocr_queue (document_id, user_id, queue_pos, source_type, progress_percent, status)
                    VALUES (%s, %s, %s, %s, %s, %s)
                """, (document_id, user_id, queue_pos, source_type, progress_percent, status))
                qid = cur.lastrowid
            conn.commit()
            return qid
        finally:
            conn.close()

    # === [TAG FUNGSI: Perbarui Status Antrean (update_queue_status)] ===
    # Penjelasan: Memperbarui progres persentase dan status tugas (misal 'Processing', 'Completed', atau 'Failed')
    def update_queue_status(self, queue_id: int, status: str = 'Completed', progress_percent: int = 100, user_id: int = None):
        """Update the status and progress of a queue item scoped to user_id if provided."""
        conn = self._connect()
        try:
            with conn.cursor() as cur:
                if user_id is not None:
                    cur.execute("""
                        UPDATE ocr_queue
                        SET status = %s, progress_percent = %s
                        WHERE id = %s AND user_id = %s
                    """, (status, progress_percent, queue_id, user_id))
                else:
                    cur.execute("""
                        UPDATE ocr_queue
                        SET status = %s, progress_percent = %s
                        WHERE id = %s
                    """, (status, progress_percent, queue_id))
            conn.commit()
        finally:
            conn.close()

    # === [TAG FUNGSI: Bersihkan Log Antrean Selesai (clear_completed_queue)] ===
    # Penjelasan: Menghapus riwayat antrean yang sudah selesai diproses agar tabel log tidak membengkak
    def clear_completed_queue(self, user_id: int = None):
        """Remove completed queue logs strictly scoped to user_id."""
        if user_id is None:
            return
        conn = self._connect()
        try:
            with conn.cursor() as cur:
                cur.execute("""
                    DELETE FROM ocr_queue
                    WHERE status = 'Completed' AND user_id = %s
                """, (user_id,))
            conn.commit()
        finally:
            conn.close()

    # === [TAG FUNGSI: Ambil Daftar Antrean Aktif (get_queue_items)] ===
    # Penjelasan: Mengambil 100 antrean dokumen terbaru untuk ditampilkan di tab antrean (Queue View)
    def get_queue_items(self, user_id: int = None) -> list:
        """Fetch OCR queue entries strictly scoped to user_id."""
        if user_id is None:
            return []
        conn = self._connect()
        try:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT
                        q.id,
                        q.document_id,
                        q.user_id,
                        COALESCE(d.filename_original, 'File Dokumen') AS filename,
                        COALESCE(d.file_size, 0)                      AS file_size,
                        COALESCE(d.file_type, 'other')                 AS file_type,
                        COALESCE(d.ocr_confidence, 0.95)              AS ocr_confidence,
                        q.queue_pos,
                        q.source_type,
                        q.progress_percent,
                        q.status,
                        q.created_at,
                        q.updated_at
                    FROM ocr_queue q
                    LEFT JOIN documents d ON q.document_id = d.id
                    WHERE q.user_id = %s
                    ORDER BY q.created_at DESC
                    LIMIT 100
                """, (user_id,))
                rows = cur.fetchall()
                for row in rows:
                    for dt_field in ('created_at', 'updated_at'):
                        if row.get(dt_field) and not isinstance(row[dt_field], str):
                            row[dt_field] = str(row[dt_field])
                return rows
        finally:
            conn.close()

    # === [TAG FUNGSI: Hitung Tugas Antrean Aktif (count_active_queue)] ===
    # Penjelasan: Menghitung jumlah tugas yang belum berstatus 'Completed' atau 'Failed' untuk indikator badge sidebar
    def count_active_queue(self, user_id: int = None) -> int:
        """Count queue items that are not yet Completed strictly scoped to user_id."""
        if user_id is None:
            return 0
        conn = self._connect()
        try:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT COUNT(*) AS cnt FROM ocr_queue q
                    WHERE q.status NOT IN ('Completed', 'Failed') AND q.user_id = %s
                """, (user_id,))
                row = cur.fetchone()
                return int(row['cnt']) if row else 0
        finally:
            conn.close()

    # === [TAG FUNGSI: Metrik Kinerja Antrean (get_queue_metrics)] ===
    # Penjelasan: Menghitung total tugas aktif, tugas gagal, dan rerata akurasi OCR untuk widget dashboard
    def get_queue_metrics(self, user_id: int = None) -> dict:
        """Calculate real queue metrics strictly scoped to user_id."""
        if user_id is None:
            return {
                'active_tasks': 0,
                'confidence_rate': 0.0,
                'failed_tasks_count': 0
            }
        conn = self._connect()
        try:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT COUNT(*) AS active FROM ocr_queue q
                    WHERE q.status NOT IN ('Completed', 'Failed') AND q.user_id = %s
                """, (user_id,))
                row_active = cur.fetchone()
                active = row_active['active'] if row_active else 0

                cur.execute("""
                    SELECT COUNT(*) AS failed FROM ocr_queue q
                    WHERE q.status = 'Failed' AND q.user_id = %s
                """, (user_id,))
                row_failed = cur.fetchone()
                failed = row_failed['failed'] if row_failed else 0

                cur.execute("SELECT AVG(ocr_confidence) AS avg_conf FROM documents WHERE user_id = %s", (user_id,))
                row = cur.fetchone()
                avg_conf = round(float(row['avg_conf']) * 100, 1) if row and row['avg_conf'] else 0.0

            return {
                'active_tasks': active,
                'confidence_rate': avg_conf,
                'failed_tasks_count': failed
            }
        finally:
            conn.close()


from werkzeug.security import generate_password_hash, check_password_hash


# === [TAG KELAS: Model Pengguna & Autentikasi (UserModel)] ===
# Penjelasan: Mengelola registrasi user baru, verifikasi login kata sandi (hash), profil pengguna, integrasi OAuth, dan preferensi akun di MySQL
class UserModel:
    """Manages user registration, authentication, and session retrieval in MySQL."""

    def __init__(self, db_config: dict):
        self.cfg = db_config

    def _connect(self):
        pool = get_db_pool(self.cfg)
        conn = pool.connection()
        # Coba pendekatan properti
        try:
            conn.autocommit = True
        except Exception:
            pass

        # Coba pendekatan fungsi
        try:
            conn.autocommit(True)
        except Exception:
            pass
            
        # Coba ke koneksi dasar jika dibungkus oleh DBUtils
        try:
            if hasattr(conn, '_con'):
                conn._con.autocommit(True)
        except Exception:
            pass
        return conn

    # === [TAG FUNGSI: Registrasi Pengguna Baru (register_user)] ===
    # Penjelasan: Memvalidasi keunikan email, meng-hash kata sandi menggunakan werkzeug.security (generate_password_hash), dan membuat avatar inisial otomatis
    def register_user(self, full_name: str, email: str, password: str) -> dict:
        """Register a new user account with hashed password."""
        email = (email or '').strip().lower()
        full_name = (full_name or '').strip()
        if not full_name or not email or not password:
            return {'status': 'error', 'message': 'Semua field wajib diisi.'}

        if len(password) < 6:
            return {'status': 'error', 'message': 'Password minimal 6 karakter.'}

        conn = self._connect()
        try:
            with conn.cursor() as cur:
                # Check if email already exists
                cur.execute("SELECT id FROM users WHERE email = %s", (email,))
                if cur.fetchone():
                    return {'status': 'error', 'message': 'Email ini sudah terdaftar. Silakan login.'}

                password_hash = generate_password_hash(password)
                avatar_url = f"https://ui-avatars.com/api/?name={full_name.replace(' ', '+')}&background=4f46e5&color=fff&bold=true"

                cur.execute("""
                    INSERT INTO users (full_name, email, password_hash, avatar_url)
                    VALUES (%s, %s, %s, %s)
                """, (full_name, email, password_hash, avatar_url))

                user_id = cur.lastrowid
                conn.commit()
                return {
                    'status': 'success',
                    'user': {
                        'id': user_id,
                        'full_name': full_name,
                        'email': email,
                        'avatar_url': avatar_url,
                        'role': 'user'
                    }
                }
        finally:
            conn.close()

    # === [TAG FUNGSI: Autentikasi Login (authenticate_user)] ===
    # Penjelasan: Memeriksa keberadaan email, mencocokkan hash password (check_password_hash), dan memperbarui timestamp last_login di MySQL
    def authenticate_user(self, email: str, password: str) -> dict:
        """Verify user credentials and return user record."""
        email = (email or '').strip().lower()
        conn = self._connect()
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT * FROM users WHERE email = %s", (email,))
                user = cur.fetchone()
                if not user:
                    return {'status': 'error', 'message': 'Email tidak terdaftar.'}

                if not check_password_hash(user['password_hash'], password):
                    return {'status': 'error', 'message': 'Password salah. Silakan periksa kembali.'}

                # Update last_login
                cur.execute("UPDATE users SET last_login = NOW() WHERE id = %s", (user['id'],))
                conn.commit()

                return {
                    'status': 'success',
                    'user': {
                        'id': user['id'],
                        'full_name': user['full_name'],
                        'email': user['email'],
                        'avatar_url': user.get('avatar_url') or f"https://ui-avatars.com/api/?name={user['full_name'].replace(' ', '+')}&background=4f46e5&color=fff&bold=true",
                        'role': user.get('role', 'user')
                    }
                }
        finally:
            conn.close()

    # === [TAG FUNGSI: Ambil Data Profil Pengguna (get_user_by_id)] ===
    # Penjelasan: Mengambil data pengguna berdasarkan ID untuk menampilkan nama, email, dan avatar di header dashboard
    def get_user_by_id(self, user_id: int):
        conn = self._connect()
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT id, full_name, email, avatar_url, role, created_at FROM users WHERE id = %s", (user_id,))
                return cur.fetchone()
        finally:
            conn.close()

    # === [TAG FUNGSI: Perbarui Profil Pengguna (update_user_profile)] ===
    # Penjelasan: Mengubah nama lengkap, alamat email (dengan pengecekan duplikasi), dan URL avatar profil
    def update_user_profile(self, user_id: int, full_name: str, email: str, avatar_url: str = None, role: str = None) -> dict:
        """Update user profile data in MySQL."""
        email = (email or '').strip().lower()
        full_name = (full_name or '').strip()
        if not full_name or not email:
            return {'status': 'error', 'message': 'Nama dan Email wajib diisi.'}

        conn = self._connect()
        try:
            with conn.cursor() as cur:
                # Check email uniqueness for other users
                cur.execute("SELECT id FROM users WHERE email = %s AND id != %s", (email, user_id))
                if cur.fetchone():
                    return {'status': 'error', 'message': 'Email tersebut sudah digunakan oleh akun lain.'}

                if avatar_url:
                    cur.execute("""
                        UPDATE users 
                        SET full_name = %s, email = %s, avatar_url = %s, role = COALESCE(%s, role)
                        WHERE id = %s
                    """, (full_name, email, avatar_url, role, user_id))
                else:
                    cur.execute("""
                        UPDATE users 
                        SET full_name = %s, email = %s, role = COALESCE(%s, role)
                        WHERE id = %s
                    """, (full_name, email, role, user_id))
                conn.commit()

                cur.execute("SELECT id, full_name, email, avatar_url, role FROM users WHERE id = %s", (user_id,))
                updated_user = cur.fetchone()
                return {'status': 'success', 'user': updated_user}
        finally:
            conn.close()

    # === [TAG FUNGSI: Ganti Kata Sandi (change_password)] ===
    # Penjelasan: Memvalidasi kecocokan password lama dan menyimpan hash password baru yang kuat
    def change_password(self, user_id: int, old_password: str, new_password: str, confirm_password: str) -> dict:
        """Ganti password user setelah validasi password lama dan kekuatan password baru."""
        if not old_password or not new_password or not confirm_password:
            return {'status': 'error', 'message': 'Semua field password wajib diisi.'}

        if new_password != confirm_password:
            return {'status': 'error', 'message': 'Password baru dan konfirmasi tidak cocok.'}

        if len(new_password) < 6:
            return {'status': 'error', 'message': 'Password baru minimal 6 karakter.'}

        if old_password == new_password:
            return {'status': 'error', 'message': 'Password baru tidak boleh sama dengan password lama.'}

        conn = self._connect()
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT password_hash FROM users WHERE id = %s", (user_id,))
                user = cur.fetchone()
                if not user:
                    return {'status': 'error', 'message': 'User tidak ditemukan.'}

                if not check_password_hash(user['password_hash'], old_password):
                    return {'status': 'error', 'message': 'Password lama salah.'}

                new_hash = generate_password_hash(new_password)
                cur.execute("UPDATE users SET password_hash = %s WHERE id = %s", (new_hash, user_id))
                conn.commit()

                return {'status': 'success', 'message': 'Password berhasil diubah.'}
        finally:
            conn.close()

    # === [TAG FUNGSI: Reset Password via Email (reset_password_by_email)] ===
    # Penjelasan: Mengubah kata sandi pengguna berdasarkan konfirmasi token email saat user lupa kata sandi
    def reset_password_by_email(self, email: str, new_password: str, confirm_password: str) -> dict:
        """Reset password user berdasarkan email (fitur Lupa Password)."""
        email = (email or '').strip().lower()
        if not email or not new_password or not confirm_password:
            return {'status': 'error', 'message': 'Semua field wajib diisi.'}

        if new_password != confirm_password:
            return {'status': 'error', 'message': 'Password baru dan konfirmasi tidak cocok.'}

        if len(new_password) < 6:
            return {'status': 'error', 'message': 'Password baru minimal 6 karakter.'}

        conn = self._connect()
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT id FROM users WHERE email = %s", (email,))
                user = cur.fetchone()
                if not user:
                    return {'status': 'error', 'message': 'Email tidak terdaftar dalam sistem.'}

                new_hash = generate_password_hash(new_password)
                cur.execute("UPDATE users SET password_hash = %s WHERE id = %s", (new_hash, user['id']))
                conn.commit()
                return {'status': 'success', 'message': 'Password berhasil di-reset. Silakan login menggunakan password baru.'}
        finally:
            conn.close()

    # === [TAG FUNGSI: Integrasi Pengguna OAuth Sosial (find_or_create_social_user)] ===
    # Penjelasan: Menemukan akun sosial yang sudah ada atau mendaftarkan akun baru secara otomatis saat login via Google/GitHub
    def find_or_create_social_user(self, provider: str, email: str, full_name: str, avatar_url: str = None) -> dict:
        """Find existing social user or create a new user account in MySQL."""
        email = (email or '').strip().lower()
        full_name = (full_name or '').strip() or f"{provider.capitalize()} User"
        if not avatar_url:
            avatar_url = f"https://ui-avatars.com/api/?name={full_name.replace(' ', '+')}&background=4f46e5&color=fff&bold=true"

        conn = self._connect()
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT id, full_name, email, avatar_url, role FROM users WHERE email = %s", (email,))
                user = cur.fetchone()
                if user:
                    # Update full_name, avatar if supplied & last_login
                    cur.execute("""
                        UPDATE users 
                        SET full_name = COALESCE(%s, full_name), 
                            avatar_url = COALESCE(%s, avatar_url),
                            last_login = NOW() 
                        WHERE id = %s
                    """, (full_name if full_name else None, avatar_url if avatar_url else None, user['id']))
                    conn.commit()
                    cur.execute("SELECT id, full_name, email, avatar_url, role FROM users WHERE id = %s", (user['id'],))
                    user = cur.fetchone()
                    return {'status': 'success', 'user': user}

                # Create new social user
                import secrets
                dummy_hash = generate_password_hash(secrets.token_hex(32))
                cur.execute("""
                    INSERT INTO users (full_name, email, password_hash, avatar_url, role)
                    VALUES (%s, %s, %s, %s, 'user')
                """, (full_name, email, dummy_hash, avatar_url))

                user_id = cur.lastrowid
                conn.commit()
                return {
                    'status': 'success',
                    'user': {
                        'id': user_id,
                        'full_name': full_name,
                        'email': email,
                        'avatar_url': avatar_url,
                        'role': 'user'
                    }
                }
        finally:
            conn.close()

    # === [TAG FUNGSI: Ambil Preferensi Pengaturan Akun (get_settings)] ===
    # Penjelasan: Membaca konfigurasi JSON (settings_json) per pengguna dari database
    def get_settings(self, user_id: int) -> dict:
        """Retrieve user-specific settings from MySQL."""
        conn = self._connect()
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT settings_json FROM users WHERE id = %s", (user_id,))
                res = cur.fetchone()
                if res and res.get('settings_json'):
                    import json
                    try:
                        if isinstance(res['settings_json'], str):
                            return json.loads(res['settings_json'])
                        return dict(res['settings_json'])
                    except (ValueError, TypeError):
                        pass
                return {}
        finally:
            conn.close()

    # === [TAG FUNGSI: Simpan Preferensi Pengaturan Akun (update_settings)] ===
    # Penjelasan: Menyimpan preferensi konfigurasi pengguna ke kolom settings_json di MySQL
    def update_settings(self, user_id: int, settings: dict) -> bool:
        """Update user-specific settings in MySQL."""
        import json
        conn = self._connect()
        try:
            with conn.cursor() as cur:
                cur.execute("UPDATE users SET settings_json = %s WHERE id = %s", (json.dumps(settings), user_id))
                conn.commit()
            return True
        finally:
            conn.close()
