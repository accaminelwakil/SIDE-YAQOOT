    // ==================== 0. شاشة الترحيب والحسابات + الرسوم البيانية ====================
    let currentSalaryChartMode = 'months'; // 'months' أو 'employees'
    let currentSalaryPeriodOffset = 0; // 0 = الفترة الحالية، -1 = السابقة، +1 = التالية
    let salaryPeriodHoverBars = []; // لحساب إحداثيات الأعمدة وعرض الـ tooltip التفاعلي

    function renderWelcomeDashboard() {
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
        const yearMonthPrefix = `${currentYear}-${currentMonth}`;

        const activeEmployees = (typeof employees !== 'undefined' && Array.isArray(employees))
            ? employees.filter(e => e && e.status !== 'انتهت خدمته')
            : [];

        const empCountEl = document.getElementById('dash-emp-count');
        if (empCountEl) {
            empCountEl.innerText = `${activeEmployees.length} موظف`;
        }

        const allAtt = (typeof attendanceRecords !== 'undefined' && Array.isArray(attendanceRecords))
            ? attendanceRecords
            : [];

        // حساب رواتب دورة الراتب الحالية للعيادات (25 إلى 24)
        const curPeriod = getSalaryPeriodInfo(0);
        let periodSalary = 0;

        if (typeof calculateEmployeePayslipData === 'function') {
            activeEmployees.forEach(emp => {
                const pData = calculateEmployeePayslipData(emp, curPeriod.startStr, curPeriod.endStr);
                periodSalary += (pData.finalNet || 0);
            });
        } else {
            const periodRecords = allAtt.filter(r => {
                if (!r || !r.date) return false;
                const d = String(r.date).trim().replace(/\//g, '-');
                return d >= curPeriod.startStr && d <= curPeriod.endStr;
            });
            periodSalary = periodRecords.reduce((sum, r) => {
                const w = parseFloat(r.wage);
                if (!isNaN(w) && isFinite(w) && w > 0) return sum + w;
                const hrs = parseFloat(r.hours) || 0;
                const rt = parseFloat(r.rate) || 0;
                return sum + (hrs * rt);
            }, 0);
        }

        const monthSalEl = document.getElementById('dash-month-salary');
        if (monthSalEl) {
            monthSalEl.innerText = `${periodSalary.toLocaleString('ar-EG', {minimumFractionDigits: 2})} ج.م`;
        }
        const monthLblEl = document.getElementById('dash-month-label');
        if (monthLblEl) {
            monthLblEl.innerText = `${curPeriod.cycleTitle} (${curPeriod.periodLabel})`;
        }

        // حساب إجمالي رواتب العام والمسدد وصافي المستحق عن كل الفترات المالية المسجلة للعام (صافي الراتب المستحق)
        const registeredCycles = new Map();

        // 1. فحص دورات الـ 12 شهراً لسنة currentYear (دورة 25 إلى 24)
        for (let m = 1; m <= 12; m++) {
            let prevM = m - 1;
            let prevY = currentYear;
            if (prevM === 0) {
                prevM = 12;
                prevY = currentYear - 1;
            }
            const startStr = `${prevY}-${String(prevM).padStart(2, '0')}-25`;
            const endStr = `${currentYear}-${String(m).padStart(2, '0')}-24`;
            const cycleKey = `${startStr}_${endStr}`;

            const hasAtt = allAtt.some(r => r && r.date && r.date >= startStr && r.date <= endStr);
            const hasAdj = (typeof salaryAdjustmentsDb !== 'undefined' && salaryAdjustmentsDb) 
                ? Object.keys(salaryAdjustmentsDb).some(k => k.startsWith(cycleKey)) 
                : false;
            const hasDeliv = (typeof payrollDeliveryDb !== 'undefined' && payrollDeliveryDb)
                ? Object.keys(payrollDeliveryDb).some(k => k.startsWith(cycleKey))
                : false;
            const hasSaved = (typeof savedPayrollSummaryCycles !== 'undefined' && savedPayrollSummaryCycles && savedPayrollSummaryCycles[cycleKey]);

            if (hasAtt || hasAdj || hasDeliv || hasSaved) {
                registeredCycles.set(cycleKey, { start: startStr, end: endStr, m: m });
            }
        }

        // 2. فحص أي دورات إضافية محفوظة تخص السنة
        if (typeof savedPayrollSummaryCycles !== 'undefined' && savedPayrollSummaryCycles) {
            Object.keys(savedPayrollSummaryCycles).forEach(k => {
                const parts = k.split('_');
                if (parts.length === 2 && parts[1].startsWith(String(currentYear))) {
                    if (!registeredCycles.has(k)) {
                        registeredCycles.set(k, { start: parts[0], end: parts[1] });
                    }
                }
            });
        }
        if (typeof payrollDeliveryDb !== 'undefined' && payrollDeliveryDb) {
            Object.keys(payrollDeliveryDb).forEach(k => {
                const parts = k.split('_');
                if (parts.length >= 3 && parts[1].startsWith(String(currentYear))) {
                    const cKey = `${parts[0]}_${parts[1]}`;
                    if (!registeredCycles.has(cKey)) {
                        registeredCycles.set(cKey, { start: parts[0], end: parts[1] });
                    }
                }
            });
        }

        let yearSalary = 0;
        let yearPaid = 0;

        if (registeredCycles.size > 0 && typeof calculateEmployeePayslipData === 'function') {
            registeredCycles.forEach(cycle => {
                activeEmployees.forEach(emp => {
                    const pData = calculateEmployeePayslipData(emp, cycle.start, cycle.end);
                    const net = pData.finalNet || 0;
                    yearSalary += net;

                    // احتساب المسدد والمنصرف فعلياً عن تلك الدورة
                    const delivKey = `${cycle.start}_${cycle.end}_${emp.id}`;
                    const delivRec = (typeof payrollDeliveryDb !== 'undefined' && payrollDeliveryDb) ? payrollDeliveryDb[delivKey] : null;
                    if (delivRec && delivRec.isPaid) {
                        const amt = Number(delivRec.amount) || ((typeof settleSalaryAmount === 'function') ? settleSalaryAmount(net) : net);
                        yearPaid += amt;
                    } else {
                        // التحقق من سجلات الحضور المسددة
                        const empPeriodRecs = allAtt.filter(r => r && r.empId === emp.id && r.date >= cycle.start && r.date <= cycle.end);
                        if (empPeriodRecs.length > 0 && empPeriodRecs.every(r => r.isPaid)) {
                            const amt = (typeof settleSalaryAmount === 'function') ? settleSalaryAmount(net) : net;
                            yearPaid += amt;
                        }
                    }
                });
            });
        } else {
            // كود بديل في حالة عدم وجود أي دورات مسجلة بعد
            const currentYearRecords = allAtt.filter(r => {
                if (!r || !r.date) return false;
                const d = String(r.date).trim().replace(/\//g, '-');
                return d.startsWith(String(currentYear));
            });
            yearSalary = currentYearRecords.reduce((sum, r) => {
                const w = parseFloat(r.wage);
                if (!isNaN(w) && isFinite(w) && w > 0) return sum + w;
                const hrs = parseFloat(r.hours) || 0;
                const rt = parseFloat(r.rate) || 0;
                return sum + (hrs * rt);
            }, 0);
            yearPaid = currentYearRecords.filter(r => r && r.isPaid).reduce((sum, r) => {
                const w = parseFloat(r.wage);
                if (!isNaN(w) && isFinite(w) && w > 0) return sum + w;
                const hrs = parseFloat(r.hours) || 0;
                const rt = parseFloat(r.rate) || 0;
                return sum + (hrs * rt);
            }, 0);
        }

        const yearSalEl = document.getElementById('dash-year-salary');
        if (yearSalEl) {
            yearSalEl.innerText = `${yearSalary.toLocaleString('ar-EG', {minimumFractionDigits: 2})} ج.م`;
        }
        const yearLblEl = document.getElementById('dash-year-label');
        if (yearLblEl) {
            const count = registeredCycles.size;
            yearLblEl.innerText = count > 0 
                ? `صافي مستحق ${count} فترة مسجلة لسنة ${currentYear}` 
                : `صافي مستحقات فترات سنة ${currentYear}`;
        }

        const yearPaidEl = document.getElementById('dash-year-paid');
        if (yearPaidEl) {
            yearPaidEl.innerText = `${yearPaid.toLocaleString('ar-EG', {minimumFractionDigits: 2})} ج.م`;
        }

        const netDue = Math.max(0, yearSalary - yearPaid);
        const netDueEl = document.getElementById('dash-net-due');
        if (netDueEl) {
            netDueEl.innerText = `${netDue.toLocaleString('ar-EG', {minimumFractionDigits: 2})} ج.م`;
        }

        const mName = (typeof arabicMonths !== 'undefined' && arabicMonths[now.getMonth()]) ? arabicMonths[now.getMonth()] : (now.getMonth() + 1);
        const daysLbl = document.getElementById('chart-days-label');
        if (daysLbl) {
            daysLbl.innerText = `تحليل يومي لشهر ${mName} ${currentYear}`;
        }
        const yearLbl = document.getElementById('chart-year-label');
        if (yearLbl) {
            if (currentSalaryChartMode === 'employees') {
                yearLbl.innerText = `مقارنة رواتب الموظفين النشطين بالعيادات`;
            } else {
                yearLbl.innerText = `مقارنة فترات سنة ${currentYear}`;
            }
        }

        // رسم المخططات فوراً ثم في requestAnimationFrame لضمان استقرار أبعاد الحاويات
        drawAllDashboardCharts(currentYear, now.getMonth() + 1);
        if (typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(() => {
                drawAllDashboardCharts(currentYear, now.getMonth() + 1);
            });
        }
    }

    function drawAllDashboardCharts(year, month) {
        // 1. الرسم البياني الأول: مقارنة رواتب الموظفين خلال فترة الراتب (25 إلى 24)
        drawChartDaysOfSalaryPeriod();
        // 2. الرسم البياني الثاني: مقارنة الفترات وتكلفة الرواتب
        renderSalaryComparisonChart(year);
        // 3. الرسم البياني الثالث: مقارنة عدد الموظفين النشطين شهرياً
        drawChartEmployeesByMonth(year);
    }

    function switchSalaryChartMode(mode) {
        currentSalaryChartMode = mode;
        const btnMonths = document.getElementById('btn-chart-mode-months');
        const btnEmps = document.getElementById('btn-chart-mode-emps');
        const labelEl = document.getElementById('chart-year-label');
        const now = new Date();

        if (btnMonths && btnEmps) {
            if (mode === 'months') {
                btnMonths.style.background = '#7c3aed';
                btnMonths.style.color = '#ffffff';
                btnEmps.style.background = 'transparent';
                btnEmps.style.color = '#475569';
                if (labelEl) labelEl.innerText = `مقارنة تكلفة الرواتب الشهرية خلال سنة ${now.getFullYear()}`;
            } else {
                btnEmps.style.background = '#7c3aed';
                btnEmps.style.color = '#ffffff';
                btnMonths.style.background = 'transparent';
                btnMonths.style.color = '#475569';
                if (labelEl) labelEl.innerText = `مقارنة رواتب الموظفين النشطين بالعيادات`;
            }
        }

        renderSalaryComparisonChart(now.getFullYear());
    }

    function renderSalaryComparisonChart(year) {
        const curY = year || new Date().getFullYear();
        if (currentSalaryChartMode === 'employees') {
            drawChartEmployeesSalaryComparison();
        } else {
            drawChartMonthsOfYear(curY);
        }
    }

    function drawChartEmployeesSalaryComparison() {
        const canvas = document.getElementById('chart-year-months');
        if (!canvas) return;
        const ctx = prepareCanvas(canvas);
        if (!ctx) return;

        const activeEmps = (typeof employees !== 'undefined' && Array.isArray(employees))
            ? employees.filter(e => e && e.status !== 'انتهت خدمته')
            : [];

        // ترتيب الموظفين بحسب الراتب تنازلياً لعرض مقارنة واضحة لأعلى وأهم الرواتب
        const sortedEmps = activeEmps.slice().sort((a, b) => {
            const salA = parseFloat(a.basicSalary) || 0;
            const salB = parseFloat(b.basicSalary) || 0;
            return salB - salA;
        });

        const displayEmps = sortedEmps.slice(0, 16);
        const labels = displayEmps.map(e => e.name ? e.name.split(' ').slice(0, 2).join(' ') : String(e.id));
        const data = displayEmps.map(e => parseFloat(e.basicSalary) || 0);

        drawBarChart(ctx, canvas, labels, data, '#059669', 'ج.م', displayEmps.length > 10);
    }

    function drawChartEmployeesByMonth(year) {
        const canvas = document.getElementById('chart-employees-month');
        if (!canvas) return;
        const ctx = prepareCanvas(canvas);
        if (!ctx) return;

        const allAtt = (typeof attendanceRecords !== 'undefined' && Array.isArray(attendanceRecords)) ? attendanceRecords : [];
        const activeEmpsCount = (typeof employees !== 'undefined' && Array.isArray(employees))
            ? employees.filter(e => e && e.status !== 'انتهت خدمته').length
            : 0;
        const curM = new Date().getMonth() + 1;

        const data = [];
        for (let m = 1; m <= 12; m++) {
            const mPrefix = `${year}-${String(m).padStart(2, '0')}`;
            const empsInMonth = new Set();
            allAtt.forEach(r => {
                if (r && r.date) {
                    const d = String(r.date).trim().replace(/\//g, '-');
                    if (d.startsWith(mPrefix)) {
                        empsInMonth.add(r.empId);
                    }
                }
            });
            const count = empsInMonth.size > 0 ? empsInMonth.size : (m === curM ? activeEmpsCount : 0);
            data.push(count);
        }

        const labels = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
        drawBarChart(ctx, canvas, labels, data, '#7c3aed', 'موظف');
    }

    // دالة استخراج بيانات وتواريخ دورة الراتب (من 25 الشهر السابق إلى 24 الشهر الحالي)
    function getSalaryPeriodInfo(offset = 0) {
        const now = new Date();
        const curDay = now.getDate();

        // دورة الرواتب المعتمدة بالعيادات تنتهي يوم 24:
        // إذا كان تاريخ اليوم 25 أو أكثر، فالدورة الحالية تنتهي يوم 24 من الشهر التالي.
        // إذا كان تاريخ اليوم أقل من 25، فالدورة الحالية تنتهي يوم 24 من الشهر الحالي.
        let baseEndYear = now.getFullYear();
        let baseEndMonth = now.getMonth() + 1; // 1 - 12
        if (curDay >= 25) {
            baseEndMonth += 1;
            if (baseEndMonth > 12) {
                baseEndMonth = 1;
                baseEndYear += 1;
            }
        }

        // تطبيق الإزاحة (offset) بالشهور للتنقل الذكي
        const totalEndMonths = (baseEndYear * 12) + (baseEndMonth - 1) + offset;
        const endYear = Math.floor(totalEndMonths / 12);
        const endMonth = (totalEndMonths % 12) + 1;

        // تبدأ الدورة يوم 25 من الشهر السابق لشهر النهاية
        const totalStartMonths = totalEndMonths - 1;
        const startYear = Math.floor(totalStartMonths / 12);
        const startMonth = (totalStartMonths % 12) + 1;

        const startStr = `${startYear}-${String(startMonth).padStart(2, '0')}-25`;
        const endStr = `${endYear}-${String(endMonth).padStart(2, '0')}-24`;

        const arMonths = (typeof arabicMonths !== 'undefined' && Array.isArray(arabicMonths))
            ? arabicMonths
            : ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

        const startMName = arMonths[startMonth - 1] || startMonth;
        const endMName = arMonths[endMonth - 1] || endMonth;

        const todayY = now.getFullYear();
        const todayM = String(now.getMonth() + 1).padStart(2, '0');
        const todayD = String(now.getDate()).padStart(2, '0');
        const todayStr = `${todayY}-${todayM}-${todayD}`;

        // توليد قائمة الأيام كاملة من 25 إلى 24
        const days = [];
        const curDate = new Date(startYear, startMonth - 1, 25);
        const stopDate = new Date(endYear, endMonth - 1, 24);

        while (curDate <= stopDate) {
            const y = curDate.getFullYear();
            const m = String(curDate.getMonth() + 1).padStart(2, '0');
            const d = String(curDate.getDate()).padStart(2, '0');
            const dateKey = `${y}-${m}-${d}`;
            const dayNum = curDate.getDate();
            const monthNum = curDate.getMonth() + 1;

            days.push({
                dateKey: dateKey,
                day: dayNum,
                month: monthNum,
                year: y,
                monthName: arMonths[monthNum - 1] || monthNum,
                isToday: (dateKey === todayStr),
                isMonthStart: (dayNum === 1),
                isPeriodStart: (dateKey === startStr),
                isPeriodEnd: (dateKey === endStr)
            });

            curDate.setDate(curDate.getDate() + 1);
        }

        return {
            offset: offset,
            startStr: startStr,
            endStr: endStr,
            startYear: startYear,
            startMonth: startMonth,
            startMName: startMName,
            endYear: endYear,
            endMonth: endMonth,
            endMName: endMName,
            cycleTitle: `راتب شهر ${endMName} ${endYear}`,
            periodLabel: `من 25 ${startMName} ${startYear} إلى 24 ${endMName} ${endYear}`,
            days: days,
            isCurrent: (offset === 0)
        };
    }

    // التنقل الذكي بين فترات الراتب
    function navigateSalaryPeriod(direction) {
        if (direction === 0) {
            currentSalaryPeriodOffset = 0;
        } else {
            currentSalaryPeriodOffset += direction;
        }
        drawChartDaysOfSalaryPeriod();
    }

    // التغيير المباشر من القائمة المنسدلة
    function onSalaryPeriodSelectChanged(val) {
        const offset = parseInt(val, 10);
        if (!isNaN(offset)) {
            currentSalaryPeriodOffset = offset;
            drawChartDaysOfSalaryPeriod();
        }
    }

    // مزامنة عناصر التحكم والبادج في واجهة المستخدم
    function syncSalaryPeriodControls(periodInfo) {
        const badgeEl = document.getElementById('chart-period-badge');
        if (badgeEl) {
            let statusBadge = '';
            if (periodInfo.isCurrent) {
                statusBadge = '<span style="color:#059669; font-weight:900; margin-right:4px;">(الفترة الحالية 🟢)</span>';
            } else if (periodInfo.offset < 0) {
                statusBadge = `<span style="color:#64748b; font-weight:800; margin-right:4px;">(دورة سابقة)</span>`;
            } else {
                statusBadge = `<span style="color:#d97706; font-weight:800; margin-right:4px;">(دورة قادمة)</span>`;
            }
            badgeEl.innerHTML = `📅 ${periodInfo.cycleTitle} | ${periodInfo.periodLabel} ${statusBadge}`;
        }

        const btnCurr = document.getElementById('btn-period-current');
        if (btnCurr) {
            if (periodInfo.isCurrent) {
                btnCurr.classList.add('active');
                btnCurr.innerHTML = '📌 الفترة الحالية (النشطة)';
            } else {
                btnCurr.classList.remove('active');
                btnCurr.innerHTML = '📌 العودة للحالية';
            }
        }

        const selectEl = document.getElementById('chart-period-select');
        if (selectEl) {
            if (selectEl.options.length === 0) {
                for (let off = 2; off >= -12; off--) {
                    const p = getSalaryPeriodInfo(off);
                    const opt = document.createElement('option');
                    opt.value = off;
                    opt.text = `${p.cycleTitle} (${p.startMName} 25 - ${p.endMName} 24)${off === 0 ? ' ⭐ الحالية' : ''}`;
                    selectEl.appendChild(opt);
                }
            }
            selectEl.value = String(periodInfo.offset);
        }
    }

    // رسم مقارنة رواتب الموظفين خلال فترة الراتب (من 25 إلى 24)
    function drawChartDaysOfSalaryPeriod() {
        const canvas = document.getElementById('chart-current-month-days');
        if (!canvas) return;
        const ctx = prepareCanvas(canvas);
        if (!ctx) return;

        const periodInfo = getSalaryPeriodInfo(currentSalaryPeriodOffset);
        syncSalaryPeriodControls(periodInfo);

        const allAtt = (typeof attendanceRecords !== 'undefined' && Array.isArray(attendanceRecords)) ? attendanceRecords : [];

        const labels = [];
        const data = [];
        const daysData = [];

        let totalPeriodSalary = 0;
        let totalPeriodShifts = 0;
        let maxWage = 0;
        let maxWageDay = null;

        periodInfo.days.forEach(dayItem => {
            const dayRecords = allAtt.filter(r => {
                if (!r || !r.date) return false;
                const dClean = String(r.date).trim().replace(/\//g, '-');
                return dClean === dayItem.dateKey;
            });

            const dayWage = dayRecords.reduce((sum, r) => {
                const w = parseFloat(r.wage);
                if (!isNaN(w) && isFinite(w) && w > 0) return sum + w;
                const hrs = parseFloat(r.hours) || 0;
                const rt = parseFloat(r.rate) || 0;
                return sum + (hrs * rt);
            }, 0);

            const roundedWage = Math.round(dayWage * 100) / 100;
            data.push(roundedWage);
            totalPeriodSalary += roundedWage;
            totalPeriodShifts += dayRecords.length;

            if (roundedWage > maxWage) {
                maxWage = roundedWage;
                maxWageDay = dayItem;
            }

            // التسمية تحت العمود
            let shortLbl = String(dayItem.day);
            if (dayItem.day === 1) {
                shortLbl = `1/${dayItem.month}`;
            }
            labels.push(shortLbl);

            daysData.push({
                ...dayItem,
                wage: roundedWage,
                shiftsCount: dayRecords.length
            });
        });

        // تحديث بطاقات الإحصائيات الذكية
        const activeDaysCount = data.filter(w => w > 0).length;
        const avgDaily = activeDaysCount > 0 ? (totalPeriodSalary / activeDaysCount) : 0;

        const statTotalEl = document.getElementById('stat-period-total');
        if (statTotalEl) statTotalEl.innerText = `${totalPeriodSalary.toLocaleString('ar-EG', {minimumFractionDigits: 2})} ج.م`;

        const statShiftsEl = document.getElementById('stat-period-shifts');
        if (statShiftsEl) statShiftsEl.innerText = `${totalPeriodShifts.toLocaleString('ar-EG')} شيفت`;

        const statActiveDaysEl = document.getElementById('stat-period-activedays');
        if (statActiveDaysEl) statActiveDaysEl.innerText = `${activeDaysCount} من ${periodInfo.days.length} يوم`;

        const statAvgEl = document.getElementById('stat-period-avg');
        if (statAvgEl) statAvgEl.innerText = `${avgDaily.toLocaleString('ar-EG', {maximumFractionDigits: 1})} ج.م`;

        const statMaxEl = document.getElementById('stat-period-max');
        const statMaxCont = document.getElementById('stat-period-max-container');
        if (statMaxEl && statMaxCont) {
            if (maxWage > 0 && maxWageDay) {
                statMaxCont.style.display = 'inline-flex';
                statMaxEl.innerText = `يوم ${maxWageDay.day} ${maxWageDay.monthName} (${maxWage.toLocaleString('ar-EG')} ج.م)`;
            } else {
                statMaxCont.style.display = 'none';
            }
        }

        drawSalaryPeriodCanvas(ctx, canvas, labels, data, daysData);
    }

    // للتوافق مع أي استدعاء قديم
    function drawChartDaysOfCurrentMonth(year, month) {
        drawChartDaysOfSalaryPeriod();
    }

    // رسم أعمدة فترة الراتب مع خطوط الفصل وتمييز اليوم والـ hover
    function drawSalaryPeriodCanvas(ctx, canvas, labels, data, daysData) {
        if (!ctx || !canvas) return;
        const dpr = window.devicePixelRatio || 1;
        const width = canvas.width / dpr;
        const height = canvas.height / dpr;
        ctx.clearRect(0, 0, width, height);

        const padLeft = 60;
        const padRight = 20;
        const padTop = 30;
        const padBottom = 35;
        const chartW = Math.max(width - padLeft - padRight, 100);
        const chartH = height - padTop - padBottom;

        const cleanData = (data || []).map(v => {
            const num = parseFloat(v);
            return (!isNaN(num) && isFinite(num) && num > 0) ? num : 0;
        });

        const maxVal = Math.max(...cleanData, 10);

        // خطوط الشبكة والمحور الرأسي
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 0.6;
        ctx.font = '10px Tahoma, "Segoe UI", sans-serif';
        ctx.fillStyle = '#64748b';
        ctx.textAlign = 'right';

        const gridSteps = 4;
        for (let i = 0; i <= gridSteps; i++) {
            const y = padTop + (chartH / gridSteps) * i;
            const val = Math.round(maxVal - (maxVal / gridSteps) * i);
            ctx.beginPath();
            ctx.moveTo(padLeft, y);
            ctx.lineTo(width - padRight, y);
            ctx.stroke();
            ctx.fillText(val.toLocaleString('ar-EG'), padLeft - 6, y + 4);
        }

        const barCount = cleanData.length;
        if (barCount === 0) return;
        const step = chartW / barCount;
        const barWidth = Math.max(step * 0.65, 4);

        salaryPeriodHoverBars = [];

        cleanData.forEach((val, idx) => {
            // في اتجاه RTL: الفهرس 0 يبدأ من اليمين (بداية الفترة: يوم 25)
            const x = width - padRight - (idx * step) - (step / 2) - (barWidth / 2);
            const barH = (val / maxVal) * chartH;
            const y = padTop + chartH - barH;
            const dayItem = daysData[idx] || {};

            salaryPeriodHoverBars.push({
                x: x,
                y: y,
                width: barWidth,
                height: Math.max(barH, 2),
                stepX: width - padRight - (idx * step) - (step / 2),
                val: val,
                dayItem: dayItem,
                idx: idx
            });

            // خط فاصل عند بداية الشهر الجديد (يوم 1)
            if (dayItem.isMonthStart) {
                ctx.save();
                ctx.setLineDash([3, 3]);
                ctx.strokeStyle = '#818cf8';
                ctx.lineWidth = 1.2;
                ctx.beginPath();
                const lineX = x + barWidth + (step - barWidth) / 2;
                ctx.moveTo(lineX, padTop - 10);
                ctx.lineTo(lineX, height - padBottom);
                ctx.stroke();
                ctx.restore();
            }

            // رسم العمود بتدرج لوني راقٍ
            if (barH > 0) {
                const safeH = Math.max(barH, 2);
                try {
                    const grad = ctx.createLinearGradient(0, y, 0, y + safeH);
                    if (dayItem.isToday) {
                        // اليوم الحالي: تدرج عنبري ذهبي متميز
                        grad.addColorStop(0, '#f59e0b');
                        grad.addColorStop(1, '#fef3c7');
                    } else {
                        // تدرج أزرق ملكي أنيق
                        grad.addColorStop(0, '#2563eb');
                        grad.addColorStop(1, '#93c5fd');
                    }

                    ctx.fillStyle = grad;
                    ctx.beginPath();
                    const r = Math.min(4, safeH / 2, barWidth / 2);
                    if (ctx.roundRect && r > 0) {
                        ctx.roundRect(x, y, barWidth, safeH, [r, r, 0, 0]);
                        ctx.fill();
                    } else {
                        ctx.fillRect(x, y, barWidth, safeH);
                    }
                } catch (err) {
                    ctx.fillStyle = dayItem.isToday ? '#f59e0b' : '#2563eb';
                    ctx.fillRect(x, y, barWidth, safeH);
                }
            }

            // القيمة أعلى العمود
            if (val > 0 && (val > maxVal * 0.12 || barCount <= 18)) {
                ctx.fillStyle = dayItem.isToday ? '#b45309' : '#1e1b4b';
                ctx.font = 'bold 9px Tahoma, "Segoe UI", sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(Math.round(val).toLocaleString('ar-EG'), x + barWidth / 2, y - 5);
            }

            // التسمية تحت المحور السيني
            const isImportant = (dayItem.day === 1 || dayItem.day === 25 || dayItem.day === 24 || dayItem.isToday);
            const shouldLabel = isImportant || (idx % 2 === 0);

            if (shouldLabel) {
                if (dayItem.isToday) {
                    ctx.fillStyle = '#d97706';
                    ctx.font = 'bold 10px Tahoma, "Segoe UI", sans-serif';
                } else if (dayItem.day === 1) {
                    ctx.fillStyle = '#6d28d9';
                    ctx.font = 'bold 10px Tahoma, "Segoe UI", sans-serif';
                } else {
                    ctx.fillStyle = '#64748b';
                    ctx.font = '9.5px Tahoma, "Segoe UI", sans-serif';
                }

                ctx.textAlign = 'center';
                const labelText = labels[idx] || String(dayItem.day || '');
                ctx.fillText(labelText, x + barWidth / 2, height - padBottom + 16);
            }
        });

        setupSalaryPeriodCanvasInteractions(canvas);
    }

    // تفاعل الماوس واللمس وإظهار Tooltip دقيق لكل يوم
    function setupSalaryPeriodCanvasInteractions(canvas) {
        if (canvas._hasPeriodInteractions) return;
        canvas._hasPeriodInteractions = true;

        const tooltip = document.getElementById('chart-period-tooltip');

        function handlePointerMove(clientX, clientY) {
            if (!tooltip || !salaryPeriodHoverBars.length) return;
            const rect = canvas.getBoundingClientRect();
            const relX = clientX - rect.left;
            const relY = clientY - rect.top;

            let nearestBar = null;
            let minDist = Infinity;

            for (let i = 0; i < salaryPeriodHoverBars.length; i++) {
                const b = salaryPeriodHoverBars[i];
                const dist = Math.abs(relX - b.stepX);
                if (dist < minDist && dist < (rect.width / salaryPeriodHoverBars.length)) {
                    minDist = dist;
                    nearestBar = b;
                }
            }

            if (nearestBar && relY >= 10 && relY <= rect.height - 20) {
                const item = nearestBar.dayItem;
                const wageFormatted = (nearestBar.val > 0)
                    ? `${nearestBar.val.toLocaleString('ar-EG', {minimumFractionDigits: 2})} ج.م`
                    : 'لا توجد شيفتات مسجلة';

                tooltip.innerHTML = `
                    <div style="font-weight:bold; color:#f8fafc; margin-bottom:3px; display:flex; align-items:center; gap:6px;">
                        <span>📅</span> ${item.dateKey} (${item.day} ${item.monthName})
                        ${item.isToday ? '<span style="background:#f59e0b; color:#fff; font-size:9px; padding:1px 5px; border-radius:4px;">اليوم</span>' : ''}
                    </div>
                    <div style="color:#93c5fd; font-size:11px;">إجمالي الرواتب: <strong style="color:#34d399;">${wageFormatted}</strong></div>
                    <div style="color:#cbd5e1; font-size:10.5px;">عدد الشيفتات: <strong>${item.shiftsCount || 0} شيفت</strong></div>
                `;

                tooltip.style.display = 'block';
                tooltip.style.left = `${nearestBar.stepX}px`;
                tooltip.style.top = `${Math.min(nearestBar.y - 10, rect.height - 70)}px`;
            } else {
                tooltip.style.display = 'none';
            }
        }

        canvas.addEventListener('mousemove', (e) => {
            handlePointerMove(e.clientX, e.clientY);
        });

        canvas.addEventListener('mouseleave', () => {
            if (tooltip) tooltip.style.display = 'none';
        });

        canvas.addEventListener('touchstart', (e) => {
            if (e.touches && e.touches[0]) {
                handlePointerMove(e.touches[0].clientX, e.touches[0].clientY);
            }
        }, { passive: true });
    }

    // مقارنة فترات العام (25 إلى 24) مع التوافق الشامل
    function drawChartMonthsOfYear(year) {
        const canvas = document.getElementById('chart-year-months');
        if (!canvas) return;
        const ctx = prepareCanvas(canvas);
        if (!ctx) return;

        const allAtt = (typeof attendanceRecords !== 'undefined' && Array.isArray(attendanceRecords)) ? attendanceRecords : [];
        const now = new Date();
        const curY = now.getFullYear();
        const curM = now.getMonth() + 1;

        const activeBasicTotal = (typeof employees !== 'undefined' && Array.isArray(employees))
            ? employees.filter(e => e && e.status !== 'انتهت خدمته').reduce((sum, e) => sum + (parseFloat(e.basicSalary) || 0), 0)
            : 0;

        const data = [];
        for (let m = 1; m <= 12; m++) {
            let prevM = m - 1;
            let prevY = year;
            if (prevM === 0) {
                prevM = 12;
                prevY = year - 1;
            }
            const cycleStart = `${prevY}-${String(prevM).padStart(2, '0')}-25`;
            const cycleEnd = `${year}-${String(m).padStart(2, '0')}-24`;

            let mSalary = allAtt
                .filter(r => {
                    if (!r || !r.date) return false;
                    const dClean = String(r.date).trim().replace(/\//g, '-');
                    return (dClean >= cycleStart && dClean <= cycleEnd);
                })
                .reduce((sum, r) => {
                    const w = parseFloat(r.wage);
                    if (!isNaN(w) && isFinite(w) && w > 0) return sum + w;
                    const hrs = parseFloat(r.hours) || 0;
                    const rt = parseFloat(r.rate) || 0;
                    return sum + (hrs * rt);
                }, 0);

            // في حال عدم وجود سجلات بالنطاق الدقيق، يتم فحص الترقيم الشهري القديم لضمان التوافق
            if (mSalary === 0) {
                const mPrefix = `${year}-${String(m).padStart(2, '0')}`;
                mSalary = allAtt
                    .filter(r => {
                        if (!r || !r.date) return false;
                        const dClean = String(r.date).trim().replace(/\//g, '-');
                        return dClean.startsWith(mPrefix);
                    })
                    .reduce((sum, r) => {
                        const w = parseFloat(r.wage);
                        if (!isNaN(w) && isFinite(w) && w > 0) return sum + w;
                        const hrs = parseFloat(r.hours) || 0;
                        const rt = parseFloat(r.rate) || 0;
                        return sum + (hrs * rt);
                    }, 0);
            }

            // في حال عدم تسجيل شيفتات بعد في الدورة الحالية، يتم عرض إجمالي الرواتب الأساسية المقررة كتقدير واقعي
            if (mSalary === 0 && year === curY && m === curM && allAtt.length === 0) {
                mSalary = activeBasicTotal;
            }

            data.push(Math.round(mSalary * 100) / 100);
        }

        const labels = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
        drawBarChart(ctx, canvas, labels, data, '#7c3aed', 'ج.م');
    }

    function prepareCanvas(canvas) {
        if (!canvas) return null;
        const parent = canvas.parentElement;
        let width = 0;
        if (parent) {
            const rect = parent.getBoundingClientRect();
            width = rect.width || parent.clientWidth || parent.offsetWidth || 0;
        }
        if (!width || width < 100) {
            const mainContent = document.querySelector('.main-content');
            if (mainContent) {
                width = mainContent.clientWidth - 50;
            }
        }
        if (!width || width < 100) {
            width = window.innerWidth ? Math.min(window.innerWidth - 40, 1100) : 800;
        }
        if (!width || width < 100) {
            width = 800;
        }

        const isMobile = width < 600;
        const baseHeight = isMobile ? 260 : 230;

        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(baseHeight * dpr);
        canvas.style.width = '100%';
        canvas.style.height = `${baseHeight}px`;

        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(dpr, dpr);
        return ctx;
    }

    function drawBarChart(ctx, canvas, labels, data, color, unit, isCompact) {
        if (!ctx || !canvas) return;
        const dpr = window.devicePixelRatio || 1;
        const width = canvas.width / dpr;
        const height = canvas.height / dpr;
        ctx.clearRect(0, 0, width, height);

        const isMobile = width < 600;
        const padLeft = isMobile ? 48 : 55;
        const padRight = 18;
        const padTop = 32;
        const padBottom = isMobile ? 58 : 38; // مساحة كافية للكتابة المائلة لأسماء الأشهر
        const chartW = Math.max(width - padLeft - padRight, 100);
        const chartH = height - padTop - padBottom;

        // تنقية وتطهير البيانات لمنع أي قيم سالبة أو غير عددية (NaN) من تعطيل الرسم
        const cleanData = (data || []).map(v => {
            const num = parseFloat(v);
            return (!isNaN(num) && isFinite(num) && num > 0) ? num : 0;
        });

        const maxVal = Math.max(...cleanData, 10);

        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 0.6;
        ctx.font = '10px Tahoma, "Segoe UI", sans-serif';
        ctx.fillStyle = '#64748b';
        ctx.textAlign = 'right';

        const gridSteps = 4;
        for (let i = 0; i <= gridSteps; i++) {
            const y = padTop + (chartH / gridSteps) * i;
            const val = Math.round(maxVal - (maxVal / gridSteps) * i);
            ctx.beginPath();
            ctx.moveTo(padLeft, y);
            ctx.lineTo(width - padRight, y);
            ctx.stroke();
            ctx.fillText(val.toLocaleString('ar-EG'), padLeft - 6, y + 4);
        }

        const barCount = cleanData.length;
        if (barCount === 0) return;
        const step = chartW / barCount;
        const barWidth = Math.max(step * (isCompact ? 0.65 : 0.45), 4);

        cleanData.forEach((val, idx) => {
            const x = width - padRight - (idx * step) - (step / 2) - (barWidth / 2);
            const barH = (val / maxVal) * chartH;
            const y = padTop + chartH - barH;

            if (barH > 0) {
                const safeH = Math.max(barH, 2);
                try {
                    const grad = ctx.createLinearGradient(0, y, 0, y + safeH);
                    grad.addColorStop(0, color);
                    grad.addColorStop(1, '#ffffff');

                    ctx.fillStyle = grad;
                    ctx.beginPath();
                    const r = Math.min(4, safeH / 2, barWidth / 2);
                    if (ctx.roundRect && r > 0) {
                        ctx.roundRect(x, y, barWidth, safeH, [r, r, 0, 0]);
                        ctx.fill();
                    } else {
                        ctx.fillRect(x, y, barWidth, safeH);
                    }
                } catch (err) {
                    ctx.fillStyle = color;
                    ctx.fillRect(x, y, barWidth, safeH);
                }
            }

            // رسم القيمة أعلى العمود مع تجنب تداخل الأرقام المتجاورة (Staggering)
            if (val > 0 && (!isCompact || val > maxVal * 0.12)) {
                ctx.fillStyle = '#1e1b4b';
                ctx.font = isMobile ? 'bold 8.5px Tahoma, "Segoe UI", sans-serif' : 'bold 9.5px Tahoma, "Segoe UI", sans-serif';
                ctx.textAlign = 'center';

                // في حال كانت المسافة ضيقة، يتم تدرج الارتفاع لتفادي التصادم الأفقي بين رقمين متجاورين
                const isClose = (step < 35);
                const staggerY = (isClose && (idx % 2 === 1)) ? (y - 15) : (y - 5);
                ctx.fillText(Math.round(val).toLocaleString('ar-EG'), x + barWidth / 2, staggerY);
            }

            // كتابة التسمية (اسم الشهر أو الموظف) أسفل العمود بشكل مائل لعدم التداخل
            if (labels && labels[idx]) {
                const lblX = x + barWidth / 2;
                const shouldRotate = isMobile || barCount >= 8;

                ctx.save();
                if (shouldRotate) {
                    // جعل النص مائلاً بزاوية -45 درجة أسفل العمود ليكون واضحاً ومفصولاً تماماً على الموبايل
                    ctx.translate(lblX, height - padBottom + 12);
                    ctx.rotate(-45 * Math.PI / 180);
                    ctx.textAlign = 'right';
                    ctx.font = isMobile ? 'bold 9.5px Tahoma, "Segoe UI", sans-serif' : '10px Tahoma, "Segoe UI", sans-serif';
                    ctx.fillStyle = '#475569';
                    ctx.fillText(labels[idx], 0, 0);
                } else {
                    ctx.textAlign = 'center';
                    ctx.font = '10px Tahoma, "Segoe UI", sans-serif';
                    ctx.fillStyle = '#64748b';
                    ctx.fillText(labels[idx], lblX, height - padBottom + 16);
                }
                ctx.restore();
            }
        });
    }

    // إتاحة الدوال في النطاق العام للتنقل السلس وإعادة التحديث
    window.renderWelcomeDashboard = renderWelcomeDashboard;
    window.drawChartEmployeesByMonth = drawChartEmployeesByMonth;
    window.drawChartDaysOfCurrentMonth = drawChartDaysOfCurrentMonth;
    window.drawChartDaysOfSalaryPeriod = drawChartDaysOfSalaryPeriod;
    window.navigateSalaryPeriod = navigateSalaryPeriod;
    window.onSalaryPeriodSelectChanged = onSalaryPeriodSelectChanged;
    window.getSalaryPeriodInfo = getSalaryPeriodInfo;
    window.drawChartMonthsOfYear = drawChartMonthsOfYear;
    window.switchSalaryChartMode = switchSalaryChartMode;
    window.renderSalaryComparisonChart = renderSalaryComparisonChart;
