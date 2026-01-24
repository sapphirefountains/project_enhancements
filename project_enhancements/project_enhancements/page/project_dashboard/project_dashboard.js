/**
 * @file This file contains the client-side logic for the Project Dashboard page.
 * @description It handles the entire lifecycle of the dashboard, including initialization,
 * permission checks, data fetching, rendering different views (grouped, ranked, tasks),
 * user interactions (sorting, filtering, inline editing), and state management via URL hashes.
 * @namespace project_dashboard
 */

/**
 * Initializes the Project Dashboard page on load.
 *
 * This function is the entry point for the dashboard. It first checks if the
 * current user has the necessary permissions to view the page. If permission is
 * granted, it proceeds to initialize the full dashboard UI and functionality.
 * Otherwise, it displays an "Access Denied" message.
 *
 * @param {HTMLElement} wrapper - The parent DOM element for the page content,
 * provided by the Frappe framework.
 */
frappe.pages['project-dashboard'].on_page_load = function (wrapper) {
    const page = frappe.ui.make_app_page({
        parent: wrapper,
        title: 'Projects Dashboard',
        single_column: true
    });

    // Check permissions before rendering the main dashboard.
    frappe.call({
        method: "project_enhancements.project_enhancements.page.project_dashboard.project_dashboard.check_permission",
        callback: function (r) {
            if (r.message) {
                // User has permission, initialize the main dashboard logic.
                initialize_dashboard(page);
            } else {
                // User does not have permission, show an access denied message.
                page.set_title('Access Denied');
                $(page.body).html(`
                    <div class="container py-5">
                        <div class="alert alert-danger">
                            <h3><i class="fa fa-lock mr-2"></i>Access Denied</h3>
                            <p>You do not have the required permissions to view the Project Dashboard. Please contact your system administrator to request access.</p>
                        </div>
                    </div>
                `);
            }
        }
    });

    /**
     * Sets up the main dashboard UI, state variables, and event listeners.
     *
     * This function is called after a successful permission check. It is responsible
     * for setting up all the core components of the dashboard, including:
     * - State variables for projects, filters, and sorting.
     * - DOM elements for tabs, search, and other controls.
     * - Initial data fetching from the server.
     * - Event listeners for all user interactions.
     *
     * @param {object} page - The Frappe page object.
     */
    function initialize_dashboard(page) {
        console.log("Loading Project Dashboard JS - Version 5.6 (Refactored)");

        // --- Interactive Background Logic ---
        $(document).on('mousemove', function (e) {
            const pageContent = $('[data-page-route="project-dashboard"] .page-content');
            if (pageContent.length) {
                const x = e.clientX;
                const y = e.clientY;
                pageContent[0].style.setProperty('--mouse-x', `${x}px`);
                pageContent[0].style.setProperty('--mouse-y', `${y}px`);
            }
        });

        // Explicitly load the CSS to ensure it's present
        frappe.require("/assets/project_enhancements/css/project_dashboard.css");

        // Dynamically load Frappe Gantt library assets.
        const gantt_css_url = "https://cdn.jsdelivr.net/npm/frappe-gantt/dist/frappe-gantt.css";
        const gantt_js_url = "https://cdn.jsdelivr.net/npm/frappe-gantt/dist/frappe-gantt.umd.js";

        // Inject the Gantt CSS file into the document's head
        if (!$(`link[href="${gantt_css_url}"]`).length) {
            $('<link>', {
                rel: 'stylesheet',
                type: 'text/css',
                href: gantt_css_url
            }).appendTo('head');
        }
        // Load the JS file; frappe.require ensures it's loaded before being used.
        frappe.require(gantt_js_url, () => { });


        // --- State Variables ---
        let allProjects = [];
        let priorityOptionsList = [];
        let statusOptionsList = [];
        let currentSort = { field: 'project_name', order: 'asc' };
        let activeTab = 'ActiveExternalProjects';
        let priorityView = 'ranked'; // 'grouped' or 'ranked'
        let expandedGroups = new Set();
        let pageState = {}; // Holds the state parsed from the URL hash.
        let pendingProjectChanges = {};

        // --- Color Helper Functions ---

        /**
         * Returns the background color and text color style string for a given status.
         */
        function getStatusStyle(status) {
            let color = '#6c757d'; // Default grey
            switch (status) {
                case 'Active': color = '#007bff'; break; // Blue
                case 'Open': color = '#007bff'; break; // Blue (Tasks)
                case 'Completed': color = '#28a745'; break; // Green
                case 'Overdue': color = '#dc3545'; break; // Red
                case 'Cancelled': color = '#dc3545'; break; // Red
                case 'Canceled': color = '#dc3545'; break; // Red
                case 'Working': color = '#ff9800'; break; // Orange (visible with white text)
                case 'On Hold': color = '#ff9800'; break; // Orange
                case 'Invoiced': color = '#6f42c1'; break; // Purple
                default: color = '#6c757d';
            }
            return `background-color: ${color}; color: white;`;
        }

        /**
         * Returns the background color style for a priority value (Heatmap logic).
         */
        function getPriorityStyle(value) {
            let val = parseInt(value, 10);
            if (isNaN(val)) return `background-color: white; color: black; border: 1px solid #ddd;`; // No color for non-integers

            // Clamp between 1 and 30
            let normalized = val;
            if (normalized < 1) normalized = 1;
            if (normalized > 30) normalized = 30;

            const hue = ((normalized - 1) / (29)) * 120;
            const color = `hsl(${hue}, 70%, 45%)`; // 70% Saturation, 45% Lightness for good text contrast

            return `background-color: ${color}; color: white;`;
        }

        /**
         * Applies the correct color style to a select element based on its value and type.
         */
        function applyColorToSelect($select, type) {
            const val = $select.val();
            let style = '';
            if (type === 'status') {
                style = getStatusStyle(val);
            } else if (type === 'priority') {
                style = getPriorityStyle(val);
            }
            $select.attr('style', style); // Overwrite inline styles to update color
        }


        // --- UI Element Creation ---

        // Wrap everything in a glass container
        const glassContainer = $('<div class="glass-dashboard"></div>').appendTo(page.body);

        const tabContainer = $(`
            <ul class="nav nav-tabs px-3">
                <li class="nav-item">
                    <a class="nav-link" href="javascript:void(0);" data-status="ActiveExternalProjects">Active External Projects</a>
                </li>
                <li class="nav-item">
                    <a class="nav-link" href="javascript:void(0);" data-status="ActiveInternalProjects">Active Internal Projects</a>
                </li>
                <li class="nav-item">
                    <a class="nav-link" href="javascript:void(0);" data-status="PriorityOverview">Priority Overview</a>
                </li>
                 <li class="nav-item">
                    <a class="nav-link" href="javascript:void(0);" data-status="PortfolioGantt">Portfolio Gantt</a>
                </li>
                <li class="nav-item">
                    <a class="nav-link" href="javascript:void(0);" data-status="TasksTree">Tasks Tree</a>
                </li>
            </ul>
        `).appendTo(glassContainer); // Append to glass container

        const controlsContainer = $(`
            <div class="project-dashboard-controls p-2 border-bottom">
                <div class="row align-items-center">
                    <div class="col-md-6 mb-2 mb-md-0">
                        <input type="text" class="form-control form-control-sm" id="project-search" placeholder="Search projects in this tab...">
                    </div>
                    <div class="col-md-6">
                        <div class="d-flex justify-content-end">
                            <div id="pending-changes-controls" class="mr-2" style="display: none;">
                                <div class="btn-group btn-group-sm">
                                    <button type="button" class="btn btn-glass-success" id="save-pending-changes">Save Changes</button>
                                    <button type="button" class="btn btn-glass-danger" id="discard-pending-changes">Discard Changes</button>
                                </div>
                            </div>
                            <div id="priority-view-toggle" class="mr-2" style="display: none;">
                                 <div class="btn-group btn-group-sm">
                                    <button type="button" class="btn btn-glass-neutral active" data-view="value_stream">By Value Stream</button>
                                    <button type="button" class="btn btn-glass-neutral" data-view="internal">By Internal</button>
                                    <button type="button" class="btn btn-glass-neutral" data-view="company">By Company</button>
                                </div>
                            </div>
                            <div class="input-group input-group-sm">
                                <div class="input-group-prepend"><span class="input-group-text">Sort Groups</span></div>
                                <select class="form-control" id="group-sort-order">
                                    <option value="custom">Custom</option>
                                    <option value="alpha_asc">A-Z</option>
                                    <option value="alpha_desc">Z-A</option>
                                    <option value="count_desc">By Count (High-Low)</option>
                                    <option value="count_asc">By Count (Low-High)</option>
                                </select>
                            </div>
                            <button class="btn btn-sm btn-glass-neutral ml-2" id="configure-sort" title="Configure Custom Order"><i class="fa fa-cog"></i></button>
                        </div>
                    </div>
                </div>
            </div>
        `).appendTo(glassContainer);

        const searchInput = controlsContainer.find('#project-search');
        const groupSortSelect = controlsContainer.find('#group-sort-order');
        const configureSortBtn = controlsContainer.find('#configure-sort');
        const priorityViewToggle = controlsContainer.find('#priority-view-toggle');

        let content = $(`<div class="project-dashboard-content p-3"></div>`).appendTo(glassContainer);
        let taskContent = $(`<div class="project-tasks-content p-3" style="display: none;"></div>`).appendTo(glassContainer);

        /**
         * Updates the URL hash to reflect the current state of the dashboard.
         */
        function updateURL(push = false) {
            const tab = activeTab;
            let params = new URLSearchParams();

            if (tab === 'TasksTree' && pageState.project) {
                params.set('project', pageState.project);
                // Task filters are now managed by TaskTreeManager internally,
                // but if we want to persist them in URL we would need to sync them.
                // For simplicity in this refactor, we are focusing on project selection state.
            } else if (tab !== 'TasksTree') {
                const searchTerm = searchInput.val();
                const groupSort = groupSortSelect.val();
                if (searchTerm) params.set('search', searchTerm);
                if (groupSort !== 'custom') params.set('sort', groupSort);
                if (tab === 'PriorityOverview') {
                    params.set('view', priorityView);
                }
            }

            const paramString = params.toString();
            const newHash = tab + (paramString ? `?${paramString}` : '');

            const method = push ? 'pushState' : 'replaceState';
            history[method](null, '', '#' + newHash);
        }

        /**
         * Parses the URL hash on page load to set the initial dashboard state.
         */
        function parseURLAndSetState() {
            const hash = window.location.hash.substring(1);
            if (!hash) {
                activeTab = 'ActiveExternalProjects';
                tabContainer.find(`.nav-link[data-status="${activeTab}"]`).addClass('active');
                updateURL();
                return;
            }

            const [tab, paramsString] = hash.split('?');
            const params = new URLSearchParams(paramsString);

            activeTab = tab || 'ActiveExternalProjects';
            pageState = Object.fromEntries(params.entries());

            tabContainer.find('.nav-link').removeClass('active');
            tabContainer.find(`.nav-link[data-status="${activeTab}"]`).addClass('active');

            if (activeTab !== 'TasksTree') {
                searchInput.val(pageState.search || '');
                groupSortSelect.val(pageState.sort || 'custom');
                if (activeTab === 'PriorityOverview') {
                    priorityView = pageState.view || 'value_stream';
                    priorityViewToggle.find('button').removeClass('active');
                    priorityViewToggle.find(`button[data-view="${priorityView}"]`).addClass('active');
                    priorityViewToggle.show();
                } else {
                    priorityViewToggle.hide();
                }
            }
        }

        /**
         * Main render function for the project views.
         */
        function renderDashboard(projects) {
            content.empty();
            if (activeTab === 'PortfolioGantt') {
                renderPortfolioGanttView();
                return;
            }

            if (!projects || projects.length === 0) {
                content.html('<p class="text-muted text-center p-4">No projects found in this view.</p>');
                return;
            }

            if (activeTab === 'PriorityOverview') {
                if (priorityView === 'company') {
                    renderCompanyPriorityView(projects);
                } else {
                    renderGroupedView(projects);
                }
            } else {
                renderGroupedView(projects);
            }
        }

        /**
         * Renders the 'Ranked Priority' view.
         */
        function renderRankedPriorityView(projects) {
            projects.sort((a, b) => {
                const priorityA = parseInt(a.custom_project_priority, 10) || Infinity;
                const priorityB = parseInt(b.custom_project_priority, 10) || Infinity;
                return priorityA - priorityB;
            });

            const table = $(`<table class="table table-bordered table-hover" style="font-size: 12px;"><thead class="thead-light"><tr><th data-sort="custom_project_priority">Priority</th><th data-sort="project_name">Project Name</th><th data-sort="name">Series</th><th data-sort="status">Status</th><th data-sort="tasks">Tasks</th><th data-sort="percent_complete">% Complete</th><th data-sort="expected_start_date">Expected Start Date</th><th data-sort="expected_end_date">Expected End Date</th><th data-sort="project_user">Assigned To</th></tr></thead><tbody></tbody></table>`).appendTo(content);
            const tableBody = table.find('tbody');

            projects.forEach(project => {
                const tasks_link = `<a href="/app/project-dashboard#TasksTree?project=${project.name}">${project.completed_tasks} / ${project.total_tasks}</a>`;
                const priorityOptions = priorityOptionsList.map(p => `<option value="${p}" ${project.custom_project_priority === p ? 'selected' : ''}>${p}</option>`).join('');
                const statusOptions = statusOptionsList.map(s => `<option value="${s}" ${project.status === s ? 'selected' : ''}>${s}</option>`).join('');
                const progress = project.percent_complete || 0;

                const priorityStyle = getPriorityStyle(project.custom_project_priority);
                const statusStyle = getStatusStyle(project.status);

                const row = $(`
                    <tr data-project-name="${project.name}">
                        <td><select class="form-control form-control-sm pill-select" data-field="custom_project_priority" style="${priorityStyle}">${priorityOptions}</select></td>
                        <td><a href="/app/project/${project.name}" class="font-weight-bold project-title-link">${project.project_name}</a></td>
                        <td><span class="project-series-text">${project.name}</span></td>
                        <td><select class="form-control form-control-sm pill-select" data-field="status" style="${statusStyle}">${statusOptions}</select></td>
                        <td>${tasks_link}</td>
                        <td><div class="progress" style="height: 15px;"><div class="progress-bar" role="progressbar" style="width: ${progress}%;" aria-valuenow="${progress}" aria-valuemin="0" aria-valuemax="100">${progress}%</div></div></td>
                        <td>${project.expected_start_date || ''}</td>
                        <td>${project.expected_end_date || ''}</td>
                        <td class="assignee-cell"><a href="#" class="project-assignee-link">${project.project_user || 'Unassigned'}</a></td>
                    </tr>
                `);
                tableBody.append(row);
            });
            updateSortIcons();
        }

        /**
         * Renders a standardized table for the 'By Company' priority view.
         */
        function _renderCompanyPriorityTable(container, projects) {
            const table = $(`<table class="table table-bordered table-hover" style="font-size: 12px;"><thead class="thead-light"><tr><th data-sort="custom_company_priority">Company Priority</th><th data-sort="project_name">Project Name</th><th data-sort="name">Series</th><th data-sort="status">Status</th><th data-sort="tasks">Tasks</th><th data-sort="percent_complete">% Complete</th><th data-sort="expected_start_date">Expected Start Date</th><th data-sort="expected_end_date">Expected End Date</th><th data-sort="project_user">Assigned To</th></tr></thead><tbody></tbody></table>`).appendTo(container);
            const tableBody = table.find('tbody');

            projects.forEach(project => {
                const tasks_link = `<a href="/app/project-dashboard#TasksTree?project=${project.name}">${project.completed_tasks} / ${project.total_tasks}</a>`;
                const statusOptions = statusOptionsList.map(s => `<option value="${s}" ${project.status === s ? 'selected' : ''}>${s}</option>`).join('');
                const companyPriorityValue = project.custom_company_priority || '';
                let companyPriorityOptions = '<option value="">Not Assigned</option>';
                for (let i = 1; i <= 30; i++) {
                    companyPriorityOptions += `<option value="${i}" ${companyPriorityValue == i ? 'selected' : ''}>${i}</option>`;
                }
                const progress = project.percent_complete || 0;

                const companyPriorityStyle = getPriorityStyle(companyPriorityValue);
                const statusStyle = getStatusStyle(project.status);

                const companyPriorityInput = `<select class="form-control form-control-sm pill-select" data-field="custom_company_priority" style="width: 120px; ${companyPriorityStyle}">${companyPriorityOptions}</select>`;

                const row = $(`
                    <tr data-project-name="${project.name}">
                        <td>${companyPriorityInput}</td>
                        <td><a href="/app/project/${project.name}" class="font-weight-bold project-title-link">${project.project_name}</a></td>
                        <td><span class="project-series-text">${project.name}</span></td>
                        <td><select class="form-control form-control-sm pill-select" data-field="status" style="${statusStyle}">${statusOptions}</select></td>
                        <td>${tasks_link}</td>
                        <td><div class="progress" style="height: 15px;"><div class="progress-bar progress-bar-sapphire-gradient" role="progressbar" style="width: ${progress}%;" aria-valuenow="${progress}" aria-valuemin="0" aria-valuemax="100">${progress}%</div></div></td>
                        <td>${project.expected_start_date || ''}</td>
                        <td>${project.expected_end_date || ''}</td>
                        <td class="assignee-cell"><a href="#" class="project-assignee-link">${project.project_user || 'Unassigned'}</a></td>
                    </tr>
                `);
                tableBody.append(row);
            });
        }

        /**
         * Renders the 'By Company' view.
         */
        function renderCompanyPriorityView(projects) {
            const groups = {
                'Company Priority Ranking': [],
                'Not Assigned': []
            };

            projects.forEach(p => {
                const companyPriority = parseInt(p.custom_company_priority, 10);
                if (!isNaN(companyPriority) && companyPriority >= 1 && companyPriority <= 30) {
                    groups['Company Priority Ranking'].push(p);
                } else if (p.project_type === 'Maintenance') {
                    groups['Company Priority Ranking'].push(p);
                } else if (p.project_type === 'Repair Visit') {
                    groups['Company Priority Ranking'].push(p);
                } else {
                    groups['Not Assigned'].push(p);
                }
            });

            groups['Company Priority Ranking'].sort((a, b) => {
                const priorityA = a.custom_company_priority ? parseInt(a.custom_company_priority, 10) : Infinity;
                const priorityB = b.custom_company_priority ? parseInt(b.custom_company_priority, 10) : Infinity;

                if (priorityA === Infinity && priorityB === Infinity) {
                    return a.project_name.localeCompare(b.project_name);
                }

                return priorityA - priorityB;
            });

            const groupOrder = ['Company Priority Ranking', 'Not Assigned'];

            groupOrder.forEach(groupName => {
                const groupProjects = groups[groupName];
                if (groupProjects.length === 0) return;

                if (groupName === 'Company Priority Ranking') {
                    _renderCompanyPriorityTable(content, groupProjects);
                } else {
                    const groupHeaderHTML = `<div class="collapsible-header glass-header p-2 my-1 rounded-sm cursor-pointer flex justify-between items-center" data-group-id="${groupName}"><div class="font-bold text-sm text-gray-700">${groupName} (${groupProjects.length})</div><svg style="height: 1rem; width: 1rem;" class="text-gray-600 transform transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg></div>`;
                    const groupHeader = $(groupHeaderHTML).appendTo(content);
                    const groupBody = $('<div class="collapsible-body" style="display: none;"></div>').appendTo(content);
                    _renderCompanyPriorityTable(groupBody, groupProjects);
                }
            });
        }

        /**
         * Renders the 'Portfolio Gantt' view.
         */
        function renderPortfolioGanttView() {
            content.html('<p class="text-muted text-center p-4">Loading Portfolio Gantt Chart...</p>');

            frappe.call({
                method: "project_enhancements.project_enhancements.page.project_dashboard.project_dashboard.get_all_projects_for_gantt",
                callback: function (r) {
                    if (r.message && !r.message.error && r.message.length > 0) {
                        content.empty();
                        const gantt_scroll_wrapper = $('<div class="gantt-scroll-wrapper"></div>').appendTo(content);
                        const gantt_container = $('<div class="gantt-container"></div>').appendTo(gantt_scroll_wrapper);

                        const today = new Date();
                        today.setHours(0, 0, 0, 0);

                        const projects = r.message.map(project => {
                            const startDate = new Date(project.start);
                            const helperStartDate = startDate < today ? today : startDate;

                            return {
                                ...project,
                                start: frappe.datetime.date_to_str(helperStartDate),
                                custom_start_date: project.start,
                            };
                        });

                        new Gantt(gantt_container[0], projects, {
                            view_mode: 'Month',
                            on_click: (project) => {
                                frappe.set_route('List', 'Task', 'Gantt', { project: project.id });
                            },
                             custom_popup_html: function(project) {
                                const startDate = frappe.datetime.str_to_user(project.custom_start_date);
                                const endDate = frappe.datetime.str_to_user(project.end);
                                return `
                                    <div class="gantt-popup">
                                        <h4>${project.name}</h4>
                                        <p><strong>Start:</strong> ${startDate}</p>
                                        <p><strong>End:</strong> ${endDate}</p>
                                        <p><strong>Progress:</strong> ${project.progress}%</p>
                                    </div>
                                `;
                            }
                        });
                    } else if (r.message && r.message.length === 0) {
                        content.html('<p class="text-muted text-center p-4">No active projects with start dates were found to display in the Gantt chart.</p>');
                    } else {
                        content.html(`<p class="text-danger text-center p-4">Error: ${r.message ? r.message.error : 'Could not load Gantt chart data.'}</p>`);
                    }
                }
            });
        }

        /**
         * Renders the default 'Grouped' view.
         */
        function renderGroupedView(projects) {
            const groupedProjects = projects.reduce((acc, project) => {
                const type = project.project_type || 'Uncategorized';
                if (!acc[type]) acc[type] = [];
                acc[type].push(project);
                return acc;
            }, {});

            const sortOrder = groupSortSelect.val();
            let sortedGroupKeys = Object.keys(groupedProjects);

            if (sortOrder === 'custom') {
                const customOrder = JSON.parse(localStorage.getItem('projectDashboardSortOrder') || '[]');
                sortedGroupKeys.sort((a, b) => {
                    let indexA = customOrder.indexOf(a), indexB = customOrder.indexOf(b);
                    if (indexA === -1) indexA = Infinity;
                    if (indexB === -1) indexB = Infinity;
                    if (indexA === indexB) return a.localeCompare(b);
                    return indexA - indexB;
                });
            } else {
                sortedGroupKeys.sort((a, b) => {
                    switch (sortOrder) {
                        case 'alpha_desc': return b.localeCompare(a);
                        case 'count_desc': return groupedProjects[b].length - groupedProjects[a].length;
                        case 'count_asc': return groupedProjects[a].length - groupedProjects[b].length;
                        default: return a.localeCompare(b);
                    }
                });
            }

            sortedGroupKeys.forEach(type => {
                const projectsInGroup = groupedProjects[type];
                const groupHeaderHTML = `<div class="collapsible-header glass-header p-2 my-1 rounded-sm cursor-pointer flex justify-between items-center" data-group-id="${type}"><div class="font-bold text-sm text-gray-700">${type} (${projectsInGroup.length})</div><svg style="height: 1rem; width: 1rem;" class="text-gray-600 transform transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg></div>`;
                const groupHeader = $(groupHeaderHTML).appendTo(content);
                const groupBody = $('<div class="collapsible-body" style="display: none;"></div>').appendTo(content);
                const table = $(`<table class="table table-bordered table-hover" style="font-size: 12px;"><thead class="thead-light"><tr><th data-sort="project_name">Project Name</th><th data-sort="name">Series</th><th data-sort="status">Status</th><th data-sort="custom_project_priority">Priority</th><th data-sort="tasks">Tasks</th><th data-sort="percent_complete">% Complete</th><th data-sort="expected_start_date">Expected Start Date</th><th data-sort="expected_end_date">Expected End Date</th><th data-sort="project_user">Assigned To</th></tr></thead><tbody></tbody></table>`).appendTo(groupBody);
                const tableBody = table.find('tbody');

                projectsInGroup.sort((a, b) => {
                    if (activeTab === 'PriorityOverview' && (priorityView === 'value_stream' || priorityView === 'internal')) {
                        const priorityA = parseInt(a.custom_project_priority, 10) || Infinity;
                        const priorityB = parseInt(b.custom_project_priority, 10) || Infinity;
                        return priorityA - priorityB;
                    }

                    let valA = a[currentSort.field] || '', valB = b[currentSort.field] || '';
                    if (currentSort.field === 'tasks') {
                        valA = a.completed_tasks / (a.total_tasks || 1);
                        valB = b.completed_tasks / (b.total_tasks || 1);
                    }
                    if (typeof valA === 'string') valA = valA.toLowerCase();
                    if (typeof valB === 'string') valB = valB.toLowerCase();
                    if (valA < valB) return currentSort.order === 'asc' ? -1 : 1;
                    if (valA > valB) return currentSort.order === 'asc' ? 1 : -1;
                    return 0;
                });

                projectsInGroup.forEach(project => {
                    const statusOptions = statusOptionsList.map(s => `<option value="${s}" ${project.status === s ? 'selected' : ''}>${s}</option>`).join('');
                    const priorityOptions = priorityOptionsList.map(p => `<option value="${p}" ${project.custom_project_priority === p ? 'selected' : ''}>${p}</option>`).join('');
                    const progress = project.percent_complete || 0;

                    const statusStyle = getStatusStyle(project.status);
                    const priorityStyle = getPriorityStyle(project.custom_project_priority);

                    const rowHTML = `
                        <tr data-project-name="${project.name}">
                            <td><a href="/app/project/${project.name}" class="font-weight-bold project-title-link">${project.project_name}</a></td>
                            <td><span class="project-series-text">${project.name}</span></td>
                            <td>
                                <select class="form-control form-control-sm pill-select" data-field="status" style="${statusStyle}">
                                    ${statusOptions}
                                </select>
                            </td>
                            <td>
                                <select class="form-control form-control-sm pill-select" data-field="custom_project_priority" style="${priorityStyle}">
                                    ${priorityOptions}
                                </select>
                            </td>
                            <td><a href="/app/project-dashboard#TasksTree?project=${project.name}">${project.completed_tasks} / ${project.total_tasks}</a></td>
                            <td><div class="progress" style="height: 15px;"><div class="progress-bar progress-bar-sapphire-gradient" role="progressbar" style="width: ${progress}%;" aria-valuenow="${progress}" aria-valuemin="0" aria-valuemax="100">${progress}%</div></div></td>
                            <td>${project.expected_start_date || ''}</td>
                            <td>${project.expected_end_date || ''}</td>
                            <td>${project.project_user || ''}</td>
                            <td class="assignee-cell">${project.project_user || ''}</td>
                        </tr>`;
                    tableBody.append(rowHTML);
                });

                if (expandedGroups.has(type)) {
                    groupHeader.next('.collapsible-body').show();
                    groupHeader.find('svg').addClass('rotate-180');
                }
            });

            updateSortIcons();
        }

        /**
         * Filters the master project list based on the active tab and search term, then
         * triggers a re-render of the appropriate view (project or task).
         */
        function applyFiltersAndRender() {
            const is_task_view = activeTab === 'TasksTree';
            content.toggle(!is_task_view);
            taskContent.toggle(is_task_view);
            controlsContainer.toggle(!is_task_view && activeTab !== 'PortfolioGantt');


            if (is_task_view) {
                if (pageState.project) {
                    loadAndRenderTasks(pageState.project);
                } else {
                    renderProjectSelectionForTasks();
                }
                return;
            }

            if (activeTab === 'PortfolioGantt') {
                renderDashboard([]);
                return;
            }

            let filteredProjects;
            if (activeTab === 'PriorityOverview') {
                if (priorityView === 'value_stream') {
                    const allowedTypes = ["External", "Design", "Build", "Service", "Rent"];
                    filteredProjects = allProjects.filter(p => p.is_active === 'Yes' && allowedTypes.includes(p.project_type));
                } else if (priorityView === 'internal') {
                    const allowedTypes = ["Internal", "Group Projects", "Organizational Projects", "Other"];
                    filteredProjects = allProjects.filter(p => p.is_active === 'Yes' && allowedTypes.includes(p.project_type));
                } else if (priorityView === 'company') {
                    filteredProjects = allProjects.filter(p => p.is_active === 'Yes');
                } else {
                    // Fallback
                    filteredProjects = allProjects.filter(p => p.is_active === 'Yes');
                }
            } else if (activeTab === 'ActiveExternalProjects') {
                const allowedTypes = ["External", "Design", "Build", "Service", "Rent"];
                filteredProjects = allProjects.filter(p => p.is_active === 'Yes' && allowedTypes.includes(p.project_type));
            } else if (activeTab === 'ActiveInternalProjects') {
                const allowedTypes = ["Group Projects", "Internal", "Organizational Projects", "Other"];
                filteredProjects = allProjects.filter(p => p.is_active === 'Yes' && allowedTypes.includes(p.project_type));
            } else {
                // Fallback (shouldn't happen with current tabs)
                filteredProjects = allProjects.filter(p => p.is_active === 'Yes');
            }

            const searchTerm = searchInput.val().toLowerCase();
            if (searchTerm) {
                filteredProjects = filteredProjects.filter(p =>
                    Object.values(p).some(val =>
                        String(val).toLowerCase().includes(searchTerm)
                    )
                );
            }
            renderDashboard(filteredProjects);
        }

        /**
         * Renders the project selection interface for the 'Tasks Tree' tab.
         */
        function renderProjectSelectionForTasks() {
            taskContent.empty();
            const activeProjects = allProjects.filter(p => p.is_active === 'Yes');

            if (activeProjects.length === 0) {
                taskContent.html('<p class="text-muted text-center p-4">No active projects found.</p>');
                return;
            }

            const groupedProjects = activeProjects.reduce((acc, project) => {
                const type = project.project_type || 'Uncategorized';
                if (!acc[type]) acc[type] = [];
                acc[type].push(project);
                return acc;
            }, {});

            const sortedGroupKeys = Object.keys(groupedProjects).sort((a, b) => a.localeCompare(b));

            sortedGroupKeys.forEach(type => {
                const projectsInGroup = groupedProjects[type];
                const groupHeaderHTML = `<div class="collapsible-header glass-header p-2 my-1 rounded-sm cursor-pointer flex justify-between items-center" data-group-id="${type}"><div class="font-bold text-sm text-gray-700">${type} (${projectsInGroup.length})</div><svg style="height: 1rem; width: 1rem;" class="text-gray-600 transform transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg></div>`;
                const groupHeader = $(groupHeaderHTML).appendTo(taskContent);
                const groupBody = $('<div class="collapsible-body" style="display: none;"></div>').appendTo(taskContent);
                const listGroup = $('<ul class="list-group list-group-flush"></ul>').appendTo(groupBody);

                projectsInGroup.sort((a, b) => a.project_name.localeCompare(b.project_name));

                projectsInGroup.forEach(project => {
                    $(`
                        <li class="list-group-item d-flex justify-content-between align-items-center">
                            <a href="/app/project/${project.name}" class="font-weight-bold project-title-link">${project.project_name}</a>
                            <button class="btn btn-vibrant-blue btn-sm view-tasks-btn" data-project="${project.name}">View Tasks</button>
                        </li>
                        `).appendTo(listGroup);
                });

                if (expandedGroups.has(type)) {
                    groupHeader.next('.collapsible-body').show();
                    groupHeader.find('svg').addClass('rotate-180');
                }
            });
        }

        /**
         * Fetches and renders the task tree for a specific project using the new TaskTreeManager.
         */
        function loadAndRenderTasks(project_name) {
            const project = allProjects.find(p => p.name === project_name);
            if (!project) {
                taskContent.html(`<div class="alert alert-danger">Project not found: ${project_name}</div>`);
                pageState.project = null;
                updateURL();
                renderProjectSelectionForTasks();
                return;
            }

            taskContent.empty();

            // Header with Back Button
            const header = $(`
                <div class="d-flex align-items-center mb-3">
                    <button class="btn btn-sm btn-glass-neutral mr-3 back-to-projects-btn"><i class="fa fa-arrow-left mr-1"></i> Back to Projects</button>
                    <h4 class="mb-0">${project.project_name}</h4>
                </div>
                <div class="task-tree-wrapper"></div>
            `).appendTo(taskContent);

            const treeWrapper = header.filter('.task-tree-wrapper').add(header.find('.task-tree-wrapper')).first();

            // Instantiate the Shared Manager
            new project_enhancements.TaskTreeManager({
                wrapper: treeWrapper,
                projectName: project_name
            });

            // Handle Back Navigation
            taskContent.on('click', '.back-to-projects-btn', function() {
                pageState.project = null;
                activeTab = 'TasksTree';
                updateURL(true);
                applyFiltersAndRender();
            });
        }

        /**
         * Updates sort indicator icons in the project tables headers.
         */
        function updateSortIcons() {
            content.find('thead th').removeClass('sorted-asc sorted-desc');
            const currentTh = content.find(`thead th[data-sort="${currentSort.field}"]`);
            currentTh.addClass(currentSort.order === 'asc' ? 'sorted-asc' : 'sorted-desc');
        }

        /**
         * Opens a dialog for configuring the custom sort order of project groups.
         */
        function openSortConfiguration() {
            const groupedProjects = allProjects.reduce((acc, p) => {
                const type = p.project_type || 'Uncategorized';
                acc[type] = true;
                return acc;
            }, {});

            const customOrder = JSON.parse(localStorage.getItem('projectDashboardSortOrder') || '[]');
            let groupKeys = Object.keys(groupedProjects);

            groupKeys.sort((a, b) => {
                let indexA = customOrder.indexOf(a), indexB = customOrder.indexOf(b);
                if (indexA === -1) indexA = Infinity;
                if (indexB === -1) indexB = Infinity;
                if (indexA === indexB) return a.localeCompare(b);
                return indexA - indexB;
            });

            const dialog = new frappe.ui.Dialog({
                title: 'Configure Custom Group Order',
                fields: [{ fieldname: 'sort_info', fieldtype: 'HTML', options: `<p class="text-muted">Drag and drop the project types to set your preferred order.</p><ul id="sortable-list" class="list-group"></ul>` }],
                primary_action_label: 'Save Order',
                primary_action: () => {
                    const newOrder = sortable.toArray();
                    localStorage.setItem('projectDashboardSortOrder', JSON.stringify(newOrder));
                    groupSortSelect.val('custom');
                    applyFiltersAndRender();
                    dialog.hide();
                }
            });
            dialog.show();

            const listElement = dialog.get_field('sort_info').$wrapper.find('#sortable-list')[0];
            groupKeys.forEach(key => {
                $(listElement).append(`<li class="list-group-item" data-id="${key}"><i class="fa fa-bars mr-2 text-muted"></i> ${key}</li>`);
            });

            const sortable = new Sortable(listElement, { animation: 150, ghostClass: 'sortable-chosen' });
        }

        /**
         * Shows a dialog to manage multiple assignees for a project.
         */
        function showProjectAssigneeDialog(assigneeLink) {
            const projectRow = assigneeLink.closest('tr');
            const projectName = projectRow.data('project-name');
            const projectTitle = projectRow.find('td:nth-child(2) a').text();

            let project = allProjects.find(p => p.name === projectName);

            if (!project) {
                frappe.show_alert({ message: 'Could not find project details.', indicator: 'red' });
                return;
            }

            const dialog = new frappe.ui.Dialog({
                title: `Assignments for: ${projectTitle}`,
                fields: [
                    {
                        fieldname: 'assign_to',
                        fieldtype: 'Link',
                        options: 'User',
                        label: 'Assign a user',
                        description: 'Select a user to add them to the project.'
                    },
                    {
                        fieldname: 'assignees_html',
                        fieldtype: 'HTML',
                        options: '<div class="assignee-list-wrapper mt-3"></div>'
                    }
                ]
            });

            const assigneeWrapper = dialog.get_field('assignees_html').$wrapper;
            const assigneeListWrapper = assigneeWrapper.find('.assignee-list-wrapper');

            function renderAssignees() {
                assigneeListWrapper.empty();
                if (project.assignees && project.assignees.length > 0) {
                    const assigneeItems = project.assignees.map(assignee => `
                        <li class="list-group-item d-flex justify-content-between align-items-center">
                            ${assignee.full_name}
                    <button class="btn btn-xs btn-danger remove-assignee" data-user-id="${assignee.email}">Remove</button>
                        </li>
                        `).join('');
                    assigneeListWrapper.html(`<ul class="list-group">${assigneeItems}</ul>`);
                } else {
                    assigneeListWrapper.html('<p class="text-muted">No users are assigned to this project.</p>');
                }
            }

            function updateProjectRowAssignees() {
                const newAssigneeText = project.assignees && project.assignees.length > 0
                    ? project.assignees.map(a => a.full_name).join(', ')
                    : 'Unassigned';
                assigneeLink.text(newAssigneeText);
                project.project_user = newAssigneeText; // Update the underlying data model
            }

            dialog.get_field('assign_to').df.onchange = () => {
                const userId = dialog.get_value('assign_to');
                if (!userId) return;

                if (project.assignees && project.assignees.find(a => a.email === userId)) {
                    frappe.show_alert({ message: 'User is already assigned.', indicator: 'info' });
                    dialog.set_value('assign_to', '');
                    return;
                }

                frappe.call({
                    method: 'project_enhancements.project_enhancements.page.project_dashboard.project_dashboard.add_project_assignee',
                    args: { project_name: projectName, user_id: userId },
                    callback: function (r) {
                        if (r.message && r.message.status === 'success') {
                            project.assignees = r.message.assignees;
                            renderAssignees();
                            updateProjectRowAssignees();
                            dialog.set_value('assign_to', '');
                        } else {
                            frappe.show_alert({ message: r.message.message || 'Could not assign user.', indicator: 'red' });
                        }
                    }
                });
            };

            assigneeListWrapper.on('click', '.remove-assignee', function () {
                const userId = $(this).data('user-id');
                frappe.call({
                    method: 'project_enhancements.project_enhancements.page.project_dashboard.project_dashboard.remove_project_assignee',
                    args: { project_name: projectName, user_id: userId },
                    callback: function (r) {
                        if (r.message && r.message.status === 'success') {
                            project.assignees = r.message.assignees;
                            renderAssignees();
                            updateProjectRowAssignees();
                        } else {
                            frappe.show_alert({ message: r.message.message || 'Could not remove user.', indicator: 'red' });
                        }
                    }
                });
            });

            dialog.show();
            renderAssignees();
        }

        /**
         * Loads all initial data required for the dashboard to function.
         */
        function loadInitialData() {
            parseURLAndSetState();

            const fetchPriorities = frappe.call({ method: "project_enhancements.project_enhancements.page.project_dashboard.project_dashboard.get_priority_options" }).then(r => {
                priorityOptionsList = (r.message && !r.message.error) ? r.message : ['High', 'Medium', 'Low'];
            });
            const fetchStatuses = frappe.call({ method: "project_enhancements.project_enhancements.page.project_dashboard.project_dashboard.get_status_options" }).then(r => {
                statusOptionsList = (r.message && !r.message.error) ? r.message : ['Active', 'On Hold', 'Canceled', 'Completed', 'Invoiced'];
            });
            const fetchProjects = frappe.call({ method: "project_enhancements.project_enhancements.page.project_dashboard.project_dashboard.get_project_data" });

            Promise.all([fetchPriorities, fetchStatuses, fetchProjects]).then(results => {
                const r_proj = results[2];
                if (r_proj.message && !r_proj.message.error) {
                    allProjects = r_proj.message;
                    applyFiltersAndRender();
                } else {
                    content.html(`<p class="text-danger">Error: ${r_proj.message ? r_proj.message.error : 'An unexpected error occurred.'}</p>`);
                }
            }).catch(err => {
                console.error("Error loading initial data", err);
                content.html(`<p class="text-danger">A critical error occurred. Please check the console.</p>`);
            });
        }

        // --- Event Listeners ---
        searchInput.on('keyup', frappe.utils.debounce(() => { applyFiltersAndRender(); updateURL(); }, 300));
        groupSortSelect.on('change', () => { applyFiltersAndRender(); updateURL(); });
        configureSortBtn.on('click', openSortConfiguration);
        tabContainer.on('click', '.nav-link', function (e) {
            e.preventDefault();
            const clickedTab = $(this);
            if (clickedTab.hasClass('active')) return;

            const hasPendingChanges = Object.keys(pendingProjectChanges).length > 0;

            if (hasPendingChanges) {
                frappe.confirm(
                    'You have unsaved changes. Are you sure you want to switch tabs and discard them?',
                    () => {
                        discardAllPendingChanges();
                        proceedWithTabSwitch(clickedTab);
                    },
                    () => {}
                );
            } else {
                proceedWithTabSwitch(clickedTab);
            }
        });

        function proceedWithTabSwitch(clickedTab) {
            tabContainer.find('.nav-link').removeClass('active');
            clickedTab.addClass('active');
            activeTab = clickedTab.data('status');
            pageState = {};
            searchInput.val('');
            priorityViewToggle.toggle(activeTab === 'PriorityOverview');
            updateURL(true);
            applyFiltersAndRender();
        }
        priorityViewToggle.on('click', 'button', function () { const $btn = $(this); if ($btn.hasClass('active')) return; priorityViewToggle.find('button').removeClass('active'); $btn.addClass('active'); priorityView = $btn.data('view'); updateURL(); applyFiltersAndRender(); });
        $(page.body).on('click', '.collapsible-header', function () { const groupId = $(this).data('group-id'); const body = $(this).next('.collapsible-body'); body.slideToggle(200); $(this).find('svg').toggleClass('rotate-180'); if (body.is(':visible')) { expandedGroups.add(groupId); } else { expandedGroups.delete(groupId); } });

        content.on('click', 'a[href*="#TasksTree"]', function (e) {
            e.preventDefault();
            const url = new URL($(this).attr('href'), window.location.origin);
            const params = new URLSearchParams(url.hash.split('?')[1]);
            const projectName = params.get('project');

            if (!projectName) {
                console.error("Could not find project name in link.", this);
                return;
            }

            activeTab = 'TasksTree';
            pageState = { project: projectName };

            tabContainer.find('.nav-link').removeClass('active');
            tabContainer.find('.nav-link[data-status="TasksTree"]').addClass('active');
            priorityViewToggle.hide();

            updateURL(true);
            applyFiltersAndRender();
        });

        taskContent.on('click', '.view-tasks-btn', function () { pageState.project = $(this).data('project'); updateURL(true); loadAndRenderTasks(pageState.project); });
        // Back button is now handled inside loadAndRenderTasks

        content.on('click', 'thead th', function () { const field = $(this).data('sort'); if (!field) return; if (currentSort.field === field) { currentSort.order = currentSort.order === 'asc' ? 'desc' : 'asc'; } else { currentSort.field = field; currentSort.order = 'asc'; } applyFiltersAndRender(); });

        content.on('change', 'select, input[type="number"]', function () {
            const element = $(this);
            const projectName = element.closest('tr').data('project-name');
            const field = element.data('field');
            const value = element.val();

            if (element.hasClass('pill-select')) {
                if (field === 'status') {
                    applyColorToSelect(element, 'status');
                } else if (field === 'custom_project_priority' || field === 'custom_company_priority') {
                    applyColorToSelect(element, 'priority');
                }
            }

            if (!pendingProjectChanges[projectName]) {
                pendingProjectChanges[projectName] = {};
            }
            pendingProjectChanges[projectName][field] = value;

            $('#pending-changes-controls').show();

            const project = allProjects.find(p => p.name === projectName);
            if (project) {
                project[field] = value;
            }
        });

        content.on('click', '.project-assignee-link', function (e) { e.preventDefault(); showProjectAssigneeDialog($(this)); });

        function saveAllPendingChanges() {
            frappe.call({
                method: 'project_enhancements.project_enhancements.page.project_dashboard.project_dashboard.update_multiple_docs',
                args: {
                    project_updates: JSON.stringify(pendingProjectChanges),
                    task_updates: '{}' // Task updates handled by Manager now
                },
                callback: function (r) {
                    if (r.message && r.message.status === 'success') {
                        frappe.show_alert({ message: 'Changes saved!', indicator: 'green' });
                        pendingProjectChanges = {};
                        $('#pending-changes-controls').hide();
                    } else {
                        frappe.show_alert({ message: r.message.message || 'Error saving changes.', indicator: 'red' });
                        loadInitialData();
                    }
                }
            });
        }

        $(page.body).on('click', '#save-pending-changes', saveAllPendingChanges);

        function discardAllPendingChanges() {
            pendingProjectChanges = {};
            $('#pending-changes-controls').hide();
            loadInitialData();
            frappe.show_alert({ message: 'Changes discarded.', indicator: 'info' });
        }

        $(page.body).on('click', '#discard-pending-changes', discardAllPendingChanges);

        window.addEventListener('popstate', () => { if (allProjects.length > 0) { parseURLAndSetState(); applyFiltersAndRender(); } else { window.location.reload(); } });

        // --- Initial Load ---
        loadInitialData();
    }
}
