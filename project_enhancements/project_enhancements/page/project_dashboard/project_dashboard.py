import frappe

@frappe.whitelist()
def get_project_data():
    """
    This function fetches a list of projects and enriches it with task counts
    and the assigned project user.
    """
    try:
        # --- CHANGE IS HERE: Added 'custom_project_priority' to the fields list ---
        projects = frappe.get_list(
            'Project',
            fields=['name', 'project_name', 'status', 'project_type', 'project_user', 'custom_project_priority'],
            filters={'status': ['!=', 'Cancelled']},
            order_by='creation desc',
            limit_page_length=200
        )

        # Loop through each project to get additional details
        for project in projects:
            project_name = project.get('name')

            # Count total tasks for the project
            total_tasks = frappe.db.count('Task', {'project': project_name})
            
            # Count completed tasks for the project
            completed_tasks = frappe.db.count('Task', {'project': project_name, 'status': 'Completed'})
            
            # Add the new data to the project dictionary
            project['total_tasks'] = total_tasks
            project['completed_tasks'] = completed_tasks

        return projects
        
    except Exception as e:
        frappe.log_error(frappe.get_traceback(), "Error fetching project data")
        return {"error": "Could not fetch project data. Please check the logs."}
