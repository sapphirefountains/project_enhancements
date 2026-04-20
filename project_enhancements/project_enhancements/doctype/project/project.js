frappe.ui.form.on("Project", {
	refresh: function (frm) {
		console.log("Project form refreshed - initializing Gantt check");
		
		// This function will load CSS and JS from the specified CDN URLs
		function load_cdn_assets() {
			return new Promise((resolve, reject) => {
				const css_url = "https://cdn.jsdelivr.net/npm/frappe-gantt/dist/frappe-gantt.css";
				const js_url = "https://cdn.jsdelivr.net/npm/frappe-gantt/dist/frappe-gantt.umd.js";

				// Load CSS
				if (!$(`link[href="${css_url}"]`).length) {
					$("<link>", {
						rel: "stylesheet",
						type: "text/css",
						href: css_url,
					}).appendTo("head");
				}

				// Inject custom styling for overdue tasks and popover
				if (!$("#custom-gantt-styles").length) {
					$("<style id='custom-gantt-styles'>").html(`
						.gantt .bar-overdue .bar { fill: #e74c3c !important; }
						.gantt .bar-overdue .bar-progress { fill: #c0392b !important; }
						.custom-gantt-popup {
							background: #fff;
							border-radius: 4px;
							padding: 12px;
							box-shadow: 0 2px 10px rgba(0,0,0,0.15);
							font-size: 13px;
							color: #333;
							min-width: 200px;
							border: 1px solid #e0e0e0;
						}
						.custom-gantt-popup h5 { margin: 0 0 8px; font-weight: 600; font-size: 14px; }
						.custom-gantt-popup p { margin: 0 0 4px; }
						.custom-gantt-popup .popup-label { font-weight: bold; color: #555; }
					`).appendTo("head");
				}

				// Load JS using jQuery's getScript, which handles execution
				if (typeof Gantt !== "undefined") {
					resolve();
				} else {
					$.getScript(js_url)
						.done(function () {
							resolve();
						})
						.fail(function (jqxhr, settings, exception) {
							reject(exception);
						});
				}
			});
		}

		const wrapperField = frm.get_field("custom_gantt_chart_html");

		if (wrapperField) {
			console.log("Found custom_gantt_chart_html field");
			
			if (!wrapperField.__custom_gantt_bound) {
				const original_refresh = wrapperField.refresh;

				wrapperField.refresh = function () {
					if (original_refresh) {
						original_refresh.call(this);
					}

					console.log("custom_gantt_chart_html.refresh() called");

					if (this.$wrapper) {
						const gantt_wrapper = this.$wrapper;
						
						// Always ensure we have the container
						if (gantt_wrapper.find(".gantt-chart-container").length === 0) {
							gantt_wrapper.css({
								height: "550px",
								display: "flex",
								"flex-direction": "column",
								border: "1px solid #d1d8dd",
								"border-radius": "4px",
								"background-color": "#f8f9fa",
								"margin-bottom": "20px"
							});

							gantt_wrapper
								.empty()
								.html(`
									<div class="gantt-toolbar d-flex justify-content-end p-2 bg-light border-bottom">
										<div class="btn-group btn-group-sm view-mode-group">
											<button type="button" class="btn btn-default" data-view="Quarter Day">Quarter Day</button>
											<button type="button" class="btn btn-default" data-view="Half Day">Half Day</button>
											<button type="button" class="btn btn-primary active" data-view="Day">Day</button>
											<button type="button" class="btn btn-default" data-view="Week">Week</button>
											<button type="button" class="btn btn-default" data-view="Month">Month</button>
										</div>
									</div>
									<div class="gantt-chart-container" style="flex-grow: 1; overflow: hidden; display: flex; align-items: center; justify-content: center;">
										<p class="text-muted">Initializing Gantt Chart...</p>
									</div>
								`);
						} else if (gantt_wrapper.find(".gantt-container").length > 0) {
							// Already rendered, skip unless we want to force re-render
							return;
						}

						load_cdn_assets()
							.then(() => {
								const chart_container = gantt_wrapper.find(".gantt-chart-container");
								chart_container.html('<p class="text-muted">Fetching task data...</p>');

								frappe.call({
									method: "project_enhancements.project_enhancements.page.project_dashboard.project_dashboard.get_gantt_tasks_for_project",
									args: { project_name: frm.doc.name },
									callback: function (r) {
										if (r.message && !r.message.error && r.message.length > 0) {
											const tasks = r.message;
											let clickTimer = null;

											const options = {
												view_mode: "Day",
												scroll_to: "today",
												custom_popup_html: function(task) {
													return `
														<div class="custom-gantt-popup">
															<h5>${task.name}</h5>
															<p><span class="popup-label">Assignee:</span> ${task.assigned_to || 'Unassigned'}</p>
															<p><span class="popup-label">Status:</span> ${task.status || 'N/A'}</p>
															<p><span class="popup-label">Start:</span> ${moment(task.start).format('MMM D, YYYY')}</p>
															<p><span class="popup-label">End:</span> ${moment(task.end).format('MMM D, YYYY')}</p>
															<p><span class="popup-label">Progress:</span> ${task.progress}%</p>
															<p style="font-size: 11px; margin-top: 8px; color: #777;"><em>Double-click bar to open task</em></p>
														</div>
													`;
												},
												on_click: (task) => {
													if (clickTimer) {
														clearTimeout(clickTimer);
														clickTimer = null;
														// Double click action
														frappe.set_route("Form", "Task", task.id);
													} else {
														// Single click starts timer
														clickTimer = setTimeout(() => {
															clickTimer = null;
															// Single click just shows popup, no explicit routing
														}, 250);
													}
												},
												on_date_change: (task, start, end) => {
													frappe.call({
														method: "project_enhancements.project_enhancements.page.project_dashboard.project_dashboard.update_task_dates_from_gantt",
														args: {
															task_name: task.id,
															start_date: moment(start).format("YYYY-MM-DD"),
															end_date: moment(end).format("YYYY-MM-DD"),
														},
													});
												},
												on_progress_change: (task, progress) => {
													frappe.call({
														method: "project_enhancements.project_enhancements.page.project_dashboard.project_dashboard.update_task_progress_from_gantt",
														args: {
															task_name: task.id,
															progress: parseInt(progress),
														},
													});
												},
											};

											// It is now safe to instantiate the Gantt chart
											chart_container.empty();
											try {
												const gantt = new Gantt(
													chart_container[0],
													tasks,
													options
												);

												// Bind View Mode Buttons
												gantt_wrapper.find('.view-mode-group button').on('click', function() {
													gantt_wrapper.find('.view-mode-group button').removeClass('active btn-primary').addClass('btn-default');
													$(this).addClass('active btn-primary').removeClass('btn-default');
													gantt.change_view_mode($(this).data('view'));
												});

												const gantt_container = gantt_wrapper.find(".gantt-container");
												gantt_container.css({
													"overflow-x": "scroll",
													"overflow-y": "auto",
													"max-height": "100%",
												});

												// Adjust scroll to align "Today" to the left
												setTimeout(() => {
													const today_date_class = ".date_" + moment().format("YYYY-MM-DD");
													let today_highlight = gantt_wrapper.find(today_date_class);

													if (today_highlight.length === 0) {
														today_highlight = gantt_wrapper.find(
															".current-date-highlight"
														);
													}

													if (today_highlight.length > 0) {
														const scroll_pos = today_highlight.position().left;
														gantt_container.scrollLeft(scroll_pos - 20);
													}
												}, 1000);
											} catch (e) {
												console.error("Gantt instantiation error:", e);
												chart_container.html('<p class="text-danger">Error initializing Gantt chart. See console for details.</p>');
											}
										} else {
											chart_container.html(
												'<p class="text-muted">No tasks found with dates for this project.</p>'
											);
										}
									},
								});
							})
							.catch((error) => {
								console.error("Failed to load Gantt chart from CDN:", error);
								gantt_wrapper
									.empty()
									.html(
										'<p class="text-danger">Error: Could not load Gantt chart library. Check connection.</p>'
									);
							});
					}
				};

				wrapperField.__custom_gantt_bound = true;
			}

			if (wrapperField.$wrapper) {
				wrapperField.refresh();
			}
		}
	},
});

