"""
DocuMind Main & Authentication Routes.
Handles Welcome, Register, Login, Dashboard, and MySQL User Sessions.
"""

from flask import Blueprint, render_template, request, jsonify, redirect, url_for, session, current_app, flash
from database.models import DocumentModel, UserModel
from core.auth import get_current_user_id, login_required

# === [TAG BLUEPRINT: Modul Rute Utama (main_bp)] ===
# Penjelasan: Blueprint pengatur halaman web antarmuka dan API autentikasi pengguna
main_bp = Blueprint('main', __name__)


# === [TAG RUTE HALAMAN: Halaman Sambutan / Landing Page] ===
# Penjelasan: Menampilkan landing page awal aplikasi (/ atau /welcome) untuk pengguna publik
@main_bp.route('/')
@main_bp.route('/welcome')
def welcome():
    """Welcome / Landing Page for DocuMind."""
    return render_template('welcome.html')


# === [TAG RUTE HALAMAN: Halaman Pendaftaran Akun] ===
# Penjelasan: Menampilkan form registrasi pengguna baru
@main_bp.route('/register')
def register():
    """Create Account / Register Page."""
    return render_template('register.html')


# === [TAG RUTE HALAMAN: Halaman Masuk Akun (Login)] ===
# Penjelasan: Menampilkan form login pengguna
@main_bp.route('/login')
def login():
    """Authentication Page (Sign In) for DocuMind."""
    return render_template('login.html')


# === [TAG RUTE: Logout / Keluar Sesi] ===
# Penjelasan: Menghapus data sesi pengguna (session.clear) dan mengarahkan kembali ke halaman selamat datang
@main_bp.route('/logout', methods=['GET', 'POST'])
def logout():
    """Clear session and logout."""
    session.clear()
    return redirect(url_for('main.welcome'))


from extensions import limiter

# === [TAG ENDPOINT API: Registrasi Pengguna Baru] ===
# Penjelasan: Memproses pendaftaran user baru dengan proteksi rate limit (maks 5 request/menit) dan validasi minimal 8 karakter password
@main_bp.route('/api/auth/register', methods=['POST'])
@limiter.limit("5 per minute")
def api_register():
    """Handle User Registration and persist to MySQL users table."""
    data = request.get_json() or {}
    full_name = data.get('full_name', '').strip()
    email = data.get('email', '').strip()
    password = data.get('password', '')

    if len(password) < 8:
        return jsonify({'status': 'error', 'message': 'Password minimal 8 karakter.'}), 400

    user_model = UserModel(current_app.config['DB_CONFIG'])
    result = user_model.register_user(full_name=full_name, email=email, password=password)

    if result.get('status') == 'success':
        session['user'] = result.get('user')
        session['user_id'] = result.get('user', {}).get('id')
        return jsonify(result), 201
    else:
        return jsonify(result), 400


# === [TAG ENDPOINT API: Verifikasi Login Pengguna] ===
# Penjelasan: Memeriksa kecocokan email dan kata sandi di database dengan batas rate limit 5 request/menit
@main_bp.route('/api/auth/login', methods=['POST'])
@limiter.limit("5 per minute")
def api_login():
    """Authenticate User against MySQL users table."""
    data = request.get_json() or {}
    email = data.get('email', '').strip()
    password = data.get('password', '')

    user_model = UserModel(current_app.config['DB_CONFIG'])
    result = user_model.authenticate_user(email=email, password=password)

    if result.get('status') == 'success':
        session['user'] = result.get('user')
        session['user_id'] = result.get('user', {}).get('id')
        return jsonify(result), 200
    else:
        return jsonify(result), 401


# === [TAG ENDPOINT API: Informasi Sesi Aktif (/api/auth/me)] ===
# Penjelasan: Mengembalikan data profil user yang sedang login di sesi browser
@main_bp.route('/api/auth/me', methods=['GET'])
def api_me():
    """Get current active user session."""
    user = session.get('user')
    if user:
        return jsonify({'status': 'success', 'user': user}), 200
    return jsonify({'status': 'guest', 'user': None}), 200


