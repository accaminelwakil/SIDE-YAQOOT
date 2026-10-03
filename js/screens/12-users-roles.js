    // ====================================================================
    // نظام المستخدمين وإدارة الصلاحيات لكل شاشة (Users & Screen Permissions)
    // منظومة عيادات سيدى ياقوت التخصصية
    // ====================================================================

    // تعريف كافة شاشات المنظومة الـ 14 بدقة وأسمائها وأيقوناتها
    const ALL_SYSTEM_SCREENS = [
        {
            id: 'screen-welcome',
            name: 'شاشة الترحيب والمؤشرات',
            icon: '👋',
            category: 'الأساسية',
            catClass: 'cat-basic',
            desc: 'لوحة التحكم العامة، إحصائيات الرواتب، والرسوم البيانية التفاعلية'
        },
        {
            id: 'screen-employees',
            name: 'تكويد وإدارة الموظفين',
            icon: '👥',
            category: 'الأساسية',
            catClass: 'cat-basic',
            desc: 'إضافة وتعديل بيانات الموظفين، الرواتب الأساسية، ومواعيد الورديات'
        },
        {
            id: 'screen-attendance',
            name: 'تسجيل الحضور والانصراف',
            icon: '⏱️',
            category: 'الأساسية',
            catClass: 'cat-basic',
            desc: 'تسجيل الحضور اليومي، الورديات، ساعات العمل، والغياب'
        },
        {
            id: 'screen-salary-adjustments',
            name: 'تسويات الرواتب (سلف / مكافآت)',
            icon: '⚖️',
            category: 'المالية',
            catClass: 'cat-financial',
            desc: 'تسجيل السلف، المكافآت، الخصومات، والجزاءات الفردية والجماعية'
        },
        {
            id: 'screen-payroll-summary',
            name: 'إجمالي رواتب الموظفين (المسير)',
            icon: '📊',
            category: 'المالية',
            catClass: 'cat-financial',
            desc: 'كشف مسير الرواتب الشهري الإجمالي وصافي المستحقات'
        },
        {
            id: 'screen-single-sarki',
            name: 'سركي موظف تفصيلي فردي',
            icon: '📑',
            category: 'السراكي',
            catClass: 'cat-sarki',
            desc: 'عرض وطباعة مفردات وسركي راتب موظف محدد بالتفصيل الكامل'
        },
        {
            id: 'screen-bulk-payslips',
            name: 'طباعة السراكي المجمعة (A4)',
            icon: '🖨️',
            category: 'السراكي',
            catClass: 'cat-sarki',
            desc: 'تصدير وطباعة سراكي جميع الموظفين مجمعة (3 سراكي بالصفحة)'
        },
        {
            id: 'screen-payroll-delivery',
            name: 'كشف تسليم وصرف الرواتب',
            icon: '💵',
            category: 'المالية',
            catClass: 'cat-financial',
            desc: 'كشف توقيعات استلام وتسليم الرواتب وخانات الاستلام'
        },
        {
            id: 'screen-emp-general-report',
            name: 'تقرير عام شامل لموظف',
            icon: '👤',
            category: 'التقارير',
            catClass: 'cat-reports',
            desc: 'سجل الحركات التاريخي الشامل لموظف معين خلال أي فترة'
        },
        {
            id: 'screen-totals-report',
            name: 'تقارير إجمالي الموظفين',
            icon: '📈',
            category: 'التقارير',
            catClass: 'cat-reports',
            desc: 'تحليلات وإجماليات الأقسام والرواتب ونسب الصرف'
        },
        {
            id: 'screen-backup-restore',
            name: 'النسخ الاحتياطي والاستعادة',
            icon: '💾',
            category: 'الأمان',
            catClass: 'cat-security',
            desc: 'تصدير واستيراد النسخ الاحتياطية وتفريغ الذاكرة'
        },
        {
            id: 'screen-users-roles',
            name: 'إدارة المستخدمين والصلاحيات',
            icon: '🔐',
            category: 'الأمان',
            catClass: 'cat-security',
            desc: 'إضافة وتعديل المستخدمين وتخصيص صلاحيات شاشات المنظومة'
        },
        {
            id: 'screen-firebase-settings',
            name: 'سحابة وربط Firebase',
            icon: '☁️',
            category: 'الأمان',
            catClass: 'cat-security',
            desc: 'إعدادات ومزامنة السحابة مع Google Firebase والعمل الموحد'
        },
        {
            id: 'screen-employee-sarki',
            name: 'سركي الموظف الذاتي',
            icon: '👤',
            category: 'الموظفين',
            catClass: 'cat-employee',
            desc: 'شاشة مخصصة للموظف للاطلاع على سركي حسابه الفردي فقط'
        }
    ];

    const ALL_SCREEN_IDS = ALL_SYSTEM_SCREENS.map(s => s.id);

    // المستخدمين الافتراضيين بصلاحياتهم المعيارية
    const DEFAULT_USERS = [
        {
            username: 'admin',
            fullName: 'المدير العام',
            role: 'admin',
            pin: '1234',
            permissions: [...ALL_SCREEN_IDS],
            createdAt: '2026-01-01'
        },
        {
            username: 'hesabat',
            fullName: 'أ. عاطف (الحسابات)',
            role: 'accountant',
            pin: '1234',
            permissions: [
                'screen-welcome',
                'screen-employees',
                'screen-attendance',
                'screen-salary-adjustments',
                'screen-payroll-summary',
                'screen-single-sarki',
                'screen-bulk-payslips',
                'screen-payroll-delivery',
                'screen-emp-general-report',
                'screen-totals-report',
                'screen-backup-restore',
                'screen-firebase-settings'
            ],
            createdAt: '2026-01-01'
        },
        {
            username: 'moshref',
            fullName: 'مشرف الحضور',
            role: 'supervisor',
            pin: '1234',
            permissions: [
                'screen-welcome',
                'screen-attendance'
            ],
            createdAt: '2026-01-01'
        }
    ];

    // ترحيل وتأكيد وجود مصفوفة الصلاحيات لكل مستخدم في قاعدة البيانات
    function migrateUsersDb(db) {
        if (!Array.isArray(db) || db.length === 0) return DEFAULT_USERS;
        return db.map(u => {
            if (!u.permissions || !Array.isArray(u.permissions) || u.permissions.length === 0) {
                if (u.role === 'admin') {
                    u.permissions = [...ALL_SCREEN_IDS];
                } else if (u.role === 'accountant') {
                    u.permissions = [
                        'screen-welcome',
                        'screen-employees',
                        'screen-attendance',
                        'screen-salary-adjustments',
                        'screen-payroll-summary',
                        'screen-single-sarki',
                        'screen-bulk-payslips',
                        'screen-payroll-delivery',
                        'screen-emp-general-report',
                        'screen-totals-report',
                        'screen-backup-restore',
                        'screen-firebase-settings'
                    ];
                } else if (u.role === 'supervisor') {
                    u.permissions = ['screen-welcome', 'screen-attendance'];
                } else if (u.role === 'employee') {
                    u.permissions = ['screen-employee-sarki'];
                } else {
                    u.permissions = ['screen-welcome'];
                }
            }
            return u;
        });
    }

    let usersDb = JSON.parse(localStorage.getItem('erp_users_db') || 'null');
    usersDb = migrateUsersDb(usersDb);
    localStorage.setItem('erp_users_db', JSON.stringify(usersDb));

    // حالة المصادقة (Authentication State)
    let isUserAuthenticated = false;
    let currentUser = null;

    // استعادة جلسة العمل إن وجدت
    const authSessionRaw = sessionStorage.getItem('erp_auth_session');
    if (authSessionRaw) {
        try {
            const parsed = JSON.parse(authSessionRaw);
            const found = usersDb.find(u => u.username.toLowerCase() === (parsed.username || '').toLowerCase());
            if (found) {
                currentUser = found;
                isUserAuthenticated = true;
            }
        } catch(e) {}
    }

    // إذا لم تكن هناك جلسة نشطة، اجعل المستخدم الحالي مجهزاً ولكن بدون مصادقة
    if (!currentUser) {
        currentUser = usersDb[0];
    }

    window.usersDb = usersDb;
    window.currentUser = currentUser;
    window.isUserAuthenticated = isUserAuthenticated;

    // ── تهيئة نظام المصادقة والصلاحيات ──────────────────────────────────
    function initAuthSystem() {
        renderPermissionsCheckboxes();
        populateUserSelectDropdowns();

        if (!isUserAuthenticated) {
            // قفل المنظومة فوراً عند فتح البرنامج لأول مرة
            lockScreenModal();
        } else {
            document.body.classList.remove('app-locked');
            updateSidebarUserDisplay();
            applyRolePermissions();
        }
    }

    function checkAuthAndRequireLogin() {
        if (!isUserAuthenticated) {
            lockScreenModal();
        }
    }

    // ── قفل وتسجيل الخروج ─────────────────────────────────────────────
    function lockScreenModal() {
        isUserAuthenticated = false;
        window.isUserAuthenticated = false;
        document.body.classList.add('app-locked');

        const uInput = document.getElementById('lock-username-input');
        const pInput = document.getElementById('lock-password-input');
        const errMsg = document.getElementById('lock-error-msg');

        if (errMsg) errMsg.style.display = 'none';
        if (pInput) pInput.value = '';

        const modal = document.getElementById('modal-lock-screen');
        if (modal) {
            modal.style.display = 'flex';
        }

        setTimeout(() => {
            if (uInput && !uInput.value.trim()) {
                uInput.focus();
            } else if (pInput) {
                pInput.focus();
            }
        }, 120);
    }

    function logoutAndLockSystem() {
        sessionStorage.removeItem('erp_auth_session');
        isUserAuthenticated = false;
        window.isUserAuthenticated = false;
        currentUser = null;
        window.currentUser = null;
        lockScreenModal();
        showToast('تم تسجيل الخروج وقفل المنظومة بنجاح.');
    }

    // ── تسجيل الدخول بواسطة اسم المستخدم وكلمة المرور ─────────────────────
    function handleUnlockSystem(e) {
        if (e && e.preventDefault) e.preventDefault();

        const uInput = document.getElementById('lock-username-input');
        const pInput = document.getElementById('lock-password-input');
        const errMsg = document.getElementById('lock-error-msg');

        const uName = (uInput ? uInput.value : '').trim().toLowerCase();
        const pwd = (pInput ? pInput.value : '').trim();

        if (!uName || !pwd) {
            if (errMsg) {
                errMsg.textContent = '⚠️ يرجى إدخال اسم المستخدم وكلمة المرور للمتابعة!';
                errMsg.style.display = 'block';
            }
            return;
        }

        const user = usersDb.find(u => u.username.toLowerCase() === uName);

        if (!user || String(user.pin).trim() !== pwd) {
            if (errMsg) {
                errMsg.textContent = '❌ اسم المستخدم أو كلمة المرور غير صحيحة! يرجى التأكد والمحاولة مرة أخرى.';
                errMsg.style.display = 'block';
            }
            if (pInput) {
                pInput.value = '';
                pInput.focus();
            }
            return;
        }

        // نجاح تسجيل الدخول
        currentUser = user;
        isUserAuthenticated = true;
        window.currentUser = currentUser;
        window.isUserAuthenticated = isUserAuthenticated;

        sessionStorage.setItem('erp_auth_session', JSON.stringify({
            username: user.username,
            loginTime: new Date().toISOString()
        }));
        localStorage.setItem('erp_current_user', JSON.stringify(currentUser));

        document.body.classList.remove('app-locked');
        const modal = document.getElementById('modal-lock-screen');
        if (modal) modal.style.display = 'none';

        if (pInput) pInput.value = '';
        if (errMsg) errMsg.style.display = 'none';

        updateSidebarUserDisplay();
        applyRolePermissions();
        renderUsersTable();
        showToast(`مرحباً بك يا ${currentUser.fullName}! تم فتح المنظومة بنجاح. 🎉`, 'success');
    }

    function togglePasswordVisibility(inputId, btnEl) {
        const inp = document.getElementById(inputId);
        if (!inp) return;
        if (inp.type === 'password') {
            inp.type = 'text';
            if (btnEl) btnEl.textContent = '🙈';
        } else {
            inp.type = 'password';
            if (btnEl) btnEl.textContent = '👁️';
        }
    }

    // ── تحديث مظهر المستخدم في القائمة الجانبية ────────────────────────
    function updateSidebarUserDisplay() {
        const nameEl = document.getElementById('sidebar-user-name');
        const badgeEl = document.getElementById('sidebar-user-role-badge');
        if (!nameEl || !badgeEl) return;

        nameEl.textContent = currentUser ? currentUser.fullName : 'المدير العام';
        const role = currentUser ? currentUser.role : 'admin';
        badgeEl.className = `role-badge role-${role}`;

        let roleText = 'مدير النظام';
        if (role === 'accountant') roleText = 'مسؤول حسابات';
        else if (role === 'supervisor') roleText = 'مشرف حضور';
        else if (role === 'employee') roleText = 'موظف';
        else if (role === 'custom') roleText = 'مخصص';

        badgeEl.textContent = roleText;
    }

    // ── رسم شبكة كروت اختيار الصلاحيات في نموذج المستخدم ────────────────
    function renderPermissionsCheckboxes(selectedPermissions) {
        const container = document.getElementById('screen-permissions-grid');
        if (!container) return;

        const effectiveSelected = Array.isArray(selectedPermissions)
            ? selectedPermissions
            : (selectedPermissions ? ALL_SCREEN_IDS : [...ALL_SCREEN_IDS]);

        container.innerHTML = '';

        ALL_SYSTEM_SCREENS.forEach(screen => {
            const isChecked = effectiveSelected.includes(screen.id);
            const card = document.createElement('div');
            card.className = `permission-card ${isChecked ? 'selected' : ''}`;
            card.id = `perm-card-${screen.id}`;
            card.onclick = function(e) {
                if (e.target.tagName !== 'INPUT') {
                    const chk = card.querySelector('input[type="checkbox"]');
                    if (chk) {
                        chk.checked = !chk.checked;
                        onPermissionCheckboxChanged(chk);
                    }
                }
            };

            card.innerHTML = `
                <input type="checkbox" name="user_permission" value="${screen.id}" id="chk-perm-${screen.id}" 
                       ${isChecked ? 'checked' : ''} onchange="onPermissionCheckboxChanged(this)">
                <div class="permission-card-body">
                    <div class="permission-card-title">
                        <span>${screen.icon}</span>
                        <span>${screen.name}</span>
                        <span class="permission-badge-cat ${screen.catClass}">${screen.category}</span>
                    </div>
                    <div class="permission-card-desc">${screen.desc}</div>
                </div>
            `;
            container.appendChild(card);
        });

        updatePermissionsCounter();
    }

    function onPermissionCheckboxChanged(checkbox) {
        const card = document.getElementById(`perm-card-${checkbox.value}`);
        if (card) {
            if (checkbox.checked) {
                card.classList.add('selected');
            } else {
                card.classList.remove('selected');
            }
        }
        updatePermissionsCounter();
    }

    function updatePermissionsCounter() {
        const checked = document.querySelectorAll('input[name="user_permission"]:checked');
        const counter = document.getElementById('perm-selected-counter');
        if (counter) {
            counter.textContent = `${checked.length} من ${ALL_SYSTEM_SCREENS.length} شاشة`;
            if (checked.length === ALL_SYSTEM_SCREENS.length) {
                counter.className = 'badge badge-status-active';
            } else if (checked.length === 0) {
                counter.className = 'badge badge-status-inactive';
            } else {
                counter.className = 'badge badge-dept';
            }
        }
    }

    function getSelectedScreenPermissions() {
        const checkboxes = document.querySelectorAll('input[name="user_permission"]:checked');
        return Array.from(checkboxes).map(c => c.value);
    }

    function setAllScreenPermissions(selectAll) {
        const checkboxes = document.querySelectorAll('input[name="user_permission"]');
        checkboxes.forEach(chk => {
            chk.checked = selectAll;
            const card = document.getElementById(`perm-card-${chk.value}`);
            if (card) {
                if (selectAll) card.classList.add('selected');
                else card.classList.remove('selected');
            }
        });
        updatePermissionsCounter();
    }

    function applyRolePresetPermissions(role) {
        let presetScreens = [];
        if (role === 'admin') {
            presetScreens = [...ALL_SCREEN_IDS];
        } else if (role === 'accountant') {
            presetScreens = [
                'screen-welcome',
                'screen-employees',
                'screen-attendance',
                'screen-salary-adjustments',
                'screen-payroll-summary',
                'screen-single-sarki',
                'screen-bulk-payslips',
                'screen-payroll-delivery',
                'screen-emp-general-report',
                'screen-totals-report',
                'screen-backup-restore',
                'screen-firebase-settings'
            ];
        } else if (role === 'supervisor') {
            presetScreens = ['screen-welcome', 'screen-attendance'];
        } else if (role === 'employee') {
            presetScreens = ['screen-employee-sarki'];
        } else {
            presetScreens = ['screen-welcome'];
        }

        const checkboxes = document.querySelectorAll('input[name="user_permission"]');
        checkboxes.forEach(chk => {
            const shouldCheck = presetScreens.includes(chk.value);
            chk.checked = shouldCheck;
            const card = document.getElementById(`perm-card-${chk.value}`);
            if (card) {
                if (shouldCheck) card.classList.add('selected');
                else card.classList.remove('selected');
            }
        });
        updatePermissionsCounter();
    }

    function onNewUserRoleChanged() {
        const roleSelect = document.getElementById('new-user-role');
        const wrapper = document.getElementById('new-user-employee-wrapper');
        if (!roleSelect) return;

        const role = roleSelect.value;
        if (wrapper) {
            if (role === 'employee') {
                wrapper.style.display = 'block';
                populateNewUserEmployeeSelect();
            } else {
                wrapper.style.display = 'none';
            }
        }

        if (role !== 'custom') {
            applyRolePresetPermissions(role);
        }
    }

    // ── تطبيق صلاحيات المستخدم النشط على القائمة والشاشات ─────────────
    function applyRolePermissions() {
        if (!currentUser) return;

        // التأكد من وجود الصلاحيات
        if (!currentUser.permissions || !Array.isArray(currentUser.permissions)) {
            currentUser.permissions = (currentUser.role === 'admin') ? [...ALL_SCREEN_IDS] : ['screen-welcome'];
        }

        const userPerms = currentUser.permissions;
        const isAdmin = currentUser.role === 'admin';

        // إظهار/إخفاء أزرار الشاشات في القائمة الجانبية
        ALL_SYSTEM_SCREENS.forEach(screen => {
            const navBtn = document.getElementById(`nav-${screen.id}`);
            if (!navBtn) return;

            const isAllowed = isAdmin || userPerms.includes(screen.id);
            navBtn.style.display = isAllowed ? 'flex' : 'none';
        });

        // التحقق من أن الشاشة الحالية مسموح بها للمستخدم
        const activeView = document.querySelector('.screen-view.active');
        const activeScreenId = activeView ? activeView.id : 'screen-welcome';
        const isCurrentAllowed = isAdmin || userPerms.includes(activeScreenId);

        if (!isCurrentAllowed) {
            // تحويل المستخدم لأول شاشة مصرح له بفتحها
            const firstAllowed = ALL_SYSTEM_SCREENS.find(s => isAdmin || userPerms.includes(s.id));
            if (firstAllowed && typeof switchScreen === 'function') {
                const targetBtn = document.getElementById(`nav-${firstAllowed.id}`);
                switchScreen(firstAllowed.id, targetBtn);
            }
        }
    }

    // ── جدول المستخدمين في شاشة المستخدمين ───────────────────────────
    function renderUsersTable() {
        const tbody = document.getElementById('users-tbody');
        if (!tbody) return;
        tbody.innerHTML = '';

        if (typeof populateNewUserEmployeeSelect === 'function') {
            populateNewUserEmployeeSelect();
        }

        usersDb.forEach((u, idx) => {
            const isCurrent = currentUser && currentUser.username === u.username;
            const perms = Array.isArray(u.permissions) ? u.permissions : [];
            const isFull = perms.length === ALL_SYSTEM_SCREENS.length || u.role === 'admin';

            let roleName = 'مشرف حضور';
            let roleBadgeClass = 'role-supervisor';
            if (u.role === 'admin') {
                roleName = 'مدير النظام (Admin)';
                roleBadgeClass = 'role-admin';
            } else if (u.role === 'accountant') {
                roleName = 'مسؤول حسابات';
                roleBadgeClass = 'role-accountant';
            } else if (u.role === 'employee') {
                let empDesc = '';
                if (u.empId && typeof employees !== 'undefined') {
                    const foundEmp = employees.find(e => e.id === u.empId);
                    if (foundEmp) empDesc = ` (${foundEmp.name})`;
                }
                roleName = `موظف${empDesc}`;
                roleBadgeClass = 'role-employee';
            } else if (u.role === 'custom') {
                roleName = 'صلاحيات مخصصة';
                roleBadgeClass = 'role-accountant';
            }

            // ملخص الصلاحيات
            let permsBadge = '';
            if (isFull) {
                permsBadge = `<span class="badge" style="background:#dcfce7; color:#15803d; font-weight:700;">🟢 صلاحية كاملة (${perms.length} شاشة)</span>`;
            } else if (perms.length === 0) {
                permsBadge = `<span class="badge" style="background:#fee2e2; color:#b91c1c; font-weight:700;">🔴 لا توجد شاشات</span>`;
            } else {
                permsBadge = `<span class="badge" style="background:#e0f2fe; color:#0369a1; font-weight:700;">🔵 ${perms.length} من ${ALL_SYSTEM_SCREENS.length} شاشات</span>`;
            }

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${idx + 1}</td>
                <td><strong>${u.username}</strong></td>
                <td>${u.fullName}</td>
                <td><span class="role-badge ${roleBadgeClass}">${roleName}</span></td>
                <td>${permsBadge}</td>
                <td style="font-family:Consolas, monospace; letter-spacing:2px; font-size:13px;">••••</td>
                <td>${u.createdAt || '-'}</td>
                <td>
                    <span class="badge ${isCurrent ? 'badge-status-active' : 'badge-dept'}">
                        ${isCurrent ? '🟢 الحساب الحالي' : 'متاح'}
                    </span>
                </td>
                <td>
                    <div style="display:flex; gap:5px; justify-content:center; flex-wrap:wrap;">
                        <button type="button" class="btn-secondary" style="font-size:11px; padding:3px 8px; color:var(--accent); border-color:var(--accent);" onclick="startEditUser('${u.username}')" title="تعديل صلاحيات هذا المستخدم">✏️ تعديل الصلاحيات</button>
                        ${u.username === 'admin' ? '<span style="color:var(--text-muted); font-size:11px; align-self:center;">(أساسي)</span>' : `
                            <button type="button" class="btn-danger" style="font-size:11px; padding:3px 8px;" onclick="deleteUser('${u.username}')">🗑️ حذف</button>
                        `}
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    // ── بدء تعديل مستخدم موجود ───────────────────────────────────────
    function startEditUser(username) {
        if (currentUser && currentUser.role !== 'admin') {
            alert('⚠️ عذراً! تعديل المستخدمين مقتصر على مدير النظام (Admin) فقط.');
            return;
        }

        const user = usersDb.find(u => u.username === username);
        if (!user) return;

        const editIdInput = document.getElementById('editing-user-id');
        const usernameInput = document.getElementById('new-user-username');
        const fullnameInput = document.getElementById('new-user-fullname');
        const roleSelect = document.getElementById('new-user-role');
        const passwordInput = document.getElementById('new-user-password');
        const banner = document.getElementById('user-edit-mode-banner');
        const bannerTitle = document.getElementById('user-edit-banner-title');
        const formTitle = document.getElementById('user-form-panel-title');
        const submitBtn = document.getElementById('btn-save-user-submit');
        const cancelBtn = document.getElementById('btn-cancel-edit-user');
        const lblPassword = document.getElementById('lbl-user-password');

        if (editIdInput) editIdInput.value = user.username;
        if (usernameInput) {
            usernameInput.value = user.username;
            usernameInput.disabled = true; // منع تغيير اسم المستخدم لتجنب تكرار المفاتيح
        }
        if (fullnameInput) fullnameInput.value = user.fullName;
        if (roleSelect) roleSelect.value = user.role || 'custom';
        if (passwordInput) {
            passwordInput.value = '';
            passwordInput.required = false;
            passwordInput.placeholder = 'اتركه فارغاً للاحتفاظ بكلمة المرور الحالية';
        }
        if (lblPassword) {
            lblPassword.textContent = 'كلمة المرور (اختياري عند التعديل)';
        }

        // إظهار كروت الصلاحيات المحددة لهذا المستخدم بالضبط
        renderPermissionsCheckboxes(user.permissions || []);

        if (banner) banner.style.display = 'flex';
        if (bannerTitle) bannerTitle.textContent = `جاري تعديل صلاحيات المستخدم: ${user.fullName} (${user.username})`;
        if (formTitle) formTitle.textContent = `✏️ تعديل صلاحيات المستخدم (${user.username})`;
        if (submitBtn) submitBtn.textContent = '💾 حفظ تعديلات الصلاحيات';
        if (cancelBtn) cancelBtn.style.display = 'inline-block';

        // التمرير إلى النموذج
        const formEl = document.getElementById('user-create-form');
        if (formEl) {
            formEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    function cancelEditUser() {
        const editIdInput = document.getElementById('editing-user-id');
        const usernameInput = document.getElementById('new-user-username');
        const fullnameInput = document.getElementById('new-user-fullname');
        const passwordInput = document.getElementById('new-user-password');
        const banner = document.getElementById('user-edit-mode-banner');
        const formTitle = document.getElementById('user-form-panel-title');
        const submitBtn = document.getElementById('btn-save-user-submit');
        const cancelBtn = document.getElementById('btn-cancel-edit-user');
        const lblPassword = document.getElementById('lbl-user-password');

        if (editIdInput) editIdInput.value = '';
        if (usernameInput) {
            usernameInput.value = '';
            usernameInput.disabled = false;
        }
        if (fullnameInput) fullnameInput.value = '';
        if (passwordInput) {
            passwordInput.value = '';
            passwordInput.required = true;
            passwordInput.placeholder = 'أرقام أو حروف سرية';
        }
        if (lblPassword) {
            lblPassword.textContent = 'كلمة المرور / الرمز السري (PIN) *';
        }

        const roleSelect = document.getElementById('new-user-role');
        if (roleSelect) roleSelect.value = 'admin';

        if (banner) banner.style.display = 'none';
        if (formTitle) formTitle.textContent = '➕ إضافة مستخدم جديد للنظام';
        if (submitBtn) submitBtn.textContent = '💾 حفظ وإضافة المستخدم';
        if (cancelBtn) cancelBtn.style.display = 'none';

        renderPermissionsCheckboxes([...ALL_SCREEN_IDS]);
        onNewUserRoleChanged();
    }

    // ── حفظ مستخدم جديد أو تعديل مستخدم قائم ────────────────────────────
    function handleCreateUser(e) {
        e.preventDefault();
        if (currentUser && currentUser.role !== 'admin') {
            alert('⚠️ عذراً! إضافة وتعديل المستخدمين مقتصرة على مدير النظام (Admin) فقط.');
            return;
        }

        const editIdInput = document.getElementById('editing-user-id');
        const isEditing = editIdInput && editIdInput.value.trim() !== '';
        const editingUsername = isEditing ? editIdInput.value.trim() : '';

        const usernameInput = document.getElementById('new-user-username');
        const username = usernameInput ? usernameInput.value.trim().toLowerCase() : '';
        const fullName = document.getElementById('new-user-fullname').value.trim();
        const role = document.getElementById('new-user-role').value;
        const passwordInput = document.getElementById('new-user-password');
        const pin = passwordInput ? passwordInput.value.trim() : '';

        // استخراج الصلاحيات المحددة
        const selectedPermissions = getSelectedScreenPermissions();
        if (selectedPermissions.length === 0) {
            alert('⚠️ يرجى تحديد صلاحية شاشة واحدة على الأقل لهذا المستخدم!');
            return;
        }

        let empId = null;
        if (role === 'employee') {
            const empSelect = document.getElementById('new-user-employee-select');
            empId = empSelect ? parseInt(empSelect.value) : null;
            if (!empId) {
                alert('⚠️ يرجى اختيار الموظف المراد ربط هذا الحساب به أولاً!');
                return;
            }
        }

        if (isEditing) {
            // تحديث مستخدم موجود
            const targetUser = usersDb.find(u => u.username === editingUsername);
            if (!targetUser) {
                alert('⚠️ تعذر العثور على المستخدم المطلوب تعديله!');
                return;
            }

            targetUser.fullName = fullName;
            targetUser.role = role;
            targetUser.empId = empId;
            targetUser.permissions = selectedPermissions;
            if (pin) {
                targetUser.pin = pin;
            }

            localStorage.setItem('erp_users_db', JSON.stringify(usersDb));
            if (typeof pushSingleCollectionToFirebase === 'function') pushSingleCollectionToFirebase('users', usersDb);

            // إذا كان المستخدم المعدل هو نفسه المستخدم النشط حالياً
            if (currentUser && currentUser.username === editingUsername) {
                currentUser = targetUser;
                window.currentUser = currentUser;
                localStorage.setItem('erp_current_user', JSON.stringify(currentUser));
                updateSidebarUserDisplay();
                applyRolePermissions();
            }

            cancelEditUser();
            populateUserSelectDropdowns();
            renderUsersTable();
            showToast(`تم تحديث صلاحيات المستخدم (${fullName}) بنجاح! 🛡️`, 'success');
        } else {
            // إضافة مستخدم جديد
            if (usersDb.some(u => u.username === username)) {
                alert('⚠️ اسم المستخدم هذا موجود بالفعل! يرجى اختيار اسم مستخدم آخر.');
                return;
            }

            if (!pin) {
                alert('⚠️ يرجى كتابة كلمة المرور للمستخدم الجديد!');
                return;
            }

            const newUser = {
                username: username,
                fullName: fullName,
                role: role,
                empId: empId,
                pin: pin,
                permissions: selectedPermissions,
                createdAt: new Date().toISOString().split('T')[0]
            };

            usersDb.push(newUser);
            localStorage.setItem('erp_users_db', JSON.stringify(usersDb));
            if (typeof pushSingleCollectionToFirebase === 'function') pushSingleCollectionToFirebase('users', usersDb);

            cancelEditUser();
            populateUserSelectDropdowns();
            renderUsersTable();
            showToast(`تمت إضافة المستخدم (${fullName}) وتعيين صلاحياته بنجاح! 🎉`, 'success');
        }
    }

    function deleteUser(uName) {
        if (currentUser && currentUser.role !== 'admin') {
            alert('⚠️ عذراً! صلاحية حذف المستخدمين لمدير النظام فقط.');
            return;
        }
        if (uName === 'admin') {
            alert('⚠️ لا يمكن حذف حساب المدير العام الأساسي!');
            return;
        }
        if (currentUser && currentUser.username === uName) {
            alert('⚠️ لا يمكنك حذف الحساب النشط حالياً!');
            return;
        }
        if (confirm(`هل أنت متأكد من حذف المستخدم (${uName})؟`)) {
            usersDb = usersDb.filter(u => u.username !== uName);
            localStorage.setItem('erp_users_db', JSON.stringify(usersDb));
            if (typeof pushSingleCollectionToFirebase === 'function') pushSingleCollectionToFirebase('users', usersDb);
            populateUserSelectDropdowns();
            renderUsersTable();
            showToast('تم حذف المستخدم بنجاح.');
        }
    }

    // ── القوائم المنسدلة للمستخدمين (تبديل الحساب) ──────────────────────
    function populateUserSelectDropdowns() {
        const switchSel = document.getElementById('switch-user-select');
        if (!switchSel) return;
        switchSel.innerHTML = '';
        usersDb.forEach(u => {
            const opt = document.createElement('option');
            opt.value = u.username;
            const roleLabel = u.role === 'admin' ? 'مدير' : (u.role === 'accountant' ? 'حسابات' : (u.role === 'supervisor' ? 'إشراف' : 'موظف'));
            opt.textContent = `${u.fullName} (${roleLabel})`;
            if (currentUser && u.username === currentUser.username) opt.selected = true;
            switchSel.appendChild(opt);
        });
    }

    function openSwitchUserModal() {
        populateUserSelectDropdowns();
        const pwdInput = document.getElementById('switch-user-password');
        if (pwdInput) pwdInput.value = '';
        const err = document.getElementById('switch-user-error');
        if (err) err.style.display = 'none';
        const modal = document.getElementById('modal-switch-user');
        if (modal) modal.style.display = 'flex';
    }

    function closeSwitchUserModal() {
        const modal = document.getElementById('modal-switch-user');
        if (modal) modal.style.display = 'none';
    }

    function handleSwitchUserSubmit(e) {
        e.preventDefault();
        const uName = document.getElementById('switch-user-select').value;
        const pwd = document.getElementById('switch-user-password').value.trim();
        const user = usersDb.find(u => u.username === uName);

        if (!user || user.pin !== pwd) {
            const err = document.getElementById('switch-user-error');
            if (err) {
                err.textContent = '❌ رمز المرور غير صحيح لهذا المستخدم!';
                err.style.display = 'block';
            }
            return;
        }

        currentUser = user;
        isUserAuthenticated = true;
        window.currentUser = currentUser;
        window.isUserAuthenticated = isUserAuthenticated;

        sessionStorage.setItem('erp_auth_session', JSON.stringify({
            username: user.username,
            loginTime: new Date().toISOString()
        }));
        localStorage.setItem('erp_current_user', JSON.stringify(currentUser));

        closeSwitchUserModal();
        updateSidebarUserDisplay();
        applyRolePermissions();
        renderUsersTable();
        showToast(`تم التبديل بنجاح إلى حساب [${currentUser.fullName}]`);
    }

    // ── تسجيل حساب موظف ذاتياً ─────────────────────────────────────────
    function openEmployeeSelfRegisterModal() {
        const modal = document.getElementById('modal-employee-register');
        if (!modal) return;
        const sel = document.getElementById('self-reg-emp-select');
        if (sel) {
            sel.innerHTML = '<option value="">-- اختر اسمك من قائمة الموظفين --</option>';
            if (typeof employees !== 'undefined' && Array.isArray(employees)) {
                employees.forEach(emp => {
                    const opt = document.createElement('option');
                    opt.value = emp.id;
                    opt.textContent = `${emp.name} (#${emp.id || emp.code}) - ${emp.job || 'موظف'}`;
                    sel.appendChild(opt);
                });
            }
        }
        const uInp = document.getElementById('self-reg-username');
        const pInp = document.getElementById('self-reg-password');
        const err = document.getElementById('self-reg-error');
        if (uInp) uInp.value = '';
        if (pInp) pInp.value = '';
        if (err) err.style.display = 'none';

        modal.style.display = 'flex';
    }

    function closeEmployeeSelfRegisterModal() {
        const modal = document.getElementById('modal-employee-register');
        if (modal) modal.style.display = 'none';
    }

    function onSelfRegEmployeeSelected() {
        const sel = document.getElementById('self-reg-emp-select');
        if (!sel || !sel.value) return;
        const empId = parseInt(sel.value);
        const emp = typeof employees !== 'undefined' ? employees.find(e => e.id === empId) : null;
        if (!emp) return;

        const uInp = document.getElementById('self-reg-username');
        if (uInp && !uInp.value.trim()) {
            uInp.value = 'emp_' + (emp.code ? emp.code.toLowerCase().replace(/\s+/g, '') : emp.id);
        }
    }

    function handleEmployeeSelfRegister(e) {
        e.preventDefault();
        const sel = document.getElementById('self-reg-emp-select');
        const uInp = document.getElementById('self-reg-username');
        const pInp = document.getElementById('self-reg-password');
        const err = document.getElementById('self-reg-error');

        const empId = sel ? parseInt(sel.value) : null;
        const username = uInp ? uInp.value.trim().toLowerCase() : '';
        const pin = pInp ? pInp.value.trim() : '';

        if (!empId) {
            if (err) { err.textContent = '❌ يرجى اختيار اسمك من قائمة الموظفين!'; err.style.display = 'block'; }
            return;
        }

        if (!username || !pin) {
            if (err) { err.textContent = '❌ يرجى ملء اسم المستخدم وكلمة المرور!'; err.style.display = 'block'; }
            return;
        }

        if (usersDb.some(u => u.username === username)) {
            if (err) { err.textContent = '❌ اسم المستخدم هذا موجود بالفعل! اختر اسماً آخر.'; err.style.display = 'block'; }
            return;
        }

        const emp = typeof employees !== 'undefined' ? employees.find(e => e.id === empId) : null;
        const fullName = emp ? emp.name : username;

        const newUser = {
            username: username,
            fullName: fullName,
            role: 'employee',
            empId: empId,
            pin: pin,
            permissions: ['screen-employee-sarki'],
            createdAt: new Date().toISOString().split('T')[0]
        };

        usersDb.push(newUser);
        localStorage.setItem('erp_users_db', JSON.stringify(usersDb));
        if (typeof pushSingleCollectionToFirebase === 'function') pushSingleCollectionToFirebase('users', usersDb);

        currentUser = newUser;
        isUserAuthenticated = true;
        window.currentUser = currentUser;
        window.isUserAuthenticated = isUserAuthenticated;

        sessionStorage.setItem('erp_auth_session', JSON.stringify({
            username: newUser.username,
            loginTime: new Date().toISOString()
        }));
        localStorage.setItem('erp_current_user', JSON.stringify(currentUser));

        closeEmployeeSelfRegisterModal();
        closeSwitchUserModal();
        const lockModal = document.getElementById('modal-lock-screen');
        if (lockModal) lockModal.style.display = 'none';
        document.body.classList.remove('app-locked');

        populateUserSelectDropdowns();
        updateSidebarUserDisplay();
        applyRolePermissions();
        showToast(`مرحباً بك يا ${fullName}! تم تسجيل حسابك والدخول إلى سركي الراتب بنجاح. 🎉`, 'success');
    }

    function populateNewUserEmployeeSelect() {
        const sel = document.getElementById('new-user-employee-select');
        if (!sel) return;
        const curVal = sel.value;
        sel.innerHTML = '<option value="">-- اختر الموظف لربطه بهذا الحساب --</option>';
        if (typeof employees !== 'undefined' && Array.isArray(employees)) {
            employees.forEach(emp => {
                const opt = document.createElement('option');
                opt.value = emp.id;
                opt.textContent = `${emp.name} (كود: #${emp.id || emp.code}) - ${emp.job || 'موظف'}`;
                if (String(emp.id) === String(curVal)) opt.selected = true;
                sel.appendChild(opt);
            });
        }
    }

    function onNewUserEmployeeSelected() {
        const sel = document.getElementById('new-user-employee-select');
        if (!sel || !sel.value) return;
        const empId = parseInt(sel.value);
        const emp = typeof employees !== 'undefined' ? employees.find(e => e.id === empId) : null;
        if (!emp) return;

        const fullNameInput = document.getElementById('new-user-fullname');
        const usernameInput = document.getElementById('new-user-username');
        if (fullNameInput && !fullNameInput.value.trim()) {
            fullNameInput.value = emp.name;
        }
        if (usernameInput && !usernameInput.value.trim()) {
            usernameInput.value = 'emp_' + (emp.code ? emp.code.toLowerCase().replace(/\s+/g, '') : emp.id);
        }
    }

    // تصدير الدوال للنطاق العام
    window.initAuthSystem = initAuthSystem;
    window.checkAuthAndRequireLogin = checkAuthAndRequireLogin;
    window.lockScreenModal = lockScreenModal;
    window.logoutAndLockSystem = logoutAndLockSystem;
    window.handleUnlockSystem = handleUnlockSystem;
    window.togglePasswordVisibility = togglePasswordVisibility;
    window.renderPermissionsCheckboxes = renderPermissionsCheckboxes;
    window.setAllScreenPermissions = setAllScreenPermissions;
    window.applyRolePresetPermissions = applyRolePresetPermissions;
    window.onNewUserRoleChanged = onNewUserRoleChanged;
    window.startEditUser = startEditUser;
    window.cancelEditUser = cancelEditUser;
    window.handleCreateUser = handleCreateUser;
    window.deleteUser = deleteUser;
    window.openSwitchUserModal = openSwitchUserModal;
    window.closeSwitchUserModal = closeSwitchUserModal;
    window.handleSwitchUserSubmit = handleSwitchUserSubmit;
    window.openEmployeeSelfRegisterModal = openEmployeeSelfRegisterModal;
    window.closeEmployeeSelfRegisterModal = closeEmployeeSelfRegisterModal;
    window.onSelfRegEmployeeSelected = onSelfRegEmployeeSelected;
    window.handleEmployeeSelfRegister = handleEmployeeSelfRegister;
    window.applyRolePermissions = applyRolePermissions;
    window.renderUsersTable = renderUsersTable;
