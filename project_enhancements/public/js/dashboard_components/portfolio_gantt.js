/* global project_enhancements, Gantt, moment */
frappe.provide("project_enhancements.dashboard_components");

project_enhancements.dashboard_components.PortfolioGantt = class PortfolioGantt {
	constructor(wrapper) {
		this.wrapper = $(wrapper);
		this.abortController = null;
		
		// Setup State variables for Detailed View and Status Filters
		this.detailedView = false;
		this.statusFilters = ["Active", "Working", "Client Hold"]; 
		this.allStatuses = ["Active", "Working", "Client Hold", "Parked", "Completed", "Invoiced", "Paid", "Canceled"];
	}

	async render() {
		this.wrapper.empty();
		
		// Render custom controls on top
		this.render_controls();
		
		this.chartContainer = $('<div class="portfolio-gantt-chart-area mt-3"></div>').appendTo(this.wrapper);
		this.show_skeleton();

		try {
			await this.fetch_and_render_data();
		} catch (error) {
			this.handle_error(error);
		}
	}

	render_controls() {
		const controlsHTML = `
			<div class="gantt-controls-wrapper d-flex align-items-center mb-3 p-3 bg-light rounded border flex-wrap">
				<div class="custom-control custom-switch mr-4" style="font-size: 1.1em;">
					<input type="checkbox" class="custom-control-input" id="gantt-detailed-toggle" ${this.detailedView ? 'checked' : ''}>
					<label class="custom-control-label font-weight-bold" for="gantt-detailed-toggle" style="cursor: pointer;">Detailed View (Show Tasks)</label>
				</div>
				<div class="d-flex align-items-center ml-4">
					<label class="mr-2 mb-0 font-weight-bold">Status Filter:</label>
					<div class="dropdown check-dropdown">
						<button class="btn btn-sm btn-white border dropdown-toggle" type="button" id="ganttStatusDropdown" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false" style="min-width: 200px; text-align: left;">
							Selected (${this.statusFilters.length})
						</button>
						<div class="dropdown-menu p-2 shadow-sm" aria-labelledby="ganttStatusDropdown" id="gantt-status-menu" style="min-width: 220px;">
							<div id="gantt-status-checkboxes">
								${this.allStatuses.map(s => `
									<div class="form-check mb-1 custom-control custom-checkbox">
										<input class="form-check-input custom-control-input gantt-status-cb" type="checkbox" value="${s}" id="filter-gantt-${s.replace(/\s+/g, '')}" ${this.statusFilters.includes(s) ? 'checked' : ''}>
										<label class="custom-control-label form-check-label" for="filter-gantt-${s.replace(/\s+/g, '')}">${s}</label>
									</div>
								`).join('')}
							</div>
							<div class="dropdown-divider"></div>
							<button class="btn btn-sm btn-primary w-100" id="apply-gantt-filters">Apply Filters</button>
						</div>
					</div>
				</div>
			</div>
		`;
		
		this.wrapper.append(controlsHTML);

		// Enhancement 1: Color Differentiation CSS Injection (Single Classes)
		if (!document.getElementById('portfolio-gantt-styles')) {
			$('<style id="portfolio-gantt-styles">').html(`
				.gantt .gantt-master-project .bar { fill: #34495e !important; }
				.gantt .gantt-master-project .bar-progress { fill: #2c3e50 !important; }
				.gantt .gantt-master-project .bar-label { font-weight: bold; fill: #fff; }
				
				.gantt .gantt-project .bar { fill: #3498db !important; }
				.gantt .gantt-project .bar-progress { fill: #2980b9 !important; }
				.gantt .gantt-project .bar-label { font-weight: bold; fill: #fff; }
				
				.gantt .gantt-task .bar { fill: #95a5a6 !important; height: 14px; transform: translateY(3px); }
				.gantt .gantt-task .bar-progress { fill: #7f8c8d !important; height: 14px; transform: translateY(3px); }
				.gantt .gantt-task .bar-label { font-size: 11px; fill: #333; }
			`).appendTo('head');
		}

		// Event Listeners for Filters
		this.wrapper.find('#gantt-detailed-toggle').on('change', (e) => {
			this.detailedView = $(e.currentTarget).is(':checked');
			this.chartContainer.empty();
			this.show_skeleton();
			this.fetch_and_render_data();
		});

		this.wrapper.find('#apply-gantt-filters').on('click', () => {
			const selected = [];
			this.wrapper.find('.gantt-status-cb:checked').each(function() {
				selected.push($(this).val());
			});
			this.statusFilters = selected;
			this.wrapper.find('#ganttStatusDropdown').text(`Selected (${selected.length})`);
			this.wrapper.find('#ganttStatusDropdown').dropdown('toggle');
			
			this.chartContainer.empty();
			this.show_skeleton();
			this.fetch_and_render_data();
		});
		
		// Prevent dropdown from closing when selecting checkboxes
		this.wrapper.find('#gantt-status-menu').on('click', function(e) {
			e.stopPropagation();
		});
	}

	async fetch_and_render_data() {
		this.abortController = new AbortController();
		const signal = this.abortController.signal;

		try {
			const data = await project_enhancements.dashboard_api.call(
				{
					method: "project_enhancements.project_enhancements.page.project_dashboard.project_dashboard.get_all_projects_for_gantt",
					args: {
						include_tasks: this.detailedView ? 1 : 0,
						statuses: JSON.stringify(this.statusFilters)
					}
				},
				signal
			);

			if (signal.aborted) return;

			if (data.message && !data.message.error) {
				this.render_gantt(data.message);
			} else {
				throw new Error(data.message ? data.message.error : "Unknown error fetching projects for gantt");
			}
		} finally {
			this.abortController = null;
		}
	}

	render_gantt(data) {
		this.chartContainer.empty();

		if (!data.projects || data.projects.length === 0) {
			this.chartContainer.html('<p class="text-muted text-center p-4">No active projects match the current filters.</p>');
			return;
		}

		const gantt_container = $('<div class="gantt-container gantt-scroll-wrapper" style="overflow-x: auto; overflow-y: auto;"></div>').appendTo(this.chartContainer);

		gantt_container.on("wheel", function (e) {
			if (e.originalEvent.deltaY !== 0 && !e.originalEvent.shiftKey) e.stopPropagation();
		});

		const today = new Date();
		today.setHours(0, 0, 0, 0);

		let mappedItems = [];
		let masterGroups = {};
		
		// Enhancement 4: Master Project Grouping Logic
		data.projects.forEach(p => {
			let master = p.custom_master_project || "Independent Projects";
			if (!masterGroups[master]) masterGroups[master] = [];
			masterGroups[master].push(p);
		});

		// Flatten the tree into the flat list Frappe Gantt expects
		Object.keys(masterGroups).sort().forEach(master => {
			let projects = masterGroups[master];
			let masterStart = null;
			let masterEnd = null;
			let totalProgress = 0;

			projects.forEach(p => {
				let pStart = new Date(p.expected_start_date);
				let pEnd = p.expected_end_date ? new Date(p.expected_end_date) : new Date(pStart.getTime() + (3*24*60*60*1000));
				
				if (!masterStart || pStart < masterStart) masterStart = pStart;
				if (!masterEnd || pEnd > masterEnd) masterEnd = pEnd;
				totalProgress += (p.percent_complete || 0);
			});

			if (!masterStart) masterStart = new Date();
			if (!masterEnd || masterEnd < masterStart) {
				masterEnd = new Date(masterStart.getTime() + (24*60*60*1000));
			}

			let avgProgress = projects.length > 0 ? (totalProgress / projects.length) : 0;

			// Inject Master Project Header Bar
			mappedItems.push({
				id: 'master_' + frappe.utils.get_random(5),
				name: master.toUpperCase(),
				start: moment(masterStart).format("YYYY-MM-DD"),
				end: moment(masterEnd).format("YYYY-MM-DD"),
				progress: avgProgress,
				custom_class: 'gantt-master-project',
				isMaster: true
			});

			// Inject Project Bars
			projects.forEach(p => {
				let pStart = new Date(p.expected_start_date);
				let pEnd = p.expected_end_date ? new Date(p.expected_end_date) : new Date(pStart.getTime() + (3*24*60*60*1000));
				
				if (pEnd < pStart) pEnd = new Date(pStart.getTime() + (24*60*60*1000));
				
				mappedItems.push({
					id: 'project_' + p.name,
					name: '  ↳ ' + (p.project_name || p.name),
					start: moment(pStart).format("YYYY-MM-DD"),
					end: moment(pEnd).format("YYYY-MM-DD"),
					progress: p.percent_complete || 0,
					custom_class: 'gantt-project',
					custom_start_date: p.expected_start_date,
					isProject: true,
					project_docname: p.name
				});

				// Inject Task Bars (Detailed View)
				if (this.detailedView && data.tasks) {
					let tasks = data.tasks.filter(t => t.project === p.name);
					tasks.forEach(t => {
						let tStart = t.exp_start_date ? new Date(t.exp_start_date) : new Date(pStart);
						let tEnd = t.exp_end_date ? new Date(t.exp_end_date) : new Date(tStart.getTime() + (3*24*60*60*1000));
						
						if (tEnd < tStart) tEnd = new Date(tStart.getTime() + (24*60*60*1000));

						mappedItems.push({
							id: 'task_' + t.name,
							name: '      • ' + (t.subject || t.name),
							start: moment(tStart).format("YYYY-MM-DD"),
							end: moment(tEnd).format("YYYY-MM-DD"),
							progress: t.progress || 0,
							dependencies: 'project_' + p.name, // Visually links task downward from its project
							custom_class: 'gantt-task',
							custom_start_date: t.exp_start_date || p.expected_start_date,
							isTask: true,
							task_docname: t.name
						});
					});
				}
			});
		});

		// Use absolute paths to guarantee standard Frappe app loading doesn't 404
		frappe.require([
			"/assets/project_enhancements/css/frappe-gantt.css", 
			"/assets/project_enhancements/js/lib/frappe-gantt.umd.js"
		], () => {
			new Gantt(gantt_container[0], mappedItems, {
				view_mode: "Month",
				on_click: (item) => {
					if (item.isProject) frappe.set_route("Form", "Project", item.project_docname);
					else if (item.isTask) frappe.set_route("Form", "Task", item.task_docname);
				},
				custom_popup_html: function (item) {
					if (item.isMaster) {
						return `<div class="gantt-popup" style="padding: 10px; background: white; border: 1px solid #ccc; border-radius: 4px;">
									<h5 class="mb-1">${item.name}</h5>
									<p class="mb-0 text-muted"><strong>Overall Progress:</strong> ${Math.round(item.progress)}%</p>
								</div>`;
					}
					
					const startDate = frappe.datetime.str_to_user(item.custom_start_date);
					const endDate = frappe.datetime.str_to_user(item.end);
					const titlePrefix = item.isTask ? "Task" : "Project";
					const cleanName = item.name.replace(/[↳•]/g, '').trim();

					return `
						<div class="gantt-popup" style="padding: 12px; background: white; border: 1px solid #e2e8f0; border-radius: 6px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); z-index: 1000; position: absolute; min-width: 200px;">
							<h6 style="margin: 0 0 8px 0; color: #333;">${titlePrefix}: ${cleanName}</h6>
							<p style="margin: 0 0 4px 0; font-size: 12px;"><strong>Start:</strong> ${startDate}</p>
							<p style="margin: 0 0 4px 0; font-size: 12px;"><strong>End:</strong> ${endDate}</p>
							<p style="margin: 0; font-size: 12px;"><strong>Progress:</strong> ${Math.round(item.progress)}%</p>
						</div>
					`;
				}
			});

			// Enhancement 2: Auto-Centering logic
			setTimeout(() => {
				const today_el = gantt_container[0].querySelector(".today-highlight");
				if (today_el) {
					const scroll_container = gantt_container[0];
					const container_width = scroll_container.clientWidth;
					const element_rect = today_el.getBoundingClientRect();
					const container_rect = scroll_container.getBoundingClientRect();

					const element_left_relative = element_rect.left - container_rect.left;
					const element_width = element_rect.width;

					const scroll_to_position = scroll_container.scrollLeft + element_left_relative - container_width / 2 + element_width / 2;

					scroll_container.scrollTo({ left: scroll_to_position, behavior: "smooth" });
				}
			}, 600);
		});
	}

	show_skeleton() {
		if (this.chartContainer) {
			this.chartContainer.html(`
				<div class="skeleton-list p-4">
					<div class="skeleton-line" style="width: 100%; height: 20px; margin-bottom: 10px;"></div>
					<div class="skeleton-line" style="width: 100%; height: 20px; margin-bottom: 10px;"></div>
					<div class="skeleton-line" style="width: 100%; height: 20px; margin-bottom: 10px;"></div>
					<div class="skeleton-line" style="width: 100%; height: 20px;"></div>
				</div>
			`);
		}
	}

	handle_error(error) {
		if (error.name === "CancellationError") return;

		console.error("Portfolio Gantt Error:", error);

		this.wrapper.html(`
			<div class="alert alert-danger p-4 text-center">
				<h4><i class="fa fa-exclamation-triangle mr-2"></i> Failed to Load Data</h4>
				<p>${error.message || "An unexpected error occurred."}</p>
				<button class="btn btn-primary btn-sm mt-3 retry-btn">Retry</button>
			</div>
		`);

		this.wrapper.find(".retry-btn").on("click", () => this.render());
	}

	unmount() {
		if (this.abortController) this.abortController.abort();
		this.wrapper.empty();
	}
};