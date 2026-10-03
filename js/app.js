    window.addEventListener('resize', () => {
        if (document.getElementById('screen-welcome').classList.contains('active')) {
            renderWelcomeDashboard();
        }
    });

    // تشغيل المنظومة
    initAuthSystem();
    loadStoredFirebaseConfig();
    updateAllDeptDropdownsAndFilters();
    populateAllEmployeeDropdowns();
    if (typeof initAllApplicationAutocompletes === "function") initAllApplicationAutocompletes();
    renderEmployeesTable();
    onShiftDateChanged();
    if (typeof populatePayrollCyclesDropdown === "function") populatePayrollCyclesDropdown();
    if (typeof populateBulkPayslipsDropdowns === "function") populateBulkPayslipsDropdowns();
    if (typeof populateDeliveryCyclesDropdown === "function") populateDeliveryCyclesDropdown();
    if (typeof populateTotalsReportCyclesDropdown === "function") populateTotalsReportCyclesDropdown();
    if (typeof populateSarkiCyclesDropdown === "function") populateSarkiCyclesDropdown();
    if (typeof populateAdjustmentCyclesDropdown === "function") populateAdjustmentCyclesDropdown();
    renderWelcomeDashboard();

    // معالجة اختصارات وروابط PWA الفورية (Shortcuts & Deep Links)
    (function handlePwaDeepLinks() {
        const urlParams = new URLSearchParams(window.location.search);
        const action = urlParams.get('action');
        if (!action) return;

        setTimeout(() => {
            if (action === 'punch' && typeof openSmartPunchModal === 'function') {
                openSmartPunchModal();
            } else if (action === 'sarki' && typeof switchScreen === 'function') {
                switchScreen('screen-employee-sarki');
            } else if (action === 'attendance' && typeof switchScreen === 'function') {
                switchScreen('screen-attendance');
            } else if (action === 'payroll' && typeof switchScreen === 'function') {
                switchScreen('screen-payroll-summary');
            }
        }, 1000);
    })();
