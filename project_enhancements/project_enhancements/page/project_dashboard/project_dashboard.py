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

@frappe.whitelist()
def get_priority_options():
    """
    Retrieves the configured options for the 'custom_project_priority'
    field from the Project DocType metadata.

    Returns:
        list[str]: A list of available priority options.
                   Returns a dictionary with an 'error' key on failure.
    """
    try:
        project_doctype = frappe.get_meta('Project')
        priority_field = next((df for df in project_doctype.fields if df.fieldname == 'custom_project_priority'), None)

        if priority_field and priority_field.options:
            # Options are stored as a string, separated by newlines.
            # We also filter out any empty lines that might result from trailing newlines.
            options = [opt for opt in priority_field.options.split('\n') if opt]
            return options
        else:
            # Return a default list or an empty list if no options are found
            return []

    except Exception as e:
        frappe.log_error(frappe.get_traceback(), "Error fetching priority options")
        return {"error": "Could not fetch priority options."}

@frappe.whitelist()
def get_status_options():
    """
    Retrieves the configured options for the 'status'
    field from the Project DocType metadata.

    Returns:
        list[str]: A list of available status options.
                   Returns a dictionary with an 'error' key on failure.
    """
    try:
        project_doctype = frappe.get_meta('Project')
        status_field = next((df for df in project_doctype.fields if df.fieldname == 'status'), None)

        if status_field and status_field.options:
            # Options are stored as a string, separated by newlines.
            # We also filter out any empty lines that might result from trailing newlines.
            options = [opt for opt in status_field.options.split('\n') if opt]
            return options
        else:
            # Return a default list or an empty list if no options are found
            return []

    except Exception as e:
        frappe.log_error(frappe.get_traceback(), "Error fetching status options")
        return {"error": "Could not fetch status options."}

@frappe.whitelist()
def get_project_tasks(project):
    """
    Fetches all tasks for a given project and structures them hierarchically.

    Args:
        project (str): The name of the project to fetch tasks for.

    Returns:
        list[dict]: A list of task dictionaries, structured in a tree format.
                    Returns a dictionary with an 'error' key on failure.
    """
    if not project:
        return {"error": "Project name is required."}

    try:
        tasks = frappe.get_list(
            'Task',
            fields=[
                'name',
                'subject',
                'assigned_to',
                'status',
                'exp_start_date',
                'exp_end_date',
                'progress',
                'expected_time',
                'parent_task'
            ],
            filters={'project': project},
            order_by='subject'
        )

        # Build a dictionary for easy lookup
        task_map = {task['name']: task for task in tasks}

        # Create the tree structure
        task_tree = []
        for task in tasks:
            task['children'] = [] # Initialize children list
            if task.get('parent_task'):
                parent = task_map.get(task['parent_task'])
                if parent:
                    # Initialize children list for parent if not present
                    if 'children' not in parent:
                        parent['children'] = []
                    parent['children'].append(task)
                else:
                    # Parent doesn't exist in the fetched list, so treat it as a root task
                    task_tree.append(task)
            else:
                task_tree.append(task)

        # Filter out children that have been moved under their parents
        root_tasks = [task for task in task_tree if not task.get('parent_task') or not task_map.get(task.get('parent_task'))]

        return root_tasks

    except Exception as e:
        frappe.log_error(frappe.get_traceback(), f"Error fetching tasks for project {project}")
        return {"error": f"Could not fetch tasks for project {project}. Please check logs."}
