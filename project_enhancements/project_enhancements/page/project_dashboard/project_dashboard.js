frappe.pages['project-dashboard'].on_page_load = function(wrapper) {
    // Create a new page object
    let page = frappe.ui.make_app_page({
        parent: wrapper,
        title: 'Projects Dashboard',
        single_column: true
    });

    let allProjects = []; // Variable to store all projects for filtering

    // Add a search bar to the page header
    const searchBar = $(`
        <div class="page-form-actions p-3 border-bottom">
            <div class="input-group">
                <input type="text" class="form-control" placeholder="Search by Project Name...">
                <div class="input-group-append">
                    <span class="input-group-text">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M15.7071 14.2929L12.4142 11H11.5L11.0858 10.5858C12.031 9.49396 12.5001 8.08173 12.5 6.625C12.5 3.24375 9.75625 0.5 6.375 0.5C2.99375 0.5 0.25 3.24375 0.25 6.625C0.25 10.0062 2.99375 12.75 6.375 12.75C7.83173 12.7501 9.24396 12.281 10.3358 11.3358L10.75 11.75V12.5L14 15.75L15.7071 14.2929ZM6.375 11.25C3.82188 11.25 1.75 9.17813 1.75 6.625C1.75 4.07188 3.82188 2 6.375 2C8.92813 2 11 4.07188 11 6.625C11 9.17813 8.92813 11.25 6.375 11.25Z" fill="#8D99A6"/>
                        </svg>
                    </span>
                </div>
            </div>
        </div>
    `).appendTo(page.page_form);

    const searchInput = searchBar.find('input');

    // Add a placeholder for our content
    let content = $(`<div class="project-dashboard-content p-4"></div>`).appendTo(page.body);
    content.html('<p class="text-gray-500">Loading projects...</p>');

    // Function to render the projects
    function renderProjects(projects) {
        content.empty();

        if (!projects || projects.length === 0) {
            content.html('<p class="text-gray-600 text-center p-4">No projects match your search.</p>');
            return;
        }

        const groupedProjects = projects.reduce((acc, project) => {
            const type = project.project_type || 'Uncategorized';
            if (!acc[type]) {
                acc[type] = [];
            }
            acc[type].push(project);
            return acc;
        }, {});

        for (const type in groupedProjects) {
            const projectsInGroup = groupedProjects[type];
            const groupHeader = $(`
                <div class="collapsible-header bg-gray-100 p-3 my-1 rounded-md cursor-pointer flex justify-between items-center border">
                    <h2 class="text-lg font-medium text-gray-700">${type} (${projectsInGroup.length})</h2>
                    <svg style="height: 1.25rem; width: 1.25rem; flex-shrink: 0;" class="text-gray-600 transform transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                </div>
            `).appendTo(content);

            const groupBody = $(`<div class="collapsible-body" style="display: none;"></div>`).appendTo(content);
            const grid = $('<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 p-2"></div>').appendTo(groupBody);

            projectsInGroup.forEach(project => {
                const card = `
                    <div class="bg-white p-3 rounded-lg shadow-sm border border-gray-200 flex flex-col justify-between h-full">
                        <div>
                            <h3 class="text-base font-semibold text-gray-800 truncate">
                                <a href="/app/project/${project.name}" class="text-blue-600 hover:underline">${project.project_name}</a>
                            </h3>
                            <p class="text-xs text-gray-500 mb-2">${project.name}</p>
                        </div>
                        <div class="mt-3 text-xs space-y-2">
                            <div class="flex justify-between">
                                <span class="font-semibold text-gray-600">Status:</span>
                                <span class="inline-block px-2 py-0.5 rounded-full ${getStatusClass(project.status)}">
                                    ${project.status}
                                </span>
                            </div>
                            <div class="flex justify-between">
                                <span class="font-semibold text-gray-600">Tasks:</span>
                                <span class="text-gray-800">${project.completed_tasks} / ${project.total_tasks}</span>
                            </div>
                            <div class="flex justify-between">
                                <span class="font-semibold text-gray-600">Assigned To:</span>
                                <span class="text-gray-800 truncate">${project.project_user || 'Not Assigned'}</span>
                            </div>
                        </div>
                    </div>
                `;
                grid.append(card);
            });

            groupHeader.on('click', function() {
                $(this).next('.collapsible-body').slideToggle();
                $(this).find('svg').toggleClass('rotate-180');
            });
        }
        
        content.find('.collapsible-header').first().trigger('click');
    }

    function filterProjects() {
        const searchTerm = searchInput.val().toLowerCase();
        if (!searchTerm) {
            renderProjects(allProjects);
            return;
        }
        const filtered = allProjects.filter(p => p.project_name.toLowerCase().includes(searchTerm));
        renderProjects(filtered);
    }

    searchInput.on('keyup', frappe.utils.debounce(filterProjects, 300));
    
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
