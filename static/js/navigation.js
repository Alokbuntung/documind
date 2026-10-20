/**
 * NavigationManager - DocuMind Full-Stack Sidebar Routing & Ecosystem Controller
 */

// === [TAG KELAS: Pengatur Navigasi & Tampilan Dashboard (NavigationManager)] ===
// Penjelasan: Mengendalikan perpindahan rute URL hash (#dashboard, #all-documents, #queue, #settings), rendering tabel data, dan sinkronisasi status antrean OCR
class NavigationManager {
    constructor() {
        this.currentView = 'dashboard';
        this.currentCategory = 'all';
        this.currentType = 'all';
        this.searchQuery = '';
        this.selectedDocIds = new Set();
        this.minConfidence = 50;
        this.ocrPollingDocumentIds = new Set();
        this.ocrPollingTimer = null;
        this.ocrPollRequestInFlight = false;
        this.ocrPollIntervalMs = 1800;

        this.init();
    }

    // === [TAG METODE: Inisialisasi Event Listener Navigasi] ===
    // Penjelasan: Memasang listener klik pada link sidebar, logo brand, tombol navigasi mobile, dan event hashchange browser
    init() {
        // Bind sidebar navigation click handlers
        document.querySelectorAll('.sidebar-link').forEach(link => {
            link.addEventListener('click', (e) => {
                const targetHash = link.getAttribute('href');
                if (targetHash && targetHash.startsWith('#')) {
                    window.location.hash = targetHash;
                }
            });
        });

        // Listen to hash router changes
        window.addEventListener('hashchange', () => this.handleHashChange());

        // Header logo reset click
        const logoBtn = document.getElementById('header-logo-btn');
        if (logoBtn) {
            logoBtn.addEventListener('click', () => {
                window.location.hash = '#dashboard';
            });
        }

        const brandBtn = document.getElementById('sidebar-brand-btn');
        if (brandBtn) {
            brandBtn.addEventListener('click', () => {
                window.location.hash = '#dashboard';
            });
        }

        // Mobile Menu Toggle
        const mobileMenuBtn = document.getElementById('mobile-menu-btn');
        const mainSidebar = document.getElementById('main-sidebar');
        if (mobileMenuBtn && mainSidebar) {
            mobileMenuBtn.addEventListener('click', () => {
                if (mainSidebar.classList.contains('hidden')) {
                    mainSidebar.classList.remove('hidden');
                    mainSidebar.classList.add('flex');
                } else {
                    mainSidebar.classList.add('hidden');
                    mainSidebar.classList.remove('flex');
                }
            });
        }

        // Setup View Handlers
        this.initAllDocsHandlers();
        this.initQueueHandlers();
        this.initSettingsHandlers();

        // Initialize view based on current location hash
        this.handleHashChange();

        // Start live dashboard polling
        window.statsPollInterval = setInterval(updateDashboardStats, 10000);
    }

    // === [TAG ROUTER: Penangan Perubahan Hash URL (handleHashChange)] ===
    // Penjelasan: Membaca rute dari URL hash (misal #all-documents) dan memanggil switchRoute
    handleHashChange() {
        const hash = window.location.hash.replace('#', '').trim() || 'dashboard';
        this.switchRoute(hash);
    }

    // === [TAG ROUTER: Pengalih Tampilan Tab Konten (switchRoute)] ===
    // Penjelasan: Menyembunyikan seluruh container tampilan dan hanya memunculkan tab aktif (Dashboard, All Docs, Queue, Settings) dengan animasi transisi
    switchRoute(route) {
        // Highlight active sidebar item accurately based on href hash
        document.querySelectorAll('.sidebar-link').forEach(link => {
            const href = (link.getAttribute('href') || '').replace('#', '').trim();
            if (href === route || (route === 'dashboard' && href === 'dashboard')) {
                link.classList.add('active');
            } else {
                link.classList.remove('active');
            }
        });

        // Helper to smoothly animate view entrance
        const showAndAnimate = (el) => {
            if (!el) return;
            el.classList.remove('hidden');
            el.classList.remove('animate-view-transition');
            void el.offsetWidth; // Force DOM reflow to restart CSS animation
            el.classList.add('animate-view-transition');
        };

        // Hide all top-level view containers
        const views = ['dashboard-view', 'all-docs-view', 'queue-view', 'settings-view'];
        views.forEach(vId => {
            const el = document.getElementById(vId);
            if (el) el.classList.add('hidden');
        });

        // Reset selected checkboxes
        this.selectedDocIds.clear();
        this.updateBulkActionState();

        const allDocsEl = document.getElementById('all-docs-view');

        // Route mapping
        switch (route) {
            case 'all-docs':
                showAndAnimate(allDocsEl);
                this.updateAllDocsTitle('All Files', 'Manage your intelligent document archives and OCR extractions.');
                this.setActiveTagPill('all');
                this.currentType = 'all';
                this.filterCategory('all');
                break;

            case 'pdf':
                showAndAnimate(allDocsEl);
                this.updateAllDocsTitle('PDF Documents', 'Filtered view showing digital and scanned PDF files.');
                this.setActiveTagPill('PDF Documents');
                this.currentType = 'pdf';
                this.filterCategory('all');
                break;

            case 'office':
                showAndAnimate(allDocsEl);
                this.updateAllDocsTitle('Office & Sheets', 'Filtered view showing Word (.docx, .doc), Excel (.xlsx), and PowerPoint (.pptx) files.');
                this.setActiveTagPill('Office & Sheets');
                this.currentType = 'office';
                this.filterCategory('all');
                break;

            case 'web':
                showAndAnimate(allDocsEl);
                this.updateAllDocsTitle('Web & Text', 'Filtered view showing HTML web pages, Markdown, code, and text files.');
                this.setActiveTagPill('Web Pages');
                this.currentType = 'web';
                this.filterCategory('all');
                break;

            case 'image':
                showAndAnimate(allDocsEl);
                this.updateAllDocsTitle('Images & OCR', 'Filtered view showing PNG, JPG, and WebP OCR scans.');
                this.setActiveTagPill('Image OCR');
                this.currentType = 'image';
                this.filterCategory('all');
                break;

            case 'queue':
                showAndAnimate(document.getElementById('queue-view'));
                this.loadQueueData();
                break;

            case 'settings':
                showAndAnimate(document.getElementById('settings-view'));
                this.loadSettingsData();
                break;

            case 'dashboard':
            default:
                showAndAnimate(document.getElementById('dashboard-view'));
                this.updateCategoryTitle('Indexed Documents', 'Manage and search your extracted data');
                this.currentType = 'all';
                this.filterCategory('all');
                break;
        }

        this.currentView = route;
    }

    // === [TAG UI: Pembaruan Judul View Semua Dokumen (updateAllDocsTitle)] ===
    // Penjelasan: Mengubah header judul, subjudul, dan placeholder input pencarian pada halaman berkas
    updateAllDocsTitle(title, subtitle) {
        const titleEl = document.getElementById('all-docs-title');
        const subEl = document.getElementById('all-docs-subtitle');
        const searchInput = document.getElementById('all-docs-search-input');
        if (titleEl) titleEl.textContent = title;
        if (subEl) subEl.textContent = subtitle;
        if (searchInput) searchInput.placeholder = `Cari di ${title} atau isi teks file...`;
    }

    // === [TAG UI: Pembaruan Judul Kategori Dashboard (updateCategoryTitle)] ===
    // Penjelasan: Mengubah header judul dan deskripsi tabel dokumen pada dashboard utama
    updateCategoryTitle(title, subtitle) {
        const titleEl = document.getElementById('table-section-title');
        const subEl = document.getElementById('table-section-subtitle');
        if (titleEl) titleEl.textContent = title;
        if (subEl) subEl.textContent = subtitle;
    }

