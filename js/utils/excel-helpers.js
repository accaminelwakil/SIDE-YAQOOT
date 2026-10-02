    // ==================== تصدير التقارير (Excel / CSV) ====================
    function exportAttendanceCSV() {
        if (attendanceRecords.length === 0) return alert('لا توجد حركات حضور لتصديرها!');
        let csv = '\uFEFFالكود,اسم الموظف,الوظيفة,التاريخ,الحضور,الانصراف,الساعات,سعر الساعة,المستحق,حالة الصرف\n';
        attendanceRecords.forEach((r, idx) => {
            csv += `"${idx + 1}","${r.name}","${r.job}","${r.date}","${r.timeIn}","${r.timeOut}","${r.hours}","${r.rate}","${r.wage}","${r.isPaid ? 'مصروف' : 'معلق'}"\n`;
        });
        downloadCSV(csv, `حركات_الحضور_${new Date().toISOString().split('T')[0]}.csv`);
    }

    function exportEmployeesCSV() {
        if (!employees || employees.length === 0) {
            alert('لا توجد بيانات موظفين لتصديرها!');
            return;
        }

        let tableRows = '';
        employees.forEach((e, idx) => {
            const rates = computeRates(e.basicSalary, e.shiftHours);
            tableRows += `
                <tr>
                    <td style="text-align:center;">${e.id}</td>
                    <td style="text-align:right; font-weight:bold;">${e.name}</td>
                    <td style="text-align:center;">${e.job}</td>
                    <td style="text-align:center;">${e.offDay || '-'}</td>
                    <td style="text-align:center;">${e.basicSalary}</td>
                    <td style="text-align:center;">${e.shiftHours || 8}</td>
                    <td style="text-align:center;">${rates.hourlyRate.toFixed(2)}</td>
                    <td style="text-align:center;">${rates.ov1.toFixed(2)}</td>
                    <td style="text-align:center;">${rates.ov2.toFixed(2)}</td>
                    <td style="text-align:center;">${rates.ovMore.toFixed(2)}</td>
                    <td style="text-align:center;">${e.lastIncreaseMonth || '-'}</td>
                    <td style="text-align:center;">${e.salaryBefore || e.basicSalary}</td>
                    <td style="text-align:center;">${e.increaseAmount || 0}</td>
                    <td style="text-align:center;">${e.status || 'نشط'}</td>
                </tr>
            `;
        });

        const excelTemplate = `
            <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
            <head>
                <meta http-equiv="content-type" content="application/vnd.ms-excel; charset=UTF-8">
                <!--[if gte mso 9]>
                <xml>
                <x:ExcelWorkbook>
                <x:ExcelWorksheets>
                <x:ExcelWorksheet>
                <x:Name>بيانات الموظفين</x:Name>
                <x:WorksheetOptions>
                    <x:DisplayRightToLeft/>
                </x:WorksheetOptions>
                </x:ExcelWorksheet>
                </x:ExcelWorksheets>
                </x:ExcelWorkbook>
                </xml>
                <![endif]-->
                <style>
                    body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; direction: rtl; }
                    table { border-collapse: collapse; width: 100%; direction: rtl; }
                    th { background-color: #ede9fe; color: #4338ca; border: 1px solid #334155; padding: 10px; font-weight: bold; }
                    td { border: 1px solid #cbd5e1; padding: 8px; }
                </style>
            </head>
            <body>
                <h3 style="text-align:center; font-family:Tahoma;">عيادات سيدى ياقوت التخصصية - قاعدة بيانات الموظفين والرواتب</h3>
                <table border="1">
                    <thead>
                        <tr>
                            <th>كود الموظف</th>
                            <th>اسم الموظف</th>
                            <th>القسم</th>
                            <th>يوم الإجازة</th>
                            <th>الراتب الأساسي</th>
                            <th>ساعات الشيفت</th>
                            <th>سعر الساعة</th>
                            <th>إضافي أول ساعة</th>
                            <th>إضافي س1 إلى س2</th>
                            <th>إضافي فوق ساعتين</th>
                            <th>تاريخ آخر زيادة</th>
                            <th>الراتب قبل التعديل</th>
                            <th>قيمة الزيادة</th>
                            <th>الحالة</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${tableRows}
                    </tbody>
                </table>
            </body>
            </html>
        `;

        const blob = new Blob([excelTemplate], { type: 'application/vnd.ms-excel;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `بيانات_الموظفين_عيادات_سيدى_ياقوت_${new Date().toISOString().split('T')[0]}.xls`;
        link.click();
    }

    function exportAllSarakiCSV() {
        let csv = '\uFEFFاسم الموظف,القسم,عدد الشيفتات,إجمالي الساعات,سعر الساعة,إجمالي المستحق\n';
        employees.filter(e => e.status !== 'انتهت خدمته').forEach(emp => {
            const recs = attendanceRecords.filter(r => r.empId === emp.id);
            const hrs = recs.reduce((s, r) => s + r.hours, 0);
            const wage = recs.reduce((s, r) => s + r.wage, 0);
            csv += `"${emp.name}","${emp.job}","${recs.length}","${hrs.toFixed(2)}","${emp.hourlyRate}","${wage.toFixed(2)}"\n`;
        });
        downloadCSV(csv, `سراكي_الموظفين_المجمعة_${new Date().toISOString().split('T')[0]}.csv`);
    }

    function exportOrgSummaryCSV() {
        let csv = '\uFEFFاسم الموظف,القسم,الراتب الأساسي,سعر الساعة,إجمالي الساعات,المستحق,المسدد,المتبقي\n';
        employees.forEach(emp => {
            const recs = attendanceRecords.filter(r => r.empId === emp.id);
            const hrs = recs.reduce((s, r) => s + r.hours, 0);
            const wage = recs.reduce((s, r) => s + r.wage, 0);
            const paid = recs.filter(r => r.isPaid).reduce((s, r) => s + r.wage, 0);
            csv += `"${emp.name}","${emp.job}","${emp.basicSalary}","${emp.hourlyRate}","${hrs.toFixed(2)}","${wage.toFixed(2)}","${paid.toFixed(2)}","${(wage - paid).toFixed(2)}"\n`;
        });
        downloadCSV(csv, `تقرير_رواتب_المؤسسة_الشامل_${new Date().toISOString().split('T')[0]}.csv`);
    }

    function downloadCSV(content, filename) {
        const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        link.click();
    }

    
    // ==================== الدالة الشاملة لتصدير أي جدول في المنظومة إلى Excel مباشر ====================
    function exportTableToExcel(tableId, filenamePrefix) {
        const table = document.getElementById(tableId);
        if (!table) {
            alert('الجدول غير متاح للتصدير حالياً!');
            return;
        }

        let rowsHtml = '';
        const allRows = table.querySelectorAll('tr');

        if (allRows.length === 0) {
            alert('لا توجد بيانات داخل الجدول لتصديرها!');
            return;
        }

        allRows.forEach(tr => {
            let rowHtml = '<tr>';
            const cells = tr.querySelectorAll('th, td');
            
            cells.forEach(cell => {
                const textCheck = cell.textContent.trim();
                if (textCheck === 'إجراء' || textCheck === 'إجراءات (تعديل / خدمة)' || textCheck === 'معاينة السركي' || textCheck === 'إجراء التسليم' || textCheck === 'ملاحظات / توقيع' || textCheck === 'التوقيع') {
                    return;
                }
                if (cell.querySelector('button') && !cell.querySelector('input') && !cell.querySelector('select') && !cell.textContent.replace(/[🗑️✏️✔]/g, '').trim()) {
                    return;
                }

                let cellVal = '';
                const inputEl = cell.querySelector('input:not([type="checkbox"])');
                const selectEl = cell.querySelector('select');
                const checkboxEl = cell.querySelector('input[type="checkbox"]');

                if (inputEl) {
                    cellVal = inputEl.value !== undefined ? inputEl.value : inputEl.placeholder;
                } else if (selectEl) {
                    cellVal = selectEl.options[selectEl.selectedIndex] ? selectEl.options[selectEl.selectedIndex].text : selectEl.value;
                } else if (checkboxEl) {
                    cellVal = checkboxEl.checked ? 'نعم' : 'لا';
                } else {
                    cellVal = cell.innerText || cell.textContent || '';
                }

                cellVal = cellVal.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
                const isTh = (cell.tagName.toLowerCase() === 'th');
                const bgStyle = isTh ? 'background-color:#ede9fe; color:#4338ca; font-weight:bold;' : '';

                rowHtml += `<${cell.tagName.toLowerCase()} style="border:1px solid #94a3b8; padding:8px 10px; text-align:center; ${bgStyle}">${cellVal}</${cell.tagName.toLowerCase()}>`;
            });

            rowHtml += '</tr>';
            rowsHtml += rowHtml;
        });

        const now = new Date();
        const dateStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
        const finalFilename = `${filenamePrefix || 'تصدير_بيانات'}_${dateStr}.xls`;

        const excelDoc = `
            <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
            <head>
                <meta http-equiv="content-type" content="application/vnd.ms-excel; charset=UTF-8">
                <!--[if gte mso 9]>
                <xml>
                <x:ExcelWorkbook>
                <x:ExcelWorksheets>
                <x:ExcelWorksheet>
                <x:Name>بيانات_العيادات</x:Name>
                <x:WorksheetOptions>
                    <x:DisplayRightToLeft/>
                </x:WorksheetOptions>
                </x:ExcelWorksheet>
                </x:ExcelWorksheets>
                </x:ExcelWorkbook>
                </xml>
                <![endif]-->
                <style>
                    body { font-family: Tahoma, 'Segoe UI', Arial, sans-serif; direction: rtl; text-align: right; }
                    table { border-collapse: collapse; direction: rtl; width: 100%; margin-top: 10px; }
                    th { background-color: #ede9fe; color: #4338ca; border: 1px solid #334155; padding: 10px; font-weight: bold; text-align: center; }
                    td { border: 1px solid #cbd5e1; padding: 8px; text-align: center; }
                </style>
            </head>
            <body>
                <h3 style="text-align:center; font-family:Tahoma; color:#1e1b4b; margin-bottom:5px;">عيادات سيدى ياقوت التخصصية</h3>
                <h4 style="text-align:center; font-family:Tahoma; color:#334155; margin-top:0;">${(filenamePrefix || '').replace(/_/g, ' ')} | تاريخ التصدير: ${dateStr}</h4>
                <table border="1">
                    ${rowsHtml}
                </table>
            </body>
            </html>
        `;

        const blob = new Blob([excelDoc], { type: 'application/vnd.ms-excel;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = finalFilename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

