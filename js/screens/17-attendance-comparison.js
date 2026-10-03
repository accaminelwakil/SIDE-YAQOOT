// ====================================================================
// شاشة تقرير المقارنة والمطابقة بين بصمة الموظف والإدخال اليدوي
// Attendance Comparison & Discrepancy Audit Engine (Punch vs Manual)
// منظومة عيادات سيدي ياقوت التخصصية
// ====================================================================

(function() {
    let comparisonData = [];
    let showDiscrepanciesOnly = false;

    // تهيئة الشاشة
    function renderAttendanceComparisonScreen() {
        populateComparisonCyclesDropdown();
        loadAndCalculateComparisonReport();
    }

    // تعبئة دورات الرواتب
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

        // 1. جلب بصمات الـ GPS
        let punches = [];
        try {
            const resp = await fetch('/api/attendance/punches');
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

        // 4. بناء هيكل المقارنة لكل موظف ولكل تاريخ في الدورة
        const comparisonRows = [];
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
                    if (String(p.empId) !== String(emp.id) && p.empName !== emp.name) return false;
                    const pDate = p.date || (p.timestamp ? p.timestamp.split('T')[0] : '');
                    return pDate === dateVal && (p.status === 'ACCEPTED' || !p.status);
                }).sort((a, b) => (a.time || '').localeCompare(b.time || ''));

                // إذا لم يكن هناك بصمات ولا حضور يدوي لهذا الموظف في هذا اليوم، نتخطاه
                if (!manual && empPunches.length === 0) return;

                const punchIns = empPunches.filter(p => p.type === 'in');
                const punchOuts = empPunches.filter(p => p.type === 'out');

                let punchInTime = punchIns.length > 0 ? punchIns[0].time : '-';
                let punchOutTime = punchOuts.length > 0 ? punchOuts[punchOuts.length - 1].time : '-';
                let punchHours = 0;

                if (punchIns.length > 0 && punchOuts.length > 0) {
                    const [h1, m1] = punchInTime.split(':').map(Number);
                    const [h2, m2] = punchOutTime.split(':').map(Number);
                    let diffM = (h2 * 60 + m2) - (h1 * 60 + m1);
                    if (diffM < 0) diffM += 24 * 60;
                    punchHours = Math.round((diffM / 60) * 100) / 100;
                } else if (punchIns.length > 0) {
                    punchHours = Number(emp.shiftHours) || 8;
                }

                const manualInTime = (manual && manual.timeIn) ? manual.timeIn : '-';
                const manualOutTime = (manual && manual.timeOut) ? manual.timeOut : '-';
                const manualHours = (manual && manual.hours) ? Number(manual.hours) : 0;

                // احتساب الفارق
                let hoursDiff = Math.round((manualHours - punchHours) * 100) / 100;
                let statusType = 'exact'; // 'exact', 'discrepancy', 'manual_only', 'punch_only'
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
                    // كلاهما موجود
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
        renderComparisonTableUI(comparisonRows);

        // تحديث إحصائيات الـ KPIs
        const totalAudited = comparisonRows.length;
        const matchPct = totalAudited > 0 ? Math.round((totalExactMatches / totalAudited) * 100) : 100;

        document.getElementById('comp-kpi-total-audited').textContent = `${totalAudited} يوم`;
        document.getElementById('comp-kpi-match-percent').textContent = `${matchPct}%`;
        document.getElementById('comp-kpi-discrepancies').textContent = `${totalDiscrepancies} حالة`;
        document.getElementById('comp-kpi-manual-only').textContent = `${totalManualOnly} يوم`;
        document.getElementById('comp-kpi-excess-hours').textContent = `${totalExcessManualHours.toFixed(1)} س زائدة`;
    }

    // رسم الجدول في الصفحة
    function renderComparisonTableUI(rows) {
        const tableBody = document.getElementById('comp-table-tbody');
        const emptyHint = document.getElementById('comp-empty-hint');
        if (!tableBody) return;

        let displayRows = rows.slice();
        if (showDiscrepanciesOnly) {
            displayRows = displayRows.filter(r => r.statusType !== 'exact');
        }

        if (displayRows.length === 0) {
            tableBody.innerHTML = '';
            if (emptyHint) emptyHint.style.display = 'block';
            return;
        }

        if (emptyHint) emptyHint.style.display = 'none';

        let html = '';
        displayRows.forEach(r => {
            let diffStyle = 'color:#64748b; font-weight:bold;';
            let diffPrefix = '';
            if (r.hoursDiff > 0) {
                diffStyle = 'color:#b91c1c; font-weight:bold;'; // اليدوي أكثر من البصمة
                diffPrefix = '+';
            } else if (r.hoursDiff < 0) {
                diffStyle = 'color:#d97706; font-weight:bold;'; // البصمة أكثر من اليدوي
            } else {
                diffStyle = 'color:#15803d; font-weight:bold;';
            }

            html += `
                <tr>
                    <td style="font-weight:bold;">${r.date}</td>
                    <td style="font-weight:bold; color:#1e293b;">${r.empName}</td>
                    <td>${r.dept}</td>
                    <!-- بيانات البصمة -->
                    <td style="background:#f0fdf4; font-family:Consolas, monospace;">${r.punchIn}</td>
                    <td style="background:#f0fdf4; font-family:Consolas, monospace;">${r.punchOut}</td>
                    <td style="background:#f0fdf4; font-weight:bold; font-family:Consolas, monospace;">${r.punchHours.toFixed(2)} س</td>
                    <!-- بيانات الإدخال اليدوي -->
                    <td style="background:#eff6ff; font-family:Consolas, monospace;">${r.manualIn}</td>
                    <td style="background:#eff6ff; font-family:Consolas, monospace;">${r.manualOut}</td>
                    <td style="background:#eff6ff; font-weight:bold; font-family:Consolas, monospace;">${r.manualHours.toFixed(2)} س</td>
                    <!-- الفارق والحالة -->
                    <td style="font-family:Consolas, monospace; ${diffStyle}">${diffPrefix}${r.hoursDiff.toFixed(2)} س</td>
                    <td>${r.statusBadge}</td>
                </tr>
            `;
        });

        tableBody.innerHTML = html;
    }

    // زر التبديل: إظهار الفروقات فقط
    function toggleShowDiscrepanciesOnly(checkbox) {
        showDiscrepanciesOnly = checkbox ? checkbox.checked : !showDiscrepanciesOnly;
        renderComparisonTableUI(comparisonData);
    }

    // طباعة تقرير المطابقة الرسمي
    function printComparisonReportSheet() {
        const printWindow = window.open('', '_blank');
        if (!printWindow) return;
        const tableHtml = document.getElementById('comp-main-table').outerHTML;
        const cycleText = document.getElementById('comp-cycle-select').options[document.getElementById('comp-cycle-select').selectedIndex].text;

        const html = `
            <!DOCTYPE html>
            <html lang="ar" dir="rtl">
            <head>
                <meta charset="UTF-8">
                <title>تقرير مطابقة البصمة والإدخال اليدوي - عيادات سيدي ياقوت</title>
                <style>
                    body { font-family: Tahoma, Arial, sans-serif; direction: rtl; padding: 15px; color: #000; }
                    table { width: 100%; border-collapse: collapse; font-size: 10.5px; text-align: center; margin-top: 15px; }
                    th, td { border: 1px solid #000; padding: 5px 6px; }
                    th { background-color: #f1f5f9; font-weight: bold; }
                    .header-box { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #990012; padding-bottom: 8px; }
                </style>
            </head>
            <body>
                <div class="header-box">
                    <div>
                        <h2 style="margin:0; color:#102a45;">تقرير مطابقة وتدقيق البصمة الذكية (GPS) والإدخال اليدوي</h2>
                        <div style="font-size:12px; color:#990012; font-weight:bold;">${cycleText}</div>
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

    function exportComparisonReportToPdf() {
        if (typeof downloadPrintHtmlAsPdf === 'function') {
            const tableHtml = document.getElementById('comp-main-table').outerHTML;
            const cycleText = document.getElementById('comp-cycle-select').options[document.getElementById('comp-cycle-select').selectedIndex].text;
            const html = `
                <div style="direction:rtl; font-family:Tahoma, Arial, sans-serif; padding:10px;">
                    <h2 style="margin:0 0 6px 0; font-size:16px; color:#102a45;">تقرير مطابقة البصمة والإدخال اليدوي - ${cycleText}</h2>
                    ${tableHtml}
                </div>
            `;
            downloadPrintHtmlAsPdf(html, 'تقرير_مطابقة_البصمة_واليدوي.pdf', 'landscape');
        } else {
            printComparisonReportSheet();
        }
    }

    function exportComparisonReportToExcel() {
        if (typeof exportTableToExcel === 'function') {
            exportTableToExcel('comp-main-table', 'مطابقة_البصمة_واليدوي');
        }
    }

    // تصدير الدوال
    window.renderAttendanceComparisonScreen = renderAttendanceComparisonScreen;
    window.loadAndCalculateComparisonReport = loadAndCalculateComparisonReport;
    window.toggleShowDiscrepanciesOnly = toggleShowDiscrepanciesOnly;
    window.printComparisonReportSheet = printComparisonReportSheet;
    window.exportComparisonReportToPdf = exportComparisonReportToPdf;
    window.exportComparisonReportToExcel = exportComparisonReportToExcel;
})();
