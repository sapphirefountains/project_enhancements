frappe.provide('project_enhancements.dashboard_components');

project_enhancements.dashboard_components.PriorityOverview = class PriorityOverview {
    constructor(wrapper) {
        this.wrapper = $(wrapper);
        this.abortController = null;
        this.current_view = 'company_priority';
        this.projects = [];
    }

    set_view(view) {
        this.current_view = view;
        if (this.projects && this.projects.length > 0) {
            this.render_list_view(this.projects);
        }
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
                this.projects = projects.message.filter(p => p.is_active === 'Yes');
                this.render_list_view(this.projects);
            } else {
                throw new Error(projects.message ? projects.message.error : 'Unknown error fetching projects');
            }
        } finally {
            this.abortController = null;
        }
    }

    get_priority_weight(priority) {
        if (!priority) return 100; // Empty/null treated as Not Assigned

        let p = String(priority).trim();

        if (p.toLowerCase() === 'not assigned') return 100;
        if (p.toLowerCase() === 'repair visit') return 101;
        if (p.toLowerCase() === 'maintenance') return 102;

        let num = parseInt(p, 10);
        if (!isNaN(num)) {
            return num; // 1 to 30
        }

        return 200; // Unknown string values get pushed to the very bottom
    }

    render_list_view(projects) {
        this.wrapper.empty();

        if (!projects || projects.length === 0) {
            this.wrapper.html('<p class="text-muted text-center p-4">No active projects found for priority overview.</p>');
            return;
        }

        const listContainer = $('<div class="frappe-list"></div>').appendTo(this.wrapper);

        if (this.current_view === 'company_priority') {
            // Sort by company priority
            let sorted_projects = [...projects].sort((a, b) => {
                let weightA = this.get_priority_weight(a.custom_company_priority);
                let weightB = this.get_priority_weight(b.custom_company_priority);

                if (weightA !== weightB) {
                    return weightA - weightB;
                }

                // Fallback to alphabetical project name if priorities are same
                let nameA = a.project_name || '';
                let nameB = b.project_name || '';
                return nameA.localeCompare(nameB);
            });

            this.render_table(listContainer, sorted_projects);
        } else if (this.current_view === 'value_stream') {
            // Group by project_type (Value Stream)
            let groups = {};
            projects.forEach(p => {
                let stream = p.project_type || 'Uncategorized';
                if (!groups[stream]) {
                    groups[stream] = [];
                }
                groups[stream].push(p);
            });

            // Sort streams alphabetically
            let sorted_streams = Object.keys(groups).sort((a, b) => a.localeCompare(b));

            sorted_streams.forEach(stream => {
                // Sort projects within stream by project priority
                let stream_projects = groups[stream].sort((a, b) => {
                    let weightA = this.get_priority_weight(a.custom_project_priority);
                    let weightB = this.get_priority_weight(b.custom_project_priority);

                    if (weightA !== weightB) {
                        return weightA - weightB;
                    }

                    let nameA = a.project_name || '';
                    let nameB = b.project_name || '';
                    return nameA.localeCompare(nameB);
                });

                $(`<h5 class="mt-4 mb-3 text-muted border-bottom pb-2">${stream}</h5>`).appendTo(listContainer);
                this.render_table(listContainer, stream_projects);
            });
        }
    }

    render_table(container, projects) {
        const table = $(`
            <table class="table table-bordered table-hover mb-4">
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
        `).appendTo(container);

        const tbody = table.find('tbody');
        projects.forEach(p => {
            const row = $(`
                <tr>
                    <td><a href="/app/project/${p.name}" class="font-weight-bold">${p.project_name}</a></td>
                    <td>${this.get_priority_badge(p.custom_project_priority)}</td>
                    <td>${this.get_priority_badge(p.custom_company_priority)}</td>
                    <td><span class="badge ${this.get_status_badge(p.status)}">${p.status}</span></td>
                </tr>
            `);

            // Add data attributes to allow global search filtering
            row.data('project_name', p.project_name);
            row.data('custom_project_priority', p.custom_project_priority);
            row.data('custom_company_priority', p.custom_company_priority);
            row.data('status', p.status);

            tbody.append(row);
        });
    }

    get_priority_badge(priority) {
        if (!priority) return '<span class="badge" style="background-color: #6c757d; color: white;">Not Assigned</span>';

        let p = String(priority).trim();
        let safe_p = frappe.utils.escape_html(p);

        if (p.toLowerCase() === 'not assigned') {
            return '<span class="badge" style="background-color: #6c757d; color: white;">' + safe_p + '</span>';
        }
        if (p.toLowerCase() === 'repair visit') {
            return '<span class="badge" style="background-color: #6f42c1; color: white;">' + safe_p + '</span>';
        }
        if (p.toLowerCase() === 'maintenance') {
            return '<span class="badge" style="background-color: #007bff; color: white;">' + safe_p + '</span>';
        }

        let num = parseInt(p, 10);
        if (!isNaN(num)) {
            // 1 to 30 -> Red (0) to Green (120)
            let clamped_num = Math.max(1, Math.min(30, num));
            let hue = ((clamped_num - 1) / 29) * 120;
            // Use 45% lightness so white text is readable across all hues
            return `<span class="badge" style="background-color: hsl(${hue}, 100%, 45%); color: white;">${safe_p}</span>`;
        }

        return '<span class="badge" style="background-color: #6c757d; color: white;">' + safe_p + '</span>';
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
