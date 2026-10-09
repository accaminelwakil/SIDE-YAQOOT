// ====================================================================
// نظام التحقق من الموقع الجغرافي وبصمة الحضور الذكية (Geofencing Service)
// Mobile GPS Geofencing Attendance & Verification System
// منظومة عيادات سيدي ياقوت التخصصية
// ====================================================================

(function() {
    // الإعدادات الافتراضية لمقر العمل
    const DEFAULT_CONFIG = {
        latitude: 31.2001,
        longitude: 29.9187,
        radius_meters: 50.0,
        workplace_name: 'مقر عيادات سيدي ياقوت التخصصية',
        enabled: true
    };

    let activeGeofenceConfig = { ...DEFAULT_CONFIG };
    let currentDevicePosition = null;
    let gpsWatchId = null;
    let isLocating = false;

    // ── 1. حساب المسافة الدقيقة بين نقطتين (Haversine Formula) بالمتر ───
    function haversineDistance(lat1, lon1, lat2, lon2) {
        const R = 6371000; // نصف قطر الأرض بالمتر
        const toRad = (deg) => (deg * Math.PI) / 180;
        const dLat = toRad(lat2 - lat1);
        const dLon = toRad(lon2 - lon1);
        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    // ── 2. جلب إعدادات النطاق الجغرافي من السيرفر أو التخزين المحلي ─────
    async function loadGeofenceConfig() {
        try {
            const resp = await window.authenticatedFetch('/api/geofence/config');
            if (resp.ok) {
                const data = await resp.json();
                activeGeofenceConfig = { ...DEFAULT_CONFIG, ...data };
                localStorage.setItem('erp_geofence_config', JSON.stringify(activeGeofenceConfig));
                return activeGeofenceConfig;
            }
        } catch (e) {
            console.warn('[Geofence] Backend config unreachable, using localStorage fallback');
        }

        const localCfg = localStorage.getItem('erp_geofence_config');
        if (localCfg) {
            try {
                activeGeofenceConfig = { ...DEFAULT_CONFIG, ...JSON.parse(localCfg) };
            } catch (e) {}
        }
        return activeGeofenceConfig;
    }

    // ── 3. حفظ إعدادات النطاق الجغرافي ─────────────────────────────────
    async function saveGeofenceConfig(newConfig) {
        const nextConfig = { ...activeGeofenceConfig, ...newConfig };
        const resp = await window.authenticatedFetch('/api/geofence/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(nextConfig)
            });
        const result = await resp.json();
        if (!resp.ok || !result.success) throw new Error(result.message || 'فشل حفظ إعدادات النطاق الجغرافي.');
        activeGeofenceConfig = result.config;
        localStorage.setItem('erp_geofence_config', JSON.stringify(activeGeofenceConfig));
        return result;
    }

    // ── 4. التقاط إحداثيات الجهاز الحالية بدقة عالية (GPS) ─────────────
    function getDeviceCoordinates() {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                reject(new Error('متصفحك لا يدعم خاصية تحديد الموقع الجغرافي (GPS)!'));
                return;
            }

            const options = {
                enableHighAccuracy: true,
                timeout: 12000,
                maximumAge: 0
            };

            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    currentDevicePosition = {
                        latitude: pos.coords.latitude,
                        longitude: pos.coords.longitude,
                        accuracy: pos.coords.accuracy,
                        timestamp: pos.timestamp
                    };
                    resolve(currentDevicePosition);
                },
                (err) => {
                    let msg = 'تعذر تحديد موقعك الحالي عبر GPS.';
                    if (err.code === 1) {
                        msg = 'تم رفض الإذن للوصول إلى الموقع الجغرافي! يرجى السماح للتطبيق بالوصول للـ GPS من إعدادات المتصفح أو الهاتف.';
                    } else if (err.code === 2) {
                        msg = 'إشارة الموقع (GPS) غير متوفرة حالياً. تأكد من تفعيل الموقع في هاتفك والخروج لأماكن مفتوحة.';
                    } else if (err.code === 3) {
                        msg = 'استغرق تحديد الموقع وقتاً طويلاً. يرجى المحاولة مجدداً.';
                    }
                    reject(new Error(msg));
                },
                options
            );
        });
    }

    // ── 5. فتح نافذة تسجيل البصمة الذكية ──────────────────────────────
    function openSmartPunchModal() {
        const modal = document.getElementById('modal-smart-punch');
        if (!modal) return;

        modal.style.display = 'flex';
        updatePunchUserInfo();
        startLivePunchClock();
        refreshSmartPunchGps();
    }

    function closeSmartPunchModal() {
        const modal = document.getElementById('modal-smart-punch');
        if (modal) modal.style.display = 'none';
        if (gpsWatchId) {
            navigator.geolocation.clearWatch(gpsWatchId);
            gpsWatchId = null;
        }
    }

    // ── 6. تحديث بيانات الموظف في نافذة البصمة ─────────────────────────
    function updatePunchUserInfo() {
        let empName = 'موظف';
        let empCode = '-';
        let empDept = 'عام';

        const user = window.currentUser;
        const allEmps = Array.isArray(window.employeesDb) ? window.employeesDb : [];

        if (user) {
            empName = user.fullName || user.username;
            if (user.empId) {
                const found = allEmps.find(e => String(e.id) === String(user.empId));
                if (found) {
                    empName = found.name;
                    empCode = found.code || found.id;
                    empDept = found.dept || 'عام';
                }
            } else {
                // البحث بالاسم أو اسم المستخدم
                const found = allEmps.find(e => e.username === user.username || e.name === user.fullName);
                if (found) {
                    empCode = found.code || found.id;
                    empDept = found.dept || 'عام';
                }
            }
        }

        const nameEl = document.getElementById('smart-punch-emp-name');
        const codeEl = document.getElementById('smart-punch-emp-code');
        const deptEl = document.getElementById('smart-punch-emp-dept');

        if (nameEl) nameEl.textContent = empName;
        if (codeEl) codeEl.textContent = empCode;
        if (deptEl) deptEl.textContent = empDept;
    }

    // ── 7. تشغيل ساعة رقمية حية في نافذة البصمة ────────────────────────
    let clockInterval = null;
    function startLivePunchClock() {
        if (clockInterval) clearInterval(clockInterval);
        const clockEl = document.getElementById('smart-punch-live-clock');
        const dateEl = document.getElementById('smart-punch-live-date');

        const updateClock = () => {
            const now = new Date();
            if (clockEl) {
                const hours = String(now.getHours()).padStart(2, '0');
                const minutes = String(now.getMinutes()).padStart(2, '0');
                const seconds = String(now.getSeconds()).padStart(2, '0');
                clockEl.textContent = `${hours}:${minutes}:${seconds}`;
            }
            if (dateEl) {
                dateEl.textContent = now.toLocaleDateString('ar-EG', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                });
            }
        };

        updateClock();
        clockInterval = setInterval(updateClock, 1000);
    }

    // ── 8. تحديث إحداثيات GPS وحساب المسافة الحية ──────────────────────
    async function refreshSmartPunchGps() {
        const statusBox = document.getElementById('smart-punch-status-box');
        const distanceValEl = document.getElementById('smart-punch-distance-val');
        const radarEl = document.getElementById('smart-punch-radar');
        const submitBtn = document.getElementById('smart-punch-submit-btn');

        if (statusBox) {
            statusBox.className = 'punch-status-box status-locating';
            statusBox.innerHTML = `
                <div class="spinner-small" style="margin-left:8px; display:inline-block;"></div>
                <span>جاري قراءة إحداثيات GPS بدقة من هاتفك... 🛰️</span>
            `;
        }
        if (submitBtn) submitBtn.disabled = true;
        if (radarEl) radarEl.classList.add('radar-animating');

        try {
            await loadGeofenceConfig();
            const pos = await getDeviceCoordinates();

            const dist = haversineDistance(
                activeGeofenceConfig.latitude,
                activeGeofenceConfig.longitude,
                pos.latitude,
                pos.longitude
            );

            const allowed = activeGeofenceConfig.radius_meters || 50;
            const isInside = (!activeGeofenceConfig.enabled) || (dist <= allowed);

            if (distanceValEl) {
                distanceValEl.textContent = `${Math.round(dist)} متر`;
            }

            if (statusBox) {
                if (isInside) {
                    statusBox.className = 'punch-status-box status-inside';
                    statusBox.innerHTML = `
                        <span style="font-size:18px;">✅</span>
                        <div>
                            <strong>أنت داخل نطاق مقر العمل!</strong>
                            <div style="font-size:12px; opacity:0.9;">المسافة: <b>${Math.round(dist)} متر</b> (الحد الأقصى المسموح: ${allowed}م) - دقة GPS: ±${Math.round(pos.accuracy)}م</div>
                        </div>
                    `;
                    if (submitBtn) {
                        submitBtn.disabled = false;
                        submitBtn.classList.remove('btn-punch-disabled');
                    }
                } else {
                    statusBox.className = 'punch-status-box status-outside';
                    statusBox.innerHTML = `
                        <span style="font-size:18px;">❌</span>
                        <div>
                            <strong>أنت خارج نطاق مقر العمل!</strong>
                            <div style="font-size:12px;">أنت على بُعد <b>${Math.round(dist)} متر</b>، والحد الأقصى المسموح به هو <b>${allowed} متر فقط</b>. لا يمكن تسجيل الحضور.</div>
                        </div>
                    `;
                    if (submitBtn) {
                        submitBtn.disabled = true;
                        submitBtn.classList.add('btn-punch-disabled');
                    }
                }
            }
        } catch (err) {
            if (statusBox) {
                statusBox.className = 'punch-status-box status-error';
                statusBox.innerHTML = `
                    <span style="font-size:18px;">⚠️</span>
                    <div>
                        <strong>خطأ في تحديد الموقع:</strong>
                        <div style="font-size:12px;">${err.message}</div>
                    </div>
                `;
            }
            if (distanceValEl) distanceValEl.textContent = 'غير محدد';
            if (submitBtn) submitBtn.disabled = true;
        } finally {
            if (radarEl) radarEl.classList.remove('radar-animating');
        }
    }

    // ── 9. إرسال وتسجيل البصمة الجغرافية فعلياً ──────────────────────
    async function submitSmartAttendancePunch() {
        const typeIn = document.getElementById('smart-punch-type-in');
        const punchType = (typeIn && typeIn.checked) ? 'in' : 'out';
        const punchTitle = punchType === 'in' ? 'حضور' : 'انصراف';

        const submitBtn = document.getElementById('smart-punch-submit-btn');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = `⏳ جاري توثيق البصمة...`;
        }

        try {
            // إعادة التقاط الموقع فوراً للتأكيد ومنع التلاعب
            const pos = await getDeviceCoordinates();

            const user = window.currentUser || {};
            const allEmps = Array.isArray(window.employeesDb) ? window.employeesDb : [];
            let empId = user.empId || '';
            let empName = user.fullName || user.username || 'موظف';

            if (!empId) {
                const found = allEmps.find(e => e.username === user.username || e.name === user.fullName);
                if (found) {
                    empId = found.id;
                    empName = found.name;
                }
            }

            const payload = {
                empId: empId,
                empName: empName,
                type: punchType,
                latitude: pos.latitude,
                longitude: pos.longitude,
                accuracy: pos.accuracy
            };

            const resp = await window.authenticatedFetch('/api/attendance/check-in', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
            const result = await resp.json();
            if (!resp.ok || !result.success) {
                throw new Error(result.message || 'تم رفض تسجيل الحضور.');
            }

            // تحديث اليومية المحلية وتثبيت الحركة في النظام
            recordPunchInDailyAttendance(empId, empName, punchType);

            // إشعار نجاح
            alert(`🎉 ${result.message}`);
            closeSmartPunchModal();

            if (typeof showToast === 'function') {
                showToast(`تم تسجيل ${punchTitle} للموظف (${empName}) بنجاح`);
            }
        } catch (err) {
            alert(`❌ فشل تسجيل البصمة:\n${err.message}`);
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = `📍 تأكيد وتسجيل البصمة الآن`;
            }
        }
    }

    // ── 10. إدراج الحركة في كشف اليومية تلقائياً ──────────────────────
    function recordPunchInDailyAttendance(empId, empName, punchType) {
        if (!empId) return;

        const now = new Date();
        const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        const todayStr = now.toISOString().split('T')[0];

        // التحقق من وجود جدول اليومية الحالي
        if (typeof currentDailyAttendance !== 'undefined' && Array.isArray(currentDailyAttendance)) {
            let row = currentDailyAttendance.find(r => String(r.empId) === String(empId));
            if (!row) {
                // إضافة الموظف لليومية إذا لم يكن موجوداً
                row = {
                    empId: empId,
                    empName: empName,
                    timeIn: '',
                    timeOut: '',
                    totalHours: 0,
                    regularHours: 0,
                    extraHours: 0
                };
                currentDailyAttendance.push(row);
            }

            if (punchType === 'in') {
                row.timeIn = timeStr;
            } else {
                row.timeOut = timeStr;
            }

            // إعادة احتساب الساعات إن كانت الدالة متوفرة
            if (typeof calculateRowHours === 'function') {
                calculateRowHours(row);
            }

            // حفظ المسودة محلياً
            localStorage.setItem('erp_daily_draft_' + todayStr, JSON.stringify(currentDailyAttendance));

            // تحديث عرض الجدول لو الشاشة مفتوحة
            if (typeof renderDailyAttendanceTable === 'function') {
                renderDailyAttendanceTable();
            }
        }
    }

    // ── 11. نافذة إعدادات النطاق الجغرافي للمقر (Geofence Settings) ────
    function openGeofenceSettingsModal() {
        const modal = document.getElementById('modal-geofence-settings');
        if (!modal) return;

        modal.style.display = 'flex';

        loadGeofenceConfig().then(cfg => {
            const latInput = document.getElementById('geo-setting-lat');
            const lonInput = document.getElementById('geo-setting-lon');
            const radiusInput = document.getElementById('geo-setting-radius');
            const nameInput = document.getElementById('geo-setting-name');
            const enabledInput = document.getElementById('geo-setting-enabled');

            if (latInput) latInput.value = cfg.latitude;
            if (lonInput) lonInput.value = cfg.longitude;
            if (radiusInput) radiusInput.value = cfg.radius_meters || 50;
            if (nameInput) nameInput.value = cfg.workplace_name || '';
            if (enabledInput) enabledInput.checked = (cfg.enabled !== false);
        });
    }

    function closeGeofenceSettingsModal() {
        const modal = document.getElementById('modal-geofence-settings');
        if (modal) modal.style.display = 'none';
    }

    // حفظ إعدادات المقر من النموذج
    async function handleSaveGeofenceSettings(e) {
        if (e && e.preventDefault) e.preventDefault();

        const latInput = document.getElementById('geo-setting-lat');
        const lonInput = document.getElementById('geo-setting-lon');
        const radiusInput = document.getElementById('geo-setting-radius');
        const nameInput = document.getElementById('geo-setting-name');
        const enabledInput = document.getElementById('geo-setting-enabled');

        const lat = parseFloat(latInput ? latInput.value : 0);
        const lon = parseFloat(lonInput ? lonInput.value : 0);
        const radius = parseFloat(radiusInput ? radiusInput.value : 50);
        const name = (nameInput ? nameInput.value : '').trim();
        const enabled = enabledInput ? enabledInput.checked : true;

        if (isNaN(lat) || isNaN(lon)) {
            alert('يرجى إدخال إحداثيات صحيحة (خط الطول وخط العرض)!');
            return;
        }

        const newCfg = {
            latitude: lat,
            longitude: lon,
            radius_meters: radius,
            workplace_name: name || 'مقر العمل',
            enabled: enabled
        };

        const res = await saveGeofenceConfig(newCfg);
        alert('✅ تم حفظ إعدادات النطاق الجغرافي للمقر بنجاح!');
        closeGeofenceSettingsModal();
    }

    // التقاط إحداثيات المقر الحالي للمدير الآن بضغطة زر
    async function captureManagerCurrentLocationForWorkplace() {
        const btn = document.getElementById('btn-capture-workplace-gps');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '🛰️ جاري التقاط الإحداثيات الحالية...';
        }

        try {
            const pos = await getDeviceCoordinates();
            const latInput = document.getElementById('geo-setting-lat');
            const lonInput = document.getElementById('geo-setting-lon');

            if (latInput) latInput.value = pos.latitude.toFixed(6);
            if (lonInput) lonInput.value = pos.longitude.toFixed(6);

            alert(`✅ تم التقاط إحداثيات موقعك الحالي بنجاح!\nخط العرض: ${pos.latitude.toFixed(6)}\nخط الطول: ${pos.longitude.toFixed(6)}\nدقة الإشارة: ±${Math.round(pos.accuracy)} متر.`);
        } catch (err) {
            alert(`⚠️ تعذر التقاط الموقع:\n${err.message}`);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '📍 التقاط إحداثيات موقعي الحالي الآن (GPS)';
            }
        }
    }

    // فتح المقر في خرائط Google
    function openWorkplaceInGoogleMaps() {
        const latInput = document.getElementById('geo-setting-lat');
        const lonInput = document.getElementById('geo-setting-lon');
        const lat = latInput ? latInput.value : activeGeofenceConfig.latitude;
        const lon = lonInput ? lonInput.value : activeGeofenceConfig.longitude;
        window.open(`https://www.google.com/maps?q=${lat},${lon}`, '_blank');
    }

    // ── 12. نافذة سجل بصمات الموبايل الجغرافية ─────────────────────────
    async function openPunchesLogModal() {
        const modal = document.getElementById('modal-punches-log');
        if (!modal) return;

        modal.style.display = 'flex';
        const tbody = document.getElementById('punches-log-tbody');
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:20px;">⏳ جاري تحميل سجل البصمات...</td></tr>`;
        }

        try {
            const resp = await window.authenticatedFetch('/api/attendance/punches');
            const data = await resp.json();
            const punches = data.punches || [];

            if (tbody) {
                if (punches.length === 0) {
                    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:25px; color:#64748b; background:#f8fafc;">لا توجد بصمات جغرافية مسجلة حتى الآن.</td></tr>`;
                    const countBadge = document.getElementById('punches-log-count-badge');
                    if (countBadge) countBadge.textContent = '0';
                    return;
                }

                tbody.innerHTML = punches.map((p, idx) => {
                    const isAccepted = (p.status === 'ACCEPTED');
                    const statusBadge = isInsideBadge(isAccepted);
                    const typeBadge = p.type === 'in'
                        ? `<span class="badge" style="background:#ecfdf5; color:#065f46; font-weight:bold; padding:3px 8px; border-radius:6px;">🟢 حضور</span>`
                        : `<span class="badge" style="background:#fff1f2; color:#9f1239; font-weight:bold; padding:3px 8px; border-radius:6px;">🔴 انصراف</span>`;

                    const mapLink = `https://www.google.com/maps?q=${p.latitude},${p.longitude}`;

                    return `
                        <tr style="border-bottom: 1px solid #e2e8f0; background: ${idx % 2 === 0 ? '#ffffff' : '#f8fafc'};">
                            <td style="text-align:center; font-weight:bold; color:#475569; padding:9px 8px;">${idx + 1}</td>
                            <td style="text-align:right; padding:9px 10px;">
                                <b style="color:#0f172a; font-size:13px;">${p.empName || 'موظف'}</b>
                                <div style="font-size:11px; color:#64748b;">كود: ${p.empId || '-'}</div>
                            </td>
                            <td style="text-align:center; padding:9px 8px;">${typeBadge}</td>
                            <td style="text-align:center; font-family:Consolas, monospace; color:#334155; padding:9px 8px;">${p.date} ${p.time}</td>
                            <td style="text-align:center; font-weight:bold; color:#0f172a; padding:9px 8px;">${p.distance_meters} م <span style="font-size:10px; color:#64748b; font-weight:normal;">(أقصى: ${p.allowed_radius}م)</span></td>
                            <td style="text-align:center; padding:9px 8px;">${statusBadge}</td>
                            <td style="text-align:center; padding:9px 8px;">
                                <a href="${mapLink}" target="_blank" class="btn-sm" style="background:#f1f5f9; border:1px solid #cbd5e1; color:#0369a1; text-decoration:none; padding:4px 9px; border-radius:6px; font-size:11px; font-weight:bold; display:inline-block;">🗺️ الخريطة</a>
                            </td>
                        </tr>
                    `;
                }).join('');

                const countBadge = document.getElementById('punches-log-count-badge');
                if (countBadge) countBadge.textContent = String(punches.length);
            }
        } catch (e) {
            if (tbody) {
                tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:20px; color:#ef4444; background:#fef2f2;">تعذر تحميل السجل من السيرفر.</td></tr>`;
            }
        }
    }

    function isInsideBadge(isAccepted) {
        return isAccepted
            ? `<span class="badge" style="background:#d1fae5; color:#065f46; font-weight:bold;">✅ مقبول (داخل المقر)</span>`
            : `<span class="badge" style="background:#fee2e2; color:#991b1b; font-weight:bold;">❌ مرفوض (خارج المقر)</span>`;
    }

    function closePunchesLogModal() {
        const modal = document.getElementById('modal-punches-log');
        if (modal) modal.style.display = 'none';
    }

    // ── تصدير الدوال للـ Global Scope ─────────────────────────────────
    window.haversineDistance = haversineDistance;
    window.loadGeofenceConfig = loadGeofenceConfig;
    window.saveGeofenceConfig = saveGeofenceConfig;
    window.getDeviceCoordinates = getDeviceCoordinates;
    window.openSmartPunchModal = openSmartPunchModal;
    window.closeSmartPunchModal = closeSmartPunchModal;
    window.refreshSmartPunchGps = refreshSmartPunchGps;
    window.submitSmartAttendancePunch = submitSmartAttendancePunch;
    window.openGeofenceSettingsModal = openGeofenceSettingsModal;
    window.closeGeofenceSettingsModal = closeGeofenceSettingsModal;
    window.handleSaveGeofenceSettings = handleSaveGeofenceSettings;
    window.captureManagerCurrentLocationForWorkplace = captureManagerCurrentLocationForWorkplace;
    window.openWorkplaceInGoogleMaps = openWorkplaceInGoogleMaps;
    window.openPunchesLogModal = openPunchesLogModal;
    window.closePunchesLogModal = closePunchesLogModal;

    // تحميل الإعدادات تلقائياً عند الإقلاع
    loadGeofenceConfig();
})();
