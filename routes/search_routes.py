"""
DocuMind Search, Document, Queue & Settings API Routes.
All DB calls use DocumentModel with MySQL DB_CONFIG dict.
Mock/hardcoded data has been fully purged — all responses are live DB values.
"""

import io
import os
import zipfile
from pathlib import Path
from flask import Blueprint, request, jsonify, current_app, send_file, Response, session
from database.models import DocumentModel
from core.auth import get_current_user_id, login_required

# === [TAG BLUEPRINT: Modul Rute Pencarian & Manajemen Dokumen (search_bp)] ===
# Penjelasan: Blueprint yang menangani API Full-Text Search, operasi CRUD dokumen, unduhan arsip ZIP, pemantauan antrean OCR, dan preferensi sistem
search_bp = Blueprint('search', __name__)


# === [TAG HELPER: Instansiasi Model Dokumen (_model)] ===
# Penjelasan: Menghubungkan DocumentModel ke konfigurasi database aktif aplikasi
def _model():
    """Return a DocumentModel bound to the current app's DB config."""
    return DocumentModel(current_app.config['DB_CONFIG'])


# === [TAG HELPER: Identifikasi Pengguna Aktif (_get_current_user_id)] ===
# Penjelasan: Mengambil user_id dari sesi login aktif untuk memastikan isolasi data multi-tenant (user hanya bisa mengakses datanya sendiri)
def _get_current_user_id():
    """Extract user_id from active session if logged in."""
    return get_current_user_id()


# ── Document Search & Listing ──────────────────────────────────────────────────

# === [TAG ENDPOINT API UTAMA: Pencarian Cerdas Teks Penuh (/api/search)] ===
# Penjelasan: Menerima parameter query teks pencarian (q), filter tipe file (type), dan kategori (category). Menjalankan pencarian Full-Text MySQL InnoDB secara cepat
@search_bp.route('/search', methods=['GET'])
@login_required
def handle_search():
    """
    Full-Text Search endpoint strictly scoped to logged-in user.
    Uses MySQL FULLTEXT BOOLEAN MODE when a query is supplied.
    """
    user_id = _get_current_user_id()
    if not user_id:
        return jsonify({'status': 'error', 'message': 'Authentication required. Please sign in.'}), 401

    query     = request.args.get('q',        '').strip()
    file_type = request.args.get('type',     'all').strip()
    category  = request.args.get('category', 'all').strip()

    doc_model = _model()
    results   = doc_model.search_documents(query=query, file_type=file_type, category=category, user_id=user_id)
    stats     = doc_model.get_storage_stats(user_id=user_id)

    return jsonify({
        'status':   'success',
        'query':    query,
        'type':     file_type,
        'category': category,
        'count':    len(results),
        'results':  results,
        'stats':    stats,
    }), 200


# === [TAG ENDPOINT API: Daftar Seluruh Dokumen (/api/documents)] ===
# Penjelasan: Alias dari endpoint /search tanpa kata kunci pencarian, mengambil semua daftar berkas milik user
@search_bp.route('/documents', methods=['GET'])
@login_required
def handle_documents():
    """Alias for /search — supports category & type filter params."""
    return handle_search()


# ── Single Document Operations ─────────────────────────────────────────────────

# === [TAG ENDPOINT API: Detail Dokumen untuk Modal Pratinjau] ===
# Penjelasan: Mengambil isi teks hasil ekstraksi dan metadata dokumen berdasarkan ID untuk ditampilkan pada modal preview split-screen
@search_bp.route('/document/<int:doc_id>', methods=['GET'])
@search_bp.route('/documents/<int:doc_id>', methods=['GET'])
@login_required
def get_document_details(doc_id):
    """Fetch full document details for the preview modal strictly scoped to user."""
    user_id = _get_current_user_id()
    if not user_id:
        return jsonify({'status': 'error', 'message': 'Authentication required. Please sign in.'}), 401

    doc = _model().get_document_by_id(doc_id, user_id=user_id)
    if not doc:
        return jsonify({'status': 'error', 'message': 'Document not found'}), 404
    return jsonify({'status': 'success', 'document': doc}), 200


