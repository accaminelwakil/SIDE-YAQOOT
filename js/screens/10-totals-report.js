    // ==================== 5. تقارير إجمالي الموظفين ====================
    function populateTotalsReportCyclesDropdown() {
        const select = document.getElementById('totals-report-cycle-select');
        if (!select) return;
        if (select.options.length > 0) return;

        const now = new Date();
        const curY = now.getFullYear();
        select.innerHTML = '';

        const optAll = document.createElement('option');
        optAll.value = 'all';
        optAll.textContent = '🌟 كافة الفترات المسجلة (إجمالي شامل لكافة الحركات)';
        select.appendChild(optAll);

        const todayStr = now.toISOString().split('T')[0];
        let matchedVal = '';

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
                matchedVal = opt.value;
            }

            select.appendChild(opt);
        }

        if (matchedVal) {
            select.value = matchedVal;
        } else {
            select.selectedIndex = 0;
        }
    }

    function renderTotalsReport() {
        populateTotalsReportCyclesDropdown();
        const cycleSelect = document.getElementById('totals-report-cycle-select');
        let startDate = '';
        let endDate = '';
        if (cycleSelect && cycleSelect.value && cycleSelect.value !== 'all') {
            const parts = cycleSelect.value.split('|');
            startDate = parts[0];
            endDate = parts[1];
        }

        const activeEmps = (employees || []).filter(e => e && e.status !== 'انتهت خدمته');
        const periodRecords = (attendanceRecords || []).filter(r => {
            if (!r) return false;
            if (startDate && r.date < startDate) return false;
            if (endDate && r.date > endDate) return false;
            return true;
        });

        // استخراج وتجميع الأقسام الفريدة
        const deptsSet = new Set();
        activeEmps.forEach(e => {
            if (e.job && e.job.trim()) deptsSet.add(e.job.trim());
        });
        periodRecords.forEach(r => {
            if (r.job && r.job.trim()) deptsSet.add(r.job.trim());
        });
        const deptNames = Array.from(deptsSet).sort((a, b) => a.localeCompare(b, 'ar'));

        const deptData = {};
        deptNames.forEach(d => {
            deptData[d] = {
                empCount: 0,
                totalHours: 0,
                basicHours: 0,
                basicHoursWage: 0,
                ovHours: 0,
                ovWage: 0,
                offDaysCount: 0,
                offDaysWage: 0
            };
        });

        const grand = {
            empCount: activeEmps.length,
            totalHours: 0,
            basicHours: 0,
            basicHoursWage: 0,
            ovHours: 0,
            ovWage: 0,
            offDaysCount: 0,
            offDaysWage: 0
        };

        // حساب عدد الموظفين والراحات الأسبوعية لكل قسم
        activeEmps.forEach(emp => {
            const dName = (emp.job || 'غير محدد').trim();
            if (!deptData[dName]) {
                deptData[dName] = { empCount: 0, totalHours: 0, basicHours: 0, basicHoursWage: 0, ovHours: 0, ovWage: 0, offDaysCount: 0, offDaysWage: 0 };
            }
            deptData[dName].empCount += 1;

            const baseMonthlySalary = Number(emp.basicSalary) || 0;
            const dailyBasicRate = Math.round((baseMonthlySalary / 30.0) * 100) / 100;
            let offDaysCount = 0;
            if (startDate && endDate) {
                offDaysCount = (typeof calculateOffDaysCountBetweenDates === 'function') 
                    ? calculateOffDaysCountBetweenDates(startDate, endDate, emp.offDay, emp) 
                    : 0;
            } else {
                if (periodRecords.length > 0) {
                    const allDates = periodRecords.map(r => r.date).sort();
                    const minD = allDates[0];
                    const maxD = allDates[allDates.length - 1];
                    offDaysCount = (typeof calculateOffDaysCountBetweenDates === 'function')
                        ? calculateOffDaysCountBetweenDates(minD, maxD, emp.offDay, emp)
                        : 0;
                } else {
                    offDaysCount = 0;
                }
            }
            const offDaysWage = Math.round((offDaysCount * dailyBasicRate) * 100) / 100;

            deptData[dName].offDaysCount += offDaysCount;
            deptData[dName].offDaysWage += offDaysWage;
            grand.offDaysCount += offDaysCount;
            grand.offDaysWage += offDaysWage;
        });

        // حساب الساعات والإضافي لكل قسم من سجلات الحضور
        periodRecords.forEach(r => {
            const dName = (r.job || 'غير محدد').trim();
            if (!deptData[dName]) {
                deptData[dName] = { empCount: 0, totalHours: 0, basicHours: 0, basicHoursWage: 0, ovHours: 0, ovWage: 0, offDaysCount: 0, offDaysWage: 0 };
            }

            const emp = employees.find(e => e.id === r.empId);
            const basicSal = emp ? Number(emp.basicSalary) || 0 : (r.rate ? r.rate * 240 : 0);
            const shiftH = emp ? (emp.shiftHours || 8) : 8;
            const rates = computeRates(basicSal, shiftH);

            const h = Number(r.hours) || 0;
            const b = Number(r.basicHours) || (h > 0 ? Math.min(h, shiftH) : 0);
            const o1 = Number(r.ov1) || 0;
            const o2 = Number(r.ov2) || 0;
            const om = Number(r.ovMore) || 0;
            const ovH = o1 + o2 + om;

            const bWage = Math.round((b * (rates.hourlyRate || 0)) * 100) / 100;
            const ovWage = Math.round(((o1 * (rates.ov1 || 0)) + (o2 * (rates.ov2 || 0)) + (om * (rates.ovMore || 0))) * 100) / 100;

            deptData[dName].totalHours += h;
            deptData[dName].basicHours += b;
            deptData[dName].basicHoursWage += bWage;
            deptData[dName].ovHours += ovH;
            deptData[dName].ovWage += ovWage;

            grand.totalHours += h;
            grand.basicHours += b;
            grand.basicHoursWage += bWage;
            grand.ovHours += ovH;
            grand.ovWage += ovWage;
        });

        // تحديث كروت المؤشرات
        const totalCostSum = grand.basicHoursWage + grand.ovWage + grand.offDaysWage;
        const repTotSal = document.getElementById('rep-tot-sal');
        const repTotHrs = document.getElementById('rep-tot-hrs');
        const repTotOps = document.getElementById('rep-tot-ops');
        if (repTotSal) repTotSal.innerText = `${totalCostSum.toLocaleString('ar-EG', {minimumFractionDigits: 2})} ج.م`;
        if (repTotHrs) repTotHrs.innerText = `${grand.totalHours.toFixed(2)} ساعة`;
        if (repTotOps) repTotOps.innerText = `${periodRecords.length} حركة`;

        // بناء جدول تقارير إجمالي الموظفين (الأقسام كأعمدة وتحت كل قسم عامودين: قيمة ونسبة)
        const thead = document.getElementById('dept-summary-thead');
        const tbody = document.getElementById('dept-summary-tbody');
        if (!thead || !tbody) return;

        let headerRow1 = `<tr>
            <th rowspan="2" style="position:sticky; right:0; z-index:5; background:#ede9fe; border:1.5px solid #c4b5fd; min-width:210px; text-align:right; vertical-align:middle; font-size:13px; color:#5b21b6;">البيان / المؤشر</th>
        `;
        deptNames.forEach(d => {
            headerRow1 += `<th colspan="2" style="text-align:center; border:1.5px solid #e2e8f0; background:#f5f3ff; color:#4338ca; font-weight:800; font-size:13px; min-width:140px;">${d}</th>`;
        });
        headerRow1 += `<th colspan="2" style="text-align:center; border:1.5px solid #bfdbfe; background:#eff6ff; color:#2563eb; font-weight:900; font-size:13px; min-width:160px;">الإجمالي العام</th></tr>`;

        let headerRow2 = `<tr>`;
        deptNames.forEach(() => {
            headerRow2 += `
                <th style="text-align:center; border:1.5px solid var(--border); font-size:11.5px; background:#ffffff; color:#1e1b4b; font-weight:bold; width:75px;">قيمة</th>
                <th style="text-align:center; border:1.5px solid var(--border); font-size:11.5px; background:#ffffff; color:#7c3aed; font-weight:bold; width:65px;">نسبة</th>
            `;
        });
        headerRow2 += `
            <th style="text-align:center; border:1.5px solid var(--border); font-size:11.5px; background:#eff6ff; color:#2563eb; font-weight:bold; width:85px;">قيمة</th>
            <th style="text-align:center; border:1.5px solid var(--border); font-size:11.5px; background:#eff6ff; color:#2563eb; font-weight:bold; width:70px;">نسبة</th>
        </tr>`;

        thead.innerHTML = headerRow1 + headerRow2;

        const metrics = [
            {
                name: 'عدد الموظفين',
                formatVal: d => `${d.empCount} موظف`,
                formatPct: d => grand.empCount > 0 ? ((d.empCount / grand.empCount) * 100).toFixed(1) + '%' : '0%',
                grandVal: `${grand.empCount} موظف`,
                grandPct: '100%'
            },
            {
                name: 'اجمالى عدد الساعات',
                formatVal: d => `${d.totalHours.toFixed(2)} س`,
                formatPct: d => grand.totalHours > 0 ? ((d.totalHours / grand.totalHours) * 100).toFixed(1) + '%' : '0%',
                grandVal: `${grand.totalHours.toFixed(2)} س`,
                grandPct: '100%'
            },
            {
                name: 'عدد ساعات الحضور الاساسى',
                formatVal: d => `${d.basicHours.toFixed(2)} س`,
                formatPct: d => grand.basicHours > 0 ? ((d.basicHours / grand.basicHours) * 100).toFixed(1) + '%' : '0%',
                grandVal: `${grand.basicHours.toFixed(2)} س`,
                grandPct: '100%'
            },
            {
                name: 'قيمة ساعات الحضور الاساسى',
                formatVal: d => `${d.basicHoursWage.toLocaleString('ar-EG', {minimumFractionDigits: 2})} ج.م`,
                formatPct: d => grand.basicHoursWage > 0 ? ((d.basicHoursWage / grand.basicHoursWage) * 100).toFixed(1) + '%' : '0%',
                grandVal: `${grand.basicHoursWage.toLocaleString('ar-EG', {minimumFractionDigits: 2})} ج.م`,
                grandPct: '100%'
            },
            {
                name: 'عدد ساعات الاضافى',
                formatVal: d => `${d.ovHours.toFixed(2)} س`,
                formatPct: d => grand.ovHours > 0 ? ((d.ovHours / grand.ovHours) * 100).toFixed(1) + '%' : '0%',
                grandVal: `${grand.ovHours.toFixed(2)} س`,
                grandPct: '100%'
            },
            {
                name: 'قيمة اجمالى الاضافى',
                formatVal: d => `${d.ovWage.toLocaleString('ar-EG', {minimumFractionDigits: 2})} ج.م`,
                formatPct: d => grand.ovWage > 0 ? ((d.ovWage / grand.ovWage) * 100).toFixed(1) + '%' : '0%',
                grandVal: `${grand.ovWage.toLocaleString('ar-EG', {minimumFractionDigits: 2})} ج.م`,
                grandPct: '100%'
            },
            {
                name: 'عدد ايام الراحات الاسبوعية',
                formatVal: d => `${d.offDaysCount} يوم`,
                formatPct: d => grand.offDaysCount > 0 ? ((d.offDaysCount / grand.offDaysCount) * 100).toFixed(1) + '%' : '0%',
                grandVal: `${grand.offDaysCount} يوم`,
                grandPct: '100%'
            },
            {
                name: 'قيمة ايام الراحات الاسبوعية',
                formatVal: d => `${d.offDaysWage.toLocaleString('ar-EG', {minimumFractionDigits: 2})} ج.م`,
                formatPct: d => grand.offDaysWage > 0 ? ((d.offDaysWage / grand.offDaysWage) * 100).toFixed(1) + '%' : '0%',
                grandVal: `${grand.offDaysWage.toLocaleString('ar-EG', {minimumFractionDigits: 2})} ج.م`,
                grandPct: '100%'
            }
        ];

        let tbodyHtml = '';
        metrics.forEach((m, idx) => {
            const isAlternate = idx % 2 === 1;
            const rowBg = isAlternate ? 'background:rgba(255,255,255,0.02);' : '';
            tbodyHtml += `<tr style="${rowBg}">`;
            tbodyHtml += `<td style="position:sticky; right:0; z-index:3; background:#ffffff; border:1px solid #e2e8f0; text-align:right; font-weight:800; font-size:12.5px; color:#1e1b4b;"><span style="color:var(--accent); margin-left:6px;">•</span> ${m.name}</td>`;

            deptNames.forEach(d => {
                const data = deptData[d];
                tbodyHtml += `
                    <td style="text-align:center; border:1px solid var(--border); font-size:12px; font-weight:600; color:var(--text-main);">${m.formatVal(data)}</td>
                    <td style="text-align:center; border:1px solid var(--border); font-size:11.5px;"><span class="badge" style="background:rgba(56, 189, 248, 0.12); color:var(--accent); font-weight:bold;">${m.formatPct(data)}</span></td>
                `;
            });

            tbodyHtml += `
                <td style="text-align:center; border:1.5px solid var(--border); font-size:12.5px; font-weight:900; background:rgba(56, 189, 248, 0.08); color:var(--accent);">${m.grandVal}</td>
                <td style="text-align:center; border:1.5px solid var(--border); font-size:12px; font-weight:900; background:rgba(56, 189, 248, 0.08); color:var(--accent);"><span class="badge" style="background:var(--accent); color:#0b132b; font-weight:900;">${m.grandPct}</span></td>
            </tr>`;
        });

        tbody.innerHTML = tbodyHtml;
    }

    // ==================== طباعة وتصدير تقرير إجمالي الموظفين في شكل جدول أبيض وأسود مطابق تماماً ====================
    function getTotalsReportPrintHtml() {
        const cycleSelect = document.getElementById('totals-report-cycle-select');
        const cycleText = cycleSelect && cycleSelect.options[cycleSelect.selectedIndex] ? cycleSelect.options[cycleSelect.selectedIndex].text : 'كافة الفترات';

        const repTotSal = document.getElementById('rep-tot-sal')?.innerText || '0.00 ج.م';
        const repTotHrs = document.getElementById('rep-tot-hrs')?.innerText || '0.00 ساعة';
        const repTotOps = document.getElementById('rep-tot-ops')?.innerText || '0 حركة';

        const thead = document.getElementById('dept-summary-thead');
        const tbody = document.getElementById('dept-summary-tbody');
        if (!thead || !tbody) {
            showToast('لا توجد بيانات متاحة للطباعة حالياً!', 'warning');
            return '';
        }

        // استنساخ الرأس والجسم وتحويلهما لجدول أبيض وأسود نظيف وبحدود سوداء واضحة
        const theadClone = thead.cloneNode(true);
        const tbodyClone = tbody.cloneNode(true);

        [theadClone, tbodyClone].forEach(root => {
            root.querySelectorAll('*').forEach(el => {
                el.removeAttribute('style');
                el.style.color = '#000000';
                el.style.borderColor = '#000000';
                if (el.tagName === 'TH') {
                    el.style.backgroundColor = '#f1f5f9';
                    el.style.fontWeight = 'bold';
                    el.style.border = '1px solid #000000';
                    el.style.padding = '5px 3px';
                    el.style.fontSize = '10px';
                } else if (el.tagName === 'TD') {
                    el.style.backgroundColor = '#ffffff';
                    el.style.border = '1px solid #000000';
                    el.style.padding = '4px 3px';
                    el.style.fontSize = '9.5px';
                }
                if (el.classList.contains('badge')) {
                    el.style.background = 'transparent';
                    el.style.border = 'none';
                    el.style.fontWeight = 'bold';
                }
            });
        });

        return `
            <!DOCTYPE html>
            <html lang="ar" dir="rtl">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <title>تقرير إجمالي الموظفين والأقسام - عيادات سيدى ياقوت التخصصية</title>
                <style>
                    @page { size: A4 landscape; margin: 8mm; }
                    body {
                        font-family: Tahoma, 'Segoe UI', Arial, sans-serif;
                        direction: rtl;
                        color: #000000;
                        background: #ffffff;
                        margin: 0;
                        padding: 6px;
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }
                    .print-header {
                        text-align: center;
                        border-bottom: 2px solid #000000;
                        padding-bottom: 6px;
                        margin-bottom: 10px;
                    }
                    .print-header h2 { margin: 0 0 3px 0; font-size: 17px; color: #000000; }
                    .print-header p { margin: 0; font-size: 11.5px; color: #222222; }
                    .kpi-row {
                        display: flex;
                        justify-content: space-around;
                        margin-bottom: 10px;
                        gap: 8px;
                    }
                    .kpi-box {
                        flex: 1;
                        border: 1.5px solid #000000;
                        padding: 5px 8px;
                        text-align: center;
                        border-radius: 4px;
                        background: #ffffff;
                    }
                    .kpi-box div:first-child { font-size: 10.5px; font-weight: bold; margin-bottom: 2px; }
                    .kpi-box div:last-child { font-size: 12.5px; font-weight: 900; }
                    table {
                        width: 100%;
                        border-collapse: collapse;
                        font-size: 9.5px;
                        text-align: center;
                        margin-top: 4px;
                    }
                    th, td {
                        border: 1px solid #000000 !important;
                        padding: 4px 3px !important;
                        color: #000000 !important;
                        background-color: #ffffff;
                    }
                    th {
                        background-color: #f1f5f9 !important;
                        font-weight: bold !important;
                    }
                    .footer {
                        margin-top: 18px;
                        display: flex;
                        justify-content: space-between;
                        font-size: 10.5px;
                        font-weight: bold;
                        border-top: 1px dashed #000000;
                        padding-top: 8px;
                    }
                </style>
            </head>
            <body>
                ${typeof getClinicReportHeaderHtml === 'function' ? getClinicReportHeaderHtml('تقرير إجمالي الموظفين والأقسام (الساعات - التكلفة - الإضافي)', `الدورة: ${cycleText}`) : `
                <div class="print-header" style="text-align:center; border-bottom:2px solid #990012; padding-bottom:8px; margin-bottom:12px;">
                    <h2 style="margin:0; color:#102a45;">عيادات سيدى ياقوت التخصصية</h2>
                    <p style="margin:4px 0 0 0; font-size:12px; color:#475569;">📊 تقرير إجمالي الموظفين والأقسام (الساعات - التكلفة - الإضافي - الراحات)</p>
                    <p style="font-size: 11px; margin-top: 2px;"><strong>${cycleText}</strong> | تاريخ الطباعة: ${new Date().toLocaleDateString('ar-EG')}</p>
                </div>`}
                <div class="kpi-row">
                    <div class="kpi-box">
                        <div>إجمالي تكلفة ساعات المؤسسة</div>
                        <div>${repTotSal}</div>
                    </div>
                    <div class="kpi-box">
                        <div>إجمالي الساعات المشغولة</div>
                        <div>${repTotHrs}</div>
                    </div>
                    <div class="kpi-box">
                        <div>إجمالي حركات الحضور</div>
                        <div>${repTotOps}</div>
                    </div>
                </div>
                <table>
                    <thead>
                        ${theadClone.innerHTML}
                    </thead>
                    <tbody>
                        ${tbodyClone.innerHTML}
                    </tbody>
                </table>
                <div class="footer">
                    <div>إعداد / المسؤول المالي: .................................</div>
                    <div>المراجعة والتدقيق: .................................</div>
                    <div>اعتماد الإدارة: .................................</div>
                </div>
            </body>
            </html>
        `;
    }

    function printTotalsReport() {
        const html = getTotalsReportPrintHtml();
        if (!html) return;
        const printWindow = window.open('', '_blank');
        if (!printWindow) {
            alert('يرجى السماح بالنوافذ المنبثقة لطباعة التقرير!');
            return;
        }
        printWindow.document.write(html + '<script>window.onload = function() { window.print(); };<\/script>');
        printWindow.document.close();
    }

    function exportTotalsReportToPdf() {
        const html = getTotalsReportPrintHtml();
        if (!html) return;
        const cycleSelect = document.getElementById('totals-report-cycle-select');
        const cycleText = cycleSelect && cycleSelect.options[cycleSelect.selectedIndex] ? cycleSelect.options[cycleSelect.selectedIndex].text : 'كافة_الفترات';
        const filename = `تقرير_إجمالي_الموظفين_والأقسام_${cycleText.replace(/\s+/g, '_')}.pdf`;
        downloadPrintHtmlAsPdf(html, filename, 'landscape');
    }

