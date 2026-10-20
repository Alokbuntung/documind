// === [TAG MODUL: Pengendali Pencarian, Filter, Modal & Interaksi Dokumen (search.js)] ===
// Penjelasan: Mengelola pencarian full-text cerdas, filter berkas, modal pratinjau OCR, paginasi data, dan operasi dokumen
// JavaScript logic for Document Search, Dynamic Filtering, Action Buttons, Modals, View Toggle & Editing in DocuMind

document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('document-modal');
    const closeModalBtn = document.getElementById('close-modal-btn');
    const copyBtn = document.getElementById('copy-btn');
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toast-message');
    const ocrTextContainer = document.getElementById('ocr-text-container');
    const searchInput = document.getElementById('header-search-input');
    const searchClearBtn = document.getElementById('search-clear-btn');
    const searchIcon = document.getElementById('header-search-icon');
    const filterPills = document.querySelectorAll('.filter-pill');
    const sidebarCategoryLinks = document.querySelectorAll('.sidebar-category-link');
    const documentsTableBody = document.getElementById('documents-table-body');
    const documentsGrid = document.getElementById('documents-grid');
    const tableContainer = document.getElementById('table-container');
    const emptyStateRow = document.getElementById('empty-state-row');

    // View Toggles
    const viewToggleGrid = document.getElementById('view-toggle-grid');
    const viewToggleList = document.getElementById('view-toggle-list');
    let currentViewMode = 'list'; // 'list' or 'grid'

    // Pagination
    const btnPagePrev = document.getElementById('btn-page-prev');
    const btnPageNext = document.getElementById('btn-page-next');
    const paginationNumbers = document.getElementById('pagination-numbers');
    const paginationInfo = document.getElementById('table-pagination-info');
    let currentPage = 1;
    const itemsPerPage = 6;

    // Filters state
    let currentQuery = '';
    let currentTypeFilter = 'all';
    let currentCategoryFilter = 'all';
    let searchDebounceTimer = null;
    let currentLoadedDocs = [];
    let activePreviewDocId = null;
    let isEditingOcr = false;

    // Initialize
    initInteractiveModals();
    initBrandClicks();
    initViewToggles();
    initPreviewModalActions();

    // Initial search fetch to populate docs cleanly
    triggerBackendSearch();

    // === [TAG MODAL: Manajer Modal Interaktif (initInteractiveModals)] ===
    // Penjelasan: Menginisialisasi pembukaan dan penutupan modal notifikasi, profil pengguna, info penyimpanan, metrik kecepatan, akurasi, dan log keamanan
    // Modal Manager
    function initInteractiveModals() {
        const modalTriggers = [
            { btnId: 'btn-notifications', modalId: 'notifications-modal' },
            { btnId: 'btn-user-profile', modalId: 'profile-modal' },
            { btnId: 'btn-storage-info', modalId: 'storage-modal' },
            { btnId: 'card-stat-speed', modalId: 'speed-modal' },
            { btnId: 'card-stat-accuracy', modalId: 'accuracy-modal' },
            { btnId: 'btn-security-logs', modalId: 'security-modal' }
        ];

        modalTriggers.forEach(({ btnId, modalId }) => {
            const btn = document.getElementById(btnId);
            const targetModal = document.getElementById(modalId);
            if (btn && targetModal) {
                btn.onclick = (e) => {
                    e.stopPropagation();
                    targetModal.classList.remove('hidden');
                };
            }
        });

        // Close handlers for all generic modal close buttons
        document.querySelectorAll('.close-modal-btn').forEach(btn => {
            btn.onclick = (e) => {
                const modalId = btn.getAttribute('data-modal');
                if (modalId) {
                    const targetModal = document.getElementById(modalId);
                    if (targetModal) targetModal.classList.add('hidden');
                }
            };
        });

        // Backdrop click handler for dynamic modals
        ['notifications-modal', 'profile-modal', 'storage-modal', 'speed-modal', 'accuracy-modal', 'security-modal'].forEach(id => {
            const m = document.getElementById(id);
            if (m) {
                m.onclick = (e) => {
                    if (e.target === m) m.classList.add('hidden');
                };
            }
        });
    }

    // === [TAG NAVIGASI: Reset Beranda Klik Logo (initBrandClicks)] ===
    // Penjelasan: Mereset pencarian dan filter dokumen kembali ke tampilan awal dashboard saat logo DocuMind diklik
    // Brand logo clicks reset to main dashboard
    function initBrandClicks() {
        const headerLogo = document.getElementById('header-logo-btn');
        const sidebarBrand = document.getElementById('sidebar-brand-btn');

        const resetToDashboard = () => {
            currentQuery = '';
            currentTypeFilter = 'all';
            currentCategoryFilter = 'all';
            if (searchInput) searchInput.value = '';
            if (searchClearBtn) searchClearBtn.classList.add('hidden');

            // Reset pills UI
            filterPills.forEach(p => {
                if (p.getAttribute('data-filter') === 'all') {
                    p.classList.add('bg-white', 'shadow-sm', 'text-primary', 'active');
                    p.classList.remove('text-on-surface-variant');
                } else {
                    p.classList.remove('bg-white', 'shadow-sm', 'text-primary', 'active');
                    p.classList.add('text-on-surface-variant');
                }
            });

            const sectionTitle = document.getElementById('table-section-title');
            if (sectionTitle) sectionTitle.textContent = 'Indexed Documents';

            triggerBackendSearch();
        };

        if (headerLogo) headerLogo.onclick = resetToDashboard;
        if (sidebarBrand) sidebarBrand.onclick = resetToDashboard;
    }

    // === [TAG UI: Pengalih Tampilan Tabel / Kotak (initViewToggles)] ===
    // Penjelasan: Mengatur pergantian mode tampilan antara List View (tabel vertikal) dan Grid View (kartu kartu)
    // View Toggles: List View vs Grid View
    function initViewToggles() {
        if (!viewToggleGrid || !viewToggleList) return;

        viewToggleGrid.onclick = () => {
            currentViewMode = 'grid';
            viewToggleGrid.classList.add('bg-primary/10', 'text-primary', 'border-primary/20');
            viewToggleGrid.classList.remove('border-outline-variant');
            viewToggleList.classList.remove('bg-primary/10', 'text-primary', 'border-primary/20');
            viewToggleList.classList.add('border-outline-variant');

            if (tableContainer) tableContainer.classList.add('hidden');
            if (documentsGrid) documentsGrid.classList.remove('hidden');

            renderCurrentPageItems();
        };

        viewToggleList.onclick = () => {
            currentViewMode = 'list';
            viewToggleList.classList.add('bg-primary/10', 'text-primary', 'border-primary/20');
            viewToggleList.classList.remove('border-outline-variant');
            viewToggleGrid.classList.remove('bg-primary/10', 'text-primary', 'border-primary/20');
            viewToggleGrid.classList.add('border-outline-variant');

            if (documentsGrid) documentsGrid.classList.add('hidden');
            if (tableContainer) tableContainer.classList.remove('hidden');

            renderCurrentPageItems();
        };
    }

    // === [TAG NOTIFIKASI: Pesan Toast Melayang (showToast)] ===
    // Penjelasan: Menampilkan pesan toast sementara di pojok layar dengan durasi 3.2 detik
    // Helper: Global Toast Notification
    window.showToast = function(message, type = 'success') {
        if (!toast || !toastMessage) return;

        toastMessage.textContent = message;
        toast.classList.remove('opacity-0', 'translate-y-10', 'pointer-events-none');

        setTimeout(() => {
            toast.classList.add('opacity-0', 'translate-y-10', 'pointer-events-none');
        }, 3200);
    };

    // === [TAG UI: Pembaruan Widget Kapasitas Penyimpanan (updateStorageWidget)] ===
    // Penjelasan: Memperbarui tampilan progress bar dan teks kapasitas MB/GB penyimpanan pengguna di sidebar dan modal
    // Helper: Global Storage Widget Update
    window.updateStorageWidget = function(stats) {
        if (!stats) return;
        const storageText = document.getElementById('sidebar-storage-text');
        const storageBar = document.getElementById('sidebar-storage-bar');
        const docCountBadge = document.getElementById('doc-count-badge');
        const modalUsageTitle = document.getElementById('modal-storage-usage-title');
        const modalUsagePercent = document.getElementById('modal-storage-usage-percent');
        const modalBarFill = document.getElementById('modal-storage-bar-fill');

        if (storageText) {
            storageText.textContent = `${stats.used_mb} MB / ${stats.max_gb} GB Storage`;
        }
        if (storageBar) {
            storageBar.style.width = `${Math.max(stats.percentage, 2)}%`;
        }
        if (docCountBadge) {
            docCountBadge.textContent = `Indexed Docs: ${stats.count}`;
        }
        if (modalUsageTitle) {
            modalUsageTitle.textContent = `Storage Used: ${stats.used_mb} MB / ${stats.max_gb} GB`;
        }
        if (modalUsagePercent) {
            modalUsagePercent.textContent = `${stats.percentage}% Used`;
        }
        if (modalBarFill) {
            modalBarFill.style.width = `${Math.max(stats.percentage, 2)}%`;
        }
    };

    // === [TAG DATA: Sisip / Perbarui Baris Dokumen (addOrUpdateDocumentRow)] ===
    // Penjelasan: Memperbarui dokumen yang sudah ada atau menambahkan dokumen baru di daftar data secara reaktif
    // Helper: Dynamic Row & Card Insertion
    window.addOrUpdateDocumentRow = function(doc) {
        if (!doc) return;
        const existingIdx = currentLoadedDocs.findIndex(d => d.id === doc.id);
        if (existingIdx >= 0) {
            currentLoadedDocs[existingIdx] = doc;
        } else {
            currentLoadedDocs.unshift(doc);
        }
        renderCurrentPageItems();
    };

    // === [TAG KEAMANAN: Sanitasi Cuplikan Teks Dokumen (sanitizeSnippet)] ===
    // Penjelasan: Memastikan cuplikan teks hasil pencarian aman dari celah XSS dan hanya merender tag highlight <mark> yang sah
    /**
     * Sanitize HTML snippet from server: only allow safe <mark> tags for
     * search highlighting. All other HTML is escaped to prevent XSS.
     */
    function sanitizeSnippet(snippet) {
        if (!snippet) return '';
        // Backend sudah melakukan markupsafe.escape() dan menyisipkan tag <mark> yang aman.
        // Tidak perlu double-escape di client-side.
        return String(snippet);
    }
    window.sanitizeSnippet = sanitizeSnippet;

    // === [TAG PRATINJAU: Pembuka Modal Pratinjau Dokumen (openPreviewModal)] ===
    // Penjelasan: Membuka modal split-screen pratinjau dokumen (berkas fisik di sebelah kiri dan teks hasil OCR di sebelah kanan beserta tombol aksi)
    // Modal Control & Split Screen Fetching
    function openPreviewModal(docId) {
        if (!modal) return;
        activePreviewDocId = docId;
        isEditingOcr = false;

        const modalTitle = document.getElementById('modal-doc-title');
        const modalSubtitle = document.getElementById('modal-doc-subtitle');
        const modalDocIcon = document.getElementById('modal-doc-icon');
        const ocrConfidence = document.getElementById('modal-ocr-confidence');
        const previewContainer = document.getElementById('modal-receipt-preview');
        const metaMerchant = document.getElementById('meta-merchant');
        const metaDate = document.getElementById('meta-date');
        const metaTotal = document.getElementById('meta-total');
        const editDataBtn = document.getElementById('edit-data-btn');
        const downloadLink = document.getElementById('modal-download-link');

        if (modalTitle) modalTitle.textContent = 'Memuat Dokumen...';
        if (ocrTextContainer) {
            ocrTextContainer.setAttribute('contenteditable', 'false');
            ocrTextContainer.classList.remove('border-2', 'border-primary', 'bg-white', 'p-4');
            ocrTextContainer.textContent = 'Mengambil data OCR & teks dokumen...';
        }
        if (editDataBtn) editDataBtn.textContent = 'Edit Teks';
        if (downloadLink) downloadLink.href = `/api/download/${docId}`;

        modal.classList.remove('hidden');

        fetch(`/api/document/${docId}`)
            .then(res => res.json())
            .then(data => {
                if (data.status === 'success' && data.document) {
                    const doc = data.document;
                    const fileType = doc.file_type || 'other';

                    if (modalTitle) modalTitle.textContent = doc.filename;
                    if (modalSubtitle) modalSubtitle.textContent = `Diproses ${doc.uploaded_at || 'Baru saja'} • ID: DM-${doc.id}`;
                    if (ocrConfidence) ocrConfidence.textContent = `OCR Confidence: ${Math.round((doc.ocr_confidence || 0.95) * 100)}%`;
                    if (ocrTextContainer) {
                        const rawText = doc.content || '[Tidak ada teks digital atau OCR yang terdeteksi]';
                        const keyword = (searchInput ? searchInput.value.trim() : '');
                        
                        if (keyword.length >= 2) {
                            // Escape HTML statis
                            const escapeHTML = (str) => str.replace(/[&<>'"]/g, 
                                tag => ({
                                    '&': '&amp;',
                                    '<': '&lt;',
                                    '>': '&gt;',
                                    "'": '&#39;',
                                    '"': '&quot;'
                                }[tag])
                            );
                            
                            const safeText = escapeHTML(rawText);
                            const safeKeyword = escapeHTML(keyword);
                            
                            // Regex case-insensitive
                            const regex = new RegExp(`(${safeKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
                            ocrTextContainer.innerHTML = safeText.replace(regex, '<mark class="bg-yellow-200 text-yellow-900 px-1 rounded ocr-highlight">$1</mark>');
                            
                            // Pulse animation if GSAP available
                            if (typeof gsap !== 'undefined') {
                                gsap.fromTo('.ocr-highlight', 
                                    { backgroundColor: "#fef08a" }, 
                                    { backgroundColor: "#fde047", duration: 0.6, yoyo: true, repeat: 2, ease: "sine.inOut" }
                                );
                            }
                        } else {
                            ocrTextContainer.textContent = rawText;
                        }

                        // Kemaskini Pengira Perkataan & Aksara
                        try {
                            const modalWordCount = document.getElementById('modal-word-count');
                            if (modalWordCount) {
                                const charCount = rawText.length;
                                const wordCount = rawText.trim() === '' ? 0 : rawText.trim().split(/\s+/).filter(Boolean).length;
                                modalWordCount.textContent = `${wordCount} Perkataan • ${charCount} Aksara`;
                                if (typeof gsap !== 'undefined') {
                                    gsap.fromTo(modalWordCount, { opacity: 0 }, { opacity: 1, duration: 0.3 });
                                } else {
                                    modalWordCount.style.opacity = '1';
                                }
                            }
                        } catch (err) {
                            console.warn('Ralat mengira perkataan:', err);
                        }
                    }
                    if (metaMerchant) metaMerchant.textContent = doc.category || 'General';
                    if (metaDate) metaDate.textContent = doc.uploaded_at ? doc.uploaded_at.split(' ')[0] : 'Hari ini';

                    const sizeBytes = doc.file_size || 0;
                    if (metaTotal) {
                        metaTotal.textContent = sizeBytes >= 1024 * 1024
                            ? `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`
                            : `${(sizeBytes / 1024).toFixed(0)} KB`;
                    }

                    // Update Icon
                    if (modalDocIcon) {
                        if (fileType === 'pdf') modalDocIcon.textContent = 'picture_as_pdf';
                        else if (fileType === 'image') modalDocIcon.textContent = 'image';
                        else if (fileType === 'office') {
                            const ext = (doc.filename || '').split('.').pop().toLowerCase();
                            if (ext.startsWith('xls')) modalDocIcon.textContent = 'table_view';
                            else if (ext.startsWith('ppt')) modalDocIcon.textContent = 'slideshow';
                            else modalDocIcon.textContent = 'description';
                        }
                        else if (fileType === 'web') modalDocIcon.textContent = 'html';
                        else if (fileType === 'text') modalDocIcon.textContent = 'code';
                        else modalDocIcon.textContent = 'draft';
                    }

                    // Update Left Half Preview
                    if (previewContainer) {
                        previewContainer.innerHTML = '';
                        const fileUrl = `/api/file/${doc.id}`;

                        // Helper: build a fallback card with "Open in New Tab" link
                        function buildFallbackCard() {
                            const fb = document.createElement('div');
                            fb.className = 'flex flex-col items-center justify-center h-full w-full gap-4 p-6 text-center';
                            const icon = document.createElement('span');
                            icon.className = 'material-symbols-outlined text-5xl text-outline';
                            icon.textContent = 'preview';
                            const msg = document.createElement('p');
                            msg.className = 'text-sm text-on-surface-variant';
                            msg.textContent = 'Pratinjau tidak tersedia di dalam modal.';
                            const link = document.createElement('a');
                            link.href = fileUrl;
                            link.target = '_blank';
                            link.className = 'mt-2 px-5 py-2.5 bg-primary text-white rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-[#4338CA] transition-all shadow-md shadow-primary/20';
                            link.textContent = 'Buka Dokumen di Tab Baru';
                            fb.appendChild(icon);
                            fb.appendChild(msg);
                            fb.appendChild(link);
                            return fb;
                        }

                        if (fileType === 'image') {
                            // Wrapper kanvas utama: background abu-abu lembut bermotif titik-titik halus
                            const wrapper = document.createElement('div');
                            wrapper.className = [
                                'flex flex-col items-center justify-center h-full w-full gap-4 p-6',
                                'bg-slate-100/70 rounded-2xl border border-slate-200/80',
                                '[background-image:radial-gradient(circle,_#94a3b8_1px,_transparent_1px)]',
                                '[background-size:18px_18px]',
                            ].join(' ');

                            // Tag <img>: shadow elevasi, ring putih, bg putih, dan transisi halus
                            // PENTING: <img> tetap sebagai elemen pertama agar selector zoom
                            // (#modal-receipt-preview img) dapat menemukannya dengan benar
                            const img = document.createElement('img');
                            img.src = fileUrl;
                            img.alt = 'Pratinjau Dokumen';
                            img.className = [
                                'w-full h-auto max-h-[460px] object-contain',
                                'rounded-xl bg-white',
                                'shadow-lg ring-1 ring-slate-900/10',
                                'transition-transform duration-200',
                            ].join(' ');
                            img.addEventListener('error', () => {
                                wrapper.innerHTML = '';
                                wrapper.appendChild(buildFallbackCard());
                            });

                            // Badge pill modern: ekstensi + nama file
                            const fileExt = (doc.filename || '').split('.').pop().toUpperCase();
                            const caption = document.createElement('div');
                            caption.className = 'flex items-center gap-2 max-w-sm';

                            const extBadge = document.createElement('span');
                            extBadge.className = [
                                'shrink-0 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider',
                                'bg-primary/10 text-primary border border-primary/20',
                            ].join(' ');
                            extBadge.textContent = fileExt;

                            const nameBadge = document.createElement('span');
                            nameBadge.className = [
                                'truncate text-xs font-medium text-slate-600',
                                'bg-white/90 backdrop-blur-sm px-3.5 py-1.5',
                                'rounded-full shadow-sm border border-slate-200/60',
                            ].join(' ');
                            nameBadge.textContent = doc.filename || '';
                            nameBadge.title = doc.filename || '';

                            caption.appendChild(extBadge);
                            caption.appendChild(nameBadge);

                            wrapper.appendChild(img);
                            wrapper.appendChild(caption);
                            previewContainer.appendChild(wrapper);

                        } else {
                            // Semua file non-gambar (pdf, docx, xlsx, txt, web, dll.)
                            // ditampilkan sebagai kartu placeholder — tidak ada <iframe>/<embed>
                            const ext = (doc.filename || '').split('.').pop().toUpperCase();
                            const wrapper = document.createElement('div');
                            wrapper.className = 'flex flex-col items-center justify-center min-h-[420px] w-full gap-4 p-6 text-center bg-surface rounded-2xl border border-outline-variant shadow-sm';

                            const iconDiv = createElement('div', 'w-16 h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center border border-primary/20 shadow-sm');
                            const iconSpan = createElement('span', 'material-symbols-outlined text-4xl',
                                fileType === 'pdf' ? 'picture_as_pdf'
                                : fileType === 'text' ? 'code'
                                : 'description'
                            );
                            iconDiv.appendChild(iconSpan);

                            const textDiv = createElement('div');
                            const titleH4 = createElement('h4', 'font-title-md text-base font-bold text-on-surface truncate max-w-xs mx-auto', doc.filename);
                            const badgeSpan = createElement('span', 'inline-block mt-1 px-3 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider bg-orange-100 text-orange-700 border border-orange-200', `${ext} DOKUMEN`);
                            textDiv.appendChild(titleH4);
                            textDiv.appendChild(badgeSpan);

                            const infoP = createElement('p', 'text-xs text-on-surface-variant max-w-xs leading-relaxed', 'Konten teks dokumen telah diekstrak dan diindeks secara penuh ke dalam mesin pencari DocuMind.');

                            const dlLink = createElement('a', 'mt-2 px-6 py-2.5 bg-primary text-white rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-[#4338CA] transition-all shadow-md shadow-primary/20');
                            dlLink.href = `/api/download/${doc.id}`;
                            const dlIcon = createElement('span', 'material-symbols-outlined text-base', 'download');
                            dlLink.appendChild(dlIcon);
                            dlLink.appendChild(document.createTextNode(' Unduh Berkas Asli'));

                            wrapper.appendChild(iconDiv);
                            wrapper.appendChild(textDiv);
                            wrapper.appendChild(infoP);
                            wrapper.appendChild(dlLink);
                            previewContainer.appendChild(wrapper);
                        }
                    }
                }
            })
            .catch(err => {
                console.error('Fetch document error:', err);
                if (ocrTextContainer) ocrTextContainer.textContent = 'Gagal memuat konten dokumen.';
            });
    }

    let currentZoomScale = 1.0;
    
    // === [TAG PRATINJAU: Penutup Modal Pratinjau (closePreviewModal)] ===
    // Penjelasan: Menutup dialog pratinjau dokumen dan mengembalikan status tombol serta zoom kembali ke kondisi normal
    function closePreviewModal() {
        if (modal) modal.classList.add('hidden');
        activePreviewDocId = null;
        isEditingOcr = false;
        
        // Kembalikan status tombol Edit/Simpan
        try {
            const approveBtn = document.getElementById('approve-file-btn');
            const editDataBtn = document.getElementById('edit-data-btn');
            const cancelEditBtn = document.getElementById('btn-cancel-edit');
            if (approveBtn && editDataBtn) {
                approveBtn.classList.add('hidden');
                if (cancelEditBtn) cancelEditBtn.classList.add('hidden');
                editDataBtn.classList.remove('hidden');
            }
        } catch(e) {}
        
        // Reset zoom state
        try {
            currentZoomScale = 1.0;
            const previewEl = document.querySelector('#modal-receipt-preview img') || document.querySelector('#modal-receipt-preview iframe') || document.querySelector('#modal-receipt-preview > div');
            if (previewEl) {
                if (typeof gsap !== 'undefined') {
                    gsap.set(previewEl, { scale: 1.0 });
                } else {
                    previewEl.style.transform = 'scale(1.0)';
                }
            }
        } catch (e) { console.warn('Reset zoom error:', e); }
    }

    if (closeModalBtn) closeModalBtn.onclick = closePreviewModal;
    if (modal) {
        modal.onclick = (e) => {
            if (e.target === modal) closePreviewModal();
        };
    }



    let backupOcrText = '';

    // === [TAG EDIT: Aksi Simpan & Edit Teks OCR Modal (initPreviewModalActions)] ===
    // Penjelasan: Mengaktifkan mode edit teks (contenteditable), menyimpan pembaruan ke backend (/api/document/:id via PUT), atau membatalkan editan
    // Preview Modal Buttons: Approve, Edit & Cancel
    function initPreviewModalActions() {
        const approveBtn = document.getElementById('approve-file-btn');
        const editDataBtn = document.getElementById('edit-data-btn');
        const cancelEditBtn = document.getElementById('btn-cancel-edit');

        if (approveBtn) {
            approveBtn.onclick = () => {
                if (isEditingOcr && activePreviewDocId && ocrTextContainer) {
                    const updatedContent = ocrTextContainer.innerText;
                    approveBtn.querySelector('span:last-child').textContent = 'Menyimpan...';

                    apiFetch(`/api/document/${activePreviewDocId}`, {
                        method: 'PUT',
                        body: JSON.stringify({ content: updatedContent })
                    })
                    .then(res => res.json())
                    .then(data => {
                        window.showToast('Perubahan teks dokumen berhasil disimpan!');
                        
                        // Kembalikan UI ke normal
                        isEditingOcr = false;
                        ocrTextContainer.setAttribute('contenteditable', 'false');
                        ocrTextContainer.classList.remove('border-2', 'border-primary', 'bg-white', 'p-4');
                        approveBtn.querySelector('span:last-child').textContent = 'Simpan Perubahan Teks';
                        
                        approveBtn.classList.add('hidden');
                        if (cancelEditBtn) cancelEditBtn.classList.add('hidden');
                        editDataBtn.classList.remove('hidden');

                        if (window.navApp) window.navApp.filterCategory(window.navApp.currentCategory);
                    })
                    .catch(() => {
                        window.showToast('Gagal menyimpan perubahan', 'error');
                        approveBtn.querySelector('span:last-child').textContent = 'Simpan Perubahan Teks';
                    });
                } else {
                    window.showToast('Dokumen tersimpan rapi di repositori DocuMind!');
                    closePreviewModal();
                }
            };
        }

        if (editDataBtn && ocrTextContainer) {
            editDataBtn.onclick = () => {
                if (!activePreviewDocId) return;

                isEditingOcr = true;
                backupOcrText = ocrTextContainer.innerHTML; // Simpan backup HTML (termasuk highlight jika ada)
                ocrTextContainer.setAttribute('contenteditable', 'true');
                ocrTextContainer.classList.add('border-2', 'border-primary', 'bg-white', 'p-4');
                ocrTextContainer.focus();
                window.showToast('Mode edit aktif. Silakan ubah teks hasil ekstraksi langsung.');

                // Sembunyikan Edit, Tampilkan Simpan & Batal dengan pop GSAP
                editDataBtn.classList.add('hidden');
                approveBtn.classList.remove('hidden');
                if (cancelEditBtn) cancelEditBtn.classList.remove('hidden');
                
                if (typeof gsap !== 'undefined') {
                    gsap.fromTo([approveBtn, cancelEditBtn], { scale: 0.8, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.3, stagger: 0.1, ease: 'back.out(1.5)' });
                }
            };
        }

        if (cancelEditBtn) {
            cancelEditBtn.onclick = () => {
                if (isEditingOcr && ocrTextContainer) {
                    ocrTextContainer.innerHTML = backupOcrText; // Kembalikan teks asli
                    isEditingOcr = false;
                    ocrTextContainer.setAttribute('contenteditable', 'false');
                    ocrTextContainer.classList.remove('border-2', 'border-primary', 'bg-white', 'p-4');
                    
                    approveBtn.classList.add('hidden');
                    cancelEditBtn.classList.add('hidden');
                    editDataBtn.classList.remove('hidden');

                    if (typeof gsap !== 'undefined') {
                        gsap.fromTo(editDataBtn, { scale: 0.8, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.3, ease: 'back.out(1.5)' });
                    }
                    window.showToast('Perubahan teks dibatalkan.', 'info');
                }
            };
        }
    }

    // === [TAG EKSPOR: Salin Teks OCR & Unduh TXT] ===
    // Penjelasan: Menyalin isi teks hasil ekstraksi OCR ke clipboard atau mengunduhnya sebagai berkas teks .txt
    // Fitur Salin Teks dan Unduh TXT (Client-Side DOM)
    const downloadBtn = document.getElementById('btn-download-ocr');

    if (copyBtn && ocrTextContainer) {
        copyBtn.addEventListener('click', () => {
            const textToCopy = ocrTextContainer.innerText || ocrTextContainer.textContent;
            if (!textToCopy || textToCopy.trim() === '' || textToCopy.includes('Memuat konten dokumen')) {
                if (window.showToast) window.showToast('Tidak ada teks OCR untuk disalin.', 'error');
                return;
            }

            navigator.clipboard.writeText(textToCopy).then(() => {
                // Feedback GSAP membal halus
                if (typeof gsap !== 'undefined') {
                    gsap.fromTo(copyBtn, { scale: 0.9 }, { scale: 1.1, duration: 0.15, yoyo: true, repeat: 1, ease: 'power2.out' });
                }

                // Ubah ikon & teks sementara
                const icon = copyBtn.querySelector('.material-symbols-outlined');
                const label = copyBtn.querySelector('span:last-child');
                const origIcon = icon ? icon.innerText : 'content_copy';
                const origLabel = label ? label.innerText : 'Salin Teks';

                if (icon) { icon.innerText = 'check'; icon.classList.add('text-green-500'); }
                if (label) { label.innerText = 'Tersalin!'; label.classList.add('text-green-500'); }

                if (window.showToast) window.showToast('Teks OCR berhasil disalin ke papan klip!', 'success');

                setTimeout(() => {
                    if (icon) { icon.innerText = origIcon; icon.classList.remove('text-green-500'); }
                    if (label) { label.innerText = origLabel; label.classList.remove('text-green-500'); }
                }, 2000);
            }).catch(err => {
                console.error('Copy error:', err);
                if (window.showToast) window.showToast('Gagal menyalin teks OCR.', 'error');
            });
        });
    }

    if (downloadBtn && ocrTextContainer) {
        downloadBtn.addEventListener('click', () => {
            const textToDownload = ocrTextContainer.innerText || ocrTextContainer.textContent;
            if (!textToDownload || textToDownload.trim() === '' || textToDownload.includes('Memuat konten dokumen')) {
                if (window.showToast) window.showToast('Tidak ada teks OCR untuk diunduh.', 'error');
                return;
            }

            // Ambil judul dari header modal
            const titleEl = document.getElementById('modal-filename');
            const docTitle = titleEl && titleEl.innerText ? titleEl.innerText.replace(/\.[^/.]+$/, "") : 'dokumen_ocr';
            const filename = `\${docTitle}_OCR.txt`;

            const blob = new Blob([textToDownload], { type: "text/plain;charset=utf-8" });
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();

            setTimeout(() => {
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }, 100);

            // Feedback GSAP membal halus
            if (typeof gsap !== 'undefined') {
                gsap.fromTo(downloadBtn, { scale: 0.9 }, { scale: 1.1, duration: 0.15, yoyo: true, repeat: 1, ease: 'power2.out' });
            }

            if (window.showToast) window.showToast(`File \${filename} sedang diunduh.`, 'success');
        });
    }

    // === [TAG UNDUH: Pemicu Unduh Berkas Asli (triggerDocumentDownload)] ===
    // Penjelasan: Memulai proses pengunduhan berkas fisik asli dari server
    // Download Handler
    function triggerDocumentDownload(docId) {
        window.location.href = `/api/download/${docId}`;
        window.showToast('Starting file download...');
    }

    // === [TAG HAPUS: Konfirmasi dan Hapus Dokumen Tunggal (confirmAndDeleteDocument)] ===
    // Penjelasan: Membuka modal konfirmasi hapus kustom dan mengeksekusi penghapusan ke /api/document/:id dengan pembaruan DOM seketika
    // Delete Confirmation & Execution Handler
    function confirmAndDeleteDocument(docId, docTitle) {
        const deleteModal = document.getElementById('delete-modal-overlay');
        const deleteDialog = document.getElementById('delete-modal-dialog');
        const confirmBtn = document.getElementById('confirm-delete-btn');
        const cancelBtn = document.getElementById('cancel-delete-btn');
        const filenameEl = document.getElementById('delete-modal-filename');

        if (!deleteModal || !confirmBtn || !cancelBtn) {
            // Fallback ke window.confirm jika template belum dimuat
            if (!confirm(`Apakah Anda yakin ingin menghapus dokumen "${docTitle}"?\nTindakan ini akan menghapus indeks dokumen dan file fisik secara permanen.`)) return;
            executeDelete();
            return;
        }

        // Tampilkan Modal
        if (filenameEl) filenameEl.textContent = docTitle;
        deleteModal.classList.remove('hidden');

        if (typeof gsap !== 'undefined') {
            gsap.fromTo(deleteDialog, { scale: 0.9, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.25, ease: "back.out(1.7)" });
        }

        // Event handler sementara untuk tombol konfirmasi
        confirmBtn.onclick = () => {
            closeDeleteModal();
            executeDelete();
        };

        // Event handler sementara untuk tutup
        cancelBtn.onclick = closeDeleteModal;

        function closeDeleteModal() {
            if (typeof gsap !== 'undefined') {
                gsap.to(deleteDialog, { scale: 0.9, opacity: 0, duration: 0.2, ease: "power1.in", onComplete: () => {
                    deleteModal.classList.add('hidden');
                }});
            } else {
                deleteModal.classList.add('hidden');
            }
        }

        // Daftarkan listener Escape khusus (disuntikkan dalam event global atau ditangani langsung)
        window._currentDeleteCloseFn = closeDeleteModal;

        function executeDelete() {
            if (window.navApp) {
                // === JALUR navApp: Hapus hanya baris DOM yang bersesuaian ===
                // Ketika navApp aktif, tabel dirender oleh navApp.renderAllDocsTable /
                // renderDashboardTable — bukan dari currentLoadedDocs milik search.js.
                // Memanggil renderCurrentPageItems() di sini akan mengosongkan tabel
                // karena currentLoadedDocs search.js bisa kosong atau tidak sinkron.
                // Solusi: hapus hanya <tr> dengan data-doc-id yang cocok secara langsung.
                document.querySelectorAll(
                    `[data-doc-id="${docId}"], tr[data-doc-id="${docId}"]`
                ).forEach(el => {
                    // Hanya hapus elemen baris tabel (<tr>) atau kartu grid,
                    // bukan tombol action individual yang juga memakai data-doc-id
                    if (el.tagName === 'TR' || el.classList.contains('doc-card')) {
                        el.remove();
                    }
                });

                // Optimistic DOM Update khusus untuk Halaman Antrean (0 Detik)
                const activeEl = document.getElementById('queue-stat-active');
                const totalEl = document.getElementById('queue-stat-total');
                if (totalEl) totalEl.textContent = Math.max(0, (parseInt(totalEl.textContent) || 0) - 1);

                apiFetch(`/api/document/${docId}`, { method: 'DELETE' })
                    .then(res => res.json())
                    .then(data => {
                        if (data.status === 'success') {
                            // Memaksa update metrik dasbor seketika setelah dokumen dihapus
                            if (typeof updateDashboardStats === 'function') {
                                updateDashboardStats();
                            }
                            if (data.stats) window.updateStorageWidget(data.stats);
                            window.showToast(`Document "${docTitle}" removed successfully`);
                            // Sinkronisasi penuh dari server: refresh daftar dokumen via navApp
                            window.navApp.filterCategory(window.navApp.currentCategory);
                        } else {
                            window.showToast(data.message || 'Failed to delete document', 'error');
                            // Rollback: muat ulang tampilan agar baris yang salah terhapus muncul kembali
                            window.navApp.filterCategory(window.navApp.currentCategory);
                        }
                    })
                    .catch(err => {
                        console.error('Delete document error:', err);
                        window.showToast('Error deleting document', 'error');
                        // Rollback tampilan
                        window.navApp.filterCategory(window.navApp.currentCategory);
                    });

            } else {
                // === JALUR standalone search.js: Optimistic DOM Update via currentLoadedDocs ===
                // Optimistic DOM Update (0 Detik) untuk tabel utama
                const docToDelete = currentLoadedDocs.find(d => d.id === docId);
                currentLoadedDocs = currentLoadedDocs.filter(d => d.id !== docId);
                renderCurrentPageItems();

                // Optimistic DOM Update khusus untuk Halaman Antrean (0 Detik)
                const activeEl = document.getElementById('queue-stat-active');
                const totalEl = document.getElementById('queue-stat-total');
                if (totalEl) totalEl.textContent = Math.max(0, (parseInt(totalEl.textContent) || 0) - 1);
                if (activeEl && docToDelete) {
                    // Turunkan metrik tugas aktif jika kategori dokumen menandakan sedang diproses
                    if (docToDelete.category && (docToDelete.category.includes('Memproses') || docToDelete.category.includes('Processing'))) {
                        activeEl.textContent = Math.max(0, (parseInt(activeEl.textContent) || 0) - 1);
                    } else if (!docToDelete.category && docToDelete.status && docToDelete.status !== 'Completed') {
                        // Fallback cek status bila tersedia
                        activeEl.textContent = Math.max(0, (parseInt(activeEl.textContent) || 0) - 1);
                    }
                }

                apiFetch(`/api/document/${docId}`, { method: 'DELETE' })
                    .then(res => res.json())
                    .then(data => {
                        if (data.status === 'success') {
                            // Memaksa update metrik dasbor seketika setelah dokumen dihapus
                            if (typeof updateDashboardStats === 'function') {
                                updateDashboardStats();
                            }
                            if (data.stats) window.updateStorageWidget(data.stats);
                            window.showToast(`Document "${docTitle}" removed successfully`);
                        } else {
                            window.showToast(data.message || 'Failed to delete document', 'error');
                        }
                    })
                    .catch(err => {
                        console.error('Delete document error:', err);
                        window.showToast('Error deleting document', 'error');
                    });
            }
        }
    }

    // === [TAG FILTER: Filter Tipe Dokumen (filterPills)] ===
    // Penjelasan: Mengubah filter jenis berkas (Semua, PDF, Dokumen, Gambar) dan memperbarui pencarian
    // Filter Pills Handler
    filterPills.forEach(pill => {
        pill.onclick = () => {
            filterPills.forEach(p => {
                p.classList.remove('bg-white', 'shadow-sm', 'text-primary', 'active');
                p.classList.add('text-on-surface-variant');
            });
            pill.classList.add('bg-white', 'shadow-sm', 'text-primary', 'active');
            pill.classList.remove('text-on-surface-variant');

            currentTypeFilter = pill.getAttribute('data-filter') || 'all';
            currentPage = 1;
            triggerBackendSearch();
        };
    });

    // === [TAG FILTER: Filter Kategori Sidebar (sidebarCategoryLinks)] ===
    // Penjelasan: Memfilter berkas berdasarkan kategori folder di bilah navigasi samping
    // Sidebar Category Links Handler (If present)
    if (sidebarCategoryLinks.length > 0) {
        sidebarCategoryLinks.forEach(link => {
            link.onclick = (e) => {
                e.preventDefault();
                sidebarCategoryLinks.forEach(l => {
                    l.classList.remove('bg-primary/10', 'text-primary', 'border-l-4', 'border-primary', 'active');
                    l.classList.add('text-on-surface-variant');
                });
                link.classList.add('bg-primary/10', 'text-primary', 'border-l-4', 'border-primary', 'active');
                link.classList.remove('text-on-surface-variant');

                currentCategoryFilter = link.getAttribute('data-category') || 'all';
                currentPage = 1;
                triggerBackendSearch();
            };
        });
    }

    // === [TAG PENCARIAN: Input Debounce & Pemicu Pencarian Instan] ===
    // Penjelasan: Mengambil teks input pencarian dengan jeda debounce 300ms untuk meminimalisasi beban request server
    // Header Search Input with 300ms Debouncing & Clear (X) Button
    if (searchInput) {
        searchInput.oninput = (e) => {
            currentQuery = e.target.value.trim();

            if (searchClearBtn) {
                if (currentQuery.length > 0) {
                    searchClearBtn.classList.remove('hidden');
                } else {
                    searchClearBtn.classList.add('hidden');
                }
            }

            clearTimeout(searchDebounceTimer);
            searchDebounceTimer = setTimeout(() => {
                currentPage = 1;
                triggerBackendSearch();
            }, 300);
        };

        searchInput.onkeydown = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                clearTimeout(searchDebounceTimer);
                currentPage = 1;
                triggerBackendSearch();
            }
        };
    }

    if (searchIcon) {
        searchIcon.onclick = () => {
            clearTimeout(searchDebounceTimer);
            currentPage = 1;
            triggerBackendSearch();
        };
    }

    if (searchClearBtn) {
        searchClearBtn.onclick = () => {
            if (searchInput) searchInput.value = '';
            currentQuery = '';
            searchClearBtn.classList.add('hidden');
            currentPage = 1;
            triggerBackendSearch();
        };
    }

    // === [TAG PENCARIAN: Eksekusi Pencarian ke Backend (triggerBackendSearch)] ===
    // Penjelasan: Mengirim parameter kata kunci, tipe berkas, dan kategori ke endpoint /api/search
    // Execute Search Request to Flask Backend
    function triggerBackendSearch() {
        if (window.navApp) {
            window.navApp.searchQuery = currentQuery;
            window.navApp.currentType = currentTypeFilter;
            window.navApp.filterCategory(window.navApp.currentCategory);
            return;
        }

        const url = `/api/search?q=${encodeURIComponent(currentQuery)}&type=${encodeURIComponent(currentTypeFilter)}&category=${encodeURIComponent(currentCategoryFilter)}`;

        fetch(url)
            .then(res => res.json())
            .then(data => {
                if (data.status === 'success' && data.results) {
                    currentLoadedDocs = data.results;
                    renderCurrentPageItems();
                    if (data.stats) window.updateStorageWidget(data.stats);
                }
            })
            .catch(err => console.error('Search query error:', err));
    }

    // === [TAG PAGINASI: Render Butir Halaman Aktif (renderCurrentPageItems)] ===
    // Penjelasan: Membagi hasil pencarian ke dalam potongan per halaman (6 item per halaman) untuk tampilan tabel atau grid
    // Render Current Page Items (List View or Grid View)
    function renderCurrentPageItems() {
        const totalItems = currentLoadedDocs.length;
        const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
        if (currentPage > totalPages) currentPage = totalPages;
        if (currentPage < 1) currentPage = 1;

        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = Math.min(startIndex + itemsPerPage, totalItems);
        const pageDocs = currentLoadedDocs.slice(startIndex, endIndex);

        // Update Table Rows
        if (documentsTableBody) {
            documentsTableBody.querySelectorAll('.doc-row').forEach(r => r.remove());

            if (totalItems === 0) {
                if (emptyStateRow) emptyStateRow.classList.remove('hidden');
            } else {
                if (emptyStateRow) emptyStateRow.classList.add('hidden');
                pageDocs.forEach(doc => {
                    const row = createTableRowElement(doc);
                    documentsTableBody.appendChild(row);
                });
            }
        }

        // Update Grid View Cards
        if (documentsGrid) {
            documentsGrid.innerHTML = '';
            if (totalItems > 0) {
                pageDocs.forEach(doc => {
                    const card = createGridCardElement(doc);
                    documentsGrid.appendChild(card);
                });
            }
        }

        // Update Pagination Controls
        if (paginationInfo) {
            if (totalItems === 0) {
                paginationInfo.textContent = 'Showing 0 documents';
            } else {
                paginationInfo.textContent = `Showing ${startIndex + 1}-${endIndex} of ${totalItems} documents`;
            }
        }

        updatePaginationButtons(totalPages);
    }

    // === [TAG DOM: Pembuat Elemen Baris Tabel (createTableRowElement)] ===
    // Penjelasan: Menghasilkan elemen baris <tr> dokumen lengkap dengan ikon, lencana, cuplikan teks dengan highlight, dan tombol aksi
    function createTableRowElement(doc) {
        const sizeFormatted = doc.file_size ? `${(doc.file_size / (1024 * 1024)).toFixed(1)} MB` : '1.0 MB';
        const isPdf = doc.file_type === 'pdf';
        const isDocx = doc.file_type === 'office';
        const badgeType = isPdf ? 'DIGITAL / PDF' : (isDocx ? 'DOCX / OFFICE' : 'IMAGE / OCR');
        const badgeClass = isPdf ? 'bg-primary/5 text-primary border-primary/10' : (isDocx ? 'bg-orange-50 text-orange-700 border-orange-100' : 'bg-emerald-50 text-emerald-700 border-emerald-100');
        const iconName = isPdf ? 'picture_as_pdf' : (isDocx ? 'description' : 'image');
        const iconBg = isPdf ? 'bg-blue-50 text-blue-600 border-blue-100' : (isDocx ? 'bg-orange-50 text-orange-600 border-orange-100' : 'bg-red-50 text-red-600 border-red-100');

        const dateStr = doc.uploaded_at ? doc.uploaded_at.split(' ')[0] : 'Just Now';
        const timeStr = doc.uploaded_at && doc.uploaded_at.includes(' ') ? doc.uploaded_at.split(' ')[1] : 'Recently Added';

        const tr = document.createElement('tr');
        tr.className = 'hover:bg-surface-container-lowest transition-colors group doc-row cursor-pointer';
        tr.dataset.type = doc.file_type || '';
        tr.dataset.category = doc.category || '';
        tr.dataset.docId = doc.id;
        tr.dataset.title = doc.filename || '';

        tr.innerHTML = `
            <td class="px-lg py-lg">
                <div class="flex items-center gap-md">
                    <div class="w-10 h-10 rounded-lg ${iconBg} flex items-center justify-center">
                        <span class="material-symbols-outlined">${iconName}</span>
                    </div>
                    <div>
                        <div class="font-body-md text-body-md text-on-surface font-semibold group-hover:text-primary transition-colors doc-name">${typeof escapeHtml === 'function' ? escapeHtml(doc.filename || '') : (doc.filename || '')}</div>
                        <div class="text-label-md text-on-surface-variant">${sizeFormatted}</div>
                    </div>
                </div>
            </td>
            <td class="px-lg py-lg whitespace-nowrap">
                <span class="${badgeClass} inline-flex items-center whitespace-nowrap text-[10px] font-bold px-2.5 py-1 rounded-full border uppercase tracking-tighter">
                    ${badgeType}
                </span>
            </td>
            <td class="px-lg py-lg">
                <div class="font-mono-md text-mono-md text-on-surface-variant line-clamp-2 max-w-md doc-snippet">
                    ${doc.snippet ? (typeof sanitizeSnippet === 'function' ? sanitizeSnippet(doc.snippet) : (typeof escapeHtml === 'function' ? escapeHtml(doc.snippet) : doc.snippet)) : '...Text content extracted and ready for indexing...'}
                </div>
            </td>
            <td class="px-lg py-lg whitespace-nowrap">
                <div class="text-body-md text-on-surface">${dateStr}</div>
                <div class="text-label-md text-on-surface-variant">${timeStr}</div>
            </td>
            <td class="px-lg py-lg text-right whitespace-nowrap">
                <div class="flex items-center justify-end gap-1">
                    <button class="material-symbols-outlined p-2 text-on-surface-variant hover:bg-primary/10 hover:text-primary rounded-lg transition-all btn-view-doc" title="View Document" data-doc-id="${doc.id}">visibility</button>
                    <button class="material-symbols-outlined p-2 text-on-surface-variant hover:bg-primary/10 hover:text-primary rounded-lg transition-all btn-download-doc" title="Download" data-doc-id="${doc.id}">download</button>
                    <button class="material-symbols-outlined p-2 text-on-surface-variant hover:bg-error/10 hover:text-error rounded-lg transition-all btn-delete-doc" title="Delete" data-doc-id="${doc.id}">delete</button>
                </div>
            </td>
        `;

        tr.addEventListener('click', (e) => {
            if (e.target.closest('button')) return;
            if (window.openPreviewModal) openPreviewModal(doc.id);
        });

        return tr;
    }

    // === [TAG PAGINASI: Tombol Navigasi Halaman (updatePaginationButtons)] ===
    // Penjelasan: Menghasilkan tombol angka halaman serta tombol navigasi Sebelumnya dan Selanjutnya
    function updatePaginationButtons(totalPages) {
        if (!paginationNumbers) return;
        paginationNumbers.innerHTML = '';

        for (let i = 1; i <= totalPages; i++) {
            const pageBtn = document.createElement('span');
            pageBtn.className = i === currentPage
                ? 'px-3 py-1 bg-primary text-white rounded-md text-label-md font-label-md cursor-pointer'
                : 'px-3 py-1 bg-surface-container hover:bg-surface-container-high text-on-surface rounded-md text-label-md font-label-md cursor-pointer';
            pageBtn.textContent = i;
            pageBtn.onclick = () => {
                currentPage = i;
                renderCurrentPageItems();
            };
            paginationNumbers.appendChild(pageBtn);
        }

        if (btnPagePrev) {
            btnPagePrev.disabled = currentPage <= 1;
            btnPagePrev.onclick = () => {
                if (currentPage > 1) {
                    currentPage--;
                    renderCurrentPageItems();
                }
            };
        }

        if (btnPageNext) {
            btnPageNext.disabled = currentPage >= totalPages;
            btnPageNext.onclick = () => {
                if (currentPage < totalPages) {
                    currentPage++;
                    renderCurrentPageItems();
                }
            };
        }
    }

    // Global exports for navigation and upload modules
    window.openPreviewModal = openPreviewModal;
    window.triggerDocumentDownload = triggerDocumentDownload;
    window.confirmAndDeleteDocument = confirmAndDeleteDocument;
    window.triggerBackendSearch = triggerBackendSearch;

    // === [TAG SHORTCUT: Pintasan Papan Ketik Global] ===
    // Penjelasan: Menangani tombol '/' atau 'Ctrl+K' untuk fokus ke pencarian, serta tombol 'Escape' untuk menutup modal
    // Global Keyboard Shortcuts
    document.addEventListener('keydown', (e) => {
        try {
            // Cek jika sedang fokus di dalam elemen input teks lain (kecuali body)
            const isTyping = document.activeElement && 
                             (document.activeElement.tagName === 'INPUT' || 
                              document.activeElement.tagName === 'TEXTAREA' || 
                              document.activeElement.isContentEditable);

            // Shortcut Ctrl + K atau '/' untuk Pencarian
            if ((e.key === '/' && !isTyping) || (e.ctrlKey && e.key.toLowerCase() === 'k')) {
                e.preventDefault(); // Mencegah input karakter '/' atau default browser Ctrl+K
                if (searchInput) {
                    searchInput.focus();
                    if (typeof gsap !== 'undefined') {
                        gsap.fromTo(searchInput, 
                            { scale: 1.02 }, 
                            { scale: 1, duration: 0.2, ease: 'power2.out' }
                        );
                    }
                }
            }

            // Shortcut Escape untuk Tutup Modal (Pratinjau & Konfirmasi Hapus)
            if (e.key === 'Escape') {
                const deleteModal = document.getElementById('delete-modal-overlay');
                if (deleteModal && !deleteModal.classList.contains('hidden')) {
                    if (typeof window._currentDeleteCloseFn === 'function') {
                        window._currentDeleteCloseFn();
                    } else {
                        deleteModal.classList.add('hidden');
                    }
                    return; // Hentikan di sini agar tidak menutup modal pratinjau jika berada di bawahnya
                }

                if (modal && !modal.classList.contains('hidden')) {
                    if (typeof window.animateModalClose === 'function') {
                        window.animateModalClose(modal, closePreviewModal);
                    } else {
                        closePreviewModal();
                    }
                }
            }
        } catch (err) {
            console.warn('Keyboard shortcut error:', err);
        }
    });

    // === [TAG ZOOM: Kontrol Pembesaran Pratinjau Dokumen (applyZoom)] ===
    // Penjelasan: Mengatur skala perbesaran (zoom in, zoom out, reset) berkas pratinjau di dalam modal dengan animasi GSAP
    // Kawalan Zoom Imej (Client-Side DOM)
    const btnZoomIn = document.getElementById('btn-zoom-in');
    const btnZoomOut = document.getElementById('btn-zoom-out');
    const btnZoomReset = document.getElementById('btn-zoom-reset');

    function applyZoom(scale) {
        const previewEl = document.querySelector('#modal-receipt-preview img') || document.querySelector('#modal-receipt-preview iframe') || document.querySelector('#modal-receipt-preview > div');
        if (previewEl) {
            if (typeof gsap !== 'undefined') {
                gsap.to(previewEl, { scale: scale, duration: 0.2, ease: 'power1.out', transformOrigin: 'center center' });
            } else {
                previewEl.style.transform = `scale(${scale})`;
                previewEl.style.transition = 'transform 0.2s ease-out';
            }
        }
    }

    if (btnZoomIn) {
        btnZoomIn.addEventListener('click', () => {
            try {
                if (currentZoomScale < 2.5) {
                    currentZoomScale += 0.25;
                    applyZoom(currentZoomScale);
                }
            } catch (err) { console.warn('Zoom In error:', err); }
        });
    }

    if (btnZoomOut) {
        btnZoomOut.addEventListener('click', () => {
            try {
                if (currentZoomScale > 0.6) {
                    currentZoomScale -= 0.25;
                    applyZoom(currentZoomScale);
                }
            } catch (err) { console.warn('Zoom Out error:', err); }
        });
    }

    if (btnZoomReset) {
        btnZoomReset.addEventListener('click', () => {
            try {
                currentZoomScale = 1.0;
                applyZoom(currentZoomScale);
            } catch (err) { console.warn('Zoom Reset error:', err); }
        });
    }

});

    // === [TAG OVERRIDE: Pencegah Dialog Browser Asli (Fail-safe)] ===
    // Penjelasan: Mencegah munculnya kotak konfirmasi standar bawaan browser agar selalu menggunakan modal konfirmasi kustom DocuMind
    // 3. Override Darurat (Fail-safe) untuk memastikan window.confirm asli tidak pernah muncul saat menghapus
    document.addEventListener('click', (e) => {
        const deleteBtn = e.target.closest('button[data-delete], button[title*="Hapus"], .btn-delete, button:has(.text-red-500), .btn-delete-doc');
        if (deleteBtn) {
            const originalConfirm = window.confirm;
            window.confirm = function(msg) {
                if (msg && msg.toLowerCase().includes('hapus')) {
                    window.confirm = originalConfirm;
                    return false;
                }
                return originalConfirm(msg);
            };
            setTimeout(() => { window.confirm = originalConfirm; }, 100);
        }
    }, true);

    // === [TAG SELEKSI: Pengendali Pilihan Kotak Centang & Tombol Hapus Massal] ===
    // Penjelasan: Menghitung jumlah berkas yang dicentang dan memunculkan tombol hapus massal bila ada berkas terpilih
    // 4. Logika UI Checkbox dan Tombol Hapus Massal (Dashboard)
    function updateBulkDeleteState() {
        const bulkBtn = document.getElementById('btn-bulk-delete');
        if (!bulkBtn) return;
        
        const checkedBoxes = document.querySelectorAll('.doc-checkbox:checked');
        const count = checkedBoxes.length;
        const countEl = document.getElementById('selected-count');
        
        if (countEl) countEl.textContent = count;

        if (count > 0) {
            bulkBtn.classList.remove('hidden');
            bulkBtn.removeAttribute('disabled');
            bulkBtn.disabled = false;
            if (typeof gsap !== 'undefined') {
                gsap.to(bulkBtn, { opacity: 1, scale: 1, duration: 0.2 });
            }
        } else {
            bulkBtn.classList.add('hidden');
            bulkBtn.disabled = true;
        }
    }

    document.addEventListener('change', (e) => {
        if (e.target.matches('#select-all-docs')) {
            const allBoxes = document.querySelectorAll('.doc-checkbox');
            allBoxes.forEach(cb => cb.checked = e.target.checked);
            updateBulkDeleteState();
        } else if (e.target.matches('.doc-checkbox')) {
            const allBoxes = document.querySelectorAll('.doc-checkbox');
            const allChecked = document.querySelectorAll('.doc-checkbox:checked');
            const masterBox = document.getElementById('select-all-docs');
            if (masterBox) {
                masterBox.checked = (allBoxes.length > 0 && allBoxes.length === allChecked.length);
            }
            updateBulkDeleteState();
        }
    });

    // === [TAG HAPUS: Eksekusi Penghapusan Dokumen Massal] ===
    // Penjelasan: Mengirim daftar ID dokumen terpilih ke /api/documents/bulk-delete dan menghapus baris terkait secara instan
    document.addEventListener('click', (e) => {
        const btnBulkDelete = e.target.closest('#btn-bulk-delete');
        if (btnBulkDelete) {
            e.preventDefault();
            e.stopPropagation();

            const selectedBoxes = document.querySelectorAll('.doc-checkbox:checked');
            const selectedIds = Array.from(selectedBoxes).map(cb => {
                let val = cb.getAttribute('value') || cb.dataset.id || cb.dataset.docId;
                return parseInt(val, 10);
            }).filter(id => !isNaN(id));

            if (selectedIds.length === 0) {
                if (window.showToast) window.showToast('Pilih minimal satu dokumen.', 'error');
                return;
            }

            const deleteModal = document.getElementById('delete-modal-overlay');
            const deleteDialog = document.getElementById('delete-modal-dialog');
            const confirmBtn = document.getElementById('confirm-delete-btn');
            const cancelBtn = document.getElementById('cancel-delete-btn');
            const filenameEl = document.getElementById('delete-modal-filename');

            if (filenameEl) filenameEl.textContent = `${selectedIds.length} dokumen terpilih`;
            if (deleteModal) deleteModal.classList.remove('hidden');

            if (typeof gsap !== 'undefined' && deleteDialog) {
                gsap.fromTo(deleteDialog, { scale: 0.9, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.25, ease: "back.out(1.7)" });
            }

            if (confirmBtn) {
                confirmBtn.onclick = async () => {
                    try {
                        confirmBtn.disabled = true;
                        confirmBtn.textContent = 'Menghapus...';

                        const response = await window.apiFetch('/api/documents/bulk-delete', {
                            method: 'POST',
                            body: JSON.stringify({ doc_ids: selectedIds })
                        });

                        const result = await response.json();

                        if (response.ok) {
                            // Sembunyikan modal
                            if (deleteModal) deleteModal.classList.add('hidden');
                            
                            // Hapus baris dari DOM secara langsung
                            selectedIds.forEach(id => {
                                const row = document.querySelector(`tr:has(input[data-id="${id}"]), tr[data-doc-id="${id}"]`);
                                if (row) row.remove();
                            });

                            // Reset checkbox master dan sembunyikan tombol bulk delete
                            const selectAll = document.getElementById('select-all-docs');
                            if (selectAll) selectAll.checked = false;
                            const bulkBtn = document.getElementById('btn-bulk-delete');
                            if (bulkBtn) bulkBtn.classList.add('hidden');

                            if (window.showToast) window.showToast(`${selectedIds.length} dokumen berhasil dihapus.`, 'success');
                            if (window.navApp) window.navApp.filterCategory(window.navApp.currentCategory);
                            updateBulkDeleteState();
                        } else {
                            if (window.showToast) window.showToast(result.message || result.error || 'Gagal menghapus dokumen.', 'error');
                        }
                    } catch (err) {
                        console.error('Bulk delete error:', err);
                        if (window.showToast) window.showToast('Terjadi kesalahan jaringan saat menghapus.', 'error');
                    } finally {
                        confirmBtn.disabled = false;
                        confirmBtn.textContent = 'Hapus Permanen';
                    }
                };
            }

            if (cancelBtn) cancelBtn.onclick = closeDeleteModal;

            function closeDeleteModal() {
                if (typeof gsap !== 'undefined' && deleteDialog) {
                    gsap.to(deleteDialog, { scale: 0.9, opacity: 0, duration: 0.2, ease: "power1.in", onComplete: () => {
                        if (deleteModal) deleteModal.classList.add('hidden');
                    }});
                } else if (deleteModal) {
                    deleteModal.classList.add('hidden');
                }
            }
            
            window._currentDeleteCloseFn = closeDeleteModal;
        }
    });