# === [TAG ENDPOINT API: Hapus Dokumen Tunggal] ===
# Penjelasan: Menghapus data berkas di database dan menghapus file fisik terkait dari penyimpanan server
@search_bp.route('/document/<int:doc_id>', methods=['DELETE'])
@search_bp.route('/documents/<int:doc_id>', methods=['DELETE'])
@login_required
def delete_document(doc_id):
    """Delete a document record strictly scoped to user."""
    user_id = _get_current_user_id()
    if not user_id:
        return jsonify({'status': 'error', 'message': 'Authentication required. Please sign in.'}), 401

    doc_model = _model()
    # Pastikan dokumen milik user yang sedang login sebelum menghapus
    existing = doc_model.get_document_by_id(doc_id, user_id=user_id)
    if not existing:
        return jsonify({'status': 'error', 'message': 'Document not found'}), 404

    filepath_str = doc_model.delete_document(doc_id, user_id=user_id)

    if filepath_str and os.path.exists(filepath_str):
        try:
            os.remove(filepath_str)
        except Exception:
            pass

    stats = doc_model.get_storage_stats(user_id=user_id)
    return jsonify({
        'status':  'success',
        'message': 'Document deleted from database and storage.',
        'doc_id':  doc_id,
        'stats':   stats,
    }), 200


# === [TAG ENDPOINT API: Koreksi & Edit Teks OCR Dokumen] ===
# Penjelasan: Menyimpan pembaruan teks yang diedit secara manual oleh pengguna di jendela preview modal
@search_bp.route('/document/<int:doc_id>', methods=['PUT'])
@search_bp.route('/documents/<int:doc_id>', methods=['PUT'])
@login_required
def update_document(doc_id):
    """Update document content or metadata strictly scoped to user."""
    user_id = _get_current_user_id()
    if not user_id:
        return jsonify({'status': 'error', 'message': 'Authentication required. Please sign in.'}), 401

    doc_model = _model()
    # Pastikan dokumen ada dan milik user aktif
    existing = doc_model.get_document_by_id(doc_id, user_id=user_id)
    if not existing:
        return jsonify({'status': 'error', 'message': 'Document not found'}), 404

    data     = request.get_json() or {}
    content  = data.get('content')
    category = data.get('category')
    filename = data.get('filename')
    
    ALLOWED_CATEGORIES = {
        'Kuitansi', 'Sertifikat', 'Faktur', 'Dokumen Kantor', 'General', 'Umum',
        'Web Pages', 'Text & Code', 'PDF Documents', 'Office & Sheets', 'Image OCR'
    }
    if category and category not in ALLOWED_CATEGORIES:
        return jsonify({'status': 'error', 'message': 'Kategori tidak valid.'}), 400
    
    if filename:
        from werkzeug.utils import secure_filename
        filename = secure_filename(filename)

    updated = doc_model.update_document(doc_id, content=content, category=category, filename=filename, user_id=user_id)
    if not updated:
        return jsonify({'status': 'error', 'message': 'Failed to update document'}), 400

    updated_doc = doc_model.get_document_by_id(doc_id, user_id=user_id)
    return jsonify({
        'status':   'success',
        'message':  'Document updated successfully.',
        'document': updated_doc,
    }), 200


# ── Bulk Operations ────────────────────────────────────────────────────────────

