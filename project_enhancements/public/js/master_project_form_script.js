// The frappe.ui.form.on event is triggered when a form is loaded in Frappe.
// We are targeting the 'Master Project' DocType specifically.
frappe.ui.form.on('Master Project', {
    // The 'refresh' trigger ensures our script runs every time the form is loaded or refreshed.
    refresh: function(frm) {
        // Initialize Project Tree in task_tree_view field
        if (frm.fields_dict['task_tree_view'] && !frm.project_tree_instance) {
            // Check if the global namespace and class exist
            if (window.project_enhancements && project_enhancements.ProjectTreeManager) {
                frm.project_tree_instance = new project_enhancements.ProjectTreeManager({
                    wrapper: frm.fields_dict['task_tree_view'].wrapper,
                    masterProjectName: frm.doc.name
                });
            } else {
                console.warn("Project Enhancements: ProjectTreeManager class not found. Ensure project_tree_manager.js is loaded.");
            }
        }
    }
});
