import frappe

def trigger_server_side(doc, method):
    """
    Hook function for the Master Project DocType.
    This function will be triggered based on doc_events in hooks.py.
    """
    message = f"Master Project '{doc.name}' event '{method}' was triggered."

    # 1. Print to the console (useful if running bench start directly in dev)
    print("=" * 50)
    print("SERVER SIDE TRIGGER WORKS")
    print(message)
    print("=" * 50)

    # 2. Add to Frappe's Error Log (Error Log list in UI)
    frappe.log_error(message=message, title="Master Project Connection Success")

    # 3. Send a message to the user UI
    frappe.msgprint(msg=message, title="Server Trigger Success", indicator="green")
