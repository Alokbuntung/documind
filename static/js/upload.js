// JavaScript logic for Drag & Drop and File Uploading in DocuMind

// === [TAG EVENT UTAMA: Inisialisasi Zona Unggah (Dropzone) & File Input] ===
// Penjelasan: Mengatur interaksi seret-lepas berkas (drag-and-drop), pemindaian folder rekursif, dan progress bar pengunggahan dokumen
document.addEventListener('DOMContentLoaded', () => {
    const dropzone = document.getElementById('dropzone');
    const fileInput = document.getElementById('file-input');
    const browseBtn = document.getElementById('browse-btn');
    const progressContainer = document.getElementById('upload-progress-container');
    const progressBar = document.getElementById('upload-progress-bar');
    const progressPercent = document.getElementById('upload-percent');
    const filenameLabel = document.getElementById('upload-filename');
    const statusText = document.getElementById('upload-status-text');

    const folderInput = document.getElementById('folder-input');
    const browseFolderBtn = document.getElementById('browse-folder-btn');

    const allDocsUploadBtn = document.getElementById('btn-all-docs-upload');
    const allDocsFolderBtn = document.getElementById('btn-all-docs-new-folder');

    if (!fileInput) return;

    // Trigger file input when clicking browse buttons
    // === [TAG EVENT: Pemicu Pemilih Berkas & Folder via Tombol] ===
    // Penjelasan: Meneruskan klik tombol antarmuka ke elemen input file/folder yang disembunyikan
    if (browseBtn) {
        browseBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            fileInput.click();
        });
    }

    if (allDocsUploadBtn) {
        allDocsUploadBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            fileInput.click();
        });
    }

    if (browseFolderBtn && folderInput) {
        browseFolderBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            folderInput.click();
        });
    }

    if (allDocsFolderBtn && folderInput) {
        allDocsFolderBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            folderInput.click();
        });
    }

    // === [TAG EVENT: Pengendali Drag-and-Drop Area Dropzone] ===
    // Penjelasan: Mengatur efek highlight visual saat file diseret di atas kotak dropzone dan menangani drop event
    if (dropzone) {
        dropzone.addEventListener('click', (e) => {
            if (e.target.closest('#browse-btn') || e.target.closest('#browse-folder-btn')) return;
            fileInput.click();
        });

        // Drag and drop event listeners
        ['dragenter', 'dragover'].forEach(eventName => {
            dropzone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropzone.classList.add('border-primary', 'bg-primary/5', 'scale-[1.01]');
            }, false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            dropzone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropzone.classList.remove('border-primary', 'bg-primary/5', 'scale-[1.01]');
            }, false);
        });

        // Handle dropped files or folders
        dropzone.addEventListener('drop', async (e) => {
            const items = e.dataTransfer.items;
            let files = [];

            if (items && items.length > 0) {
                for (let i = 0; i < items.length; i++) {
                    const item = items[i];
                    if (item.webkitGetAsEntry) {
                        const entry = item.webkitGetAsEntry();
                        if (entry) {
                            const scanned = await scanFilesFromEntry(entry);
                            files.push(...scanned);
                        }
                    }
                }
            }

            if (files.length === 0 && e.dataTransfer.files) {
                files = Array.from(e.dataTransfer.files);
            }

            if (files.length > 0) {
                handleFileUploads(files);
            }
        });
    }

    // Recursively scan entry for files inside dropped folders
    // === [TAG FUNGSI ASINKRON: Pemindaian Folder Rekursif (scanFilesFromEntry)] ===
    // Penjelasan: Membaca seluruh file di dalam subfolder yang di-drop menggunakan FileSystem API browser
    async function scanFilesFromEntry(entry) {
        let files = [];
        if (entry.isFile) {
            return new Promise(resolve => {
                entry.file(file => {
                    if (!file.webkitRelativePath && entry.fullPath) {
                        try {
                            Object.defineProperty(file, 'webkitRelativePath', {
                                value: entry.fullPath.replace(/^\//, ''),
                                writable: false
                            });
                        } catch (e) {}
                    }
                    resolve([file]);
                }, () => resolve([]));
            });
        } else if (entry.isDirectory) {
            const dirReader = entry.createReader();
            const entries = await new Promise(resolve => {
                let allEntries = [];
                const readBatch = () => {
                    dirReader.readEntries(res => {
                        if (!res || res.length === 0) {
                            resolve(allEntries);
                        } else {
                            allEntries.push(...res);
                            readBatch();
                        }
                    }, () => resolve(allEntries));
                };
                readBatch();
            });
            for (const childEntry of entries) {
                const childFiles = await scanFilesFromEntry(childEntry);
                files.push(...childFiles);
            }
        }
        return files;
    }

    // Handle file input change
    fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
            handleFileUploads(Array.from(e.target.files));
            fileInput.value = ''; // Reset input selection
        }
    });

    // Handle folder input change
    if (folderInput) {
        folderInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files.length > 0) {
                handleFileUploads(Array.from(e.target.files));
                folderInput.value = ''; // Reset input selection
            }
        });
    }

    // === [TAG FUNGSI ASINKRON: Antrean Pengunggahan Berurutan (handleFileUploads)] ===
    // Penjelasan: Memproses pengunggahan kumpulan berkas satu per satu agar server tidak kewalahan menerima banyak request simultan
    async function handleFileUploads(files) {
        if (!files || files.length === 0) return;

        if (progressContainer) progressContainer.classList.remove('hidden');

        try {
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                await uploadSingleFile(file, i + 1, files.length);
            }
        } catch (err) {
            console.error('Fatal error during file uploads:', err);
        } finally {
            setTimeout(() => {
                if (progressContainer) progressContainer.classList.add('hidden');
                if (progressBar) progressBar.style.width = '0%';
            }, 1200);
        }
    }

    // === [TAG FUNGSI: Eksekusi Unggah Berkas Tunggal (uploadSingleFile)] ===
    // Penjelasan: Validasi batas ukuran 50MB, animasi progres bertahap, optimis update antrean pada badge sidebar, dan kirim file via apiFetch('/api/upload')
    function uploadSingleFile(file, index, total) {
        return new Promise((resolve) => {
            // Frontend validation: 50MB limit
            if (file.size > 50 * 1024 * 1024) {
                if (window.showToast) window.showToast(`Ukuran file "${file.name}" melebihi batas maksimal (50 MB)`, 'error');
                return resolve();
            }

            const displayName = file.webkitRelativePath || file.name;
            const prefix = total > 1 ? `[${index}/${total}] ` : '';
            if (filenameLabel) filenameLabel.textContent = `${prefix}Memproses ${displayName}...`;
            if (progressBar) progressBar.style.width = '20%';
            if (progressPercent) progressPercent.textContent = '20%';
            if (statusText) {
                statusText.textContent = 'Mengunggah dan mengekstrak teks OCR...';
                statusText.classList.remove('text-error');
            }

            const formData = new FormData();
            const relPath = file.webkitRelativePath || '';
            if (relPath) {
                formData.append('file', file, relPath);
                formData.append('relative_path', relPath);
            } else {
                formData.append('file', file);
            }

            let progress = 20;
            const interval = setInterval(() => {
                progress += 15;
                if (progress >= 50 && progress < 85) {
                    if (statusText) statusText.textContent = 'Mengekstrak teks & menganalisis dokumen...';
                } else if (progress >= 85) {
                    if (statusText) statusText.textContent = 'Mengindeks ke database MySQL FTS...';
                }
                if (progress >= 90) {
                    clearInterval(interval);
                    progress = 90;
                }
                if (progressBar) progressBar.style.width = `${progress}%`;
                if (progressPercent) progressPercent.textContent = `${progress}%`;
            }, 180);

            // Optimistic DOM Update for Queue (0 Detik)
            const activeEl = document.getElementById('queue-stat-active');
            const totalEl = document.getElementById('queue-stat-total');
            const sidebarBadge = document.getElementById('sidebar-queue-badge');
            if (activeEl) activeEl.textContent = (parseInt(activeEl.textContent) || 0) + 1;
            if (totalEl) totalEl.textContent = (parseInt(totalEl.textContent) || 0) + 1;
            if (sidebarBadge) {
                sidebarBadge.textContent = (parseInt(sidebarBadge.textContent) || 0) + 1;
                sidebarBadge.classList.add('bg-primary', 'text-white');
                sidebarBadge.classList.remove('bg-primary/10', 'text-primary');
            }

            apiFetch('/api/upload', {
                method: 'POST',
                body: formData
            })
            .then(async res => {
                const data = await res.json().catch(() => null);
                if (!res.ok) {
                    const errorMsg = (data && data.message) ? data.message : `HTTP error ${res.status}`;
                    throw new Error(errorMsg);
                }
                return data;
            })
            .then(data => {
                clearInterval(interval);
                if (progressBar) progressBar.style.width = '100%';
                if (progressPercent) progressPercent.textContent = '100%';
                if (statusText) statusText.textContent = 'Dokumen berhasil diunggah dan sedang dalam antrean pemrosesan.';

                if (sidebarBadge) {
                    sidebarBadge.textContent = Math.max(0, (parseInt(sidebarBadge.textContent) || 0) - 1);
                    if (sidebarBadge.textContent === '0') {
                        sidebarBadge.classList.remove('bg-primary', 'text-white');
                        sidebarBadge.classList.add('bg-primary/10', 'text-primary');
                    }
                }

                if (data.status === 'success') {
                    try {
                        // Mulai polling segera untuk respons upload yang masih berupa
                        // placeholder, lalu render ulang dengan payload OCR terbaru.
                        if (window.navApp && typeof window.navApp.handleUploadedDocuments === 'function') {
                            window.navApp.handleUploadedDocuments(data.documents || [data.document].filter(Boolean));
                        } else if (window.navApp && typeof window.navApp.filterCategory === 'function') {
                            window.navApp.filterCategory(window.navApp.currentCategory || 'all');
                        } else if (typeof window.fetchDocuments === 'function') {
                            window.fetchDocuments();
                        }
                    } catch (refreshErr) {
                        console.warn('Table refresh failed:', refreshErr);
                    }
                    if (data.stats && window.updateStorageWidget) {
                        window.updateStorageWidget(data.stats);
                    }
                    if (window.showToast) window.showToast(`Berkas "${displayName}" berhasil diunggah dan diindeks!`);
                } else {
                    if (window.showToast) window.showToast(data.message || 'Unggahan selesai', 'info');
                }
                setTimeout(resolve, 500);
            })
            .catch(err => {
                clearInterval(interval);
                console.error('Upload error:', err);
                if (statusText) {
                    statusText.textContent = err.message || 'Gagal mengunggah berkas!';
                    statusText.classList.add('text-error');
                }
                if (sidebarBadge) {
                    sidebarBadge.textContent = Math.max(0, (parseInt(sidebarBadge.textContent) || 0) - 1);
                    if (sidebarBadge.textContent === '0') {
                        sidebarBadge.classList.remove('bg-primary', 'text-white');
                        sidebarBadge.classList.add('bg-primary/10', 'text-primary');
                    }
                }
                if (window.showToast) window.showToast(err.message || `Gagal mengunggah ${displayName}`, 'error');
                
                // Jangan lempar error agar antrean file berikutnya tetap berjalan, 
                // cukup resolve setelah jeda agar pesan gagal terbaca user sebentar
                setTimeout(resolve, 1000);
            });
        });
    }
});