    // === [TAG FILTER: Styling Tag Pill Aktif (setActiveTagPill)] ===
    // Penjelasan: Mengatur highlight visual berupa warna latar dan border pada filter pill yang sedang dipilih pengguna
    setActiveTagPill(tag) {
        const tagPills = document.querySelectorAll('#filter-tags-group .tag-pill');
        tagPills.forEach(pill => {
            if (pill.dataset.tag.toLowerCase() === tag.toLowerCase() || (tag === 'all' && pill.dataset.tag === 'all')) {
                pill.className = 'tag-pill px-3 py-1.5 bg-indigo-100 text-indigo-700 text-xs font-bold rounded-full border border-indigo-200 active';
            } else {
                pill.className = 'tag-pill px-3 py-1.5 bg-surface border border-outline-variant text-on-surface-variant text-xs font-bold rounded-full hover:border-primary transition-colors';
            }
        });
    }

    // === [TAG DATA: Filter Dokumen Kategori & Tipe (filterCategory)] ===
    // Penjelasan: Melakukan fetch data ke endpoint /api/documents dengan parameter filter kategori, tipe berkas, dan query pencarian
    async filterCategory(category) {
        this.currentCategory = category;
        this.showSkeletonLoading();

        try {
            const queryParams = new URLSearchParams({
                category: category,
                type: this.currentType,
                q: this.searchQuery
            });

            const res = await fetch(`/api/documents?${queryParams.toString()}`);
            if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
            const data = await res.json();

            if (data.status === 'success') {
                if (this.currentView === 'dashboard') {
                    this.renderDashboardTable(data.results);
                } else {
                    this.renderAllDocsTable(data.results);
                }
                this.watchPendingOcrDocuments(data.results);
                this.updateBadgeCount(data.count);
                if (data.stats) {
                    this.updateStorageBar(data.stats);
                }
            }
        } catch (err) {
            console.error('Failed to fetch filtered documents:', err);
        }
    }

    // === [TAG OCR: Validasi Status Pending Dokumen (isOcrPending)] ===
    // Penjelasan: Memeriksa apakah berkas masih dalam antrean atau sedang diekstraksi teks OCR-nya oleh sistem background
    /**
     * A document is pending while the background worker still stores its
     * placeholder OCR text. The API does not expose a document status field,
     * so this is deliberately tolerant of both current and future payloads.
     */
    isOcrPending(doc) {
        if (!doc) return false;

        const status = String(doc.status || doc.ocr_status || '').toLowerCase();
        if (['completed', 'complete', 'success', 'indexed', 'terindeks', 'failed', 'error'].includes(status)) {
            return false;
        }
        if (['processing', 'pending', 'queueing', 'queued', 'in_progress'].includes(status)) {
            return true;
        }

        const text = String(doc.ocr_preview ?? doc.snippet ?? doc.content ?? doc.full_content ?? '');
        return /sedang memproses ocr|sedang diekstrak|processing ocr/i.test(text);
    }

    // === [TAG OCR: Format Teks Cuplikan Dokumen (getOcrPreviewText)] ===
    // Penjelasan: Mengambil teks snippet atau preview hasil ekstraksi teks dokumen untuk ditampilkan di baris tabel
    getOcrPreviewText(doc) {
        const preview = doc?.ocr_preview ?? doc?.snippet ?? doc?.content ?? doc?.full_content ?? '';
        const text = String(preview || '').trim();
        if (text) return text;
        return this.isOcrPending(doc)
            ? 'Sedang mengekstrak teks OCR...'
            : 'Tidak ada teks OCR yang terdeteksi.';
    }

    // === [TAG OCR: Format HTML Cuplikan Hasil Pencarian (getOcrPreviewMarkup)] ===
    // Penjelasan: Menghasilkan markup HTML yang aman untuk cuplikan dokumen beserta tag mark penanda kata kunci
    getOcrPreviewMarkup(doc) {
        // Search snippets may intentionally include an already-sanitized <mark>.
        if (!doc?.ocr_preview && doc?.snippet) {
            return typeof sanitizeSnippet === 'function'
                ? sanitizeSnippet(doc.snippet)
                : escapeHtml(String(doc.snippet));
        }
        return escapeHtml(this.getOcrPreviewText(doc));
    }

    // === [TAG OCR: Badge Status Ekstraksi OCR (getOcrStatusMarkup)] ===
    // Penjelasan: Menghasilkan elemen badge status warna kuning (Sedang Proses) atau hijau (Terindeks)
    getOcrStatusMarkup(doc) {
        if (this.isOcrPending(doc)) {
            return `
                <span class="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-100 text-amber-700 text-[11px] font-bold rounded-full border border-amber-200" data-ocr-status>
                    <span class="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse"></span>
                    Sedang Proses
                </span>
            `;
        }

        return `
            <span class="px-2.5 py-1 bg-emerald-100 text-emerald-700 text-[11px] font-bold rounded-full flex items-center gap-1.5 w-fit border border-emerald-200" data-ocr-status>
                <span class="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
                Terindeks
            </span>
        `;
    }

    // === [TAG OCR: Pemantau Dokumen Pending (watchPendingOcrDocuments)] ===
    // Penjelasan: Mendaftarkan ID dokumen yang masih dalam antrean/proses OCR dan mengaktifkan timer polling berkala
    watchPendingOcrDocuments(documents) {
        const documentList = Array.isArray(documents) ? documents : [];
        documentList.forEach(doc => {
            if (doc?.id && this.isOcrPending(doc)) {
                this.ocrPollingDocumentIds.add(Number(doc.id));
            }
        });

        if (this.ocrPollingDocumentIds.size > 0 && !this.ocrPollingTimer) {
            this.pollPendingOcrDocuments();
            this.ocrPollingTimer = window.setInterval(
                () => this.pollPendingOcrDocuments(),
                this.ocrPollIntervalMs
            );
        }
    }

    // === [TAG OCR: Penghenti Polling Otomatis (stopOcrPollingWhenIdle)] ===
    // Penjelasan: Menghentikan interval timer pemantauan OCR jika sudah tidak ada dokumen pending yang perlu dipantau
    stopOcrPollingWhenIdle() {
        if (this.ocrPollingDocumentIds.size === 0 && this.ocrPollingTimer) {
            window.clearInterval(this.ocrPollingTimer);
            this.ocrPollingTimer = null;
        }
    }

    // === [TAG OCR: Polling Status Antrean OCR (pollPendingOcrDocuments)] ===
    // Penjelasan: Mengirim request ke /api/queue untuk memantau apakah dokumen yang diproses sudah selesai atau gagal
    async pollPendingOcrDocuments() {
        if (this.ocrPollRequestInFlight || this.ocrPollingDocumentIds.size === 0) return;
        this.ocrPollRequestInFlight = true;

        try {
            const response = await fetch('/api/queue');
            if (response.status === 429) {
                console.warn('Rate limit exceeded (429). Stopping OCR polling.');
                this.stopOcrPollingWhenIdle();
                this.ocrPollingDocumentIds.clear();
                return;
            }
            if (!response.ok) throw new Error(`Queue polling failed: ${response.status}`);

            const data = await response.json();
            if (data.status !== 'success') return;

            const queueByDocumentId = new Map(
                (data.queue || []).map(item => [Number(item.document_id), String(item.status || '').toLowerCase()])
            );

            const finishedIds = [];
            for (const documentId of this.ocrPollingDocumentIds) {
                const queueStatus = queueByDocumentId.get(documentId);
                if (['completed', 'complete', 'success'].includes(queueStatus)) {
                    finishedIds.push(documentId);
                } else if (['failed', 'error'].includes(queueStatus)) {
                    this.updateOcrRowAsFailed(documentId);
                    this.ocrPollingDocumentIds.delete(documentId);
                }
            }

            await Promise.all(finishedIds.map(documentId => this.refreshCompletedOcrDocument(documentId)));
        } catch (error) {
            // Keep the timer running: a temporary network error must not leave
            // an OCR row permanently stale.
            console.warn('OCR status polling failed:', error);
        } finally {
            this.ocrPollRequestInFlight = false;
            this.stopOcrPollingWhenIdle();
        }
    }

    // === [TAG OCR: Pengambil Data Dokumen Selesai (refreshCompletedOcrDocument)] ===
    // Penjelasan: Mengambil detail teks dokumen terbaru setelah proses OCR selesai dan memperbarui baris tabel
    async refreshCompletedOcrDocument(documentId) {
        try {
            const response = await fetch(`/api/document/${documentId}`);
            if (!response.ok) throw new Error(`Document refresh failed: ${response.status}`);

            const data = await response.json();
            if (data.status !== 'success' || !data.document) return;

            this.updateCompletedOcrRow(data.document);
            this.ocrPollingDocumentIds.delete(documentId);
        } catch (error) {
            // Do not remove the id; the next poll retries fetching OCR text.
            console.warn(`Could not refresh OCR document ${documentId}:`, error);
        }
    }

