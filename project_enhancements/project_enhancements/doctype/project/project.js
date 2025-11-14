frappe.ui.form.on('Project', {
    refresh: function(frm) {
        // First, load the necessary Gantt chart assets (JS and CSS)
        // These are the correct paths for ERPNext v15+
        frappe.require([
            "/assets/erpnext/css/erpnext-gantt.css",
            "/assets/erpnext/js/erpnext-gantt.min.js"
        ]).then(() => {
            // This part of the code will only run AFTER the assets are successfully loaded.

            // Fetch the HTML wrapper for the Gantt chart
            const gantt_wrapper = frm.get_field('custom_gantt_chart_html').$wrapper;
            gantt_wrapper.empty().html('<p class="text-muted">Loading chart data...</p>'); // Clear previous content and show loading message

            // Fetch task data from the backend
            frappe.call({
                method: "project_enhancements.project_enhancements.page.project_dashboard.project_dashboard.get_gantt_tasks_for_project",
                args: {
                    project_name: frm.doc.name
                },
                callback: function(r) {
                    if (r.message && !r.message.error && r.message.length > 0) {
                        const tasks = r.message;

                        // Configure Gantt chart options
                        const options = {
                            header_height: 50,
                            column_width: 30,
                            step: 24,
                            view_modes: ['Day', 'Week', 'Month'],
                            bar_height: 20,
                            bar_corner_radius: 3,
                            arrow_curve: 5,
                            padding: 18,
                            view_mode: 'Day',
                            date_format: 'YYYY-MM-DD',
                            language: 'en',
                            custom_popup_html: null,
                            on_click: function (task) {
                                frappe.set_route('Form', 'Task', task.id);
                            },
                            on_date_change: function(task, start, end) {
                                frappe.call({
                                    method: 'project_enhancements.project_enhancements.page.project_dashboard.project_dashboard.update_task_dates_from_gantt',
                                    args: {
                                        task_name: task.id,
                                        start_date: moment(start).format('YYYY-MM-DD'),
                                        end_date: moment(end).format('YYYY-MM-DD')
                                    }
                                });
                            },
                            on_progress_change: function(task, progress) {
                                frappe.call({
                                    method: 'project_enhancements.project_enhancements.page.project_dashboard.project_dashboard.update_task_progress_from_gantt',
                                    args: {
                                        task_name: task.id,
                                        progress: parseInt(progress)
                                    }
                                });
                            }
                        };

                        // Now it is safe to instantiate the Gantt chart
                        new Gantt(gantt_wrapper[0], tasks, options);

                    } else {
                        // Display a message if there are no tasks or if there was an error
                        gantt_wrapper.html('<p class="text-muted">No tasks found for this project.</p>');
                    }
                }
            });
        }).catch(() => {
            // This will run if the frappe.require fails (e.g., assets not found)
            const gantt_wrapper = frm.get_field('custom_gantt_chart_html').$wrapper;
            gantt_wrapper.empty().html('<p class="text-danger">Error: Gantt chart library failed to load. Please contact support.</p>');
        });
    }
});
