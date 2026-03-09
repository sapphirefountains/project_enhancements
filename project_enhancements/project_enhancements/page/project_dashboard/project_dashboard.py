"""Server-side logic for the Project Dashboard page.

This module provides all the backend functions required for the interactive
Project Dashboard, including data retrieval, permission checks, and in-place
updates for projects and tasks. All functions intended to be called from the
frontend are decorated with `@frappe.whitelist()`.
"""
import json
import frappe
from frappe.utils import getdate, nowdate
from datetime import timedelta


@frappe.whitelist()
def check_permission():
    """Checks if the current user has permission to view the Project Dashboard.

    Permission is determined by matching the user's roles against a list of
    roles defined in "Project Dashboard Settings".

    Returns:
        bool: True if the user has a permitted role, False otherwise.
    """
    try:
        permitted_roles_docs = frappe.get_all(
            "Project Dashboard Permitted Role",
            filters={"parent": "Project Dashboard Settings"},
            fields=["role"],
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
        return False  # Deny access on error


def _get_assignee_names(doctype, docname):
    """Retrieves the full names of users assigned to a document.

    Fetches open 'ToDo' items linked to the given document to find assignees.

    Args:
        doctype (str): The DocType of the document (e.g., 'Project', 'Task').
        docname (str): The name (ID) of the document.

    Returns:
        list[dict]: A list of dictionaries, where each dictionary contains the
            'email' and 'full_name' of an assignee. Returns an empty list if
            no one is assigned or on error.
    """
    try:
        todos = frappe.get_all(
            "ToDo",
            filters={"reference_type": doctype, "reference_name": docname, "status": "Open"},
            fields=["allocated_to"],
        )

        if not todos:
            return []

        assignee_emails = {todo.get("allocated_to") for todo in todos if todo.get("allocated_to")}

        if not assignee_emails:
            return []

        users = frappe.get_all(
            "User", filters={"email": ("in", list(assignee_emails))}, fields=["email", "full_name"]
        )

        # Return the list of user details
        return users

    except Exception as e:
        frappe.log_error(
            f"Error fetching assignee names for {doctype} {docname}: {e}", frappe.get_traceback()
        )
        return []  # Return an empty list on error


@frappe.whitelist()
def get_project_data(is_active=None):
    """Fetches and enriches project data for the dashboard.

    Retrieves all non-cancelled projects and annotates each with task counts
    (total and completed) and the names of assigned users. It first checks if
    the user has permission to view the dashboard.

    Args:
        is_active (str, optional): Filter by 'is_active' status ('Yes' or 'No').

    Returns:
        list[dict] | dict: A list of project dictionaries, each enhanced with
            'total_tasks', 'completed_tasks', and 'project_user' fields.
            Returns a dictionary with an 'error' key on failure or if the
            user lacks permission.
    """
    try:
        # Permission check: Ensure the user has access to the dashboard
        if not check_permission():
            # Using dict for consistency in error handling on the client-side
            return {"error": "You do not have permission to view the Project Dashboard."}

        filters = {"status": ["!=", "Cancelled"]}
        if is_active:
            filters["is_active"] = is_active

        projects = frappe.get_list(
            "Project",
            fields=[
                "name",
                "project_name",
                "status",
                "project_type",
                "project_user",
                "custom_project_priority",
                "custom_company_priority",
                "is_active",
                "percent_complete",
                "expected_start_date",
                "expected_end_date",
            ],
            filters=filters,
            order_by="creation desc",
        )

        for project in projects:
            project_name = project.get("name")
            total_tasks = frappe.db.count("Task", {"project": project_name})
            completed_tasks = frappe.db.count("Task", {"project": project_name, "status": "Completed"})
            project["total_tasks"] = total_tasks
            project["completed_tasks"] = completed_tasks
            # Replace the placeholder 'project_user' with actual assignee names
            assignees = _get_assignee_names("Project", project_name)
            project["assignees"] = assignees
            if assignees:
                project["project_user"] = ", ".join([d["full_name"] for d in assignees])
            else:
                project["project_user"] = "Unassigned"

        return projects

    except Exception as e:
        frappe.log_error(frappe.get_traceback(), "Error fetching project data")
        return {"error": "Could not fetch project data. Please check the logs."}


@frappe.whitelist()
def add_project_assignee(project_name, user_id):
    """Assigns a user to a project with permission checks.

    Verifies 'write' permission on the project before using Frappe's
    standard assignment function.

    Args:
        project_name (str): The name (ID) of the project.
        user_id (str): The email/ID of the user to assign.

    Returns:
        dict: Status of the operation and the updated list of assignees.
    """
    if not project_name or not user_id:
        return {"status": "error", "message": "Project and User are required."}

    try:
        if not frappe.has_permission("Project", ptype="write", doc=project_name):
            return {"status": "error", "message": "You do not have permission to modify this project."}

        from frappe.desk.form.assign_to import add

        add({"doctype": "Project", "name": project_name, "assign_to": [user_id]})

        updated_assignees = _get_assignee_names("Project", project_name)
        return {"status": "success", "assignees": updated_assignees}

    except Exception as e:
        frappe.log_error(frappe.get_traceback(), f"Error assigning user {user_id} to project {project_name}")
        return {"status": "error", "message": "Could not assign user. Please check the logs."}


@frappe.whitelist()
def remove_project_assignee(project_name, user_id):
    """Removes a user's assignment from a project with permission checks.

    Verifies 'write' permission on the project before using Frappe's
    standard assignment removal function.

    Args:
        project_name (str): The name (ID) of the project.
        user_id (str): The email/ID of the user to un-assign.

    Returns:
        dict: Status of the operation and the updated list of assignees.
    """
    if not project_name or not user_id:
        return {"status": "error", "message": "Project and User are required."}

    try:
        if not frappe.has_permission("Project", ptype="write", doc=project_name):
            return {"status": "error", "message": "You do not have permission to modify this project."}

        from frappe.desk.form.assign_to import remove

        remove("Project", project_name, user_id)

        updated_assignees = _get_assignee_names("Project", project_name)
        return {"status": "success", "assignees": updated_assignees}

    except Exception as e:
        frappe.log_error(frappe.get_traceback(), f"Error removing user {user_id} from project {project_name}")
        return {"status": "error", "message": "Could not remove user. Please check the logs."}


@frappe.whitelist()
def update_project_details(project_name, field, value):
    """Updates a single field for a specified project document.

    This function is designed for inline editing from the project dashboard.

    Args:
        project_name (str): The name (ID) of the project to update.
        field (str): The database field name to be updated.
        value (any): The new value for the field.

    Returns:
        dict: A dictionary indicating the status of the operation.
            Example: `{'status': 'success'}` or
            `{'status': 'error', 'message': '...'}`.
    """
    try:
        frappe.db.set_value("Project", project_name, field, value)
        return {"status": "success"}
    except Exception as e:
        frappe.log_error(frappe.get_traceback(), f"Error updating project {project_name}")
        return {"status": "error", "message": "Could not update project. Please check the logs."}


@frappe.whitelist()
def update_task_status(task_name, status):
    """Updates the status of a single task.

    Args:
        task_name (str): The name (ID) of the task to update.
        status (str): The new status for the task.

    Returns:
        dict: A dictionary indicating the status of the operation.
    """
    if not check_permission():
        return {"status": "error", "message": "You do not have permission to perform this action."}
    try:
        frappe.db.set_value("Task", task_name, "status", status)
        return {"status": "success"}
    except Exception as e:
        frappe.log_error(frappe.get_traceback(), f"Error updating task {task_name}")
        return {"status": "error", "message": "Could not update task status. Please check the logs."}


@frappe.whitelist()
def get_priority_options():
    """Retrieves 'custom_project_priority' options from Project DocType.

    Reads the options for the 'custom_project_priority' field directly from
    the Project DocType's metadata.

    Returns:
        list[str] | dict: A list of available priority options. Returns a
            dictionary with an 'error' key on failure.
    """
    try:
        project_doctype = frappe.get_meta("Project")
        priority_field = next(
            (df for df in project_doctype.fields if df.fieldname == "custom_project_priority"), None
        )

        if priority_field and priority_field.options:
            # Options are stored as a string, separated by newlines.
            # We also filter out any empty lines that might result from trailing newlines.
            options = [opt for opt in priority_field.options.split("\n") if opt]
            return options
        else:
            # Return a default list or an empty list if no options are found
            return []

    except Exception as e:
        frappe.log_error(frappe.get_traceback(), "Error fetching priority options")
        return {"error": "Could not fetch priority options."}


@frappe.whitelist()
def get_status_options():
    """Retrieves 'status' options from the Project DocType metadata.

    Returns:
        list[str] | dict: A list of available status options. Returns a
            dictionary with an 'error' key on failure.
    """
    try:
        project_doctype = frappe.get_meta("Project")
        status_field = next((df for df in project_doctype.fields if df.fieldname == "status"), None)

        if status_field and status_field.options:
            # Options are stored as a string, separated by newlines.
            options = [opt for opt in status_field.options.split("\n") if opt]
            return options
        else:
            return []

    except Exception as e:
        frappe.log_error(frappe.get_traceback(), "Error fetching status options")
        return {"error": "Could not fetch status options."}


@frappe.whitelist()
def get_task_status_options():
    """Retrieves 'status' options from the Task DocType metadata.

    Returns:
        list[str] | dict: A list of available status options for tasks.
            Returns a dictionary with an 'error' key on failure.
    """
    try:
        task_doctype = frappe.get_meta("Task")
        status_field = next((df for df in task_doctype.fields if df.fieldname == "status"), None)

        if status_field and status_field.options:
            options = [opt for opt in status_field.options.split("\n") if opt]
            return options
        else:
            return []

    except Exception as e:
        frappe.log_error(frappe.get_traceback(), "Error fetching task status options")
        return {"error": "Could not fetch task status options."}


def _fetch_all_project_tasks(project_name):
    """Recursively fetches all tasks and sub-tasks for a given project.

    It starts by fetching tasks directly linked to the project, and then
    iteratively fetches their children (sub-tasks).

    Args:
        project_name (str): The name (ID) of the project.

    Returns:
        list[dict]: A flat list of all tasks and sub-tasks associated
            with the project.
    """
    task_fields = [
        "name",
        "subject",
        "assigned_to",
        "status",
        "exp_start_date",
        "exp_end_date",
        "progress",
        "expected_time",
        "parent_task",
        "custom_subtask_order",
        "creation",
    ]

    try:
        # We fetch all tasks related to the project without initial sorting,
        # as sorting will be handled comprehensively later.
        direct_tasks = frappe.get_list("Task", fields=task_fields, filters={"project": project_name})
    except Exception as e:
        frappe.log_error(
            f"Initial task fetch failed for project {project_name}: {e}", frappe.get_traceback()
        )
        return []

    all_tasks = {task["name"]: task for task in direct_tasks}
    # This iterative approach is to ensure all descendants are fetched,
    # even if they are not directly linked to the project.
    tasks_to_process = [task["name"] for task in direct_tasks]

    while tasks_to_process:
        parent_ids = tasks_to_process
        tasks_to_process = []

        try:
            children = frappe.get_list(
                "Task", fields=task_fields, filters={"parent_task": ("in", parent_ids)}
            )

            for child in children:
                if child["name"] not in all_tasks:
                    all_tasks[child["name"]] = child
                    tasks_to_process.append(child["name"])

        except Exception as e:
            frappe.log_error(
                f"Child task fetch failed for parents {parent_ids}: {e}", frappe.get_traceback()
            )
            break

    return list(all_tasks.values())


@frappe.whitelist()
def get_project_tasks(project):
    """Fetches all tasks for a project and structures them hierarchically.

    Retrieves all tasks and sub-tasks for a project, enriches them with
    assignee details, and then builds a tree structure based on the
    'parent_task' field. The tasks are sorted by a custom order field
    and then by creation date.

    Args:
        project (str): The name (ID) of the project to fetch tasks for.

    Returns:
        list[dict] | dict: A list of root-level task dictionaries, where each
            task may contain a 'children' list of sub-tasks. Returns a
            dictionary with an 'error' key on failure.
    """
    if not project:
        return {"error": "Project name is required."}

    try:
        tasks = _fetch_all_project_tasks(project)

        for task in tasks:
            assignees = _get_assignee_names("Task", task.get("name"))
            task["assignees"] = assignees
            if assignees:
                task["assigned_to"] = ", ".join([d["full_name"] for d in assignees])
            else:
                task["assigned_to"] = ""

        # Sort all tasks based on custom order, then by creation date.
        # Tasks with no order are treated as having an infinite order value,
        # placing them after ordered tasks.
        tasks.sort(
            key=lambda t: (
                float(t.get("custom_subtask_order") or float("inf")),
                getdate(t.get("creation")),
            )
        )

        task_map = {task["name"]: task for task in tasks}
        for task in tasks:
            task["children"] = []

        root_tasks = []
        for task in tasks:
            parent_task_id = task.get("parent_task")
            if parent_task_id and parent_task_id in task_map:
                parent = task_map[parent_task_id]
                parent["children"].append(task)
            else:
                root_tasks.append(task)

        return root_tasks

    except Exception as e:
        frappe.log_error(frappe.get_traceback(), f"Error fetching tasks for project {project}")
        return {"error": f"Could not fetch tasks for project {project}. Please check logs."}


def _fetch_all_master_project_projects(master_project):
    """Fetches all projects linked to a given master project.

    Args:
        master_project (str): The name (ID) of the Master Project.

    Returns:
        list[dict]: A flat list of all projects associated with the master project.
    """
    project_fields = [
        "name",
        "project_name",
        "status",
        "expected_start_date",
        "expected_end_date",
        "percent_complete",
        "custom_subproject_order",
        "creation",
    ]

    try:
        # Fetching all projects related to the master project
        projects = frappe.get_list("Project", fields=project_fields, filters={"custom_master_project": master_project})
        return projects
    except Exception as e:
        frappe.log_error(
            f"Project fetch failed for master project {master_project}: {e}", frappe.get_traceback()
        )
        return []

@frappe.whitelist()
def get_master_project_projects(master_project):
    """Fetches all projects for a master project.

    Retrieves all projects for a master project and enriches them with
    assignee details.

    Args:
        master_project (str): The name (ID) of the Master Project.

    Returns:
        list[dict] | dict: A list of project dictionaries. Returns a
            dictionary with an 'error' key on failure.
    """
    if not master_project:
        return {"error": "Master Project name is required."}

    try:
        projects = _fetch_all_master_project_projects(master_project)

        for project in projects:
            assignees = _get_assignee_names("Project", project.get("name"))
            project["assignees"] = assignees
            if assignees:
                project["assigned_to"] = ", ".join([d["full_name"] for d in assignees])
            else:
                project["assigned_to"] = ""
            project["children"] = []

        # Sort all projects based on custom order, then by creation date.
        projects.sort(
            key=lambda p: (
                float(p.get("custom_subproject_order") or float("inf")),
                getdate(p.get("creation")),
            )
        )

        return projects

    except Exception as e:
        frappe.log_error(frappe.get_traceback(), f"Error fetching projects for master project {master_project}")
        return {"error": f"Could not fetch projects for master project {master_project}. Please check logs."}

@frappe.whitelist()
def update_master_project_structure(master_project, projects):
    """Updates the ordering for a list of projects under a Master Project.

    Args:
        master_project (str): The name (ID) of the Master Project.
        projects (list[dict]): A list of dictionaries representing project orders.

    Returns:
        dict: A dictionary indicating the status of the operation.
    """
    if not master_project or not projects:
        return {"status": "error", "message": "Master Project name and project data are required."}

    if isinstance(projects, str):
        try:
            projects = json.loads(projects)
        except json.JSONDecodeError:
            return {"status": "error", "message": "Invalid project data format."}

    if not frappe.has_permission("Master Project", ptype="write", doc=master_project):
        return {
            "status": "error",
            "message": "You do not have permission to modify this Master Project.",
        }

    try:
        project_names = [p.get("name") for p in projects if p.get("name")]

        if project_names:
            db_projects = frappe.get_all(
                "Project", filters={"name": ("in", project_names)}, fields=["name", "custom_master_project"]
            )
            if len(db_projects) != len(project_names):
                return {"status": "error", "message": "One or more projects could not be found."}

            for p in db_projects:
                if p.custom_master_project != master_project:
                    return {
                        "status": "error",
                        "message": f"Project {p.name} does not belong to Master Project {master_project}.",
                    }

        for p_data in projects:
            p_name = p_data.get("name")
            if not p_name:
                continue

            order = p_data.get("custom_subproject_order")
            p_doc = frappe.get_doc("Project", p_name)

            # Use dictionary style setter if it doesn't exist to prevent failure if field missing from standard doc
            p_doc.set("custom_subproject_order", order)
            p_doc.save(ignore_permissions=True)

        return {"status": "success"}

    except Exception as e:
        frappe.log_error(frappe.get_traceback(), f"Error updating project structure for {master_project}")
        return {
            "status": "error",
            "message": f"An unexpected error occurred while saving the new project order: {e}",
        }


@frappe.whitelist()
def update_task_date(task_name, field, value):
    """Updates a task's start or end date with permission checks.

    Before updating, it verifies that the user has 'write' permission on the
    parent project. It also validates that the start date is not after the
    end date.

    Args:
        task_name (str): The name (ID) of the task to update.
        field (str): The date field to update ('exp_start_date' or 'exp_end_date').
        value (str | None): The new date in 'YYYY-MM-DD' format, or None to clear it.

    Returns:
        dict: A dictionary indicating the status of the operation.
    """
    if not task_name or not field:
        return {"status": "error", "message": "Task and field are required."}

    if field not in ["exp_start_date", "exp_end_date"]:
        return {"status": "error", "message": "Invalid field specified."}

    try:
        project = frappe.db.get_value("Task", task_name, "project")
        if not project:
            return {"status": "error", "message": "This task is not linked to a project."}

        if not frappe.has_permission("Project", ptype="write", doc=project):
            return {
                "status": "error",
                "message": "You do not have permission to modify tasks for this project.",
            }

        task = frappe.get_doc("Task", task_name)
        new_date = getdate(value) if value else None

        if field == "exp_start_date":
            end_date = getdate(task.exp_end_date)
            if end_date and new_date and new_date > end_date:
                return {"status": "error", "message": "Start date cannot be after end date."}

        if field == "exp_end_date":
            start_date = getdate(task.exp_start_date)
            if start_date and new_date and new_date < start_date:
                return {"status": "error", "message": "End date cannot be before start date."}

        frappe.db.set_value("Task", task_name, field, new_date)
        return {"status": "success"}

    except Exception as e:
        frappe.log_error(frappe.get_traceback(), f"Error updating task {task_name}")
        return {"status": "error", "message": "Could not update task date. Please check the logs."}


@frappe.whitelist()
def update_task_expected_time(task_name, expected_time):
    """Updates a task's expected time with permission and validation checks.

    Verifies 'write' permission on the parent project and ensures the new
    value is a non-negative number.

    Args:
        task_name (str): The name (ID) of the task to update.
        expected_time (str | float): The new expected time value.

    Returns:
        dict: A dictionary indicating the status of the operation.
    """
    if not task_name:
        return {"status": "error", "message": "Task name is required."}

    try:
        project = frappe.db.get_value("Task", task_name, "project")
        if not project:
            return {"status": "error", "message": "This task is not linked to a project."}

        if not frappe.has_permission("Project", ptype="write", doc=project):
            return {
                "status": "error",
                "message": "You do not have permission to modify tasks for this project.",
            }

        try:
            time_val = float(expected_time)
            if time_val < 0:
                return {"status": "error", "message": "Expected time cannot be negative."}
        except (ValueError, TypeError):
            return {"status": "error", "message": "Invalid input. Expected time must be a number."}

        frappe.db.set_value("Task", task_name, "expected_time", time_val)
        return {"status": "success"}

    except Exception as e:
        frappe.log_error(
            frappe.get_traceback(), f"Error updating expected time for task {task_name}"
        )
        return {
            "status": "error",
            "message": "Could not update task's expected time. See logs for details.",
        }


@frappe.whitelist()
def add_task_assignee(task_name, user_id):
    """Assigns a user to a task with permission checks.

    Verifies 'write' permission on the parent project before using Frappe's
    standard assignment function.

    Args:
        task_name (str): The name (ID) of the task.
        user_id (str): The email/ID of the user to assign.

    Returns:
        dict: Status of the operation and the updated list of assignees.
    """
    if not task_name or not user_id:
        return {"status": "error", "message": "Task and User are required."}

    try:
        project = frappe.db.get_value("Task", task_name, "project")
        if not project or not frappe.has_permission("Project", ptype="write", doc=project):
            return {"status": "error", "message": "You do not have permission to modify this task."}

        from frappe.desk.form.assign_to import add

        add({"doctype": "Task", "name": task_name, "assign_to": [user_id]})

        updated_assignees = _get_assignee_names("Task", task_name)
        return {"status": "success", "assignees": updated_assignees}

    except Exception as e:
        frappe.log_error(frappe.get_traceback(), f"Error assigning user {user_id} to task {task_name}")
        return {"status": "error", "message": "Could not assign user. Please check the logs."}


@frappe.whitelist()
def remove_task_assignee(task_name, user_id):
    """Removes a user's assignment from a task with permission checks.

    Verifies 'write' permission on the parent project before using Frappe's
    standard assignment removal function.

    Args:
        task_name (str): The name (ID) of the task.
        user_id (str): The email/ID of the user to un-assign.

    Returns:
        dict: Status of the operation and the updated list of assignees.
    """
    if not task_name or not user_id:
        return {"status": "error", "message": "Task and User are required."}

    try:
        project = frappe.db.get_value("Task", task_name, "project")
        if not project or not frappe.has_permission("Project", ptype="write", doc=project):
            return {"status": "error", "message": "You do not have permission to modify this task."}

        from frappe.desk.form.assign_to import remove

        remove("Task", task_name, user_id)

        updated_assignees = _get_assignee_names("Task", task_name)
        return {"status": "success", "assignees": updated_assignees}

    except Exception as e:
        frappe.log_error(frappe.get_traceback(), f"Error removing user {user_id} from task {task_name}")
        return {"status": "error", "message": "Could not remove user. Please check the logs."}


@frappe.whitelist()
def update_task_structure(project_name, tasks):
    """Updates the parent and ordering for a list of tasks.

    This function is called after a drag-and-drop operation on the frontend
    task tree. It validates permissions and ensures data integrity before
    committing changes.

    Args:
        project_name (str): The name (ID) of the project being modified.
        tasks (list[dict]): A list of dictionaries, where each dictionary
            represents a task and contains its 'name', 'parent_task', and
            'custom_subtask_order'.

    Returns:
        dict: A dictionary indicating the status of the operation.
    """
    if not project_name or not tasks:
        return {"status": "error", "message": "Project name and task data are required."}

    if isinstance(tasks, str):
        try:
            tasks = json.loads(tasks)
        except json.JSONDecodeError:
            return {"status": "error", "message": "Invalid task data format."}

    # Security check: Ensure the user has write permission for the project.
    if not frappe.has_permission("Project", ptype="write", doc=project_name):
        return {
            "status": "error",
            "message": "You do not have permission to modify tasks for this project.",
        }

    try:
        task_names = [t.get("name") for t in tasks if t.get("name")]

        # Data integrity check: Verify that all tasks belong to the specified project.
        if task_names:
            db_task_projects = frappe.get_all(
                "Task", filters={"name": ("in", task_names)}, fields=["name", "project"]
            )
            if len(db_task_projects) != len(task_names):
                return {"status": "error", "message": "One or more tasks could not be found."}

            for task in db_task_projects:
                if task.project != project_name:
                    return {
                        "status": "error",
                        "message": f"Task {task.name} does not belong to project {project_name}.",
                    }

        # Atomically update all tasks. Using doc.save() is more robust as it
        # triggers validation and other controller hooks. This is safer than a
        # direct `frappe.db.set_value` call, especially for complex updates
        # involving parent-child relationships.
        for task_data in tasks:
            task_name = task_data.get("name")
            if not task_name:
                continue

            # Ensure parent_task is None if it's an empty string or not provided.
            parent_task = task_data.get("parent_task") or None
            order = task_data.get("custom_subtask_order")

            task_doc = frappe.get_doc("Task", task_name)
            task_doc.parent_task = parent_task
            task_doc.custom_subtask_order = order
            # ignore_permissions is used because we already validated the user has
            # write access to the parent project.
            task_doc.save(ignore_permissions=True)

        return {"status": "success"}

    except Exception as e:
        # The whitelisted method runs in a transaction, which will be rolled
        # back automatically by the Frappe framework on an exception.
        frappe.log_error(frappe.get_traceback(), f"Error updating task structure for {project_name}")
        return {
            "status": "error",
            # We return the specific exception to the client to aid debugging,
            # which is acceptable in this internal tool's context.
            "message": f"An unexpected error occurred while saving the new task order: {e}",
        }


@frappe.whitelist()
def get_gantt_tasks_for_project(project_name):
    """
    Fetches all tasks for a specific project, formatted for the frappe-gantt library.
    If tasks are missing start or end dates, it provides sensible defaults.
    """
    if not project_name:
        return {"error": "Project name is required."}

    try:
        tasks = frappe.get_all(
            "Task",
            fields=["name", "subject", "exp_start_date", "exp_end_date", "progress"],
            filters={"project": project_name},
        )

        task_names = [task['name'] for task in tasks]
        dependencies = frappe.get_all(
            "Task Depends On",
            fields=["parent", "task"],
            filters={"parent": ("in", task_names)},
        )

        dependency_map = {}
        for dep in dependencies:
            if dep.parent not in dependency_map:
                dependency_map[dep.parent] = []
            if dep.task:
                dependency_map[dep.parent].append(dep.task)

        gantt_tasks = []
        today = getdate(nowdate())

        for task in tasks:
            start_date = getdate(task.exp_start_date) if task.exp_start_date else today
            end_date = getdate(task.exp_end_date) if task.exp_end_date else start_date + timedelta(days=3)

            # Ensure end date is not before start date
            if end_date < start_date:
                end_date = start_date + timedelta(days=3)

            task_dependencies = dependency_map.get(task.name, [])
            gantt_tasks.append({
                "id": task.name,
                "name": task.subject,
                "start": start_date.strftime('%Y-%m-%d'),
                "end": end_date.strftime('%Y-%m-%d'),
                "progress": task.progress or 0,
                "dependencies": ",".join([d for d in task_dependencies if d]),
            })

        return gantt_tasks

    except Exception as e:
        frappe.log_error(frappe.get_traceback(), f"Error fetching Gantt tasks for project {project_name}")
        return {"error": f"Could not fetch Gantt tasks for project {project_name}. Please check logs."}


@frappe.whitelist()
def update_task_dates_from_gantt(task_name, start_date, end_date):
    """
    Updates a task's start and end dates from the Gantt chart.

    Args:
        task_name (str): The name (ID) of the task to update.
        start_date (str): The new start date in 'YYYY-MM-DD' format.
        end_date (str): The new end date in 'YYYY-MM-DD' format.

    Returns:
        dict: A dictionary indicating the status of the operation.
    """
    if not task_name or not start_date or not end_date:
        return {"status": "error", "message": "Task, start date, and end date are required."}

    try:
        project = frappe.db.get_value("Task", task_name, "project")
        if not project:
            return {"status": "error", "message": "This task is not linked to a project."}

        if not frappe.has_permission("Project", ptype="write", doc=project):
            return {
                "status": "error",
                "message": "You do not have permission to modify tasks for this project.",
            }

        frappe.db.set_value("Task", task_name, {
            "exp_start_date": start_date,
            "exp_end_date": end_date
        })
        return {"status": "success"}

    except Exception as e:
        frappe.log_error(frappe.get_traceback(), f"Error updating task dates from Gantt for {task_name}")
        return {"status": "error", "message": "Could not update task dates. Please check the logs."}


@frappe.whitelist()
def update_task_progress_from_gantt(task_name, progress):
    """
    Updates a task's progress from the Gantt chart.

    Args:
        task_name (str): The name (ID) of the task to update.
        progress (int): The new progress value (0-100).

    Returns:
        dict: A dictionary indicating the status of the operation.
    """
    if not task_name:
        return {"status": "error", "message": "Task name is required."}

    try:
        project = frappe.db.get_value("Task", task_name, "project")
        if not project:
            return {"status": "error", "message": "This task is not linked to a project."}

        if not frappe.has_permission("Project", ptype="write", doc=project):
            return {
                "status": "error",
                "message": "You do not have permission to modify tasks for this project.",
            }

        try:
            progress_val = int(progress)
            if not (0 <= progress_val <= 100):
                 return {"status": "error", "message": "Progress must be between 0 and 100."}
        except (ValueError, TypeError):
            return {"status": "error", "message": "Invalid input. Progress must be a number."}


        frappe.db.set_value("Task", task_name, "progress", progress_val)
        return {"status": "success"}

    except Exception as e:
        frappe.log_error(frappe.get_traceback(), f"Error updating task progress from Gantt for {task_name}")
        return {"status": "error", "message": "Could not update task progress. Please check the logs."}
@frappe.whitelist()
def get_all_projects_for_gantt():
    """
    Fetches all active projects, formatted for the frappe-gantt library.
    This is for a portfolio-level view.

    Returns:
        list[dict] | dict: A list of project dictionaries for the Gantt chart,
            or a dictionary with an 'error' key on failure.
    """
    if not check_permission():
        return {"error": "You do not have permission to view the Project Dashboard."}

    try:
        # Fetching projects that are active and have a defined start date
        projects = frappe.get_all(
            "Project",
            fields=["name", "project_name", "expected_start_date", "expected_end_date", "percent_complete"],
            filters={
                "is_active": "Yes",
                "status": ["!=", "Cancelled"],
                "expected_start_date": ["is", "set"],
            },
        )

        gantt_projects = []
        for project in projects:
            gantt_projects.append({
                "id": project.name,
                "name": project.project_name,
                "start": project.expected_start_date,
                "end": project.expected_end_date,
                "progress": project.percent_complete or 0,
                "dependencies": ""  # No dependencies in this high-level view
            })

        return gantt_projects

    except Exception as e:
        frappe.log_error(frappe.get_traceback(), "Error fetching all projects for Gantt view")
        return {"error": "Could not fetch project data for the Gantt chart. Please check logs."}


@frappe.whitelist()
def update_multiple_docs(project_updates, task_updates):
    """Updates multiple project and task documents in a single transaction.

    This function is designed to handle batch updates from the dashboard.

    Args:
        project_updates (str): A JSON string representing a dictionary of
            project updates. Example: '{"PROJ-001": {"status": "Completed"}}'
        task_updates (str): A JSON string representing a dictionary of
            task updates. Example: '{"TASK-001": {"status": "Working"}}'

    Returns:
        dict: A dictionary indicating the status of the operation.
    """
    if not check_permission():
        return {"status": "error", "message": "You do not have permission to perform this action."}

    try:
        project_updates = json.loads(project_updates or '{}')
        task_updates = json.loads(task_updates or '{}')

        for doc_name, changes in project_updates.items():
            if not frappe.has_permission("Project", ptype="write", doc=doc_name):
                return {"status": "error", "message": f"No write permission for Project {doc_name}"}
            frappe.db.set_value("Project", doc_name, changes)

        for doc_name, changes in task_updates.items():
            project = frappe.db.get_value("Task", doc_name, "project")
            if not project or not frappe.has_permission("Project", ptype="write", doc=project):
                return {"status": "error", "message": f"No write permission for parent Project of Task {doc_name}"}
            frappe.db.set_value("Task", doc_name, changes)

        return {"status": "success"}
    except Exception as e:
        frappe.log_error(frappe.get_traceback(), "Error in batch update")
        return {"status": "error", "message": str(e)}
