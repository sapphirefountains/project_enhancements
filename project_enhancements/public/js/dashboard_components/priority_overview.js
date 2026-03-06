frappe.provide('project_enhancements.dashboard_components');

project_enhancements.dashboard_components.PriorityOverview = class PriorityOverview {
    constructor(wrapper) {
        this.wrapper = $(wrapper);
        this.abortController = null;
    }

    async render() {
        this.wrapper.empty();
        this.show_skeleton();

        try {
            await this.fetch_and_render_data();
        } catch (error) {
            this.handle_error(error);
        }
    }

    async fetch_and_render_data() {
        this.abortController = new AbortController();
        const signal = this.abortController.signal;

        try {
            const projects = await project_enhancements.dashboard_api.call({
                method: "project_enhancements.project_enhancements.page.project_dashboard.project_dashboard.get_project_data"
            }, signal);

            if (signal.aborted) return;

            if (projects.message && !projects.message.error) {
                const filteredProjects = projects.message.filter(p => p.is_active === 'Yes');
                this.render_list_view(filteredProjects);
            } else {
                throw new Error(projects.message ? projects.message.error : 'Unknown error fetching projects');
            }
        } finally {
            this.abortController = null;
        }
    }

    render_list_view(projects) {
        this.wrapper.empty();

        if (!projects || projects.length === 0) {
            this.wrapper.html('<p class="text-muted text-center p-4">No active projects found for priority overview.</p>');
            return;
        }

        const listContainer = $('<div class="frappe-list"></div>').appendTo(this.wrapper);

        const table = $(`
            <table class="table table-bordered table-hover">
                <thead class="thead-light">
                    <tr>
                        <th>Project Name</th>
                        <th>Project Priority</th>
                        <th>Company Priority</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody></tbody>
            </table>
        `).appendTo(listContainer);

        const tbody = table.find('tbody');
        projects.forEach(p => {
            const row = $(`
                <tr>
                    <td><a href="/app/project/${p.name}" class="font-weight-bold">${p.project_name}</a></td>
                    <td>${p.custom_project_priority || 'None'}</td>
                    <td>${p.custom_company_priority || 'None'}</td>
                    <td><span class="badge ${this.get_status_badge(p.status)}">${p.status}</span></td>
                </tr>
            `);
            tbody.append(row);
        });
    }

    get_status_badge(status) {
        switch (status) {
            case 'Active': return 'badge-primary';
            case 'Completed': return 'badge-success';
            case 'Overdue': return 'badge-danger';
            case 'Cancelled': return 'badge-danger';
            case 'Working': return 'badge-warning';
            case 'On Hold': return 'badge-warning';
            default: return 'badge-secondary';
        }
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
            console.log('Priority Overview request aborted due to context switch.');
            return;
        }

        console.error('Priority Overview Error:', error);

        this.wrapper.html(`
            <div class="alert alert-danger p-4 text-center">
                <h4><i class="fa fa-exclamation-triangle mr-2"></i> Failed to Load Data</h4>
                <p>${error.message || 'An unexpected error occurred.'}</p>
                <button class="btn btn-primary btn-sm mt-3 retry-btn">Retry</button>
            </div>
        `);

        this.wrapper.find('.retry-btn').on('click', () => {
            this.render();
        });
    }

    unmount() {
        if (this.abortController) {
            this.abortController.abort();
        }
        this.wrapper.empty();
    }
};
