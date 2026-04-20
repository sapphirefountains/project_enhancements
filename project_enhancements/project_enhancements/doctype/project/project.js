frappe.ui.form.on("Project", {
	refresh: function (frm) {
		console.log("Project form refreshed - initializing Gantt check");
		
		const wrapperField = frm.get_field("custom_gantt_chart_html");

		// Global Health Indicator
		if (wrapperField && !frm.is_new()) {
			if (!wrapperField.__health_bound) {
				wrapperField.render_health_indicator = function(frm) {
					frappe.call({
						method: "project_enhancements.project_enhancements.page.project_dashboard.project_dashboard.get_project_health_metrics",
						args: { project_name: frm.doc.name },
						callback: (r) => {
							if (r.message && r.message.total_tasks > 0) {
								const data = r.message;
								const schedule_color = data.schedule_health > 80 ? 'text-success' : (data.schedule_health > 50 ? 'text-warning' : 'text-danger');
								const html = `<div class="project-health-dashboard d-flex align-items-center p-3 mb-3 bg-white border rounded shadow-sm"><div class="health-metric mr-4 text-center" style="min-width: 100px;"><div class="h3 mb-0 ${schedule_color}">${data.schedule_health}%</div><div class="small text-muted text-uppercase font-weight-bold">Schedule Health</div></div><div class="health-metric mr-4 border-left pl-4"><div class="d-flex align-items-baseline"><span class="h4 mb-0 mr-2">${data.overdue_count}</span><span class="small text-muted">Overdue Tasks</span></div>${data.high_priority_overdue > 0 ? `<div class="small text-danger"><i class="fa fa-exclamation-triangle"></i> ${data.high_priority_overdue} High Priority Overdue</div>` : ''}</div><div class="health-metric mr-4 border-left pl-4 flex-grow-1"><div class="small d-flex justify-content-between mb-1"><span class="text-muted text-uppercase font-weight-bold">Overall Progress</span><span class="font-weight-bold">${data.overall_progress}%</span></div><div class="progress" style="height: 10px;"><div class="progress-bar bg-success" role="progressbar" style="width: ${data.overall_progress}%"></div></div></div><div class="health-metric border-left pl-4 text-center"><div class="h4 mb-0 text-primary">${data.completed_count}/${data.total_tasks}</div><div class="small text-muted">Tasks Done</div></div></div>`;
								const $container = frm.$wrapper.find('.form-body');
								$container.find('.project-health-dashboard').remove();
								$container.prepend(html);
							}
						}
					});
				};
				wrapperField.__health_bound = true;
				frappe.realtime.on("project_dashboard_updated", (data) => {
					if (data.project === frm.doc.name) {
						wrapperField.render_health_indicator(frm);
						if (wrapperField.__custom_gantt_bound) wrapperField.refresh();
					}
				});
			}
			wrapperField.render_health_indicator(frm);
		}

		if (!$("#custom-gantt-styles").length) {
			$("<style id='custom-gantt-styles'>").html(`.gantt .bar-overdue .bar { fill: #e74c3c !important; } .gantt .bar-overdue .bar-progress { fill: #c0392b !important; } .gantt .bar-milestone .bar { fill: #f1c40f !important; clip-path: polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%); } .gantt .bar-milestone .bar-progress { display: none !important; } .gantt .baseline-bar { fill: #d1d8dd; opacity: 0.4; pointer-events: none; } .gantt .bar-wrapper.highlight .bar { stroke: #2980b9; stroke-width: 3 !important; } .heatmap-table { width: 100%; border-collapse: collapse; font-size: 11px; } .heatmap-table th, .heatmap-table td { border: 1px solid #eee; padding: 4px; text-align: center; } .heatmap-table .user-cell { text-align: left; background: #f9f9f9; font-weight: 500; min-width: 120px; } .workload-low { background-color: #d4edda !important; color: #155724; } .workload-med { background-color: #fff3cd !important; color: #856404; } .workload-high { background-color: #f8d7da !important; color: #721c24; } .heatmap-table td:not(.user-cell) { cursor: pointer; } .heatmap-table td:not(.user-cell):hover { filter: brightness(0.9); } .custom-gantt-popup { background: #fff; border-radius: 4px; padding: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.15); font-size: 13px; color: #333; min-width: 200px; border: 1px solid #e0e0e0; } .custom-gantt-popup h5 { margin: 0 0 8px; font-weight: 600; font-size: 14px; } .custom-gantt-popup p { margin: 0 0 4px; } .custom-gantt-popup .popup-label { font-weight: bold; color: #555; }`).appendTo("head");
		}

		if (wrapperField) {
			if (!wrapperField.__custom_gantt_bound) {
				const original_refresh = wrapperField.refresh;
				wrapperField.refresh = function () {
					if (original_refresh) original_refresh.call(this);
					if (this.$wrapper) {
						const gantt_wrapper = this.$wrapper;
						if (gantt_wrapper.find(".gantt-chart-container").length === 0) {
							gantt_wrapper.css({ height: "550px", display: "flex", "flex-direction": "column", border: "1px solid #d1d8dd", "border-radius": "4px", "background-color": "#f8f9fa", "margin-bottom": "20px" });
							gantt_wrapper.empty().html(`<div class="gantt-toolbar d-flex justify-content-between p-2 bg-light border-bottom"><div class="export-actions"><button type="button" class="btn btn-default btn-sm btn-export-gantt"><i class="fa fa-camera mr-1"></i> Export PNG</button></div><div class="btn-group btn-group-sm view-mode-group"><button type="button" class="btn btn-default" data-view="Quarter Day">Quarter Day</button><button type="button" class="btn btn-default" data-view="Half Day">Half Day</button><button type="button" class="btn btn-primary active" data-view="Day">Day</button><button type="button" class="btn btn-default" data-view="Week">Week</button><button type="button" class="btn btn-default" data-view="Month">Month</button></div></div><div class="gantt-chart-container" style="flex-grow: 1; overflow: hidden; display: flex; align-items: center; justify-content: center;"><p class="text-muted">Initializing Gantt Chart...</p></div><div class="resource-heatmap-container border-top" style="height: 150px; display: none;"><div class="heatmap-header p-2 bg-light d-flex justify-content-between"><span class="small font-weight-bold text-muted">RESOURCE ALLOCATION (HRS/DAY)</span><div class="heatmap-legend d-flex small align-items-center"><span class="mr-2"><i class="fa fa-square text-success"></i> < 6</span><span class="mr-2"><i class="fa fa-square text-warning"></i> 6-9</span><span><i class="fa fa-square text-danger"></i> > 9</span></div></div><div class="heatmap-body" style="overflow: auto; height: 110px;"></div></div>`);
						}
						const chart_container = gantt_wrapper.find(".gantt-chart-container");
						const heatmap_container = gantt_wrapper.find(".resource-heatmap-container");
						chart_container.html('<p class="text-muted">Fetching task data...</p>');
						frappe.call({
							method: "project_enhancements.project_enhancements.page.project_dashboard.project_dashboard.get_gantt_tasks_for_project",
							args: { project_name: frm.doc.name },
							callback: (r) => {
								if (r.message && !r.message.error) {
									const tasks = r.message.map(t => { if (t.is_milestone) t.custom_class = (t.custom_class || "") + " bar-milestone"; return t; });
									if (tasks.length === 0) { chart_container.html('<p class="text-muted text-center p-4">No tasks found for this project.</p>'); return; }
									wrapperField.render_heatmap(frm, heatmap_container);
									let clickTimer = null;
									const options = {
										view_mode: "Day", scroll_to: "today",
										custom_popup_html: (task) => { let b_info = task.baseline_start ? `<p><span class="popup-label">Baseline:</span> ${moment(task.baseline_start).format('MMM D')} - ${moment(task.baseline_end).format('MMM D')}</p>` : ""; return `<div class="custom-gantt-popup"><h5>${task.name} ${task.is_milestone ? '<span class="badge badge-warning">Milestone</span>' : ''}</h5><p><span class="popup-label">Assignee:</span> ${task.assigned_to || 'Unassigned'}</p><p><span class="popup-label">Status:</span> ${task.status || 'N/A'}</p><p><span class="popup-label">Start:</span> ${moment(task.start).format('MMM D, YYYY')}</p><p><span class="popup-label">End:</span> ${moment(task.end).format('MMM D, YYYY')}</p>${b_info}<p><span class="popup-label">Progress:</span> ${task.progress}%</p><p style="font-size: 11px; margin-top: 8px; color: #777;"><em>Double-click bar to open task</em></p></div>`; },
										on_click: (task) => { if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; frappe.set_route("Form", "Task", task.id); } else { clickTimer = setTimeout(() => { clickTimer = null; }, 250); } },
										on_date_change: (task, start, end) => { frappe.call({ method: "project_enhancements.project_enhancements.page.project_dashboard.project_dashboard.update_task_dates_from_gantt", args: { task_name: task.id, start_date: moment(start).format("YYYY-MM-DD"), end_date: moment(end).format("YYYY-MM-DD") }, callback: (res) => { if (res.message && res.message.status === "success") { wrapperField.refresh(); wrapperField.render_health_indicator(frm); } } }); },
										on_progress_change: (task, progress) => { frappe.call({ method: "project_enhancements.project_enhancements.page.project_dashboard.project_dashboard.update_task_progress_from_gantt", args: { task_name: task.id, progress: parseInt(progress) }, callback: () => wrapperField.render_health_indicator(frm) }); },
									};
									chart_container.empty();
									if (typeof Gantt === "undefined") { chart_container.html('<p class="text-danger">Gantt library not loaded. Please refresh the page.</p>'); return; }
									try {
										const gantt = new Gantt(chart_container[0], tasks, options);
										gantt_wrapper.find('.view-mode-group button').off('click').on('click', function() { gantt_wrapper.find('.view-mode-group button').removeClass('active btn-primary').addClass('btn-default'); $(this).addClass('active btn-primary').removeClass('btn-default'); gantt.change_view_mode($(this).data('view')); });
										gantt_wrapper.find('.btn-export-gantt').off('click').on('click', () => { frappe.require('https://cdnjs.cloudflare.com/ajax/libs/dom-to-image/2.6.0/dom-to-image.min.js', () => { domtoimage.toPng(chart_container[0], { bgcolor: '#fff' }).then(url => { const link = document.createElement('a'); link.download = `Gantt-${frm.doc.name}-${moment().format('YYYYMMDD')}.png`; link.href = url; link.click(); }); }); });
										const g_cont = gantt_wrapper.find(".gantt-container");
										g_cont.css({ "overflow-x": "scroll", "overflow-y": "auto", "max-height": "100%" });
										const scroll_to_today = () => { const highlight = gantt_wrapper.find(".date_" + moment().format("YYYY-MM-DD")).add(gantt_wrapper.find(".current-date-highlight")).first(); if (highlight.length) { const scroll_pos = highlight.position().left - (g_cont.width() / 2); g_cont.animate({ scrollLeft: scroll_pos }, 300); } };
										setTimeout(scroll_to_today, 800);
									} catch (e) { console.error("Gantt error:", e); chart_container.html('<p class="text-danger">Error initializing Gantt chart.</p>'); }
								} else { chart_container.html('<p class="text-muted text-center p-4">Error fetching data or no tasks found.</p>'); }
							},
						});
					}
				};
				wrapperField.__custom_gantt_bound = true;
			}
			wrapperField.render_heatmap = function(frm, container) {
				const body = container.find(".heatmap-body");
				body.html('<div class="p-2 text-center text-muted small">Loading allocation...</div>');
				frappe.call({
					method: "project_enhancements.project_enhancements.page.project_dashboard.project_dashboard.get_resource_allocation_data",
					args: { project_name: frm.doc.name },
					callback: (r) => {
						if (r.message && Object.keys(r.message).length > 0) {
							container.show();
							const data = r.message; const users = Object.keys(data);
							let allDates = []; users.forEach(u => allDates.push(...Object.keys(data[u])));
							allDates = [...new Set(allDates)].sort();
							if (allDates.length === 0) { container.hide(); return; }
							let html = `<table class="heatmap-table"><thead><tr><th class="user-cell">Assignee</th>`;
							allDates.forEach(date => { html += `<th>${moment(date).format('DD MMM')}</th>`; });
							html += `</tr></thead><tbody>`;
							users.forEach(user => {
								html += `<tr><td class="user-cell">${user}</td>`;
								allDates.forEach(date => {
									const cell = data[user][date] || { hours: 0, tasks: [] };
									const hrs = cell.hours; let cls = hrs > 9 ? "workload-high" : (hrs >= 6 ? "workload-med" : (hrs > 0 ? "workload-low" : ""));
									html += `<td class="${cls}" data-user="${user}" data-date="${date}" title="${hrs.toFixed(1)} hrs">${hrs > 0 ? hrs.toFixed(1) : '-'}</td>`;
								});
								html += `</tr>`;
							});
							html += `</tbody></table>`; body.html(html);
							body.find('td:not(.user-cell)').on('click', function() {
								const u = $(this).data('user'); const d = $(this).data('date'); const c = data[u][d];
								if (c && c.tasks.length > 0) {
									$('.gantt .bar-wrapper').removeClass('highlight');
									c.tasks.forEach(t => { $(`.gantt .bar-wrapper[data-id="${t.id}"]`).addClass('highlight'); });
									frappe.show_alert({ message: `Highlighting ${c.tasks.length} tasks for ${u} on ${d}`, indicator: 'info' });
								}
							});
						} else { container.hide(); }
					}
				});
			};
			if (wrapperField.$wrapper) wrapperField.refresh();
		}
	},
});

