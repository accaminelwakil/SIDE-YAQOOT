/**
 * منظومة عيادات سيدي ياقوت التخصصية
 * شاشة البداية والتحميل الترحيبية (Splash Screen)
 * مدة العرض: 4 ثوانٍ مع أنيميشن عبور واستقرار السلوجن "365 يوم من الرعاية"
 */

(function() {
    let splashDismissed = false;
    let splashTimer = null;
    let progressInterval = null;

    function initSplashScreen() {
        const splashEl = document.getElementById('clinic-splash-screen');
        if (!splashEl) return;

        const progressBar = document.getElementById('splash-progress-bar');
        const statusText = document.getElementById('splash-status-text');

        const totalDuration = 4000; // 4 ثوانٍ بالضبط كما طلب المستخدم
        const startTime = Date.now();

        // تحديث شريط التقدم وحالة التحميل بشكل سلس وديناميكي
        progressInterval = setInterval(() => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(100, Math.floor((elapsed / totalDuration) * 100));

            if (progressBar) {
                progressBar.style.width = progress + '%';
            }

            if (statusText) {
                if (elapsed < 1400) {
                    statusText.innerHTML = '<span class="splash-status-dot"></span> جاري تهيئة منظومة سيدي ياقوت...';
                } else if (elapsed < 2600) {
                    statusText.innerHTML = '<span class="splash-status-dot"></span> 365 يوم من الرعاية الطبية المتكاملة';
                } else if (elapsed < 3600) {
                    statusText.innerHTML = '<span class="splash-status-dot"></span> تحميل بيانات الرواتب والسراكي...';
                } else {
                    statusText.innerHTML = '<span class="splash-status-dot" style="background:#059669;"></span> ✓ اكتمل التحميل - أهلاً بكم!';
                }
            }

            if (elapsed >= totalDuration) {
                clearInterval(progressInterval);
            }
        }, 30);

        // إغلاق شاشة التحميل تلقائياً بعد 4 ثوانٍ تماماً
        splashTimer = setTimeout(() => {
            dismissSplashScreen(false);
        }, totalDuration);
    }

    function dismissSplashScreen(isManualSkip) {
        if (splashDismissed) return;
        splashDismissed = true;

        if (progressInterval) clearInterval(progressInterval);
        if (splashTimer) clearTimeout(splashTimer);

        const splashEl = document.getElementById('clinic-splash-screen');
        if (!splashEl) return;

        // تأثير الاختفاء والتلاشي السلس
        splashEl.classList.add('splash-hidden');

        setTimeout(() => {
            splashEl.style.display = 'none';
            if (typeof renderWelcomeDashboard === 'function') {
                renderWelcomeDashboard();
            }
        }, 650);
    }

    // إتاحة إعادة مشاهدة الأنيميشن في أي وقت بناءً على رغبة المستخدم
    function replaySplashScreen() {
        const splashEl = document.getElementById('clinic-splash-screen');
        if (!splashEl) return;

        splashDismissed = false;
        splashEl.style.display = 'flex';
        splashEl.classList.remove('splash-hidden');

        // إعادة تشغيل الأنيميشن للعناصر
        const sloganBox = document.getElementById('splash-slogan-element');
        const logoBox = document.getElementById('splash-logo-box');
        if (sloganBox) {
            sloganBox.style.animation = 'none';
            void sloganBox.offsetWidth; // Force Reflow
            sloganBox.style.animation = '';
        }
        if (logoBox) {
            logoBox.style.animation = 'none';
            void logoBox.offsetWidth; // Force Reflow
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
