// ====================================================================
// شاشة تقرير الحضور والانصراف والمطابقة بين البصمة والإدخال اليدوي
// Comprehensive Attendance Report & Punch vs Manual Audit Engine
// منظومة عيادات سيدي ياقوت التخصصية
// ====================================================================

(function() {
    let comparisonData = [];
    let attendanceReportData = [];
    let showDiscrepanciesOnly = false;
    let currentAttendanceViewMode = 'report'; // 'report' (تقرير الحضور التفصيلي) | 'audit' (مطابقة البصمة واليدوي)

    // تهيئة الشاشة
    function renderAttendanceComparisonScreen() {
        populateComparisonCyclesDropdown();
        loadAndCalculateComparisonReport();
    }

    // تبديل وضع العرض: تقرير الحضور VS مطابقة وتدقيق
    function setAttendanceReportViewMode(mode) {
        currentAttendanceViewMode = (mode === 'audit') ? 'audit' : 'report';

        const btnReport = document.getElementById('btn-comp-view-report');
        const btnAudit = document.getElementById('btn-comp-view-audit');
        const btnDiscOnly = document.getElementById('btn-comp-disc-only');

        if (btnReport && btnAudit) {
            if (currentAttendanceViewMode === 'report') {
                btnReport.classList.add('active');
                btnAudit.classList.remove('active');
                if (btnDiscOnly) btnDiscOnly.style.display = 'none';
            } else {
                btnAudit.classList.add('active');
                btnReport.classList.remove('active');
                if (btnDiscOnly) btnDiscOnly.style.display = 'inline-block';
            }
        }

        renderComparisonTableUI();
    }

    // تعبئة دورات الرواتب (25 إلى 24)
    function populateComparisonCyclesDropdown() {
        const select = document.getElementById('comp-cycle-select');
        const deptSel = document.getElementById('comp-dept-filter');
        const empSel = document.getElementById('comp-emp-filter');
        if (!select) return;

        const now = new Date();
        const curY = now.getFullYear();
        const curM = now.getMonth();
        const todayStr = now.toISOString().split('T')[0];

        select.innerHTML = '';
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
            select.selectedIndex = curM;
        }

        const allEmps = Array.isArray(window.employees) ? window.employees : [];

        if (deptSel && deptSel.options.length <= 1) {
            const deptsSet = new Set();
            allEmps.forEach(e => { if (e && e.job) deptsSet.add(e.job.trim()); });
            deptSel.innerHTML = '<option value="">جميع الأقسام</option>';
            Array.from(deptsSet).sort().forEach(d => {
                const opt = document.createElement('option');
                opt.value = d;
                opt.textContent = d;
                deptSel.appendChild(opt);
            });
        }

        if (empSel && empSel.options.length <= 1) {
            empSel.innerHTML = '<option value="">جميع الموظفين</option>';
            allEmps.forEach(e => {
                const opt = document.createElement('option');
                opt.value = e.id;
                opt.textContent = `${e.name} (#${e.id})`;
                empSel.appendChild(opt);
            });
        }
    }

    // جلب ومقارنة البيانات بين البصمات والإدخال اليدوي
    async function loadAndCalculateComparisonReport() {
        const cycleSelect = document.getElementById('comp-cycle-select');
        if (!cycleSelect || !cycleSelect.value) return;

        const [startDate, endDate] = cycleSelect.value.split('|');
        const deptFilter = document.getElementById('comp-dept-filter') ? document.getElementById('comp-dept-filter').value : '';
        const empFilter = document.getElementById('comp-emp-filter') ? document.getElementById('comp-emp-filter').value : '';
        const specificDate = document.getElementById('comp-specific-date') ? document.getElementById('comp-specific-date').value : '';
        const sourceFilter = document.getElementById('comp-source-filter') ? document.getElementById('comp-source-filter').value : '';

        // 1. جلب بصمات الـ GPS
        let punches = [];
        try {
            const resp = await window.authenticatedFetch('/api/attendance/punches');
            if (resp.ok) {
                const data = await resp.json();
                punches = data.punches || [];
            }
        } catch (e) {
            console.warn('[Comparison] Backend punches fetch failed, reading localStorage');
        }
        if (!punches || punches.length === 0) {
            punches = JSON.parse(localStorage.getItem('erp_smart_punches_db') || '[]');
        }

        // 2. جلب سجلات الحضور اليدوية
        const manualRecords = Array.isArray(window.attendanceRecords) ? window.attendanceRecords : [];

        // 3. قائمة الموظفين
        const allEmps = Array.isArray(window.employees) ? window.employees : [];
        let targetEmps = allEmps.filter(e => e.status !== 'انتهت خدمته');

        if (deptFilter) targetEmps = targetEmps.filter(e => e.job === deptFilter);
        if (empFilter) targetEmps = targetEmps.filter(e => String(e.id) === String(empFilter));

        // 4. بناء هيكل المقارنة وتقرير الحضور
        const comparisonRows = [];
        const reportRows = [];

        let totalExactMatches = 0;
        let totalDiscrepancies = 0;
        let totalManualOnly = 0;
        let totalPunchOnly = 0;
        let totalExcessManualHours = 0;

        // استخراج جميع التواريخ المتاحة إما في البصمات أو في الحضور اليدوي
        const datesSet = new Set();
        if (specificDate) {
            datesSet.add(specificDate);
        } else {
            punches.forEach(p => {
                const pDate = p.date || (p.timestamp ? p.timestamp.split('T')[0] : '');
                if (pDate >= startDate && pDate <= endDate) datesSet.add(pDate);
            });
            manualRecords.forEach(r => {
                if (r && r.date >= startDate && r.date <= endDate) datesSet.add(r.date);
            });
        }

        const sortedDates = Array.from(datesSet).sort((a, b) => b.localeCompare(a));

        sortedDates.forEach(dateVal => {
            targetEmps.forEach(emp => {
                // استخراج سجل اليدوي لهذا اليوم
                const manual = manualRecords.find(r => String(r.empId) === String(emp.id) && r.date === dateVal);

                // استخراج بصمات هذا اليوم
                const empPunches = punches.filter(p => {
                    const matchId = (String(p.empId) === String(emp.id)) || (p.empId === ('EMP_' + emp.id)) || (p.empId === emp.code);
                    const matchName = p.empName && emp.name && (p.empName === emp.name || p.empName.includes(emp.name) || emp.name.includes(p.empName));
                    if (!matchId && !matchName) return false;

                    const pDate = p.date || (p.timestamp ? p.timestamp.split('T')[0] : '');
                    return pDate === dateVal && (p.status === 'ACCEPTED' || !p.status);
                }).sort((a, b) => (a.time || '').localeCompare(b.time || ''));

                // إذا لم يكن هناك بصمات ولا حضور يدوي لهذا الموظف في هذا اليوم، نتخطاه
                if (!manual && empPunches.length === 0) return;

                // احتساب بصمات اليوم بالمعادلات المعتمدة
                let punchCalc = null;
                if (typeof computeDayPunchHours === 'function' && empPunches.length > 0) {
                    punchCalc = computeDayPunchHours(empPunches, emp.shiftHours || 8);
                }

                const punchInTime = punchCalc ? punchCalc.firstIn : (empPunches.length > 0 ? (empPunches.find(p => p.type === 'in')?.time || '-') : '-');
                const punchOutTime = punchCalc ? punchCalc.lastOut : (empPunches.length > 0 ? (empPunches.slice().reverse().find(p => p.type === 'out')?.time || '-') : '-');
                const punchHours = punchCalc ? punchCalc.totalHours : 0;
                const punchBasic = punchCalc ? punchCalc.basicHours : 0;
                const punchOv = punchCalc ? punchCalc.ovTotal : 0;

                const manualInTime = (manual && manual.timeIn) ? manual.timeIn : '-';
                const manualOutTime = (manual && manual.timeOut) ? manual.timeOut : '-';
                const manualHours = (manual && manual.hours) ? Number(manual.hours) : 0;
                const manualBasic = (manual && manual.basicHours) ? Number(manual.basicHours) : 0;
                const manualOv = (manual ? (Number(manual.ov1) || 0) + (Number(manual.ov2) || 0) + (Number(manual.ovMore) || 0) : 0);

                const isHolidayDay = (typeof officialHolidaysDb !== 'undefined' && Array.isArray(officialHolidaysDb) && officialHolidaysDb.includes(dateVal)) || (manual && manual.isHoliday);

                // ==================== أ. سجلات تقرير الحضور التفصيلي ====================
                // 1. تسجيل يدوي
                if (manual && (!sourceFilter || sourceFilter === 'manual')) {
                    reportRows.push({
                        empId: emp.id,
                        empName: emp.name,
                        dept: emp.job || 'عام',
                        date: dateVal,
                        firstIn: manualInTime,
                        lastOut: manualOutTime,
                        totalHours: manualHours,
                        basicHours: manualBasic,
                        ovHours: manualOv,
                        source: 'manual',
                        sourceLabel: '📝 تسجيل يدوي',
                        status: isHolidayDay ? '🎉 إجازة رسمية' : 'مسجل ومعتمد',
                        badgeStyle: 'background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe;'
                    });
                }

                // 2. تسجيل بصمة
                if (empPunches.length > 0 && (!sourceFilter || sourceFilter === 'punch')) {
                    const punchStatusText = punchCalc && !punchCalc.valid 
                        ? `⚠️ بصمة ناقصة: ${punchCalc.issue}` 
                        : (isHolidayDay ? '🎉 إجازة رسمية (بصمة)' : 'بصمة موثقة GPS ✅');

                    reportRows.push({
                        empId: emp.id,
                        empName: emp.name,
                        dept: emp.job || 'عام',
                        date: dateVal,
                        firstIn: punchInTime,
                        lastOut: punchOutTime,
                        totalHours: punchHours,
                        basicHours: punchBasic,
                        ovHours: punchOv,
                        source: 'punch',
                        sourceLabel: '📱 بصمة ذكية',
                        status: punchStatusText,
                        badgeStyle: punchCalc && !punchCalc.valid 
                            ? 'background:#fef2f2; color:#dc2626; border:1px solid #fca5a5;' 
                            : 'background:#f0fdf4; color:#15803d; border:1px solid #86efac;'
                    });
                }

                // ==================== ب. سجلات المقارنة والتدقيق (جنباً إلى جنب) ====================
                let hoursDiff = Math.round((manualHours - punchHours) * 100) / 100;
                let statusType = 'exact';
                let statusBadge = '';

                if (manual && empPunches.length === 0) {
                    statusType = 'manual_only';
                    statusBadge = `<span class="badge" style="background:#fee2e2; color:#b91c1c; border:1px solid #fca5a5; font-size:11px;">📝 يدوي بدون بصمة</span>`;
                    totalManualOnly++;
                    totalExcessManualHours += manualHours;
                } else if (!manual && empPunches.length > 0) {
                    statusType = 'punch_only';
                    statusBadge = `<span class="badge" style="background:#fef3c7; color:#b45309; border:1px solid #fde68a; font-size:11px;">📍 بصمة بدون تسجيل يدوي</span>`;
                    totalPunchOnly++;
                } else {
                    if (Math.abs(hoursDiff) < 0.15) {
                        statusType = 'exact';
                        statusBadge = `<span class="badge" style="background:#dcfce7; color:#15803d; border:1px solid #86efac; font-size:11px;">تطابق تام ✅</span>`;
                        totalExactMatches++;
                    } else {
                        statusType = 'discrepancy';
                        statusBadge = `<span class="badge" style="background:#fee2e2; color:#991b1b; border:1px solid #fca5a5; font-size:11px;">فرق ${Math.abs(hoursDiff).toFixed(1)} س ⚠️</span>`;
                        totalDiscrepancies++;
                        if (hoursDiff > 0) totalExcessManualHours += hoursDiff;
                    }
                }

                comparisonRows.push({
                    date: dateVal,
                    empId: emp.id,
                    empName: emp.name,
                    dept: emp.job || 'عام',
                    punchIn: punchInTime,
                    punchOut: punchOutTime,
                    punchHours: punchHours,
                    manualIn: manualInTime,
                    manualOut: manualOutTime,
                    manualHours: manualHours,
                    hoursDiff: hoursDiff,
                    statusType: statusType,
                    statusBadge: statusBadge
                });
            });
        });

        comparisonData = comparisonRows;
        attendanceReportData = reportRows;

        // تحديث إحصائيات التدقيق
        const totalAudited = comparisonRows.length;
        const matchPct = totalAudited > 0 ? Math.round((totalExactMatches / totalAudited) * 100) : 100;

        const elAudited = document.getElementById('comp-kpi-total-audited');
        const elMatch = document.getElementById('comp-kpi-match-percent');
        const elDisc = document.getElementById('comp-kpi-discrepancies');
        const elManualOnly = document.getElementById('comp-kpi-manual-only');
        const elExcess = document.getElementById('comp-kpi-excess-hours');

        if (elAudited) elAudited.textContent = `${totalAudited} يوم`;
        if (elMatch) elMatch.textContent = `${matchPct}%`;
        if (elDisc) elDisc.textContent = `${totalDiscrepancies} حالة`;
        if (elManualOnly) elManualOnly.textContent = `${totalManualOnly} يوم`;
        if (elExcess) elExcess.textContent = `${totalExcessManualHours.toFixed(1)} س زائدة`;

        renderComparisonTableUI();
    }

    // رسم الجدول حسب الوضع النشط
    function renderComparisonTableUI() {
        const table = document.getElementById('comp-main-table');
        const emptyHint = document.getElementById('comp-empty-hint');
        if (!table) return;

        if (currentAttendanceViewMode === 'report') {
            // جدول تقرير الحضور والانصراف التفصيلي
            let displayRows = attendanceReportData.slice();

            if (displayRows.length === 0) {
                table.querySelector('tbody').innerHTML = '';
                if (emptyHint) emptyHint.style.display = 'block';
                return;
            }
            if (emptyHint) emptyHint.style.display = 'none';

            table.querySelector('thead').innerHTML = `
                <tr style="background:#ffffff; color:#1e293b; position:sticky; top:0; z-index:2; border-bottom:2px solid #cbd5e1; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
                    <th style="padding:10px 8px; text-align:right; background:#ffffff; color:#1e293b; font-weight:800; border:1px solid #e2e8f0;">اسم الموظف</th>
                    <th style="padding:10px 8px; background:#ffffff; color:#1e293b; font-weight:800; border:1px solid #e2e8f0;">القسم</th>
                    <th style="padding:10px 8px; background:#ffffff; color:#1e293b; font-weight:800; border:1px solid #e2e8f0;">التاريخ</th>
                    <th style="padding:10px 8px; background:#ffffff; color:#1e293b; font-weight:800; border:1px solid #e2e8f0;">أول دخول</th>
                    <th style="padding:10px 8px; background:#ffffff; color:#1e293b; font-weight:800; border:1px solid #e2e8f0;">آخر خروج</th>
                    <th style="padding:10px 8px; font-weight:900; background:#ffffff; color:#0f172a; border:1px solid #e2e8f0;">إجمالي الساعات</th>
                    <th style="padding:10px 8px; background:#ffffff; color:#1e293b; font-weight:800; border:1px solid #e2e8f0;">الساعات الأساسية</th>
                    <th style="padding:10px 8px; background:#ffffff; color:#1e293b; font-weight:800; border:1px solid #e2e8f0;">ساعات الإضافي</th>
                    <th style="padding:10px 8px; background:#ffffff; color:#1e293b; font-weight:800; border:1px solid #e2e8f0;">طريقة التسجيل</th>
                    <th style="padding:10px 8px; background:#ffffff; color:#1e293b; font-weight:800; border:1px solid #e2e8f0;">الحالة والملاحظات</th>
                </tr>
            `;

            let html = '';
            displayRows.forEach(r => {
                html += `
                    <tr>
                        <td style="font-weight:bold; color:#1e293b; text-align:right;">${r.empName}</td>
                        <td style="color:#475569;">${r.dept}</td>
                        <td style="font-weight:bold; font-family:Consolas, monospace;">${r.date}</td>
                        <td style="font-family:Consolas, monospace; font-weight:bold;">${r.firstIn}</td>
                        <td style="font-family:Consolas, monospace; font-weight:bold;">${r.lastOut}</td>
                        <td style="font-family:Consolas, monospace; font-weight:900; color:#102a45; background:#f8fafc;">${Number(r.totalHours).toFixed(2)} س</td>
                        <td style="font-family:Consolas, monospace; font-weight:bold; color:#047857;">${Number(r.basicHours).toFixed(2)} س</td>
                        <td style="font-family:Consolas, monospace; font-weight:bold; color:#c2410c;">${Number(r.ovHours).toFixed(2)} س</td>
                        <td>
                            <span class="badge" style="${r.badgeStyle}; font-weight:bold; font-size:11px; padding:3px 8px; border-radius:4px;">
                                ${r.sourceLabel}
                            </span>
                        </td>
                        <td style="font-size:11.5px; font-weight:bold;">${r.status}</td>
                    </tr>
                `;
            });

            table.querySelector('tbody').innerHTML = html;

        } else {
            // جدول مطابقة وتدقيق البصمة واليدوي
            let displayRows = comparisonData.slice();
            if (showDiscrepanciesOnly) {
                displayRows = displayRows.filter(r => r.statusType !== 'exact');
            }

            if (displayRows.length === 0) {
                table.querySelector('tbody').innerHTML = '';
                if (emptyHint) emptyHint.style.display = 'block';
                return;
            }
            if (emptyHint) emptyHint.style.display = 'none';

            table.querySelector('thead').innerHTML = `
                <tr style="background:#ffffff; color:#1e293b; position:sticky; top:0; z-index:2; border-bottom:1px solid #cbd5e1;">
                    <th colspan="3" style="background:#ffffff; color:#1e293b; padding:8px; font-weight:800; border:1px solid #e2e8f0;">بيانات الموظف والشيفت</th>
                    <th colspan="3" style="background:#ffffff; color:#047857; padding:8px; font-weight:800; border:1px solid #e2e8f0;">📱 بيانات بصمة الموبايل الذكية (GPS)</th>
                    <th colspan="3" style="background:#ffffff; color:#1d4ed8; padding:8px; font-weight:800; border:1px solid #e2e8f0;">⏱️ بيانات الإدخال اليدوي المعتمد</th>
                    <th colspan="2" style="background:#ffffff; color:#831843; padding:8px; font-weight:800; border:1px solid #e2e8f0;">⚖️ نتائج التدقيق والفرق</th>
                </tr>
                <tr style="background:#ffffff; color:#334155; position:sticky; top:35px; z-index:2; font-size:11.5px; border-bottom:2px solid #cbd5e1;">
                    <th style="padding:8px 6px; background:#ffffff; color:#1e293b; font-weight:700; border:1px solid #e2e8f0;">التاريخ</th>
                    <th style="padding:8px 6px; text-align:right; background:#ffffff; color:#1e293b; font-weight:700; border:1px solid #e2e8f0;">الموظف</th>
                    <th style="padding:8px 6px; background:#ffffff; color:#1e293b; font-weight:700; border:1px solid #e2e8f0;">القسم</th>
                    <th style="padding:8px 6px; color:#047857; background:#ffffff; border:1px solid #e2e8f0; font-weight:700;">حضور GPS</th>
                    <th style="padding:8px 6px; color:#047857; background:#ffffff; border:1px solid #e2e8f0; font-weight:700;">انصراف GPS</th>
                    <th style="padding:8px 6px; color:#047857; font-weight:bold; background:#ffffff; border:1px solid #e2e8f0;">ساعات GPS</th>
                    <th style="padding:8px 6px; color:#1d4ed8; background:#ffffff; border:1px solid #e2e8f0; font-weight:700;">حضور يدوي</th>
                    <th style="padding:8px 6px; color:#1d4ed8; background:#ffffff; border:1px solid #e2e8f0; font-weight:700;">انصراف يدوي</th>
                    <th style="padding:8px 6px; color:#1d4ed8; font-weight:bold; background:#ffffff; border:1px solid #e2e8f0;">ساعات يدوي</th>
                    <th style="padding:8px 6px; background:#ffffff; color:#1e293b; border:1px solid #e2e8f0; font-weight:700;">فرق الساعات</th>
                    <th style="padding:8px 6px; background:#ffffff; color:#1e293b; border:1px solid #e2e8f0; font-weight:700;">حالة المطابقة</th>
                </tr>
            `;

            let html = '';
            displayRows.forEach(r => {
                let diffStyle = 'color:#64748b; font-weight:bold;';
                let diffPrefix = '';
                if (r.hoursDiff > 0) {
                    diffStyle = 'color:#b91c1c; font-weight:bold;';
                    diffPrefix = '+';
                } else if (r.hoursDiff < 0) {
                    diffStyle = 'color:#d97706; font-weight:bold;';
                } else {
                    diffStyle = 'color:#15803d; font-weight:bold;';
                }

                html += `
                    <tr>
                        <td style="font-weight:bold;">${r.date}</td>
                        <td style="font-weight:bold; color:#1e293b; text-align:right;">${r.empName}</td>
                        <td>${r.dept}</td>
                        <!-- بيانات البصمة -->
                        <td style="background:#f0fdf4; font-family:Consolas, monospace;">${r.punchIn}</td>
                        <td style="background:#f0fdf4; font-family:Consolas, monospace;">${r.punchOut}</td>
                        <td style="background:#f0fdf4; font-weight:bold; font-family:Consolas, monospace;">${Number(r.punchHours).toFixed(2)} س</td>
                        <!-- بيانات الإدخال اليدوي -->
                        <td style="background:#eff6ff; font-family:Consolas, monospace;">${r.manualIn}</td>
                        <td style="background:#eff6ff; font-family:Consolas, monospace;">${r.manualOut}</td>
                        <td style="background:#eff6ff; font-weight:bold; font-family:Consolas, monospace;">${Number(r.manualHours).toFixed(2)} س</td>
                        <!-- الفارق والحالة -->
                        <td style="font-family:Consolas, monospace; ${diffStyle}">${diffPrefix}${Number(r.hoursDiff).toFixed(2)} س</td>
                        <td>${r.statusBadge}</td>
                    </tr>
                `;
            });

            table.querySelector('tbody').innerHTML = html;
        }
    }

    // زر التبديل: إظهار الفروقات فقط
    function toggleComparisonDiscrepancyOnly(btn) {
        showDiscrepanciesOnly = !showDiscrepanciesOnly;
        if (btn) {
            btn.style.opacity = showDiscrepanciesOnly ? '1' : '0.7';
            btn.style.border = showDiscrepanciesOnly ? '2px solid #b45309' : 'none';
        }
        renderComparisonTableUI();
    }

    // طباعة التقرير
    function printAttendanceComparisonReport() {
        const printWindow = window.open('', '_blank');
        if (!printWindow) return;
        const tableHtml = document.getElementById('comp-main-table').outerHTML;
        const cycleSelect = document.getElementById('comp-cycle-select');
        const cycleText = (cycleSelect && cycleSelect.options[cycleSelect.selectedIndex]) ? cycleSelect.options[cycleSelect.selectedIndex].text : '';
        const reportTitle = (currentAttendanceViewMode === 'report') 
            ? 'تقرير الحضور والانصراف التفصيلي' 
            : 'تقرير مطابقة البصمة الذكية والإدخال اليدوي';

        const html = `
            <!DOCTYPE html>
            <html lang="ar" dir="rtl">
            <head>
                <meta charset="UTF-8">
                <title>${reportTitle} - عيادات سيدي ياقوت</title>
                <style>
                    body { font-family: Tahoma, Arial, sans-serif; direction: rtl; padding: 15px; color: #000; }
                    table { width: 100%; border-collapse: collapse; font-size: 10px; text-align: center; margin-top: 15px; }
                    th, td { border: 1px solid #000; padding: 4px 5px; }
                    th { background-color: #f1f5f9; font-weight: bold; }
                    .header-box { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #990012; padding-bottom: 8px; }
                </style>
            </head>
            <body>
                <div class="header-box">
                    <div>
                        <h2 style="margin:0; color:#102a45;">${reportTitle}</h2>
                        <div style="font-size:12px; color:#990012; font-weight:bold; margin-top:3px;">${cycleText}</div>
                    </div>
                    <div style="font-size:11px;">تاريخ الطباعة: ${new Date().toLocaleDateString('ar-EG')}</div>
                </div>
                ${tableHtml}
            </body>
            </html>
        `;
        printWindow.document.write(html + '<script>window.onload = function() { window.print(); };<\/script>');
        printWindow.document.close();
    }

    // تصدير PDF
    function exportAttendanceComparisonToPdf() {
        const tableHtml = document.getElementById('comp-main-table').outerHTML;
        const cycleSelect = document.getElementById('comp-cycle-select');
        const cycleText = (cycleSelect && cycleSelect.options[cycleSelect.selectedIndex]) ? cycleSelect.options[cycleSelect.selectedIndex].text : '';
        const reportTitle = (currentAttendanceViewMode === 'report') ? 'تقرير_الحضور_التفصيلي' : 'تقرير_مطابقة_البصمة_واليدوي';

        if (typeof downloadPrintHtmlAsPdf === 'function') {
            const html = `
                <div style="direction:rtl; font-family:Tahoma, Arial, sans-serif; padding:10px;">
                    <h2 style="margin:0 0 6px 0; font-size:16px; color:#102a45;">${reportTitle.replace(/_/g, ' ')} - ${cycleText}</h2>
                    ${tableHtml}
                </div>
            `;
            downloadPrintHtmlAsPdf(html, `${reportTitle}.pdf`, 'landscape');
        } else {
            printAttendanceComparisonReport();
        }
    }

    // تصدير Excel
    function exportAttendanceComparisonToExcel() {
        const reportTitle = (currentAttendanceViewMode === 'report') ? 'تقرير_الحضور_التفصيلي' : 'مطابقة_البصمة_واليدوي';
        if (typeof exportTableToExcel === 'function') {
            exportTableToExcel('comp-main-table', reportTitle);
        }
    }

    // تصدير الدوال للواجهة والنظام
    window.renderAttendanceComparisonScreen = renderAttendanceComparisonScreen;
    window.setAttendanceReportViewMode = setAttendanceReportViewMode;
    window.loadAndCalculateComparisonReport = loadAndCalculateComparisonReport;
    window.toggleComparisonDiscrepancyOnly = toggleComparisonDiscrepancyOnly;
    window.printAttendanceComparisonReport = printAttendanceComparisonReport;
    window.printComparisonReportSheet = printAttendanceComparisonReport;
    window.exportAttendanceComparisonToPdf = exportAttendanceComparisonToPdf;
    window.exportComparisonReportToPdf = exportAttendanceComparisonToPdf;
    window.exportAttendanceComparisonToExcel = exportAttendanceComparisonToExcel;
    window.exportComparisonReportToExcel = exportAttendanceComparisonToExcel;
})();
