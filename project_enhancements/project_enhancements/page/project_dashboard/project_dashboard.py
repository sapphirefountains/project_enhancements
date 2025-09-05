import frappe

@frappe.whitelist()
def get_project_data():
    """
    This function fetches a list of projects and enriches it with task counts
    and the assigned project user.
    """
    try:
        # --- CHANGE IS HERE: Removed the 'limit_page_length' to fetch all projects ---
        projects = frappe.get_list(
            'Project',
            fields=['name', 'project_name', 'status', 'project_type', 'project_user', 'custom_project_priority', 'is_active'],
            filters={'status': ['!=', 'Cancelled']},
            order_by='creation desc'
        )

        for project in projects:
            project_name = project.get('name')
            total_tasks = frappe.db.count('Task', {'project': project_name})
            completed_tasks = frappe.db.count('Task', {'project': project_name, 'status': 'Completed'})
            project['total_tasks'] = total_tasks
            project['completed_tasks'] = completed_tasks

        return projects
        
    except Exception as e:
        frappe.log_error(frappe.get_traceback(), "Error fetching project data")
        return {"error": "Could not fetch project data. Please check the logs."}

@frappe.whitelist()
def update_project_details(project_name, field, value):
    """
    Updates a specific field for a given project.
    """
    try:
        frappe.db.set_value('Project', project_name, field, value)
        return {"status": "success"}
    except Exception as e:
        frappe.log_error(frappe.get_traceback(), f"Error updating project {project_name}")
        return {"status": "error", "message": "Could not update project. Please check the logs."}