# === [TAG ENDPOINT API: Perbarui Profil & Unggah Avatar] ===
# Penjelasan: Menyimpan perubahan nama, email, dan mengunggah foto avatar profil pengguna ke storage server
@main_bp.route('/api/auth/profile', methods=['POST'])
@login_required
def api_update_profile():
    """Update user profile in MySQL database and current session."""
    import os
    from werkzeug.utils import secure_filename
    import uuid

    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'status': 'error', 'message': 'Sesi telah berakhir. Silakan login kembali.'}), 401

    # Dukung pengiriman FormData (termasuk file) maupun JSON (jika fall-back)
    full_name = request.form.get('full_name', '').strip()
    email = request.form.get('email', '').strip()

    if not full_name and not email:
        data = request.get_json() or {}
        full_name = data.get('full_name', '').strip()
        email = data.get('email', '').strip()

    avatar_url = None
    if 'avatar_file' in request.files:
        file = request.files['avatar_file']
        if file and file.filename != '':
            ext = file.filename.rsplit('.', 1)[-1].lower() if '.' in file.filename else ''
            if ext in ['png', 'jpg', 'jpeg', 'webp']:
                unique_filename = f"user_{user_id}_{uuid.uuid4().hex}.{ext}"
                save_path = os.path.join(current_app.config['AVATARS_FOLDER'], unique_filename)
                file.save(save_path)
                avatar_url = f"/avatars/{unique_filename}"

    user_model = UserModel(current_app.config['DB_CONFIG'])
    try:
        user_data = user_model.get_user_by_id(user_id) or {}
        result = user_model.update_user_profile(
            user_id=user_id,
            full_name=full_name or user_data.get('full_name'),
            email=email or user_data.get('email'),
            avatar_url=avatar_url
        )
        if result.get('status') == 'success':
            session['user'] = result['user']
            session['user_id'] = result['user']['id']
            return jsonify(result), 200
        else:
            return jsonify(result), 400
    except Exception as e:
        current_app.logger.error(f"Profile update error: {e}")
        return jsonify({'status': 'error', 'message': 'Terjadi kesalahan sistem saat menyimpan data.'}), 500


# === [TAG RUTE STATIK: Akses Gambar Avatar Pengguna] ===
# Penjelasan: Menyajikan file foto profil dari folder storage/avatars/
@main_bp.route('/avatars/<filename>')
def serve_avatar(filename):
    """Serve uploaded user avatars."""
    from flask import send_from_directory
    return send_from_directory(current_app.config['AVATARS_FOLDER'], filename)


# === [TAG ENDPOINT API: Ubah Kata Sandi Akun] ===
# Penjelasan: Memvalidasi sandi lama dan menyimpan kata sandi baru (minimal 8 karakter)
@main_bp.route('/api/auth/change-password', methods=['POST'])
@login_required
def api_change_password():
    """Ganti password user yang sedang login."""
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'status': 'error', 'message': 'Sesi telah berakhir. Silakan login kembali.'}), 401

    data = request.get_json() or {}
    old_password = data.get('old_password', '')
    new_password = data.get('new_password', '')
    confirm_password = data.get('confirm_password', '')

    if len(new_password) < 8:
        return jsonify({'status': 'error', 'message': 'Password minimal 8 karakter.'}), 400

    user_model = UserModel(current_app.config['DB_CONFIG'])
    result = user_model.change_password(
        user_id=user['id'],
        old_password=old_password,
        new_password=new_password,
        confirm_password=confirm_password
    )

    if result.get('status') == 'success':
        return jsonify(result), 200
    else:
        return jsonify(result), 400


# ── SECURITY FIX: /api/auth/social endpoint REMOVED ─────────────────────────
# The previous /api/auth/social endpoint accepted arbitrary email addresses
# without any OAuth token verification, allowing full account takeover.
# Social login is now handled exclusively through the secure OAuth 2.0 flows
# in routes/oauth_routes.py (Google, GitHub, Apple callbacks with token exchange).


from itsdangerous import URLSafeTimedSerializer
from core.mailer import send_reset_email

