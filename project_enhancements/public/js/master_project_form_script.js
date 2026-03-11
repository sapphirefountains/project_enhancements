console.log("master_project_form_script.js loaded successfully.");

// The frappe.ui.form.on event is triggered when a form is loaded in Frappe.
// We are targeting the 'Master Project' DocType specifically.
frappe.ui.form.on('Master Project', {
    // The 'refresh' trigger ensures our script runs every time the form is loaded or refreshed.
    onload: function(frm) {
        console.log("Master Project form 'onload' triggered.");
    },
    refresh: function(frm) {
        console.log("Master Project form 'refresh' triggered.");

        // Target the custom 'project_list' HTML field
        const targetField = frm.fields_dict['project_list'];
        console.log("Target field 'project_list':", targetField);

        if (targetField && targetField.wrapper) {
            console.log("Target field and wrapper found. Rendering projects table.");
            render_projects_table(frm, targetField.wrapper);
        } else {
            console.error("Error: targetField or targetField.wrapper is missing for 'project_list'.");
            frappe.msgprint({
                title: __('Missing Field'),
                indicator: 'red',
                message: __('The custom HTML field "project_list" could not be found or initialized. Please check the DocType configuration.')
            });
        }
    }
});

function render_projects_table(frm, wrapper) {
    const masterProjectName = frm.doc.name;
    console.log("Master Project Name:", masterProjectName);

    $(wrapper).html(`
        <div class="project-list-manager glass-panel p-3">
            <div class="task-tree-header mb-3">
                <div class="d-flex justify-content-between align-items-center mb-2">
                    <div class="d-flex align-items-center">
                        <h5 class="mb-0 mr-3">Projects</h5>
                        <a href="/app/project/new-project?custom_master_project=${encodeURIComponent(masterProjectName)}" class="btn btn-primary btn-sm" style="background-color: var(--blue-500); border-color: var(--blue-500);">Add Project</a>
                    </div>
                </div>
                <div class="task-filters p-2 rounded-sm bg-light" style="background-color: var(--control-bg) !important; border: 1px solid var(--border-color);">
                    <div class="row align-items-center">
                        <div class="col-md-4"><input type="text" class="form-control form-control-sm project-name-filter" placeholder="Filter by project name..."></div>
                        <div class="col-md-4"><input type="text" class="form-control form-control-sm project-owner-filter" placeholder="Filter by owner..."></div>
                        <div class="col-md-2">
                            <select class="form-control form-control-sm project-status-filter">
                                <option value="">All Statuses</option>
                                <option value="Open">Open</option>
                                <option value="Completed">Completed</option>
                                <option value="Cancelled">Cancelled</option>
                            </select>
                        </div>
                        <div class="col-md-2"><button class="btn btn-sm btn-default btn-block clear-filters-btn">Clear Filters</button></div>
                    </div>
                </div>
            </div>

            <div class="table-responsive">
                <table class="table table-bordered table-hover mb-0 project-list-table">
                    <thead class="bg-light">
                        <tr>
                            <th style="width: 25%">Project Name</th>
                            <th style="width: 15%">Owner</th>
                            <th style="width: 10%">Status</th>
                            <th style="width: 15%">Start Date</th>
                            <th style="width: 15%">End Date</th>
                            <th style="width: 12%">% Complete</th>
                            <th style="width: 8%">Duration</th>
                        </tr>
                    </thead>
                    <tbody class="project-list-body">
                        <tr><td colspan="7" class="text-center text-muted">Loading projects...</td></tr>
                    </tbody>
                </table>
            </div>
        </div>
    `);

    console.log("Attempting to fetch projects for Master Project:", masterProjectName);
    // Fetch the projects
    frappe.call({
        method: "frappe.client.get_list",
        args: {
            doctype: "Project",
            filters: {
                custom_master_project: masterProjectName
            },
            fields: [
                "name",
                "project_name",
                "status",
                "expected_start_date",
                "expected_end_date",
                "percent_complete"
            ],
            limit_page_length: 0
        },
        callback: function(r) {
            console.log("frappe.client.get_list response:", r);
            if (r.exc) {
                console.error("Error fetching projects:", r.exc);
                frappe.msgprint({
                    title: __('Error Fetching Projects'),
                    indicator: 'red',
                    message: __('An error occurred while fetching the projects for this Master Project.')
                });
                return;
            }

            let projects = r.message || [];
            console.log(`Fetched ${projects.length} projects.`);

            // Because standard get_list doesn't fetch assigned users easily without additional queries,
            // we will fetch assignments next.
            if (projects.length > 0) {
                let project_names = projects.map(p => p.name);
                console.log("Attempting to fetch ToDo entries for project names:", project_names);

                frappe.call({
                    method: 'frappe.client.get_list',
                    args: {
                        doctype: 'ToDo',
                        filters: {
                            reference_type: 'Project',
                            reference_name: ['in', project_names],
                            status: 'Open'
                        },
                        fields: ['reference_name', 'allocated_to'],
                        limit_page_length: 0
                    },
                    callback: function(todo_r) {
                        console.log("frappe.client.get_list (ToDo) response:", todo_r);
                        if (todo_r.exc) {
                            console.error("Error fetching ToDos:", todo_r.exc);
                            frappe.msgprint({
                                title: __('Error Fetching Assignments'),
                                indicator: 'orange',
                                message: __('An error occurred while fetching project assignments, some users may not display correctly.')
                            });
                        }

                        let todos = todo_r.message || [];
                        let assignments = {};
                        todos.forEach(t => {
                            if (!assignments[t.reference_name]) {
                                assignments[t.reference_name] = [];
                            }
                            if (t.allocated_to && !assignments[t.reference_name].includes(t.allocated_to)) {
                                assignments[t.reference_name].push(t.allocated_to);
                            }
                        });

                        projects.forEach(p => {
                            p.owners = assignments[p.name] || [];
                        });

                        populate_table(wrapper, projects);
                        bind_events(wrapper, projects);
                    }
                });
            } else {
                populate_table(wrapper, projects);
                bind_events(wrapper, projects);
            }
        }
    });
}

