    // ==================== أدوات الحضور والانصراف السريعة الذكية ====================
    function fillDefaultShiftTimesForAll() {
        syncCurrentTableRowsToMemory();
        pushAttendanceHistory();
        let filledCount = 0;
        currentDailyAttendance.forEach((item, idx) => {
            if (item.empId && item.empId > 0) {
                const emp = employees.find(e => e.id === item.empId);
                const shiftH = emp ? (Number(emp.shiftHours) || 8) : (Number(item.shiftHours) || 8);
                item.timeIn = '08:30';

                // حساب وقت الانصراف بإضافة ساعات الشيفت
                const startMins = 8 * 60 + 30; // 510
                const endMins = Math.round(startMins + (shiftH * 60));
                const endH = Math.floor(endMins / 60) % 24;
                const endM = endMins % 60;
                item.timeOut = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;

                item.hours = shiftH;
                item.basicHours = shiftH;
                item.ovTotal = 0;
                item.ov1 = 0;
                item.ov2 = 0;
                item.ovMore = 0;
                filledCount++;
            }
        });

        renderDailyAttendanceTable();
        showToast(`تم تعبئة مواعيد الشيفت الافتراضية بنجاح لعدد (${filledCount}) موظف! ⚡`, 'success');
    }

    function clearCurrentDailyTimes() {
        if (!confirm('هل تريد تفريغ مواعيد الحضور والانصراف المسجلة لليومية الحالية؟')) return;
        syncCurrentTableRowsToMemory();
        pushAttendanceHistory();
        currentDailyAttendance.forEach(item => {
            item.timeIn = '';
            item.timeOut = '';
            item.hours = 0;
            item.basicHours = 0;
            item.ovTotal = 0;
            item.ov1 = 0;
            item.ov2 = 0;
            item.ovMore = 0;
        });
        renderDailyAttendanceTable();
        showToast('تم تفريغ مواعيد اليومية بنجاح! 🧹', 'warning');
    }

    // ==================== تسوية مالية موحدة لقسم بالكامل ====================
    function openBatchDeptBonusModal() {
        const deptSel = document.getElementById('batch-dept-select');
        if (!deptSel) return;
        deptSel.innerHTML = '';

        const deptsSet = new Set();
        employees.forEach(e => {
            if (e.job) {
                const j = e.job.trim();
                deptsSet.add(j === 'ادارة' ? 'إدارة' : j);
            }
        });
        Array.from(deptsSet).sort((a, b) => a.localeCompare(b, 'ar')).forEach(d => {
            const opt = document.createElement('option');
            opt.value = d;
            opt.textContent = d;
            deptSel.appendChild(opt);
        });

        document.getElementById('batch-adj-amount').value = '';
        document.getElementById('batch-adj-note').value = '';
        document.getElementById('modal-batch-dept-adj').style.display = 'flex';
    }

    function closeBatchDeptBonusModal() {
        document.getElementById('modal-batch-dept-adj').style.display = 'none';
    }

    function handleBatchDeptBonusSubmit(e) {
        e.preventDefault();
        const dept = document.getElementById('batch-dept-select').value;
        const adjType = document.getElementById('batch-adj-type').value;
        const amount = parseFloat(document.getElementById('batch-adj-amount').value) || 0;
        const note = document.getElementById('batch-adj-note').value.trim();

        if (amount <= 0) {
            alert('يرجى إدخال مبلغ تسوية صحيح!');
            return;
        }

        const cycleKey = getActiveAdjustmentCycleKey();
        const targetEmps = employees.filter(e => e.status !== 'انتهت خدمته' && e.job === dept);

        if (targetEmps.length === 0) {
            alert(`لا يوجد موظفون على رأس العمل في قسم (${dept})!`);
            return;
        }

        pushAdjustmentsHistory();

        targetEmps.forEach(emp => {
            const adj = getEmployeeAdjustmentRecord(cycleKey, emp.id);
            adj[adjType] = (Number(adj[adjType]) || 0) + amount;

            const parts = cycleKey.split('_');
            const monthKey = parts.length > 1 ? parts[1].substring(0, 7) : '';

            if (!salaryAdjustmentsDb[cycleKey]) salaryAdjustmentsDb[cycleKey] = {};
            salaryAdjustmentsDb[cycleKey][emp.id] = adj;

            if (monthKey) {
                if (!salaryAdjustmentsDb[monthKey]) salaryAdjustmentsDb[monthKey] = {};
                salaryAdjustmentsDb[monthKey][emp.id] = adj;
            }
        });

        localStorage.setItem('erp_salary_adjustments_db', JSON.stringify(salaryAdjustmentsDb));
        if (typeof pushSingleCollectionToFirebase === 'function') pushSingleCollectionToFirebase('salaryAdjustments', salaryAdjustmentsDb);
        closeBatchDeptBonusModal();
        renderAdjustmentsTable();
        if (typeof renderPayrollSummaryTable === 'function') renderPayrollSummaryTable();

        showToast(`تم تطبيق مبلغ (${amount} ج.م) بنجاح على عدد (${targetEmps.length}) موظف في قسم [${dept}]! ⚡`, 'success');
    }

