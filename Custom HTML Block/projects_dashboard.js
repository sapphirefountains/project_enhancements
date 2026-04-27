(function() {
    const $root = $(root_element);

    let current_tab = "priority-overview";
    let project_data = []; 
    let priority_options = { project_priority: [], company_priority: [] };
    let status_options = [];

    // Gantt State tracking
    let gantt_detailed_view = false;
    let gantt_status_filters = ["Active", "Working", "Client Hold"]; 
    const all_gantt_statuses = ["Active", "Working", "Client Hold", "Parked", "Completed", "Invoiced", "Paid", "Canceled"];

    let sort_state = {
        'priority-overview': { col: 'company_priority', order: 'asc' },
        'active-internal-projects': { col: 'project_name', order: 'asc' },
        'completed-projects': { col: 'project_name', order: 'asc' }
    };

    const api_call = (method, args = {}) => {
        return new Promise((resolve, reject) => {
            frappe.call({
                method: `project_enhancements.project_enhancements.page.project_dashboard.project_dashboard.${method}`,
                args: args,
                callback: (r) => resolve(r),
                error: (r) => reject(r)
            });
        });
    };

    function show_skeleton() {
        $root.find('#dashboard-content').html(`
            <div class="skeleton-list p-4">
                <div class="skeleton-line" style="width: 100%; height: 20px; margin-bottom: 10px;"></div>
                <div class="skeleton-line" style="width: 100%; height: 20px; margin-bottom: 10px;"></div>
                <div class="skeleton-line" style="width: 100%; height: 20px; margin-bottom: 10px;"></div>
                <div class="skeleton-line" style="width: 100%; height: 20px;"></div>
            </div>
        `);
    }

    async function fetch_initial_data() {
        show_skeleton();
        init_gantt_filters();

        try {
            const [projectsRes, priorityRes, statusRes] = await Promise.all([
                api_call('get_project_data'),
                api_call('get_priority_options'),
                api_call('get_status_options')
            ]);
            
            if (priorityRes.message && !priorityRes.message.error) {
                priority_options = priorityRes.message;
            }
            if (statusRes.message && !statusRes.message.error) {
                status_options = statusRes.message;
            }
            if (projectsRes.message && !projectsRes.message.error) {
                project_data = projectsRes.message;
                render_current_tab();
            } else {
                $root.find('#dashboard-content').html('<div class="alert alert-danger">Error loading projects.</div>');
            }
        } catch (err) {
            $root.find('#dashboard-content').html('<div class="alert alert-danger">Network Error.</div>');
        }
    }

    // ----- GANTT CHART LOGIC -----
    
    function init_gantt_filters() {
        const pillContainer = $root.find('#gantt-status-pills');
        pillContainer.empty();
        
        all_gantt_statuses.forEach(s => {
            let isActive = gantt_status_filters.includes(s);
            let btnClass = isActive ? "btn-primary" : "btn-default";
            pillContainer.append(`
                <button type="button" class="btn btn-sm ${btnClass} gantt-filter-pill" data-status="${s}">
                    ${s}
                </button>
            `);
        });

        // Checkbox detailed view toggle
        $root.find('#gantt-detailed-view').on('change', function() {
            gantt_detailed_view = $(this).is(':checked');
            render_portfolio_gantt();
        });

        // Pill click logic
        $root.find('.gantt-filter-pill').on('click', function() {
            let $btn = $(this);
            let status = $btn.data('status');
            
            if ($btn.hasClass('btn-primary')) {
                // Turn off
                $btn.removeClass('btn-primary').addClass('btn-default');
                gantt_status_filters = gantt_status_filters.filter(f => f !== status);
            } else {
                // Turn on
                $btn.removeClass('btn-default').addClass('btn-primary');
                if (!gantt_status_filters.includes(status)) {
                    gantt_status_filters.push(status);
                }
            }
            render_portfolio_gantt();
        });
    }

    async function render_portfolio_gantt() {
        let container = $root.find('#dashboard-content');
        container.empty().html('<p class="text-muted text-center p-4"><i class="fa fa-spinner fa-spin mr-2"></i>Loading Gantt Chart...</p>');

        try {
            const res = await api_call('get_all_projects_for_gantt', { 
                include_tasks: gantt_detailed_view ? 1 : 0, 
                statuses: JSON.stringify(gantt_status_filters) 
            });

            if (!res.message || res.message.error || res.message.projects.length === 0) {
                container.html('<div class="alert alert-info">No projects match the current filters.</div>');
                return;
            }

            const data = res.message;
            let mappedItems = [];
            let masterGroups = {};

            // Group by Master Project
            data.projects.forEach(p => {
                let master = p.custom_master_project || "Independent Projects";
                if (!masterGroups[master]) masterGroups[master] = [];
                masterGroups[master].push(p);
            });

            // Flatten into Frappe Gantt array
            Object.keys(masterGroups).sort().forEach(master => {
                let projects = masterGroups[master];
                let masterStart = null;
                let masterEnd = null;
                let totalProgress = 0;

                projects.forEach(p => {
                    let pStart = p.expected_start_date ? new Date(p.expected_start_date) : new Date();
                    let pEnd = p.expected_end_date ? new Date(p.expected_end_date) : new Date(pStart.getTime() + (3*24*60*60*1000));
                    
                    if (pEnd < pStart) {
                        pEnd = new Date(pStart.getTime() + (24*60*60*1000));
                    }
                    
                    if (!masterStart || pStart < masterStart) masterStart = pStart;
                    if (!masterEnd || pEnd > masterEnd) masterEnd = pEnd;
                    totalProgress += (p.percent_complete || 0);
                });

                if (!masterStart) masterStart = new Date();
                if (!masterEnd || masterEnd < masterStart) {
                    masterEnd = new Date(masterStart.getTime() + (24*60*60*1000));
                }

                let avgProgress = projects.length > 0 ? (totalProgress / projects.length) : 0;

                // Push Master Item
                mappedItems.push({
                    id: 'master_' + frappe.utils.get_random(5),
                    name: master.toUpperCase(),
                    start: moment(masterStart).format("YYYY-MM-DD"),
                    end: moment(masterEnd).format("YYYY-MM-DD"),
                    progress: avgProgress,
                    custom_class: 'gantt-master-project', // SINGLE CLASS! No spaces.
                    isMaster: true
                });

                // Push Child Projects
                projects.forEach(p => {
                    let pStart = p.expected_start_date ? new Date(p.expected_start_date) : new Date();
                    let pEnd = p.expected_end_date ? new Date(p.expected_end_date) : new Date(pStart.getTime() + (3*24*60*60*1000));
                    
                    if (pEnd < pStart) {
                        pEnd = new Date(pStart.getTime() + (24*60*60*1000));
                    }

                    mappedItems.push({
                        id: 'project_' + p.name,
                        name: '  ↳ ' + (p.project_name || p.name),
                        start: moment(pStart).format("YYYY-MM-DD"),
                        end: moment(pEnd).format("YYYY-MM-DD"),
                        progress: p.percent_complete || 0,
                        custom_class: 'gantt-project', // SINGLE CLASS! No spaces.
                        custom_start_date: p.expected_start_date,
                        isProject: true,
                        project_docname: p.name
                    });

                    // Push Grandchild Tasks (if toggled)
                    if (gantt_detailed_view && data.tasks) {
                        let tasks = data.tasks.filter(t => t.project === p.name);
                        tasks.forEach(t => {
                            let tStart = t.exp_start_date ? new Date(t.exp_start_date) : new Date(pStart);
                            let tEnd = t.exp_end_date ? new Date(t.exp_end_date) : new Date(tStart.getTime() + (3*24*60*60*1000));
                            
                            if (tEnd < tStart) {
                                tEnd = new Date(tStart.getTime() + (24*60*60*1000));
                            }

                            mappedItems.push({
                                id: 'task_' + t.name,
                                name: '      • ' + (t.subject || t.name),
                                start: moment(tStart).format("YYYY-MM-DD"),
                                end: moment(tEnd).format("YYYY-MM-DD"),
                                progress: t.progress || 0,
                                dependencies: 'project_' + p.name,
                                custom_class: 'gantt-task', // SINGLE CLASS! No spaces.
                                custom_start_date: t.exp_start_date || p.expected_start_date,
                                isTask: true,
                                task_docname: t.name
                            });
                        });
                    }
                });
            });

            container.empty().append('<div class="gantt-container gantt-scroll-wrapper" style="overflow-x: auto; overflow-y: auto;"></div>');
            const gantt_container = container.find('.gantt-container');

            gantt_container.on("wheel", function (e) {
                if (e.originalEvent.deltaY !== 0 && !e.originalEvent.shiftKey) e.stopPropagation();
            });

            // Verify Gantt library exists (Hooks.py should load this globally)
            if (typeof Gantt === 'undefined') {
                container.html('<div class="alert alert-danger">Gantt library is missing. Please clear site cache and reload.</div>');
                return;
            }

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

            // Auto Centering the Gantt chart
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
            }, 300);

        } catch (err) {
            console.error(err);
            container.html('<div class="alert alert-danger">An error occurred while generating the Gantt chart.</div>');
        }
    }

    // ----- HELPERS & OTHER RENDERERS -----

    function get_priority_weight(priority) {
        if (!priority) return 100; 
        let p = String(priority).trim();
        if (p.toLowerCase() === "not assigned") return 100;
        if (p.toLowerCase() === "repair visit") return 101;
        if (p.toLowerCase() === "maintenance") return 102;
        let num = parseInt(p, 10);
        if (!isNaN(num)) return num; 
        return 200; 
    }

    function get_priority_badge(priority) {
        if (!priority) return '<span class="badge badge-secondary">Not Assigned</span>';
        let p = String(priority).trim();
        if (p.toLowerCase() === "not assigned") return '<span class="badge badge-secondary">Not Assigned</span>';
        if (p.toLowerCase() === "repair visit") return '<span class="badge" style="background-color: #6f42c1; color: white;">Repair Visit</span>';
        if (p.toLowerCase() === "maintenance") return '<span class="badge" style="background-color: #007bff; color: white;">Maintenance</span>';
        
        let num = parseInt(p, 10);
        if (!isNaN(num)) {
            let hue = ((Math.max(1, Math.min(30, num)) - 1) / 29) * 120;
            return `<span class="badge" style="background-color: hsl(${hue}, 100%, 45%); color: white;">${frappe.utils.escape_html(p)}</span>`;
        }
        return `<span class="badge badge-secondary">${frappe.utils.escape_html(p)}</span>`;
    }

    function build_editable_priority_cell(project_name, field, current_val, options_array) {
        let opts_html = '<option value="">Not Assigned</option>' + 
            options_array.map(opt => `<option value="${opt}" ${opt === current_val ? 'selected' : ''}>${opt}</option>`).join('');
        
        return `
            <td class="editable-priority" data-project="${project_name}" data-field="${field}" style="min-width: 140px;">
                <div class="static-view" style="cursor: pointer;" title="Click to edit">
                    ${get_priority_badge(current_val)}
                </div>
                <select class="form-control form-control-sm edit-view" style="display: none;">
                    ${opts_html}
                </select>
            </td>
        `;
    }

    async function auto_save_field(project_name, field, value, cell_element) {
        cell_element.css({'opacity': '0.5', 'pointer-events': 'none'});
        try {
            let res = await api_call('update_project_details', { project_name: project_name, field: field, value: value });
            if (res.message && res.message.status === 'success') {
                frappe.show_alert({message: 'Changes Saved', indicator: 'green'});
                let p = project_data.find(proj => proj.name === project_name);
                if(p) p[field] = value;
            } else {
                throw new Error(res.message.message || "Failed to save");
            }
        } catch (e) {
            frappe.show_alert({message: e.message || 'Network error while saving', indicator: 'red'});
            render_current_tab(); 
        } finally {
            cell_element.css({'opacity': '', 'pointer-events': ''});
        }
    }

    function th(col_name, label, title="") {
        let state = sort_state[current_tab];
        let cls = "sortable-header";
        if (state && state.col === col_name) {
            cls += " active-sort sort-" + state.order;
        }
        return `<th class="${cls}" data-sort="${col_name}" title="${title}" style="min-width: 130px; white-space: nowrap;">${label}</th>`;
    }

    function bind_sortable_headers(table) {
        table.find('.sortable-header').on('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            
            let sort_col = $(this).attr('data-sort');
            let state = sort_state[current_tab];
            
            if (state.col === sort_col) {
                state.order = state.order === 'asc' ? 'desc' : 'asc';
            } else {
                state.col = sort_col;
                state.order = 'asc';
            }
            
            render_current_tab();
        });
    }

    function build_priority_table(projects) {
        let wrapper = $('<div class="table-responsive mb-4"></div>');
        let table = $(`
            <table class="table table-bordered mb-0">
                <thead class="thead-light">
                    <tr>
                        ${th('project_name', 'Project Name')}
                        ${th('company_priority', 'Company Priority')}
                        ${th('project_priority', 'Project Priority', 'Groups by Value Stream')}
                        ${th('percent_complete', 'Completion')}
                        ${th('budget_health', 'Budget Health')}
                    </tr>
                </thead>
                <tbody></tbody>
            </table>
        `);

        projects.forEach(p => {
            let budget_health = (parseFloat(p.custom_project_dollar_amount) || 0) - (parseFloat(p.estimated_costing) || 0);
            let budget_color = budget_health >= 0 ? "text-success" : "text-danger";
            
            let row = $(`
                <tr>
                    <td style="min-width: 200px;"><a href="/app/project/${p.name}" class="font-weight-bold">${p.project_name}</a></td>
                    ${build_editable_priority_cell(p.name, 'custom_company_priority', p.custom_company_priority, priority_options.company_priority || [])}
                    ${build_editable_priority_cell(p.name, 'custom_project_priority', p.custom_project_priority, priority_options.project_priority || [])}
                    <td style="min-width: 150px;">
                        <div class="d-flex align-items-center">
                            <div class="progress flex-grow-1 mr-2" style="height: 10px;">
                                <div class="progress-bar bg-primary" style="width: ${p.percent_complete || 0}%"></div>
                            </div>
                            <span class="small font-weight-bold">${Math.round(p.percent_complete || 0)}%</span>
                        </div>
                    </td>
                    <td class="font-weight-bold ${budget_color}" style="min-width: 140px;">${frappe.format(budget_health, {fieldtype: "Currency"})}</td>
                </tr>
            `);
            table.find('tbody').append(row);
        });

        table.find(".editable-priority").each((_, cellEl) => {
            const cell = $(cellEl);
            const select = cell.find("select.edit-view");
            const staticView = cell.find(".static-view");

            staticView.on("click", (e) => {
                e.stopPropagation();
                table.find(".edit-view").hide();
                table.find(".static-view").show();
                staticView.hide();
                select.show().focus();
            });

            select.on("blur", () => {
                setTimeout(() => {
                    select.hide();
                    staticView.show();
                }, 150);
            });

            select.on("change", () => {
                const val = select.val();
                staticView.html(get_priority_badge(val));
                select.hide();
                staticView.show();
                auto_save_field(cell.data('project'), cell.data('field'), val, cell);
            });
        });

        bind_sortable_headers(table);
        wrapper.append(table);
        return wrapper;
    }

    function render_priority_overview() {
        let container = $root.find('#dashboard-content');
        container.empty();

        let state = sort_state['priority-overview'];
        let active_projects = project_data.filter(p => p.is_active === "Yes");
        
        let projects_to_show = active_projects.filter(p => {
             let stream = p.project_type || "Uncategorized";
             return !(stream === "Group Projects" || stream === "Internal" || stream === "Organizational Projects" || stream === "Other");
        });

        if (state.col === "project_priority") {
            let groups = {};
            projects_to_show.forEach(p => {
                let stream = p.project_type || "Uncategorized";
                if (!groups[stream]) groups[stream] = [];
                groups[stream].push(p);
            });

            let sorted_streams = Object.keys(groups).sort((a, b) => a.localeCompare(b));
            sorted_streams.forEach(stream => {
                let stream_projects = groups[stream].sort((a, b) => {
                    let weightA = get_priority_weight(a.custom_project_priority);
                    let weightB = get_priority_weight(b.custom_project_priority);
                    let diff = weightA - weightB;
                    if (diff === 0) diff = String(a.project_name || "").localeCompare(String(b.project_name || ""));
                    return state.order === 'asc' ? diff : -diff;
                });
                container.append(`<h5 class="mt-4 mb-3 text-muted border-bottom pb-2">${stream}</h5>`);
                container.append(build_priority_table(stream_projects));
            });
        } else {
            projects_to_show.sort((a, b) => {
                let diff = 0;
                if (state.col === 'project_name') {
                    diff = String(a.project_name || "").localeCompare(String(b.project_name || ""));
                } else if (state.col === 'company_priority') {
                    diff = get_priority_weight(a.custom_company_priority) - get_priority_weight(b.custom_company_priority);
                } else if (state.col === 'percent_complete') {
                    diff = (parseFloat(a.percent_complete) || 0) - (parseFloat(b.percent_complete) || 0);
                } else if (state.col === 'budget_health') {
                    let healthA = (parseFloat(a.custom_project_dollar_amount) || 0) - (parseFloat(a.estimated_costing) || 0);
                    let healthB = (parseFloat(b.custom_project_dollar_amount) || 0) - (parseFloat(b.estimated_costing) || 0);
                    diff = healthA - healthB;
                }
                
                if (diff === 0 && state.col !== 'project_name') {
                    diff = String(a.project_name || "").localeCompare(String(b.project_name || ""));
                }
                return state.order === 'asc' ? diff : -diff;
            });
            container.append(build_priority_table(projects_to_show));
        }
    }

    function build_internal_table(projects) {
        let wrapper = $('<div class="table-responsive mb-4"></div>');
        let table = $(`
            <table class="table table-bordered mb-0">
                <thead class="thead-light">
                    <tr>
                        ${th('project_name', 'Project Name')}
                        ${th('status', 'Status')}
                        ${th('custom_project_priority', 'Priority')}
                        ${th('percent_complete', '% Complete')}
                        ${th('project_user', 'Assigned To')}
                    </tr>
                </thead>
                <tbody></tbody>
            </table>
        `);

        projects.forEach(p => {
            let status_html = `<select class="form-control form-control-sm project-inline-edit" data-field="status" data-project="${p.name}">
                ${status_options.map(s => `<option value="${s}" ${p.status === s ? 'selected' : ''}>${s}</option>`).join('')}
            </select>`;

            let priority_opts = priority_options.project_priority || [];
            let priority_html = `<select class="form-control form-control-sm project-inline-edit" data-field="custom_project_priority" data-project="${p.name}">
                <option value="">Not Assigned</option>
                ${priority_opts.map(opt => `<option value="${opt}" ${p.custom_project_priority === opt ? 'selected' : ''}>${opt}</option>`).join('')}
            </select>`;

            table.find('tbody').append(`
                <tr>
                    <td style="min-width: 200px;"><a href="/app/project/${p.name}" class="font-weight-bold">${p.project_name}</a></td>
                    <td style="min-width: 140px;">${status_html}</td>
                    <td style="min-width: 140px;">${priority_html}</td>
                    <td style="min-width: 150px;">
                        <div class="d-flex align-items-center">
                            <div class="progress flex-grow-1 mr-2" style="height: 10px;">
                                <div class="progress-bar bg-primary" style="width: ${p.percent_complete || 0}%"></div>
                            </div>
                            <span class="small font-weight-bold">${Math.round(p.percent_complete || 0)}%</span>
                        </div>
                    </td>
                    <td style="min-width: 150px;">${p.project_user || "Unassigned"}</td>
                </tr>
            `);
        });

        table.find('.project-inline-edit').on('change', function() {
            let select = $(this);
            auto_save_field(select.data('project'), select.data('field'), select.val(), select.closest('td'));
        });

        bind_sortable_headers(table);
        wrapper.append(table);
        return wrapper;
    }

    function render_active_internal() {
        let container = $root.find('#dashboard-content');
        container.empty();
        
        let state = sort_state['active-internal-projects'];
        const allowedTypes = ["Group Projects", "Internal", "Organizational Projects", "Other"];
        let internal_projects = project_data.filter(p => p.is_active === "Yes" && allowedTypes.includes(p.project_type));

        let groups = {};
        internal_projects.forEach(p => {
            let master = p.custom_master_project || "Independent Projects";
            if (!groups[master]) groups[master] = [];
            groups[master].push(p);
        });

        let sorted_masters = Object.keys(groups).sort((a, b) => {
            if (a === "Independent Projects") return 1;
            if (b === "Independent Projects") return -1;
            return a.localeCompare(b);
        });

        sorted_masters.forEach(master => {
            let master_projects = groups[master].sort((a, b) => {
                let diff = 0;
                if (state.col === 'project_name') diff = String(a.project_name||"").localeCompare(String(b.project_name||""));
                else if (state.col === 'status') diff = String(a.status||"").localeCompare(String(b.status||""));
                else if (state.col === 'custom_project_priority') diff = get_priority_weight(a.custom_project_priority) - get_priority_weight(b.custom_project_priority);
                else if (state.col === 'percent_complete') diff = (parseFloat(a.percent_complete)||0) - (parseFloat(b.percent_complete)||0);
                else if (state.col === 'project_user') diff = String(a.project_user||"").localeCompare(String(b.project_user||""));
                
                if (diff === 0 && state.col !== 'project_name') diff = String(a.project_name||"").localeCompare(String(b.project_name||""));
                return state.order === 'asc' ? diff : -diff;
            });
            
            container.append(`<h5 class="mt-4 mb-3 text-muted border-bottom pb-2">${master}</h5>`);
            container.append(build_internal_table(master_projects));
        });
    }

    function render_completed_projects() {
        let container = $root.find('#dashboard-content');
        container.empty();
        
        let state = sort_state['completed-projects'];
        let completed_projects = project_data.filter(p => p.is_active === "No");

        completed_projects.sort((a, b) => {
            let diff = 0;
            if (state.col === 'project_name') diff = String(a.project_name||"").localeCompare(String(b.project_name||""));
            else if (state.col === 'status') diff = String(a.status||"").localeCompare(String(b.status||""));
            else if (state.col === 'project_type') diff = String(a.project_type||"").localeCompare(String(b.project_type||""));
            else if (state.col === 'project_user') diff = String(a.project_user||"").localeCompare(String(b.project_user||""));
            
            if (diff === 0 && state.col !== 'project_name') diff = String(a.project_name||"").localeCompare(String(b.project_name||""));
            return state.order === 'asc' ? diff : -diff;
        });

        let wrapper = $('<div class="table-responsive mb-4"></div>');
        let table = $(`
            <table class="table table-bordered table-hover mb-0">
                <thead class="thead-light">
                    <tr>
                        ${th('project_name', 'Project Name')}
                        ${th('status', 'Status')}
                        ${th('project_type', 'Type')}
                        ${th('project_user', 'Assigned To')}
                    </tr>
                </thead>
                <tbody></tbody>
            </table>
        `);

        completed_projects.forEach(p => {
            let status_badge = 'secondary';
            if (p.status === 'Completed' || p.status === 'Paid') status_badge = 'success';
            else if (p.status === 'Active') status_badge = 'primary';
            else if (p.status === 'Invoiced') status_badge = 'info';

            table.find('tbody').append(`
                <tr>
                    <td style="min-width: 200px;"><a href="/app/project/${p.name}" class="font-weight-bold">${p.project_name}</a></td>
                    <td style="min-width: 120px;"><span class="badge badge-${status_badge}">${p.status}</span></td>
                    <td style="min-width: 150px;">${p.project_type || "Uncategorized"}</td>
                    <td style="min-width: 150px;" class="text-muted">${p.project_user || "Unassigned"}</td>
                </tr>
            `);
        });

        bind_sortable_headers(table);
        wrapper.append(table);

        if (completed_projects.length === 0) container.html('<div class="p-4 text-center text-muted">No completed projects found.</div>');
        else container.append(wrapper);
    }

    function render_current_tab() {
        if (current_tab === "portfolio-gantt") {
            $root.find('#gantt-controls').show();
            $root.find('#standard-controls').hide();
            render_portfolio_gantt();
        } else {
            $root.find('#gantt-controls').hide();
            $root.find('#standard-controls').show();
            
            if (current_tab === "priority-overview") render_priority_overview();
            else if (current_tab === "active-internal-projects") render_active_internal();
            else if (current_tab === "completed-projects") render_completed_projects();
            
            setTimeout(apply_search_filter, 50);
        }
    }

    // ----- SEARCH FILTER LOGIC -----

    function apply_search_filter() {
        let search_term = $root.find('#global-project-search').val().toLowerCase();
        let rows = $root.find('#dashboard-content table tbody tr');

        rows.each(function() {
            let row = $(this);
            let row_text = row.text().toLowerCase();
            
            if (row_text.indexOf(search_term) !== -1) row.show();
            else row.hide();
        });
    }

    // ----- EVENT LISTENERS -----

    $root.find('#global-project-search').on('input', function() {
        apply_search_filter();
    });

    $root.find('.nav-link').click(function(e) {
        e.preventDefault();
        $root.find('.nav-link').removeClass('active');
        $(this).addClass('active');
        current_tab = $(this).data('route');
        render_current_tab();
    });

    // Init
    fetch_initial_data();
})();