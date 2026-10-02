    // ==================== نظام المستخدمين وإدارة الصلاحيات (Users & Roles) ====================
    const DEFAULT_USERS = [
        { username: 'admin', fullName: 'المدير العام', role: 'admin', pin: '1234', createdAt: '2026-01-01' },
        { username: 'hesabat', fullName: 'أ. عاطف (الحسابات)', role: 'accountant', pin: '1234', createdAt: '2026-01-01' },
        { username: 'moshref', fullName: 'مشرف الحضور', role: 'supervisor', pin: '1234', createdAt: '2026-01-01' }
    ];

    let usersDb = JSON.parse(localStorage.getItem('erp_users_db') || 'null');
    if (!usersDb || !Array.isArray(usersDb) || usersDb.length === 0) {
        usersDb = DEFAULT_USERS;
        localStorage.setItem('erp_users_db', JSON.stringify(usersDb));
    }

    let currentUser = JSON.parse(localStorage.getItem('erp_current_user') || 'null');
    if (!currentUser || !currentUser.username) {
        currentUser = usersDb[0];
        localStorage.setItem('erp_current_user', JSON.stringify(currentUser));
    }

    function initAuthSystem() {
        updateSidebarUserDisplay();
        populateUserSelectDropdowns();
        applyRolePermissions();
    }

    function updateSidebarUserDisplay() {
        const nameEl = document.getElementById('sidebar-user-name');
        const badgeEl = document.getElementById('sidebar-user-role-badge');
        if (!nameEl || !badgeEl) return;

        nameEl.textContent = currentUser ? currentUser.fullName : 'المدير العام';
        const role = currentUser ? currentUser.role : 'admin';
        badgeEl.className = `role-badge role-${role}`;
        badgeEl.textContent = role === 'admin' ? 'مدير النظام' : (role === 'accountant' ? 'مسؤول حسابات' : (role === 'supervisor' ? 'مشرف حضور' : 'موظف'));
    }

    function populateUserSelectDropdowns() {
        const lockSel = document.getElementById('lock-user-select');
        const switchSel = document.getElementById('switch-user-select');

        [lockSel, switchSel].forEach(sel => {
            if (!sel) return;
            sel.innerHTML = '';
            usersDb.forEach(u => {
                const opt = document.createElement('option');
                opt.value = u.username;
                const roleLabel = u.role === 'admin' ? 'مدير' : (u.role === 'accountant' ? 'حسابات' : (u.role === 'supervisor' ? 'إشراف' : 'موظف'));
                opt.textContent = `${u.fullName} (${roleLabel})`;
                if (currentUser && u.username === currentUser.username) opt.selected = true;
                sel.appendChild(opt);
            });
        });
    }

    function lockScreenModal() {
        populateUserSelectDropdowns();
        const pwdInput = document.getElementById('lock-password-input');
        if (pwdInput) pwdInput.value = '';
        const errMsg = document.getElementById('lock-error-msg');
        if (errMsg) errMsg.style.display = 'none';
        const modal = document.getElementById('modal-lock-screen');
        if (modal) modal.style.display = 'flex';
    }

    function onLockUserSelectChanged() {
        const pwdInput = document.getElementById('lock-password-input');
        if (pwdInput) {
            pwdInput.value = '';
            pwdInput.focus();
        }
        const errMsg = document.getElementById('lock-error-msg');
        if (errMsg) errMsg.style.display = 'none';
    }

    function handleUnlockSystem(e) {
        e.preventDefault();
        const uName = document.getElementById('lock-user-select').value;
        const pwd = document.getElementById('lock-password-input').value.trim();
        const user = usersDb.find(u => u.username === uName);

        if (!user || user.pin !== pwd) {
            const errMsg = document.getElementById('lock-error-msg');
            if (errMsg) {
                errMsg.textContent = '❌ كلمة المرور أو رمز الـ PIN غير صحيح! يرجى التأكد والمحاولة مرة أخرى.';
                errMsg.style.display = 'block';
            }
            return;
        }

        currentUser = user;
        localStorage.setItem('erp_current_user', JSON.stringify(currentUser));
        document.getElementById('modal-lock-screen').style.display = 'none';
        updateSidebarUserDisplay();
        applyRolePermissions();
        showToast(`مرحباً بك يا ${currentUser.fullName}! تم فتح المنظومة بنجاح.`);
    }

    function openSwitchUserModal() {
        populateUserSelectDropdowns();
        const pwdInput = document.getElementById('switch-user-password');
        if (pwdInput) pwdInput.value = '';
        const err = document.getElementById('switch-user-error');
        if (err) err.style.display = 'none';
        document.getElementById('modal-switch-user').style.display = 'flex';
    }

    function closeSwitchUserModal() {
        document.getElementById('modal-switch-user').style.display = 'none';
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
        localStorage.setItem('erp_current_user', JSON.stringify(currentUser));
        closeSwitchUserModal();
        updateSidebarUserDisplay();
        applyRolePermissions();
        renderUsersTable();
        showToast(`تم التبديل بنجاح إلى حساب [${currentUser.fullName}]`);
    }

    function applyRolePermissions() {
        if (!currentUser) return;
        const role = currentUser.role;

        const allStandardNavs = [
            'nav-screen-welcome',
            'nav-screen-employees',
            'nav-screen-attendance',
            'nav-screen-salary-adjustments',
            'nav-screen-payroll-summary',
            'nav-screen-single-sarki',
            'nav-screen-bulk-payslips',
            'nav-screen-payroll-delivery',
            'nav-screen-emp-general-report',
            'nav-screen-totals-report',
            'nav-screen-backup-restore',
            'nav-screen-users-roles',
            'nav-screen-firebase-settings'
        ];

        const empNavBtn = document.getElementById('nav-screen-employee-sarki');

        // صلاحيات مستخدم الموظف: الاطلاع على السركي الخاص به فقط وحجب كل الشاشات الأخرى
        if (role === 'employee') {
            allStandardNavs.forEach(navId => {
                const btn = document.getElementById(navId);
                if (btn) btn.style.display = 'none';
            });
            document.querySelectorAll('.nav-menu .nav-title').forEach(t => t.style.display = 'none');

            if (empNavBtn) empNavBtn.style.display = 'flex';

            const activeView = document.querySelector('.screen-view.active');
            if (!activeView || activeView.id !== 'screen-employee-sarki') {
                if (typeof switchScreen === 'function') {
                    switchScreen('screen-employee-sarki', empNavBtn);
                }
            }
            return;
        }

        // صلاحيات الأدوار الإدارية الأخرى
        if (empNavBtn) empNavBtn.style.display = 'none';
        document.querySelectorAll('.nav-menu .nav-title').forEach(t => t.style.display = '');

        const welcomeBtn = document.getElementById('nav-screen-welcome');
        if (welcomeBtn) welcomeBtn.style.display = 'flex';
        const attBtn = document.getElementById('nav-screen-attendance');
        if (attBtn) attBtn.style.display = 'flex';
        const fbBtn = document.getElementById('nav-screen-firebase-settings');
        if (fbBtn) fbBtn.style.display = 'flex';

        const financialNavs = [
            'nav-screen-employees',
            'nav-screen-salary-adjustments',
            'nav-screen-payroll-summary',
            'nav-screen-single-sarki',
            'nav-screen-bulk-payslips',
            'nav-screen-payroll-delivery',
            'nav-screen-totals-report',
            'nav-screen-emp-general-report',
            'nav-screen-backup-restore',
            'nav-screen-users-roles'
        ];

        financialNavs.forEach(navId => {
            const btn = document.getElementById(navId);
            if (!btn) return;
            if (role === 'supervisor') {
                btn.style.display = 'none';
            } else if (role === 'accountant') {
                if (navId === 'nav-screen-users-roles') {
                    btn.style.display = 'none';
                } else {
                    btn.style.display = 'flex';
                }
            } else {
                btn.style.display = 'flex';
            }
        });

        if (role === 'supervisor') {
            const activeView = document.querySelector('.screen-view.active');
            if (activeView && activeView.id !== 'screen-welcome' && activeView.id !== 'screen-attendance') {
                switchScreen('screen-attendance', document.getElementById('nav-screen-attendance'));
            }
        }
    }

    function renderUsersTable() {
        const tbody = document.getElementById('users-tbody');
        if (!tbody) return;
        tbody.innerHTML = '';

        if (typeof populateNewUserEmployeeSelect === 'function') {
            populateNewUserEmployeeSelect();
        }

        usersDb.forEach((u, idx) => {
            const isCurrent = currentUser && currentUser.username === u.username;
            let roleName = 'مشرف حضور (Supervisor)';
            let roleBadgeClass = 'role-supervisor';
            if (u.role === 'admin') {
                roleName = 'مدير النظام (Admin)';
                roleBadgeClass = 'role-admin';
            } else if (u.role === 'accountant') {
                roleName = 'مسؤول حسابات (Accountant)';
                roleBadgeClass = 'role-accountant';
            } else if (u.role === 'employee') {
                let empDesc = '';
                if (u.empId && typeof employees !== 'undefined') {
                    const foundEmp = employees.find(e => e.id === u.empId);
                    if (foundEmp) empDesc = ` (${foundEmp.name})`;
                }
                roleName = `موظف${empDesc}`;
                roleBadgeClass = 'role-employee';
            }

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${idx + 1}</td>
                <td><strong>${u.username}</strong></td>
                <td>${u.fullName}</td>
                <td><span class="role-badge ${roleBadgeClass}">${roleName}</span></td>
                <td style="font-family:Consolas, monospace; letter-spacing:2px;">••••</td>
                <td>${u.createdAt || '-'}</td>
                <td>
                    <span class="badge ${isCurrent ? 'badge-status-active' : 'badge-dept'}">
                        ${isCurrent ? '🟢 المستخدم النشط حالياً' : 'متاح'}
                    </span>
                </td>
                <td>
                    ${u.username === 'admin' ? '<span style="color:var(--text-muted); font-size:11px;">أساسي (لا يحذف)</span>' : `
                        <button type="button" class="btn-danger" style="font-size:11px; padding:3px 8px;" onclick="deleteUser('${u.username}')">🗑️ حذف</button>
                    `}
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    function onNewUserRoleChanged() {
        const roleSelect = document.getElementById('new-user-role');
        const wrapper = document.getElementById('new-user-employee-wrapper');
        if (!roleSelect || !wrapper) return;
        if (roleSelect.value === 'employee') {
            wrapper.style.display = 'block';
            populateNewUserEmployeeSelect();
        } else {
            wrapper.style.display = 'none';
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
            usernameInput.value = 'emp_' + (emp.code ? emp.code.toLowerCase().replace(/\s+/g, '') : emp.id);
        }
    }

    function handleCreateUser(e) {
        e.preventDefault();
        if (currentUser && currentUser.role !== 'admin') {
            alert('⚠️ عذراً! إضافة وتعديل المستخدمين مقتصرة على مدير النظام (Admin) فقط.');
            return;
        }

        const username = document.getElementById('new-user-username').value.trim().toLowerCase();
        const fullName = document.getElementById('new-user-fullname').value.trim();
        const role = document.getElementById('new-user-role').value;
        const pin = document.getElementById('new-user-password').value.trim();

        let empId = null;
        if (role === 'employee') {
            const empSelect = document.getElementById('new-user-employee-select');
            empId = empSelect ? parseInt(empSelect.value) : null;
            if (!empId) {
                alert('⚠️ يرجى اختيار الموظف المراد ربط هذا الحساب به أولاً!');
                return;
            }
        }

        if (usersDb.some(u => u.username === username)) {
            alert('⚠️ اسم المستخدم هذا موجود بالفعل! يرجى اختيار اسم مستخدم آخر.');
            return;
        }

        usersDb.push({
            username: username,
            fullName: fullName,
            role: role,
            empId: empId,
            pin: pin,
            createdAt: new Date().toISOString().split('T')[0]
        });

        localStorage.setItem('erp_users_db', JSON.stringify(usersDb));
        if (typeof pushSingleCollectionToFirebase === 'function') pushSingleCollectionToFirebase('users', usersDb);
        document.getElementById('user-create-form').reset();
        onNewUserRoleChanged();
        populateUserSelectDropdowns();
        renderUsersTable();
        showToast(`تمت إضافة المستخدم (${fullName}) بنجاح!`);
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

    // ==================== تسجيل حساب موظف ذاتياً ====================
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
            createdAt: new Date().toISOString().split('T')[0]
        };

        usersDb.push(newUser);
        localStorage.setItem('erp_users_db', JSON.stringify(usersDb));
        if (typeof pushSingleCollectionToFirebase === 'function') pushSingleCollectionToFirebase('users', usersDb);

        currentUser = newUser;
        localStorage.setItem('erp_current_user', JSON.stringify(currentUser));

        closeEmployeeSelfRegisterModal();
        closeSwitchUserModal();
        const lockModal = document.getElementById('modal-lock-screen');
        if (lockModal) lockModal.style.display = 'none';

        populateUserSelectDropdowns();
        updateSidebarUserDisplay();
        applyRolePermissions();
        showToast(`مرحباً بك يا ${fullName}! تم تسجيل حسابك والدخول إلى سركي الراتب بنجاح. 🎉`, 'success');
    }

