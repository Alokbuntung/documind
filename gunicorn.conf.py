# === [TAG MODUL: Konfigurasi Gunicorn WSGI Server (gunicorn.conf.py)] ===
# Penjelasan: Konfigurasi peladen HTTP WSGI produksi (Gunicorn) mencakup binding host/port, alokasi proses pekerja (workers), batas waktu timeout untuk operasi komputasi berat (OCR), dan penanganan berkas log.

import multiprocessing
import os

# === [TAG KONFIGURASI: Network Binding & Port] ===
# Penjelasan: Mengikat server ke interface 0.0.0.0 dengan port dari variabel lingkungan PORT atau fallback ke 8000.
# Bind to 0.0.0.0 and port provided by the environment, or default to 8000
port = os.environ.get("PORT", "8000")
bind = f"0.0.0.0:{port}"

# === [TAG KONFIGURASI: Alokasi Proses Pekerja (Worker Processes)] ===
# Penjelasan: Menghitung jumlah worker optimal berdasarkan jumlah CPU core ((2 * CPU) + 1) untuk konkurensi permintaan HTTP.
# Worker count: (2 * CPUs) + 1 is the standard formula for synchronous workers.
# Fallback to 3 if os.cpu_count() fails.
try:
    workers = (multiprocessing.cpu_count() * 2) + 1
except Exception:
    workers = 3

# === [TAG KONFIGURASI: Batas Waktu Eksekusi (Timeout) & Pencatatan Log] ===
# Penjelasan: Menetapkan timeout 120 detik untuk mengakomodasi ekstraksi OCR dan mengarahkan log akses/error ke stdout/stderr.
# Timeout of 120 seconds to allow background OCR/Document Extraction to complete
timeout = 120

# Logging configurations
accesslog = "-"
errorlog = "-"
loglevel = "info"
