    const INITIAL_EMPLOYEES = [{"id": 1001, "name": "اسلام", "job": "إدارة", "basicSalary": 1000.0, "shiftHours": 8.0, "hourlyRate": 4.17, "overtime1": 5.63, "overtime2": 7.29, "overtimeMore": 8.33, "offDay": "Friday", "lastIncreaseMonth": "-", "salaryBefore": 1000.0, "increaseAmount": 0, "status": "نشط"}, {"id": 1002, "name": "ا. خليل", "job": "إدارة", "basicSalary": 3000.0, "shiftHours": 8.0, "hourlyRate": 12.5, "overtime1": 16.88, "overtime2": 21.88, "overtimeMore": 25.0, "offDay": "SUNDAY", "lastIncreaseMonth": "-", "salaryBefore": 3000.0, "increaseAmount": 0, "status": "نشط"}, {"id": 1003, "name": "ا. عاطف النحاس", "job": "إدارة", "basicSalary": 4000.0, "shiftHours": 8.0, "hourlyRate": 16.67, "overtime1": 22.5, "overtime2": 29.17, "overtimeMore": 33.33, "offDay": "Friday", "lastIncreaseMonth": "-", "salaryBefore": 4000.0, "increaseAmount": 0, "status": "نشط"}, {"id": 2001, "name": "مايا محمد", "job": "استقبال", "basicSalary": 2650.0, "shiftHours": 8.0, "hourlyRate": 11.04, "overtime1": 14.91, "overtime2": 19.32, "overtimeMore": 22.08, "offDay": "Friday", "lastIncreaseMonth": "-", "salaryBefore": 2650.0, "increaseAmount": 0, "status": "نشط"}, {"id": 2002, "name": "مريم السيد", "job": "استقبال", "basicSalary": 2500.0, "shiftHours": 8.0, "hourlyRate": 10.42, "overtime1": 14.06, "overtime2": 18.23, "overtimeMore": 20.83, "offDay": "Tuesday", "lastIncreaseMonth": "-", "salaryBefore": 2500.0, "increaseAmount": 0, "status": "نشط"}, {"id": 2003, "name": "نادية احمد", "job": "استقبال", "basicSalary": 2650.0, "shiftHours": 8.0, "hourlyRate": 11.04, "overtime1": 14.91, "overtime2": 19.32, "overtimeMore": 22.08, "offDay": "Wednesday", "lastIncreaseMonth": "-", "salaryBefore": 2650.0, "increaseAmount": 0, "status": "نشط"}, {"id": 2004, "name": "شروق طارق", "job": "استقبال", "basicSalary": 2650.0, "shiftHours": 8.0, "hourlyRate": 11.04, "overtime1": 14.91, "overtime2": 19.32, "overtimeMore": 22.08, "offDay": "Friday", "lastIncreaseMonth": "-", "salaryBefore": 2650.0, "increaseAmount": 0, "status": "نشط"}, {"id": 2005, "name": "كريمان مصطفى", "job": "استقبال", "basicSalary": 1500.0, "shiftHours": 8.0, "hourlyRate": 6.25, "overtime1": 8.44, "overtime2": 10.94, "overtimeMore": 12.5, "offDay": "Friday", "lastIncreaseMonth": "-", "salaryBefore": 1500.0, "increaseAmount": 0, "status": "نشط"}, {"id": 2006, "name": "سما يوسف", "job": "استقبال", "basicSalary": 1500.0, "shiftHours": 8.0, "hourlyRate": 6.25, "overtime1": 8.44, "overtime2": 10.94, "overtimeMore": 12.5, "offDay": "Friday", "lastIncreaseMonth": "-", "salaryBefore": 1500.0, "increaseAmount": 0, "status": "نشط"}, {"id": 2007, "name": "نهى غريب", "job": "استقبال", "basicSalary": 3500.0, "shiftHours": 8.0, "hourlyRate": 14.58, "overtime1": 19.69, "overtime2": 25.52, "overtimeMore": 29.17, "offDay": "Friday", "lastIncreaseMonth": "-", "salaryBefore": 3500.0, "increaseAmount": 0, "status": "نشط"}, {"id": 2008, "name": "بسملة جمال", "job": "استقبال", "basicSalary": 2200.0, "shiftHours": 8.0, "hourlyRate": 9.17, "overtime1": 12.38, "overtime2": 16.04, "overtimeMore": 18.33, "offDay": "Friday", "lastIncreaseMonth": "-", "salaryBefore": 2200.0, "increaseAmount": 0, "status": "نشط"}, {"id": 3001, "name": "هدير عبد الصمد", "job": "تمريض", "basicSalary": 2650.0, "shiftHours": 7.0, "hourlyRate": 12.62, "overtime1": 17.04, "overtime2": 22.08, "overtimeMore": 25.24, "offDay": "Friday", "lastIncreaseMonth": "-", "salaryBefore": 2650.0, "increaseAmount": 0, "status": "نشط"}, {"id": 3002, "name": "غادة مجدى", "job": "تمريض", "basicSalary": 3000.0, "shiftHours": 7.0, "hourlyRate": 14.29, "overtime1": 19.29, "overtime2": 25.0, "overtimeMore": 28.57, "offDay": "لا اجازات", "lastIncreaseMonth": "-", "salaryBefore": 3000.0, "increaseAmount": 0, "status": "نشط"}, {"id": 3003, "name": "رانيا ياقوت", "job": "تمريض", "basicSalary": 2500.0, "shiftHours": 7.0, "hourlyRate": 11.9, "overtime1": 16.07, "overtime2": 20.83, "overtimeMore": 23.81, "offDay": "Friday", "lastIncreaseMonth": "-", "salaryBefore": 2500.0, "increaseAmount": 0, "status": "نشط"}, {"id": 3004, "name": "سلمى يسرى", "job": "تمريض", "basicSalary": 2500.0, "shiftHours": 7.0, "hourlyRate": 11.9, "overtime1": 16.07, "overtime2": 20.83, "overtimeMore": 23.81, "offDay": "Friday", "lastIncreaseMonth": "-", "salaryBefore": 2500.0, "increaseAmount": 0, "status": "نشط"}, {"id": 3005, "name": "دنيا محمد", "job": "تمريض", "basicSalary": 2650.0, "shiftHours": 7.0, "hourlyRate": 12.62, "overtime1": 17.04, "overtime2": 22.08, "overtimeMore": 25.24, "offDay": "Friday", "lastIncreaseMonth": "-", "salaryBefore": 2650.0, "increaseAmount": 0, "status": "نشط"}, {"id": 3006, "name": "هدى احمد", "job": "تمريض", "basicSalary": 2650.0, "shiftHours": 7.0, "hourlyRate": 12.62, "overtime1": 17.04, "overtime2": 22.08, "overtimeMore": 25.24, "offDay": "Friday", "lastIncreaseMonth": "-", "salaryBefore": 2650.0, "increaseAmount": 0, "status": "نشط"}, {"id": 3007, "name": "ايناس احمد", "job": "تمريض", "basicSalary": 1800.0, "shiftHours": 7.0, "hourlyRate": 8.57, "overtime1": 11.57, "overtime2": 15.0, "overtimeMore": 17.14, "offDay": "Wednesday", "lastIncreaseMonth": "-", "salaryBefore": 1800.0, "increaseAmount": 0, "status": "نشط"}, {"id": 3008, "name": "بسملة محمد", "job": "تمريض", "basicSalary": 1750.0, "shiftHours": 7.0, "hourlyRate": 8.33, "overtime1": 11.25, "overtime2": 14.58, "overtimeMore": 16.67, "offDay": "Friday", "lastIncreaseMonth": "-", "salaryBefore": 1750.0, "increaseAmount": 0, "status": "نشط"}, {"id": 3009, "name": "روان مصطفى", "job": "تمريض", "basicSalary": 2650.0, "shiftHours": 7.0, "hourlyRate": 12.62, "overtime1": 17.04, "overtime2": 22.08, "overtimeMore": 25.24, "offDay": "Wednesday", "lastIncreaseMonth": "-", "salaryBefore": 2650.0, "increaseAmount": 0, "status": "نشط"}, {"id": 3010, "name": "اميرة عامر", "job": "تمريض", "basicSalary": 2000.0, "shiftHours": 7.0, "hourlyRate": 9.52, "overtime1": 12.86, "overtime2": 16.67, "overtimeMore": 19.05, "offDay": "Wednesday", "lastIncreaseMonth": "-", "salaryBefore": 2000.0, "increaseAmount": 0, "status": "نشط"}, {"id": 3011, "name": "بسملة وائل", "job": "تمريض", "basicSalary": 1800.0, "shiftHours": 8.0, "hourlyRate": 7.5, "overtime1": 10.12, "overtime2": 13.12, "overtimeMore": 15.0, "offDay": "Friday", "lastIncreaseMonth": "-", "salaryBefore": 1800.0, "increaseAmount": 0, "status": "نشط"}, {"id": 3012, "name": "شروق وائل", "job": "تمريض", "basicSalary": 1800.0, "shiftHours": 8.0, "hourlyRate": 7.5, "overtime1": 10.12, "overtime2": 13.12, "overtimeMore": 15.0, "offDay": "Friday", "lastIncreaseMonth": "-", "salaryBefore": 1800.0, "increaseAmount": 0, "status": "نشط"}, {"id": 3013, "name": "نهى علاء", "job": "تمريض", "basicSalary": 1500.0, "shiftHours": 7.0, "hourlyRate": 7.14, "overtime1": 9.64, "overtime2": 12.5, "overtimeMore": 14.29, "offDay": "Friday", "lastIncreaseMonth": "-", "salaryBefore": 1500.0, "increaseAmount": 0, "status": "نشط"}, {"id": 3014, "name": "ريتاج محمد", "job": "تمريض", "basicSalary": 1500.0, "shiftHours": 7.0, "hourlyRate": 7.14, "overtime1": 9.64, "overtime2": 12.5, "overtimeMore": 14.29, "offDay": "Friday", "lastIncreaseMonth": "-", "salaryBefore": 1500.0, "increaseAmount": 0, "status": "نشط"}, {"id": 3015, "name": "دينا مهنى", "job": "تمريض", "basicSalary": 3000.0, "shiftHours": 12.0, "hourlyRate": 8.33, "overtime1": 11.25, "overtime2": 14.58, "overtimeMore": 16.67, "offDay": "Friday", "lastIncreaseMonth": "-", "salaryBefore": 3000.0, "increaseAmount": 0, "status": "نشط"}, {"id": 3016, "name": "بسملة جودة", "job": "تمريض", "basicSalary": 1000.0, "shiftHours": 7.0, "hourlyRate": 4.76, "overtime1": 6.43, "overtime2": 8.33, "overtimeMore": 9.52, "offDay": "Friday", "lastIncreaseMonth": "-", "salaryBefore": 1000.0, "increaseAmount": 0, "status": "نشط"}, {"id": 3017, "name": "هاجر احمد", "job": "تمريض", "basicSalary": 1500.0, "shiftHours": 7.0, "hourlyRate": 7.14, "overtime1": 9.64, "overtime2": 12.5, "overtimeMore": 14.29, "offDay": "Friday", "lastIncreaseMonth": "-", "salaryBefore": 1500.0, "increaseAmount": 0, "status": "نشط"}, {"id": 4001, "name": "على عطية", "job": "خدمات معاونة", "basicSalary": 3000.0, "shiftHours": 7.0, "hourlyRate": 14.29, "overtime1": 19.29, "overtime2": 25.0, "overtimeMore": 28.57, "offDay": "Friday", "lastIncreaseMonth": "-", "salaryBefore": 3000.0, "increaseAmount": 0, "status": "نشط"}, {"id": 4002, "name": "ابراهيم زكى", "job": "خدمات معاونة", "basicSalary": 3600.0, "shiftHours": 7.0, "hourlyRate": 17.14, "overtime1": 23.14, "overtime2": 30.0, "overtimeMore": 34.29, "offDay": "لا اجازات", "lastIncreaseMonth": "-", "salaryBefore": 3600.0, "increaseAmount": 0, "status": "نشط"}, {"id": 4003, "name": "سلوى جابر", "job": "خدمات معاونة", "basicSalary": 2250.0, "shiftHours": 7.0, "hourlyRate": 10.71, "overtime1": 14.46, "overtime2": 18.75, "overtimeMore": 21.43, "offDay": "Friday", "lastIncreaseMonth": "-", "salaryBefore": 2250.0, "increaseAmount": 0, "status": "نشط"}, {"id": 4004, "name": "هالة مسعد", "job": "خدمات معاونة", "basicSalary": 2500.0, "shiftHours": 7.0, "hourlyRate": 11.9, "overtime1": 16.07, "overtime2": 20.83, "overtimeMore": 23.81, "offDay": "SUNDAY", "lastIncreaseMonth": "-", "salaryBefore": 2500.0, "increaseAmount": 0, "status": "نشط"}, {"id": 4005, "name": "عبير محمد", "job": "خدمات معاونة", "basicSalary": 2250.0, "shiftHours": 7.0, "hourlyRate": 10.71, "overtime1": 14.46, "overtime2": 18.75, "overtimeMore": 21.43, "offDay": "Friday", "lastIncreaseMonth": "-", "salaryBefore": 2250.0, "increaseAmount": 0, "status": "نشط"}, {"id": 4006, "name": "فايزة على", "job": "خدمات معاونة", "basicSalary": 2500.0, "shiftHours": 7.0, "hourlyRate": 11.9, "overtime1": 16.07, "overtime2": 20.83, "overtimeMore": 23.81, "offDay": "Friday", "lastIncreaseMonth": "-", "salaryBefore": 2500.0, "increaseAmount": 0, "status": "نشط"}];

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

    let employees = JSON.parse(localStorage.getItem('erp_employees_db') || localStorage.getItem('erp_employees') || 'null');
    const needsMigration = !employees || employees.length === 0 || employees.some(e => e.id < 1000);

    if (needsMigration) {
        employees = INITIAL_EMPLOYEES;
        sortEmployeesByDeptAndCode();
        localStorage.setItem('erp_employees_db', JSON.stringify(employees));
        localStorage.setItem('erp_employees', JSON.stringify(employees));
    } else {
        // توحيد مسمى الإدارة للموظفين المخزنين
        let changed = false;
        employees.forEach(e => {
            if (e && e.job === 'ادارة') {
                e.job = 'إدارة';
                changed = true;
            }
        });
        sortEmployeesByDeptAndCode();
        if (changed) {
            localStorage.setItem('erp_employees_db', JSON.stringify(employees));
            localStorage.setItem('erp_employees', JSON.stringify(employees));
        }
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
        if (typeof refreshAllSearchableSelects === 'function') refreshAllSearchableSelects();

        // إغلاق قائمة الموبايل تلقائياً عند اختيار أي شاشة
        toggleMobileSidebar(false);
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