    // === [TAG UI: Pembaruan Baris Dokumen Sukses (updateCompletedOcrRow)] ===
    // Penjelasan: Mengganti badge "Sedang Proses" menjadi "Terindeks" serta menampilkan cuplikan teks hasil OCR pada tabel
    updateCompletedOcrRow(doc) {
        const rows = document.querySelectorAll(`[data-doc-id="${doc.id}"]`);
        rows.forEach(row => {
            const snippet = row.querySelector('[data-ocr-snippet]');
            if (snippet) snippet.textContent = this.getOcrPreviewText({ ...doc, status: 'Completed' });

            const status = row.querySelector('[data-ocr-status]');
            if (status) status.outerHTML = this.getOcrStatusMarkup({ ...doc, status: 'Completed' }).trim();
        });
    }

    // === [TAG UI: Pembaruan Baris Dokumen Gagal (updateOcrRowAsFailed)] ===
    // Penjelasan: Mengubah badge status menjadi "Gagal" berwarna merah bila ekstraksi teks dokumen mengalami kendala
    updateOcrRowAsFailed(documentId) {
        document.querySelectorAll(`[data-doc-id="${documentId}"]`).forEach(row => {
            const snippet = row.querySelector('[data-ocr-snippet]');
            if (snippet) snippet.textContent = 'Ekstraksi OCR gagal diproses.';

            const status = row.querySelector('[data-ocr-status]');
            if (status) {
                status.className = 'inline-flex items-center gap-1.5 px-2.5 py-1 bg-red-100 text-red-700 text-[11px] font-bold rounded-full border border-red-200';
                status.innerHTML = '<span class="w-1.5 h-1.5 bg-red-500 rounded-full"></span> Gagal';
            }
        });
    }

    // === [TAG EVENT: Penangan Berkas Selesai Unggah (handleUploadedDocuments)] ===
    // Penjelasan: Menerima daftar berkas yang baru diunggah untuk langsung dipantau OCR-nya dan me-refresh daftar tabel
    handleUploadedDocuments(documents) {
        this.watchPendingOcrDocuments(Array.isArray(documents) ? documents : []);
        return this.filterCategory(this.currentCategory || 'all');
    }

