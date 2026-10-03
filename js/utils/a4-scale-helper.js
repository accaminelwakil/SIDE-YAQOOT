// ====================================================================
// نظام التصغير والملاءمة التلقائية لشاشات السراكي والجداول على الموبايل
// A4 Payslips & Sheets Auto-Scaling & Responsive Engine
// منظومة عيادات سيدي ياقوت التخصصية
// ====================================================================

(function() {
    let currentScaleMode = 'fit'; // 'fit' (ملاءمة الشاشة) or 'original' (حجم أصلي 100% مع تمرير)

    // الدالة الرئيسية لضبط وتوسيط مقاس كافة السراكي والشيتات A4 على شاشة الموبايل
    function autoScaleAllA4Sheets() {
        // إذا كانت الشاشة أكبر من 768px (كمبيوتر أو شاشات كبيرة)، استعادة الوضع الطبيعي
        if (window.innerWidth > 768) {
            resetAllA4Scaling();
            return;
        }

        const standardA4Width = 794; // العرض القياسي لصفحة A4 عند 96 DPI
        const screenWidth = Math.min(window.innerWidth || 360, document.documentElement.clientWidth || 360);
        const availableWidth = Math.min(standardA4Width, Math.max(260, screenWidth - 16));
        const scale = Math.min(1, Math.max(0.25, availableWidth / standardA4Width));

        // 1. معالجة سراكي الموظفين المجمعة (Bulk Payslips)
        scaleBulkPayslipsSection(scale, standardA4Width);

        // 2. معالجة شيت السركي الفردي (Single Sarki)
        scaleSingleSarkiSection('sarki-sheet-wrapper', 'single-sarki-zoom-toolbar', scale, standardA4Width);

        // 3. معالجة شيت سركي بوابة الموظف الذاتي (Employee Sarki)
        scaleSingleSarkiSection('emp-sarki-sheet-wrapper', 'emp-sarki-zoom-toolbar', scale, standardA4Width);
    }

    // مقياس صفحات السراكي المجمعة مع شريط تحكم واحد فقط أعلى الحاوية
    function scaleBulkPayslipsSection(scale, standardA4Width) {
        const bulkContainer = document.getElementById('bulk-payslips-container');
        if (!bulkContainer) return;

        const pageSections = bulkContainer.querySelectorAll('.bulk-page-section');
        const toolbar = renderMobileZoomToolbar('bulk-payslips-zoom-toolbar', bulkContainer, 'معاينة سراكي الموظفين');

        if (pageSections.length === 0) {
            if (toolbar) toolbar.style.display = 'none';
            return;
        }

        if (toolbar) toolbar.style.display = 'block';

        pageSections.forEach(section => {
            // تغليف كل صفحة A4 داخل حاوية مقيدة
            let wrapper = section.parentElement;
            if (!wrapper || !wrapper.classList.contains('a4-scalable-viewport')) {
                wrapper = document.createElement('div');
                wrapper.className = 'a4-scalable-viewport';
                section.parentNode.insertBefore(wrapper, section);
                wrapper.appendChild(section);
            }

            applyScaleToElement(wrapper, section, scale, standardA4Width);
        });
    }

    // مقياس شيت سركي مفرد (سواء الإداري أو الذاتي)
    function scaleSingleSarkiSection(sheetId, toolbarId, scale, standardA4Width) {
        const sheet = document.getElementById(sheetId);
        if (!sheet) return;

        // التحقق من وجود الحاوية المغلفة
        let wrapper = sheet.parentElement;
        if (!wrapper || !wrapper.classList.contains('a4-scalable-viewport')) {
            wrapper = document.createElement('div');
            wrapper.className = 'a4-scalable-viewport';
            sheet.parentNode.insertBefore(wrapper, sheet);
            wrapper.appendChild(sheet);
        }

        const toolbar = renderMobileZoomToolbar(toolbarId, wrapper, 'معاينة السركي');
        if (toolbar) toolbar.style.display = 'block';

        applyScaleToElement(wrapper, sheet, scale, standardA4Width);
    }

    // تطبيق الـ CSS transform أو التمرير الأفقي حسب الوضع المختار
    function applyScaleToElement(wrapper, el, scale, standardA4Width) {
        if (!wrapper || !el) return;

        if (currentScaleMode === 'fit') {
            // وضع ملاءمة الشاشة: تصغير العنصر بدقة A4 ليتوسط شاشة الهاتف بنسبة 100%
            const targetWidthPx = Math.ceil(standardA4Width * scale);
            wrapper.style.width = targetWidthPx + 'px';
            wrapper.style.maxWidth = '100%';
            wrapper.style.margin = '0 auto 16px auto';
            wrapper.style.overflow = 'hidden';
            wrapper.style.position = 'relative';

            el.style.width = standardA4Width + 'px';
            el.style.maxWidth = 'none';
            el.style.transformOrigin = 'top right';
            el.style.transform = `scale(${scale})`;
            el.style.boxSizing = 'border-box';
            el.style.display = 'block';

            if (el.offsetHeight > 30) {
                const scaledHeight = Math.ceil(el.offsetHeight * scale);
                wrapper.style.height = (scaledHeight + 6) + 'px';
            } else {
                wrapper.style.height = 'auto';
            }
        } else {
            // وضع الحجم الطبيعي 100%: التمرير الأفقي السلس والواضح داخل الحاوية فقط
            wrapper.style.width = '100%';
            wrapper.style.maxWidth = '100%';
            wrapper.style.height = 'auto';
            wrapper.style.overflowX = 'auto';
            wrapper.style.overflowY = 'visible';
            wrapper.style.webkitOverflowScrolling = 'touch';
            wrapper.style.margin = '0 auto 16px auto';
            wrapper.style.position = 'relative';

            el.style.width = standardA4Width + 'px';
            el.style.maxWidth = 'none';
            el.style.transform = 'none';
            el.style.transformOrigin = 'initial';
            el.style.boxSizing = 'border-box';
            el.style.display = 'block';
        }
    }

    // إنشاء أو تحديث شريط التكبير والتصغير الموحد للموبايل (واحد فقط لكل قسم)
    function renderMobileZoomToolbar(toolbarId, targetElement, labelText) {
        if (!targetElement) return null;

        let toolbar = document.getElementById(toolbarId);
        if (!toolbar) {
            toolbar = document.createElement('div');
            toolbar.id = toolbarId;
            toolbar.className = 'a4-mobile-zoom-toolbar';
            targetElement.parentNode.insertBefore(toolbar, targetElement);
        }

        toolbar.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; background:#f1f5f9; border:1px solid #cbd5e1; border-radius:8px; padding:6px 10px; margin-bottom:12px; font-size:12px; box-sizing:border-box;">
                <span style="font-weight:bold; color:#1e293b;">🔍 ${labelText || 'معاينة السركي'}:</span>
                <div style="display:flex; gap:6px;">
                    <button type="button" class="btn-a4-zoom-fit" style="padding:5px 12px; border-radius:6px; font-size:11.5px; font-weight:bold; cursor:pointer; min-height:36px; border:1px solid #94a3b8; background:${currentScaleMode === 'fit' ? '#102a45' : '#ffffff'}; color:${currentScaleMode === 'fit' ? '#ffffff' : '#1e293b'};">📱 ملاءمة الشاشة</button>
                    <button type="button" class="btn-a4-zoom-orig" style="padding:5px 12px; border-radius:6px; font-size:11.5px; font-weight:bold; cursor:pointer; min-height:36px; border:1px solid #94a3b8; background:${currentScaleMode === 'original' ? '#102a45' : '#ffffff'}; color:${currentScaleMode === 'original' ? '#ffffff' : '#1e293b'};">🔎 حجم أصلي 100%</button>
                </div>
            </div>
        `;

        const fitBtn = toolbar.querySelector('.btn-a4-zoom-fit');
        const origBtn = toolbar.querySelector('.btn-a4-zoom-orig');

        if (fitBtn) {
            fitBtn.onclick = () => {
                currentScaleMode = 'fit';
                autoScaleAllA4Sheets();
            };
        }
        if (origBtn) {
            origBtn.onclick = () => {
                currentScaleMode = 'original';
                autoScaleAllA4Sheets();
            };
        }

        toolbar.style.display = (window.innerWidth <= 768) ? 'block' : 'none';
        return toolbar;
    }

    // استعادة الوضع الأصلي وإلغاء التصغير عند العرض على الكمبيوتر والشاشات الكبيرة
    function resetAllA4Scaling() {
        document.querySelectorAll('.a4-mobile-zoom-toolbar').forEach(tb => {
            tb.style.display = 'none';
        });

        document.querySelectorAll('.a4-scalable-viewport').forEach(w => {
            w.style.height = '';
            w.style.width = '';
            w.style.maxWidth = '';
            w.style.overflow = '';
            w.style.position = '';
            w.style.margin = '';
        });

        document.querySelectorAll(`
            #bulk-payslips-container .bulk-page-section,
            #sarki-sheet-wrapper,
            #emp-sarki-sheet-wrapper
        `).forEach(el => {
            el.style.width = '';
            el.style.maxWidth = '';
            el.style.transform = '';
            el.style.transformOrigin = '';
            el.style.boxSizing = '';
            el.style.display = '';
        });
    }

    // التأكد من احتواء الجداول العادية داخل حاوية تمرير أفقي مع استثناء السراكي
    function ensureAllTablesWrapped() {
        if (window.innerWidth > 768) return;
        const allTables = document.querySelectorAll('table');
        allTables.forEach(tbl => {
            if (
                tbl.closest('.a4-scalable-viewport') ||
                tbl.closest('#sarki-sheet-wrapper') ||
                tbl.closest('#emp-sarki-sheet-wrapper') ||
                tbl.closest('#bulk-payslips-container') ||
                tbl.closest('.bulk-payslip-card') ||
                tbl.closest('.bulk-page-section') ||
                tbl.closest('.modal-content')
            ) {
                return; // استثناء جداول السراكي وكروت الطباعة ومودالات النظام
            }
            const parent = tbl.parentElement;
            if (!parent.classList.contains('table-wrap') && !parent.classList.contains('emp-table-container') && !parent.classList.contains('table-responsive')) {
                const wrap = document.createElement('div');
                wrap.className = 'table-wrap';
                tbl.parentNode.insertBefore(wrap, tbl);
                wrap.appendChild(tbl);
            }
        });
    }

    // مراقبة حاوية السراكي المجمعة لتطبيق الـ scale فور توليد المحتوى ديناميكياً
    function setupMutationObservers() {
        const bulkContainer = document.getElementById('bulk-payslips-container');
        if (bulkContainer && window.MutationObserver) {
            const observer = new MutationObserver(() => {
                setTimeout(autoScaleAllA4Sheets, 30);
            });
            observer.observe(bulkContainer, { childList: true, subtree: false });
        }
    }

    // إغلاق القائمة الجانبية عند الضغط على زر Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' || e.key === 'Esc') {
            if (typeof toggleMobileSidebar === 'function') {
                toggleMobileSidebar(false);
            }
        }
    });

    // تصدير الدوال للاستخدام العام
    window.autoScaleAllA4Sheets = autoScaleAllA4Sheets;
    window.ensureAllTablesWrapped = ensureAllTablesWrapped;

    window.addEventListener('resize', () => {
        clearTimeout(window._a4ResizeTimer);
        window._a4ResizeTimer = setTimeout(() => {
            autoScaleAllA4Sheets();
            ensureAllTablesWrapped();
        }, 100);
    });

    window.addEventListener('orientationchange', () => {
        setTimeout(() => {
            autoScaleAllA4Sheets();
            ensureAllTablesWrapped();
        }, 200);
    });

    // استدعاء أولي عند جهوزية الصفحة
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setupMutationObservers();
            ensureAllTablesWrapped();
            setTimeout(autoScaleAllA4Sheets, 250);
        });
    } else {
        setupMutationObservers();
        ensureAllTablesWrapped();
        setTimeout(autoScaleAllA4Sheets, 250);
    }
})();
