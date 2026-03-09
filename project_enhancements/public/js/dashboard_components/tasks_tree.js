frappe.provide('project_enhancements.dashboard_components');

project_enhancements.dashboard_components.TasksTree = class TasksTree {
    constructor(wrapper) {
        this.wrapper = $(wrapper);
        this.abortController = null;
    }

    async render(projectName) {
        this.wrapper.empty();

        if (projectName) {
            // Render specific project task tree
            this.render_project_tasks(projectName);
        } else {
            // Render project selection view
            this.show_skeleton();
            try {
                await this.fetch_and_render_project_selection();
            } catch (error) {
                this.handle_error(error);
            }
        }
    }

    async fetch_and_render_project_selection() {
        this.abortController = new AbortController();
        const signal = this.abortController.signal;

        try {
            const projects = await project_enhancements.dashboard_api.call({
                method: "project_enhancements.project_enhancements.page.project_dashboard.project_dashboard.get_project_data"
            }, signal);

            if (signal.aborted) return;

            if (projects.message && !projects.message.error) {
                const activeProjects = projects.message.filter(p => p.is_active === 'Yes');
                this.render_project_list(activeProjects);
            } else {
                throw new Error(projects.message ? projects.message.error : 'Unknown error fetching projects');
            }
        } finally {
            this.abortController = null;
        }
    }

    render_project_list(projects) {
        this.wrapper.empty();

        if (!projects || projects.length === 0) {
            this.wrapper.html('<p class="text-muted text-center p-4">No active projects found.</p>');
            return;
        }

        const listContainer = $('<div class="frappe-list"></div>').appendTo(this.wrapper);

        const table = $(`
            <table class="table table-bordered table-hover">
                <thead class="thead-light">
                    <tr>
                        <th>Project Name</th>
                        <th width="150px">Actions</th>
                    </tr>
                </thead>
                <tbody></tbody>
            </table>
        `).appendTo(listContainer);

        const tbody = table.find('tbody');

        // Sort projects alphabetically by project name
        projects.sort((a, b) => a.project_name.localeCompare(b.project_name));

        projects.forEach(p => {
            const row = $(`
                <tr>
                    <td><a href="/app/project/${p.name}?view=custom_scope&origin=dashboard" class="font-weight-bold">${p.project_name}</a></td>
                    <td><button class="btn btn-primary btn-sm view-tasks-btn" data-project="${p.name}">View Tasks</button></td>
                </tr>
            `);
            tbody.append(row);
        });

        // Event listener for view tasks buttons
        this.wrapper.find('.view-tasks-btn').on('click', (e) => {
            const projectName = $(e.currentTarget).data('project');
            frappe.set_route('project-dashboard', 'tasks-tree', projectName);
        });
    }

    render_project_tasks(projectName) {
        // Create header with back button
        const header = $(`
            <div class="d-flex align-items-center mb-3">
                <button class="btn btn-default btn-sm mr-3 back-to-projects-btn">
                    <i class="fa fa-arrow-left mr-1"></i> Back to Projects
                </button>
                <h4 class="mb-0">Tasks for ${projectName}</h4>
            </div>
            <div class="task-tree-wrapper"></div>
        `).appendTo(this.wrapper);

        const treeWrapper = header.filter('.task-tree-wrapper').add(header.find('.task-tree-wrapper')).first();

        // Handle Back Navigation via Frappe router
        this.wrapper.on('click', '.back-to-projects-btn', () => {
            frappe.set_route('project-dashboard', 'tasks-tree');
        });

        // Wait for task_tree_manager to be available
        frappe.require('/assets/project_enhancements/js/task_tree_manager.js', () => {
            // Instantiate the Shared Manager natively inside the wrapper
            // task_tree_manager will be updated in next step to use the native dashboard api
            new project_enhancements.TaskTreeManager({
                wrapper: treeWrapper,
                projectName: projectName
            });
        });
    }

    show_skeleton() {
        this.wrapper.html(`
            <div class="skeleton-list p-4">
                <div class="skeleton-line" style="width: 100%; height: 20px; margin-bottom: 10px;"></div>
                <div class="skeleton-line" style="width: 100%; height: 20px; margin-bottom: 10px;"></div>
                <div class="skeleton-line" style="width: 100%; height: 20px; margin-bottom: 10px;"></div>
                <div class="skeleton-line" style="width: 100%; height: 20px;"></div>
            </div>
        `);
    }

    handle_error(error) {
        if (error.name === 'CancellationError') {
            console.log('Tasks Tree request aborted due to context switch.');
            return;
        }

        console.error('Tasks Tree Error:', error);

        this.wrapper.html(`
            <div class="alert alert-danger p-4 text-center">
                <h4><i class="fa fa-exclamation-triangle mr-2"></i> Failed to Load Data</h4>
                <p>${error.message || 'An unexpected error occurred.'}</p>
                <button class="btn btn-primary btn-sm mt-3 retry-btn">Retry</button>
            </div>
        `);

        this.wrapper.find('.retry-btn').on('click', () => {
            this.render(); // This will re-fetch and render project selection, not specific tree (unless managed in state).
            // We'll rely on route change logic to trigger correct render
        });
    }

    unmount() {
        if (this.abortController) {
            this.abortController.abort();
        }
        this.wrapper.empty();
    }
};
