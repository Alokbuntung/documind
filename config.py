"""
DocuMind Application Configuration.
Migrated from SQLite3 to MySQL via PyMySQL driver.
"""

import os
import pymysql
from pathlib import Path
from dotenv import load_dotenv

# === [TAG KONFIGURASI: Memuat Berkas Lingkungan (.env)] ===
# Penjelasan: Memuat variabel rahasia (password DB, API key) dari file .env ke environment sistem
load_dotenv()

# === [TAG DRIVER: Pendaftaran PyMySQL sebagai MySQLdb] ===
# Penjelasan: Mengizinkan SQLAlchemy dan library lain berkomunikasi dengan MySQL menggunakan driver PyMySQL murni
pymysql.install_as_MySQLdb()

# Menentukan path direktori dasar proyek
BASE_DIR = Path(__file__).resolve().parent


# === [TAG KELAS: Konfigurasi Terpusat Aplikasi (Config)] ===
# Penjelasan: Kumpulan seluruh parameter setelan server, keamanan sesi, batas penyimpanan, dan kredensial database
class Config:
    # Kunci rahasia untuk enkripsi sesi dan token CSRF
    SECRET_KEY = os.environ.get('SECRET_KEY')
    if not SECRET_KEY:
        raise ValueError("CRITICAL: No SECRET_KEY set in environment variables.")

    # ── Session Security ─────────────────────────────────────────────────────
    # === [TAG KEAMANAN SESI: Pengaturan Cookie] ===
    # Penjelasan: Mencegah pencurian session cookie via JavaScript (HttpOnly) dan membatasi masa aktif sesi hingga 12 jam
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SECURE = True
    SESSION_COOKIE_SAMESITE = 'Lax'
    from datetime import timedelta
    PERMANENT_SESSION_LIFETIME = timedelta(hours=12)

    # === [TAG LIMITASI: Batas Maksimal Ukuran Unggahan] ===
    # Penjelasan: Membatasi file yang diunggah pengguna maksimal sebesar 50 Megabytes
    MAX_CONTENT_LENGTH = 50 * 1024 * 1024  # 50 MB max upload limit

    # ── Storage Folders ──────────────────────────────────────────────────────
    # === [TAG PENYIMPANAN: Folder Fisik Server] ===
    # Penjelasan: Menentukan direktori penyimpanan file asli, berkas temporary/cache, dan foto avatar profil
    UPLOADS_DEFAULT = BASE_DIR / 'storage' / 'uploads'
    TEMP_FOLDER     = BASE_DIR / 'storage' / 'temp'
    AVATARS_FOLDER  = BASE_DIR / 'storage' / 'avatars'

    # Memastikan folder fisik otomatis terbuat jika belum ada di sistem
    os.makedirs(UPLOADS_DEFAULT, exist_ok=True)
    os.makedirs(TEMP_FOLDER, exist_ok=True)
    os.makedirs(AVATARS_FOLDER, exist_ok=True)

    # ── MySQL Connection Config Dict ─────────────────────────────────────────
    # === [TAG DATABASE: Parameter Koneksi MySQL] ===
    # Penjelasan: Kredensial host, port, user, password, dan nama database yang dipakai oleh PyMySQL dan connection pool
    if 'MYSQL_PASSWORD' not in os.environ:
        raise ValueError("CRITICAL: MYSQL_PASSWORD must be explicitly set in environment variables.")

    DB_CONFIG = {
        'host':   os.environ.get('MYSQL_HOST',     'localhost'),
        'port':   int(os.environ.get('MYSQL_PORT', 3306)),
        'user':   os.environ.get('MYSQL_USER',     'root'),
        'password': os.environ['MYSQL_PASSWORD'],
        'db':     os.environ.get('MYSQL_DB',       'documind'),
        'charset': 'utf8mb4',
        'cursorclass': pymysql.cursors.DictCursor,
        'autocommit': False,
    }

    # ── SQLAlchemy URI (for any Flask-SQLAlchemy usage) ──────────────────────
    # === [TAG DATABASE: URI SQLAlchemy Connection String] ===
    # Penjelasan: Format URI standar database MySQL untuk Flask-SQLAlchemy
    _user = os.environ.get('MYSQL_USER',     'root')
    _pw   = os.environ.get('MYSQL_PASSWORD', '')
    _host = os.environ.get('MYSQL_HOST',     'localhost')
    _port = os.environ.get('MYSQL_PORT',     '3306')
    _db   = os.environ.get('MYSQL_DB',       'documind')
    SQLALCHEMY_DATABASE_URI = (
        f'mysql+pymysql://{_user}:{_pw}@{_host}:{_port}/{_db}?charset=utf8mb4'
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # ── Real OAuth 2.0 Credentials ───────────────────────────────────────────
    # === [TAG OAUTH: Kredensial Pihak Ketiga] ===
    # Penjelasan: Client ID & Secret untuk fitur login otomatis menggunakan akun Google, GitHub, dan Apple
    GOOGLE_CLIENT_ID     = os.environ.get('GOOGLE_CLIENT_ID', '')
    GOOGLE_CLIENT_SECRET = os.environ.get('GOOGLE_CLIENT_SECRET', '')
    GITHUB_CLIENT_ID     = os.environ.get('GITHUB_CLIENT_ID', '')
    GITHUB_CLIENT_SECRET = os.environ.get('GITHUB_CLIENT_SECRET', '')
    APPLE_CLIENT_ID      = os.environ.get('APPLE_CLIENT_ID', '')
    APPLE_CLIENT_SECRET  = os.environ.get('APPLE_CLIENT_SECRET', '')

    # ── Email / SMTP Configuration ──────────────────────────────────────────
    # === [TAG EMAIL: Pengaturan Protokol SMTP] ===
    # Penjelasan: Konfigurasi server email untuk pengiriman instruksi reset password ke inbox pengguna
    MAIL_SERVER   = os.environ.get('MAIL_SERVER', 'smtp.gmail.com')
    MAIL_PORT     = int(os.environ.get('MAIL_PORT', 587))
    MAIL_USERNAME = os.environ.get('MAIL_USERNAME', '')
    MAIL_PASSWORD = os.environ.get('MAIL_PASSWORD', '')
    MAIL_USE_TLS  = os.environ.get('MAIL_USE_TLS', 'True').lower() in ('true', '1', 't')
    MAIL_DEFAULT_SENDER = os.environ.get('MAIL_DEFAULT_SENDER', 'noreply@documind.local')
