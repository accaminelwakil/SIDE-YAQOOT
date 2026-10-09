    // =========================================================================
    // نظام الاتصال والمزامنة السحابية مع Firebase (Firebase Cloud Database Sync)
    // =========================================================================

    let firebaseAppInstance = null;
    let firestoreDb = null;
    let realtimeDb = null;
    let currentFirebaseConfig = null;
    let isFirebaseConnected = false;
    let isRealtimeSyncActive = false;
    let activeFirebaseListeners = [];
    let isPerformingRemoteSync = false;

    async function signInToFirebase(username, password) {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const result = await response.json();
        if (!response.ok || !result.success || !result.token) {
            throw new Error(result.message || 'تعذر تسجيل الدخول.');
        }
        if (!firebaseAppInstance || !currentFirebaseConfig || !currentFirebaseConfig.apiKey) {
            await promptForFirebaseWebApiKey();
        }
        const auth = firebase.auth(firebaseAppInstance);
        try {
            await auth.signInWithCustomToken(result.token);
        } catch (error) {
            if (!String(error.code || '').startsWith('auth/api-key-not-valid')) throw error;
            await promptForFirebaseWebApiKey();
            await firebase.auth(firebaseAppInstance).signInWithCustomToken(result.token);
        }
        return result.user;
    }

    async function authenticatedFetch(url, options = {}) {
        const auth = firebase.auth(firebaseAppInstance);
        const user = auth.currentUser;
        if (!user) throw new Error('يرجى تسجيل الدخول أولاً.');
        const token = await user.getIdToken();
        const headers = new Headers(options.headers || {});
        headers.set('Authorization', `Bearer ${token}`);
        return fetch(url, { ...options, headers });
    }

    window.signInToFirebase = signInToFirebase;
    window.authenticatedFetch = authenticatedFetch;
    window.syncAuthenticatedCloudData = autoSyncFromCloudOnStartup;
    window.activateAuthenticatedFirebaseSession = async () => {
        setupFirebaseRealtimeListeners();
        await autoSyncFromCloudOnStartup();
    };

    async function replaceFirebaseWebApiKey(apiKey) {
        const normalizedKey = String(apiKey || '').trim();
        if (!normalizedKey.startsWith('AIza') || normalizedKey.length < 30 || normalizedKey.length > 100) {
            throw new Error('مفتاح Web API غير صالح. انسخه من إعدادات تطبيق الويب في Firebase.');
        }
        if (!currentFirebaseConfig) {
            throw new Error('إعدادات Firebase غير جاهزة. أعد تحميل الصفحة وحاول مرة أخرى.');
        }

        const updatedConfig = { ...currentFirebaseConfig, apiKey: normalizedKey };
        detachFirebaseListeners();
        if (firebaseAppInstance) {
            await firebaseAppInstance.delete();
        }
        firebaseAppInstance = null;
        firestoreDb = null;
        realtimeDb = null;
        isFirebaseConnected = false;
        isRealtimeSyncActive = false;
        currentFirebaseConfig = updatedConfig;
        localStorage.setItem('erp_firebase_config', JSON.stringify(updatedConfig));
        initFirebaseConnection(updatedConfig, false);
    }

    async function promptForFirebaseWebApiKey() {
        const apiKey = window.prompt(
            'مفتاح Firebase Web API غير صالح أو غير مضبوط.\nالصق Web API key من Firebase Console → Project settings → General → Your apps → SDK setup.\nلا تستخدم مفتاح Service Account.'
        );
        if (apiKey === null) throw new Error('أُلغي تحديث مفتاح Firebase. لن يكتمل تسجيل الدخول بدونه.');
        await replaceFirebaseWebApiKey(apiKey);
    }

    window.fixFirebaseApiKey = async () => {
        try {
            await promptForFirebaseWebApiKey();
            window.alert('تم تحديث إعداد Firebase على هذا الجهاز. جرّب تسجيل الدخول الآن.');
        } catch (error) {
            console.error('Failed to update Firebase Web API key:', error);
            window.alert(error.message || 'تعذر تحديث مفتاح Firebase.');
        }
    };

    // تحميل الإعدادات المحفوظة عند بدء التشغيل
    function loadStoredFirebaseConfig() {
        try {
            const raw = localStorage.getItem('erp_firebase_config');
            let savedConfig = {};
            if (raw) {
                try {
                    const parsedConfig = JSON.parse(raw);
                    if (parsedConfig && typeof parsedConfig === 'object' && !Array.isArray(parsedConfig)) {
                        savedConfig = parsedConfig;
                    }
                } catch (e) {
                    console.warn('تعذر تحليل إعدادات Firebase المحفوظة، سيتم استخدام الإعدادات الافتراضية:', e);
                }
            }

            const defaultConfig = window.SIDI_YAQOOT_FIREBASE_CONFIG;
            if (!defaultConfig || !defaultConfig.apiKey) {
                throw new Error('لم يتم تحميل إعدادات Firebase الافتراضية. أعد تحميل التطبيق أو تحقق من ملفات النشر.');
            }

            const config = { ...defaultConfig, ...savedConfig };
            config.apiKey = savedConfig.apiKey || defaultConfig.apiKey;
            localStorage.setItem('erp_firebase_config', JSON.stringify(config));

            currentFirebaseConfig = config;
            
            // تعبئة حقول الشاشة إن كانت متواجدة
            populateFirebaseSettingsForm(config);

            // بدء الاتصال بالسحابة تلقائياً
            if (config.apiKey && config.projectId) {
                initFirebaseConnection(config, false);
            } else {
                updateFirebaseUIStatus(false, '');
            }
        } catch (e) {
            console.error('خطأ في استرجاع إعدادات Firebase:', e);
            updateFirebaseUIStatus(false, '');
        }
    }

    function populateFirebaseSettingsForm(config) {
        if (!config) return;
        const setVal = (id, val) => {
            const el = document.getElementById(id);
            if (el && val !== undefined) el.value = val;
        };
        setVal('fb-api-key', config.apiKey || '');
        setVal('fb-project-id', config.projectId || '');
        setVal('fb-auth-domain', config.authDomain || '');
        setVal('fb-storage-bucket', config.storageBucket || '');
        setVal('fb-app-id', config.appId || '');
        setVal('fb-database-url', config.databaseURL || '');
        
        const dbTypeEl = document.getElementById('fb-db-type');
        if (dbTypeEl) {
            dbTypeEl.value = config.dbType || 'firestore';
            onFirebaseDbTypeChanged();
        }

        const rtSyncEl = document.getElementById('fb-enable-realtime-sync');
        if (rtSyncEl && config.enableRealtimeSync !== undefined) {
            rtSyncEl.checked = !!config.enableRealtimeSync;
        }

        const offlineEl = document.getElementById('fb-enable-offline-fallback');
        if (offlineEl && config.enableOfflineFallback !== undefined) {
            offlineEl.checked = !!config.enableOfflineFallback;
        }
    }

    function onFirebaseDbTypeChanged() {
        const dbTypeEl = document.getElementById('fb-db-type');
        const urlField = document.getElementById('fb-database-url-field');
        if (!dbTypeEl || !urlField) return;
        if (dbTypeEl.value === 'realtime') {
            urlField.style.display = 'block';
        } else {
            urlField.style.display = 'none';
        }
    }

    // استخراج الإعدادات تلقائياً من كود يتم لصقه
    function parsePastedFirebaseConfig() {
        const rawInput = document.getElementById('fb-raw-config-input');
        if (!rawInput || !rawInput.value.trim()) {
            alert('الرجاء لصق كود كائن الإعدادات أولاً داخل المربع!');
            return;
        }
        const text = rawInput.value.trim();

        // استخراج المتغيرات بنمط regex ذكي يدعم JS و JSON
        const extractKey = (key) => {
            const patterns = [
                new RegExp(`${key}\\s*:\\s*["'\`]([^"'\`]+)["'\`]`, 'i'),
                new RegExp(`"${key}"\\s*:\\s*"([^"]+)"`, 'i')
            ];
            for (const p of patterns) {
                const match = text.match(p);
                if (match && match[1]) return match[1].trim();
            }
            return '';
        };

        const apiKey = extractKey('apiKey');
        const projectId = extractKey('projectId');
        const authDomain = extractKey('authDomain');
        const storageBucket = extractKey('storageBucket');
        const appId = extractKey('appId');
        const databaseURL = extractKey('databaseURL');

        if (!apiKey && !projectId) {
            alert('لم يتم العثور على مفاتيح Firebase صالحة في النص المنسوخ. تأكد من نسخ const firebaseConfig بالكامل.');
            return;
        }

        if (apiKey) document.getElementById('fb-api-key').value = apiKey;
        if (projectId) document.getElementById('fb-project-id').value = projectId;
        if (authDomain) document.getElementById('fb-auth-domain').value = authDomain;
        if (storageBucket) document.getElementById('fb-storage-bucket').value = storageBucket;
        if (appId) document.getElementById('fb-app-id').value = appId;
        if (databaseURL) {
            document.getElementById('fb-database-url').value = databaseURL;
            document.getElementById('fb-db-type').value = 'realtime';
            onFirebaseDbTypeChanged();
        }

        alert('✅ تم استخراج وتعبئة كافة مفاتيح اعتماد Firebase بنجاح!\n\nاضغط الآن على زر "حفظ وتفعيل الاتصال بـ Firebase الآن".');
    }

    // حفظ إعدادات الـ Firebase وبدء الاتصال
    function handleSaveFirebaseSettings(e) {
        if (e && e.preventDefault) e.preventDefault();

        const apiKey = (document.getElementById('fb-api-key')?.value || '').trim();
        const projectId = (document.getElementById('fb-project-id')?.value || '').trim();
        const authDomain = (document.getElementById('fb-auth-domain')?.value || '').trim();
        const storageBucket = (document.getElementById('fb-storage-bucket')?.value || '').trim();
        const appId = (document.getElementById('fb-app-id')?.value || '').trim();
        const dbType = document.getElementById('fb-db-type')?.value || 'firestore';
        const databaseURL = (document.getElementById('fb-database-url')?.value || '').trim();
        const enableRealtimeSync = document.getElementById('fb-enable-realtime-sync')?.checked ?? true;
        const enableOfflineFallback = document.getElementById('fb-enable-offline-fallback')?.checked ?? true;

        if (!apiKey || !projectId) {
            alert('الرجاء إدخال مفتاح الـ API ومعرف المشروع على الأقل.');
            return;
        }

        const config = {
            apiKey,
            projectId,
            authDomain,
            storageBucket,
            appId,
            dbType,
            databaseURL,
            enableRealtimeSync,
            enableOfflineFallback
        };

        localStorage.setItem('erp_firebase_config', JSON.stringify(config));
        currentFirebaseConfig = config;

        initFirebaseConnection(config, true);
    }

    // تهيئة الاتصال بمكتبة Firebase
    function initFirebaseConnection(config, isManual = false) {
        if (typeof firebase === 'undefined') {
            const msg = 'تعذر تحميل مكتبة Firebase من الإنترنت. يرجى التحقق من اتصالك بالشبكة.';
            console.error(msg);
            if (isManual) alert(msg);
            updateFirebaseUIStatus(false, config ? config.projectId : '');
            return;
        }

        try {
            // تنظيف أي مستمعين سابقين
            detachFirebaseListeners();

            // التحقق إن كان التطبيق مهيأ مسبقاً
            const appName = 'SidiYaqoutApp';
            let app = null;
            const existingApps = firebase.apps || [];
            for (let i = 0; i < existingApps.length; i++) {
                if (existingApps[i].name === appName) {
                    app = existingApps[i];
                    break;
                }
            }

            if (!app) {
                app = firebase.initializeApp({
                    apiKey: config.apiKey,
                    authDomain: config.authDomain || `${config.projectId}.firebaseapp.com`,
                    projectId: config.projectId,
                    storageBucket: config.storageBucket || `${config.projectId}.appspot.com`,
                    appId: config.appId,
                    databaseURL: config.databaseURL || `https://${config.projectId}-default-rtdb.firebaseio.com`
                }, appName);
            }

            firebaseAppInstance = app;

            if (config.dbType === 'realtime') {
                realtimeDb = firebase.database(app);
                firestoreDb = null;
            } else {
                firestoreDb = firebase.firestore(app);
                realtimeDb = null;
            }

            isFirebaseConnected = true;
            updateFirebaseUIStatus(true, config.projectId);

            if (config.enableRealtimeSync && firebase.auth(app).currentUser) {
                setupFirebaseRealtimeListeners();
            }

            // مزامنة تلقائية فورية من السحابة عند بدء التشغيل على أي جهاز جديد
            autoSyncFromCloudOnStartup();

            if (isManual) {
                alert(`🎉 تم الاتصال بسحابة Firebase بنجاح!\nالمشروع: ${config.projectId}\nنوع القاعدة: ${config.dbType === 'realtime' ? 'Realtime Database' : 'Cloud Firestore'}\n\nيمكنك الآن رفع أو مزامنة بياناتك سحابياً.`);
            }
        } catch (err) {
            console.error('فشل في تهيئة Firebase:', err);
            isFirebaseConnected = false;
            updateFirebaseUIStatus(false, config.projectId, err.message);
            if (isManual) {
                alert(`❌ فشل الاتصال بسحابة Firebase:\n${err.message}\n\nيرجى مراجعة المفاتيح وقواعد الأمان (Rules) في Firebase Console.`);
            }
        }
    }

    // فحص الاتصال وقراءة/كتابة وثيقة اختبار
    async function testFirebaseConnection() {
        if (!isFirebaseConnected) {
            // محاولة التهيئة أولاً بالقيم المدخلة في النموذج
            const apiKey = (document.getElementById('fb-api-key')?.value || '').trim();
            const projectId = (document.getElementById('fb-project-id')?.value || '').trim();
            if (!apiKey || !projectId) {
                alert('الرجاء إدخال بيانات الاعتماد وحفظها أولاً قبل فحص الاتصال.');
                return;
            }
            handleSaveFirebaseSettings();
            return;
        }

        try {
            const testPayload = {
                testPing: true,
                timestamp: new Date().toISOString(),
                user: currentUser ? currentUser.username : 'admin',
                client: navigator.userAgent
            };

            if (firestoreDb) {
                await firestoreDb.collection('sidi_yaqout_erp').doc('_system_ping').set(testPayload, { merge: true });
            } else if (realtimeDb) {
                await realtimeDb.ref('sidi_yaqout_erp/_system_ping').set(testPayload);
            }

            const nowStr = new Date().toLocaleTimeString('ar-EG');
            updateLastSyncDisplay(nowStr);
            alert(`✅ تم فحص الاتصال بنجاح!\nسيرفرات Firebase تعمل بكفاءة تامة وتم إرسال إشارة الفحص في (${nowStr}).`);
        } catch (err) {
            console.error('خطأ أثناء فحص اتصال Firebase:', err);
            alert(`❌ فشل اختبار الاتصال بـ Firebase:\n${err.message}\n\nتأكد من فتح صلاحيات القراءة والكتابة (Test Mode Rules) في Firebase Console.`);
        }
    }

    // قطع الاتصال
    function disconnectFirebase() {
        if (!confirm('هل تريد بالتأكيد قطع الاتصال بسحابة Firebase والتحويل للوضع المحلي فقط؟')) {
            return;
        }
        detachFirebaseListeners();
        isFirebaseConnected = false;
        isRealtimeSyncActive = false;
        firestoreDb = null;
        realtimeDb = null;
        updateFirebaseUIStatus(false, currentFirebaseConfig ? currentFirebaseConfig.projectId : '');
        alert('تم قطع الاتصال بالسحابة والتحويل إلى الوضع المحلي (Offline Mode).');
    }

    // تحديث مؤشرات الواجهة لحالة Firebase
    function updateFirebaseUIStatus(connected, projectId = '', errorMsg = '') {
        const badge = document.getElementById('badge-firebase-status');
        const footerDot = document.getElementById('cloud-pulse-dot');
        const footerText = document.getElementById('cloud-status-text');
        const cardDot = document.getElementById('fb-card-dot');
        const cardText = document.getElementById('fb-card-status-text');
        const cardSub = document.getElementById('fb-card-status-sub');
        const projectVal = document.getElementById('fb-project-id-val');
        const realtimeVal = document.getElementById('fb-realtime-status-val');
        const realtimeSub = document.getElementById('fb-realtime-sub');

        if (connected) {
            if (badge) {
                badge.textContent = '🟢 سحابي';
                badge.style.background = 'rgba(16, 185, 129, 0.2)';
                badge.style.color = '#10b981';
                badge.style.borderColor = '#10b981';
            }
            if (footerDot) {
                footerDot.className = 'pulse-dot pulse-green';
            }
            if (footerText) {
                footerText.textContent = `سحابي: ${projectId || 'متصل'}`;
                footerText.style.color = '#10b981';
            }
            if (cardDot) cardDot.className = 'pulse-dot pulse-green';
            if (cardText) {
                cardText.textContent = 'متصل بنجاح بالسحابة 🟢';
                cardText.style.color = '#10b981';
            }
            if (cardSub) cardSub.textContent = 'البيانات متزامنة مع خوادم Google Firebase';
            if (projectVal) projectVal.textContent = projectId || '-';
            if (realtimeVal) {
                const rtActive = currentFirebaseConfig && currentFirebaseConfig.enableRealtimeSync;
                realtimeVal.textContent = rtActive ? 'نشطة ومتزامنة ⚡' : 'معطلة ⚪';
                realtimeVal.style.color = rtActive ? '#10b981' : '#94a3b8';
            }
            if (realtimeSub) {
                realtimeSub.textContent = 'أي تعديل محلي يُرسل تلقائياً للسحابة';
            }
        } else {
            if (badge) {
                badge.textContent = '⚪ محلي';
                badge.style.background = 'rgba(148, 163, 184, 0.15)';
                badge.style.color = '#94a3b8';
                badge.style.borderColor = '#334155';
            }
            if (footerDot) {
                footerDot.className = errorMsg ? 'pulse-dot pulse-red' : 'pulse-dot pulse-gray';
            }
            if (footerText) {
                footerText.textContent = errorMsg ? 'سحابي: خطأ اتصال' : 'السحابة: محلي (Offline)';
                footerText.style.color = errorMsg ? '#ef4444' : '#94a3b8';
            }
            if (cardDot) cardDot.className = errorMsg ? 'pulse-dot pulse-red' : 'pulse-dot pulse-gray';
            if (cardText) {
                cardText.textContent = errorMsg ? 'خطأ في الاتصال ❌' : 'غير مهيأ (وضع محلي) ⚪';
                cardText.style.color = errorMsg ? '#ef4444' : '#94a3b8';
            }
            if (cardSub) {
                cardSub.textContent = errorMsg ? errorMsg : 'المنظومة تعمل محلياً على هذا المتصفح';
            }
            if (projectVal) projectVal.textContent = projectId || '-';
            if (realtimeVal) {
                realtimeVal.textContent = 'متوقفة ⚪';
                realtimeVal.style.color = '#94a3b8';
            }
        }

        const storedLastSync = localStorage.getItem('erp_firebase_last_sync');
        if (storedLastSync) {
            updateLastSyncDisplay(storedLastSync);
        }
    }

    function updateLastSyncDisplay(timeStr) {
        const lastSyncVal = document.getElementById('fb-last-sync-val');
        const lastSyncSub = document.getElementById('fb-last-sync-sub');
        if (lastSyncVal) lastSyncVal.textContent = timeStr;
        if (lastSyncSub) lastSyncSub.textContent = 'تم حفظ آخر نسخة بنجاح';
        localStorage.setItem('erp_firebase_last_sync', timeStr);
    }

    // رفع كافة بيانات المنظومة الحالية إلى سحابة Firebase
    async function uploadAllDataToFirebase() {
        if (!isFirebaseConnected) {
            alert('المنظومة غير متصلة بـ Firebase حالياً! يرجى إدخال البيانات وحفظها أولاً.');
            return;
        }

        const btn = event?.target;
        const originalText = btn ? btn.innerHTML : '';
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '⏳ جاري الرفع للسحابة...';
        }

        try {
            isPerformingRemoteSync = true;
            if (!currentUser || currentUser.role !== 'admin') {
                throw new Error('رفع قاعدة البيانات بالكامل متاح لمدير النظام فقط.');
            }

            const fullPayload = {
                metadata: {
                    appName: 'منظومة عيادات سيدي ياقوت',
                    version: '2.5.0',
                    lastUploadedAt: new Date().toISOString(),
                    uploadedBy: currentUser ? currentUser.username : 'admin'
                },
                departments: departments || [],
                employees: employees || [],
                shifts: shifts || [],
                attendance: attendanceRecords || [],
                salaryAdjustments: salaryAdjustmentsDb || {},
                payrollDelivery: window.payrollDeliveryDb || {},
                payrollCycles: window.savedPayrollSummaryCycles || {},
                officialHolidays: (typeof officialHolidaysDb !== 'undefined' ? officialHolidaysDb : []),
                users: (usersDb || []).map(user => {
                    const safeUser = { ...user };
                    delete safeUser.pin;
                    delete safeUser.password;
                    delete safeUser.passwordHash;
                    return safeUser;
                }),
                notifications: (typeof notificationsDb !== 'undefined' ? notificationsDb : []),
                leavesPermissions: (typeof leavesPermissionsDb !== 'undefined' ? leavesPermissionsDb : [])
            };

            if (firestoreDb) {
                const batch = firestoreDb.batch();
                const baseRef = firestoreDb.collection('sidi_yaqout_erp');
                
                batch.set(baseRef.doc('metadata'), fullPayload.metadata);
                batch.set(baseRef.doc('departments'), { list: fullPayload.departments });
                batch.set(baseRef.doc('employees'), { list: fullPayload.employees });
                batch.set(baseRef.doc('shifts'), { list: fullPayload.shifts });
                batch.set(baseRef.doc('attendance'), { list: fullPayload.attendance });
                batch.set(baseRef.doc('salaryAdjustments'), { data: fullPayload.salaryAdjustments });
                batch.set(baseRef.doc('payrollDelivery'), { data: fullPayload.payrollDelivery });
                batch.set(baseRef.doc('payrollCycles'), { data: fullPayload.payrollCycles });
                batch.set(baseRef.doc('officialHolidays'), { list: fullPayload.officialHolidays });
                batch.set(baseRef.doc('users'), { list: fullPayload.users });
                batch.set(baseRef.doc('notifications'), { list: fullPayload.notifications });
                batch.set(baseRef.doc('leavesPermissions'), { list: fullPayload.leavesPermissions });

                await batch.commit();
            } else if (realtimeDb) {
                await realtimeDb.ref('sidi_yaqout_erp').set(fullPayload);
            }

            const nowFormatted = new Date().toLocaleString('ar-EG');
            updateLastSyncDisplay(nowFormatted);

            alert(`🎉 تم رفع كافة بيانات المنظومة إلى Firebase بنجاح!\n\n` +
                  `• عدد الموظفين: ${employees.length}\n` +
                  `• سجلات الحضور: ${attendanceRecords.length}\n` +
                  `• الأقسام: ${departments.length}\n` +
                  `• التسويات المالية: ${Object.keys(salaryAdjustmentsDb).length} سجل\n` +
                  `• كشوفات تسليم وصرف الرواتب: محفوظ ومزامن`);
        } catch (err) {
            console.error('خطأ أثناء رفع البيانات إلى Firebase:', err);
            alert(`❌ فشل رفع البيانات إلى السحابة:\n${err.message}`);
        } finally {
            isPerformingRemoteSync = false;
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = originalText;
            }
        }
    }

    // سحب كافة البيانات من سحابة Firebase إلى هذا المتصفح
    async function downloadAllDataFromFirebase() {
        if (!isFirebaseConnected) {
            alert('المنظومة غير متصلة بـ Firebase حالياً! يرجى إدخال البيانات وحفظها أولاً.');
            return;
        }

        if (!confirm('⚠️ تنبيه هام:\nهل أنت متأكد من رغبتك في سحب البيانات من السحابة؟\nسيتم تحديث السجلات المحلية بهذا الجهاز لتتطابق تماماً مع بيانات السحابة.')) {
            return;
        }

        const btn = event?.target;
        const originalText = btn ? btn.innerHTML : '';
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '⏳ جاري السحب من السحابة...';
        }

        try {
            isPerformingRemoteSync = true;
            let cloudData = null;

            if (firestoreDb) {
                const baseRef = firestoreDb.collection('sidi_yaqout_erp');
                const [empSnap, attSnap, deptSnap, shiftSnap, adjSnap, userSnap, delivSnap, cycSnap, holSnap, notifSnap, leavesSnap] = await Promise.all([
                    baseRef.doc('employees').get(),
                    baseRef.doc('attendance').get(),
                    baseRef.doc('departments').get(),
                    baseRef.doc('shifts').get(),
                    baseRef.doc('salaryAdjustments').get(),
                    currentUser && currentUser.role === 'admin'
                        ? baseRef.doc('users').get()
                        : Promise.resolve({ exists: false }),
                    baseRef.doc('payrollDelivery').get().catch(() => ({ exists: false })),
                    baseRef.doc('payrollCycles').get().catch(() => ({ exists: false })),
                    baseRef.doc('officialHolidays').get().catch(() => ({ exists: false })),
                    baseRef.doc('notifications').get().catch(() => ({ exists: false })),
                    baseRef.doc('leavesPermissions').get().catch(() => ({ exists: false }))
                ]);

                cloudData = {
                    employees: empSnap.exists ? (empSnap.data().list || []) : null,
                    attendance: attSnap.exists ? (attSnap.data().list || []) : null,
                    departments: deptSnap.exists ? (deptSnap.data().list || []) : null,
                    shifts: shiftSnap.exists ? (shiftSnap.data().list || []) : null,
                    salaryAdjustments: adjSnap.exists ? (adjSnap.data().data || {}) : null,
                    users: userSnap.exists ? (userSnap.data().list || []) : null,
                    payrollDelivery: delivSnap.exists ? (delivSnap.data().data || {}) : null,
                    payrollCycles: cycSnap.exists ? (cycSnap.data().data || {}) : null,
                    officialHolidays: holSnap.exists ? (holSnap.data().list || []) : null,
                    notifications: notifSnap.exists ? (notifSnap.data().list || []) : null,
                    leavesPermissions: leavesSnap.exists ? (leavesSnap.data().list || []) : null
                };
            } else if (realtimeDb) {
                const snapshot = await realtimeDb.ref('sidi_yaqout_erp').once('value');
                if (snapshot.exists()) {
                    cloudData = snapshot.val();
                }
            }

            if (!cloudData) {
                alert('لم يتم العثور على أي بيانات محفوظة مسبقاً في قاعدة بيانات Firebase لهذا المشروع.\nيمكنك استخدام زر "رفع البيانات للسحابة" لحفظ بياناتك أولاً.');
                return;
            }

            // تطبيق البيانات وتحديث المتغيرات العامة والتخزين المحلي
            applyDownloadedFirebaseData(cloudData);

            const nowFormatted = new Date().toLocaleString('ar-EG');
            updateLastSyncDisplay(nowFormatted);

            alert('✅ تم سحب البيانات من سحابة Firebase وتحديث جميع الشاشات بنجاح!');
        } catch (err) {
            console.error('خطأ أثناء سحب البيانات من Firebase:', err);
            alert(`❌ فشل سحب البيانات من السحابة:\n${err.message}`);
        } finally {
            isPerformingRemoteSync = false;
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = originalText;
            }
        }
    }

    // دمج وتطبيق البيانات السحابية في المنظومة
    function applyDownloadedFirebaseData(cloudData) {
        if (!cloudData) return;

        if (Array.isArray(cloudData.departments) && cloudData.departments.length > 0) {
            departments = cloudData.departments;
            localStorage.setItem('erp_departments', JSON.stringify(departments));
        }

        if (Array.isArray(cloudData.employees)) {
            employees = cloudData.employees;
            localStorage.setItem('erp_employees_db', JSON.stringify(employees));
            localStorage.setItem('erp_employees', JSON.stringify(employees));
        }

        if (Array.isArray(cloudData.shifts)) {
            shifts = cloudData.shifts;
            localStorage.setItem('erp_shifts', JSON.stringify(shifts));
        }

        if (Array.isArray(cloudData.attendance)) {
            attendanceRecords = cloudData.attendance;
            localStorage.setItem('erp_attendance_db', JSON.stringify(attendanceRecords));
            localStorage.setItem('erp_attendance', JSON.stringify(attendanceRecords));
        }

        if (cloudData.salaryAdjustments && typeof cloudData.salaryAdjustments === 'object') {
            salaryAdjustmentsDb = cloudData.salaryAdjustments;
            localStorage.setItem('erp_salary_adjustments_db', JSON.stringify(salaryAdjustmentsDb));
            localStorage.setItem('erp_salary_adjustments', JSON.stringify(salaryAdjustmentsDb));
        }

        if (cloudData.payrollDelivery && typeof cloudData.payrollDelivery === 'object') {
            window.payrollDeliveryDb = cloudData.payrollDelivery;
            localStorage.setItem('erp_payroll_delivery_db', JSON.stringify(window.payrollDeliveryDb));
        }

        if (cloudData.payrollCycles && typeof cloudData.payrollCycles === 'object') {
            window.savedPayrollSummaryCycles = cloudData.payrollCycles;
            localStorage.setItem('erp_saved_payroll_cycles_db', JSON.stringify(window.savedPayrollSummaryCycles));
        }

        if (Array.isArray(cloudData.officialHolidays)) {
            officialHolidaysDb = cloudData.officialHolidays;
            localStorage.setItem('erp_official_holidays_db', JSON.stringify(officialHolidaysDb));
        }

        if (Array.isArray(cloudData.users) && cloudData.users.length > 0) {
            usersDb = cloudData.users;
            localStorage.setItem('erp_users_db', JSON.stringify(usersDb));
        }

        if (Array.isArray(cloudData.notifications)) {
            if (typeof window.syncIncomingNotificationsFromRemote === 'function') {
                window.syncIncomingNotificationsFromRemote(cloudData.notifications, 'firebase-download');
            } else if (typeof notificationsDb !== 'undefined') {
                notificationsDb = cloudData.notifications;
                localStorage.setItem('erp_notifications_db', JSON.stringify(notificationsDb));
                if (typeof updateNotificationBellUI === 'function') updateNotificationBellUI();
            }
        }

        if (Array.isArray(cloudData.leavesPermissions)) {
            if (typeof leavesPermissionsDb !== 'undefined') {
                leavesPermissionsDb = cloudData.leavesPermissions;
                localStorage.setItem('erp_leaves_permissions_db', JSON.stringify(leavesPermissionsDb));
                if (typeof renderLeavesPermissionsScreen === 'function' && document.getElementById('screen-leaves-permissions')?.classList.contains('active')) {
                    renderLeavesPermissionsScreen();
                }
            }
        }

        // تحديث كافة القوائم والجداول في الواجهة
        updateAllDeptDropdownsAndFilters();
        populateAllEmployeeDropdowns();
        if (typeof refreshActiveScreenData === 'function') {
            refreshActiveScreenData();
        } else {
            renderEmployeesTable();
            onShiftDateChanged();
            renderWelcomeDashboard();
        }
    }

    // مزامنة صامتة تلقائية من السحابة عند تشغيل البرنامج على أي جهاز أو فلاشة أو هاتف جديد
    async function autoSyncFromCloudOnStartup() {
        if (!isFirebaseConnected) return;
        try {
            if (firestoreDb) {
                const baseRef = firestoreDb.collection('sidi_yaqout_erp');
                const [empSnap, attSnap, deptSnap, adjSnap, userSnap, delivSnap, cycSnap, holSnap, notifSnap, leavesSnap] = await Promise.all([
                    baseRef.doc('employees').get(),
                    baseRef.doc('attendance').get(),
                    baseRef.doc('departments').get(),
                    baseRef.doc('salaryAdjustments').get(),
                    baseRef.doc('users').get(),
                    baseRef.doc('payrollDelivery').get().catch(() => ({ exists: false })),
                    baseRef.doc('payrollCycles').get().catch(() => ({ exists: false })),
                    baseRef.doc('officialHolidays').get().catch(() => ({ exists: false })),
                    baseRef.doc('notifications').get().catch(() => ({ exists: false })),
                    baseRef.doc('leavesPermissions').get().catch(() => ({ exists: false }))
                ]);

                if (empSnap.exists && Array.isArray(empSnap.data().list) && empSnap.data().list.length > 0) {
                    employees = empSnap.data().list;
                    localStorage.setItem('erp_employees_db', JSON.stringify(employees));
                    localStorage.setItem('erp_employees', JSON.stringify(employees));
                }

                if (attSnap.exists && Array.isArray(attSnap.data().list)) {
                    attendanceRecords = attSnap.data().list;
                    localStorage.setItem('erp_attendance_db', JSON.stringify(attendanceRecords));
                    localStorage.setItem('erp_attendance', JSON.stringify(attendanceRecords));
                }

                if (adjSnap.exists && adjSnap.data().data) {
                    salaryAdjustmentsDb = adjSnap.data().data;
                    localStorage.setItem('erp_salary_adjustments_db', JSON.stringify(salaryAdjustmentsDb));
                    localStorage.setItem('erp_salary_adjustments', JSON.stringify(salaryAdjustmentsDb));
                }

                if (deptSnap.exists && Array.isArray(deptSnap.data().list) && deptSnap.data().list.length > 0) {
                    departments = deptSnap.data().list;
                    localStorage.setItem('erp_departments', JSON.stringify(departments));
                }

                if (userSnap.exists && Array.isArray(userSnap.data().list) && userSnap.data().list.length > 0) {
                    usersDb = userSnap.data().list;
                    localStorage.setItem('erp_users_db', JSON.stringify(usersDb));
                }

                if (delivSnap && delivSnap.exists && delivSnap.data().data) {
                    window.payrollDeliveryDb = delivSnap.data().data;
                    localStorage.setItem('erp_payroll_delivery_db', JSON.stringify(window.payrollDeliveryDb));
                }

                if (cycSnap && cycSnap.exists && cycSnap.data().data) {
                    window.savedPayrollSummaryCycles = cycSnap.data().data;
                    localStorage.setItem('erp_saved_payroll_cycles_db', JSON.stringify(window.savedPayrollSummaryCycles));
                }

                if (holSnap && holSnap.exists && Array.isArray(holSnap.data().list)) {
                    officialHolidaysDb = holSnap.data().list;
                    localStorage.setItem('erp_official_holidays_db', JSON.stringify(officialHolidaysDb));
                }

                if (notifSnap && notifSnap.exists && Array.isArray(notifSnap.data().list)) {
                    if (typeof window.syncIncomingNotificationsFromRemote === 'function') {
                        window.syncIncomingNotificationsFromRemote(notifSnap.data().list, 'firebase-startup');
                    } else if (typeof notificationsDb !== 'undefined') {
                        notificationsDb = notifSnap.data().list;
                        localStorage.setItem('erp_notifications_db', JSON.stringify(notificationsDb));
                        if (typeof updateNotificationBellUI === 'function') updateNotificationBellUI();
                    }
                }

                if (leavesSnap && leavesSnap.exists && Array.isArray(leavesSnap.data().list)) {
                    if (typeof leavesPermissionsDb !== 'undefined') {
                        leavesPermissionsDb = leavesSnap.data().list;
                        localStorage.setItem('erp_leaves_permissions_db', JSON.stringify(leavesPermissionsDb));
                    }
                }

                // تحديث كافة الشاشات والقوائم
                updateAllDeptDropdownsAndFilters();
                populateAllEmployeeDropdowns();
                if (typeof refreshActiveScreenData === 'function') {
                    refreshActiveScreenData();
                } else {
                    renderEmployeesTable();
                    onShiftDateChanged();
                    renderWelcomeDashboard();
                }
                
                const timeStr = new Date().toLocaleTimeString('ar-EG');
                updateLastSyncDisplay(timeStr);
                console.log('✅ اكتملت المزامنة التلقائية لبيانات السحابة عند بدء التشغيل.');
            }
        } catch (e) {
            console.warn('تخطي المزامنة الأولية التلقائية:', e);
        }
    }

    // إرسال مجموعة واحدة تلقائياً في الخلفية عند كل تعديل محلي (Background Auto-Push مع Debounce ذكي)
    const firebasePushDebounceTimers = {};

    function pushSingleCollectionToFirebase(collectionKey, data, immediate = false) {
        if (!isFirebaseConnected || isPerformingRemoteSync) return;
        if (!currentFirebaseConfig || !currentFirebaseConfig.enableRealtimeSync) return;

        if (firebasePushDebounceTimers[collectionKey]) {
            clearTimeout(firebasePushDebounceTimers[collectionKey]);
        }

        const executePush = async () => {
            try {
                if (collectionKey === 'users') {
                    data = (Array.isArray(data) ? data : []).map(user => {
                        const safeUser = { ...user };
                        delete safeUser.pin;
                        delete safeUser.password;
                        delete safeUser.passwordHash;
                        return safeUser;
                    });
                }
                if (firestoreDb) {
                    const baseRef = firestoreDb.collection('sidi_yaqout_erp');
                    if (['salaryAdjustments', 'payrollDelivery', 'payrollCycles'].includes(collectionKey)) {
                        await baseRef.doc(collectionKey).set({ data: data }, { merge: true });
                    } else {
                        await baseRef.doc(collectionKey).set({ list: data }, { merge: true });
                    }
                } else if (realtimeDb) {
                    await realtimeDb.ref(`sidi_yaqout_erp/${collectionKey}`).set(data);
                }
                const timeStr = new Date().toLocaleTimeString('ar-EG');
                updateLastSyncDisplay(timeStr);

                if (typeof showToast === 'function') {
                    showToast('☁️ تم الحفظ والمزامنة السحابية مع Firebase بنجاح', 'success');
                }
            } catch (e) {
                console.warn(`فشل إرسال التحديث التلقائي للمجموعة (${collectionKey}) إلى Firebase:`, e);
            }
        };

        if (immediate || collectionKey === 'employees' || collectionKey === 'attendance' || collectionKey === 'notifications' || collectionKey === 'leavesPermissions') {
            executePush();
        } else {
            firebasePushDebounceTimers[collectionKey] = setTimeout(executePush, 400);
        }
    }

    // مستمعي التحديث اللحظي بين المتصفحات المفتوحة (Live Real-time Snapshot Sync بين الموبايل والكمبيوتر)
    function setupFirebaseRealtimeListeners() {
        detachFirebaseListeners();

        if (firestoreDb) {
            const baseRef = firestoreDb.collection('sidi_yaqout_erp');

            // 1. مراقبة الموظفين
            const unsubEmp = baseRef.doc('employees').onSnapshot(doc => {
                if (isPerformingRemoteSync || !doc.exists) return;
                const d = doc.data();
                if (d && Array.isArray(d.list) && JSON.stringify(d.list) !== JSON.stringify(employees)) {
                    employees = d.list;
                    localStorage.setItem('erp_employees_db', JSON.stringify(employees));
                    localStorage.setItem('erp_employees', JSON.stringify(employees));
                    populateAllEmployeeDropdowns();
                    renderEmployeesTable();
                    if (typeof refreshActiveScreenData === 'function') refreshActiveScreenData();
                    if (typeof showToast === 'function') showToast('🔄 تم تحديث قائمة الموظفين لحظياً من السحابة', 'info');
                }
            }, err => console.warn('Firestore Emp Listener error:', err));
            activeFirebaseListeners.push(unsubEmp);

            // 2. مراقبة الحضور والانصراف
            const unsubAtt = baseRef.doc('attendance').onSnapshot(doc => {
                if (isPerformingRemoteSync || !doc.exists) return;
                const d = doc.data();
                if (d && Array.isArray(d.list) && JSON.stringify(d.list) !== JSON.stringify(attendanceRecords)) {
                    attendanceRecords = d.list;
                    localStorage.setItem('erp_attendance_db', JSON.stringify(attendanceRecords));
                    localStorage.setItem('erp_attendance', JSON.stringify(attendanceRecords));
                    if (typeof refreshActiveScreenData === 'function') refreshActiveScreenData();
                    if (typeof showToast === 'function') showToast('🔄 تم تحديث سجلات الحضور لحظياً من السحابة', 'info');
                }
            }, err => console.warn('Firestore Att Listener error:', err));
            activeFirebaseListeners.push(unsubAtt);

            // 3. مراقبة التسويات المالية (السلف والمكافآت والخصومات)
            const unsubAdj = baseRef.doc('salaryAdjustments').onSnapshot(doc => {
                if (isPerformingRemoteSync || !doc.exists) return;
                const d = doc.data();
                if (d && d.data && JSON.stringify(d.data) !== JSON.stringify(salaryAdjustmentsDb)) {
                    salaryAdjustmentsDb = d.data;
                    localStorage.setItem('erp_salary_adjustments_db', JSON.stringify(salaryAdjustmentsDb));
                    localStorage.setItem('erp_salary_adjustments', JSON.stringify(salaryAdjustmentsDb));
                    if (typeof refreshActiveScreenData === 'function') refreshActiveScreenData();
                    if (typeof showToast === 'function') showToast('🔄 تم تحديث تسويات الرواتب لحظياً من السحابة', 'info');
                }
            }, err => console.warn('Firestore Adj Listener error:', err));
            activeFirebaseListeners.push(unsubAdj);

            // 4. مراقبة كشوفات تسليم الرواتب
            const unsubDeliv = baseRef.doc('payrollDelivery').onSnapshot(doc => {
                if (isPerformingRemoteSync || !doc.exists) return;
                const d = doc.data();
                if (d && d.data && JSON.stringify(d.data) !== JSON.stringify(window.payrollDeliveryDb)) {
                    window.payrollDeliveryDb = d.data;
                    localStorage.setItem('erp_payroll_delivery_db', JSON.stringify(window.payrollDeliveryDb));
                    if (typeof refreshActiveScreenData === 'function') refreshActiveScreenData();
                }
            }, err => console.warn('Firestore Delivery Listener error:', err));
            activeFirebaseListeners.push(unsubDeliv);

            // 5. مراقبة دورات الرواتب المغلقة
            const unsubCyc = baseRef.doc('payrollCycles').onSnapshot(doc => {
                if (isPerformingRemoteSync || !doc.exists) return;
                const d = doc.data();
                if (d && d.data && JSON.stringify(d.data) !== JSON.stringify(window.savedPayrollSummaryCycles)) {
                    window.savedPayrollSummaryCycles = d.data;
                    localStorage.setItem('erp_saved_payroll_cycles_db', JSON.stringify(window.savedPayrollSummaryCycles));
                    if (typeof refreshActiveScreenData === 'function') refreshActiveScreenData();
                }
            }, err => console.warn('Firestore PayrollCycles Listener error:', err));
            activeFirebaseListeners.push(unsubCyc);

            // 6. مراقبة الأقسام
            const unsubDept = baseRef.doc('departments').onSnapshot(doc => {
                if (isPerformingRemoteSync || !doc.exists) return;
                const d = doc.data();
                if (d && Array.isArray(d.list) && JSON.stringify(d.list) !== JSON.stringify(departments)) {
                    departments = d.list;
                    localStorage.setItem('erp_departments', JSON.stringify(departments));
                    updateAllDeptDropdownsAndFilters();
                }
            }, err => console.warn('Firestore Dept Listener error:', err));
            activeFirebaseListeners.push(unsubDept);

            // 7. مراقبة الإجازات الرسمية
            const unsubHol = baseRef.doc('officialHolidays').onSnapshot(doc => {
                if (isPerformingRemoteSync || !doc.exists) return;
                const d = doc.data();
                if (d && Array.isArray(d.list) && JSON.stringify(d.list) !== JSON.stringify(officialHolidaysDb)) {
                    officialHolidaysDb = d.list;
                    localStorage.setItem('erp_official_holidays_db', JSON.stringify(officialHolidaysDb));
                    if (typeof refreshActiveScreenData === 'function') refreshActiveScreenData();
                }
            }, err => console.warn('Firestore Holidays Listener error:', err));
            activeFirebaseListeners.push(unsubHol);

            // 8. مراقبة المستخدمين والصلاحيات
            if (currentUser && currentUser.role === 'admin') {
                const unsubUsers = baseRef.doc('users').onSnapshot(doc => {
                    if (isPerformingRemoteSync || !doc.exists) return;
                    const d = doc.data();
                    if (d && Array.isArray(d.list) && JSON.stringify(d.list) !== JSON.stringify(usersDb)) {
                        usersDb = d.list;
                        localStorage.setItem('erp_users_db', JSON.stringify(usersDb));
                        if (typeof renderUsersTable === 'function' && document.getElementById('screen-users-roles')?.classList.contains('active')) {
                            renderUsersTable();
                        }
                    }
                }, err => console.warn('Firestore Users Listener error:', err));
                activeFirebaseListeners.push(unsubUsers);
            }

            // 9. مراقبة الإشعارات والتنبيهات المباشرة بين الديسكتوب والموبايل
            const unsubNotif = baseRef.doc('notifications').onSnapshot(doc => {
                if (isPerformingRemoteSync || !doc.exists) return;
                const d = doc.data();
                if (d && Array.isArray(d.list)) {
                    if (typeof window.syncIncomingNotificationsFromRemote === 'function') {
                        window.syncIncomingNotificationsFromRemote(d.list, 'firebase-snapshot');
                    } else if (typeof notificationsDb !== 'undefined') {
                        notificationsDb = d.list;
                        localStorage.setItem('erp_notifications_db', JSON.stringify(notificationsDb));
                        if (typeof updateNotificationBellUI === 'function') updateNotificationBellUI();
                    }
                }
            }, err => console.warn('Firestore Notifications Listener error:', err));
            activeFirebaseListeners.push(unsubNotif);

            // 10. مراقبة طلبات الإجازات والأذونات
            const unsubLeaves = baseRef.doc('leavesPermissions').onSnapshot(doc => {
                if (isPerformingRemoteSync || !doc.exists) return;
                const d = doc.data();
                if (d && Array.isArray(d.list) && typeof leavesPermissionsDb !== 'undefined') {
                    if (JSON.stringify(d.list) !== JSON.stringify(leavesPermissionsDb)) {
                        leavesPermissionsDb = d.list;
                        localStorage.setItem('erp_leaves_permissions_db', JSON.stringify(leavesPermissionsDb));
                        if (typeof renderLeavesPermissionsScreen === 'function' && document.getElementById('screen-leaves-permissions')?.classList.contains('active')) {
                            renderLeavesPermissionsScreen();
                        }
                    }
                }
            }, err => console.warn('Firestore Leaves Listener error:', err));
            activeFirebaseListeners.push(unsubLeaves);

            isRealtimeSyncActive = true;
        } else if (realtimeDb) {
            const empRef = realtimeDb.ref('sidi_yaqout_erp/employees');
            const onEmpChange = empRef.on('value', snapshot => {
                if (isPerformingRemoteSync || !snapshot.exists()) return;
                const val = snapshot.val();
                if (Array.isArray(val) && JSON.stringify(val) !== JSON.stringify(employees)) {
                    employees = val;
                    localStorage.setItem('erp_employees_db', JSON.stringify(employees));
                    localStorage.setItem('erp_employees', JSON.stringify(employees));
                    populateAllEmployeeDropdowns();
                    renderEmployeesTable();
                    if (typeof refreshActiveScreenData === 'function') refreshActiveScreenData();
                }
            });
            activeFirebaseListeners.push(() => empRef.off('value', onEmpChange));

            const notifRef = realtimeDb.ref('sidi_yaqout_erp/notifications');
            const onNotifChange = notifRef.on('value', snapshot => {
                if (isPerformingRemoteSync || !snapshot.exists()) return;
                const val = snapshot.val();
                if (Array.isArray(val) && typeof window.syncIncomingNotificationsFromRemote === 'function') {
                    window.syncIncomingNotificationsFromRemote(val, 'firebase-rt');
                }
            });
            activeFirebaseListeners.push(() => notifRef.off('value', onNotifChange));

            isRealtimeSyncActive = true;
        }
    }

    function detachFirebaseListeners() {
        if (activeFirebaseListeners && activeFirebaseListeners.length > 0) {
            activeFirebaseListeners.forEach(unsub => {
                try {
                    if (typeof unsub === 'function') unsub();
                } catch (e) {
                    console.warn('خطأ أثناء إيقاف مستمع Firebase:', e);
                }
            });
            activeFirebaseListeners = [];
        }
        isRealtimeSyncActive = false;
    }

    // عرض شاشة إعدادات الـ Firebase
    function renderFirebaseSettingsScreen() {
        if (currentFirebaseConfig) {
            populateFirebaseSettingsForm(currentFirebaseConfig);
        }
        updateFirebaseUIStatus(isFirebaseConnected, currentFirebaseConfig ? currentFirebaseConfig.projectId : '');
    }
