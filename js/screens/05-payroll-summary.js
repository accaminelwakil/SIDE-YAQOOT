// ==================== 2.2 شاشة إجمالي رواتب الموظفين (25 إلى 24 مع تفاصيل الإضافي والتسويات) ====================

    let payrollSummaryHistoryStack = [];
    let savedPayrollSummaryCycles = JSON.parse(localStorage.getItem('erp_saved_payroll_cycles_db') || '{}');
    let payrollCalculationMode = window.getPayrollCalculationModePreference();

    function setPayrollSummaryCalcMode(mode) {
        payrollCalculationMode = (mode === 'punch') ? 'punch' : 'manual';
        try { localStorage.setItem('erp_payroll_calc_mode', payrollCalculationMode); } catch(e){}

        const btnManual = document.getElementById('btn-psummary-mode-manual');
        const btnPunch = document.getElementById('btn-psummary-mode-punch');
        const sourceLabel = document.getElementById('psummary-source-label');
        const statusStrip = document.getElementById('psummary-source-status-strip');

        if (btnManual && btnPunch) {
            if (payrollCalculationMode === 'manual') {
                btnManual.classList.add('active');
                btnPunch.classList.remove('active');
            } else {
                btnPunch.classList.add('active');
                btnManual.classList.remove('active');
            }
        }

        if (sourceLabel) {
            if (payrollCalculationMode === 'manual') {
                sourceLabel.textContent = '[ ✍️ التسجيل اليدوي لشاشة الحضور والانصراف ]';
                sourceLabel.style.color = '#15803d';
                if (statusStrip) {
                    statusStrip.style.background = '#f0fdf4';
                    statusStrip.style.borderColor = '#86efac';
                }
            } else {
                sourceLabel.textContent = '[ 📱 الحضور المعتمد: بصمات الوجه والتسجيل اليدوي المعتمد ]';
                sourceLabel.style.color = '#1d4ed8';
                if (statusStrip) {
                    statusStrip.style.background = '#eff6ff';
                    statusStrip.style.borderColor = '#93c5fd';
                }
            }
        }

        renderPayrollSummaryTable();
    }
    window.setPayrollSummaryCalcMode = setPayrollSummaryCalcMode;



    function getDayNumberFromOffDayStr(offStr) {

        if (!offStr) return -1;

        const s = String(offStr).toLowerCase();

        if (s.includes('لا اجاز') || s.includes('لا إجاز')) return -1;

        if (s.includes('fri') || s.includes('جمع')) return 5;

        if (s.includes('sun') || s.includes('أحد') || s.includes('احد')) return 0;

        if (s.includes('mon') || s.includes('اثنين')) return 1;

        if (s.includes('tue') || s.includes('ثلاث')) return 2;

        if (s.includes('wed') || s.includes('أربع') || s.includes('اربع')) return 3;

        if (s.includes('thu') || s.includes('خميس')) return 4;

        if (s.includes('sat') || s.includes('سبت')) return 6;

        return 5;

    }



    function calculateOffDaysCountBetweenDates(startDateStr, endDateStr, offDayStr, empOrEmpIdOrCount) {

        const targetDayNum = getDayNumberFromOffDayStr(offDayStr);

        if (targetDayNum < 0) return 0;



        let fullOffDaysCount = 0;

        if (startDateStr && endDateStr) {

            let cur = new Date(startDateStr);

            const end = new Date(endDateStr);

            while (cur <= end) {

                if (cur.getDay() === targetDayNum) {

                    fullOffDaysCount++;

                }

                cur.setDate(cur.getDate() + 1);

            }

        } else {

            fullOffDaysCount = 4;

        }



        // إذا لم يتم تمرير الموظف أو عدد الشيفتات، يتم إرجاع عدد الراحات بالكامل كافتراضي

        if (empOrEmpIdOrCount === undefined || empOrEmpIdOrCount === null) {

            return fullOffDaysCount;

        }



        let attendedCount = 0;

        if (typeof empOrEmpIdOrCount === 'number') {

            attendedCount = empOrEmpIdOrCount;

        } else {

            const empId = (typeof empOrEmpIdOrCount === 'object') ? empOrEmpIdOrCount.id : empOrEmpIdOrCount;

            const recs = (attendanceRecords || []).filter(r => {

                return r && r.empId === empId &&

                       (!startDateStr || r.date >= startDateStr) &&

                       (!endDateStr || r.date <= endDateStr) &&

                       (Number(r.hours) > 0 || r.timeIn);

            });

            attendedCount = recs.length;

        }



        // قاعدة احتساب أيام الراحات الأسبوعية بحسب عدد الشيفتات المحضورة:

        // - فى حالة ان الموظف حضر يومان الى 6 ايام يتم احتساب يوم واحد فقط راحة اسبوعية

        // - فى حالة الموظف حضر من 7 ايام الى 14 يوم يتم احتساب 2 يوم فقط اجازة اسبوعية

        // - فى حالة حضر من 15 يوم الى 20 يوم يتم احتساب 3 ايام

        // - فى حالة تخطية ال 20 يوم يتم احتساب عدد ايام الراحات بالكامل

        // - أقل من يومين (0 أو 1): 0 راحة أسبوعية

        if (attendedCount < 2) {

            return 0;

        } else if (attendedCount >= 2 && attendedCount <= 6) {

            return Math.min(1, fullOffDaysCount);

        } else if (attendedCount >= 7 && attendedCount <= 14) {

            return Math.min(2, fullOffDaysCount);

        } else if (attendedCount >= 15 && attendedCount <= 20) {

            return Math.min(3, fullOffDaysCount);

        } else {

            return fullOffDaysCount;

        }

    }



    function populatePayrollCyclesDropdown() {

        const select = document.getElementById('psummary-cycle-select');

        if (!select) return;



        const now = new Date();

        const curY = now.getFullYear();

        select.innerHTML = '';



        for (let m = 1; m <= 12; m++) {

            let prevM = m - 1;

            let prevY = curY;

            if (prevM === 0) {

                prevM = 12;

                prevY = curY - 1;

            }



            const startStr = `${prevY}-${String(prevM).padStart(2, '0')}-25`;

            const endStr = `${curY}-${String(m).padStart(2, '0')}-24`;

            const mName = arabicMonths[m - 1];

            const prevMName = arabicMonths[prevM - 1];



            const opt = document.createElement('option');

            opt.value = `${startStr}|${endStr}`;

            opt.textContent = `راتب شهر ${mName} ${curY} (من 25 ${prevMName} إلى 24 ${mName})`;



            const todayStr = now.toISOString().split('T')[0];

            if (todayStr >= startStr && todayStr <= endStr) {

                opt.selected = true;

            } else if (!select.value && m === (now.getMonth() + 1)) {

                opt.selected = true;

            }



            select.appendChild(opt);

        }



        onPayrollCycleSelectChanged();

    }



    function onPayrollCycleSelectChanged() {
        const select = document.getElementById('psummary-cycle-select');
        if (!select || !select.value) return;

        const [startVal, endVal] = select.value.split('|');
        const startInput = document.getElementById('psummary-start-date');
        const endInput = document.getElementById('psummary-end-date');

        if (startInput) startInput.value = startVal;
        if (endInput) endInput.value = endVal;

        const cycleKey = `${startVal}_${endVal}`;
        if (savedPayrollSummaryCycles && savedPayrollSummaryCycles[cycleKey] && savedPayrollSummaryCycles[cycleKey].calculationSource) {
            setPayrollSummaryCalcMode(savedPayrollSummaryCycles[cycleKey].calculationSource);
        } else {
            setPayrollSummaryCalcMode(payrollCalculationMode);
        }

        renderPayrollSummaryTable();
    }

    function undoPayrollSummaryAction() {
        if (payrollSummaryHistoryStack.length === 0) {
            alert('لا توجد معاملات سابقة للتراجع عنها في هذه الشاشة!');
            return;
        }

        if (confirm('هل تريد التراجع عن آخر حركة تم إجراؤها في شاشة إجمالي الرواتب؟')) {
            const prev = payrollSummaryHistoryStack.pop();
            savedPayrollSummaryCycles = JSON.parse(prev);
            localStorage.setItem('erp_saved_payroll_cycles_db', JSON.stringify(savedPayrollSummaryCycles));
            if (typeof pushSingleCollectionToFirebase === 'function') pushSingleCollectionToFirebase('payrollCycles', savedPayrollSummaryCycles);
            renderPayrollSummaryTable();
            alert('تم التراجع بنجاح!');
        }
    }

    function savePayrollSummaryExplicit() {
        const startInput = document.getElementById('psummary-start-date');
        const endInput = document.getElementById('psummary-end-date');
        if (!startInput || !endInput || !startInput.value || !endInput.value) {
            alert('يرجى تحديد فترة دورة الراتب أولاً!');
            return;
        }

        const cycleKey = `${startInput.value}_${endInput.value}`;

        payrollSummaryHistoryStack.push(JSON.stringify(savedPayrollSummaryCycles));

        savedPayrollSummaryCycles[cycleKey] = {
            savedAt: new Date().toISOString(),
            startDate: startInput.value,
            endDate: endInput.value,
            calculationSource: payrollCalculationMode,
            sourceLabel: payrollCalculationMode === 'punch' ? 'تسجيل ذكي / بصمة' : 'تسجيل يدوي'
        };

        localStorage.setItem('erp_saved_payroll_cycles_db', JSON.stringify(savedPayrollSummaryCycles));
        if (typeof pushSingleCollectionToFirebase === 'function') pushSingleCollectionToFirebase('payrollCycles', savedPayrollSummaryCycles);

        // تسجيل في سجل عمليات الاحتساب (Audit Log)
        if (typeof recordPayrollCalculationAudit === 'function' && Array.isArray(window.lastRenderedPayrollSummaryList)) {
            window.lastRenderedPayrollSummaryList.forEach(entry => {
                recordPayrollCalculationAudit(entry);
            });
        }

        const sourceArabic = (payrollCalculationMode === 'punch') ? 'التسجيل الذكي (البصمة)' : 'التسجيل اليدوي';
        alert(`تم حفظ واعتماد مسير رواتب الفترة من [ ${startInput.value} إلى ${endInput.value} ] بنجاح في المنظومة! 💾\n(مصدر الاحتساب المعتمد: ${sourceArabic})`);
    }



    function renderPayrollSummaryTable() {

        sortEmployeesByDeptAndCode();

        const tbody = document.getElementById('payroll-summary-tbody');

        const empty = document.getElementById('psummary-empty');

        if (!tbody) return;



        const startInput = document.getElementById('psummary-start-date');

        const endInput = document.getElementById('psummary-end-date');

        const startDate = startInput ? startInput.value : '';
        const endDate = endInput ? endInput.value : '';

        if (
            startDate && endDate &&
            typeof window.ensurePayrollCycleInputs === 'function' &&
            !window.payrollCycleInputsReady(startDate, endDate)
        ) {
            const tbody = document.getElementById('payroll-summary-tbody');
            if (tbody) tbody.innerHTML = '<tr><td colspan="40" style="padding:18px;text-align:center;">جارٍ تحميل الحضور وأقساط السلف للدورة...</td></tr>';
            window.ensurePayrollCycleInputs(startDate, endDate)
                .then(() => renderPayrollSummaryTable())
                .catch(error => {
                    if (typeof showToast === 'function') showToast(error.message, 'error');
                    if (tbody) tbody.innerHTML = `<tr><td colspan="40" style="padding:18px;text-align:center;color:#b91c1c;">${error.message}</td></tr>`;
                });
            return;
        }
        if (startDate && endDate) {
            window.activePayrollCycleKey = `${startDate}_${endDate}`;
        }



        // تحديد شهر التسوية المرتبط بدورة الراتب (نهاية الدورة 24 من الشهر)

        const adjMonthKey = endDate ? endDate.substring(0, 7) : (startDate ? startDate.substring(0, 7) : '');



        const term = (document.getElementById('psummary-search') ? document.getElementById('psummary-search').value : '').trim();

        const normTerm = typeof normalizeArabicText === 'function' ? normalizeArabicText(term) : term.toLowerCase();

        const deptFilter = document.getElementById('psummary-dept-filter') ? document.getElementById('psummary-dept-filter').value : '';



        // تصفية الموظفين النشطين فقط

        const activeEmps = employees.filter(e => {

            if (e.status === 'انتهت خدمته') return false;

            const normName = typeof normalizeArabicText === 'function' ? normalizeArabicText(e.name) : (e.name || '').toLowerCase();

            const normJob = typeof normalizeArabicText === 'function' ? normalizeArabicText(e.job) : (e.job || '').toLowerCase();

            const idStr = String(e.id || '');

            const matchName = !term || normName.includes(normTerm) || normJob.includes(normTerm) || idStr.includes(term);

            const matchDept = deptFilter ? e.job === deptFilter : true;

            return matchName && matchDept;

        });



        tbody.innerHTML = '';

        if (activeEmps.length === 0) {
            if (empty) empty.style.display = 'block';
            updatePayrollSummaryTotalsDOM({});
            return;
        }

        if (empty) empty.style.display = 'none';

        const colTotals = {
            basicSalary: 0, basicHours: 0, basicWage: 0,
            ovHours: 0, ov1Hours: 0, ov1Wage: 0,
            ov2Hours: 0, ov2Wage: 0, ovMoreHours: 0, ovMoreWage: 0, ovTotalWage: 0,
            holidayAllowance: 0, workWage: 0, offDays: 0, offWage: 0,
            visits: 0, cashback: 0, rewards: 0, admin: 0, bonus: 0, additions: 0,
            advances: 0, penalties: 0, insurance: 0, supplies: 0, otherDeductions: 0, deductions: 0,
            netPeriod: 0
        };

        const alertEl = document.getElementById('psummary-missing-punch-alert');
        let cycleBiometricIssues = [];
        if (payrollCalculationMode === 'punch') {
            if (typeof checkCycleBiometricMissingPunches === 'function') {
                const checkRes = checkCycleBiometricMissingPunches(startDate, endDate, activeEmps);
                if (checkRes && checkRes.hasIssues) {
                    cycleBiometricIssues = checkRes.issues || [];
                }
            }
            if (alertEl) {
                if (cycleBiometricIssues.length > 0) {
                    alertEl.style.display = 'block';
                    const sample = cycleBiometricIssues.slice(0, 3).map(i => `${i.empName} (${i.date}: ${i.issue})`).join(' ، ');
                    const more = cycleBiometricIssues.length > 3 ? ` + (${cycleBiometricIssues.length - 3} حالات أخرى)` : '';
                    alertEl.innerHTML = `⚠️ <strong>تنبيه بيانات بصمة ناقصة:</strong> تم رصد (${cycleBiometricIssues.length}) حركة غير مكتملة [${sample}${more}]. يرجى مراجعة وتصحيح البصمات قبل الاعتماد!`;
                } else {
                    alertEl.style.display = 'none';
                }
            }
        } else {
            if (alertEl) alertEl.style.display = 'none';
        }

        window.lastRenderedPayrollSummaryList = [];

        activeEmps.forEach(emp => {
            const rates = computeRates(emp.basicSalary, emp.shiftHours);

            let basicHours = 0;
            let ov1Hours = 0;
            let ov2Hours = 0;
            let ovMoreHours = 0;
            let workedHolidaysCount = 0;
            let attendedDaysForOff = 0;
            let empHasMissingPunches = false;
            let empMissingIssueText = '';

            if (payrollCalculationMode === 'punch') {
                // ── استخدام بيانات البصمة الموجودة بالفعل دون جمعها مع اليدوي ──
                let bio = { totBasicHours: 0, totOv1Hours: 0, totOv2Hours: 0, totOvMoreHours: 0, totOvHours: 0, attendedDaysCount: 0, workedHolidaysCount: 0, hasMissingIssues: false, missingIssues: [] };
                if (typeof calculateEmployeeBiometricAttendance === 'function') {
                    bio = calculateEmployeeBiometricAttendance(emp, startDate, endDate);
                }
                basicHours = bio.totBasicHours;
                ov1Hours = bio.totOv1Hours;
                ov2Hours = bio.totOv2Hours;
                ovMoreHours = bio.totOvMoreHours;
                workedHolidaysCount = bio.workedHolidaysCount;
                attendedDaysForOff = bio.attendedDaysCount;
                if (bio.hasMissingIssues && bio.missingIssues.length > 0) {
                    empHasMissingPunches = true;
                    empMissingIssueText = bio.missingIssues.map(m => `${m.date}: ${m.issue}`).join(' | ');
                }
            } else {
                // ── سجلات الحضور اليدوية القديمة ──
                const empRecords = attendanceRecords.filter(r => {
                    return r.empId === emp.id && (!startDate || r.date >= startDate) && (!endDate || r.date <= endDate);
                });
                basicHours = empRecords.reduce((sum, r) => sum + (Number(r.basicHours) || 0), 0);
                ov1Hours = empRecords.reduce((sum, r) => sum + (Number(r.ov1) || 0), 0);
                ov2Hours = empRecords.reduce((sum, r) => sum + (Number(r.ov2) || 0), 0);
                ovMoreHours = empRecords.reduce((sum, r) => sum + (Number(r.ovMore) || 0), 0);
                const holRecords = empRecords.filter(r => (r.isHoliday || (Array.isArray(officialHolidaysDb) && officialHolidaysDb.includes(r.date))) && (Number(r.hours) > 0 || r.timeIn));
                workedHolidaysCount = new Set(holRecords.map(r => r.date)).size;
                attendedDaysForOff = empRecords.filter(r => (Number(r.hours) > 0 || r.timeIn)).length;
            }

            const basicWage = Math.round((basicHours * rates.hourlyRate) * 100) / 100;
            const ov1Wage = Math.round((ov1Hours * rates.ov1) * 100) / 100;
            const ov2Wage = Math.round((ov2Hours * rates.ov2) * 100) / 100;
            const ovMoreWage = Math.round((ovMoreHours * rates.ovMore) * 100) / 100;
            const ovTotalHours = Math.round((ov1Hours + ov2Hours + ovMoreHours) * 100) / 100;
            const ovTotalWage = Math.round((ov1Wage + ov2Wage + ovMoreWage) * 100) / 100;

            const dailyBasicRate = Math.round((emp.basicSalary / 30.0) * 100) / 100;
            const holidayAllowance = Math.round((workedHolidaysCount * dailyBasicRate) * 100) / 100;
            const totalWorkWage = Math.round((basicWage + ovTotalWage + holidayAllowance) * 100) / 100;

            // 4. احتساب الراحات الأسبوعية وقيمتها
            const offDaysCount = calculateOffDaysCountBetweenDates(startDate, endDate, emp.offDay, attendedDaysForOff);
            const offDaysWage = Math.round((offDaysCount * dailyBasicRate) * 100) / 100;



            // 5. جلب بيانات ملف التسويات الخاصة بالموظف للشهر المالي

            const cycleKey = `${startDate}_${endDate}`;

            const adj = getEmployeeAdjustmentRecord(cycleKey, emp.id);



            const visits = Number(adj.visits) || 0;

            const cashback = Number(adj.cashback) || 0;

            const rewards = Number(adj.rewards) || 0;

            const adminAllowance = Number(adj.adminAllowance) || 0;

            const bonus = Number(adj.bonus) || 0;

            const totalAdditions = visits + cashback + rewards + adminAllowance + bonus;



            const legacyAdvances = Number(adj.advances) || 0;
            const loanInstallment = typeof window.getPayrollLoanInstallment === 'function'
                ? window.getPayrollLoanInstallment(emp.id, cycleKey)
                : 0;
            const advances = Math.round((legacyAdvances + loanInstallment) * 100) / 100;

            const penalties = Number(adj.penalties) || 0;

            const insurance = Number(adj.insurance) || 0;

            const supplies = Number(adj.supplies) || 0;

            const otherDeductions = Number(adj.otherDeductions) || 0;

            const totalDeductions = advances + penalties + insurance + supplies + otherDeductions;



            const netAdjustment = totalAdditions - totalDeductions;



            // 6. صافي الراتب المستحق

            const finalNetSalary = Math.round((totalWorkWage + offDaysWage + totalAdditions - totalDeductions) * 100) / 100;



            colTotals.basicSalary += (Number(emp.basicSalary) || 0);
            colTotals.basicHours += basicHours;
            colTotals.basicWage += basicWage;
            colTotals.ovHours += ovTotalHours;
            colTotals.ov1Hours += ov1Hours;
            colTotals.ov1Wage += ov1Wage;
            colTotals.ov2Hours += ov2Hours;
            colTotals.ov2Wage += ov2Wage;
            colTotals.ovMoreHours += ovMoreHours;
            colTotals.ovMoreWage += ovMoreWage;
            colTotals.ovTotalWage += ovTotalWage;
            colTotals.holidayAllowance += holidayAllowance;
            colTotals.workWage += totalWorkWage;
            colTotals.offDays += offDaysCount;
            colTotals.offWage += offDaysWage;
            colTotals.visits += visits;
            colTotals.cashback += cashback;
            colTotals.rewards += rewards;
            colTotals.admin += adminAllowance;
            colTotals.bonus += bonus;
            colTotals.additions += totalAdditions;
            colTotals.advances += advances;
            colTotals.penalties += penalties;
            colTotals.insurance += insurance;
            colTotals.supplies += supplies;
            colTotals.otherDeductions += otherDeductions;
            colTotals.deductions += totalDeductions;
            colTotals.netPeriod += finalNetSalary;

            window.lastRenderedPayrollSummaryList.push({
                empId: emp.id,
                empName: emp.name,
                job: emp.job,
                period: `${startDate} إلى ${endDate}`,
                source: payrollCalculationMode,
                sourceLabel: (payrollCalculationMode === 'punch') ? 'تسجيل ذكي / بصمة' : 'تسجيل يدوي',
                calculatedBy: (typeof currentUser !== 'undefined' && currentUser) ? (currentUser.fullName || currentUser.name || currentUser.username) : 'المدير العام',
                totalHours: Math.round((basicHours + ovTotalHours) * 100) / 100,
                basicHours: basicHours,
                overtimeHours: ovTotalHours,
                netSalary: finalNetSalary
            });

            const tr = document.createElement('tr');
            if (empHasMissingPunches) {
                tr.style.backgroundColor = 'rgba(254, 226, 226, 0.4)';
            }

            tr.innerHTML = `
                <td class="sticky-col-1"><span class="badge badge-dept">${emp.job}</span></td>
                <td class="sticky-col-2"><strong>#${emp.id}</strong></td>
                <td class="sticky-col-3">
                    <strong>${emp.name}</strong>
                    ${empHasMissingPunches ? `<span title="⚠️ بصمة ناقصة: ${empMissingIssueText}" style="color:#b91c1c; font-size:12.5px; font-weight:bold; cursor:pointer;" onclick="alert('⚠️ تنبيه بصمة ناقصة للموظف [${emp.name}]:\\n${empMissingIssueText}')"> ⚠️</span>` : ''}
                </td>
                <td style="color:var(--text-main); font-weight:bold;">${Number(emp.basicSalary).toLocaleString()} ج.م</td>

                

                <!-- الشيفت الأساسي -->

                <td style="color:var(--accent); font-weight:bold;">${basicHours.toFixed(2)} س</td>

                <td style="color:#10b981; font-weight:bold;">${basicWage.toLocaleString('ar-EG', {minimumFractionDigits: 2})} ج.م</td>



                <!-- الإضافي المقسم بشرائحه الثلاث -->

                <td style="color:var(--warning); font-weight:bold;">${ovTotalHours.toFixed(2)} س</td>

                <td>${ov1Hours.toFixed(2)} س</td>

                <td style="color:#10b981;">${ov1Wage.toLocaleString('ar-EG', {minimumFractionDigits: 2})} ج.م</td>

                <td>${ov2Hours.toFixed(2)} س</td>

                <td style="color:#10b981;">${ov2Wage.toLocaleString('ar-EG', {minimumFractionDigits: 2})} ج.م</td>

                <td>${ovMoreHours.toFixed(2)} س</td>

                <td style="color:#10b981;">${ovMoreWage.toLocaleString('ar-EG', {minimumFractionDigits: 2})} ج.م</td>

                <td style="color:#10b981; font-weight:bold;">${ovTotalWage.toLocaleString('ar-EG', {minimumFractionDigits: 2})} ج.م</td>

                <td style="color:#ef4444; font-weight:bold;">${holidayAllowance > 0 ? holidayAllowance.toLocaleString('ar-EG', {minimumFractionDigits: 2}) + ' ج.م (' + workedHolidaysCount + ' يوم)' : '-'}</td>

                <td style="color:#10b981; font-weight:bold; background:rgba(16,185,129,0.08);">${totalWorkWage.toLocaleString('ar-EG', {minimumFractionDigits: 2})} ج.م</td>



                <!-- الراحات الأسبوعية -->

                <td style="color:#f59e0b; font-weight:bold;">${offDaysCount} أيام (${emp.offDay || 'غير محدد'})</td>

                <td style="color:#f59e0b; font-weight:bold;">${offDaysWage.toLocaleString('ar-EG', {minimumFractionDigits: 2})} ج.م</td>



                <!-- بنود التسويات: الإضافات -->

                <td>${visits ? visits.toLocaleString() : '-'}</td>

                <td>${cashback ? cashback.toLocaleString() : '-'}</td>

                <td>${rewards ? rewards.toLocaleString() : '-'}</td>

                <td>${adminAllowance ? adminAllowance.toLocaleString() : '-'}</td>

                <td>${bonus ? bonus.toLocaleString() : '-'}</td>

                <td style="color:#10b981; font-weight:bold; background:rgba(16,185,129,0.08);">${totalAdditions.toLocaleString('ar-EG', {minimumFractionDigits: 2})} ج.م</td>



                <!-- بنود التسويات: الاستقطاعات -->

                <td style="color:#ef4444;">${advances ? advances.toLocaleString() : '-'}</td>

                <td style="color:#ef4444;">${penalties ? penalties.toLocaleString() : '-'}</td>

                <td style="color:#ef4444;">${insurance ? insurance.toLocaleString() : '-'}</td>

                <td style="color:#ef4444;">${supplies ? supplies.toLocaleString() : '-'}</td>

                <td style="color:#ef4444;">${otherDeductions ? otherDeductions.toLocaleString() : '-'}</td>

                <td style="color:#ef4444; font-weight:bold; background:rgba(239,68,68,0.08);">${totalDeductions.toLocaleString('ar-EG', {minimumFractionDigits: 2})} ج.م</td>



                <!-- الصافي النهائي المعتمد -->

                <td style="color:#a855f7; font-weight:800; font-size:14px; background:rgba(168,85,247,0.15);">${finalNetSalary.toLocaleString('ar-EG', {minimumFractionDigits: 2})} ج.م</td>

            `;

            tbody.appendChild(tr);

        });



        updatePayrollSummaryTotalsDOM(colTotals);

    }



    function updatePayrollSummaryTotalsDOM(t) {
        if (!t) t = {};
        const fmt = (n, dec = 2) => Number(n || 0).toLocaleString('ar-EG', { minimumFractionDigits: dec, maximumFractionDigits: dec });
        const setTxt = (id, txt) => {
            const el = document.getElementById(id);
            if (el) el.textContent = txt;
        };

        setTxt('psummary-tot-basic-salary', fmt(t.basicSalary));
        setTxt('psummary-tot-basic-hours', `${fmt(t.basicHours)} س`);
        setTxt('psummary-tot-basic-wage', fmt(t.basicWage));
        setTxt('psummary-tot-ov-hours', `${fmt(t.ovHours)} س`);
        setTxt('psummary-tot-ov1-hours', `${fmt(t.ov1Hours)} س`);
        setTxt('psummary-tot-ov1-wage', fmt(t.ov1Wage));
        setTxt('psummary-tot-ov2-hours', `${fmt(t.ov2Hours)} س`);
        setTxt('psummary-tot-ov2-wage', fmt(t.ov2Wage));
        setTxt('psummary-tot-ovmore-hours', `${fmt(t.ovMoreHours)} س`);
        setTxt('psummary-tot-ovmore-wage', fmt(t.ovMoreWage));
        setTxt('psummary-tot-ov-total-wage', fmt(t.ovTotalWage));
        setTxt('psummary-tot-holiday-allowance', fmt(t.holidayAllowance));
        setTxt('psummary-tot-work-wage-col', fmt(t.workWage));
        setTxt('psummary-tot-off-days-col', `${t.offDays || 0}`);
        setTxt('psummary-tot-off-wage-col', fmt(t.offWage));
        setTxt('psummary-tot-visits', fmt(t.visits));
        setTxt('psummary-tot-cashback', fmt(t.cashback));
        setTxt('psummary-tot-rewards', fmt(t.rewards));
        setTxt('psummary-tot-admin', fmt(t.admin));
        setTxt('psummary-tot-bonus', fmt(t.bonus));
        setTxt('psummary-tot-additions', fmt(t.additions));
        setTxt('psummary-tot-advances', fmt(t.advances));
        setTxt('psummary-tot-penalties', fmt(t.penalties));
        setTxt('psummary-tot-insurance', fmt(t.insurance));
        setTxt('psummary-tot-supplies', fmt(t.supplies));
        setTxt('psummary-tot-other-deductions', fmt(t.otherDeductions));
        setTxt('psummary-tot-deductions', fmt(t.deductions));
        setTxt('psummary-tot-net-period-col', `${fmt(t.netPeriod)} ج.م`);
    }



    function getPayrollSummaryPrintHtml() {

        sortEmployeesByDeptAndCode();

        const activeEmps = employees.filter(e => e.status !== 'انتهت خدمته');

        if (activeEmps.length === 0) {

            alert('لا يوجد موظفون على رأس العمل لطباعة كشف إجمالي الرواتب!');

            return null;

        }



        const startInput = document.getElementById('psummary-start-date');

        const endInput = document.getElementById('psummary-end-date');

        const startDate = startInput ? startInput.value : '';

        const endDate = endInput ? endInput.value : '';

        const cycleKey = `${startDate}_${endDate}`;



        const now = new Date();

        const printDate = `${now.getDate()} ${arabicMonths[now.getMonth()]} ${now.getFullYear()}`;



        let rowsHtml = '';

        let totSal = 0, totWork = 0, totOffWage = 0, totAdd = 0, totDed = 0, totNet = 0;

        let totOv = 0, totHolWage = 0;



        activeEmps.forEach((emp, idx) => {

            const rates = computeRates(emp.basicSalary, emp.shiftHours);

            const empRecords = attendanceRecords.filter(r => {

                return r.empId === emp.id && (!startDate || r.date >= startDate) && (!endDate || r.date <= endDate);

            });



            const basicHours = empRecords.reduce((sum, r) => sum + (Number(r.basicHours) || 0), 0);

            const basicWage = Math.round((basicHours * rates.hourlyRate) * 100) / 100;



            const ov1Hours = empRecords.reduce((sum, r) => sum + (Number(r.ov1) || 0), 0);

            const ov1Wage = Math.round((ov1Hours * rates.ov1) * 100) / 100;



            const ov2Hours = empRecords.reduce((sum, r) => sum + (Number(r.ov2) || 0), 0);

            const ov2Wage = Math.round((ov2Hours * rates.ov2) * 100) / 100;



            const ovMoreHours = empRecords.reduce((sum, r) => sum + (Number(r.ovMore) || 0), 0);

            const ovMoreWage = Math.round((ovMoreHours * rates.ovMore) * 100) / 100;



            const ovTotalWage = Math.round((ov1Wage + ov2Wage + ovMoreWage) * 100) / 100;



            // احتساب أيام العمل في الإجازات الرسمية وبدل الإجازات

            const dailyBasicRate = Math.round((emp.basicSalary / 30.0) * 100) / 100;

            const holRecords = empRecords.filter(r => (r.isHoliday || officialHolidaysDb.includes(r.date)) && (Number(r.hours) > 0 || r.timeIn));

            const workedHolidaysCount = new Set(holRecords.map(r => r.date)).size;

            const holidayAllowance = Math.round((workedHolidaysCount * dailyBasicRate) * 100) / 100;



            const totalWorkWage = Math.round((basicWage + ovTotalWage + holidayAllowance) * 100) / 100;



            const offDaysCount = calculateOffDaysCountBetweenDates(startDate, endDate, emp.offDay, emp);

            const offDaysWage = Math.round((offDaysCount * dailyBasicRate) * 100) / 100;



            // جلب التسويات بدقة بدلالة دورة الراتب

            const adj = getEmployeeAdjustmentRecord(cycleKey, emp.id);

            const additions = (Number(adj.visits)||0) + (Number(adj.cashback)||0) + (Number(adj.rewards)||0) + (Number(adj.adminAllowance)||0) + (Number(adj.bonus)||0);

            const deductions = (Number(adj.advances)||0) + (Number(adj.penalties)||0) + (Number(adj.insurance)||0) + (Number(adj.supplies)||0) + (Number(adj.otherDeductions)||0);



            const finalNetSalary = Math.round((totalWorkWage + offDaysWage + additions - deductions) * 100) / 100;



            totSal += emp.basicSalary;

            totWork += totalWorkWage;

            totOv += ovTotalWage;

            totHolWage += holidayAllowance;

            totOffWage += offDaysWage;

            totAdd += additions;

            totDed += deductions;

            totNet += finalNetSalary;



            rowsHtml += `

                <tr>

                    <td>${idx + 1}</td>

                    <td>${emp.job}</td>

                    <td style="font-weight:bold; font-family:Consolas, monospace;">#${emp.id}</td>

                    <td style="text-align:right; padding-right:8px; font-weight:bold;">${emp.name}</td>

                    <td>${Number(emp.basicSalary).toLocaleString()}</td>

                    <td>${basicHours.toFixed(1)} س</td>

                    <td>${basicWage.toLocaleString()}</td>

                    <td>${ov1Wage.toLocaleString()}</td>

                    <td>${ov2Wage.toLocaleString()}</td>

                    <td>${ovMoreWage.toLocaleString()}</td>

                    <td style="color:#047857; font-weight:bold;">${ovTotalWage.toLocaleString()}</td>

                    <td style="color:#b91c1c; font-weight:bold;">${workedHolidaysCount > 0 ? holidayAllowance.toLocaleString() + ' (' + workedHolidaysCount + 'ي)' : '-'}</td>

                    <td style="font-weight:bold; background:#ecfdf5;">${totalWorkWage.toLocaleString()}</td>

                    <td>${offDaysCount} ي (${offDaysWage.toLocaleString()})</td>

                    <td style="color:#047857; font-weight:bold;">+${additions.toLocaleString()}</td>

                    <td style="color:#b91c1c; font-weight:bold;">-${deductions.toLocaleString()}</td>

                    <td style="font-weight:bold; background:#f5f3ff;">${finalNetSalary.toLocaleString()}</td>

                </tr>

            `;

        });



        return `

            <!DOCTYPE html>

            <html lang="ar" dir="rtl">

            <head>

                <meta charset="UTF-8">

                <meta name="viewport" content="width=device-width, initial-scale=1">

                <title>كشف إجمالي رواتب الموظفين الشامل - عيادات سيدى ياقوت التخصصية</title>

                <style>
                    @page { size: A4 landscape; margin: 4mm 5mm; }
                    * { box-sizing: border-box !important; }
                    body { font-family: Tahoma, 'Segoe UI', Arial, sans-serif; direction: rtl; color: #000; margin: 0; padding: 4px; background:#fff; }
                    table { width: 100% !important; border-collapse: collapse !important; table-layout: fixed !important; margin-top: 4px; font-size: 8pt !important; text-align: center !important; }
                    th, td { border: 1px solid #000 !important; padding: 2px 1.5px !important; line-height: 1.15 !important; overflow: hidden !important; text-overflow: ellipsis !important; }
                    th { background-color: #f1f5f9 !important; font-weight: bold !important; font-size: 8pt !important; }
                    .footer { margin-top: 10px; display: flex; justify-content: space-between; font-size: 9pt; font-weight: bold; padding: 0 10px; }
                </style>
            </head>
            <body>
                ${typeof getClinicReportHeaderHtml === 'function' ? getClinicReportHeaderHtml('كشف مسير إجمالي رواتب العاملين الشامل', `الفترة من [ ${startDate} ] إلى [ ${endDate} ]`) : `
                <div class="header" style="text-align:center; border-bottom:2px solid #990012; padding-bottom:6px; margin-bottom:8px;">
                    <h2 style="margin:0; color:#102a45; font-size:16px;">عيادات سيدى ياقوت التخصصية</h2>
                    <p style="margin:3px 0 0 0; font-size:11px; color:#475569;">كشف مسير إجمالي رواتب العاملين الشامل للفترة من [ ${startDate} ] إلى [ ${endDate} ] | تاريخ الطباعة: ${printDate}</p>
                </div>`}
                <table>
                    <thead>
                        <tr>
                            <th style="width:3%;">م</th>
                            <th style="width:8%;">القسم</th>
                            <th style="width:4%;">الكود</th>
                            <th style="width:15%;">اسم الموظف</th>
                            <th style="width:6%;">الأساسي</th>
                            <th style="width:5%;">س.أساسي</th>
                            <th style="width:6%;">أجر أساسي</th>
                            <th style="width:5%;">إضافي س1</th>
                            <th style="width:5%;">إضافي س2</th>
                            <th style="width:5%;">فوق س2</th>
                            <th style="width:6%; background:#d1fae5;">إجمالي الإضافي</th>
                            <th style="width:5%; background:#fee2e2;">بدل إجازات</th>
                            <th style="width:6%; background:#d1fae5;">إجمالي العمل</th>
                            <th style="width:6%;">الراحات</th>
                            <th style="width:5%; background:#d1fae5;">إضافات</th>
                            <th style="width:5%; background:#fee2e2;">استقطاعات</th>
                            <th style="width:10%; background:#ede9fe;">صافي الراتب</th>
                        </tr>
                    </thead>

                    <tbody>

                        ${rowsHtml}

                        <tr style="font-weight:bold; background:#f8fafc;">

                            <td colspan="4" style="text-align:right; padding-right:8px;">الإجماليات العامة للمؤسسة:</td>

                            <td>${totSal.toLocaleString()} ج.م</td>

                            <td colspan="4">-</td>

                            <td>-</td>

                            <td style="color:#047857;">${totOv.toLocaleString()} ج.م</td>

                            <td style="color:#b91c1c;">${totHolWage.toLocaleString()} ج.م</td>

                            <td style="color:#047857;">${totWork.toLocaleString()} ج.م</td>

                            <td>${totOffWage.toLocaleString()} ج.م</td>

                            <td style="color:#047857;">+${totAdd.toLocaleString()} ج.م</td>

                            <td style="color:#b91c1c;">-${totDed.toLocaleString()} ج.م</td>

                            <td style="color:#6d28d9;">${totNet.toLocaleString()} ج.م</td>

                        </tr>

                    </tbody>

                </table>

                <div style="margin-top:6px; font-size:9pt; font-weight:bold; text-align:right; padding-right:4px;">
                    إجمالي عدد الموظفين المستحقين: ${activeEmps.length} موظف &nbsp;|&nbsp; إجمالي صافي الرواتب: ${totNet.toLocaleString()} ج.م
                </div>

            </body>

            </html>

        `;

    }



    function printPayrollSummarySheet() {

        const printHtml = getPayrollSummaryPrintHtml();

        if (!printHtml) return;



        let printWindow = null;

        try {

            printWindow = window.open('', '_blank');

        } catch(e) {

            printWindow = null;

        }



        if (printWindow) {

            printWindow.document.open();

            printWindow.document.write(printHtml);

            printWindow.document.close();

            printWindow.focus();

            setTimeout(function() {

                try {

                    printWindow.print();

                } catch(err) {

                    console.error('Print error:', err);

                }

            }, 300);

        } else {

            let printFrame = document.getElementById('global-print-frame');

            if (!printFrame) {

                printFrame = document.createElement('iframe');

                printFrame.id = 'global-print-frame';

                printFrame.style.position = 'fixed';

                printFrame.style.right = '-9999px';

                printFrame.style.bottom = '-9999px';

                printFrame.style.width = '0';

                printFrame.style.height = '0';

                printFrame.style.border = '0';

                document.body.appendChild(printFrame);

            }

            const fDoc = printFrame.contentWindow.document;

            fDoc.open();

            fDoc.write(printHtml);

            fDoc.close();

            printFrame.contentWindow.focus();

            setTimeout(function() {

                printFrame.contentWindow.print();

            }, 300);

        }

    }



    function exportPayrollSummaryToPdf() {
        const printHtml = getPayrollSummaryPrintHtml();
        if (!printHtml) return;

        const startInput = document.getElementById('psummary-start-date');
        const endInput = document.getElementById('psummary-end-date');
        const cycleKey = `${startInput ? startInput.value : ''}_${endInput ? endInput.value : ''}`;
        const filename = `شيت_إجمالي_الرواتب_${cycleKey}.pdf`;

        downloadPrintHtmlAsPdf(printHtml, filename, 'landscape');
    }

    // =========================================================================
    // نافذة وسجل عمليات احتساب الرواتب والتدقيق (Payroll Calculation Audit Log)
    // =========================================================================
    function openPayrollAuditLogModal() {
        let modal = document.getElementById('modal-payroll-audit-log');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'modal-payroll-audit-log';
            modal.className = 'modal';
            modal.style.cssText = 'display:none; position:fixed; inset:0; background:rgba(0,0,0,0.65); z-index:99999; justify-content:center; align-items:center; padding:15px; direction:rtl;';
            modal.innerHTML = `
                <div style="background:#fff; width:95%; max-width:960px; max-height:85vh; border-radius:12px; box-shadow:0 10px 40px rgba(0,0,0,0.3); display:flex; flex-direction:column; overflow:hidden;">
                    <div style="display:flex; justify-content:space-between; align-items:center; padding:14px 20px; background:#102a45; color:#fff;">
                        <h3 style="margin:0; font-size:16px; font-weight:800;">📜 سجل عمليات احتساب الرواتب والتدقيق (Audit Log)</h3>
                        <button type="button" onclick="closePayrollAuditLogModal()" style="background:transparent; border:none; color:#fff; font-size:18px; cursor:pointer; font-weight:bold;">✕</button>
                    </div>
                    <div style="padding:14px 20px; overflow-y:auto; flex:1;">
                        <div style="margin-bottom:12px; display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
                            <input type="text" id="audit-log-search" placeholder="🔍 بحث في السجل بالموظف أو التاريخ أو المستخدم..." onkeyup="renderPayrollAuditLogTable()" style="padding:7px 12px; border-radius:6px; border:1px solid #cbd5e1; font-size:12.5px; min-width:260px;">
                            <button type="button" onclick="clearPayrollAuditLogHistory()" style="padding:6px 14px; font-size:11.5px; border-radius:6px; background:#fee2e2; border:1px solid #fca5a5; color:#991b1b; cursor:pointer; font-weight:bold;">🗑️ مسح السجل</button>
                        </div>
                        <div style="overflow-x:auto;">
                            <table style="width:100%; border-collapse:collapse; font-size:12px; text-align:right;">
                                <thead>
                                    <tr style="background:#f1f5f9; color:#1e293b; border-bottom:2px solid #cbd5e1;">
                                        <th style="padding:8px 6px;">م</th>
                                        <th style="padding:8px 6px;">تاريخ الاحتساب</th>
                                        <th style="padding:8px 6px;">الموظف</th>
                                        <th style="padding:8px 6px;">الوظيفة</th>
                                        <th style="padding:8px 6px;">الفترة</th>
                                        <th style="padding:8px 6px;">المستخدم المنفذ</th>
                                        <th style="padding:8px 6px;">مصدر الحضور</th>
                                        <th style="padding:8px 6px;">إجمالي الساعات</th>
                                        <th style="padding:8px 6px;">الأساسي</th>
                                        <th style="padding:8px 6px;">الإضافي</th>
                                        <th style="padding:8px 6px;">صافي الراتب</th>
                                    </tr>
                                </thead>
                                <tbody id="payroll-audit-log-tbody"></tbody>
                            </table>
                        </div>
                    </div>
                    <div style="padding:10px 20px; background:#f8fafc; border-top:1px solid #e2e8f0; display:flex; justify-content:flex-end;">
                        <button type="button" onclick="closePayrollAuditLogModal()" style="padding:7px 20px; font-weight:bold; border-radius:6px; border:1px solid #94a3b8; background:#fff; cursor:pointer;">إغلاق النافذة</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        }
        renderPayrollAuditLogTable();
        modal.style.display = 'flex';
    }

    function closePayrollAuditLogModal() {
        const modal = document.getElementById('modal-payroll-audit-log');
        if (modal) modal.style.display = 'none';
    }

    function renderPayrollAuditLogTable() {
        const tbody = document.getElementById('payroll-audit-log-tbody');
        if (!tbody) return;
        const term = (document.getElementById('audit-log-search')?.value || '').trim().toLowerCase();
        let list = [];
        try {
            list = JSON.parse(localStorage.getItem('erp_payroll_calc_audit_history') || '[]');
        } catch(e) { list = []; }

        if (term) {
            list = list.filter(item => {
                return (item.empName && item.empName.toLowerCase().includes(term)) ||
                       (item.calculatedBy && item.calculatedBy.toLowerCase().includes(term)) ||
                       (item.period && item.period.toLowerCase().includes(term)) ||
                       (item.calculatedAt && item.calculatedAt.toLowerCase().includes(term));
            });
        }

        if (list.length === 0) {
            tbody.innerHTML = '<tr><td colspan="11" style="text-align:center; padding:24px; color:#64748b; font-weight:bold;">لا توجد أي سجلات تدقيق محفوظة حتى الآن. سيتم التسجيل تلقائياً عند اعتماد مسير الرواتب.</td></tr>';
            return;
        }

        tbody.innerHTML = list.slice(0, 200).map((row, idx) => {
            const dateStr = row.calculatedAt ? new Date(row.calculatedAt).toLocaleString('ar-EG') : '-';
            const isPunch = (row.source === 'punch' || (row.sourceLabel && row.sourceLabel.includes('بصمة')));
            const sourceBadge = isPunch 
                ? '<span style="background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe; padding:2px 7px; border-radius:4px; font-weight:bold;">📱 بصمة</span>'
                : '<span style="background:#f0fdf4; color:#15803d; border:1px solid #bbf7d0; padding:2px 7px; border-radius:4px; font-weight:bold;">✍️ يدوي</span>';
            return `
                <tr style="border-bottom:1px solid #e2e8f0;">
                    <td style="padding:6px 8px;">${idx + 1}</td>
                    <td style="padding:6px 8px; font-size:11px; color:#475569;">${dateStr}</td>
                    <td style="padding:6px 8px; font-weight:bold; color:#102a45;">${row.empName || '-'}</td>
                    <td style="padding:6px 8px; color:#64748b;">${row.job || '-'}</td>
                    <td style="padding:6px 8px; font-size:11px; font-family:Consolas, monospace;">${row.period || '-'}</td>
                    <td style="padding:6px 8px; font-weight:600; color:#334155;">${row.calculatedBy || '-'}</td>
                    <td style="padding:6px 8px;">${sourceBadge}</td>
                    <td style="padding:6px 8px; font-weight:bold; color:#0284c7;">${Number(row.totalHours || 0).toFixed(2)} س</td>
                    <td style="padding:6px 8px;">${Number(row.basicHours || 0).toFixed(2)}</td>
                    <td style="padding:6px 8px;">${Number(row.overtimeHours || 0).toFixed(2)}</td>
                    <td style="padding:6px 8px; font-weight:bold; color:#7c3aed;">${Number(row.netSalary || 0).toLocaleString()} ج.م</td>
                </tr>
            `;
        }).join('');
    }

    function clearPayrollAuditLogHistory() {
        if (!confirm('هل تريد مسح سجل عمليات الاحتساب التاريخية؟')) return;
        localStorage.setItem('erp_payroll_calc_audit_history', JSON.stringify([]));
        renderPayrollAuditLogTable();
    }

    window.openPayrollAuditLogModal = openPayrollAuditLogModal;
    window.closePayrollAuditLogModal = closePayrollAuditLogModal;
    window.renderPayrollAuditLogTable = renderPayrollAuditLogTable;
    window.clearPayrollAuditLogHistory = clearPayrollAuditLogHistory;
