// utils.js
// Shared utilities for DocuMind to avoid duplication and improve DOM security.

// === [TAG HELPER: Pembuatan Elemen DOM Aman (createElement)] ===
// Penjelasan: Membuat elemen HTML secara terprogram dengan pengaturan class dan textContent (mencegah celah XSS)
function createElement(tag, className = '', textContent = '') {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (textContent) el.textContent = textContent;
    return el;
}

// === [TAG HELPER: Pemetaan Ikon Berkas (getFileIcon)] ===
// Penjelasan: Menentukan nama ikon Material Symbols berdasarkan ekstensi file (.pdf, .docx, .png, .py, dll)
function getFileIcon(filename, defaultIcon = 'insert_drive_file') {
    if (!filename) return defaultIcon;
    const ext = filename.split('.').pop().toLowerCase();
    const icons = {
        'pdf': 'picture_as_pdf',
        'doc': 'description',
        'docx': 'description',
        'xls': 'table_chart',
        'xlsx': 'table_chart',
        'png': 'image',
        'jpg': 'image',
        'jpeg': 'image',
        'webp': 'image',
        'gif': 'image',
        'svg': 'image',
        'txt': 'article',
        'csv': 'grid_on',
        'py': 'code',
        'js': 'code',
        'ts': 'code',
        'jsx': 'code',
        'tsx': 'code',
        'css': 'css',
        'html': 'html',
        'htm': 'html',
        'xhtml': 'html',
        'json': 'data_object',
        'xml': 'code',
        'sql': 'database',
        'md': 'description',
        'java': 'code',
        'c': 'code',
        'cpp': 'code',
        'php': 'code'
    };
    return icons[ext] || defaultIcon;
}

