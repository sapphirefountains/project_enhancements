import frappe
from frappe.utils import getdate

@frappe.whitelist()
def check_permission():
    """
    Checks if the current user has permission to view the Project Dashboard.

    Returns:
        bool: True if the user has permission, False otherwise.
    """
    try:
        permitted_roles_docs = frappe.get_all(
            "Project Dashboard Permitted Role",
            filters={"parent": "Project Dashboard Settings"},
            fields=["role"]
        )

        if not permitted_roles_docs:
            # If no roles are defined in settings, deny access by default for security.
            return False

        permitted_roles = {doc.get("role") for doc in permitted_roles_docs}
        user_roles = set(frappe.get_roles())

        # Check for intersection between user's roles and permitted roles
        if not permitted_roles.intersection(user_roles):
            return False

        return True

    except Exception as e:
        frappe.log_error(f"Error checking project dashboard permissions: {e}", frappe.get_traceback())
        return False # Deny access on error

def _get_assignee_names(doctype, docname):
    """
    Retrieves the details of users assigned to a specific document.

    Args:
        doctype (str): The type of the document (e.g., 'Project', 'Task').
        docname (str): The name (ID) of the document.

    Returns:
        list[dict]: A list of dictionaries, where each dict contains
                    'email' and 'full_name' of an assignee.
                    Returns an empty list if no one is assigned or on error.
    """
    try:
        todos = frappe.get_all(
            'ToDo',
            filters={
                'reference_type': doctype,
                'reference_name': docname,
                'status': 'Open'
            },
            fields=['allocated_to']
        )

        if not todos:
            return []

        assignee_emails = {todo.get('allocated_to') for todo in todos if todo.get('allocated_to')}

        if not assignee_emails:
            return []

        users = frappe.get_all(
            'User',
            filters={'email': ('in', list(assignee_emails))},
            fields=['email', 'full_name']
        )

        # Return the list of user details
        return users

    except Exception as e:
        frappe.log_error(f"Error fetching assignee names for {doctype} {docname}: {e}", frappe.get_traceback())
        return [] # Return an empty list on error

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
        # Permission check: Ensure the user has access to the dashboard
        if not check_permission():
            # Using dict for consistency in error handling on the client-side
            return {"error": "You do not have permission to view the Project Dashboard."}

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
            # Replace the placeholder 'project_user' with actual assignee names
            assignees = _get_assignee_names('Project', project_name)
            if assignees:
                project['project_user'] = ", ".join([d['full_name'] for d in assignees])
            else:
                project['project_user'] = "Unassigned"


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
def update_task_status(task_name, status):
    """
    Updates the status of a single task.

    Args:
        task_name (str): The name (ID) of the task to update.
        status (str): The new status for the task.

    Returns:
        dict: A dictionary indicating the status of the operation.
    """
    if not check_permission():
            return {"status": "error", "message": "You do not have permission to perform this action."}
    try:
        frappe.db.set_value('Task', task_name, 'status', status)
        return {"status": "success"}
    except Exception as e:
        frappe.log_error(frappe.get_traceback(), f"Error updating task {task_name}")
        return {"status": "error", "message": "Could not update task status. Please check the logs."}

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
def get_task_status_options():
    """
    Retrieves the configured options for the 'status'
    field from the Task DocType metadata.

    Returns:
        list[str]: A list of available status options.
                   Returns a dictionary with an 'error' key on failure.
    """
    try:
        task_doctype = frappe.get_meta('Task')
        status_field = next((df for df in task_doctype.fields if df.fieldname == 'status'), None)

        if status_field and status_field.options:
            options = [opt for opt in status_field.options.split('\n') if opt]
            return options
        else:
            return []

    except Exception as e:
        frappe.log_error(frappe.get_traceback(), "Error fetching task status options")
        return {"error": "Could not fetch task status options."}

