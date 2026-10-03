// ====================================================================
// نظام التصغير والملاءمة التلقائية لشاشات السراكي وA4 على الموبايل
// A4 Payslips & Sheets Auto-Scaling Engine for Mobile Displays
// منظومة عيادات سيدي ياقوت التخصصية
// ====================================================================

(function() {
    let currentScaleMode = 'fit'; // 'fit' or 'original'

    function autoScaleAllA4Sheets() {
        // إذا كانت الشاشة أكبر من 768px (كمبيوتر أو تابلت كبير)، إعادة الوضع الطبيعي
        if (window.innerWidth > 768) {
            resetAllA4Scaling();
            return;
        }

        const mainContent = document.querySelector('.main-content');
        const availableWidth = mainContent ? (mainContent.clientWidth - 16) : (window.innerWidth - 20);
        const standardA4Width = 794; // العرض القياسي لصفحة A4 (96 DPI)

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

            // التأكد من وجود شريط التحكم في العرض للموبايل
            ensureMobileZoomToolbar(wrapper);

            if (currentScaleMode === 'fit') {
                // وضع ملاءمة الشاشة التلقائي (Fit to Screen)
                const scale = Math.min(1, Math.max(0.25, availableWidth / standardA4Width));

                el.style.width = standardA4Width + 'px';
                el.style.maxWidth = 'none';
                el.style.transformOrigin = 'top right';
                el.style.transform = `scale(${scale})`;
                el.style.boxSizing = 'border-box';
                el.style.display = 'block';

                const scaledHeight = Math.ceil(el.offsetHeight * scale);
                wrapper.style.height = (scaledHeight + 14) + 'px';
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
                        <button type="button" class="btn-a4-zoom-fit" style="padding:4px 10px; border-radius:6px; font-size:11px; font-weight:bold; cursor:pointer; border:1px solid #94a3b8; background:${currentScaleMode === 'fit' ? '#102a45' : '#ffffff'}; color:${currentScaleMode === 'fit' ? '#ffffff' : '#1e293b'};">📱 ملاءمة الشاشة</button>
                        <button type="button" class="btn-a4-zoom-orig" style="padding:4px 10px; border-radius:6px; font-size:11px; font-weight:bold; cursor:pointer; border:1px solid #94a3b8; background:${currentScaleMode === 'original' ? '#102a45' : '#ffffff'}; color:${currentScaleMode === 'original' ? '#ffffff' : '#1e293b'};">🔎 حجم أصلي 100%</button>
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

    // تصدير الدالة وإرفاقها بمستمعات الأحداث
    window.autoScaleAllA4Sheets = autoScaleAllA4Sheets;

    window.addEventListener('resize', () => {
        clearTimeout(window._a4ResizeTimer);
        window._a4ResizeTimer = setTimeout(autoScaleAllA4Sheets, 120);
    });

    window.addEventListener('orientationchange', () => {
        setTimeout(autoScaleAllA4Sheets, 250);
    });

    // استدعاء فوري دوري عند جهوزية المستند
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(autoScaleAllA4Sheets, 300));
    } else {
        setTimeout(autoScaleAllA4Sheets, 300);
    }
})();
