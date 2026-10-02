    // ==================== 7. تقرير عام لموظف ====================
    function renderEmployeeGeneralReport() {
        const select = document.getElementById('rep-emp-profile-select');
        const container = document.getElementById('emp-profile-content');
        if (!select || !container) return;

        const empId = parseInt(select.value);
        if (!empId) {
            container.style.display = 'none';
            return;
        }

        const emp = employees.find(e => e.id === empId);
        if (!emp) {
            container.style.display = 'none';
            return;
        }

        const jobEl = document.getElementById('prof-job');
        const dueEl = document.getElementById('prof-due-total');
        const paidEl = document.getElementById('prof-paid-total');
        const balEl = document.getElementById('prof-balance-total');
        const badgeEl = document.getElementById('prof-emp-badge');

        if (jobEl) jobEl.textContent = emp.job || 'غير محدد';
        if (badgeEl) badgeEl.textContent = `${emp.name} (${emp.code || ('#' + emp.id)})`;

        // تجميع كافة الفترات والدورات الزمنية المتاحة في المنظومة
        const cyclesMap = new Map();
        const now = new Date();
        const curY = now.getFullYear();
        const todayStr = now.toISOString().split('T')[0];

        // 1. دورات العام الحالي والماضي
        [curY - 1, curY].forEach(y => {
            for (let m = 1; m <= 12; m++) {
                let prevM = m - 1;
                let prevY = y;
                if (prevM === 0) {
                    prevM = 12;
                    prevY = y - 1;
                }
                const startStr = `${prevY}-${String(prevM).padStart(2, '0')}-25`;
                const endStr = `${y}-${String(m).padStart(2, '0')}-24`;
                const mName = arabicMonths[m - 1];
                const prevMName = arabicMonths[prevM - 1];
                const key = `${startStr}_${endStr}`;
                cyclesMap.set(key, {
                    start: startStr,
                    end: endStr,
                    label: `راتب شهر ${mName} ${y} (من 25 ${prevMName} إلى 24 ${mName})`
                });
            }
        });

        // 2. دورات مسجلة في مسير الرواتب المحفوظ
        Object.keys(savedPayrollSummaryCycles || {}).forEach(k => {
            if (!cyclesMap.has(k) && k.includes('_')) {
                const [s, e] = k.split('_');
                cyclesMap.set(k, { start: s, end: e, label: `الفترة من ${s} إلى ${e}` });
            }
        });

        // 3. دورات مسجلة في قاعدة بيانات صرف الرواتب
        Object.keys(payrollDeliveryDb || {}).forEach(k => {
            const parts = k.split('_');
            if (parts.length >= 3) {
                const s = parts[0];
                const e = parts[1];
                const cKey = `${s}_${e}`;
                if (!cyclesMap.has(cKey)) {
                    cyclesMap.set(cKey, { start: s, end: e, label: `الفترة من ${s} إلى ${e}` });
                }
            }
        });

        // ترتيب الفترات تصاعدياً لحساب الرصيد التراكمي
        const sortedCycles = Array.from(cyclesMap.values()).sort((a, b) => a.start.localeCompare(b.start));

        const tbody = document.getElementById('emp-ledger-tbody');
        const tfoot = document.getElementById('emp-ledger-tfoot');
        if (tbody) tbody.innerHTML = '';
        if (tfoot) tfoot.innerHTML = '';

        let runningDue = 0;
        let runningPaid = 0;
        let runningBalance = 0;
        let rowsCount = 0;

        const repTotals = {
            basicHours: 0, basicWage: 0,
            ovTotalHours: 0, ov1Hours: 0, ov1Wage: 0,
            ov2Hours: 0, ov2Wage: 0, ovMoreHours: 0, ovMoreWage: 0, ovTotalWage: 0,
            holidayAllowance: 0, workWage: 0,
            offDaysCount: 0, offDaysWage: 0,
            visits: 0, cashback: 0, rewards: 0, admin: 0, bonus: 0, additions: 0,
            advances: 0, penalties: 0, insurance: 0, supplies: 0, otherDeductions: 0, deductions: 0,
            netSalary: 0, paid: 0, balance: 0
        };

        sortedCycles.forEach(cycle => {
            const fromDate = cycle.start;
            const toDate = cycle.end;
            const cycleKey = `${fromDate}_${toDate}`;
            const deliveryKey = `${cycleKey}_${emp.id}`;

            const periodRecords = (attendanceRecords || []).filter(r => r && r.empId === emp.id && r.date >= fromDate && r.date <= toDate);
            const calcData = calculateEmployeePayslipData(emp, fromDate, toDate);

            const basicHours = Number(calcData.totBasicHours) || 0;
            const basicWage = Number(calcData.basicWage) || 0;
            const ov1Hours = Number(calcData.totOv1Hours) || 0;
            const ov1Wage = Number(calcData.ov1Wage) || 0;
            const ov2Hours = Number(calcData.totOv2Hours) || 0;
            const ov2Wage = Number(calcData.ov2Wage) || 0;
            const ovMoreHours = Number(calcData.totOvMoreHours) || 0;
            const ovMoreWage = Number(calcData.ovMoreWage) || 0;
            const ovTotalHours = Math.round((ov1Hours + ov2Hours + ovMoreHours) * 100) / 100;
            const ovTotalWage = Math.round((ov1Wage + ov2Wage + ovMoreWage) * 100) / 100;
            const holidayAllowance = Number(calcData.holidayAllowance) || 0;
            const workWage = Math.round((basicWage + ovTotalWage + holidayAllowance) * 100) / 100;
            const offDaysCount = Number(calcData.offDaysCount) || 0;
            const offDaysWage = Number(calcData.offDaysWage) || 0;
            const visits = Number(calcData.visitsVal) || 0;
            const cashback = Number(calcData.cashbackVal) || 0;
            const rewards = Number(calcData.rewardsVal) || 0;
            const admin = Number(calcData.adminVal) || 0;
            const bonus = Number(calcData.bonusVal) || 0;
            const additions = Number(calcData.totalAdditions) || 0;
            const advances = Number(calcData.advVal) || 0;
            const penalties = Number(calcData.penVal) || 0;
            const insurance = Number(calcData.insVal) || 0;
            const supplies = Number(calcData.supVal) || 0;
            const otherDeductions = Number(calcData.otherVal) || 0;
            const deductions = Number(calcData.totalDeductions) || 0;
            const netWage = Math.round((calcData.finalNet || 0) * 100) / 100;
            const settledWage = settleSalaryAmount(netWage);

            const deliveryRec = payrollDeliveryDb[deliveryKey] || {};
            const hasAttendancePaid = periodRecords.length > 0 && periodRecords.every(r => r.isPaid);
            const isPaid = (deliveryRec.isPaid !== undefined) ? !!deliveryRec.isPaid : hasAttendancePaid;

            let disbursedSalary = 0;
            if (isPaid) {
                disbursedSalary = (deliveryRec.amount !== undefined) ? Number(deliveryRec.amount) : settledWage;
            }

            // إظهار الدورات ذات النشاط أو الدورات المنقضية حتى الشهر الحالي
            const isPastOrCurrent = toDate <= todayStr || fromDate <= todayStr;
            const hasActivity = periodRecords.length > 0 || settledWage > 0 || disbursedSalary > 0 || isPaid;

            if (!hasActivity && !isPastOrCurrent) {
                return;
            }

            // احتساب الرصيد المجمع التراكمي: مستحقات الموظف مطروح منها ما تم صرفه
            runningDue += settledWage;
            runningPaid += disbursedSalary;
            runningBalance = runningDue - runningPaid;
            rowsCount++;

            repTotals.basicHours += basicHours;
            repTotals.basicWage += basicWage;
            repTotals.ovTotalHours += ovTotalHours;
            repTotals.ov1Hours += ov1Hours;
            repTotals.ov1Wage += ov1Wage;
            repTotals.ov2Hours += ov2Hours;
            repTotals.ov2Wage += ov2Wage;
            repTotals.ovMoreHours += ovMoreHours;
            repTotals.ovMoreWage += ovMoreWage;
            repTotals.ovTotalWage += ovTotalWage;
            repTotals.holidayAllowance += holidayAllowance;
            repTotals.workWage += workWage;
            repTotals.offDaysCount += offDaysCount;
            repTotals.offDaysWage += offDaysWage;
            repTotals.visits += visits;
            repTotals.cashback += cashback;
            repTotals.rewards += rewards;
            repTotals.admin += admin;
            repTotals.bonus += bonus;
            repTotals.additions += additions;
            repTotals.advances += advances;
            repTotals.penalties += penalties;
            repTotals.insurance += insurance;
            repTotals.supplies += supplies;
            repTotals.otherDeductions += otherDeductions;
            repTotals.deductions += deductions;
            repTotals.netSalary += settledWage;
            repTotals.paid += disbursedSalary;

            if (tbody) {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td style="text-align:right; font-weight:bold; white-space:nowrap;">
                        <strong style="color:var(--text-main); font-size:12px;">${cycle.label}</strong>
                    </td>
                    <td style="text-align:center; color:#10b981; font-weight:bold;">${basicWage.toLocaleString('ar-EG', {minimumFractionDigits: 2})}</td>
                    <td style="text-align:center; font-weight:bold; color:#047857;">${ovTotalWage.toLocaleString('ar-EG', {minimumFractionDigits: 2})}</td>
                    <td style="text-align:center; font-weight:bold; color:#f59e0b;">${offDaysWage.toLocaleString('ar-EG', {minimumFractionDigits: 2})}</td>
                    <td style="text-align:center; color:#10b981;">${visits.toLocaleString('ar-EG', {minimumFractionDigits: 2})}</td>
                    <td style="text-align:center; color:#10b981;">${cashback.toLocaleString('ar-EG', {minimumFractionDigits: 2})}</td>
                    <td style="text-align:center; color:#10b981;">${rewards.toLocaleString('ar-EG', {minimumFractionDigits: 2})}</td>
                    <td style="text-align:center; color:#10b981;">${admin.toLocaleString('ar-EG', {minimumFractionDigits: 2})}</td>
                    <td style="text-align:center; color:#10b981;">${bonus.toLocaleString('ar-EG', {minimumFractionDigits: 2})}</td>
                    <td style="text-align:center; font-weight:bold; color:#10b981; background:rgba(16,185,129,0.08);">${additions.toLocaleString('ar-EG', {minimumFractionDigits: 2})}</td>
                    <td style="text-align:center; color:#ef4444;">${advances.toLocaleString('ar-EG', {minimumFractionDigits: 2})}</td>
                    <td style="text-align:center; color:#ef4444;">${penalties.toLocaleString('ar-EG', {minimumFractionDigits: 2})}</td>
                    <td style="text-align:center; color:#ef4444;">${insurance.toLocaleString('ar-EG', {minimumFractionDigits: 2})}</td>
                    <td style="text-align:center; color:#ef4444;">${supplies.toLocaleString('ar-EG', {minimumFractionDigits: 2})}</td>
                    <td style="text-align:center; color:#ef4444;">${otherDeductions.toLocaleString('ar-EG', {minimumFractionDigits: 2})}</td>
                    <td style="text-align:center; font-weight:bold; color:#ef4444; background:rgba(239,68,68,0.08);">${deductions.toLocaleString('ar-EG', {minimumFractionDigits: 2})}</td>
                    <td style="text-align:center; font-weight:800; color:#a855f7; background:rgba(168,85,247,0.12);">${settledWage.toLocaleString('ar-EG', {minimumFractionDigits: 2})} ج.م</td>
                    <td style="text-align:center; font-weight:bold; color:#059669; background:rgba(5,150,105,0.12);">
                        ${isPaid ? `${disbursedSalary.toLocaleString('ar-EG', {minimumFractionDigits: 2})} ج.م` : '<span style="color:#f59e0b;">⏳ معلق</span>'}
                    </td>
                    <td style="text-align:center; font-weight:900; color:#1d4ed8; background:rgba(37,99,235,0.15);">
                        ${runningBalance.toLocaleString('ar-EG', {minimumFractionDigits: 2})} ج.م
                    </td>
                `;
                tbody.appendChild(tr);
            }
        });

        if (rowsCount === 0 && tbody) {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td colspan="19" style="text-align:center; padding:15px; color:var(--text-muted);">لا توجد حركات مسجلة لهذا الموظف حتى الآن.</td>`;
            tbody.appendChild(tr);
        }

        if (tfoot) {
            const fmt = (n) => Number(n || 0).toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            tfoot.innerHTML = `
                <tr style="background:#0f172a; color:#ffffff; font-weight:900; border-top:2.5px solid #38bdf8;">
                    <td style="padding:8px; text-align:right; font-size:12px; color:#fde047;">الإجمـــــالي التراكمي الشامل</td>
                    <td style="text-align:center; color:#34d399; font-weight:bold;">${fmt(repTotals.basicWage)}</td>
                    <td style="text-align:center; color:#34d399; font-weight:bold;">${fmt(repTotals.ovTotalWage)}</td>
                    <td style="text-align:center; color:#fbbf24; font-weight:bold;">${fmt(repTotals.offDaysWage)}</td>
                    <td style="text-align:center; color:#34d399;">${fmt(repTotals.visits)}</td>
                    <td style="text-align:center; color:#34d399;">${fmt(repTotals.cashback)}</td>
                    <td style="text-align:center; color:#34d399;">${fmt(repTotals.rewards)}</td>
                    <td style="text-align:center; color:#34d399;">${fmt(repTotals.admin)}</td>
                    <td style="text-align:center; color:#34d399;">${fmt(repTotals.bonus)}</td>
                    <td style="text-align:center; color:#34d399; font-weight:bold; background:rgba(52,211,153,0.15);">${fmt(repTotals.additions)}</td>
                    <td style="text-align:center; color:#f87171;">${fmt(repTotals.advances)}</td>
                    <td style="text-align:center; color:#f87171;">${fmt(repTotals.penalties)}</td>
                    <td style="text-align:center; color:#f87171;">${fmt(repTotals.insurance)}</td>
                    <td style="text-align:center; color:#f87171;">${fmt(repTotals.supplies)}</td>
                    <td style="text-align:center; color:#f87171;">${fmt(repTotals.otherDeductions)}</td>
                    <td style="text-align:center; color:#f87171; font-weight:bold; background:rgba(248,113,113,0.15);">${fmt(repTotals.deductions)}</td>
                    <td style="text-align:center; color:#f0abfc; background:#3b0764; font-weight:800;">${fmt(repTotals.netSalary)} ج.م</td>
                    <td style="text-align:center; color:#34d399; background:#064e3b; font-weight:bold;">${fmt(repTotals.paid)} ج.م</td>
                    <td style="text-align:center; color:#93c5fd; background:#1e3a8a; font-size:13px; font-weight:900;">${fmt(runningBalance)} ج.م</td>
                </tr>
            `;
        }

        if (dueEl) dueEl.textContent = `${runningDue.toLocaleString('ar-EG', {minimumFractionDigits: 2})} ج.م`;
        if (paidEl) paidEl.textContent = `${runningPaid.toLocaleString('ar-EG', {minimumFractionDigits: 2})} ج.م`;
        if (balEl) {
            balEl.textContent = `${runningBalance.toLocaleString('ar-EG', {minimumFractionDigits: 2})} ج.م`;
            balEl.style.color = runningBalance > 0 ? 'var(--danger)' : 'var(--success)';
        }

        container.style.display = 'block';
    }

    // ==================== طباعة وتصدير كشف حساب تقرير عام لموظف بالكامل (LANDSCAPE) ====================
    function getEmployeeGeneralReportPrintHtml() {
        const select = document.getElementById('rep-emp-profile-select');
        if (!select || !select.value) {
            showToast('يرجى اختيار موظف أولاً لطباعة التقرير!', 'warning');
            return '';
        }
        const empId = parseInt(select.value);
        const emp = employees.find(e => e.id === empId);
        if (!emp) return '';

        const job = emp.job || 'غير محدد';
        const dueTotal = document.getElementById('prof-due-total')?.innerText || '0.00 ج.م';
        const paidTotal = document.getElementById('prof-paid-total')?.innerText || '0.00 ج.م';
        const balTotal = document.getElementById('prof-balance-total')?.innerText || '0.00 ج.م';

        // استنساخ صفوف الجدول وتجريدها من الخلفيات لتكون واضحة
        const tbody = document.getElementById('emp-ledger-tbody');
        const tfoot = document.getElementById('emp-ledger-tfoot');
        if (!tbody) return '';

        const tbodyClone = tbody.cloneNode(true);
        const tfootClone = tfoot ? tfoot.cloneNode(true) : null;

        // حذف الأعمدة 9 (إجمالي الإضافات), 15 (إجمالي الخصومات), 16 (صافي المستحق) من كل صف
        // الفهارس تبدأ من 0، بعد عمود اسم الفترة: basicWage=1, ovTotal=2, offDays=3, visits=4, cashback=5,
        // rewards=6, admin=7, bonus=8, addTotal=9, adv=10, pen=11, ins=12, sup=13, other=14, dedTotal=15, net=16, paid=17, balance=18
        const colsToRemove = [9, 15, 16]; // إجمالي الإضافات, إجمالي الخصومات, صافي المستحق

        [tbodyClone, tfootClone].forEach(root => {
            if (!root) return;
            root.querySelectorAll('tr').forEach(row => {
                const cells = Array.from(row.querySelectorAll('td, th'));
                // حذف من الأعلى للأسفل لتجنب تغيير الفهارس
                [...colsToRemove].reverse().forEach(ci => {
                    if (cells[ci]) cells[ci].remove();
                });
            });
            root.querySelectorAll('*').forEach(el => {
                if (el.tagName === 'TD' || el.tagName === 'TH') {
                    el.style.border = '1px solid #000000';
                    el.style.padding = '2px 2px';
                    el.style.fontSize = '6.5pt';
                    el.style.whiteSpace = 'normal';
                    el.style.wordBreak = 'break-word';
                }
            });
        });

        return `
            <!DOCTYPE html>
            <html lang="ar" dir="rtl">
            <head>
                <meta charset="UTF-8">
                <title>تقرير عام لموظف - ${emp.name}</title>
                <style>
                    @page { size: A4 landscape; margin: 4mm 5mm; }
                    * { box-sizing: border-box !important; }
                    body {
                        font-family: Tahoma, 'Segoe UI', Arial, sans-serif;
                        direction: rtl;
                        color: #000000;
                        background: #ffffff;
                        margin: 0;
                        padding: 4px;
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }
                    .emp-info-box {
                        border: 1.2px solid #000000;
                        padding: 6px 12px;
                        margin-bottom: 8px;
                        border-radius: 4px;
                        background: #f8fafc;
                        display: flex;
                        justify-content: space-between;
                        font-size: 11px;
                        font-weight: bold;
                    }
                    .kpi-row {
                        display: flex;
                        justify-content: space-between;
                        gap: 8px;
                        margin-bottom: 8px;
                    }
                    .kpi-box {
                        flex: 1;
                        border: 1.2px solid #000000;
                        padding: 4px 8px;
                        text-align: center;
                        border-radius: 4px;
                        background: #ffffff;
                    }
                    .kpi-box div:first-child { font-size: 10px; font-weight: bold; margin-bottom: 2px; }
                    .kpi-box div:last-child { font-size: 12px; font-weight: 900; }
                    table {
                        width: 100%;
                        border-collapse: collapse;
                        table-layout: fixed;
                        font-size: 6.5pt;
                        text-align: center;
                        margin-top: 4px;
                    }
                    th, td {
                        border: 1px solid #000000 !important;
                        padding: 2px 2px !important;
                        color: #000000 !important;
                        white-space: normal !important;
                        word-break: break-word !important;
                        overflow: hidden !important;
                    }
                    th {
                        background-color: #f1f5f9 !important;
                        font-weight: bold;
                    }
                    tr {
                        page-break-inside: avoid;
                    }
                    .footer {
                        margin-top: 15px;
                        display: flex;
                        justify-content: space-between;
                        font-size: 10px;
                        font-weight: bold;
                        border-top: 1px dashed #000000;
                        padding-top: 6px;
                    }
                </style>
            </head>
            <body>
                ${typeof getClinicReportHeaderHtml === 'function' ? getClinicReportHeaderHtml('تقرير عام شامل لموظف (كشف الحساب التراكمي)', `الموظف: ${emp.name} (${emp.code || '#' + emp.id}) | القسم: ${job}`) : `
                <div class="print-header" style="text-align:center; border-bottom:2px solid #990012; padding-bottom:6px; margin-bottom:8px;">
                    <h2 style="margin:0; color:#102a45; font-size:16px;">عيادات سيدى ياقوت التخصصية</h2>
                    <p style="margin:2px 0 0 0; font-size:11px; color:#475569;">👤 تقرير عام لموظف (كشف الحساب التراكمي الشامل لمستحقات ورواتب الموظف)</p>
                </div>`}
                <div class="emp-info-box">
                    <div>الموظف: ${emp.name} (${emp.code || '#' + emp.id})</div>
                    <div>القسم / الوظيفة: ${job}</div>
                    <div>تاريخ الطباعة: ${new Date().toLocaleDateString('ar-EG')}</div>
                </div>
                <div class="kpi-row">
                    <div class="kpi-box">
                        <div>إجمالي المستحق لكافة الفترات</div>
                        <div>${dueTotal}</div>
                    </div>
                    <div class="kpi-box">
                        <div>إجمالي المنصرف حقيقة</div>
                        <div>${paidTotal}</div>
                    </div>
                    <div class="kpi-box">
                        <div>صافي الرصيد المتبقي</div>
                        <div>${balTotal}</div>
                    </div>
                </div>
                <table>
                    <thead>
                        <tr>
                            <th style="width:18%; text-align:right;">اسم فترة الراتب</th>
                            <th style="width:5%;">قيمة الساعات الأساسية</th>
                            <th style="width:5%;">قيمة إجمالي الإضافي</th>
                            <th style="width:5%;">قيمة أيام الراحات</th>
                            <th style="width:5%;">زيارات</th>
                            <th style="width:5%;">كاش باك</th>
                            <th style="width:5%;">مكافآت</th>
                            <th style="width:5%;">بدل إدارة</th>
                            <th style="width:5%;">بونص</th>
                            <th style="width:5%;">سلف</th>
                            <th style="width:5%;">جزاءات</th>
                            <th style="width:5%;">تأمينات</th>
                            <th style="width:5%;">خصم مستلزمات</th>
                            <th style="width:5%;">استقطاعات أخرى</th>
                            <th style="width:7%; background:#d1fae5 !important; font-weight:bold;">المنصرف فعلياً</th>
                            <th style="width:7%; background:#dbeafe !important; font-weight:bold;">الرصيد المتبقي</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${tbodyClone.innerHTML}
                    </tbody>
                    ${tfootClone ? `<tfoot>${tfootClone.innerHTML}</tfoot>` : ''}
                </table>
                <div class="footer">
                    <div>توقيع الموظف بالاستلام: ..............................</div>
                    <div>المسؤول المالي: ..............................</div>
                    <div>اعتماد الإدارة: ..............................</div>
                </div>
            </body>
            </html>
        `;
    }

    function printEmployeeGeneralReport() {
        const html = getEmployeeGeneralReportPrintHtml();
        if (!html) return;
        const printWindow = window.open('', '_blank');
        if (!printWindow) {
            alert('يرجى السماح بالنوافذ المنبثقة لطباعة التقرير!');
            return;
        }
        printWindow.document.write(html + '<script>window.onload = function() { window.print(); };<\/script>');
        printWindow.document.close();
    }

    function exportEmployeeGeneralReportToPdf() {
        const html = getEmployeeGeneralReportPrintHtml();
        if (!html) return;
        const select = document.getElementById('rep-emp-profile-select');
        const empId = parseInt(select.value);
        const emp = employees.find(e => e.id === empId);
        const empName = emp ? emp.name.replace(/\s+/g, '_') : 'موظف';
        const filename = `تقرير_عام_لموظف_${empName}_${new Date().toISOString().slice(0, 10)}.pdf`;
        downloadPrintHtmlAsPdf(html, filename, 'landscape');
    }


