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
    }

    function exportFullBackupJSON() {
        const fullBackup = {
            metadata: {
                appName: 'منظومة إدارة رواتب وسراكي عيادات سيدى ياقوت التخصصية',
                exportDate: new Date().toISOString(),
                exportedBy: currentUser ? currentUser.fullName : 'المدير العام',
                version: '3.0'
            },
            data: {
                employees: employees,
                attendanceRecords: attendanceRecords,
                salaryAdjustmentsDb: salaryAdjustmentsDb,
                savedPayrollSummaryCycles: savedPayrollSummaryCycles,
                officialHolidaysDb: officialHolidaysDb,
                usersDb: usersDb,
                leavesPermissionsDb: (typeof leavesPermissionsDb !== 'undefined') ? leavesPermissionsDb : JSON.parse(localStorage.getItem('erp_leaves_permissions_db') || '[]'),
                notificationsDb: (typeof notificationsDb !== 'undefined') ? notificationsDb : JSON.parse(localStorage.getItem('erp_notifications_db') || '[]'),
                smartPunchesDb: JSON.parse(localStorage.getItem('erp_smart_punches_db') || '[]')
            }
        };

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

    function confirmAndExecuteRestore() {
        if (!pendingBackupDataToRestore) {
            alert('يرجى اختيار ملف نسخة احتياطية أولاً!');
            return;
        }

        if (!confirm('⚠️ تنبيه أمني: استعادة النسخة الاحتياطية ستقوم بتحديث قاعدة بيانات المنظومة بالكامل بالبيانات الموجودة في الملف. هل تؤكد المتابعة؟')) {
            return;
        }

        if (pendingBackupDataToRestore.employees) {
            employees = pendingBackupDataToRestore.employees;
            localStorage.setItem('erp_employees_db', JSON.stringify(employees));
        }

        if (pendingBackupDataToRestore.attendanceRecords) {
            attendanceRecords = pendingBackupDataToRestore.attendanceRecords;
            localStorage.setItem('erp_attendance_db', JSON.stringify(attendanceRecords));
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

        if (pendingBackupDataToRestore.leavesPermissionsDb) {
            if (typeof leavesPermissionsDb !== 'undefined') leavesPermissionsDb = pendingBackupDataToRestore.leavesPermissionsDb;
            localStorage.setItem('erp_leaves_permissions_db', JSON.stringify(pendingBackupDataToRestore.leavesPermissionsDb));
        }

        if (pendingBackupDataToRestore.notificationsDb) {
            if (typeof notificationsDb !== 'undefined') notificationsDb = pendingBackupDataToRestore.notificationsDb;
            localStorage.setItem('erp_notifications_db', JSON.stringify(pendingBackupDataToRestore.notificationsDb));
        }

        if (pendingBackupDataToRestore.smartPunchesDb) {
            localStorage.setItem('erp_smart_punches_db', JSON.stringify(pendingBackupDataToRestore.smartPunchesDb));
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

    function clearAttendanceOnlyPrompt() {
        const conf = prompt('⚠️ هل تريد حقاً مسح جميع حركات الحضور والانصراف المسجلة؟\nاكتب كلمة "تأكيد" للمتابعة:');
        if (conf === 'تأكيد') {
            attendanceRecords = [];
            localStorage.setItem('erp_attendance_db', JSON.stringify(attendanceRecords));
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
        const conf = prompt('⚠️ تحذير شديد: سيتم مسح كافة البيانات وإعادة المنظومة لحالتها الأولى!\nللتأكيد، اكتب كلمة "تأكيد":');
        if (conf === 'تأكيد') {
            localStorage.clear();
            employees = INITIAL_EMPLOYEES;
            localStorage.setItem('erp_employees_db', JSON.stringify(employees));
            attendanceRecords = [];
            salaryAdjustmentsDb = {};
            usersDb = DEFAULT_USERS;
            localStorage.setItem('erp_users_db', JSON.stringify(usersDb));
            currentUser = usersDb[0];
            localStorage.setItem('erp_current_user', JSON.stringify(currentUser));

            updateAllDeptDropdownsAndFilters();
            populateAllEmployeeDropdowns();
            renderEmployeesTable();
            onShiftDateChanged();
            renderWelcomeDashboard();
            initAuthSystem();
            alert('تمت إعادة ضبط المصنع بنجاح!');
            window.location.reload();
        }
    }

