// ====================================================================
// نظام الإشعارات والتنبيهات التفاعلية الفورية (Smart Notification Center)
// منظومة عيادات سيدي ياقوت التخصصية
// ====================================================================

let notificationsDb = JSON.parse(localStorage.getItem('erp_notifications_db') || '[]');

(function initNotificationEngine() {
    // ── 1. تشغيل نغمة تنبيه لطيفة بدون أي ملفات خارجية (Web Audio API) ──
    function playNotificationChime() {
        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) return;
            const ctx = new AudioCtx();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            // نغمة جرس خفيفة مبهجة
            osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
            osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15); // A5
            gain.gain.setValueAtTime(0.14, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.45);
        } catch (e) {
            // تجاهل أي تقييد للصوت التلقائي في المتصفح قبل تفاعل المستخدم
        }
    }

    // ── 2. حفظ الإشعارات في التخزين المحلي والمزامنة الفورية مع السحابة والسيرفر ──
    function saveNotifications(syncServer = true) {
        localStorage.setItem('erp_notifications_db', JSON.stringify(notificationsDb));

        if (syncServer) syncNotificationsWithLocalServer();

        updateNotificationBellUI();
    }

    // ── 3. إضافة إشعار جديد للنظام ──
    function createNotification({ type, title, message, targetUsername, targetRole, targetEmpId, senderName, relatedId, actionScreen }) {
        const notif = {
            id: relatedId && type ? `leave-event:${relatedId}:${type}` : 'notif_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
            type: type || 'info', // 'leave_request', 'permission_request', 'leave_approved', 'leave_rejected', 'permission_approved', 'permission_rejected', 'punch_alert'
            title: title || 'إشعار جديد',
            message: message || '',
            targetUsername: targetUsername || null, // اسم مستخدم محدد
            targetRole: targetRole || null,         // دور محدد مثل 'admin' أو 'manager'
            targetEmpId: targetEmpId || null,       // كود الموظف
            senderName: senderName || 'النظام',
            relatedId: relatedId || null,
            actionScreen: actionScreen || null,
            createdAt: new Date().toISOString(),
            isRead: false
        };

        notificationsDb.unshift(notif);
        // الاحتفاظ بآخر 300 إشعار لمنع تضخم الذاكرة
        if (notificationsDb.length > 300) {
            notificationsDb = notificationsDb.slice(0, 300);
        }

        saveNotifications(false);
        if (relatedId && type) {
            syncNotificationsWithLocalServer({ type, relatedId });
        }
        playNotificationChime();

        // إشعار Toast منبثق فوري
        if (typeof showToast === 'function') {
            const toastType = (type && type.includes('rejected')) ? 'error' : ((type && type.includes('approved')) ? 'success' : 'info');
            showToast(`🔔 ${title}: ${message}`, toastType);
        }

        return notif;
    }

    // ── 4. فحص ما إذا كان الإشعار موجه للمستخدم الحالي ──
    function isNotificationForCurrentUser(n, user) {
        if (!n) return false;
        if (!user) return true;

        const isAdmin = (user.role === 'admin' || user.username === 'admin');
        const userEmpId = user.empId ? String(user.empId) : null;
        const username = user.username ? user.username.toLowerCase() : '';

        // مدير النظام يرى كافة الإشعارات
        if (isAdmin) return true;
        // موجه لاسم المستخدم مباشرة
        if (n.targetUsername && n.targetUsername.toLowerCase() === username) return true;
        // موجه لكود الموظف
        if (n.targetEmpId && userEmpId && String(n.targetEmpId) === userEmpId) return true;
        // موجه لدور معين
        if (n.targetRole && (n.targetRole === user.role || (n.targetRole === 'manager' && user.isManager))) return true;
        // إشعار عام بدون تحديد
        if (!n.targetUsername && !n.targetRole && !n.targetEmpId) return true;
        return false;
    }

    // ── 5. الحصول على الإشعارات الموجهة للمستخدم الحالي ──
    function getCurrentUserNotifications() {
        const user = window.currentUser;
        if (!user) {
            // في حالة عدم اكتمال تحميل المستخدم، عرض الإشعارات غير الموجهة لمستخدم محدد
            return notificationsDb.filter(n => !n.targetUsername && !n.targetEmpId);
        }
        return notificationsDb.filter(n => isNotificationForCurrentUser(n, user));
    }

    // ── 6. تحديث أيقونة جرس الإشعارات والعداد (Desktop + Mobile) ──
    function updateNotificationBellUI() {
        const userNotifs = getCurrentUserNotifications();
        const unreadCount = userNotifs.filter(n => !n.isRead).length;

        const badgeDesktop = document.getElementById('notif-badge-desktop');
        const badgeMobile = document.getElementById('notif-badge-mobile');

        [badgeDesktop, badgeMobile].forEach(badge => {
            if (!badge) return;
            if (unreadCount > 0) {
                badge.style.display = 'inline-flex';
                badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
                badge.classList.add('pulse-unread');
            } else {
                badge.style.display = 'none';
                badge.classList.remove('pulse-unread');
            }
        });

        // إذا كانت قائمة الإشعارات مفتوحة حالياً، نقوم بتحديث محتواها
        const dropdown = document.getElementById('notif-dropdown-panel');
        if (dropdown && dropdown.style.display === 'block') {
            renderNotificationsList();
        }
    }

    // ── 7. فتح / إغلاق القائمة المنسدلة للإشعارات (متوافق تماماً مع الموبايل والديسكتوب) ──
    function toggleNotificationsDropdown(e) {
        if (e && typeof e.stopPropagation === 'function') {
            e.stopPropagation();
        }
        const dropdown = document.getElementById('notif-dropdown-panel');
        const backdrop = document.getElementById('notif-backdrop');
        if (!dropdown) return;

        const isCurrentlyOpen = dropdown.style.display === 'block';
        if (isCurrentlyOpen) {
            closeNotificationsDropdown();
            return;
        }

        renderNotificationsList();
        dropdown.style.display = 'block';

        const isMobile = window.innerWidth <= 991;
        if (backdrop) {
            backdrop.style.display = isMobile ? 'block' : 'none';
        }

        if (isMobile) {
            dropdown.style.position = 'fixed';
            dropdown.style.top = '60px';
            dropdown.style.left = '10px';
            dropdown.style.right = '10px';
            dropdown.style.width = 'calc(100% - 20px)';
            dropdown.style.maxWidth = '440px';
            dropdown.style.margin = '0 auto';
            dropdown.style.zIndex = '100005';
        } else {
            const bellBtn = document.getElementById('btn-notif-bell-desktop');
            if (bellBtn) {
                const rect = bellBtn.getBoundingClientRect();
                dropdown.style.position = 'fixed';
                dropdown.style.top = (rect.bottom + 8) + 'px';
                const leftPos = Math.max(12, Math.min(window.innerWidth - 390, rect.left - 280));
                dropdown.style.left = leftPos + 'px';
                dropdown.style.right = 'auto';
                dropdown.style.width = '380px';
                dropdown.style.maxWidth = '90vw';
                dropdown.style.margin = '0';
                dropdown.style.zIndex = '100005';
            }
        }
    }

    function closeNotificationsDropdown() {
        const dropdown = document.getElementById('notif-dropdown-panel');
        const backdrop = document.getElementById('notif-backdrop');
        if (dropdown) dropdown.style.display = 'none';
        if (backdrop) backdrop.style.display = 'none';
    }

    // ── 8. رسم قائمة الإشعارات داخل القائمة المنسدلة ──
    function renderNotificationsList() {
        const listContainer = document.getElementById('notif-list-container');
        if (!listContainer) return;

        const userNotifs = getCurrentUserNotifications();
        if (userNotifs.length === 0) {
            listContainer.innerHTML = `
                <div style="padding:32px 16px; text-align:center; color:#64748b;">
                    <div style="font-size:36px; margin-bottom:8px;">🔕</div>
                    <div style="font-weight:bold; font-size:13.5px; color:#1e293b;">لا توجد إشعارات جديدة حالياً</div>
                    <div style="font-size:11.5px; color:#94a3b8; margin-top:4px;">ستظهر هنا طلبات الإجازات والأذونات وقرارات الاعتماد فور وصولها</div>
                </div>
            `;
            return;
        }

        listContainer.replaceChildren();
        userNotifs.slice(0, 35).forEach(n => {
            let icon = '🔔';
            let iconBg = '#f1f5f9';
            let iconColor = '#1e293b';

            if (n.type && n.type.includes('leave')) {
                icon = '🏖️';
                iconBg = '#eff6ff';
                iconColor = '#1d4ed8';
            } else if (n.type && n.type.includes('permission')) {
                icon = '⏱️';
                iconBg = '#fef3c7';
                iconColor = '#b45309';
            }

            if (n.type && n.type.includes('approved')) {
                icon = '✅';
                iconBg = '#dcfce7';
                iconColor = '#15803d';
            } else if (n.type && n.type.includes('rejected')) {
                icon = '❌';
                iconBg = '#fee2e2';
                iconColor = '#b91c1c';
            }

            const unreadStyle = !n.isRead ? 'background:#f0fdf4; border-right:4px solid #10b981;' : 'background:#ffffff; border-right:4px solid transparent;';
            const timeAgo = formatTimeAgo(n.createdAt);

            const item = document.createElement('div');
            item.className = 'notif-item';
            item.style.cssText = `display:flex; gap:10px; padding:12px 14px; border-bottom:1px solid #f1f5f9; cursor:pointer; transition:background 0.2s; ${unreadStyle}`;
            item.addEventListener('click', () => onNotificationClicked(n.id, n.actionScreen || ''));

            const iconBox = document.createElement('div');
            iconBox.style.cssText = `width:38px; height:38px; border-radius:50%; background:${iconBg}; color:${iconColor}; display:flex; align-items:center; justify-content:center; font-size:17px; flex-shrink:0;`;
            iconBox.textContent = icon;

            const body = document.createElement('div');
            body.style.cssText = 'flex:1; min-width:0;';
            const heading = document.createElement('div');
            heading.style.cssText = 'display:flex; justify-content:space-between; align-items:flex-start; gap:6px;';
            const title = document.createElement('div');
            title.style.cssText = 'font-weight:bold; font-size:13px; color:#1e293b;';
            title.textContent = String(n.title || '');
            const time = document.createElement('span');
            time.style.cssText = 'font-size:10px; color:#94a3b8; white-space:nowrap;';
            time.textContent = timeAgo;
            heading.append(title, time);

            const message = document.createElement('div');
            message.style.cssText = 'font-size:12px; color:#475569; margin-top:3px; line-height:1.45;';
            message.textContent = String(n.message || '');

            const footer = document.createElement('div');
            footer.style.cssText = 'display:flex; justify-content:space-between; align-items:center; margin-top:5px; font-size:10.5px; color:#64748b;';
            const sender = document.createElement('span');
            sender.append('بواسطة: ');
            const senderName = document.createElement('strong');
            senderName.textContent = String(n.senderName || '');
            sender.appendChild(senderName);
            footer.appendChild(sender);
            if (!n.isRead) {
                const fresh = document.createElement('span');
                fresh.style.cssText = 'color:#059669; font-weight:bold;';
                fresh.textContent = '• جديد';
                footer.appendChild(fresh);
            }

            body.append(heading, message, footer);
            item.append(iconBox, body);
            listContainer.appendChild(item);
        });
    }

    // ── 9. عند النقر على إشعار معين ──
    function onNotificationClicked(notifId, actionScreen) {
        const notif = notificationsDb.find(n => n.id === notifId);
        if (notif) {
            notif.isRead = true;
            saveNotifications();
        }
        closeNotificationsDropdown();

        if (actionScreen && typeof switchScreen === 'function') {
            const navBtn = document.getElementById('nav-' + actionScreen);
            switchScreen(actionScreen, navBtn);
        }
    }

    // ── 10. تحديد الكل كمقروء ──
    function markAllNotificationsRead() {
        const userNotifs = getCurrentUserNotifications();
        userNotifs.forEach(n => { n.isRead = true; });
        saveNotifications();
        if (typeof showToast === 'function') {
            showToast('تم تحديد جميع الإشعارات كمقروءة ✅', 'info');
        }
    }

    // ── 11. دمج الإشعارات الواردة من السحابة أو السيرفر (Live Sync Engine) ──
    function syncIncomingNotificationsFromRemote(remoteList, source = 'remote') {
        if (!Array.isArray(remoteList)) return;

        const user = window.currentUser;
        const currentMap = new Map(
            notificationsDb
                .filter(notification => !isNotificationForCurrentUser(notification, user))
                .map(notification => [notification.id, notification])
        );
        const previousMap = new Map(notificationsDb.map(notification => [notification.id, notification]));
        const newlyReceivedForUser = [];

        remoteList.forEach(rn => {
            if (!rn || !rn.id) return;
            const local = previousMap.get(rn.id);
            if (!local) {
                if (!rn.isRead && isNotificationForCurrentUser(rn, user)) {
                    newlyReceivedForUser.push(rn);
                }
            }
            currentMap.set(rn.id, rn);
        });

        notificationsDb = Array.from(currentMap.values());
        notificationsDb.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
        if (notificationsDb.length > 300) {
            notificationsDb = notificationsDb.slice(0, 300);
        }
        localStorage.setItem('erp_notifications_db', JSON.stringify(notificationsDb));
        updateNotificationBellUI();

        if (newlyReceivedForUser.length > 0) {
            playNotificationChime();
            const first = newlyReceivedForUser[0];
            if (typeof showToast === 'function') {
                const extra = newlyReceivedForUser.length > 1 ? ` (+${newlyReceivedForUser.length - 1} إشعارات أخرى)` : '';
                const toastType = (first.type && first.type.includes('reject')) ? 'error' : ((first.type && first.type.includes('approve')) ? 'success' : 'info');
                showToast(`🔔 ${first.title}: ${first.message}${extra}`, toastType);
            }
        }
    }

    // ── 12. المزامنة الثنائية مع السيرفر المحلي (Local Server Sync) ──
    let isLocalServerSyncInProgress = false;
    const pendingNotificationEvents = [];
    async function syncNotificationsWithLocalServer(event = null) {
        if (isLocalServerSyncInProgress) {
            if (event && !pendingNotificationEvents.some(item =>
                item.type === event.type && item.relatedId === event.relatedId
            )) {
                pendingNotificationEvents.push(event);
            }
            return;
        }
        const isHttp = window.location.protocol === 'http:' || window.location.protocol === 'https:';
        if (!isHttp) return;

        isLocalServerSyncInProgress = true;
        try {
            const resp = await window.authenticatedFetch('/api/notifications/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(event
                    ? { action: 'event', type: event.type, relatedId: event.relatedId }
                    : {
                        action: 'sync-read',
                        notifications: getCurrentUserNotifications().slice(0, 100).map(({ id, isRead }) => ({ id, isRead }))
                    }),
                cache: 'no-cache'
            });
            const data = await resp.json();
            if (!resp.ok || !data || !data.success || !Array.isArray(data.notifications)) {
                throw new Error(data.message || 'تعذرت مزامنة الإشعارات مع الخادم.');
            }
            syncIncomingNotificationsFromRemote(data.notifications, 'server');
        } catch (error) {
            console.error('Notification sync failed:', error);
            if (typeof showToast === 'function') {
                showToast(event
                    ? 'لم يتم تأكيد إرسال الإشعار؛ أبلغ مدير النظام.'
                    : 'تعذر تحديث الإشعارات من الخادم.', 'error');
            }
        } finally {
            isLocalServerSyncInProgress = false;
            const nextEvent = pendingNotificationEvents.shift();
            if (nextEvent) syncNotificationsWithLocalServer(nextEvent);
        }
    }

    // ── 13. فحص الإشعارات عند تسجيل الدخول أو فتح التطبيق ──
    function checkUserNotificationsOnLogin(user) {
        if (!user) return;
        setTimeout(() => {
            updateNotificationBellUI();
            syncNotificationsWithLocalServer();
            const userNotifs = getCurrentUserNotifications();
            const unread = userNotifs.filter(n => !n.isRead);

            if (unread.length > 0) {
                playNotificationChime();
                const first = unread[0];
                if (typeof showToast === 'function') {
                    showToast(`🔔 لديك ${unread.length} إشعار جديد بانتظارك: ${first.title}`, 'info');
                }
            }
        }, 600);
    }

    // مساعدة: صياغة التوقيت الزمني بالعربية
    function formatTimeAgo(isoStr) {
        if (!isoStr) return '';
        const now = new Date();
        const date = new Date(isoStr);
        const diffSec = Math.floor((now - date) / 1000);

        if (diffSec < 60) return 'الآن';
        if (diffSec < 3600) return `منذ ${Math.floor(diffSec / 60)} دقيقة`;
        if (diffSec < 86400) return `منذ ${Math.floor(diffSec / 3600)} ساعة`;
        return date.toLocaleDateString('ar-EG');
    }

    // إغلاق القائمة المنسدلة عند النقر خارجها
    document.addEventListener('click', (e) => {
        const dropdown = document.getElementById('notif-dropdown-panel');
        const bellBtnDesktop = document.getElementById('btn-notif-bell-desktop');
        const bellBtnMobile = document.getElementById('btn-notif-bell-mobile');

        if (dropdown && dropdown.style.display === 'block') {
            if (!dropdown.contains(e.target) && 
                (!bellBtnDesktop || !bellBtnDesktop.contains(e.target)) &&
                (!bellBtnMobile || !bellBtnMobile.contains(e.target))) {
                closeNotificationsDropdown();
            }
        }
    });

    // تصدير الواجهات البرمجية للنظام
    window.createNotification = createNotification;
    window.updateNotificationBellUI = updateNotificationBellUI;
    window.toggleNotificationsDropdown = toggleNotificationsDropdown;
    window.closeNotificationsDropdown = closeNotificationsDropdown;
    window.markAllNotificationsRead = markAllNotificationsRead;
    window.markAllNotificationsAsRead = markAllNotificationsRead; // alias
    window.onNotificationClicked = onNotificationClicked;
    window.checkUserNotificationsOnLogin = checkUserNotificationsOnLogin;
    window.playNotificationChime = playNotificationChime;
    window.syncIncomingNotificationsFromRemote = syncIncomingNotificationsFromRemote;
    window.syncNotificationsWithLocalServer = syncNotificationsWithLocalServer;

    // مزامنة دورية هادئة كل 25 ثانية مع السيرفر المحلي عند نشاط المتصفح لتفادي أي تهنيج أو ثقل
    setInterval(() => {
        if (typeof document !== 'undefined' && document.visibilityState !== 'hidden') {
            syncNotificationsWithLocalServer();
        }
    }, 25000);

    // تشغيل مبدئي عند اكتمال تحميل الصفحة
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            updateNotificationBellUI();
            syncNotificationsWithLocalServer();
        });
    } else {
        updateNotificationBellUI();
        syncNotificationsWithLocalServer();
    }
})();
