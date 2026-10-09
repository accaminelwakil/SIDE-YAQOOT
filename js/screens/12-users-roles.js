    // ====================================================================
    // نظام المستخدمين وإدارة الصلاحيات (اطلاع وتعديل لكل شاشة)
    // Users & Screen Permissions (View & Edit Granular Control)
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
        },
        {
            id: 'screen-leaves-permissions',
            name: 'الإجازات والأذونات والاعتماد',
            icon: '🏖️',
            category: 'الموظفين',
            catClass: 'cat-employee',
            desc: 'إدارة طلبات الإجازات والأذونات ودورة اعتماد المدير المباشر'
        },
        {
            id: 'screen-punches-payroll',
            name: 'بصمة الموظفين والرواتب',
            icon: '📍',
            category: 'المالية',
            catClass: 'cat-financial',
            desc: 'مراجعة بصمات الحضور واحتساب الرواتب بناءً على البصمة الذكية'
        },
        {
            id: 'screen-attendance-comparison',
            name: 'مقارنة البصمة واليدوي',
            icon: '⚖️',
            category: 'التقارير',
            catClass: 'cat-reports',
            desc: 'تقرير مطابقة وتدقيق ساعات الحضور بالبصمة مع الإدخال اليدوي'
        }
    ];

    const ALL_SCREEN_IDS = ALL_SYSTEM_SCREENS.map(s => s.id);

    const DEFAULT_USERS = [];

    // ترحيل وتأكيد وجود مصفوفة الصلاحيات وخريطة الاطلاع والتعديل لكل مستخدم
    function migrateUsersDb(db) {
        if (!Array.isArray(db) || db.length === 0) return DEFAULT_USERS;
        return db.map(u => {
            delete u.pin;
            delete u.password;
            delete u.passwordHash;
            if (!u.screenAccess || typeof u.screenAccess !== 'object') {
                u.screenAccess = {};
                if (u.role === 'admin') {
                    ALL_SCREEN_IDS.forEach(sid => { u.screenAccess[sid] = 'edit'; });
                } else if (u.role === 'accountant') {
                    const editScreens = ['screen-salary-adjustments', 'screen-payroll-summary', 'screen-single-sarki', 'screen-bulk-payslips', 'screen-payroll-delivery', 'screen-backup-restore', 'screen-firebase-settings', 'screen-leaves-permissions', 'screen-punches-payroll'];
                    const viewScreens = ['screen-welcome', 'screen-employees', 'screen-attendance', 'screen-emp-general-report', 'screen-totals-report', 'screen-attendance-comparison'];
                    editScreens.forEach(sid => { u.screenAccess[sid] = 'edit'; });
                    viewScreens.forEach(sid => { u.screenAccess[sid] = 'view'; });
                } else if (u.role === 'supervisor') {
                    u.screenAccess['screen-attendance'] = 'edit';
                    u.screenAccess['screen-welcome'] = 'view';
                    u.screenAccess['screen-leaves-permissions'] = 'edit';
                } else if (u.role === 'employee') {
                    u.screenAccess['screen-employee-sarki'] = 'view';
                    u.screenAccess['screen-leaves-permissions'] = 'edit';
                } else {
                    u.screenAccess['screen-welcome'] = 'view';
                    u.screenAccess['screen-leaves-permissions'] = 'edit';
                }
            }

            // إتاحة شاشة الإجازات والأذونات لجميع المستخدمين والموظفين دوماً
            if (!u.screenAccess['screen-leaves-permissions'] || u.screenAccess['screen-leaves-permissions'] === 'none') {
                u.screenAccess['screen-leaves-permissions'] = 'edit';
            }

            // مزامنة permissions كمصفوفة من الشاشات التي يحق له رؤيتها
            u.permissions = Object.keys(u.screenAccess).filter(sid => u.screenAccess[sid] && u.screenAccess[sid] !== 'none');
            return u;
        });
    }

    let usersDb = JSON.parse(localStorage.getItem('erp_users_db') || 'null');
    usersDb = migrateUsersDb(usersDb);
    localStorage.setItem('erp_users_db', JSON.stringify(usersDb));

    // حالة المصادقة (Authentication State)
    let isUserAuthenticated = false;
    let currentUser = null;

    window.usersDb = usersDb;
    window.currentUser = currentUser;
    window.isUserAuthenticated = isUserAuthenticated;

    // ── دوال فحص مستويات الصلاحية (اطلاع / تعديل) ─────────────────────
    function canViewScreen(screenId) {
        if (!currentUser) return false;
        if (currentUser.role === 'admin') return true;
        // شاشة الإجازات والأذونات متاحة لجميع المستخدمين لتقديم طلباتهم
        if (screenId === 'screen-leaves-permissions') return true;
        if (currentUser.screenAccess && currentUser.screenAccess[screenId]) {
            return currentUser.screenAccess[screenId] === 'edit' || currentUser.screenAccess[screenId] === 'view';
        }
        return Array.isArray(currentUser.permissions) && currentUser.permissions.includes(screenId);
    }

    function canEditScreen(screenId) {
        if (!currentUser) return false;
        if (currentUser.role === 'admin') return true;
        if (screenId === 'screen-leaves-permissions') return true;
        if (currentUser.screenAccess && currentUser.screenAccess[screenId]) {
            return currentUser.screenAccess[screenId] === 'edit';
        }
        return false;
    }

    // تطبيق وضع الاطلاع فقط على واجهة الشاشة
    function applyScreenAccessMode(screenId) {
        const screenEl = document.getElementById(screenId);
        if (!screenEl) return;

        // إزالة أي شريط تنبيه سابق
        const oldBanner = screenEl.querySelector('.screen-view-only-banner');
        if (oldBanner) oldBanner.remove();

        const isEditAllowed = canEditScreen(screenId);

        if (!isEditAllowed) {
            screenEl.classList.add('view-only-mode');
            const banner = document.createElement('div');
            banner.className = 'screen-view-only-banner';
            banner.innerHTML = `
                <span style="font-size:20px;">👁️</span>
                <div>
                    <strong>وضع الاطلاع فقط (عرض واستعراض):</strong>
                    <span style="font-weight:normal; margin-right:4px;">لديك صلاحية تصفح واستعراض وطباعة بيانات هذه الشاشة فقط، ولا يمكنك إضافة أو تعديل أو حفظ أو حذف أي سجلات.</span>
                </div>
            `;
            const header = screenEl.querySelector('.content-header');
            if (header) {
                header.after(banner);
            } else {
                screenEl.prepend(banner);
            }
        } else {
            screenEl.classList.remove('view-only-mode');
        }
    }

    window.canViewScreen = canViewScreen;
    window.canEditScreen = canEditScreen;
    window.applyScreenAccessMode = applyScreenAccessMode;

    // ── تهيئة نظام المصادقة والصلاحيات ──────────────────────────────────
    function initAuthSystem() {
        renderPermissionsCheckboxes();
        populateUserSelectDropdowns();

        if (!isUserAuthenticated) {
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
        if (modal) modal.style.display = 'flex';

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
        localStorage.removeItem('erp_current_user');
        if (typeof firebase !== 'undefined' && firebase.apps.length) {
            firebase.auth(firebase.app('SidiYaqoutApp')).signOut().catch(error => console.error('Firebase sign-out failed:', error));
        }
        isUserAuthenticated = false;
        window.isUserAuthenticated = false;
        currentUser = null;
        window.currentUser = null;
        lockScreenModal();
        showToast('تم تسجيل الخروج وقفل المنظومة بنجاح.');
    }

    // ── تسجيل الدخول بواسطة اسم المستخدم وكلمة المرور ─────────────────────
    async function handleUnlockSystem(e) {
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

        let user;
        try {
            user = await window.signInToFirebase(uName, pwd);
        } catch (error) {
            console.error('Login failed:', error);
            if (errMsg) {
                errMsg.textContent = error.message || 'اسم المستخدم أو كلمة المرور غير صحيحة.';
                errMsg.style.display = 'block';
            }
            if (pInput) {
                pInput.value = '';
                pInput.focus();
            }
            return;
        }
        if (!user || !user.username) {
            if (errMsg) {
                errMsg.textContent = 'تعذر استعادة ملف المستخدم من الخادم.';
                errMsg.style.display = 'block';
            }
            return;
        }
        if (user.role !== 'admin') {
            usersDb = migrateUsersDb([user]);
            localStorage.setItem('erp_users_db', JSON.stringify(usersDb));
        } else if (!usersDb.some(entry => entry.username === user.username)) {
            usersDb = migrateUsersDb([user]);
            localStorage.setItem('erp_users_db', JSON.stringify(usersDb));
        }

        currentUser = user;
        isUserAuthenticated = true;
        window.currentUser = currentUser;
        window.isUserAuthenticated = isUserAuthenticated;
        try {
            await window.activateAuthenticatedFirebaseSession();
            if (typeof window.loadGeofenceConfig === 'function') await window.loadGeofenceConfig();
        } catch (error) {
            console.error('Post-login data synchronization failed:', error);
        }

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
        if (typeof checkUserNotificationsOnLogin === 'function') {
            checkUserNotificationsOnLogin(currentUser);
        }

        // توجيه الموظف لتغيير كلمة المرور الافتراضية عند أول تسجيل دخول لحماية حسابه
        if (!currentUser.hasChangedPassword) {
            setTimeout(() => {
                if (typeof openChangePasswordModal === 'function') {
                    openChangePasswordModal(true);
                }
            }, 800);
        }
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

    // ── رسم شبكة كروت الصلاحيات (اطلاع وتعديل) في نموذج المستخدم ───────
    function renderPermissionsCheckboxes(screenAccessConfig) {
        const container = document.getElementById('screen-permissions-grid');
        if (!container) return;

        const accessMap = screenAccessConfig || ALL_SCREEN_IDS.reduce((acc, sid) => ({ ...acc, [sid]: 'edit' }), {});

        container.innerHTML = '';

        ALL_SYSTEM_SCREENS.forEach(screen => {
            const level = accessMap[screen.id] || 'none';
            const isView = level === 'view' || level === 'edit';
            const isEdit = level === 'edit';

            let cardClass = '';
            if (isEdit) cardClass = 'perm-edit-active';
            else if (isView) cardClass = 'perm-view-active';

            const card = document.createElement('div');
            card.className = `permission-card ${cardClass}`;
            card.id = `perm-card-${screen.id}`;

            card.innerHTML = `
                <div class="permission-card-body">
                    <div class="permission-card-title">
                        <span>${screen.icon}</span>
                        <span>${screen.name}</span>
                        <span class="permission-badge-cat ${screen.catClass}">${screen.category}</span>
                    </div>
                    <div class="permission-card-desc">${screen.desc}</div>
                    
                    <div class="permission-actions-bar">
                        <label class="perm-option-label perm-view-label" title="السماح باستعراض وقراءة بيانات الشاشة">
                            <input type="checkbox" id="chk-view-${screen.id}" class="chk-perm-view" 
                                   ${isView ? 'checked' : ''} onchange="onPermLevelChanged('${screen.id}', 'view')">
                            <span>👁️ اطلاع (عرض)</span>
                        </label>
                        <label class="perm-option-label perm-edit-label" title="السماح بالإدخال والتعديل والحفظ والحذف">
                            <input type="checkbox" id="chk-edit-${screen.id}" class="chk-perm-edit" 
                                   ${isEdit ? 'checked' : ''} onchange="onPermLevelChanged('${screen.id}', 'edit')">
                            <span>✏️ تعديل (كامل)</span>
                        </label>
                    </div>
                </div>
            `;
            container.appendChild(card);
        });

        updatePermissionsCounter();
    }

    function onPermLevelChanged(screenId, changedField) {
        const chkView = document.getElementById(`chk-view-${screenId}`);
        const chkEdit = document.getElementById(`chk-edit-${screenId}`);
        const card = document.getElementById(`perm-card-${screenId}`);
        if (!chkView || !chkEdit || !card) return;

        if (changedField === 'edit') {
            if (chkEdit.checked) {
                // التعديل يتضمن الاطلاع تلقائياً
                chkView.checked = true;
            }
        } else if (changedField === 'view') {
            if (!chkView.checked) {
                // إلغاء الاطلاع يلغي التعديل تلقائياً
                chkEdit.checked = false;
            }
        }

        card.classList.remove('perm-edit-active', 'perm-view-active');
        if (chkEdit.checked) {
            card.classList.add('perm-edit-active');
        } else if (chkView.checked) {
            card.classList.add('perm-view-active');
        }

        updatePermissionsCounter();
    }

    function updatePermissionsCounter() {
        const editCount = document.querySelectorAll('.chk-perm-edit:checked').length;
        const viewOnlyCount = Array.from(document.querySelectorAll('.chk-perm-view:checked')).filter(v => {
            const sid = v.id.replace('chk-view-', '');
            const ed = document.getElementById(`chk-edit-${sid}`);
            return !ed || !ed.checked;
        }).length;

        const counter = document.getElementById('perm-selected-counter');
        if (counter) {
            if (editCount === ALL_SYSTEM_SCREENS.length) {
                counter.textContent = `🟢 صلاحية كاملة (14 تعديل)`;
                counter.className = 'badge badge-status-active';
            } else if (editCount === 0 && viewOnlyCount === 0) {
                counter.textContent = `🔴 محجوب (0 مسموح)`;
                counter.className = 'badge badge-status-inactive';
            } else {
                counter.textContent = `✏️ ${editCount} تعديل | 👁️ ${viewOnlyCount} اطلاع فقط`;
                counter.className = 'badge badge-dept';
            }
        }
    }

    function getSelectedScreenAccess() {
        const accessMap = {};
        ALL_SYSTEM_SCREENS.forEach(screen => {
            const chkView = document.getElementById(`chk-view-${screen.id}`);
            const chkEdit = document.getElementById(`chk-edit-${screen.id}`);
            if (chkEdit && chkEdit.checked) {
                accessMap[screen.id] = 'edit';
            } else if (chkView && chkView.checked) {
                accessMap[screen.id] = 'view';
            } else {
                accessMap[screen.id] = 'none';
            }
        });
        return accessMap;
    }

    function setAllScreenPermissions(level) {
        ALL_SYSTEM_SCREENS.forEach(screen => {
            const chkView = document.getElementById(`chk-view-${screen.id}`);
            const chkEdit = document.getElementById(`chk-edit-${screen.id}`);
            const card = document.getElementById(`perm-card-${screen.id}`);

            if (level === 'edit') {
                if (chkView) chkView.checked = true;
                if (chkEdit) chkEdit.checked = true;
                if (card) { card.className = 'permission-card perm-edit-active'; }
            } else if (level === 'view') {
                if (chkView) chkView.checked = true;
                if (chkEdit) chkEdit.checked = false;
                if (card) { card.className = 'permission-card perm-view-active'; }
            } else {
                if (chkView) chkView.checked = false;
                if (chkEdit) chkEdit.checked = false;
                if (card) { card.className = 'permission-card'; }
            }
        });
        updatePermissionsCounter();
    }

    function applyRolePresetPermissions(role) {
        const accessConfig = {};
        if (role === 'admin') {
            ALL_SCREEN_IDS.forEach(sid => { accessConfig[sid] = 'edit'; });
        } else if (role === 'accountant') {
            const editScreens = ['screen-salary-adjustments', 'screen-payroll-summary', 'screen-single-sarki', 'screen-bulk-payslips', 'screen-payroll-delivery', 'screen-backup-restore', 'screen-firebase-settings', 'screen-leaves-permissions', 'screen-punches-payroll'];
            const viewScreens = ['screen-welcome', 'screen-employees', 'screen-attendance', 'screen-emp-general-report', 'screen-totals-report', 'screen-attendance-comparison'];
            editScreens.forEach(sid => { accessConfig[sid] = 'edit'; });
            viewScreens.forEach(sid => { accessConfig[sid] = 'view'; });
        } else if (role === 'supervisor') {
            accessConfig['screen-attendance'] = 'edit';
            accessConfig['screen-welcome'] = 'view';
            accessConfig['screen-leaves-permissions'] = 'edit';
        } else if (role === 'employee') {
            accessConfig['screen-employee-sarki'] = 'view';
            accessConfig['screen-leaves-permissions'] = 'edit';
        } else {
            accessConfig['screen-welcome'] = 'view';
            accessConfig['screen-leaves-permissions'] = 'edit';
        }

        renderPermissionsCheckboxes(accessConfig);
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

        const isAdmin = currentUser.role === 'admin';

        // إظهار/إخفاء أزرار الشاشات في القائمة الجانبية بحسب إمكانية الاطلاع
        ALL_SYSTEM_SCREENS.forEach(screen => {
            const navBtn = document.getElementById(`nav-${screen.id}`);
            if (!navBtn) return;

            const isAllowed = isAdmin || canViewScreen(screen.id);
            navBtn.style.display = isAllowed ? 'flex' : 'none';
        });

        // التحقق من أن الشاشة الحالية مسموح بها للمستخدم
        const activeView = document.querySelector('.screen-view.active');
        const activeScreenId = activeView ? activeView.id : 'screen-welcome';
        const isCurrentAllowed = isAdmin || canViewScreen(activeScreenId);

        if (!isCurrentAllowed) {
            const firstAllowed = ALL_SYSTEM_SCREENS.find(s => isAdmin || canViewScreen(s.id));
            if (firstAllowed && typeof switchScreen === 'function') {
                const targetBtn = document.getElementById(`nav-${firstAllowed.id}`);
                switchScreen(firstAllowed.id, targetBtn);
            }
        } else {
            // تطبيق وضع الاطلاع فقط إذا كانت الشاشة الحالية للعرض فقط
            applyScreenAccessMode(activeScreenId);
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
            const access = u.screenAccess || {};
            const editCount = Object.keys(access).filter(k => access[k] === 'edit').length;
            const viewCount = Object.keys(access).filter(k => access[k] === 'view').length;

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

            // ملخص الصلاحيات المفصل
            let permsBadge = '';
            if (u.role === 'admin' || editCount === ALL_SYSTEM_SCREENS.length) {
                permsBadge = `<span class="badge" style="background:#dcfce7; color:#15803d; font-weight:700;">🟢 صلاحية كاملة (14 تعديل)</span>`;
            } else if (editCount === 0 && viewCount === 0) {
                permsBadge = `<span class="badge" style="background:#fee2e2; color:#b91c1c; font-weight:700;">🔴 محجوب (0)</span>`;
            } else {
                let parts = [];
                if (editCount > 0) parts.push(`<strong style="color:#059669;">✏️ ${editCount} تعديل</strong>`);
                if (viewCount > 0) parts.push(`<strong style="color:#2563eb;">👁️ ${viewCount} اطلاع</strong>`);
                permsBadge = `<span class="badge" style="background:#f0f9ff; border:1px solid #bae6fd;">${parts.join(' | ')}</span>`;
            }

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${idx + 1}</td>
                <td><strong>${u.username}</strong></td>
                <td>${u.fullName}</td>
                <td><span class="role-badge ${roleBadgeClass}">${roleName}</span></td>
                <td>${permsBadge}</td>
                <td style="text-align:center;">محفوظة بشكل آمن</td>
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
            usernameInput.disabled = true;
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

        // إظهار كروت الصلاحيات بحسب مستويات المستخدم (اطلاع / تعديل)
        renderPermissionsCheckboxes(user.screenAccess || {});

        if (banner) banner.style.display = 'flex';
        if (bannerTitle) bannerTitle.textContent = `جاري تعديل صلاحيات المستخدم: ${user.fullName} (${user.username})`;
        if (formTitle) formTitle.textContent = `✏️ تعديل صلاحيات المستخدم (${user.username})`;
        if (submitBtn) submitBtn.textContent = '💾 حفظ تعديلات الصلاحيات';
        if (cancelBtn) cancelBtn.style.display = 'inline-block';

        const formEl = document.getElementById('user-create-form');
        if (formEl) formEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
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

        applyRolePresetPermissions('admin');
        onNewUserRoleChanged();
    }

    // ── حفظ مستخدم جديد أو تعديل مستخدم قائم ────────────────────────────
    async function handleCreateUser(e) {
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

        // استخراج خريطة الصلاحيات المحددة بدقة (اطلاع / تعديل)
        const selectedAccess = getSelectedScreenAccess();
        const allowedScreens = Object.keys(selectedAccess).filter(k => selectedAccess[k] !== 'none');

        if (allowedScreens.length === 0) {
            alert('⚠️ يرجى تحديد صلاحية (اطلاع أو تعديل) لشاشة واحدة على الأقل لهذا المستخدم!');
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
            const targetUser = usersDb.find(u => u.username === editingUsername);
            if (!targetUser) {
                alert('⚠️ تعذر العثور على المستخدم المطلوب تعديله!');
                return;
            }

            const updatedUser = {
                ...targetUser,
                fullName,
                role,
                empId,
                screenAccess: selectedAccess,
                permissions: allowedScreens
            };
            try {
                const response = await window.authenticatedFetch(`/api/auth/users/${encodeURIComponent(editingUsername)}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ user: updatedUser, password: pin })
                });
                const result = await response.json();
                if (!response.ok) throw new Error(result.message || 'تعذر تحديث المستخدم.');
            } catch (error) {
                alert(error.message);
                return;
            }
            Object.assign(targetUser, updatedUser);
            delete targetUser.pin;
            localStorage.setItem('erp_users_db', JSON.stringify(usersDb));

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
            if (usersDb.some(u => u.username === username)) {
                alert('⚠️ اسم المستخدم هذا موجود بالفعل! يرجى اختيار اسم مستخدم آخر.');
                return;
            }

            if (!pin) {
                alert('⚠️ يرجى كتابة كلمة المرور للمستخدم الجديد!');
                return;
            }
            if (pin.length < 8) {
                alert('⚠️ كلمة المرور يجب أن تتكون من 8 أحرف على الأقل.');
                return;
            }

            const newUser = {
                username: username,
                fullName: fullName,
                role: role,
                empId: empId,
                permissions: allowedScreens,
                screenAccess: selectedAccess,
                createdAt: new Date().toISOString().split('T')[0]
            };

            try {
                const response = await window.authenticatedFetch('/api/auth/users', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ user: newUser, password: pin })
                });
                const result = await response.json();
                if (!response.ok) throw new Error(result.message || 'تعذر إنشاء المستخدم.');
                usersDb.push(result.user);
            } catch (error) {
                alert(error.message);
                return;
            }
            localStorage.setItem('erp_users_db', JSON.stringify(usersDb));

            cancelEditUser();
            populateUserSelectDropdowns();
            renderUsersTable();
            showToast(`تمت إضافة المستخدم (${fullName}) وتعيين صلاحيات الاطلاع والتعديل بنجاح! 🎉`, 'success');
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
            window.authenticatedFetch(`/api/auth/users/${encodeURIComponent(uName)}`, { method: 'DELETE' })
                .then(async response => {
                    const result = await response.json();
                    if (!response.ok) throw new Error(result.message || 'تعذر حذف المستخدم.');
                    usersDb = usersDb.filter(u => u.username !== uName);
                    localStorage.setItem('erp_users_db', JSON.stringify(usersDb));
                    populateUserSelectDropdowns();
                    renderUsersTable();
                    showToast('تم حذف المستخدم بنجاح.');
                })
                .catch(error => alert(error.message));
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

    async function handleSwitchUserSubmit(e) {
        e.preventDefault();
        const uName = document.getElementById('switch-user-select').value;
        const pwd = document.getElementById('switch-user-password').value.trim();
        const user = usersDb.find(u => u.username === uName);

        if (!user) {
            const err = document.getElementById('switch-user-error');
            if (err) {
                err.textContent = '❌ تعذر العثور على المستخدم المحدد.';
                err.style.display = 'block';
            }
            return;
        }
        let authenticatedUser;
        try {
            authenticatedUser = await window.signInToFirebase(uName, pwd);
        } catch (error) {
            const err = document.getElementById('switch-user-error');
            if (err) {
                err.textContent = error.message;
                err.style.display = 'block';
            }
            return;
        }

        currentUser = authenticatedUser;
        isUserAuthenticated = true;
        window.currentUser = currentUser;
        window.isUserAuthenticated = isUserAuthenticated;
        await window.activateAuthenticatedFirebaseSession();

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
                employees.filter(e => e.status !== 'انتهت خدمته' && !e.hasNoUser).forEach(emp => {
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
            uInp.value = emp.username || ('emp_' + emp.id);
        }
    }

    function handleEmployeeSelfRegister(e) {
        e.preventDefault();
        const err = document.getElementById('self-reg-error');
        if (err) {
            err.textContent = 'إنشاء الحسابات الذاتية متوقف لحماية بيانات الموظفين. يرجى التواصل مع مدير النظام لإنشاء الحساب.';
            err.style.display = 'block';
        }
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
            usernameInput.value = emp.username || ('emp_' + (emp.code ? emp.code.toLowerCase().replace(/\s+/g, '') : emp.id));
        }
    }

    // ── تغيير المستخدم لكلمة المرور الخاصة به بنفسه ──────────────────
    function openChangePasswordModal(isFirstTime = false) {
        const modal = document.getElementById('modal-change-password');
        if (!modal) return;
        const curInput = document.getElementById('change-pwd-current');
        const newInput = document.getElementById('change-pwd-new');
        const confInput = document.getElementById('change-pwd-confirm');
        const errEl = document.getElementById('change-pwd-error');
        const introEl = document.getElementById('change-pwd-intro');

        if (curInput) curInput.value = '';
        if (newInput) newInput.value = '';
        if (confInput) confInput.value = '';
        if (errEl) errEl.style.display = 'none';

        if (introEl) {
            if (isFirstTime) {
                introEl.innerHTML = `👋 مرحباً بك يا <strong>${currentUser ? currentUser.fullName : ''}</strong>!<br>لحماية خصوصية حسابك، يرجى تعيين كلمة مرور شخصية خاصة بك بعد تسجيلك لأول مرة.`;
            } else {
                introEl.textContent = 'يمكنك تعيين كلمة مرور جديدة لحسابك وستظهر محدثة تلقائياً لدى مدير النظام.';
            }
        }

        modal.style.display = 'flex';
        setTimeout(() => { if (curInput) curInput.focus(); }, 120);
    }

    function closeChangePasswordModal() {
        const modal = document.getElementById('modal-change-password');
        if (modal) modal.style.display = 'none';
    }

    async function handleUserSelfChangePassword(e) {
        if (e && e.preventDefault) e.preventDefault();
        const curInput = document.getElementById('change-pwd-current');
        const newInput = document.getElementById('change-pwd-new');
        const confInput = document.getElementById('change-pwd-confirm');
        const errEl = document.getElementById('change-pwd-error');

        const curPwd = (curInput ? curInput.value : '').trim();
        const newPwd = (newInput ? newInput.value : '').trim();
        const confPwd = (confInput ? confInput.value : '').trim();

        if (!currentUser) {
            alert('⚠️ لم يتم العثور على جلسة مستخدم نشطة!');
            return;
        }

        if (!newPwd || newPwd.length < 8) {
            if (errEl) {
                errEl.textContent = '⚠️ كلمة المرور الجديدة يجب أن تتكون من 8 أحرف على الأقل.';
                errEl.style.display = 'block';
            }
            return;
        }

        if (newPwd !== confPwd) {
            if (errEl) {
                errEl.textContent = '⚠️ كلمة المرور الجديدة وتأكيدها غير متطابقين!';
                errEl.style.display = 'block';
            }
            return;
        }

        try {
            const response = await window.authenticatedFetch('/api/auth/password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ currentPassword: curPwd, newPassword: newPwd })
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.message || 'تعذر تحديث كلمة المرور.');
        } catch (error) {
            if (errEl) {
                errEl.textContent = error.message;
                errEl.style.display = 'block';
            }
            return;
        }
        currentUser.hasChangedPassword = true;

        // تحديث المستخدم في قاعدة بيانات المستخدمين
        const target = usersDb.find(u => u.username.toLowerCase() === currentUser.username.toLowerCase());
        if (target) {
            target.hasChangedPassword = true;
        }

        localStorage.setItem('erp_users_db', JSON.stringify(usersDb));
        localStorage.setItem('erp_current_user', JSON.stringify(currentUser));
        sessionStorage.setItem('erp_auth_session', JSON.stringify({
            username: currentUser.username,
            loginTime: new Date().toISOString()
        }));

        renderUsersTable();
        closeChangePasswordModal();

        alert('✔ تم تغيير كلمة المرور بنجاح وحفظها مشفرة على الخادم.');
        showToast('تم تحديث كلمة المرور الخاصة بك بنجاح! 🔑', 'success');
        logoutAndLockSystem();
    }

    // تصدير الدوال للنطاق العام
    window.initAuthSystem = initAuthSystem;
    window.checkAuthAndRequireLogin = checkAuthAndRequireLogin;
    window.lockScreenModal = lockScreenModal;
    window.logoutAndLockSystem = logoutAndLockSystem;
    window.handleUnlockSystem = handleUnlockSystem;
    window.togglePasswordVisibility = togglePasswordVisibility;
    window.renderPermissionsCheckboxes = renderPermissionsCheckboxes;
    window.onPermLevelChanged = onPermLevelChanged;
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
    window.openChangePasswordModal = openChangePasswordModal;
    window.closeChangePasswordModal = closeChangePasswordModal;
    window.handleUserSelfChangePassword = handleUserSelfChangePassword;
