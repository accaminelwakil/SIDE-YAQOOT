    window.previousScreenBeforeBulk = window.previousScreenBeforeBulk || 'screen-single-sarki';
    let bulkPayslipsSourceMode = 'manual'; // 'manual' (الافتراضي الأساسي) or 'punch'

    function setBulkPayslipsSourceMode(mode) {
        bulkPayslipsSourceMode = (mode === 'punch') ? 'punch' : 'manual';

        const btnManual = document.getElementById('btn-bulk-mode-manual');
        const btnPunch = document.getElementById('btn-bulk-mode-punch');
        const badge = document.getElementById('bulk-source-badge');

        if (btnManual && btnPunch) {
            if (bulkPayslipsSourceMode === 'manual') {
                btnManual.classList.add('active');
                btnPunch.classList.remove('active');
            } else {
                btnPunch.classList.add('active');
                btnManual.classList.remove('active');
            }
        }

        const labelText = (bulkPayslipsSourceMode === 'punch')
            ? '📱 المصدر الحالي: تسجيل ذكي / بصمة'
            : '📝 المصدر الحالي: تسجيل يدوي';

        if (badge) {
            badge.textContent = labelText;
            if (bulkPayslipsSourceMode === 'punch') {
                badge.style.background = '#eef2ff';
                badge.style.color = '#3730a3';
                badge.style.borderColor = '#a5b4fc';
            } else {
                badge.style.background = '#f0fdf4';
                badge.style.color = '#15803d';
                badge.style.borderColor = '#86efac';
            }
        }

        renderBulkEmployeePayslips();
    }
    window.setBulkPayslipsSourceMode = setBulkPayslipsSourceMode;

    function bulkPayslipsGoBack() {
        switchScreen(previousScreenBeforeBulk || 'screen-single-sarki');
    }

    function saveBulkPayslipsData() {
        const cycleSelect = document.getElementById('bulk-payslips-cycle-select');
        const cycleKey = (cycleSelect && cycleSelect.value) ? cycleSelect.value.replace('|', '_') : '';

        if (cycleKey && typeof savedPayrollSummaryCycles !== 'undefined') {
            if (!savedPayrollSummaryCycles[cycleKey]) {
                savedPayrollSummaryCycles[cycleKey] = { records: [], status: 'معتمد' };
            }
            savedPayrollSummaryCycles[cycleKey].calculationSource = bulkPayslipsSourceMode;
            localStorage.setItem('erp_payroll_summary_cycles_db', JSON.stringify(savedPayrollSummaryCycles));
        }

        if (typeof recordPayrollCalculationAudit === 'function' && cycleKey) {
            recordPayrollCalculationAudit({
                cycleKey,
                date: new Date().toISOString(),
                source: bulkPayslipsSourceMode,
                action: 'اعتماد وحفظ السراكي المجمعة - ' + (bulkPayslipsSourceMode === 'punch' ? 'بصمة ذكية' : 'يدوي'),
                user: (typeof currentUser !== 'undefined' && currentUser && currentUser.name) ? currentUser.name : 'المسؤول'
            });
        }

        localStorage.setItem('erp_salary_adjustments_db', JSON.stringify(salaryAdjustmentsDb));
        localStorage.setItem('erp_attendance_db', JSON.stringify(attendanceRecords));
        localStorage.setItem('erp_employees_db', JSON.stringify(employees));
        showToast('تم حفظ واعتماد بيانات سراكي الموظفين المجمعة بنجاح! 💾', 'success');
    }

    function populateBulkPayslipsDropdowns() {
        const select = document.getElementById('bulk-payslips-cycle-select');
        const deptSel = document.getElementById('bulk-payslips-dept-filter');
        if (!select) return;

        const now = new Date();
        const curY = now.getFullYear();
        select.innerHTML = '';

        const todayStr = now.toISOString().split('T')[0];
        let matchedIndex = -1;

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

            if (todayStr >= startStr && todayStr <= endStr) {
                matchedIndex = m - 1;
            }

            select.appendChild(opt);
        }

        if (matchedIndex !== -1) {
            select.selectedIndex = matchedIndex;
        } else {
            const curMIdx = now.getMonth();
            select.selectedIndex = (curMIdx >= 0 && curMIdx < select.options.length) ? curMIdx : 0;
        }

        if (deptSel) {
            const deptsSet = new Set();
            (employees || []).forEach(e => { if (e && e.job) deptsSet.add(e.job.trim()); });
            deptSel.innerHTML = '<option value="">جميع الأقسام (الكل)</option>';
            deptSel.innerHTML += '<option value="__NO_USER__" style="color:#b91c1c; font-weight:bold;">📋 موظفين بدون يوزر (سراكي ورقية فقط)</option>';
            Array.from(deptsSet).sort().forEach(d => {
                const opt = document.createElement('option');
                opt.value = d;
                opt.textContent = d;
                deptSel.appendChild(opt);
            });
        }

        const bulkScreen = document.getElementById('screen-bulk-payslips');
        if (bulkScreen && bulkScreen.classList.contains('active')) {
            renderBulkEmployeePayslips();
        }
    }

    function getEligibleEmployeesForBulkPayslips(fromDate, toDate, deptFilter) {
        return (employees || []).filter(emp => {
            if (!emp) return false;
            if (emp.status === 'انتهت خدمته') return false;
            if (deptFilter === '__NO_USER__') {
                return (emp.hasNoUser === true) || !emp.username;
            } else if (deptFilter && emp.job !== deptFilter) {
                return false;
            }
            return true;
        }).sort((a, b) => {
            const deptA = a.job || '';
            const deptB = b.job || '';
            if (deptA !== deptB) return deptA.localeCompare(deptB, 'ar');
            const codeA = a.code || String(a.id || '');
            const codeB = b.code || String(b.id || '');
            return codeA.localeCompare(codeB, 'ar', { numeric: true });
        });
    }

    function calculateEmployeePayslipData(emp, fromDate, toDate) {
        const cycleKey = `${fromDate}_${toDate}`;
        const baseMonthlySalary = Number(emp.basicSalary) || 0;
        const rates = computeRates(baseMonthlySalary, emp.shiftHours || 8);

        let totBasicHours = 0;
        let totOv1Hours = 0;
        let totOv2Hours = 0;
        let totOvMoreHours = 0;
        let workedHolidaysCount = 0;
        let hasMissingPunch = false;
        let missingIssue = '';

        if (bulkPayslipsSourceMode === 'punch') {
            if (typeof calculateEmployeeBiometricAttendance === 'function') {
                const bio = calculateEmployeeBiometricAttendance(emp, fromDate, toDate);
                totBasicHours = bio.totBasicHours;
                totOv1Hours = bio.totOv1Hours;
                totOv2Hours = bio.totOv2Hours;
                totOvMoreHours = bio.totOvMoreHours;
                workedHolidaysCount = bio.workedHolidaysCount;
                hasMissingPunch = bio.hasMissingIssues;
                if (bio.missingIssues && bio.missingIssues.length > 0) {
                    missingIssue = bio.missingIssues.map(m => `${m.date} (${m.issue})`).join('، ');
                }
            }
        } else {
            // التسجيل اليدوي الأساسي
            const empRecords = (attendanceRecords || []).filter(r => {
                return r && r.empId === emp.id && r.date >= fromDate && r.date <= toDate;
            });

            empRecords.forEach(r => {
                const h = Number(r.hours) || 0;
                const b = Number(r.basicHours) || 0;
                const o1 = Number(r.ov1) || 0;
                const o2 = Number(r.ov2) || 0;
                const om = Number(r.ovMore) || 0;

                totBasicHours += b;
                totOv1Hours += o1;
                totOv2Hours += o2;
                totOvMoreHours += om;

                const isHol = r.isHoliday || (Array.isArray(officialHolidaysDb) && officialHolidaysDb.includes(r.date));
                if (isHol && (h > 0 || r.timeIn)) workedHolidaysCount++;
            });
        }

        const basicWage = Math.round((totBasicHours * (rates.hourlyRate || 0)) * 100) / 100;
        const dailyBasicRate = Math.round((baseMonthlySalary / 30.0) * 100) / 100;
        let attendedDaysForOff = emp;
        if (bulkPayslipsSourceMode !== 'punch' && Array.isArray(empRecords)) {
            attendedDaysForOff = empRecords.filter(r => (Number(r.hours) > 0 || r.timeIn)).length;
        }
        const offDaysCount = typeof calculateOffDaysCountBetweenDates === 'function' ? calculateOffDaysCountBetweenDates(fromDate, toDate, emp.offDay, attendedDaysForOff) : 0;
        const offDaysWage = Math.round((offDaysCount * dailyBasicRate) * 100) / 100;
        const ov1Wage = Math.round((totOv1Hours * (rates.ov1 || 0)) * 100) / 100;
        const ov2Wage = Math.round((totOv2Hours * (rates.ov2 || 0)) * 100) / 100;
        const ovMoreWage = Math.round((totOvMoreHours * (rates.ovMore || 0)) * 100) / 100;
        const holidayAllowance = Math.round((workedHolidaysCount * dailyBasicRate) * 100) / 100;
        const basicGroupTotal = Math.round((basicWage + offDaysWage + ov1Wage + ov2Wage + ovMoreWage + holidayAllowance) * 100) / 100;

        const adj = (typeof getEmployeeAdjustmentRecord === 'function') ? getEmployeeAdjustmentRecord(cycleKey, emp.id) : {};
        const visitsVal = Number(adj.visits) || 0;
        const cashbackVal = Number(adj.cashback) || 0;
        const rewardsVal = Number(adj.rewards) || 0;
        const adminVal = Number(adj.adminAllowance) || 0;
        const bonusVal = Number(adj.bonus) || 0;
        const totalAdditions = Math.round((visitsVal + cashbackVal + rewardsVal + adminVal + bonusVal) * 100) / 100;

        const advVal = Number(adj.advances) || 0;
        const insVal = Number(adj.insurance) || 0;
        const penVal = Number(adj.penalties) || 0;
        const supVal = Number(adj.supplies) || 0;
        const otherVal = Number(adj.otherDeductions) || 0;
        const totalDeductions = Math.round((advVal + insVal + penVal + supVal + otherVal) * 100) / 100;

        const finalNet = Math.round(((basicGroupTotal + totalAdditions) - totalDeductions) * 100) / 100;

        return {
            emp,
            baseMonthlySalary,
            rates,
            totBasicHours,
            basicWage,
            dailyBasicRate,
            offDaysCount,
            offDaysWage,
            totOv1Hours,
            ov1Wage,
            totOv2Hours,
            ov2Wage,
            totOvMoreHours,
            ovMoreWage,
            workedHolidaysCount,
            holidayAllowance,
            basicGroupTotal,
            visitsVal,
            cashbackVal,
            rewardsVal,
            adminVal,
            bonusVal,
            totalAdditions,
            advVal,
            insVal,
            penVal,
            supVal,
            otherVal,
            totalDeductions,
            finalNet,
            source: bulkPayslipsSourceMode,
            sourceLabel: (bulkPayslipsSourceMode === 'punch') ? '📱 تسجيل ذكي / بصمة' : '📝 تسجيل يدوي',
            hasMissingPunch,
            missingIssue
        };
    }

    function generateSinglePayslipCardHtml(data, cycleText, printDateStr) {
        const {
            emp, baseMonthlySalary, rates, totBasicHours, basicWage,
            dailyBasicRate, offDaysCount, offDaysWage,
            totOv1Hours, ov1Wage, totOv2Hours, ov2Wage,
            totOvMoreHours, ovMoreWage, workedHolidaysCount, holidayAllowance,
            basicGroupTotal, visitsVal, cashbackVal, rewardsVal, adminVal,
            bonusVal, totalAdditions, advVal, insVal, penVal,
            supVal, otherVal, totalDeductions, finalNet
        } = data;

        const empDisplayName = emp.name;
        const codeDisplay = emp.code ? emp.code : ('#' + emp.id);

        return `
        <div class="bulk-payslip-card" style="border:1.2px solid #000; border-radius:4px; padding:4px 7px; margin-bottom:0; background:#ffffff; color:#000000; box-sizing:border-box; font-family:Tahoma, Arial, sans-serif; direction:rtl; text-align:right;">
            <!-- Header -->
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1.5px solid #990012; padding-bottom:2.5px; margin-bottom:3.5px;">
                <div style="min-width:140px; display:flex; align-items:center; gap:4px;">
                    <img src="${window.CLINIC_LOGO_WHITE_B64 || 'assets/sidi-yaqout-logo.png'}" alt="عيادات سيدي ياقوت" style="height:28px; max-width:125px; object-fit:contain; display:block;" />
                </div>
                <div style="text-align:center; flex:1;">
                    <h2 style="font-size:14.5px; font-weight:900; margin:0; color:#102a45; line-height:1.1;">سركي موظف</h2>
                    <div style="display:flex; align-items:center; justify-content:center; gap:4px; margin-top:1px;">
                        <span style="font-size:10px; color:#990012; font-weight:bold;">عيادات سيدي ياقوت التخصصية</span>
                        <span style="font-size:9.5px; color:#475569;">• 365 يوم من الرعاية</span>
                    </div>
                </div>
                <div style="min-width:140px; text-align:left; font-size:9px; font-weight:bold; color:#000; display:flex; flex-direction:column; align-items:flex-end;">
                    <img src="${window.CLINIC_SLOGAN_B64 || 'assets/sidi-yaqout-slogan.png'}" alt="365 يوم من الرعاية" style="height:20px; max-width:110px; object-fit:contain; display:block; margin-bottom:1px;" />
                    <div style="margin-bottom:1px; white-space:nowrap; color:#334155; font-size:8.5px;">تاريخ الطباعة: ${printDateStr}</div>
                    <div style="display:inline-flex; align-items:center; gap:3px; font-size:8.5px; font-weight:bold; color:#000; border:0.8px solid #102a45; padding:1px 5px; border-radius:3px; background:#f8fafc; white-space:nowrap;">
                        <span>التواصل:</span>
                        <span style="color:#990012; font-family:Consolas, monospace; font-weight:900;">01285004575</span>
                    </div>
                </div>
            </div>

            <!-- Upper Info Table -->
            <table style="width:100%; border-collapse:collapse; margin-bottom:3.5px; font-size:9px; text-align:right;">
                <tr>
                    <td style="border:1px solid #000; padding:2px 3.5px; font-weight:bold; background:#f1f5f9; width:20%;">فترة الراتب</td>
                    <td style="border:1px solid #000; padding:2px 3.5px; width:40%; font-weight:bold;">
                        <div style="font-weight:bold; font-size:9px; border:0.8px solid #94a3b8; border-radius:3px; padding:1px 4px; background:#fff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${cycleText}</div>
                    </td>
                    <td style="border:1px solid #000; padding:2px 3.5px; font-weight:bold; background:#f8fafc; width:18%;">الراتب الأساسي</td>
                    <td style="border:1px solid #000; padding:2px 3.5px; width:22%; background:#fff; text-align:center;">
                        <div style="font-weight:900; font-size:12px; color:#047857;">${baseMonthlySalary.toLocaleString('ar-EG', {minimumFractionDigits: 2})}</div>
                    </td>
                </tr>
                <tr>
                    <td style="border:1px solid #000; padding:2px 3.5px; font-weight:bold; background:#f1f5f9;">اسم الموظف</td>
                    <td style="border:1px solid #000; padding:2px 3.5px;">
                        <div style="font-weight:900; font-size:10.5px; border:0.8px solid #94a3b8; border-radius:3px; padding:1px 4px; background:#fff;">${emp.name}</div>
                    </td>
                    <td style="border:1px solid #000; padding:2px 3.5px; font-weight:bold; background:#eff6ff;">الراتب المستحق</td>
                    <td style="border:1px solid #000; padding:2px 3.5px; background:#f0fdf4; text-align:center;">
                        <div style="font-weight:900; font-size:13.5px; color:#1d4ed8;">${finalNet.toLocaleString('ar-EG', {minimumFractionDigits: 2})}</div>
                    </td>
                </tr>
                <tr>
                    <td style="border:1px solid #000; padding:2px 3.5px; font-weight:bold; background:#f1f5f9;">كود الموظف</td>
                    <td style="border:1px solid #000; padding:2px 3.5px; font-weight:900; font-family:Consolas, monospace; text-align:center;">${codeDisplay}</td>
                    <td style="border:1px solid #000; padding:2px 3.5px; font-weight:bold; background:#f1f5f9;">القسم</td>
                    <td style="border:1px solid #000; padding:2px 3.5px; font-weight:bold; text-align:center;">${emp.job || '-'}</td>
                </tr>
                <tr>
                    <td style="border:1px solid #000; padding:2px 3.5px; font-weight:bold; background:#f1f5f9;">مصدر الحضور</td>
                    <td colspan="3" style="border:1px solid #000; padding:2px 3.5px; font-weight:bold; font-size:8.5px;">
                        <span>${data.sourceLabel || (bulkPayslipsSourceMode === 'punch' ? '📱 تسجيل ذكي / بصمة' : '📝 تسجيل يدوي')}</span>
                        ${data.hasMissingPunch ? `<span style="color:#dc2626; margin-right:6px;">(⚠️ بصمات ناقصة: ${data.missingIssue})</span>` : ''}
                    </td>
                </tr>
            </table>

            <!-- 3 Middle Tables -->
            <div class="sarki-tables-row" style="display:flex; gap:3.5px; align-items:stretch; direction:rtl; width:100%; box-sizing:border-box;">
                <!-- 1. الراتب الأساسي (اليمين) -->
                <div class="sarki-col-basic" style="flex:46 1 0; min-width:0; box-sizing:border-box;">
                    <table style="width:100%; border-collapse:collapse; font-size:8.5px; text-align:center;">
                        <thead>
                            <tr style="background:#e2e8f0; color:#000;">
                                <th colspan="4" style="border:1px solid #000; padding:2px; font-size:9px; font-weight:900;">الراتب الاساسي</th>
                            </tr>
                            <tr style="background:#f1f5f9; color:#000; font-weight:bold;">
                                <th style="border:1px solid #000; padding:1.5px; width:40%;">بيان</th>
                                <th style="border:1px solid #000; padding:1.5px; width:20%; font-size:8px;">قيمة</th>
                                <th style="border:1px solid #000; padding:1.5px; width:18%; font-size:8px;">عدد</th>
                                <th style="border:1px solid #000; padding:1.5px; width:22%; font-size:8px;">اجمالى</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td style="border:1px solid #000; padding:1.5px 2px; text-align:right; font-weight:bold;">ساعات الحضور الاساسية</td>
                                <td style="border:1px solid #000; padding:1.5px; font-family:Consolas, monospace;">${rates.hourlyRate.toFixed(2)}</td>
                                <td style="border:1px solid #000; padding:1.5px; font-family:Consolas, monospace;">${totBasicHours.toFixed(2)}</td>
                                <td style="border:1px solid #000; padding:1.5px; font-weight:bold; font-family:Consolas, monospace;">${basicWage.toFixed(2)}</td>
                            </tr>
                            <tr>
                                <td style="border:1px solid #000; padding:1.5px 2px; text-align:right; font-weight:bold;">راحات اسبوعية</td>
                                <td style="border:1px solid #000; padding:1.5px; font-family:Consolas, monospace;">${dailyBasicRate.toFixed(2)}</td>
                                <td style="border:1px solid #000; padding:1.5px; font-family:Consolas, monospace;">${offDaysCount}</td>
                                <td style="border:1px solid #000; padding:1.5px; font-weight:bold; font-family:Consolas, monospace;">${offDaysWage.toFixed(2)}</td>
                            </tr>
                            <tr>
                                <td style="border:1px solid #000; padding:1.5px 2px; text-align:right; font-weight:bold;">اضافي اول ساعة</td>
                                <td style="border:1px solid #000; padding:1.5px; font-family:Consolas, monospace;">${rates.ov1.toFixed(2)}</td>
                                <td style="border:1px solid #000; padding:1.5px; font-family:Consolas, monospace;">${totOv1Hours.toFixed(2)}</td>
                                <td style="border:1px solid #000; padding:1.5px; font-weight:bold; font-family:Consolas, monospace;">${ov1Wage.toFixed(2)}</td>
                            </tr>
                            <tr>
                                <td style="border:1px solid #000; padding:1.5px 2px; text-align:right; font-weight:bold;">اضافي ثاني ساعة</td>
                                <td style="border:1px solid #000; padding:1.5px; font-family:Consolas, monospace;">${rates.ov2.toFixed(2)}</td>
                                <td style="border:1px solid #000; padding:1.5px; font-family:Consolas, monospace;">${totOv2Hours.toFixed(2)}</td>
                                <td style="border:1px solid #000; padding:1.5px; font-weight:bold; font-family:Consolas, monospace;">${ov2Wage.toFixed(2)}</td>
                            </tr>
                            <tr>
                                <td style="border:1px solid #000; padding:1.5px 2px; text-align:right; font-weight:bold;">اضافي اكثر من ساعتين</td>
                                <td style="border:1px solid #000; padding:1.5px; font-family:Consolas, monospace;">${rates.ovMore.toFixed(2)}</td>
                                <td style="border:1px solid #000; padding:1.5px; font-family:Consolas, monospace;">${totOvMoreHours.toFixed(2)}</td>
                                <td style="border:1px solid #000; padding:1.5px; font-weight:bold; font-family:Consolas, monospace;">${ovMoreWage.toFixed(2)}</td>
                            </tr>
                            <tr>
                                <td style="border:1px solid #000; padding:1.5px 2px; text-align:right; font-weight:bold;">بدل الاجازات الرسمية</td>
                                <td style="border:1px solid #000; padding:1.5px; font-family:Consolas, monospace;">${dailyBasicRate.toFixed(2)}</td>
                                <td style="border:1px solid #000; padding:1.5px; font-family:Consolas, monospace;">${workedHolidaysCount}</td>
                                <td style="border:1px solid #000; padding:1.5px; font-weight:bold; font-family:Consolas, monospace;">${holidayAllowance.toFixed(2)}</td>
                            </tr>
                            <tr style="background:#f1f5f9; font-weight:900;">
                                <td style="border:1px solid #000; padding:2px; text-align:right;" colspan="3">الاجمالى</td>
                                <td style="border:1px solid #000; padding:2px; color:#047857; font-family:Consolas, monospace; font-size:9.5px;">${basicGroupTotal.toLocaleString('ar-EG', {minimumFractionDigits: 2})} ج.م</td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <!-- 2. الإضافات (الوسط) -->
                <div class="sarki-col-additions" style="flex:27 1 0; min-width:0; box-sizing:border-box;">
                    <table style="width:100%; border-collapse:collapse; font-size:8.5px; text-align:center;">
                        <thead>
                            <tr style="background:#e2e8f0; color:#000;">
                                <th colspan="2" style="border:1px solid #000; padding:2px; font-size:9px; font-weight:900;">الاضافات</th>
                            </tr>
                            <tr style="background:#f1f5f9; color:#000; font-weight:bold;">
                                <th style="border:1px solid #000; padding:1.5px; width:60%;">بيان</th>
                                <th style="border:1px solid #000; padding:1.5px; width:40%; font-size:8px;">قيمة</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td style="border:1px solid #000; padding:1.5px 2px; text-align:right;">زيارات</td>
                                <td style="border:1px solid #000; padding:1.5px; font-weight:bold; font-family:Consolas, monospace;">${visitsVal.toFixed(2)}</td>
                            </tr>
                            <tr>
                                <td style="border:1px solid #000; padding:1.5px 2px; text-align:right;">كاش باك</td>
                                <td style="border:1px solid #000; padding:1.5px; font-weight:bold; font-family:Consolas, monospace;">${cashbackVal.toFixed(2)}</td>
                            </tr>
                            <tr>
                                <td style="border:1px solid #000; padding:1.5px 2px; text-align:right;">مكافات</td>
                                <td style="border:1px solid #000; padding:1.5px; font-weight:bold; font-family:Consolas, monospace;">${rewardsVal.toFixed(2)}</td>
                            </tr>
                            <tr>
                                <td style="border:1px solid #000; padding:1.5px 2px; text-align:right;">بدل ادارة</td>
                                <td style="border:1px solid #000; padding:1.5px; font-weight:bold; font-family:Consolas, monospace;">${adminVal.toFixed(2)}</td>
                            </tr>
                            <tr>
                                <td style="border:1px solid #000; padding:1.5px 2px; text-align:right;">بونص</td>
                                <td style="border:1px solid #000; padding:1.5px; font-weight:bold; font-family:Consolas, monospace;">${bonusVal.toFixed(2)}</td>
                            </tr>
                            <tr style="background:#f1f5f9; font-weight:900;">
                                <td style="border:1px solid #000; padding:2px; text-align:right;">الاجمالى</td>
                                <td style="border:1px solid #000; padding:2px; color:#047857; font-family:Consolas, monospace; font-size:9.5px;">${totalAdditions.toLocaleString('ar-EG', {minimumFractionDigits: 2})} ج.م</td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <!-- 3. الاستقطاعات (اليسار) -->
                <div class="sarki-col-deductions" style="flex:27 1 0; min-width:0; box-sizing:border-box;">
                    <table style="width:100%; border-collapse:collapse; font-size:8.5px; text-align:center;">
                        <thead>
                            <tr style="background:#e2e8f0; color:#000;">
                                <th colspan="2" style="border:1px solid #000; padding:2px; font-size:9px; font-weight:900;">الاستقطاعات</th>
                            </tr>
                            <tr style="background:#f1f5f9; color:#000; font-weight:bold;">
                                <th style="border:1px solid #000; padding:1.5px; width:60%;">بيان</th>
                                <th style="border:1px solid #000; padding:1.5px; width:40%; font-size:8px;">قيمة</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td style="border:1px solid #000; padding:1.5px 2px; text-align:right;">سلف</td>
                                <td style="border:1px solid #000; padding:1.5px; color:#b91c1c; font-weight:bold; font-family:Consolas, monospace;">${advVal.toFixed(2)}</td>
                            </tr>
                            <tr>
                                <td style="border:1px solid #000; padding:1.5px 2px; text-align:right;">تأمينات</td>
                                <td style="border:1px solid #000; padding:1.5px; color:#b91c1c; font-weight:bold; font-family:Consolas, monospace;">${insVal.toFixed(2)}</td>
                            </tr>
                            <tr>
                                <td style="border:1px solid #000; padding:1.5px 2px; text-align:right;">جزاءات</td>
                                <td style="border:1px solid #000; padding:1.5px; color:#b91c1c; font-weight:bold; font-family:Consolas, monospace;">${penVal.toFixed(2)}</td>
                            </tr>
                            <tr>
                                <td style="border:1px solid #000; padding:1.5px 2px; text-align:right;">خصم مستلزمات</td>
                                <td style="border:1px solid #000; padding:1.5px; color:#b91c1c; font-weight:bold; font-family:Consolas, monospace;">${supVal.toFixed(2)}</td>
                            </tr>
                            <tr>
                                <td style="border:1px solid #000; padding:1.5px 2px; text-align:right;">استقطاعات أخرى</td>
                                <td style="border:1px solid #000; padding:1.5px; color:#b91c1c; font-weight:bold; font-family:Consolas, monospace;">${otherVal.toFixed(2)}</td>
                            </tr>
                            <tr style="background:#f1f5f9; font-weight:900;">
                                <td style="border:1px solid #000; padding:2px; text-align:right;">الاجمالى</td>
                                <td style="border:1px solid #000; padding:2px; color:#b91c1c; font-family:Consolas, monospace; font-size:9.5px;">${totalDeductions.toLocaleString('ar-EG', {minimumFractionDigits: 2})} ج.م</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
        `;
    }

    function renderBulkEmployeePayslips() {
        const cycleSelect = document.getElementById('bulk-payslips-cycle-select');
        const container = document.getElementById('bulk-payslips-container');
        const emptyEl = document.getElementById('bulk-payslips-empty');
        const badgeEl = document.getElementById('bulk-payslips-count-badge');
        if (!cycleSelect || !container) return;

        if (!cycleSelect.value && cycleSelect.options.length > 0) {
            cycleSelect.selectedIndex = 0;
        }
        if (!cycleSelect.value) {
            container.innerHTML = '';
            if (emptyEl) emptyEl.style.display = 'block';
            if (badgeEl) badgeEl.textContent = 'الموظفين المستحقين: 0 موظف (0 صفحة A4)';
            return;
        }

        const [fromDate, toDate] = cycleSelect.value.split('|');
        const cycleText = cycleSelect.options[cycleSelect.selectedIndex] ? cycleSelect.options[cycleSelect.selectedIndex].text : '';
        const deptFilter = document.getElementById('bulk-payslips-dept-filter') ? document.getElementById('bulk-payslips-dept-filter').value : '';

        // مزامنة مصدر الاحتساب تلقائياً في حال وجود دورة معتمدة مسبقاً
        const cycleKey = `${fromDate}_${toDate}`;
        if (typeof savedPayrollSummaryCycles !== 'undefined' && savedPayrollSummaryCycles[cycleKey] && savedPayrollSummaryCycles[cycleKey].calculationSource) {
            const savedSrc = savedPayrollSummaryCycles[cycleKey].calculationSource;
            if (savedSrc !== bulkPayslipsSourceMode) {
                bulkPayslipsSourceMode = savedSrc;
                const btnManual = document.getElementById('btn-bulk-mode-manual');
                const btnPunch = document.getElementById('btn-bulk-mode-punch');
                const badge = document.getElementById('bulk-source-badge');
                if (btnManual && btnPunch) {
                    if (bulkPayslipsSourceMode === 'manual') {
                        btnManual.classList.add('active');
                        btnPunch.classList.remove('active');
                    } else {
                        btnPunch.classList.add('active');
                        btnManual.classList.remove('active');
                    }
                }
                if (badge) {
                    badge.textContent = (bulkPayslipsSourceMode === 'punch') ? '📱 المصدر الحالي: تسجيل ذكي / بصمة' : '📝 المصدر الحالي: تسجيل يدوي';
                }
            }
        }

        const eligibleEmployees = getEligibleEmployeesForBulkPayslips(fromDate, toDate, deptFilter);
        if (eligibleEmployees.length === 0) {
            container.innerHTML = '';
            if (emptyEl) emptyEl.style.display = 'block';
            if (badgeEl) badgeEl.textContent = 'الموظفين المستحقين: 0 موظف (0 صفحة A4)';
            return;
        }
        if (emptyEl) emptyEl.style.display = 'none';

        // فحص وتنبيه البصمات الناقصة في السراكي المجمعة
        const bulkAlertEl = document.getElementById('bulk-missing-punch-alert');
        const bulkAlertDetails = document.getElementById('bulk-missing-punch-details');
        if (bulkAlertEl && bulkAlertDetails) {
            if (bulkPayslipsSourceMode === 'punch' && typeof checkCycleBiometricMissingPunches === 'function') {
                const missingCheck = checkCycleBiometricMissingPunches(fromDate, toDate, eligibleEmployees);
                if (missingCheck && missingCheck.hasMissing) {
                    bulkAlertDetails.innerHTML = missingCheck.issuesList.slice(0, 5).map(iss => 
                        `• <strong>${iss.empName}</strong> (${iss.date}): ${iss.issue}`
                    ).join('<br>') + (missingCheck.issuesList.length > 5 ? `<br>... و ${missingCheck.issuesList.length - 5} حالات أخرى` : '');
                    bulkAlertEl.style.display = 'block';
                } else {
                    bulkAlertEl.style.display = 'none';
                }
            } else {
                bulkAlertEl.style.display = 'none';
            }
        }

        const pageCount = Math.ceil(eligibleEmployees.length / 3);
        if (badgeEl) badgeEl.textContent = `الموظفين المستحقين: ${eligibleEmployees.length} موظف (${pageCount} صفحة A4)`;

        const printDateStr = new Date().toLocaleDateString('ar-EG');

        let html = '';
        for (let i = 0; i < eligibleEmployees.length; i += 3) {
            const chunk = eligibleEmployees.slice(i, i + 3);
            const pageNum = Math.floor(i / 3) + 1;

            html += `
                <div class="bulk-page-section" style="margin-bottom:24px; background:#f8fafc; border:1.5px dashed #94a3b8; border-radius:8px; padding:12px 14px;">
                    <div style="font-size:12px; font-weight:bold; color:#334155; margin-bottom:10px; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #cbd5e1; padding-bottom:5px;">
                        <span>📄 صفحة طباعة رقم ${pageNum} من ${pageCount} (تضم ${chunk.length} سركي موظف)</span>
                        <span style="font-size:11px; color:#64748b;">مقاس A4 - وضع بورتريه رأسي (3 سراكي في الصفحة)</span>
                    </div>
                    ${chunk.map((emp, cIdx) => {
                        const data = calculateEmployeePayslipData(emp, fromDate, toDate);
                        const cardHtml = generateSinglePayslipCardHtml(data, cycleText, printDateStr);
                        const isLastInChunk = (cIdx === chunk.length - 1);
                        const separatorHtml = !isLastInChunk ? `
                            <div class="bulk-payslip-cut-line" style="margin:10px 0; border-top:1.5px dashed #64748b; position:relative; text-align:center;">
                                <span style="position:relative; top:-9px; background:#f8fafc; padding:0 12px; font-size:10px; font-weight:bold; color:#475569; border:1px dashed #94a3b8; border-radius:4px;">✂️ مسافة فاصلة للقص بين السراكي</span>
                            </div>
                        ` : '';
                        return cardHtml + separatorHtml;
                    }).join('')}
                </div>
            `;
        }

        container.innerHTML = html;
        if (typeof autoScaleAllA4Sheets === 'function') {
            setTimeout(autoScaleAllA4Sheets, 50);
        }
    }

    function getBulkPayslipsPrintHtml() {
        const cycleSelect = document.getElementById('bulk-payslips-cycle-select');
        if (!cycleSelect || !cycleSelect.value) {
            alert('يرجى اختيار دورة الراتب أولاً!');
            return null;
        }
        const [fromDate, toDate] = cycleSelect.value.split('|');
        const cycleText = cycleSelect.options[cycleSelect.selectedIndex] ? cycleSelect.options[cycleSelect.selectedIndex].text : '';
        const deptFilter = document.getElementById('bulk-payslips-dept-filter') ? document.getElementById('bulk-payslips-dept-filter').value : '';
        const eligibleEmployees = getEligibleEmployeesForBulkPayslips(fromDate, toDate, deptFilter);
        if (eligibleEmployees.length === 0) {
            alert('لا يوجد موظفون مستحقون للراتب في هذه الفترة!');
            return null;
        }

        const printDateStr = new Date().toLocaleDateString('ar-EG');
        const chunks = [];
        for (let i = 0; i < eligibleEmployees.length; i += 3) {
            chunks.push(eligibleEmployees.slice(i, i + 3));
        }

        let pagesHtml = '';
        chunks.forEach((chunk, pageIndex) => {
            const isLastPage = pageIndex === chunks.length - 1;
            const cardsHtml = chunk.map((emp, cIdx) => {
                const data = calculateEmployeePayslipData(emp, fromDate, toDate);
                const cardHtml = generateSinglePayslipCardHtml(data, cycleText, printDateStr);
                const isLastInChunk = (cIdx === chunk.length - 1);
                const separatorHtml = !isLastInChunk ? `
                    <div class="bulk-payslip-cut-line">
                        <span class="bulk-payslip-cut-badge">✂️ مسافة فاصلة للقص والفصل ✂️</span>
                    </div>
                ` : '';
                return cardHtml + separatorHtml;
            }).join('');

            pagesHtml += `
                <div class="bulk-payslip-page" style="${!isLastPage ? 'page-break-after:always; break-after:page;' : ''} margin-bottom:0; box-sizing:border-box; width:100%;">
                    ${cardsHtml}
                </div>
            `;
        });

        return `
            <!DOCTYPE html>
            <html lang="ar" dir="rtl">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <title>سراكي رواتب العاملين المجمعة - عيادات سيدى ياقوت</title>
                <style>
                    @page { size: A4 portrait; margin: 4mm 5mm; }
                    * { box-sizing: border-box !important; }
                    body {
                        font-family: Tahoma, 'Segoe UI', Arial, sans-serif;
                        direction: rtl;
                        color: #000000;
                        margin: 0;
                        padding: 0;
                        background: #ffffff;
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }
                    .bulk-payslip-page {
                        page-break-after: always;
                        break-after: page;
                        box-sizing: border-box;
                        width: 100%;
                    }
                    .bulk-payslip-page:last-child {
                        page-break-after: auto;
                        break-after: auto;
                    }
                    .bulk-payslip-card {
                        border: 1.2px solid #000000 !important;
                        border-radius: 4px !important;
                        padding: 5px 8px !important;
                        margin-bottom: 0 !important;
                        box-sizing: border-box !important;
                        background: #ffffff !important;
                        page-break-inside: avoid !important;
                        break-inside: avoid !important;
                    }
                    .bulk-payslip-cut-line {
                        margin: 3.2mm 0 !important;
                        border-top: 1px dashed #000000 !important;
                        text-align: center !important;
                        position: relative !important;
                        height: 1px !important;
                        box-sizing: border-box !important;
                    }
                    .bulk-payslip-cut-badge {
                        position: relative !important;
                        top: -7.5px !important;
                        background: #ffffff !important;
                        padding: 0 8px !important;
                        font-size: 8pt !important;
                        font-weight: bold !important;
                        color: #000000 !important;
                        border: 0.8px dashed #475569 !important;
                        border-radius: 3px !important;
                    }
                    table {
                        width: 100% !important;
                        border-collapse: collapse !important;
                        font-size: 8.8pt !important;
                        text-align: center !important;
                    }
                    th, td {
                        border: 1px solid #000000 !important;
                        padding: 2.5px 3.5px !important;
                        line-height: 1.22 !important;
                    }
                    th {
                        background-color: #f1f5f9 !important;
                        color: #000000 !important;
                        font-weight: bold !important;
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }
                    .sarki-tables-row {
                        display: flex !important;
                        flex-direction: row !important;
                        gap: 3.5px !important;
                        align-items: stretch !important;
                        direction: rtl !important;
                        width: 100% !important;
                        box-sizing: border-box !important;
                    }
                    .sarki-col-basic {
                        flex: 46 1 0 !important;
                        min-width: 0 !important;
                        max-width: 48% !important;
                        box-sizing: border-box !important;
                    }
                    .sarki-col-additions,
                    .sarki-col-deductions {
                        flex: 27 1 0 !important;
                        min-width: 0 !important;
                        max-width: 28% !important;
                        box-sizing: border-box !important;
                    }
                </style>
            </head>
            <body>
                ${pagesHtml}
            </body>
            </html>
        `;
    }

    function printBulkPayslips() {
        const html = getBulkPayslipsPrintHtml();
        if (!html) return;
        const printWindow = window.open('', '_blank');
        if (!printWindow) {
            alert('يرجى السماح بالنوافذ المنبثقة لطباعة السراكي!');
            return;
        }
        printWindow.document.write(html + '<script>window.onload = function() { window.print(); };<\/script>');
        printWindow.document.close();
    }

    function exportBulkPayslipsToPdf() {
        const html = getBulkPayslipsPrintHtml();
        if (!html) return;
        const cycleSelect = document.getElementById('bulk-payslips-cycle-select');
        const cycleText = cycleSelect && cycleSelect.options[cycleSelect.selectedIndex] ? cycleSelect.options[cycleSelect.selectedIndex].text : '';
        const filename = `سراكي_رواتب_الموظفين_المجمعة_${(cycleText || 'دورة').replace(/\s+/g, '_')}.pdf`;
        downloadPrintHtmlAsPdf(html, filename, 'portrait');
    }

    window.calculateEmployeePayslipData = calculateEmployeePayslipData;