# === [TAG ENDPOINT API: Penghapusan Massal Dokumen (Bulk Delete)] ===
# Penjelasan: Menerima array ID dokumen dari kotak centang (checkbox) tabel dan menghapus seluruh berkas terpilih dalam satu operasi
@search_bp.route('/documents/bulk-delete', methods=['POST'])
@login_required
def bulk_delete_documents():
    """Delete multiple documents in a single request scoped to current user."""
    user_id = _get_current_user_id()
    if not user_id:
        return jsonify({'status': 'error', 'message': 'Authentication required. Please sign in.'}), 401

    data = request.get_json() or {}
    doc_ids = data.get('doc_ids', []) or data.get('document_ids', [])
    if not doc_ids:
        return jsonify({'status': 'error', 'message': 'No document IDs provided'}), 400

    doc_model = _model()
    deleted_count = 0
    for doc_id in doc_ids:
        try:
            # Pastikan dokumen ada dan milik user aktif sebelum menghapus
            existing = doc_model.get_document_by_id(int(doc_id), user_id=user_id)
            if existing:
                filepath = doc_model.delete_document(int(doc_id), user_id=user_id)
                if filepath and os.path.exists(filepath):
                    try:
                        os.remove(filepath)
                    except Exception:
                        pass
                deleted_count += 1
        except Exception:
            pass

    stats = doc_model.get_storage_stats(user_id=user_id)
    return jsonify({
        'status': 'success',
        'message': f'{deleted_count} document(s) deleted successfully.',
        'deleted_count': deleted_count,
        'stats': stats,
    }), 200


# === [TAG ENDPOINT API: Unduh Dokumen Massal format ZIP (Bulk Download)] ===
# Penjelasan: Memaketkan seluruh berkas dokumen terpilih menjadi file kompresi ZIP menggunakan temporary file di disk
@search_bp.route('/documents/bulk-download', methods=['POST'])
@login_required
def bulk_download_documents():
    """Create a ZIP archive of selected documents and send as download."""
    user_id = _get_current_user_id()
    if not user_id:
        return jsonify({'status': 'error', 'message': 'Authentication required. Please sign in.'}), 401

    data = request.get_json() or {}
    doc_ids = data.get('doc_ids') or data.get('document_ids') or []
    if not doc_ids:
        return jsonify({'status': 'error', 'message': 'No document IDs provided'}), 400

    doc_model = _model()
    import tempfile
    
    # Gunakan disk untuk menyusun ZIP, bukan memory (RAM) agar tidak Exhausted.
    temp_dir = current_app.config['TEMP_FOLDER']
    zip_temp = tempfile.NamedTemporaryFile(dir=temp_dir, suffix='.zip', delete=False)
    
    try:
        with zipfile.ZipFile(zip_temp.name, 'w', zipfile.ZIP_DEFLATED) as zip_file:
            for doc_id in doc_ids:
                try:
                    doc = doc_model.get_document_by_id(int(doc_id), user_id=user_id)
                    if not doc:
                        continue

                    filepath = Path(doc['filepath']) if doc.get('filepath') else None
                    from werkzeug.utils import secure_filename
                    archive_name = secure_filename(doc.get('filename', f'document_{doc_id}.txt'))

                    if filepath and filepath.exists():
                        zip_file.write(str(filepath), arcname=archive_name)
                    elif doc.get('content'):
                        zip_file.writestr(f"{archive_name}.txt", doc['content'])
                except Exception:
                    pass
        
        return send_file(
            zip_temp.name,
            mimetype='application/zip',
            as_attachment=True,
            download_name='documind_export.zip'
        )
    except Exception as e:
        import os
        if os.path.exists(zip_temp.name):
            os.remove(zip_temp.name)
        return jsonify({'status': 'error', 'message': str(e)}), 500


# ── File Serving ───────────────────────────────────────────────────────────────

