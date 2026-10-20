# 🧠 DocuMind

> **Platform manajemen & pencarian dokumen cerdas berbasis OCR — dibangun dengan Flask & MySQL.**

DocuMind adalah aplikasi web yang memungkinkan pengguna mengunggah, mengindeks, dan mencari dokumen dalam berbagai format (PDF, Word, Excel, PowerPoint, gambar, dan file kode) menggunakan teknologi OCR (Optical Character Recognition) Tesseract. Semua data sepenuhnya terisolasi per pengguna, sehingga dokumen Anda hanya bisa diakses oleh Anda sendiri.

---

## 📋 Daftar Isi

- [Fitur Utama](#-fitur-utama)
- [Arsitektur Proyek](#-arsitektur-proyek)
- [Tumpukan Teknologi](#-tumpukan-teknologi)
- [Prasyarat Instalasi](#-prasyarat-instalasi)
- [Panduan Instalasi](#-panduan-instalasi)
- [Konfigurasi Environment](#-konfigurasi-environment)
- [Menjalankan Aplikasi](#-menjalankan-aplikasi)
- [Format Dokumen yang Didukung](#-format-dokumen-yang-didukung)
- [Endpoint API](#-endpoint-api)
- [Fitur Keamanan](#-fitur-keamanan)
- [Deployment Produksi](#-deployment-produksi)

---

## ✨ Fitur Utama

| Fitur | Deskripsi |
|---|---|
| 📤 **Unggah Multi-Format** | Mendukung PDF, DOCX, XLSX, PPTX, gambar (PNG/JPG/WEBP), HTML, dan ratusan format file kode |
| 🔍 **Full-Text Search** | Pencarian teks penuh menggunakan MySQL InnoDB FULLTEXT BOOLEAN MODE yang sangat cepat |
| 🤖 **OCR Otomatis** | Ekstraksi teks dari dokumen scan/gambar menggunakan Tesseract v5 (mendukung Bahasa Indonesia & Inggris) |
| 📄 **PDF Cerdas** | Deteksi otomatis PDF digital vs. scan — PDF digital diekstrak langsung, PDF scan diproses via OCR |
| 🔄 **Pemrosesan Latar Belakang** | Upload langsung responsif; ekstraksi OCR berjalan di background thread tanpa memblokir UI |
| 👤 **Isolasi Data Multi-Tenant** | Setiap pengguna hanya dapat melihat dan mengelola dokumen miliknya sendiri |
| 🔐 **Autentikasi OAuth 2.0** | Login instan dengan akun Google atau GitHub |
| 📧 **Reset Password via Email** | Pengiriman tautan reset password aman ke email menggunakan SMTP/Gmail |
| ⬇️ **Unduh & Ekspor** | Unduh dokumen satu per satu atau massal dalam format ZIP |
| ✏️ **Edit Teks OCR** | Koreksi manual hasil ekstraksi teks langsung dari antarmuka pratinjau |
| 📊 **Statistik Real-Time** | Dashboard dengan polling statistik penyimpanan dan antrean OCR secara langsung |
| ⚙️ **Pengaturan Preferensi** | Konfigurasi bahasa OCR, tema tampilan, zona waktu, dan lebih banyak lagi |

---

## 🏗️ Arsitektur Proyek

```
documind/
│
├── app.py                    # Application Factory Flask (entry point)
├── config.py                 # Konfigurasi terpusat (DB, OAuth, Email, Storage)
├── extensions.py             # Inisialisasi ekstensi Flask (Rate Limiter)
├── gunicorn.conf.py          # Konfigurasi Gunicorn WSGI untuk produksi
├── Procfile                  # Perintah deploy (Heroku / Platform-as-a-Service)
├── requirements.txt          # Daftar dependensi Python
├── .env.example              # Template variabel lingkungan
│
├── core/                     # Modul inti logika bisnis
│   ├── auth.py               # Helper autentikasi & decorator login_required
│   ├── doc_reader.py         # Parser dokumen (DOCX, XLSX, PPTX, PDF, HTML)
│   ├── extractor.py          # Router ekstraksi — menentukan parser yang tepat
│   ├── mailer.py             # Pengiriman email reset password via SMTP
│   └── ocr_engine.py         # Engine Tesseract OCR dengan preprocessing gambar
│
├── database/                 # Lapisan database
│   ├── db_setup.py           # Inisialisasi skema MySQL (CREATE TABLE)
│   ├── models.py             # Model DocumentModel & UserModel (CRUD + FTS)
│   ├── migration_fase3.py    # Skrip migrasi database fase 3
│   └── migration_user_isolation.py  # Migrasi isolasi data per pengguna
│
├── routes/                   # Blueprint rute aplikasi
│   ├── main_routes.py        # Halaman web & API autentikasi (login, register, dashboard)
│   ├── upload_routes.py      # API unggah dokumen & antrian OCR
│   ├── search_routes.py      # API pencarian, CRUD dokumen, queue, settings
│   └── oauth_routes.py       # Alur OAuth 2.0 Google & GitHub
│
├── templates/                # Template HTML Jinja2
│   ├── base.html             # Layout dasar
│   ├── welcome.html          # Landing page
│   ├── login.html            # Halaman masuk
│   ├── register.html         # Halaman daftar akun
│   ├── dashboard.html        # Workspace utama pengguna
│   ├── reset_password.html   # Form reset kata sandi
│   └── ...                   # Template OAuth & halaman error
│
├── static/                   # Aset statis (CSS, JS, gambar)
├── storage/                  # Penyimpanan file (diabaikan git)
│   ├── uploads/<user_id>/    # Dokumen yang diunggah (terisolasi per user)
│   ├── temp/                 # File sementara ZIP
│   └── avatars/              # Foto profil pengguna
│
├── tessdata/                 # Data model bahasa Tesseract
├── ind.traineddata           # Model bahasa Indonesia Tesseract
└── tools/poppler/            # Utilitas Poppler untuk konversi PDF ke gambar
```

---

## 🛠️ Tumpukan Teknologi

| Komponen | Teknologi |
|---|---|
| **Framework Web** | Flask 3.0.3 |
| **Database** | MySQL (via PyMySQL 1.1.1 + DBUtils Connection Pool) |
| **ORM/Query** | SQLAlchemy 2.0.36 |
| **OCR Engine** | Tesseract v5 (pytesseract 0.3.10) |
| **Pemrosesan Gambar** | Pillow >= 10.4.0, OpenCV (opsional) |
| **Parser Dokumen** | python-docx, openpyxl, pypdf, pdf2image |
| **Rate Limiting** | Flask-Limiter 3.8.0 |
| **WSGI Server** | Gunicorn |
| **Email** | SMTP via smtplib (konfigurasi Gmail/TLS) |
| **OAuth** | Google OpenID Connect, GitHub OAuth 2.0 |

---

## ✅ Prasyarat Instalasi

Sebelum memulai, pastikan hal-hal berikut sudah terpasang di sistem Anda:

1. **Python 3.10+**
2. **MySQL 8.0+** (jalankan dan buat database `documind`)
3. **Tesseract OCR 5.x**
   - Windows: unduh installer dari [UB Mannheim](https://github.com/UB-Mannheim/tesseract/wiki)
   - Linux: `sudo apt-get install tesseract-ocr tesseract-ocr-ind`
4. **Poppler** (untuk konversi PDF ke gambar)
   - Windows: sudah disertakan di folder `tools/poppler/`
   - Linux: `sudo apt-get install poppler-utils`

---

## 🚀 Panduan Instalasi

### 1. Clone repositori

```bash
git clone https://github.com/username/documind.git
cd documind
```

### 2. Buat dan aktifkan virtual environment

```bash
# Windows
python -m venv venv
venv\Scripts\activate

# Linux / macOS
python3 -m venv venv
source venv/bin/activate
```

### 3. Instal dependensi Python

```bash
pip install -r requirements.txt
```

### 4. Salin dan isi file konfigurasi environment

```bash
cp .env.example .env
```

Edit file `.env` sesuai konfigurasi Anda (lihat bagian [Konfigurasi Environment](#-konfigurasi-environment)).

### 5. Buat database MySQL

```sql
CREATE DATABASE documind CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'documind_user'@'localhost' IDENTIFIED BY 'kata_sandi_aman';
GRANT ALL PRIVILEGES ON documind.* TO 'documind_user'@'localhost';
FLUSH PRIVILEGES;
```

### 6. Inisialisasi skema database

```bash
python -c "from database.db_setup import init_db; from config import Config; init_db(Config.DB_CONFIG)"
```

---

## ⚙️ Konfigurasi Environment

Salin `.env.example` ke `.env` dan isi setiap nilai berikut:

```ini
# ── Flask ──────────────────────────────────────────────────────────────
FLASK_APP=app.py
FLASK_ENV=production
FLASK_DEBUG=False
FLASK_HOST=127.0.0.1
FLASK_PORT=5000

# ── Keamanan ───────────────────────────────────────────────────────────
# Buat kunci rahasia dengan: python -c "import secrets; print(secrets.token_hex(32))"
SECRET_KEY=kunci_rahasia_sangat_panjang_dan_acak

# ── MySQL ──────────────────────────────────────────────────────────────
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=documind_user
MYSQL_PASSWORD=kata_sandi_aman
MYSQL_DB=documind

# ── Tesseract OCR (hanya untuk Windows atau jalur kustom) ──────────────
TESSERACT_CMD_PATH=C:\Program Files\Tesseract-OCR\tesseract.exe

# ── OAuth 2.0 (opsional) ──────────────────────────────────────────────
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=

# ── Email SMTP (opsional, untuk fitur reset password) ─────────────────
MAIL_SERVER=smtp.gmail.com
MAIL_PORT=587
MAIL_USERNAME=email_anda@gmail.com
MAIL_PASSWORD=app_password_gmail_anda
MAIL_USE_TLS=True
MAIL_DEFAULT_SENDER=noreply@documind.local
```

> **Catatan:** `SECRET_KEY` dan `MYSQL_PASSWORD` **wajib** diisi. Aplikasi akan gagal dijalankan jika keduanya tidak ada.

---

## ▶️ Menjalankan Aplikasi

### Mode Pengembangan (Development)

```bash
python app.py
```

Aplikasi akan berjalan di: `http://127.0.0.1:5000`

### Mode Produksi (Gunicorn)

```bash
gunicorn -c gunicorn.conf.py app:app
```

Gunicorn dikonfigurasi dengan:
- Worker: `(2 x jumlah CPU) + 1`
- Timeout: `120 detik` (untuk mengakomodasi proses OCR berat)
- Logging: stdout/stderr

---

## 📁 Format Dokumen yang Didukung

| Kategori | Format |
|---|---|
| **Dokumen Office** | `.pdf`, `.docx`, `.doc`, `.xlsx`, `.xls`, `.pptx`, `.ppt`, `.rtf`, `.odt`, `.ods`, `.odp` |
| **Gambar (OCR)** | `.png`, `.jpg`, `.jpeg`, `.webp`, `.tiff`, `.bmp`, `.gif`, `.svg`, `.ico` |
| **Web** | `.html`, `.htm`, `.xhtml` |
| **Teks & Data** | `.txt`, `.csv`, `.tsv`, `.md`, `.log`, `.sql`, `.json`, `.yaml`, `.xml`, `.toml` |
| **Kode Program** | `.py`, `.js`, `.ts`, `.jsx`, `.tsx`, `.java`, `.c`, `.cpp`, `.go`, `.rs`, `.php`, `.rb`, `.swift`, `.kt`, `.dart`, `.sh`, `.ps1`, dan masih banyak lagi |
| **Konfigurasi** | `.env`, `.ini`, `.cfg`, `.conf`, `Dockerfile`, `Makefile`, `.gitignore` |

> **Diblokir:** File eksekusi berbahaya seperti `.exe`, `.bat`, `.dll`, `.msi`, `.jar`, `.vbs` tidak diizinkan diunggah.

---

## 🔌 Endpoint API

### Autentikasi

| Method | Endpoint | Deskripsi |
|---|---|---|
| `POST` | `/api/auth/register` | Daftar akun baru |
| `POST` | `/api/auth/login` | Masuk ke akun |
| `GET` | `/api/auth/me` | Info sesi pengguna aktif |
| `POST` | `/api/auth/profile` | Perbarui profil & avatar |
| `POST` | `/api/auth/change-password` | Ganti kata sandi |
| `POST` | `/api/auth/forgot-password` | Kirim email reset password |
| `GET` | `/auth/google` | Inisiasi login Google OAuth |
| `GET` | `/auth/github` | Inisiasi login GitHub OAuth |

### Dokumen

| Method | Endpoint | Deskripsi |
|---|---|---|
| `POST` | `/api/upload` | Unggah satu atau banyak dokumen |
| `GET` | `/api/search?q=...` | Pencarian full-text dokumen |
| `GET` | `/api/documents` | Daftar semua dokumen |
| `GET` | `/api/document/<id>` | Detail satu dokumen |
| `PUT` | `/api/document/<id>` | Edit konten/kategori dokumen |
| `DELETE` | `/api/document/<id>` | Hapus satu dokumen |
| `GET` | `/api/documents/<id>/download` | Unduh file dokumen |
| `GET` | `/api/documents/<id>/file` | Tampilkan file inline (pratinjau) |

### Operasi Massal

| Method | Endpoint | Deskripsi |
|---|---|---|
| `POST` | `/api/documents/bulk-delete` | Hapus banyak dokumen sekaligus |
| `POST` | `/api/documents/bulk-download` | Unduh banyak dokumen sebagai ZIP |
| `POST` | `/api/documents/bulk-move` | Pindahkan kategori banyak dokumen |

### Antrean OCR & Pengaturan

| Method | Endpoint | Deskripsi |
|---|---|---|
| `GET` | `/api/queue` | Status antrean pemrosesan OCR |
| `POST` | `/api/queue/clear` | Bersihkan riwayat antrean selesai |
| `GET` | `/api/queue/export` | Ekspor log antrean sebagai JSON |
| `GET/POST` | `/api/settings` | Baca/simpan preferensi pengguna |
| `POST` | `/api/settings/clear-temp` | Hapus file sementara |
| `GET` | `/api/stats` | Statistik penyimpanan real-time |
| `GET` | `/api/csrf-token` | Ambil token CSRF terbaru |

---

## 🛡️ Fitur Keamanan

DocuMind menerapkan lapisan keamanan berlapis:

- **Proteksi CSRF** — Token unik 64-karakter per sesi, divalidasi di setiap request `POST/PUT/DELETE`
- **Rate Limiting** — Pembatasan permintaan per IP menggunakan Flask-Limiter (Login: 5/menit, Register: 5/menit, Lupa Password: 3/menit)
- **Validasi Magic Bytes** — File diverifikasi tanda tangan biner aslinya (bukan hanya ekstensi) untuk mencegah upload terselubung
- **Path Traversal Prevention** — Nama file disanitasi, mencegah serangan `../` path traversal
- **User Data Isolation** — Semua query database difilter `WHERE user_id = ?`, mencegah akses lintas pengguna
- **Security Headers** — `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Strict-Transport-Security`, `X-XSS-Protection`
- **Session Cookie Security** — `HttpOnly`, `Secure`, `SameSite=Lax`, masa aktif 12 jam
- **OAuth State Validation** — Token state acak diverifikasi di setiap callback OAuth untuk mencegah CSRF pada alur OAuth
- **Stored XSS Prevention** — File HTML/SVG dipaksa diunduh (bukan ditampilkan inline) saat disajikan melalui endpoint pratinjau

---

## 🚢 Deployment Produksi

### Menggunakan Gunicorn (Linux/VPS)

```bash
# Install dependencies produksi
pip install -r requirements.txt

# Jalankan dengan Gunicorn
gunicorn -c gunicorn.conf.py app:app
```

### Menggunakan Platform-as-a-Service (Heroku, Railway, dll.)

Proyek sudah dilengkapi `Procfile`:

```
web: gunicorn -c gunicorn.conf.py app:app
```

Cukup set semua variabel environment yang diperlukan di panel konfigurasi platform Anda.

### Variabel Environment Wajib di Produksi

| Variabel | Keterangan |
|---|---|
| `SECRET_KEY` | Kunci rahasia Flask yang kuat (minimal 64 karakter hex) |
| `MYSQL_PASSWORD` | Kata sandi database MySQL |
| `MYSQL_HOST` | Host database MySQL |
| `MYSQL_USER` | Username database MySQL |
| `MYSQL_DB` | Nama database MySQL |

---

## 📄 Lisensi

Proyek ini dikembangkan untuk keperluan pribadi / internal. Silakan hubungi pemilik repositori untuk informasi lisensi lebih lanjut.

---

<div align="center">
  <sub>Dibangun dengan menggunakan Flask & Tesseract OCR</sub>
</div>
