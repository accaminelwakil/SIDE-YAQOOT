// ==================== 13. شاشة سركي الموظف (الاطلاع الذاتي) ====================
// هذه الشاشة مخصصة لحسابات الموظفين؛ تعرض للموظف سركي الراتب الخاص به فقط مع تفاصيل الحضور وساعات العمل والراتب الصافي

function populateEmployeeSelfSarkiDropdowns() {
    const cycleSelect = document.getElementById('emp-sarki-cycle-select');
    if (!cycleSelect) return;

    const now = new Date();
    const curY = now.getFullYear();
    cycleSelect.innerHTML = '<option value="">-- اختر دورة الراتب (25 إلى 24) --</option>';

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
        } else if (!cycleSelect.value && m === (now.getMonth() + 1)) {
            opt.selected = true;
        }

        cycleSelect.appendChild(opt);
    }

    generateEmployeeSelfSarki();
}

function generateEmployeeSelfSarki() {
    const wrapper = document.getElementById('emp-sarki-sheet-wrapper');
    const unlinkedWarn = document.getElementById('emp-sarki-unlinked-warning');
    const tbody = document.getElementById('emp-sarki-tbody');
    const tfoot = document.getElementById('emp-sarki-tfoot');
    const empty = document.getElementById('emp-sarki-empty');
    const cycleSelect = document.getElementById('emp-sarki-cycle-select');

    if (!currentUser || currentUser.role !== 'employee' || !currentUser.empId) {
        // إذا كان الحساب غير مرتبط بموظف
        if (wrapper) wrapper.style.display = 'none';
        if (unlinkedWarn) unlinkedWarn.style.display = 'block';
        return;
    }

    if (unlinkedWarn) unlinkedWarn.style.display = 'none';
    if (wrapper) wrapper.style.display = 'block';

    const empId = parseInt(currentUser.empId);
    const emp = employees.find(e => e.id === empId);

    if (!emp) {
        if (wrapper) wrapper.style.display = 'none';
        if (unlinkedWarn) {
            unlinkedWarn.innerHTML = '⚠️ لم يتم العثور على بيانات الموظف المرتبط بهذا الحساب (الكود: #' + empId + '). يرجى مراجعة إدارة النظام.';
            unlinkedWarn.style.display = 'block';
        }
        return;
    }

    // تعبئة كروت تعريف الموظف الثابتة
    const fixedName = document.getElementById('emp-sarki-fixed-name');
    const fixedCode = document.getElementById('emp-sarki-fixed-code');
    const fixedDept = document.getElementById('emp-sarki-fixed-dept');
    const fixedShift = document.getElementById('emp-sarki-fixed-shift');

    if (fixedName) fixedName.textContent = emp.name;
    if (fixedCode) fixedCode.textContent = emp.code || ('#' + emp.id);
    if (fixedDept) fixedDept.textContent = emp.job || '-';
    if (fixedShift) fixedShift.textContent = (emp.shiftHours || 8) + ' ساعات';

    // تعبئة بطاقة الشيت العلوية
    const boxBasic = document.getElementById('emp-sarki-box-basic');
    const boxCode = document.getElementById('emp-sarki-box-code');
    const boxDept = document.getElementById('emp-sarki-box-dept');
    const boxName = document.getElementById('emp-sarki-box-name');
    const cyclePrint = document.getElementById('emp-sarki-cycle-print-text');
    const dateBadge = document.getElementById('emp-sarki-print-date-badge');

    const baseSalary = Number(emp.basicSalary) || 0;
    if (boxBasic) boxBasic.textContent = baseSalary.toLocaleString('ar-EG', {minimumFractionDigits: 2});
    if (boxCode) boxCode.textContent = emp.code || ('#' + emp.id);
    if (boxDept) boxDept.textContent = emp.job || '-';
    if (boxName) boxName.textContent = emp.name;

    if (cycleSelect && cyclePrint) {
        cyclePrint.textContent = cycleSelect.options[cycleSelect.selectedIndex] ? cycleSelect.options[cycleSelect.selectedIndex].text : '-';
    }
    if (dateBadge) {
        dateBadge.textContent = 'تاريخ الاستخراج: ' + new Date().toLocaleDateString('ar-EG');
    }

    if (!cycleSelect || !cycleSelect.value) {
        if (empty) empty.style.display = 'block';
        if (tbody) tbody.innerHTML = '';
        if (tfoot) tfoot.innerHTML = '';
        return;
    }

    const [fromDate, toDate] = cycleSelect.value.split('|');
    const cycleKey = `${fromDate}_${toDate}`;

    if (typeof window.ensurePayrollCycleInputs !== 'function' ||
        typeof window.payrollCycleInputsReady !== 'function') {
        if (tbody) {
            tbody.replaceChildren();
            const row = tbody.insertRow();
            const cell = row.insertCell();
            cell.colSpan = 7;
            cell.textContent = 'تعذر تحميل خدمة الحضور وأقساط السلف.';
        }
        if (typeof showToast === 'function') showToast('خدمة بيانات الراتب غير متاحة. أعد تحميل التطبيق.', 'error');
        return;
    }
    if (!window.payrollCycleInputsReady(fromDate, toDate)) {
        if (tbody) {
            tbody.replaceChildren();
            const row = tbody.insertRow();
            const cell = row.insertCell();
            cell.colSpan = 7;
            cell.textContent = 'جارٍ تحميل الحضور المعتمد وأقساط السلف...';
        }
        window.ensurePayrollCycleInputs(fromDate, toDate)
            .then(() => {
                if (cycleSelect.value === `${fromDate}|${toDate}`) generateEmployeeSelfSarki();
            })
            .catch(error => {
                if (cycleSelect.value !== `${fromDate}|${toDate}`) return;
                if (tbody) {
                    tbody.replaceChildren();
                    const row = tbody.insertRow();
                    const cell = row.insertCell();
                    cell.colSpan = 7;
                    cell.textContent = error.message || 'تعذر تحميل بيانات الراتب.';
                }
                if (typeof showToast === 'function') showToast(error.message, 'error');
            });
        return;
    }

    window.activePayrollCycleKey = cycleKey;
    if (typeof calculateEmployeeBiometricAttendance !== 'function') {
        if (typeof showToast === 'function') showToast('محرك احتساب الحضور بالبصمة غير متاح.', 'error');
        return;
    }
    const biometricData = calculateEmployeeBiometricAttendance(emp, fromDate, toDate);
    const empRecords = biometricData.dailyRecords || [];

    if (tbody) tbody.innerHTML = '';
    if (tfoot) tfoot.innerHTML = '';

    const countLabel = document.getElementById('emp-sarki-shifts-count-label');
    if (empRecords.length === 0) {
        if (empty) empty.style.display = 'block';
        if (countLabel) countLabel.textContent = 'عدد الشيفتات: 0';
    } else {
        if (empty) empty.style.display = 'none';
        if (countLabel) countLabel.textContent = `عدد الشيفتات: ${empRecords.length}`;
    }

    const rates = computeRates(emp.basicSalary, emp.shiftHours);

    let totHours = 0;
    let totBasicHours = 0;
    let totOv1Hours = 0;
    let totOv2Hours = 0;
    let totOvMoreHours = 0;
    let workedHolidaysCount = 0;

    empRecords.forEach(r => {
        const h = Number(r.hours) || 0;
        const b = Number(r.basicHours) || 0;
        const o1 = Number(r.ov1) || 0;
        const o2 = Number(r.ov2) || 0;
        const om = Number(r.ovMore) || 0;
        const totOv = o1 + o2 + om;

        totHours += h;
        totBasicHours += b;
        totOv1Hours += o1;
        totOv2Hours += o2;
        totOvMoreHours += om;

        const isHol = r.isHoliday || (typeof officialHolidaysDb !== 'undefined' && officialHolidaysDb.includes(r.date));
        if (isHol && (h > 0 || r.timeIn)) workedHolidaysCount++;

        if (tbody) {
            const tr = document.createElement('tr');
            tr.style.background = '#ffffff';
            tr.innerHTML = `
                <td style="border:1.5px solid #000; padding:5px 6px; font-weight:bold; background:#ffffff; color:#000000;">${r.date}</td>
                <td style="border:1.5px solid #000; padding:5px; font-family:Consolas, monospace; font-weight:bold; background:#ffffff; color:#000000;">${r.timeIn || '-'}</td>
                <td style="border:1.5px solid #000; padding:5px; font-family:Consolas, monospace; font-weight:bold; background:#ffffff; color:#000000;">${r.timeOut || '-'}</td>
                <td style="border:1.5px solid #000; padding:5px; font-weight:bold; font-family:Consolas, monospace; background:#ffffff; color:#000000;">${h.toFixed(2)} س</td>
                <td style="border:1.5px solid #000; padding:5px; font-weight:bold; font-family:Consolas, monospace; background:#ffffff; color:#000000;">${b.toFixed(2)}</td>
                <td style="border:1.5px solid #000; padding:5px; font-weight:bold; font-family:Consolas, monospace; background:#ffffff; color:#000000;">${totOv.toFixed(2)}</td>
                <td style="border:1.5px solid #000; padding:5px; font-weight:bold; background:#ffffff; color:${isHol ? '#b91c1c' : '#000000'};">${isHol ? '🎉 إجازة رسمية' : '-'}</td>
            `;
            tbody.appendChild(tr);
        }
    });

    if (empRecords.length > 0 && tfoot) {
        tfoot.innerHTML = `
            <tr style="background:#ffffff; color:#000000; font-weight:900;">
                <td style="border:1.5px solid #000; padding:6px; text-align:right; background:#ffffff; color:#000000;" colspan="3">الإجمالي العام</td>
                <td style="border:1.5px solid #000; padding:6px; font-family:Consolas, monospace; background:#ffffff; color:#000000;">${totHours.toFixed(2)} س</td>
                <td style="border:1.5px solid #000; padding:6px; font-family:Consolas, monospace; background:#ffffff; color:#000000;">${totBasicHours.toFixed(2)} س</td>
                <td style="border:1.5px solid #000; padding:6px; font-family:Consolas, monospace; background:#ffffff; color:#000000;">${(totOv1Hours + totOv2Hours + totOvMoreHours).toFixed(2)} س</td>
                <td style="border:1.5px solid #000; padding:6px; background:#ffffff; color:#000000;">${workedHolidaysCount > 0 ? (workedHolidaysCount + ' يوم') : '-'}</td>
            </tr>
        `;
    }

    // 1. جدول الراتب الأساسي
    const basicWage = Math.round((totBasicHours * rates.hourlyRate) * 100) / 100;
    const dailyBasicRate = Math.round((emp.basicSalary / 30.0) * 100) / 100;
    const offDaysCount = typeof calculateOffDaysCountBetweenDates === 'function' ? calculateOffDaysCountBetweenDates(fromDate, toDate, emp.offDay, emp) : 0;
    const offDaysWage = Math.round((offDaysCount * dailyBasicRate) * 100) / 100;

    const ov1Wage = Math.round((totOv1Hours * rates.ov1) * 100) / 100;
    const ov2Wage = Math.round((totOv2Hours * rates.ov2) * 100) / 100;
    const ovMoreWage = Math.round((totOvMoreHours * rates.ovMore) * 100) / 100;
    const holidayAllowance = Math.round((workedHolidaysCount * dailyBasicRate) * 100) / 100;

    const basicGroupTotal = Math.round((basicWage + offDaysWage + ov1Wage + ov2Wage + ovMoreWage + holidayAllowance) * 100) / 100;

    // تعبئة بنود جدول الراتب الأساسي
    const setTxt = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setTxt('emp-sarki-rate-val', rates.hourlyRate.toFixed(2));
    setTxt('emp-sarki-basic-hrs', totBasicHours.toFixed(2));
    setTxt('emp-sarki-basic-wage', basicWage.toFixed(2));

    setTxt('emp-sarki-daily-rate', dailyBasicRate.toFixed(2));
    setTxt('emp-sarki-off-days', offDaysCount);
    setTxt('emp-sarki-off-wage', offDaysWage.toFixed(2));

    setTxt('emp-sarki-ov1-rate', rates.ov1.toFixed(2));
    setTxt('emp-sarki-ov1-hrs', totOv1Hours.toFixed(2));
    setTxt('emp-sarki-ov1-wage', ov1Wage.toFixed(2));

    setTxt('emp-sarki-ov2-rate', rates.ov2.toFixed(2));
    setTxt('emp-sarki-ov2-hrs', totOv2Hours.toFixed(2));
    setTxt('emp-sarki-ov2-wage', ov2Wage.toFixed(2));

    setTxt('emp-sarki-ovmore-rate', rates.ovMore.toFixed(2));
    setTxt('emp-sarki-ovmore-hrs', totOvMoreHours.toFixed(2));
    setTxt('emp-sarki-ovmore-wage', ovMoreWage.toFixed(2));

    setTxt('emp-sarki-hol-rate', dailyBasicRate.toFixed(2));
    setTxt('emp-sarki-hol-days', workedHolidaysCount);
    setTxt('emp-sarki-hol-wage', holidayAllowance.toFixed(2));

    setTxt('emp-sarki-tot-basic-group', basicGroupTotal.toLocaleString('ar-EG', {minimumFractionDigits: 2}) + ' ج.م');

    // 2. جدول الإضافات (من شاشة التسويات)
    const adj = typeof getEmployeeAdjustmentRecord === 'function' ? getEmployeeAdjustmentRecord(cycleKey, emp.id) : {};
    const visitsVal = Number(adj.visits) || 0;
    const cashbackVal = Number(adj.cashback) || 0;
    const rewardsVal = Number(adj.rewards) || 0;
    const adminVal = Number(adj.adminAllowance) || 0;
    const bonusVal = Number(adj.bonus) || 0;

    setTxt('emp-sarki-adj-visits', visitsVal.toFixed(2));
    setTxt('emp-sarki-adj-cashback', cashbackVal.toFixed(2));
    setTxt('emp-sarki-adj-rewards', rewardsVal.toFixed(2));
    setTxt('emp-sarki-adj-admin', adminVal.toFixed(2));
    setTxt('emp-sarki-adj-bonus', bonusVal.toFixed(2));

    const totalAdditions = Math.round((visitsVal + cashbackVal + rewardsVal + adminVal + bonusVal) * 100) / 100;
    setTxt('emp-sarki-tot-additions', totalAdditions.toLocaleString('ar-EG', {minimumFractionDigits: 2}) + ' ج.م');

    // 3. جدول الاستقطاعات (من شاشة التسويات)
    const legacyAdvance = Number(adj.advances) || 0;
    const loanInstallment = typeof window.getPayrollLoanInstallment === 'function'
        ? window.getPayrollLoanInstallment(emp.id, cycleKey)
        : 0;
    const advVal = Math.round((legacyAdvance + loanInstallment) * 100) / 100;
    const insVal = Number(adj.insurance) || 0;
    const penVal = Number(adj.penalties) || 0;
    const supVal = Number(adj.supplies) || 0;
    const otherVal = Number(adj.otherDeductions) || 0;

    setTxt('emp-sarki-ded-advances', advVal.toFixed(2));
    setTxt('emp-sarki-ded-insurance', insVal.toFixed(2));
    setTxt('emp-sarki-ded-penalties', penVal.toFixed(2));
    setTxt('emp-sarki-ded-supplies', supVal.toFixed(2));
    setTxt('emp-sarki-ded-other', otherVal.toFixed(2));

    const totalDeductions = Math.round((advVal + insVal + penVal + supVal + otherVal) * 100) / 100;
    setTxt('emp-sarki-tot-deductions', totalDeductions.toLocaleString('ar-EG', {minimumFractionDigits: 2}) + ' ج.م');

    // 4. الراتب المستحق (الصافي)
    const finalNet = Math.round(((basicGroupTotal + totalAdditions) - totalDeductions) * 100) / 100;
    const boxNet = document.getElementById('emp-sarki-box-net');
    if (boxNet) boxNet.textContent = finalNet.toLocaleString('ar-EG', {minimumFractionDigits: 2}) + ' ج.م';
    if (typeof autoScaleAllA4Sheets === 'function') {
        setTimeout(autoScaleAllA4Sheets, 50);
    }
}

