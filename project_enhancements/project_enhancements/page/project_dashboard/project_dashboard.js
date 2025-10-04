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
frappe.pages['project-dashboard'].on_page_load = function(wrapper) {
    const page = frappe.ui.make_app_page({
        parent: wrapper,
        title: 'Projects Dashboard',
        single_column: true
    });

    // Check permissions before rendering the main dashboard.
    frappe.call({
        method: "project_enhancements.project_enhancements.page.project_dashboard.project_dashboard.check_permission",
        callback: function(r) {
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
        console.log("Loading Project Dashboard JS - Version 5.3 (Priority View and Collapse Fix)");

        // Dynamically load SortableJS library for drag-and-drop functionality.
        const script_url = "https://cdn.jsdelivr.net/npm/sortablejs@latest/Sortable.min.js";
        frappe.require(script_url, () => {});

        // --- State Variables ---
        let allProjects = [];
        let priorityOptionsList = [];
        let statusOptionsList = [];
        let taskStatusOptionsList = [];
        let currentSort = { field: 'project_name', order: 'asc' };
        let activeTab = 'ActiveProjects';
        let priorityView = 'grouped'; // 'grouped' or 'ranked'
        let expandedGroups = new Set();
        let currentTaskSort = { field: 'subject', order: 'asc' };
        let currentProjectTasks = []; // Holds the original, unfiltered task tree for a project.
        let pageState = {}; // Holds the state parsed from the URL hash.
        let taskSortableInstance = null;

        // --- UI Element Creation ---
        const tabContainer = $(`
            <ul class="nav nav-tabs px-3">
                <li class="nav-item">
                    <a class="nav-link" href="javascript:void(0);" data-status="ActiveProjects">Active Projects</a>
                </li>
                <li class="nav-item">
                    <a class="nav-link" href="javascript:void(0);" data-status="InactiveProjects">Inactive Projects</a>
                </li>
                <li class="nav-item">
                    <a class="nav-link" href="javascript:void(0);" data-status="PriorityOverview">Priority Overview</a>
                </li>
                <li class="nav-item">
                    <a class="nav-link" href="javascript:void(0);" data-status="TasksTree">Tasks Tree</a>
                </li>
            </ul>
        `).prependTo(page.body);

        const controlsContainer = $(`
            <div class="project-dashboard-controls p-2 border-bottom bg-light">
                <div class="row align-items-center">
                    <div class="col-md-6 mb-2 mb-md-0">
                        <input type="text" class="form-control form-control-sm" id="project-search" placeholder="Search projects in this tab...">
                    </div>
                    <div class="col-md-6">
                        <div class="d-flex justify-content-end">
                            <div id="priority-view-toggle" class="mr-2" style="display: none;">
                                 <div class="btn-group btn-group-sm">
                                    <button type="button" class="btn btn-secondary active" data-view="grouped">By Type</button>
                                    <button type="button" class="btn btn-secondary" data-view="ranked">By Priority</button>
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
                            <button class="btn btn-sm btn-secondary ml-2" id="configure-sort" title="Configure Custom Order"><i class="fa fa-cog"></i></button>
                        </div>
                    </div>
                </div>
            </div>
        `).appendTo(page.body);

        const searchInput = controlsContainer.find('#project-search');
        const groupSortSelect = controlsContainer.find('#group-sort-order');
        const configureSortBtn = controlsContainer.find('#configure-sort');
        const priorityViewToggle = controlsContainer.find('#priority-view-toggle');

        let content = $(`<div class="project-dashboard-content p-3"></div>`).appendTo(page.body);
        let taskContent = $(`<div class="project-tasks-content p-3" style="display: none;"></div>`).appendTo(page.body);

        /**
         * Updates the URL hash to reflect the current state of the dashboard.
         * This allows for bookmarking and sharing specific views/filters.
         * @param {boolean} [push=false] - If true, creates a new entry in the browser's
         * history, allowing the user to use the back button.
         */
        function updateURL(push = false) {
            const tab = activeTab;
            let params = new URLSearchParams();

            if (tab === 'TasksTree' && pageState.project) {
                params.set('project', pageState.project);
                const taskNameFilter = taskContent.find('#task-name-filter').val();
                const taskOwnerFilter = taskContent.find('#task-owner-filter').val();
                const taskStatusFilter = taskContent.find('#task-status-filter').val();
                if (taskNameFilter) params.set('task_name', taskNameFilter);
                if (taskOwnerFilter) params.set('task_owner', taskOwnerFilter);
                if (taskStatusFilter) params.set('task_status', taskStatusFilter);
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
         * This function reads the tab, search terms, and other view parameters
         * from the URL and applies them to the UI.
         */
        function parseURLAndSetState() {
            const hash = window.location.hash.substring(1);
            if (!hash) {
                activeTab = 'ActiveProjects';
                tabContainer.find(`.nav-link[data-status="${activeTab}"]`).addClass('active');
                updateURL();
                return;
            }

            const [tab, paramsString] = hash.split('?');
            const params = new URLSearchParams(paramsString);

            activeTab = tab || 'ActiveProjects';
            pageState = Object.fromEntries(params.entries());

            tabContainer.find('.nav-link').removeClass('active');
            tabContainer.find(`.nav-link[data-status="${activeTab}"]`).addClass('active');

            if (activeTab !== 'TasksTree') {
                searchInput.val(pageState.search || '');
                groupSortSelect.val(pageState.sort || 'custom');
                if (activeTab === 'PriorityOverview') {
                    priorityView = pageState.view || 'grouped';
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
         *
         * Clears the content area and calls the appropriate rendering function
         * based on the currently active tab and view mode (e.g., grouped vs. ranked).
         *
         * @param {Array<object>} projects - The array of project objects to render.
         */
        function renderDashboard(projects) {
            content.empty();
            if (!projects || projects.length === 0) {
                content.html('<p class="text-muted text-center p-4">No projects found in this view.</p>');
                return;
            }

            if (activeTab === 'PriorityOverview' && priorityView === 'ranked') {
                renderRankedPriorityView(projects);
            } else {
                renderGroupedView(projects);
            }
        }

        /**
         * Renders the 'Ranked Priority' view.
         *
         * Displays projects in a simple table, sorted numerically by their
         * priority, for a quick overview of the most important projects.
         *
         * @param {Array<object>} projects - The array of project objects to render.
         */
        function renderRankedPriorityView(projects) {
            projects.sort((a, b) => {
                const priorityA = parseInt(a.custom_project_priority, 10) || Infinity;
                const priorityB = parseInt(b.custom_project_priority, 10) || Infinity;
                return priorityA - priorityB;
            });

            const table = $(`<table class="table table-bordered table-hover" style="font-size: 12px;"><thead class="thead-light"><tr><th data-sort="custom_project_priority">Priority</th><th data-sort="project_name">Project Name</th><th data-sort="name">Series</th><th data-sort="status">Status</th><th data-sort="tasks">Tasks</th><th data-sort="project_user">Assigned To</th></tr></thead><tbody></tbody></table>`).appendTo(content);
            const tableBody = table.find('tbody');

            projects.forEach(project => {
                const tasks_link = `<a href="/app/project-dashboard#TasksTree?project=${project.name}">${project.completed_tasks} / ${project.total_tasks}</a>`;
                const rowHTML = `<tr><td class="${getPriorityClass(project.custom_project_priority)}">${project.custom_project_priority || ''}</td><td><a href="/app/project/${project.name}" class="font-weight-bold">${project.project_name}</a></td><td>${project.name}</td><td><span class="badge ${getStatusClass(project.status)}">${project.status}</span></td><td>${tasks_link}</td><td>${project.project_user || ''}</td></tr>`;
                tableBody.append(rowHTML);
            });
            updateSortIcons();
        }

        /**
         * Renders the default 'Grouped' view.
         *
         * Groups projects by their 'project_type', creating a collapsible section
         * for each type. The order of these groups and the sorting of projects
         * within each group are user-configurable.
         *
         * @param {Array<object>} projects - The array of project objects to render.
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
                const groupHeaderHTML = `<div class="collapsible-header bg-light p-2 my-1 rounded-sm cursor-pointer flex justify-between items-center border" data-group-id="${type}"><div class="font-bold text-sm text-gray-700">${type} (${projectsInGroup.length})</div><svg style="height: 1rem; width: 1rem;" class="text-gray-600 transform transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg></div>`;
                const groupHeader = $(groupHeaderHTML).appendTo(content);
                const groupBody = $('<div class="collapsible-body" style="display: none;"></div>').appendTo(content);
                const table = $(`<table class="table table-bordered table-hover" style="font-size: 12px;"><thead class="thead-light"><tr><th data-sort="project_name">Project Name</th><th data-sort="name">Series</th><th data-sort="status">Status</th><th data-sort="custom_project_priority">Priority</th><th data-sort="tasks">Tasks</th><th data-sort="project_user">Assigned To</th></tr></thead><tbody></tbody></table>`).appendTo(groupBody);
                const tableBody = table.find('tbody');

                projectsInGroup.sort((a, b) => {
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

                    const rowHTML = `
                        <tr data-project-name="${project.name}">
                            <td><a href="/app/project/${project.name}" class="font-weight-bold">${project.project_name}</a></td>
                            <td>${project.name}</td>
                            <td>
                                <select class="form-control form-control-sm" data-field="status">
                                    ${statusOptions}
                                </select>
                            </td>
                            <td>
                                <select class="form-control form-control-sm" data-field="custom_project_priority">
                                    ${priorityOptions}
                                </select>
                            </td>
                            <td><a href="/app/project-dashboard#TasksTree?project=${project.name}">${project.completed_tasks} / ${project.total_tasks}</a></td>
                            <td>${project.project_user || ''}</td>
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
            controlsContainer.toggle(!is_task_view);

            if (is_task_view) {
                if (pageState.project) {
                    loadAndRenderTasks(pageState.project);
                } else {
                    renderProjectSelectionForTasks();
                }
                return;
            }

            let filteredProjects;
            if (activeTab === 'PriorityOverview') {
                filteredProjects = allProjects.filter(p => p.is_active === 'Yes' && p.status !== 'Completed' && p.status !== 'Cancelled');
            } else {
                const isActiveFilter = activeTab === 'ActiveProjects' ? 'Yes' : 'No';
                filteredProjects = allProjects.filter(p => p.is_active === isActiveFilter);
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
         * This view is shown when no specific project has been selected yet,
         * allowing the user to choose a project to view its tasks.
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
                const groupHeaderHTML = `<div class="collapsible-header bg-light p-2 my-1 rounded-sm cursor-pointer flex justify-between items-center border" data-group-id="${type}"><div class="font-bold text-sm text-gray-700">${type} (${projectsInGroup.length})</div><svg style="height: 1rem; width: 1rem;" class="text-gray-600 transform transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg></div>`;
                const groupHeader = $(groupHeaderHTML).appendTo(taskContent);
                const groupBody = $('<div class="collapsible-body" style="display: none;"></div>').appendTo(taskContent);
                const listGroup = $('<ul class="list-group list-group-flush"></ul>').appendTo(groupBody);

                projectsInGroup.sort((a, b) => a.project_name.localeCompare(b.project_name));

                projectsInGroup.forEach(project => {
                    $(`
                        <li class="list-group-item d-flex justify-content-between align-items-center">
                            <a href="/app/project/${project.name}" class="font-weight-bold">${project.project_name}</a>
                            <button class="btn btn-primary btn-sm view-tasks-btn" data-project="${project.name}">View Tasks</button>
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
         * Renders the main task tree view for a selected project.
         *
         * @param {object} project - The project object whose tasks are being displayed.
         * @param {Array<object>} tasks - The hierarchical list of task objects.
         */
        /**
         * Initializes SortableJS for drag-and-drop reordering of tasks using a nested div structure.
         * @param {object} project - The project object containing the project name.
         */
        function initializeTaskSorting(project) {
            // Destroy existing instances if any
            if (taskSortableInstance && Array.isArray(taskSortableInstance)) {
                taskSortableInstance.forEach(instance => instance.destroy());
            }
            taskSortableInstance = [];

            const sortableContainers = taskContent.find('.task-grid-body, .child-tasks-container');

            sortableContainers.each(function() {
                const instance = new Sortable(this, {
                    group: 'nested-tasks',
                    animation: 150,
                    handle: '.task-drag-handle',
                    ghostClass: 'sortable-ghost',
                    chosenClass: 'sortable-chosen',
                    onEnd: function (evt) {
                        // When the user finishes dragging, show the save button.
                        $('#save-task-order').show();
                    }
                });
                taskSortableInstance.push(instance);
            });
        }

        function renderTaskTreeView(project, tasks) {
            taskContent.empty();

            const header = $(`
                <div class="task-view-header mb-3">
                    <div class="d-flex justify-content-between align-items-center mb-2">
                        <div>
                            <button class="btn btn-sm btn-secondary" id="back-to-projects"><i class="fa fa-arrow-left mr-1"></i> Back to Projects</button>
                            <h4 class="d-inline-block ml-3 mb-0">${project.project_name}</h4>
                        </div>
                        <div class="d-flex align-items-center">
                            <span id="task-saving-indicator" class="text-muted mr-3" style="display: none;"><i class="fa fa-spinner fa-spin"></i> Saving...</span>
                            <button class="btn btn-sm btn-success mr-2" id="save-task-order" style="display: none;">Save Order</button>
                            <a href="/app/task/new-task?project=${project.name}" class="btn btn-primary btn-sm">Add Task</a>
                        </div>
                    </div>
                    <div class="task-filters bg-light p-2 rounded-sm border">
                        <div class="row">
                            <div class="col-md-4"><input type="text" class="form-control form-control-sm" id="task-name-filter" placeholder="Filter by task name..."></div>
                            <div class="col-md-3"><input type="text" class="form-control form-control-sm" id="task-owner-filter" placeholder="Filter by owner..."></div>
                            <div class="col-md-3"><select class="form-control form-control-sm" id="task-status-filter"><option value="">All Statuses</option></select></div>
                            <div class="col-md-2"><button class="btn btn-sm btn-secondary btn-block" id="clear-task-filters">Clear Filters</button></div>
                        </div>
                    </div>
                </div>
            `).appendTo(taskContent);

            const status_filter = header.find('#task-status-filter');
            const unique_statuses = [...new Set(tasks.flatMap(t => [t.status, ...t.children.map(c => c.status)]))].filter(Boolean);
            unique_statuses.forEach(s => status_filter.append(`<option value="${s}">${s}</option>`));

            if (!tasks || tasks.length === 0) {
                taskContent.append('<p class="text-muted text-center p-4">This project has no tasks.</p>');
                return;
            }

            const grid = $(`
                <div class="task-grid">
                    <div class="task-grid-header">
                        <div class="task-grid-cell">Task</div>
                        <div class="task-grid-cell">Owner</div>
                        <div class="task-grid-cell">Status</div>
                        <div class="task-grid-cell">Start Date</div>
                        <div class="task-grid-cell">Due Date</div>
                        <div class="task-grid-cell">% Complete</div>
                        <div class="task-grid-cell">Duration (hrs)</div>
                    </div>
                    <div class="task-grid-body"></div>
                </div>
            `).appendTo(taskContent);

            redrawTaskTableBody(tasks);
            initializeTaskSorting(project);
        }

        /**
         * Applies filters and redraws the task list. Sorting is now handled by the backend
         * and manual drag-and-drop.
         */
        function applyTaskFiltersAndSort() {
            const nameFilter = (taskContent.find('#task-name-filter').val() || '').toLowerCase();
            const ownerFilter = (taskContent.find('#task-owner-filter').val() || '').toLowerCase();
            const statusFilter = taskContent.find('#task-status-filter').val();

            let tasks = JSON.parse(JSON.stringify(currentProjectTasks));

            function filterNode(task) {
                if (task.children && task.children.length > 0) {
                    task.children = task.children.map(filterNode).filter(Boolean);
                }
                const hasVisibleChildren = task.children && task.children.length > 0;
                const nameMatch = !nameFilter || task.subject.toLowerCase().includes(nameFilter);
                const ownerMatch = !ownerFilter || (task.assigned_to || '').toLowerCase().includes(ownerFilter);
                const statusMatch = !statusFilter || task.status === statusFilter;
                if ((nameMatch && ownerMatch && statusMatch) || hasVisibleChildren) {
                    return task;
                }
                return null;
            }
            tasks = tasks.map(filterNode).filter(Boolean);

            redrawTaskTableBody(tasks);
            initializeTaskSorting({ name: pageState.project }); // Re-initialize sorting on the filtered view
        }

        /**
         * Clears and redraws the body of the task grid using nested divs.
         * @param {Array<object>} tasks - The hierarchical list of tasks to render.
         */
        function redrawTaskTableBody(tasks) {
            const gridBody = taskContent.find('.task-grid-body');
            gridBody.empty();

            if (!tasks || tasks.length === 0) {
                gridBody.html('<div class="p-4 text-center text-muted">No tasks match filters.</div>');
                return;
            }

            function renderTaskNode(task, container, level) {
                const start_date = task.exp_start_date ? frappe.datetime.str_to_user(task.exp_start_date) : 'Set Date';
                const end_date = task.exp_end_date ? frappe.datetime.str_to_user(task.exp_end_date) : 'Set Date';
                const progress = task.progress || 0;

                const node = $(`
                    <div class="task-node" data-task-id="${task.name}">
                        <div class="task-grid-row">
                            <div class="task-grid-cell" style="padding-left: ${level * 20}px;">
                                <i class="fa fa-bars task-drag-handle mr-2 text-muted"></i>
                                <i class="fa fa-fw ${task.children.length > 0 ? 'fa-caret-down toggle-child-tasks' : ''} mr-1"></i>
                                <a href="/app/task/${task.name}">${task.subject}</a>
                            </div>
                            <div class="task-grid-cell assignee-cell"><a href="#" class="assignee-link">${task.assigned_to || 'Unassigned'}</a></div>
                            <div class="task-grid-cell"><select class="form-control form-control-sm task-status-select" style="width: 120px;">${taskStatusOptionsList.map(s => `<option value="${s}" ${task.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
                            <div class="task-grid-cell editable-date" data-field="exp_start_date" data-task-id="${task.name}" data-original-date="${task.exp_start_date || ''}"><a href="#">${start_date}</a></div>
                            <div class="task-grid-cell editable-date" data-field="exp_end_date" data-task-id="${task.name}" data-original-date="${task.exp_end_date || ''}"><a href="#">${end_date}</a></div>
                            <div class="task-grid-cell"><div class="progress" style="height: 15px;"><div class="progress-bar" role="progressbar" style="width: ${progress}%;" aria-valuenow="${progress}" aria-valuemin="0" aria-valuemax="100">${progress}%</div></div></div>
                            <div class="task-grid-cell editable-time" data-field="expected_time" data-task-id="${task.name}" data-original-value="${task.expected_time || 0}"><a href="#">${task.expected_time || 0}</a></div>
                        </div>
                        <div class="child-tasks-container"></div>
                    </div>
                `).appendTo(container);

                if (task.children && task.children.length > 0) {
                    const childContainer = node.find('.child-tasks-container');
                    task.children.forEach(child => renderTaskNode(child, childContainer, level + 1));
                }
            }

            tasks.forEach(task => renderTaskNode(task, gridBody, 0));
        }

        /**
         * This function is no longer used as client-side sorting is disabled for the task tree.
         */
        function updateTaskSortIcons() {
            // No longer applicable
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
         * The dialog displays a draggable list of project types, allowing the user
         * to save a preferred order to localStorage.
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

            const sortable = new Sortable(listElement, { animation: 150, ghostClass: 'bg-light' });
        }

        /**
         * Fetches and renders the task tree for a specific project.
         * @param {string} project_name - The name (ID) of the project.
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

            taskContent.html(`<div class="text-center p-5"><div class="spinner-border" role="status"><span class="sr-only">Loading...</span></div></div>`);

            frappe.call({
                method: 'project_enhancements.project_enhancements.page.project_dashboard.project_dashboard.get_project_tasks',
                args: { project: project_name },
                callback: function(r) {
                    if (r.message && !r.message.error) {
                        currentProjectTasks = r.message;
                        renderTaskTreeView(project, r.message);
                        taskContent.find('#task-name-filter').val(pageState.task_name || '');
                        taskContent.find('#task-owner-filter').val(pageState.task_owner || '');
                        taskContent.find('#task-status-filter').val(pageState.task_status || '');
                        if (pageState.task_name || pageState.task_owner || pageState.task_status) {
                            applyTaskFiltersAndSort();
                        }
                    } else {
                        taskContent.html(`<div class="alert alert-danger">Error fetching tasks: ${r.message ? r.message.error : 'Unknown error'}</div>`);
                    }
                }
            });
        }

        /**
         * Shows a dialog to manage multiple assignees for a task.
         * @param {jQuery} assigneeLink - The jQuery object for the clicked assignee link.
         */
        function showTaskAssigneeDialog(assigneeLink) {
            const taskRow = assigneeLink.closest('tr');
            const taskName = taskRow.data('task-id');
            const taskSubject = taskRow.find('td:first a').text();

            // Find the task from the main task list to get assignee details
            let task;
            function findTask(tasks, taskId) {
                for (let t of tasks) {
                    if (t.name === taskId) return t;
                    if (t.children) {
                        const found = findTask(t.children, taskId);
                        if (found) return found;
                    }
                }
                return null;
            }
            task = findTask(currentProjectTasks, taskName);

            if (!task) {
                frappe.show_alert({ message: 'Could not find task details.', indicator: 'red' });
                return;
            }

            const dialog = new frappe.ui.Dialog({
                title: `Assignments for: ${taskSubject}`,
                fields: [
                    {
                        fieldname: 'assign_to',
                        fieldtype: 'Link',
                        options: 'User',
                        label: 'Assign a user',
                        description: 'Select a user to add them to the task.'
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
                if (task.assignees && task.assignees.length > 0) {
                    const assigneeItems = task.assignees.map(assignee => `
                        <li class="list-group-item d-flex justify-content-between align-items-center">
                            ${assignee.full_name}
                            <button class="btn btn-xs btn-danger remove-assignee" data-user-id="${assignee.email}">Remove</button>
                        </li>
                    `).join('');
                    assigneeListWrapper.html(`<ul class="list-group">${assigneeItems}</ul>`);
                } else {
                    assigneeListWrapper.html('<p class="text-muted">No users are assigned to this task.</p>');
                }
            }

            function updateTaskRowAssignees() {
                const newAssigneeText = task.assignees && task.assignees.length > 0
                    ? task.assignees.map(a => a.full_name).join(', ')
                    : 'Unassigned';
                assigneeLink.text(newAssigneeText);
                task.assigned_to = newAssigneeText; // Update the underlying data model
            }

            dialog.get_field('assign_to').df.onchange = () => {
                const userId = dialog.get_value('assign_to');
                if (!userId) return;

                // Check if user is already assigned
                if (task.assignees && task.assignees.find(a => a.email === userId)) {
                    frappe.show_alert({ message: 'User is already assigned.', indicator: 'info' });
                    dialog.set_value('assign_to', ''); // Clear input
                    return;
                }

                frappe.call({
                    method: 'project_enhancements.project_enhancements.page.project_dashboard.project_dashboard.add_task_assignee',
                    args: { task_name: taskName, user_id: userId },
                    callback: function(r) {
                        if (r.message && r.message.status === 'success') {
                            task.assignees = r.message.assignees; // Update local task object
                            renderAssignees();
                            updateTaskRowAssignees();
                            dialog.set_value('assign_to', ''); // Clear input
                        } else {
                            frappe.show_alert({ message: r.message.message || 'Could not assign user.', indicator: 'red' });
                        }
                    }
                });
            };

            assigneeListWrapper.on('click', '.remove-assignee', function() {
                const userId = $(this).data('user-id');
                frappe.call({
                    method: 'project_enhancements.project_enhancements.page.project_dashboard.project_dashboard.remove_task_assignee',
                    args: { task_name: taskName, user_id: userId },
                    callback: function(r) {
                        if (r.message && r.message.status === 'success') {
                            task.assignees = r.message.assignees; // Update local task object
                            renderAssignees();
                            updateTaskRowAssignees();
                        } else {
                            frappe.show_alert({ message: r.message.message || 'Could not remove user.', indicator: 'red' });
                        }
                    }
                });
            });

            dialog.show();
            renderAssignees();
        }

        // --- Helper Functions ---
        /**
         * Gets a Bootstrap badge class based on project status.
         * @param {string} status - The status of the project.
         * @returns {string} The corresponding Bootstrap badge class.
         */
        function getStatusClass(status) {
            switch(status) {
                case 'Open': return 'badge-primary';
                case 'Completed': return 'badge-success';
                case 'Overdue': return 'badge-danger';
                default: return 'badge-secondary';
            }
        }

        /**
         * Gets a CSS class for styling priority text.
         * @param {string} priority - The priority level of the project.
         * @returns {string} The corresponding CSS class for the priority level.
         */
        function getPriorityClass(priority) {
            if (!priority) return '';
            switch (priority.toLowerCase()) {
                case 'high': return 'text-danger font-weight-bold';
                case 'medium': return 'text-warning';
                default: return 'text-muted';
            }
        }

        /**
         * Loads all initial data required for the dashboard to function.
         * Fetches projects, priorities, and statuses from the server in parallel.
         */
        function loadInitialData() {
            parseURLAndSetState();

            const fetchPriorities = frappe.call({ method: "project_enhancements.project_enhancements.page.project_dashboard.project_dashboard.get_priority_options" }).then(r => {
                priorityOptionsList = (r.message && !r.message.error) ? r.message : ['High', 'Medium', 'Low'];
            });
            const fetchStatuses = frappe.call({ method: "project_enhancements.project_enhancements.page.project_dashboard.project_dashboard.get_status_options" }).then(r => {
                statusOptionsList = (r.message && !r.message.error) ? r.message : ['Open', 'Completed', 'Overdue', 'Cancelled'];
            });
            const fetchProjects = frappe.call({ method: "project_enhancements.project_enhancements.page.project_dashboard.project_dashboard.get_project_data" });
            const fetchTaskStatuses = frappe.call({ method: "project_enhancements.project_enhancements.page.project_dashboard.project_dashboard.get_task_status_options" }).then(r => {
                taskStatusOptionsList = (r.message && !r.message.error) ? r.message : ['Open', 'Working', 'Completed', 'Cancelled'];
            });

            Promise.all([fetchPriorities, fetchStatuses, fetchProjects, fetchTaskStatuses]).then(results => {
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
        tabContainer.on('click', '.nav-link', function(e) { e.preventDefault(); const clickedTab = $(this); if (clickedTab.hasClass('active')) return; tabContainer.find('.nav-link').removeClass('active'); clickedTab.addClass('active'); activeTab = clickedTab.data('status'); pageState = {}; searchInput.val(''); priorityViewToggle.toggle(activeTab === 'PriorityOverview'); updateURL(true); applyFiltersAndRender(); });
        priorityViewToggle.on('click', 'button', function() { const $btn = $(this); if ($btn.hasClass('active')) return; priorityViewToggle.find('button').removeClass('active'); $btn.addClass('active'); priorityView = $btn.data('view'); updateURL(); applyFiltersAndRender(); });
        $(page.body).on('click', '.collapsible-header', function() { const groupId = $(this).data('group-id'); const body = $(this).next('.collapsible-body'); body.slideToggle(200); $(this).find('svg').toggleClass('rotate-180'); if (body.is(':visible')) { expandedGroups.add(groupId); } else { expandedGroups.delete(groupId); } });

        // Handle clicks on task links within the project tables to navigate to the task tree view.
        content.on('click', 'a[href*="#TasksTree"]', function(e) {
            e.preventDefault();

            // Extract the project name from the link's href attribute.
            const url = new URL($(this).attr('href'), window.location.origin);
            const params = new URLSearchParams(url.hash.split('?')[1]);
            const projectName = params.get('project');

            if (!projectName) {
                console.error("Could not find project name in link.", this);
                return;
            }

            // --- Manually orchestrate the tab switch ---
            // 1. Set the active tab and page state.
            activeTab = 'TasksTree';
            pageState = { project: projectName };

            // 2. Update the tab UI to highlight the 'Tasks Tree' tab.
            tabContainer.find('.nav-link').removeClass('active');
            tabContainer.find('.nav-link[data-status="TasksTree"]').addClass('active');
            priorityViewToggle.hide(); // Not visible on task tree.

            // 3. Update the browser URL and history.
            updateURL(true); // push=true to allow using the back button.

            // 4. Trigger the main render function, which will now render the task view.
            applyFiltersAndRender();
        });

        taskContent.on('click', '.view-tasks-btn', function() { pageState.project = $(this).data('project'); updateURL(true); loadAndRenderTasks(pageState.project); });
        taskContent.on('click', '#back-to-projects', function() { pageState.project = null; activeTab = 'TasksTree'; updateURL(true); applyFiltersAndRender(); });
        taskContent.on('click', '#save-task-order', function() {
            const saveButton = $(this);
            const indicator = $('#task-saving-indicator');
            const projectName = pageState.project;

            if (!projectName) {
                frappe.show_alert({ message: 'Could not determine the current project.', indicator: 'red' });
                return;
            }

            indicator.show();
            saveButton.prop('disabled', true);

            function getTaskUpdatesFromDOM() {
                const updates = [];

                function recurse(container, parentOrderString) {
                    const children = $(container).children('.task-node');

                    children.each(function(index) {
                        const taskNode = $(this);
                        const taskId = taskNode.data('task-id');
                        const parentNode = taskNode.parent().closest('.task-node');
                        const parentId = parentNode.length ? parentNode.data('task-id') : null;

                        let currentOrderString;
                        if (parentOrderString) {
                            currentOrderString = parentOrderString + (index + 1);
                        } else {
                            currentOrderString = (index + 1) + ".0";
                        }

                        updates.push({
                            name: taskId,
                            parent_task: parentId,
                            custom_subtask_order: parseFloat(currentOrderString)
                        });

                        const childContainer = taskNode.children('.child-tasks-container');
                        if (childContainer.children('.task-node').length > 0) {
                            let nextParentOrderString = currentOrderString.endsWith('.0')
                                ? currentOrderString.slice(0, -2) + '.'
                                : currentOrderString;
                            recurse(childContainer, nextParentOrderString);
                        }
                    });
                }

                recurse(taskContent.find('.task-grid-body'), null);

                return updates;
            }

            const updates = getTaskUpdatesFromDOM();

            frappe.call({
                method: 'project_enhancements.project_enhancements.page.project_dashboard.project_dashboard.update_task_structure',
                args: { project_name: projectName, tasks: updates },
                callback: function(r) {
                    if (r.message && r.message.status === 'success') {
                        saveButton.hide();
                        // Refresh the tasks to show the new saved order.
                        // This also has the effect of re-rendering the header, hiding the save button until the next change.
                        loadAndRenderTasks(projectName);
                    } else {
                        frappe.show_alert({ message: r.message.message || 'Could not save task order.', indicator: 'red' });
                        loadAndRenderTasks(projectName); // Revert on failure
                    }
                },
                always: function() {
                    indicator.hide();
                    saveButton.prop('disabled', false);
                }
            });
        });
        taskContent.on('click', '.toggle-child-tasks', function() { const $icon = $(this); const $row = $icon.closest('tr'); const taskId = $row.data('task-id'); $icon.toggleClass('fa-caret-down fa-caret-right'); const children = taskContent.find(`tr[data-parent-id="${taskId}"]`); function hideDescendants(parentId) { taskContent.find(`tr[data-parent-id="${parentId}"]`).each(function() { const childRow = $(this); childRow.hide(); childRow.find('.toggle-child-tasks').removeClass('fa-caret-down').addClass('fa-caret-right'); hideDescendants(childRow.data('task-id')); }); } if ($icon.hasClass('fa-caret-right')) { children.each(function() { $(this).hide(); hideDescendants($(this).data('task-id')); }); } else { children.show(); } });
        taskContent.on('click', '.editable-date a', function(e) {
            e.preventDefault();
            const link = $(this);
            const cell = link.closest('td');
            if (cell.find('.datepicker-input').length > 0) return;

            const taskName = cell.data('task-id');
            const field = cell.data('field');
            const originalValue = cell.data('original-date');
            let hasChanged = false; // Flag to track if the date was changed

            link.hide();

            const control_wrapper = $('<div class="datepicker-input" style="width: 130px;"></div>').appendTo(cell);
            let datepicker = frappe.ui.form.make_control({
                parent: control_wrapper,
                df: { fieldtype: 'Date', fieldname: field },
                render_input: true
            });
            datepicker.set_value(originalValue);
            datepicker.input.focus();

            const cleanup = () => {
                control_wrapper.remove();
                link.show();
            };

            $(datepicker.input).on('change', () => {
                hasChanged = true;
                const newValue = datepicker.get_value();
                const displayValue = newValue ? frappe.datetime.str_to_user(newValue) : 'Set Date';

                // Optimistically update the UI
                link.text(displayValue);

                frappe.call({
                    method: 'project_enhancements.project_enhancements.page.project_dashboard.project_dashboard.update_task_date',
                    args: { task_name: taskName, field: field, value: newValue },
                    callback: (r) => {
                        if (r.message && r.message.status === 'success') {
                            // On success, update the original date stored in the cell
                            cell.data('original-date', newValue);
                            // Update the underlying data model
                            function findAndUpdateTask(tasks, taskId, fieldName, newDate) {
                                for (let task of tasks) {
                                    if (task.name === taskId) {
                                        task[fieldName] = newDate;
                                        return true;
                                    }
                                    if (task.children && task.children.length > 0) {
                                        if (findAndUpdateTask(task.children, taskId, fieldName, newDate)) return true;
                                    }
                                }
                                return false;
                            }
                            findAndUpdateTask(currentProjectTasks, taskName, field, newValue);
                        } else {
                            // On failure, revert the UI silently
                            link.text(originalValue ? frappe.datetime.str_to_user(originalValue) : 'Set Date');
                        }
                    },
                    error: (err) => {
                        // On error, revert the UI silently
                        link.text(originalValue ? frappe.datetime.str_to_user(originalValue) : 'Set Date');
                    }
                }).always(() => {
                    // Cleanup is now part of the call's lifecycle
                    cleanup();
                });
            });

            $(datepicker.input).on('blur', () => {
                // Use a small timeout to allow the 'change' event to fire first
                // when a date is selected from the picker. This resolves a race
                // condition where the blur event closes the input before the
                // change is registered.
                setTimeout(() => {
                    // Only cleanup if the value hasn't been changed and submitted.
                    if (!hasChanged) {
                        cleanup();
                    }
                }, 200); // 200ms delay
            });
        });
        taskContent.on('click', '.editable-time a', function(e) { e.preventDefault(); const link = $(this); const cell = link.closest('td'); if (cell.find('.time-input').length > 0) return; const taskName = cell.data('task-id'); const originalValue = cell.data('original-value'); link.hide(); const input = $(`<input type="number" class="form-control form-control-sm time-input" style="width: 80px;" min="0" step="0.5">`).val(originalValue).appendTo(cell).focus(); const cleanup = () => { input.remove(); link.show(); }; const saveChanges = () => { const newValue = input.val(); if (newValue === '' || isNaN(newValue) || parseFloat(newValue) < 0) { cleanup(); return; } const newFloatValue = parseFloat(newValue); link.text(newFloatValue); frappe.call({ method: 'project_enhancements.project_enhancements.page.project_dashboard.project_dashboard.update_task_expected_time', args: { task_name: taskName, expected_time: newFloatValue }, callback: (r) => { if (r.message && r.message.status === 'success') { cell.data('original-value', newFloatValue); function findAndUpdateTask(tasks, taskId, value) { for (let task of tasks) { if (task.name === taskId) { task.expected_time = value; return true; } if (task.children && task.children.length > 0 && findAndUpdateTask(task.children, taskId, value)) return true; } return false; } findAndUpdateTask(currentProjectTasks, taskName, newFloatValue); } else { link.text(originalValue); } }, error: () => link.text(originalValue) }).always(cleanup); }; input.on('blur', saveChanges).on('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); input.blur(); } else if (e.key === 'Escape') { e.preventDefault(); cleanup(); } }); });
        content.on('click', 'thead th', function() { const field = $(this).data('sort'); if (!field) return; if (currentSort.field === field) { currentSort.order = currentSort.order === 'asc' ? 'desc' : 'asc'; } else { currentSort.field = field; currentSort.order = 'asc'; } applyFiltersAndRender(); });
        content.on('change', 'select', function() { const select = $(this); const projectName = select.closest('tr').data('project-name'); const field = select.data('field'); const value = select.val(); frappe.call({ method: 'project_enhancements.project_enhancements.page.project_dashboard.project_dashboard.update_project_details', args: { project_name: projectName, field: field, value: value }, callback: (r) => { if (r.message && r.message.status === 'success') { const project = allProjects.find(p => p.name === projectName); if (project) project[field] = value; } else { frappe.show_alert({ message: 'Error updating project.', indicator: 'red' }); applyFiltersAndRender(); } } }); });
        taskContent.on('click', '.assignee-link', function(e) { e.preventDefault(); showTaskAssigneeDialog($(this)); });
        window.addEventListener('popstate', () => { if (allProjects.length > 0) { parseURLAndSetState(); applyFiltersAndRender(); } else { window.location.reload(); } });

        // --- Initial Load ---
        loadInitialData();

        // --- Custom Styles ---
        $(`<style>
            .table thead th { cursor: pointer; user-select: none; }
            .table thead th.sorted-asc::after { content: ' ▲'; font-size: 10px; }
            .table thead th.sorted-desc::after { content: ' ▼'; font-size: 10px; }
            #sortable-list li { cursor: grab; }
            .nav-tabs .nav-link.active { color: #495057; background-color: #fff; border-color: #d1d8dd #d1d8dd #fff; }
            .task-row td { vertical-align: middle; }
            .task-row:hover { background-color: #f8f9fa; }
            .toggle-child-tasks { cursor: pointer; }
            .task-drag-handle { cursor: grab; }
            .sortable-ghost { background-color: #e8f7ff; border: 1px dashed #a1d1ff; }
            .sortable-chosen { background-color: #d1ecf1; }
            .sortable-chosen a { color: #0c5460; }

            /* New Task Grid Styles */
            .task-grid-header, .task-grid-row { display: flex; border-bottom: 1px solid #dee2e6; padding: 0.5rem 0; align-items: center; }
            .task-grid-header { font-weight: bold; background-color: #f8f9fa; }
            .task-grid-cell { padding: 0 0.5rem; flex-shrink: 0; display: flex; align-items: center; }
            .task-grid-cell:nth-child(1) { flex: 0 0 40%; }
            .task-grid-cell:nth-child(2) { flex: 0 0 15%; }
            .task-grid-cell:nth-child(3) { flex: 0 0 12%; }
            .task-grid-cell:nth-child(4), .task-grid-cell:nth-child(5) { flex: 0 0 10%; }
            .task-grid-cell:nth-child(6) { flex: 0 0 8%; }
            .task-grid-cell:nth-child(7) { flex: 0 0 5%; }
            .task-node .task-grid-row:hover { background-color: #f1f3f5; }
            .child-tasks-container {  }

            /* Sticky Header Styles */
            .project-dashboard-controls {
                position: -webkit-sticky;
                position: sticky;
                top: 0;
                z-index: 102; /* Needs to be above other sticky elements */
            }
            .table > thead, .task-grid .task-grid-header {
                position: -webkit-sticky;
                position: sticky;
                /* The top value should be the height of the controls bar above it. */
                /* The control bar has p-2 (0.5rem * 2) + line-height of a sm form control (approx 1.8rem) + border (1px) ~ 57px */
                top: 57px;
                z-index: 101; /* Below controls, above content */
            }
            /* Ensure the sticky table headers have a solid background */
            .table > thead.thead-light > tr > th {
                 background-color: #f8f9fa; /* Matches .thead-light */
            }
            .task-grid .task-grid-header {
                background-color: #f8f9fa; /* Matches original style */
            }
        </style>`).appendTo(page.body);
    }
}