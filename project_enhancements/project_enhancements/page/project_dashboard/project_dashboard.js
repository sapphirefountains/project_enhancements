/**
 * Initializes the Project Dashboard page.
 *
 * This function is the entry point for the project dashboard. It sets up the
 * page layout, loads necessary dependencies, defines all UI interactions,
 * fetches project data from the server, and renders the initial view.
 *
 * @param {HTMLElement} wrapper - The parent element for the page content.
 */
frappe.pages['project-dashboard'].on_page_load = function(wrapper) {
    console.log("Loading Project Dashboard JS - Version 5.3 (Priority View and Collapse Fix)");

    const script_url = "https://cdn.jsdelivr.net/npm/sortablejs@latest/Sortable.min.js";
    frappe.require(script_url, () => {});

    let page = frappe.ui.make_app_page({
        parent: wrapper,
        title: 'Projects Dashboard',
        single_column: true
    });

    let allProjects = [];
    let priorityOptionsList = [];
    let statusOptionsList = [];
    let currentSort = { field: 'project_name', order: 'asc' };
    let activeTab = 'ActiveProjects'; // Default to 'ActiveProjects'
    let priorityView = 'grouped'; // 'grouped' or 'ranked'
    let expandedGroups = new Set();
    let currentTaskSort = { field: 'subject', order: 'asc' };
    let currentProjectTasks = []; // To hold the original, unfiltered task tree
    let pageState = {}; // To hold the entire state of the dashboard

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
     * Updates the URL hash based on the current state of the dashboard.
     * @param {boolean} push - If true, creates a new entry in browser history.
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
     */
    function parseURLAndSetState() {
        const hash = window.location.hash.substring(1);
        if (!hash) {
            // Set default tab and update URL
            activeTab = 'ActiveProjects';
            tabContainer.find(`.nav-link[data-status="${activeTab}"]`).addClass('active');
            updateURL();
            return;
        }

        const [tab, paramsString] = hash.split('?');
        const params = new URLSearchParams(paramsString);

        activeTab = tab || 'ActiveProjects';
        pageState = Object.fromEntries(params.entries());

        // Set UI elements based on parsed state
        tabContainer.find('.nav-link').removeClass('active');
        tabContainer.find(`.nav-link[data-status="${activeTab}"]`).addClass('active');

        if (activeTab === 'TasksTree' && pageState.project) {
            // The task view will be rendered later in the load sequence
        } else {
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
     * Main render function for the dashboard.
     *
     * Clears the content area and calls the appropriate rendering function
     * based on the currently active tab and view mode.
     *
     * @param {Array<Object>} projects - The array of project objects to render.
     */
    function renderDashboard(projects) {
        content.empty();
        if (!projects || projects.length === 0) {
            content.html('<p class="text-muted text-center p-4">No projects found in this view.</p>');
            return;
        }

        if (activeTab === 'Priority' && priorityView === 'ranked') {
            renderRankedPriorityView(projects);
        } else {
            renderGroupedView(projects);
        }
    }

    /**
     * Renders the 'Ranked Priority' view.
     *
     * Displays projects in a simple table, sorted numerically by their
     * 'custom_project_priority' field.
     *
     * @param {Array<Object>} projects - The array of project objects to render.
     */
    function renderRankedPriorityView(projects) {
        // Sort by priority (assuming it's a number)
        projects.sort((a, b) => {
            const priorityA = parseInt(a.custom_project_priority, 10) || Infinity;
            const priorityB = parseInt(b.custom_project_priority, 10) || Infinity;
            return priorityA - priorityB;
        });

        const table = $(`<table class="table table-bordered table-hover" style="font-size: 12px;"><thead class="thead-light"><tr><th data-sort="custom_project_priority">Priority</th><th data-sort="project_name">Project Name</th><th data-sort="name">Series</th><th data-sort="status">Status</th><th data-sort="tasks">Tasks</th><th data-sort="project_user">Assigned To</th></tr></thead><tbody></tbody></table>`).appendTo(content);
        const tableBody = table.find('tbody');

        projects.forEach(project => {
            const tasks_link = `<a href="/app/task?project=${project.name}">${project.completed_tasks} / ${project.total_tasks}</a>`;
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
     * @param {Array<Object>} projects - The array of project objects to render.
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
                        <td><a href="/app/task?project=${project.name}">${project.completed_tasks} / ${project.total_tasks}</a></td>
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
     * Filters the master project list and triggers a re-render.
     *
     * Applies filters based on the active tab (is_active, priority) and
     * the search input value, then calls the main render function.
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
     * Renders the project selection view for the 'Tasks' tab.
     *
     * Groups active projects by type and displays them with a 'View Tasks' button.
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
                const listItem = $(`
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
     * @param {Object} project - The project object.
     * @param {Array<Object>} tasks - The hierarchical list of task objects.
     */
    function renderTaskTreeView(project, tasks) {
        taskContent.empty();

        const header = $(`
            <div class="task-view-header mb-3">
                <div class="d-flex justify-content-between align-items-center mb-2">
                    <div>
                        <button class="btn btn-sm btn-secondary" id="back-to-projects"><i class="fa fa-arrow-left mr-1"></i> Back to Projects</button>
                        <h4 class="d-inline-block ml-3 mb-0">${project.project_name}</h4>
                    </div>
                    <a href="/app/task/new-task?project=${project.name}" class="btn btn-primary btn-sm">Add Task</a>
                </div>
                <div class="task-filters bg-light p-2 rounded-sm border">
                    <div class="row">
                        <div class="col-md-4">
                            <input type="text" class="form-control form-control-sm" id="task-name-filter" placeholder="Filter by task name...">
                        </div>
                        <div class="col-md-3">
                            <input type="text" class="form-control form-control-sm" id="task-owner-filter" placeholder="Filter by owner...">
                        </div>
                        <div class="col-md-3">
                             <select class="form-control form-control-sm" id="task-status-filter">
                                <option value="">All Statuses</option>
                             </select>
                        </div>
                        <div class="col-md-2">
                            <button class="btn btn-sm btn-secondary btn-block" id="clear-task-filters">Clear Filters</button>
                        </div>
                    </div>
                </div>
            </div>
        `).appendTo(taskContent);

        // Populate status filter
        const status_filter = header.find('#task-status-filter');
        const unique_statuses = [...new Set(tasks.map(t => t.status))];
        unique_statuses.forEach(s => status_filter.append(`<option value="${s}">${s}</option>`));

        if (!tasks || tasks.length === 0) {
            taskContent.append('<p class="text-muted text-center p-4">This project has no tasks.</p>');
            return;
        }

        const table = $(`
            <table class="table table-bordered table-hover" style="font-size: 12px;">
                <thead class="thead-light">
                    <tr>
                        <th style="width: 40%;" data-sort="subject">Task</th>
                        <th data-sort="assigned_to">Owner</th>
                        <th data-sort="status">Status</th>
                        <th data-sort="exp_start_date">Start Date</th>
                        <th data-sort="exp_end_date">Due Date</th>
                        <th data-sort="progress">% Complete</th>
                        <th data-sort="expected_time">Duration (hrs)</th>
                    </tr>
                </thead>
                <tbody></tbody>
            </table>
        `).appendTo(taskContent);

        const tableBody = table.find('tbody');

        function renderTaskRow(task, level) {
            const start_date = task.exp_start_date ? frappe.datetime.str_to_user(task.exp_start_date) : '';
            const end_date = task.exp_end_date ? frappe.datetime.str_to_user(task.exp_end_date) : '';
            const progress = task.progress || 0;

            const row = $(`
                <tr class="task-row" data-task-id="${task.name}" data-parent-id="${task.parent_task || ''}">
                    <td>
                        <div style="padding-left: ${level * 20}px;">
                            ${task.children.length > 0 ? '<i class="fa fa-fw fa-caret-down toggle-child-tasks mr-1"></i>' : '<i class="fa fa-fw mr-1"></i>'}
                            <a href="/app/task/${task.name}">${task.subject}</a>
                        </div>
                    </td>
                    <td>${task.assigned_to || ''}</td>
                    <td>${task.status}</td>
                    <td>${start_date}</td>
                    <td>${end_date}</td>
                    <td>
                        <div class="progress" style="height: 15px;">
                            <div class="progress-bar" role="progressbar" style="width: ${progress}%;" aria-valuenow="${progress}" aria-valuemin="0" aria-valuemax="100">${progress}%</div>
                        </div>
                    </td>
                    <td>${task.expected_time || 0}</td>
                </tr>
            `).appendTo(tableBody);

            if (task.children && task.children.length > 0) {
                task.children.forEach(child => renderTaskRow(child, level + 1));
            }
        }

        tasks.forEach(task => renderTaskRow(task, 0));
    }
    
    /**
     * Applies the current filters and sorting to the task list and redraws the table.
     */
    function applyTaskFiltersAndSort() {
        const nameFilter = (taskContent.find('#task-name-filter').val() || '').toLowerCase();
        const ownerFilter = (taskContent.find('#task-owner-filter').val() || '').toLowerCase();
        const statusFilter = taskContent.find('#task-status-filter').val();

        // Deep copy the original tasks to avoid mutation
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

        function sortNodes(nodes) {
            nodes.sort((a, b) => {
                let valA = a[currentTaskSort.field] || '';
                let valB = b[currentTaskSort.field] || '';
                if (typeof valA === 'string') valA = valA.toLowerCase();
                if (typeof valB === 'string') valB = valB.toLowerCase();
                if (['progress', 'expected_time'].includes(currentTaskSort.field)) {
                    valA = parseFloat(valA) || 0;
                    valB = parseFloat(valB) || 0;
                }
                if (valA < valB) return currentTaskSort.order === 'asc' ? -1 : 1;
                if (valA > valB) return currentTaskSort.order === 'asc' ? 1 : -1;
                return 0;
            });
            nodes.forEach(node => {
                if (node.children && node.children.length > 0) sortNodes(node.children);
            });
        }
        sortNodes(tasks);
        redrawTaskTableBody(tasks);
    }

    /**
     * Clears and redraws the body of the task table with the provided tasks.
     * @param {Array<Object>} tasks - The hierarchical list of tasks to render.
     */
    function redrawTaskTableBody(tasks) {
        const tableBody = taskContent.find('table tbody');
        tableBody.empty();

        if (!tasks || tasks.length === 0) {
            tableBody.html('<tr><td colspan="7" class="text-center text-muted p-4">No tasks match filters.</td></tr>');
            return;
        }
        function renderTaskRow(task, level) {
            const start_date = task.exp_start_date ? frappe.datetime.str_to_user(task.exp_start_date) : '';
            const end_date = task.exp_end_date ? frappe.datetime.str_to_user(task.exp_end_date) : '';
            const progress = task.progress || 0;
            const row = $(`
                <tr class="task-row" data-task-id="${task.name}" data-parent-id="${task.parent_task || ''}">
                    <td><div style="padding-left: ${level * 20}px;">${task.children.length > 0 ? '<i class="fa fa-fw fa-caret-down toggle-child-tasks mr-1"></i>' : '<i class="fa fa-fw mr-1"></i>'}<a href="/app/task/${task.name}">${task.subject}</a></div></td>
                    <td>${task.assigned_to || ''}</td>
                    <td>${task.status}</td>
                    <td>${start_date}</td>
                    <td>${end_date}</td>
                    <td><div class="progress" style="height: 15px;"><div class="progress-bar" role="progressbar" style="width: ${progress}%;" aria-valuenow="${progress}" aria-valuemin="0" aria-valuemax="100">${progress}%</div></div></td>
                    <td>${task.expected_time || 0}</td>
                </tr>`).appendTo(tableBody);
            if (task.children && task.children.length > 0) {
                task.children.forEach(child => renderTaskRow(child, level + 1));
            }
        }
        tasks.forEach(task => renderTaskRow(task, 0));
        updateTaskSortIcons();
    }

    /**
     * Updates sort indicator icons in the task table header.
     */
    function updateTaskSortIcons() {
        taskContent.find('thead th').removeClass('sorted-asc sorted-desc');
        const currentTh = taskContent.find(`thead th[data-sort="${currentTaskSort.field}"]`);
        currentTh.addClass(currentTaskSort.order === 'asc' ? 'sorted-asc' : 'sorted-desc');
    }

    // Event handlers for task filtering and sorting
    taskContent.on('keyup', '#task-name-filter, #task-owner-filter', frappe.utils.debounce(() => { applyTaskFiltersAndSort(); updateURL(); }, 300));
    taskContent.on('change', '#task-status-filter', () => { applyTaskFiltersAndSort(); updateURL(); });
    taskContent.on('click', '#clear-task-filters', function() {
        taskContent.find('#task-name-filter, #task-owner-filter, #task-status-filter').val('');
        applyTaskFiltersAndSort();
        updateURL();
    });
    taskContent.on('click', '.task-view-header + .table thead th[data-sort]', function() {
        const field = $(this).data('sort');
        if (currentTaskSort.field === field) {
            currentTaskSort.order = currentTaskSort.order === 'asc' ? 'desc' : 'asc';
        } else {
            currentTaskSort.field = field;
            currentTaskSort.order = 'asc';
        }
        applyTaskFiltersAndSort();
    });

    /**
     * Updates the sort indicator icons in table headers.
     *
     * Clears existing sort indicators and adds the appropriate 'asc' or 'desc'
     * indicator to the currently sorted column header.
     */
    function updateSortIcons() {
        content.find('thead th').removeClass('sorted-asc sorted-desc');
        const currentTh = content.find(`thead th[data-sort="${currentSort.field}"]`);
        currentTh.addClass(currentSort.order === 'asc' ? 'sorted-asc' : 'sorted-desc');
    }

    /**
     * Opens a dialog for configuring the custom sort order of project groups.
     *
     * The dialog displays a draggable list of project types, allowing the user
     * to save a custom order to localStorage.
     */
    function openSortConfiguration() {
        let projectsForTab;
        if (activeTab === 'Priority') {
            projectsForTab = allProjects.filter(p => p.is_active === 'Yes' && p.status !== 'Completed' && p.status !== 'Cancelled');
        } else {
            const isActiveFilter = activeTab;
            projectsForTab = allProjects.filter(p => p.is_active === isActiveFilter);
        }
        
        const groupedProjects = projectsForTab.reduce((acc, p) => {
            const type = p.project_type || 'Uncategorized';
            if (!acc[type]) acc[type] = [];
            acc[type].push(p);
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
                frappe.show_alert({ message: 'Custom order saved!', indicator: 'green' });
            }
        });
        dialog.show();
        
        const listElement = dialog.get_field('sort_info').$wrapper.find('#sortable-list')[0];
        groupKeys.forEach(key => {
            $(listElement).append(`<li class="list-group-item" data-id="${key}"><i class="fa fa-bars mr-2 text-muted"></i> ${key}</li>`);
        });

        const sortable = new Sortable(listElement, { animation: 150, ghostClass: 'bg-light' });
    }

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
                    currentProjectTasks = r.message; // Store the original tasks
                    renderTaskTreeView(project, r.message);

                    // Apply filters from URL state if they exist
                    taskContent.find('#task-name-filter').val(pageState.task_name || '');
                    taskContent.find('#task-owner-filter').val(pageState.task_owner || '');
                    taskContent.find('#task-status-filter').val(pageState.task_status || '');

                    // Trigger filtering if any filter has a value
                    if (pageState.task_name || pageState.task_owner || pageState.task_status) {
                        applyTaskFiltersAndSort();
                    }
                } else {
                    taskContent.html(`<div class="alert alert-danger">Error fetching tasks: ${r.message ? r.message.error : 'Unknown error'}</div>`);
                }
            }
        });
    }

    // Event Listeners
    searchInput.on('keyup', frappe.utils.debounce(() => { applyFiltersAndRender(); updateURL(); }, 300));
    groupSortSelect.on('change', () => { applyFiltersAndRender(); updateURL(); });
    configureSortBtn.on('click', openSortConfiguration);

    tabContainer.on('click', '.nav-link', function(e) {
        e.preventDefault();
        const clickedTab = $(this);
        if (clickedTab.hasClass('active')) return;

        tabContainer.find('.nav-link').removeClass('active');
        clickedTab.addClass('active');
        activeTab = clickedTab.data('status');

        // Reset page state on tab switch
        pageState = {};
        searchInput.val('');

        if (activeTab === 'PriorityOverview') {
            priorityViewToggle.show();
        } else {
            priorityViewToggle.hide();
        }

        updateURL(true); // Push new state to history for tab changes
        applyFiltersAndRender();
    });

    priorityViewToggle.on('click', 'button', function() {
        const $btn = $(this);
        if ($btn.hasClass('active')) return;

        priorityViewToggle.find('button').removeClass('active');
        $btn.addClass('active');
        priorityView = $btn.data('view');
        updateURL();
        applyFiltersAndRender();
    });

    // Combined event handler for collapsible headers in both views
    $(page.body).on('click', '.collapsible-header', function() {
        const groupId = $(this).data('group-id');
        const body = $(this).next('.collapsible-body');
        body.slideToggle(200);
        $(this).find('svg').toggleClass('rotate-180');

        if (body.is(':visible')) {
            expandedGroups.add(groupId);
        } else {
            expandedGroups.delete(groupId);
        }
    });

    taskContent.on('click', '.view-tasks-btn', function() {
        const project_name = $(this).data('project');
        pageState.project = project_name;
        updateURL(true); // Push new state for task view
        loadAndRenderTasks(project_name);
    });

    taskContent.on('click', '#back-to-projects', function() {
        // Manually reset the state to go back to the project selection view
        pageState.project = null;
        activeTab = 'TasksTree'; // Ensure the tab is correctly set
        updateURL(true); // Update the URL to #TasksTree and push to history
        applyFiltersAndRender(); // Re-render the view
    });

    taskContent.on('click', '.toggle-child-tasks', function() {
        const $icon = $(this);
        const $row = $icon.closest('tr');
        const taskId = $row.data('task-id');

        $icon.toggleClass('fa-caret-down fa-caret-right');

        // Find all direct children and toggle them
        const children = taskContent.find(`tr[data-parent-id="${taskId}"]`);

        // Function to recursively hide descendants
        function hideDescendants(parentId) {
            const descendants = taskContent.find(`tr[data-parent-id="${parentId}"]`);
            descendants.each(function() {
                const childRow = $(this);
                const childId = childRow.data('task-id');
                childRow.hide();
                childRow.find('.toggle-child-tasks').removeClass('fa-caret-down').addClass('fa-caret-right');
                hideDescendants(childId);
            });
        }

        if ($icon.hasClass('fa-caret-right')) {
            // If collapsing, hide all children and their descendants
            children.each(function() {
                $(this).hide();
                hideDescendants($(this).data('task-id'));
            });
        } else {
            // If expanding, only show direct children
            children.show();
        }
    });
    
    content.on('click', 'thead th', function() {
        const field = $(this).data('sort');
        if (!field) return;

        if (currentSort.field === field) {
            currentSort.order = currentSort.order === 'asc' ? 'desc' : 'asc';
        } else {
            currentSort.field = field;
            currentSort.order = 'asc';
        }
        applyFiltersAndRender();
    });

    content.on('change', 'select', function() {
        const select = $(this);
        const projectName = select.closest('tr').data('project-name');
        const field = select.data('field');
        const value = select.val();

        frappe.call({
            method: 'project_enhancements.project_enhancements.page.project_dashboard.project_dashboard.update_project_details',
            args: {
                project_name: projectName,
                field: field,
                value: value
            },
            callback: function(r) {
                if (r.message && r.message.status === 'success') {
                    frappe.show_alert({ message: 'Project updated!', indicator: 'green' });
                    // find the project in allProjects and update its value
                    const project = allProjects.find(p => p.name === projectName);
                    if (project) {
                        project[field] = value;
                    }
                    applyFiltersAndRender();
                } else {
                    frappe.show_alert({ message: 'Error updating project.', indicator: 'red' });
                }
            }
        });
    });

    // Helper Functions
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

    // Initial Data Load
    function loadInitialData() {
        parseURLAndSetState(); // Parse URL first to set initial state

        const fetchPriorities = frappe.call({
            method: "project_enhancements.project_enhancements.page.project_dashboard.project_dashboard.get_priority_options"
        }).then(r => {
            if (r.message && !r.message.error) {
                priorityOptionsList = r.message;
            } else {
                console.error("Could not fetch priority options", r.message ? r.message.error : 'Unknown error');
                priorityOptionsList = ['High', 'Medium', 'Low']; // Default fallback
            }
        });

        const fetchStatuses = frappe.call({
            method: "project_enhancements.project_enhancements.page.project_dashboard.project_dashboard.get_status_options"
        }).then(r => {
            if (r.message && !r.message.error) {
                statusOptionsList = r.message;
            } else {
                console.error("Could not fetch status options", r.message ? r.message.error : 'Unknown error');
                statusOptionsList = ['Open', 'Completed', 'Overdue', 'Cancelled']; // Default fallback
            }
        });

        const fetchProjects = frappe.call({
            method: "project_enhancements.project_enhancements.page.project_dashboard.project_dashboard.get_project_data"
        });

        Promise.all([fetchPriorities, fetchStatuses, fetchProjects]).then(results => {
            const r_proj = results[2]; // Project data is the third promise result
            if (r_proj.message && !r_proj.message.error) {
                allProjects = r_proj.message;
                applyFiltersAndRender(); // Render based on state from URL
            } else {
                content.html(`<p class="text-danger">Error: ${r_proj.message ? r_proj.message.error : 'An unexpected error occurred while fetching projects.'}</p>`);
            }
        }).catch(err => {
            console.error("Error loading initial data", err);
            content.html(`<p class="text-danger">A critical error occurred while loading the dashboard. Please check the console.</p>`);
        });
    }

    // Listen for browser navigation (back/forward buttons)
    window.addEventListener('popstate', () => {
        if (allProjects.length > 0) {
            parseURLAndSetState();
            applyFiltersAndRender();
        } else {
            // If data isn't loaded, a page refresh is likely needed.
            // This can happen if the user navigates away and then back.
            window.location.reload();
        }
    });

    loadInitialData();

    $(`<style>
        .table thead th { cursor: pointer; user-select: none; }
        .table thead th.sorted-asc::after { content: ' ▲'; font-size: 10px; }
        .table thead th.sorted-desc::after { content: ' ▼'; font-size: 10px; }
        #sortable-list li { cursor: grab; }
        .nav-tabs { border-bottom: 1px solid #d1d8dd; }
        .nav-tabs .nav-link { border: 1px solid transparent; border-top-left-radius: .25rem; border-top-right-radius: .25rem; }
        .nav-tabs .nav-link.active { color: #495057; background-color: #fff; border-color: #d1d8dd #d1d8dd #fff; }
        .task-row td { vertical-align: middle; }
        .task-row:hover { background-color: #f8f9fa; }
        .toggle-child-tasks { cursor: pointer; }
    </style>`).appendTo(wrapper);
}
