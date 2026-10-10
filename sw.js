// ====================================================================
// Service Worker - عيادات سيدي ياقوت التخصصية v3
// PWA & TWA Full Offline Support & PWABuilder Optimized
// ====================================================================

const CACHE_NAME = 'sidi-yaqoot-v11';

const CORE_FILES = [
    '/',
    '/index.html',
    '/manifest.json',
    '/sw.js',
    '/css/main.css',
    '/css/splash.css',
    '/assets/icons/icon-48x48.png',
    '/assets/icons/icon-72x72.png',
    '/assets/icons/icon-96x96.png',
    '/assets/icons/icon-128x128.png',
    '/assets/icons/icon-144x144.png',
    '/assets/icons/icon-152x152.png',
    '/assets/icons/icon-192x192.png',
    '/assets/icons/icon-384x384.png',
    '/assets/icons/icon-512x512.png',
    '/assets/icons/icon-maskable-192x192.png',
    '/assets/icons/icon-maskable-512x512.png',
    '/assets/icons/icon-shortcut-96x96.png',
    '/assets/sidi-yaqout-logo-transparent.png',
    '/assets/sidi-yaqout-slogan-transparent.png',
    '/assets/sidi-yaqout-logo.png',
    '/assets/sidi-yaqout-slogan.png',
    '/js/utils/clinic-assets.js',
    '/js/utils/splash-screen.js',
    '/js/utils/toast.js',
    '/js/utils/print-helpers.js',
    '/js/utils/excel-helpers.js',
    '/js/utils/quick-tools.js',
    '/js/utils/autocomplete.js',
    '/js/utils/geofence-service.js',
    '/js/app-state.js',
    '/js/app.js',
    '/js/config/firebase-sample-config.js',
    '/js/services/firebase-service.js',
    '/js/screens/01-dashboard.js',
    '/js/screens/02-employees.js',
    '/js/screens/03-attendance.js',
    '/js/screens/04-salary-adjustments.js',
    '/js/screens/05-payroll-summary.js',
    '/js/screens/06-single-sarki.js',
    '/js/screens/07-bulk-payslips.js',
    '/js/screens/08-payroll-delivery.js',
    '/js/screens/09-employee-report.js',
    '/js/screens/10-totals-report.js',
    '/js/screens/11-backup-restore.js',
    '/js/screens/12-users-roles.js',
    '/js/screens/13-employee-sarki.js',
    '/js/screens/15-leaves-permissions.js',
    '/js/screens/16-punches-payroll.js',
    '/js/screens/17-attendance-comparison.js',
    '/js/utils/a4-scale-helper.js',
    '/js/utils/notification-service.js'
];

// ── Install: Pre-cache all essential core files ──────────────────────
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return Promise.allSettled(
                CORE_FILES.map(url =>
                    cache.add(url).catch(err =>
                        console.warn('[SW] Failed to cache:', url, err)
                    )
                )
            );
        }).then(() => self.skipWaiting())
    );
});

// ── Activate: Clean up old caches and claim clients immediately ─────
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys.filter(k => k !== CACHE_NAME).map(k => {
                    console.log('[SW] Deleting old cache:', k);
                    return caches.delete(k);
                })
            )
        ).then(() => self.clients.claim())
    );
});

// ── Fetch: Network First → Cache → Offline Fallback Page ─────────────
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // تجاهل الـ non-GET ومكالمات الـ APIs الخارجية والـ WebSocket
    if (
        event.request.method !== 'GET' ||
        url.pathname.startsWith('/api/') ||
        url.hostname.includes('firebase') ||
        url.hostname.includes('googleapis') ||
        url.hostname.includes('gstatic') ||
        url.hostname.includes('cdnjs')
    ) {
        return;
    }

    event.respondWith(
        fetch(event.request)
            .then((response) => {
                if (response && response.status === 200 && response.type === 'basic') {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, clone);
                    });
                }
                return response;
            })
            .catch(() => {
                return caches.match(event.request).then((cachedResponse) => {
                    if (cachedResponse) {
                        return cachedResponse;
                    }
                    // في حالة التنقل لصفحة HTML ولم يتوفر نت
                    if (event.request.mode === 'navigate') {
                        return caches.match('/index.html').then((indexCached) => {
                            return indexCached || offlinePage();
                        });
                    }
                    return new Response('', { status: 503, statusText: 'Offline' });
                });
            })
    );
});

// ── صفحة غير متصل (Offline Fallback Page) ────────────────────────────
function offlinePage() {
    return new Response(`<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>غير متصل - عيادات سيدي ياقوت</title>
<style>
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    margin: 0;
    background: #0f172a;
    color: #ffffff;
    text-align: center;
    padding: 20px;
  }
  .card {
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 20px;
    padding: 36px 28px;
    box-shadow: 0 10px 40px rgba(0,0,0,0.5);
    max-width: 400px;
    width: 100%;
  }
  .icon { font-size: 54px; margin-bottom: 16px; }
  h1 { color: #f87171; font-size: 1.4rem; margin: 0 0 10px; font-weight: 800; }
  p { color: #94a3b8; font-size: 0.95rem; line-height: 1.6; margin: 0 0 24px; }
  button {
    background: linear-gradient(135deg, #990012 0%, #dc2626 100%);
    color: #fff;
    border: none;
    border-radius: 10px;
    padding: 12px 28px;
    font-size: 1rem;
    font-weight: 700;
    cursor: pointer;
    box-shadow: 0 4px 16px rgba(220,38,38,0.4);
    transition: transform 0.15s ease;
  }
  button:active { transform: scale(0.96); }
</style>
</head>
<body>
<div class="card">
  <div class="icon">⚡</div>
  <h1>بدون اتصال بالإنترنت</h1>
  <p>أنت غير متصل بالإنترنت حالياً. تم حفظ بياناتك محلياً وستتم المزامنة تلقائياً فور عودة الاتصال.</p>
  <button onclick="location.reload()">🔄 إعادة المحاولة</button>
</div>
</body></html>`,
        { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
}

// ── Messages ─────────────────────────────────────────────────────────
self.addEventListener('message', (event) => {
    if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
    if (event.data?.type === 'CLEAR_CACHE') caches.delete(CACHE_NAME);
});
