"""
DocuMind Application Factory.
SQLite3 seed data fully removed — launches as a clean empty installation.
MySQL schema is initialised on startup via database/db_setup.py.
"""

# === [TAG INISIALISASI: Driver Database MySQL] ===
# Penjelasan: Mendaftarkan PyMySQL sebagai pengganti MySQLdb agar kompatibel dengan Flask & SQLAlchemy
import pymysql
pymysql.install_as_MySQLdb()

import os
import secrets
from functools import wraps
from flask import Flask, jsonify, render_template, request, session
from config import Config
from database.db_setup import init_db
from routes.main_routes import main_bp
from routes.upload_routes import upload_bp
from routes.search_routes import search_bp
from routes.oauth_routes import oauth_bp


# === [TAG FUNGSI: Application Factory Flask (create_app)] ===
# Penjelasan: Mengonfigurasi dan merakit seluruh komponen aplikasi, middleware, rute, dan sistem keamanan
def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)

    # === [TAG MIDDLEWARE: Kontrol Cache Header] ===
    # Penjelasan: Memastikan browser tidak menyimpan cache respons agar data dokumen dan dashboard selalu mutakhir
    @app.after_request
    def add_header(response):
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
        return response

    # ── Rate Limiting ────────────────────────────────────────────────────────
    # === [TAG KEAMANAN: Inisialisasi Rate Limiter] ===
    # Penjelasan: Membatasi frekuensi request per pengguna/IP agar server terlindung dari serangan spam dan brute force
    from extensions import limiter
    limiter.init_app(app)

    # Initialise MySQL schema (creates DB + all tables if not present)
    # Removed automatic init_db() to prevent DDL execution on startup.
    # try:
    #     init_db(app.config['DB_CONFIG'])
    # except Exception as e:
    #     print(f"[Warning] DB Initialization skipped or failed: {e}")

    # === [TAG RUTE: Pendaftaran Blueprint / Modul Controller] ===
    # Penjelasan: Membagi rute aplikasi menjadi sub-modul (Halaman Utama, OAuth, Upload Dokumen, dan Pencarian)
    app.register_blueprint(main_bp)
    app.register_blueprint(oauth_bp)
    app.register_blueprint(upload_bp, url_prefix='/api')
    app.register_blueprint(search_bp, url_prefix='/api')

    # ── CSRF Protection ──────────────────────────────────────────────────────
    # Endpoints exempt from CSRF validation (OAuth callbacks use GET)
    CSRF_EXEMPT_ENDPOINTS = {
        'oauth.google_callback',
        'oauth.github_callback',
    }

    # === [TAG KEAMANAN: Pembuatan Token CSRF] ===
    # Penjelasan: Membuat token unik acak (32-byte hex) per sesi pengguna untuk memvalidasi keaslian request
    def _generate_csrf_token():
        """Generate or return existing CSRF token for the current session."""
        if '_csrf_token' not in session:
            session['_csrf_token'] = secrets.token_hex(32)
        return session['_csrf_token']

    # === [TAG TEMPLATE: Injeksi Token CSRF ke Jinja2] ===
    # Penjelasan: Menyisipkan token CSRF ke seluruh template HTML secara otomatis agar dapat dibaca frontend
    @app.context_processor
    def inject_csrf_token():
        """Make csrf_token available in all Jinja2 templates."""
        return {'csrf_token': _generate_csrf_token()}

    # === [TAG ENDPOINT API: Ambil Token CSRF] ===
    # Penjelasan: Rute GET untuk JavaScript jika perlu mengambil token CSRF terbaru secara dinamis
    @app.route('/api/csrf-token', methods=['GET'])
    def get_csrf_token():
        """Endpoint for JavaScript to fetch a CSRF token."""
        return jsonify({'csrf_token': _generate_csrf_token()})

    # === [TAG MIDDLEWARE: Validasi Keamanan CSRF pada Request Mutasi] ===
    # Penjelasan: Mencegat setiap request POST, PUT, DELETE untuk memastikan token X-CSRF-Token cocok dengan session
    @app.before_request
    def csrf_protect():
        """Validate CSRF token on all state-changing requests (POST/PUT/DELETE)."""
        if request.method in ('POST', 'PUT', 'DELETE'):
            # Skip CSRF for exempt endpoints (OAuth callbacks)
            if request.endpoint in CSRF_EXEMPT_ENDPOINTS:
                return

            # Check X-CSRF-Token header (preferred for AJAX/fetch)
            token = request.headers.get('X-CSRF-Token', '')
            if not token:
                # Fallback: check form data
                token = request.form.get('_csrf_token', '')

            expected = session.get('_csrf_token', '')

            if not expected or not token or token != expected:
                if request.path.startswith('/api/'):
                    return jsonify({
                        'status': 'error',
                        'message': 'CSRF token tidak valid atau tidak ditemukan. Silakan muat ulang halaman.'
                    }), 403
                return "Forbidden — CSRF token invalid", 403

    # === [TAG KEAMANAN: Header Keamanan Browser Global] ===
    # Penjelasan: Menambahkan header proteksi terhadap serangan Clickjacking (X-Frame-Options), MIME sniffing, dan XSS
    @app.after_request
    def set_security_headers(response):
        """Global Security Headers for all responses."""
        response.headers['X-Frame-Options'] = 'DENY'
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
        response.headers['X-XSS-Protection'] = '1; mode=block'
        return response

    # === [TAG ERROR HANDLER: Penanganan Kesalahan HTTP Global] ===
    # Penjelasan: Menangani respon error 400, 404, 413, 429, dan 500 secara rapi baik format JSON (API) maupun HTML
    @app.errorhandler(400)
    def bad_request(error):
        if request.path.startswith('/api/'):
            return jsonify({'status': 'error', 'message': 'Bad request', 'error': str(error)}), 400
        return "Bad Request", 400

    @app.errorhandler(404)
    def not_found(error):
        if request.path.startswith('/api/'):
            return jsonify({'status': 'error', 'message': 'Endpoint or resource not found'}), 404
        return render_template('404.html'), 404

    @app.errorhandler(429)
    def ratelimit_handler(e):
        if request.path.startswith('/api/'):
            return jsonify({'status': 'error', 'message': f'Rate limit exceeded: {e.description}'}), 429
        return "Terlalu banyak permintaan (Rate Limit). Coba lagi nanti.", 429

    @app.errorhandler(413)
    def payload_too_large(error):
        return jsonify({
            'success': False,
            'error': 'Ukuran file melebihi batas maksimal (50 MB)'
        }), 413

    @app.errorhandler(500)
    def internal_error(error):
        if request.path.startswith('/api/'):
            return jsonify({'status': 'error', 'message': 'Internal server error occurred'}), 500
        return render_template('500.html'), 500

    return app


# === [TAG ENTRY POINT: Inisialisasi & Eksekusi Server Utama] ===
# Penjelasan: Membuat instance aplikasi dan menjalankan web server lokal saat file app.py dieksekusi langsung
app = create_app()

if __name__ == '__main__':
    host = os.environ.get('FLASK_HOST', '127.0.0.1')
    port = int(os.environ.get('FLASK_PORT', 5000))
    debug = os.environ.get('FLASK_DEBUG', 'False').lower() in ('true', '1', 't')
    app.run(host=host, port=port, debug=debug)
