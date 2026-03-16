console.log("master_project_form_script.js loaded successfully.");

// The frappe.ui.form.on event is triggered when a form is loaded in Frappe.
frappe.ui.form.on('Master Project', {
    onload: function(frm) {
        console.log("Master Project form 'onload' triggered.");
    },
    refresh: function(frm) {
        console.log("Master Project form 'refresh' triggered.");

        // We render Tasks list in the 'tasks' HTML field placeholder
        const tasksField = frm.fields_dict['tasks'];

        if (tasksField && tasksField.wrapper) {
            console.log("Target field and wrapper found. Rendering tasks list.");
            // Debounce the task rendering to avoid redundant fetches on rapid table changes
            if (!frm._debounced_render_tasks) {
                frm._debounced_render_tasks = frappe.utils.debounce(() => {
                    render_tasks_list(frm, tasksField.wrapper);
                }, 300);
            }
            frm._debounced_render_tasks();
        } else {
            console.error("Error: tasksField or tasksField.wrapper is missing for 'tasks'.");
        }
    }
});

// Attach a listener to the child table 'projects' to trigger refresh on change
frappe.ui.form.on('Sub Projects List', {
    project: function(frm, cdt, cdn) {
        if (frm._debounced_render_tasks) {
            frm._debounced_render_tasks();
        }
    }
});

frappe.ui.form.on('Master Project', {
    projects_remove: function(frm, cdt, cdn) {
        if (frm._debounced_render_tasks) {
            frm._debounced_render_tasks();
        }
    }
});

let currentTaskFetchId = 0;

