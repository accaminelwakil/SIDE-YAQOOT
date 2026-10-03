// ====================================================================
// Service Worker - عيادات سيدي ياقوت التخصصية v2
// ====================================================================

const CACHE_NAME = 'sidi-yaqout-v2';

const CORE_FILES = [
    '/',
    '/index.html',
    '/manifest.json',
    '/sw.js',
    '/css/main.css',
    '/css/splash.css',
    '/assets/icons/icon-192x192.png',
    '/assets/icons/icon-512x512.png',
    '/assets/icons/icon-maskable-192x192.png',
    '/assets/icons/icon-maskable-512x512.png',
    '/assets/sidi-yaqout-logo-transparent.png',
    '/assets/sidi-yaqout-slogan-transparent.png',
    '/js/utils/clinic-assets.js',
    '/js/utils/splash-screen.js',
    '/js/utils/toast.js',
    '/js/utils/print-helpers.js',
    '/js/utils/excel-helpers.js',
    '/js/utils/quick-tools.js',
    '/js/utils/autocomplete.js',
    '/js/app-state.js',
    '/js/app.js',
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
];

// ── Install ─────────────────────────────────────────────────────────
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

// ── Activate ────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
            )
        ).then(() => self.clients.claim())
    );
});

// ── Fetch: Network First → Cache → Offline Page ─────────────────────
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // تجاهل Firebase وCDN والـ non-GET
    if (
        event.request.method !== 'GET' ||
        url.hostname.includes('firebase') ||
        url.hostname.includes('googleapis') ||
        url.hostname.includes('gstatic') ||
        url.hostname.includes('cdnjs')
    ) return;

    event.respondWith(
        fetch(event.request)
            .then(response => {
                if (response && response.status === 200) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                }
                return response;
            })
            .catch(() =>
                caches.match(event.request).then(cached => {
                    if (cached) return cached;
                    if (event.request.mode === 'navigate') {
                        return caches.match('/').then(r => r || offlinePage());
                    }
                    return new Response('', { status: 503 });
                })
            )
    );
});

// ── صفحة Offline ─────────────────────────────────────────────────────
function offlinePage() {
    return new Response(`<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>غير متصل - عيادات سيدي ياقوت</title>
<style>
  body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;
  min-height:100vh;margin:0;background:#f8fafc;color:#0f172a;text-align:center}
  .card{background:#fff;border-radius:16px;padding:40px;box-shadow:0 4px 24px rgba(0,0,0,.08);max-width:360px}
  h1{color:#990012;font-size:1.5rem;margin-bottom:12px}
  p{color:#64748b;line-height:1.6}
  button{margin-top:24px;padding:12px 32px;background:#990012;color:#fff;border:none;
  border-radius:8px;font-size:1rem;cursor:pointer}
</style>
</head>
<body>
<div class="card">
  <h1>⚡ بدون اتصال بالإنترنت</h1>
  <p>لا يوجد اتصال بالإنترنت حالياً. تحقق من الاتصال وحاول مرة أخرى.</p>
  <button onclick="location.reload()">إعادة المحاولة</button>
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
