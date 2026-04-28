/* global project_enhancements, Gantt, moment */
frappe.provide("project_enhancements.dashboard_components");

project_enhancements.dashboard_components.PortfolioGantt = class PortfolioGantt {
	constructor(wrapper) {
		this.wrapper = $(wrapper);
		this.abortController = null;
		
		this.detailedView = false;
		this.statusFilters = ["Active", "Working", "Client Hold"]; 
		this.allStatuses = ["Active", "Working", "Client Hold", "Parked", "Completed", "Invoiced", "Paid", "Canceled"];
        
        this.selectedProjects = new Set();
        this.collapsedNodes = new Set();
        this.ganttDataCache = null;
        this.isTogglingNode = false;
	}

	async render() {
		this.wrapper.empty();
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
						<button class="btn btn-sm btn-white border custom-dropdown-toggle" type="button" id="ganttStatusDropdown" style="min-width: 200px; text-align: left;">
							Selected (${this.statusFilters.length})
						</button>
						<div class="dropdown-menu p-2 shadow-sm" style="min-width: 220px;">
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
                
                .gantt .bar-label { cursor: pointer; pointer-events: auto; transition: fill 0.2s; user-select: none; }
                .gantt .bar-label:hover { fill: #007bff !important; text-decoration: underline; }
                
                .check-dropdown .dropdown-menu.show { display: block !important; }
			`).appendTo('head');
		}

        this.wrapper.find('.custom-dropdown-toggle').on('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            let $menu = $(this).next('.dropdown-menu');
            let isShown = $menu.hasClass('show');
            $('.dropdown-menu').removeClass('show'); 
            if (!isShown) $menu.addClass('show');
        });

        $(document).on('click', (e) => {
            if (!$(e.target).closest('.check-dropdown').length) {
                this.wrapper.find('.dropdown-menu').removeClass('show');
            }
        });

		this.wrapper.find('#gantt-detailed-toggle').on('change', (e) => {
			this.detailedView = $(e.currentTarget).is(':checked');
            if (this.detailedView && this.ganttDataCache) {
                this.collapsedNodes.clear();
                this.ganttDataCache.projects.forEach(p => {
                    this.collapsedNodes.add('project_' + p.name);
                });
            }
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
			this.wrapper.find('.dropdown-menu').removeClass('show');
			
			this.chartContainer.empty();
			this.show_skeleton();
			this.fetch_and_render_data();
		});
		
		this.wrapper.find('.check-dropdown .dropdown-menu').on('click', function(e) {
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
                this.ganttDataCache = data.message;
				this.render_gantt();
			} else {
				throw new Error(data.message ? data.message.error : "Unknown error fetching projects for gantt");
			}
		} finally {
			this.abortController = null;
		}
	}

	render_gantt(preserve_scroll = false) {
		if (!this.ganttDataCache || !this.ganttDataCache.projects) return;

        let data = this.ganttDataCache;

		if (data.projects.length === 0) {
			this.chartContainer.html('<p class="text-muted text-center p-4">No active projects match the current filters.</p>');
			return;
		}

        let taskMap = {};
        let projectTaskRoots = {};
        if (this.detailedView && data.tasks) {
            data.tasks.forEach(t => { t.children = []; taskMap[t.name] = t; });
            data.tasks.forEach(t => {
                if (t.parent_task && taskMap[t.parent_task]) {
                    taskMap[t.parent_task].children.push(t);
                } else {
                    if (!projectTaskRoots[t.project]) projectTaskRoots[t.project] = [];
                    projectTaskRoots[t.project].push(t);
                }
            });
        }

		let mappedItems = [];
		let masterGroups = {};
		
		data.projects.forEach(p => {
			let master = p.custom_master_project || "Independent Projects";
			if (!masterGroups[master]) masterGroups[master] = [];
			masterGroups[master].push(p);
		});

        const getSafeDates = (startStr, endStr, fallbackStartStr = null) => {
            let start = startStr ? new Date(startStr) : (fallbackStartStr ? new Date(fallbackStartStr) : new Date());
            let end = endStr ? new Date(endStr) : new Date(start.getTime() + (3*24*60*60*1000));
            if (end < start) end = new Date(start.getTime() + (24*60*60*1000));
            return { start, end };
        };

		Object.keys(masterGroups).sort().forEach(master => {
			let projects = masterGroups[master];
            let is_independent = (master === "Independent Projects");
			let masterStart = null, masterEnd = null, totalProgress = 0;

			projects.forEach(p => {
                let d = getSafeDates(p.expected_start_date, p.expected_end_date);
				if (!masterStart || d.start < masterStart) masterStart = d.start;
				if (!masterEnd || d.end > masterEnd) masterEnd = d.end;
				totalProgress += (p.percent_complete || 0);
			});

			if (!masterStart) masterStart = new Date();
			if (!masterEnd || masterEnd < masterStart) {
				masterEnd = new Date(masterStart.getTime() + (24*60*60*1000));
			}

			let avgProgress = projects.length > 0 ? (totalProgress / projects.length) : 0;
            let master_id = 'master_' + master;
            let is_m_collapsed = this.collapsedNodes.has(master_id);

			if (!is_independent) {
                let m_prefix = projects.length > 0 ? (is_m_collapsed ? '▶ ' : '▼ ') : '';
                mappedItems.push({
                    id: master_id,
                    name: m_prefix + master.toUpperCase(),
                    start: moment(masterStart).format("YYYY-MM-DD"),
                    end: moment(masterEnd).format("YYYY-MM-DD"),
                    progress: avgProgress,
                    custom_class: 'gantt-master-project',
                    isMaster: true,
                    hasChildren: projects.length > 0
                });
            }

            if (!is_independent && is_m_collapsed) return;

			projects.forEach(p => {
				let pDates = getSafeDates(p.expected_start_date, p.expected_end_date);
                let p_id = 'project_' + p.name;
                let t_roots = projectTaskRoots[p.name] || [];
                let has_tasks = this.detailedView && t_roots.length > 0;
                let is_p_collapsed = this.collapsedNodes.has(p_id);
				
                let base_indent = is_independent ? '' : '  ';
                let p_prefix = base_indent + (has_tasks ? (is_p_collapsed ? '▶ ' : '▼ ') : (is_independent ? '' : '↳ '));

				mappedItems.push({
					id: p_id,
					name: p_prefix + (p.project_name || p.name),
					start: moment(pDates.start).format("YYYY-MM-DD"),
					end: moment(pDates.end).format("YYYY-MM-DD"),
					progress: p.percent_complete || 0,
					custom_class: 'gantt-project',
					custom_start_date: p.expected_start_date,
					isProject: true,
					project_docname: p.name,
                    hasChildren: has_tasks
				});

				if (!has_tasks || is_p_collapsed) return;

                const pushTasks = (tasks, indentLevel) => {
                    tasks.forEach(t => {
                        let tDates = getSafeDates(t.exp_start_date, t.exp_end_date, pDates.start);
                        let t_id = 'task_' + t.name;
                        let has_sub = t.children && t.children.length > 0;
                        let is_t_collapsed = this.collapsedNodes.has(t_id);

                        let baseIndent = is_independent ? '  ' : '    ';
                        for(let i=0; i<indentLevel; i++) baseIndent += '  ';
                        let t_prefix = has_sub ? (is_t_collapsed ? baseIndent + '▶ ' : baseIndent + '▼ ') : baseIndent + '• ';

                        mappedItems.push({
                            id: t_id,
                            name: t_prefix + (t.subject || t.name),
                            start: moment(tDates.start).format("YYYY-MM-DD"),
                            end: moment(tDates.end).format("YYYY-MM-DD"),
                            progress: t.progress || 0,
                            dependencies: indentLevel === 0 ? p_id : 'task_' + t.parent_task,
                            custom_class: 'gantt-task', 
                            custom_start_date: t.exp_start_date || p.expected_start_date,
                            isTask: true,
                            task_docname: t.name,
                            hasChildren: has_sub
                        });

                        if (has_sub && !is_t_collapsed) {
                            pushTasks(t.children, indentLevel + 1);
                        }
                    });
                };

                pushTasks(t_roots, 0);
			});
		});

        let scroll_left = 0, scroll_top = 0;
        if (preserve_scroll && this.chartContainer.find(".gantt-container").length) {
            scroll_left = this.chartContainer.find(".gantt-container")[0].scrollLeft;
            scroll_top = this.chartContainer.find(".gantt-container")[0].scrollTop;
        }

        let $chartWrapper = $('<div id="gantt-chart-target" style="width: 100%; height: 600px;"></div>');
        this.chartContainer.empty().append($chartWrapper);

		frappe.require([
			"/assets/project_enhancements/js/lib/frappe-gantt.umd.js"
		], () => {
			new Gantt($chartWrapper[0], mappedItems, {
				view_mode: "Month",
                auto_move_label: true,
				on_click: (item) => {
                    if (this.isTogglingNode) return;
					if (item.isProject) frappe.set_route("Form", "Project", item.project_docname);
					else if (item.isTask) frappe.set_route("Form", "Task", item.task_docname);
				},
				custom_popup_html: function (item) {
					if (item.isMaster) {
						return `<div class="gantt-popup" style="padding: 10px; background: white; border: 1px solid #ccc; border-radius: 4px;">
									<h5 class="mb-1">${item.name.replace(/[▼▶]/g, '').trim()}</h5>
									<p class="mb-0 text-muted"><strong>Overall Progress:</strong> ${Math.round(item.progress)}%</p>
								</div>`;
					}
					
					const startDate = frappe.datetime.str_to_user(item.custom_start_date);
					const endDate = frappe.datetime.str_to_user(item.end);
					const titlePrefix = item.isTask ? "Task" : "Project";
					const cleanName = item.name.replace(/[↳•▼▶]/g, '').trim();

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

            $chartWrapper.find('.gantt-container').off('click', '.bar-label').on('click', '.bar-label', (e) => {
                e.stopPropagation(); 
                this.isTogglingNode = true;
                setTimeout(() => this.isTogglingNode = false, 300); 
                
                let wrapper = $(e.currentTarget).closest('.bar-wrapper');
                let id = wrapper.attr('data-id');
                let item = mappedItems.find(i => i.id === id);
                
                if (item && item.hasChildren) {
                    if (this.collapsedNodes.has(id)) this.collapsedNodes.delete(id);
                    else this.collapsedNodes.add(id);
                    this.render_gantt(true); 
                }
            });

			setTimeout(() => {
                const real_container = $chartWrapper.find(".gantt-container")[0];
                if (!real_container) return;
                
                if (preserve_scroll) {
                    real_container.scrollTo({ left: scroll_left, top: scroll_top, behavior: "auto" });
                } else {
                    const today_el = real_container.querySelector(".today-highlight");
                    if (today_el) {
                        const container_width = real_container.clientWidth;
                        const element_left_relative = today_el.getBoundingClientRect().left - real_container.getBoundingClientRect().left;
                        const scroll_to_position = real_container.scrollLeft + element_left_relative - container_width / 2;
                        real_container.scrollTo({ left: scroll_to_position, behavior: "smooth" });
                    }
                }
            }, 50); 
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