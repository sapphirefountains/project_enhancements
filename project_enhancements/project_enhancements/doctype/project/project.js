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
            'overflow': 'hidden'
        });

        // Add scroll buttons
        const button_html = `
            <div class="gantt-controls" style="margin-bottom: 10px;">
                <button class="btn btn-default btn-sm" data-action="scroll-left">
                    <i class="fa fa-chevron-left"></i>
                </button>
                <button class="btn btn-default btn-sm" data-action="scroll-right">
                    <i class="fa fa-chevron-right"></i>
                </button>
            </div>
        `;
        gantt_wrapper.empty().html(button_html + '<div class="gantt-chart-container" style="height: 100%;"></div>');


        load_cdn_assets().then(() => {
            const chart_container = gantt_wrapper.find('.gantt-chart-container');
            chart_container.html('<p class="text-muted">Loading chart data...</p>');

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
                        gantt_wrapper.find('.gantt-chart-container').empty();
                        const gantt = new Gantt(gantt_wrapper.find('.gantt-chart-container')[0], tasks, options);

                        const gantt_container = gantt_wrapper.find(".gantt-container");
                        gantt_container.css('overflow-x', 'scroll');

                        // Add event listeners for scroll buttons
                        gantt_wrapper.find('[data-action="scroll-left"]').on('click', () => {
                            gantt_container.scrollLeft(gantt_container.scrollLeft() - gantt.options.column_width);
                        });

                        gantt_wrapper.find('[data-action="scroll-right"]').on('click', () => {
                            gantt_container.scrollLeft(gantt_container.scrollLeft() + gantt.options.column_width);
                        });

                        // Function to scroll to today
                        function scroll_to_today() {
                            if (gantt_container.length > 0 && gantt.gantt_start) {
                                const today = new Date();
                                const diff_days = moment(today).diff(moment(gantt.gantt_start).startOf('day'), 'days');

                                if (diff_days >= 0) {
                                    const column_width = gantt.options.column_width;
                                    const container_width = gantt_container.width();
                                    const scroll_left = (diff_days * column_width) + (column_width / 2) - (container_width / 2);

                                    if(scroll_left > 0) {
                                        gantt_container.scrollLeft(scroll_left);
                                    }
                                }
                            }
                        }

                        // The chart may take a moment to render.
                        // We will try to scroll a few times to make sure it happens.
                        let scroll_attempts = 0;
                        const scroll_interval = setInterval(() => {
                            scroll_to_today();
                            scroll_attempts++;
                            if (scroll_attempts > 5) {
                                clearInterval(scroll_interval);
                            }
                        }, 200);

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
