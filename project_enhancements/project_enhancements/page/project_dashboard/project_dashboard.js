/**
 * @file This file contains the client-side logic for the Project Dashboard page.
 * @description Refactored to utilize native UI primitives, modular component architecture,
 * and robust client-side routing.
 */

frappe.pages['project-dashboard'].on_page_load = function (wrapper) {
    const page = frappe.ui.make_app_page({
        parent: wrapper,
        title: 'Projects Dashboard',
        single_column: true
    });

    // Load the dashboard API utility first
    frappe.require('/assets/project_enhancements/js/dashboard_components/dashboard_api.js', () => {
        // Check permissions before rendering the main dashboard
        project_enhancements.dashboard_api.call({
            method: "project_enhancements.project_enhancements.page.project_dashboard.project_dashboard.check_permission"
        }).then(r => {
            if (r.message) {
                initialize_dashboard(page);
            } else {
                page.set_title('Access Denied');
                $(page.body).html(`
                    <div class="container py-5">
                        <div class="alert alert-danger">
                            <h3><i class="fa fa-lock mr-2"></i>Access Denied</h3>
                            <p>You do not have the required permissions to view the Project Dashboard. Please contact your system administrator to request access.</p>
                        </div>
                    </div>
                `);
            }
        }).catch(err => {
            console.error('Permission Check Error:', err);
            $(page.body).html('<div class="alert alert-danger">Error checking permissions. Please try again.</div>');
        });
    });

    function initialize_dashboard(page) {
        console.log("Loading Project Dashboard JS - Refactored");

        // --- UI Container ---
        // Using standard Frappe layout classes
        const container = $('<div class="project-dashboard-container"></div>').appendTo(page.body);

        // --- Responsive State Handling ---
        const handleViewportMutation = frappe.utils.debounce(() => {
            const width = $(window).width();
            const contentContainer = container.find('.dashboard-content');

            if (width < 768) {
                // Mobile layout adjustments
                contentContainer.addClass('table-responsive');
                tabContainer.find('.nav-tabs').addClass('flex-column nav-pills').removeClass('nav-tabs');
                tabContainer.removeClass('border-bottom');
            } else {
                // Desktop layout adjustments
                contentContainer.removeClass('table-responsive');
                tabContainer.find('.nav-pills').addClass('nav-tabs').removeClass('flex-column nav-pills');
                tabContainer.addClass('border-bottom');
            }
        }, 250);

        $(window).on('resize', handleViewportMutation);

        // Standard Frappe Tab Navigation
        const tabContainer = $(`
            <div class="dashboard-tabs p-3 pb-0 border-bottom">
                <ul class="nav nav-tabs" role="tablist">
                    <li class="nav-item">
                        <a class="nav-link" href="#project-dashboard/active-external-projects" data-route="active-external-projects">Active External Projects</a>
                    </li>
                    <li class="nav-item">
                        <a class="nav-link" href="#project-dashboard/active-internal-projects" data-route="active-internal-projects">Active Internal Projects</a>
                    </li>
                    <li class="nav-item">
                        <a class="nav-link" href="#project-dashboard/priority-overview" data-route="priority-overview">Priority Overview</a>
                    </li>
                    <li class="nav-item">
                        <a class="nav-link" href="#project-dashboard/portfolio-gantt" data-route="portfolio-gantt">Portfolio Gantt</a>
                    </li>
                    <li class="nav-item">
                        <a class="nav-link" href="#project-dashboard/tasks-tree" data-route="tasks-tree">Tasks Tree</a>
                    </li>
                </ul>
            </div>
        `).appendTo(container);

        const controlsContainer = $(`
            <div class="dashboard-controls p-2 border-bottom bg-light">
                <div class="row align-items-center">
                    <div class="col-md-6 mb-2 mb-md-0">
                        <input type="text" class="form-control form-control-sm" id="global-project-search" placeholder="Search projects...">
                    </div>
                    <div class="col-md-6 text-right">
                        <div id="global-pending-changes" style="display: none;">
                            <div class="btn-group btn-group-sm">
                                <button type="button" class="btn btn-success" id="save-global-changes">Save Changes</button>
                                <button type="button" class="btn btn-danger" id="discard-global-changes">Discard Changes</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `).appendTo(container);

        const contentContainer = $('<div class="dashboard-content p-3 bg-white"></div>').appendTo(container);

        let currentComponent = null;

        // --- Route Handling & Component Dispatcher ---
        async function handleRouteChange() {
            const route = frappe.get_route();
            if (route[0] !== 'project-dashboard') return;

            const moduleRoute = route[1] || 'active-external-projects';
            const componentArgs = route.slice(2);

            // Update Tab Active State
            tabContainer.find('.nav-link').removeClass('active');
            tabContainer.find(`.nav-link[data-route="${moduleRoute}"]`).addClass('active');

            // Unmount current component (aborting any pending requests)
            if (currentComponent) {
                if (typeof currentComponent.unmount === 'function') {
                    currentComponent.unmount();
                }
                currentComponent = null;
            }

            // Map route to Component Class & File
            let componentConfig;
            switch (moduleRoute) {
                case 'active-external-projects':
                    componentConfig = {
                        file: '/assets/project_enhancements/js/dashboard_components/active_external_projects.js',
                        className: 'ActiveExternalProjects'
                    };
                    break;
                case 'active-internal-projects':
                    componentConfig = {
                        file: '/assets/project_enhancements/js/dashboard_components/active_internal_projects.js',
                        className: 'ActiveInternalProjects'
                    };
                    break;
                case 'priority-overview':
                    componentConfig = {
                        file: '/assets/project_enhancements/js/dashboard_components/priority_overview.js',
                        className: 'PriorityOverview'
                    };
                    break;
                case 'portfolio-gantt':
                    componentConfig = {
                        file: '/assets/project_enhancements/js/dashboard_components/portfolio_gantt.js',
                        className: 'PortfolioGantt'
                    };
                    break;
                case 'tasks-tree':
                    componentConfig = {
                        file: '/assets/project_enhancements/js/dashboard_components/tasks_tree.js',
                        className: 'TasksTree'
                    };
                    break;
                default:
                    // Fallback to active external
                    frappe.set_route('project-dashboard', 'active-external-projects');
                    return;
            }

            try {
                // Async Factory Pattern: Load file dynamically
                await new Promise((resolve) => {
                    frappe.require(componentConfig.file, resolve);
                });

                // Instantiate the loaded component
                const ComponentClass = project_enhancements.dashboard_components[componentConfig.className];
                if (ComponentClass) {
                    currentComponent = new ComponentClass(contentContainer);
                    // Pass any extra route args to render
                    currentComponent.render(...componentArgs);
                } else {
                    console.error(`Component class ${componentConfig.className} not found.`);
                }
            } catch (err) {
                console.error(`Error loading component for route ${moduleRoute}:`, err);
                contentContainer.html('<div class="alert alert-danger">Error loading component module.</div>');
            }
        }

        // --- Interactive State & Batch Saving ---
        let pendingProjectChanges = {};

        $(document).on('dashboard_project_change', (e, data) => {
            if (!pendingProjectChanges[data.project]) {
                pendingProjectChanges[data.project] = {};
            }
            pendingProjectChanges[data.project][data.field] = data.value;
            $('#global-pending-changes').show();
        });

        $('#save-global-changes').on('click', () => {
            project_enhancements.dashboard_api.call({
                method: 'project_enhancements.project_enhancements.page.project_dashboard.project_dashboard.update_multiple_docs',
                args: {
                    project_updates: JSON.stringify(pendingProjectChanges),
                    task_updates: '{}'
                }
            }).then(r => {
                if (r.message && r.message.status === 'success') {
                    frappe.show_alert({ message: 'Changes saved!', indicator: 'green' });
                    pendingProjectChanges = {};
                    $('#global-pending-changes').hide();
                } else {
                    frappe.show_alert({ message: r.message.message || 'Error saving changes.', indicator: 'red' });
                    handleRouteChange(); // Reload to revert
                }
            }).catch(err => {
                frappe.show_alert({ message: 'Error saving changes.', indicator: 'red' });
                handleRouteChange(); // Reload to revert
            });
        });

        $('#discard-global-changes').on('click', () => {
            pendingProjectChanges = {};
            $('#global-pending-changes').hide();
            handleRouteChange(); // Reload view
            frappe.show_alert({ message: 'Changes discarded.', indicator: 'info' });
        });

        // Search Filtering Support
        $('#global-project-search').on('keyup', frappe.utils.debounce(function() {
            const searchTerm = $(this).val().toLowerCase();
            const rows = contentContainer.find('table tbody tr');

            rows.each(function() {
                const text = $(this).text().toLowerCase();
                if (text.indexOf(searchTerm) === -1) {
                    $(this).hide();
                } else {
                    $(this).show();
                }
            });
        }, 300));


        // --- Event Delegation & Initialization ---
        frappe.router.on('change', handleRouteChange);

        // Initial render logic
        const currentRoute = frappe.get_route();
        if (currentRoute.length === 1 && currentRoute[0] === 'project-dashboard') {
            // No sub-route, default to external projects
            frappe.set_route('project-dashboard', 'active-external-projects');
        } else {
            // Trigger route logic for current route
            handleRouteChange();
        }

        // Initial responsive check
        handleViewportMutation();

        // Cleanup listener on page leave
        page.wrapper.on('hide', () => {
             frappe.router.off('change', handleRouteChange);
             $(window).off('resize', handleViewportMutation);
             if (currentComponent && typeof currentComponent.unmount === 'function') {
                 currentComponent.unmount();
             }
        });

        page.wrapper.on('show', () => {
             // Rebind when coming back
             frappe.router.on('change', handleRouteChange);
             handleRouteChange();
        });
    }
};