function getEmployeeSelfSarkiPrintHtml() {
    const wrapper = document.getElementById('emp-sarki-sheet-wrapper');
    if (!wrapper) return null;

    const clone = wrapper.cloneNode(true);
    clone.querySelectorAll('.sarki-no-print, button').forEach(el => el.remove());
    clone.querySelectorAll('.sarki-select-input').forEach(el => el.remove());
    clone.querySelectorAll('.sarki-print-only').forEach(el => el.style.display = 'inline');
    clone.querySelectorAll('.table-wrap').forEach(el => {
        el.style.maxHeight = 'none';
        el.style.overflow = 'visible';
        el.style.backgroundColor = '#ffffff';
    });

    return `
        <!DOCTYPE html>
        <html lang="ar" dir="rtl">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <title>سركي وبيان راتب موظف - عيادات سيدى ياقوت التخصصية</title>
            <style>
                @page { size: A4 portrait; margin: 6mm 5mm; }
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
                #emp-sarki-sheet-wrapper {
                    border: 1.5px solid #000000 !important;
                    padding: 6px 8px !important;
                    margin: 0 auto !important;
                    box-shadow: none !important;
                    width: 100% !important;
                    box-sizing: border-box !important;
                    background: #ffffff !important;
                }
                table {
                    width: 100% !important;
                    border-collapse: collapse !important;
                    font-size: 9.5px !important;
                    text-align: center !important;
                }
                th, td {
                    border: 1.2px solid #000000 !important;
                    padding: 2.5px 3.5px !important;
                    background-color: #ffffff !important;
                    color: #000000 !important;
                }
                .sarki-tables-row {
                    display: flex !important;
                    flex-direction: row !important;
                    gap: 4px !important;
                    width: 100% !important;
                }
                .sarki-col-basic {
                    flex: 46 1 0 !important;
                    min-width: 0 !important;
                    max-width: 48% !important;
                }
                .sarki-col-additions,
                .sarki-col-deductions {
                    flex: 27 1 0 !important;
                    min-width: 0 !important;
                    max-width: 28% !important;
                }
            </style>
        </head>
        <body>
            ${clone.outerHTML}
        </body>
        </html>
    `;
}

function printEmployeeSelfSarki() {
    const html = getEmployeeSelfSarkiPrintHtml();
    if (!html) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
        alert('يرجى السماح بالنوافذ المنبثقة لطباعة السركي!');
        return;
    }
    const finalHtml = html + '<script>window.onload = function() { window.print(); };<\/script>';
    printWindow.document.write(finalHtml);
    printWindow.document.close();
}

function exportEmployeeSelfSarkiToPdf() {
    const wrapper = document.getElementById('emp-sarki-sheet-wrapper');
    if (!wrapper) return;
    const empName = (currentUser && currentUser.fullName) ? currentUser.fullName : 'موظف';
    const cycleSelect = document.getElementById('emp-sarki-cycle-select');
    const cycleVal = cycleSelect ? cycleSelect.value : 'فترة';
    const filename = `سركي_راتب_${empName}_${cycleVal}.pdf`;

    const html = getEmployeeSelfSarkiPrintHtml();
    if (!html) return;
    if (typeof downloadPrintHtmlAsPdf === 'function') {
        downloadPrintHtmlAsPdf(html, filename, 'portrait');
    } else {
        showToast('مكتبة تصدير PDF غير متاحة على هذا الجهاز.', 'danger');
    }
}
