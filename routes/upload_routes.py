"""
DocuMind File Upload API.
Uses DocumentModel with MySQL DB_CONFIG dict.
"""

import os
import re
from pathlib import Path
from flask import Blueprint, request, jsonify, current_app, session
import uuid
from werkzeug.utils import secure_filename
from database.models import DocumentModel, UserModel
from core.extractor import extract_document_data, get_normalized_file_type, classify_document_category
from core.auth import get_current_user_id, login_required
from routes.search_routes import DEFAULT_SETTINGS

# === [TAG BLUEPRINT: Modul Rute Unggah Berkas (upload_bp)] ===
# Penjelasan: Blueprint yang mengelola validasi file, penyimpanan server, dan penugasan background thread ekstraksi teks OCR
upload_bp = Blueprint('upload', __name__)


# === [TAG DAFTAR: Format Ekstensi yang Diizinkan (ALLOWED_EXTENSIONS)] ===
# Penjelasan: Daftar format berkas yang diizinkan untuk diunggah (dokumen, web, gambar, kode program, dan teks). Ekstensi eksekusi berbahaya dicegah.
DANGEROUS_EXTENSIONS = {
    'exe', 'bat', 'cmd', 'com', 'msi', 'dll', 'so', 'dylib', 'scr',
    'vbs', 'pif', 'application', 'gadget', 'msp', 'hta', 'cpl', 'msc', 'jar', 'drv', 'sys', 'ps2', 'reg'
}

ALLOWED_EXTENSIONS = {
    # Documents
    'pdf', 'docx', 'doc', 'xlsx', 'xls', 'pptx', 'ppt', 'rtf', 'odt', 'ods', 'odp',
    # Images
    'png', 'jpg', 'jpeg', 'webp', 'tiff', 'tif', 'bmp', 'gif', 'svg', 'ico',
    # Web
    'html', 'htm', 'xhtml',
    # Styles & Configs
    'css', 'scss', 'sass', 'less', 'xml', 'yaml', 'yml', 'json', 'toml', 'ini', 'cfg', 'conf', 'env',
    # Text & Data
    'txt', 'csv', 'tsv', 'md', 'markdown', 'log', 'tex', 'rst', 'sql',
    # Programming & Code
    'py', 'pyw', 'js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'php', 'java', 'c', 'cpp', 'cc', 'cxx', 'h', 'hpp',
    'cs', 'go', 'rs', 'swift', 'kt', 'kts', 'rb', 'r', 'scala', 'dart', 'lua', 'pl', 'perl', 'sh', 'bash',
    'zsh', 'ps1', 'vue', 'svelte', 'graphql', 'proto', 'asm', 's', 'f', 'f90', 'clj', 'elm', 'erl', 'hs',
    'ex', 'exs', 'dockerfile', 'makefile', 'dockerignore', 'gitignore', 'gitattributes', 'editorconfig',
    'procfile', 'license', 'readme'
}


# === [TAG KEAMANAN: Validasi Ekstensi & Tanda Tangan Biner Magic Bytes (is_allowed_file)] ===
# Penjelasan: Memeriksa header biner file asli (misal: b'%PDF' untuk PDF, b'\x89PNG' untuk PNG, b'PK\x03\x04' untuk docx/xlsx) guna mendeteksi malware yang disamarkan
def is_allowed_file(file_stream, filename: str) -> bool:
    """Check whether file has an allowed safe extension and is not a dangerous executable."""
    if not filename:
        return False

    clean_name = filename.replace('\\', '/').strip()
    basename = clean_name.split('/')[-1].strip()
    if not basename:
        return False

    if '.' in basename:
        parts = basename.rsplit('.', 1)
        ext = parts[1].lower() if parts[1] else parts[0].lstrip('.').lower()
    else:
        ext = basename.lower()

    # Reject dangerous executable formats
    if ext in DANGEROUS_EXTENSIONS:
        return False

    # Read header for magic bytes verification
    header = file_stream.read(2048)
    file_stream.seek(0)

    # Immediately block binary executables (MZ for DOS/PE/Windows, ELF for Linux)
    if header.startswith(b'MZ') or header.startswith(b'\x7fELF'):
        return False

    # Map of extensions to their common magic byte signatures
    magic_map = {
        'pdf': [b'%PDF'],
        'png': [b'\x89PNG\r\n\x1a\n'],
        'jpg': [b'\xff\xd8\xff'],
        'jpeg': [b'\xff\xd8\xff'],
        'webp': [b'RIFF'],
        'tiff': [b'II*\x00', b'MM\x00*'],
        'tif': [b'II*\x00', b'MM\x00*'],
        'bmp': [b'BM'],
        'docx': [b'PK\x03\x04'],
        'xlsx': [b'PK\x03\x04'],
        'pptx': [b'PK\x03\x04'],
        'doc': [b'\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1'],
        'xls': [b'\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1'],
        'ppt': [b'\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1'],
        'rtf': [b'{\\rtf1'],
    }

    if ext in magic_map:
        return any(header.startswith(magic) for magic in magic_map[ext])

    # Allowed code, text, web, and document files
    if ext in ALLOWED_EXTENSIONS:
        return True

    # Allow safe text files (no binary null bytes in initial sample)
    if b'\x00' not in header[:512]:
        return True

    return False


