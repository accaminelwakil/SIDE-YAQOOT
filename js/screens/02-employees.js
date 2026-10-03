    // ==================== 1. شاشة تكويد الموظفين ====================

    let empHistory = [];



    function pushEmpHistory() {

        if (empHistory.length > 20) empHistory.shift();

        empHistory.push(JSON.stringify(employees));

    }



    function undoLastEmpAction() {

        if (empHistory.length === 0) {

            alert('لا توجد معاملات سابقة للتراجع عنها في هذه الجلسة!');

            return;

        }

        if (confirm('هل تريد التراجع عن آخر معاملة أجريتها في شاشة الموظفين؟')) {

            const prevState = empHistory.pop();

            employees = JSON.parse(prevState);

            saveEmployees(false);

            alert('تم التراجع عن آخر معاملة بنجاح!');

        }

    }



    function saveEmpDataExplicit() {

        saveEmployees(false);

        alert('تم حفظ كافة بيانات الموظفين والمعاملات الحالية بنجاح في المنظومة! 💾');

    }



    function getActiveEmployeesPrintHtml() {

        sortEmployeesByDeptAndCode();

        const activeEmps = employees.filter(e => e.status !== 'انتهت خدمته');

        if (activeEmps.length === 0) {

            alert('لا يوجد موظفون على رأس العمل لطباعة بياناتهم!');

            return null;

        }



        const now = new Date();

        const dateStr = `${now.getDate()} ${arabicMonths[now.getMonth()]} ${now.getFullYear()}`;



        let rowsHtml = '';

        activeEmps.forEach((e, idx) => {

            rowsHtml += `

                <tr>

                    <td class="col-seq">${idx + 1}</td>

                    <td class="col-code">${e.id}</td>

                    <td class="col-name">${e.name}</td>

                    <td class="col-dept">${e.job}</td>

                    <td class="col-sal">${Number(e.basicSalary).toLocaleString()}</td>

                    <td class="col-inc">${e.increaseAmount ? Number(e.increaseAmount).toLocaleString() : '-'}</td>

                    <td class="col-date">${e.lastIncreaseMonth || '-'}</td>

                    <td class="col-off">${e.offDay || '-'}</td>

                    <td class="col-empty"></td>

                </tr>

            `;

        });



        return `

            <!DOCTYPE html>

            <html lang="ar" dir="rtl">

            <head>

                <meta charset="UTF-8">

                <meta name="viewport" content="width=device-width, initial-scale=1">

                <title>كشف رواتب الموظفين - عيادات سيدى ياقوت التخصصية</title>

                <style>

                    @page { size: A4 portrait; margin: 10mm; }

                    body { font-family: Tahoma, 'Segoe UI', Arial, sans-serif; direction: rtl; color: #000; margin: 0; padding: 10px; background:#fff; }

                    .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 8px; margin-bottom: 12px; }

                    .header h2 { margin: 0 0 4px 0; font-size: 19px; }

                    .header p { margin: 0; font-size: 12px; color: #444; }

                    table { width: 100%; border-collapse: collapse; margin-top: 5px; font-size: 11.5px; text-align: center; }

                    th, td { border: 1.5px solid #000; padding: 6px 4px; }

                    th { background-color: #f1f5f9; font-weight: bold; }

                    

                    .col-seq { width: 30px; }

                    .col-code { width: 50px; font-weight: bold; font-family: Consolas, Arial; }

                    .col-name { width: 220px; text-align: right; padding-right: 8px; font-weight: bold; white-space: nowrap; }

                    .col-dept { width: 100px; }

                    .col-sal { width: 75px; font-weight: bold; }

                    .col-inc { width: 65px; }

                    .col-date { width: 85px; }

                    .col-off { width: 100px; }

                    .col-empty { width: 90px; }



                    .footer { margin-top: 25px; display: flex; justify-content: space-between; font-size: 12px; font-weight: bold; padding: 0 15px; }

                </style>

            </head>

            <body>

                ${typeof getClinicReportHeaderHtml === 'function' ? getClinicReportHeaderHtml('كشف بيانات رواتب وسراكي العاملين (على رأس العمل)', 'تاريخ الكشف: ' + dateStr, '<div>عدد الموظفين: ' + activeEmps.length + '</div>') : `
                <div class="header" style="text-align:center; border-bottom:2px solid #990012; padding-bottom:8px; margin-bottom:12px;">
                    <h2 style="margin:0; color:#102a45;">عيادات سيدى ياقوت التخصصية</h2>
                    <p style="margin:4px 0 0 0; font-size:12px; color:#475569;">كشف بيانات رواتب وسراكي العاملين (على رأس العمل) - تاريخ الاستخراج: ${dateStr}</p>
                </div>`}

                <table>

                    <thead>

                        <tr>

                            <th class="col-seq">م</th>

                            <th class="col-code">الكود</th>

                            <th class="col-name">اسم الموظف</th>

                            <th class="col-dept">القسم</th>

                            <th class="col-sal">الراتب</th>

                            <th class="col-inc">آخر زيادة</th>

                            <th class="col-date">تاريخ آخر زيادة</th>

                            <th class="col-off">يوم الإجازة</th>

                            <th class="col-empty">ملاحظات / توقيع</th>

                        </tr>

                    </thead>

                    <tbody>

                        ${rowsHtml}

                    </tbody>

                </table>

                <div class="footer">

                    <div>إجمالي عدد الموظفين: ${activeEmps.length} موظف</div>

                    <div>اعتماد الإدارة / الحسابات: .................................</div>

                </div>

            </body>

            </html>

        `;

    }



    function printActiveEmployeesOnly() {

        const html = getActiveEmployeesPrintHtml();

        if (!html) return;

        const printWindow = window.open('', '_blank');

        printWindow.document.write(html + '<script>window.onload = function() { window.print(); };<\/script>');

        printWindow.document.close();

    }



    function exportEmployeesToPdf() {

        const html = getActiveEmployeesPrintHtml();

        if (!html) return;

        const now = new Date();

        const filename = `كشف_بيانات_الموظفين_${now.getFullYear()}_${now.getMonth()+1}_${now.getDate()}.pdf`;

        downloadPrintHtmlAsPdf(html, filename, 'portrait');

    }



    function computeRates(basicSalary, shiftHours) {

        const b = parseFloat(basicSalary) || 0;

        const h = parseFloat(shiftHours) || 8;

        if (b <= 0 || h <= 0) return { hourlyRate: 0, ov1: 0, ov2: 0, ovMore: 0 };

        const rate = b / (30 * h);

        return {

            hourlyRate: parseFloat(rate.toFixed(2)),

            ov1: parseFloat((rate * 1.35).toFixed(2)),

            ov2: parseFloat((rate * 1.75).toFixed(2)),

            ovMore: parseFloat((rate * 2.0).toFixed(2))

        };
    }

    function onEmpNoUserCheckboxChanged(mode) {
        const isNew = mode === 'new';
        const noUserChk = document.getElementById(isNew ? 'new-emp-no-user' : 'edit-emp-no-user');
        const userFields = document.getElementById(isNew ? 'new-emp-user-fields' : 'edit-emp-user-fields');
        const hint = document.getElementById(isNew ? 'new-emp-user-hint' : 'edit-emp-user-hint');

        if (!noUserChk || !userFields) return;

        if (noUserChk.checked) {
            userFields.style.opacity = '0.35';
            userFields.style.pointerEvents = 'none';
            if (hint) hint.textContent = '🚫 لن يتم إنشاء أي حساب مستخدم لهذا الموظف (سركي ورقي فقط)';
        } else {
            userFields.style.opacity = '1';
            userFields.style.pointerEvents = 'auto';
            if (hint) hint.textContent = '✔ سيتم تفعيل حساب مستخدم للموظف لتسجيل الدخول للاطلاع على السركي';
        }
    }
    window.onEmpNoUserCheckboxChanged = onEmpNoUserCheckboxChanged;



    document.getElementById('emp-form').addEventListener('submit', function(e) {

        e.preventDefault();

        const name = document.getElementById('new-emp-name').value.trim();

        const job = document.getElementById('new-emp-job').value.trim();

        const basic = parseFloat(document.getElementById('new-emp-basic').value) || 0;

        const shiftHours = parseFloat(document.getElementById('new-emp-shift-hours').value) || 8;

        const offDay = document.getElementById('new-emp-off').value;



        if (!name || !job || basic <= 0) return;



        const rates = computeRates(basic, shiftHours);



        const noUserChk = document.getElementById('new-emp-no-user');
        const hasNoUser = noUserChk ? noUserChk.checked : false;
        const usernameInput = document.getElementById('new-emp-username');
        const passwordInput = document.getElementById('new-emp-password');

        const assignedCode = getNextCodeForDept(job);
        const username = hasNoUser ? '' : (usernameInput && usernameInput.value.trim() ? usernameInput.value.trim().toLowerCase() : `emp_${assignedCode}`);
        const pin = hasNoUser ? '' : (passwordInput && passwordInput.value.trim() ? passwordInput.value.trim() : '1234');

        const newEmp = {
            id: assignedCode,
            name: name,
            job: job,
            basicSalary: basic,
            shiftHours: shiftHours,
            hourlyRate: rates.hourlyRate,
            overtime1: rates.ov1,
            overtime2: rates.ov2,
            overtimeMore: rates.ovMore,
            offDay: offDay,
            lastIncreaseMonth: '-',
            salaryBefore: basic,
            increaseAmount: 0,
            status: 'نشط',
            hasNoUser: hasNoUser,
            username: username
        };

        // إنشاء حساب المستخدم في قاعدة بيانات المستخدمين إذا لم يكن معلماً بدون يوزر
        if (!hasNoUser && username) {
            if (typeof usersDb !== 'undefined' && Array.isArray(usersDb)) {
                // التأكد من عدم تكرار اسم المستخدم
                let finalUsername = username;
                let counter = 1;
                while (usersDb.some(u => u.username.toLowerCase() === finalUsername.toLowerCase())) {
                    finalUsername = `${username}_${counter}`;
                    counter++;
                }
                newEmp.username = finalUsername;

                usersDb.push({
                    username: finalUsername,
                    fullName: name,
                    role: 'employee',
                    empId: assignedCode,
                    pin: pin,
                    permissions: ['screen-employee-sarki'],
                    screenAccess: { 'screen-employee-sarki': 'view' },
                    createdAt: new Date().toISOString().split('T')[0]
                });
                localStorage.setItem('erp_users_db', JSON.stringify(usersDb));
                if (typeof pushSingleCollectionToFirebase === 'function') pushSingleCollectionToFirebase('users', usersDb);
                if (typeof renderUsersTable === 'function') renderUsersTable();
                if (typeof populateUserSelectDropdowns === 'function') populateUserSelectDropdowns();
            }
        }

        pushEmpHistory();
        employees.push(newEmp);
        saveEmployees();

        this.reset();
        document.getElementById('new-emp-shift-hours').value = '8';
        if (noUserChk) noUserChk.checked = false;
        onEmpNoUserCheckboxChanged('new');

        const userMsg = hasNoUser ? 'بدون حساب مستخدم (سركي ورقي فقط)' : `مع تفعيل حساب مستخدم: [${newEmp.username}]`;
        alert(`تم تكويد وحفظ الموظف (${name}) بنجاح!\n${userMsg}`);

    });



    function saveEmployees() {

        sortEmployeesByDeptAndCode();

        localStorage.setItem('erp_employees_db', JSON.stringify(employees));

        updateAllDeptDropdownsAndFilters();

        renderEmployeesTable();

        populateAllEmployeeDropdowns();

        renderWelcomeDashboard();

        if (typeof pushSingleCollectionToFirebase === 'function') pushSingleCollectionToFirebase('employees', employees);

    }



    function renderEmployeesTable() {

        sortEmployeesByDeptAndCode();

        const tbody = document.getElementById('employees-tbody');

        const empty = document.getElementById('emp-empty');

        if (typeof window !== 'undefined' && typeof employees !== 'undefined') window.employees = employees;

        const term = (document.getElementById('emp-search') ? document.getElementById('emp-search').value : '').trim();

        const normTerm = typeof normalizeArabicText === 'function' ? normalizeArabicText(term) : term.toLowerCase();

        const deptFilter = document.getElementById('dept-filter') ? document.getElementById('dept-filter').value : '';

        const statusFilter = document.getElementById('status-filter') ? document.getElementById('status-filter').value : '';



        tbody.innerHTML = '';

        const filtered = employees.filter(e => {

            const normName = typeof normalizeArabicText === 'function' ? normalizeArabicText(e.name) : (e.name || '').toLowerCase();

            const normJob = typeof normalizeArabicText === 'function' ? normalizeArabicText(e.job) : (e.job || '').toLowerCase();

            const idStr = String(e.id || '');

            const matchName = !term || normName.includes(normTerm) || normJob.includes(normTerm) || idStr.includes(term);

            const matchDept = deptFilter ? e.job === deptFilter : true;

            const matchStatus = statusFilter ? e.status === statusFilter : true;

            return matchName && matchDept && matchStatus;

        });



        if (filtered.length === 0) {

            empty.style.display = 'block';

        } else {

            empty.style.display = 'none';

            filtered.forEach(e => {

                const rates = computeRates(e.basicSalary, e.shiftHours);

                const tr = document.createElement('tr');

                tr.innerHTML = `

                    <td class="sticky-col-1"><strong>#${e.id}</strong></td>
                    <td class="sticky-col-2"><strong>${e.name}</strong></td>
                    <td class="sticky-col-3"><span class="badge badge-dept">${e.job}</span></td>
                    <td>
                        ${(e.hasNoUser === true)
                            ? '<span class="badge" style="background:#fee2e2; color:#b91c1c; font-weight:700;">🚫 بدون يوزر</span>'
                            : `<span class="badge badge-status-active" style="font-family:Consolas, monospace;">👤 ${e.username || ('emp_' + e.id)}</span>`
                        }
                    </td>
                    <td>${e.offDay || '-'}</td>

                    <td style="color:var(--accent); font-weight:bold;">${Number(e.basicSalary).toLocaleString()} ج.م</td>

                    <td>${e.shiftHours || 8} ساعات</td>

                    <td><span class="badge badge-rate">${rates.hourlyRate.toFixed(2)} ج.م</span></td>

                    <td>${rates.ov1.toFixed(2)} ج.م</td>

                    <td>${rates.ov2.toFixed(2)} ج.م</td>

                    <td>${rates.ovMore.toFixed(2)} ج.م</td>

                    <td><span class="badge badge-increase">${e.lastIncreaseMonth || '-'}</span></td>

                    <td style="color:var(--text-muted);">${e.salaryBefore ? Number(e.salaryBefore).toLocaleString() + ' ج.م' : '-'}</td>

                    <td style="color:var(--success); font-weight:bold;">${e.increaseAmount ? '+' + Number(e.increaseAmount).toLocaleString() + ' ج.م' : '-'}</td>

                    <td>

                        <span class="badge ${e.status === 'انتهت خدمته' ? 'badge-status-left' : 'badge-status-active'}">

                            ${e.status || 'نشط'}

                        </span>

                    </td>

                    <td>

                        <div style="display:flex; gap:5px; justify-content:center;">

                            <button class="btn-action-edit" title="تعديل كافة بيانات الموظف" onclick="openEditEmployeeModal(${e.id})">✏️ تعديل</button>

                            <button class="btn-action-status" title="تغيير الحالة (نشط / انتهت خدمته)" onclick="toggleEmployeeStatus(${e.id})">

                                ${e.status === 'انتهت خدمته' ? 'إعادة للخدمة' : 'إنهاء خدمة'}

                            </button>

                            <button class="btn-danger" title="حذف نهائي" onclick="deleteEmployee(${e.id})">🗑️</button>

                        </div>

                    </td>

                `;

                tbody.appendChild(tr);

            });

        }

    }



    function openEditEmployeeModal(empId) {

        const emp = employees.find(e => e.id === empId);

        if (!emp) return;

        document.getElementById('edit-emp-id').value = emp.id;

        document.getElementById('edit-emp-name').value = emp.name;

        document.getElementById('edit-emp-job').value = emp.job;

        document.getElementById('edit-emp-basic').value = emp.basicSalary;

        document.getElementById('edit-emp-shift-hours').value = emp.shiftHours || 8;

        document.getElementById('edit-emp-off').value = emp.offDay || 'الجمعة (Friday)';
        document.getElementById('edit-emp-status').value = emp.status || 'نشط';

        // ضبط بيانات حساب المستخدم
        const noUserChk = document.getElementById('edit-emp-no-user');
        const usernameInput = document.getElementById('edit-emp-username');
        const passwordInput = document.getElementById('edit-emp-password');

        if (noUserChk) {
            noUserChk.checked = emp.hasNoUser === true;
        }
        if (usernameInput) {
            usernameInput.value = emp.username || (emp.hasNoUser ? '' : `emp_${emp.id}`);
        }
        if (passwordInput) {
            passwordInput.value = '';
        }
        onEmpNoUserCheckboxChanged('edit');

        document.getElementById('modal-edit-emp').style.display = 'flex';

    }



    function closeEditModal() {

        document.getElementById('modal-edit-emp').style.display = 'none';

    }



    document.getElementById('edit-emp-form').addEventListener('submit', function(e) {

        e.preventDefault();

        const id = parseInt(document.getElementById('edit-emp-id').value);

        const emp = employees.find(e => e.id === id);

        if (!emp) return;



        pushEmpHistory();

        emp.name = document.getElementById('edit-emp-name').value.trim();

        emp.job = document.getElementById('edit-emp-job').value.trim();

        const newBasic = parseFloat(document.getElementById('edit-emp-basic').value) || 0;

        const newShift = parseFloat(document.getElementById('edit-emp-shift-hours').value) || 8;

        emp.basicSalary = newBasic;

        emp.shiftHours = newShift;

        emp.offDay = document.getElementById('edit-emp-off').value;

        emp.status = document.getElementById('edit-emp-status').value;

        // معالجة حساب المستخدم عند التعديل
        const noUserChk = document.getElementById('edit-emp-no-user');
        const hasNoUser = noUserChk ? noUserChk.checked : false;
        const usernameInput = document.getElementById('edit-emp-username');
        const passwordInput = document.getElementById('edit-emp-password');

        emp.hasNoUser = hasNoUser;

        if (hasNoUser) {
            // حذف أو إيقاف الحساب للمستخدم
            emp.username = '';
            if (typeof usersDb !== 'undefined' && Array.isArray(usersDb)) {
                usersDb = usersDb.filter(u => u.empId !== emp.id);
                localStorage.setItem('erp_users_db', JSON.stringify(usersDb));
                if (typeof renderUsersTable === 'function') renderUsersTable();
                if (typeof populateUserSelectDropdowns === 'function') populateUserSelectDropdowns();
            }
        } else {
            const enteredUsername = usernameInput && usernameInput.value.trim() ? usernameInput.value.trim().toLowerCase() : (emp.username || `emp_${emp.id}`);
            const enteredPin = passwordInput && passwordInput.value.trim() ? passwordInput.value.trim() : null;

            emp.username = enteredUsername;

            if (typeof usersDb !== 'undefined' && Array.isArray(usersDb)) {
                let user = usersDb.find(u => u.empId === emp.id || u.username.toLowerCase() === enteredUsername.toLowerCase());
                if (user) {
                    user.username = enteredUsername;
                    user.fullName = emp.name;
                    user.empId = emp.id;
                    if (enteredPin) user.pin = enteredPin;
                } else {
                    usersDb.push({
                        username: enteredUsername,
                        fullName: emp.name,
                        role: 'employee',
                        empId: emp.id,
                        pin: enteredPin || '1234',
                        permissions: ['screen-employee-sarki'],
                        screenAccess: { 'screen-employee-sarki': 'view' },
                        createdAt: new Date().toISOString().split('T')[0]
                    });
                }
                localStorage.setItem('erp_users_db', JSON.stringify(usersDb));
                if (typeof renderUsersTable === 'function') renderUsersTable();
                if (typeof populateUserSelectDropdowns === 'function') populateUserSelectDropdowns();
            }
        }

        const rates = computeRates(newBasic, newShift);
        emp.hourlyRate = rates.hourlyRate;
        emp.overtime1 = rates.ov1;
        emp.overtime2 = rates.ov2;
        emp.overtimeMore = rates.ovMore;

        saveEmployees();
        closeEditModal();
        alert('تم تعديل بيانات الموظف وحساب المستخدم بنجاح!');

    });



    function toggleEmployeeStatus(empId) {

        const emp = employees.find(e => e.id === empId);

        if (!emp) return;

        const newStatus = emp.status === 'انتهت خدمته' ? 'نشط' : 'انتهت خدمته';

        if (confirm(`هل أنت متأكد من تغيير حالة الموظف (${emp.name}) إلى [${newStatus}]؟`)) {

            pushEmpHistory();

            emp.status = newStatus;

            saveEmployees();

        }

    }



    function openBatchIncreaseModal() {

        const select = document.getElementById('inc-emp-select');

        select.innerHTML = '<option value="">-- اختر موظف من القائمة --</option>';

        employees.filter(e => e.status !== 'انتهت خدمته').forEach(e => {

            const opt = document.createElement('option');

            opt.value = e.id;

            opt.textContent = `${e.name} (الراتب الحالي: ${e.basicSalary} ج.م)`;

            select.appendChild(opt);

        });



        const now = new Date();

        document.getElementById('inc-month').value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

        document.getElementById('inc-current-salary').value = '';

        document.getElementById('inc-amount').value = '';

        document.getElementById('inc-new-salary').value = '';



        document.getElementById('modal-salary-increase').style.display = 'flex';

    }



    function closeIncreaseModal() {

        document.getElementById('modal-salary-increase').style.display = 'none';

    }



    function onIncreaseEmpChange() {

        const empId = parseInt(document.getElementById('inc-emp-select').value);

        const emp = employees.find(e => e.id === empId);

        if (emp) {

            document.getElementById('inc-current-salary').value = `${emp.basicSalary} ج.م`;

            calcNewSalaryPreview();

        } else {

            document.getElementById('inc-current-salary').value = '';

            document.getElementById('inc-new-salary').value = '';

        }

    }



    function calcNewSalaryPreview() {

        const empId = parseInt(document.getElementById('inc-emp-select').value);

        const emp = employees.find(e => e.id === empId);

        const inc = parseFloat(document.getElementById('inc-amount').value) || 0;

        if (emp && inc >= 0) {

            document.getElementById('inc-new-salary').value = `${emp.basicSalary + inc} ج.م`;

        }

    }



    document.getElementById('increase-emp-form').addEventListener('submit', function(e) {

        e.preventDefault();

        const empId = parseInt(document.getElementById('inc-emp-select').value);

        const emp = employees.find(e => e.id === empId);

        const incAmount = parseFloat(document.getElementById('inc-amount').value) || 0;

        const monthVal = document.getElementById('inc-month').value;



        if (!emp || incAmount <= 0 || !monthVal) {

            alert('يرجى اختيار الموظف وإدخال قيمة زيادة صحيحة وشهر التطبيق!');

            return;

        }



        const [y, m] = monthVal.split('-');

        const monthName = arabicMonths[parseInt(m) - 1];

        const formattedMonth = `${monthName} ${y}`;



        pushEmpHistory();

        emp.salaryBefore = emp.basicSalary;

        emp.increaseAmount = incAmount;

        emp.basicSalary = emp.basicSalary + incAmount;

        emp.lastIncreaseMonth = formattedMonth;



        const rates = computeRates(emp.basicSalary, emp.shiftHours);

        emp.hourlyRate = rates.hourlyRate;

        emp.overtime1 = rates.ov1;

        emp.overtime2 = rates.ov2;

        emp.overtimeMore = rates.ovMore;



        saveEmployees();

        closeIncreaseModal();

        alert(`تم اعتماد وتطبيق زيادة الراتب بنجاح للموظف (${emp.name}):

الراتب السابق: ${emp.salaryBefore} ج.م

قيمة الزيادة: +${incAmount} ج.م

الراتب الجديد: ${emp.basicSalary} ج.م

شهر الزيادة: ${formattedMonth}`);

    });



    function deleteEmployee(id) {

        const emp = employees.find(e => e.id === id);

        if (confirm(`هل أنت متأكد من حذف الموظف (${emp ? emp.name : ''}) نهائياً من المنظومة؟`)) {

            pushEmpHistory();

            employees = employees.filter(e => e.id !== id);

            saveEmployees();

        }

    }



    function resetToInitialData() {

        if (confirm('هل تريد استعادة قاعدة بيانات الـ 34 موظف الأصلية؟')) {

            employees = INITIAL_EMPLOYEES;

            saveEmployees();

            updateAllDeptDropdownsAndFilters();

            alert('تم استعادة بيانات الموظفين الـ 34 بنجاح!');

        }

    }



    function updateAllDeptDropdownsAndFilters() {

        const deptsSet = new Set(Object.keys(KNOWN_DEPTS).map(d => d === 'ادارة' ? 'إدارة' : d));

        employees.forEach(e => {

            if (e.job && e.job.trim()) {

                const j = e.job.trim();
                deptsSet.add(j === 'ادارة' ? 'إدارة' : j);

            }

        });



        const sortedDepts = Array.from(deptsSet).sort((a, b) => a.localeCompare(b, 'ar'));
        if (typeof departments !== 'undefined' && JSON.stringify(sortedDepts) !== JSON.stringify(departments)) {
            departments = sortedDepts;
            localStorage.setItem('erp_departments', JSON.stringify(departments));
            if (typeof pushSingleCollectionToFirebase === 'function') pushSingleCollectionToFirebase('departments', departments);
        }



        const deptFilter = document.getElementById('dept-filter');

        if (deptFilter) {

            const currentVal = deptFilter.value;

            deptFilter.innerHTML = '<option value="">جميع الأقسام</option>';

            sortedDepts.forEach(d => {

                const opt = document.createElement('option');

                opt.value = d;

                opt.textContent = d;

                deptFilter.appendChild(opt);

            });

            if (sortedDepts.includes(currentVal)) {

                deptFilter.value = currentVal;

            }

        }



        const allSarakiDept = document.getElementById('all-saraki-dept');

        if (allSarakiDept) {

            const currentVal = allSarakiDept.value;

            allSarakiDept.innerHTML = '<option value="">جميع الأقسام</option>';

            sortedDepts.forEach(d => {

                const opt = document.createElement('option');

                opt.value = d;

                opt.textContent = d;

                allSarakiDept.appendChild(opt);

            });

            if (sortedDepts.includes(currentVal)) {

                allSarakiDept.value = currentVal;

            }

        }



        const adjDeptFilter = document.getElementById('adj-dept-filter');

        if (adjDeptFilter) {

            const currentVal = adjDeptFilter.value;

            adjDeptFilter.innerHTML = '<option value="">جميع الأقسام</option>';

            sortedDepts.forEach(d => {

                const opt = document.createElement('option');

                opt.value = d;

                opt.textContent = d;

                adjDeptFilter.appendChild(opt);

            });

            if (sortedDepts.includes(currentVal)) {

                adjDeptFilter.value = currentVal;

            }

        }



        const psummaryDeptFilter = document.getElementById('psummary-dept-filter');

        if (psummaryDeptFilter) {

            const currentVal = psummaryDeptFilter.value;

            psummaryDeptFilter.innerHTML = '<option value="">جميع الأقسام</option>';

            sortedDepts.forEach(d => {

                const opt = document.createElement('option');

                opt.value = d;

                opt.textContent = d;

                psummaryDeptFilter.appendChild(opt);

            });

            if (sortedDepts.includes(currentVal)) {

                psummaryDeptFilter.value = currentVal;

            }

        }



        const bulkDeptFilter = document.getElementById('bulk-payslips-dept-filter');

        if (bulkDeptFilter) {

            const currentVal = bulkDeptFilter.value;

            bulkDeptFilter.innerHTML = '<option value="">جميع الأقسام (الكل)</option>';
            bulkDeptFilter.innerHTML += '<option value="__NO_USER__" style="color:#b91c1c; font-weight:bold;">📋 موظفين بدون يوزر (سراكي ورقية فقط)</option>';

            sortedDepts.forEach(d => {
                const opt = document.createElement('option');
                opt.value = d;
                opt.textContent = d;
                bulkDeptFilter.appendChild(opt);
            });

            if (sortedDepts.includes(currentVal) || currentVal === '__NO_USER__') {
                bulkDeptFilter.value = currentVal;
            }
        }

        const jobsList = document.getElementById('jobs-list');
        if (jobsList) {
            jobsList.innerHTML = '';
            sortedDepts.forEach(d => {
                const opt = document.createElement('option');
                opt.value = d;
                jobsList.appendChild(opt);
            });
        }

        if (typeof refreshAllSearchableSelects === 'function') refreshAllSearchableSelects();
    }

    function populateAllEmployeeDropdowns() {
        const selects = ['att-emp-select', 'sarki-emp-select', 'rep-emp-profile-select'];
        selects.forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            const currentVal = el.value;
            el.innerHTML = '<option value="">-- اختر موظف من القائمة --</option>';
            employees.filter(e => e.status !== 'انتهت خدمته').forEach(emp => {
                const opt = document.createElement('option');
                opt.value = emp.id;
                opt.textContent = emp.name;
                el.appendChild(opt);
            });
            if (currentVal) el.value = currentVal;
        });

        const badgeEl = document.getElementById('badge-emp-count');
        if (badgeEl) badgeEl.innerText = employees.filter(e => e.status !== 'انتهت خدمته').length;
    }

    // ── مزامنة حسابات المستخدمين لجميع الموظفين الحاليين ────────────────
    function syncEmployeesWithUsersDb() {
        if (typeof employees === 'undefined' || !Array.isArray(employees)) return;
        if (typeof usersDb === 'undefined' || !Array.isArray(usersDb)) return;

        let empChanged = false;
        let usersChanged = false;

        employees.forEach(emp => {
            if (!emp) return;
            if (emp.hasNoUser === undefined) {
                emp.hasNoUser = false;
                empChanged = true;
            }
            if (!emp.hasNoUser) {
                if (!emp.username) {
                    emp.username = `emp_${emp.id}`;
                    empChanged = true;
                }

                let user = usersDb.find(u => u.empId === emp.id || (u.username && u.username.toLowerCase() === emp.username.toLowerCase()));
                if (!user) {
                    user = {
                        username: emp.username,
                        fullName: emp.name,
                        role: 'employee',
                        empId: emp.id,
                        pin: '1234',
                        permissions: ['screen-employee-sarki'],
                        screenAccess: { 'screen-employee-sarki': 'view' },
                        createdAt: new Date().toISOString().split('T')[0]
                    };
                    usersDb.push(user);
                    usersChanged = true;
                } else {
                    if (!user.empId) { user.empId = emp.id; usersChanged = true; }
                    if (!user.screenAccess) { user.screenAccess = { 'screen-employee-sarki': 'view' }; usersChanged = true; }
                }
            }
        });

        if (empChanged) {
            localStorage.setItem('erp_employees_db', JSON.stringify(employees));
        }
        if (usersChanged) {
            localStorage.setItem('erp_users_db', JSON.stringify(usersDb));
            if (typeof renderUsersTable === 'function') renderUsersTable();
            if (typeof populateUserSelectDropdowns === 'function') populateUserSelectDropdowns();
        }
    }

    // تشغيل المزامنة فوراً عند تحميل ملف الموظفين
    syncEmployeesWithUsersDb();
    window.syncEmployeesWithUsersDb = syncEmployeesWithUsersDb;



