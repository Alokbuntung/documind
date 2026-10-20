"""
DocuMind Real OAuth 2.0 Authentication Routes (Google, GitHub, Apple).
Connects to official OAuth 2.0 / OpenID Connect providers, exchanges tokens,
retrieves real user profile and avatar, and persists user accounts into MySQL.
"""

import os
import secrets
import urllib.parse
import requests
from flask import Blueprint, request, redirect, url_for, session, current_app, render_template, flash
from database.models import UserModel

# === [TAG BLUEPRINT: Modul Rute OAuth Pihak Ketiga (oauth_bp)] ===
# Penjelasan: Menangani alur otorisasi OAuth 2.0 resmi untuk login instan menggunakan akun Google dan GitHub
oauth_bp = Blueprint('oauth', __name__)


# ─────────────────────────────────────────────────────────────────────────────
# 🔵 GOOGLE OAUTH 2.0 (Official OpenID Connect)
# ─────────────────────────────────────────────────────────────────────────────

# === [TAG RUTE: Inisiasi Alur Otorisasi Google] ===
# Penjelasan: Mengarahkan browser pengguna ke halaman resmi Google (accounts.google.com) dengan parameter client_id dan token state acak untuk proteksi CSRF
@oauth_bp.route('/auth/google')
@oauth_bp.route('/auth/google/login')
def google_login():
    """Initiate official Google OAuth 2.0 authorization flow."""
    client_id = current_app.config.get('GOOGLE_CLIENT_ID', '').strip()
    
    # If Google Client ID is configured in .env, redirect to real accounts.google.com
    if client_id:
        redirect_uri = url_for('oauth.google_callback', _external=True)
        state = secrets.token_urlsafe(16)
        session['oauth_state_google'] = state
        
        params = {
            'client_id': client_id,
            'redirect_uri': redirect_uri,
            'response_type': 'code',
            'scope': 'openid email profile',
            'access_type': 'offline',
            'prompt': 'select_account',
            'state': state
        }
        google_auth_url = f"https://accounts.google.com/o/oauth2/v2/auth?{urllib.parse.urlencode(params)}"
        return redirect(google_auth_url)
    
    flash('Metode autentikasi ini sedang tidak aktif.', 'warning')
    return redirect(url_for('main.login'))


# === [TAG RUTE: Callback Otorisasi Google] ===
# Penjelasan: Menerima authorization code dari Google, menukarnya dengan Access Token, mengambil profil email/nama/foto, dan menyimpannya ke MySQL via find_or_create_social_user
@oauth_bp.route('/auth/google/callback')
def google_callback():
    """Handle OAuth 2.0 authorization code callback from Google."""
    code = request.args.get('code')
    error = request.args.get('error')
    
    # CSRF State Validation
    expected_state = session.pop('oauth_state_google', None)
    incoming_state = request.args.get('state')
    import secrets
    if not expected_state or not incoming_state or not secrets.compare_digest(expected_state, incoming_state):
        flash('Validasi keamanan OAuth gagal (State mismatch). Silakan coba lagi.', 'error')
        return redirect(url_for('main.login'))
    
    if error or not code:
        flash('Login dengan Google dibatalkan atau terjadi kesalahan.', 'error')
        return redirect(url_for('main.login'))
        
    client_id = current_app.config.get('GOOGLE_CLIENT_ID', '').strip()
    client_secret = current_app.config.get('GOOGLE_CLIENT_SECRET', '').strip()
    redirect_uri = url_for('oauth.google_callback', _external=True)
    
    if not (client_id and client_secret):
        return redirect(url_for('oauth.google_login'))
        
    try:
        # 1. Exchange authorization code for Access Token
        token_url = "https://oauth2.googleapis.com/token"
        token_payload = {
            'code': code,
            'client_id': client_id,
            'client_secret': client_secret,
            'redirect_uri': redirect_uri,
            'grant_type': 'authorization_code'
        }
        token_resp = requests.post(token_url, data=token_payload, timeout=12)
        token_data = token_resp.json()
        access_token = token_data.get('access_token')
        
        if not access_token:
            return redirect(url_for('main.login'))
            
        # 2. Fetch real user profile from Google UserInfo endpoint
        userinfo_url = "https://www.googleapis.com/oauth2/v3/userinfo"
        userinfo_resp = requests.get(
            userinfo_url,
            headers={'Authorization': f'Bearer {access_token}'},
            timeout=12
        )
        profile = userinfo_resp.json()
        
        email = profile.get('email')
        full_name = profile.get('name') or profile.get('given_name') or 'Google User'
        avatar_url = profile.get('picture')
        
        # 3. Store / Authenticate into MySQL database
        user_model = UserModel(current_app.config['DB_CONFIG'])
        res = user_model.find_or_create_social_user(
            provider='google',
            email=email,
            full_name=full_name,
            avatar_url=avatar_url
        )
        
        if res.get('status') == 'success':
            session['user'] = res.get('user')
            session['user_id'] = res.get('user', {}).get('id')
            return redirect(url_for('main.dashboard'))
        else:
            return redirect(url_for('main.login'))
            
    except Exception as e:
        print(f"[Google OAuth Error]: {e}")
        return redirect(url_for('main.login'))


