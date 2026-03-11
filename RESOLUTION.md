# Resolution: "Master Project" Hook/Controller Connection Failure

## Root Cause Analysis
The "Master Project" DocType was created through the Frappe/ERPNext UI (`Custom=1`), which means its definition exists solely in the database and not natively within an app folder. When a DocType is created this way, the Frappe framework completely ignores standard controller files (e.g., `app_name/doctype/master_project/master_project.py` or `master_project.js`).

Because it lacks standard module associations and standard controller loading mechanisms, attempting to place files in `project_enhancements/doctype/master_project/` and hoping they execute will fail silently. The correct way to inject business logic and frontend JS into a `Custom=1` DocType is by leveraging `hooks.py`.

The previous setup failed because the hooks might not have matched correctly, cache caching prevented updates, or the python function lacked proper server-side hook registration.

## Resolution Order
1. **Frontend JS Registration**: Register the client-side form script via `doctype_js` in `hooks.py`. This explicitly tells Frappe "Whenever the 'Master Project' form is loaded, also load this specific JS file."
2. **Backend Controller Creation**: Create a standard Python file within the module folder (e.g., `project_enhancements/project_enhancements/master_project.py`) with a dedicated hook function.
3. **Backend Event Registration**: Map document lifecycle events (`validate`, `on_update`) for "Master Project" to the newly created python function via `doc_events` in `hooks.py`.
4. **Environment Cache Invalidation**: Since this is a production setup, Supervisor/gunicorn must be restarted to recognize the Python code/hook changes, and the site cache must be cleared so the browser recognizes the new JS mapping.

---

## Environment Commands Checklist (Production)

Run the following commands from your `frappe-bench` directory in sequence to force the connection:

```bash
# 1. Ensure any new pyc files are cleaned (optional but safe)
find . -name "*.pyc" -delete

# 2. Build the assets to ensure the JS file is properly mapped and minified by bench
bench build --app project_enhancements

# 3. Clear the site cache
bench --site [your-site-name] clear-cache

# 4. Migrate the site to ensure database sync (if required by other changes)
bench --site [your-site-name] migrate

# 5. Restart supervisor (Crucial for python hook changes to take effect)
sudo supervisorctl restart all
# OR if using bench restart
bench restart
```

---

## Exact Code Blocks

### 1. `hooks.py`
Update `hooks.py` to point directly to your files:

```python
# Inject custom javascript to DocType forms
doctype_js = {
    # ... other doctypes ...
    "Master Project": ["project_enhancements/public/js/master_project.js"]
}

# Hook into document lifecycle events
doc_events = {
    "Master Project": {
        "validate": "project_enhancements.project_enhancements.master_project.trigger_server_side",
        "on_update": "project_enhancements.project_enhancements.master_project.trigger_server_side"
    }
}
```

### 2. `master_project.js` (Frontend Trigger)
File Location: `project_enhancements/public/js/master_project.js`

```javascript
console.log("master_project.js loaded successfully.");

frappe.ui.form.on('Master Project', {
    onload: function(frm) {
        console.log("Master Project form 'onload' triggered.");
        console.error("Code is working - ONLOAD"); // Foolproof trigger

        // This will pop up a message immediately on load
        frappe.msgprint({
            title: __('Connection Success'),
            indicator: 'green',
            message: __('The frontend Javascript controller is successfully connected!')
        });
    },
    refresh: function(frm) {
        console.log("Master Project form 'refresh' triggered.");
        console.error("Code is working - REFRESH");

        // Existing render logic can stay here
        // const targetField = frm.fields_dict['project_list']; ...
    }
});
```

### 3. `master_project.py` (Backend Server Log)
File Location: `project_enhancements/project_enhancements/master_project.py`

```python
import frappe

def trigger_server_side(doc, method):
    """
    Hook function for the Master Project DocType.
    This function will be triggered based on doc_events in hooks.py.
    """
    message = f"Master Project '{doc.name}' event '{method}' was triggered."

    # 1. Print to the console/supervisor logs
    print("=" * 50)
    print("SERVER SIDE TRIGGER WORKS")
    print(message)
    print("=" * 50)

    # 2. Add to Frappe's Error Log (Can be viewed in Error Log list in UI)
    frappe.log_error(message=message, title="Master Project Connection Success")

    # 3. Send a message to the user UI upon save/update
    frappe.msgprint(msg=message, title="Server Trigger Success", indicator="green")
```
