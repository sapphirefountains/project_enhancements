console.log("master_project_form_script.js loaded successfully.");

// The frappe.ui.form.on event is triggered when a form is loaded in Frappe.
frappe.ui.form.on('Master Project', {
    onload: function(frm) {
        console.log("Master Project form 'onload' triggered.");
        frm.set_df_property('task_tree_view', 'hidden', 1);
    },
    refresh: function(frm) {
        console.log("Master Project form 'refresh' triggered.");

        // We render Tasks list in the 'tasks' HTML field placeholder
        const tasksField = frm.fields_dict['tasks'];
        console.log("tasksField object:", tasksField);

        if (tasksField && tasksField.wrapper) {
            console.log("Target field and wrapper found for 'tasks'. Triggering render_tasks_list.");
            // Debounce the task rendering to avoid redundant fetches on rapid table changes
            if (!frm._debounced_render_tasks) {
                frm._debounced_render_tasks = frappe.utils.debounce(() => {
                    render_tasks_list(frm, tasksField.wrapper);
                }, 300);
            }
            frm._debounced_render_tasks();
        } else {
            console.error("Error: tasksField or tasksField.wrapper is missing for 'tasks'.", tasksField);
        }

        // We render Project List in the 'project_list' HTML field placeholder
        const projectListField = frm.fields_dict['project_list'];
        console.log("projectListField object:", projectListField);

        if (projectListField && projectListField.wrapper) {
            console.log("Target field and wrapper found for 'project_list'. Triggering render_project_list.");
            if (!frm._debounced_render_projects) {
                frm._debounced_render_projects = frappe.utils.debounce(() => {
                    render_project_list(frm, projectListField.wrapper);
                }, 300);
            }
            frm._debounced_render_projects();
        } else {
            console.error("Error: projectListField or projectListField.wrapper is missing for 'project_list'.", projectListField);
        }
    }
});

// Attach a listener to the child table 'projects' to trigger refresh on change
frappe.ui.form.on('Sub Projects List', {
    project: function(frm, cdt, cdn) {
        if (frm._debounced_render_tasks) {
            frm._debounced_render_tasks();
        }
        if (frm._debounced_render_projects) {
            frm._debounced_render_projects();
        }
    }
});

frappe.ui.form.on('Master Project', {
    projects_remove: function(frm, cdt, cdn) {
        if (frm._debounced_render_tasks) {
            frm._debounced_render_tasks();
        }
        if (frm._debounced_render_projects) {
            frm._debounced_render_projects();
        }
    }
});

let currentProjectFetchId = 0;