# === [TAG ENDPOINT API: Unduh Dokumen Asli Tunggal] ===
# Penjelasan: Mengirimkan berkas asli ke browser sebagai lampiran download (Content-Disposition: attachment)
@search_bp.route('/download/<int:doc_id>', methods=['GET'])
@search_bp.route('/documents/<int:doc_id>/download', methods=['GET'])
@login_required
def download_document(doc_id):
    """Trigger browser download of a document's physical file."""
    user_id = _get_current_user_id()
    if not user_id:
        return jsonify({'status': 'error', 'message': 'Authentication required. Please sign in.'}), 401

    doc = _model().get_document_by_id(doc_id, user_id=user_id)
    if not doc:
        return jsonify({'status': 'error', 'message': 'Document not found'}), 404

    filepath = Path(doc['filepath']).resolve()
    uploads_dir = Path(current_app.config['UPLOADS_DEFAULT']).resolve()
    if not filepath.is_relative_to(uploads_dir):
        return jsonify({'status': 'error', 'message': 'Access Denied: Invalid file path'}), 403

    if not filepath.exists():
        return Response(
            doc.get('content', 'File content not available'),
            mimetype='text/plain',
            headers={'Content-Disposition': f'attachment; filename="{doc["filename"]}"'},
        )
    return send_file(str(filepath), as_attachment=True, download_name=Path(doc['filename']).name)


# === [TAG ENDPOINT API: Sajikan Berkas Gambar/PDF untuk Preview Modal] ===
# Penjelasan: Menampilkan file gambar atau dokumen PDF secara langsung di layar modal pratinjau (inline) dengan header keamanan CSP dan nosniff
@search_bp.route('/file/<int:doc_id>', methods=['GET'])
@search_bp.route('/documents/<int:doc_id>/file', methods=['GET'])
@login_required
def serve_document_file(doc_id):
    """Serve a document file inline for the preview modal."""
    user_id = _get_current_user_id()
    if not user_id:
        return jsonify({'status': 'error', 'message': 'Authentication required. Please sign in.'}), 401

    doc = _model().get_document_by_id(doc_id, user_id=user_id)
    if not doc:
        return jsonify({'status': 'error', 'message': 'Document not found'}), 404

    filepath = Path(doc['filepath']).resolve()
    uploads_dir = Path(current_app.config['UPLOADS_DEFAULT']).resolve()
    if not filepath.is_relative_to(uploads_dir):
        return jsonify({'status': 'error', 'message': 'Access Denied: Invalid file path'}), 403

    if not filepath.exists():
        return Response(doc.get('content', 'File content not available'), mimetype='text/plain')

    import mimetypes
    mime_type, _ = mimetypes.guess_type(str(filepath))
    if not mime_type:
        mime_type = 'application/octet-stream'

    # SECURITY: Force download for HTML files to prevent Stored XSS,
    # and add security headers for all served files.
    ext = filepath.suffix.lower()
    if ext in ('.html', '.htm', '.svg', '.xml'):
        response = send_file(str(filepath), as_attachment=True, download_name=Path(doc.get('filename', filepath.name)).name)
    else:
        response = send_file(str(filepath), mimetype=mime_type, as_attachment=False)

    response.headers['X-Content-Type-Options'] = 'nosniff'
    # Allow inline image rendering and PDF plugin viewing
    response.headers['Content-Security-Policy'] = "default-src 'none'; img-src 'self'; object-src 'self'; frame-ancestors 'self'; style-src 'none'; script-src 'none'"
    return response


# ── OCR Queue ─────────────────────────────────────────────────────────────────

