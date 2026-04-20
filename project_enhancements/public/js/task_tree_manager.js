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

		// Load column visibility state from local storage
		this.columnVisibility = {
			owner: false,
			status: true,
			priority: true,
			start_date: false,
			due_date: true,
			progress: true,
			duration: false,
		};
		const savedColumns = localStorage.getItem(`taskTreeColumns_${frappe.session.user}`);
		if (savedColumns) {
			this.columnVisibility = JSON.parse(savedColumns);
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
                            <div class="col-md-3">
                                <div class="dropdown">
                                    <button class="btn btn-sm btn-default dropdown-toggle w-100 text-left" type="button" id="statusFilterMenu" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false" title="Filter by Status" style="background-color: white; border: 1px solid #d1d8dd; color: #36414c;">
                                        Statuses
                                    </button>
                                    <div class="dropdown-menu p-2" aria-labelledby="statusFilterMenu" style="min-width: 200px; max-height: 300px; overflow-y: auto;" id="status-filter-container">
                                        <!-- Checkboxes will be injected here -->
                                    </div>
                                </div>
                            </div>
                            <div class="col-md-2 d-flex">
                                <button class="btn btn-sm btn-default clear-filters-btn mr-2 flex-grow-1">Clear</button>
                                <div class="dropdown">
                                    <button class="btn btn-sm btn-default dropdown-toggle" type="button" id="columnToggleMenu" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false" title="Toggle Columns">
                                        <i class="fa fa-columns"></i>
                                    </button>
                                    <div class="dropdown-menu dropdown-menu-right p-2" aria-labelledby="columnToggleMenu" style="min-width: 150px;">
                                        <div class="form-check mb-1">
                                            <input class="form-check-input column-toggle-cb" type="checkbox" value="owner" id="cb-col-owner" ${
												this.columnVisibility.owner ? "checked" : ""
											}>
                                            <label class="form-check-label" for="cb-col-owner">Owner</label>
                                        </div>
                                        <div class="form-check mb-1">
                                            <input class="form-check-input column-toggle-cb" type="checkbox" value="status" id="cb-col-status" ${
												this.columnVisibility.status ? "checked" : ""
											}>
                                            <label class="form-check-label" for="cb-col-status">Status</label>
                                        </div>
                                        <div class="form-check mb-1">
                                            <input class="form-check-input column-toggle-cb" type="checkbox" value="priority" id="cb-col-priority" ${
												this.columnVisibility.priority ? "checked" : ""
											}>
                                            <label class="form-check-label" for="cb-col-priority">Priority</label>
                                        </div>
                                        <div class="form-check mb-1">
                                            <input class="form-check-input column-toggle-cb" type="checkbox" value="start_date" id="cb-col-start-date" ${
												this.columnVisibility.start_date ? "checked" : ""
											}>
                                            <label class="form-check-label" for="cb-col-start-date">Start Date</label>
                                        </div>
                                        <div class="form-check mb-1">
                                            <input class="form-check-input column-toggle-cb" type="checkbox" value="due_date" id="cb-col-due-date" ${
												this.columnVisibility.due_date ? "checked" : ""
											}>
                                            <label class="form-check-label" for="cb-col-due-date">Due Date</label>
                                        </div>
                                        <div class="form-check mb-1">
                                            <input class="form-check-input column-toggle-cb" type="checkbox" value="progress" id="cb-col-progress" ${
												this.columnVisibility.progress ? "checked" : ""
											}>
                                            <label class="form-check-label" for="cb-col-progress">% Complete</label>
                                        </div>
                                        <div class="form-check mb-1">
                                            <input class="form-check-input column-toggle-cb" type="checkbox" value="duration" id="cb-col-duration" ${
												this.columnVisibility.duration ? "checked" : ""
											}>
                                            <label class="form-check-label" for="cb-col-duration">Duration</label>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="task-grid">
                    <div class="task-grid-header">
                        <div class="task-grid-cell" data-column="task">Task</div>
                        <div class="task-grid-cell ${
							this.columnVisibility.owner ? "" : "hidden-column"
						}" data-column="owner">Owner</div>
                        <div class="task-grid-cell ${
							this.columnVisibility.status ? "" : "hidden-column"
						}" data-column="status">Status</div>
                        <div class="task-grid-cell ${
							this.columnVisibility.priority ? "" : "hidden-column"
						}" data-column="priority">Priority</div>
                        <div class="task-grid-cell ${
							this.columnVisibility.start_date ? "" : "hidden-column"
						}" data-column="start_date">Start Date</div>
                        <div class="task-grid-cell ${
							this.columnVisibility.due_date ? "" : "hidden-column"
						}" data-column="due_date">Due Date</div>
                        <div class="task-grid-cell ${
							this.columnVisibility.progress ? "" : "hidden-column"
						}" data-column="progress">% Complete</div>
                        <div class="task-grid-cell ${
							this.columnVisibility.duration ? "" : "hidden-column"
						}" data-column="duration">Duration (hrs)</div>
                        ${!this.readonly ? `<div class="task-grid-cell actions-cell" data-column="actions">Actions</div>` : ''}
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
		const container = this.wrapper.find("#status-filter-container");
		container.empty();
		this.taskStatusOptions.forEach((s) => {
			container.append(`
                <div class="form-check mb-1">
                    <input class="form-check-input task-status-cb" type="checkbox" value="${s}" id="cb-status-${s.replace(
				/\s+/g,
				"-"
			)}">
                    <label class="form-check-label" style="cursor: pointer;" for="cb-status-${s.replace(
						/\s+/g,
						"-"
					)}">${s}</label>
                </div>
            `);
		});
	}

	renderGrid(tasks) {
		const gridBody = this.wrapper.find(".task-grid-body");
		gridBody.empty();

		if (!tasks || tasks.length === 0) {
			gridBody.html('<div class="p-4 text-center text-muted">No tasks match filters.</div>');
			gridBody.append(this.createQuickAddRow(null, 0));
			return;
		}

		tasks.forEach((task) => this.renderTaskNode(task, gridBody, 0));
		gridBody.prepend(this.createQuickAddRow(null, 0)); // Root quick add
		this.initializeTaskSorting();
	}

	renderTaskNode(task, container, level) {
		const start_date = task.exp_start_date
			? frappe.datetime.str_to_user(task.exp_start_date)
			: "Set Date";
		const end_date = task.exp_end_date
			? frappe.datetime.str_to_user(task.exp_end_date)
			: "Set Date";
		const progress = task.progress || 0;
		const isCollapsed = this.collapsedTasks.has(task.name);

		// Lazy Loading: Check has_children flag from server
		const hasChildren = task.has_children || (task.children && task.children.length > 0);
		const iconClass =
			hasChildren
				? (isCollapsed ? "fa-caret-right" : "fa-caret-down") + " toggle-child-tasks"
				: "fa-circle text-extra-muted" ; // Small dot for leaf nodes

		const statusBadge = this.getStatusBadge(task.status);
		const hasPendingChange = (field) =>
			this.pendingChanges[task.name] &&
			this.pendingChanges[task.name][field] !== undefined;

		const node = $(`
			<div class="task-node" data-task-id="${task.name}" data-loaded="${(task.children && task.children.length > 0) || !hasChildren}">
				<div class="task-grid-row">
					<div class="task-grid-cell">
						<div style="padding-left: ${
							level * 20
						}px; display: flex; align-items: center; width: 100%;">
							<i class="fa fa-bars task-drag-handle mr-2 text-muted" style="cursor: grab; flex-shrink: 0;"></i>
							<i class="fa fa-fw ${iconClass}" style="cursor: pointer; flex-shrink: 0; font-size: 10px;"></i>
							<a href="/app/task/${
								task.name
							}" class="task-name-cell-text" title="${task.subject}">${
			task.subject
		}</a>
						</div>
					</div>
					<div class="task-grid-cell assignee-cell ${
						this.columnVisibility.owner ? "" : "hidden-column"
					}" data-column="owner"><a href="#" class="assignee-link">${
			task.assigned_to || "Unassigned"
		}</a></div>
					<div class="task-grid-cell status-cell ${
						this.columnVisibility.status ? "" : "hidden-column"
					}" data-column="status">
						${statusBadge}
					</div>
					<div class="task-grid-cell ${
						this.columnVisibility.priority ? "" : "hidden-column"
					}" data-column="priority">
						${task.priority || "Medium"}
					</div>
					<div class="task-grid-cell editable-date ${
						hasPendingChange("exp_start_date") ? "unsaved-change" : ""
					} ${
			this.columnVisibility.start_date ? "" : "hidden-column"
		}" data-field="exp_start_date" data-task-id="${task.name}" data-original-date="${
			task.exp_start_date || ""
		}" data-column="start_date"><a href="#">${start_date}</a></div>
					<div class="task-grid-cell editable-date ${
						hasPendingChange("exp_end_date") ? "unsaved-change" : ""
					} ${
			this.columnVisibility.due_date ? "" : "hidden-column"
		}" data-field="exp_end_date" data-task-id="${task.name}" data-original-date="${
			task.exp_end_date || ""
		}" data-column="due_date"><a href="#">${end_date}</a></div>
					<div class="task-grid-cell ${
						this.columnVisibility.progress ? "" : "hidden-column"
					}" data-column="progress"><div class="progress" style="height: 15px; width: 100%;"><div class="progress-bar" role="progressbar" style="width: ${progress}%;" aria-valuenow="${progress}" aria-valuemin="0" aria-valuemax="100">${progress}%</div></div></div>
					<div class="task-grid-cell editable-time ${
						hasPendingChange("expected_time") ? "unsaved-change" : ""
					} ${
			this.columnVisibility.duration ? "" : "hidden-column"
		}" data-field="expected_time" data-task-id="${task.name}" data-original-value="${
			task.expected_time || 0
		}" data-column="duration"><a href="#">${task.expected_time || 0}</a></div>
					${!this.readonly ? `<div class="task-grid-cell actions-cell" data-column="actions">
						<button class="btn btn-xs btn-danger delete-task-btn" title="Delete Task" data-task-name="${task.name}" data-task-subject="${task.subject}"><i class="fa fa-trash"></i></button>
					</div>` : ''}
				</div>
				<div class="child-tasks-container" style="${
					isCollapsed ? "display: none;" : ""
				}"></div>
			</div>
		`).appendTo(container);

		// Status switch listener
		node.find('.status-badge').on('click', (e) => {
			e.stopPropagation();
			this.showStatusPicker(e, task.name);
		});

		// Gantt Sync Hover
		node.find('.task-grid-row').on('mouseenter', () => {
			$(`.gantt .bar-wrapper[data-id="${task.name}"]`).addClass('highlight');
		}).on('mouseleave', () => {
			$(`.gantt .bar-wrapper[data-id="${task.name}"]`).removeClass('highlight');
		});

		if (task.children && task.children.length > 0) {
			const childContainer = node.find(".child-tasks-container");
			task.children.forEach((child) => this.renderTaskNode(child, childContainer, level + 1));
			if (!isCollapsed) {
				childContainer.append(this.createQuickAddRow(task.name, level + 1));
			}
		} else if (hasChildren && !isCollapsed) {
			// Loading placeholder for lazy children
			node.find(".child-tasks-container").html('<div class="p-2 text-muted small"><i class="fa fa-spinner fa-spin mr-1"></i> Loading children...</div>');
		}
	}

	fetchChildren(parentTaskId, container, level) {
		frappe.call({
			method: "project_enhancements.project_enhancements.page.project_dashboard.project_dashboard.get_task_children",
			args: { parent_task: parentTaskId },
			callback: (r) => {
				container.empty();
				if (r.message && r.message.length > 0) {
					r.message.forEach(child => {
						this.renderTaskNode(child, container, level);
					});
					container.append(this.createQuickAddRow(parentTaskId, level));
				} else {
					container.html('<div class="p-2 text-muted small">No subtasks.</div>');
				}
				this.initializeTaskSorting();
			}
		});
	}

	createQuickAddRow(parentTask, level) {
		const indent = level * 20;
		const row = $(`
			<div class="task-grid-row quick-add-row" style="background-color: #f9fafb;">
				<div class="task-grid-cell" style="flex: 5;">
					<div style="padding-left: ${indent}px; display: flex; align-items: center; width: 100%;">
						<i class="fa fa-plus-circle text-muted mr-2" style="flex-shrink: 0;"></i>
						<input type="text" class="form-control input-xs quick-add-input" 
							placeholder="${parentTask ? 'Add subtask...' : 'Add root task...'}" 
							style="border: none; background: transparent; box-shadow: none; font-size: 12px; height: 24px; padding: 0;">
					</div>
				</div>
				<div class="task-grid-cell assignee-cell ${this.columnVisibility.owner ? "" : "hidden-column"}" data-column="owner"></div>
				<div class="task-grid-cell status-cell ${this.columnVisibility.status ? "" : "hidden-column"}" data-column="status"></div>
				<div class="task-grid-cell ${this.columnVisibility.priority ? "" : "hidden-column"}" data-column="priority"></div>
				<div class="task-grid-cell ${this.columnVisibility.start_date ? "" : "hidden-column"}" data-column="start_date"></div>
				<div class="task-grid-cell ${this.columnVisibility.due_date ? "" : "hidden-column"}" data-column="due_date"></div>
				<div class="task-grid-cell ${this.columnVisibility.progress ? "" : "hidden-column"}" data-column="progress"></div>
				<div class="task-grid-cell ${this.columnVisibility.duration ? "" : "hidden-column"}" data-column="duration"></div>
				${!this.readonly ? `<div class="task-grid-cell actions-cell" data-column="actions"></div>` : ''}
			</div>
		`);

		const input = row.find('.quick-add-input');
		input.on('keypress', (e) => {
			if (e.which === 13 && input.val().trim()) {
				this.saveInlineTask(input.val().trim(), parentTask);
				input.val('');
			}
		});

		return row;
	}

	saveInlineTask(subject, parentTask) {
		frappe.call({
			method: "project_enhancements.project_enhancements.page.project_dashboard.project_dashboard.create_inline_task",
			args: {
				project: this.projectName,
				subject: subject,
				parent_task: parentTask
			},
			callback: (r) => {
				if (r.message && r.message.status === "success") {
					frappe.show_alert({ message: __("Task added: {0}", [subject]), indicator: 'green' });
					this.fetchData(); // Refresh tree
				}
			}
		});
	}

	getStatusBadge(status) {
		const colorMap = {
			'Open': 'blue',
			'Working': 'orange',
			'Completed': 'green',
			'Cancelled': 'red',
			'On Hold': 'gray',
			'Active': 'blue',
			'Paid': 'green',
			'Overdue': 'red',
			'Invoiced': 'purple'
		};
		const color = colorMap[status] || 'gray';
		return `<span class="badge badge-${color} status-badge" style="cursor: pointer; text-transform: uppercase; font-size: 10px; padding: 4px 8px;">${status}</span>`;
	}

	showStatusPicker(event, taskName) {
		const statuses = this.taskStatusOptions.length > 0 ? this.taskStatusOptions : ['Open', 'Working', 'Completed', 'Cancelled', 'On Hold'];
		const $menu = $('<div class="status-picker-menu dropdown-menu show" style="position: fixed; z-index: 1050; display: block;"></div>');
		
		statuses.forEach(s => {
			$('<a class="dropdown-item" href="#">' + s + '</a>')
				.appendTo($menu)
				.on('click', (e) => {
					e.preventDefault();
					this.updateTaskStatus(taskName, s);
					$menu.remove();
				});
		});

		$('body').append($menu);
		
		let top = event.pageY;
		let left = event.pageX;
		
		// Prevent menu from going off-screen
		if (top + $menu.height() > $(window).height()) top -= $menu.height();
		if (left + $menu.width() > $(window).width()) left -= $menu.width();

		$menu.css({ top: top, left: left });

		setTimeout(() => {
			$(document).one('click', () => $menu.remove());
		}, 10);
	}

	updateTaskStatus(taskName, newStatus) {
		frappe.call({
			method: "project_enhancements.project_enhancements.page.project_dashboard.project_dashboard.update_task_status",
			args: { task_name: taskName, status: newStatus },
			callback: (r) => {
				if (r.message && r.message.status === "success") {
					this.fetchData();
				}
			}
		});
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
			case "Paid":
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

		const statusFilters = [];
		this.wrapper.find(".task-status-cb:checked").each(function () {
			statusFilters.push($(this).val());
		});

		// Deep copy tasks to avoid mutating state
		let filteredTasks = JSON.parse(JSON.stringify(this.tasks));

		const filterNode = (task) => {
			const nameMatch = !nameFilter || task.subject.toLowerCase().includes(nameFilter);
			const ownerMatch = !ownerFilter || (task.assigned_to || "").toLowerCase().includes(ownerFilter);
			const statusMatch = statusFilters.length === 0 || statusFilters.includes(task.status);
			
			task.is_direct_match = nameMatch && ownerMatch && statusMatch;

			if (task.children && task.children.length > 0) {
				task.children = task.children.map(filterNode).filter(Boolean);
			}
			
			const hasVisibleChildren = task.children && task.children.length > 0;

			if (task.is_direct_match || hasVisibleChildren) {
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
		this.wrapper.on("change", ".task-status-cb", () => {
			// Update the dropdown button text
			const checkedCount = me.wrapper.find(".task-status-cb:checked").length;
			const btn = me.wrapper.find("#statusFilterMenu");
			if (checkedCount === 0) {
				btn.text("Statuses");
			} else if (checkedCount === 1) {
				btn.text(me.wrapper.find(".task-status-cb:checked").first().val());
			} else {
				btn.text(`${checkedCount} selected`);
			}
			me.applyFilters();
		});
		this.wrapper.on("click", ".clear-filters-btn", () => {
			me.wrapper.find(".task-name-filter").val("");
			me.wrapper.find(".task-owner-filter").val("");
			me.wrapper.find(".task-status-cb").prop("checked", false);
			me.wrapper.find("#statusFilterMenu").text("Statuses");
			me.applyFilters();
		});

		// Toggle children (Updated for Lazy Loading)
		this.wrapper.on("click", ".toggle-child-tasks", function () {
			const $icon = $(this);
			const $taskNode = $icon.closest(".task-node");
			const taskId = $taskNode.data("task-id");
			const $childContainer = $taskNode.find(".child-tasks-container");
			const isLoaded = $taskNode.data("loaded");

			if ($icon.hasClass("fa-caret-down")) {
				// Collapsing
				$icon.removeClass("fa-caret-down").addClass("fa-caret-right");
				$childContainer.hide();
				me.collapsedTasks.add(taskId);
			} else {
				// Expanding
				$icon.removeClass("fa-caret-right").addClass("fa-caret-down");
				$childContainer.show();
				me.collapsedTasks.delete(taskId);

				if (!isLoaded || isLoaded === "false" || isLoaded === false) {
					// Extract level from padding to maintain indentation
					const padding = $taskNode.find('.task-grid-row:first .task-grid-cell:first div').css('padding-left') || '0px';
					const level = parseInt(padding.replace('px', '')) / 20;
					
					me.fetchChildren(taskId, $childContainer, level + 1);
					$taskNode.data("loaded", "true");
				}
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

		// Delete Task
		this.wrapper.on("click", ".delete-task-btn", function (e) {
			e.stopPropagation();
			const btn = $(this);
			const taskName = btn.data("task-name");
			const taskSubject = btn.data("task-subject");

			frappe.confirm(
				`Are you sure you want to delete task ${taskSubject}? This action cannot be undone.`,
				() => {
					frappe.call({
						method: "project_enhancements.project_enhancements.page.project_dashboard.project_dashboard.delete_task",
						args: { task_name: taskName },
						callback: (r) => {
							if (r.message && r.message.status === "success") {
								frappe.show_alert({ message: "Task deleted successfully.", indicator: "green" });

								// Remove from local array
								const removeTask = (tasksList, idToRemove) => {
									for (let i = 0; i < tasksList.length; i++) {
										if (tasksList[i].name === idToRemove) {
											tasksList.splice(i, 1);
											return true;
										}
										if (tasksList[i].children && tasksList[i].children.length > 0) {
											if (removeTask(tasksList[i].children, idToRemove)) {
												return true;
											}
										}
									}
									return false;
								};


								removeTask(me.tasks, taskName);

								// Clean up any pending changes
								if (me.pendingChanges && me.pendingChanges[taskName]) {
									delete me.pendingChanges[taskName];
								}

								// Re-render
								me.applyFilters();
							} else {
								frappe.show_alert({ message: r.message.message || "Failed to delete task.", indicator: "red" });
							}
						}
					});
				}
			);
		});

		// Column Toggle
		this.wrapper.on("change", ".column-toggle-cb", function (e) {
			const column = $(this).val();
			const isChecked = $(this).prop("checked");
			me.columnVisibility[column] = isChecked;
			localStorage.setItem(
				`taskTreeColumns_${frappe.session.user}`,
				JSON.stringify(me.columnVisibility)
			);

			if (isChecked) {
				me.wrapper
					.find(`.task-grid-cell[data-column="${column}"]`)
					.removeClass("hidden-column");
			} else {
				me.wrapper
					.find(`.task-grid-cell[data-column="${column}"]`)
					.addClass("hidden-column");
			}
		});

		// Prevent dropdown from closing when clicking inside
		this.wrapper.on("click", ".dropdown-menu", function (e) {
			e.stopPropagation();
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
		this.savePendingChanges();
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
