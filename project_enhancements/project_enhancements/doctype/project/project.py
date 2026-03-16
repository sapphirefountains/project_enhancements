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
def sync_master_project(doc, method=None):
    """
    Syncs the Project with the corresponding Master Project child table 'projects'.
    If custom_master_project is set, adds this project to the Master Project.
    If custom_master_project was changed, removes this project from the old Master Project.
    """

    # We use get_doc_before_save to find out if the custom_master_project changed
    doc_before_save = doc.get_doc_before_save()
    old_master_project = doc_before_save.custom_master_project if doc_before_save else None
    new_master_project = doc.custom_master_project

    # If the master project didn't change, there's nothing to do
    if old_master_project == new_master_project:
        return

    # Remove from old Master Project if it existed
    if old_master_project:
        try:
            old_mp_doc = frappe.get_doc("Master Project", old_master_project)
            # Find the row in the child table where project is this doc
            rows_to_remove = [row for row in old_mp_doc.projects if row.project == doc.name]
            if rows_to_remove:
                for row in rows_to_remove:
                    old_mp_doc.remove(row)
                old_mp_doc.save(ignore_permissions=True)
        except frappe.DoesNotExistError:
            pass # Old Master Project was deleted

    # Add to new Master Project if one is selected
    if new_master_project:
        new_mp_doc = frappe.get_doc("Master Project", new_master_project)
        # Only add if it's not already in the table
        if not any(row.project == doc.name for row in new_mp_doc.projects):
            new_mp_doc.append("projects", {"project": doc.name})
            new_mp_doc.save(ignore_permissions=True)