# === [TAG ENDPOINT API: Ambil Status Antrean Pemrosesan OCR] ===
# Penjelasan: Mengembalikan daftar tugas pemindaian teks yang sedang berjalan atau gagal beserta metrik akurasi
@search_bp.route('/queue', methods=['GET'])
@login_required
def get_processing_queue():
    """
    Return the live OCR processing queue from the `ocr_queue` table strictly scoped to user.
    """
    user_id = _get_current_user_id()
    if not user_id:
        return jsonify({'status': 'error', 'message': 'Authentication required. Please sign in.'}), 401

    doc_model    = _model()
    queue_items  = doc_model.get_queue_items(user_id=user_id)
    metrics      = doc_model.get_queue_metrics(user_id=user_id)
    stats        = doc_model.get_storage_stats(user_id=user_id)

    # Format queue items for the UI
    formatted = []
    failed_items = []
    for item in queue_items:
        size_bytes = item.get('file_size') or 0
        status_val = item.get('status', 'Completed')
        conf_val   = round(float(item.get('ocr_confidence', 0.95)) * 100, 1)
        engine_str = 'Tesseract v5' if item.get('file_type') == 'image' else ('PyPDF + OCR' if item.get('file_type') == 'pdf' else 'DocParser')

        q_obj = {
            'id':                  item['id'],
            'document_id':         item.get('document_id'),
            'filename':            item.get('filename', 'Unknown'),
            'file_type':           item.get('file_type', 'other'),
            'file_size_formatted': f"{round(size_bytes / (1024 * 1024), 2)} MB" if size_bytes >= 1024*1024 else f"{round(size_bytes / 1024, 1)} KB",
            'source':              item.get('source_type', 'Web Dropzone'),
            'queue_pos':           f"#{str(item.get('id', 1)).zfill(3)}",
            'engine':              engine_str,
            'confidence':          f"{conf_val}%",
            'progress':            item.get('progress_percent', 100),
            'status':              status_val,
            'created_at':          item.get('created_at', ''),
        }
        formatted.append(q_obj)
        if status_val == 'Failed':
            failed_items.append(q_obj)

    return jsonify({
        'status':             'success',
        'active_tasks':       metrics['active_tasks'],
        'confidence_rate':    metrics['confidence_rate'],
        'failed_tasks_count': metrics['failed_tasks_count'],
        'queue':              formatted,
        'failed_retries':     failed_items,
        'stats':              stats,
    }), 200


# === [TAG ENDPOINT API: Bersihkan Riwayat Antrean Selesai] ===
# Penjelasan: Menghapus log antrean yang berstatus 'Completed' dari basis data
@search_bp.route('/queue/clear', methods=['POST'])
@login_required
def clear_queue():
    """Clear completed OCR tasks from the queue strictly scoped to user."""
    user_id = _get_current_user_id()
    if not user_id:
        return jsonify({'status': 'error', 'message': 'Autentikasi diperlukan. Silakan masuk.'}), 401

    doc_model = _model()
    doc_model.clear_completed_queue(user_id=user_id)
    return jsonify({'status': 'success', 'message': 'Riwayat antrean yang selesai telah dihapus.'}), 200


# === [TAG ENDPOINT API: Ekspor Log Antrean ke JSON] ===
# Penjelasan: Mengunduh data log antrean pemrosesan dokumen sebagai file berkas JSON
@search_bp.route('/queue/export', methods=['GET'])
@login_required
def export_queue_logs():
    """Export queue logs as JSON file strictly scoped to user."""
    user_id = _get_current_user_id()
    if not user_id:
        return jsonify({'status': 'error', 'message': 'Authentication required. Please sign in.'}), 401

    doc_model = _model()
    items = doc_model.get_queue_items(user_id=user_id)
    import json
    json_str = json.dumps(items, indent=2, default=str)
    return Response(
        json_str,
        mimetype='application/json',
        headers={'Content-Disposition': 'attachment; filename="documind_queue_logs.json"'}
    )


# ── Storage Stats ─────────────────────────────────────────────────────────────

# === [TAG ENDPOINT API: Ambil Statistik Penyimpanan Akun] ===
# Penjelasan: Mengambil jumlah total dokumen, total ukuran byte, dan persentase kuota pengguna
@search_bp.route('/stats', methods=['GET'])
@login_required
def get_stats():
    """Return current storage usage statistics scoped to logged-in user."""
    user_id = _get_current_user_id()
    if not user_id:
        return jsonify({'status': 'error', 'message': 'Authentication required. Please sign in.'}), 401

    stats = _model().get_storage_stats(user_id=user_id)
    return jsonify({'status': 'success', 'stats': stats}), 200


# ── Settings (Database Backed) ────────────────────────────────────────────────

DEFAULT_SETTINGS = {
    'tesseract_lang':       'ind+eng',
    'auto_rotate':          True,
    'index_min_confidence': 0.85,
    'snippet_length':       120,
    'visual_theme':         'light',
    'product_name':         'DocuMind',
    'timezone':             'Asia/Jakarta (WIB)',
}


