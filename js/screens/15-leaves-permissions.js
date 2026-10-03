// ====================================================================
// شاشة إدارة الإجازات والأذونات ودورة الاعتماد الإداري
// Leaves & Permissions Management and Approval Workflow
// منظومة عيادات سيدي ياقوت التخصصية
// ====================================================================

let leavesPermissionsDb = JSON.parse(localStorage.getItem('erp_leaves_permissions_db') || '[]');

(function() {
    let currentFilterType = 'all'; // 'all', 'leave', 'permission'
    let currentFilterStatus = 'all'; // 'all', 'pending', 'approved', 'rejected'

    // حفظ البيانات محلياً وسحابياً
    function saveLeavesPermissionsDb() {
        localStorage.setItem('erp_leaves_permissions_db', JSON.stringify(leavesPermissionsDb));
        if (typeof pushSingleCollectionToFirebase === 'function') {
            pushSingleCollectionToFirebase('leavesPermissions', leavesPermissionsDb);
        }
        renderLeavesPermissionsScreen();
    }

    // تهيئة الشاشة
    function renderLeavesPermissionsScreen() {
        const tableBody = document.getElementById('leaves-table-body');
        const emptyHint = document.getElementById('leaves-empty-hint');
        if (!tableBody) return;

        // ملء القوائم المنسدلة للموظفين والمديرين
        populateLeavesEmployeeDropdowns();
        updateLeavesKpiBadges();

        const searchEmp = (document.getElementById('leaves-filter-emp') ? document.getElementById('leaves-filter-emp').value : '').trim();
        const searchDept = (document.getElementById('leaves-filter-dept') ? document.getElementById('leaves-filter-dept').value : '').trim();
        const searchMonth = (document.getElementById('leaves-filter-month') ? document.getElementById('leaves-filter-month').value : '').trim();

        let filtered = leavesPermissionsDb.slice();

        // فلترة بالنوع
        if (currentFilterType !== 'all') {
            filtered = filtered.filter(item => item.itemType === currentFilterType);
        }

        // فلترة بالحالة
        if (currentFilterStatus !== 'all') {
            filtered = filtered.filter(item => item.status === currentFilterStatus);
        }

        // فلترة بالموظف
        if (searchEmp) {
            filtered = filtered.filter(item => String(item.empId) === String(searchEmp));
        }

        // فلترة بالقسم
        if (searchDept) {
            filtered = filtered.filter(item => item.dept === searchDept);
        }

        // فلترة بالشهر
        if (searchMonth) {
            filtered = filtered.filter(item => item.startDate && item.startDate.startsWith(searchMonth));
        }

        // الترتيب: الأحدث أولاً، والمعلق بالأعلى
        filtered.sort((a, b) => {
            if (a.status === 'pending' && b.status !== 'pending') return -1;
            if (b.status === 'pending' && a.status !== 'pending') return 1;
            return new Date(b.createdAt || b.startDate) - new Date(a.createdAt || a.startDate);
        });

        if (filtered.length === 0) {
            tableBody.innerHTML = '';
            if (emptyHint) emptyHint.style.display = 'block';
            return;
        }

        if (emptyHint) emptyHint.style.display = 'none';

        const user = window.currentUser || {};
        const isAdmin = (user.role === 'admin' || user.username === 'admin');
        const isManager = Boolean(user.isManager || isAdmin);

        let html = '';
        filtered.forEach((item, index) => {
            const isLeave = (item.itemType === 'leave');
            const typeBadge = isLeave ? 
                `<span class="badge" style="background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe; font-size:11px;">🏖️ إجازة (${item.leaveTypeTitle || item.leaveType})</span>` :
                `<span class="badge" style="background:#fef3c7; color:#b45309; border:1px solid #fde68a; font-size:11px;">⏱️ إذن (${item.permTypeTitle || item.permType})</span>`;

            let statusBadge = '';
            if (item.status === 'approved') {
                statusBadge = `<span class="badge" style="background:#dcfce7; color:#15803d; border:1px solid #86efac; font-weight:800; font-size:11px;">معتمد ومقبول ✅</span>`;
            } else if (item.status === 'rejected') {
                statusBadge = `<span class="badge" style="background:#fee2e2; color:#b91c1c; border:1px solid #fca5a5; font-weight:800; font-size:11px;">مرفوض ❌</span>`;
            } else {
                statusBadge = `<span class="badge" style="background:#fef9c3; color:#a16207; border:1px solid #fde047; font-weight:800; font-size:11px;">قيد الانتظار ⏳</span>`;
            }

            const durationText = isLeave ? 
                `<strong>${item.daysCount}</strong> يوم (من ${item.startDate} إلى ${item.endDate})` :
                `<strong>${item.hoursCount}</strong> س (${item.startDate} من ${item.startTime || '-'} إلى ${item.endTime || '-'})`;

            // هل يحق للمستخدم الحالي اتخاذ قرار الاعتماد؟
            // مدير النظام أو المدير المباشر لهذا الموظف
            const canApprove = isAdmin || (isManager && (String(item.managerEmpId) === String(user.empId) || item.managerName === user.fullName));

            let actionsHtml = '';
            if (item.status === 'pending' && canApprove) {
                actionsHtml = `
                    <div style="display:flex; gap:4px; justify-content:center;">
                        <button type="button" class="btn-success" style="padding:4px 8px; font-size:11px; min-height:30px;" onclick="approveLeavePermissionItem('${item.id}', true)" title="الموافقة والاعتماد">✔️ قبول</button>
                        <button type="button" class="btn-danger" style="padding:4px 8px; font-size:11px; min-height:30px;" onclick="openRejectModal('${item.id}')" title="رفض الطلب">✖️ رفض</button>
                    </div>
                `;
            } else if (item.status === 'approved') {
                actionsHtml = `
                    <div style="font-size:10px; color:#15803d;">
                        اعتمد: <strong>${item.approvedBy || 'المدير'}</strong>
                        <div style="color:#64748b;">${item.approvedAt ? item.approvedAt.split('T')[0] : ''}</div>
                    </div>
                `;
            } else if (item.status === 'rejected') {
                actionsHtml = `
                    <div style="font-size:10px; color:#b91c1c;">
                        رُفض: <strong>${item.rejectedBy || 'المدير'}</strong>
                        <div style="color:#475569;" title="${item.rejectionReason || ''}">${(item.rejectionReason || 'بدون سبب').slice(0, 16)}..</div>
                    </div>
                `;
            } else {
                actionsHtml = `<span style="font-size:11px; color:#94a3b8;">بانتظار المدير</span>`;
            }

            // زر الحذف لمدير النظام
            if (isAdmin) {
                actionsHtml += `
                    <button type="button" style="background:none; border:none; cursor:pointer; font-size:13px; margin-top:2px;" onclick="deleteLeavePermissionItem('${item.id}')" title="حذف السجل نهائياً">🗑️</button>
                `;
            }

            html += `
                <tr>
                    <td style="font-weight:bold; font-family:Consolas, monospace;">#${item.empCode || item.empId}</td>
                    <td style="font-weight:bold; color:#1e293b;">${item.empName}</td>
                    <td>${item.dept || '-'}</td>
                    <td>${typeBadge}</td>
                    <td style="font-size:12px;">${durationText}</td>
                    <td style="font-size:11.5px; color:#475569; max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${item.reason || ''}">${item.reason || '-'}</td>
                    <td style="font-size:11px; font-weight:bold; color:#102a45;">${item.managerName || 'مدير النظام'}</td>
                    <td>${statusBadge}</td>
                    <td>${actionsHtml}</td>
                </tr>
            `;
        });

        tableBody.innerHTML = html;
    }

    // تحديث كروت الإحصائيات العلوية
    function updateLeavesKpiBadges() {
        const totalEl = document.getElementById('kpi-leaves-total');
        const pendingEl = document.getElementById('kpi-leaves-pending');
        const approvedLeavesEl = document.getElementById('kpi-leaves-approved-days');
        const approvedPermsEl = document.getElementById('kpi-leaves-approved-perms');

        const total = leavesPermissionsDb.length;
        const pending = leavesPermissionsDb.filter(i => i.status === 'pending').length;
        const approvedLeaves = leavesPermissionsDb.filter(i => i.status === 'approved' && i.itemType === 'leave')
            .reduce((sum, i) => sum + (Number(i.daysCount) || 0), 0);
        const approvedPerms = leavesPermissionsDb.filter(i => i.status === 'approved' && i.itemType === 'permission')
            .reduce((sum, i) => sum + (Number(i.hoursCount) || 0), 0);

        if (totalEl) totalEl.textContent = total;
        if (pendingEl) pendingEl.textContent = pending;
        if (approvedLeavesEl) approvedLeavesEl.textContent = approvedLeaves + ' يوم';
        if (approvedPermsEl) approvedPermsEl.textContent = approvedPerms + ' ساعة';
    }

    // ملء قوائم الموظفين والأقسام
    function populateLeavesEmployeeDropdowns() {
        const allEmps = Array.isArray(window.employees) ? window.employees : [];
        const empSelects = [
            document.getElementById('new-leave-emp-select'),
            document.getElementById('new-perm-emp-select'),
            document.getElementById('leaves-filter-emp')
        ];

        empSelects.forEach(sel => {
            if (!sel) return;
            const curVal = sel.value;
            const isFilter = (sel.id === 'leaves-filter-emp');
            sel.innerHTML = isFilter ? '<option value="">جميع الموظفين</option>' : '<option value="">-- اختر الموظف --</option>';

            allEmps.forEach(e => {
                const opt = document.createElement('option');
                opt.value = e.id;
                opt.textContent = `${e.name} (${e.job || 'عام'}) - #${e.id}`;
                sel.appendChild(opt);
            });
            if (curVal) sel.value = curVal;
        });

        // قائمة الأقسام
        const deptFilter = document.getElementById('leaves-filter-dept');
        if (deptFilter && deptFilter.options.length <= 1) {
            const depts = new Set();
            allEmps.forEach(e => { if (e.job) depts.add(e.job.trim()); });
            deptFilter.innerHTML = '<option value="">جميع الأقسام</option>';
            Array.from(depts).sort().forEach(d => {
                const opt = document.createElement('option');
                opt.value = d;
                opt.textContent = d;
                deptFilter.appendChild(opt);
            });
        }
    }

    // عند تغيير الموظف في نموذج طلب الإجازة: حساب وإظهار رصيد الإجازات
    function onLeaveEmpSelected() {
        const empId = document.getElementById('new-leave-emp-select').value;
        const infoBox = document.getElementById('leave-emp-balance-info');
        if (!empId || !infoBox) {
            if (infoBox) infoBox.style.display = 'none';
            return;
        }

        const allEmps = Array.isArray(window.employees) ? window.employees : [];
        const emp = allEmps.find(e => String(e.id) === String(empId));
        if (!emp) return;

        const quota = Number(emp.annualLeaveQuota) || 21;
        const usedLeaves = leavesPermissionsDb.filter(i => String(i.empId) === String(empId) && i.itemType === 'leave' && i.status === 'approved' && i.leaveType !== 'unpaid')
            .reduce((sum, i) => sum + (Number(i.daysCount) || 0), 0);
        const remaining = Math.max(0, quota - usedLeaves);

        infoBox.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
                <span>👤 المدير المباشر: <strong>${emp.managerName || 'مدير النظام'}</strong></span>
                <span>📅 الرصيد السنوي: <strong>${quota}</strong> يوم | المستهلك: <strong style="color:#b91c1c;">${usedLeaves}</strong> | المتبقي: <strong style="color:#059669;">${remaining}</strong> يوم</span>
            </div>
        `;
        infoBox.style.display = 'block';
    }

    // فتح نافذة طلب إجازة
    function openNewLeaveModal() {
        const modal = document.getElementById('modal-new-leave');
        if (!modal) return;
        populateLeavesEmployeeDropdowns();
        
        // التعيين التلقائي إذا كان الموظف مسجل الدخول بنفسه
        const user = window.currentUser || {};
        if (user.empId) {
            const sel = document.getElementById('new-leave-emp-select');
            if (sel) {
                sel.value = user.empId;
                onLeaveEmpSelected();
            }
        }

        const today = new Date().toISOString().split('T')[0];
        const startInp = document.getElementById('new-leave-start-date');
        const endInp = document.getElementById('new-leave-end-date');
        if (startInp) startInp.value = today;
        if (endInp) endInp.value = today;
        calculateLeaveDays();

        modal.style.display = 'flex';
    }

    function closeNewLeaveModal() {
        const modal = document.getElementById('modal-new-leave');
        if (modal) modal.style.display = 'none';
    }

    // حساب عدد أيام الإجازة تلقائياً
    function calculateLeaveDays() {
        const start = document.getElementById('new-leave-start-date').value;
        const end = document.getElementById('new-leave-end-date').value;
        const daysInp = document.getElementById('new-leave-days-count');
        if (!start || !end || !daysInp) return;

        const d1 = new Date(start);
        const d2 = new Date(end);
        const diffTime = d2.getTime() - d1.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
        daysInp.value = Math.max(1, isNaN(diffDays) ? 1 : diffDays);
    }

    // حفظ طلب الإجازة
    function submitNewLeaveRequest(e) {
        if (e) e.preventDefault();
        const empId = document.getElementById('new-leave-emp-select').value;
        if (!empId) {
            alert('يرجى اختيار الموظف أولاً!');
            return;
        }

        const allEmps = Array.isArray(window.employees) ? window.employees : [];
        const emp = allEmps.find(e => String(e.id) === String(empId));
        if (!emp) return;

        const leaveType = document.getElementById('new-leave-type').value;
        const leaveTypeSelect = document.getElementById('new-leave-type');
        const leaveTypeTitle = leaveTypeSelect.options[leaveTypeSelect.selectedIndex].text;
        const startDate = document.getElementById('new-leave-start-date').value;
        const endDate = document.getElementById('new-leave-end-date').value;
        const daysCount = Number(document.getElementById('new-leave-days-count').value) || 1;
        const reason = document.getElementById('new-leave-reason').value.trim();

        const newItem = {
            id: 'leave_' + Date.now(),
            itemType: 'leave',
            empId: emp.id,
            empCode: emp.id,
            empName: emp.name,
            dept: emp.job || 'عام',
            managerEmpId: emp.managerId || null,
            managerName: emp.managerName || 'مدير النظام',
            leaveType: leaveType,
            leaveTypeTitle: leaveTypeTitle,
            startDate: startDate,
            endDate: endDate,
            daysCount: daysCount,
            reason: reason,
            status: 'pending', // 'pending', 'approved', 'rejected'
            submittedBy: (window.currentUser ? window.currentUser.fullName : emp.name),
            createdAt: new Date().toISOString(),
            approvedBy: null,
            approvedAt: null,
            rejectionReason: null
        };

        leavesPermissionsDb.unshift(newItem);
        saveLeavesPermissionsDb();
        closeNewLeaveModal();

        // إرسال إشعار فوري للمدير المباشر ومدير النظام
        if (typeof createNotification === 'function') {
            createNotification({
                type: 'leave_request',
                title: 'طلب إجازة جديد 🏖️',
                message: `قام الموظف (${emp.name}) بطلب إجازة ${leaveTypeTitle} لمدة ${daysCount} يوم من ${startDate} إلى ${endDate}.`,
                targetRole: 'manager',
                targetUsername: (emp.managerUsername || 'admin'),
                senderName: emp.name,
                relatedId: newItem.id,
                actionScreen: 'screen-leaves-permissions'
            });
        }

        alert('تم تقديم طلب الإجازة بنجاح! وتم إرسال إشعار للمدير للموافقة والاعتماد. 📨');
    }

    // فتح نافذة طلب إذن
    function openNewPermissionModal() {
        const modal = document.getElementById('modal-new-permission');
        if (!modal) return;
        populateLeavesEmployeeDropdowns();

        const user = window.currentUser || {};
        if (user.empId) {
            const sel = document.getElementById('new-perm-emp-select');
            if (sel) sel.value = user.empId;
        }

        const today = new Date().toISOString().split('T')[0];
        const dateInp = document.getElementById('new-perm-date');
        if (dateInp) dateInp.value = today;

        modal.style.display = 'flex';
    }

    function closeNewPermissionModal() {
        const modal = document.getElementById('modal-new-permission');
        if (modal) modal.style.display = 'none';
    }

    // حساب ساعات الإذن
    function calculatePermissionHours() {
        const timeFrom = document.getElementById('new-perm-from-time').value;
        const timeTo = document.getElementById('new-perm-to-time').value;
        const hoursInp = document.getElementById('new-perm-hours-count');
        if (!timeFrom || !timeTo || !hoursInp) return;

        const [h1, m1] = timeFrom.split(':').map(Number);
        const [h2, m2] = timeTo.split(':').map(Number);
        const mins = (h2 * 60 + m2) - (h1 * 60 + m1);
        if (mins > 0) {
            hoursInp.value = (mins / 60).toFixed(1);
        } else {
            hoursInp.value = '1';
        }
    }

    // حفظ طلب الإذن
    function submitNewPermissionRequest(e) {
        if (e) e.preventDefault();
        const empId = document.getElementById('new-perm-emp-select').value;
        if (!empId) {
            alert('يرجى اختيار الموظف أولاً!');
            return;
        }

        const allEmps = Array.isArray(window.employees) ? window.employees : [];
        const emp = allEmps.find(e => String(e.id) === String(empId));
        if (!emp) return;

        const permType = document.getElementById('new-perm-type').value;
        const permTypeSelect = document.getElementById('new-perm-type');
        const permTypeTitle = permTypeSelect.options[permTypeSelect.selectedIndex].text;
        const permDate = document.getElementById('new-perm-date').value;
        const timeFrom = document.getElementById('new-perm-from-time').value;
        const timeTo = document.getElementById('new-perm-to-time').value;
        const hoursCount = Number(document.getElementById('new-perm-hours-count').value) || 1;
        const reason = document.getElementById('new-perm-reason').value.trim();

        const newItem = {
            id: 'perm_' + Date.now(),
            itemType: 'permission',
            empId: emp.id,
            empCode: emp.id,
            empName: emp.name,
            dept: emp.job || 'عام',
            managerEmpId: emp.managerId || null,
            managerName: emp.managerName || 'مدير النظام',
            permType: permType,
            permTypeTitle: permTypeTitle,
            startDate: permDate,
            endDate: permDate,
            startTime: timeFrom,
            endTime: timeTo,
            hoursCount: hoursCount,
            daysCount: 0,
            reason: reason,
            status: 'pending',
            submittedBy: (window.currentUser ? window.currentUser.fullName : emp.name),
            createdAt: new Date().toISOString(),
            approvedBy: null,
            approvedAt: null,
            rejectionReason: null
        };

        leavesPermissionsDb.unshift(newItem);
        saveLeavesPermissionsDb();
        closeNewPermissionModal();

        // إشعار للمدير المباشر
        if (typeof createNotification === 'function') {
            createNotification({
                type: 'permission_request',
                title: 'طلب إذن جديد ⏱️',
                message: `قام الموظف (${emp.name}) بطلب إذن ${permTypeTitle} لمدة ${hoursCount} ساعة يوم ${permDate}.`,
                targetRole: 'manager',
                targetUsername: (emp.managerUsername || 'admin'),
                senderName: emp.name,
                relatedId: newItem.id,
                actionScreen: 'screen-leaves-permissions'
            });
        }

        alert('تم تقديم طلب الإذن بنجاح! وتم إرسال إشعار للمدير المباشر للموافقة. 📨');
    }

    // قبول واعتماد الطلب
    function approveLeavePermissionItem(itemId, isApproved) {
        const item = leavesPermissionsDb.find(i => i.id === itemId);
        if (!item) return;

        const user = window.currentUser || { fullName: 'المدير العام' };
        if (isApproved) {
            if (!confirm(`هل تؤكد اعتماد والموافقة على هذا الطلب للموظف (${item.empName})؟`)) return;

            item.status = 'approved';
            item.approvedBy = user.fullName || 'المدير المباشر';
            item.approvedAt = new Date().toISOString();

            saveLeavesPermissionsDb();

            // إرسال إشعار للموظف بنتيجة الموافقة
            if (typeof createNotification === 'function') {
                createNotification({
                    type: item.itemType === 'leave' ? 'leave_approved' : 'permission_approved',
                    title: 'تمت الموافقة على طلبك! ✅',
                    message: `تم اعتماد طلبك (${item.itemType === 'leave' ? item.leaveTypeTitle : item.permTypeTitle}) بنجاح من قِبل ${item.approvedBy}.`,
                    targetEmpId: item.empId,
                    targetUsername: item.empUsername,
                    senderName: item.approvedBy,
                    relatedId: item.id,
                    actionScreen: 'screen-leaves-permissions'
                });
            }

            alert(`🎉 تم اعتماد الطلب بنجاح! وتم إرسال إشعار للموظف (${item.empName}).`);
        }
    }

    // فتح نافذة الرفض مع كتابة السبب
    function openRejectModal(itemId) {
        const modal = document.getElementById('modal-reject-reason');
        if (!modal) return;
        document.getElementById('reject-item-id').value = itemId;
        document.getElementById('reject-reason-input').value = '';
        modal.style.display = 'flex';
    }

    function closeRejectModal() {
        const modal = document.getElementById('modal-reject-reason');
        if (modal) modal.style.display = 'none';
    }

    function submitRejectReason() {
        const itemId = document.getElementById('reject-item-id').value;
        const reason = document.getElementById('reject-reason-input').value.trim();
        const item = leavesPermissionsDb.find(i => i.id === itemId);
        if (!item) return;

        const user = window.currentUser || { fullName: 'المدير العام' };
        item.status = 'rejected';
        item.rejectedBy = user.fullName || 'المدير المباشر';
        item.rejectionReason = reason || 'اعتذار لظروف العمل';
        item.approvedAt = new Date().toISOString();

        saveLeavesPermissionsDb();
        closeRejectModal();

        // إرسال إشعار للموظف بالرفض
        if (typeof createNotification === 'function') {
            createNotification({
                type: item.itemType === 'leave' ? 'leave_rejected' : 'permission_rejected',
                title: 'تنبيه: تم رفض الطلب ❌',
                message: `نعتذر، تم رفض طلبك (${item.itemType === 'leave' ? item.leaveTypeTitle : item.permTypeTitle}) من قِبل ${item.rejectedBy}. السبب: ${item.rejectionReason}`,
                targetEmpId: item.empId,
                targetUsername: item.empUsername,
                senderName: item.rejectedBy,
                relatedId: item.id,
                actionScreen: 'screen-leaves-permissions'
            });
        }

        alert(`تم تسجيل رفض الطلب وتوثيق السبب وإشعار الموظف.`);
    }

    // حذف سجل
    function deleteLeavePermissionItem(itemId) {
        if (!confirm('هل أنت متأكد من حذف هذا السجل نهائياً من النظام؟')) return;
        leavesPermissionsDb = leavesPermissionsDb.filter(i => i.id !== itemId);
        saveLeavesPermissionsDb();
    }

    // تبديل فلاتر العرض
    function filterLeavesByType(type, btn) {
        currentFilterType = type;
        document.querySelectorAll('.btn-leave-type-tab').forEach(b => b.classList.remove('active'));
        if (btn) btn.classList.add('active');
        renderLeavesPermissionsScreen();
    }

    function filterLeavesByStatus(status, btn) {
        currentFilterStatus = status;
        document.querySelectorAll('.btn-leave-status-tab').forEach(b => b.classList.remove('active'));
        if (btn) btn.classList.add('active');
        renderLeavesPermissionsScreen();
    }

    // طباعة كشف الإجازات والأذونات الرسمي
    function printLeavesPermissionsSheet() {
        const printWindow = window.open('', '_blank');
        if (!printWindow) {
            alert('يرجى السماح بالنوافذ المنبثقة للطباعة!');
            return;
        }

        const tableContent = document.getElementById('leaves-table').outerHTML;
        const printHtml = `
            <!DOCTYPE html>
            <html lang="ar" dir="rtl">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <title>كشف الإجازات والأذونات الرسمية - عيادات سيدي ياقوت</title>
                <style>
                    body { font-family: Tahoma, Arial, sans-serif; direction: rtl; padding: 15px; color: #000; }
                    table { width: 100%; border-collapse: collapse; font-size: 11px; text-align: center; margin-top: 15px; }
                    th, td { border: 1px solid #000; padding: 6px 8px; }
                    th { background-color: #f1f5f9; font-weight: bold; }
                    .header-box { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #990012; padding-bottom: 8px; }
                </style>
            </head>
            <body>
                <div class="header-box">
                    <div>
                        <h2 style="margin:0; color:#102a45;">كشف الإجازات والأذونات والاعتمادات الرسمية</h2>
                        <div style="font-size:12px; color:#990012; font-weight:bold;">عيادات سيدي ياقوت التخصصية</div>
                    </div>
                    <div style="font-size:11px;">تاريخ الطباعة: ${new Date().toLocaleDateString('ar-EG')}</div>
                </div>
                ${tableContent}
            </body>
            </html>
        `;

        printWindow.document.write(printHtml + '<script>window.onload = function() { window.print(); };<\/script>');
        printWindow.document.close();
    }

    // تصدير PDF
    function exportLeavesPermissionsToPdf() {
        if (typeof downloadPrintHtmlAsPdf === 'function') {
            const tableContent = document.getElementById('leaves-table').outerHTML;
            const html = `
                <div style="direction:rtl; font-family:Tahoma, Arial, sans-serif; padding:10px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #990012; padding-bottom:8px; margin-bottom:12px;">
                        <h2 style="margin:0; font-size:16px; color:#102a45;">كشف الإجازات والأذونات - عيادات سيدي ياقوت التخصصية</h2>
                        <span style="font-size:11px;">${new Date().toLocaleDateString('ar-EG')}</span>
                    </div>
                    ${tableContent}
                </div>
            `;
            downloadPrintHtmlAsPdf(html, 'كشف_الإجازات_والأذونات_المعتمدة.pdf', 'landscape');
        } else {
            printLeavesPermissionsSheet();
        }
    }

    // تصدير Excel
    function exportLeavesPermissionsToExcel() {
        if (typeof exportTableToExcel === 'function') {
            exportTableToExcel('leaves-table', 'كشف_الإجازات_والأذونات');
        }
    }

    // تصدير الدوال للخارج
    window.renderLeavesPermissionsScreen = renderLeavesPermissionsScreen;
    window.openNewLeaveModal = openNewLeaveModal;
    window.closeNewLeaveModal = closeNewLeaveModal;
    window.calculateLeaveDays = calculateLeaveDays;
    window.onLeaveEmpSelected = onLeaveEmpSelected;
    window.submitNewLeaveRequest = submitNewLeaveRequest;
    window.openNewPermissionModal = openNewPermissionModal;
    window.closeNewPermissionModal = closeNewPermissionModal;
    window.calculatePermissionHours = calculatePermissionHours;
    window.submitNewPermissionRequest = submitNewPermissionRequest;
    window.approveLeavePermissionItem = approveLeavePermissionItem;
    window.openRejectModal = openRejectModal;
    window.closeRejectModal = closeRejectModal;
    window.submitRejectReason = submitRejectReason;
    window.deleteLeavePermissionItem = deleteLeavePermissionItem;
    window.filterLeavesByType = filterLeavesByType;
    window.filterLeavesByStatus = filterLeavesByStatus;
    window.printLeavesPermissionsSheet = printLeavesPermissionsSheet;
    window.exportLeavesPermissionsToPdf = exportLeavesPermissionsToPdf;
    window.exportLeavesPermissionsToExcel = exportLeavesPermissionsToExcel;
})();
