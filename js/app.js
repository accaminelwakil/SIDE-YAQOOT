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
