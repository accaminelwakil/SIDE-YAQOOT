    // ==================== 2. تسجيل الحضور والانصراف (النسخة التفاعلية الفورية) ====================

    let currentDailyAttendance = [];

    let dailyAttendanceHistory = [];

    const ARABIC_WEEKDAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];



    function pushAttendanceHistory() {

        if (dailyAttendanceHistory.length > 20) dailyAttendanceHistory.shift();

        dailyAttendanceHistory.push(JSON.stringify(currentDailyAttendance));

    }



    function undoAttendanceAction() {

        if (dailyAttendanceHistory.length === 0) {

            alert('لا توجد حركات سابقة للتراجع عنها في هذه الجلسة!');

            return;

        }

        if (confirm('هل تريد التراجع عن آخر تعديل في اليومية؟')) {

            const prevState = dailyAttendanceHistory.pop();

            currentDailyAttendance = JSON.parse(prevState);

            renderDailyAttendanceTable();

            alert('تم التراجع بنجاح!');

        }

    }



    function saveDailyAttendanceExplicit() {

        syncCurrentTableRowsToMemory();

        localStorage.setItem('erp_daily_draft_' + getActiveShiftDate(), JSON.stringify(currentDailyAttendance));

        alert('تم حفظ مسودة اليومية الحالية بنجاح! 💾');

    }



    function getActiveShiftDate() {

        const input = document.getElementById('att-shift-date');

        if (input && input.value) return input.value;

        const today = new Date().toISOString().split('T')[0];

        if (input) input.value = today;

        return today;

    }



    function onShiftDateChanged() {

        const dateVal = getActiveShiftDate();

        loadDailyAttendanceForDate(dateVal);

    }



    function loadPreviousDayForEdit() {

        const editDateInput = document.getElementById('att-edit-date-input');

        if (!editDateInput || !editDateInput.value) {

            alert('يرجى اختيار تاريخ اليومية المراد تعديلها أولاً!');

            return;

        }

        const targetDate = editDateInput.value;

        document.getElementById('att-shift-date').value = targetDate;

        loadDailyAttendanceForDate(targetDate);

        const savedCount = attendanceRecords.filter(r => r.date === targetDate).length;

        if (savedCount > 0) {

            alert(`تم استدعاء يومية [ ${targetDate} ] بنجاح وتتضمن عدد (${savedCount}) موظف! يمكنك الآن تعديل الساعات وإعادة قفلها.`);

        } else {

            alert(`تم فتح يومية [ ${targetDate} ] وجاهزة لتسجيل أو تعديل الحضور.`);

        }

    }



    function updateAttendanceDatalist() {

        const dl = document.getElementById('emp-attendance-datalist');

        if (!dl) return;

        dl.innerHTML = '';

        const activeEmps = employees.filter(e => e.status !== 'انتهت خدمته');

        activeEmps.forEach(e => {

            const opt = document.createElement('option');

            opt.value = e.name;

            dl.appendChild(opt);

        });

    }



    let officialHolidaysDb = JSON.parse(localStorage.getItem('erp_official_holidays_db') || '[]');



    function onHolidayCheckboxChanged() {

        const dateVal = getActiveShiftDate();

        const chk = document.getElementById('att-is-holiday');

        if (!chk) return;

        const isHol = chk.checked;

        if (isHol) {

            if (!officialHolidaysDb.includes(dateVal)) officialHolidaysDb.push(dateVal);

        } else {

            officialHolidaysDb = officialHolidaysDb.filter(d => d !== dateVal);

        }

        localStorage.setItem('erp_official_holidays_db', JSON.stringify(officialHolidaysDb));
        if (typeof pushSingleCollectionToFirebase === 'function') pushSingleCollectionToFirebase('officialHolidays', officialHolidaysDb);

        if (isHol) {

            alert(`تم تحديد يوم [ ${dateVal} ] كإجازة رسمية! سيتم احتساب يوم عمل زيادة كبدل إجازة رسمية لكل موظف يحضر في هذا اليوم.`);

        }

    }



    function loadDailyAttendanceForDate(dateVal) {

        updateAttendanceDatalist();

        const savedRecords = attendanceRecords.filter(r => r.date === dateVal);

        const holChk = document.getElementById('att-is-holiday');

        if (holChk) {

            const isSavedHoliday = (savedRecords && savedRecords.some(r => r.isHoliday)) || (officialHolidaysDb && officialHolidaysDb.includes(dateVal));

            holChk.checked = Boolean(isSavedHoliday);

        }



        if (savedRecords.length > 0) {

            currentDailyAttendance = savedRecords.map(r => ({

                empId: r.empId,

                name: r.name,

                job: r.job,

                shiftHours: r.basicHours || 8,

                timeIn: (r.timeIn && r.timeIn !== '-') ? r.timeIn : '',

                timeOut: (r.timeOut && r.timeOut !== '-') ? r.timeOut : '',

                hours: r.hours || 0,

                basicHours: r.basicHours || 0,

                ovTotal: r.ovTotal || 0,

                ov1: r.ov1 || 0,

                ov2: r.ov2 || 0,

                ovMore: r.ovMore || 0

            }));

        } else {

            const draft = localStorage.getItem('erp_daily_draft_' + dateVal);

            if (draft) {

                currentDailyAttendance = JSON.parse(draft);

            } else {

                // فتح 25 صفاً أولياً مجهزاً للإدخال والاختيار المباشر

                currentDailyAttendance = [];

                for (let i = 0; i < 25; i++) {

                    currentDailyAttendance.push({

                        empId: '',

                        name: '',

                        job: '',

                        shiftHours: 8,

                        timeIn: '',

                        timeOut: '',

                        hours: 0,

                        basicHours: 0,

                        ovTotal: 0,

                        ov1: 0,

                        ov2: 0,

                        ovMore: 0

                    });

                }

            }

        }



        dailyAttendanceHistory = [];

        renderDailyAttendanceTable();

    }



    // زر استدعاء جميع الموظفين النشطين في اليومية دفعة واحدة

    function populateAllActiveToDaily() {

        const activeEmps = employees.filter(e => e.status !== 'انتهت خدمته');

        if (activeEmps.length === 0) return alert('لا يوجد موظفون نشطون!');

        

        syncCurrentTableRowsToMemory();

        pushAttendanceHistory();

        

        currentDailyAttendance = activeEmps.map(e => ({

            empId: e.id,

            name: e.name,

            job: e.job,

            shiftHours: e.shiftHours || 8,

            timeIn: '',

            timeOut: '',

            hours: 0,

            basicHours: 0,

            ovTotal: 0,

            ov1: 0,

            ov2: 0,

            ovMore: 0

        }));



        renderDailyAttendanceTable();

        alert('تم تحميل جميع الموظفين النشطين في جدول اليومية مرتبين أبجدياً بحسب أقسامهم! يمكنك ملء أوقاتهم أو حفظهم مباشرة.');

    }



    function addBlankAttendanceRow() {

        syncCurrentTableRowsToMemory();

        pushAttendanceHistory();

        currentDailyAttendance.push({

            empId: '',

            name: '',

            job: '',

            shiftHours: 8,

            timeIn: '',

            timeOut: '',

            hours: 0,

            basicHours: 0,

            ovTotal: 0,

            ov1: 0,

            ov2: 0,

            ovMore: 0

        });

        renderDailyAttendanceTable();

    }



    function removeAttendanceRow(idx) {

        syncCurrentTableRowsToMemory();

        pushAttendanceHistory();

        currentDailyAttendance.splice(idx, 1);

        if (currentDailyAttendance.length === 0) {

            addBlankAttendanceRow();

        } else {

            renderDailyAttendanceTable();

        }

    }



    function syncCurrentTableRowsToMemory() {

        const tbody = document.getElementById('daily-attendance-tbody');

        if (!tbody) return;

        const rows = tbody.querySelectorAll('tr');



        rows.forEach((tr, idx) => {

            if (!currentDailyAttendance[idx]) return;

            const searchInp = tr.querySelector('.cell-emp-search');

            const inEl = tr.querySelector('.cell-time-in');

            const outEl = tr.querySelector('.cell-time-out');



            if (inEl) currentDailyAttendance[idx].timeIn = inEl.value.trim();

            if (outEl) currentDailyAttendance[idx].timeOut = outEl.value.trim();

        });

    }



    function renderDailyAttendanceTable() {

        const tbody = document.getElementById('daily-attendance-tbody');

        if (!tbody) return;

        tbody.innerHTML = '';



        updateAttendanceDatalist();



        currentDailyAttendance.forEach((item, idx) => {

            const tr = document.createElement('tr');

            tr.setAttribute('data-idx', idx);



            const displayVal = item.name || '';



            tr.innerHTML = `

                <td class="sticky-col-1" style="background:#ffffff;">

                    <span class="cell-code-display att-val-badge" style="color:var(--accent); font-family:Consolas, monospace;">${item.empId ? '#' + item.empId : '-'}</span>

                </td>

                <td class="sticky-col-2" style="background:#ffffff;">

                    <input type="text" class="cell-emp-search att-select-emp" value="${displayVal}" placeholder="🔍 اكتب حرفين أو اختر..." oninput="onRowEmployeeTyped(${idx}, this)" onblur="onRowEmployeeBlur(${idx}, this)" onkeydown="onRowEmployeeKeydown(event, ${idx}, this)" onfocus="this.select()" autocomplete="off" title="اكتب أي حرفين أو كود الموظف للاختيار السريع">

                </td>

                <td>

                    <span class="cell-dept-display att-val-badge badge-dept">${item.job || '-'}</span>

                </td>

                <td>

                    <input type="text" class="cell-time-in att-input-time" value="${item.timeIn || ''}" placeholder="08:30" oninput="onRowTimeInputChanged(${idx}, this)" onchange="onRowTimeInputChanged(${idx}, this)" onblur="formatTimeInputOnBlur(this, ${idx})" title="ساعة الحضور بنظام 24س">

                </td>

                <td>

                    <input type="text" class="cell-time-out att-input-time" value="${item.timeOut || ''}" placeholder="19:00" oninput="onRowTimeInputChanged(${idx}, this)" onchange="onRowTimeInputChanged(${idx}, this)" onblur="formatTimeInputOnBlur(this, ${idx})" title="ساعة الانصراف بنظام 24س">

                </td>

                <td>

                    <span class="cell-total-hours att-val-badge" style="color:var(--accent);">${item.hours ? item.hours.toFixed(2) : '-'}</span>

                </td>

                <td>

                    <span class="cell-basic-hours att-val-badge">${item.basicHours ? item.basicHours.toFixed(2) : '-'}</span>

                </td>

                <td>

                    <span class="cell-ov-total att-val-badge" style="color:var(--warning);">${item.ovTotal ? item.ovTotal.toFixed(2) : '-'}</span>

                </td>

            `;

            tbody.appendChild(tr);



            const searchInput = tr.querySelector('.cell-emp-search');

            if (searchInput && typeof attachEmployeeAutocomplete === 'function') {

                attachEmployeeAutocomplete(searchInput, {

                    onSelect: function(emp) {
                        const allEmps = (typeof employees !== 'undefined' ? employees : (window.employees || []));
                        const activeEmp = allEmps.find(e => e.id === emp.id && e.status !== 'انتهت خدمته');
                        if (!activeEmp) {
                            searchInput.value = '';
                            item.empId = '';
                            item.name = '';
                            item.job = '';
                            const codeDisplay = tr.querySelector('.cell-code-display');
                            const deptDisplay = tr.querySelector('.cell-dept-display');
                            if (codeDisplay) codeDisplay.textContent = '-';
                            if (deptDisplay) deptDisplay.textContent = '-';
                            updateDailyAttendancePresentCount();
                            alert('سجل الموظف اولا');
                            return;
                        }

                        item.empId = activeEmp.id;
                        item.name = activeEmp.name;
                        item.job = activeEmp.job;
                        item.shiftHours = activeEmp.shiftHours || 8;
                        searchInput.value = activeEmp.name;

                        const codeDisplay = tr.querySelector('.cell-code-display');
                        const deptDisplay = tr.querySelector('.cell-dept-display');
                        if (codeDisplay) codeDisplay.textContent = '#' + activeEmp.id;
                        if (deptDisplay) deptDisplay.textContent = activeEmp.job || '-';

                        if (item.timeIn || item.timeOut) {
                            updateRowCalculationsDOM(idx, tr);
                        }
                        updateDailyAttendancePresentCount();
                    }
                });
            }
        });

        updateDailyAttendancePresentCount();
    }



    function onRowEmployeeTyped(idx, inputEl) {
        const rawVal = inputEl.value.trim();
        const val = typeof normalizeArabicText === 'function' ? normalizeArabicText(rawVal) : rawVal.toLowerCase();
        const item = currentDailyAttendance[idx];
        if (!item) return;

        const activeEmps = (typeof employees !== 'undefined' ? employees : (window.employees || [])).filter(e => e.status !== 'انتهت خدمته');
        let matched = null;

        const codeInParentheses = rawVal.match(/\(#?(\d+)\)/);
        if (codeInParentheses) {
            const c = parseInt(codeInParentheses[1], 10);
            matched = activeEmps.find(e => e.id === c);
        } else if (/^\d+$/.test(rawVal)) {
            const c = parseInt(rawVal, 10);
            matched = activeEmps.find(e => e.id === c);
        } else if (val.length >= 1) {
            matched = activeEmps.find(e => {
                const normName = typeof normalizeArabicText === 'function' ? normalizeArabicText(e.name) : e.name.toLowerCase();
                return normName.startsWith(val) || normName.includes(val);
            });
        }

        if (matched) {
            item.empId = matched.id;
            item.name = matched.name;
            item.job = matched.job;
            item.shiftHours = matched.shiftHours || 8;
        } else if (val === '') {
            item.empId = '';
            item.name = '';
            item.job = '';
            item.shiftHours = 8;
        } else {
            item.empId = '';
            item.name = '';
            item.job = '';
        }

        const tr = inputEl.closest('tr');
        if (tr) {
            const codeDisplay = tr.querySelector('.cell-code-display');
            const deptDisplay = tr.querySelector('.cell-dept-display');
            if (codeDisplay) codeDisplay.textContent = item.empId ? '#' + item.empId : '-';
            if (deptDisplay) deptDisplay.textContent = item.job || '-';
        }

        if (item.timeIn || item.timeOut) {
            updateRowCalculationsDOM(idx, tr);
        }

        updateDailyAttendancePresentCount();
    }

    function onRowEmployeeBlur(idx, inputEl) {
        setTimeout(() => {
            validateAndEnforceActiveEmployee(idx, inputEl);
        }, 220);
    }

    function onRowEmployeeKeydown(e, idx, inputEl) {
        if (e.key === 'Enter') {
            e.preventDefault();
            setTimeout(() => {
                validateAndEnforceActiveEmployee(idx, inputEl);
            }, 120);
        }
    }

    function validateAndEnforceActiveEmployee(idx, inputEl) {
        if (!inputEl) return;
        const rawVal = (inputEl.value || '').trim();
        const item = currentDailyAttendance[idx];
        if (!item) return;

        // إذا كان الحقل فارغاً تماماً يتم اعتباره سطراً فارغاً ومسح البيانات بهدوء
        if (rawVal === '') {
            item.empId = '';
            item.name = '';
            item.job = '';
            item.shiftHours = 8;
            item.hours = 0;
            item.basicHours = 0;
            item.ovTotal = 0;
            item.ov1 = 0;
            item.ov2 = 0;
            item.ovMore = 0;

            const tr = inputEl.closest('tr');
            if (tr) {
                const codeDisplay = tr.querySelector('.cell-code-display');
                const deptDisplay = tr.querySelector('.cell-dept-display');
                if (codeDisplay) codeDisplay.textContent = '-';
                if (deptDisplay) deptDisplay.textContent = '-';
                updateRowCalculationsDOM(idx, tr);
            }
            updateDailyAttendancePresentCount();
            return;
        }

        const allEmps = (typeof employees !== 'undefined' ? employees : (window.employees || []));

        // التأكد مما إذا كان الموظف المحدد حالياً نشطاً ومطابقاً للقيمة
        if (item.empId) {
            const currentActive = allEmps.find(e => e.id === item.empId && e.status !== 'انتهت خدمته');
            if (currentActive && (inputEl.value === currentActive.name || inputEl.value.includes(currentActive.name))) {
                inputEl.value = currentActive.name;
                updateDailyAttendancePresentCount();
                return;
            }
        }

        const normInput = typeof normalizeArabicText === 'function' ? normalizeArabicText(rawVal) : rawVal.toLowerCase();
        let matchedActive = null;

        // 1. مطابقة الكود الرقمي
        const codeMatch = rawVal.match(/\(#?(\d+)\)/) || (/^\d+$/.test(rawVal) ? [null, rawVal] : null);
        if (codeMatch) {
            const c = parseInt(codeMatch[1], 10);
            matchedActive = allEmps.find(e => e.id === c && e.status !== 'انتهت خدمته');
        }

        // 2. مطابقة الاسم كاملاً
        if (!matchedActive) {
            matchedActive = allEmps.find(e => {
                if (e.status === 'انتهت خدمته') return false;
                const normE = typeof normalizeArabicText === 'function' ? normalizeArabicText(e.name) : e.name.toLowerCase();
                return normE === normInput;
            });
        }

        // 3. مطابقة بداية أو جزء من الاسم
        if (!matchedActive && normInput.length >= 1) {
            matchedActive = allEmps.find(e => {
                if (e.status === 'انتهت خدمته') return false;
                const normE = typeof normalizeArabicText === 'function' ? normalizeArabicText(e.name) : e.name.toLowerCase();
                return normE.startsWith(normInput) || normE.includes(normInput);
            });
        }

        // إذا كان الموظف غير نشط أو غير مسجل في شاشة التكويد يتم الرفض فوراً وتفريغ الحقل
        if (!matchedActive) {
            inputEl.value = '';
            item.empId = '';
            item.name = '';
            item.job = '';
            item.shiftHours = 8;
            item.hours = 0;
            item.basicHours = 0;
            item.ovTotal = 0;
            item.ov1 = 0;
            item.ov2 = 0;
            item.ovMore = 0;

            const tr = inputEl.closest('tr');
            if (tr) {
                const codeDisplay = tr.querySelector('.cell-code-display');
                const deptDisplay = tr.querySelector('.cell-dept-display');
                if (codeDisplay) codeDisplay.textContent = '-';
                if (deptDisplay) deptDisplay.textContent = '-';
                updateRowCalculationsDOM(idx, tr);
            }
            updateDailyAttendancePresentCount();

            alert('سجل الموظف اولا');
            return;
        }

        // تم التطابق بنجاح مع موظف نشط مسجل
        item.empId = matchedActive.id;
        item.name = matchedActive.name;
        item.job = matchedActive.job;
        item.shiftHours = matchedActive.shiftHours || 8;
        inputEl.value = matchedActive.name;

        const tr = inputEl.closest('tr');
        if (tr) {
            const codeDisplay = tr.querySelector('.cell-code-display');
            const deptDisplay = tr.querySelector('.cell-dept-display');
            if (codeDisplay) codeDisplay.textContent = '#' + matchedActive.id;
            if (deptDisplay) deptDisplay.textContent = matchedActive.job || '-';
            if (item.timeIn || item.timeOut) {
                updateRowCalculationsDOM(idx, tr);
            }
        }
        updateDailyAttendancePresentCount();
    }

    function updateDailyAttendancePresentCount() {
        const el = document.getElementById('att-present-count-val');
        if (!el) return;
        let count = 0;
        if (Array.isArray(currentDailyAttendance)) {
            count = currentDailyAttendance.filter(r => r && r.empId && Number(r.empId) > 0).length;
        }
        el.textContent = count;
    }
    window.updateDailyAttendancePresentCount = updateDailyAttendancePresentCount;



    function parseTime24(tStr) {

        if (!tStr) return null;

        let s = String(tStr).trim();

        if (!s) return null;



        // تحويل الأرقام العربية إلى إنجليزية

        const arabicDigits = '٠١٢٣٤٥٦٧٨٩';

        s = s.replace(/[٠-٩]/g, d => arabicDigits.indexOf(d));



        // توحيد الفواصل (نقطة، فاصلة، مسافة، شرطة) إلى نقطتين رأسيتين

        s = s.replace(/[.,\s\-]+/g, ':');



        let h = 0, m = 0;

        if (s.includes(':')) {

            const parts = s.split(':');

            h = parseInt(parts[0], 10);

            if (parts.length > 1 && parts[1] !== '') {

                const mStr = parts[1];

                m = mStr.length >= 2 ? parseInt(mStr.substring(0, 2), 10) : (parseInt(mStr, 10) <= 5 ? parseInt(mStr, 10) * 10 : parseInt(mStr, 10));

            } else {

                m = 0;

            }

        } else if (s.length === 3 && /^\d+$/.test(s)) {

            h = parseInt(s.substring(0, 1), 10);

            m = parseInt(s.substring(1), 10);

        } else if (s.length === 4 && /^\d+$/.test(s)) {

            h = parseInt(s.substring(0, 2), 10);

            m = parseInt(s.substring(2), 10);

        } else if (/^\d+$/.test(s)) {

            h = parseInt(s, 10);

            m = 0;

        } else {

            return null;

        }



        if (isNaN(h) || isNaN(m)) return null;

        if (h < 0 || h > 24 || m < 0 || m >= 60) return null;



        return h + (m / 60.0);

    }



    function formatTimeInputOnBlur(inputEl, idx) {

        if (!inputEl || !inputEl.value) return;

        const hVal = parseTime24(inputEl.value);

        if (hVal !== null) {

            const totalMins = Math.round(hVal * 60);

            const hh = String(Math.floor(totalMins / 60) % 24).padStart(2, '0');

            const mm = String(totalMins % 60).padStart(2, '0');

            inputEl.value = `${hh}:${mm}`;

        }

        const tr = inputEl.closest('tr');

        if (tr) updateRowCalculationsDOM(idx, tr);

    }



    function onRowTimeInputChanged(idx, inputEl) {

        const tr = inputEl.closest('tr');

        const inEl = tr.querySelector('.cell-time-in');

        const outEl = tr.querySelector('.cell-time-out');



        const item = currentDailyAttendance[idx];

        if (item) {

            item.timeIn = inEl ? inEl.value.trim() : '';

            item.timeOut = outEl ? outEl.value.trim() : '';

        }



        updateRowCalculationsDOM(idx, tr);

    }



    function updateRowCalculationsDOM(idx, tr) {

        if (!tr) tr = document.querySelector(`#daily-attendance-tbody tr[data-idx="${idx}"]`);

        const item = currentDailyAttendance[idx];

        if (!item) return;



        const inEl = tr ? tr.querySelector('.cell-time-in') : null;

        const outEl = tr ? tr.querySelector('.cell-time-out') : null;

        if (inEl) item.timeIn = inEl.value.trim();

        if (outEl) item.timeOut = outEl.value.trim();



        const hIn = parseTime24(item.timeIn);

        const hOut = parseTime24(item.timeOut);



        const totEl = tr ? tr.querySelector('.cell-total-hours') : null;

        const basicEl = tr ? tr.querySelector('.cell-basic-hours') : null;

        const ovTotEl = tr ? tr.querySelector('.cell-ov-total') : null;

        const ov1El = tr ? tr.querySelector('.cell-ov1') : null;

        const ov2El = tr ? tr.querySelector('.cell-ov2') : null;

        const ovMoreEl = tr ? tr.querySelector('.cell-ov-more') : null;



        // إذا لم يدخل كلا الوقتين بعد

        if (hIn === null || hOut === null) {

            item.hours = 0;

            item.basicHours = 0;

            item.ovTotal = 0;

            item.ov1 = 0;

            item.ov2 = 0;

            item.ovMore = 0;



            if (totEl) totEl.textContent = '-';

            if (basicEl) basicEl.textContent = '-';

            if (ovTotEl) ovTotEl.textContent = '-';

            if (ov1El) ov1El.textContent = '-';

            if (ov2El) ov2El.textContent = '-';

            if (ovMoreEl) ovMoreEl.textContent = '-';

            return;

        }



        // حساب إجمالي ساعات الحضور بنظام الـ 24 ساعة (مع دعم الشيفت الليلي)

        let total = hOut >= hIn ? (hOut - hIn) : ((24 - hIn) + hOut);

        total = Math.round(total * 100) / 100;



        let standardShift = 8;

        if (item.empId) {

            const emp = employees.find(e => e.id === item.empId);

            if (emp && emp.shiftHours) standardShift = emp.shiftHours;

        } else if (item.shiftHours) {

            standardShift = item.shiftHours;

        }



        const basic = Math.min(total, standardShift);

        const ovTotal = Math.max(0, Math.round((total - basic) * 100) / 100);



        let ov1 = 0;

        let ov2 = 0;

        let ovMore = 0;



        if (ovTotal > 0) {

            ov1 = Math.min(ovTotal, 1.0);

            if (ovTotal > 1.0) {

                ov2 = Math.min(Math.round((ovTotal - 1.0) * 100) / 100, 1.0);

            }

            if (ovTotal > 2.0) {

                ovMore = Math.round((ovTotal - 2.0) * 100) / 100;

            }

        }



        item.hours = total;

        item.basicHours = basic;

        item.ovTotal = ovTotal;

        item.ov1 = ov1;

        item.ov2 = ov2;

        item.ovMore = ovMore;



        // إظهار الأرقام المحسوبة فوراً وبدقة

        if (totEl) totEl.textContent = total.toFixed(2);

        if (basicEl) basicEl.textContent = basic.toFixed(2);

        if (ovTotEl) ovTotEl.textContent = ovTotal.toFixed(2);

        if (ov1El) ov1El.textContent = ov1.toFixed(2);

        if (ov2El) ov2El.textContent = ov2.toFixed(2);

        if (ovMoreEl) ovMoreEl.textContent = ovMore.toFixed(2);

    }



    // إنهاء اليومية وترحيلها (يقبل حفظ الموظف حتى لو لم يتم وضع مواعيد)

    function finalizeAndPostDailyAttendance() {

        syncCurrentTableRowsToMemory();

        const dateVal = getActiveShiftDate();



        for (let i = 0; i < currentDailyAttendance.length; i++) {
            const r = currentDailyAttendance[i];
            if (r.name && (!r.empId || !employees.some(e => e.id === r.empId && e.status !== 'انتهت خدمته'))) {
                alert('سجل الموظف اولا');
                return;
            }
        }

        // قبول أي سطر تم تحديد الموظف فيه (حتى لو لم تُسجل له مواعيد)
        const validRows = currentDailyAttendance.filter(r => r.empId && r.empId > 0);



        if (validRows.length === 0) {

            alert('لا توجد بيانات موظفين مسجلة لليومية في هذا التاريخ!');

            return;

        }



        if (!confirm(`هل تؤكد إنهاء وقفل يومية [ ${dateVal} ] وترحيل عدد (${validRows.length}) موظف إلى شاشات الرواتب والسراكي؟`)) {

            return;

        }



        // حذف أي سجلات سابقة لنفس اليومية منعاً للتكرار

        attendanceRecords = attendanceRecords.filter(r => r.date !== dateVal);



        validRows.forEach(row => {

            const emp = employees.find(e => e.id === row.empId);

            const basicSal = emp ? emp.basicSalary : 0;

            const shiftH = emp ? emp.shiftHours : 8;

            const rates = computeRates(basicSal, shiftH);



            const wage = (row.basicHours * rates.hourlyRate) +

                         (row.ov1 * rates.ov1) +

                         (row.ov2 * rates.ov2) +

                         (row.ovMore * rates.ovMore);



            attendanceRecords.push({

                id: Date.now() + Math.floor(Math.random() * 1000),

                empId: row.empId,

                name: emp ? emp.name : row.name,

                job: emp ? emp.job : row.job,

                date: dateVal,

                timeIn: row.timeIn || '-',

                timeOut: row.timeOut || '-',

                hours: row.hours || 0,

                basicHours: row.basicHours || 0,

                ovTotal: row.ovTotal || 0,

                ov1: row.ov1 || 0,

                ov2: row.ov2 || 0,

                ovMore: row.ovMore || 0,

                rate: rates.hourlyRate,

                wage: Math.round(wage * 100) / 100,

                isHoliday: (document.getElementById('att-is-holiday') && document.getElementById('att-is-holiday').checked),

                isPaid: false

            });

        });



        const curIsHoliday = document.getElementById('att-is-holiday') && document.getElementById('att-is-holiday').checked;

        if (curIsHoliday) {

            if (!officialHolidaysDb.includes(dateVal)) officialHolidaysDb.push(dateVal);

        } else {

            officialHolidaysDb = officialHolidaysDb.filter(d => d !== dateVal);

        }

        localStorage.setItem('erp_official_holidays_db', JSON.stringify(officialHolidaysDb));
        if (typeof pushSingleCollectionToFirebase === 'function') pushSingleCollectionToFirebase('officialHolidays', officialHolidaysDb);

        localStorage.setItem('erp_attendance_db', JSON.stringify(attendanceRecords));

        if (typeof pushSingleCollectionToFirebase === 'function') pushSingleCollectionToFirebase('attendance', attendanceRecords);

        localStorage.removeItem('erp_daily_draft_' + dateVal);



        renderWelcomeDashboard();

        alert(`تم قفل وإنهاء يومية [ ${dateVal} ] بنجاح!\nتم ترحيل البيانات وتوثيقها في كافة السراكي والتقارير.`);

    }



    // طباعة كشف اليومية الرسمي المفلتر (يظهر فيه الموظف حتى لو لم توضع مواعيد)

    function getDailyAttendancePrintHtml() {

        syncCurrentTableRowsToMemory();

        const dateVal = getActiveShiftDate();

        const dObj = new Date(dateVal);

        const dayName = ARABIC_WEEKDAYS[dObj.getDay()] || '';



        let printRows = currentDailyAttendance.filter(r => r.empId && r.empId > 0);

        if (printRows.length === 0) {
            const savedRecs = (attendanceRecords || []).filter(r => r && r.date === dateVal);
            if (savedRecs.length > 0) {
                printRows = savedRecs;
            } else {
                const activeEmps = (employees || []).filter(e => e && e.status !== 'انتهت خدمته');
                if (activeEmps.length > 0) {
                    printRows = activeEmps.map(emp => ({
                        empId: emp.id,
                        name: emp.name,
                        job: emp.job,
                        timeIn: '',
                        timeOut: '',
                        hours: 0,
                        basicHours: 0,
                        ovTotal: 0
                    }));
                } else {
                    return null;
                }
            }
        }



        let rowsHtml = '';

        printRows.forEach((r, idx) => {

            const emp = employees.find(e => e.id === r.empId);

            if (emp && emp.status === 'انتهت خدمته') return;



            const dept = emp ? emp.job : (r.job || '-');

            const empName = emp ? emp.name : r.name;



            rowsHtml += `

                <tr>

                    <td style="width:35px;">${idx + 1}</td>

                    <td style="width:110px;">${dept}</td>

                    <td style="width:65px; font-weight:bold; font-family:Consolas, monospace;">#${r.empId}</td>

                    <td style="text-align:right; padding-right:10px; font-weight:bold; white-space:nowrap;">${empName}</td>

                    <td style="width:85px; font-family:Consolas, monospace;">${r.timeIn || '-'}</td>

                    <td style="width:85px; font-family:Consolas, monospace;">${r.timeOut || '-'}</td>

                    <td style="width:90px; font-weight:bold;">${r.hours ? r.hours.toFixed(2) : '0'}</td>

                    <td style="width:90px;">${r.basicHours ? r.basicHours.toFixed(2) : '0'}</td>

                    <td style="width:90px; font-weight:bold;">${r.ovTotal ? r.ovTotal.toFixed(2) : '0'}</td>

                </tr>

            `;

        });



        return `

            <!DOCTYPE html>

            <html lang="ar" dir="rtl">

            <head>

                <meta charset="UTF-8">

                <meta name="viewport" content="width=device-width, initial-scale=1">

                <title>يومية الحضور والانصراف - عيادات سيدى ياقوت التخصصية</title>

                <style>

                    @page { size: A4 portrait; margin: 10mm; }

                    body { font-family: Tahoma, 'Segoe UI', Arial, sans-serif; direction: rtl; color: #000; margin: 0; padding: 10px; background:#fff; }

                    .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 8px; margin-bottom: 12px; }

                    .header h2 { margin: 0 0 4px 0; font-size: 19px; }

                    .header h3 { margin: 0; font-size: 13px; color: #222; }

                    table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 11px; text-align: center; }

                    th, td { border: 1.5px solid #000; padding: 6px 4px; }

                    th { background-color: #f1f5f9; font-weight: bold; }

                    .footer { margin-top: 25px; display: flex; justify-content: space-between; font-size: 12px; font-weight: bold; padding: 0 15px; }

                </style>

            </head>

            <body>

                ${typeof getClinicReportHeaderHtml === 'function' ? getClinicReportHeaderHtml('كشف يومية حضور وانصراف العاملين والأطقم الطبية', `اليوم: ${dayName} | تاريخ الشيفت: ${dateVal}`) : `
                <div class="header" style="text-align:center; border-bottom:2px solid #990012; padding-bottom:8px; margin-bottom:12px;">
                    <h2 style="margin:0; color:#102a45;">عيادات سيدى ياقوت التخصصية</h2>
                    <h3 style="margin:4px 0 0 0; font-size:13px; color:#475569;">كشف يومية حضور وانصراف العاملين | اليوم: ${dayName} | الموافق: ${dateVal}</h3>
                </div>`}

                <table>

                    <thead>

                        <tr>

                            <th style="width:35px;">م</th>

                            <th style="width:110px;">القسم</th>

                            <th style="width:65px;">الكود</th>

                            <th>اسم الموظف</th>

                            <th style="width:85px;">الحضور</th>

                            <th style="width:85px;">الانصراف</th>

                            <th style="width:90px;">إجمالي الساعات</th>

                            <th style="width:90px;">الساعات الأساسية</th>

                            <th style="width:90px;">إجمالي الإضافي</th>

                        </tr>

                    </thead>

                    <tbody>

                        ${rowsHtml}

                    </tbody>

                </table>

                <div class="footer">

                    <div>توقيع مشرف الشيفت: .................................</div>

                    <div>اعتماد مدير الفرع / الإدارة: .................................</div>

                </div>

            </body>

            </html>

        `;

    }



    function printDailyAttendanceSheet() {

        const html = getDailyAttendancePrintHtml();

        if (!html) return;

        const printWindow = window.open('', '_blank');

        printWindow.document.write(html + '<script>window.onload = function() { window.print(); };<\/script>');

        printWindow.document.close();

    }



    function exportAttendanceToPdf() {

        const html = getDailyAttendancePrintHtml();

        if (!html) return;

        const dateVal = getActiveShiftDate();

        const filename = `يومية_الحضور_والانصراف_${dateVal}.pdf`;

        downloadPrintHtmlAsPdf(html, filename, 'portrait');

    }



