/**
 * منظومة عيادات سيدي ياقوت التخصصية
 * شاشة البداية والتحميل الترحيبية (Splash Screen)
 * محسنة وفائقة السرعة: انطلاق سلس وسريع مع استقرار السلوجن "365 يوم من الرعاية"
 */

(function() {
    let splashDismissed = false;
    let splashTimer = null;
    let stepTimers = [];

    function clearAllSplashTimers() {
        if (splashTimer) clearTimeout(splashTimer);
        stepTimers.forEach(t => clearTimeout(t));
        stepTimers = [];
    }

    function initSplashScreen() {
        const splashEl = document.getElementById('clinic-splash-screen');
        if (!splashEl) return;

        const progressBar = document.getElementById('splash-progress-bar');
        const statusText = document.getElementById('splash-status-text');

        clearAllSplashTimers();

        // تفعيل التقدم السلس عبر CSS دون تعطيل خيط المعالجة الرئيسي
        if (progressBar) {
            progressBar.style.width = '0%';
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    progressBar.style.width = '100%';
                });
            });
        }

        if (statusText) {
            statusText.innerHTML = '<span class="splash-status-dot"></span> جاري تهيئة منظومة سيدي ياقوت...';
            
            stepTimers.push(setTimeout(() => {
                if (statusText && !splashDismissed) {
                    statusText.innerHTML = '<span class="splash-status-dot"></span> 365 يوم من الرعاية الطبية المتكاملة';
                }
            }, 450));

            stepTimers.push(setTimeout(() => {
                if (statusText && !splashDismissed) {
                    statusText.innerHTML = '<span class="splash-status-dot" style="background:#059669;"></span> ✓ اكتمل التحميل - أهلاً بكم!';
                }
            }, 900));
        }

        // إغلاق شاشة البداية فور انتهاء التحميل بسلاسة وسرعة فائقة
        const totalDuration = 1100;
        splashTimer = setTimeout(() => {
            dismissSplashScreen(false);
        }, totalDuration);
    }

    function dismissSplashScreen(isManualSkip) {
        if (splashDismissed) return;
        splashDismissed = true;

        clearAllSplashTimers();

        const splashEl = document.getElementById('clinic-splash-screen');
        if (!splashEl) return;

        // تلاشي ناعم وسريع
        splashEl.classList.add('splash-hidden');

        setTimeout(() => {
            splashEl.style.display = 'none';
            if (typeof renderWelcomeDashboard === 'function') {
                renderWelcomeDashboard();
            }
            if (typeof checkAuthAndRequireLogin === 'function') {
                checkAuthAndRequireLogin();
            }
        }, 350);
    }

    // إتاحة إعادة تشغيل الشاشة الترحيبية من الإعدادات أو عند الطلب
    function replaySplashScreen() {
        const splashEl = document.getElementById('clinic-splash-screen');
        if (!splashEl) return;

        splashDismissed = false;
        splashEl.style.display = 'flex';
        splashEl.classList.remove('splash-hidden');

        const progressBar = document.getElementById('splash-progress-bar');
        if (progressBar) progressBar.style.width = '0%';

        // إعادة تشغيل حركات العناصر
        const sloganBox = document.getElementById('splash-slogan-element');
        const logoBox = document.getElementById('splash-logo-box');
        if (sloganBox) {
            sloganBox.style.animation = 'none';
            void sloganBox.offsetWidth;
            sloganBox.style.animation = '';
        }
        if (logoBox) {
            logoBox.style.animation = 'none';
            void logoBox.offsetWidth;
            logoBox.style.animation = '';
        }

        initSplashScreen();
    }

    window.dismissSplashScreen = dismissSplashScreen;
    window.replaySplashScreen = replaySplashScreen;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initSplashScreen);
    } else {
        initSplashScreen();
    }
})();
