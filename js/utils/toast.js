    // ==================== نظام الإشعارات السريعة (Toast Notifications) ====================
    let toastTimeout = null;
    function showToast(msg, type = 'success') {
        const toast = document.getElementById('system-toast');
        if (!toast) return;
        toast.className = `toast-box toast-${type} show`;
        const icon = type === 'success' ? '✔' : (type === 'warning' ? '⚠️' : (type === 'danger' ? '✖' : 'ℹ️'));
        const iconElement = document.createElement('span');
        iconElement.style.fontSize = '16px';
        iconElement.textContent = icon;
        const messageElement = document.createElement('span');
        messageElement.textContent = String(msg);
        toast.replaceChildren(iconElement, messageElement);
        if (toastTimeout) clearTimeout(toastTimeout);
        toastTimeout = setTimeout(() => {
            toast.classList.remove('show');
        }, 3200);
    }
