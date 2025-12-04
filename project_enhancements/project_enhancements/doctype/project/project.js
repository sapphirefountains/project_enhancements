frappe.ui.form.on('Project', {
    refresh: function (frm) {
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
                    .done(function (script, textStatus) {
                        resolve();
                    })
                    .fail(function (jqxhr, settings, exception) {
                        reject(exception);
                    });
            });
        }

        const gantt_wrapper = frm.get_field('custom_gantt_chart_html').$wrapper;
        gantt_wrapper.css({
            'height': '500px',
            'overflow': 'hidden'
        });

        gantt_wrapper.empty().html('<div class="gantt-chart-container" style="height: 100%;"></div>');


        load_cdn_assets().then(() => {
            const chart_container = gantt_wrapper.find('.gantt-chart-container');
            chart_container.html('<p class="text-muted">Loading chart data...</p>');

            frappe.call({
                method: "project_enhancements.project_enhancements.page.project_dashboard.project_dashboard.get_gantt_tasks_for_project",
                args: { project_name: frm.doc.name },
                callback: function (r) {
                    if (r.message && !r.message.error && r.message.length > 0) {
                        const tasks = r.message;

                        const options = {
                            view_mode: 'Day',
                            scroll_to: 'today',
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
                        gantt_wrapper.find('.gantt-chart-container').empty();
                        const gantt = new Gantt(gantt_wrapper.find('.gantt-chart-container')[0], tasks, options);

                        const gantt_container = gantt_wrapper.find(".gantt-container");
                        gantt_container.css({
                            'overflow-x': 'scroll',
                            'overflow-y': 'auto',
                            'max-height': '100%'
                        });

                        // Adjust scroll to align "Today" to the left
                        setTimeout(() => {
                            const today_highlight = gantt_wrapper.find('.today-highlight');
                            if (today_highlight.length > 0) {
                                // If the element exists, scroll to it directly
                                // position().left is relative to the scrollable container content
                                const scroll_pos = today_highlight.position().left;
                                gantt_container.scrollLeft(scroll_pos - 20); // 20px padding
                            } else {
                                // Fallback: assumes scroll_to: 'today' centered the view
                                const gantt_width = gantt_container.width();
                                const current_scroll = gantt_container.scrollLeft();
                                gantt_container.scrollLeft(current_scroll + (gantt_width / 2) - 50);
                            }
                        }, 500);

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
