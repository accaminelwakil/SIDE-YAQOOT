    window.payrollDeliveryDb = JSON.parse(localStorage.getItem('erp_payroll_delivery_db') || '{}');

    window.previousScreenBeforeDelivery = window.previousScreenBeforeDelivery || 'screen-bulk-payslips';
    const payrollDeliveryApprovalCache = new Map();

    async function fetchPayrollApprovalForDelivery(fromDate, toDate) {
        const query = new URLSearchParams({ startDate: fromDate, endDate: toDate });
        const response = await window.authenticatedFetch(`/api/payroll-approvals?${query}`);
        const result = await response.json();
        if (!response.ok || !result.success) {
            throw new Error(result.message || 'تعذر التحقق من اعتماد دورة الراتب.');
        }
        return result.approval;
    }

    async function loadDeliveryApprovalStatus(fromDate, toDate, force = false) {
        const cycleKey = `${fromDate}_${toDate}`;
        const notice = document.getElementById('delivery-approval-status');
        const cached = payrollDeliveryApprovalCache.get(cycleKey);
        if (!force && cached && Date.now() - cached.loadedAt < 15000) {
            renderDeliveryApprovalNotice(notice, cached.approval);
            return cached.approval;
        }
        if (notice) {
            notice.textContent = 'جارٍ التحقق من اعتماد دورة الراتب...';
            notice.style.background = '#f8fafc';
            notice.style.borderColor = '#cbd5e1';
            notice.style.color = '#334155';
        }
        try {
            const approval = await fetchPayrollApprovalForDelivery(fromDate, toDate);
            payrollDeliveryApprovalCache.set(cycleKey, { approval, loadedAt: Date.now() });
            const cycleSelect = document.getElementById('delivery-cycle-select');
            if (cycleSelect?.value === `${fromDate}|${toDate}`) renderDeliveryApprovalNotice(notice, approval);
            return approval;
        } catch (error) {
            if (notice) {
                notice.textContent = 'تعذر التحقق من اعتماد الدورة؛ لن يُسمح بتسجيل الصرف حتى نجاح التحقق.';
                notice.style.background = '#fef2f2';
                notice.style.borderColor = '#fecaca';
                notice.style.color = '#991b1b';
            }
            throw error;
        }
    }

    function renderDeliveryApprovalNotice(notice, approval) {
        if (!notice) return;
        if (approval?.status === 'approved') {
            notice.textContent = `دورة الراتب معتمدة بواسطة ${approval.approvedBy || 'amin elwakil'} — يمكن تسجيل الصرف.`;
            notice.style.background = '#dcfce7';
            notice.style.borderColor = '#86efac';
            notice.style.color = '#166534';
        } else {
            notice.textContent = 'دورة الراتب غير معتمدة؛ لا يمكن تسجيل الصرف قبل اعتمادها من amin elwakil.';
            notice.style.background = '#fef2f2';
            notice.style.borderColor = '#fecaca';
            notice.style.color = '#991b1b';
        }
    }



    // قاعدة تسوية الراتب: إقفال خانة الآحاد إما إلى صفر أو 5

    // إذا كان كسر/رقم الآحاد أقل من 2.5 ج يُقفل للعشرات الأقل (مثلاً 122.49 -> 120)

    // إذا كان كسر/رقم الآحاد من 2.5 ج وحتى أقل من 7.5 ج يُقفل إلى 5 (مثلاً 122.50 -> 125)

    // إذا كان كسر/رقم الآحاد 7.5 ج فما فوق يُقفل للعشرات التالية (مثلاً 127.50 -> 130)

    function settleSalaryAmount(val) {

        val = Number(val) || 0;

        if (val <= 0) return 0;

        const baseTens = Math.floor(val / 10) * 10;

        const rem = Math.round((val - baseTens) * 100) / 100;

        if (rem < 2.5) {

            return baseTens;

        } else if (rem < 7.5) {

            return baseTens + 5;

        } else {

            return baseTens + 10;

        }

    }



    function populateDeliveryCyclesDropdown() {

        const select = document.getElementById('delivery-cycle-select');

        const deptSel = document.getElementById('delivery-dept-filter');

        if (!select) return;



        const now = new Date();

        const curY = now.getFullYear();

        const savedVal = select.value;

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



        if (savedVal && Array.from(select.options).some(o => o.value === savedVal)) {

            select.value = savedVal;

        } else if (matchedIndex !== -1) {

            select.selectedIndex = matchedIndex;

        } else {

            const curMIdx = now.getMonth();

            select.selectedIndex = (curMIdx >= 0 && curMIdx < select.options.length) ? curMIdx : 0;

        }



        if (deptSel) {

            const savedDept = deptSel.value;

            const deptsSet = new Set();

            (employees || []).forEach(e => { if (e && e.job) deptsSet.add(e.job.trim()); });

            deptSel.innerHTML = '<option value="">جميع الأقسام</option>';

            Array.from(deptsSet).sort().forEach(d => {

                const opt = document.createElement('option');

                opt.value = d;

                opt.textContent = d;

                deptSel.appendChild(opt);

            });

            if (savedDept) deptSel.value = savedDept;

        }



        renderPayrollDelivery();

    }



    function renderPayrollDelivery() {

        const cycleSelect = document.getElementById('delivery-cycle-select');

        if (!cycleSelect) return;

        if (!cycleSelect.value) {

            populateDeliveryCyclesDropdown();

            return;

        }



        const [fromDate, toDate] = cycleSelect.value.split('|');

        const cycleKey = `${fromDate}_${toDate}`;

        const selectedCycleText = cycleSelect.options[cycleSelect.selectedIndex] ? cycleSelect.options[cycleSelect.selectedIndex].text : '';

        const badgeEl = document.getElementById('delivery-cycle-badge');

        if (badgeEl) badgeEl.textContent = selectedCycleText;
        loadDeliveryApprovalStatus(fromDate, toDate).catch(error =>
            console.error('Payroll delivery approval status could not be loaded:', error)
        );



        const deptFilter = document.getElementById('delivery-dept-filter') ? document.getElementById('delivery-dept-filter').value : '';

        const searchTerm = document.getElementById('delivery-search') ? document.getElementById('delivery-search').value.trim() : '';

        const normTerm = typeof normalizeArabicText === 'function' ? normalizeArabicText(searchTerm) : searchTerm.toLowerCase();

        const tbody = document.getElementById('delivery-tbody');

        if (!tbody) return;

        tbody.innerHTML = '';



        const activeEmps = (employees || []).filter(e => {

            if (!e || e.status === 'انتهت خدمته') return false;

            if (deptFilter && e.job !== deptFilter) return false;

            if (searchTerm) {

                const normName = typeof normalizeArabicText === 'function' ? normalizeArabicText(e.name) : (e.name || '').toLowerCase();

                const normJob = typeof normalizeArabicText === 'function' ? normalizeArabicText(e.job) : (e.job || '').toLowerCase();

                const idStr = String(e.id || '');

                const codeStr = String(e.code || '');

                const match = normName.includes(normTerm) || normJob.includes(normTerm) || idStr.includes(searchTerm) || codeStr.includes(searchTerm);

                if (!match) return false;

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



        let totalEligible = 0;

        let totalNetSum = 0;

        let totalSettledSum = 0;

        let totalPaidSum = 0;

        let totalPendingSum = 0;



        activeEmps.forEach(emp => {

            const calcData = calculateEmployeePayslipData(emp, fromDate, toDate);

            const netWage = Math.round((calcData.finalNet || 0) * 100) / 100;

            const settledWage = settleSalaryAmount(netWage);



            const deliveryRecordKey = `${cycleKey}_${emp.id}`;

            const record = payrollDeliveryDb[deliveryRecordKey] || {};



            const periodRecords = (attendanceRecords || []).filter(r => r && r.empId === emp.id && r.date >= fromDate && r.date <= toDate);

            const hasAttendancePaid = periodRecords.length > 0 && periodRecords.every(r => r.isPaid);

            const isPaid = (record.isPaid !== undefined) ? !!record.isPaid : hasAttendancePaid;

            const recipientName = record.recipient || '';



            totalEligible++;

            totalNetSum += netWage;

            totalSettledSum += settledWage;

            if (isPaid) {

                totalPaidSum += settledWage;

            } else {

                totalPendingSum += settledWage;

            }



            const tr = document.createElement('tr');

            tr.innerHTML = `

                <td style="text-align:center;"><span style="color:var(--accent); font-family:Consolas, monospace; font-weight:bold;">${emp.code || ('#' + emp.id)}</span></td>

                <td style="text-align:right;"><strong>${emp.name}</strong></td>

                <td style="text-align:center;"><span class="badge badge-dept">${emp.job || '-'}</span></td>

                <td style="text-align:center; font-weight:bold; color:var(--text-main);">${netWage.toLocaleString('ar-EG', {minimumFractionDigits: 2})} ج.م</td>

                <td style="text-align:center; font-weight:900; font-size:13.5px; color:#e5ad60; background:rgba(229, 173, 96, 0.08);">${settledWage.toLocaleString('ar-EG', {minimumFractionDigits: 2})} ج.م</td>

                <td style="text-align:center;">
                    <span style="display:block; width:100%; min-width:140px; padding:5px 8px; font-size:11px; color:var(--text-main); text-align:center; border-bottom:1px dashed var(--border); min-height:28px; font-style: ${recipientName ? 'normal' : 'italic'}; opacity: ${recipientName ? '1' : '0.5'};">${recipientName || 'اسم / توقيع المستلم'}</span>
                    <input type="hidden" class="cell-recipient-input" id="delivery-recip-${emp.id}" value="${recipientName}">
                </td>

                <td style="text-align:center; padding:4px 6px;">
                    ${isPaid 
                        ? `<button type="button" class="btn-success" style="font-size:11.5px; padding:5px 14px; background:linear-gradient(135deg, #059669, #047857); color:#fff; border:none; border-radius:6px; cursor:pointer; font-weight:bold; box-shadow:0 2px 6px rgba(5,150,105,0.25);" onclick="toggleDeliveryPayment('${fromDate}', '${toDate}', ${emp.id})" title="تم التسليم - اضغط للتحويل إلى معلق">✔ تم التسليم</button>`
                        : `<button type="button" class="btn-warning" style="font-size:11.5px; padding:5px 14px; background:#fef3c7; color:#d97706; border:1px solid #fde68a; border-radius:6px; cursor:pointer; font-weight:bold;" onclick="toggleDeliveryPayment('${fromDate}', '${toDate}', ${emp.id})" title="معلق - اضغط لتسليم وصرف الراتب">⏳ معلق</button>`
                    }
                </td>

            `;

            tbody.appendChild(tr);

        });



        const statCountEl = document.getElementById('delivery-stat-count');

        const statNetEl = document.getElementById('delivery-stat-net');

        const statSettledEl = document.getElementById('delivery-stat-settled');

        const statPaidEl = document.getElementById('delivery-stat-paid');

        const statPendingEl = document.getElementById('delivery-stat-pending');



        if (statCountEl) statCountEl.textContent = `${totalEligible} موظف`;

        if (statNetEl) statNetEl.textContent = `${totalNetSum.toLocaleString('ar-EG', {minimumFractionDigits: 2})} ج.م`;

        if (statSettledEl) statSettledEl.textContent = `${totalSettledSum.toLocaleString('ar-EG', {minimumFractionDigits: 2})} ج.م`;

        if (statPaidEl) statPaidEl.textContent = `${totalPaidSum.toLocaleString('ar-EG', {minimumFractionDigits: 2})} ج.م`;

        if (statPendingEl) statPendingEl.textContent = `${totalPendingSum.toLocaleString('ar-EG', {minimumFractionDigits: 2})} ج.م`;

    }



    async function toggleDeliveryPayment(fromDate, toDate, empId) {

        const cycleKey = `${fromDate}_${toDate}`;

        const deliveryRecordKey = `${cycleKey}_${empId}`;

        const emp = employees.find(e => e.id === empId);



        const calcData = calculateEmployeePayslipData(emp, fromDate, toDate);

        const netWage = Math.round((calcData.finalNet || 0) * 100) / 100;

        const settledWage = settleSalaryAmount(netWage);



        const periodRecords = attendanceRecords.filter(r => r.empId === empId && r.date >= fromDate && r.date <= toDate);

        const hasAttendancePaid = periodRecords.length > 0 && periodRecords.every(r => r.isPaid);



        if (!payrollDeliveryDb[deliveryRecordKey]) {

            payrollDeliveryDb[deliveryRecordKey] = { isPaid: hasAttendancePaid, recipient: '' };

        }



        const currentStatus = (payrollDeliveryDb[deliveryRecordKey].isPaid !== undefined) 

            ? !!payrollDeliveryDb[deliveryRecordKey].isPaid 

            : hasAttendancePaid;

        if (!currentStatus) {
            try {
                const approval = await loadDeliveryApprovalStatus(fromDate, toDate, true);
                if (approval?.status !== 'approved') {
                    showToast('لا يمكن تسجيل صرف الراتب قبل اعتماد دورة الراتب من amin elwakil.', 'error');
                    return;
                }
            } catch (error) {
                showToast(error.message || 'تعذر التحقق من اعتماد دورة الراتب.', 'error');
                return;
            }
        }

        const newStatus = !currentStatus;



        const recipInput = document.getElementById(`delivery-recip-${empId}`);

        const recipientVal = (recipInput && recipInput.value.trim()) 

            ? recipInput.value.trim() 

            : (payrollDeliveryDb[deliveryRecordKey].recipient || (emp ? emp.name : ''));



        payrollDeliveryDb[deliveryRecordKey] = {

            isPaid: newStatus,

            paidAt: newStatus ? new Date().toISOString() : null,

            recipient: recipientVal,

            amount: settledWage,

            netWage: netWage

        };



        if (typeof attendanceRecords !== 'undefined' && Array.isArray(attendanceRecords)) {
            attendanceRecords.forEach(r => {
                if (r && r.empId === empId && r.date >= fromDate && r.date <= toDate) {
                    r.isPaid = newStatus;
                }
            });
            localStorage.setItem('erp_attendance_db', JSON.stringify(attendanceRecords));
            if (typeof pushSingleCollectionToFirebase === 'function') {
                pushSingleCollectionToFirebase('attendance', attendanceRecords);
            }
        }

        localStorage.setItem('erp_payroll_delivery_db', JSON.stringify(payrollDeliveryDb));
        if (typeof pushSingleCollectionToFirebase === 'function') {
            pushSingleCollectionToFirebase('payrollDelivery', payrollDeliveryDb);
        }



        if (newStatus) {

            showToast(`تم تسليم وصرف راتب الموظف (${emp ? emp.name : ''}) بنجاح! تحولت إلى "تم التسليم" 💵`, 'success');

        } else {

            showToast(`تم تغيير حالة راتب الموظف (${emp ? emp.name : ''}) إلى "معلق" ⏳`, 'info');

        }



        renderPayrollDelivery();

        if (typeof renderWelcomeDashboard === 'function') renderWelcomeDashboard();

        if (typeof renderEmployeeGeneralReport === 'function') renderEmployeeGeneralReport();

        if (typeof renderTotalsReport === 'function') renderTotalsReport();

    }



    function onDeliveryRecipientChanged(fromDate, toDate, empId, val) {

        const cycleKey = `${fromDate}_${toDate}`;

        const deliveryRecordKey = `${cycleKey}_${empId}`;

        if (!payrollDeliveryDb[deliveryRecordKey]) {

            payrollDeliveryDb[deliveryRecordKey] = { isPaid: false };

        }

        payrollDeliveryDb[deliveryRecordKey].recipient = (val || '').trim();

        localStorage.setItem('erp_payroll_delivery_db', JSON.stringify(payrollDeliveryDb));

    }



    function savePayrollDeliveryData() {

        const cycleSelect = document.getElementById('delivery-cycle-select');

        if (!cycleSelect || !cycleSelect.value) return;

        const [fromDate, toDate] = cycleSelect.value.split('|');

        const cycleKey = `${fromDate}_${toDate}`;



        document.querySelectorAll('.cell-recipient-input').forEach(input => {

            const empId = parseInt(input.id.replace('delivery-recip-', ''));

            if (!empId) return;

            const deliveryRecordKey = `${cycleKey}_${empId}`;

            if (!payrollDeliveryDb[deliveryRecordKey]) {

                payrollDeliveryDb[deliveryRecordKey] = { isPaid: false };

            }

            payrollDeliveryDb[deliveryRecordKey].recipient = input.value.trim();

        });



        localStorage.setItem('erp_payroll_delivery_db', JSON.stringify(payrollDeliveryDb));

        if (typeof pushSingleCollectionToFirebase === 'function') pushSingleCollectionToFirebase('payrollDelivery', payrollDeliveryDb);

        showToast('تم حفظ واعتماد بيانات صرف وتسليم الرواتب بنجاح! 💾', 'success');

    }



    function getPayrollDeliveryPrintHtml() {

        const cycleSelect = document.getElementById('delivery-cycle-select');

        if (!cycleSelect || !cycleSelect.value) return '';

        const [fromDate, toDate] = cycleSelect.value.split('|');

        const cycleKey = `${fromDate}_${toDate}`;

        const cycleText = cycleSelect.options[cycleSelect.selectedIndex] ? cycleSelect.options[cycleSelect.selectedIndex].text : '';

        const deptFilter = document.getElementById('delivery-dept-filter') ? document.getElementById('delivery-dept-filter').value : '';

        const printDate = new Date().toLocaleDateString('ar-EG');



        const activeEmps = (employees || []).filter(e => {

            if (!e || e.status === 'انتهت خدمته') return false;

            if (deptFilter && e.job !== deptFilter) return false;

            return true;

        }).sort((a, b) => {

            const deptA = a.job || '';

            const deptB = b.job || '';

            if (deptA !== deptB) return deptA.localeCompare(deptB, 'ar');

            const codeA = a.code || String(a.id || '');

            const codeB = b.code || String(b.id || '');

            return codeA.localeCompare(codeB, 'ar', { numeric: true });

        });



        let totalNet = 0;

        let totalSettled = 0;

        let rowsHtml = '';



        activeEmps.forEach((emp, idx) => {

            const calcData = calculateEmployeePayslipData(emp, fromDate, toDate);

            const net = Math.round((calcData.finalNet || 0) * 100) / 100;

            const settled = settleSalaryAmount(net);

            const recKey = `${cycleKey}_${emp.id}`;

            const rec = payrollDeliveryDb[recKey] || {};

            const periodRecords = (attendanceRecords || []).filter(r => r && r.empId === emp.id && r.date >= fromDate && r.date <= toDate);

            const isPaid = (rec.isPaid !== undefined) ? !!rec.isPaid : (periodRecords.length > 0 && periodRecords.every(r => r.isPaid));

            const recipient = rec.recipient || '';



            totalNet += net;

            totalSettled += settled;



            rowsHtml += `

                <tr>

                    <td style="border:1.2px solid #000; padding:5px; text-align:center;">${idx + 1}</td>

                    <td style="border:1.2px solid #000; padding:5px; text-align:center; font-family:Consolas, monospace; font-weight:bold;">${emp.code || ('#' + emp.id)}</td>

                    <td style="border:1.2px solid #000; padding:5px; text-align:right; font-weight:bold;">${emp.name}</td>

                    <td style="border:1.2px solid #000; padding:5px; text-align:center;">${emp.job || '-'}</td>

                    <td style="border:1.2px solid #000; padding:5px; text-align:center; font-weight:bold;">${net.toLocaleString('ar-EG', {minimumFractionDigits: 2})} ج.م</td>

                    <td style="border:1.2px solid #000; padding:5px; text-align:center; font-weight:900; background:#f0fdf4;">${settled.toLocaleString('ar-EG', {minimumFractionDigits: 2})} ج.م</td>

                    <td style="border:1.2px solid #000; padding:5px; text-align:center; min-width:200px;">${recipient || '<span style="border-bottom:1px dotted #888; display:inline-block; width:90%; height:16px;"></span>'}</td>

                </tr>

            `;

        });



        return `

            <!DOCTYPE html>

            <html lang="ar" dir="rtl">

            <head>

                <meta charset="UTF-8">

                <meta name="viewport" content="width=device-width, initial-scale=1">

                <title>كشف_تسليم_وصرف_الرواتب_${(cycleText || 'دورة').replace(/\s+/g, '_')}</title>

                <style>

                    @page { size: A4 landscape; margin: 8mm; }

                    * { box-sizing: border-box; font-family: Tahoma, 'Segoe UI', Arial, sans-serif; color: #000; }

                    body { margin: 0; padding: 5px; direction: rtl; background: #fff; font-size: 11px; }

                    table { width: 100%; border-collapse: collapse; margin-top: 8px; margin-bottom: 12px; }

                    th { border: 1.5px solid #000; background: #f1f5f9; padding: 6px 4px; font-size: 11px; font-weight: bold; text-align: center; }

                    td { font-size: 10.5px; }

                    @media print {

                        button { display: none !important; }

                    }

                </style>

            </head>

            <body>

                ${typeof getClinicReportHeaderHtml === 'function' ? getClinicReportHeaderHtml('كشف تسليم وصرف رواتب العاملين والموظفين', `الدورة: ${cycleText} ${deptFilter ? ' | القسم: ' + deptFilter : ''}`, `<div>عدد الموظفين: ${activeEmps.length}</div>`) : `
                <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #990012; padding-bottom:6px; margin-bottom:8px;">
                    <div style="text-align:right;">
                        <h2 style="margin:0; font-size:16px; color:#102a45;">عيادات سيدي ياقوت التخصصية</h2>
                        <div style="font-size:12px; font-weight:bold; color:#475569; margin-top:2px;">كشف تسليم وصرف رواتب العاملين والموظفين</div>
                    </div>
                    <div style="text-align:center; border:1.5px solid #990012; padding:4px 12px; border-radius:6px; background:#fff1f2;">
                        <div style="font-weight:900; font-size:12px; color:#990012;">${cycleText}</div>
                        ${deptFilter ? `<div style="font-size:11px; font-weight:bold; margin-top:2px;">القسم: ${deptFilter}</div>` : ''}
                    </div>
                    <div style="text-align:left; font-size:11px;">
                        <div><strong>تاريخ الطباعة:</strong> ${printDate}</div>
                        <div style="margin-top:2px;"><strong>عدد الموظفين:</strong> ${activeEmps.length}</div>
                    </div>
                </div>`}



                <table>

                    <thead>

                        <tr>

                            <th style="width:35px;">م</th>

                            <th style="width:75px;">كود الموظف</th>

                            <th style="min-width:160px; text-align:right;">اسم الموظف</th>

                            <th style="width:110px;">القسم</th>

                            <th style="width:105px;">صافي الراتب</th>

                            <th style="width:105px; background:#e2e8f0;">تسوية الراتب</th>

                            <th style="min-width:200px;">المستلم / التوقيع</th>

                        </tr>

                    </thead>

                    <tbody>

                        ${rowsHtml}

                    </tbody>

                    <tfoot>

                        <tr style="background:#f8fafc; font-weight:900;">

                            <td colspan="4" style="border:1.5px solid #000; padding:6px; text-align:center; font-size:12px;">الإجمــــاليات</td>

                            <td style="border:1.5px solid #000; padding:6px; text-align:center; font-size:12px; color:#0369a1;">${totalNet.toLocaleString('ar-EG', {minimumFractionDigits: 2})} ج.م</td>

                            <td style="border:1.5px solid #000; padding:6px; text-align:center; font-size:12px; color:#047857; background:#e2e8f0;">${totalSettled.toLocaleString('ar-EG', {minimumFractionDigits: 2})} ج.م</td>

                            <td style="border:1.5px solid #000; padding:6px; text-align:center;">إجمالي المستحق بعد التسوية: ${totalSettled.toLocaleString('ar-EG', {minimumFractionDigits: 2})} ج.م</td>

                        </tr>

                    </tfoot>

                </table>



                <div style="margin-top:8px; font-size:10px; font-weight:bold; text-align:right;">
                    عدد الموظفين: ${activeEmps.length} | إجمالي صافي الرواتب بعد التسوية: ${totalSettled.toLocaleString('ar-EG', {minimumFractionDigits: 2})} ج.م
                </div>

            </body>

            </html>

        `;

    }



    function printPayrollDeliveryTable() {

        const html = getPayrollDeliveryPrintHtml();

        if (!html) {

            showToast('يرجى تحديد دورة الراتب أولاً!', 'warning');

            return;

        }

        const printWindow = window.open('', '_blank');

        if (!printWindow) {

            alert('يرجى السماح بالنوافذ المنبثقة للطباعة!');

            return;

        }

        printWindow.document.write(html + '<script>window.onload = function() { window.print(); };<\/script>');

        printWindow.document.close();

    }



    function exportDeliveryToPdf() {

        const html = getPayrollDeliveryPrintHtml();

        if (!html) {

            showToast('يرجى تحديد دورة الراتب أولاً!', 'warning');

            return;

        }

        const cycleSelect = document.getElementById('delivery-cycle-select');

        const cycleText = cycleSelect && cycleSelect.options[cycleSelect.selectedIndex] ? cycleSelect.options[cycleSelect.selectedIndex].text : '';

        const filename = `كشف_تسليم_وصرف_الرواتب_${(cycleText || 'دورة').replace(/\s+/g, '_')}.pdf`;

        downloadPrintHtmlAsPdf(html, filename, 'landscape');
    }

    window.saveAttendance = function() {
        if (typeof attendanceRecords !== 'undefined') {
            localStorage.setItem('erp_attendance_db', JSON.stringify(attendanceRecords));
            if (typeof pushSingleCollectionToFirebase === 'function') {
                pushSingleCollectionToFirebase('attendance', attendanceRecords);
            }
        }
    };