frappe.ui.form.on("Project", {
	refresh: function (frm) {
		if (!frm.is_new()) {
			var field = frm.get_field("custom_reminder_action");
			if (field) {
				var $btn = $('<button class="btn btn-default btn-sm icon-btn"><span class="icon icon-sm"><svg class="es-icon es-line  icon-sm" aria-hidden="true"><use href="#es-line-bell"></use></svg></span> Set Reminder</button>');
				$btn.on("click", function () {
					var d = new frappe.ui.Dialog({
						title: __("Create a Reminder"),
						fields: [
							{ label: "Remind Me In", fieldname: "remind_in", fieldtype: "Select", options: [{ label: "30 Minutes", value: 30 }, { label: "1 Hour", value: 60 }, { label: "2 Hours", value: 120 }, { label: "4 Hours", value: 240 }, { label: "Tomorrow Morning", value: "tomorrow" }], onchange: function () { var choice = this.get_value(); if (!choice) return; var new_time; if (choice === "tomorrow") { new_time = moment().add(1, "days").set({ hour: 9, minute: 0, second: 0 }).format("YYYY-MM-DD HH:mm:ss"); } else { new_time = moment().add(choice, "minutes").format("YYYY-MM-DD HH:mm:ss"); } d.set_value("remind_at", new_time); } },
							{ fieldtype: "Column Break" },
							{ label: "Remind At", fieldname: "remind_at", fieldtype: "Datetime", reqd: 1, default: frappe.datetime.now_datetime() },
							{ fieldtype: "Section Break" },
							{ label: "Description", fieldname: "description", fieldtype: "Small Text", reqd: 1, default: "Reminder for Project: " + frm.doc.project_name },
						],
						primary_action_label: __("Create"),
						primary_action: function (values) {
							frappe.db.insert({ doctype: "ToDo", reference_type: frm.doc.doctype, reference_name: frm.doc.name, description: values.description, date: values.remind_at, allocated_to: frappe.session.user, status: "Open" }).then(() => { d.hide(); frappe.show_alert({ message: __("Reminder created successfully"), indicator: "green" }); });
						},
					});
					d.show();
				});
				field.$wrapper.empty().append($btn);
			}
		}
	},
});