# ─────────────────────────────────────────────────────────────────────────────
# 🟢 GITHUB OAUTH 2.0 (Official GitHub API)
# ─────────────────────────────────────────────────────────────────────────────

# === [TAG RUTE: Inisiasi Alur Otorisasi GitHub] ===
# Penjelasan: Mengarahkan browser ke halaman otorisasi GitHub (github.com/login/oauth/authorize) dengan izin baca profil dan email
@oauth_bp.route('/auth/github')
@oauth_bp.route('/auth/github/login')
def github_login():
    """Initiate official GitHub OAuth 2.0 authorization flow."""
    client_id = current_app.config.get('GITHUB_CLIENT_ID', '').strip()
    
    # If GitHub Client ID is configured in .env, redirect to real github.com
    if client_id:
        redirect_uri = url_for('oauth.github_callback', _external=True)
        state = secrets.token_urlsafe(16)
        session['oauth_state_github'] = state
        
        params = {
            'client_id': client_id,
            'redirect_uri': redirect_uri,
            'scope': 'read:user user:email',
            'state': state
        }
        gh_auth_url = f"https://github.com/login/oauth/authorize?{urllib.parse.urlencode(params)}"
        return redirect(gh_auth_url)
    flash('Metode autentikasi ini sedang tidak aktif.', 'warning')
    return redirect(url_for('main.login'))


# === [TAG RUTE: Callback Otorisasi GitHub] ===
# Penjelasan: Menerima authorization code dari GitHub, mengambil token akses, meminta data profil dan email utama, lalu mendaftarkan sesi pengguna ke MySQL
@oauth_bp.route('/auth/github/callback')
def github_callback():
    """Handle OAuth 2.0 authorization code callback from GitHub."""
    code = request.args.get('code')
    error = request.args.get('error')
    
    # CSRF State Validation
    expected_state = session.pop('oauth_state_github', None)
    incoming_state = request.args.get('state')
    import secrets
    if not expected_state or not incoming_state or not secrets.compare_digest(expected_state, incoming_state):
        flash('Validasi keamanan OAuth gagal (State mismatch). Silakan coba lagi.', 'error')
        return redirect(url_for('main.login'))
    
    if error or not code:
        return redirect(url_for('main.login'))
        
    client_id = current_app.config.get('GITHUB_CLIENT_ID', '').strip()
    client_secret = current_app.config.get('GITHUB_CLIENT_SECRET', '').strip()
    redirect_uri = url_for('oauth.github_callback', _external=True)
    
    if not (client_id and client_secret):
        return redirect(url_for('oauth.github_login'))
        
    try:
        # 1. Exchange authorization code for Access Token
        token_url = "https://github.com/login/oauth/access_token"
        token_resp = requests.post(
            token_url,
            json={
                'client_id': client_id,
                'client_secret': client_secret,
                'code': code,
                'redirect_uri': redirect_uri
            },
            headers={'Accept': 'application/json'},
            timeout=12
        )
        token_data = token_resp.json()
        access_token = token_data.get('access_token')
        
        if not access_token:
            return redirect(url_for('main.login'))
            
        # 2. Fetch user profile from GitHub API
        headers = {
            'Authorization': f'Bearer {access_token}',
            'Accept': 'application/json',
            'User-Agent': 'DocuMind-App'
        }
        gh_user_resp = requests.get('https://api.github.com/user', headers=headers, timeout=12)
        gh_user = gh_user_resp.json()
        
        full_name = gh_user.get('name') or gh_user.get('login') or 'GitHub Developer'
        email = gh_user.get('email')
        avatar_url = gh_user.get('avatar_url')
        
        # If public email is null, fetch from /user/emails endpoint
        if not email:
            try:
                emails_resp = requests.get('https://api.github.com/user/emails', headers=headers, timeout=12)
                emails = emails_resp.json()
                if isinstance(emails, list) and emails:
                    primary = next((e['email'] for e in emails if e.get('primary') and e.get('verified')), None)
                    email = primary or emails[0].get('email')
            except Exception:
                pass
                
        if not email:
            email = f"{gh_user.get('login', 'developer')}@github.documind.ai"
            
        # 3. Store / Authenticate into MySQL database
        user_model = UserModel(current_app.config['DB_CONFIG'])
        res = user_model.find_or_create_social_user(
            provider='github',
            email=email,
            full_name=full_name,
            avatar_url=avatar_url
        )
        
        if res.get('status') == 'success':
            session['user'] = res.get('user')
            session['user_id'] = res.get('user', {}).get('id')
            return redirect(url_for('main.dashboard'))
        else:
            return redirect(url_for('main.login'))
            
    except Exception as e:
        print(f"[GitHub OAuth Error]: {e}")
        return redirect(url_for('main.login'))


# ─────────────────────────────────────────────────────────────────────────────
# ⚫ APPLE SIGN IN
# ─────────────────────────────────────────────────────────────────────────────
