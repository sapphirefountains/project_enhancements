/* global project_enhancements */
frappe.provide("project_enhancements.dashboard_components");

project_enhancements.dashboard_components.PortfolioGantt = class PortfolioGantt {
	constructor(wrapper) {
		this.wrapper = $(wrapper);
		this.abortController = null;
	}

	async render() {
		this.wrapper.empty();
		this.show_skeleton();

		try {
			// Assets are now centralized in hooks.py
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
					method: "project_enhancements.project_enhancements.page.project_dashboard.project_dashboard.get_all_projects_for_gantt",
				},
				signal
			);

			if (signal.aborted) return;

			if (projects.message && !projects.message.error) {
				this.render_gantt(projects.message);
			} else {
				throw new Error(
					projects.message
						? projects.message.error
						: "Unknown error fetching projects for gantt"
				);
			}
		} finally {
			this.abortController = null;
		}
	}

	render_gantt(projects) {
		this.wrapper.empty();

		if (!projects || projects.length === 0) {
			this.wrapper.html(
				'<p class="text-muted text-center p-4">No active projects with start dates were found to display in the Gantt chart.</p>'
			);
			return;
		}

		const gantt_container = $(
			'<div class="gantt-container" style="overflow-x: auto; overflow-y: auto;"></div>'
		).appendTo(this.wrapper);

		// Prevent horizontal scroll when only vertical scrolling is intended
		gantt_container.on("wheel", function (e) {
			if (e.originalEvent.deltaY !== 0 && !e.originalEvent.shiftKey) {
				e.stopPropagation();
			}
		});

		const today = new Date();
		today.setHours(0, 0, 0, 0);

		const mappedProjects = projects.map((project) => {
			const startDate = new Date(project.start);
			const helperStartDate = startDate < today ? today : startDate;

			return {
				...project,
				start: moment(helperStartDate).format("YYYY-MM-DD"),
				custom_start_date: project.start,
			};
		});

		new Gantt(gantt_container[0], mappedProjects, {
			view_mode: "Month",
			on_click: (project) => {
				frappe.set_route("List", "Task", "Gantt", { project: project.id });
			},
			custom_popup_html: function (project) {
				const startDate = frappe.datetime.str_to_user(project.custom_start_date);
				const endDate = frappe.datetime.str_to_user(project.end);
				return `
                    <div class="gantt-popup" style="padding: 10px; background: white; border: 1px solid #ccc; border-radius: 4px; z-index: 1000; position: absolute;">
                        <h4 style="margin: 0 0 5px 0;">${project.name}</h4>
                        <p style="margin: 0;"><strong>Start:</strong> ${startDate}</p>
                        <p style="margin: 0;"><strong>End:</strong> ${endDate}</p>
                        <p style="margin: 0;"><strong>Progress:</strong> ${project.progress}%</p>
                    </div>
                `;
			},
		});
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
			console.log("Portfolio Gantt request aborted due to context switch.");
			return;
		}

		console.error("Portfolio Gantt Error:", error);

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
