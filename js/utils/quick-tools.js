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

    // =========================================================================
    // محرك احتساب ساعات البصمة الذكية والربط المحاسبي مع الرواتب والسراكي
    // Smart Biometric Attendance & Multi-Punch Calculation Engine
    // =========================================================================

    // جلب حركات البصمات من الذاكرة أو التخزين المحلي
    function getSmartPunchesDb() {
        if (typeof window.smartPunchesList !== 'undefined' && Array.isArray(window.smartPunchesList) && window.smartPunchesList.length > 0) {
            return window.smartPunchesList;
        }
        try {
            const stored = JSON.parse(localStorage.getItem('erp_smart_punches_db') || '[]');
            if (Array.isArray(stored) && stored.length > 0) {
                window.smartPunchesList = stored;
                return stored;
            }
        } catch (e) {
            console.warn('[SmartPunchEngine] Error parsing erp_smart_punches_db:', e);
        }
        return [];
    }

    // تحميل سجل البصمات من السيرفر إلى الذاكرة المؤقتة للجلسة فقط
    async function loadSmartPunchesFromServer(onComplete) {
        let punches = [];
        try {
            const resp = await window.authenticatedFetch('/api/attendance/punches');
            const data = await resp.json();
            if (!resp.ok || !data.success || !Array.isArray(data.punches)) {
                throw new Error(data.message || 'تعذر تحميل سجل البصمات من الخادم.');
            }
            punches = data.punches;
            window.smartPunchesList = punches;
        } catch (e) {
            console.warn('[SmartPunchEngine] Server punch history unavailable; using legacy local cache.', e);
            punches = getSmartPunchesDb();
            if (typeof showToast === 'function') {
                showToast('تعذر تحميل سجل البصمات الكامل من الخادم؛ البيانات المحلية قد تكون قديمة أو ناقصة.', 'error');
            }
        }
        if (typeof onComplete === 'function') onComplete(punches);
        return punches;
    }

    // تحويل نص الوقت (HH:MM أو HH:MM:SS) إلى دقائق منذ منتصف الليل
    function timeStrToMinutes(timeStr) {
        if (!timeStr) return 0;
        const parts = String(timeStr).trim().split(':');
        const h = parseInt(parts[0], 10) || 0;
        const m = parseInt(parts[1], 10) || 0;
        return (h * 60) + m;
    }

    // احتساب ساعات يوم واحد من حركات البصمة (مع دعم أكثر من حركة دخول وخروج وفحص البصمات الناقصة)
    function computeDayPunchHours(dayPunches, standardShiftHours = 8) {
        const shiftH = parseFloat(standardShiftHours) || 8;
        if (!dayPunches || !Array.isArray(dayPunches) || dayPunches.length === 0) {
            return {
                valid: false,
                issue: 'لا توجد بصمات',
                totalHours: 0,
                basicHours: 0,
                ovTotal: 0,
                ov1: 0,
                ov2: 0,
                ovMore: 0,
                firstIn: '-',
                lastOut: '-',
                punchesCount: 0
            };
        }

        // ترتيب الحركات زمنياً
        const sorted = dayPunches.slice().sort((a, b) => {
            const tA = a.time || (a.timestamp ? a.timestamp.split('T')[1] : '');
            const tB = b.time || (b.timestamp ? b.timestamp.split('T')[1] : '');
            return tA.localeCompare(tB);
        });

        // تصفية حركات الدخول والانصراف
        const ins = sorted.filter(p => p.type === 'in' || (p.typeTitle && p.typeTitle.includes('حضور')));
        const outs = sorted.filter(p => p.type === 'out' || (p.typeTitle && p.typeTitle.includes('انصراف')));

        const firstIn = ins.length > 0 ? (ins[0].time || '-') : '-';
        const lastOut = outs.length > 0 ? (outs[outs.length - 1].time || '-') : '-';

        // 1. فحص البصمات الناقصة (حسب البند 11 من المتطلبات)
        if (ins.length > 0 && outs.length === 0) {
            return {
                valid: false,
                issue: 'دخول بدون خروج',
                totalHours: 0,
                basicHours: 0,
                ovTotal: 0,
                ov1: 0,
                ov2: 0,
                ovMore: 0,
                firstIn,
                lastOut: '-',
                punchesCount: sorted.length
            };
        }

        if (ins.length === 0 && outs.length > 0) {
            return {
                valid: false,
                issue: 'خروج بدون دخول',
                totalHours: 0,
                basicHours: 0,
                ovTotal: 0,
                ov1: 0,
                ov2: 0,
                ovMore: 0,
                firstIn: '-',
                lastOut,
                punchesCount: sorted.length
            };
        }

        if (ins.length !== outs.length) {
            return {
                valid: false,
                issue: 'بصمة ناقصة (عدم تطابق حركات الدخول مع الخروج)',
                totalHours: 0,
                basicHours: 0,
                ovTotal: 0,
                ov1: 0,
                ov2: 0,
                ovMore: 0,
                firstIn,
                lastOut,
                punchesCount: sorted.length
            };
        }

        // 2. احتساب دقائق العمل الفعلية لكافة الفترات (مثال: 08:00 - 12:00 ثم 13:00 - 17:00 = 8 ساعات)
        let totalWorkedMinutes = 0;
        for (let i = 0; i < ins.length; i++) {
            const inMins = timeStrToMinutes(ins[i].time);
            const outMins = timeStrToMinutes(outs[i].time);
            let diff = outMins - inMins;
            if (diff < 0) {
                // للورديات الليلية الممتدة لليوم التالي
                diff += 24 * 60;
            }
            totalWorkedMinutes += diff;
        }

        const totalHours = Math.round((totalWorkedMinutes / 60) * 100) / 100;
        const basicHours = Math.min(totalHours, shiftH);
        const ovTotal = Math.max(0, Math.round((totalHours - basicHours) * 100) / 100);

        // توزيع الإضافي على الشرائح المعتمدة بالمنظومة
        const ov1 = Math.min(ovTotal, 1.0);
        const ov2 = Math.min(Math.max(0, Math.round((ovTotal - 1.0) * 100) / 100), 1.0);
        const ovMore = Math.max(0, Math.round((ovTotal - 2.0) * 100) / 100);

        return {
            valid: true,
            issue: null,
            totalHours,
            basicHours,
            ovTotal,
            ov1,
            ov2,
            ovMore,
            firstIn,
            lastOut,
            punchesCount: sorted.length
        };
    }

    // احتساب ساعات وحضور موظف بالكامل من البصمة في فترة زمنية محددة
    function calculateEmployeeBiometricAttendance(emp, startDate, endDate, punchesList) {
        if (!emp) return {
            dailyRecords: [],
            totActualHours: 0,
            totBasicHours: 0,
            totOvHours: 0,
            totOv1Hours: 0,
            totOv2Hours: 0,
            totOvMoreHours: 0,
            attendedDaysCount: 0,
            workedHolidaysCount: 0,
            missingIssues: [],
            hasMissingIssues: false
        };

        const allPunches = Array.isArray(punchesList) ? punchesList : getSmartPunchesDb();
        const empIdStr = String(emp.id).trim();
        const empNameClean = (emp.name || '').trim();

        // تصفية حركات الموظف المقبولة في النطاق الزمني
        const empPunches = allPunches.filter(p => {
            if (!p) return false;
            const pEmpId = String(p.empId || '').trim();
            const pEmpName = String(p.empName || '').trim();
            const matchId = (pEmpId === empIdStr) || (pEmpId === ('EMP_' + empIdStr)) || (pEmpId === emp.code);
            const matchName = pEmpName && empNameClean && (pEmpName === empNameClean || pEmpName.includes(empNameClean) || empNameClean.includes(pEmpName));
            if (!matchId && !matchName) return false;

            // استبعاد الحركات المرفوضة خارج النطاق إن وجدت
            if (p.status === 'REJECTED_OUT_OF_RANGE') return false;

            const pDate = p.date || (p.timestamp ? p.timestamp.split('T')[0] : '');
            if (startDate && pDate < startDate) return false;
            if (endDate && pDate > endDate) return false;
            return true;
        });

        // تجميع الحركات باليوم
        const daysMap = {};
        empPunches.forEach(p => {
            const pDate = p.date || (p.timestamp ? p.timestamp.split('T')[0] : '');
            if (!pDate) return;
            if (!daysMap[pDate]) daysMap[pDate] = [];
            daysMap[pDate].push(p);
        });

        const dailyRecords = [];
        const missingIssues = [];
        let totActualHours = 0;
        let totBasicHours = 0;
        let totOvHours = 0;
        let totOv1Hours = 0;
        let totOv2Hours = 0;
        let totOvMoreHours = 0;
        let workedHolidaysCount = 0;

        const shiftH = Number(emp.shiftHours) || 8;
        const sortedDates = Object.keys(daysMap).sort();

        sortedDates.forEach(dateVal => {
            const dayPunches = daysMap[dateVal];
            const calc = computeDayPunchHours(dayPunches, shiftH);
            const isHol = (typeof officialHolidaysDb !== 'undefined' && Array.isArray(officialHolidaysDb) && officialHolidaysDb.includes(dateVal));

            if (!calc.valid && calc.issue) {
                missingIssues.push({
                    empId: emp.id,
                    empName: emp.name,
                    date: dateVal,
                    issue: calc.issue
                });
            } else {
                totActualHours += calc.totalHours;
                totBasicHours += calc.basicHours;
                totOvHours += calc.ovTotal;
                totOv1Hours += calc.ov1;
                totOv2Hours += calc.ov2;
                totOvMoreHours += calc.ovMore;

                if (isHol && calc.totalHours > 0) {
                    workedHolidaysCount++;
                }
            }

            dailyRecords.push({
                date: dateVal,
                timeIn: calc.firstIn,
                timeOut: calc.lastOut,
                hours: calc.totalHours,
                basicHours: calc.basicHours,
                ovTotal: calc.ovTotal,
                ov1: calc.ov1,
                ov2: calc.ov2,
                ovMore: calc.ovMore,
                hasMissingPunch: !calc.valid,
                missingIssue: calc.issue,
                isHoliday: isHol,
                source: 'بصمة',
                sourceLabel: 'تسجيل ذكي / بصمة',
                punchesCount: calc.punchesCount
            });
        });

        return {
            dailyRecords,
            totActualHours: Math.round(totActualHours * 100) / 100,
            totBasicHours: Math.round(totBasicHours * 100) / 100,
            totOvHours: Math.round(totOvHours * 100) / 100,
            totOv1Hours: Math.round(totOv1Hours * 100) / 100,
            totOv2Hours: Math.round(totOv2Hours * 100) / 100,
            totOvMoreHours: Math.round(totOvMoreHours * 100) / 100,
            attendedDaysCount: sortedDates.filter(d => daysMap[d].length > 0).length,
            workedHolidaysCount,
            missingIssues,
            hasMissingIssues: missingIssues.length > 0
        };
    }

    // فحص دورة الرواتب بالكامل لاكتشاف أي بصمات ناقصة لجميع الموظفين المستهدفين
    function checkCycleBiometricMissingPunches(startDate, endDate, targetEmps) {
        const emps = Array.isArray(targetEmps) ? targetEmps : (typeof employees !== 'undefined' ? employees : []);
        const activeEmps = emps.filter(e => e && e.status !== 'انتهت خدمته');
        const allIssues = [];

        activeEmps.forEach(emp => {
            const bio = calculateEmployeeBiometricAttendance(emp, startDate, endDate);
            if (bio.hasMissingIssues) {
                allIssues.push(...bio.missingIssues);
            }
        });

        return {
            hasIssues: allIssues.length > 0,
            issues: allIssues
        };
    }

    // تسجيل عملية احتساب الراتب في سجل التدقيق (Audit Log)
    function recordPayrollCalculationAudit(entry) {
        if (!entry) return;
        try {
            const auditDb = JSON.parse(localStorage.getItem('erp_payroll_calc_audit_history') || '[]');
            const record = {
                id: 'audit_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
                empId: entry.empId || '-',
                empName: entry.empName || '-',
                job: entry.job || '-',
                period: entry.period || '-',
                calculatedAt: entry.calculatedAt || new Date().toISOString(),
                calculatedBy: entry.calculatedBy || (typeof currentUser !== 'undefined' && currentUser ? (currentUser.fullName || currentUser.name || currentUser.username) : 'المدير العام'),
                source: entry.source || 'يدوي',
                sourceLabel: (entry.source === 'punch' || entry.source === 'بصمة') ? 'تسجيل ذكي / بصمة' : 'تسجيل يدوي',
                totalHours: Number(entry.totalHours) || 0,
                basicHours: Number(entry.basicHours) || 0,
                overtimeHours: Number(entry.overtimeHours) || 0,
                netSalary: Number(entry.netSalary) || 0
            };
            auditDb.unshift(record);
            if (auditDb.length > 1000) auditDb.length = 1000;
            localStorage.setItem('erp_payroll_calc_audit_history', JSON.stringify(auditDb));
            return record;
        } catch (e) {
            console.warn('[AuditLog] Error recording payroll audit:', e);
        }
    }

    // استرجاع سجلات التدقيق لدورة معينة أو لكافة العمليات
    function getPayrollCalculationAuditLog(cycleKey) {
        try {
            const list = JSON.parse(localStorage.getItem('erp_payroll_calc_audit_history') || '[]');
            if (!cycleKey) return list;
            return list.filter(item => item.period && item.period.includes(cycleKey.replace('_', ' إلى ')));
        } catch (e) {
            return [];
        }
    }

    // تصدير دوال محرك البصمة الذكية إلى النطاق العام
    window.getSmartPunchesDb = getSmartPunchesDb;
    window.loadSmartPunchesFromServer = loadSmartPunchesFromServer;
    window.timeStrToMinutes = timeStrToMinutes;
    window.computeDayPunchHours = computeDayPunchHours;
    window.calculateEmployeeBiometricAttendance = calculateEmployeeBiometricAttendance;
    window.checkCycleBiometricMissingPunches = checkCycleBiometricMissingPunches;
    window.recordPayrollCalculationAudit = recordPayrollCalculationAudit;
    window.getPayrollCalculationAuditLog = getPayrollCalculationAuditLog;
