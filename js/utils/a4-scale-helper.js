// ====================================================================
// نظام التصغير والملاءمة التلقائية لشاشات السراكي والجداول على الموبايل
// A4 Payslips & Sheets Auto-Scaling & Responsive Engine
// منظومة عيادات سيدي ياقوت التخصصية
// ====================================================================

(function() {
    let currentScaleMode = 'fit'; // 'fit' or 'original'

    function autoScaleAllA4Sheets() {
        // إذا كانت الشاشة أكبر من 768px (كمبيوتر أو شاشات كبيرة)، إعادة الوضع الطبيعي
        if (window.innerWidth > 768) {
            resetAllA4Scaling();
            return;
        }

        const standardA4Width = 794; // العرض القياسي لصفحة A4 عند 96 DPI

        // تحديد العناصر المستهدفة (صفحات السراكي المجمعة وشيتات السركي الفردي)
        const targetElements = document.querySelectorAll(`
            #bulk-payslips-container .bulk-page-section,
            #sarki-sheet-wrapper,
            #emp-sarki-sheet-wrapper
        `);

        if (targetElements.length === 0) return;

        targetElements.forEach((el) => {
            // التحقق من وجود الحاوية المغلفة
            let wrapper = el.parentElement;
            if (!wrapper || !wrapper.classList.contains('a4-scalable-viewport')) {
                wrapper = document.createElement('div');
                wrapper.className = 'a4-scalable-viewport';
                el.parentNode.insertBefore(wrapper, el);
                wrapper.appendChild(el);
            }

            // حساب العرض المتاح بدقة من الحاوية الأب
            let parentWidth = 0;
            if (wrapper.parentElement && wrapper.parentElement.clientWidth > 100) {
                parentWidth = wrapper.parentElement.clientWidth;
            } else {
                const mainContent = document.querySelector('.main-content');
                parentWidth = mainContent ? (mainContent.clientWidth - 16) : (window.innerWidth - 20);
            }
            const availableWidth = Math.max(260, parentWidth - 8);

            // التأكد من وجود شريط التحكم في العرض للموبايل
            ensureMobileZoomToolbar(wrapper);

            if (currentScaleMode === 'fit') {
                // وضع ملاءمة الشاشة التلقائي (Fit to Screen)
                const scale = Math.min(1, Math.max(0.2, availableWidth / standardA4Width));

                el.style.width = standardA4Width + 'px';
                el.style.maxWidth = 'none';
                el.style.transformOrigin = 'top right';
                el.style.transform = `scale(${scale})`;
                el.style.boxSizing = 'border-box';
                el.style.display = 'block';

                if (el.offsetHeight > 50) {
                    const scaledHeight = Math.ceil(el.offsetHeight * scale);
                    wrapper.style.height = (scaledHeight + 12) + 'px';
                } else {
                    wrapper.style.height = 'auto';
                }

                wrapper.style.width = '100%';
                wrapper.style.maxWidth = '100%';
                wrapper.style.overflow = 'hidden';
                wrapper.style.position = 'relative';
                wrapper.style.marginBottom = '16px';
            } else {
                // وضع الحجم الطبيعي مع التمرير الأفقي السلس (100% Original + Horizontal Scroll)
                el.style.width = standardA4Width + 'px';
                el.style.maxWidth = 'none';
                el.style.transform = 'none';
                el.style.boxSizing = 'border-box';
                el.style.display = 'block';

                wrapper.style.height = 'auto';
                wrapper.style.width = '100%';
                wrapper.style.maxWidth = '100%';
                wrapper.style.overflowX = 'auto';
                wrapper.style.overflowY = 'visible';
                wrapper.style.webkitOverflowScrolling = 'touch';
                wrapper.style.position = 'relative';
                wrapper.style.marginBottom = '16px';
            }
        });
    }

    function resetAllA4Scaling() {
        document.querySelectorAll('.a4-scalable-viewport').forEach(w => {
            w.style.height = '';
            w.style.width = '';
            w.style.maxWidth = '';
            w.style.overflow = '';
            w.style.position = '';
            w.style.marginBottom = '';
            const tb = w.querySelector('.a4-mobile-zoom-toolbar');
            if (tb) tb.style.display = 'none';
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

    function ensureMobileZoomToolbar(wrapper) {
        if (!wrapper) return;
        let toolbar = wrapper.querySelector('.a4-mobile-zoom-toolbar');
        if (!toolbar) {
            toolbar = document.createElement('div');
            toolbar.className = 'a4-mobile-zoom-toolbar';
            toolbar.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; background:#f1f5f9; border:1px solid #cbd5e1; border-radius:8px; padding:6px 10px; margin-bottom:8px; font-size:12px;">
                    <span style="font-weight:bold; color:#1e293b;">🔍 معاينة السركي:</span>
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

            wrapper.insertBefore(toolbar, wrapper.firstChild);
        } else {
            toolbar.style.display = window.innerWidth <= 768 ? 'block' : 'none';
            const fitBtn = toolbar.querySelector('.btn-a4-zoom-fit');
            const origBtn = toolbar.querySelector('.btn-a4-zoom-orig');
            if (fitBtn) {
                fitBtn.style.background = (currentScaleMode === 'fit' ? '#102a45' : '#ffffff');
                fitBtn.style.color = (currentScaleMode === 'fit' ? '#ffffff' : '#1e293b');
            }
            if (origBtn) {
                origBtn.style.background = (currentScaleMode === 'original' ? '#102a45' : '#ffffff');
                origBtn.style.color = (currentScaleMode === 'original' ? '#ffffff' : '#1e293b');
            }
        }
    }

    // التأكد من تغليف أي جداول عامة لم تكن مغلفة في حاوية scroll أفقي
    function ensureAllTablesWrapped() {
        if (window.innerWidth > 768) return;
        const allTables = document.querySelectorAll('table');
        allTables.forEach(tbl => {
            if (tbl.closest('.a4-scalable-viewport') || tbl.closest('#sarki-sheet-wrapper') || tbl.closest('#emp-sarki-sheet-wrapper')) {
                return; // جداول السراكي تُعالج بمحرك الـ A4
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
                setTimeout(autoScaleAllA4Sheets, 40);
            });
            observer.observe(bulkContainer, { childList: true, subtree: false });
        }
    }

    // إغلاق القائمة الجانبية عند الضغط على زر Escape أو النقر على الخلفية المعتمة
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' || e.key === 'Esc') {
            if (typeof toggleMobileSidebar === 'function') {
                toggleMobileSidebar(false);
            }
        }
    });

    // تصدير الدالة وإرفاقها بمستمعات الأحداث
    window.autoScaleAllA4Sheets = autoScaleAllA4Sheets;
    window.ensureAllTablesWrapped = ensureAllTablesWrapped;

    window.addEventListener('resize', () => {
        clearTimeout(window._a4ResizeTimer);
        window._a4ResizeTimer = setTimeout(() => {
            autoScaleAllA4Sheets();
            ensureAllTablesWrapped();
        }, 120);
    });

    window.addEventListener('orientationchange', () => {
        setTimeout(() => {
            autoScaleAllA4Sheets();
            ensureAllTablesWrapped();
        }, 250);
    });

    // استدعاء فوري دوري عند جهوزية المستند
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setupMutationObservers();
            ensureAllTablesWrapped();
            setTimeout(autoScaleAllA4Sheets, 300);
        });
    } else {
        setupMutationObservers();
        ensureAllTablesWrapped();
        setTimeout(autoScaleAllA4Sheets, 300);
    }
})();