# === [TAG KEAMANAN: Pembersihan Nama Berkas (sanitize_filename)] ===
# Penjelasan: Membersihkan karakter terlarang sistem operasi (/ \ : * ? " < > |) guna mencegah serangan Path Traversal
def sanitize_filename(filename: str) -> str:
    """Safely sanitize filename preserving Unicode letters while preventing path traversal."""
    normalized = filename.replace('\\', '/')
    name = Path(normalized).name
    # Replace control chars, slashes, and illegal filesystem characters
    cleaned = re.sub(r'[\r\n\t\x00-\x1f\\/<>:"|?*]', '_', name).strip(' .')
    return cleaned if cleaned else 'uploaded_document'


# === [TAG ENDPOINT API UTAMA: Unggah & Ekstraksi Dokumen Asinkron (handle_upload)] ===
# Penjelasan: Menerima berkas upload, memvalidasi ukuran (<50MB), mencegah overwrite nama file ganda, mendaftarkan tugas ke ocr_queue, dan mengeksekusi ekstraksi teks OCR di latar belakang (Background Thread) agar respon web tetap instan
@upload_bp.route('/upload', methods=['POST'])
@login_required
def handle_upload():
    """
    Document upload endpoint — supports single or multiple files.
    Saves to storage/uploads/<user_id>/ with unique UUID filenames,
    extracts text via OCR/parser, logs to queue scoped to user_id,
    and inserts an indexed record into MySQL scoped to the current user.
    """
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'status': 'error', 'message': 'Authentication required. Please sign in.'}), 401

    files = request.files.getlist('files') or request.files.getlist('file')
    if not files or files[0].filename == '':
        return jsonify({'status': 'error', 'message': 'No file selected'}), 400

    for file in files:
        file.seek(0, os.SEEK_END)
        size = file.tell()
        file.seek(0)
        # Izinkan file kode 0-byte (seperti __init__.py atau .gitkeep pada folder proyek)
        if size > 50 * 1024 * 1024:
            return jsonify({'status': 'error', 'message': f'File {file.filename} melebihi batas maksimal (50 MB).'}), 400

    # Validate file extensions first
    invalid_files = [f.filename for f in files if f and f.filename and not is_allowed_file(f, f.filename)]
    if invalid_files:
        return jsonify({
            'status': 'error',
            'message': f"Tipe file tidak didukung: {', '.join(invalid_files)}. Berkas eksekusi berbahaya (.exe / .bat) tidak diizinkan."
        }), 400

    # Per-user isolated storage folder
    user_upload_folder = Path(current_app.config['UPLOADS_DEFAULT']) / str(user_id)
    user_upload_folder.mkdir(parents=True, exist_ok=True)

    doc_model     = DocumentModel(current_app.config['DB_CONFIG'])
    user_model    = UserModel(current_app.config['DB_CONFIG'])
    user_settings = user_model.get_settings(user_id) or DEFAULT_SETTINGS
    uploaded_docs = []
    ocr_lang      = user_settings.get('tesseract_lang', 'ind+eng')

    for file in files:
        if not (file and file.filename):
            continue

        raw_filename = file.filename
        rel_path = request.form.get('relative_path')
        if rel_path and not ('/' in raw_filename or '\\' in raw_filename):
            raw_filename = rel_path

        # Normalize relative path separators
        clean_name = raw_filename.replace('\\', '/').strip('/')
        base_name  = Path(clean_name).name or 'uploaded_document'
        sec_name   = secure_filename(base_name) or sanitize_filename(base_name)
        unique_name = f"{uuid.uuid4().hex}_{sec_name}"
        saved_path  = user_upload_folder / unique_name

        file.save(str(saved_path))
        file_size = os.path.getsize(str(saved_path))

        # Text extraction moved to background
        file_type = get_normalized_file_type(clean_name)
        category  = classify_document_category(clean_name, "[Sedang Memproses OCR...]")

        # Database display name: simpan nama hierarki path relatif tanpa karakter berbahaya
        db_filename = re.sub(r'(\.\./|\.\.\\)', '', clean_name)
        db_filename = re.sub(r'[\r\n\t\x00-\x1f<>:"|?*]', '_', db_filename)
        if len(db_filename) > 500:
            db_filename = db_filename[-500:]

        doc_id = doc_model.insert_document(
            filename=db_filename,
            filepath=str(saved_path),
            file_type=file_type,
            category=category,
            file_size=file_size,
            content="[Sedang Memproses OCR... Dokumen sedang diekstrak di background]",
            ocr_confidence=0.0,
            user_id=user_id,
        )

        # Log process into ocr_queue table scoped to user_id
        qid = None
        try:
            qid = doc_model.insert_queue_item(
                document_id=doc_id,
                user_id=user_id,
                queue_pos=1,
                source_type='Web Dropzone',
                progress_percent=0,
                status='Queueing'
            )
        except Exception as e:
            current_app.logger.error(f"Failed to insert OCR queue item for doc {doc_id}: {e}")

        # === [TAG THREAD: Pemrosesan OCR Latar Belakang (ocr_background_task)] ===
        # Penjelasan: Fungsi pekerja thread yang menjalankan pipeline ekstraksi teks dan memperbarui status antrean menjadi 'Completed' di database
        def ocr_background_task(app_instance, app_cfg, file_p, doc_idx, uid, lng, queue_idx):
            with app_instance.app_context():
                try:
                    from core.extractor import extract_document_data, classify_document_category
                    from database.models import DocumentModel
                    
                    text, conf = extract_document_data(file_p, lang=lng)
                    cat = classify_document_category(Path(file_p).name, text)
                    
                    bg_model = DocumentModel(app_cfg)
                    bg_model.update_document(doc_idx, content=text, category=cat, ocr_confidence=conf, user_id=uid)
                    if queue_idx:
                        bg_model.update_queue_status(queue_idx, 'Completed', progress_percent=100, user_id=uid)
                except Exception as e:
                    import logging
                    logging.error(f"CRITICAL OCR ERROR PADA DOC {doc_idx}: {str(e)}")
                    if queue_idx:
                        bg_model = DocumentModel(app_cfg)
                        bg_model.update_queue_status(queue_idx, 'Failed', progress_percent=0, user_id=uid)

        import threading
        t = threading.Thread(
            target=ocr_background_task, 
            args=(current_app._get_current_object(), current_app.config['DB_CONFIG'], str(saved_path), doc_id, user_id, ocr_lang, qid)
        )
        t.daemon = True
        t.start()

        doc_data = doc_model.get_document_by_id(doc_id, user_id=user_id)
        if doc_data:
            doc_data['snippet'] = "[Sedang Memproses OCR...]"
            uploaded_docs.append(doc_data)

    stats = doc_model.get_storage_stats(user_id=user_id)

    return jsonify({
        'status':    'success',
        'message':   f'{len(uploaded_docs)} file(s) uploaded and indexed successfully.',
        'documents': uploaded_docs,
        'document':  uploaded_docs[0] if uploaded_docs else None,
        'stats':     stats,
    }), 200
