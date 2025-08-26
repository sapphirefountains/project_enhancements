frappe.pages['project-dashboard'].on_page_load = function(wrapper) {
    console.log("Loading Project Dashboard JS - Version 2.4 (Robust DOM creation)");

    let page = frappe.ui.make_app_page({
        parent: wrapper,
        title: 'Projects Dashboard',
        single_column: true
    });

    let allProjects = [];

    const filterableFields = [
        { label: 'Status', value: 'status' },
        { label: 'Project Type', value: 'project_type' },
        { label: 'Assigned To', value: 'project_user' }
    ];

    const controlsContainer = $(`
        <div class="project-dashboard-controls p-3 border-bottom bg-light">
            <div class="row">
                <div class="col-sm-6 mb-2 mb-sm-0">
                    <input type="text" class="form-control" id="project-search" placeholder="Search by Name or Series...">
                </div>
                <div class="col-sm-6">
                    <div class="input-group">
                        <select class="form-control" id="filter-field" style="flex: 0 0 150px;">
                            <option value="">Filter by Field...</option>
                            ${filterableFields.map(f => `<option value="${f.value}">${f.label}</option>`).join('')}
                        </select>
                        <input type="text" class="form-control" id="filter-value" placeholder="Enter value...">
                    </div>
                </div>
            </div>
        </div>
    `).prependTo(page.body);

    const searchInput = controlsContainer.find('#project-search');
    const filterFieldSelect = controlsContainer.find('#filter-field');
    const filterValueInput = controlsContainer.find('#filter-value');

    let content = $(`<div class="project-dashboard-content p-4"></div>`).appendTo(page.body);
    content.html('<p class="text-gray-500">Loading projects...</p>');

    function renderProjects(projects) {
        content.empty();
        if (!projects || projects.length === 0) {
            content.html('<p class="text-gray-600 text-center p-4">No projects match your filters.</p>');
            return;
        }
        const groupedProjects = projects.reduce((acc, project) => {
            const type = project.project_type || 'Uncategorized';
            if (!acc[type]) acc[type] = [];
            acc[type].push(project);
            return acc;
        }, {});

        for (const type in groupedProjects) {
            const projectsInGroup = groupedProjects[type];

            // --- FIX IS HERE: Create and append elements in separate, explicit steps ---

            // 1. Create the header element
            const groupHeaderHTML =
                '<div class="collapsible-header bg-gray-100 p-3 my-1 rounded-md cursor-pointer flex justify-between items-center border">' +
                    '<h2 class="text-lg font-medium text-gray-700">' + type + ' (' + projectsInGroup.length + ')</h2>' +
                    '<svg style="height: 1.25rem; width: 1.25rem; flex-shrink: 0;" class="text-gray-600 transform transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>' +
                '</div>';
            const groupHeader = $(groupHeaderHTML);

            // 2. Create the body element
            const groupBody = $('<div class="collapsible-body" style="display: none;"></div>');
            
            // 3. Create the grid element (the line that caused the error)
            const grid = $('<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 p-2"></div>');

            // 4. Append the grid to the body, THEN append the body and header to the main content
            groupBody.append(grid);
            content.append(groupHeader);
            content.append(groupBody);
            
            projectsInGroup.forEach(project => {
                const cardHTML =
                    '<div class="bg-white p-3 rounded-lg shadow-sm border border-gray-200 flex flex-col justify-between h-full">' +
                        '<div>' +
                            '<h3 class="text-base font-semibold text-gray-800 truncate">' +
                                '<a href="/app/project/' + project.name + '" class="text-blue-600 hover:underline">' + project.project_name + '</a>' +
                            '</h3>' +
                            '<p class="text-xs text-gray-500 mb-2">' + project.name + '</p>' +
                        '</div>' +
                        '<div class="mt-3 text-xs space-y-2">' +
                            '<div class="flex justify-between">' +
                                '<span class="font-semibold text-gray-600">Status:</span>' +
                                '<span class="inline-block px-2 py-0.5 rounded-full ' + getStatusClass(project.status) + '">' +
                                    project.status +
                                '</span>' +
                            '</div>' +
                            '<div class="flex justify-between">' +
                                '<span class="font-semibold text-gray-600">Tasks:</span>' +
                                '<span class="text-gray-800">' + project.completed_tasks + ' / ' + project.total_tasks + '</span>' +
                            '</div>' +
                            '<div class="flex justify-between">' +
                                '<span class="font-semibold text-gray-600">Assigned To:</span>' +
                                '<span class="text-gray-800 truncate">' + (project.project_user || 'Not Assigned') + '</span>' +
                            '</div>' +
                        '</div>' +
                    '</div>';
                grid.append(cardHTML);
            });

            groupHeader.on('click', function() {
                $(this).next('.collapsible-body').slideToggle();
                $(this).find('svg').toggleClass('rotate-180');
            });
        }
        content.find('.collapsible-header').first().trigger('click');
    }

    function applyAllFilters() {
        const searchTerm = searchInput.val().toLowerCase();
        const filterField = filterFieldSelect.val();
        const filterValue = filterValueInput.val().toLowerCase();
        let filteredProjects = allProjects;

        if (searchTerm) {
            filteredProjects = filteredProjects.filter(p => 
                p.project_name.toLowerCase().includes(searchTerm) ||
                p.name.toLowerCase().includes(searchTerm)
            );
        }

        if (filterField && filterValue) {
            filteredProjects = filteredProjects.filter(p => {
                const fieldValue = p[filterField] || '';
                return fieldValue.toLowerCase().includes(filterValue);
            });
        }
        renderProjects(filteredProjects);
    }

    const debouncedFilter = frappe.utils.debounce(applyAllFilters, 300);
    searchInput.on('keyup', debouncedFilter);
    filterFieldSelect.on('change', applyAllFilters);
    filterValueInput.on('keyup', debouncedFilter);
    
    function getStatusClass(status) {
        switch(status) {
            case 'Open': return 'bg-blue-100 text-blue-800';
            case 'Completed': return 'bg-green-100 text-green-800';
            case 'Overdue': return 'bg-red-100 text-red-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    }

    frappe.call({
        method: "project_enhancements.project_enhancements.page.project_dashboard.project_dashboard.get_project_data",
        callback: function(r) {
            if (r.message && !r.message.error) {
                allProjects = r.message;
                renderProjects(allProjects);
            } else {
                content.html(`<p class="text-red-500">Error: ${r.message.error || 'An unexpected error occurred.'}</p>`);
            }
        }
    });
}