def _fetch_all_project_tasks(project_name):
    """
    Recursively fetches all tasks and sub-tasks for a given project.
    It starts by fetching tasks directly linked to the project, and then
    iteratively fetches their children.
    """
    task_fields = [
        'name', 'subject', 'assigned_to', 'status', 'exp_start_date',
        'exp_end_date', 'progress', 'expected_time', 'parent_task'
    ]

    # Fetch top-level tasks directly associated with the project
    try:
        direct_tasks = frappe.get_list(
            'Task',
            fields=task_fields,
            filters={'project': project_name},
            order_by='subject'
        )
    except Exception as e:
        frappe.log_error(f"Initial task fetch failed for project {project_name}: {e}", frappe.get_traceback())
        return []

    all_tasks = {task['name']: task for task in direct_tasks}
    # A queue of task IDs to fetch children for
    tasks_to_process = [task['name'] for task in direct_tasks]

    # Iteratively fetch children until no new children are found
    while tasks_to_process:
        parent_ids = tasks_to_process
        tasks_to_process = [] # Reset for the next level of children

        try:
            children = frappe.get_list(
                'Task',
                fields=task_fields,
                filters={'parent_task': ('in', parent_ids)},
                order_by='subject'
            )

            for child in children:
                if child['name'] not in all_tasks:
                    all_tasks[child['name']] = child
                    tasks_to_process.append(child['name'])

        except Exception as e:
            frappe.log_error(f"Child task fetch failed for parents {parent_ids}: {e}", frappe.get_traceback())
            # Continue processing with the tasks fetched so far
            break

    return list(all_tasks.values())

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
        # --- CHANGE: Use the new recursive fetch function to get all tasks ---
        tasks = _fetch_all_project_tasks(project)

        # Enhance tasks with assignee names
        for task in tasks:
            assignees = _get_assignee_names('Task', task.get('name'))
            task['assignees'] = assignees  # Keep the detailed list for the UI dialog
            # Create a display string for the 'assigned_to' column
            if assignees:
                task['assigned_to'] = ", ".join([d['full_name'] for d in assignees])
            else:
                task['assigned_to'] = "" # Use empty string for "Unassigned"

        # Build a dictionary for easy lookup and initialize children list
        task_map = {task['name']: task for task in tasks}
        for task in tasks:
            task['children'] = []

        # Create the tree structure by linking children to their parents
        root_tasks = []
        for task in tasks:
            if task.get('parent_task') and task['parent_task'] in task_map:
                parent = task_map[task['parent_task']]
                parent['children'].append(task)
            else:
                # Task is a root task (no parent or parent not in the map)
                root_tasks.append(task)

        return root_tasks

    except Exception as e:
        frappe.log_error(frappe.get_traceback(), f"Error fetching tasks for project {project}")
        return {"error": f"Could not fetch tasks for project {project}. Please check logs."}


@frappe.whitelist()
def update_task_date(task_name, field, value):
    """
    Updates the start or end date of a single task, ensuring the user has
    the necessary permissions on the parent project.

    Args:
        task_name (str): The name (ID) of the task to update.
        field (str): The date field to update ('exp_start_date' or 'exp_end_date').
        value (str): The new date value in 'YYYY-MM-DD' format. Can be None or empty.

    Returns:
        dict: A dictionary indicating the status of the operation.
    """
    if not task_name or not field:
        return {"status": "error", "message": "Task and field are required."}

    if field not in ['exp_start_date', 'exp_end_date']:
        return {"status": "error", "message": "Invalid field specified."}

    try:
        # --- PERMISSION CHECK ---
        # Get the project associated with the task
        project = frappe.db.get_value('Task', task_name, 'project')

        if not project:
            # If a task has no project, deny permission to edit it from this dashboard
            return {"status": "error", "message": "This task is not linked to a project."}

        # Check if the user has 'write' permission on the project.
        # This check respects roles and direct sharing.
        if not frappe.has_permission('Project', ptype='write', doc=project):
            return {"status": "error", "message": "You do not have permission to modify tasks for this project."}
        # --- END PERMISSION CHECK ---

        # Validate and update the date
        task = frappe.get_doc('Task', task_name)

        # Allow clearing the date
        new_date = getdate(value) if value else None

        if field == 'exp_start_date':
            end_date = getdate(task.exp_end_date)
            if end_date and new_date and new_date > end_date:
                return {"status": "error", "message": "Start date cannot be after end date."}

        if field == 'exp_end_date':
            start_date = getdate(task.exp_start_date)
            if start_date and new_date and new_date < start_date:
                return {"status": "error", "message": "End date cannot be before start date."}

        frappe.db.set_value('Task', task_name, field, new_date)
        return {"status": "success"}

    except Exception as e:
        frappe.log_error(frappe.get_traceback(), f"Error updating task {task_name}")
        return {"status": "error", "message": "Could not update task date. Please check the logs."}


