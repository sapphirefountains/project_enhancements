import frappe

@frappe.whitelist()
def get_project_data():
    """Fetches and enriches project data for the dashboard.

    Retrieves all projects that are not cancelled, and for each project,
    annotates it with the total number of associated tasks and the number of
    completed tasks.

    Returns:
        list[dict]: A list of project dictionaries, each enhanced with
                    'total_tasks' and 'completed_tasks' counts.
                    Returns a dictionary with an 'error' key on failure.
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
    """Updates a single field for a specified project document.

    This function is called from the project dashboard to allow for inline
    editing of project properties.

    Args:
        project_name (str): The name (ID) of the project to update.
        field (str): The field name to be updated.
        value (any): The new value for the field.

    Returns:
        dict: A dictionary indicating the status of the operation, either
              {'status': 'success'} or {'status': 'error', 'message': ...}.
    """
    try:
        frappe.db.set_value('Project', project_name, field, value)
        return {"status": "success"}
    except Exception as e:
        frappe.log_error(frappe.get_traceback(), f"Error updating project {project_name}")
        return {"status": "error", "message": "Could not update project. Please check the logs."}
