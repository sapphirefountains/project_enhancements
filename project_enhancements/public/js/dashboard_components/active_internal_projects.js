/* global project_enhancements */
frappe.provide("project_enhancements.dashboard_components");

project_enhancements.dashboard_components.ActiveInternalProjects = class ActiveInternalProjects {
	constructor(wrapper) {
		this.wrapper = $(wrapper);
		this.abortController = null;
	}

	async render() {
		this.wrapper.empty();
		this.show_skeleton();

		try {
			await this.fetch_and_render_data();
		} catch (error) {
			this.handle_error(error);
		}
	}

	async fetch_and_render_data() {
		this.abortController = new AbortController();
		const signal = this.abortController.signal;

		try {
			const projects = await project_enhancements.dashboard_api.call(
				{
					method: "project_enhancements.project_enhancements.page.project_dashboard.project_dashboard.get_project_data",
				},
				signal
			);

			if (signal.aborted) return;

			if (projects.message && !projects.message.error) {
				const allowedTypes = [
					"Group Projects",
					"Internal",
					"Organizational Projects",
					"Other",
				];
				const filteredProjects = projects.message.filter(
					(p) => p.is_active === "Yes" && allowedTypes.includes(p.project_type)
				);

				this.render_list_view(filteredProjects);
			} else {
				throw new Error(
					projects.message ? projects.message.error : "Unknown error fetching projects"
				);
			}
		} finally {
			this.abortController = null;
		}
	}

	render_list_view(projects) {
		this.wrapper.empty();

		if (!projects || projects.length === 0) {
			this.wrapper.html(
				'<p class="text-muted text-center p-4">No active internal projects found.</p>'
			);
			return;
		}

		const listContainer = $('<div class="frappe-list"></div>').appendTo(this.wrapper);

		const table = $(`
            <table class="table table-bordered table-hover">
                <thead class="thead-light">
                    <tr>
                        <th>Project Name</th>
                        <th>Status</th>
                        <th>Priority</th>
                        <th>% Complete</th>
                        <th>Assigned To</th>
                    </tr>
                </thead>
                <tbody></tbody>
            </table>
        `).appendTo(listContainer);

		const tbody = table.find("tbody");
		const statusOptions = [
			"Active",
			"Client Hold",
			"Parked",
			"Completed",
			"Invoiced",
			"Paid",
			"Canceled",
		];
		const priorityOptions = ["High", "Medium", "Low"];

		projects.forEach((p) => {
			const statusSelect = statusOptions
				.map(
					(s) => `<option value="${s}" ${p.status === s ? "selected" : ""}>${s}</option>`
				)
				.join("");
			const prioritySelect = priorityOptions
				.map(
					(pr) =>
						`<option value="${pr}" ${
							p.custom_project_priority === pr ? "selected" : ""
						}>${pr}</option>`
				)
				.join("");

			const row = $(`
                <tr data-project="${p.name}">
                    <td><a href="/app/project/${p.name}" class="font-weight-bold">${
				p.project_name
			}</a></td>
                    <td><select class="form-control form-control-sm project-edit" data-field="status">${statusSelect}</select></td>
                    <td><select class="form-control form-control-sm project-edit" data-field="custom_project_priority">${prioritySelect}</select></td>
                    <td>
                        <div class="progress" style="height: 10px; border-radius: 4px;">
                            <div class="progress-bar bg-primary" role="progressbar" style="width: ${
								p.percent_complete || 0
							}%" aria-valuenow="${
				p.percent_complete || 0
			}" aria-valuemin="0" aria-valuemax="100"></div>
                        </div>
                    </td>
                    <td class="text-muted">${p.project_user || "Unassigned"}</td>
                </tr>
            `);

			// Attach all project data to the row for dynamic filtering
			Object.keys(p).forEach((key) => {
				row.attr(`data-${key}`, p[key]);
			});

			tbody.append(row);
		});

		// Trigger global event on edit
		this.wrapper.find(".project-edit").on("change", (e) => {
			const el = $(e.target);
			const project = el.closest("tr").data("project");
			const field = el.data("field");
			const val = el.val();

			// Dispatch a custom event to the document so the main controller can pick it up
			$(document).trigger("dashboard_project_change", {
				project: project,
				field: field,
				value: val,
			});
		});
	}

	get_status_badge(status) {
		switch (status) {
			case "Active":
				return "badge-primary";
			case "Completed":
				return "badge-success";
			case "Paid":
				return "badge-success";
			case "Overdue":
				return "badge-danger";
			case "Cancelled":
			case "Canceled":
				return "badge-danger";
			case "Working":
				return "badge-warning";
			case "Client Hold":
			case "Parked":
				return "badge-warning";
			case "Invoiced":
				return "badge-info";
			default:
				return "badge-secondary";
		}
	}

	show_skeleton() {
		this.wrapper.html(`
            <div class="skeleton-list p-4">
                <div class="skeleton-line" style="width: 100%; height: 20px; margin-bottom: 10px;"></div>
                <div class="skeleton-line" style="width: 100%; height: 20px; margin-bottom: 10px;"></div>
                <div class="skeleton-line" style="width: 100%; height: 20px; margin-bottom: 10px;"></div>
                <div class="skeleton-line" style="width: 100%; height: 20px;"></div>
            </div>
        `);
	}

	handle_error(error) {
		if (error.name === "CancellationError") {
			console.log("Active Internal Projects request aborted due to context switch.");
			return;
		}

		console.error("Active Internal Projects Error:", error);

		this.wrapper.html(`
            <div class="alert alert-danger p-4 text-center">
                <h4><i class="fa fa-exclamation-triangle mr-2"></i> Failed to Load Data</h4>
                <p>${error.message || "An unexpected error occurred."}</p>
                <button class="btn btn-primary btn-sm mt-3 retry-btn">Retry</button>
            </div>
        `);

		this.wrapper.find(".retry-btn").on("click", () => {
			this.render();
		});
	}

	unmount() {
		if (this.abortController) {
			this.abortController.abort();
		}
		this.wrapper.empty();
	}
};
