// ====================================================================
// Service Worker - عيادات سيدي ياقوت التخصصية
// يتيح تنصيب التطبيق كـ PWA على الموبايل (Android & iPhone)
// ويحفظ الملفات الأساسية للعمل بشكل أفضل عند الاتصال الضعيف
// ====================================================================

const CACHE_NAME = 'sidi-yaqout-v1';

// الملفات الأساسية اللي هتتحفظ في الـ cache
const CORE_FILES = [
    './',
    './index.html',
    './css/main.css',
    './css/splash.css',
    './manifest.json',
    './assets/sidi-yaqout-logo-transparent.png',
    './assets/sidi-yaqout-slogan-transparent.png',
    './assets/sidi-yaqout-logo.png',
    './js/utils/clinic-assets.js',
    './js/utils/splash-screen.js',
    './js/utils/toast.js',
    './js/utils/print-helpers.js',
    './js/utils/excel-helpers.js',
    './js/utils/quick-tools.js',
    './js/utils/autocomplete.js',
    './js/app-state.js',
    './js/app.js',
    './js/services/firebase-service.js',
    './js/screens/01-dashboard.js',
    './js/screens/02-employees.js',
    './js/screens/03-attendance.js',
    './js/screens/04-salary-adjustments.js',
    './js/screens/05-payroll-summary.js',
    './js/screens/06-single-sarki.js',
    './js/screens/07-bulk-payslips.js',
    './js/screens/08-payroll-delivery.js',
    './js/screens/09-employee-report.js',
    './js/screens/10-totals-report.js',
    './js/screens/11-backup-restore.js',
    './js/screens/12-users-roles.js',
    './js/screens/13-employee-sarki.js',
];

// ====================================================================
// تنصيب الـ Service Worker وتحميل الملفات الأساسية في الـ cache
// ====================================================================
self.addEventListener('install', (event) => {
    console.log('[SW] Installing Service Worker...');
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[SW] Caching core files...');
            // نستخدم addAll لكن مع معالجة الأخطاء
            return Promise.allSettled(
                CORE_FILES.map(url =>
                    cache.add(url).catch(err => {
                        console.warn(`[SW] Failed to cache: ${url}`, err);
                    })
                )
            );
        }).then(() => {
            console.log('[SW] Core files cached successfully!');
            return self.skipWaiting();
        })
    );
});

// ====================================================================
// تفعيل الـ Service Worker وحذف الـ cache القديمة
// ====================================================================
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating Service Worker...');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames
                    .filter(name => name !== CACHE_NAME)
                    .map(name => {
                        console.log(`[SW] Deleting old cache: ${name}`);
                        return caches.delete(name);
                    })
            );
        }).then(() => {
            console.log('[SW] Service Worker activated!');
            return self.clients.claim();
        })
    );
});

// ====================================================================
// معالجة الطلبات - Network First مع Offline Fallback
// ====================================================================
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // نتجاهل طلبات Firebase و CDN (دي بتتعامل معاها الـ Firebase SDK)
    if (
        url.hostname.includes('firebase') ||
        url.hostname.includes('firestore') ||
        url.hostname.includes('googleapis') ||
        url.hostname.includes('gstatic') ||
        url.hostname.includes('cdnjs') ||
        event.request.method !== 'GET'
    ) {
        return; // نخلي الـ browser يتعامل معاها عادي
    }

    event.respondWith(
        // استراتيجية: Network First (نجرب من الانترنت الأول)
        // لو مفيش انترنت، نرجع من الـ cache
        fetch(event.request)
            .then(response => {
                // لو الطلب نجح، نحدث الـ cache
                if (response && response.status === 200 && response.type === 'basic') {
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, responseClone);
                    });
                }
                return response;
            })
            .catch(() => {
                // لو الانترنت قطع، نرجع من الـ cache
                return caches.match(event.request).then(cachedResponse => {
                    if (cachedResponse) {
                        console.log(`[SW] Serving from cache: ${event.request.url}`);
                        return cachedResponse;
                    }
                    // لو مش موجود في الـ cache، نرجع الصفحة الرئيسية
                    if (event.request.mode === 'navigate') {
                        return caches.match('./index.html');
                    }
                    return new Response('Offline - الملف غير متاح بدون انترنت', {
                        status: 503,
                        statusText: 'Service Unavailable'
                    });
                });
            })
    );
});

// ====================================================================
// استقبال رسائل من الـ app (مثل طلب تحديث الـ cache)
// ====================================================================
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
    if (event.data && event.data.type === 'CLEAR_CACHE') {
        caches.delete(CACHE_NAME).then(() => {
            console.log('[SW] Cache cleared!');
        });
    }
});
