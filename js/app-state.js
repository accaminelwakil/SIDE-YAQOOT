    const KNOWN_DEPTS = {
        'إدارة': 1000,
        'استقبال': 2000,
        'تمريض': 3000,
        'خدمات معاونة': 4000,
        'حسابات': 5000,
        'معمل': 6000,
        'صيدلية': 7000
    };

    function getNextCodeForDept(deptName) {
        let cleanDept = deptName.trim();
        if (cleanDept === 'ادارة') cleanDept = 'إدارة';
        let baseStart = KNOWN_DEPTS[cleanDept];

        if (!baseStart) {
            let maxBase = 5000;
            employees.forEach(e => {
                const b = Math.floor(e.id / 1000) * 1000;
                if (b > maxBase) maxBase = b;
            });
            baseStart = maxBase + 1000;
            KNOWN_DEPTS[cleanDept] = baseStart;
        }

        const existingCodes = employees
            .filter(e => Math.floor(e.id / 1000) * 1000 === baseStart)
            .map(e => e.id);

        if (existingCodes.length === 0) {
            return baseStart + 1;
        } else {
            return Math.max(...existingCodes) + 1;
        }
    }

    function sortEmployeesByDeptAndCode() {
        employees.sort((a, b) => {
            const deptComp = a.job.localeCompare(b.job, 'ar');
            if (deptComp !== 0) return deptComp;
            return a.id - b.id;
        });
    }

    let employees = JSON.parse(localStorage.getItem('erp_employees_db') || localStorage.getItem('erp_employees') || '[]');
    if (!Array.isArray(employees)) employees = [];

    // Normalize locally cached names without replacing them with embedded payroll data.
    let employeesChanged = false;
    employees.forEach(e => {
        if (e && e.job === 'ادارة') {
            e.job = 'إدارة';
            employeesChanged = true;
        }
    });
    sortEmployeesByDeptAndCode();
    if (employeesChanged) {
        localStorage.setItem('erp_employees_db', JSON.stringify(employees));
        localStorage.setItem('erp_employees', JSON.stringify(employees));
    }

    let attendanceRecords = JSON.parse(localStorage.getItem('erp_attendance_db') || localStorage.getItem('erp_attendance') || '[]');
    let rawDepts = JSON.parse(localStorage.getItem('erp_departments') || 'null') || Object.keys(KNOWN_DEPTS);
    let departments = Array.from(new Set(rawDepts.map(d => d === 'ادارة' ? 'إدارة' : d)));
    localStorage.setItem('erp_departments', JSON.stringify(departments));
    let shifts = JSON.parse(localStorage.getItem('erp_shifts') || '[]');

    window.employees = employees;
    window.KNOWN_DEPTS = KNOWN_DEPTS;
    window.departments = departments;
    window.attendanceRecords = attendanceRecords;
    window.shifts = shifts;
    window.previousScreenBeforeBulk = 'screen-single-sarki';
    window.previousScreenBeforeDelivery = 'screen-bulk-payslips';

    const todayObj = new Date();
    const arabicMonths = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
    const liveDateEl = document.getElementById('welcome-live-date');
    if (liveDateEl) {
        liveDateEl.innerText = `${todayObj.getDate()} ${arabicMonths[todayObj.getMonth()]} ${todayObj.getFullYear()}`;
    }

    function switchScreen(screenId, btnElement) {
        // التحقق من تسجيل الدخول والمصادقة
        if (typeof isUserAuthenticated !== 'undefined' && !isUserAuthenticated) {
            if (typeof lockScreenModal === 'function') lockScreenModal();
            return;
        }

        // فحص صلاحية الاطلاع والوصول للشاشة المحددة للمستخدم الحالي
        if (typeof canViewScreen === 'function') {
            if (!canViewScreen(screenId)) {
                alert('⚠️ عذراً! ليس لديك صلاحية للوصول إلى هذه الشاشة.');
                return;
            }
        } else if (typeof currentUser !== 'undefined' && currentUser) {
            const isAdmin = currentUser.role === 'admin';
            const userPerms = Array.isArray(currentUser.permissions) ? currentUser.permissions : [];
            const isAllowed = isAdmin || userPerms.includes(screenId);

            if (!isAllowed) {
                alert('⚠️ عذراً! ليس لديك صلاحية للوصول إلى هذه الشاشة.');
                return;
            }
        }

        document.querySelectorAll('.screen-view').forEach(view => view.classList.remove('active'));
        document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));

        const targetScreen = document.getElementById(screenId);
        if (targetScreen) targetScreen.classList.add('active');
        if (btnElement) btnElement.classList.add('active');

        // تطبيق وضع الصلاحية (تعديل كامل أم اطلاع فقط) على الشاشة الحالية
        if (typeof applyScreenAccessMode === 'function') {
            applyScreenAccessMode(screenId);
        }

        if (screenId !== 'screen-bulk-payslips' && screenId !== 'screen-payroll-delivery') {
            previousScreenBeforeBulk = screenId;
            previousScreenBeforeDelivery = screenId;
        }

        if (screenId === 'screen-welcome') renderWelcomeDashboard();
        if (screenId === 'screen-attendance') onShiftDateChanged();
        if (screenId === 'screen-salary-adjustments') populateAdjustmentCyclesDropdown();
        if (screenId === 'screen-single-sarki') populateSarkiCyclesDropdown();
        if (screenId === 'screen-employee-sarki') {
            if (typeof populateEmployeeSelfSarkiDropdowns === 'function') populateEmployeeSelfSarkiDropdowns();
        }
        if (screenId === 'screen-bulk-payslips') populateBulkPayslipsDropdowns();
        if (screenId === 'screen-payroll-summary') {
            populatePayrollCyclesDropdown();
        }
        if (screenId === 'screen-employees') renderEmployeesTable();
        if (screenId === 'screen-totals-report') {
            if (typeof populateTotalsReportCyclesDropdown === 'function') populateTotalsReportCyclesDropdown();
            renderTotalsReport();
        }
        if (screenId === 'screen-payroll-delivery') populateDeliveryCyclesDropdown();
        if (screenId === 'screen-emp-general-report') {
            if (typeof populateAllEmployeeDropdowns === 'function') populateAllEmployeeDropdowns();
            if (typeof renderEmployeeGeneralReport === 'function') renderEmployeeGeneralReport();
        }
        if (screenId === 'screen-backup-restore') renderBackupDashboard();
        if (screenId === 'screen-users-roles') renderUsersTable();
        if (screenId === 'screen-firebase-settings') renderFirebaseSettingsScreen();
        if (screenId === 'screen-leaves-permissions') {
            if (typeof renderLeavesPermissionsScreen === 'function') renderLeavesPermissionsScreen();
        }
        if (screenId === 'screen-punches-payroll') {
            if (typeof renderPunchesPayrollScreen === 'function') renderPunchesPayrollScreen();
        }
        if (screenId === 'screen-attendance-comparison') {
            if (typeof renderAttendanceComparisonScreen === 'function') renderAttendanceComparisonScreen();
        }
        if (typeof refreshAllSearchableSelects === 'function') refreshAllSearchableSelects();

        // إغلاق قائمة الموبايل تلقائياً عند اختيار أي شاشة
        toggleMobileSidebar(false);

        // إعادة حساب مقياس السراكي A4 وتغليف الجداول على الموبايل فور الانتقال للشاشة
        if (typeof autoScaleAllA4Sheets === 'function') {
            setTimeout(autoScaleAllA4Sheets, 60);
        }
        if (typeof ensureAllTablesWrapped === 'function') {
            setTimeout(ensureAllTablesWrapped, 60);
        }
    }

    // =========================================================================
    // التحكم بقائمة الموبايل وشاشة الربط والمشاركة
    // =========================================================================

    function toggleMobileSidebar(open) {
        const sidebar = document.getElementById('app-sidebar');
        const backdrop = document.getElementById('sidebar-backdrop');
        if (!sidebar) return;

        if (open === undefined) {
            open = !sidebar.classList.contains('open');
        }

        if (open) {
            sidebar.classList.add('open');
            if (backdrop) backdrop.classList.add('active');
            document.body.style.overflow = 'hidden';
        } else {
            sidebar.classList.remove('open');
            if (backdrop) backdrop.classList.remove('active');
            document.body.style.overflow = '';
        }
    }

    function openMobileConnectModal() {
        const modal = document.getElementById('modal-mobile-connect');
        if (!modal) return;

        let appUrl = '';
        const isLocalFile = window.location.protocol === 'file:';
        const isLocalHost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

        if (isLocalFile) {
            appUrl = 'http://192.168.1.2:5500/index.html';
        } else if (isLocalHost) {
            const port = window.location.port ? `:${window.location.port}` : '';
            appUrl = `http://192.168.1.2${port}/index.html`;
        } else {
            appUrl = window.location.origin + window.location.pathname;
        }

        const inputEl = document.getElementById('mobile-app-link-input');
        if (inputEl) inputEl.value = appUrl;

        const qrImg = document.getElementById('mobile-qr-image');
        if (qrImg) {
            qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(appUrl)}`;
        }

        modal.style.display = 'flex';
        toggleMobileSidebar(false);
    }

    function closeMobileConnectModal() {
        const modal = document.getElementById('modal-mobile-connect');
        if (modal) modal.style.display = 'none';
    }

    function copyMobileAppLink() {
        const inputEl = document.getElementById('mobile-app-link-input');
        if (!inputEl) return;
        inputEl.select();
        inputEl.setSelectionRange(0, 99999);
        navigator.clipboard.writeText(inputEl.value).then(() => {
            if (typeof showToast === 'function') {
                showToast('📋 تم نسخ رابط المنظومة بنجاح!', 'success');
            } else {
                alert('تم نسخ الرابط بنجاح!');
            }
        }).catch(() => {
            document.execCommand('copy');
            alert('تم نسخ الرابط بنجاح!');
        });
    }

    function shareAppLinkViaWhatsApp() {
        const inputEl = document.getElementById('mobile-app-link-input');
        const url = inputEl ? inputEl.value : window.location.href;
        const msg = `رابط تشغيل منظومة عيادات سيدي ياقوت التخصصية:\n${url}`;
        window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`, '_blank');
    }

    // إعادة رسم الشاشة المعروضة حالياً تلقائياً عند وصول أي تحديث من السحابة
    function refreshActiveScreenData() {
        const activeScreen = document.querySelector('.screen-view.active');
        if (!activeScreen) return;
        const screenId = activeScreen.id;
        try {
            if (screenId === 'screen-welcome' && typeof renderWelcomeDashboard === 'function') renderWelcomeDashboard();
            if (screenId === 'screen-attendance' && typeof onShiftDateChanged === 'function') onShiftDateChanged();
            if (screenId === 'screen-salary-adjustments') {
                if (typeof populateAdjustmentCyclesDropdown === 'function') populateAdjustmentCyclesDropdown();
                if (typeof renderAdjustmentsTable === 'function') renderAdjustmentsTable();
            }
            if (screenId === 'screen-single-sarki' && typeof populateSarkiCyclesDropdown === 'function') populateSarkiCyclesDropdown();
            if (screenId === 'screen-employee-sarki' && typeof populateEmployeeSelfSarkiDropdowns === 'function') populateEmployeeSelfSarkiDropdowns();
            if (screenId === 'screen-bulk-payslips' && typeof populateBulkPayslipsDropdowns === 'function') populateBulkPayslipsDropdowns();
            if (screenId === 'screen-payroll-summary' && typeof renderPayrollSummary === 'function') renderPayrollSummary();
            if (screenId === 'screen-employees' && typeof renderEmployeesTable === 'function') renderEmployeesTable();
            if (screenId === 'screen-totals-report' && typeof renderTotalsReport === 'function') renderTotalsReport();
            if (screenId === 'screen-payroll-delivery' && typeof renderPayrollDelivery === 'function') renderPayrollDelivery();
            if (screenId === 'screen-emp-general-report' && typeof renderEmployeeGeneralReport === 'function') renderEmployeeGeneralReport();
        } catch (err) {
            console.warn('تنبيه أثناء تحديث الشاشة النشطة:', err);
        }
    }