# === [TAG ENDPOINT API: Permintaan Lupa Password] ===
# Penjelasan: Membuat token reset aman berbatas waktu (URLSafeTimedSerializer) dan mengirimkannya ke email terdaftar
@main_bp.route('/api/auth/forgot-password', methods=['POST'])
@limiter.limit("3 per minute")
def api_forgot_password():
    """Send reset password link to email."""
    data = request.get_json() or {}
    email = data.get('email', '').strip()

    if not email:
        return jsonify({'status': 'error', 'message': 'Email diperlukan.'}), 400

    user_model = UserModel(current_app.config['DB_CONFIG'])
    conn = user_model._connect()
    user_exists = False
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM users WHERE email = %s", (email,))
            if cur.fetchone():
                user_exists = True
    finally:
        conn.close()

    if user_exists:
        serializer = URLSafeTimedSerializer(current_app.config['SECRET_KEY'])
        token = serializer.dumps(email, salt='password-reset-salt')
        reset_url = url_for('main.reset_password_page', token=token, _external=True)

        try:
            send_reset_email(email, reset_url)
        except Exception as e:
            print(f"Error sending email: {e}")
            return jsonify({'status': 'error', 'message': 'Gagal mengirim email. Pastikan konfigurasi SMTP diatur dengan benar.'}), 500

    return jsonify({'status': 'success', 'message': 'Jika email terdaftar, tautan reset password telah dikirim.'}), 200


# === [TAG RUTE HALAMAN: Tampilan Form Reset Kata Sandi] ===
# Penjelasan: Memvalidasi usia token reset (maks 3600 detik/1 jam) dan menampilkan formulir kata sandi baru
@main_bp.route('/reset-password/<token>')
def reset_password_page(token):
    """View to reset password using token."""
    serializer = URLSafeTimedSerializer(current_app.config['SECRET_KEY'])
    try:
        email = serializer.loads(token, salt='password-reset-salt', max_age=3600)
    except Exception:
        flash('Link reset password tidak valid atau sudah kadaluarsa.', 'error')
        return redirect(url_for('main.login'))

    return render_template('reset_password.html', token=token, email=email)


# === [TAG ENDPOINT API: Eksekusi Reset Password via Token] ===
# Penjelasan: Menerima input kata sandi baru dan menyimpannya ke MySQL jika token valid
@main_bp.route('/api/auth/reset-password/<token>', methods=['POST'])
def api_reset_password_token(token):
    """Handle the actual password reset using valid token."""
    serializer = URLSafeTimedSerializer(current_app.config['SECRET_KEY'])
    try:
        email = serializer.loads(token, salt='password-reset-salt', max_age=3600)
    except Exception:
        return jsonify({'status': 'error', 'message': 'Token tidak valid atau kadaluarsa.'}), 400

    data = request.get_json() or {}
    new_pw = data.get('new_password', '')
    conf_pw = data.get('confirm_password', '')

    if len(new_pw) < 8:
        return jsonify({'status': 'error', 'message': 'Password minimal 8 karakter.'}), 400

    user_model = UserModel(current_app.config['DB_CONFIG'])
    result = user_model.reset_password_by_email(email, new_pw, conf_pw)
    
    if result.get('status') == 'success':
        return jsonify(result), 200
    return jsonify(result), 400


# === [TAG RUTE HALAMAN UTAMA: Workspace Dashboard Pengguna] ===
# Penjelasan: Merender antarmuka dashboard utama beserta daftar berkas, statistik penyimpanan, dan metrik antrean milik pengguna yang sedang login
@main_bp.route('/dashboard')
@login_required
def dashboard():
    """Main Document Management Workspace strictly scoped to logged-in user."""
    user_id = get_current_user_id()
    if not user_id:
        return redirect(url_for('main.login'))

    user = session.get('user')
    if not user or not isinstance(user, dict):
        user_model = UserModel(current_app.config['DB_CONFIG'])
        user = user_model.get_user_by_id(user_id) or {'id': user_id, 'full_name': 'User', 'email': ''}

    doc_model = DocumentModel(current_app.config['DB_CONFIG'])
    documents = doc_model.get_all_documents(user_id=user_id)
    stats     = doc_model.get_storage_stats(user_id=user_id)
    metrics   = doc_model.get_queue_metrics(user_id=user_id)
    
    return render_template('dashboard.html', documents=documents, stats=stats, metrics=metrics, user=user)


# === [TAG ENDPOINT API: Polling Statistik Real-Time] ===
# Penjelasan: Endpoint GET ringan yang dipanggil secara berkala oleh frontend untuk memperbarui angka statistik dashboard
@main_bp.route('/api/stats', methods=['GET'])
@login_required
def api_stats():
    """Live JSON endpoint for polling dashboard metrics strictly scoped to logged-in user."""
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'status': 'error', 'message': 'Unauthorized'}), 401
    
    doc_model = DocumentModel(current_app.config['DB_CONFIG'])
    stats = doc_model.get_storage_stats(user_id=user_id)
    return jsonify(stats)
