    // ==================== نظام الإشعارات السريعة (Toast Notifications) ====================
    let toastTimeout = null;
    function showToast(msg, type = 'success') {
        const toast = document.getElementById('system-toast');
        if (!toast) return;
        toast.className = `toast-box toast-${type} show`;
        const icon = type === 'success' ? '✔' : (type === 'warning' ? '⚠️' : (type === 'danger' ? '✖' : 'ℹ️'));
        toast.innerHTML = `<span style="font-size:16px;">${icon}</span><span>${msg}</span>`;
        if (toastTimeout) clearTimeout(toastTimeout);
        toastTimeout = setTimeout(() => {
            toast.classList.remove('show');
        }, 3200);
    }