function get_status_label(status) {
    let colorClass = "badge-secondary"; // Default
    if (status === "Completed") colorClass = "badge-success";
    else if (status === "Open" || status === "Active") colorClass = "badge-primary";
    else if (status === "Cancelled" || status === "Overdue") colorClass = "badge-danger";
    else if (status === "Working" || status === "On Hold") colorClass = "badge-warning";

    return `<span class="badge ${colorClass}">${status || 'None'}</span>`;
}

function populate_table(wrapper, projects) {
    const tbody = $(wrapper).find('.project-list-body');
    tbody.empty();

    if (!projects || projects.length === 0) {
        tbody.html('<tr><td colspan="7" class="text-center text-muted">No projects found for this Master Project.</td></tr>');
        return;
    }

    projects.forEach(p => {
        let owners_display = p.owners && p.owners.length > 0 ? p.owners.join(', ') : 'Unassigned';
        let start_date = p.expected_start_date ? frappe.datetime.str_to_user(p.expected_start_date) : 'Set Date';
        let end_date = p.expected_end_date ? frappe.datetime.str_to_user(p.expected_end_date) : 'Set Date';
        let percent_complete = p.percent_complete || 0;

        // Calculate duration
        let duration = '';
        if (p.expected_start_date && p.expected_end_date) {
            let days = frappe.datetime.get_diff(p.expected_end_date, p.expected_start_date);
            duration = days;
        }

        let safeProjectName = p.project_name ? frappe.utils.escape_html(p.project_name) : frappe.utils.escape_html(p.name);

        let row = `
            <tr class="project-row" data-project-name="${(p.project_name || p.name).toLowerCase().replace(/"/g, '&quot;')}" data-owner="${owners_display.toLowerCase().replace(/"/g, '&quot;')}" data-status="${(p.status || '').replace(/"/g, '&quot;')}">
                <td>
                    <i class="fa fa-bars text-muted mr-2"></i>
                    <a href="/app/project/${encodeURIComponent(p.name)}">${safeProjectName}</a>
                </td>
                <td>${owners_display}</td>
                <td>${get_status_label(p.status)}</td>
                <td>${start_date}</td>
                <td>${end_date}</td>
                <td>
                    <div class="progress" style="height: 15px;">
                        <div class="progress-bar bg-dark" role="progressbar" style="width: ${percent_complete}%;" aria-valuenow="${percent_complete}" aria-valuemin="0" aria-valuemax="100">${percent_complete}%</div>
                    </div>
                </td>
                <td>${duration}</td>
            </tr>
        `;
        tbody.append(row);
    });
}

function bind_events(wrapper, projects) {
    const apply_filters = () => {
        const name_filter = $(wrapper).find('.project-name-filter').val().toLowerCase();
        const owner_filter = $(wrapper).find('.project-owner-filter').val().toLowerCase();
        const status_filter = $(wrapper).find('.project-status-filter').val();

        let visible_count = 0;

        $(wrapper).find('.project-row').each(function() {
            const row = $(this);
            const name_match = !name_filter || row.data('project-name').includes(name_filter);
            const owner_match = !owner_filter || row.data('owner').includes(owner_filter);
            const status_match = !status_filter || row.data('status') === status_filter;

            if (name_match && owner_match && status_match) {
                row.show();
                visible_count++;
            } else {
                row.hide();
            }
        });

        // Update empty state
        if (visible_count === 0 && projects.length > 0) {
            if ($(wrapper).find('.no-results-row').length === 0) {
                $(wrapper).find('.project-list-body').append('<tr class="no-results-row"><td colspan="7" class="text-center text-muted">No projects match the current filters.</td></tr>');
            } else {
                $(wrapper).find('.no-results-row').show();
            }
        } else {
            $(wrapper).find('.no-results-row').hide();
        }
    };

    $(wrapper).find('.project-name-filter, .project-owner-filter').on('keyup', frappe.utils.debounce(apply_filters, 300));
    $(wrapper).find('.project-status-filter').on('change', apply_filters);

    $(wrapper).find('.clear-filters-btn').on('click', () => {
        $(wrapper).find('.project-name-filter').val('');
        $(wrapper).find('.project-owner-filter').val('');
        $(wrapper).find('.project-status-filter').val('');
        apply_filters();
    });
}