# === [TAG ENDPOINT API: Kelola Pengaturan Preferensi Sistem] ===
# Penjelasan: Membaca (GET) atau memperbarui (POST) konfigurasi preferensi pengguna di database MySQL
@search_bp.route('/settings', methods=['GET', 'POST'])
@login_required
def manage_settings():
    """GET or POST user-specific system preferences."""
    user_id = _get_current_user_id()
    if not user_id:
        return jsonify({'status': 'error', 'message': 'Authentication required. Please sign in.'}), 401

    from database.models import UserModel
    user_model = UserModel(current_app.config['DB_CONFIG'])

    if request.method == 'POST':
        data = request.get_json() or {}
        allowed = ('tesseract_lang', 'auto_rotate', 'index_min_confidence',
                   'visual_theme', 'timezone')
        
        current_settings = user_model.get_settings(user_id)
        if not current_settings:
            current_settings = DEFAULT_SETTINGS.copy()
            
        for key in allowed:
            if key in data:
                current_settings[key] = data[key]
                
        user_model.update_settings(user_id, current_settings)
                
        return jsonify({
            'status':   'success',
            'message':  'System settings updated.',
            'settings': current_settings,
        }), 200

    current_settings = user_model.get_settings(user_id)
    if not current_settings:
        current_settings = DEFAULT_SETTINGS.copy()
        
    return jsonify({'status': 'success', 'settings': current_settings}), 200


# === [TAG ENDPOINT API: Pembersihan File Sementara (Clear Temp)] ===
# Penjelasan: Menghapus file .tmp sementara pada folder storage/temp/ untuk menghemat kapasitas hard disk
@search_bp.route('/settings/clear-temp', methods=['POST'])
@login_required
def clear_temp_files():
    """Clear *.tmp files from the temp folder and return freed bytes."""
    user_id = _get_current_user_id()
    if not user_id:
        return jsonify({'status': 'error', 'message': 'Authentication required. Please sign in.'}), 401

    temp_dir    = Path(current_app.config['TEMP_FOLDER'])
    cleared     = 0
    freed_bytes = 0

    if temp_dir.exists():
        for f in temp_dir.glob('*.tmp'):
            try:
                freed_bytes += f.stat().st_size
                f.unlink()
                cleared += 1
            except Exception:
                pass

    stats = _model().get_storage_stats(user_id=user_id)
    return jsonify({
        'status':     'success',
        'message':    f'Cleared {cleared} temporary files ({round(freed_bytes / 1024, 1)} KB freed).',
        'freed_bytes': freed_bytes,
        'stats':      stats,
    }), 200


# === [TAG ENDPOINT API: Pemindahan Kategori Dokumen Massal (Bulk Move)] ===
# Penjelasan: Mengubah label kategori untuk beberapa dokumen sekaligus
@search_bp.route('/documents/bulk-move', methods=['POST'])
@login_required
def bulk_move():
    """Bulk move (update category) for selected documents."""
    user_id = _get_current_user_id()
    if not user_id:
        return jsonify({'status': 'error', 'message': 'Authentication required.'}), 401

    data = request.get_json() or {}
    doc_ids = data.get('document_ids') or data.get('doc_ids') or []
    target_folder = data.get('target_folder', '').strip()
    
    if not doc_ids or not target_folder:
        return jsonify({'status': 'error', 'message': 'Parameter tidak valid.'}), 400

    conn = _model()._connect()
    try:
        with conn.cursor() as cur:
            format_strings = ','.join(['%s'] * len(doc_ids))
            cur.execute(
                f"UPDATE documents SET category = %s WHERE id IN ({format_strings}) AND user_id = %s",
                [target_folder] + doc_ids + [user_id]
            )
        conn.commit()
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500
    finally:
        conn.close()

    return jsonify({'status': 'success', 'message': f'{len(doc_ids)} dokumen berhasil dipindahkan.'}), 200
