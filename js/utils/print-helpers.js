    function downloadPrintHtmlAsPdf(htmlString, filename, orientation = 'portrait') {
        let cleanTitle = (filename || 'مستند_الرواتب').replace(/\.pdf$/i, '').replace(/[\\/:*?"<>|]+/g, '_').trim();
        if (!cleanTitle) cleanTitle = 'مستند_الرواتب';
        const finalFilename = `${cleanTitle}.pdf`;
        showToast('جاري إنشاء وتحميل ملف الـ PDF مباشرة إلى جهازك... 📄', 'info');

        if (typeof html2pdf !== 'undefined') {
            try {
                // استبدال مسارات الصور النسبية بـ Base64 لضمان عدم حدوث أي خطأ أوفلاين أو CORS
                let processedHtml = htmlString;
                if (window.CLINIC_LOGO_B64) {
                    processedHtml = processedHtml.replace(/assets\/sidi-yaqout-logo(-transparent)?\.png/g, window.CLINIC_LOGO_B64);
                }
                if (window.CLINIC_SLOGAN_B64) {
                    processedHtml = processedHtml.replace(/assets\/sidi-yaqout-slogan(-transparent)?\.png/g, window.CLINIC_SLOGAN_B64);
                }

                // استخراج التنسيقات ومحتوى الـ body
                const parser = new DOMParser();
                const doc = parser.parseFromString(processedHtml, 'text/html');
                const bodyHtml = doc.body ? doc.body.innerHTML : processedHtml;
                let styleHtml = '';
                doc.head.querySelectorAll('style').forEach(st => {
                    styleHtml += st.outerHTML + '\n';
                });

                // ضبط العرض المناسب لمقاس ورقة A4 لضمان احتواء كافة الأعمدة بدون اقتصاص
                const contentWidth = (orientation === 'landscape') ? '1060px' : '760px';
                const containerHtml = `<div class="pdf-export-container" style="width:${contentWidth}; min-height:100%; background:#ffffff; color:#000000; direction:rtl; font-family:Tahoma,'Segoe UI',Arial,sans-serif; box-sizing:border-box; padding:8px;">${styleHtml}${bodyHtml}</div>`;

                const opt = {
                    margin: [5, 5, 5, 5],
                    filename: finalFilename,
                    image: { type: 'jpeg', quality: 0.98 },
                    html2canvas: {
                        scale: 2,
                        useCORS: true,
                        allowTaint: true,
                        logging: false,
                        backgroundColor: '#ffffff'
                    },
                    jsPDF: { unit: 'mm', format: 'a4', orientation: orientation || 'portrait' },
                    pagebreak: { mode: ['css', 'legacy'], avoid: ['tr', 'td', 'th'] }
                };

                html2pdf().set(opt).from(containerHtml, 'string').save().then(() => {
                    showToast(`تم حفظ وتنزيل ملف PDF (${finalFilename}) بنجاح! 💾📄`, 'success');
                }).catch(err => {
                    console.warn('html2pdf save error, using print fallback:', err);
                    showToast('تم فتح نافذة الطباعة كبديل لحفظ ملف الـ PDF.', 'info');
                    openPrintWindowFallback(processedHtml, finalFilename);
                });
                return;
            } catch (err) {
                console.warn('html2pdf catch error:', err);
                showToast('تم فتح نافذة الطباعة كبديل لحفظ ملف الـ PDF.', 'info');
                openPrintWindowFallback(htmlString, finalFilename);
                return;
            }
        }

        // إذا لم تكن المكتبة متوفرة يتم التحويل لنافذة الطباعة
        openPrintWindowFallback(htmlString, finalFilename);
    }

    function openPrintWindowFallback(htmlString, filename) {
        const printWindow = window.open('', '_blank');
        if (!printWindow) {
            alert('يرجى السماح بالنوافذ المنبثقة لتحميل ملف الـ PDF!');
            return;
        }
        const cleanTitle = (filename || 'مستند_الرواتب').replace(/\.pdf$/i, '');
        let finalHtml = htmlString;
        if (finalHtml.includes('<title>')) {
            finalHtml = finalHtml.replace(/<title>.*?<\/title>/i, `<title>${cleanTitle}</title>`);
        } else {
            finalHtml = finalHtml.replace('<head>', `<head><title>${cleanTitle}</title>`);
        }
        printWindow.document.write(finalHtml + '<script>window.onload = function() { window.print(); };<\/script>');
        printWindow.document.close();
    }

    // الدالة الشاملة لتصدير أي تقرير أو جدول بالمنظومة كملف PDF مطابق للطباعة مع اللوجو والسلوجن
    function exportScreenReportToPdf(elementId, docTitle, orientation = 'landscape') {
        const el = document.getElementById(elementId);
        if (!el) {
            showToast('العنصر غير متاح للتصدير حالياً!', 'warning');
            return;
        }
        const clone = el.cloneNode(true);
        clone.querySelectorAll('button, input, select, .no-print').forEach(e => e.remove());
        clone.querySelectorAll('.table-wrap').forEach(e => {
            e.style.maxHeight = 'none';
            e.style.overflow = 'visible';
        });

        const headerHtml = (typeof getClinicReportHeaderHtml === 'function')
            ? getClinicReportHeaderHtml(docTitle || 'تقرير رسمي', 'منظومة إدارة رواتب وسراكي العاملين')
            : `<div class="header" style="text-align:center; border-bottom:2px solid #990012; padding-bottom:8px; margin-bottom:12px;">
                <h2 style="margin:0; color:#102a45;">عيادات سيدى ياقوت التخصصية</h2>
                <p style="margin:4px 0 0 0; font-size:12px; color:#475569;">${docTitle || 'تقرير رسمي'} | تاريخ الاستخراج: ${new Date().toLocaleDateString('ar-EG')}</p>
               </div>`;

        const printHtml = `
            <!DOCTYPE html>
            <html lang="ar" dir="rtl">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <title>${docTitle || 'تقرير'} - عيادات سيدى ياقوت التخصصية</title>
                <style>
                    @page { size: A4 ${orientation}; margin: 8mm; }
                    body { font-family: Tahoma, 'Segoe UI', Arial, sans-serif; direction: rtl; color: #000; margin: 0; padding: 10px; background:#fff; }
                    table { width: 100%; border-collapse: collapse; font-size: 11px; text-align: center; margin-top: 8px; }
                    th, td { border: 1.5px solid #000; padding: 5px 6px; }
                    th { background-color: #f1f5f9; font-weight: bold; }
                    .footer { margin-top: 25px; display: flex; justify-content: space-between; font-size: 11.5px; font-weight: bold; border-top: 1px dashed #990012; padding-top: 8px; }
                </style>
            </head>
            <body>
                ${headerHtml}
                ${clone.outerHTML}
                <div class="footer">
                    <div>عيادات سيدي ياقوت التخصصية • 365 يوم من الرعاية</div>
                    <div>اعتماد الإدارة / الحسابات: .................................</div>
                </div>
            </body>
            </html>
        `;

        const filename = `${(docTitle || 'مستند').replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`;
        downloadPrintHtmlAsPdf(printHtml, filename, orientation);
    }

    function exportScreenToPdf(elementId, docTitle, orientation = 'landscape') {
        exportScreenReportToPdf(elementId, docTitle, orientation);
    }
// شاشة سراكي الموظفين المجمعة تم إلغاؤها بطلب المستخدم

