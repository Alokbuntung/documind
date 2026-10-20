/**
 * DocuMind - GSAP UI Animations (Auto-Hook & Event-Driven)
 */

// === [TAG EVENT: Inisialisasi Animasi Antarmuka GSAP Saat Halaman Siap] ===
// Penjelasan: Menerapkan efek animasi transisi masuk (entrance) pada elemen kartu, interaksi hover tombol, dan observasi perubahan baris tabel
document.addEventListener('DOMContentLoaded', () => {
    if (typeof gsap === 'undefined') {
        console.warn('GSAP is not loaded. UI animations disabled.');
        return;
    }

    // A. Entrance Animation untuk Kartu Metrik / Konten Utama
    // === [TAG ANIMASI: Efek Masuk Kartu Statistik & Tabel] ===
    // Penjelasan: Efek fade-in halus dari bawah ke atas dengan jeda bertingkat (stagger) menggunakan GSAP
    try {
        // Mengincar langsung card statistik di grid atas dan kontainer tabel
        const targetCards = document.querySelectorAll('.grid > div, main > div, table tbody tr');
        if (targetCards.length > 0) {
            gsap.from(targetCards, {
                opacity: 0,
                y: 18,
                stagger: 0.05,
                duration: 0.45,
                ease: 'power2.out',
                clearProps: 'all'
            });
        }
    } catch (e) {
        console.warn('GSAP Entrance Error:', e);
    }

    // D. Micro-Interaction Tombol Aksi (Hover membal halus)
    // === [TAG INTERAKSI: Efek Skala Membal Tombol Aksi] ===
    // Penjelasan: Memberikan respon visual halus saat kursor mouse diarahkan ke tombol aksi di tabel atau modal
    try {
        document.body.addEventListener('mouseover', (e) => {
            const btn = e.target.closest('button, a.btn');
            if (btn && (btn.closest('table') || btn.closest('.modal-box'))) {
                gsap.to(btn, { scale: 1.12, duration: 0.15, ease: 'power1.out' });
            }
        });

        document.body.addEventListener('mouseout', (e) => {
            const btn = e.target.closest('button, a.btn');
            if (btn && (btn.closest('table') || btn.closest('.modal-box'))) {
                gsap.to(btn, { scale: 1, duration: 0.15, ease: 'power1.in' });
            }
        });
    } catch (e) {
        console.warn('GSAP Micro-Interaction Error:', e);
    }

    // C & E. Auto-Trigger Baris Baru & Badge Pop menggunakan MutationObserver
    // === [TAG OBSERVER: Deteksi Penambahan Baris Baru di Tabel] ===
    // Penjelasan: Memantau perubahan DOM tabel (MutationObserver) untuk secara otomatis menganimasikan baris baru yang muncul setelah proses upload
    try {
        const tableBody = document.querySelector('table tbody') || document.getElementById('docs-table-body');
        if (tableBody) {
            const observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    // Jika ada baris baru ditambahkan ke tabel
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType === 1 && node.tagName === 'TR') {
                            window.animateNewRow(node);
                        }
                    });
                });
            });

            observer.observe(tableBody, { childList: true });
        }
    } catch (e) {
        console.warn('GSAP Table Observer Error:', e);
    }

    // B. Auto-Hook Animasi Buka Modal
    // === [TAG LISTENER: Pemicu Animasi Modal Otomatis] ===
    // Penjelasan: Menangkap klik tombol pembuka modal dan memicu animasi pop-in membal
    try {
        // Deteksi tombol atau baris yang memicu pembukaan modal
        document.body.addEventListener('click', (e) => {
            const trigger = e.target.closest('[data-modal-target], [onclick*="modal"], [onclick*="preview"]');
            if (trigger) {
                // Beri jeda 30ms agar class hidden terbuka terlebih dahulu oleh script utama
                setTimeout(() => {
                    const visibleModals = document.querySelectorAll('[id*="modal"]:not(.hidden), .modal:not(.hidden)');
                    visibleModals.forEach((modal) => {
                        window.animateModalOpen(modal);
                    });
                }, 30);
            }
        });
    } catch (e) {
        console.warn('GSAP Modal Hook Error:', e);
    }
});

// Helper Functions (Tetap bisa dipanggil manual dari script lain)

// === [TAG FUNGSI GLOBAL: Animasi Buka Modal (animateModalOpen)] ===
// Penjelasan: Menganimasikan dialog modal membesar dari skala 0.92 ke 1 dengan efek pantulan membal (back.out)
window.animateModalOpen = function(modalElement) {
    if (typeof gsap !== 'undefined' && modalElement) {
        try {
            const dialog = modalElement.querySelector('div[class*="bg-"], .modal-box') || modalElement.firstElementChild;
            if (dialog) {
                gsap.fromTo(dialog, 
                    { scale: 0.92, opacity: 0, y: 15 }, 
                    { scale: 1, opacity: 1, y: 0, duration: 0.28, ease: 'back.out(1.5)', clearProps: 'transform' }
                );
            }
        } catch (e) {
            console.warn('GSAP Modal Open Error:', e);
        }
    }
};

// === [TAG FUNGSI GLOBAL: Animasi Tutup Modal (animateModalClose)] ===
// Penjelasan: Menganimasikan dialog modal mengecil dan menghilang secara halus sebelum class hidden disematkan
window.animateModalClose = function(modalElement, onComplete) {
    if (typeof gsap !== 'undefined' && modalElement) {
        try {
            const dialog = modalElement.querySelector('div[class*="bg-"], .modal-box') || modalElement.firstElementChild;
            if (dialog) {
                gsap.to(dialog, {
                    scale: 0.95,
                    opacity: 0,
                    y: 10,
                    duration: 0.18,
                    ease: 'power2.in',
                    onComplete: () => {
                        gsap.set(dialog, { clearProps: 'all' });
                        if (typeof onComplete === 'function') onComplete();
                    }
                });
            } else if (onComplete) onComplete();
        } catch (e) {
            if (onComplete) onComplete();
        }
    } else if (onComplete) {
        onComplete();
    }
};

