
frappe.ui.form.on('Project', {
    refresh: function(frm) {
        // Fetch the HTML wrapper for the Gantt chart
        const gantt_wrapper = frm.get_field('custom_gantt_chart_html').$wrapper;
        gantt_wrapper.empty(); // Clear any previous content

        // Fetch task data from the backend
        frappe.call({
            method: "project_enhancements.project_enhancements.page.project_dashboard.project_dashboard.get_gantt_tasks_for_project",
            args: {
                project_name: frm.doc.name
            },
            callback: function(r) {
                if (r.message && r.message.length > 0) {
                    const tasks = r.message;

                    // Configure Gantt chart options
                    const options = {
                        header_height: 50,
                        column_width: 30,
                        step: 24,
                        view_modes: ['Quarter Day', 'Half Day', 'Day', 'Week', 'Month'],
                        bar_height: 20,
                        bar_corner_radius: 3,
                        arrow_curve: 5,
                        padding: 18,
                        view_mode: 'Day',
                        date_format: 'YYYY-MM-DD',
                        language: 'en', // or 'es', 'it', 'ru', 'ptBr', 'fr', 'tr', 'zh', 'de', 'hu'
                        custom_popup_html: null,
                        on_click: function (task) {
                            frappe.set_route('Form', 'Task', task.id);
                        },
                        on_date_change: function(task, start, end) {
                            frappe.call({
                                method: 'project_enhancements.project_enhancements.page.project_dashboard.project_dashboard.update_task_dates_from_gantt',
                                args: {
                                    task_name: task.id,
                                    start_date: start,
                                    end_date: end
                                }
                            });
                        },
                        on_progress_change: function(task, progress) {
                            frappe.call({
                                method: 'project_enhancements.project_enhancements.page.project_dashboard.project_dashboard.update_task_progress_from_gantt',
                                args: {
                                    task_name: task.id,
                                    progress: progress
                                }
                            });
                        }
                    };

                    // Instantiate the Gantt chart
                    new Gantt(gantt_wrapper[0], tasks, options);

                } else {
                    // Display a message if there are no tasks
                    gantt_wrapper.html('<p>No tasks found for this project.</p>');
                }
            }
        });
    }
});
