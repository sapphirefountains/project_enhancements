import frappe

# This is a "decorator" that marks the function as safe to be called
# from the browser. It's a security feature.
@frappe.whitelist()
def get_project_grouping_option():
    """Provides list view settings for the Project doctype.

    This function is called via a client-side script to dynamically configure
    the list view. It specifies the field by which the project list should be
    grouped.

    Returns:
        dict: A dictionary containing the list view settings. For example:
            {'group_by': 'project_type'}
    """
    # These print() statements are for debugging. They will appear in your
    # terminal window where the `bench start` command is running.
    print("--- SERVER SCRIPT DEBUG ---")
    print("Python function 'get_project_grouping_option' was called successfully.")
    
    settings = {
        'group_by': 'project_type'
    }
    
    # This log shows the exact data being sent back to the browser.
    print(f"Returning settings: {settings}")
    print("--------------------------")
    
    # This sends the `settings` dictionary back to the browser as the response.
    return settings
