/**
 * Main Application Entry Point - DocuMind Intelligent OCR Workspace
 */

// === [TAG EVENT UTAMA: Inisialisasi Workspace Dashboard (DOMContentLoaded)] ===
// Penjelasan: Titik masuk utama JavaScript di sisi klien untuk menghubungkan navigasi, sinkronisasi pencarian, tema tampilan, modal profil, dan ubah kata sandi
document.addEventListener('DOMContentLoaded', () => {
    // 1. Initialize Navigation Manager
    // === [TAG MODUL: Inisialisasi Pengatur Navigasi] ===
    // Penjelasan: Memulai instance NavigationManager untuk mengendalikan perpindahan tab sidebar (Dashboard, Semua Dokumen, Antrean, Pengaturan)
    if (window.NavigationManager) {
        window.navApp = new window.NavigationManager();
    }

    // 2. Wire Header & Table Search Bar Inputs with Real-time Debounce & Sync
    // === [TAG EVENT: Sinkronisasi & Debounce Bilah Pencarian Ganda] ===
    // Penjelasan: Menyelaraskan teks pencarian antara header dan tabel dengan teknik debounce 250ms agar tidak membebani request ke server
    const headerSearchInput = document.getElementById('header-search-input');
    const headerClearBtn = document.getElementById('search-clear-btn');
    const tableSearchInput = document.getElementById('all-docs-search-input');
    const tableClearBtn = document.getElementById('all-docs-search-clear');
    let searchDebounceTimer = null;

    function handleSearchInput(val, source) {
        // Sync both inputs
        if (source !== 'header' && headerSearchInput) {
            headerSearchInput.value = val;
        }
        if (source !== 'table' && tableSearchInput) {
            tableSearchInput.value = val;
        }

        // Toggle clear buttons
        if (headerClearBtn) {
            headerClearBtn.classList.toggle('hidden', val.length === 0);
        }
        if (tableClearBtn) {
            tableClearBtn.classList.toggle('hidden', val.length === 0);
        }

        // Debounced search trigger
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(() => {
            if (window.navApp) {
                window.navApp.searchQuery = val;
                window.navApp.filterCategory(window.navApp.currentCategory);
            }
        }, 250);
    }

    function clearSearch() {
        if (headerSearchInput) headerSearchInput.value = '';
        if (tableSearchInput) tableSearchInput.value = '';
        if (headerClearBtn) headerClearBtn.classList.add('hidden');
        if (tableClearBtn) tableClearBtn.classList.add('hidden');
        if (window.navApp) {
            window.navApp.searchQuery = '';
            window.navApp.filterCategory(window.navApp.currentCategory);
        }
    }

    if (headerSearchInput) {
        headerSearchInput.addEventListener('input', (e) => {
            handleSearchInput(e.target.value.trim(), 'header');
        });
    }

    if (tableSearchInput) {
        tableSearchInput.addEventListener('input', (e) => {
            handleSearchInput(e.target.value.trim(), 'table');
        });
    }

    if (headerClearBtn) {
        headerClearBtn.addEventListener('click', clearSearch);
    }

    if (tableClearBtn) {
        tableClearBtn.addEventListener('click', clearSearch);
    }

    // 3. Setup Theme Switcher Handler with LocalStorage Persistence
    // === [TAG TEMA: Pengatur Tema Terang / Gelap (Light & Dark Mode)] ===
    // Penjelasan: Mengubah kelas 'dark'/'light' pada tag <html> dan menyimpannya secara persisten di localStorage browser pengguna
    const lightThemeBtn = document.getElementById('theme-btn-light');
    const darkThemeBtn = document.getElementById('theme-btn-dark');

    function applyTheme(theme) {
        if (theme === 'dark') {
            document.documentElement.classList.remove('light');
            document.documentElement.classList.add('dark');
            localStorage.setItem('documind_theme', 'dark');
            if (darkThemeBtn && lightThemeBtn) {
                darkThemeBtn.className = 'flex-1 py-2.5 px-3 rounded-xl border-2 border-primary bg-primary/5 text-primary font-bold text-xs flex items-center justify-center gap-2';
                lightThemeBtn.className = 'flex-1 py-2.5 px-3 rounded-xl border border-outline-variant text-on-surface-variant font-bold text-xs flex items-center justify-center gap-2 hover:bg-surface-container-low';
            }
        } else {
            document.documentElement.classList.remove('dark');
            document.documentElement.classList.add('light');
            localStorage.setItem('documind_theme', 'light');
            if (lightThemeBtn && darkThemeBtn) {
                lightThemeBtn.className = 'flex-1 py-2.5 px-3 rounded-xl border-2 border-primary bg-primary/5 text-primary font-bold text-xs flex items-center justify-center gap-2';
                darkThemeBtn.className = 'flex-1 py-2.5 px-3 rounded-xl border border-outline-variant text-on-surface-variant font-bold text-xs flex items-center justify-center gap-2 hover:bg-surface-container-low';
            }
        }
    }

    // Initialize Theme: Default to Light Mode if no preference is explicitly saved in LocalStorage
    const savedTheme = localStorage.getItem('documind_theme') || 'light';
    applyTheme(savedTheme);

    if (lightThemeBtn) lightThemeBtn.addEventListener('click', () => applyTheme('light'));
    if (darkThemeBtn) darkThemeBtn.addEventListener('click', () => applyTheme('dark'));

    // 4. Setup Profile Dropdown & Profile Settings Manager
    // === [TAG PROFIL: Manajemen Data Profil & Dropdown Header] ===
    // Penjelasan: Mengambil data pengguna via /api/auth/me, menghitung inisial nama, menampilkan foto avatar, dan mengelola modal ubah profil
    const profileBtn = document.getElementById('btn-user-profile');
    const profileDropdown = document.getElementById('profile-dropdown-menu');
    const profileModal = document.getElementById('profile-settings-modal');
    const menuItemSettings = document.getElementById('menu-item-settings');
    const menuItemSwitch = document.getElementById('menu-item-switch');
    const menuItemLogout = document.getElementById('menu-item-logout');

    const profileForm = document.getElementById('profile-settings-form');
    const profileNameInput = document.getElementById('profile-name-input');
    const profileEmailInput = document.getElementById('profile-email-input');
    const profileRoleInput = document.getElementById('profile-role-input');
    const avatarInput = document.getElementById('profile-avatar-input');
    const btnChangePhoto = document.getElementById('btn-change-photo');
    const avatarPickerTrigger = document.getElementById('avatar-picker-trigger');

    const dropdownUserName = document.getElementById('dropdown-user-name');
    const dropdownUserEmail = document.getElementById('dropdown-user-email');
    const headerAvatarInitials = document.getElementById('header-avatar-initials');
    const headerAvatarImg = document.getElementById('header-avatar-img');
    const modalAvatarInitials = document.getElementById('profile-avatar-initials');
    const modalAvatarImg = document.getElementById('profile-avatar-img');

    let currentProfile = {
        name: 'DocuMind User',
        email: 'user@documind.ai',
        role: 'System Administrator',
        avatar: ''
    };

    async function loadSavedProfile() {
        try {
            const res = await fetch('/api/auth/me');
            if (res.ok) {
                const data = await res.json();
                if (data.status === 'success' && data.user) {
                    currentProfile = {
                        name: data.user.full_name,
                        email: data.user.email,
                        role: data.user.role || 'System Administrator',
                        avatar: data.user.avatar_url || ''
                    };
                    updateProfileUI();
                    return;
                }
            }
        } catch (e) {
            console.warn('Failed to load profile from server:', e);
        }

        // Fallback to DOM elements
        const domName = document.getElementById('dropdown-user-name')?.textContent;
        const domEmail = document.getElementById('dropdown-user-email')?.textContent;
        if (domName && domName !== 'DocuMind User') {
            currentProfile.name = domName;
            currentProfile.email = domEmail || currentProfile.email;
        }
        updateProfileUI();
    }

    function updateProfileUI() {
        if (dropdownUserName) dropdownUserName.textContent = currentProfile.name;
        if (dropdownUserEmail) dropdownUserEmail.textContent = currentProfile.email;
        if (profileNameInput) profileNameInput.value = currentProfile.name;
        if (profileEmailInput) profileEmailInput.value = currentProfile.email;
        if (profileRoleInput) profileRoleInput.value = currentProfile.role;

        // Initials calculation
        const initials = currentProfile.name.split(' ').filter(Boolean).map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'DM';
        if (headerAvatarInitials) headerAvatarInitials.textContent = initials;
        if (modalAvatarInitials) modalAvatarInitials.textContent = initials;

        if (currentProfile.avatar) {
            if (headerAvatarImg) {
                headerAvatarImg.src = currentProfile.avatar;
                headerAvatarImg.classList.remove('hidden');
                if (headerAvatarInitials) headerAvatarInitials.classList.add('hidden');
            }
            if (modalAvatarImg) {
                modalAvatarImg.src = currentProfile.avatar;
                modalAvatarImg.classList.remove('hidden');
                if (modalAvatarInitials) modalAvatarInitials.classList.add('hidden');
            }
        } else {
            if (headerAvatarImg) headerAvatarImg.classList.add('hidden');
            if (headerAvatarInitials) headerAvatarInitials.classList.remove('hidden');
            if (modalAvatarImg) modalAvatarImg.classList.add('hidden');
            if (modalAvatarInitials) modalAvatarInitials.classList.remove('hidden');
        }
    }

    loadSavedProfile();

    // Toggle Profile Dropdown
    if (profileBtn && profileDropdown) {
        profileBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            profileDropdown.classList.toggle('hidden');
        });

        document.addEventListener('click', (e) => {
            if (!profileDropdown.contains(e.target) && !profileBtn.contains(e.target)) {
                profileDropdown.classList.add('hidden');
            }
        });
    }

    // Open Profile Settings Modal
    if (menuItemSettings && profileModal) {
        menuItemSettings.addEventListener('click', () => {
            profileDropdown?.classList.add('hidden');
            profileModal.classList.remove('hidden');
        });
    }

    // Switch Account Handler
    if (menuItemSwitch) {
        menuItemSwitch.addEventListener('click', () => {
            profileDropdown?.classList.add('hidden');
            window.location.href = '/login';
        });
    }

    // Logout Handler
    if (menuItemLogout) {
        menuItemLogout.addEventListener('click', () => {
            profileDropdown?.classList.add('hidden');
            if (confirm('Apakah Anda yakin ingin keluar dari akun?')) {
                window.location.href = '/logout';
            }
        });
    }

    // Change Photo Handlers
    if (btnChangePhoto && avatarInput) {
        btnChangePhoto.addEventListener('click', () => avatarInput.click());
    }
    if (avatarPickerTrigger && avatarInput) {
        avatarPickerTrigger.addEventListener('click', () => avatarInput.click());
    }

    // Global variable to hold the selected avatar file
    let selectedAvatarFile = null;

    if (avatarInput) {
        avatarInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                // Tampilkan preview instan
                selectedAvatarFile = file;
                const reader = new FileReader();
                reader.onload = (evt) => {
                    if (modalAvatarImg) {
                        modalAvatarImg.src = evt.target.result;
                        modalAvatarImg.classList.remove('hidden');
                        if (modalAvatarInitials) modalAvatarInitials.classList.add('hidden');
                    }
                };
                reader.readAsDataURL(file);
            }
        });
    }

    // Form Submit Handler (Saves to MySQL Database & Session via apiFetch)
    // === [TAG EVENT: Simpan Perubahan Profil Pengguna] ===
    // Penjelasan: Mengirimkan data profil dan file avatar baru via multipart FormData ke endpoint /api/auth/profile
    if (profileForm) {
        profileForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitSaveBtn = document.getElementById('profile-save-btn');
            
            try {
                if (submitSaveBtn) {
                    submitSaveBtn.disabled = true;
                    submitSaveBtn.innerHTML = `<span class="material-symbols-outlined text-sm animate-spin">refresh</span> Menyimpan...`;
                }

                // Penggunaan optional chaining (?.) untuk menghindari error
                // "Cannot read properties of null (reading 'value')" jika elemen tidak ada di HTML
                const updatedName = profileNameInput?.value?.trim() || 'DocuMind User';
                const updatedEmail = profileEmailInput?.value?.trim() || 'user@documind.ai';
                const updatedRole = profileRoleInput?.value?.trim() || 'System Administrator';

                // Menggunakan FormData agar bisa mengirim file secara multipart/form-data
                const formData = new FormData();
                formData.append('full_name', updatedName);
                formData.append('email', updatedEmail);
                formData.append('role', updatedRole);
                if (selectedAvatarFile) {
                    formData.append('avatar', selectedAvatarFile);
                } else if (currentProfile.avatar) {
                    formData.append('avatar_url', currentProfile.avatar);
                }

                // Menggunakan apiFetch (wrapper otomatis untuk CSRF). 
                // apiFetch tidak akan menimpa Content-Type jika body berupa FormData
                const res = await apiFetch('/api/auth/profile', {
                    method: 'POST',
                    body: formData
                });

                const data = await res.json();

                if (res.ok && data.status === 'success') {
                    currentProfile.name = data.user.full_name;
                    currentProfile.email = data.user.email;
                    currentProfile.role = data.user.role || updatedRole;
                    currentProfile.avatar = data.user.avatar_url || '';
                    updateProfileUI();
                    selectedAvatarFile = null;

                    if (profileModal) profileModal.classList.add('hidden');
                    if (window.showToast) {
                        window.showToast('Profile & foto berhasil diperbarui di database!', 'success');
                    }
                } else {
                    alert(data.message || 'Gagal menyimpan profil ke database.');
                }
            } catch (err) {
                console.error("Kesalahan saat menyimpan profil:", err);
                alert('Terjadi kesalahan. Gagal menghubungi server.');
            } finally {
                // Selalu reset status tombol (baik sukses, gagal validasi, atau error exception)
                if (submitSaveBtn) {
                    submitSaveBtn.disabled = false;
                    submitSaveBtn.innerHTML = `<span class="material-symbols-outlined text-sm">save</span> Simpan Perubahan`;
                }
            }
        });
    }

    // ── Change Password Modal Handler ────────────────────────────────────────
    // === [TAG MODAL: Validasi & Penggantian Kata Sandi Akun] ===
    // Penjelasan: Memeriksa kekuatan password (meteran bar kekuatan), kecocokan konfirmasi sandi, dan mengirim ke /api/auth/change-password
    const changePwModal = document.getElementById('change-password-modal');
    const changePwForm = document.getElementById('change-password-form');
    const btnOpenChangePw = document.getElementById('btn-open-change-password');
    const pwOld = document.getElementById('pw-old');
    const pwNew = document.getElementById('pw-new');
    const pwConfirm = document.getElementById('pw-confirm');
    const pwSaveBtn = document.getElementById('pw-save-btn');
    const pwStrengthBar = document.getElementById('pw-strength-bar');
    const pwStrengthText = document.getElementById('pw-strength-text');
    const pwMatchText = document.getElementById('pw-match-text');
    const pwAlert = document.getElementById('change-pw-alert');

    // Open change password modal from profile modal
    if (btnOpenChangePw && changePwModal) {
        btnOpenChangePw.addEventListener('click', () => {
            if (profileModal) profileModal.classList.add('hidden');
            changePwModal.classList.remove('hidden');
            if (changePwForm) changePwForm.reset();
            if (pwAlert) { pwAlert.classList.add('hidden'); pwAlert.innerHTML = ''; }
            if (pwStrengthBar) { pwStrengthBar.style.width = '0'; pwStrengthBar.className = 'h-full rounded-full transition-all duration-300 w-0'; }
            if (pwStrengthText) pwStrengthText.textContent = '';
            if (pwMatchText) pwMatchText.classList.add('hidden');
            if (pwSaveBtn) pwSaveBtn.disabled = true;
        });
    }

    // Toggle password visibility
    document.querySelectorAll('.toggle-pw-visibility').forEach(btn => {
        btn.addEventListener('click', () => {
            const target = document.getElementById(btn.dataset.target);
            if (!target) return;
            const isPassword = target.type === 'password';
            target.type = isPassword ? 'text' : 'password';
            btn.querySelector('.material-symbols-outlined').textContent = isPassword ? 'visibility' : 'visibility_off';
        });
    });

    // Password strength checker
    function checkPasswordStrength(pw) {
        let score = 0;
        if (pw.length >= 8) score++;
        if (pw.length >= 12) score++;
        if (/[A-Z]/.test(pw)) score++;
        if (/[a-z]/.test(pw)) score++;
        if (/[0-9]/.test(pw)) score++;
        if (/[^A-Za-z0-9]/.test(pw)) score++;
        return score; // 0-6
    }

    function updateStrengthUI() {
        if (!pwNew || !pwStrengthBar || !pwStrengthText) return;
        const pw = pwNew.value;
        if (!pw) {
            pwStrengthBar.style.width = '0';
            pwStrengthText.textContent = '';
            return;
        }
        const score = checkPasswordStrength(pw);
        const levels = [
            { w: '16%', color: 'bg-red-500', text: 'Sangat Lemah' },
            { w: '33%', color: 'bg-orange-500', text: 'Lemah' },
            { w: '50%', color: 'bg-amber-500', text: 'Cukup' },
            { w: '66%', color: 'bg-yellow-500', text: 'Sedang' },
            { w: '83%', color: 'bg-emerald-400', text: 'Kuat' },
            { w: '100%', color: 'bg-emerald-600', text: 'Sangat Kuat' },
        ];
        const level = levels[Math.min(score, levels.length) - 1] || levels[0];
        pwStrengthBar.style.width = level.w;
        pwStrengthBar.className = `h-full rounded-full transition-all duration-300 ${level.color}`;
        pwStrengthText.textContent = level.text;
    }

    function updateMatchUI() {
        if (!pwConfirm || !pwNew || !pwMatchText) return;
        const val = pwConfirm.value;
        if (!val) { pwMatchText.classList.add('hidden'); return; }
        pwMatchText.classList.remove('hidden');
        if (val === pwNew.value) {
            pwMatchText.textContent = 'Password cocok';
            pwMatchText.className = 'text-[10px] font-bold mt-1 text-emerald-600';
        } else {
            pwMatchText.textContent = 'Password tidak cocok';
            pwMatchText.className = 'text-[10px] font-bold mt-1 text-error';
        }
    }

    function validatePwForm() {
        if (!pwSaveBtn || !pwOld || !pwNew || !pwConfirm) return;
        const valid = pwOld.value.length > 0
            && pwNew.value.length >= 6
            && pwNew.value === pwConfirm.value
            && pwOld.value !== pwNew.value;
        pwSaveBtn.disabled = !valid;
    }

    if (pwNew) pwNew.addEventListener('input', () => { updateStrengthUI(); updateMatchUI(); validatePwForm(); });
    if (pwConfirm) pwConfirm.addEventListener('input', () => { updateMatchUI(); validatePwForm(); });
    if (pwOld) pwOld.addEventListener('input', validatePwForm);

    // Submit change password form
    if (changePwForm) {
        changePwForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (pwSaveBtn) {
                pwSaveBtn.disabled = true;
                pwSaveBtn.innerHTML = '<span class="material-symbols-outlined text-sm animate-spin">sync</span> Menyimpan...';
            }
            if (pwAlert) pwAlert.classList.add('hidden');

            try {
                const res = await apiFetch('/api/auth/change-password', {
                    method: 'POST',
                    body: JSON.stringify({
                        old_password: pwOld.value,
                        new_password: pwNew.value,
                        confirm_password: pwConfirm.value
                    })
                });
                const data = await res.json();

                if (data.status === 'success') {
                    if (pwAlert) {
                        pwAlert.textContent = '';
                        const icon = document.createElement('span');
                        icon.className = 'material-symbols-outlined text-sm';
                        icon.textContent = 'check_circle';
                        pwAlert.appendChild(icon);
                        pwAlert.appendChild(document.createTextNode(' ' + data.message));
                        pwAlert.className = 'p-3 rounded-xl text-xs font-bold flex items-start gap-2 bg-emerald-50 text-emerald-700 border border-emerald-200';
                    }
                    if (window.showToast) window.showToast(data.message, 'success');
                    setTimeout(() => {
                        if (changePwModal) changePwModal.classList.add('hidden');
                        if (changePwForm) changePwForm.reset();
                        if (pwAlert) pwAlert.classList.add('hidden');
                        updateStrengthUI();
                    }, 1500);
                } else {
                    if (pwAlert) {
                        pwAlert.textContent = '';
                        const icon = document.createElement('span');
                        icon.className = 'material-symbols-outlined text-sm';
                        icon.textContent = 'error';
                        pwAlert.appendChild(icon);
                        pwAlert.appendChild(document.createTextNode(' ' + data.message));
                        pwAlert.className = 'p-3 rounded-xl text-xs font-bold flex items-start gap-2 bg-error/10 text-error border border-error/20';
                    }
                }
            } catch (err) {
                console.error('Change password error:', err);
                if (pwAlert) {
                    pwAlert.textContent = '';
                    const icon = document.createElement('span');
                    icon.className = 'material-symbols-outlined text-sm';
                    icon.textContent = 'error';
                    pwAlert.appendChild(icon);
                    pwAlert.appendChild(document.createTextNode(' Gagal menghubungi server.'));
                    pwAlert.className = 'p-3 rounded-xl text-xs font-bold flex items-start gap-2 bg-error/10 text-error border border-error/20';
                }
            } finally {
                if (pwSaveBtn) {
                    pwSaveBtn.innerHTML = '<span class="material-symbols-outlined text-sm">lock</span> Ubah Password';
                    validatePwForm();
                }
            }
        });
    }

    console.log('DocuMind Smart OCR Dashboard initialized successfully.');
});