@frappe.whitelist()
def update_task_expected_time(task_name, expected_time):
    """
    Updates the expected time of a single task, with validation and permission checks.

    Args:
        task_name (str): The name (ID) of the task to update.
        expected_time (str or float): The new expected time value.

    Returns:
        dict: A dictionary indicating the status of the operation.
    """
    if not task_name:
        return {"status": "error", "message": "Task name is required."}

    try:
        # --- PERMISSION CHECK ---
        project = frappe.db.get_value('Task', task_name, 'project')
        if not project:
            return {"status": "error", "message": "This task is not linked to a project."}

        if not frappe.has_permission('Project', ptype='write', doc=project):
            return {"status": "error", "message": "You do not have permission to modify tasks for this project."}
        # --- END PERMISSION CHECK ---

        # --- VALIDATION ---
        try:
            time_val = float(expected_time)
            if time_val < 0:
                return {"status": "error", "message": "Expected time cannot be negative."}
        except (ValueError, TypeError):
            return {"status": "error", "message": "Invalid input. Expected time must be a number."}
        # --- END VALIDATION ---

        frappe.db.set_value('Task', task_name, 'expected_time', time_val)
        return {"status": "success"}

    except Exception as e:
        frappe.log_error(frappe.get_traceback(), f"Error updating expected time for task {task_name}")
        return {"status": "error", "message": "Could not update task's expected time. See logs for details."}


@frappe.whitelist()
def add_task_assignee(task_name, user_id):
    """
    Assigns a user to a task.

    Args:
        task_name (str): The name (ID) of the task.
        user_id (str): The email/ID of the user to assign.

    Returns:
        dict: Status of the operation and the updated list of assignees.
    """
    if not task_name or not user_id:
        return {"status": "error", "message": "Task and User are required."}

    try:
        # --- PERMISSION CHECK ---
        project = frappe.db.get_value('Task', task_name, 'project')
        if not project or not frappe.has_permission('Project', ptype='write', doc=project):
            return {"status": "error", "message": "You do not have permission to modify this task."}
        # --- END PERMISSION CHECK ---

        # Use Frappe's standard assignment function
        from frappe.desk.form.assign_to import add
        add({
            'doctype': 'Task',
            'name': task_name,
            'assign_to': [user_id]
        })

        # Return the updated list of assignees for the UI
        updated_assignees = _get_assignee_names('Task', task_name)
        return {"status": "success", "assignees": updated_assignees}

    except Exception as e:
        frappe.log_error(frappe.get_traceback(), f"Error assigning user {user_id} to task {task_name}")
        return {"status": "error", "message": "Could not assign user. Please check the logs."}


@frappe.whitelist()
def remove_task_assignee(task_name, user_id):
    """
    Removes a user's assignment from a task.

    Args:
        task_name (str): The name (ID) of the task.
        user_id (str): The email/ID of the user to un-assign.

    Returns:
        dict: Status of the operation and the updated list of assignees.
    """
    if not task_name or not user_id:
        return {"status": "error", "message": "Task and User are required."}

    try:
        # --- PERMISSION CHECK ---
        project = frappe.db.get_value('Task', task_name, 'project')
        if not project or not frappe.has_permission('Project', ptype='write', doc=project):
            return {"status": "error", "message": "You do not have permission to modify this task."}
        # --- END PERMISSION CHECK ---

        # Use Frappe's standard removal function
        from frappe.desk.form.assign_to import remove
        remove('Task', task_name, user_id)

        # Return the updated list of assignees for the UI
        updated_assignees = _get_assignee_names('Task', task_name)
        return {"status": "success", "assignees": updated_assignees}

    except Exception as e:
        frappe.log_error(frappe.get_traceback(), f"Error removing user {user_id} from task {task_name}")
        return {"status": "error", "message": "Could not remove user. Please check the logs."}