// === [TAG HELPER: Format Ukuran Bytes (formatBytes)] ===
// Penjelasan: Mengubah angka bita (bytes) menjadi format ramah baca (Bytes, KB, MB, GB)
function formatBytes(bytes, decimals = 2) {
    if (!+bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

// === [TAG HELPER: Format Tanggal Ringkas (formatDate)] ===
// Penjelasan: Memotong string timestamp ISO menjadi format tanggal YYYY-MM-DD
function formatDate(dateString) {
    if (!dateString) return '-';
    // split ' ' for format like "2023-10-12 14:00:00"
    return dateString.split(' ')[0];
}

// === [TAG RENDER: Pembuatan Kartu Dokumen Tampilan Grid (createGridCardElement)] ===
// Penjelasan: Merender kartu dokumen bergaya kartu (grid card) lengkap dengan badge tipe, cuplikan teks, dan tombol aksi (lihat, unduh, hapus)
function createGridCardElement(doc) {
    const sizeFormatted = doc.file_size ? formatBytes(doc.file_size) : '1.0 MB';
    const isPdf = doc.file_type === 'pdf';
    const isDocx = doc.file_type === 'office';
    const badgeType = isPdf ? 'DIGITAL / PDF' : (isDocx ? 'DOCX / OFFICE' : 'IMAGE / OCR');
    const badgeClass = isPdf ? 'bg-primary/5 text-primary border-primary/10' : (isDocx ? 'bg-orange-50 text-orange-700 border-orange-100' : 'bg-emerald-50 text-emerald-700 border-emerald-100');
    const iconName = getFileIcon(doc.filename);
    const iconBg = isPdf ? 'bg-blue-50 text-blue-600' : (isDocx ? 'bg-orange-50 text-orange-600' : 'bg-red-50 text-red-600');

    const card = createElement('div', 'bg-surface border border-outline-variant hover:border-primary/50 hover:shadow-lg rounded-2xl p-lg flex flex-col justify-between transition-all duration-200 cursor-pointer group');
    
    // Top Section
    const topDiv = createElement('div');
    
    // Header (Icon & Badge)
    const headerDiv = createElement('div', 'flex items-start justify-between gap-md mb-md');
    
    const iconWrapper = createElement('div', `w-12 h-12 rounded-xl ${iconBg} flex items-center justify-center shadow-sm`);
    const iconSpan = createElement('span', 'material-symbols-outlined text-2xl', iconName);
    iconWrapper.appendChild(iconSpan);
    
    const badgeSpan = createElement('span', `${badgeClass} inline-flex items-center whitespace-nowrap text-[10px] font-bold px-2.5 py-1 rounded-full border uppercase tracking-tighter`, badgeType);
    
    headerDiv.appendChild(iconWrapper);
    headerDiv.appendChild(badgeSpan);
    topDiv.appendChild(headerDiv);

    // Title & Info
    const title = createElement('h4', 'font-title-md text-title-md font-bold text-on-surface group-hover:text-primary transition-colors truncate mb-1', doc.filename);
    const info = createElement('p', 'font-label-md text-xs text-on-surface-variant mb-md', `${sizeFormatted} • Category: ${doc.category || 'General'}`);
    
    // Snippet (Using innerHTML safely for sanitized snippet)
    const snippetP = createElement('p', 'font-mono-md text-xs text-on-surface-variant line-clamp-3 bg-surface-container-low p-md rounded-xl border border-outline-variant/40 mb-lg');
    if (typeof sanitizeSnippet === 'function') {
        snippetP.innerHTML = sanitizeSnippet(doc.snippet) || escapeHtml(doc.content || '');
    } else {
        snippetP.textContent = doc.snippet || doc.content || '';
    }

    topDiv.appendChild(title);
    topDiv.appendChild(info);
    topDiv.appendChild(snippetP);
    card.appendChild(topDiv);

    // Bottom Section
    const bottomDiv = createElement('div', 'flex items-center justify-between pt-md border-t border-outline-variant/40');
    const dateSpan = createElement('span', 'text-xs text-on-surface-variant font-mono-md', formatDate(doc.uploaded_at));
    
    const actionsDiv = createElement('div', 'flex items-center gap-1');
    
    const viewBtn = createElement('button', 'material-symbols-outlined p-2 text-on-surface-variant hover:bg-primary/10 hover:text-primary rounded-lg transition-all btn-view-doc', 'visibility');
    viewBtn.title = "View Document";
    
    const downloadBtn = createElement('button', 'material-symbols-outlined p-2 text-on-surface-variant hover:bg-primary/10 hover:text-primary rounded-lg transition-all btn-download-doc', 'download');
    downloadBtn.title = "Download";
    
    const deleteBtn = createElement('button', 'material-symbols-outlined p-2 text-on-surface-variant hover:bg-error/10 hover:text-error rounded-lg transition-all btn-delete-doc', 'delete');
    deleteBtn.title = "Delete";
    
    actionsDiv.appendChild(viewBtn);
    actionsDiv.appendChild(downloadBtn);
    actionsDiv.appendChild(deleteBtn);
    
    bottomDiv.appendChild(dateSpan);
    bottomDiv.appendChild(actionsDiv);
    card.appendChild(bottomDiv);

    // Event Listeners
    card.addEventListener('click', () => { if (window.openPreviewModal) openPreviewModal(doc.id); });
    viewBtn.addEventListener('click', (e) => { e.stopPropagation(); if (window.openPreviewModal) openPreviewModal(doc.id); });
    downloadBtn.addEventListener('click', (e) => { e.stopPropagation(); if (window.triggerDocumentDownload) triggerDocumentDownload(doc.id); });
    deleteBtn.addEventListener('click', (e) => { e.stopPropagation(); if (window.confirmAndDeleteDocument) confirmAndDeleteDocument(doc.id, doc.filename); });

    return card;
}

// === [TAG RENDER: Pembuatan Baris Dokumen Tampilan Tabel (createListRowElement)] ===
// Penjelasan: Merender baris elemen <tr> untuk tampilan tabel daftar dokumen lengkap dengan event listener klik
function createListRowElement(doc) {
    const sizeFormatted = doc.file_size ? formatBytes(doc.file_size) : '1.0 MB';
    const tr = createElement('tr', 'hover:bg-surface-container transition-colors group cursor-pointer');
    tr.dataset.docId = doc.id;

    // File Column
    const tdFile = createElement('td', 'px-lg py-md max-w-sm');
    const fileDiv = createElement('div', 'flex items-center gap-md');
    
    const iconWrapper = createElement('div', 'w-10 h-10 rounded-lg bg-surface-container-highest flex items-center justify-center border border-outline-variant group-hover:border-primary/40');
    const iconSpan = createElement('span', 'material-symbols-outlined text-primary text-[20px]', getFileIcon(doc.filename));
    iconWrapper.appendChild(iconSpan);
    
    const textDiv = createElement('div');
    const title = createElement('div', 'font-body-md text-body-md text-on-surface font-semibold group-hover:text-primary transition-colors doc-name', doc.filename);
    const sizeP = createElement('div', 'text-xs text-on-surface-variant font-mono-md', sizeFormatted);
    
    textDiv.appendChild(title);
    textDiv.appendChild(sizeP);
    fileDiv.appendChild(iconWrapper);
    fileDiv.appendChild(textDiv);
    tdFile.appendChild(fileDiv);

    // Snippet Column
    const tdSnippet = createElement('td', 'px-lg py-md hidden md:table-cell max-w-md');
    const snippetDiv = createElement('div', 'text-xs text-on-surface-variant font-mono-md line-clamp-2 italic opacity-80');
    if (typeof sanitizeSnippet === 'function') {
        snippetDiv.innerHTML = sanitizeSnippet(doc.snippet) || escapeHtml(doc.content || '');
    } else {
        snippetDiv.textContent = doc.snippet || doc.content || '';
    }
    tdSnippet.appendChild(snippetDiv);

    // Category Column
    const tdCategory = createElement('td', 'px-lg py-md whitespace-nowrap hidden sm:table-cell');
    const catSpan = createElement('span', 'bg-surface-container-high text-on-surface-variant inline-flex items-center whitespace-nowrap text-xs font-semibold px-2.5 py-1 rounded-full border border-outline-variant uppercase tracking-wider', doc.category || 'General');
    tdCategory.appendChild(catSpan);

    // Date Column
    const tdDate = createElement('td', 'px-lg py-md text-xs text-on-surface-variant font-mono-md whitespace-nowrap hidden lg:table-cell', formatDate(doc.uploaded_at));

    // Actions Column
    const tdActions = createElement('td', 'px-lg py-md text-right');
    const actionsDiv = createElement('div', 'flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity');
    
    const viewBtn = createElement('button', 'material-symbols-outlined p-2 text-on-surface-variant hover:bg-primary/10 hover:text-primary rounded-lg transition-all btn-view-doc', 'visibility');
    viewBtn.title = "View Document";
    
    const downloadBtn = createElement('button', 'material-symbols-outlined p-2 text-on-surface-variant hover:bg-primary/10 hover:text-primary rounded-lg transition-all btn-download-doc', 'download');
    downloadBtn.title = "Download";
    
    const deleteBtn = createElement('button', 'material-symbols-outlined p-2 text-on-surface-variant hover:bg-error/10 hover:text-error rounded-lg transition-all btn-delete-doc', 'delete');
    deleteBtn.title = "Delete";
    
    actionsDiv.appendChild(viewBtn);
    actionsDiv.appendChild(downloadBtn);
    actionsDiv.appendChild(deleteBtn);
    tdActions.appendChild(actionsDiv);

    tr.appendChild(tdFile);
    tr.appendChild(tdSnippet);
    tr.appendChild(tdCategory);
    tr.appendChild(tdDate);
    tr.appendChild(tdActions);

    // Event Listeners
    tr.addEventListener('click', () => { if (window.openPreviewModal) openPreviewModal(doc.id); });
    viewBtn.addEventListener('click', (e) => { e.stopPropagation(); if (window.openPreviewModal) openPreviewModal(doc.id); });
    downloadBtn.addEventListener('click', (e) => { e.stopPropagation(); if (window.triggerDocumentDownload) triggerDocumentDownload(doc.id); });
    deleteBtn.addEventListener('click', (e) => { e.stopPropagation(); if (window.confirmAndDeleteDocument) confirmAndDeleteDocument(doc.id, doc.filename); });

    return tr;
}

// Export to window
window.createElement = createElement;
window.getFileIcon = getFileIcon;
window.formatBytes = formatBytes;
window.formatDate = formatDate;
window.createGridCardElement = createGridCardElement;
window.createListRowElement = createListRowElement;

// === [TAG KEAMANAN: Sanitasi Karakter HTML (window.escapeHtml)] ===
// Penjelasan: Mengubah karakter khusus (&, <, >, ", ') menjadi entitas HTML aman untuk mencegah serangan XSS
if (typeof window.escapeHtml !== 'function') {
    window.escapeHtml = function(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    };
}
