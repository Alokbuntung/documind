# === [TAG EKSTENSI: Inisialisasi Rate Limiter Flask] ===
# Penjelasan: Modul pengatur kuota request menggunakan Flask-Limiter untuk melindungi server dari serangan Denial-of-Service (DoS) dan brute-force

from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

# === [TAG KONFIGURASI LIMITER: Batas Global Request] ===
# Penjelasan: Mengidentifikasi pengguna berdasarkan IP Address (get_remote_address), menetapkan batas 1000 request/hari dan 100 request/jam menggunakan penyimpanan memori
limiter = Limiter(
    get_remote_address,
    default_limits=["1000 per day", "100 per hour"],
    storage_uri="memory://"
)

from core.auth import get_current_user_id, login_required

