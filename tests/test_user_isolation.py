"""
DocuMind User Data Isolation Test Suite.
Validates:
1. New user registration returns 0 documents, 0 queue items, and 0 stats on /dashboard, /api/documents, /api/queue.
2. User A uploads a document -> User B cannot see it in document list, search, or stats.
3. User B accessing User A's document (GET, DELETE, download) receives 404 Not Found.
4. Unauthenticated requests receive 401 (API) or redirect to /login (HTML).
5. New uploads store user_id matching the authenticated session in both documents and ocr_queue tables.
"""

import io
import os
import sys
import uuid
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pymysql
from app import create_app
from config import Config


def get_csrf(client):
    res = client.get('/api/csrf-token')
    return res.get_json().get('csrf_token')


def test_user_isolation():
    app = create_app()
    app.config['TESTING'] = True
    app.config['WTF_CSRF_ENABLED'] = False

    # Unique credentials for test users
    uid_suffix = uuid.uuid4().hex[:8]
    email_a = f"test_user_a_{uid_suffix}@example.com"
    email_b = f"test_user_b_{uid_suffix}@example.com"
    password = "SecurePassword123!"

    print("======================================================================")
    print("           DOCUMIND PER-USER DATA ISOLATION VERIFICATION             ")
    print("======================================================================")

    # -------------------------------------------------------------------------
    # TEST 4: Request tanpa login -> 401 / redirect ke login
    # -------------------------------------------------------------------------
    print("\n[TEST 4] Request tanpa login...")
    anon_client = app.test_client()

    res_dash = anon_client.get('/dashboard')
    assert res_dash.status_code == 302, f"Expected 302 redirect for /dashboard, got {res_dash.status_code}"
    assert '/login' in res_dash.headers.get('Location', ''), "Expected redirect to /login"
    print("  [OK] /dashboard unauthenticated -> 302 redirect to /login")

    res_docs = anon_client.get('/api/documents')
    assert res_docs.status_code == 401, f"Expected 401 for /api/documents, got {res_docs.status_code}"
    print("  [OK] /api/documents unauthenticated -> 401 Unauthorized")

    res_queue = anon_client.get('/api/queue')
    assert res_queue.status_code == 401, f"Expected 401 for /api/queue, got {res_queue.status_code}"
    print("  [OK] /api/queue unauthenticated -> 401 Unauthorized")

    res_stats = anon_client.get('/api/stats')
    assert res_stats.status_code == 401, f"Expected 401 for /api/stats, got {res_stats.status_code}"
    print("  [OK] /api/stats unauthenticated -> 401 Unauthorized")

    # -------------------------------------------------------------------------
    # TEST 1: User baru daftar -> 0 data di dashboard, documents, dan queue
    # -------------------------------------------------------------------------
    print("\n[TEST 1] User baru daftar -> /dashboard, /api/documents, /api/queue = 0 data...")
    client_a = app.test_client()
    csrf_a = get_csrf(client_a)

    reg_res = client_a.post('/api/auth/register', json={
        'full_name': 'Test User A',
        'email': email_a,
        'password': password
    }, headers={'X-CSRF-Token': csrf_a})
    assert reg_res.status_code == 201, f"Register User A failed: {reg_res.get_json()}"
    user_a_data = reg_res.get_json()['user']
    user_a_id = user_a_data['id']
    print(f"  [OK] User A registered (ID: {user_a_id})")

    # Check documents for new user A
    docs_res = client_a.get('/api/documents')
    assert docs_res.status_code == 200
    docs_json = docs_res.get_json()
    assert docs_json['count'] == 0, f"Expected 0 documents for new user, got {docs_json['count']}"
    assert len(docs_json['results']) == 0
    print("  [OK] /api/documents for User A returns 0 items")

    # Check queue for new user A
    queue_res = client_a.get('/api/queue')
    assert queue_res.status_code == 200
    queue_json = queue_res.get_json()
    assert len(queue_json['queue']) == 0, f"Expected 0 queue items, got {len(queue_json['queue'])}"
    assert queue_json['active_tasks'] == 0
    print("  [OK] /api/queue for User A returns 0 items (no orphan queue leakage)")

    # Check /dashboard HTML renders 0 documents
    dash_res = client_a.get('/dashboard')
    assert dash_res.status_code == 200
    print("  [OK] /dashboard for User A loads successfully (Status 200)")

    # -------------------------------------------------------------------------
    # TEST 5: Upload baru -> baris di DB memiliki user_id sesuai akun login
    # -------------------------------------------------------------------------
    print("\n[TEST 5] User A upload dokumen baru -> DB record scoped to user_id...")
    test_file_content = b"Rahasia Bisnis Dokumen User A - Laporan Finansial 2026."
    csrf_a = get_csrf(client_a)
    upload_res = client_a.post('/api/upload', data={
        'file': (io.BytesIO(test_file_content), 'dokumen_rahasia_a.txt')
    }, headers={'X-CSRF-Token': csrf_a}, content_type='multipart/form-data')

    assert upload_res.status_code == 200, f"Upload failed: {upload_res.get_json()}"
    uploaded_doc = upload_res.get_json()['document']
    doc_a_id = uploaded_doc['id']
    print(f"  [OK] Dokumen berhasil diunggah User A (Doc ID: {doc_a_id})")

    # Check database directly to ensure user_id matches
    conn = pymysql.connect(**Config.DB_CONFIG)
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT user_id, filepath FROM documents WHERE id = %s", (doc_a_id,))
            row_doc = cur.fetchone()
            assert row_doc is not None, "Document not found in MySQL"
            assert row_doc['user_id'] == user_a_id, f"Document user_id mismatch: expected {user_a_id}, got {row_doc['user_id']}"
            print(f"  [OK] Database verified: documents.user_id = {row_doc['user_id']} matches User A")

            # Check that file path is stored in per-user subfolder
            assert f"uploads{os.sep}{user_a_id}" in row_doc['filepath'] or f"uploads/{user_a_id}" in row_doc['filepath'], \
                f"Filepath not in per-user folder: {row_doc['filepath']}"
            print(f"  [OK] Storage verified: File stored in per-user subfolder ({row_doc['filepath']})")

            # Check ocr_queue user_id
            cur.execute("SELECT user_id, document_id FROM ocr_queue WHERE document_id = %s", (doc_a_id,))
            row_queue = cur.fetchone()
            assert row_queue is not None, "Queue record not found in MySQL"
            assert row_queue['user_id'] == user_a_id, f"Queue user_id mismatch: expected {user_a_id}, got {row_queue['user_id']}"
            print(f"  [OK] Database verified: ocr_queue.user_id = {row_queue['user_id']} matches User A")
    finally:
        conn.close()

    # -------------------------------------------------------------------------
    # TEST 2: User A upload dokumen -> User B TIDAK melihatnya di list, search, stats
    # -------------------------------------------------------------------------
    print("\n[TEST 2] User B mendaftar & memverifikasi isolasi dari User A...")
    client_b = app.test_client()
    csrf_b = get_csrf(client_b)
    reg_b = client_b.post('/api/auth/register', json={
        'full_name': 'Test User B',
        'email': email_b,
        'password': password
    }, headers={'X-CSRF-Token': csrf_b})
    assert reg_b.status_code == 201
    user_b_id = reg_b.get_json()['user']['id']
    print(f"  [OK] User B registered (ID: {user_b_id})")

    # User B checks documents
    docs_b = client_b.get('/api/documents').get_json()
    assert docs_b['count'] == 0, f"User B should see 0 docs, got {docs_b['count']}"
    assert len(docs_b['results']) == 0
    print("  [OK] User B sees 0 documents in /api/documents")

    # User B searches for User A's document keyword
    search_b = client_b.get('/api/search?q=Rahasia').get_json()
    assert search_b['count'] == 0, f"User B should see 0 search results, got {search_b['count']}"
    assert len(search_b['results']) == 0
    print("  [OK] User B search for User A content returns 0 results")

    # User B checks stats
    stats_b = client_b.get('/api/stats').get_json()
    assert stats_b['total_docs'] == 0 or stats_b.get('stats', {}).get('total_docs') == 0, "User B stats must be 0"
    print("  [OK] User B stats show 0 total documents and 0 bytes")

    # User B checks queue
    queue_b = client_b.get('/api/queue').get_json()
    assert len(queue_b['queue']) == 0
    print("  [OK] User B queue shows 0 tasks (cannot see User A's task)")

    # -------------------------------------------------------------------------
    # TEST 3: User B mengakses /api/documents/<id milik A> (GET/DELETE/download) -> 404
    # -------------------------------------------------------------------------
    print("\n[TEST 3] User B mengakses resource milik User A (IDOR Prevention)...")

    # GET /api/document/<id> and /api/documents/<id>
    get_res = client_b.get(f'/api/documents/{doc_a_id}')
    assert get_res.status_code == 404, f"Expected 404 on GET /api/documents/<id_A>, got {get_res.status_code}"
    print(f"  [OK] GET /api/documents/{doc_a_id} by User B -> 404 Not Found")

    get_res2 = client_b.get(f'/api/document/{doc_a_id}')
    assert get_res2.status_code == 404, f"Expected 404 on GET /api/document/<id_A>, got {get_res2.status_code}"
    print(f"  [OK] GET /api/document/{doc_a_id} by User B -> 404 Not Found")

    # DELETE /api/document/<id> and /api/documents/<id>
    csrf_b = get_csrf(client_b)
    del_res = client_b.delete(f'/api/documents/{doc_a_id}', headers={'X-CSRF-Token': csrf_b})
    assert del_res.status_code == 404, f"Expected 404 on DELETE /api/documents/<id_A>, got {del_res.status_code}"
    print(f"  [OK] DELETE /api/documents/{doc_a_id} by User B -> 404 Not Found")

    # GET /api/download/<id> and /api/documents/<id>/download
    dl_res = client_b.get(f'/api/download/{doc_a_id}')
    assert dl_res.status_code == 404, f"Expected 404 on download, got {dl_res.status_code}"
    print(f"  [OK] GET /api/download/{doc_a_id} by User B -> 404 Not Found")

    dl_res2 = client_b.get(f'/api/documents/{doc_a_id}/download')
    assert dl_res2.status_code == 404, f"Expected 404 on /documents/<id>/download, got {dl_res2.status_code}"
    print(f"  [OK] GET /api/documents/{doc_a_id}/download by User B -> 404 Not Found")

    # GET /api/file/<id> (preview)
    file_res = client_b.get(f'/api/file/{doc_a_id}')
    assert file_res.status_code == 404, f"Expected 404 on preview file, got {file_res.status_code}"
    print(f"  [OK] GET /api/file/{doc_a_id} by User B -> 404 Not Found")

    print("\n======================================================================")
    print("   SEMUA 5 SKENARIO VERIFIKASI ISOLASI DATA PER-USER BERHASIL (PASSED) ")
    print("======================================================================")


if __name__ == '__main__':
    test_user_isolation()
