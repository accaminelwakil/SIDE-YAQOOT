// ====================================================================
// شاشة بصمة الموظفين واحتساب الرواتب والمقارنة المنهجية
// Smart Punch Attendance & Punch-Based Payroll Calculation Engine
// منظومة عيادات سيدي ياقوت التخصصية
// ====================================================================

(function() {
    let currentPunchesList = [];
    let punchPayrollMode = localStorage.getItem('erp_payroll_calc_mode') || 'manual'; // 'manual' or 'punch'

    // تهيئة الشاشة
    function renderPunchesPayrollScreen() {
        populatePunchesPayrollCyclesDropdown();
        loadAllAttendancePunchesData();
        updatePayrollModeDisplay();
    }

    // تعبئة دورات الرواتب (25 إلى 24)
    function populatePunchesPayrollCyclesDropdown() {
        const select = document.getElementById('punch-payroll-cycle-select');
        const deptSel = document.getElementById('punch-payroll-dept-filter');
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

        if (deptSel && deptSel.options.length <= 1) {
            const deptsSet = new Set();
            (window.employees || []).forEach(e => { if (e && e.job) deptsSet.add(e.job.trim()); });
            deptSel.innerHTML = '<option value="">جميع الأقسام (الكل)</option>';
            Array.from(deptsSet).sort().forEach(d => {
                const opt = document.createElement('option');
                opt.value = d;
                opt.textContent = d;
                deptSel.appendChild(opt);
            });
        }
    }

    // جلب حركات البصمات من السيرفر أو التخزين المحلي
    async function loadAllAttendancePunchesData() {
        let punches = [];
        try {
            const resp = await fetch('/api/attendance/punches');
            if (resp.ok) {
                const data = await resp.json();
                punches = data.punches || [];
            }
        } catch (e) {
            console.warn('[PunchesPayroll] Backend fetch failed, reading localStorage fallback');
        }

        if (!punches || punches.length === 0) {
            punches = JSON.parse(localStorage.getItem('erp_smart_punches_db') || '[]');
        }

        currentPunchesList = punches;
        calculateAndRenderPunchesPayroll();
    }

    // احتساب الرواتب بناءً على البصمة وتعبئة الجدول
    function calculateAndRenderPunchesPayroll() {
        const cycleSelect = document.getElementById('punch-payroll-cycle-select');
        if (!cycleSelect || !cycleSelect.value) return;

        const [startDate, endDate] = cycleSelect.value.split('|');
        const deptFilter = document.getElementById('punch-payroll-dept-filter') ? document.getElementById('punch-payroll-dept-filter').value : '';
        const searchInput = (document.getElementById('punch-payroll-search') ? document.getElementById('punch-payroll-search').value : '').trim().toLowerCase();

        const allEmps = Array.isArray(window.employees) ? window.employees : [];
        let targetEmps = allEmps.filter(e => e.status !== 'انتهت خدمته');

        if (deptFilter) {
            targetEmps = targetEmps.filter(e => e.job === deptFilter);
        }

        if (searchInput) {
            targetEmps = targetEmps.filter(e => e.name.toLowerCase().includes(searchInput) || String(e.id).includes(searchInput));
        }

        const tableBody = document.getElementById('punch-payroll-tbody');
        const emptyHint = document.getElementById('punch-payroll-empty');
        if (!tableBody) return;

        let totalAttendeesCount = 0;
        let grandTotalActualHours = 0;
        let grandTotalBasicHours = 0;
        let grandTotalOvHours = 0;
        let grandTotalNetWages = 0;

        let rowsHtml = '';
        targetEmps.forEach((emp, index) => {
            // استخراج حركات الموظف في نطاق الدورة
            const empPunches = currentPunchesList.filter(p => {
                if (String(p.empId) !== String(emp.id) && p.empName !== emp.name) return false;
                const pDate = p.date || (p.timestamp ? p.timestamp.split('T')[0] : '');
                return pDate >= startDate && pDate <= endDate && (p.status === 'ACCEPTED' || !p.status);
            });

            // تجميع الحركات باليوم لحساب الساعات
            const daysMap = {};
            empPunches.forEach(p => {
                const pDate = p.date || (p.timestamp ? p.timestamp.split('T')[0] : '');
                if (!daysMap[pDate]) daysMap[pDate] = [];
                daysMap[pDate].push(p);
            });

            let totalActualHours = 0;
            let totalBasicHours = 0;
            let totalOvHours = 0;
            let daysAttendedCount = Object.keys(daysMap).length;

            const shiftH = Number(emp.shiftHours) || 8;
            const basicMonthly = Number(emp.basicSalary) || 0;
            const hourlyRate = (basicMonthly / (30 * shiftH)) || 0;

            Object.keys(daysMap).forEach(d => {
                const dayPunches = daysMap[d].sort((a, b) => (a.time || '').localeCompare(b.time || ''));
                const ins = dayPunches.filter(p => p.type === 'in');
                const outs = dayPunches.filter(p => p.type === 'out');

                let dayHours = 0;
                if (ins.length > 0 && outs.length > 0) {
                    const firstIn = ins[0].time;
                    const lastOut = outs[outs.length - 1].time;
                    const [h1, m1] = firstIn.split(':').map(Number);
                    const [h2, m2] = lastOut.split(':').map(Number);
                    let diffMins = (h2 * 60 + m2) - (h1 * 60 + m1);
                    if (diffMins < 0) diffMins += 24 * 60; // للورديات الليلية العابرة لمنتصف الليل
                    dayHours = Math.round((diffMins / 60) * 100) / 100;
                } else if (ins.length > 0) {
                    // افتراضي شيفت كامل إن سجل دخول فقط بدون خروج
                    dayHours = shiftH;
                }

                totalActualHours += dayHours;
                const reg = Math.min(dayHours, shiftH);
                totalBasicHours += reg;
                totalOvHours += Math.max(0, dayHours - shiftH);
            });

            if (daysAttendedCount > 0) totalAttendeesCount++;

            // احتساب الراتب بناءً على الساعات الفعلية ومعدلات الإضافي
            const ovRate = hourlyRate * 1.25; // متوسط تقريبي للإضافي
            const basicWage = totalBasicHours * hourlyRate;
            const ovWage = totalOvHours * ovRate;
            const netPunchWage = Math.round((basicWage + ovWage) * 100) / 100;

            grandTotalActualHours += totalActualHours;
            grandTotalBasicHours += totalBasicHours;
            grandTotalOvHours += totalOvHours;
            grandTotalNetWages += netPunchWage;

            rowsHtml += `
                <tr>
                    <td style="font-weight:bold; font-family:Consolas, monospace;">#${emp.id}</td>
                    <td style="font-weight:bold; color:#1e293b;">${emp.name}</td>
                    <td>${emp.job || '-'}</td>
                    <td style="font-weight:bold;">${daysAttendedCount} يوم</td>
                    <td style="font-weight:bold; font-family:Consolas, monospace;">${totalActualHours.toFixed(2)} س</td>
                    <td style="font-family:Consolas, monospace;">${totalBasicHours.toFixed(2)} س</td>
                    <td style="color:#059669; font-weight:bold; font-family:Consolas, monospace;">${totalOvHours.toFixed(2)} س</td>
                    <td style="font-family:Consolas, monospace;">${basicMonthly.toLocaleString()} ج.م</td>
                    <td style="font-family:Consolas, monospace; font-size:11.5px;">${hourlyRate.toFixed(2)} ج.م</td>
                    <td style="font-weight:bold; font-size:13px; color:#102a45; font-family:Consolas, monospace;">${netPunchWage.toLocaleString('ar-EG', {minimumFractionDigits: 2})} ج.م</td>
                    <td>
                        <button type="button" class="btn-secondary" style="padding:4px 8px; font-size:11px; min-height:28px;" onclick="viewEmployeePunchesDetail('${emp.id}')" title="عرض تفاصيل بصمات الموظف">🔍 حركات البصمة</button>
                    </td>
                </tr>
            `;
        });

        tableBody.innerHTML = rowsHtml;
        if (targetEmps.length === 0) {
            if (emptyHint) emptyHint.style.display = 'block';
        } else {
            if (emptyHint) emptyHint.style.display = 'none';
        }

        // تحديث كروت الـ KPI
        document.getElementById('punch-kpi-attendees').textContent = `${totalAttendeesCount} موظف`;
        document.getElementById('punch-kpi-total-hours').textContent = `${grandTotalActualHours.toFixed(1)} س`;
        document.getElementById('punch-kpi-basic-hours').textContent = `${grandTotalBasicHours.toFixed(1)} س`;
        document.getElementById('punch-kpi-overtime-hours').textContent = `${grandTotalOvHours.toFixed(1)} س`;
        document.getElementById('punch-kpi-net-wages').textContent = `${grandTotalNetWages.toLocaleString('ar-EG', {minimumFractionDigits: 2})} ج.م`;
    }

    // تبديل وضع طريقة احتساب الرواتب الرسمية (يدوي vs بصمة)
    function setPayrollCalculationMode(mode) {
        punchPayrollMode = mode;
        localStorage.setItem('erp_payroll_calc_mode', mode);
        updatePayrollModeDisplay();

        if (typeof showToast === 'function') {
            const title = (mode === 'punch') ? '📍 تم تفعيل الاعتماد على بصمة الموظف لحساب الرواتب' : '✍️ تم تفعيل الاعتماد على الإدخال اليدوي لحساب الرواتب';
            showToast(title, 'success');
        }
    }

    function updatePayrollModeDisplay() {
        const btnManual = document.getElementById('btn-mode-manual-payroll');
        const btnPunch = document.getElementById('btn-mode-punch-payroll');
        const bannerText = document.getElementById('payroll-mode-status-text');

        if (btnManual && btnPunch) {
            if (punchPayrollMode === 'punch') {
                btnPunch.style.background = '#102a45';
                btnPunch.style.color = '#ffffff';
                btnManual.style.background = '#ffffff';
                btnManual.style.color = '#1e293b';
                if (bannerText) {
                    bannerText.innerHTML = `🌟 النظام يعتمد حالياً: <strong>[ بصمة الموظف الذكية (GPS) ]</strong> لاحتساب الساعات والرواتب في السراكي والمسير.`;
                    bannerText.parentElement.style.borderColor = '#059669';
                    bannerText.parentElement.style.background = '#f0fdf4';
                }
            } else {
                btnManual.style.background = '#102a45';
                btnManual.style.color = '#ffffff';
                btnPunch.style.background = '#ffffff';
                btnPunch.style.color = '#1e293b';
                if (bannerText) {
                    bannerText.innerHTML = `📝 النظام يعتمد حالياً: <strong>[ الإدخال اليدوي لشاشة الحضور والانصراف ]</strong> لاحتساب الساعات والرواتب.`;
                    bannerText.parentElement.style.borderColor = '#cbd5e1';
                    bannerText.parentElement.style.background = '#f8fafc';
                }
            }
        }
    }

    // ترحيل ساعات البصمة إلى كشوف اليومية والمسير الرسمي
    function applyPunchDataToOfficialAttendance() {
        if (!confirm('هل تؤكد ترحيل وتثبيت ساعات البصمة المحسوبة في جدول الحضور والانصراف الرسمي لكافة الموظفين للشهر المحدد؟')) return;

        const cycleSelect = document.getElementById('punch-payroll-cycle-select');
        if (!cycleSelect) return;
        const [startDate, endDate] = cycleSelect.value.split('|');

        let transferredCount = 0;
        const allEmps = Array.isArray(window.employees) ? window.employees : [];

        // تجميع كل بصمات الفترة
        const cyclePunches = currentPunchesList.filter(p => {
            const pDate = p.date || (p.timestamp ? p.timestamp.split('T')[0] : '');
            return pDate >= startDate && pDate <= endDate && (p.status === 'ACCEPTED' || !p.status);
        });

        // دمجها في attendanceRecords
        allEmps.forEach(emp => {
            const empPunches = cyclePunches.filter(p => String(p.empId) === String(emp.id) || p.empName === emp.name);
            const daysMap = {};
            empPunches.forEach(p => {
                const pDate = p.date || (p.timestamp ? p.timestamp.split('T')[0] : '');
                if (!daysMap[pDate]) daysMap[pDate] = [];
                daysMap[pDate].push(p);
            });

            const shiftH = Number(emp.shiftHours) || 8;
            const basicSal = Number(emp.basicSalary) || 0;
            const rates = (typeof computeRates === 'function') ? computeRates(basicSal, shiftH) : { hourlyRate: (basicSal / (30 * shiftH)), ov1: 0, ov2: 0, ovMore: 0 };

            Object.keys(daysMap).forEach(dateVal => {
                const dayP = daysMap[dateVal].sort((a, b) => (a.time || '').localeCompare(b.time || ''));
                const ins = dayP.filter(p => p.type === 'in');
                const outs = dayP.filter(p => p.type === 'out');

                let timeIn = ins.length > 0 ? ins[0].time : '09:00';
                let timeOut = outs.length > 0 ? outs[outs.length - 1].time : '17:00';

                const [h1, m1] = timeIn.split(':').map(Number);
                const [h2, m2] = timeOut.split(':').map(Number);
                let diffM = (h2 * 60 + m2) - (h1 * 60 + m1);
                if (diffM < 0) diffM += 24 * 60;
                let dayHours = Math.round((diffM / 60) * 100) / 100;
                let basicH = Math.min(dayHours, shiftH);
                let ovH = Math.max(0, dayHours - shiftH);

                // إزالة أي سجل سابق لنفس الموظف ونفس اليوم وإحلال سجل البصمة المعتمد
                if (typeof attendanceRecords !== 'undefined') {
                    attendanceRecords = attendanceRecords.filter(r => !(String(r.empId) === String(emp.id) && r.date === dateVal));
                    attendanceRecords.push({
                        id: Date.now() + Math.floor(Math.random() * 1000),
                        empId: emp.id,
                        name: emp.name,
                        job: emp.job,
                        date: dateVal,
                        timeIn: timeIn,
                        timeOut: timeOut,
                        hours: dayHours,
                        basicHours: basicH,
                        ovTotal: ovH,
                        ov1: Math.min(ovH, 1),
                        ov2: Math.max(0, Math.min(ovH - 1, 1)),
                        ovMore: Math.max(0, ovH - 2),
                        rate: rates.hourlyRate,
                        wage: Math.round(basicH * rates.hourlyRate * 100) / 100,
                        isHoliday: false,
                        isPaid: false,
                        source: 'gps_punch'
                    });
                    transferredCount++;
                }
            });
        });

        if (typeof attendanceRecords !== 'undefined') {
            localStorage.setItem('erp_attendance_db', JSON.stringify(attendanceRecords));
            if (typeof pushSingleCollectionToFirebase === 'function') {
                pushSingleCollectionToFirebase('attendance', attendanceRecords);
            }
        }

        alert(`🎉 تم ترحيل واعتماد ${transferredCount} حركة حضور بالبصمة بنجاح إلى جدول الحضور والسراكي الرسمية!`);
    }

    // عرض تفاصيل حركات بصمات الموظف
    function viewEmployeePunchesDetail(empId) {
        const allEmps = Array.isArray(window.employees) ? window.employees : [];
        const emp = allEmps.find(e => String(e.id) === String(empId));
        if (!emp) return;

        const cycleSelect = document.getElementById('punch-payroll-cycle-select');
        const [startDate, endDate] = cycleSelect ? cycleSelect.value.split('|') : ['', ''];

        const punches = currentPunchesList.filter(p => {
            if (String(p.empId) !== String(emp.id) && p.empName !== emp.name) return false;
            const pDate = p.date || (p.timestamp ? p.timestamp.split('T')[0] : '');
            return pDate >= startDate && pDate <= endDate;
        }).sort((a, b) => new Date(b.timestamp || b.date) - new Date(a.timestamp || a.date));

        let modal = document.getElementById('modal-emp-punch-details');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'modal-emp-punch-details';
            modal.style.cssText = 'display:none; position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.5); backdrop-filter:blur(5px); z-index:9999; align-items:center; justify-content:center;';
            document.body.appendChild(modal);
        }

        let punchesRows = punches.map(p => `
            <tr>
                <td>${p.date || '-'}</td>
                <td style="font-weight:bold; font-family:Consolas, monospace;">${p.time || '-'}</td>
                <td><span class="badge" style="background:${p.type === 'in' ? '#dcfce7' : '#fee2e2'}; color:${p.type === 'in' ? '#15803d' : '#b91c1c'};">${p.typeTitle || (p.type === 'in' ? 'حضور' : 'انصراف')}</span></td>
                <td>${p.distance_meters || 0} متر</td>
                <td><span style="color:#059669; font-weight:bold;">${p.status || 'مقبول'}</span></td>
            </tr>
        `).join('');

        if (punches.length === 0) {
            punchesRows = '<tr><td colspan="5" style="text-align:center; padding:15px; color:#64748b;">لا توجد بصمات مسجلة للموظف في هذه الدورة.</td></tr>';
        }

        modal.innerHTML = `
            <div style="background:#fff; border-radius:12px; width:92%; max-width:600px; padding:20px; box-shadow:0 10px 30px rgba(0,0,0,0.4); max-height:85vh; overflow-y:auto; direction:rtl; text-align:right;">
                <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1.5px solid #102a45; padding-bottom:8px; margin-bottom:12px;">
                    <h3 style="margin:0; color:#102a45; font-size:16px;">📍 سجل بصمات الموظف: ${emp.name}</h3>
                    <button type="button" onclick="document.getElementById('modal-emp-punch-details').style.display='none'" style="background:none; border:none; font-size:18px; cursor:pointer;">✖</button>
                </div>
                <div style="font-size:12px; color:#475569; margin-bottom:10px;">الفترة من ${startDate} إلى ${endDate} (إجمالي البصمات: ${punches.length})</div>
                <table style="width:100%; border-collapse:collapse; font-size:11.5px; text-align:center;">
                    <thead>
                        <tr style="background:#f1f5f9;">
                            <th style="border:1px solid #cbd5e1; padding:6px;">التاريخ</th>
                            <th style="border:1px solid #cbd5e1; padding:6px;">الوقت</th>
                            <th style="border:1px solid #cbd5e1; padding:6px;">النوع</th>
                            <th style="border:1px solid #cbd5e1; padding:6px;">المسافة</th>
                            <th style="border:1px solid #cbd5e1; padding:6px;">الحالة</th>
                        </tr>
                    </thead>
                    <tbody>${punchesRows}</tbody>
                </table>
                <div style="text-align:center; margin-top:16px;">
                    <button type="button" class="btn-secondary" onclick="document.getElementById('modal-emp-punch-details').style.display='none'">إغلاق النافذة</button>
                </div>
            </div>
        `;
        modal.style.display = 'flex';
    }

    // طباعة وتصدير
    function printPunchesPayrollSheet() {
        const printWindow = window.open('', '_blank');
        if (!printWindow) return;
        const tableHtml = document.getElementById('punch-payroll-table').outerHTML;
        const cycleText = document.getElementById('punch-payroll-cycle-select').options[document.getElementById('punch-payroll-cycle-select').selectedIndex].text;

        const html = `
            <!DOCTYPE html>
            <html lang="ar" dir="rtl">
            <head>
                <meta charset="UTF-8">
                <title>كشف رواتب البصمة الذكية - عيادات سيدي ياقوت</title>
                <style>
                    body { font-family: Tahoma, Arial, sans-serif; direction: rtl; padding: 15px; color: #000; }
                    table { width: 100%; border-collapse: collapse; font-size: 11px; text-align: center; margin-top: 15px; }
                    th, td { border: 1px solid #000; padding: 6px 8px; }
                    th { background-color: #f1f5f9; font-weight: bold; }
                    .header-box { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #102a45; padding-bottom: 8px; }
                </style>
            </head>
            <body>
                <div class="header-box">
                    <div>
                        <h2 style="margin:0; color:#102a45;">كشف مراجعة رواتب الموظفين بناءً على البصمة الذكية (GPS)</h2>
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

    function exportPunchesPayrollToPdf() {
        if (typeof downloadPrintHtmlAsPdf === 'function') {
            const tableHtml = document.getElementById('punch-payroll-table').outerHTML;
            const cycleText = document.getElementById('punch-payroll-cycle-select').options[document.getElementById('punch-payroll-cycle-select').selectedIndex].text;
            const html = `
                <div style="direction:rtl; font-family:Tahoma, Arial, sans-serif; padding:10px;">
                    <h2 style="margin:0 0 6px 0; font-size:16px; color:#102a45;">كشف رواتب البصمة الذكية - ${cycleText}</h2>
                    ${tableHtml}
                </div>
            `;
            downloadPrintHtmlAsPdf(html, 'كشف_رواتب_بصمة_الموظفين.pdf', 'landscape');
        } else {
            printPunchesPayrollSheet();
        }
    }

    function exportPunchesPayrollToExcel() {
        if (typeof exportTableToExcel === 'function') {
            exportTableToExcel('punch-payroll-table', 'كشف_رواتب_البصمة');
        }
    }

    // تصدير الواجهات
    window.renderPunchesPayrollScreen = renderPunchesPayrollScreen;
    window.calculateAndRenderPunchesPayroll = calculateAndRenderPunchesPayroll;
    window.setPayrollCalculationMode = setPayrollCalculationMode;
    window.applyPunchDataToOfficialAttendance = applyPunchDataToOfficialAttendance;
    window.viewEmployeePunchesDetail = viewEmployeePunchesDetail;
    window.printPunchesPayrollSheet = printPunchesPayrollSheet;
    window.exportPunchesPayrollToPdf = exportPunchesPayrollToPdf;
    window.exportPunchesPayrollToExcel = exportPunchesPayrollToExcel;
})();
