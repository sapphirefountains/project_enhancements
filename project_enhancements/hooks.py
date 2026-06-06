"""Frappe App Hooks.

This file is a central configuration point for the 'Project Enhancements' app,
allowing it to integrate with the Frappe framework. Hooks are used to extend
or modify the core behavior of Frappe by listening to events, overriding
methods, defining scheduled jobs, and more.
"""

app_name = "project_enhancements"
app_title = "Project Enhancements"
app_publisher = "Sapphire Fountains"
app_description = "ERPNext enhancements of Projects for Sapphire Fountains."
app_email = "info@sapphirefountains.com"
app_license = "mit"

# ------------------
# doctype_js
# ------------------
doctype_js = {
	"Project": [
		"project_enhancements/doctype/project/project.js",
		"public/js/project_form_script.js",
	],
	"Opportunity": "project_enhancements/doctype/opportunity/opportunity.js",
	"Address": "project_enhancements/doctype/address/address.js",
}

# ------------------
# fixtures
# ------------------
fixtures = [{"doctype": "Custom Field", "filters": [["dt", "=", "Project"]]}]

# Includes in <head>
# ------------------

# include js, css files in header of desk.html
# Switching to local Frappe-Gantt assets for stability and performance
app_include_css = [
	"/assets/project_enhancements/css/task_tree.css",
	"/assets/project_enhancements/css/frappe-gantt.css"
]
app_include_js = [
	"/assets/project_enhancements/js/lib/frappe-gantt.umd.js",
	# gantt_auto_scroll.js intentionally removed: it was a global MutationObserver
	# that force-scrolled every Gantt container to today on each re-render, fighting
	# the per-instance scroll logic (today on first render, preserve on edits).
	"/assets/project_enhancements/js/task_tree_manager.js",
	"/assets/project_enhancements/js/dashboard_components/column_selector.js",
	# Shared Gantt zoom ladder used by the Project form Schedule tab and the
	# Project Dashboard portfolio Gantt.
	"/assets/project_enhancements/js/gantt_zoom.js",
]

doctype_list_js = {"Task": "project_enhancements/public/js/task_gantt.js"}

# Document Events
# ---------------
doc_events = {
	"Project": {
		"on_update": "project_enhancements.project_enhancements.page.project_dashboard.project_dashboard.publish_realtime_update"
	},
	"Task": {
		"on_update": "project_enhancements.project_enhancements.page.project_dashboard.project_dashboard.publish_realtime_update"
	}
}

# Automatically update python controller files with type annotations for this app.
# export_python_type_annotations = True
