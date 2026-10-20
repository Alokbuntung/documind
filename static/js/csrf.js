/**
 * DocuMind API Fetch Helper.
 * Wrapper function untuk native fetch() yang secara otomatis menyertakan 
 * CSRF token dan default headers (seperti Accept, Content-Type) pada request mutasi.
 */

// === [TAG HELPER FRONTEND: Baca Token CSRF dari Meta Tag (getCsrfToken)] ===
// Penjelasan: Mengambil nilai token keamanan dari elemen <meta name="csrf-token"> di header HTML
function getCsrfToken() {
    const meta = document.querySelector('meta[name="csrf-token"]');
    return meta ? meta.getAttribute('content') : '';
}

/**
 * apiFetch - Wrapper untuk window.fetch
 * @param {string} url - Target URL API
 * @param {object} options - Opsi fetch (method, body, dll)
 * @returns {Promise<Response>}
 */
// === [TAG FUNGSI UTAMA: Wrapper AJAX Aman (window.apiFetch)] ===
// Penjelasan: Menggantikan fungsi fetch() standar agar setiap permintaan mutasi (POST, PUT, DELETE) otomatis menyematkan header X-CSRF-Token dan Content-Type JSON
window.apiFetch = function(url, options = {}) {
    // Clone opsi untuk mencegah mutasi objek asli
    const fetchOptions = { ...options };
    const method = (fetchOptions.method || 'GET').toUpperCase();

    // Set header secara default (bisa dioverride)
    if (!fetchOptions.headers) {
        fetchOptions.headers = {};
    }
    
    // Pastikan header di-manage sebagai object
    if (fetchOptions.headers instanceof Headers) {
        const headersObj = {};
        fetchOptions.headers.forEach((value, key) => {
            headersObj[key] = value;
        });
        fetchOptions.headers = headersObj;
    }

    // Default headers untuk komunikasi API standar
    if (!fetchOptions.headers['Accept']) {
        fetchOptions.headers['Accept'] = 'application/json';
    }

    // Injeksi header X-CSRF-Token untuk metode mutasi
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
        if (!fetchOptions.headers['X-CSRF-Token']) {
            fetchOptions.headers['X-CSRF-Token'] = getCsrfToken();
        }
        
        // Asumsi jika body berupa object biasa atau string JSON, set Content-Type
        // (Hindari menimpa Content-Type jika mengirim FormData)
        if (!fetchOptions.headers['Content-Type'] && !(fetchOptions.body instanceof FormData)) {
            fetchOptions.headers['Content-Type'] = 'application/json';
        }
    }

    return window.fetch(url, fetchOptions);
};

// Export spesifik (opsional) untuk environment modul jika dibutuhkan
window.getCsrfToken = getCsrfToken;
