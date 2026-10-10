    // ==================== 2.1 شاشة تسويات الرواتب (دورات 25 إلى 24 متطابقة مع شاشة إجمالي الرواتب) ====================

    let salaryAdjustmentsDb = JSON.parse(localStorage.getItem('erp_salary_adjustments_db') || '{}');

    let adjustmentsHistoryStack = [];



    function populateAdjustmentCyclesDropdown() {

        const select = document.getElementById('adj-cycle-select');

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



        onAdjustmentCycleSelectChanged();

    }



    function onAdjustmentCycleSelectChanged() {

        const select = document.getElementById('adj-cycle-select');

        if (!select || !select.value) return;



        const [startVal, endVal] = select.value.split('|');

        const startInput = document.getElementById('adj-start-date');

        const endInput = document.getElementById('adj-end-date');



        if (startInput) startInput.value = startVal;

        if (endInput) endInput.value = endVal;



        renderAdjustmentsTable();

    }



    function getActiveAdjustmentCycleKey() {

        const startInput = document.getElementById('adj-start-date');

        const endInput = document.getElementById('adj-end-date');

        if (startInput && endInput && startInput.value && endInput.value) {

            return `${startInput.value}_${endInput.value}`;

        }

        const select = document.getElementById('adj-cycle-select');

        if (select && select.value) {

            const [s, e] = select.value.split('|');

            return `${s}_${e}`;

        }

        const now = new Date();

        const m = String(now.getMonth() + 1).padStart(2, '0');

        const prevM = String(now.getMonth() === 0 ? 12 : now.getMonth()).padStart(2, '0');

        const y = now.getFullYear();

        const prevY = now.getMonth() === 0 ? y - 1 : y;

        return `${prevY}-${prevM}-25_${y}-${m}-24`;

    }



    function pushAdjustmentsHistory() {

        if (adjustmentsHistoryStack.length > 20) adjustmentsHistoryStack.shift();

        adjustmentsHistoryStack.push(JSON.stringify(salaryAdjustmentsDb));

    }



    function undoAdjustmentsAction() {

        if (adjustmentsHistoryStack.length === 0) {

            alert('لا توجد عمليات سابقة للتراجع عنها في شاشة تسويات الرواتب!');

            return;

        }

        if (confirm('هل تريد التراجع عن آخر تعديل تم إجراؤه في تسويات الرواتب؟')) {

            const prev = adjustmentsHistoryStack.pop();

            salaryAdjustmentsDb = JSON.parse(prev);

            localStorage.setItem('erp_salary_adjustments_db', JSON.stringify(salaryAdjustmentsDb));

            renderAdjustmentsTable();

            if (typeof renderPayrollSummaryTable === 'function') renderPayrollSummaryTable();

            alert('تم التراجع عن آخر معاملة بنجاح!');

        }

    }



    function saveAdjustmentsExplicit() {

        localStorage.setItem('erp_salary_adjustments_db', JSON.stringify(salaryAdjustmentsDb));

        if (typeof renderPayrollSummaryTable === 'function') renderPayrollSummaryTable();

        alert('تم حفظ كافة معاملات تسويات الرواتب بنجاح وتحديث شاشات الرواتب والسراكي! 💾');

    }



    // دالة جلب تسويات الموظف مع دعم المفتاح المزدوج (كود الدورة والمفتاح الشهري لضمان التزامن 100%)

    function getEmployeeAdjustmentRecord(cycleKeyOrMonth, empId) {

        if (!cycleKeyOrMonth) cycleKeyOrMonth = getActiveAdjustmentCycleKey();



        let monthKey = '';

        let cycleKey = '';



        if (cycleKeyOrMonth.includes('_')) {

            cycleKey = cycleKeyOrMonth;

            const parts = cycleKey.split('_');

            if (parts.length > 1 && parts[1]) {

                monthKey = parts[1].substring(0, 7); // e.g. 2026-10

            }

        } else {

            monthKey = cycleKeyOrMonth;

        }



        // فحص وجود البيانات تحت كود الدورة أولاً، أو كود الشهر

        let record = null;

        if (cycleKey && salaryAdjustmentsDb[cycleKey] && salaryAdjustmentsDb[cycleKey][empId]) {

            record = salaryAdjustmentsDb[cycleKey][empId];

        } else if (monthKey && salaryAdjustmentsDb[monthKey] && salaryAdjustmentsDb[monthKey][empId]) {

            record = salaryAdjustmentsDb[monthKey][empId];

        }



        if (!record) {

            record = {

                visits: 0,

                cashback: 0,

                rewards: 0,

                adminAllowance: 0,

                bonus: 0,

                advances: 0,

                penalties: 0,

                insurance: 0,

                supplies: 0,

                otherDeductions: 0

            };

        }



        // ضمان وجود الكائن في قاعدة البيانات تحت المفتاحين

        if (cycleKey) {

            if (!salaryAdjustmentsDb[cycleKey]) salaryAdjustmentsDb[cycleKey] = {};

            salaryAdjustmentsDb[cycleKey][empId] = record;

        }

        if (monthKey) {

            if (!salaryAdjustmentsDb[monthKey]) salaryAdjustmentsDb[monthKey] = {};

            salaryAdjustmentsDb[monthKey][empId] = record;

        }



        return record;

    }



    function renderAdjustmentsMonthsSummaryTable() {

        const tbody = document.getElementById('adj-months-summary-tbody');

        if (!tbody) return;

        tbody.innerHTML = '';



        const now = new Date();

        const curY = now.getFullYear();

        const yearDisplay = document.getElementById('adj-year-display');

        if (yearDisplay) yearDisplay.textContent = curY;



        const currentActiveKey = getActiveAdjustmentCycleKey();



        for (let m = 1; m <= 12; m++) {

            let prevM = m - 1;

            let prevY = curY;

            if (prevM === 0) {

                prevM = 12;

                prevY = curY - 1;

            }



            const startStr = `${prevY}-${String(prevM).padStart(2, '0')}-25`;

            const endStr = `${curY}-${String(m).padStart(2, '0')}-24`;

            const cycleKey = `${startStr}_${endStr}`;

            const monthKey = `${curY}-${String(m).padStart(2, '0')}`;

            const mName = arabicMonths[m - 1];

            const prevMName = arabicMonths[prevM - 1];



            // فحص البيانات في كود الدورة أو كود الشهر

            const monthData = salaryAdjustmentsDb[cycleKey] || salaryAdjustmentsDb[monthKey] || {};

            let mAdd = 0, mDed = 0, registeredCount = 0;



            Object.keys(monthData).forEach(empId => {

                const adj = monthData[empId];

                const add = (Number(adj.visits) || 0) + (Number(adj.cashback) || 0) + (Number(adj.rewards) || 0) + (Number(adj.adminAllowance) || 0) + (Number(adj.bonus) || 0);

                const ded = (Number(adj.advances) || 0) + (Number(adj.penalties) || 0) + (Number(adj.insurance) || 0) + (Number(adj.supplies) || 0) + (Number(adj.otherDeductions) || 0);

                if (add > 0 || ded > 0) {

                    mAdd += add;

                    mDed += ded;

                    registeredCount++;

                }

            });



            const mNet = mAdd - mDed;

            const isRecorded = registeredCount > 0;

            const isSelected = (currentActiveKey === cycleKey);



            const tr = document.createElement('tr');

            tr.style.cursor = 'pointer';

            if (isSelected) {

                tr.style.backgroundColor = 'rgba(36, 130, 150, 0.15)';

                tr.style.outline = '1px solid var(--accent)';

            }



            tr.innerHTML = `

                <td><strong>دورة ${mName} (25 ${prevMName} - 24 ${mName})</strong></td>

                <td style="color:#e5ad60; font-weight:bold;">${mAdd > 0 ? mAdd.toLocaleString('ar-EG', {minimumFractionDigits: 2}) + ' ج.م' : '-'}</td>

                <td style="color:#e5ad60; font-weight:bold;">${mDed > 0 ? mDed.toLocaleString('ar-EG', {minimumFractionDigits: 2}) + ' ج.م' : '-'}</td>

                <td style="color:#e5ad60; font-weight:800;">${isRecorded ? (mNet >= 0 ? '+' : '') + mNet.toLocaleString('ar-EG', {minimumFractionDigits: 2}) + ' ج.م' : '-'}</td>

                <td>${registeredCount > 0 ? registeredCount + ' موظف' : '-'}</td>

                <td>

                    <span class="badge" style="${isRecorded ? 'background:#ede9fe; color:#6d28d9; border:1px solid #ddd6fe;' : 'background:#f1f5f9; color:#64748b; border:1px solid #e2e8f0;'}">

                        ${isRecorded ? '✔ مسجل' : 'لم يسجل'}

                    </span>

                </td>

                <td>

                    <button type="button" class="btn-primary" style="font-size:11px; padding:4px 10px;" onclick="event.stopPropagation(); openCycleAdjustments('${startStr}', '${endStr}')">

                        📂 عرض

                    </button>

                </td>

            `;



            tr.onclick = function() {

                openCycleAdjustments(startStr, endStr);

            };



            tbody.appendChild(tr);

        }

    }



    function openCycleAdjustments(startStr, endStr) {

        const cycleKey = `${startStr}_${endStr}`;

        const monthKey = endStr.substring(0, 7);

        const monthData = salaryAdjustmentsDb[cycleKey] || salaryAdjustmentsDb[monthKey] || {};

        let registeredCount = 0;



        Object.keys(monthData).forEach(empId => {

            const adj = monthData[empId];

            const add = (Number(adj.visits) || 0) + (Number(adj.cashback) || 0) + (Number(adj.rewards) || 0) + (Number(adj.adminAllowance) || 0) + (Number(adj.bonus) || 0);

            const ded = (Number(adj.advances) || 0) + (Number(adj.penalties) || 0) + (Number(adj.insurance) || 0) + (Number(adj.supplies) || 0) + (Number(adj.otherDeductions) || 0);

            if (add > 0 || ded > 0) registeredCount++;

        });



        const [y, m] = endStr.split('-');

        const monthName = arabicMonths[parseInt(m, 10) - 1];



        // التحقق: إذا كانت الدورة لم تسجل بعد، تظهر رسالة التنبيه "يجب التسجيل أولاً"

        if (registeredCount === 0) {

            alert(`⚠️ يجب التسجيل أولاً! راتب شهر [ ${monthName} ${y} ] من (25 إلى 24) لم يتم تسجيل أي تسويات مالية لها بعد.`);

            return;

        }



        // إذا كانت مسجلة، يتم تعيين الدورة وعرض الجدول

        const startInput = document.getElementById('adj-start-date');

        const endInput = document.getElementById('adj-end-date');

        if (startInput) startInput.value = startStr;

        if (endInput) endInput.value = endStr;



        const select = document.getElementById('adj-cycle-select');

        if (select) {

            const targetVal = `${startStr}|${endStr}`;

            for (let i = 0; i < select.options.length; i++) {

                if (select.options[i].value === targetVal) {

                    select.selectedIndex = i;

                    break;

                }

            }

        }



        renderAdjustmentsTable();



        const tableContainer = document.querySelector('#screen-salary-adjustments .emp-table-container:last-of-type');

        if (tableContainer) {

            tableContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

        }

    }



    function renderAdjustmentsTable() {

        renderAdjustmentsMonthsSummaryTable();

        sortEmployeesByDeptAndCode();

        const tbody = document.getElementById('adjustments-tbody');

        const empty = document.getElementById('adj-empty');

        if (!tbody) return;



        const cycleKey = getActiveAdjustmentCycleKey();

        const term = (document.getElementById('adj-search') ? document.getElementById('adj-search').value : '').trim();

        const normTerm = typeof normalizeArabicText === 'function' ? normalizeArabicText(term) : term.toLowerCase();

        const deptFilter = document.getElementById('adj-dept-filter') ? document.getElementById('adj-dept-filter').value : '';



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

            updateAdjustmentsSummaryDOM(0, 0, 0);

            return;

        }

        if (empty) empty.style.display = 'none';



        let grandTotalAdditions = 0;

        let grandTotalDeductions = 0;



        activeEmps.forEach(emp => {

            const adj = getEmployeeAdjustmentRecord(cycleKey, emp.id);



            const totalAdditions = (Number(adj.visits) || 0) + 

                                   (Number(adj.cashback) || 0) + 

                                   (Number(adj.rewards) || 0) + 

                                   (Number(adj.adminAllowance) || 0) + 

                                   (Number(adj.bonus) || 0);



            const totalDeductions = (Number(adj.advances) || 0) + 

                                    (Number(adj.penalties) || 0) + 

                                    (Number(adj.insurance) || 0) + 

                                    (Number(adj.supplies) || 0) +

                                    (Number(adj.otherDeductions) || 0);



            const netAdjustment = totalAdditions - totalDeductions;



            grandTotalAdditions += totalAdditions;

            grandTotalDeductions += totalDeductions;



            const tr = document.createElement('tr');

            tr.setAttribute('data-empid', emp.id);

            tr.innerHTML = `

                <td class="sticky-col-1"><strong>#${emp.id}</strong></td>

                <td class="sticky-col-2"><strong>${emp.name}</strong></td>

                <td class="sticky-col-3"><span class="badge badge-dept">${emp.job}</span></td>

                <td><input type="number" step="any" class="att-cell-input adj-field" data-key="visits" value="${adj.visits || ''}" placeholder="0" oninput="onAdjustmentInputChanged(${emp.id}, this)" style="width:85px; text-align:center;"></td>

                <td><input type="number" step="any" class="att-cell-input adj-field" data-key="cashback" value="${adj.cashback || ''}" placeholder="0" oninput="onAdjustmentInputChanged(${emp.id}, this)" style="width:85px; text-align:center;"></td>

                <td><input type="number" step="any" class="att-cell-input adj-field" data-key="rewards" value="${adj.rewards || ''}" placeholder="0" oninput="onAdjustmentInputChanged(${emp.id}, this)" style="width:85px; text-align:center;"></td>

                <td><input type="number" step="any" class="att-cell-input adj-field" data-key="adminAllowance" value="${adj.adminAllowance || ''}" placeholder="0" oninput="onAdjustmentInputChanged(${emp.id}, this)" style="width:85px; text-align:center;"></td>

                <td><input type="number" step="any" class="att-cell-input adj-field" data-key="bonus" value="${adj.bonus || ''}" placeholder="0" oninput="onAdjustmentInputChanged(${emp.id}, this)" style="width:85px; text-align:center;"></td>

                <td><input type="number" step="any" class="att-cell-input adj-field" data-key="advances" value="${adj.advances || ''}" placeholder="0" oninput="onAdjustmentInputChanged(${emp.id}, this)" style="width:85px; text-align:center; color:#ef4444;"></td>

                <td><input type="number" step="any" class="att-cell-input adj-field" data-key="penalties" value="${adj.penalties || ''}" placeholder="0" oninput="onAdjustmentInputChanged(${emp.id}, this)" style="width:85px; text-align:center; color:#ef4444;"></td>

                <td><input type="number" step="any" class="att-cell-input adj-field" data-key="insurance" value="${adj.insurance || ''}" placeholder="0" oninput="onAdjustmentInputChanged(${emp.id}, this)" style="width:85px; text-align:center; color:#ef4444;"></td>

                <td><input type="number" step="any" class="att-cell-input adj-field" data-key="supplies" value="${adj.supplies || ''}" placeholder="0" oninput="onAdjustmentInputChanged(${emp.id}, this)" style="width:90px; text-align:center; color:#ef4444;"></td>

                <td><input type="number" step="any" class="att-cell-input adj-field" data-key="otherDeductions" value="${adj.otherDeductions || ''}" placeholder="0" oninput="onAdjustmentInputChanged(${emp.id}, this)" style="width:90px; text-align:center; color:#ef4444;"></td>

                <td style="color:#10b981; font-weight:800;" class="cell-total-additions">${totalAdditions.toFixed(2)}</td>

                <td style="color:#ef4444; font-weight:800;" class="cell-total-deductions">${totalDeductions.toFixed(2)}</td>

                <td style="color:var(--accent); font-weight:800; font-size:13.5px;" class="cell-net-adj">${netAdjustment >= 0 ? '+' + netAdjustment.toFixed(2) : netAdjustment.toFixed(2)}</td>

            `;

            tbody.appendChild(tr);

        });



        updateAdjustmentsSummaryDOM(grandTotalAdditions, grandTotalDeductions, grandTotalAdditions - grandTotalDeductions);

    }



    function onAdjustmentInputChanged(empId, inputEl) {

        pushAdjustmentsHistory();

        const cycleKey = getActiveAdjustmentCycleKey();

        const adj = getEmployeeAdjustmentRecord(cycleKey, empId);

        const key = inputEl.getAttribute('data-key');

        adj[key] = parseFloat(inputEl.value) || 0;



        // حفظ التسوية تحت كود الدورة وكود الشهر لضمان التزامن المباشر

        const parts = cycleKey.split('_');

        const monthKey = parts.length > 1 ? parts[1].substring(0, 7) : '';



        if (!salaryAdjustmentsDb[cycleKey]) salaryAdjustmentsDb[cycleKey] = {};

        salaryAdjustmentsDb[cycleKey][empId] = adj;



        if (monthKey) {

            if (!salaryAdjustmentsDb[monthKey]) salaryAdjustmentsDb[monthKey] = {};

            salaryAdjustmentsDb[monthKey][empId] = adj;

        }



        localStorage.setItem('erp_salary_adjustments_db', JSON.stringify(salaryAdjustmentsDb));

        if (typeof pushSingleCollectionToFirebase === 'function') pushSingleCollectionToFirebase('salaryAdjustments', salaryAdjustmentsDb);



        const tr = inputEl.closest('tr');

        if (tr) {

            const totalAdd = (Number(adj.visits) || 0) + 

                             (Number(adj.cashback) || 0) + 

                             (Number(adj.rewards) || 0) + 

                             (Number(adj.adminAllowance) || 0) + 

                             (Number(adj.bonus) || 0);



            const totalDed = (Number(adj.advances) || 0) + 

                             (Number(adj.penalties) || 0) + 

                             (Number(adj.insurance) || 0) + 

                             (Number(adj.supplies) || 0) +

                             (Number(adj.otherDeductions) || 0);



            const net = totalAdd - totalDed;



            const addEl = tr.querySelector('.cell-total-additions');

            const dedEl = tr.querySelector('.cell-total-deductions');

            const netEl = tr.querySelector('.cell-net-adj');



            if (addEl) addEl.textContent = totalAdd.toFixed(2);

            if (dedEl) dedEl.textContent = totalDed.toFixed(2);

            if (netEl) netEl.textContent = net >= 0 ? '+' + net.toFixed(2) : net.toFixed(2);

        }



        recalculateAdjustmentsTotalsOverall(cycleKey);

        renderAdjustmentsMonthsSummaryTable();

        if (typeof renderPayrollSummaryTable === 'function') renderPayrollSummaryTable();

    }



    function recalculateAdjustmentsTotalsOverall(cycleKey) {

        const parts = cycleKey.split('_');

        const monthKey = parts.length > 1 ? parts[1].substring(0, 7) : '';

        const cycleObj = salaryAdjustmentsDb[cycleKey] || salaryAdjustmentsDb[monthKey] || {};

        let totalAdd = 0;

        let totalDed = 0;



        employees.filter(e => e.status !== 'انتهت خدمته').forEach(emp => {

            const adj = cycleObj[emp.id] || {};

            totalAdd += (Number(adj.visits) || 0) + 

                        (Number(adj.cashback) || 0) + 

                        (Number(adj.rewards) || 0) + 

                        (Number(adj.adminAllowance) || 0) + 

                        (Number(adj.bonus) || 0);



            totalDed += (Number(adj.advances) || 0) + 

                        (Number(adj.penalties) || 0) + 

                        (Number(adj.insurance) || 0) + 

                        (Number(adj.supplies) || 0) +

                        (Number(adj.otherDeductions) || 0);

        });



        updateAdjustmentsSummaryDOM(totalAdd, totalDed, totalAdd - totalDed);

    }



    function updateAdjustmentsSummaryDOM(add, ded, net) {

        const addEl = document.getElementById('adj-summary-additions');

        const dedEl = document.getElementById('adj-summary-deductions');

        const netEl = document.getElementById('adj-summary-net');



        if (addEl) addEl.textContent = `${add.toLocaleString('ar-EG', {minimumFractionDigits: 2})} ج.م`;

        if (dedEl) dedEl.textContent = `${ded.toLocaleString('ar-EG', {minimumFractionDigits: 2})} ج.م`;

        if (netEl) netEl.textContent = `${net >= 0 ? '+' : ''}${net.toLocaleString('ar-EG', {minimumFractionDigits: 2})} ج.م`;

    }



    function getAdjustmentsPrintHtml() {

        sortEmployeesByDeptAndCode();

        const activeEmps = employees.filter(e => e.status !== 'انتهت خدمته');

        if (activeEmps.length === 0) {

            alert('لا يوجد موظفون على رأس العمل لطباعة كشف التسويات!');

            return null;

        }



        const cycleKey = getActiveAdjustmentCycleKey();

        const parts = cycleKey.split('_');

        const startStr = parts[0] || '';

        const endStr = parts[1] || '';

        const now = new Date();

        const printDate = `${now.getDate()} ${arabicMonths[now.getMonth()]} ${now.getFullYear()}`;



        let rowsHtml = '';

        let totAdd = 0, totDed = 0, totNet = 0;



        activeEmps.forEach((e, idx) => {

            const adj = getEmployeeAdjustmentRecord(cycleKey, e.id);

            const add = (Number(adj.visits) || 0) + 

                        (Number(adj.cashback) || 0) + 

                        (Number(adj.rewards) || 0) + 

                        (Number(adj.adminAllowance) || 0) + 

                        (Number(adj.bonus) || 0);



            const ded = (Number(adj.advances) || 0) + 

                        (Number(adj.penalties) || 0) + 

                        (Number(adj.insurance) || 0) + 

                        (Number(adj.supplies) || 0) +

                        (Number(adj.otherDeductions) || 0);



            const net = add - ded;

            totAdd += add; totDed += ded; totNet += net;



            rowsHtml += `

                <tr>

                    <td>${idx + 1}</td>

                    <td style="font-weight:bold; font-family:Consolas, monospace;">#${e.id}</td>

                    <td style="text-align:right; padding-right:8px; font-weight:bold;">${e.name}</td>

                    <td>${e.job}</td>

                    <td>${adj.visits ? Number(adj.visits).toLocaleString() : '-'}</td>

                    <td>${adj.cashback ? Number(adj.cashback).toLocaleString() : '-'}</td>

                    <td>${adj.rewards ? Number(adj.rewards).toLocaleString() : '-'}</td>

                    <td>${adj.adminAllowance ? Number(adj.adminAllowance).toLocaleString() : '-'}</td>

                    <td>${adj.bonus ? Number(adj.bonus).toLocaleString() : '-'}</td>

                    <td style="color:#b91c1c;">${adj.advances ? Number(adj.advances).toLocaleString() : '-'}</td>

                    <td style="color:#b91c1c;">${adj.penalties ? Number(adj.penalties).toLocaleString() : '-'}</td>

                    <td style="color:#b91c1c;">${adj.insurance ? Number(adj.insurance).toLocaleString() : '-'}</td>

                    <td style="color:#b91c1c;">${adj.supplies ? Number(adj.supplies).toLocaleString() : '-'}</td>

                    <td style="color:#b91c1c;">${adj.otherDeductions ? Number(adj.otherDeductions).toLocaleString() : '-'}</td>

                    <td style="font-weight:bold; color:#047857;">${add ? add.toLocaleString() : '0'}</td>

                    <td style="font-weight:bold; color:#b91c1c;">${ded ? ded.toLocaleString() : '0'}</td>

                    <td style="font-weight:bold;">${net >= 0 ? '+' : ''}${net.toLocaleString()}</td>

                </tr>

            `;

        });



        return `

            <!DOCTYPE html>

            <html lang="ar" dir="rtl">

            <head>

                <meta charset="UTF-8">

                <meta name="viewport" content="width=device-width, initial-scale=1">

                <title>كشف تسويات رواتب العاملين - عيادات سيدى ياقوت التخصصية</title>

                <style>

                    @page { size: A4 landscape; margin: 10mm; }

                    body { font-family: Tahoma, 'Segoe UI', Arial, sans-serif; direction: rtl; color: #000; margin: 0; padding: 10px; background:#fff; }

                    .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 8px; margin-bottom: 12px; }

                    .header h2 { margin: 0 0 4px 0; font-size: 19px; }

                    .header p { margin: 0; font-size: 12.5px; color: #333; }

                    table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 11px; text-align: center; }

                    th, td { border: 1.5px solid #000; padding: 5px 3px; }

                    th { background-color: #f1f5f9; font-weight: bold; }

                    .footer { margin-top: 25px; display: flex; justify-content: space-between; font-size: 12px; font-weight: bold; padding: 0 15px; }

                </style>

            </head>

            <body>

                ${typeof getClinicReportHeaderHtml === 'function' ? getClinicReportHeaderHtml('كشف تسويات رواتب العاملين والأطقم الطبية', `دورة احتساب الراتب من [ ${startStr} ] إلى [ ${endStr} ]`) : `
                <div class="header" style="text-align:center; border-bottom:2px solid #990012; padding-bottom:8px; margin-bottom:12px;">
                    <h2 style="margin:0; color:#102a45;">عيادات سيدى ياقوت التخصصية</h2>
                    <p style="margin:4px 0 0 0; font-size:12px; color:#475569;">كشف تسويات الرواتب لدورة احتساب الراتب من [ ${startStr} ] إلى [ ${endStr} ] | تاريخ الطباعة: ${printDate}</p>
                </div>`}

                <table>

                    <thead>

                        <tr>

                            <th style="width:25px;">م</th>

                            <th style="width:50px;">الكود</th>

                            <th style="width:160px;">اسم الموظف</th>

                            <th style="width:85px;">القسم</th>

                            <th>زيارات</th>

                            <th>كاش باك</th>

                            <th>مكافآت</th>

                            <th>بدل إدارة</th>

                            <th>بونص</th>

                            <th title="سلف يدوية إضافية فقط؛ أقساط طلبات السلف المعتمدة تُضاف آلياً إلى مسير الراتب">سلف يدوية إضافية</th>

                            <th>جزاءات</th>

                            <th>تأمينات</th>

                            <th>خصم مستلزمات</th>

                            <th>استقطاعات أخرى</th>

                            <th style="background:#d1fae5;">إجمالي الإضافات</th>

                            <th style="background:#fee2e2;">إجمالي الخصومات</th>

                            <th style="background:#e0f2fe;">صافي التسوية</th>

                        </tr>

                    </thead>

                    <tbody>

                        ${rowsHtml}

                        <tr style="font-weight:bold; background:#f8fafc;">

                            <td colspan="14" style="text-align:right; padding-right:12px;">الإجماليات العامة للمؤسسة:</td>

                            <td style="color:#047857;">${totAdd.toLocaleString()} ج.م</td>

                            <td style="color:#b91c1c;">${totDed.toLocaleString()} ج.م</td>

                            <td>${totNet >= 0 ? '+' : ''}${totNet.toLocaleString()} ج.م</td>

                        </tr>

                    </tbody>

                </table>

                <div class="footer">

                    <div>إجمالي عدد الموظفين النشطين: ${activeEmps.length} موظف</div>

                    <div>المسؤول المالي: .................................</div>

                    <div>اعتماد الإدارة: .................................</div>

                </div>

            </body>

            </html>

        `;

    }



    function printAdjustmentsSheet() {

        const printHtml = getAdjustmentsPrintHtml();

        if (!printHtml) return;



        let printWindow = null;

        try {

            printWindow = window.open('', '_blank');

        } catch(e) {

            printWindow = null;

        }



        if (printWindow) {

            printWindow.document.open();

            printWindow.document.write(printHtml + '<script>window.onload = function() { window.print(); };<\/script>');

            printWindow.document.close();

            printWindow.focus();

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

            fDoc.write(printHtml + '<script>window.onload = function() { window.print(); };<\/script>');

            fDoc.close();

            printFrame.contentWindow.focus();

        }

    }



    function exportAdjustmentsToPdf() {

        const printHtml = getAdjustmentsPrintHtml();

        if (!printHtml) return;

        const cycleKey = getActiveAdjustmentCycleKey();

        const filename = `كشف_تسويات_الرواتب_${cycleKey}.pdf`;

        downloadPrintHtmlAsPdf(printHtml, filename, 'landscape');

    }
