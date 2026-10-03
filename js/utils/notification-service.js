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
            gain.gain.setValueAtTime(0.12, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.45);
        } catch (e) {
            // تجاهل أي تقييد للصوت التلقائي
        }
    }

    // ── 2. حفظ الإشعارات في التخزين المحلي ──
    function saveNotifications() {
        localStorage.setItem('erp_notifications_db', JSON.stringify(notificationsDb));
        if (typeof pushSingleCollectionToFirebase === 'function') {
            pushSingleCollectionToFirebase('notifications', notificationsDb);
        }
        updateNotificationBellUI();
    }

    // ── 3. إضافة إشعار جديد للنظام ──
    function createNotification({ type, title, message, targetUsername, targetRole, targetEmpId, senderName, relatedId, actionScreen }) {
        const notif = {
            id: 'notif_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
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

        saveNotifications();
        playNotificationChime();

        // إشعار Toast منبثق فوري
        if (typeof showToast === 'function') {
            showToast(`🔔 ${title}: ${message}`, type.includes('rejected') ? 'error' : (type.includes('approved') ? 'success' : 'info'));
        }

        return notif;
    }

    // ── 4. الحصول على الإشعارات الموجهة للمستخدم الحالي ──
    function getCurrentUserNotifications() {
        const user = window.currentUser;
        if (!user) return [];

        const isAdmin = (user.role === 'admin' || user.username === 'admin');
        const userEmpId = user.empId ? String(user.empId) : null;
        const username = user.username ? user.username.toLowerCase() : '';

        return notificationsDb.filter(n => {
            // مدير النظام يرى كافة الإشعارات العامة وإشعارات المديرين
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
        });
    }

    // ── 5. تحديث أيقونة جرس الإشعارات والعداد (Desktop + Mobile) ──
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

    // ── 6. فتح / إغلاق القائمة المنسدلة للإشعارات ──
    function toggleNotificationsDropdown() {
        const dropdown = document.getElementById('notif-dropdown-panel');
        if (!dropdown) return;

        const isCurrentlyOpen = dropdown.style.display === 'block';
        if (isCurrentlyOpen) {
            dropdown.style.display = 'none';
        } else {
            renderNotificationsList();
            dropdown.style.display = 'block';
        }
    }

    function closeNotificationsDropdown() {
        const dropdown = document.getElementById('notif-dropdown-panel');
        if (dropdown) dropdown.style.display = 'none';
    }

    // ── 7. رسم قائمة الإشعارات داخل القائمة المنسدلة ──
    function renderNotificationsList() {
        const listContainer = document.getElementById('notif-list-container');
        if (!listContainer) return;

        const userNotifs = getCurrentUserNotifications();
        if (userNotifs.length === 0) {
            listContainer.innerHTML = `
                <div style="padding:28px 16px; text-align:center; color:#64748b;">
                    <div style="font-size:32px; margin-bottom:8px;">🔕</div>
                    <div style="font-weight:bold; font-size:13px;">لا توجد إشعارات جديدة حالياً</div>
                    <div style="font-size:11px; color:#94a3b8; margin-top:4px;">ستظهر هنا طلبات الإجازات والأذونات والقرارات فور وصولها</div>
                </div>
            `;
            return;
        }

        let html = '';
        userNotifs.slice(0, 30).forEach(n => {
            let icon = '🔔';
            let iconBg = '#f1f5f9';
            let iconColor = '#1e293b';

            if (n.type.includes('leave')) {
                icon = '🏖️';
                iconBg = '#eff6ff';
                iconColor = '#1d4ed8';
            } else if (n.type.includes('permission')) {
                icon = '⏱️';
                iconBg = '#fef3c7';
                iconColor = '#b45309';
            }

            if (n.type.includes('approved')) {
                icon = '✅';
                iconBg = '#dcfce7';
                iconColor = '#15803d';
            } else if (n.type.includes('rejected')) {
                icon = '❌';
                iconBg = '#fee2e2';
                iconColor = '#b91c1c';
            }

            const unreadStyle = !n.isRead ? 'background:#f0fdf4; border-right:3.5px solid #10b981;' : 'background:#ffffff; border-right:3.5px solid transparent;';
            const timeAgo = formatTimeAgo(n.createdAt);

            html += `
                <div class="notif-item" onclick="onNotificationClicked('${n.id}', '${n.actionScreen || ''}')" style="display:flex; gap:10px; padding:10px 12px; border-bottom:1px solid #f1f5f9; cursor:pointer; transition:background 0.2s; ${unreadStyle}">
                    <div style="width:36px; height:36px; border-radius:50%; background:${iconBg}; color:${iconColor}; display:flex; align-items:center; justify-content:center; font-size:16px; flex-shrink:0;">
                        ${icon}
                    </div>
                    <div style="flex:1; min-width:0;">
                        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:6px;">
                            <div style="font-weight:bold; font-size:12.5px; color:#1e293b;">${n.title}</div>
                            <span style="font-size:10px; color:#94a3b8; white-space:nowrap;">${timeAgo}</span>
                        </div>
                        <div style="font-size:11.5px; color:#475569; margin-top:2px; line-height:1.4;">${n.message}</div>
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:4px; font-size:10px; color:#64748b;">
                            <span>بواسطة: <strong>${n.senderName}</strong></span>
                            ${!n.isRead ? '<span style="color:#059669; font-weight:bold;">• جديد</span>' : ''}
                        </div>
                    </div>
                </div>
            `;
        });

        listContainer.innerHTML = html;
    }

    // ── 8. عند النقر على إشعار معين ──
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

    // ── 9. تحديد الكل كمقروء ──
    function markAllNotificationsRead() {
        const userNotifs = getCurrentUserNotifications();
        userNotifs.forEach(n => { n.isRead = true; });
        saveNotifications();
        if (typeof showToast === 'function') {
            showToast('تم تحديد جميع الإشعارات كمقروءة ✅', 'info');
        }
    }

    // ── 10. فحص الإشعارات عند تسجيل الدخول أو فتح التطبيق ──
    function checkUserNotificationsOnLogin(user) {
        if (!user) return;
        setTimeout(() => {
            updateNotificationBellUI();
            const userNotifs = getCurrentUserNotifications();
            const unread = userNotifs.filter(n => !n.isRead);

            if (unread.length > 0) {
                playNotificationChime();
                const first = unread[0];
                if (typeof showToast === 'function') {
                    showToast(`🔔 لديك ${unread.length} إشعار جديد بانتظارك: ${first.title}`, 'info');
                }
            }
        }, 800);
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
                dropdown.style.display = 'none';
            }
        }
    });

    // تصدير الواجهات البرمجية للنظام
    window.createNotification = createNotification;
    window.updateNotificationBellUI = updateNotificationBellUI;
    window.toggleNotificationsDropdown = toggleNotificationsDropdown;
    window.closeNotificationsDropdown = closeNotificationsDropdown;
    window.markAllNotificationsRead = markAllNotificationsRead;
    window.onNotificationClicked = onNotificationClicked;
    window.checkUserNotificationsOnLogin = checkUserNotificationsOnLogin;
    window.playNotificationChime = playNotificationChime;

    // تشغيل مبدئي عند اكتمال تحميل الصفحة
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', updateNotificationBellUI);
    } else {
        updateNotificationBellUI();
    }
})();
