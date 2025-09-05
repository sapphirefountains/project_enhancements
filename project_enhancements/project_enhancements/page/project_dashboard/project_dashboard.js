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
    let currentSort = { field: 'project_name', order: 'asc' };
    let activeTab = 'Yes'; // Default to 'Yes'
    let priorityView = 'grouped'; // 'grouped' or 'ranked'
    let expandedGroups = new Set();

    const tabContainer = $(`
        <ul class="nav nav-tabs px-3">
            <li class="nav-item">
                <a class="nav-link active" href="#" data-status="Yes">Active Projects</a>
            </li>
            <li class="nav-item">
                <a class="nav-link" href="#" data-status="No">Inactive Projects</a>
            </li>
            <li class="nav-item">
                <a class="nav-link" href="#" data-status="Priority">Priority Overview</a>
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
            const rowHTML = `<tr><td class="${getPriorityClass(project.custom_project_priority)}">${project.custom_project_priority || ''}</td><td><a href="/app/project/${project.name}" class="font-weight-bold">${project.project_name}</a></td><td>${project.name}</td><td><span class="badge ${getStatusClass(project.status)}">${project.status}</span></td><td>${project.completed_tasks} / ${project.total_tasks}</td><td>${project.project_user || ''}</td></tr>`;
            tableBody.append(rowHTML);
        });
        updateSortIcons();
    }
    
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
                const rowHTML = `<tr><td><a href="/app/project/${project.name}" class="font-weight-bold">${project.project_name}</a></td><td>${project.name}</td><td><span class="badge ${getStatusClass(project.status)}">${project.status}</span></td><td class="${getPriorityClass(project.custom_project_priority)}">${project.custom_project_priority || ''}</td><td>${project.completed_tasks} / ${project.total_tasks}</td><td>${project.project_user || ''}</td></tr>`;
                tableBody.append(rowHTML);
            });
            
            if (expandedGroups.has(type)) {
                groupHeader.next('.collapsible-body').show();
                groupHeader.find('svg').addClass('rotate-180');
            }
        });

        updateSortIcons();
    }
    
    function applyFiltersAndRender() {
        let filteredProjects;

        if (activeTab === 'Priority') {
            filteredProjects = allProjects.filter(p => p.is_active === 'Yes' && p.status !== 'Completed' && p.status !== 'Cancelled');
        } else {
            const isActiveFilter = activeTab;
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
    
    function updateSortIcons() {
        content.find('thead th').removeClass('sorted-asc sorted-desc');
        const currentTh = content.find(`thead th[data-sort="${currentSort.field}"]`);
        currentTh.addClass(currentSort.order === 'asc' ? 'sorted-asc' : 'sorted-desc');
    }

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

    // Event Listeners
    searchInput.on('keyup', frappe.utils.debounce(applyFiltersAndRender, 300));
    groupSortSelect.on('change', applyFiltersAndRender);
    configureSortBtn.on('click', openSortConfiguration);

    tabContainer.on('click', '.nav-link', function(e) {
        e.preventDefault();
        const clickedTab = $(this);
        if (clickedTab.hasClass('active')) return;

        tabContainer.find('.nav-link').removeClass('active');
        clickedTab.addClass('active');
        activeTab = clickedTab.data('status');

        if (activeTab === 'Priority') {
            priorityViewToggle.show();
        } else {
            priorityViewToggle.hide();
        }

        applyFiltersAndRender();
    });

    priorityViewToggle.on('click', 'button', function() {
        const $btn = $(this);
        if ($btn.hasClass('active')) return;

        priorityViewToggle.find('button').removeClass('active');
        $btn.addClass('active');
        priorityView = $btn.data('view');
        applyFiltersAndRender();
    });

    content.on('click', '.collapsible-header', function() {
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

    // Helper Functions
    function getStatusClass(status) { /* ... same as before ... */ }
    function getPriorityClass(priority) { /* ... same as before ... */ }
    function getStatusClass(status) {
        switch(status) {
            case 'Open': return 'badge-primary';
            case 'Completed': return 'badge-success';
            case 'Overdue': return 'badge-danger';
            default: return 'badge-secondary';
        }
    }
    function getPriorityClass(priority) {
        if (!priority) return '';
        switch (priority.toLowerCase()) {
            case 'high': return 'text-danger font-weight-bold';
            case 'medium': return 'text-warning';
            default: return 'text-muted';
        }
    }

    // Initial Data Load
    frappe.call({
        method: "project_enhancements.project_enhancements.page.project_dashboard.project_dashboard.get_project_data",
        callback: function(r) {
            if (r.message && !r.message.error) {
                allProjects = r.message;
                applyFiltersAndRender();
            } else {
                content.html(`<p class="text-danger">Error: ${r.message.error || 'An unexpected error occurred.'}</p>`);
            }
        }
    });

    $(`<style>
        .table thead th { cursor: pointer; user-select: none; }
        .table thead th.sorted-asc::after { content: ' ▲'; font-size: 10px; }
        .table thead th.sorted-desc::after { content: ' ▼'; font-size: 10px; }
        #sortable-list li { cursor: grab; }
        .nav-tabs { border-bottom: 1px solid #d1d8dd; }
        .nav-tabs .nav-link { border: 1px solid transparent; border-top-left-radius: .25rem; border-top-right-radius: .25rem; }
        .nav-tabs .nav-link.active { color: #495057; background-color: #fff; border-color: #d1d8dd #d1d8dd #fff; }
    </style>`).appendTo(wrapper);
}
