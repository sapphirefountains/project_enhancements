"""Custom scripts for the Project doctype to enhance list view functionality."""

import frappe


@frappe.whitelist()
def get_project_grouping_option():
    """Provides list view settings to group projects by project type.

    This function is called from a client-side script to dynamically configure
    the list view settings for the Project doctype. It is used to set the
    default grouping behavior.

    Returns:
        dict: A dictionary specifying that projects should be grouped by the
            `project_type` field. Example: `{'group_by': 'project_type'}`.
    """
    # These print() statements are for debugging. They will appear in your
    # terminal window where the `bench start` command is running.
    print("--- SERVER SCRIPT DEBUG ---")
    print("Python function 'get_project_grouping_option' was called successfully.")

    settings = {"group_by": "project_type"}

    # This log shows the exact data being sent back to the browser.
    print(f"Returning settings: {settings}")
    print("--------------------------")

    # This sends the `settings` dictionary back to the browser as the response.
    return settings


def validate_project_status(doc, method):
    """Validate and update the project status before saving.

    This function is triggered by a `before_save` hook. It checks if the
    project status is 'Open' and, if so, changes it to 'Active'. This is
    a workaround for a validation error that prevents projects from being
    created or saved with the status 'Open'.

    Args:
        doc (frappe.model.document.Document): The project document being saved.
        method (str): The method that triggered the hook (e.g., 'on_update').
    """
    if doc.is_new() and doc.status == "Open":
        doc.status = "Active"
