    // ==================== النسخ الاحتياطي واستعادة البيانات (Backup & Restore) ====================
    let pendingBackupDataToRestore = null;

    function renderBackupDashboard() {
        const empEl = document.getElementById('bk-stat-emp');
        const attEl = document.getElementById('bk-stat-att');
        const adjEl = document.getElementById('bk-stat-adj');

        if (empEl) empEl.textContent = `${employees.length} موظف`;
        if (attEl) attEl.textContent = `${attendanceRecords.length} حركة`;
        if (adjEl) {
            const cycleCount = Object.keys(salaryAdjustmentsDb || {}).length;
            adjEl.textContent = `${cycleCount} دورة مسجلة`;
        }

        updateServerBackupStatusDisplay();
    }

    function updateServerBackupStatusDisplay() {
        const lastStr = localStorage.getItem('erp_last_server_backup_str') || localStorage.getItem('erp_last_server_backup_time');
        const statusEl = document.getElementById('server-backup-last-time');
        if (statusEl) {
            if (lastStr) {
                statusEl.innerHTML = `<span style="color:#059669; font-weight:bold;">آخر حفظ: ${lastStr}</span>`;
            } else {
                statusEl.innerHTML = `<span style="color:#d97706;">لم يتم الحفظ على السيرفر بعد (سيعمل تلقائياً خلال 24 ساعة)</span>`;
            }
        }
    }

    function getFullSystemBackupData() {
        return {
            metadata: {
                appName: 'منظومة إدارة رواتب وسراكي عيادات سيدى ياقوت التخصصية',
                exportDate: new Date().toISOString(),
                exportedBy: (typeof currentUser !== 'undefined' && currentUser) ? currentUser.fullName : 'المدير العام',
                version: '3.5'
            },
            data: {
                employees: (typeof employees !== 'undefined') ? employees : [],
                attendanceRecords: (typeof attendanceRecords !== 'undefined') ? attendanceRecords : [],
                salaryAdjustmentsDb: (typeof salaryAdjustmentsDb !== 'undefined') ? salaryAdjustmentsDb : {},
                savedPayrollSummaryCycles: (typeof savedPayrollSummaryCycles !== 'undefined') ? savedPayrollSummaryCycles : {},
                officialHolidaysDb: (typeof officialHolidaysDb !== 'undefined') ? officialHolidaysDb : [],
                usersDb: (typeof usersDb !== 'undefined') ? usersDb : [],
                leavesPermissionsDb: (typeof leavesPermissionsDb !== 'undefined') ? leavesPermissionsDb : JSON.parse(localStorage.getItem('erp_leaves_permissions_db') || '[]'),
                notificationsDb: (typeof notificationsDb !== 'undefined') ? notificationsDb : JSON.parse(localStorage.getItem('erp_notifications_db') || '[]'),
                smartPunchesDb: JSON.parse(localStorage.getItem('erp_smart_punches_db') || '[]'),
                departments: (typeof departments !== 'undefined') ? departments : [],
                shifts: (typeof shifts !== 'undefined') ? shifts : []
            }
        };
    }

    function exportFullBackupJSON() {
        const fullBackup = getFullSystemBackupData();
        const jsonStr = JSON.stringify(fullBackup, null, 2);
        const dateStr = new Date().toISOString().split('T')[0];
        const filename = `نسخة_احتياطية_عيادات_سيدى_ياقوت_${dateStr}.json`;

        const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        showToast('تم تصدير وتحميل النسخة الاحتياطية الشاملة بنجاح! 💾');
    }

    function exportConsolidatedExcelBackup() {
        exportEmployeesCSV();
    }

    // ── نظام النسخ الاحتياطي التلقائي والدوري كل 24 ساعة على السيرفر ──
    async function saveBackupToServer(isAuto = false) {
        try {
            if (!window.currentUser || window.currentUser.role !== 'admin') {
                if (!isAuto) alert('حفظ النسخ الاحتياطية على الخادم متاح لمدير النظام فقط.');
                return;
            }
            const fullBackup = getFullSystemBackupData();
            const response = await window.authenticatedFetch('/api/backup/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(fullBackup)
            });
            const resData = await response.json();
            if (resData.success) {
                const nowIso = new Date().toISOString();
                const nowStr = resData.timestamp || new Date().toLocaleString('ar-EG');
                localStorage.setItem('erp_last_server_backup_time', String(Date.now()));
                localStorage.setItem('erp_last_server_backup_str', nowStr);
                updateServerBackupStatusDisplay();

                if (!isAuto) {
                    alert(`✔ ${resData.message}\nاسم الملف: ${resData.filename}\nتاريخ الحفظ: ${nowStr}`);
                    showToast('تم حفظ نسخة احتياطية على السيرفر بنجاح! 💾', 'success');
                } else {
                    if (typeof showToast === 'function') {
                        showToast('تم حفظ نسخة احتياطية دورية (كل 24 ساعة) على السيرفر بنجاح 💾', 'info');
                    }
                }
            } else {
                if (!isAuto) alert(`⚠️ فشل حفظ النسخة على السيرفر: ${resData.message}`);
            }
        } catch (err) {
            console.warn('تعذر الاتصال بسيرفر النسخ الاحتياطي:', err);
            if (!isAuto) {
                alert('⚠️ تعذر الاتصال بالسيرفر! يرجى التأكد من تشغيل السيرفر بواسطة ملف تشغيل_البرنامج_للشبكة_والموبايل.bat');
            }
        }
    }

    // ── استرجاع آخر نسخة احتياطية من السيرفر بضغطة زر ──
    async function restoreLatestBackupFromServer() {
        try {
            const btn = document.getElementById('btn-server-restore-latest');
            if (btn) {
                btn.disabled = true;
                btn.innerHTML = '⏳ جاري فحص السيرفر...';
            }

            const res = await window.authenticatedFetch('/api/backup/latest');
            const resData = await res.json();

            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '🔄 استرجاع آخر نسخة احتياطية من السيرفر';
            }

            if (!res.ok || !resData.success || !resData.backup) {
                alert(`⚠️ ${resData.message || 'لا توجد نسخة احتياطية محفوظة على السيرفر حتى الآن!'}`);
                return;
            }

            const bData = resData.backup.data || resData.backup;
            const empCount = bData.employees ? bData.employees.length : 0;
            const attCount = bData.attendanceRecords ? bData.attendanceRecords.length : 0;
            const lastMod = resData.lastModified || 'تاريخ غير محدد';

            const conf = confirm(
                `هل تؤكد استعادة آخر نسخة احتياطية محفوظة على السيرفر؟\n\n` +
                `• تاريخ النسخة على السيرفر: ${lastMod}\n` +
                `• عدد الموظفين: ${empCount} موظف\n` +
                `• عدد حركات الحضور: ${attCount} حركة\n\n` +
                `⚠️ تنبيه: سيتم تحديث قاعدة بيانات البرنامج بالكامل بالبيانات المسترجعة من السيرفر.`
            );

            if (!conf) return;

            pendingBackupDataToRestore = bData;
            confirmAndExecuteRestore();
        } catch (err) {
            console.error('خطأ في استرجاع النسخة من السيرفر:', err);
            const btn = document.getElementById('btn-server-restore-latest');
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '🔄 استرجاع آخر نسخة احتياطية من السيرفر';
            }
            alert('⚠️ تعذر الاتصال بالسيرفر لجلب آخر نسخة احتياطية! تأكد من تشغيل ملف Python الخادم (server.py).');
        }
    }

    // فحص النسخ التلقائي كل 24 ساعة في الخلفية
    function checkAndTrigger24hAutoBackup() {
        try {
            const lastBackupRaw = localStorage.getItem('erp_last_server_backup_time');
            const now = Date.now();
            const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

            if (!lastBackupRaw || (now - Number(lastBackupRaw)) >= TWENTY_FOUR_HOURS) {
                saveBackupToServer(true);
            }
        } catch(e) {}
    }

    // فحص النسخ التلقائي عند بدء التشغيل وتكراره كل ساعة
    setTimeout(checkAndTrigger24hAutoBackup, 5000);
    setInterval(checkAndTrigger24hAutoBackup, 60 * 60 * 1000);

    function onBackupFileSelected(input) {
        if (!input.files || input.files.length === 0) return;
        const file = input.files[0];
        const reader = new FileReader();

        reader.onload = function(e) {
            try {
                const parsed = JSON.parse(e.target.result);
                if (!parsed || (!parsed.data && !parsed.employees)) {
                    alert('⚠️ الملف المرفوع لا يحتوي على بنية بيانات صحيحة لنسخة احتياطية خاصة بالمنظومة!');
                    return;
                }

                pendingBackupDataToRestore = parsed.data || parsed;
                const empCount = pendingBackupDataToRestore.employees ? pendingBackupDataToRestore.employees.length : 0;
                const attCount = pendingBackupDataToRestore.attendanceRecords ? pendingBackupDataToRestore.attendanceRecords.length : 0;
                const exportDate = (parsed.metadata && parsed.metadata.exportDate) ? parsed.metadata.exportDate.split('T')[0] : 'غير محدد';

                const infoBox = document.getElementById('backup-file-preview-info');
                const prevCard = document.getElementById('backup-file-preview-card');
                const btn = document.getElementById('btn-confirm-restore');

                if (infoBox) {
                    infoBox.innerHTML = `
                        <div>• تاريخ النسخة: <strong>${exportDate}</strong></div>
                        <div>• عدد الموظفين: <strong>${empCount} موظف</strong></div>
                        <div>• عدد حركات الحضور: <strong>${attCount} حركة</strong></div>
                    `;
                }

                if (prevCard) prevCard.style.display = 'block';
                if (btn) {
                    btn.style.opacity = '1';
                    btn.style.pointerEvents = 'auto';
                }

                showToast('تم فحص الملف وجاهز للاستعادة بنجاح!', 'info');
            } catch(err) {
                alert('⚠️ خطأ في قراءة ملف JSON: تأكد من اختيار ملف سليم وغير تالف.');
            }
        };

        reader.readAsText(file);
    }

    async function confirmAndExecuteRestore() {
        if (!pendingBackupDataToRestore) {
            alert('يرجى اختيار ملف نسخة احتياطية أولاً!');
            return;
        }

        const hasLeavesBackup = Object.prototype.hasOwnProperty.call(pendingBackupDataToRestore, 'leavesPermissionsDb');
        if (hasLeavesBackup && !Array.isArray(pendingBackupDataToRestore.leavesPermissionsDb)) {
            alert('بيانات الإجازات والأذونات داخل النسخة الاحتياطية غير صالحة. لم تُستكمل الاستعادة.');
            return;
        }
        if (hasLeavesBackup) {
            try {
                const response = await window.authenticatedFetch('/api/leaves-permissions', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ items: pendingBackupDataToRestore.leavesPermissionsDb })
                });
                const result = await response.json();
                if (!response.ok || !result.success) {
                    throw new Error(result.message || 'تعذر استعادة طلبات الإجازات والأذونات.');
                }
                leavesPermissionsDb = pendingBackupDataToRestore.leavesPermissionsDb;
                localStorage.removeItem('erp_leaves_permissions_db');
            } catch (error) {
                alert(`تعذرت استعادة طلبات الإجازات والأذونات: ${error.message}\nلم تُستكمل الاستعادة.`);
                return;
            }
        }

        if (pendingBackupDataToRestore.employees) {
            employees = pendingBackupDataToRestore.employees;
            localStorage.setItem('erp_employees_db', JSON.stringify(employees));
            localStorage.setItem('erp_employees', JSON.stringify(employees));
        }

        if (pendingBackupDataToRestore.attendanceRecords) {
            attendanceRecords = pendingBackupDataToRestore.attendanceRecords;
            localStorage.setItem('erp_attendance_db', JSON.stringify(attendanceRecords));
            localStorage.setItem('erp_attendance', JSON.stringify(attendanceRecords));
        }

        if (pendingBackupDataToRestore.salaryAdjustmentsDb) {
            salaryAdjustmentsDb = pendingBackupDataToRestore.salaryAdjustmentsDb;
            localStorage.setItem('erp_salary_adjustments_db', JSON.stringify(salaryAdjustmentsDb));
        }

        if (pendingBackupDataToRestore.savedPayrollSummaryCycles) {
            savedPayrollSummaryCycles = pendingBackupDataToRestore.savedPayrollSummaryCycles;
            localStorage.setItem('erp_saved_payroll_cycles_db', JSON.stringify(savedPayrollSummaryCycles));
        }

        if (pendingBackupDataToRestore.officialHolidaysDb) {
            officialHolidaysDb = pendingBackupDataToRestore.officialHolidaysDb;
            localStorage.setItem('erp_official_holidays_db', JSON.stringify(officialHolidaysDb));
        }

        if (pendingBackupDataToRestore.usersDb) {
            usersDb = pendingBackupDataToRestore.usersDb;
            localStorage.setItem('erp_users_db', JSON.stringify(usersDb));
        }

        if (pendingBackupDataToRestore.notificationsDb) {
            if (typeof notificationsDb !== 'undefined') notificationsDb = pendingBackupDataToRestore.notificationsDb;
            localStorage.setItem('erp_notifications_db', JSON.stringify(pendingBackupDataToRestore.notificationsDb));
        }

        if (pendingBackupDataToRestore.smartPunchesDb) {
            localStorage.setItem('erp_smart_punches_db', JSON.stringify(pendingBackupDataToRestore.smartPunchesDb));
        }

        if (pendingBackupDataToRestore.departments) {
            departments = pendingBackupDataToRestore.departments;
            localStorage.setItem('erp_departments', JSON.stringify(departments));
        }

        if (pendingBackupDataToRestore.shifts) {
            shifts = pendingBackupDataToRestore.shifts;
            localStorage.setItem('erp_shifts', JSON.stringify(shifts));
        }

        // مزامنة السحابة
        if (typeof pushSingleCollectionToFirebase === 'function') {
            try {
                pushSingleCollectionToFirebase('employees', employees);
                pushSingleCollectionToFirebase('attendance', attendanceRecords);
                pushSingleCollectionToFirebase('salaryAdjustments', salaryAdjustmentsDb);
                pushSingleCollectionToFirebase('users', usersDb);
            } catch(e) {}
        }

        updateAllDeptDropdownsAndFilters();
        populateAllEmployeeDropdowns();
        renderEmployeesTable();
        onShiftDateChanged();
        renderWelcomeDashboard();
        renderBackupDashboard();
        initAuthSystem();

        showToast('تمت استعادة النسخة الاحتياطية بنجاح تام! 🔄', 'success');
        alert('✔ تمت استعادة كافة بيانات وقواعد بيانات المنظومة بنجاح!');
        switchScreen('screen-welcome', document.getElementById('nav-screen-welcome'));
    }

    // ── مسح وتصفير كافة البيانات المسجلة بالكامل (البرنامج فارغ تماماً) ──
    async function clearAllSystemDataCompletelyPrompt() {
        const conf = prompt(
            '⚠️ تحذير شديد ونهائي ⚠️\n' +
            'سيتم حذف وتصفير جميع بيانات البرنامج بالكامل:\n' +
            '• مسح جميع الموظفين (0 موظف)\n' +
            '• مسح سجلات الحضور والانصراف والورديات بالكامل\n' +
            '• مسح معاملات تسويات الرواتب والسلف والخصومات\n' +
            '• مسح مسيرات الرواتب ودورات الصرف\n' +
            '• مسح طلبات الإجازات والأذونات وبصمات الحضور الذكية\n' +
            'وسيصبح البرنامج فارغاً تماماً مع الاحتفاظ بحسابك الإداري.\n\n' +
            'للتأكيد والمتابعة، اكتب كلمة "مسح نهائي":'
        );

        if (conf !== 'مسح نهائي') {
            if (conf !== null) {
                alert('❌ تم إلغاء العملية، لم يتم مسح أي بيانات نظراً لعدم كتابة كلمة التأكيد بشكل صحيح.');
            }
            return;
        }

        try {
            const response = await window.authenticatedFetch('/api/leaves-permissions', { method: 'DELETE' });
            const result = await response.json();
            if (!response.ok || !result.success) {
                throw new Error(result.message || 'تعذر حذف طلبات الإجازات والأذونات.');
            }
        } catch (error) {
            alert(`تعذر حذف بيانات الإجازات والأذونات على الخادم: ${error.message}\nلم يتم مسح البيانات المحلية.`);
            return;
        }

        // الحفاظ على حساب الأدمن الأساسي أو الحساب الحالي لضمان عدم القفل
        const currentAdminUser = (usersDb && usersDb.find(u => u.username === 'admin')) || (currentUser ? currentUser : {
            username: 'admin',
            fullName: 'المدير العام',
            role: 'admin',
            permissions: (typeof ALL_SCREEN_IDS !== 'undefined' ? [...ALL_SCREEN_IDS] : []),
            screenAccess: (typeof ALL_SCREEN_IDS !== 'undefined' ? ALL_SCREEN_IDS.reduce((acc, sid) => ({ ...acc, [sid]: 'edit' }), {}) : {}),
            createdAt: new Date().toISOString().split('T')[0]
        });

        employees = [];
        attendanceRecords = [];
        salaryAdjustmentsDb = {};
        savedPayrollSummaryCycles = {};
        if (typeof leavesPermissionsDb !== 'undefined') leavesPermissionsDb = [];
        if (typeof notificationsDb !== 'undefined') notificationsDb = [];
        if (typeof payrollDeliveryDb !== 'undefined') payrollDeliveryDb = {};
        usersDb = [currentAdminUser];
        currentUser = currentAdminUser;

        // تفريغ التخزين المحلي
        localStorage.setItem('erp_employees_db', JSON.stringify([]));
        localStorage.setItem('erp_employees', JSON.stringify([]));
        localStorage.setItem('erp_attendance_db', JSON.stringify([]));
        localStorage.setItem('erp_attendance', JSON.stringify([]));
        localStorage.setItem('erp_salary_adjustments_db', JSON.stringify({}));
        localStorage.setItem('erp_saved_payroll_cycles_db', JSON.stringify({}));
        localStorage.removeItem('erp_leaves_permissions_db');
        localStorage.setItem('erp_notifications_db', JSON.stringify([]));
        localStorage.setItem('erp_smart_punches_db', JSON.stringify([]));
        localStorage.setItem('erp_payroll_delivery_db', JSON.stringify({}));
        localStorage.setItem('erp_users_db', JSON.stringify(usersDb));
        localStorage.setItem('erp_current_user', JSON.stringify(currentUser));

        // مزامنة التفريغ مع Firebase في حال الاتصال
        if (typeof pushSingleCollectionToFirebase === 'function') {
            try {
                pushSingleCollectionToFirebase('employees', []);
                pushSingleCollectionToFirebase('attendance', []);
                pushSingleCollectionToFirebase('salaryAdjustments', {});
                pushSingleCollectionToFirebase('users', usersDb);
            } catch(e) {}
        }

        // تحديث واجهات المنظومة
        if (typeof updateAllDeptDropdownsAndFilters === 'function') updateAllDeptDropdownsAndFilters();
        if (typeof populateAllEmployeeDropdowns === 'function') populateAllEmployeeDropdowns();
        if (typeof renderEmployeesTable === 'function') renderEmployeesTable();
        if (typeof onShiftDateChanged === 'function') onShiftDateChanged();
        if (typeof renderWelcomeDashboard === 'function') renderWelcomeDashboard();
        if (typeof renderBackupDashboard === 'function') renderBackupDashboard();
        if (typeof initAuthSystem === 'function') initAuthSystem();
        if (typeof refreshActiveScreenData === 'function') refreshActiveScreenData();

        alert('✔ تم مسح وتصفير كافة بيانات البرنامج بنجاح تام! المنظومة الآن فارغة تماماً وجاهزة لتسجيل البيانات الجديدة.');
        showToast('تم تصفير المنظومة ومسح كافة البيانات بالكامل 🗑️', 'warning');
        switchScreen('screen-welcome', document.getElementById('nav-screen-welcome'));
    }

    function clearAttendanceOnlyPrompt() {
        const conf = prompt('⚠️ هل تريد حقاً مسح جميع حركات الحضور والانصراف المسجلة؟\nاكتب كلمة "تأكيد" للمتابعة:');
        if (conf === 'تأكيد') {
            attendanceRecords = [];
            localStorage.setItem('erp_attendance_db', JSON.stringify(attendanceRecords));
            localStorage.setItem('erp_attendance', JSON.stringify(attendanceRecords));
            onShiftDateChanged();
            renderWelcomeDashboard();
            renderBackupDashboard();
            showToast('تم مسح سجلات الحضور والانصراف بنجاح!', 'warning');
        }
    }

    function clearAdjustmentsOnlyPrompt() {
        const conf = prompt('⚠️ هل تريد حقاً مسح كافة معاملات تسويات الرواتب المسجلة؟\nاكتب كلمة "تأكيد" للمتابعة:');
        if (conf === 'تأكيد') {
            salaryAdjustmentsDb = {};
            localStorage.setItem('erp_salary_adjustments_db', JSON.stringify(salaryAdjustmentsDb));
            renderAdjustmentsTable();
            if (typeof renderPayrollSummaryTable === 'function') renderPayrollSummaryTable();
            renderBackupDashboard();
            showToast('تم مسح معاملات تسويات الرواتب بنجاح!', 'warning');
        }
    }

    function factoryResetPrompt() {
        alert('استعادة بيانات الموظفين الافتراضية لم تعد متاحة لأن بياناتهم لا تُضمّن في ملفات الواجهة. لم يتم مسح أي بيانات. لاستعادة النظام، استخدم نسخة احتياطية موثوقة.');
    }

    // إتاحة الدوال عامة
    window.saveBackupToServer = saveBackupToServer;
    window.restoreLatestBackupFromServer = restoreLatestBackupFromServer;
    window.clearAllSystemDataCompletelyPrompt = clearAllSystemDataCompletelyPrompt;
    window.checkAndTrigger24hAutoBackup = checkAndTrigger24hAutoBackup;
