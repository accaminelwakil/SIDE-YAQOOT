(function() {
    let cameraStream = null;
    let pendingFaceChallenge = null;
    let clockInterval = null;

    function setStatus(elementId, message, isError) {
        const element = document.getElementById(elementId);
        if (!element) return;
        element.textContent = message;
        element.style.color = isError ? '#b91c1c' : '#0f766e';
    }

    async function readResponse(response) {
        const result = await response.json();
        if (!response.ok || !result.success) {
            throw new Error(result.message || 'تعذر إتمام العملية.');
        }
        return result;
    }

    function employeeList() {
        return Array.isArray(window.employees) ? window.employees : [];
    }

    function isAttendanceManager() {
        const user = window.currentUser || {};
        return user.role === 'admin' || user.role === 'manager' ||
            user.role === 'supervisor' || user.isManager === true;
    }

    function canManageFaceEmployee(employee) {
        const user = window.currentUser || {};
        if (user.role === 'admin') return true;
        if (!isAttendanceManager() || !user.empId || String(employee.id) === String(user.empId)) return false;
        const employeeManagerId = String(employee.managerId || '');
        const employeeManagerName = String(employee.managerName || '').trim();
        const userName = String(user.fullName || '').trim();
        return employeeManagerId === String(user.empId) ||
            Boolean(employeeManagerName && userName && employeeManagerName === userName);
    }

    function populateEmployeeSelect(selectId) {
        const select = document.getElementById(selectId);
        if (!select) return;
        const placeholder = select.options.length ? select.options[0].textContent : 'اختر الموظف';
        select.replaceChildren(new Option(placeholder, ''));
        employeeList()
            .filter(employee => employee && employee.id !== undefined && employee.id !== null)
            .filter(employee =>
                !['face-enroll-employee', 'manual-attendance-employee'].includes(selectId) ||
                canManageFaceEmployee(employee)
            )
            .sort((left, right) => String(left.name || '').localeCompare(String(right.name || ''), 'ar'))
            .forEach(employee => {
                const option = new Option(
                    `${employee.name || 'موظف'}${employee.code ? ` - ${employee.code}` : ''}`,
                    String(employee.id)
                );
                select.add(option);
            });
    }

    function updateClock() {
        const now = new Date();
        const clock = document.getElementById('face-punch-live-clock');
        const date = document.getElementById('face-punch-live-date');
        if (clock) clock.textContent = now.toLocaleTimeString('ar-EG', { hour12: false });
        if (date) {
            date.textContent = now.toLocaleDateString('ar-EG', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
        }
    }

    async function startCamera() {
        if (!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error('فتح الكاميرا يتطلب اتصال HTTPS أو سياقاً آمناً على هذا الهاتف.');
        }
        stopCamera();
        cameraStream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
                facingMode: 'user',
                width: { ideal: 640, max: 1280 },
                height: { ideal: 480, max: 960 }
            }
        });
        const video = document.getElementById('face-attendance-video');
        if (!video) {
            stopCamera();
            throw new Error('عنصر الكاميرا غير موجود في الشاشة.');
        }
        video.srcObject = cameraStream;
        await video.play();
    }

    function stopCamera() {
        if (cameraStream) {
            cameraStream.getTracks().forEach(track => track.stop());
            cameraStream = null;
        }
        const video = document.getElementById('face-attendance-video');
        if (video) video.srcObject = null;
    }

    function captureImage() {
        const video = document.getElementById('face-attendance-video');
        if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth) {
            throw new Error('الكاميرا لم تصبح جاهزة بعد. انتظر لحظة ثم أعد المحاولة.');
        }
        const scale = Math.min(1, 640 / video.videoWidth, 640 / video.videoHeight);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        const context = canvas.getContext('2d', { alpha: false });
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/jpeg', 0.86);
    }

    async function openSmartPunchModal() {
        const modal = document.getElementById('modal-smart-punch');
        if (!modal) return;
        modal.style.display = 'flex';
        pendingFaceChallenge = null;
        const confirmation = document.getElementById('face-punch-confirmation');
        if (confirmation) confirmation.style.display = 'none';
        const scanButton = document.getElementById('face-punch-scan-btn');
        if (scanButton) scanButton.disabled = false;
        updateClock();
        if (clockInterval) clearInterval(clockInterval);
        clockInterval = setInterval(updateClock, 1000);
        const canManageAttendance = isAttendanceManager();
        const managedEmployees = employeeList().filter(canManageFaceEmployee);
        populateEmployeeSelect('face-enroll-employee');
        populateEmployeeSelect('manual-attendance-employee');
        const adminEnrollment = document.getElementById('face-enrollment-admin');
        if (adminEnrollment) {
            adminEnrollment.style.display =
                canManageAttendance && managedEmployees.length ? 'block' : 'none';
        }
        const manualButton = document.getElementById('manual-attendance-open-btn');
        if (manualButton) {
            manualButton.style.display =
                canManageAttendance && managedEmployees.length ? 'flex' : 'none';
        }
        setStatus('face-punch-status', 'اسمح للمتصفح باستخدام الكاميرا، ثم قف بمفردك أمامها.', false);
        try {
            await startCamera();
        } catch (error) {
            setStatus('face-punch-status', error.message, true);
        }
    }

    function closeSmartPunchModal() {
        const modal = document.getElementById('modal-smart-punch');
        if (modal) modal.style.display = 'none';
        pendingFaceChallenge = null;
        stopCamera();
        if (clockInterval) {
            clearInterval(clockInterval);
            clockInterval = null;
        }
    }

    async function submitSmartAttendancePunch() {
        const button = document.getElementById('face-punch-scan-btn');
        if (button) button.disabled = true;
        setStatus('face-punch-status', 'جارٍ فحص الوجه على الخادم؛ لن تُحفظ الصورة.', false);
        try {
            const image = captureImage();
            const response = await window.authenticatedFetch('/api/attendance/face/match', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image })
            });
            const result = await readResponse(response);
            pendingFaceChallenge = result.challenge;
            const name = document.getElementById('face-punch-confirm-name');
            const type = document.getElementById('face-punch-confirm-type');
            if (name) name.textContent = result.empName;
            if (type) type.textContent = result.typeTitle;
            const confirmation = document.getElementById('face-punch-confirmation');
            if (confirmation) confirmation.style.display = 'block';
            setStatus('face-punch-status', 'تم التعرف. راجع الاسم ونوع الحركة ثم أكّد التسجيل.', false);
            stopCamera();
        } catch (error) {
            pendingFaceChallenge = null;
            setStatus('face-punch-status', error.message, true);
        } finally {
            if (button) button.disabled = false;
        }
    }

    async function confirmFaceAttendancePunch() {
        if (!pendingFaceChallenge) {
            setStatus('face-punch-status', 'انتهت صلاحية المطابقة. أعد مسح الوجه.', true);
            return;
        }
        const challenge = pendingFaceChallenge;
        pendingFaceChallenge = null;
        const button = document.getElementById('face-punch-confirm-btn');
        if (button) button.disabled = true;
        try {
            const response = await window.authenticatedFetch('/api/attendance/face/punch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ challenge })
            });
            const result = await readResponse(response);
            const confirmation = document.getElementById('face-punch-confirmation');
            if (confirmation) confirmation.style.display = 'none';
            setStatus('face-punch-status', result.message, false);
            recordPunchInDailyAttendance(result.punch);
        } catch (error) {
            setStatus('face-punch-status', error.message, true);
        } finally {
            if (button) button.disabled = false;
        }
    }

    function retryFaceAttendance() {
        pendingFaceChallenge = null;
        const confirmation = document.getElementById('face-punch-confirmation');
        if (confirmation) confirmation.style.display = 'none';
        setStatus('face-punch-status', 'وجّه الكاميرا إلى وجه موظف واحد فقط ثم ابدأ المسح.', false);
        startCamera().catch(error => setStatus('face-punch-status', error.message, true));
    }

    function openManualAttendanceModal() {
        if (!isAttendanceManager()) {
            setStatus('face-punch-status', 'التسجيل اليدوي متاح للأدمن أو المدير المباشر فقط.', true);
            return;
        }
        const modal = document.getElementById('modal-attendance-manual');
        if (!modal) return;
        populateEmployeeSelect('manual-attendance-employee');
        setStatus('manual-attendance-status', '', false);
        modal.style.display = 'flex';
    }

    function closeManualAttendanceModal() {
        const modal = document.getElementById('modal-attendance-manual');
        if (modal) modal.style.display = 'none';
    }

    async function submitManualAttendance() {
        const empId = document.getElementById('manual-attendance-employee')?.value || '';
        const type = document.getElementById('manual-attendance-type')?.value || '';
        const reason = document.getElementById('manual-attendance-reason')?.value.trim() || '';
        const password = document.getElementById('manual-attendance-password')?.value || '';
        const button = document.getElementById('manual-attendance-submit');
        if (!password) {
            setStatus('manual-attendance-status', 'أدخل كلمة مرور حسابك لتأكيد التسجيل اليدوي.', true);
            return;
        }
        if (button) button.disabled = true;
        try {
            const response = await window.authenticatedFetch('/api/attendance/manual', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ empId, type, reason, password })
            });
            const result = await readResponse(response);
            setStatus('manual-attendance-status', result.message, false);
            recordPunchInDailyAttendance(result.punch);
            document.getElementById('manual-attendance-reason').value = '';
        } catch (error) {
            setStatus('manual-attendance-status', error.message, true);
        } finally {
            document.getElementById('manual-attendance-password').value = '';
            if (button) button.disabled = false;
        }
    }

    async function submitFaceEnrollment() {
        if (!document.getElementById('face-enrollment-consent')?.checked) {
            setStatus('face-enrollment-status', 'أكد أن الموظف أُبلغ ووافق على تسجيل بيانات وجهه.', true);
            return;
        }
        const empId = document.getElementById('face-enroll-employee')?.value || '';
        if (!empId) {
            setStatus('face-enrollment-status', 'اختر الموظف أولاً.', true);
            return;
        }
        const button = document.getElementById('face-enrollment-submit');
        if (button) button.disabled = true;
        try {
            setStatus('face-enrollment-status', 'جارٍ إنشاء قالب مشفّر؛ لن تُحفظ صورة التسجيل.', false);
            const image = captureImage();
            const response = await window.authenticatedFetch('/api/attendance/face/enrollments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ empId, image, consentConfirmed: true })
            });
            const result = await readResponse(response);
            setStatus('face-enrollment-status', `تم تسجيل وجه ${result.enrollment.empName} بنجاح.`, false);
            document.getElementById('face-enrollment-consent').checked = false;
        } catch (error) {
            setStatus('face-enrollment-status', error.message, true);
        } finally {
            if (button) button.disabled = false;
        }
    }

    function recordPunchInDailyAttendance(punch) {
        if (!punch || typeof currentDailyAttendance === 'undefined' || !Array.isArray(currentDailyAttendance)) return;
        const selectedDate = document.getElementById('att-shift-date')?.value;
        if (selectedDate && selectedDate !== punch.date) return;
        let row = currentDailyAttendance.find(item => String(item.empId) === String(punch.empId));
        if (!row) {
            row = {
                empId: punch.empId,
                empName: punch.empName,
                timeIn: '',
                timeOut: '',
                totalHours: 0,
                regularHours: 0,
                extraHours: 0
            };
            currentDailyAttendance.push(row);
        }
        if (punch.type === 'in') row.timeIn = punch.time;
        if (punch.type === 'out') row.timeOut = punch.time;
        if (typeof calculateRowHours === 'function') calculateRowHours(row);
        localStorage.setItem(`erp_daily_draft_${punch.date}`, JSON.stringify(currentDailyAttendance));
        if (typeof renderDailyAttendanceTable === 'function') renderDailyAttendanceTable();
    }

    async function openPunchesLogModal() {
        const modal = document.getElementById('modal-punches-log');
        const tbody = document.getElementById('punches-log-tbody');
        if (!modal || !tbody) return;
        modal.style.display = 'flex';
        tbody.replaceChildren();
        const loading = document.createElement('tr');
        loading.innerHTML = '<td colspan="6" style="padding:20px;">جارٍ تحميل سجل الحركات...</td>';
        tbody.appendChild(loading);
        try {
            const response = await window.authenticatedFetch('/api/attendance/punches');
            const result = await readResponse(response);
            const punches = result.punches || [];
            tbody.replaceChildren();
            punches.forEach((punch, index) => {
                const row = document.createElement('tr');
                const values = [
                    String(index + 1),
                    punch.empName || punch.empId || '-',
                    punch.type === 'in' ? 'حضور' : 'انصراف',
                    `${punch.date || '-'} ${punch.time || ''}`,
                    punch.source === 'manual_override' ? 'تسجيل يدوي معتمد' :
                        punch.source === 'face_recognition' ? 'تعرف على الوجه' : 'سجل سابق (GPS)',
                    punch.recordedByName || '-'
                ];
                values.forEach(value => {
                    const cell = document.createElement('td');
                    cell.textContent = value;
                    cell.style.padding = '8px';
                    row.appendChild(cell);
                });
                tbody.appendChild(row);
            });
            if (!punches.length) {
                const emptyRow = document.createElement('tr');
                emptyRow.innerHTML = '<td colspan="6" style="padding:20px;">لا توجد حركات مسجلة.</td>';
                tbody.appendChild(emptyRow);
            }
            const count = document.getElementById('punches-log-count-badge');
            if (count) count.textContent = String(punches.length);
        } catch (error) {
            tbody.replaceChildren();
            const errorRow = document.createElement('tr');
            const errorCell = document.createElement('td');
            errorCell.colSpan = 6;
            errorCell.textContent = error.message;
            errorCell.style.padding = '20px';
            errorRow.appendChild(errorCell);
            tbody.appendChild(errorRow);
        }
    }

    function closePunchesLogModal() {
        const modal = document.getElementById('modal-punches-log');
        if (modal) modal.style.display = 'none';
    }

    window.openSmartPunchModal = openSmartPunchModal;
    window.closeSmartPunchModal = closeSmartPunchModal;
    window.submitSmartAttendancePunch = submitSmartAttendancePunch;
    window.confirmFaceAttendancePunch = confirmFaceAttendancePunch;
    window.retryFaceAttendance = retryFaceAttendance;
    window.openManualAttendanceModal = openManualAttendanceModal;
    window.closeManualAttendanceModal = closeManualAttendanceModal;
    window.submitManualAttendance = submitManualAttendance;
    window.submitFaceEnrollment = submitFaceEnrollment;
    window.openPunchesLogModal = openPunchesLogModal;
    window.closePunchesLogModal = closePunchesLogModal;
})();
