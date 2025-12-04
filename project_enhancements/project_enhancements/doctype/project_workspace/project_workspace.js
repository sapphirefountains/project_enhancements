frappe.ui.form.on('Project Workspace', {
    refresh: function(frm) {
        // Add a console log to confirm the script starts
        console.log("Project Workspace: Refresh event triggered.");

        // Clear the page immediately and set a clear loading message
        frm.dashboard.wrapper.empty();
        frm.set_intro("Loading Workspace...");

        // Load Gantt Chart library assets
        const gantt_css_url = "https://cdn.jsdelivr.net/npm/frappe-gantt/dist/frappe-gantt.css";
        const gantt_js_url = "https://cdn.jsdelivr.net/npm/frappe-gantt/dist/frappe-gantt.umd.js";

        // Inject CSS if it's not already there
        if (!$(`link[href="${gantt_css_url}"]`).length) {
            $('<link>', { rel: 'stylesheet', type: 'text/css', href: gantt_css_url }).appendTo('head');
            console.log("Project Workspace: Gantt CSS injected.");
        }

        // Use frappe.require to ensure the JS library is loaded before proceeding
        frappe.require(gantt_js_url, () => {
            console.log("Project Workspace: Gantt JS library loaded successfully.");
            // The entire rendering logic is now safely inside the callback
            render_project_workspace(frm);
        });
    }
});

function render_project_workspace(frm) {
    console.log("Project Workspace: Starting render_project_workspace function.");

    // Get the project name from the URL route. This is a common point of failure.
    const route = frappe.get_route();
    console.log("Project Workspace: Current route is:", route);

    if (!route || route.length < 3) {
        console.error("Project Workspace: Could not extract project name from route.");
        frm.set_intro("Error: Invalid URL. Cannot determine the Project ID.", "text-danger");
        return;
    }
    const project_name = route[2];
    console.log("Project Workspace: Extracted Project Name:", project_name);

    if (!project_name) {
        frm.set_intro("No Project specified. Please access this page from the Project Dashboard or a Project form.", "text-danger");
        return;
    }

    // Fetch the project document from the database
    console.log(`Project Workspace: Fetching document for Project "${project_name}"...`);
    frappe.db.get_doc('Project', project_name).then(project_doc => {
        console.log("Project Workspace: Successfully fetched project document:", project_doc);

        // Update page title and intro message
        frappe.utils.set_title(project_doc.project_name);
        frm.set_intro(`Viewing details for <strong>${project_doc.project_name}</strong>`);
        frm.dashboard.wrapper.empty(); // Clear "Loading..." message

        // Create the two-column layout
        const layout = $(`
            <div class="row">
                <div class="col-md-8">
                    <div class="project-form-container"></div>
                </div>
                <div class="col-md-4">
                    <div class="card mb-3">
                        <div class="card-header"><h6 class="card-title mb-0">Project Gantt Chart</h6></div>
                        <div class="card-body project-gantt-container"></div>
                    </div>
                    <div class="card">
                        <div class="card-header"><h6 class="card-title mb-0">Task Tree</h6></div>
                        <div class="card-body project-task-tree-container" style="max-height: 500px; overflow-y: auto;"></div>
                    </div>
                </div>
            </div>
        `).appendTo(frm.dashboard.wrapper);
        console.log("Project Workspace: Two-column layout rendered.");

        // --- Render the Dynamic, Editable Form ---
        const form_container = layout.find('.project-form-container');
        console.log("Project Workspace: Rendering dynamic form...");
        const form = new frappe.ui.form.Form('Project', form_container, false);
        form.setup();
        form.refresh(project_name);
        form_container.find('.form-tabs').css('border-radius', '6px');
        console.log("Project Workspace: Dynamic form should now be visible.");


        // --- Render the Project-Specific Gantt Chart ---
        const gantt_container = layout.find('.project-gantt-container');
        gantt_container.html('<p class="text-muted">Loading chart...</p>');
        console.log("Project Workspace: Fetching data for Gantt chart...");
        frappe.call({
            method: "project_enhancements.project_enhancements.page.project_dashboard.project_dashboard.get_gantt_tasks_for_project",
            args: { project_name: project_name },
            callback: function(r) {
                console.log("Project Workspace: Received Gantt data:", r.message);
                if (r.message && !r.message.error && r.message.length > 0) {
                    gantt_container.empty();
                    new Gantt(gantt_container[0], r.message, {
                        view_mode: 'Day',
                        scroll_to: 'today',
                        on_click: (task) => frappe.set_route('Form', 'Task', task.id),
                    });
                    console.log("Project Workspace: Gantt chart rendered.");
                } else {
                    gantt_container.html('<p class="text-muted">No tasks found for this project.</p>');
                }
            }
        });

        // --- Render the Task Tree ---
        const task_tree_container = layout.find('.project-task-tree-container');
        task_tree_container.html('<p class="text-muted">Loading tasks...</p>');
        console.log("Project Workspace: Fetching data for Task Tree...");
        frappe.call({
            method: "project_enhancements.project_enhancements.page.project_dashboard.project_dashboard.get_project_tasks",
            args: { project: project_name },
            callback: function(r) {
                console.log("Project Workspace: Received Task Tree data:", r.message);
                if (r.message && !r.message.error && r.message.length > 0) {
                    task_tree_container.empty();
                    const task_tree_list = $('<ul class="list-group list-group-flush"></ul>').appendTo(task_tree_container);
                    function render_task_node(task, parent_element, level) {
                        const padding = level * 20;
                        $(`<li class="list-group-item" style="padding-left: ${padding + 15}px;">
                                <a href="/app/task/${task.name}">${task.subject}</a>
                                <span class="badge badge-secondary float-right">${task.status}</span>
                            </li>`).appendTo(parent_element);
                        if (task.children && task.children.length > 0) {
                            task.children.forEach(child => render_task_node(child, parent_element, level + 1));
                        }
                    }
                    r.message.forEach(task => render_task_node(task, task_tree_list, 0));
                    console.log("Project Workspace: Task Tree rendered.");
                } else {
                    task_tree_container.html('<p class="text-muted">No tasks found for this project.</p>');
                }
            }
        });

    }).catch(err => {
        // This is a critical error handler
        console.error("Project Workspace: CRITICAL - Failed to fetch project document.", err);
        frm.set_intro(`Error: Could not load Project "${project_name}". Check console for details.`, "text-danger");
    });
}