async function render_tasks_list(frm, wrapper) {
    const fetchId = ++currentTaskFetchId; // Closure for cancellation
    const masterProjectName = frm.doc.name;

    // Extract linked projects from child table
    let linkedProjects = [];
    if (frm.doc.projects && frm.doc.projects.length > 0) {
        linkedProjects = frm.doc.projects.map(row => row.project).filter(p => p);
    }

    // Setup initial loading state
    $(wrapper).html(`
        <div class="tasks-list-manager glass-panel p-3">
            <h4 class="mb-3">Master Project Tasks</h4>
            <div class="text-center text-muted p-4">
                <i class="fa fa-spinner fa-spin fa-2x mb-2"></i>
                <p>Loading tasks...</p>
            </div>
        </div>
    `);

    // Concurrent Data Acquisition
    let tasksState = {};

    const TIMEOUT_MS = 10000; // 10 seconds timeout

    const fetchWithTimeout = (promise) => {
        let timeout = new Promise((resolve, reject) => {
            let id = setTimeout(() => {
                clearTimeout(id);
                reject(new Error('Fetch timed out'));
            }, TIMEOUT_MS);
        });
        return Promise.race([promise, timeout]);
    };

    // Promise generator for fetching tasks for a specific project
    const fetchProjectTasks = (projectName) => {
        return new Promise((resolve, reject) => {
            frappe.call({
                method: "frappe.client.get_list",
                args: {
                    doctype: "Task",
                    filters: { project: projectName },
                    fields: ["name", "subject", "status", "priority", "exp_start_date", "exp_end_date"],
                    limit_page_length: 0
                },
                callback: function(r) {
                    if (r.exc) reject(r.exc);
                    else resolve({ projectName: projectName, tasks: r.message || [] });
                }
            });
        });
    };

    // Promise generator for fetching tasks assigned directly to the master project
    // Assuming custom field "custom_master_project" exists on Task or relying on standard relations.
    // If it doesn't exist, this might just return empty, but we must implement the feature.
    const fetchMasterProjectTasks = () => {
        return new Promise((resolve, reject) => {
            frappe.call({
                method: "frappe.client.get_list",
                args: {
                    doctype: "Task",
                    filters: { custom_master_project: masterProjectName, project: ["in", ["", null]] },
                    fields: ["name", "subject", "status", "priority", "exp_start_date", "exp_end_date"],
                    limit_page_length: 0
                },
                callback: function(r) {
                    if (r.exc) resolve({ projectName: masterProjectName, isMaster: true, tasks: [], error: true }); // fail gracefully
                    else resolve({ projectName: masterProjectName, isMaster: true, tasks: r.message || [] });
                }
            });
        });
    };

    try {
        let fetchPromises = linkedProjects.map(p => fetchWithTimeout(fetchProjectTasks(p)));
        fetchPromises.unshift(fetchWithTimeout(fetchMasterProjectTasks())); // Add Master Project fetch

        const results = await Promise.allSettled(fetchPromises);

        // If another fetch was triggered while waiting, abort this render.
        if (fetchId !== currentTaskFetchId) {
            console.log("Stale task fetch aborted.");
            return;
        }

        // State Aggregation
        let htmlContent = `<div class="tasks-list-manager glass-panel p-3">`;

        let anyFailures = false;

        results.forEach(result => {
            if (result.status === "fulfilled") {
                let data = result.value;
                if (!data.tasks) data.tasks = [];

                // Group Header
                let headerTitle = data.isMaster ? `Master Project: ${frappe.utils.escape_html(data.projectName)}` : `Project: ${frappe.utils.escape_html(data.projectName)}`;
                htmlContent += `
                    <div class="task-group mb-4">
                        <h5 class="task-group-header border-bottom pb-2 mb-3 text-primary">${headerTitle}</h5>
                `;

                if (data.tasks.length === 0) {
                    htmlContent += `<div class="text-muted small mb-3">No tasks found.</div>`;
                } else {
                    htmlContent += `
                        <div class="table-responsive">
                            <table class="table table-sm table-bordered table-hover mb-0">
                                <thead class="bg-light text-muted">
                                    <tr>
                                        <th style="width: 40%">Task</th>
                                        <th style="width: 15%">Status</th>
                                        <th style="width: 15%">Priority</th>
                                        <th style="width: 15%">Start Date</th>
                                        <th style="width: 15%">End Date</th>
                                    </tr>
                                </thead>
                                <tbody>
                    `;

                    data.tasks.forEach(t => {
                        let statusColor = "badge-secondary";
                        if (t.status === "Completed") statusColor = "badge-success";
                        else if (t.status === "Open") statusColor = "badge-primary";
                        else if (t.status === "Overdue" || t.status === "Cancelled") statusColor = "badge-danger";
                        else if (t.status === "Working") statusColor = "badge-warning";

                        let priorityColor = "text-muted";
                        if (t.priority === "High" || t.priority === "Urgent") priorityColor = "text-danger font-weight-bold";
                        else if (t.priority === "Medium") priorityColor = "text-warning";

                        let startDate = t.exp_start_date ? frappe.datetime.str_to_user(t.exp_start_date) : '-';
                        let endDate = t.exp_end_date ? frappe.datetime.str_to_user(t.exp_end_date) : '-';
                        let safeSubject = t.subject ? frappe.utils.escape_html(t.subject) : t.name;

                        // Click to route to the source data
                        htmlContent += `
                            <tr>
                                <td>
                                    <a href="/app/task/${encodeURIComponent(t.name)}" target="_blank" class="text-dark font-weight-500">
                                        ${safeSubject}
                                    </a>
                                </td>
                                <td><span class="badge ${statusColor}">${t.status || ''}</span></td>
                                <td><span class="${priorityColor}">${t.priority || ''}</span></td>
                                <td>${startDate}</td>
                                <td>${endDate}</td>
                            </tr>
                        `;
                    });

                    htmlContent += `
                                </tbody>
                            </table>
                        </div>
                    `;
                }

                htmlContent += `</div>`; // Close task-group
            } else {
                anyFailures = true;
                console.error("Task fetch failed for a project:", result.reason);
            }
        });

        if (anyFailures) {
            htmlContent = `
                <div class="alert alert-warning p-2 mb-3">
                    <i class="fa fa-exclamation-triangle mr-1"></i>
                    Some tasks could not be retrieved due to a network or database error.
                </div>
            ` + htmlContent;
        }

        if (linkedProjects.length === 0 && (!results[0] || results[0].value.tasks.length === 0)) {
             htmlContent += `<div class="text-center text-muted p-4">No linked projects or tasks found.</div>`;
        }

        htmlContent += `</div>`; // Close tasks-list-manager

        // Single atomic write to the DOM
        $(wrapper).html(htmlContent);

    } catch (err) {
        if (fetchId !== currentTaskFetchId) return; // Stale request

        console.error("Critical error in concurrent task fetch:", err);
        $(wrapper).html(`
            <div class="alert alert-danger p-3">
                <i class="fa fa-exclamation-circle fa-2x pull-left text-danger"></i>
                <h5 class="text-danger">Failed to load tasks</h5>
                <p class="mb-0">An unexpected error occurred while fetching task data.</p>
            </div>
        `);
    }
}