// Original logic for reminders
frappe.ui.form.on("Project", {
	refresh: function (frm) {
		if (!frm.is_new()) {
			var field = frm.get_field("custom_reminder_action");

			if (field) {
				var $btn = $(
					'<button class="btn btn-default btn-sm icon-btn"><span class="icon icon-sm"><svg class="es-icon es-line  icon-sm" aria-hidden="true"><use href="#es-line-bell"></use></svg></span> Set Reminder</button>'
				);

				$btn.on("click", function () {
					var d = new frappe.ui.Dialog({
						title: __("Create a Reminder"),
						fields: [
							{
								label: "Remind Me In",
								fieldname: "remind_in",
								fieldtype: "Select",
								options: [
									{ label: "30 Minutes", value: 30 },
									{ label: "1 Hour", value: 60 },
									{ label: "2 Hours", value: 120 },
									{ label: "4 Hours", value: 240 },
									{ label: "Tomorrow Morning", value: "tomorrow" },
								],
								onchange: function () {
									var choice = this.get_value();
									if (!choice) return;

									var new_time;
									if (choice === "tomorrow") {
										new_time = moment()
											.add(1, "days")
											.set({ hour: 9, minute: 0, second: 0 })
											.format("YYYY-MM-DD HH:mm:ss");
									} else {
										new_time = moment()
											.add(choice, "minutes")
											.format("YYYY-MM-DD HH:mm:ss");
									}
									d.set_value("remind_at", new_time);
								},
							},
							{
								fieldtype: "Column Break",
							},
							{
								label: "Remind At",
								fieldname: "remind_at",
								fieldtype: "Datetime",
								reqd: 1,
								default: frappe.datetime.now_datetime(),
							},
							{
								fieldtype: "Section Break",
							},
							{
								label: "Description",
								fieldname: "description",
								fieldtype: "Small Text",
								reqd: 1,
								default: "Reminder for Project: " + frm.doc.project_name,
							},
						],
						primary_action_label: __("Create"),
						primary_action: function (values) {
							frappe.db
								.insert({
									doctype: "ToDo",
									reference_type: frm.doc.doctype,
									reference_name: frm.doc.name,
									description: values.description,
									date: values.remind_at,
									allocated_to: frappe.session.user,
									status: "Open",
								})
								.then((doc) => {
									d.hide();
									frappe.show_alert({
										message: __("Reminder created successfully"),
										indicator: "green",
									});
								});
						},
					});

					d.show();
				});

				field.$wrapper.empty().append($btn);
			}
		}
	},
});
