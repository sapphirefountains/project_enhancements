import frappe

def link_project_to_material_request(doc, method):
    """Link a Material Request to a Project based on the 'custom_project' field.

    This function is triggered on the 'before_save' event of the Material
    Request DocType. It checks for a value in the 'custom_project' field and,
    if present, sets the standard 'project' field to establish a formal link.
    """
    if doc.custom_project:
        doc.project = doc.custom_project