async function render_project_list(frm, wrapper) {
    console.log("render_project_list started.");
    const fetchId = ++currentProjectFetchId;

    let linkedProjects = [];
    if (frm.doc.projects && frm.doc.projects.length > 0) {
        linkedProjects = frm.doc.projects.map(row => row.project).filter(p => p);
    }
    console.log("linkedProjects for render_project_list:", linkedProjects);

    $(wrapper).html(`
        <div class="projects-list-manager glass-panel p-3">
            <h4 class="mb-3">Connected Projects</h4>
            <div class="text-center text-muted p-4">
                <i class="fa fa-spinner fa-spin fa-2x mb-2"></i>
                <p>Loading projects...</p>
            </div>
        </div>
    `);

    if (linkedProjects.length === 0) {
        console.log("No linked projects found. Rendering empty state for project list.");
        $(wrapper).html(`
            <div class="projects-list-manager glass-panel p-3">
                <h4 class="mb-3">Connected Projects</h4>
                <div class="text-center text-muted p-4">No linked projects found.</div>
            </div>
        `);
        return;
    }

    try {
        console.log("Fetching project list for linked projects:", linkedProjects);
        const results = await new Promise((resolve, reject) => {
            frappe.call({
                method: "frappe.client.get_list",
                args: {
                    doctype: "Project",
                    filters: { name: ["in", linkedProjects] },
                    fields: ["name", "project_name", "status", "priority", "percent_complete", "expected_end_date"],
                    limit_page_length: 0
                },
                callback: function(r) {
                    if (r.exc) {
                        console.error("frappe.call to get_list for Project failed:", r.exc);
                        reject(r.exc);
                    } else {
                        console.log("frappe.call to get_list for Project succeeded:", r.message);
                        resolve(r.message || []);
                    }
                }
            });
        });

        if (fetchId !== currentProjectFetchId) {
            console.log("Stale project fetch aborted.");
            return;
        }
        console.log("Rendering project list HTML with results:", results);

        let htmlContent = `
            <div class="projects-list-manager glass-panel p-3">
                <h4 class="mb-3 border-bottom pb-2 text-primary">Connected Projects</h4>
        `;

        if (results.length === 0) {
            htmlContent += `<div class="text-muted small mb-3">No projects found.</div>`;
        } else {
            htmlContent += `
                <div class="table-responsive">
                    <table class="table table-sm table-bordered table-hover mb-0">
                        <thead class="bg-light text-muted">
                            <tr>
                                <th style="width: 30%">Project</th>
                                <th style="width: 15%">Status</th>
                                <th style="width: 15%">Priority</th>
                                <th style="width: 20%">% Complete</th>
                                <th style="width: 20%">End Date</th>
                            </tr>
                        </thead>
                        <tbody>
            `;

            results.forEach(p => {
                let statusColor = "badge-secondary";
                if (p.status === "Completed") statusColor = "badge-success";
                else if (p.status === "Open") statusColor = "badge-primary";
                else if (p.status === "Overdue" || p.status === "Cancelled") statusColor = "badge-danger";

                let priorityColor = "text-muted";
                if (p.priority === "High" || p.priority === "Urgent") priorityColor = "text-danger font-weight-bold";
                else if (p.priority === "Medium") priorityColor = "text-warning";

                let endDate = p.expected_end_date ? frappe.datetime.str_to_user(p.expected_end_date) : '-';
                let safeName = p.project_name ? frappe.utils.escape_html(p.project_name) : p.name;
                let percentComplete = p.percent_complete ? p.percent_complete.toFixed(1) : "0.0";

                htmlContent += `
                    <tr>
                        <td>
                            <a href="/app/project/${encodeURIComponent(p.name)}" target="_blank" class="text-dark font-weight-500">
                                ${safeName}
                            </a>
                        </td>
                        <td><span class="badge ${statusColor}">${p.status || ''}</span></td>
                        <td><span class="${priorityColor}">${p.priority || ''}</span></td>
                        <td>${percentComplete}%</td>
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

        htmlContent += `</div>`;
        $(wrapper).html(htmlContent);

    } catch (err) {
        if (fetchId !== currentProjectFetchId) return;

        console.error("Critical error fetching projects:", err);
        $(wrapper).html(`
            <div class="alert alert-danger p-3">
                <i class="fa fa-exclamation-circle fa-2x pull-left text-danger"></i>
                <h5 class="text-danger">Failed to load projects</h5>
                <p class="mb-0">An unexpected error occurred while fetching project data.</p>
            </div>
        `);
    }
}

let currentTaskFetchId = 0;

async function render_tasks_list(frm, wrapper) {
    console.log("render_tasks_list started.");
    const fetchId = ++currentTaskFetchId; // Closure for cancellation
    const masterProjectName = frm.doc.name;
    console.log("masterProjectName:", masterProjectName);

    // Extract linked projects from child table
    let linkedProjects = [];
    if (frm.doc.projects && frm.doc.projects.length > 0) {
        linkedProjects = frm.doc.projects.map(row => row.project).filter(p => p);
    }
    console.log("linkedProjects for render_tasks_list:", linkedProjects);

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

    // Promise generator for fetching tasks for all linked projects
    const fetchLinkedProjectsTasks = (projectNames) => {
        if (!projectNames || projectNames.length === 0) {
            return Promise.resolve([]);
        }
        return new Promise((resolve, reject) => {
            console.log(`Fetching tasks for linked projects:`, projectNames);
            frappe.call({
                method: "frappe.client.get_list",
                args: {
                    doctype: "Task",
                    filters: { project: ["in", projectNames] },
                    fields: ["name", "subject", "status", "priority", "exp_start_date", "exp_end_date", "project"],
                    limit_page_length: 0
                },
                callback: function(r) {
                    if (r.exc) {
                        console.error(`Task fetch failed for linked projects:`, r.exc);
                        reject(r.exc);
                    } else {
                        console.log(`Task fetch succeeded for linked projects:`, r.message);
                        resolve(r.message || []);
                    }
                }
            });
        });
    };

    // Promise generator for fetching tasks assigned directly to the master project
    // Assuming custom field "custom_master_project" exists on Task or relying on standard relations.
    // If it doesn't exist, this might just return empty, but we must implement the feature.
    const fetchMasterProjectTasks = () => {
        return new Promise((resolve, reject) => {
            console.log(`Fetching tasks for master project: ${masterProjectName}`);
            frappe.call({
                method: "frappe.client.get_list",
                args: {
                    doctype: "Task",
                    filters: { custom_master_project: masterProjectName, project: ["in", ["", null]] },
                    fields: ["name", "subject", "status", "priority", "exp_start_date", "exp_end_date"],
                    limit_page_length: 0
                },
                callback: function(r) {
                    if (r.exc) {
                        console.error(`Task fetch failed for master project ${masterProjectName}:`, r.exc);
                        resolve({ projectName: masterProjectName, isMaster: true, tasks: [], error: true }); // fail gracefully
                    } else {
                        console.log(`Task fetch succeeded for master project ${masterProjectName}:`, r.message);
                        resolve({ projectName: masterProjectName, isMaster: true, tasks: r.message || [] });
                    }
                }
            });
        });
    };

    try {
        console.log("Initiating consolidated task fetches.");
        let fetchPromises = [
            fetchWithTimeout(fetchMasterProjectTasks()),
            fetchWithTimeout(fetchLinkedProjectsTasks(linkedProjects))
        ];

        const rawResults = await Promise.allSettled(fetchPromises);
        console.log("Task fetches completed. rawResults:", rawResults);

        // If another fetch was triggered while waiting, abort this render.
        if (fetchId !== currentTaskFetchId) {
            console.log("Stale task fetch aborted.");
            return;
        }

        // Process results to match the original grouped structure
        let anyFailures = false;
        let processedResults = [];

        // 1. Master Project Tasks
        if (rawResults[0].status === "fulfilled") {
            processedResults.push({
                status: "fulfilled",
                value: rawResults[0].value
            });
        } else {
            anyFailures = true;
            console.error("Task fetch failed for master project:", rawResults[0].reason);
        }

        // 2. Linked Projects Tasks
        if (rawResults[1].status === "fulfilled") {
            const allTasks = rawResults[1].value;
            // Group tasks by project
            const tasksByProject = {};
            linkedProjects.forEach(p => { tasksByProject[p] = []; });

            allTasks.forEach(t => {
                if (tasksByProject[t.project]) {
                    tasksByProject[t.project].push(t);
                } else {
                    tasksByProject[t.project] = [t];
                }
            });

            linkedProjects.forEach(p => {
                processedResults.push({
                    status: "fulfilled",
                    value: { projectName: p, tasks: tasksByProject[p] }
                });
            });
        } else {
            anyFailures = true;
            console.error("Task fetch failed for linked projects:", rawResults[1].reason);
        }

        // State Aggregation
        let htmlContent = `<div class="tasks-list-manager glass-panel p-3">`;

        processedResults.forEach(result => {
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

        if (linkedProjects.length === 0 && (!processedResults[0] || processedResults[0].value.tasks.length === 0)) {
             htmlContent += `<div class="text-center text-muted p-4">No linked projects or tasks found.</div>`;
        }

        htmlContent += `</div>`; // Close tasks-list-manager

        // Single atomic write to the DOM
        console.log("Rendering tasks list HTML.");
        $(wrapper).html(htmlContent);

    } catch (err) {
        if (fetchId !== currentTaskFetchId) {
            console.log("Stale task fetch caught error, aborting:", err);
            return; // Stale request
        }

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
