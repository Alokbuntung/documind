-- ==============================================================================
-- DocuMind Migration: User Data Isolation for ocr_queue and documents
-- Idempotent Migration Script (Safe to run multiple times)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Pastikan kolom user_id ada di tabel ocr_queue
-- ------------------------------------------------------------------------------
SET @col_exists = (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'ocr_queue'
      AND COLUMN_NAME = 'user_id'
);

SET @stmt = IF(
    @col_exists = 0,
    'ALTER TABLE ocr_queue ADD COLUMN user_id INT UNSIGNED NULL AFTER document_id',
    'SELECT "Kolom user_id sudah ada di ocr_queue" AS status'
);
PREPARE run_stmt FROM @stmt;
EXECUTE run_stmt;
DEALLOCATE PREPARE run_stmt;

-- ------------------------------------------------------------------------------
-- 2. Pastikan INDEX pada ocr_queue(user_id) tersedia
-- ------------------------------------------------------------------------------
SET @idx_exists = (
    SELECT COUNT(*)
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'ocr_queue'
      AND INDEX_NAME = 'idx_queue_user_id'
);

SET @stmt = IF(
    @idx_exists = 0,
    'ALTER TABLE ocr_queue ADD INDEX idx_queue_user_id (user_id)',
    'SELECT "Index idx_queue_user_id sudah ada" AS status'
);
PREPARE run_stmt FROM @stmt;
EXECUTE run_stmt;
DEALLOCATE PREPARE run_stmt;

-- ------------------------------------------------------------------------------
-- 3. Sinkronkan user_id dari tabel documents ke ocr_queue untuk relasi yang valid
-- ------------------------------------------------------------------------------
UPDATE ocr_queue q
JOIN documents d ON q.document_id = d.id
SET q.user_id = d.user_id
WHERE q.user_id IS NULL;

-- ------------------------------------------------------------------------------
-- 4. LANGKAH TERPISAH & OPSIONAL: Pemeriksaan Data Yatim (user_id IS NULL)
--    CATATAN: Data lama yang user_id-nya NULL TIDAK dihapus secara otomatis.
-- ------------------------------------------------------------------------------
SELECT COUNT(*) AS total_orphan_queue_rows
FROM ocr_queue
WHERE user_id IS NULL;

-- Query opsi untuk dieksekusi setelah persetujuan eksplisit:
-- Opsi A (Tugaskan ke akun pengguna tertentu, misal user ID = 1):
-- UPDATE ocr_queue SET user_id = 1 WHERE user_id IS NULL;

-- Opsi B (Hapus baris antrean lama yang dokumennya sudah dihapus):
-- DELETE FROM ocr_queue WHERE user_id IS NULL;

-- ------------------------------------------------------------------------------
-- 5. Setelah baris yatim diputuskan (Opsi A / B selesai dieksekusi),
--    Jalankan perintah berikut untuk mengunci constraint NOT NULL dan Foreign Key:
-- ------------------------------------------------------------------------------
-- ALTER TABLE ocr_queue MODIFY COLUMN user_id INT UNSIGNED NOT NULL;
-- ALTER TABLE ocr_queue
--     ADD CONSTRAINT fk_queue_user
--     FOREIGN KEY (user_id) REFERENCES users(id)
--     ON DELETE CASCADE ON UPDATE CASCADE;
