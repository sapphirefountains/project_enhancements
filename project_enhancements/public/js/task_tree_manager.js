/* global project_enhancements */
frappe.provide("project_enhancements");

project_enhancements.TaskTreeManager = class TaskTreeManager {
	constructor({
		wrapper,
		projectName,
		readonly = false,
		preFetchedData = null,
		taskStatusOptions = null,
	}) {
		this.wrapper = $(wrapper);
		this.projectName = projectName;
		this.readonly = readonly;
		this.tasks = [];
		this.collapsedTasks = new Set();
		this.pendingChanges = {};
		// Default options, will be updated from server
		this.taskStatusOptions = taskStatusOptions || [
			"Open",
			"Working",
			"Completed",
			"Cancelled",
		];
		this.sortableInstances = [];

		// Pre-fetched data from a unified view or parent component
		this.preFetchedData = preFetchedData;

		// Load collapsed state from local storage
		const savedState = localStorage.getItem(`collapsedTasks_${this.projectName}`);
		if (savedState) {
			this.collapsedTasks = new Set(JSON.parse(savedState));
		}

		this.init();
	}

	init() {
		this.loadAssets().then(() => {
			this.renderStructure();
			if (this.preFetchedData) {
				this.hydrate(this.preFetchedData);
			} else {
				this.fetchData();
			}
		});
	}

	hydrate(data) {
		this.tasks = data;
		this.updateStatusFilterOptions();
		this.renderGrid(this.tasks);
	}

	loadAssets() {
		return new Promise((resolve) => {
			// Load custom CSS
			frappe.require("/assets/project_enhancements/css/task_tree.css", () => {
				// Load SortableJS
				const script_url =
					"https://cdn.jsdelivr.net/npm/sortablejs@latest/Sortable.min.js";
				frappe.require(script_url, () => {
					resolve();
				});
			});
		});
	}

	renderStructure() {
		this.wrapper.html(`
            <div class="task-tree-manager p-3 bg-white border rounded">
                <div class="task-tree-header mb-3">
                    <div class="d-flex justify-content-between align-items-center mb-2">
                        <div class="d-flex align-items-center">
                            <h5 class="mb-0 mr-3">Tasks</h5>
                            <span class="task-saving-indicator text-muted mr-3" style="display: none;"><i class="fa fa-spinner fa-spin"></i> Saving...</span>
                            <div class="task-pending-changes-controls mr-2" style="display: none;">
                                <div class="btn-group btn-group-sm">
                                    <button type="button" class="btn btn-success save-changes-btn">Save Changes</button>
                                    <button type="button" class="btn btn-danger discard-changes-btn">Discard Changes</button>
                                </div>
                            </div>
                            <button class="btn btn-sm btn-success mr-2 save-order-btn" style="display: none;">Save Order</button>
                            ${
								!this.readonly
									? `<a href="/app/task/new-task?project=${this.projectName}" class="btn btn-primary btn-sm">Add Task</a>`
									: ""
							}
                        </div>
                    </div>
                    <div class="task-filters p-2 rounded-sm bg-light border">
                        <div class="row">
                            <div class="col-md-4"><input type="text" class="form-control form-control-sm task-name-filter" placeholder="Filter by task name..."></div>
                            <div class="col-md-3"><input type="text" class="form-control form-control-sm task-owner-filter" placeholder="Filter by owner..."></div>
                            <div class="col-md-3"><select class="form-control form-control-sm task-status-filter"><option value="">All Statuses</option></select></div>
                            <div class="col-md-2"><button class="btn btn-sm btn-default btn-block clear-filters-btn">Clear Filters</button></div>
                        </div>
                    </div>
                </div>
                <div class="task-grid">
                    <div class="task-grid-header">
                        <div class="task-grid-cell">Task</div>
                        <div class="task-grid-cell">Owner</div>
                        <div class="task-grid-cell">Status</div>
                        <div class="task-grid-cell">Start Date</div>
                        <div class="task-grid-cell">Due Date</div>
                        <div class="task-grid-cell">% Complete</div>
                        <div class="task-grid-cell">Duration (hrs)</div>
                    </div>
                    <div class="task-grid-body"></div>
                </div>
            </div>
        `);

		this.bindEvents();
	}

	fetchData() {
		// Fallback to standard frappe.call if dashboard_api is not available (e.g. on Task form view)
		const callApi =
			window.project_enhancements && project_enhancements.dashboard_api
				? project_enhancements.dashboard_api.call
				: (options) =>
						new Promise((resolve, reject) => {
							frappe.call({
								...options,
								callback: resolve,
								error: reject,
							});
						});

		const fetchStatusOptions = callApi({
			method: "project_enhancements.project_enhancements.page.project_dashboard.project_dashboard.get_task_status_options",
		});

		const fetchTasks = callApi({
			method: "project_enhancements.project_enhancements.page.project_dashboard.project_dashboard.get_project_tasks",
			args: { project: this.projectName },
		});

		Promise.all([fetchStatusOptions, fetchTasks])
			.then((results) => {
				const statusResult = results[0];
				const tasksResult = results[1];

				if (statusResult.message) {
					this.taskStatusOptions = statusResult.message;
				}

				if (tasksResult.message && !tasksResult.message.error) {
					this.hydrate(tasksResult.message);
				} else {
					this.wrapper
						.find(".task-grid-body")
						.html(
							`<div class="alert alert-danger">Error fetching tasks: ${
								tasksResult.message ? tasksResult.message.error : "Unknown error"
							}</div>`
						);
				}
			})
			.catch((err) => {
				console.error("TaskTreeManager Error:", err);
				this.wrapper
					.find(".task-grid-body")
					.html(
						`<div class="alert alert-danger">Error fetching tasks. Please try again later.</div>`
					);
			});
	}

	updateStatusFilterOptions() {
		const filter = this.wrapper.find(".task-status-filter");
		// keep the first option
		filter.find("option:not(:first)").remove();
		this.taskStatusOptions.forEach((s) => {
			filter.append(`<option value="${s}">${s}</option>`);
		});
	}

	renderGrid(tasks) {
		const gridBody = this.wrapper.find(".task-grid-body");
		gridBody.empty();

		if (!tasks || tasks.length === 0) {
			gridBody.html('<div class="p-4 text-center text-muted">No tasks match filters.</div>');
			return;
		}

		const renderTaskNode = (task, container, level) => {
			const start_date = task.exp_start_date
				? frappe.datetime.str_to_user(task.exp_start_date)
				: "Set Date";
			const end_date = task.exp_end_date
				? frappe.datetime.str_to_user(task.exp_end_date)
				: "Set Date";
			const progress = task.progress || 0;
			const isCollapsed = this.collapsedTasks.has(task.name);

			const iconClass =
				task.children.length > 0
					? (isCollapsed ? "fa-caret-right" : "fa-caret-down") + " toggle-child-tasks"
					: "";

			const statusStyle = this.getStatusStyle(task.status);
			const hasPendingChange = (field) =>
				this.pendingChanges[task.name] &&
				this.pendingChanges[task.name][field] !== undefined;

			const node = $(`
                <div class="task-node" data-task-id="${task.name}">
                    <div class="task-grid-row">
                        <div class="task-grid-cell">
                            <div style="padding-left: ${
								level * 20
							}px; display: flex; align-items: center; width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                                <i class="fa fa-bars task-drag-handle mr-2 text-muted" style="cursor: grab; flex-shrink: 0;"></i>
                                <i class="fa fa-fw ${iconClass} mr-1" style="cursor: pointer; flex-shrink: 0;"></i>
                                <a href="/app/task/${
									task.name
								}" style="overflow: hidden; text-overflow: ellipsis;">${
				task.subject
			}</a>
                            </div>
                        </div>
                        <div class="task-grid-cell assignee-cell"><a href="#" class="assignee-link">${
							task.assigned_to || "Unassigned"
						}</a></div>
                        <div class="task-grid-cell">
                            <select class="form-control form-control-sm task-status-select pill-select" style="width: 120px; ${statusStyle}">
                                ${this.taskStatusOptions
									.map(
										(s) =>
											`<option value="${s}" ${
												task.status === s ? "selected" : ""
											}>${s}</option>`
									)
									.join("")}
                            </select>
                        </div>
                        <div class="task-grid-cell editable-date ${
							hasPendingChange("exp_start_date") ? "unsaved-change" : ""
						}" data-field="exp_start_date" data-task-id="${
				task.name
			}" data-original-date="${
				task.exp_start_date || ""
			}"><a href="#">${start_date}</a></div>
                        <div class="task-grid-cell editable-date ${
							hasPendingChange("exp_end_date") ? "unsaved-change" : ""
						}" data-field="exp_end_date" data-task-id="${
				task.name
			}" data-original-date="${task.exp_end_date || ""}"><a href="#">${end_date}</a></div>
                        <div class="task-grid-cell"><div class="progress" style="height: 15px; width: 100%;"><div class="progress-bar" role="progressbar" style="width: ${progress}%;" aria-valuenow="${progress}" aria-valuemin="0" aria-valuemax="100">${progress}%</div></div></div>
                        <div class="task-grid-cell editable-time ${
							hasPendingChange("expected_time") ? "unsaved-change" : ""
						}" data-field="expected_time" data-task-id="${
				task.name
			}" data-original-value="${task.expected_time || 0}"><a href="#">${
				task.expected_time || 0
			}</a></div>
                    </div>
                    <div class="child-tasks-container" style="${
						isCollapsed ? "display: none;" : ""
					}"></div>
                </div>
            `).appendTo(container);

			if (task.children && task.children.length > 0) {
				const childContainer = node.find(".child-tasks-container");
				task.children.forEach((child) => renderTaskNode(child, childContainer, level + 1));
			}
		};

		tasks.forEach((task) => renderTaskNode(task, gridBody, 0));
		this.initializeTaskSorting();
	}

	initializeTaskSorting() {
		if (this.sortableInstances) {
			this.sortableInstances.forEach((instance) => instance.destroy());
		}
		this.sortableInstances = [];

		if (this.readonly) return;

		const sortableContainers = this.wrapper.find(".task-grid-body, .child-tasks-container");
		const me = this;

		sortableContainers.each(function () {
			const instance = new Sortable(this, {
				group: "nested-tasks",
				animation: 150,
				handle: ".task-drag-handle",
				ghostClass: "sortable-ghost",
				chosenClass: "sortable-chosen",
				onEnd: function (evt) {
					me.wrapper.find(".save-order-btn").show();
				},
			});
			me.sortableInstances.push(instance);
		});
	}

	getStatusStyle(status) {
		let color = "#6c757d"; // Default grey
		switch (status) {
			case "Active":
				color = "#007bff";
				break;
			case "Open":
				color = "#007bff";
				break;
			case "Completed":
				color = "#28a745";
				break;
			case "Overdue":
				color = "#dc3545";
				break;
			case "Cancelled":
				color = "#dc3545";
				break;
			case "Canceled":
				color = "#dc3545";
				break;
			case "Working":
				color = "#ff9800";
				break;
			case "On Hold":
				color = "#ff9800";
				break;
			case "Invoiced":
				color = "#6f42c1";
				break;
			default:
				color = "#6c757d";
		}
		return `background-color: ${color}; color: white;`;
	}

	applyFilters() {
		const nameFilter = (this.wrapper.find(".task-name-filter").val() || "").toLowerCase();
		const ownerFilter = (this.wrapper.find(".task-owner-filter").val() || "").toLowerCase();
		const statusFilter = this.wrapper.find(".task-status-filter").val();

		// Deep copy tasks to avoid mutating state during filtering
		let filteredTasks = JSON.parse(JSON.stringify(this.tasks));

		const filterNode = (task) => {
			if (task.children && task.children.length > 0) {
				task.children = task.children.map(filterNode).filter(Boolean);
			}
			const hasVisibleChildren = task.children && task.children.length > 0;
			const nameMatch = !nameFilter || task.subject.toLowerCase().includes(nameFilter);
			const ownerMatch =
				!ownerFilter || (task.assigned_to || "").toLowerCase().includes(ownerFilter);
			const statusMatch = !statusFilter || task.status === statusFilter;

			if ((nameMatch && ownerMatch && statusMatch) || hasVisibleChildren) {
				return task;
			}
			return null;
		};

		filteredTasks = filteredTasks.map(filterNode).filter(Boolean);
		this.renderGrid(filteredTasks);
	}

	bindEvents() {
		const me = this;

		// Filters
		this.wrapper.on(
			"keyup",
			".task-name-filter, .task-owner-filter",
			frappe.utils.debounce(() => me.applyFilters(), 300)
		);
		this.wrapper.on("change", ".task-status-filter", () => me.applyFilters());
		this.wrapper.on("click", ".clear-filters-btn", () => {
			me.wrapper.find(".task-name-filter").val("");
			me.wrapper.find(".task-owner-filter").val("");
			me.wrapper.find(".task-status-filter").val("");
			me.applyFilters();
		});

		// Toggle children
		this.wrapper.on("click", ".toggle-child-tasks", function () {
			const $icon = $(this);
			const $taskNode = $icon.closest(".task-node");
			const taskId = $taskNode.data("task-id");
			const $childContainer = $taskNode.find(".child-tasks-container");

			$icon.toggleClass("fa-caret-down fa-caret-right");
			$childContainer.slideToggle(200);

			if ($icon.hasClass("fa-caret-right")) {
				me.collapsedTasks.add(taskId);
			} else {
				me.collapsedTasks.delete(taskId);
			}
			localStorage.setItem(
				`collapsedTasks_${me.projectName}`,
				JSON.stringify(Array.from(me.collapsedTasks))
			);
		});

		// Save Order
		this.wrapper.on("click", ".save-order-btn", function () {
			me.saveTaskOrder();
		});

		// Pending Changes
		this.wrapper.on("click", ".save-changes-btn", () => me.savePendingChanges());
		this.wrapper.on("click", ".discard-changes-btn", () => me.discardPendingChanges());

		// Inline Editing - Date
		this.wrapper.on("click", ".editable-date a", function (e) {
			e.preventDefault();
			if (me.readonly) return;
			me.handleDateEdit($(this));
		});

		// Inline Editing - Time
		this.wrapper.on("click", ".editable-time a", function (e) {
			e.preventDefault();
			if (me.readonly) return;
			me.handleTimeEdit($(this));
		});

		// Inline Editing - Status
		this.wrapper.on("change", ".task-status-select", function () {
			if (me.readonly) return;
			me.handleStatusChange($(this));
		});

		// Assignees
		this.wrapper.on("click", ".assignee-link", function (e) {
			e.preventDefault();
			if (me.readonly) return;
			me.showAssigneeDialog($(this));
		});
	}

	handleDateEdit(link) {
		const cell = link.closest("td, .task-grid-cell"); // Support both table and grid
		if (cell.find(".datepicker-input").length > 0) return;

		const taskName = cell.data("task-id");
		const field = cell.data("field");
		const originalValue = cell.data("original-date");
		let hasChanged = false;

		link.hide();

		const control_wrapper = $(
			'<div class="datepicker-input" style="width: 130px;"></div>'
		).appendTo(cell);
		let datepicker = frappe.ui.form.make_control({
			parent: control_wrapper,
			df: { fieldtype: "Date", fieldname: field },
			render_input: true,
		});
		datepicker.set_value(originalValue);
		datepicker.input.focus();

		const cleanup = () => {
			control_wrapper.remove();
			link.show();
		};

		$(datepicker.input).on("change", () => {
			hasChanged = true;
			const newValue = datepicker.get_value();
			const displayValue = newValue ? frappe.datetime.str_to_user(newValue) : "Set Date";

			link.text(displayValue);
			cell.addClass("unsaved-change");

			if (!this.pendingChanges[taskName]) this.pendingChanges[taskName] = {};
			this.pendingChanges[taskName][field] = newValue;
			this.showPendingChangesControls();

			this.updateLocalTaskData(taskName, field, newValue);
			cleanup();
		});

		$(datepicker.input).on("blur", () => {
			setTimeout(() => {
				if (!hasChanged) cleanup();
			}, 200);
		});
	}

	handleTimeEdit(link) {
		const cell = link.closest("td, .task-grid-cell");
		if (cell.find(".time-input").length > 0) return;

		const taskName = cell.data("task-id");
		const originalValue = cell.data("original-value");
		link.hide();

		const input = $(
			`<input type="number" class="form-control form-control-sm time-input" style="width: 80px;" min="0" step="0.5">`
		)
			.val(originalValue)
			.appendTo(cell)
			.focus();

		const cleanup = () => {
			input.remove();
			link.show();
		};

		const save = () => {
			const newValue = input.val();
			if (newValue === "" || isNaN(newValue) || parseFloat(newValue) < 0) {
				cleanup();
				return;
			}
			const newFloatValue = parseFloat(newValue);
			link.text(newFloatValue);
			cell.addClass("unsaved-change");

			if (!this.pendingChanges[taskName]) this.pendingChanges[taskName] = {};
			this.pendingChanges[taskName]["expected_time"] = newFloatValue;
			this.showPendingChangesControls();

			this.updateLocalTaskData(taskName, "expected_time", newFloatValue);
			cleanup();
		};

		input.on("blur", save).on("keydown", (e) => {
			if (e.key === "Enter") {
				e.preventDefault();
				input.blur();
			} else if (e.key === "Escape") {
				e.preventDefault();
				cleanup();
			}
		});
	}

	handleStatusChange(select) {
		const taskName = select.closest(".task-node").data("task-id");
		const value = select.val();

		select.attr("style", this.getStatusStyle(value));

		if (!this.pendingChanges[taskName]) this.pendingChanges[taskName] = {};
		this.pendingChanges[taskName]["status"] = value;
		this.showPendingChangesControls();

		this.updateLocalTaskData(taskName, "status", value);
	}

	updateLocalTaskData(taskId, field, value) {
		const findAndUpdate = (list) => {
			for (let task of list) {
				if (task.name === taskId) {
					task[field] = value;
					return true;
				}
				if (task.children && task.children.length && findAndUpdate(task.children))
					return true;
			}
			return false;
		};
		findAndUpdate(this.tasks);
	}

	showPendingChangesControls() {
		this.wrapper.find(".task-pending-changes-controls").show();
	}

	savePendingChanges() {
		frappe.call({
			method: "project_enhancements.project_enhancements.page.project_dashboard.project_dashboard.update_multiple_docs",
			args: {
				project_updates: "{}",
				task_updates: JSON.stringify(this.pendingChanges),
			},
			callback: (r) => {
				if (r.message && r.message.status === "success") {
					frappe.show_alert({ message: "Changes saved!", indicator: "green" });
					this.pendingChanges = {};
					this.wrapper.find(".task-pending-changes-controls").hide();
					this.wrapper.find(".unsaved-change").removeClass("unsaved-change");
				} else {
					frappe.show_alert({
						message: r.message.message || "Error saving changes.",
						indicator: "red",
					});
				}
			},
		});
	}

	discardPendingChanges() {
		this.pendingChanges = {};
		this.wrapper.find(".task-pending-changes-controls").hide();
		this.fetchData(); // Reload to revert
		frappe.show_alert({ message: "Changes discarded.", indicator: "info" });
	}

	saveTaskOrder() {
		const saveButton = this.wrapper.find(".save-order-btn");
		const indicator = this.wrapper.find(".task-saving-indicator");

		indicator.show();
		saveButton.prop("disabled", true);

		const updates = [];
		const recurse = (container, parentOrderString) => {
			const children = $(container).children(".task-node");
			children.each((index, element) => {
				const taskNode = $(element);
				const taskId = taskNode.data("task-id");
				const parentNode = taskNode.parent().closest(".task-node");
				const parentId = parentNode.length ? parentNode.data("task-id") : null;

				let currentOrderString = parentOrderString
					? parentOrderString + (index + 1)
					: index + 1 + ".0";

				updates.push({
					name: taskId,
					parent_task: parentId,
					custom_subtask_order: parseFloat(currentOrderString),
				});

				const childContainer = taskNode.children(".child-tasks-container");
				if (childContainer.children(".task-node").length > 0) {
					let nextParentOrderString = currentOrderString.endsWith(".0")
						? currentOrderString.slice(0, -2) + "."
						: currentOrderString;
					recurse(childContainer, nextParentOrderString);
				}
			});
		};

		recurse(this.wrapper.find(".task-grid-body"), null);

		frappe.call({
			method: "project_enhancements.project_enhancements.page.project_dashboard.project_dashboard.update_task_structure",
			args: { project_name: this.projectName, tasks: updates },
			callback: (r) => {
				if (r.message && r.message.status === "success") {
					saveButton.hide();
					this.fetchData();
				} else {
					frappe.show_alert({
						message: r.message.message || "Could not save task order.",
						indicator: "red",
					});
				}
			},
			always: () => {
				indicator.hide();
				saveButton.prop("disabled", false);
			},
		});
	}

	showAssigneeDialog(link) {
		const taskNode = link.closest(".task-node");
		const taskId = taskNode.data("task-id");
		const taskSubject = taskNode.find(".task-grid-cell:first a").text();

		let task;
		const findTask = (list) => {
			for (let t of list) {
				if (t.name === taskId) return t;
				if (t.children) {
					const found = findTask(t.children);
					if (found) return found;
				}
			}
			return null;
		};
		task = findTask(this.tasks);

		if (!task) return;

		const dialog = new frappe.ui.Dialog({
			title: `Assignments for: ${taskSubject}`,
			fields: [
				{
					fieldname: "assign_to",
					fieldtype: "Link",
					options: "User",
					label: "Assign a user",
				},
				{
					fieldname: "assignees_html",
					fieldtype: "HTML",
					options: '<div class="assignee-list-wrapper mt-3"></div>',
				},
			],
		});

		const assigneeListWrapper = dialog
			.get_field("assignees_html")
			.$wrapper.find(".assignee-list-wrapper");

		const renderAssignees = () => {
			assigneeListWrapper.empty();
			if (task.assignees && task.assignees.length > 0) {
				const assigneeItems = task.assignees
					.map(
						(a) => `
                    <li class="list-group-item d-flex justify-content-between align-items-center">
                        ${a.full_name}
                        <button class="btn btn-xs btn-danger remove-assignee" data-user-id="${a.email}">Remove</button>
                    </li>
                `
					)
					.join("");
				assigneeListWrapper.html(`<ul class="list-group">${assigneeItems}</ul>`);
			} else {
				assigneeListWrapper.html('<p class="text-muted">No users assigned.</p>');
			}
		};

		const updateLink = () => {
			const text =
				task.assignees && task.assignees.length
					? task.assignees.map((a) => a.full_name).join(", ")
					: "Unassigned";
			link.text(text);
			task.assigned_to = text;
		};

		dialog.get_field("assign_to").df.onchange = () => {
			const userId = dialog.get_value("assign_to");
			if (!userId) return;

			if (task.assignees && task.assignees.find((a) => a.email === userId)) {
				frappe.show_alert({ message: "User already assigned.", indicator: "info" });
				dialog.set_value("assign_to", "");
				return;
			}

			frappe.call({
				method: "project_enhancements.project_enhancements.page.project_dashboard.project_dashboard.add_task_assignee",
				args: { task_name: taskId, user_id: userId },
				callback: (r) => {
					if (r.message && r.message.status === "success") {
						task.assignees = r.message.assignees;
						renderAssignees();
						updateLink();
						dialog.set_value("assign_to", "");
					} else {
						frappe.show_alert({
							message: r.message.message || "Error assigning user.",
							indicator: "red",
						});
					}
				},
			});
		};

		assigneeListWrapper.on("click", ".remove-assignee", function () {
			const userId = $(this).data("user-id");
			frappe.call({
				method: "project_enhancements.project_enhancements.page.project_dashboard.project_dashboard.remove_task_assignee",
				args: { task_name: taskId, user_id: userId },
				callback: (r) => {
					if (r.message && r.message.status === "success") {
						task.assignees = r.message.assignees;
						renderAssignees();
						updateLink();
					} else {
						frappe.show_alert({
							message: r.message.message || "Error removing user.",
							indicator: "red",
						});
					}
				},
			});
		});

		dialog.show();
		renderAssignees();
	}
};
