frappe.ui.form.on('Project', {
    refresh: function(frm) {
        // This function will load CSS and JS from the specified CDN URLs
        function load_cdn_assets() {
            return new Promise((resolve, reject) => {
                const css_url = "https://cdn.jsdelivr.net/npm/frappe-gantt/dist/frappe-gantt.css";
                const js_url = "https://cdn.jsdelivr.net/npm/frappe-gantt/dist/frappe-gantt.umd.js";

                // Load CSS
                if (!$(`link[href="${css_url}"]`).length) {
                    $('<link>', {
                        rel: 'stylesheet',
                        type: 'text/css',
                        href: css_url
                    }).appendTo('head');
                }

                // Load JS using jQuery's getScript, which handles execution
                $.getScript(js_url)
                    .done(function(script, textStatus) {
                        resolve();
                    })
                    .fail(function(jqxhr, settings, exception) {
                        reject(exception);
                    });
            });
        }

        const gantt_wrapper = frm.get_field('custom_gantt_chart_html').$wrapper;
        gantt_wrapper.css({
            'height': '500px',
			'overflow-y': 'auto',
        });
        gantt_wrapper.empty().html('<p class="text-muted">Loading Gantt library...</p>');

        load_cdn_assets().then(() => {
            // This part of the code will only run AFTER the assets are successfully loaded from the CDN.
            gantt_wrapper.empty().html('<p class="text-muted">Loading chart data...</p>');

            frappe.call({
                method: "project_enhancements.project_enhancements.page.project_dashboard.project_dashboard.get_gantt_tasks_for_project",
                args: { project_name: frm.doc.name },
                callback: function(r) {
                    if (r.message && !r.message.error && r.message.length > 0) {
                        const tasks = r.message;

                        const options = {
                            view_mode: 'Day',
                            on_click: (task) => frappe.set_route('Form', 'Task', task.id),
                            on_date_change: (task, start, end) => {
                                frappe.call({
                                    method: 'project_enhancements.project_enhancements.page.project_dashboard.project_dashboard.update_task_dates_from_gantt',
                                    args: {
                                        task_name: task.id,
                                        start_date: moment(start).format('YYYY-MM-DD'),
                                        end_date: moment(end).format('YYYY-MM-DD')
                                    }
                                });
                            },
                            on_progress_change: (task, progress) => {
                                frappe.call({
                                    method: 'project_enhancements.project_enhancements.page.project_dashboard.project_dashboard.update_task_progress_from_gantt',
                                    args: {
                                        task_name: task.id,
                                        progress: parseInt(progress)
                                    }
                                });
                            }
                        };

                        // It is now safe to instantiate the Gantt chart
                        new Gantt(gantt_wrapper[0], tasks, options);

                    } else {
                        gantt_wrapper.html('<p class="text-muted">No tasks found for this project.</p>');
                    }
                }
            });
        }).catch((error) => {
            console.error("Failed to load Gantt chart from CDN:", error);
            gantt_wrapper.empty().html('<p class="text-danger">Error: Could not load Gantt chart library from CDN. Check browser console for details.</p>');
        });
    }
});