// === [TAG FUNGSI GLOBAL: Animasi Highlight Baris Baru (animateNewRow)] ===
// Penjelasan: Memberikan efek kilau warna hijau transparan sesaat pada baris tabel yang baru saja ditambahkan
window.animateNewRow = function(element) {
    if (typeof gsap !== 'undefined' && element) {
        try {
            gsap.fromTo(element, 
                { y: -20, opacity: 0, backgroundColor: 'rgba(34, 197, 94, 0.12)' }, 
                { y: 0, opacity: 1, backgroundColor: 'transparent', duration: 0.5, ease: 'power3.out', clearProps: 'backgroundColor' }
            );
        } catch (e) {
            console.warn('GSAP New Row Error:', e);
        }
    }
};

// === [TAG FUNGSI GLOBAL: Animasi Badge Status Membal (animateBadgePop)] ===
// Penjelasan: Efek zoom membal pada badge akurasi OCR atau kategori dokumen
window.animateBadgePop = function(badgeElement) {
    if (typeof gsap !== 'undefined' && badgeElement) {
        try {
            gsap.fromTo(badgeElement, 
                { scale: 0.8 }, 
                { scale: 1, duration: 0.35, ease: 'back.out(2.5)', clearProps: 'transform' }
            );
        } catch (e) {
            console.warn('GSAP Badge Pop Error:', e);
        }
    }
};

// F. Interaksi Dropzone (Drag-and-Drop)
// === [TAG EVENT: Animasi Area Unggah Seret & Lepas (Dropzone)] ===
// Penjelasan: Membesarkan ukuran kotak dropzone (scale: 1.02) dan menggerakkan ikon naik-turun saat berkas diseret di atasnya
document.addEventListener('DOMContentLoaded', () => {
    if (typeof gsap === 'undefined') return;

    try {
        const dropzones = document.querySelectorAll('#dropzone, .dropzone, [data-dropzone], #upload-zone');
        dropzones.forEach(dz => {
            const icon = dz.querySelector('.material-symbols-outlined, svg, img');
            
            ['dragenter', 'dragover'].forEach(evt => {
                dz.addEventListener(evt, (e) => {
                    e.preventDefault();
                    gsap.to(dz, { scale: 1.02, duration: 0.2, ease: "power1.out", overwrite: "auto" });
                    if (icon) {
                        gsap.to(icon, { y: -6, repeat: -1, yoyo: true, duration: 0.4, overwrite: "auto" });
                    }
                });
            });

            ['dragleave', 'drop'].forEach(evt => {
                dz.addEventListener(evt, (e) => {
                    e.preventDefault();
                    gsap.to(dz, { scale: 1, duration: 0.2, ease: "power1.out", overwrite: "auto" });
                    if (icon) {
                        gsap.to(icon, { y: 0, duration: 0.2, overwrite: "auto" });
                    }
                });
            });
        });
    } catch (e) {
        console.warn('GSAP Dropzone Interaction Error:', e);
    }
});

// G. Helper Notifikasi Toast Global
// === [TAG FUNGSI GLOBAL: Notifikasi Mengambang Dinamis (window.showToast)] ===
// Penjelasan: Membuat dan memunculkan kotak pemberitahuan sukses/gagal di pojok kanan atas layar dengan animasi slide-in GSAP
window.showToast = function(message, type = 'success') {
    if (typeof gsap === 'undefined') {
        console.log('[Toast]', message);
        return;
    }
    
    try {
        let toastEl = document.querySelector('#toast-dynamic-container, #toast, .toast-container');
        if (!toastEl || toastEl.tagName !== 'DIV') {
            toastEl = document.createElement('div');
            toastEl.id = 'toast-dynamic-container';
            toastEl.style.position = 'fixed';
            toastEl.style.top = '24px';
            toastEl.style.right = '24px';
            toastEl.style.zIndex = '9999';
            toastEl.style.display = 'flex';
            toastEl.style.flexDirection = 'column';
            toastEl.style.gap = '8px';
            document.body.appendChild(toastEl);
        }

        const toastItem = document.createElement('div');
        const bgColor = type === 'error' ? '#ef4444' : (type === 'info' ? '#3b82f6' : '#22c55e');
        
        toastItem.style.background = bgColor;
        toastItem.style.color = '#fff';
        toastItem.style.padding = '12px 20px';
        toastItem.style.borderRadius = '8px';
        toastItem.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.1)';
        toastItem.style.fontSize = '14px';
        toastItem.style.fontWeight = '500';
        toastItem.style.display = 'flex';
        toastItem.style.alignItems = 'center';
        toastItem.style.gap = '8px';
        
        const iconName = type === 'error' ? 'error' : (type === 'info' ? 'info' : 'check_circle');
        toastItem.innerHTML = `<span class="material-symbols-outlined" style="font-size: 18px;">${iconName}</span><span>${message}</span>`;
        
        toastEl.appendChild(toastItem);

        const tl = gsap.timeline();
        tl.fromTo(toastItem, 
            { x: 50, opacity: 0 },
            { x: 0, opacity: 1, duration: 0.35, ease: 'back.out(1.7)' }
        )
        .to(toastItem, {
            x: 50, opacity: 0, duration: 0.25, ease: 'power2.in', delay: 2.5,
            onComplete: () => {
                toastItem.remove();
            }
        });
        
    } catch (e) {
        console.warn('GSAP Toast Notification Error:', e);
    }
};
