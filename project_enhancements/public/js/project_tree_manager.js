frappe.provide('project_enhancements');

project_enhancements.ProjectTreeManager = class ProjectTreeManager {
    constructor({ wrapper, masterProjectName, readonly = false }) {
        this.wrapper = $(wrapper);
        this.masterProjectName = masterProjectName;
        this.readonly = readonly;
        this.projects = [];
        this.collapsedProjects = new Set();
        this.pendingChanges = {};
        // Default options, will be updated from server
        this.projectStatusOptions = ['Open', 'Completed', 'Cancelled'];
        this.sortableInstances = [];

        // Load collapsed state from local storage
        const savedState = localStorage.getItem(`collapsedProjects_${this.masterProjectName}`);
        if (savedState) {
            this.collapsedProjects = new Set(JSON.parse(savedState));
        }

        this.init();
    }

    init() {
        this.loadAssets().then(() => {
            this.renderStructure();
            this.fetchData();
        });
    }

    loadAssets() {
        return new Promise((resolve) => {
            // Load custom CSS
            frappe.require('/assets/project_enhancements/css/task_tree.css', () => {
                // Load SortableJS
                const script_url = "https://cdn.jsdelivr.net/npm/sortablejs@latest/Sortable.min.js";
                frappe.require(script_url, () => {
                    resolve();
                });
            });
        });
    }

    renderStructure() {
        this.wrapper.html(`
            <div class="task-tree-manager glass-panel p-3">
                <div class="task-tree-header mb-3">
                    <div class="d-flex justify-content-between align-items-center mb-2">
                        <div class="d-flex align-items-center">
                            <h5 class="mb-0 mr-3">Projects</h5>
                            <span class="task-saving-indicator text-muted mr-3" style="display: none;"><i class="fa fa-spinner fa-spin"></i> Saving...</span>
                            <div class="task-pending-changes-controls mr-2" style="display: none;">
                                <div class="btn-group btn-group-sm">
                                    <button type="button" class="btn btn-glass-success save-changes-btn">Save Changes</button>
                                    <button type="button" class="btn btn-glass-danger discard-changes-btn">Discard Changes</button>
                                </div>
                            </div>
                            <button class="btn btn-sm btn-glass-success mr-2 save-order-btn" style="display: none;">Save Order</button>
                            ${!this.readonly ? `<a href="/app/project/new-project?custom_master_project=${this.masterProjectName}" class="btn btn-vibrant-blue btn-sm">Add Project</a>` : ''}
                        </div>
                    </div>
                    <div class="task-filters p-2 rounded-sm bg-light" style="background-color: rgba(255, 255, 255, 0.4) !important;">
                        <div class="row">
                            <div class="col-md-4"><input type="text" class="form-control form-control-sm project-name-filter" placeholder="Filter by project name..."></div>
                            <div class="col-md-4"><input type="text" class="form-control form-control-sm project-owner-filter" placeholder="Filter by owner..."></div>
                            <div class="col-md-2"><select class="form-control form-control-sm project-status-filter"><option value="">All Statuses</option></select></div>
                            <div class="col-md-2"><button class="btn btn-sm btn-glass-neutral btn-block clear-filters-btn">Clear Filters</button></div>
                        </div>
                    </div>
                </div>
                <div class="task-grid">
                    <div class="task-grid-header">
                        <div class="task-grid-cell">Project</div>
                        <div class="task-grid-cell">Owner</div>
                        <div class="task-grid-cell">Status</div>
                        <div class="task-grid-cell">Start Date</div>
                        <div class="task-grid-cell">End Date</div>
                        <div class="task-grid-cell">% Complete</div>
                    </div>
                    <div class="task-grid-body"></div>
                </div>
            </div>
        `);

        this.bindEvents();
    }

    fetchData() {
        const fetchStatusOptions = frappe.call({
            method: "project_enhancements.project_enhancements.page.project_dashboard.project_dashboard.get_status_options"
        });

        const fetchProjects = frappe.call({
            method: 'project_enhancements.project_enhancements.page.project_dashboard.project_dashboard.get_master_project_projects',
            args: { master_project: this.masterProjectName }
        });

        Promise.all([fetchStatusOptions, fetchProjects]).then(results => {
            const statusResult = results[0];
            const projectsResult = results[1];

            if (statusResult.message) {
                this.projectStatusOptions = statusResult.message;
                this.updateStatusFilterOptions();
            }

            if (projectsResult.message && !projectsResult.message.error) {
                this.projects = projectsResult.message;
                this.renderGrid(this.projects);
            } else {
                this.wrapper.find('.task-grid-body').html(`<div class="alert alert-danger">Error fetching projects: ${projectsResult.message ? projectsResult.message.error : 'Unknown error'}</div>`);
            }
        });
    }

    updateStatusFilterOptions() {
        const filter = this.wrapper.find('.project-status-filter');
        // keep the first option
        filter.find('option:not(:first)').remove();
        this.projectStatusOptions.forEach(s => {
            filter.append(`<option value="${s}">${s}</option>`);
        });
    }

    renderGrid(projects) {
        const gridBody = this.wrapper.find('.task-grid-body');
        gridBody.empty();

        if (!projects || projects.length === 0) {
            gridBody.html('<div class="p-4 text-center text-muted">No projects match filters.</div>');
            return;
        }

        const renderProjectNode = (project, container, level) => {
            const start_date = project.expected_start_date ? frappe.datetime.str_to_user(project.expected_start_date) : 'Set Date';
            const end_date = project.expected_end_date ? frappe.datetime.str_to_user(project.expected_end_date) : 'Set Date';
            const progress = project.percent_complete || 0;
            const isCollapsed = this.collapsedProjects.has(project.name);

            // Removed children checks as Projects might not have sub-projects in this exact same tree format
            // but we'll leave the nesting logic in case custom_parent_project gets implemented later
            const iconClass = project.children && project.children.length > 0
                ? (isCollapsed ? 'fa-caret-right' : 'fa-caret-down') + ' toggle-child-tasks'
                : '';

            const statusStyle = this.getStatusStyle(project.status);
            const hasPendingChange = (field) => this.pendingChanges[project.name] && this.pendingChanges[project.name][field] !== undefined;

            const node = $(`
                <div class="task-node" data-task-id="${project.name}">
                    <div class="task-grid-row">
                        <div class="task-grid-cell">
                            <div style="padding-left: ${level * 20}px; display: flex; align-items: center; width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                                <i class="fa fa-bars task-drag-handle mr-2 text-muted" style="cursor: grab; flex-shrink: 0;"></i>
                                <i class="fa fa-fw ${iconClass} mr-1" style="cursor: pointer; flex-shrink: 0;"></i>
                                <a href="/app/project/${project.name}" style="overflow: hidden; text-overflow: ellipsis;">${project.project_name || project.name}</a>
                            </div>
                        </div>
                        <div class="task-grid-cell assignee-cell"><a href="#" class="assignee-link">${project.assigned_to || 'Unassigned'}</a></div>
                        <div class="task-grid-cell">
                            <select class="form-control form-control-sm project-status-select pill-select" style="width: 120px; ${statusStyle}">
                                ${this.projectStatusOptions.map(s => `<option value="${s}" ${project.status === s ? 'selected' : ''}>${s}</option>`).join('')}
                            </select>
                        </div>
                        <div class="task-grid-cell editable-date ${hasPendingChange('expected_start_date') ? 'unsaved-change' : ''}" data-field="expected_start_date" data-task-id="${project.name}" data-original-date="${project.expected_start_date || ''}"><a href="#">${start_date}</a></div>
                        <div class="task-grid-cell editable-date ${hasPendingChange('expected_end_date') ? 'unsaved-change' : ''}" data-field="expected_end_date" data-task-id="${project.name}" data-original-date="${project.expected_end_date || ''}"><a href="#">${end_date}</a></div>
                        <div class="task-grid-cell editable-progress ${hasPendingChange('percent_complete') ? 'unsaved-change' : ''}" data-field="percent_complete" data-task-id="${project.name}" data-original-value="${progress}">
                            <div style="cursor:pointer; display:flex; align-items:center; width:100%;">
                                <div class="progress" style="height: 15px; width: 100%;"><div class="progress-bar" role="progressbar" style="width: ${progress}%;" aria-valuenow="${progress}" aria-valuemin="0" aria-valuemax="100">${progress}%</div></div>
                            </div>
                        </div>
                    </div>
                    <div class="child-tasks-container" style="${isCollapsed ? 'display: none;' : ''}"></div>
                </div>
            `).appendTo(container);

            if (project.children && project.children.length > 0) {
                const childContainer = node.find('.child-tasks-container');
                project.children.forEach(child => renderProjectNode(child, childContainer, level + 1));
            }
        };

        projects.forEach(project => renderProjectNode(project, gridBody, 0));
        this.initializeTaskSorting();
    }

    initializeTaskSorting() {
        if (this.sortableInstances) {
            this.sortableInstances.forEach(instance => instance.destroy());
        }
        this.sortableInstances = [];

        if (this.readonly) return;

        const sortableContainers = this.wrapper.find('.task-grid-body, .child-tasks-container');
        const me = this;

        sortableContainers.each(function () {
            const instance = new Sortable(this, {
                group: 'nested-projects',
                animation: 150,
                handle: '.task-drag-handle',
                ghostClass: 'sortable-ghost',
                chosenClass: 'sortable-chosen',
                onEnd: function (evt) {
                    me.wrapper.find('.save-order-btn').show();
                }
            });
            me.sortableInstances.push(instance);
        });
    }

    getStatusStyle(status) {
        let color = '#6c757d'; // Default grey
        switch (status) {
            case 'Active': color = '#007bff'; break;
            case 'Open': color = '#007bff'; break;
            case 'Completed': color = '#28a745'; break;
            case 'Overdue': color = '#dc3545'; break;
            case 'Cancelled': color = '#dc3545'; break;
            case 'Canceled': color = '#dc3545'; break;
            case 'Working': color = '#ff9800'; break;
            case 'On Hold': color = '#ff9800'; break;
            case 'Invoiced': color = '#6f42c1'; break;
            default: color = '#6c757d';
        }
        return `background-color: ${color}; color: white;`;
    }

    applyFilters() {
        const nameFilter = (this.wrapper.find('.project-name-filter').val() || '').toLowerCase();
        const ownerFilter = (this.wrapper.find('.project-owner-filter').val() || '').toLowerCase();
        const statusFilter = this.wrapper.find('.project-status-filter').val();

        // Deep copy projects to avoid mutating state during filtering
        let filteredProjects = JSON.parse(JSON.stringify(this.projects));

        const filterNode = (project) => {
            if (project.children && project.children.length > 0) {
                project.children = project.children.map(filterNode).filter(Boolean);
            }
            const hasVisibleChildren = project.children && project.children.length > 0;
            const projectName = project.project_name || project.name;
            const nameMatch = !nameFilter || projectName.toLowerCase().includes(nameFilter);
            const ownerMatch = !ownerFilter || (project.assigned_to || '').toLowerCase().includes(ownerFilter);
            const statusMatch = !statusFilter || project.status === statusFilter;

            if ((nameMatch && ownerMatch && statusMatch) || hasVisibleChildren) {
                return project;
            }
            return null;
        };

        filteredProjects = filteredProjects.map(filterNode).filter(Boolean);
        this.renderGrid(filteredProjects);
    }

    bindEvents() {
        const me = this;

        // Filters
        this.wrapper.on('keyup', '.project-name-filter, .project-owner-filter', frappe.utils.debounce(() => me.applyFilters(), 300));
        this.wrapper.on('change', '.project-status-filter', () => me.applyFilters());
        this.wrapper.on('click', '.clear-filters-btn', () => {
            me.wrapper.find('.project-name-filter').val('');
            me.wrapper.find('.project-owner-filter').val('');
            me.wrapper.find('.project-status-filter').val('');
            me.applyFilters();
        });

        // Toggle children
        this.wrapper.on('click', '.toggle-child-tasks', function () {
            const $icon = $(this);
            const $taskNode = $icon.closest('.task-node');
            const taskId = $taskNode.data('task-id');
            const $childContainer = $taskNode.find('.child-tasks-container');

            $icon.toggleClass('fa-caret-down fa-caret-right');
            $childContainer.slideToggle(200);

            if ($icon.hasClass('fa-caret-right')) {
                me.collapsedProjects.add(taskId);
            } else {
                me.collapsedProjects.delete(taskId);
            }
            localStorage.setItem(`collapsedProjects_${me.masterProjectName}`, JSON.stringify(Array.from(me.collapsedProjects)));
        });

        // Save Order
        this.wrapper.on('click', '.save-order-btn', function() {
            me.saveProjectOrder();
        });

        // Pending Changes
        this.wrapper.on('click', '.save-changes-btn', () => me.savePendingChanges());
        this.wrapper.on('click', '.discard-changes-btn', () => me.discardPendingChanges());

        // Inline Editing - Date
        this.wrapper.on('click', '.editable-date a', function(e) {
            e.preventDefault();
            if (me.readonly) return;
            me.handleDateEdit($(this));
        });

        // Inline Editing - Progress
        this.wrapper.on('click', '.editable-progress > div', function(e) {
            e.preventDefault();
            if (me.readonly) return;
            me.handleProgressEdit($(this));
        });

        // Inline Editing - Status
        this.wrapper.on('change', '.project-status-select', function() {
            if (me.readonly) return;
            me.handleStatusChange($(this));
        });

        // Assignees
        this.wrapper.on('click', '.assignee-link', function(e) {
            e.preventDefault();
            if (me.readonly) return;
            me.showAssigneeDialog($(this));
        });
    }

    handleDateEdit(link) {
        const cell = link.closest('.task-grid-cell');
        if (cell.find('.datepicker-input').length > 0) return;

        const projectName = cell.data('task-id');
        const field = cell.data('field');
        const originalValue = cell.data('original-date');
        let hasChanged = false;

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

            link.text(displayValue);
            cell.addClass('unsaved-change');

            if (!this.pendingChanges[projectName]) this.pendingChanges[projectName] = {};
            this.pendingChanges[projectName][field] = newValue;
            this.showPendingChangesControls();

            this.updateLocalProjectData(projectName, field, newValue);
            cleanup();
        });

        $(datepicker.input).on('blur', () => {
            setTimeout(() => { if (!hasChanged) cleanup(); }, 200);
        });
    }

    handleProgressEdit(div) {
        const cell = div.closest('.task-grid-cell');
        if (cell.find('.progress-input').length > 0) return;

        const projectName = cell.data('task-id');
        const originalValue = cell.data('original-value');
        div.hide();

        const input = $(`<input type="number" class="form-control form-control-sm progress-input" style="width: 80px;" min="0" max="100" step="1">`)
            .val(originalValue)
            .appendTo(cell)
            .focus();

        const cleanup = () => {
            input.remove();
            div.show();
        };

        const save = () => {
            let newValue = input.val();
            if (newValue === '' || isNaN(newValue) || parseFloat(newValue) < 0 || parseFloat(newValue) > 100) {
                cleanup();
                return;
            }
            const newFloatValue = parseFloat(newValue);

            // update UI
            div.find('.progress-bar').css('width', newFloatValue + '%').attr('aria-valuenow', newFloatValue).text(newFloatValue + '%');

            cell.addClass('unsaved-change');

            if (!this.pendingChanges[projectName]) this.pendingChanges[projectName] = {};
            this.pendingChanges[projectName]['percent_complete'] = newFloatValue;
            this.showPendingChangesControls();

            this.updateLocalProjectData(projectName, 'percent_complete', newFloatValue);
            cleanup();
        };

        input.on('blur', save).on('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
            else if (e.key === 'Escape') { e.preventDefault(); cleanup(); }
        });
    }


    handleStatusChange(select) {
        const projectName = select.closest('.task-node').data('task-id');
        const value = select.val();

        select.attr('style', this.getStatusStyle(value));

        if (!this.pendingChanges[projectName]) this.pendingChanges[projectName] = {};
        this.pendingChanges[projectName]['status'] = value;
        this.showPendingChangesControls();

        this.updateLocalProjectData(projectName, 'status', value);
    }

    updateLocalProjectData(projectId, field, value) {
        const findAndUpdate = (list) => {
            for (let project of list) {
                if (project.name === projectId) {
                    project[field] = value;
                    return true;
                }
                if (project.children && project.children.length && findAndUpdate(project.children)) return true;
            }
            return false;
        };
        findAndUpdate(this.projects);
    }

    showPendingChangesControls() {
        this.wrapper.find('.task-pending-changes-controls').show();
    }

    savePendingChanges() {
        frappe.call({
            method: 'project_enhancements.project_enhancements.page.project_dashboard.project_dashboard.update_multiple_docs',
            args: {
                project_updates: JSON.stringify(this.pendingChanges),
                task_updates: '{}'
            },
            callback: (r) => {
                if (r.message && r.message.status === 'success') {
                    frappe.show_alert({ message: 'Changes saved!', indicator: 'green' });
                    this.pendingChanges = {};
                    this.wrapper.find('.task-pending-changes-controls').hide();
                    this.wrapper.find('.unsaved-change').removeClass('unsaved-change');
                } else {
                    frappe.show_alert({ message: r.message.message || 'Error saving changes.', indicator: 'red' });
                }
            }
        });
    }

    discardPendingChanges() {
        this.pendingChanges = {};
        this.wrapper.find('.task-pending-changes-controls').hide();
        this.fetchData(); // Reload to revert
        frappe.show_alert({ message: 'Changes discarded.', indicator: 'info' });
    }

    saveProjectOrder() {
        const saveButton = this.wrapper.find('.save-order-btn');
        const indicator = this.wrapper.find('.task-saving-indicator');

        indicator.show();
        saveButton.prop('disabled', true);

        const updates = [];
        const recurse = (container, parentOrderString) => {
            const children = $(container).children('.task-node');
            children.each((index, element) => {
                const taskNode = $(element);
                const projectId = taskNode.data('task-id');

                let currentOrderString = parentOrderString ? parentOrderString + (index + 1) : (index + 1) + ".0";

                updates.push({
                    name: projectId,
                    custom_subproject_order: parseFloat(currentOrderString)
                });

                const childContainer = taskNode.children('.child-tasks-container');
                if (childContainer.children('.task-node').length > 0) {
                    let nextParentOrderString = currentOrderString.endsWith('.0')
                        ? currentOrderString.slice(0, -2) + '.'
                        : currentOrderString;
                    recurse(childContainer, nextParentOrderString);
                }
            });
        };

        recurse(this.wrapper.find('.task-grid-body'), null);

        frappe.call({
            method: 'project_enhancements.project_enhancements.page.project_dashboard.project_dashboard.update_master_project_structure',
            args: { master_project: this.masterProjectName, projects: updates },
            callback: (r) => {
                if (r.message && r.message.status === 'success') {
                    saveButton.hide();
                    this.fetchData();
                } else {
                    frappe.show_alert({ message: r.message.message || 'Could not save project order.', indicator: 'red' });
                }
            },
            always: () => {
                indicator.hide();
                saveButton.prop('disabled', false);
            }
        });
    }

    showAssigneeDialog(link) {
        const taskNode = link.closest('.task-node');
        const projectId = taskNode.data('task-id');
        const projectName = taskNode.find('.task-grid-cell:first a').text();

        let project;
        const findProject = (list) => {
            for (let t of list) {
                if (t.name === projectId) return t;
                if (t.children) {
                    const found = findProject(t.children);
                    if (found) return found;
                }
            }
            return null;
        };
        project = findProject(this.projects);

        if (!project) return;

        const dialog = new frappe.ui.Dialog({
            title: `Assignments for: ${projectName}`,
            fields: [
                { fieldname: 'assign_to', fieldtype: 'Link', options: 'User', label: 'Assign a user' },
                { fieldname: 'assignees_html', fieldtype: 'HTML', options: '<div class="assignee-list-wrapper mt-3"></div>' }
            ]
        });

        const assigneeListWrapper = dialog.get_field('assignees_html').$wrapper.find('.assignee-list-wrapper');

        const renderAssignees = () => {
            assigneeListWrapper.empty();
            if (project.assignees && project.assignees.length > 0) {
                const assigneeItems = project.assignees.map(a => `
                    <li class="list-group-item d-flex justify-content-between align-items-center">
                        ${a.full_name}
                        <button class="btn btn-xs btn-danger remove-assignee" data-user-id="${a.email}">Remove</button>
                    </li>
                `).join('');
                assigneeListWrapper.html(`<ul class="list-group">${assigneeItems}</ul>`);
            } else {
                assigneeListWrapper.html('<p class="text-muted">No users assigned.</p>');
            }
        };

        const updateLink = () => {
            const text = project.assignees && project.assignees.length ? project.assignees.map(a => a.full_name).join(', ') : 'Unassigned';
            link.text(text);
            project.assigned_to = text;
        };

        dialog.get_field('assign_to').df.onchange = () => {
            const userId = dialog.get_value('assign_to');
            if (!userId) return;

            if (project.assignees && project.assignees.find(a => a.email === userId)) {
                frappe.show_alert({ message: 'User already assigned.', indicator: 'info' });
                dialog.set_value('assign_to', '');
                return;
            }

            frappe.call({
                method: 'project_enhancements.project_enhancements.page.project_dashboard.project_dashboard.add_project_assignee',
                args: { project_name: projectId, user_id: userId },
                callback: (r) => {
                    if (r.message && r.message.status === 'success') {
                        project.assignees = r.message.assignees;
                        renderAssignees();
                        updateLink();
                        dialog.set_value('assign_to', '');
                    } else {
                        frappe.show_alert({ message: r.message.message || 'Error assigning user.', indicator: 'red' });
                    }
                }
            });
        };

        assigneeListWrapper.on('click', '.remove-assignee', function() {
            const userId = $(this).data('user-id');
            frappe.call({
                method: 'project_enhancements.project_enhancements.page.project_dashboard.project_dashboard.remove_project_assignee',
                args: { project_name: projectId, user_id: userId },
                callback: (r) => {
                    if (r.message && r.message.status === 'success') {
                        project.assignees = r.message.assignees;
                        renderAssignees();
                        updateLink();
                    } else {
                        frappe.show_alert({ message: r.message.message || 'Error removing user.', indicator: 'red' });
                    }
                }
            });
        });

        dialog.show();
        renderAssignees();
    }
};
