// ====================================================================
// شاشة إدارة الإجازات والأذونات ودورة الاعتماد الإداري
// Leaves & Permissions Management and Approval Workflow
// منظومة عيادات سيدي ياقوت التخصصية
// ====================================================================

let leavesPermissionsDb = [];
let leavesManagedEmployees = [];

(function() {
    let currentFilterType = 'all'; // 'all', 'leave', 'permission'
    let currentFilterStatus = 'all'; // 'all', 'pending', 'approved', 'rejected'
    let loadedLeavesUsername = '';
    let loadingLeavesRequest = null;
    let failedLeavesUsername = '';
    let salaryAdvances = [];
    let loadedAdvancesUsername = '';
    let loadingAdvancesRequest = null;

    async function leavesApiRequest(url, method = 'GET', body = null) {
        if (typeof window.authenticatedFetch !== 'function') {
            throw new Error('خدمة الاتصال الآمن غير جاهزة. أعد تحميل التطبيق بعد تسجيل الدخول.');
        }
        const options = { method, headers: { 'Content-Type': 'application/json' } };
        if (body !== null) options.body = JSON.stringify(body);
        const response = await window.authenticatedFetch(url, options);
        const result = await response.json();
        if (!response.ok || !result.success) {
            throw new Error(result.message || 'تعذر إتمام العملية.');
        }
        return result;
    }

    function escapeAdvanceHtml(value) {
        return String(value == null ? '' : value).replace(/[&<>"']/g, character => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        })[character]);
    }

    function formatAdvanceMoney(value) {
        return `${(Number(value) || 0).toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`;
    }

    async function loadSalaryAdvances(force = false) {
        const user = window.currentUser || {};
        const username = String(user.username || '');
        const list = document.getElementById('salary-advances-list');
        if (!list || !username) return;
        if (!force && loadedAdvancesUsername === username) {
            renderSalaryAdvances();
            return;
        }
        if (loadingAdvancesRequest) return loadingAdvancesRequest;

        list.textContent = 'جارٍ تحميل طلبات السلف...';
        loadingAdvancesRequest = leavesApiRequest('/api/advances').then(result => {
            if (!Array.isArray(result.items)) {
                throw new Error('استجابة طلبات السلف من الخادم غير صالحة.');
            }
            salaryAdvances = result.items;
            loadedAdvancesUsername = username;
            renderSalaryAdvances();
        }).catch(error => {
            list.textContent = error.message;
            if (typeof showToast === 'function') showToast(error.message, 'error');
            throw error;
        }).finally(() => {
            loadingAdvancesRequest = null;
        });
        return loadingAdvancesRequest;
    }

    function renderSalaryAdvances() {
        const list = document.getElementById('salary-advances-list');
        if (!list) return;
        const user = window.currentUser || {};
        const isAdmin = user.role === 'admin' || user.username === 'admin';
        const userEmpId = String(user.empId || '');
        if (!salaryAdvances.length) {
            list.textContent = 'لا توجد طلبات سلف مسجلة.';
            return;
        }
        list.innerHTML = salaryAdvances.map(advance => {
            const statusLabels = { pending: 'قيد موافقة المدير', approved: 'موافق عليها', rejected: 'مرفوضة' };
            const status = statusLabels[advance.status] || 'حالة غير معروفة';
            const schedule = Array.isArray(advance.schedule) ? advance.schedule : [];
            const scheduleText = schedule.map(item =>
                `${escapeAdvanceHtml(item.startDate)} إلى ${escapeAdvanceHtml(item.endDate)}: ${formatAdvanceMoney(item.amount)}`
            ).join('، ');
            const canReview = isAdmin || (isUserManager(user) && (
                userEmpId && (
                    String(advance.managerId || '') === userEmpId ||
                    (advance.managerName && advance.managerName === user.fullName)
                )
            ));
            const actions = advance.status === 'pending' && canReview
                ? `<button type="button" class="btn-success" onclick="decideSalaryAdvance('${escapeAdvanceHtml(advance.id)}','approve')">موافقة</button>
                   <button type="button" class="btn-danger" onclick="decideSalaryAdvance('${escapeAdvanceHtml(advance.id)}','reject')">رفض</button>`
                : '';
            const managerInfo = advance.status === 'pending'
                ? `المدير المسؤول: ${escapeAdvanceHtml(advance.managerName || 'مدير النظام')}`
                : `قرار بواسطة: ${escapeAdvanceHtml(advance.approvedBy || advance.rejectedBy || '—')}`;
            return `<article style="padding:10px; border:1px solid #e2e8f0; border-radius:9px; background:#f8fafc;">
                <div><strong>${escapeAdvanceHtml(advance.empName || 'الموظف')} — ${formatAdvanceMoney(advance.amount)}</strong> | ${status}</div>
                <div>${escapeAdvanceHtml(advance.reason || '')}</div>
                <div>التقسيط: ${Number(advance.installmentCount) || 0} شهر | ${managerInfo}</div>
                ${scheduleText ? `<div>جدول الأقساط: ${scheduleText}</div>` : ''}
                <div style="display:flex; gap:6px; margin-top:7px;">${actions}</div>
            </article>`;
        }).join('');
    }

    function openSalaryAdvanceModal() {
        const modal = document.getElementById('salary-advance-modal');
        if (modal) modal.style.display = 'flex';
    }

    function closeSalaryAdvanceModal() {
        const modal = document.getElementById('salary-advance-modal');
        if (modal) modal.style.display = 'none';
    }

    async function submitSalaryAdvance(event) {
        event.preventDefault();
        const form = event.currentTarget;
        const submitButton = form.querySelector('[type="submit"]');
        if (submitButton) submitButton.disabled = true;
        try {
            const result = await leavesApiRequest('/api/advances', 'POST', {
                amount: Number(form.elements.amount.value),
                installmentCount: Number(form.elements.installmentCount.value),
                reason: form.elements.reason.value.trim()
            });
            if (typeof createNotification === 'function') {
                createNotification({
                    type: 'advance_request',
                    title: 'طلب سلفة جديد 💰',
                    message: `طلب الموظف (${result.item.empName}) سلفة بمبلغ ${formatAdvanceMoney(result.item.amount)} تتطلب موافقتك.`,
                    targetRole: 'manager',
                    targetUsername: result.item.managerUsername || 'admin',
                    senderName: result.item.empName,
                    relatedId: result.item.id,
                    actionScreen: 'screen-leaves-permissions'
                });
            }
            form.reset();
            closeSalaryAdvanceModal();
            await loadSalaryAdvances(true);
            if (typeof showToast === 'function') showToast('تم إرسال طلب السلفة إلى المدير المسؤول للموافقة.', 'success');
        } catch (error) {
            if (typeof showToast === 'function') showToast(error.message, 'error');
        } finally {
            if (submitButton) submitButton.disabled = false;
        }
    }

    async function decideSalaryAdvance(advanceId, decision) {
        try {
            const advance = salaryAdvances.find(item => item.id === advanceId);
            const result = await leavesApiRequest(`/api/advances/${encodeURIComponent(advanceId)}/decision`, 'POST', { decision });
            await loadSalaryAdvances(true);
            if (typeof createNotification === 'function' && advance) {
                createNotification({
                    type: decision === 'approve' ? 'advance_approved' : 'advance_rejected',
                    title: decision === 'approve' ? 'تمت الموافقة على السلفة ✅' : 'تم رفض طلب السلفة',
                    message: decision === 'approve'
                        ? `تمت الموافقة على سلفتك. جدول الأقساط يبدأ في دورة الرواتب التالية.`
                        : `تم رفض طلب السلفة المقدم بمبلغ ${formatAdvanceMoney(advance.amount)}.`,
                    targetEmpId: advance.empId,
                    targetUsername: advance.empUsername,
                    senderName: result.item.approvedBy || result.item.rejectedBy,
                    relatedId: advance.id,
                    actionScreen: 'screen-leaves-permissions'
                });
            }
            if (typeof showToast === 'function') showToast('تم تحديث حالة طلب السلفة.', 'success');
        } catch (error) {
            if (typeof showToast === 'function') showToast(error.message, 'error');
        }
    }

    window.openSalaryAdvanceModal = openSalaryAdvanceModal;
    window.closeSalaryAdvanceModal = closeSalaryAdvanceModal;
    window.submitSalaryAdvance = submitSalaryAdvance;
    window.decideSalaryAdvance = decideSalaryAdvance;

    async function loadLeavesPermissionsFromServer(force = false) {
        const username = String((window.currentUser && window.currentUser.username) || '');
        if (!username) return;
        if (!force && loadedLeavesUsername === username) return;
        if (!force && failedLeavesUsername === username) return;
        if (loadingLeavesRequest) return loadingLeavesRequest;

        if (loadedLeavesUsername && loadedLeavesUsername !== username) {
            leavesPermissionsDb = [];
            leavesManagedEmployees = [];
        }

        failedLeavesUsername = '';
        loadingLeavesRequest = leavesApiRequest('/api/leaves-permissions').then(result => {
            if (!Array.isArray(result.items) || !Array.isArray(result.employees)) {
                throw new Error('استجابة بيانات الإجازات من الخادم غير صالحة.');
            }
            leavesPermissionsDb = result.items;
            leavesManagedEmployees = result.employees;
            loadedLeavesUsername = username;
            failedLeavesUsername = '';
            if (document.getElementById('screen-leaves-permissions')?.classList.contains('active')) {
                renderLeavesPermissionsScreen();
            }
        }).catch(error => {
            failedLeavesUsername = username;
            if (typeof showToast === 'function') showToast(error.message, 'error');
            throw error;
        }).finally(() => {
            loadingLeavesRequest = null;
        });
        return loadingLeavesRequest;
    }
    window.loadLeavesPermissionsFromServer = loadLeavesPermissionsFromServer;

    // ── دوال التحقق من دور المستخدم وإدارته للموظفين ──────────────────
    function isUserManager(user) {
        if (!user) return false;
        if (user.role === 'admin' || user.username === 'admin') return true;
        if (user.isManager === true || user.role === 'manager' || user.role === 'supervisor') return true;
        const allEmps = leavesManagedEmployees;
        const uEmpId = user.empId ? String(user.empId) : null;
        if (uEmpId) {
            const hasSubordinates = allEmps.some(e => String(e.managerId) === uEmpId || (e.managerName && e.managerName === user.fullName));
            if (hasSubordinates) return true;
        }
        return false;
    }

    function getUserDepartment(user) {
        if (!user) return null;
        const allEmps = leavesManagedEmployees;
        if (user.empId) {
            const found = allEmps.find(e => String(e.id) === String(user.empId));
            if (found && found.job) return found.job.trim();
        }
        return null;
    }

    function getEmployeesManagedByUser(user) {
        const allEmps = leavesManagedEmployees;
        if (!user) return [];
        if (user.role === 'admin' || user.username === 'admin') return allEmps;

        const uEmpId = user.empId ? String(user.empId) : null;
        const uDept = getUserDepartment(user);
        const isMgr = isUserManager(user);

        if (isMgr) {
            return allEmps.filter(e => {
                const isSelf = uEmpId && String(e.id) === uEmpId;
                const isSub = (uEmpId && String(e.managerId) === uEmpId) ||
                              (e.managerName && e.managerName === user.fullName) ||
                              (uDept && e.job && e.job.trim() === uDept);
                return isSelf || isSub;
            });
        } else {
            // مستخدم عادي / موظف: يقدم لنفسه فقط
            return allEmps.filter(e => uEmpId && String(e.id) === uEmpId);
        }
    }

    // تهيئة الشاشة
    function renderLeavesPermissionsScreen() {
        const tableBody = document.getElementById('leaves-table-body');
        const emptyHint = document.getElementById('leaves-empty-hint');
        if (!tableBody) return;
        const username = String((window.currentUser && window.currentUser.username) || '');
        if (username && loadedLeavesUsername !== username && !loadingLeavesRequest && failedLeavesUsername !== username) {
            loadLeavesPermissionsFromServer().catch(error => console.error('Failed to load leave requests:', error));
        }

        // ملء القوائم المنسدلة للموظفين والمديرين
        populateLeavesEmployeeDropdowns();
        updateLeavesKpiBadges();

        const searchEmp = (document.getElementById('leaves-filter-emp') ? document.getElementById('leaves-filter-emp').value : '').trim();
        const searchDept = (document.getElementById('leaves-filter-dept') ? document.getElementById('leaves-filter-dept').value : '').trim();
        const searchMonth = (document.getElementById('leaves-filter-month') ? document.getElementById('leaves-filter-month').value : '').trim();

        const user = window.currentUser || {};
        const isAdmin = (user.role === 'admin' || user.username === 'admin');
        const isManager = isUserManager(user);
        const advanceButton = document.getElementById('btn-request-advance');
        if (advanceButton) advanceButton.style.display = user.empId ? 'inline-flex' : 'none';
        if (user.username && loadedAdvancesUsername !== String(user.username) && !loadingAdvancesRequest) {
            loadSalaryAdvances().catch(error => console.error('Failed to load salary advances:', error));
        } else if (loadedAdvancesUsername === String(user.username)) {
            renderSalaryAdvances();
        }
        const userEmpId = user.empId ? String(user.empId) : null;
        const userDept = getUserDepartment(user);

        let filtered = leavesPermissionsDb.slice();

        // ── تخصيص نطاق الرؤية بحسب الصلاحيات الإدارية ──
        if (!isAdmin) {
            if (isManager) {
                // المدير يرى طلباته الشخصية وطلبات الموظفين التابعين لإدارته وقسمه
                filtered = filtered.filter(item => {
                    const isSelf = userEmpId && String(item.empId) === userEmpId;
                    const isSubordinate = (userEmpId && String(item.managerEmpId) === userEmpId) || 
                                          (item.managerName && item.managerName === user.fullName) ||
                                          (userDept && item.dept === userDept);
                    return isSelf || isSubordinate;
                });
            } else {
                // الموظف العادي يرى طلباته الخاصة فقط ولا يرى طلبات الآخرين
                filtered = filtered.filter(item => {
                    if (userEmpId && String(item.empId) === userEmpId) return true;
                    if (item.submittedBy === user.fullName || item.submittedBy === user.username) return true;
                    return false;
                });
            }
        }

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

        tableBody.replaceChildren();
        const makeCell = (text, styles = {}) => {
            const cell = document.createElement('td');
            cell.textContent = String(text ?? '-');
            Object.assign(cell.style, styles);
            return cell;
        };
        const makeBadge = (text, styles) => {
            const badge = document.createElement('span');
            badge.className = 'badge';
            badge.textContent = text;
            Object.assign(badge.style, styles);
            return badge;
        };

        filtered.forEach(item => {
            const isLeave = item.itemType === 'leave';
            const isSelf = userEmpId && String(item.empId) === userEmpId;
            const isSubordinate = (userEmpId && String(item.managerEmpId) === userEmpId) ||
                                  (item.managerName && item.managerName === user.fullName) ||
                                  (userDept && item.dept === userDept);
            const canApprove = isAdmin || (isManager && isSubordinate && !isSelf);
            const row = document.createElement('tr');
            const typeCell = document.createElement('td');
            typeCell.appendChild(makeBadge(
                isLeave ? `🏖️ إجازة (${item.leaveTypeTitle || item.leaveType || ''})` : `⏱️ إذن (${item.permTypeTitle || item.permType || ''})`,
                isLeave
                    ? { background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', fontSize: '11px' }
                    : { background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a', fontSize: '11px' }
            ));
            const statusCell = document.createElement('td');
            const statusStyles = item.status === 'approved'
                ? { background: '#dcfce7', color: '#15803d', border: '1px solid #86efac' }
                : item.status === 'rejected'
                    ? { background: '#fee2e2', color: '#b91c1c', border: '1px solid #fca5a5' }
                    : { background: '#fef9c3', color: '#a16207', border: '1px solid #fde047' };
            const statusText = item.status === 'approved' ? 'معتمد ومقبول ✅'
                : item.status === 'rejected' ? 'مرفوض ❌' : 'قيد الانتظار ⏳';
            statusCell.appendChild(makeBadge(statusText, { ...statusStyles, fontWeight: '800', fontSize: '11px' }));

            const durationCell = document.createElement('td');
            durationCell.style.fontSize = '12px';
            const durationValue = document.createElement('strong');
            durationValue.textContent = String(isLeave ? item.daysCount ?? 0 : item.hoursCount ?? 0);
            durationCell.appendChild(durationValue);
            durationCell.append(isLeave
                ? ` يوم (من ${item.startDate || '-'} إلى ${item.endDate || '-'})`
                : ` س (${item.startDate || '-'} من ${item.startTime || '-'} إلى ${item.endTime || '-'})`);

            const reasonCell = makeCell(item.reason || '-', {
                fontSize: '11.5px',
                color: '#475569',
                maxWidth: '180px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
            });
            reasonCell.title = String(item.reason || '');

            const actionsCell = document.createElement('td');
            if (item.status === 'pending' && canApprove) {
                const actionGroup = document.createElement('div');
                actionGroup.style.cssText = 'display:flex; gap:4px; justify-content:center;';
                const approveButton = document.createElement('button');
                approveButton.type = 'button';
                approveButton.className = 'btn-success';
                approveButton.style.cssText = 'padding:4px 8px; font-size:11px; min-height:30px;';
                approveButton.textContent = '✔️ قبول';
                approveButton.title = 'الموافقة والاعتماد';
                approveButton.addEventListener('click', () => approveLeavePermissionItem(item.id, true));
                const rejectButton = document.createElement('button');
                rejectButton.type = 'button';
                rejectButton.className = 'btn-danger';
                rejectButton.style.cssText = 'padding:4px 8px; font-size:11px; min-height:30px;';
                rejectButton.textContent = '✖️ رفض';
                rejectButton.title = 'رفض الطلب';
                rejectButton.addEventListener('click', () => openRejectModal(item.id));
                actionGroup.append(approveButton, rejectButton);
                actionsCell.appendChild(actionGroup);
            } else if (item.status === 'approved' || item.status === 'rejected') {
                const decisionInfo = document.createElement('div');
                decisionInfo.style.cssText = `font-size:10px; color:${item.status === 'approved' ? '#15803d' : '#b91c1c'};`;
                const approver = document.createElement('strong');
                approver.textContent = String(item.status === 'approved' ? item.approvedBy || 'المدير' : item.rejectedBy || 'المدير');
                decisionInfo.append(item.status === 'approved' ? 'اعتمد: ' : 'رُفض: ', approver);
                const decisionDate = document.createElement('div');
                decisionDate.style.color = '#64748b';
                decisionDate.textContent = String(item.approvedAt ? item.approvedAt.split('T')[0] : '');
                decisionInfo.appendChild(decisionDate);
                if (item.status === 'rejected') {
                    const reason = document.createElement('div');
                    reason.style.color = '#475569';
                    reason.title = String(item.rejectionReason || '');
                    reason.textContent = `${String(item.rejectionReason || 'بدون سبب').slice(0, 16)}..`;
                    decisionInfo.appendChild(reason);
                }
                actionsCell.appendChild(decisionInfo);
            } else {
                actionsCell.textContent = 'بانتظار المدير';
                actionsCell.style.cssText = 'font-size:11px; color:#94a3b8;';
            }

            if (isAdmin) {
                const deleteButton = document.createElement('button');
                deleteButton.type = 'button';
                deleteButton.style.cssText = 'background:none; border:none; cursor:pointer; font-size:13px; margin-top:2px;';
                deleteButton.title = 'حذف السجل نهائياً';
                deleteButton.textContent = '🗑️';
                deleteButton.addEventListener('click', () => deleteLeavePermissionItem(item.id));
                actionsCell.appendChild(deleteButton);
            }

            row.append(
                makeCell(`#${item.empCode || item.empId}`, { fontWeight: 'bold', fontFamily: 'Consolas, monospace' }),
                makeCell(item.empName || '-', { fontWeight: 'bold', color: '#1e293b' }),
                makeCell(item.dept || '-'),
                typeCell,
                durationCell,
                reasonCell,
                makeCell(item.managerName || 'مدير النظام', { fontSize: '11px', fontWeight: 'bold', color: '#102a45' }),
                statusCell,
                actionsCell
            );
            tableBody.appendChild(row);
        });
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

    // ملء قوائم الموظفين والأقسام بحسب صلاحيات المستخدم
    function populateLeavesEmployeeDropdowns() {
        const allEmps = leavesManagedEmployees;
        const user = window.currentUser || {};
        const isAdmin = (user.role === 'admin' || user.username === 'admin');
        const isMgr = isUserManager(user);
        const userEmpId = user.empId ? String(user.empId) : null;
        const allowedEmps = getEmployeesManagedByUser(user);

        // قوائم تقديم الطلبات (الإجازات والأذونات)
        const modalSelects = [
            document.getElementById('new-leave-emp-select'),
            document.getElementById('new-perm-emp-select')
        ];

        modalSelects.forEach(sel => {
            if (!sel) return;
            const curVal = sel.value;
            sel.innerHTML = '';

            if (allowedEmps.length === 0) {
                const opt = document.createElement('option');
                opt.value = userEmpId || '';
                opt.textContent = `${user.fullName || 'أنت'} (طلب شخصي)`;
                sel.appendChild(opt);
                sel.disabled = true;
            } else {
                if (allowedEmps.length > 1) {
                    sel.innerHTML = '<option value="">-- اختر الموظف --</option>';
                    sel.disabled = false;
                } else {
                    sel.disabled = true; // موظف عادي: مقفول على اسمه فقط
                }

                allowedEmps.forEach(e => {
                    const opt = document.createElement('option');
                    opt.value = e.id;
                    const isSelfLabel = (userEmpId && String(e.id) === userEmpId) ? ' (أنت - طلب شخصي)' : '';
                    opt.textContent = `${e.name} (${e.job || 'عام'}) - #${e.id}${isSelfLabel}`;
                    sel.appendChild(opt);
                });

                if (curVal && allowedEmps.some(e => String(e.id) === String(curVal))) {
                    sel.value = curVal;
                } else if (userEmpId && allowedEmps.some(e => String(e.id) === userEmpId)) {
                    sel.value = userEmpId;
                }
            }
        });

        // قائمة فلتر الموظفين بالجدول
        const filterSelect = document.getElementById('leaves-filter-emp');
        if (filterSelect) {
            const curVal = filterSelect.value;
            filterSelect.innerHTML = '<option value="">جميع الموظفين المتاحين</option>';
            allowedEmps.forEach(e => {
                const opt = document.createElement('option');
                opt.value = e.id;
                opt.textContent = `${e.name} (${e.job || 'عام'}) - #${e.id}`;
                filterSelect.appendChild(opt);
            });
            if (curVal) filterSelect.value = curVal;
        }

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
        const sel = document.getElementById('new-leave-emp-select');
        const empId = sel ? sel.value : null;
        const infoBox = document.getElementById('leave-emp-balance-info');
        if (!empId || !infoBox) {
            if (infoBox) infoBox.style.display = 'none';
            return;
        }

        const allEmps = leavesManagedEmployees;
        const emp = allEmps.find(e => String(e.id) === String(empId));
        if (!emp) return;

        const quota = Number(emp.annualLeaveQuota) || 21;
        const usedLeaves = leavesPermissionsDb.filter(i => String(i.empId) === String(empId) && i.itemType === 'leave' && i.status === 'approved' && i.leaveType !== 'unpaid')
            .reduce((sum, i) => sum + (Number(i.daysCount) || 0), 0);
        const remaining = Math.max(0, quota - usedLeaves);

        infoBox.replaceChildren();
        const infoRow = document.createElement('div');
        infoRow.style.cssText = 'display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;';
        const managerLabel = document.createElement('span');
        managerLabel.append('👤 المدير المباشر: ');
        const managerValue = document.createElement('strong');
        managerValue.textContent = String(emp.managerName || 'مدير النظام');
        managerLabel.appendChild(managerValue);
        const quotaLabel = document.createElement('span');
        quotaLabel.append('📅 الرصيد السنوي: ');
        const quotaValue = document.createElement('strong');
        quotaValue.textContent = String(quota);
        quotaLabel.append(quotaValue, ' يوم | المستهلك: ');
        const usedValue = document.createElement('strong');
        usedValue.style.color = '#b91c1c';
        usedValue.textContent = String(usedLeaves);
        quotaLabel.append(usedValue, ' | المتبقي: ');
        const remainingValue = document.createElement('strong');
        remainingValue.style.color = '#059669';
        remainingValue.textContent = String(remaining);
        quotaLabel.append(remainingValue, ' يوم');
        infoRow.append(managerLabel, quotaLabel);
        infoBox.appendChild(infoRow);
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
    async function submitNewLeaveRequest(e) {
        if (e) e.preventDefault();
        const user = window.currentUser || {};
        const isMgr = isUserManager(user);
        const sel = document.getElementById('new-leave-emp-select');
        let empId = sel ? sel.value : null;

        // المستخدم العادي لا يمكنه التقديم إلا لنفسه فقط
        if (!isMgr && user.empId) {
            empId = user.empId;
        }

        if (!empId) {
            alert('يرجى اختيار الموظف أولاً!');
            return;
        }

        const allEmps = leavesManagedEmployees;
        const emp = allEmps.find(e => String(e.id) === String(empId));
        if (!emp) return;

        const leaveType = document.getElementById('new-leave-type').value;
        const leaveTypeSelect = document.getElementById('new-leave-type');
        const leaveTypeTitle = leaveTypeSelect.options[leaveTypeSelect.selectedIndex].text;
        const startDate = document.getElementById('new-leave-start-date').value;
        const endDate = document.getElementById('new-leave-end-date').value;
        const reason = document.getElementById('new-leave-reason').value.trim();

        let result;
        try {
            result = await leavesApiRequest('/api/leaves-permissions', 'POST', {
                itemType: 'leave',
                empId: emp.id,
                leaveType,
                leaveTypeTitle,
                startDate,
                endDate,
                reason
            });
        } catch (error) {
            alert(error.message);
            return;
        }

        leavesPermissionsDb.unshift(result.item);
        renderLeavesPermissionsScreen();
        closeNewLeaveModal();

        // إرسال إشعار فوري للمدير المباشر ومدير النظام
        if (typeof createNotification === 'function') {
            createNotification({
                type: 'leave_request',
                title: 'طلب إجازة جديد 🏖️',
                message: `قام الموظف (${emp.name}) بطلب إجازة ${leaveTypeTitle} لمدة ${result.item.daysCount} يوم من ${startDate} إلى ${endDate}.`,
                targetRole: 'manager',
                targetUsername: (emp.managerUsername || 'admin'),
                senderName: emp.name,
                relatedId: result.item.id,
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
    async function submitNewPermissionRequest(e) {
        if (e) e.preventDefault();
        const user = window.currentUser || {};
        const isMgr = isUserManager(user);
        const sel = document.getElementById('new-perm-emp-select');
        let empId = sel ? sel.value : null;

        // المستخدم العادي لا يمكنه التقديم إلا لنفسه فقط
        if (!isMgr && user.empId) {
            empId = user.empId;
        }

        if (!empId) {
            alert('يرجى اختيار الموظف أولاً!');
            return;
        }

        const allEmps = leavesManagedEmployees;
        const emp = allEmps.find(e => String(e.id) === String(empId));
        if (!emp) return;

        const permType = document.getElementById('new-perm-type').value;
        const permTypeSelect = document.getElementById('new-perm-type');
        const permTypeTitle = permTypeSelect.options[permTypeSelect.selectedIndex].text;
        const permDate = document.getElementById('new-perm-date').value;
        const timeFrom = document.getElementById('new-perm-from-time').value;
        const timeTo = document.getElementById('new-perm-to-time').value;
        const reason = document.getElementById('new-perm-reason').value.trim();

        let result;
        try {
            result = await leavesApiRequest('/api/leaves-permissions', 'POST', {
                itemType: 'permission',
                empId: emp.id,
                permType,
                permTypeTitle,
                startDate: permDate,
                endDate: permDate,
                startTime: timeFrom,
                endTime: timeTo,
                reason
            });
        } catch (error) {
            alert(error.message);
            return;
        }

        leavesPermissionsDb.unshift(result.item);
        renderLeavesPermissionsScreen();
        closeNewPermissionModal();

        // إشعار للمدير المباشر
        if (typeof createNotification === 'function') {
            createNotification({
                type: 'permission_request',
                title: 'طلب إذن جديد ⏱️',
                message: `قام الموظف (${emp.name}) بطلب إذن ${permTypeTitle} لمدة ${result.item.hoursCount} ساعة يوم ${permDate}.`,
                targetRole: 'manager',
                targetUsername: (emp.managerUsername || 'admin'),
                senderName: emp.name,
                relatedId: result.item.id,
                actionScreen: 'screen-leaves-permissions'
            });
        }

        alert('تم تقديم طلب الإذن بنجاح! وتم إرسال إشعار للمدير المباشر للموافقة. 📨');
    }

    // قبول واعتماد الطلب
    async function approveLeavePermissionItem(itemId, isApproved) {
        const item = leavesPermissionsDb.find(i => i.id === itemId);
        if (!item || !isApproved) return;

        const user = window.currentUser || { fullName: 'المدير العام' };
        if (!confirm(`هل تؤكد اعتماد والموافقة على هذا الطلب للموظف (${item.empName})؟`)) return;
        let result;
        try {
            result = await leavesApiRequest(`/api/leaves-permissions/${encodeURIComponent(itemId)}/decision`, 'POST', {
                decision: 'approve'
            });
        } catch (error) {
            alert(error.message);
            return;
        }
        leavesPermissionsDb = leavesPermissionsDb.map(entry => entry.id === itemId ? result.item : entry);
        renderLeavesPermissionsScreen();

        if (typeof createNotification === 'function') {
            createNotification({
                type: item.itemType === 'leave' ? 'leave_approved' : 'permission_approved',
                title: 'تمت الموافقة على طلبك! ✅',
                message: `تم اعتماد طلبك (${item.itemType === 'leave' ? item.leaveTypeTitle : item.permTypeTitle}) بنجاح من قِبل ${result.item.approvedBy}.`,
                targetEmpId: item.empId,
                targetUsername: item.empUsername,
                senderName: result.item.approvedBy,
                relatedId: item.id,
                actionScreen: 'screen-leaves-permissions'
            });
        }
        alert(`🎉 تم اعتماد الطلب بنجاح! وتم إرسال إشعار للموظف (${item.empName}).`);
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

    async function submitRejectReason() {
        const itemId = document.getElementById('reject-item-id').value;
        const reason = document.getElementById('reject-reason-input').value.trim();
        const item = leavesPermissionsDb.find(i => i.id === itemId);
        if (!item) return;

        let result;
        try {
            result = await leavesApiRequest(`/api/leaves-permissions/${encodeURIComponent(itemId)}/decision`, 'POST', {
                decision: 'reject',
                reason
            });
        } catch (error) {
            alert(error.message);
            return;
        }
        leavesPermissionsDb = leavesPermissionsDb.map(entry => entry.id === itemId ? result.item : entry);
        renderLeavesPermissionsScreen();
        closeRejectModal();

        // إرسال إشعار للموظف بالرفض
        if (typeof createNotification === 'function') {
            createNotification({
                type: item.itemType === 'leave' ? 'leave_rejected' : 'permission_rejected',
                title: 'تنبيه: تم رفض الطلب ❌',
                message: `نعتذر، تم رفض طلبك (${item.itemType === 'leave' ? item.leaveTypeTitle : item.permTypeTitle}) من قِبل ${result.item.rejectedBy}. السبب: ${result.item.rejectionReason}`,
                targetEmpId: item.empId,
                targetUsername: item.empUsername,
                senderName: result.item.rejectedBy,
                relatedId: item.id,
                actionScreen: 'screen-leaves-permissions'
            });
        }

        alert(`تم تسجيل رفض الطلب وتوثيق السبب وإشعار الموظف.`);
    }

    // حذف سجل
    async function deleteLeavePermissionItem(itemId) {
        if (!confirm('هل أنت متأكد من حذف هذا السجل نهائياً من النظام؟')) return;
        try {
            await leavesApiRequest(`/api/leaves-permissions/${encodeURIComponent(itemId)}`, 'DELETE');
            leavesPermissionsDb = leavesPermissionsDb.filter(i => i.id !== itemId);
            renderLeavesPermissionsScreen();
        } catch (error) {
            alert(error.message);
        }
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
