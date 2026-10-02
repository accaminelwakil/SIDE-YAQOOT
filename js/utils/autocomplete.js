/**
 * ===================================================================
 * Autocomplete & Smart Search Dropdown System for Sidi Yaqout ERP
 * ===================================================================
 * 
 * Provides unified, high-performance autocomplete and search behavior for:
 * 1. All "Employee Name" fields and searches across all screens.
 * 2. All "Department" fields across all screens.
 * 
 * Desired Behavior:
 * - Triggers on typing the first 1-3 characters (or numeric employee code).
 * - Automatically highlights the first matching option by default.
 * - Supports keyboard navigation (ArrowDown, ArrowUp).
 * - On TAB key (keydown):
 *   Automatically selects, binds, and saves the highlighted option into
 *   the field and application state, closes the suggestions dropdown,
 *   and allows natural Tab focus navigation to the next field in the form.
 * - Supports Enter key and Click selection.
 * - Arabic diacritic & letter normalization (أ/إ/آ -> ا, ة -> ه, ى -> ي).
 */

(function (window, document) {
    'use strict';

    // 1. Helper: Arabic text normalization
    function normalizeArabicText(str) {
        if (!str) return '';
        return String(str)
            .replace(/[\u064B-\u065F\u0670]/g, '') // Tashkeel / diacritics
            .replace(/[إأآا]/g, 'ا')
            .replace(/ة/g, 'ه')
            .replace(/ى/g, 'ي')
            .replace(/[\.\,\-\_\s]+/g, ' ')
            .toLowerCase()
            .trim();
    }

    // 2. Helper: Get all active employees reliably
    function getActiveEmployeesList(includeAll) {
        var emps = [];
        if (typeof window.employees !== 'undefined' && Array.isArray(window.employees) && window.employees.length > 0) {
            emps = window.employees;
        } else if (typeof employees !== 'undefined' && Array.isArray(employees) && employees.length > 0) {
            emps = employees;
        } else {
            try {
                var raw = localStorage.getItem('erp_employees_db') || localStorage.getItem('erp_employees');
                if (raw) emps = JSON.parse(raw);
            } catch (e) {
                emps = [];
            }
        }

        if (emps && emps.length > 0 && !window.employees) {
            window.employees = emps;
        }

        var filtered = includeAll ? emps : emps.filter(function (e) {
            return e && e.status !== 'انتهت خدمته';
        });

        return filtered.slice().sort(function (a, b) {
            return (a.name || '').localeCompare(b.name || '', 'ar');
        });
    }

    // 3. Helper: Get all departments with counts
    function getAllDepartmentsList() {
        var counts = {};
        var emps = getActiveEmployeesList(true);
        emps.forEach(function (e) {
            if (e && e.job && e.job.trim()) {
                var j = e.job.trim();
                if (j === 'ادارة') j = 'إدارة';
                counts[j] = (counts[j] || 0) + 1;
            }
        });

        var known = (typeof window.KNOWN_DEPTS !== 'undefined' ? window.KNOWN_DEPTS :
                    (typeof KNOWN_DEPTS !== 'undefined' ? KNOWN_DEPTS : null)) || {
            'إدارة': 1000,
            'استقبال': 2000,
            'تمريض': 3000,
            'خدمات معاونة': 4000,
            'حسابات': 5000,
            'معمل': 6000,
            'صيدلية': 7000
        };

        Object.keys(known).forEach(function (k) {
            var normK = k ? k.trim().replace(/^ادارة$/, 'إدارة') : '';
            if (normK && counts[normK] === undefined) {
                counts[normK] = 0;
            }
        });

        var list = Object.keys(counts).map(function (dept) {
            return {
                name: dept,
                count: counts[dept]
            };
        });

        list.sort(function (a, b) {
            return a.name.localeCompare(b.name, 'ar');
        });

        return list;
    }

    // 4. Position floating dropdown relative to input (RTL aware)
    function positionDropdown(inputEl, dropdown) {
        if (!inputEl || !dropdown) return;
        var rect = inputEl.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) return;

        var minWidth = Math.max(rect.width, 240);
        var spaceBelow = window.innerHeight - rect.bottom;
        var spaceAbove = rect.top;

        var maxHeight = 260;
        var top = rect.bottom + 4;

        if (spaceBelow < 180 && spaceAbove > spaceBelow) {
            maxHeight = Math.min(260, spaceAbove - 12);
            top = Math.max(10, rect.top - maxHeight - 4);
        } else {
            maxHeight = Math.min(260, spaceBelow - 12);
        }

        dropdown.style.maxHeight = Math.max(120, maxHeight) + 'px';
        dropdown.style.top = top + 'px';

        // Right alignment for Arabic RTL
        var right = window.innerWidth - rect.right;
        if (right < 10) right = 10;
        if (right + minWidth > window.innerWidth - 10) {
            right = Math.max(10, window.innerWidth - minWidth - 10);
        }
        dropdown.style.right = right + 'px';
        dropdown.style.width = minWidth + 'px';
    }

    // 5. Core Autocomplete Controller
    function createAutocomplete(inputEl, options) {
        if (!inputEl) return null;
        if (inputEl._erpAutocompleteAttached) return inputEl._erpAutocomplete;

        var config = Object.assign({
            type: 'employee', // 'employee' | 'department' | 'custom'
            minChars: 1, // Triggers immediately from 1-3 chars
            allowShowAll: false,
            getItems: null,
            onSelect: null,
            getDisplayValue: null,
            renderItem: null
        }, options);

        var dropdown = null;
        var currentItems = [];
        var highlightedIndex = 0;
        var isOpen = false;

        function ensureDropdown() {
            if (!dropdown) {
                dropdown = document.createElement('div');
                dropdown.className = 'erp-autocomplete-dropdown';
                dropdown.style.display = 'none';
                document.body.appendChild(dropdown);

                dropdown.addEventListener('mousedown', function (e) {
                    e.preventDefault(); // Prevent input blur on click
                });
            }
            return dropdown;
        }

        function closeDropdown() {
            if (dropdown && isOpen) {
                dropdown.style.display = 'none';
                dropdown.innerHTML = '';
                isOpen = false;
                currentItems = [];
                highlightedIndex = 0;
            }
        }

        function updateHighlight() {
            if (!dropdown || !isOpen) return;
            var itemEls = dropdown.querySelectorAll('.erp-ac-item');
            itemEls.forEach(function (el, idx) {
                if (idx === highlightedIndex) {
                    el.classList.add('highlighted');
                    el.scrollIntoView({ block: 'nearest' });
                } else {
                    el.classList.remove('highlighted');
                }
            });
        }

        function selectItem(item) {
            if (!item) return;

            if (typeof config.getDisplayValue === 'function') {
                inputEl.value = config.getDisplayValue(item);
            } else if (config.type === 'employee') {
                inputEl.value = item.name || '';
            } else if (config.type === 'department') {
                inputEl.value = item.name || item || '';
            } else {
                inputEl.value = item.label || item.name || String(item);
            }

            if (typeof config.onSelect === 'function') {
                config.onSelect(item, inputEl);
            }

            inputEl.dispatchEvent(new Event('input', { bubbles: true }));
            inputEl.dispatchEvent(new Event('change', { bubbles: true }));
        }

        function renderDropdown(items) {
            ensureDropdown();
            currentItems = items;
            highlightedIndex = 0; // Automatically highlight the first matching option by default!

            dropdown.innerHTML = '';

            if (items.length === 0) {
                var empty = document.createElement('div');
                empty.className = 'erp-ac-empty';
                empty.textContent = 'لا توجد نتائج مطابقة';
                dropdown.appendChild(empty);
            } else {
                items.forEach(function (item, idx) {
                    var itemEl = document.createElement('div');
                    itemEl.className = 'erp-ac-item' + (idx === 0 ? ' highlighted' : '');
                    itemEl.setAttribute('data-index', idx);

                    if (typeof config.renderItem === 'function') {
                        itemEl.innerHTML = config.renderItem(item);
                    } else if (config.type === 'employee') {
                        itemEl.innerHTML =
                            '<span class="erp-ac-name">' + (item.name || '') + '</span>' +
                            '<div class="erp-ac-badges">' +
                                '<span class="erp-ac-badge-code">#' + (item.id || '') + '</span>' +
                                '<span class="erp-ac-badge-dept">' + (item.job || '-') + '</span>' +
                            '</div>';
                    } else if (config.type === 'department') {
                        var countText = (item.count !== undefined && item.count > 0) ? (item.count + ' موظف') : '';
                        itemEl.innerHTML =
                            '<span class="erp-ac-name">' + (item.name || item) + '</span>' +
                            (countText ? '<span class="erp-ac-badge-dept">' + countText + '</span>' : '');
                    } else {
                        itemEl.innerHTML = '<span class="erp-ac-name">' + (item.label || item.name || item) + '</span>';
                    }

                    itemEl.addEventListener('mouseenter', function () {
                        highlightedIndex = idx;
                        updateHighlight();
                    });

                    itemEl.addEventListener('click', function (e) {
                        e.preventDefault();
                        selectItem(item);
                        closeDropdown();
                    });

                    dropdown.appendChild(itemEl);
                });
            }

            positionDropdown(inputEl, dropdown);
            dropdown.style.display = 'block';
            isOpen = true;
        }

        function filterAndShow() {
            var rawVal = inputEl.value || '';
            var val = normalizeArabicText(rawVal);

            if (config.allowShowAll && val.length === 0) {
                var allItems = [];
                if (typeof config.getItems === 'function') {
                    allItems = config.getItems('');
                } else if (config.type === 'employee') {
                    allItems = getActiveEmployeesList();
                } else if (config.type === 'department') {
                    allItems = getAllDepartmentsList();
                }
                renderDropdown(allItems);
                return;
            }

            var isNumericQuery = /^\d+$/.test(rawVal.trim());
            var minChars = isNumericQuery ? 1 : config.minChars;

            if (val.length < minChars && !isNumericQuery) {
                closeDropdown();
                return;
            }

            var matches = [];
            if (typeof config.getItems === 'function') {
                matches = config.getItems(val);
            } else if (config.type === 'employee') {
                var emps = getActiveEmployeesList();
                var rawTrim = rawVal.trim();
                matches = emps.filter(function (e) {
                    var normName = normalizeArabicText(e.name);
                    var normJob = normalizeArabicText(e.job);
                    var idStr = String(e.id || '');
                    var codeStr = String(e.code || '');

                    return normName.includes(val) ||
                        idStr.includes(rawTrim) ||
                        codeStr.includes(rawTrim) ||
                        normJob.includes(val);
                });
            } else if (config.type === 'department') {
                var depts = getAllDepartmentsList();
                matches = depts.filter(function (d) {
                    var norm = normalizeArabicText(d.name || d);
                    return norm.includes(val);
                });
            }

            renderDropdown(matches);
        }

        // ==================== EVENT LISTENERS ====================

        // 1. Input: triggers search
        inputEl.addEventListener('input', function () {
            filterAndShow();
        });

        // 2. Focus & Click
        inputEl.addEventListener('focus', function () {
            if (config.allowShowAll || (inputEl.value && inputEl.value.trim().length >= config.minChars)) {
                filterAndShow();
            }
        });

        inputEl.addEventListener('click', function () {
            if (!isOpen && (config.allowShowAll || (inputEl.value && inputEl.value.trim().length >= config.minChars))) {
                filterAndShow();
            }
        });

        // 3. Keydown: Arrow keys, TAB KEY, Enter, Escape
        inputEl.addEventListener('keydown', function (e) {
            if (!isOpen) {
                if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && config.allowShowAll) {
                    e.preventDefault();
                    filterAndShow();
                }
                return;
            }

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (currentItems.length > 0) {
                    highlightedIndex = (highlightedIndex + 1) % currentItems.length;
                    updateHighlight();
                }
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (currentItems.length > 0) {
                    highlightedIndex = (highlightedIndex - 1 + currentItems.length) % currentItems.length;
                    updateHighlight();
                }
            } else if (e.key === 'Tab') {
                // =========================================================================
                // ON TAB KEY:
                // Automatically select, bind, and save the currently highlighted option
                // (or the first matching suggestion if no arrow keys were pressed).
                // Close the dropdown.
                // Allow focus to move naturally to the next field (NO preventDefault).
                // =========================================================================
                if (currentItems.length > 0) {
                    var selected = currentItems[highlightedIndex >= 0 ? highlightedIndex : 0];
                    if (selected) {
                        selectItem(selected);
                    }
                }
                closeDropdown();
                // Natural browser Tab focus will now proceed to the next input!
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (currentItems.length > 0) {
                    var selectedItem = currentItems[highlightedIndex >= 0 ? highlightedIndex : 0];
                    if (selectedItem) {
                        selectItem(selectedItem);
                    }
                }
                closeDropdown();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                closeDropdown();
            }
        });

        // 4. Blur: close dropdown
        inputEl.addEventListener('blur', function () {
            setTimeout(closeDropdown, 160);
        });

        // 5. Scroll & Resize: reposition
        window.addEventListener('resize', function () {
            if (isOpen) positionDropdown(inputEl, dropdown);
        });

        window.addEventListener('scroll', function () {
            if (isOpen) positionDropdown(inputEl, dropdown);
        }, true);

        var controller = {
            input: inputEl,
            close: closeDropdown,
            open: filterAndShow,
            select: selectItem,
            refresh: function () {
                if (isOpen) filterAndShow();
            }
        };

        inputEl._erpAutocompleteAttached = true;
        inputEl._erpAutocomplete = controller;
        return controller;
    }

    // Helper: Employee Autocomplete
    function attachEmployeeAutocomplete(inputEl, options) {
        if (!inputEl) return null;
        inputEl.setAttribute('autocomplete', 'off');
        inputEl.removeAttribute('list');
        return createAutocomplete(inputEl, Object.assign({
            type: 'employee',
            minChars: 1,
            allowShowAll: false
        }, options));
    }

    // Helper: Department Autocomplete
    function attachDepartmentAutocomplete(inputEl, options) {
        if (!inputEl) return null;
        inputEl.setAttribute('autocomplete', 'off');
        inputEl.removeAttribute('list');
        return createAutocomplete(inputEl, Object.assign({
            type: 'department',
            minChars: 1,
            allowShowAll: true
        }, options));
    }

    // Global Initialization across all screens
    function initAllApplicationAutocompletes() {
        // --- 1. Screen 2: Employees ---
        var empSearch = document.getElementById('emp-search');
        if (empSearch) {
            attachEmployeeAutocomplete(empSearch, {
                onSelect: function (emp) {
                    empSearch.value = emp.name;
                    if (typeof window.renderEmployeesTable === 'function') {
                        window.renderEmployeesTable();
                    }
                }
            });
        }

        var newEmpJob = document.getElementById('new-emp-job');
        if (newEmpJob) {
            attachDepartmentAutocomplete(newEmpJob, {
                onSelect: function (dept) {
                    newEmpJob.value = dept.name || dept;
                }
            });
        }

        var editEmpJob = document.getElementById('edit-emp-job');
        if (editEmpJob) {
            attachDepartmentAutocomplete(editEmpJob, {
                onSelect: function (dept) {
                    editEmpJob.value = dept.name || dept;
                }
            });
        }

        // --- 2. Screen 4: Salary Adjustments ---
        var adjSearch = document.getElementById('adj-search');
        if (adjSearch) {
            attachEmployeeAutocomplete(adjSearch, {
                onSelect: function (emp) {
                    adjSearch.value = emp.name;
                    if (typeof window.renderAdjustmentsTable === 'function') {
                        window.renderAdjustmentsTable();
                    }
                }
            });
        }

        // --- 3. Screen 5: Payroll Summary ---
        var psummarySearch = document.getElementById('psummary-search');
        if (psummarySearch) {
            attachEmployeeAutocomplete(psummarySearch, {
                onSelect: function (emp) {
                    psummarySearch.value = emp.name;
                    if (typeof window.renderPayrollSummaryTable === 'function') {
                        window.renderPayrollSummaryTable();
                    }
                }
            });
        }

        // --- 4. Screen 8: Payroll Delivery ---
        var deliverySearch = document.getElementById('delivery-search');
        if (deliverySearch) {
            attachEmployeeAutocomplete(deliverySearch, {
                onSelect: function (emp) {
                    deliverySearch.value = emp.name;
                    if (typeof window.renderPayrollDelivery === 'function') {
                        window.renderPayrollDelivery();
                    }
                }
            });
        }

        // --- 5. Screen 3: Attendance Rows (Attach to any existing rows) ---
        var attInputs = document.querySelectorAll('#daily-attendance-tbody .cell-emp-search');
        attInputs.forEach(function (input) {
            if (!input._erpAutocompleteAttached) {
                var tr = input.closest('tr');
                var idx = tr ? parseInt(tr.getAttribute('data-idx')) : -1;
                attachEmployeeAutocomplete(input, {
                    onSelect: function (emp) {
                        input.value = emp.name;
                        if (typeof window.currentDailyAttendance !== 'undefined' && idx >= 0 && window.currentDailyAttendance[idx]) {
                            var item = window.currentDailyAttendance[idx];
                            item.empId = emp.id;
                            item.name = emp.name;
                            item.job = emp.job;
                            item.shiftHours = emp.shiftHours || 8;

                            if (tr) {
                                var codeDisplay = tr.querySelector('.cell-code-display');
                                var deptDisplay = tr.querySelector('.cell-dept-display');
                                if (codeDisplay) codeDisplay.textContent = '#' + emp.id;
                                if (deptDisplay) deptDisplay.textContent = emp.job || '-';
                                if (item.timeIn || item.timeOut) {
                                    if (typeof window.updateRowCalculationsDOM === 'function') {
                                        window.updateRowCalculationsDOM(idx, tr);
                                    }
                                }
                            }
                            if (typeof window.updateDailyAttendancePresentCount === 'function') {
                                window.updateDailyAttendancePresentCount();
                            }
                        }
                    }
                });
            }
        });
    }

    // Export to global scope
    window.normalizeArabicText = normalizeArabicText;
    window.getActiveEmployeesList = getActiveEmployeesList;
    window.getAllDepartmentsList = getAllDepartmentsList;
    window.createAutocomplete = createAutocomplete;
    window.attachEmployeeAutocomplete = attachEmployeeAutocomplete;
    window.attachDepartmentAutocomplete = attachDepartmentAutocomplete;
    window.initAllApplicationAutocompletes = initAllApplicationAutocompletes;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initAllApplicationAutocompletes);
    } else {
        setTimeout(initAllApplicationAutocompletes, 50);
    }

})(window, document);