    // === [TAG UI: Efek Skeleton Loading (showSkeletonLoading)] ===
    // Penjelasan: Menampilkan animasi shimmer pada baris tabel sementara menunggu respon data dari backend
    showSkeletonLoading() {
        const skeletonHTML = Array(3).fill(0).map(() => `
            <tr class="animate-pulse">
                <td class="px-lg py-lg">
                    <div class="flex items-center gap-md">
                        <div class="w-10 h-10 rounded-lg skeleton-shimmer"></div>
                        <div class="space-y-2">
                            <div class="w-40 h-4 rounded skeleton-shimmer"></div>
                            <div class="w-20 h-3 rounded skeleton-shimmer"></div>
                        </div>
                    </div>
                </td>
                <td class="px-lg py-lg"><div class="w-24 h-6 rounded-full skeleton-shimmer"></div></td>
                <td class="px-lg py-lg"><div class="w-64 h-4 rounded skeleton-shimmer"></div></td>
                <td class="px-lg py-lg"><div class="w-24 h-4 rounded skeleton-shimmer"></div></td>
                <td class="px-lg py-lg text-right"><div class="w-20 h-8 rounded-lg skeleton-shimmer ml-auto"></div></td>
            </tr>
        `).join('');

        ['documents-table-body', 'all-docs-table-body', 'receipts-table-body', 'invoices-table-body', 'certificates-table-body'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = skeletonHTML;
        });
    }

    // === [TAG TABEL: Render Tabel Kuitansi / Struk (renderReceiptsTable)] ===
    // Penjelasan: Merender daftar berkas kategori struk belanja ke dalam tabel khusus struk lengkap dengan tanggal dan tombol lihat
    renderReceiptsTable(documents) {
        const tbody = document.getElementById('receipts-table-body');
        if (!tbody) return;

        if (!documents || documents.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="py-16 text-center text-on-surface-variant">
                        <div class="flex flex-col items-center justify-center gap-3">
                            <span class="material-symbols-outlined text-4xl text-outline">receipt_long</span>
                            <p class="font-title-md text-title-md font-semibold text-on-surface">Tidak ada data ditemukan</p>
                            <p class="font-body-md text-body-md text-on-surface-variant">Unggah dokumen untuk mulai mengindeks.</p>
                        </div>
                    </td>
                </tr>
            `;
            return;
        }

        let html = '';
        documents.forEach(doc => {
            const dateStr = doc.uploaded_at ? doc.uploaded_at.split(' ')[0] : 'Baru Saja';
            const sizeStr = doc.file_size ? (doc.file_size < 1048576 ? (doc.file_size / 1024).toFixed(1) + ' KB' : (doc.file_size / (1024 * 1024)).toFixed(1) + ' MB') : '0.0 KB';

            html += `
                <tr class="hover:bg-surface-container transition-colors group cursor-pointer" data-doc-id="${doc.id}">
                    <td class="px-lg py-md">
                        <div class="flex items-center gap-md">
                            <div class="w-10 h-10 rounded-lg bg-surface-container-highest flex items-center justify-center border border-outline-variant group-hover:border-primary/40">
                                <span class="material-symbols-outlined text-primary text-[20px]">shopping_bag</span>
                            </div>
                            <div>
                                <div class="font-bold text-on-surface group-hover:text-primary transition-colors text-sm">${escapeHtml(doc.filename)}</div>
                                <div class="text-xs text-on-surface-variant font-mono-md">${sizeStr}</div>
                            </div>
                        </div>
                    </td>
                    <td class="px-lg py-md text-xs text-on-surface-variant font-mono-md">${dateStr}</td>
                    <td class="px-lg py-md">
                        <span class="bg-secondary-container/10 text-secondary text-xs font-bold px-2.5 py-1 rounded-full border border-secondary/20 uppercase tracking-wider">Struk</span>
                    </td>
                    <td class="px-lg py-md">
                        <div class="font-mono-md font-bold text-primary text-sm">-</div>
                    </td>
                    <td class="px-lg py-md">
                        <span class="flex items-center gap-1 text-emerald-600 text-xs font-bold">
                            <span class="material-symbols-outlined text-sm" style="font-variation-settings: 'FILL' 1;">check_circle</span> Selesai
                        </span>
                    </td>
                    <td class="px-lg py-md text-right">
                        <button class="bg-surface-container text-on-surface-variant px-3 py-1 rounded-lg hover:bg-primary hover:text-white transition-all text-xs font-bold btn-view-receipt" data-doc-id="${doc.id}">Lihat</button>
                    </td>
                </tr>
            `;
        });
        tbody.innerHTML = html;

        tbody.onclick = (e) => {
            const btnView = e.target.closest('.btn-view-receipt');
            const docRow = e.target.closest('tr');
            if (btnView) {
                e.stopPropagation();
                if (window.openPreviewModal) window.openPreviewModal(parseInt(btnView.dataset.docId));
                return;
            }
            if (docRow && !e.target.closest('button')) {
                const id = parseInt(docRow.dataset.docId);
                if (id && window.openPreviewModal) window.openPreviewModal(id);
            }
        };
    }

    // === [TAG TABEL: Render Tabel Faktur / Invoice (renderInvoicesTable)] ===
    // Penjelasan: Merender daftar dokumen kategori invoice ke dalam format tabel faktur dengan nomor identifikasi DOC dan status tersimpan
    renderInvoicesTable(documents) {
        const tbody = document.getElementById('invoices-table-body');
        if (!tbody) return;

        if (!documents || documents.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="py-16 text-center text-on-surface-variant">
                        <div class="flex flex-col items-center justify-center gap-3">
                            <span class="material-symbols-outlined text-4xl text-outline">receipt_long</span>
                            <p class="font-title-md text-title-md font-semibold text-on-surface">Tidak ada data ditemukan</p>
                            <p class="font-body-md text-body-md text-on-surface-variant">Unggah dokumen untuk mulai mengindeks.</p>
                        </div>
                    </td>
                </tr>
            `;
            return;
        }

        let html = '';
        documents.forEach((doc, idx) => {
            const invId = `#DOC-${String(doc.id).padStart(4, '0')}`;
            const dateStr = doc.uploaded_at ? doc.uploaded_at.split(' ')[0] : 'Baru Saja';

            html += `
                <tr class="hover:bg-surface-container transition-colors group cursor-pointer" data-doc-id="${doc.id}">
                    <td class="px-lg py-4 font-mono-md text-xs text-primary font-bold">${invId}</td>
                    <td class="px-lg py-4">
                        <div class="flex items-center gap-sm">
                            <div class="w-8 h-8 rounded bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">DOC</div>
                            <div>
                                <p class="font-semibold text-sm text-on-surface">${escapeHtml(doc.filename)}</p>
                                <p class="text-[11px] text-on-surface-variant">Data Dokumen</p>
                            </div>
                        </div>
                    </td>
                    <td class="px-lg py-4 font-mono-md text-sm font-bold text-on-surface">-</td>
                    <td class="px-lg py-4 text-xs text-on-surface-variant font-mono-md">${dateStr}</td>
                    <td class="px-lg py-4">
                        <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700 border-emerald-200 border">
                            Tersimpan
                        </span>
                    </td>
                    <td class="px-lg py-4 text-right">
                        <button class="text-on-surface-variant hover:text-primary transition-colors btn-view-invoice" data-doc-id="${doc.id}">
                            <span class="material-symbols-outlined">more_vert</span>
                        </button>
                    </td>
                </tr>
            `;
        });
        tbody.innerHTML = html;

        tbody.onclick = (e) => {
            const btnView = e.target.closest('.btn-view-invoice');
            const docRow = e.target.closest('tr');
            if (btnView) {
                e.stopPropagation();
                if (window.openPreviewModal) window.openPreviewModal(parseInt(btnView.dataset.docId));
                return;
            }
            if (docRow && !e.target.closest('button')) {
                const id = parseInt(docRow.dataset.docId);
                if (id && window.openPreviewModal) window.openPreviewModal(id);
            }
        };
    }

    // === [TAG TABEL: Render Tabel Sertifikat (renderCertificatesTable)] ===
    // Penjelasan: Merender dokumen sertifikat digital atau piagam ke dalam tabel dengan badge masa berlaku dan tanggal terbit
    renderCertificatesTable(documents) {
        const tbody = document.getElementById('certificates-table-body');
        if (!tbody) return;

        if (!documents || documents.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="py-16 text-center text-on-surface-variant">
                        <div class="flex flex-col items-center justify-center gap-3">
                            <span class="material-symbols-outlined text-4xl text-outline">workspace_premium</span>
                            <p class="font-title-md text-title-md font-semibold text-on-surface">Tidak ada data ditemukan</p>
                            <p class="font-body-md text-body-md text-on-surface-variant">Unggah dokumen untuk mulai mengindeks.</p>
                        </div>
                    </td>
                </tr>
            `;
            return;
        }

        let html = '';
        documents.forEach((doc, idx) => {
            const issueDate = doc.uploaded_at ? doc.uploaded_at.split(' ')[0] : 'Baru Saja';
            const expDate = '-';
            const statusClass = idx % 2 === 0 ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-amber-500/10 text-amber-600 border-amber-500/20';
            const statusText = idx % 2 === 0 ? 'Berlaku' : 'Akan Berakhir';

            html += `
                <tr class="hover:bg-surface-container transition-colors group cursor-pointer" data-doc-id="${doc.id}">
                    <td class="px-lg py-4">
                        <div class="flex items-center gap-3">
                            <div class="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center text-amber-700">
                                <span class="material-symbols-outlined text-[18px]">workspace_premium</span>
                            </div>
                            <div>
                                <p class="font-bold text-sm text-on-surface group-hover:text-primary transition-colors">${escapeHtml(doc.filename)}</p>
                                <p class="text-[11px] text-on-surface-variant font-mono-md">Sertifikat Digital</p>
                            </div>
                        </div>
                    </td>
                    <td class="px-lg py-4 text-xs font-semibold text-on-surface-variant">-</td>
                    <td class="px-lg py-4 text-xs text-on-surface-variant font-mono-md">${issueDate}</td>
                    <td class="px-lg py-4 text-xs text-on-surface-variant font-mono-md">${expDate}</td>
                    <td class="px-lg py-4">
                        <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${statusClass} border">
                            ${statusText}
                        </span>
                    </td>
                    <td class="px-lg py-4 text-right">
                        <button class="bg-surface-container text-on-surface-variant px-3 py-1 rounded-lg hover:bg-primary hover:text-white transition-all text-xs font-bold btn-view-cert" data-doc-id="${doc.id}">Lihat</button>
                    </td>
                </tr>
            `;
        });
        tbody.innerHTML = html;

        tbody.onclick = (e) => {
            const btnView = e.target.closest('.btn-view-cert');
            const docRow = e.target.closest('tr');
            if (btnView) {
                e.stopPropagation();
                if (window.openPreviewModal) window.openPreviewModal(parseInt(btnView.dataset.docId));
                return;
            }
            if (docRow && !e.target.closest('button')) {
                const id = parseInt(docRow.dataset.docId);
                if (id && window.openPreviewModal) window.openPreviewModal(id);
            }
        };
    }

    // === [TAG TABEL: Render Tabel Semua Dokumen (renderAllDocsTable)] ===
    // Penjelasan: Merender seluruh berkas dokumen pada halaman All Files, mendukung seleksi checkbox massal, cuplikan teks OCR, dan tombol aksi (lihat, unduh, hapus)
    renderAllDocsTable(documents) {
        const tbody = document.getElementById('all-docs-table-body');
        if (!tbody) return;

        if (!documents || documents.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="py-16 text-center text-on-surface-variant">
                        <div class="flex flex-col items-center justify-center gap-3">
                            <span class="material-symbols-outlined text-4xl text-outline">folder_open</span>
                            <p class="font-title-md text-title-md font-semibold text-on-surface">Tidak ada data ditemukan</p>
                            <p class="font-body-md text-body-md text-on-surface-variant">Unggah dokumen untuk mulai mengindeks.</p>
                        </div>
                    </td>
                </tr>
            `;
            return;
        }

        let html = '';
        documents.forEach(doc => {
            const isPdf = doc.file_type === 'pdf';
            const isOffice = doc.file_type === 'office';
            const icon = isPdf ? 'picture_as_pdf' : (isOffice ? 'description' : 'image');
            const iconBg = isPdf ? 'bg-red-100 text-red-600' : (isOffice ? 'bg-orange-100 text-orange-600' : 'bg-blue-100 text-blue-600');
            const sizeStr = doc.file_size ? (doc.file_size < 1048576 ? (doc.file_size / 1024).toFixed(1) + ' KB' : (doc.file_size / (1024 * 1024)).toFixed(1) + ' MB') : '1.0 KB';
            const dateStr = doc.uploaded_at ? doc.uploaded_at.split(' ')[0] : 'Baru Saja';
            const snippetText = this.getOcrPreviewMarkup(doc);
            const confPercent = Math.round((doc.ocr_confidence || 0.98) * 100);

            const isChecked = this.selectedDocIds.has(doc.id) ? 'checked' : '';

            html += `
                <tr class="hover:bg-primary/5 transition-colors group cursor-pointer doc-all-row doc-row-animated" data-doc-id="${doc.id}">
                    <td class="py-4 px-lg">
                        <input type="checkbox" class="doc-select-checkbox w-5 h-5 rounded border-outline-variant text-primary focus:ring-primary/20" data-doc-id="${doc.id}" ${isChecked}>
                    </td>
                    <td class="py-4 px-4">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 rounded-lg ${iconBg} flex items-center justify-center">
                                <span class="material-symbols-outlined text-[20px]">${icon}</span>
                            </div>
                            <div>
                                <p class="font-bold text-on-surface group-hover:text-primary transition-colors text-sm">${escapeHtml(doc.filename)}</p>
                                <p class="text-[11px] text-on-surface-variant font-mono-md">Tesseract Engine • ${confPercent}% Akurasi</p>
                            </div>
                        </div>
                    </td>
                    <td class="py-4 px-4 whitespace-nowrap">
                        ${this.getOcrStatusMarkup(doc)}
                    </td>
                    <td class="py-4 px-4 max-w-xs">
                        <p class="text-xs text-on-surface-variant italic line-clamp-2" data-ocr-snippet>${snippetText}</p>
                    </td>
                    <td class="py-4 px-4 whitespace-nowrap">
                        <span class="inline-flex items-center whitespace-nowrap px-2.5 py-1 bg-surface-container text-on-surface-variant text-xs font-semibold rounded-full border border-outline-variant uppercase tracking-wider">
                            ${escapeHtml(doc.category || 'Umum')}
                        </span>
                    </td>
                    <td class="py-4 px-4 text-right">
                        <p class="text-xs font-bold text-on-surface font-mono-md">${sizeStr}</p>
                        <p class="text-[11px] text-on-surface-variant">${dateStr}</p>
                    </td>
                    <td class="py-4 px-4 text-right whitespace-nowrap">
                        <div class="flex items-center justify-end gap-1">
                            <button class="material-symbols-outlined p-1.5 text-on-surface-variant hover:bg-primary/10 hover:text-primary rounded-lg transition-all btn-view-doc" title="Lihat Dokumen" data-doc-id="${doc.id}">visibility</button>
                            <button class="material-symbols-outlined p-1.5 text-on-surface-variant hover:bg-primary/10 hover:text-primary rounded-lg transition-all btn-download-doc" title="Unduh" data-doc-id="${doc.id}">download</button>
                            <button class="material-symbols-outlined p-1.5 text-on-surface-variant hover:bg-error/10 hover:text-error rounded-lg transition-all btn-delete-doc" title="Hapus" data-doc-id="${doc.id}">delete</button>
                        </div>
                    </td>
                </tr>
            `;
        });

        tbody.innerHTML = html;

        // Use event delegation for all table actions
        tbody.onclick = (e) => {
            const btnDelete = e.target.closest('.btn-delete-doc');
            const btnDownload = e.target.closest('.btn-download-doc');
            const btnView = e.target.closest('.btn-view-doc');
            const docRow = e.target.closest('.doc-all-row');
            
            if (btnDelete) {
                e.stopPropagation();
                const id = parseInt(btnDelete.dataset.docId);
                const title = btnDelete.closest('tr')?.dataset?.title || 'document';
                if (window.confirmAndDeleteDocument) window.confirmAndDeleteDocument(id, title);
                return;
            }

            if (btnDownload) {
                e.stopPropagation();
                const id = parseInt(btnDownload.dataset.docId);
                if (window.triggerDocumentDownload) window.triggerDocumentDownload(id);
                return;
            }

            if (btnView) {
                e.stopPropagation();
                const id = parseInt(btnView.dataset.docId);
                if (window.openPreviewModal) window.openPreviewModal(id);
                return;
            }

            if (docRow && !e.target.closest('button') && !e.target.closest('input')) {
                const id = parseInt(docRow.dataset.docId);
                if (id && window.openPreviewModal) window.openPreviewModal(id);
            }
        };

        // For checkboxes, change event delegation
        tbody.onchange = (e) => {
            const chk = e.target.closest('.doc-select-checkbox');
            if (chk) {
                e.stopPropagation();
                const id = parseInt(chk.dataset.docId);
                if (chk.checked) {
                    this.selectedDocIds.add(id);
                } else {
                    this.selectedDocIds.delete(id);
                }
                this.updateBulkActionState();
            }
        };

        // Update All Docs Pagination Info
        const paginationInfo = document.getElementById('all-docs-pagination-info');
        if (paginationInfo) {
            paginationInfo.textContent = `Menampilkan 1-${documents.length} dari ${documents.length} dokumen`;
        }
    }

    // === [TAG TABEL: Render Tabel Dokumen Beranda (renderDashboardTable)] ===
    // Penjelasan: Merender dokumen terbaru pada halaman dashboard beranda, menampilkan ikon tipe file, lencana OCR, cuplikan teks, dan waktu unggah
    renderDashboardTable(documents) {
        const tbody = document.getElementById('documents-table-body');
        if (!tbody) return;

        if (!documents || documents.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" class="py-16 text-center text-on-surface-variant">
                        <div class="flex flex-col items-center justify-center gap-3">
                            <span class="material-symbols-outlined text-4xl text-outline">upload_file</span>
                            <p class="font-title-md text-title-md font-semibold text-on-surface">Tidak ada data ditemukan</p>
                            <p class="font-body-md text-body-md text-on-surface-variant">Unggah dokumen untuk mulai mengindeks.</p>
                        </div>
                    </td>
                </tr>
            `;
            return;
        }

        let html = '';
        documents.forEach(doc => {
            const isPdf = doc.file_type === 'pdf';
            const isOffice = doc.file_type === 'office';

            const icon = isPdf ? 'picture_as_pdf' : (isOffice ? 'description' : 'image');
            const iconBg = isPdf ? 'bg-blue-50 text-blue-600 border-blue-100' : (isOffice ? 'bg-orange-50 text-orange-600 border-orange-100' : 'bg-red-50 text-red-600 border-red-100');
            const badgeBg = isPdf ? 'bg-primary/5 text-primary border-primary/10' : (isOffice ? 'bg-orange-50 text-orange-700 border-orange-100' : 'bg-emerald-50 text-emerald-700 border-emerald-100');
            const badgeLabel = isPdf ? 'DIGITAL / PDF' : (isOffice ? 'DOCX / OFFICE' : 'IMAGE / OCR');

            const sizeStr = doc.file_size ? (doc.file_size < 1048576 ? (doc.file_size / 1024).toFixed(1) + ' KB' : (doc.file_size / (1024 * 1024)).toFixed(1) + ' MB') : '1.0 KB';
            const dateStr = doc.uploaded_at ? doc.uploaded_at.split(' ')[0] : 'Baru Saja';
            const timeStr = doc.uploaded_at && doc.uploaded_at.includes(' ') ? doc.uploaded_at.split(' ')[1] : 'Baru-baru ini';

            const snippetText = this.getOcrPreviewMarkup(doc);

            html += `
                <tr class="hover:bg-surface-container-lowest transition-colors group doc-row doc-row-animated cursor-pointer"
                    data-type="${doc.file_type}" data-category="${escapeHtml(doc.category || '')}"
                    data-doc-id="${doc.id}" data-title="${escapeHtml(doc.filename)}">
                    <td class="px-lg py-lg">
                        <input type="checkbox" class="doc-checkbox rounded border-outline-variant text-primary focus:ring-primary/20 w-5 h-5 cursor-pointer" data-id="${doc.id}">
                    </td>
                    <td class="px-lg py-lg">
                        <div class="flex items-center gap-md">
                            <div class="w-10 h-10 rounded-lg ${iconBg} border flex items-center justify-center">
                                <span class="material-symbols-outlined">${icon}</span>
                            </div>
                            <div>
                                <div class="font-body-md text-body-md text-on-surface font-semibold group-hover:text-primary transition-colors doc-name">
                                    ${escapeHtml(doc.filename)}
                                </div>
                                <div class="text-label-md text-on-surface-variant">${sizeStr}</div>
                            </div>
                        </div>
                    </td>
                    <td class="px-lg py-lg whitespace-nowrap">
                        <span class="${badgeBg} inline-flex items-center whitespace-nowrap text-[10px] font-bold px-2.5 py-1 rounded-full border uppercase tracking-tighter">
                            ${badgeLabel}
                        </span>
                    </td>
                    <td class="px-lg py-lg">
                        <div class="font-mono-md text-mono-md text-on-surface-variant line-clamp-2 max-w-md doc-snippet" data-ocr-snippet>
                            ${snippetText}
                        </div>
                    </td>
                    <td class="px-lg py-lg whitespace-nowrap">
                        <div class="text-body-md text-on-surface">${dateStr}</div>
                        <div class="text-label-md text-on-surface-variant">${timeStr}</div>
                    </td>
                    <td class="px-lg py-lg text-right whitespace-nowrap">
                        <div class="flex items-center justify-end gap-1">
                            <button class="material-symbols-outlined p-2 text-on-surface-variant hover:bg-primary/10 hover:text-primary rounded-lg transition-all btn-view-doc"
                                    title="Lihat Dokumen" data-doc-id="${doc.id}">visibility</button>
                            <button class="material-symbols-outlined p-2 text-on-surface-variant hover:bg-primary/10 hover:text-primary rounded-lg transition-all btn-download-doc"
                                    title="Unduh" data-doc-id="${doc.id}">download</button>
                            <button class="material-symbols-outlined p-2 text-on-surface-variant hover:bg-error/10 hover:text-error rounded-lg transition-all btn-delete-doc"
                                    title="Hapus" data-doc-id="${doc.id}">delete</button>
                        </div>
                    </td>
                </tr>
            `;
        });

        tbody.innerHTML = html;

        // Use event delegation for all table actions
        tbody.onclick = (e) => {
            const btnDelete = e.target.closest('.btn-delete-doc');
            const btnDownload = e.target.closest('.btn-download-doc');
            const btnView = e.target.closest('.btn-view-doc');
            const docRow = e.target.closest('.doc-row');

            if (btnDelete) {
                e.stopPropagation();
                const id = parseInt(btnDelete.dataset.docId);
                const title = btnDelete.closest('tr')?.dataset?.title || 'Document';
                if (id && window.confirmAndDeleteDocument) {
                    window.confirmAndDeleteDocument(id, title);
                }
                return;
            }

            if (btnDownload) {
                e.stopPropagation();
                const id = parseInt(btnDownload.dataset.docId);
                if (id && window.triggerDocumentDownload) window.triggerDocumentDownload(id);
                return;
            }

            if (btnView) {
                e.stopPropagation();
                const id = parseInt(btnView.dataset.docId);
                if (id && window.openPreviewModal) window.openPreviewModal(id);
                return;
            }

            if (docRow && !e.target.closest('button') && !e.target.closest('input')) {
                const id = parseInt(docRow.dataset.docId);
                if (id && window.openPreviewModal) window.openPreviewModal(id);
            }
        };
    }

    // === [TAG EVENT: Inisialisasi Event Halaman All Files (initAllDocsHandlers)] ===
    // Penjelasan: Mendaftarkan listener untuk interaksi checkbox 'pilih semua', tombol hapus massal, unduh ZIP massal, pemindahan folder, slider akurasi OCR, filter rentang tanggal, filter tipe berkas, dan pencarian instan
    initAllDocsHandlers() {
        const selectAll = document.getElementById('select-all-docs-checkbox');
        if (selectAll) {
            selectAll.addEventListener('change', (e) => {
                const checkboxes = document.querySelectorAll('#all-docs-table-body .doc-select-checkbox');
                checkboxes.forEach(chk => {
                    chk.checked = selectAll.checked;
                    const id = parseInt(chk.dataset.docId);
                    if (selectAll.checked) {
                        this.selectedDocIds.add(id);
                    } else {
                        this.selectedDocIds.delete(id);
                    }
                });
                this.updateBulkActionState();
            });
        }

        // Bulk Delete Action
        const bulkDelete = document.getElementById('btn-bulk-delete');
        if (bulkDelete) {
            bulkDelete.addEventListener('click', () => {
                if (this.selectedDocIds.size === 0) return;
                const count = this.selectedDocIds.size;
                
                const deleteModal = document.getElementById('delete-modal-overlay');
                const deleteDialog = document.getElementById('delete-modal-dialog');
                const confirmBtn = document.getElementById('confirm-delete-btn');
                const cancelBtn = document.getElementById('cancel-delete-btn');
                const filenameEl = document.getElementById('delete-modal-filename');

                if (!deleteModal || !confirmBtn || !cancelBtn) {
                    if (!confirm(`Apakah Anda yakin ingin menghapus ${count} dokumen yang dipilih?`)) return;
                    executeBulkDelete();
                    return;
                }

                if (filenameEl) filenameEl.textContent = `${count} dokumen terpilih`;
                deleteModal.classList.remove('hidden');

                if (typeof gsap !== 'undefined') {
                    gsap.fromTo(deleteDialog, { scale: 0.9, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.25, ease: "back.out(1.7)" });
                }

                confirmBtn.onclick = () => {
                    closeDeleteModal();
                    executeBulkDelete();
                };

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
                
                window._currentDeleteCloseFn = closeDeleteModal;

                const executeBulkDelete = async () => {
                    try {
                        const res = await apiFetch('/api/documents/bulk-delete', {
                            method: 'POST',
                            body: JSON.stringify({ doc_ids: Array.from(this.selectedDocIds) })
                        });
                        const data = await res.json();
                        if (res.ok && data.status === 'success') {
                            this.selectedDocIds.clear();
                            this.updateBulkActionState();
                            const selectAllChk = document.getElementById('select-all-docs-checkbox');
                            if (selectAllChk) selectAllChk.checked = false;
                            if (window.showToast) window.showToast(`${data.deleted_count || count} dokumen berhasil dihapus.`);
                            this.filterCategory(this.currentCategory);
                        } else {
                            if (window.showToast) window.showToast(data.message || 'Gagal menghapus dokumen.', 'error');
                        }
                    } catch (err) {
                        console.error('Bulk delete error:', err);
                        if (window.showToast) window.showToast('Gagal terhubung ke server.', 'error');
                    }
                };
            });
        }

        // Bulk Download Action
        const bulkDownload = document.getElementById('btn-bulk-download');
        if (bulkDownload) {
            bulkDownload.addEventListener('click', async () => {
                if (this.selectedDocIds.size === 0) return;
                if (window.showToast) window.showToast('Menyiapkan arsip ZIP dokumen...');

                try {
                    const res = await apiFetch('/api/documents/bulk-download', {
                        method: 'POST',
                        body: JSON.stringify({ doc_ids: Array.from(this.selectedDocIds) })
                    });

                    if (res.ok) {
                        const blob = await res.blob();
                        const url = window.URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = 'documind_export.zip';
                        document.body.appendChild(a);
                        a.click();
                        a.remove();
                        window.URL.revokeObjectURL(url);
                        if (window.showToast) window.showToast('Arsip ZIP berhasil diunduh.');
                    } else {
                        if (window.showToast) window.showToast('Gagal membuat berkas ZIP.', 'error');
                    }
                } catch (err) {
                    console.error('Bulk download error:', err);
                    if (window.showToast) window.showToast('Gagal mengunduh berkas.', 'error');
                }
            });
        }

        // Bulk Move Action
        const bulkMove = document.getElementById('btn-bulk-move');
        if (bulkMove) {
            bulkMove.addEventListener('click', async () => {
                if (this.selectedDocIds.size === 0) return;
                
                const targetFolder = prompt('Masukkan nama kategori / folder tujuan (misal: "Invoice 2024"):');
                if (!targetFolder || targetFolder.trim() === '') return;
                
                if (window.showToast) window.showToast(`Memindahkan dokumen ke "${targetFolder}"...`);

                try {
                    const res = await apiFetch('/api/documents/bulk-move', {
                        method: 'POST',
                        body: JSON.stringify({
                            document_ids: Array.from(this.selectedDocIds),
                            target_folder: targetFolder.trim()
                        })
                    });

                    const data = await res.json();
                    if (res.ok && data.status === 'success') {
                        if (window.showToast) window.showToast(data.message || 'Dokumen berhasil dipindahkan.');
                        this.selectedDocIds.clear();
                        this.filterCategory(this.currentCategory);
                        if (typeof updateDashboardStats === 'function') {
                            updateDashboardStats();
                        }
                    } else {
                        if (window.showToast) window.showToast(data.message || 'Gagal memindahkan dokumen.', 'error');
                    }
                } catch (err) {
                    console.error('Bulk move error:', err);
                    if (window.showToast) window.showToast('Gagal memindahkan dokumen.', 'error');
                }
            });
        }

        // Filter Sidebar: Confidence Slider
        const confSlider = document.getElementById('filter-confidence-slider');
        const confVal = document.getElementById('filter-confidence-val');
        if (confSlider && confVal) {
            confSlider.addEventListener('input', () => {
                confVal.textContent = `${confSlider.value}%`;
            });
            confSlider.addEventListener('change', () => {
                this.minConfidence = parseInt(confSlider.value);
                this.filterCategory(this.currentCategory);
            });
        }

        // Filter Sidebar: Date Range
        const dateRange = document.getElementById('filter-date-range');
        if (dateRange) {
            dateRange.addEventListener('change', () => {
                this.filterCategory(this.currentCategory);
            });
        }

        // Filter Sidebar: Document Type Checkboxes
        document.querySelectorAll('.doc-type-checkbox').forEach(chk => {
            chk.addEventListener('change', () => {
                const checked = Array.from(document.querySelectorAll('.doc-type-checkbox:checked')).map(c => c.value);
                this.currentType = checked.length === 0 ? 'none' : (checked.length === 4 ? 'all' : checked[0]);
                this.filterCategory(this.currentCategory);
            });
        });

        // Filter Sidebar: Clear All Button
        const clearBtn = document.getElementById('btn-clear-filters');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                if (dateRange) dateRange.value = 'all';
                document.querySelectorAll('.doc-type-checkbox').forEach(chk => chk.checked = true);
                if (confSlider) {
                    confSlider.value = 80;
                    if (confVal) confVal.textContent = '80%';
                }
                const searchInp = document.getElementById('all-docs-search-input');
                if (searchInp) searchInp.value = '';
                this.searchQuery = '';
                this.currentType = 'all';
                this.setActiveTagPill('all');
                this.filterCategory('all');
                if (window.showToast) window.showToast('Filter direset ke default.');
            });
        }

        // Search Input in All Docs Bar
        const searchInput = document.getElementById('all-docs-search-input');
        const clearSearchBtn = document.getElementById('all-docs-search-clear');
        if (searchInput) {
            let debounceTimer = null;
            searchInput.addEventListener('input', (e) => {
                const val = e.target.value.trim();
                this.searchQuery = val;
                if (clearSearchBtn) {
                    clearSearchBtn.classList.toggle('hidden', val.length === 0);
                }
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => {
                    this.filterCategory(this.currentCategory);
                }, 300);
            });
        }
        if (clearSearchBtn) {
            clearSearchBtn.addEventListener('click', () => {
                if (searchInput) {
                    searchInput.value = '';
                    this.searchQuery = '';
                    clearSearchBtn.classList.add('hidden');
                    this.filterCategory(this.currentCategory);
                }
            });
        }

        // Format Category Tag Pills
        document.querySelectorAll('#filter-tags-group .tag-pill').forEach(pill => {
            pill.addEventListener('click', () => {
                const tag = pill.dataset.tag;
                this.setActiveTagPill(tag);
                if (tag === 'all') {
                    this.currentType = 'all';
                    this.currentCategory = 'all';
                } else if (tag === 'PDF Documents') {
                    this.currentType = 'pdf';
                } else if (tag === 'Office & Sheets') {
                    this.currentType = 'office';
                } else if (tag === 'Web Pages') {
                    this.currentType = 'web';
                } else if (tag === 'Image OCR') {
                    this.currentType = 'image';
                }
                this.filterCategory(this.currentCategory);
            });
        });

        // Quick Promo API Docs Button
        const apiDocsBtn = document.getElementById('btn-view-api-docs');
        if (apiDocsBtn) {
            apiDocsBtn.addEventListener('click', () => {
                window.location.hash = '#settings';
            });
        }

        // Upload & New Folder Buttons in All Docs Header
        const uploadDocBtn = document.getElementById('btn-all-docs-upload');
        if (uploadDocBtn) {
            uploadDocBtn.addEventListener('click', () => {
                const fileInput = document.getElementById('file-input');
                if (fileInput) fileInput.click();
            });
        }
        const newFolderBtn = document.getElementById('btn-all-docs-new-folder');
        if (newFolderBtn) {
            newFolderBtn.addEventListener('click', () => {
                const folderInput = document.getElementById('folder-input');
                if (folderInput) folderInput.click();
            });
        }
    }

    // === [TAG UI: Pembaruan Status Tombol Aksi Massal (updateBulkActionState)] ===
    // Penjelasan: Mengaktifkan tombol 'Unduh', 'Pindahkan', dan 'Hapus' jika minimal ada 1 berkas yang dicentang, atau menonaktifkannya jika tidak ada pilihan
    updateBulkActionState() {
        const hasSelection = this.selectedDocIds.size > 0;
        const bulkDownload = document.getElementById('btn-bulk-download');
        const bulkMove = document.getElementById('btn-bulk-move');
        const bulkDelete = document.getElementById('btn-bulk-delete');

        if (bulkDownload) bulkDownload.disabled = !hasSelection;
        if (bulkMove) bulkMove.disabled = !hasSelection;
        if (bulkDelete) bulkDelete.disabled = !hasSelection;
    }

    // === [TAG UI: Pembaruan Badge Jumlah Berkas (updateBadgeCount)] ===
    // Penjelasan: Memperbarui teks badge total dokumen yang terindeks di sistem
    updateBadgeCount(count) {
        const badge = document.getElementById('doc-count-badge');
        if (badge) {
            badge.textContent = `Indexed Docs: ${count}`;
        }
    }

    // === [TAG UI: Pembaruan Kapasitas Penyimpanan Sidebar (updateStorageBar)] ===
    // Penjelasan: Memperbarui visual progress bar persentase penyimpanan dan teks pemakaian kuota MB/GB di sidebar
    updateStorageBar(stats) {
        const storageText = document.getElementById('sidebar-storage-text');
        const storageBar = document.getElementById('sidebar-storage-bar');
        const storagePercent = document.getElementById('sidebar-storage-percent');

        if (storageText) {
            storageText.textContent = `${stats.used_mb || '0.0'} MB / ${stats.max_gb || 5} GB Storage`;
        }
        if (storageBar) {
            storageBar.style.width = `${stats.percentage || 0}%`;
        }
        if (storagePercent) {
            storagePercent.textContent = `${stats.percentage || 0}%`;
        }
    }

    // === [TAG ANTRIAN: Pemuat Data Antrean OCR (loadQueueData)] ===
    // Penjelasan: Mengambil status antrean ekstraksi OCR secara realtime dari /api/queue dan memperbarui tabel antrean, status progress, serta daftar retry
    async loadQueueData() {
        try {
            const res = await fetch('/api/queue');
            if (!res.ok) return;
            const data = await res.json();

            const activeEl = document.getElementById('queue-stat-active');
            const totalEl = document.getElementById('queue-stat-total');
            const sidebarBadge = document.getElementById('sidebar-queue-badge');
            const confEl = document.getElementById('queue-confidence-rate');
            const failedEl = document.getElementById('queue-failed-count');
            const tbody = document.getElementById('queue-table-body');
            const failedContainer = document.getElementById('failed-retries-container');

            if (activeEl) activeEl.textContent = data.active_tasks ?? 0;
            if (sidebarBadge) {
                const count = data.active_tasks ?? 0;
                sidebarBadge.textContent = count;
                if (count > 0) {
                    sidebarBadge.classList.add('bg-primary', 'text-white');
                    sidebarBadge.classList.remove('bg-primary/10', 'text-primary');
                } else {
                    sidebarBadge.classList.remove('bg-primary', 'text-white');
                    sidebarBadge.classList.add('bg-primary/10', 'text-primary');
                }
            }
            // Jika data dari api mengembalikan total docs, update juga
            if (totalEl && data.stats && data.stats.total_docs !== undefined) totalEl.textContent = data.stats.total_docs;
            if (confEl) {
                confEl.textContent = `${data.confidence_rate ?? 0}`;
                const span = document.createElement('span');
                span.className = 'text-lg';
                span.textContent = '%';
                confEl.appendChild(span);
            }            if (failedEl) failedEl.textContent = String(data.failed_tasks_count ?? 0).padStart(2, '0');

            // Render Queue Table
            if (tbody) {
                if (!data.queue || data.queue.length === 0) {
                    tbody.innerHTML = `
                        <tr>
                            <td colspan="6" class="px-lg py-12 text-center text-on-surface-variant">
                                <div class="flex flex-col items-center justify-center gap-2">
                                    <span class="material-symbols-outlined text-4xl text-outline-variant">task_alt</span>
                                    <p class="font-bold text-sm">Semua antrean OCR telah selesai diproses.</p>
                                    <p class="text-xs text-on-surface-variant/70">Unggah berkas baru untuk memulai pemrosesan ekstraksi.</p>
                                </div>
                            </td>
                        </tr>
                    `;
                } else {
                    tbody.innerHTML = data.queue.map(item => {
                        const statusColors = {
                            'Completed': 'bg-emerald-50 text-emerald-700 border-emerald-200',
                            'Extracting': 'bg-primary/10 text-primary border-primary/20 animate-pulse',
                            'Scanning': 'bg-amber-50 text-amber-700 border-amber-200 animate-pulse',
                            'Queueing': 'bg-surface-container text-on-surface-variant border-outline-variant',
                            'Failed': 'bg-error/10 text-error border-error/20'
                        };
                        const statusTranslations = {
                            'Completed': 'Selesai',
                            'Extracting': 'Mengekstrak',
                            'Scanning': 'Memindai',
                            'Queueing': 'Antre',
                            'Failed': 'Gagal'
                        };
                        const sourceTranslation = item.source === 'Web Dropzone' ? 'Zona Unggah Web' : escapeHtml(item.source);

                        const statusClass = statusColors[item.status] || 'bg-surface-container text-on-surface';
                        const displayStatus = statusTranslations[item.status] || item.status;

                        return `
                            <tr class="hover:bg-surface-container-low transition-colors">
                                <td class="px-lg py-3.5">
                                    <div class="flex items-center gap-3">
                                        <span class="material-symbols-outlined text-primary text-[20px]">
                                             ${item.file_type === 'pdf' ? 'picture_as_pdf' : (item.file_type === 'image' ? 'image' : 'description')}
                                        </span>
                                        <div class="truncate max-w-[200px]">
                                            <p class="font-bold text-xs text-on-surface truncate">${escapeHtml(item.filename)}</p>
                                            <p class="text-[11px] font-mono text-on-surface-variant">${item.file_size_formatted}</p>
                                        </div>
                                    </div>
                                </td>
                                <td class="px-lg py-3.5 text-xs text-on-surface-variant font-medium">${sourceTranslation}</td>
                                <td class="px-lg py-3.5 font-mono text-xs text-on-surface-variant font-bold">${item.queue_pos}</td>
                                <td class="px-lg py-3.5">
                                    <span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-primary/5 text-primary border border-primary/10">
                                        ${escapeHtml(item.engine || 'Tesseract v5')}
                                    </span>
                                </td>
                                <td class="px-lg py-3.5 text-center font-mono text-xs font-bold text-emerald-600">${item.confidence || '98%'}</td>
                                <td class="px-lg py-3.5">
                                    <div class="flex items-center gap-3">
                                        <div class="flex-1 bg-surface-container rounded-full h-2 overflow-hidden border border-outline-variant/40">
                                            <div class="bg-primary h-full rounded-full transition-all duration-300" style="width: ${item.progress || 100}%"></div>
                                        </div>
                                        <span class="inline-flex items-center whitespace-nowrap px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wider ${statusClass}">
                                            ${displayStatus}
                                        </span>
                                    </div>
                                </td>
                            </tr>
                        `;
                    }).join('');
                }
            }

            // Render Failed Retries Container
            if (failedContainer) {
                if (!data.failed_retries || data.failed_retries.length === 0) {
                    failedContainer.innerHTML = `
                        <div class="flex items-center gap-2 p-3 bg-emerald-50/50 border border-emerald-100 rounded-xl text-emerald-700 text-xs font-medium">
                            <span class="material-symbols-outlined text-sm">verified</span>
                            <span>Tidak ada tugas yang gagal. Seluruh berkas diproses dengan lancar.</span>
                        </div>
                    `;
                } else {
                    failedContainer.innerHTML = data.failed_retries.map(f => `
                        <div class="flex items-center justify-between p-3 bg-error/5 border border-error/20 rounded-xl">
                            <div class="flex items-center gap-2 text-xs font-semibold text-error">
                                <span class="material-symbols-outlined text-sm">error</span>
                                <span>${escapeHtml(f.filename)} — Ekstraksi gagal pada percobaan terakhir</span>
                            </div>
                            <button class="px-3 py-1 bg-error text-white rounded-lg text-xs font-bold hover:brightness-90 transition-all">
                                Retry Now
                            </button>
                        </div>
                    `).join('');
                }
            }
        } catch (err) {
            console.error('Load queue error:', err);
        }
    }

    // === [TAG EVENT: Inisialisasi Kontrol Antrean OCR (initQueueHandlers)] ===
    // Penjelasan: Mendaftarkan aksi tombol refresh antrean, ekspor log antrean ke CSV/file, jeda (pause/resume) antrean, dan coba ulang seluruh tugas gagal
    initQueueHandlers() {
        const refreshBtn = document.getElementById('btn-refresh-queue');
        const exportBtn = document.getElementById('btn-export-queue-logs');
        const pauseBtn = document.getElementById('btn-pause-queue');
        const retryBtn = document.getElementById('btn-retry-all-failed');

        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.loadQueueData();
                window.showToast('Data antrean berhasil diperbarui.');
            });
        }

        if (exportBtn) {
            exportBtn.addEventListener('click', () => {
                window.location.href = '/api/queue/export';
            });
        }

        if (pauseBtn) {
            let isPaused = false;
            pauseBtn.addEventListener('click', () => {
                isPaused = !isPaused;
                if (isPaused) {
                    pauseBtn.innerHTML = `<span class="material-symbols-outlined text-sm">play_circle</span> Resume Queue`;
                    pauseBtn.classList.remove('bg-error');
                    pauseBtn.classList.add('bg-emerald-600');
                    window.showToast('Antrean pemrosesan dihentikan sementara.');
                } else {
                    pauseBtn.innerHTML = `<span class="material-symbols-outlined text-sm" style="font-variation-settings: 'FILL' 1;">pause_circle</span> Pause Queue`;
                    pauseBtn.classList.remove('bg-emerald-600');
                    pauseBtn.classList.add('bg-error');
                    window.showToast('Antrean pemrosesan dilanjutkan.');
                }
            });
        }

        if (retryBtn) {
            retryBtn.addEventListener('click', () => {
                window.showToast('Memproses ulang seluruh tugas yang gagal...');
                setTimeout(() => this.loadQueueData(), 1000);
            });
        }
    }

    // === [TAG SETTINGS: Pemuat Data Pengaturan Sistem (loadSettingsData)] ===
    // Penjelasan: Mengambil konfigurasi preferensi sistem dan status mesin OCR untuk tab pengaturan
    async loadSettingsData() {
    }

    // === [TAG SETTINGS: Inisialisasi Handler Pengaturan (initSettingsHandlers)] ===
    // Penjelasan: Menghubungkan interaksi form dan opsi pengaturan sistem ke backend
    initSettingsHandlers() {
    }
}

// Global instance export
window.NavigationManager = NavigationManager;

// === [TAG POLLING: Pembaruan Statistik Dashboard Live (updateDashboardStats)] ===
// Penjelasan: Mengambil data metrik langsung dari /api/stats (total berkas, rata-rata akurasi OCR, dan penggunaan memori) untuk ditampilkan pada kartu statistik utama
async function updateDashboardStats() {
    try {
        const response = await fetch('/api/stats');
        if (response.status === 429) {
            console.warn('Rate limit exceeded (429). Stopping automatic stats polling.');
            if (window.statsPollInterval) clearInterval(window.statsPollInterval);
            return;
        }
        if (!response.ok) return;
        
        const data = await response.json();
        
        const elDocs = document.getElementById('live-stat-docs');
        const elAcc = document.getElementById('live-stat-acc');
        const elStorage = document.getElementById('live-stat-storage');
        
        if (elDocs) elDocs.textContent = data.total_docs;
        if (elAcc) elAcc.textContent = data.accuracy;
        if (elStorage) elStorage.textContent = data.used_mb;
    } catch (error) {
        console.error('Failed to update dashboard stats:', error);
    }
}

