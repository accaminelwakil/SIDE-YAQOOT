// ==================== 3. سركي موظف ====================
    function populateSarkiCyclesDropdown() {
        const select = document.getElementById('sarki-cycle-select');
        if (!select) return;

        const now = new Date();
        const curY = now.getFullYear();
        select.innerHTML = '<option value="">-- اختر دورة الراتب (25 إلى 24) --</option>';

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

        onSarkiCycleSelectChanged();
    }

    function onSarkiCycleSelectChanged() {
        const select = document.getElementById('sarki-cycle-select');
        if (!select || !select.value) return;

        const [startVal, endVal] = select.value.split('|');
        const startInput = document.getElementById('sarki-from');
        const endInput = document.getElementById('sarki-to');

        if (startInput) startInput.value = startVal;
        if (endInput) endInput.value = endVal;

        generateSingleSarki();
    }

    function generateSingleSarki() {
        const empId = parseInt(document.getElementById('sarki-emp-select').value);
        const cycleSelect = document.getElementById('sarki-cycle-select');
        const tbody = document.getElementById('sarki-tbody');
        const tfoot = document.getElementById('sarki-tfoot');
        const empty = document.getElementById('sarki-empty');

        if (!empId || !cycleSelect || !cycleSelect.value) {
            if (empty) empty.style.display = 'block';
            if (tbody) tbody.innerHTML = '';
            if (tfoot) tfoot.innerHTML = '';
            return;
        }

        const [fromDate, toDate] = cycleSelect.value.split('|');
        const cycleKey = `${fromDate}_${toDate}`;
        const emp = employees.find(e => e.id === empId);
        if (!emp) return;

        // الراتب الأساسي يجلب حصرياً من شاشة التكويد
        const baseMonthlySalary = Number(emp.basicSalary) || 0;
        document.getElementById('sarki-box-basic').textContent = baseMonthlySalary.toLocaleString('ar-EG', {minimumFractionDigits: 2});

        // بيانات الموظف الأساسية
        const nameEl = document.getElementById('sarki-box-name');
        if (nameEl) nameEl.textContent = emp.name;
        document.getElementById('sarki-box-code').textContent = emp.code || ('#' + emp.id);
        document.getElementById('sarki-box-dept').textContent = emp.job || '-';

        syncSarkiPrintSpans();

        // تصفية حركات الحضور والانصراف للفترة المحددة
        const empRecords = attendanceRecords.filter(r => {
            if (r.empId !== empId) return false;
            if (fromDate && r.date < fromDate) return false;
            if (toDate && r.date > toDate) return false;
            return true;
        });

        tbody.innerHTML = '';
        if (tfoot) tfoot.innerHTML = '';

        if (empRecords.length === 0) {
            if (empty) empty.style.display = 'block';
            document.getElementById('sarki-shifts-count-label').textContent = 'عدد الشيفتات: 0';
        } else {
            if (empty) empty.style.display = 'none';
            document.getElementById('sarki-shifts-count-label').textContent = `عدد الشيفتات: ${empRecords.length}`;
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

            const isHol = r.isHoliday || officialHolidaysDb.includes(r.date);
            if (isHol && (h > 0 || r.timeIn)) workedHolidaysCount++;

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

        // ==================== 1. جدول الراتب الأساسي (مطابق للإكسيل) ====================
        const basicWage = Math.round((totBasicHours * rates.hourlyRate) * 100) / 100;
        const dailyBasicRate = Math.round((emp.basicSalary / 30.0) * 100) / 100;
        const offDaysCount = calculateOffDaysCountBetweenDates(fromDate, toDate, emp.offDay, emp);
        const offDaysWage = Math.round((offDaysCount * dailyBasicRate) * 100) / 100;

        const ov1Wage = Math.round((totOv1Hours * rates.ov1) * 100) / 100;
        const ov2Wage = Math.round((totOv2Hours * rates.ov2) * 100) / 100;
        const ovMoreWage = Math.round((totOvMoreHours * rates.ovMore) * 100) / 100;

        const holidayAllowance = Math.round((workedHolidaysCount * dailyBasicRate) * 100) / 100;

        const basicGroupTotal = Math.round((basicWage + offDaysWage + ov1Wage + ov2Wage + ovMoreWage + holidayAllowance) * 100) / 100;

        // تعبئة بنود جدول الراتب الأساسي
        document.getElementById('sarki-rate-val').textContent = rates.hourlyRate.toFixed(2);
        document.getElementById('sarki-basic-hrs').textContent = totBasicHours.toFixed(2);
        document.getElementById('sarki-basic-wage').textContent = basicWage.toFixed(2);

        document.getElementById('sarki-daily-rate').textContent = dailyBasicRate.toFixed(2);
        document.getElementById('sarki-off-days').textContent = offDaysCount;
        document.getElementById('sarki-off-wage').textContent = offDaysWage.toFixed(2);

        document.getElementById('sarki-ov1-rate').textContent = rates.ov1.toFixed(2);
        document.getElementById('sarki-ov1-hrs').textContent = totOv1Hours.toFixed(2);
        document.getElementById('sarki-ov1-wage').textContent = ov1Wage.toFixed(2);

        document.getElementById('sarki-ov2-rate').textContent = rates.ov2.toFixed(2);
        document.getElementById('sarki-ov2-hrs').textContent = totOv2Hours.toFixed(2);
        document.getElementById('sarki-ov2-wage').textContent = ov2Wage.toFixed(2);

        document.getElementById('sarki-ovmore-rate').textContent = rates.ovMore.toFixed(2);
        document.getElementById('sarki-ovmore-hrs').textContent = totOvMoreHours.toFixed(2);
        document.getElementById('sarki-ovmore-wage').textContent = ovMoreWage.toFixed(2);

        document.getElementById('sarki-hol-rate').textContent = dailyBasicRate.toFixed(2);
        document.getElementById('sarki-hol-days').textContent = workedHolidaysCount;
        document.getElementById('sarki-hol-wage').textContent = holidayAllowance.toFixed(2);

        document.getElementById('sarki-tot-basic-group').textContent = basicGroupTotal.toLocaleString('ar-EG', {minimumFractionDigits: 2}) + ' ج.م';

        // ==================== 2. جدول الإضافات (من شاشة التسويات) ====================
        const adj = getEmployeeAdjustmentRecord(cycleKey, emp.id);
        const visitsVal = Number(adj.visits) || 0;
        const cashbackVal = Number(adj.cashback) || 0;
        const rewardsVal = Number(adj.rewards) || 0;
        const adminVal = Number(adj.adminAllowance) || 0;
        const bonusVal = Number(adj.bonus) || 0;

        document.getElementById('sarki-adj-visits').textContent = visitsVal.toFixed(2);
        document.getElementById('sarki-adj-cashback').textContent = cashbackVal.toFixed(2);
        document.getElementById('sarki-adj-rewards').textContent = rewardsVal.toFixed(2);
        document.getElementById('sarki-adj-admin').textContent = adminVal.toFixed(2);
        document.getElementById('sarki-adj-bonus').textContent = bonusVal.toFixed(2);

        const totalAdditions = Math.round((visitsVal + cashbackVal + rewardsVal + adminVal + bonusVal) * 100) / 100;
        document.getElementById('sarki-tot-additions').textContent = totalAdditions.toLocaleString('ar-EG', {minimumFractionDigits: 2}) + ' ج.م';

        // ==================== 3. جدول الاستقطاعات (من شاشة التسويات) ====================
        const advVal = Number(adj.advances) || 0;
        const insVal = Number(adj.insurance) || 0;
        const penVal = Number(adj.penalties) || 0;
        const supVal = Number(adj.supplies) || 0;
        const otherVal = Number(adj.otherDeductions) || 0;

        document.getElementById('sarki-ded-advances').textContent = advVal.toFixed(2);
        document.getElementById('sarki-ded-insurance').textContent = insVal.toFixed(2);
        document.getElementById('sarki-ded-penalties').textContent = penVal.toFixed(2);
        document.getElementById('sarki-ded-supplies').textContent = supVal.toFixed(2);
        document.getElementById('sarki-ded-other').textContent = otherVal.toFixed(2);

        const totalDeductions = Math.round((advVal + insVal + penVal + supVal + otherVal) * 100) / 100;
        document.getElementById('sarki-tot-deductions').textContent = totalDeductions.toLocaleString('ar-EG', {minimumFractionDigits: 2}) + ' ج.م';

        // ==================== 4. الراتب المستحق (الصافي) ====================
        // اجمالى جدول الراتب الاساسي + جدول الاضافات - جدول الاستقطاعات
        const finalNet = Math.round(((basicGroupTotal + totalAdditions) - totalDeductions) * 100) / 100;
        document.getElementById('sarki-box-net').textContent = finalNet.toLocaleString('ar-EG', {minimumFractionDigits: 2});
        if (typeof autoScaleAllA4Sheets === 'function') {
            setTimeout(autoScaleAllA4Sheets, 50);
        }
    }

    // مزامنة نصوص الطباعة مع القوائم المنسدلة
    function syncSarkiPrintSpans() {
        const cycleSelect = document.getElementById('sarki-cycle-select');
        const empSelect = document.getElementById('sarki-emp-select');
        const cyclePrint = document.getElementById('sarki-cycle-print-text');
        const empPrint = document.getElementById('sarki-emp-print-text');
        const dateBadge = document.getElementById('sarki-print-date-badge');
        
        if (cycleSelect && cyclePrint) {
            cyclePrint.textContent = cycleSelect.options[cycleSelect.selectedIndex] ? cycleSelect.options[cycleSelect.selectedIndex].text : '-';
        }
        if (empSelect && empPrint) {
            const emp = employees.find(e => e.id === parseInt(empSelect.value));
            empPrint.textContent = emp ? emp.name : (empSelect.options[empSelect.selectedIndex] ? empSelect.options[empSelect.selectedIndex].text : '-');
        }
        if (dateBadge) {
            dateBadge.textContent = 'تاريخ الطباعة: ' + new Date().toLocaleDateString('ar-EG');
        }
    }

    // حفظ واعتماد بيانات السركي
    function saveSarkiDataExplicit() {
        const empId = parseInt(document.getElementById('sarki-emp-select').value);
        if (!empId) {
            showToast('يرجى اختيار موظف ودورة راتب أولاً!', 'warning');
            return;
        }
        localStorage.setItem('erp_salary_adjustments_db', JSON.stringify(salaryAdjustmentsDb));
        localStorage.setItem('erp_attendance', JSON.stringify(attendanceRecords));
        localStorage.setItem('erp_employees', JSON.stringify(employees));
        showToast('تم حفظ واعتماد بيانات سركي الموظف بنجاح! 💾', 'success');
    }

    // قالب الطباعة الموحد لشيت السركي مطابق تماماً للإكسيل والورق المطبوع A4 وضع بورتريه
    function getSingleSarkiPrintHtml() {
        const empId = parseInt(document.getElementById('sarki-emp-select').value);
        if (!empId) {
            alert('يرجى اختيار موظف أولاً لطباعة السركي!');
            return null;
        }
        syncSarkiPrintSpans();

        const wrapper = document.getElementById('sarki-sheet-wrapper').cloneNode(true);
        wrapper.querySelectorAll('.sarki-no-print, button').forEach(el => el.remove());
        wrapper.querySelectorAll('.sarki-select-input').forEach(el => el.remove());
        wrapper.querySelectorAll('.sarki-print-only').forEach(el => el.style.display = 'inline');
        wrapper.querySelectorAll('.table-wrap').forEach(el => {
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
                    #sarki-sheet-wrapper {
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
                        margin-bottom: 4px !important;
                    }
                    th, td {
                        border: 1.2px solid #000000 !important;
                        padding: 2.2px 3px !important;
                        line-height: 1.2 !important;
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
                        gap: 4px !important;
                        width: 100% !important;
                        margin-bottom: 6px !important;
                        box-sizing: border-box !important;
                    }
                    .sarki-col-basic {
                        flex: 46 1 0 !important;
                        min-width: 0 !important;
                        box-sizing: border-box !important;
                    }
                    .sarki-col-additions {
                        flex: 27 1 0 !important;
                        min-width: 0 !important;
                        box-sizing: border-box !important;
                    }
                    .sarki-col-deductions {
                        flex: 27 1 0 !important;
                        min-width: 0 !important;
                        box-sizing: border-box !important;
                    }
                    #single-sarki-log-table,
                    #single-sarki-log-table thead,
                    #single-sarki-log-table tbody,
                    #single-sarki-log-table tfoot,
                    #single-sarki-log-table tr,
                    #single-sarki-log-table th,
                    #single-sarki-log-table td {
                        background: #ffffff !important;
                        background-color: #ffffff !important;
                        color: #000000 !important;
                    }
                    .table-wrap {
                        max-height: none !important;
                        overflow: visible !important;
                        border: 1.2px solid #000000 !important;
                        background: #ffffff !important;
                    }
                    .sarki-no-print, button, select {
                        display: none !important;
                    }
                    .sarki-print-only {
                        display: inline !important;
                    }
                </style>
            </head>
            <body>
                <div id="sarki-sheet-wrapper" style="background:#ffffff; color:#000000; border:1.5px solid #000; padding:6px 8px; font-family:Tahoma, Arial, sans-serif;">
                    ${wrapper.innerHTML}
                </div>
            </body>
            </html>
        `;
    }

    // طباعة شيت السركي بالكامل
    function printSingleSarkiSheet() {
        const empId = parseInt(document.getElementById('sarki-emp-select').value);
        const emp = employees.find(e => e.id === empId);
        const cycleSelect = document.getElementById('sarki-cycle-select');
        const cycleText = cycleSelect && cycleSelect.options[cycleSelect.selectedIndex] ? cycleSelect.options[cycleSelect.selectedIndex].text : '';
        const docTitle = emp ? `سركي_موظف_${emp.name.replace(/\s+/g, '_')}_${(cycleText || 'دورة').replace(/\s+/g, '_')}` : 'سركي_موظف';

        const html = getSingleSarkiPrintHtml();
        if (!html) return;
        const printWindow = window.open('', '_blank');
        if (!printWindow) {
            alert('يرجى السماح بالنوافذ المنبثقة لطباعة السركي!');
            return;
        }
        const finalHtml = html.replace('<title>سركي وبيان راتب موظف - عيادات سيدى ياقوت التخصصية</title>', `<title>${docTitle}</title>`);
        printWindow.document.write(finalHtml + '<script>window.onload = function() { window.print(); };<\/script>');
        printWindow.document.close();
    }

    // تصدير السركي كملف PDF مطابق تماماً لإعدادات الطباعة بدون صفحات فارغة
    function exportSarkiToPdf() {
        const empId = parseInt(document.getElementById('sarki-emp-select').value);
        const emp = employees.find(e => e.id === empId);
        if (!emp) {
            alert('يرجى اختيار موظف أولاً لتصدير السركي كملف PDF!');
            return;
        }
        const cycleSelect = document.getElementById('sarki-cycle-select');
        const cycleText = cycleSelect && cycleSelect.options[cycleSelect.selectedIndex] ? cycleSelect.options[cycleSelect.selectedIndex].text : '';
        const filename = `سركي_موظف_${emp.name.replace(/\s+/g, '_')}_${(cycleText || 'دورة').replace(/\s+/g, '_')}.pdf`;

        const html = getSingleSarkiPrintHtml();
        if (!html) return;
        downloadPrintHtmlAsPdf(html, filename, 'portrait');
    }

    // تصدير كشف السركي مطابق للإكسيل
    function exportSingleSarkiToExcel() {
        const empId = parseInt(document.getElementById('sarki-emp-select').value);
        const emp = employees.find(e => e.id === empId);
        if (!emp) {
            alert('يرجى اختيار موظف أولاً لتصدير السركي إلى Excel!');
            return;
        }
        const cycleSelect = document.getElementById('sarki-cycle-select');
        const cycleText = cycleSelect && cycleSelect.options[cycleSelect.selectedIndex] ? cycleSelect.options[cycleSelect.selectedIndex].text : '';

        syncSarkiPrintSpans();

        const wrapper = document.getElementById('sarki-sheet-wrapper').cloneNode(true);
        wrapper.querySelectorAll('.sarki-no-print, button').forEach(el => el.remove());
        wrapper.querySelectorAll('.sarki-select-input').forEach(el => el.remove());
        wrapper.querySelectorAll('.sarki-print-only').forEach(el => el.style.display = 'inline');

        const excelContent = `
            <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
            <head>
                <meta charset="UTF-8">
                <!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>سركي موظف</x:Name><x:WorksheetOptions><x:DisplayRightToLeft/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
                <style>
                    body { font-family: Tahoma, Arial, sans-serif; direction: rtl; text-align: center; }
                    table { border-collapse: collapse; width: 100%; margin-bottom: 12px; }
                    th, td { border: 1px solid #000000; padding: 5px; text-align: center; font-size: 11pt; }
                    th { background-color: #e2e8f0; font-weight: bold; }
                </style>
            </head>
            <body dir="rtl">
                ${wrapper.innerHTML}
            </body>
            </html>
        `;

        const blob = new Blob(['\ufeff' + excelContent], { type: 'application/vnd.ms-excel;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `سركي_موظف_${emp.name.replace(/\s+/g, '_')}_${(cycleText || 'دورة').replace(/\s+/g, '_')}.xls`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('تم تصدير كشف السركي إلى Excel بنجاح! 📊', 'success');
    }

    // المحرك الموحد لإنشاء وتحميل ملفات PDF أبيض وأسود بدقة ووضوح
