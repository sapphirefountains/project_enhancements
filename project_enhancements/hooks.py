# -*- coding: utf-8 -*-
"""Frappe App Hooks.

This file is a central configuration point for the 'Project Enhancements' app,
allowing it to integrate with the Frappe framework. Hooks are used to extend
or modify the core behavior of Frappe by listening to events, overriding
methods, defining scheduled jobs, and more.

Each variable or dictionary in this file corresponds to a specific type of
hook. For example:
- `doc_events`: Trigger custom functions on document lifecycle events (e.g.,
  on_update, on_submit).
- `scheduler_events`: Define background jobs to run at specified intervals
  (e.g., daily, weekly).
- `override_doctype_class`: Replace a standard DocType controller class with a
  custom one.
- `doctype_js`, `doctype_list_js`: Inject custom JavaScript into DocType views.

For a full list and explanation of available hooks, see the Frappe framework
documentation on Hooks.
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
# This hook tells the Frappe framework to load your custom JavaScript file
# on the Project doctype's form view. The path is relative to the app's root.

doctype_js = {
	"Project": ["project_enhancements/doctype/project/project.js", "project_enhancements/public/js/project_form_script.js"],
	"Opportunity": "project_enhancements/doctype/opportunity/opportunity.js",
	"Address": "project_enhancements/doctype/address/address.js",
	"Master Project": ["project_enhancements/public/js/master_project_form_script.js"]
}

# ------------------
# fixtures
# ------------------
# This hook tells the Frappe framework to export/import the custom fields
# you have created for the Project doctype. This ensures that the fields
# "Gantt Chart" and "Gantt Chart View" are created in the database when
# the app is installed or migrated.

fixtures = [
    {
        "doctype": "Custom Field",
        "filters": [
            ["dt", "=", "Project"]
        ]
    }
]

# Apps
# ------------------

# required_apps = []

# Each item in the list will be shown as an app in the apps page
# add_to_apps_screen = [
# 	{
# 		"name": "project_enhancements",
# 		"logo": "/assets/project_enhancements/logo.png",
# 		"title": "Project Enhancements",
# 		"route": "/project_enhancements",
# 		"has_permission": "project_enhancements.api.permission.has_app_permission"
# 	}
# ]

# Includes in <head>
# ------------------

# include js, css files in header of desk.html
app_include_css = "/assets/project_enhancements/css/task_tree.css"
app_include_js = [
    "/assets/project_enhancements/js/gantt_auto_scroll.js",
    "/assets/project_enhancements/js/task_tree_manager.js"
]

# include js, css files in header of web template
# web_include_css = "/assets/project_enhancements/css/project_enhancements.css"
# web_include_js = "/assets/project_enhancements/js/project_enhancements.js"

# include custom scss in every website theme (without file extension ".scss")
# website_theme_scss = "project_enhancements/public/scss/website"

# include js, css files in header of web form
# webform_include_js = {"doctype": "public/js/doctype.js"}
# webform_include_css = {"doctype": "public/css/doctype.css"}

# include js in page
# page_js = {"page" : "public/js/file.js"}

# include js in doctype views
# doctype_js = {"doctype" : "public/js/doctype.js"}
doctype_list_js = {
    "Task": "project_enhancements/public/js/task_gantt.js"
}
# doctype_tree_js = {"doctype" : "public/js/doctype_tree.js"}
# doctype_calendar_js = {"doctype" : "public/js/doctype_calendar.js"}

# Svg Icons
# ------------------
# include app icons in desk
# app_include_icons = "project_enhancements/public/icons.svg"

# Home Pages
# ----------

# application home page (will override Website Settings)
# home_page = "login"

# website user home page (by Role)
# role_home_page = {
# 	"Role": "home_page"
# }

# Generators
# ----------

# automatically create page for each record of this doctype
# website_generators = ["Web Page"]

# Jinja
# ----------

# add methods and filters to jinja environment
# jinja = {
# 	"methods": "project_enhancements.utils.jinja_methods",
# 	"filters": "project_enhancements.utils.jinja_filters"
# }

# Installation
# ------------

# before_install = "project_enhancements.install.before_install"
# after_install = "project_enhancements.install.after_install"

# Uninstallation
# ------------

# before_uninstall = "project_enhancements.uninstall.before_uninstall"
# after_uninstall = "project_enhancements.uninstall.after_uninstall"

# Integration Setup
# ------------------
# To set up dependencies/integrations with other apps
# Name of the app being installed is passed as an argument

# before_app_install = "project_enhancements.utils.before_app_install"
# after_app_install = "project_enhancements.utils.after_app_install"

# Integration Cleanup
# -------------------
# To clean up dependencies/integrations with other apps
# Name of the app being uninstalled is passed as an argument

# before_app_uninstall = "project_enhancements.utils.before_app_uninstall"
# after_app_uninstall = "project_enhancements.utils.after_app_uninstall"

# Desk Notifications
# ------------------
# See frappe.core.notifications.get_notification_config

# notification_config = "project_enhancements.notifications.get_notification_config"

# Permissions
# -----------
# Permissions evaluated in scripted ways

# permission_query_conditions = {
# 	"Event": "frappe.desk.doctype.event.event.get_permission_query_conditions",
# }
#
# has_permission = {
# 	"Event": "frappe.desk.doctype.event.event.has_permission",
# }

# DocType Class
# ---------------
# Override standard doctype classes

# override_doctype_class = {
# 	"ToDo": "custom_app.overrides.CustomToDo"
# }

# Document Events
# ---------------
# Hook on document methods and events

# doc_events = {
# 	"*": {
# 		"on_update": "method",
# 		"on_cancel": "method",
# 		"on_trash": "method"
# 	}
# }

# Scheduled Tasks
# ---------------

# scheduler_events = {
# 	"all": [
# 		"project_enhancements.tasks.all"
# 	],
# 	"daily": [
# 		"project_enhancements.tasks.daily"
# 	],
# 	"hourly": [
# 		"project_enhancements.tasks.hourly"
# 	],
# 	"weekly": [
# 		"project_enhancements.tasks.weekly"
# 	],
# 	"monthly": [
# 		"project_enhancements.tasks.monthly"
# 	],
# }

# Testing
# -------

# before_tests = "project_enhancements.install.before_tests"

# Overriding Methods
# ------------------------------
#
# override_whitelisted_methods = {
# 	"frappe.desk.doctype.event.event.get_events": "project_enhancements.event.get_events"
# }
#
# each overriding function accepts a `data` argument;
# generated from the base implementation of the doctype dashboard,
# along with any modifications made in other Frappe apps
# override_doctype_dashboards = {
# 	"Task": "project_enhancements.task.get_dashboard_data"
# }

# exempt linked doctypes from being automatically cancelled
#
# auto_cancel_exempted_doctypes = ["Auto Repeat"]

# Ignore links to specified DocTypes when deleting documents
# -----------------------------------------------------------

# ignore_links_on_delete = ["Communication", "ToDo"]

# Request Events
# ----------------
# before_request = ["project_enhancements.utils.before_request"]
# after_request = ["project_enhancements.utils.after_request"]

# Job Events
# ----------
# before_job = ["project_enhancements.utils.before_job"]
# after_job = ["project_enhancements.utils.after_job"]

# User Data Protection
# --------------------

# user_data_fields = [
# 	{
# 		"doctype": "{doctype_1}",
# 		"filter_by": "{filter_by}",
# 		"redact_fields": ["{field_1}", "{field_2}"],
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_2}",
# 		"filter_by": "{filter_by}",
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_3}",
# 		"strict": False,
# 	},
# 	{
# 		"doctype": "{doctype_4}"
# 	}
# ]

# Authentication and authorization
# --------------------------------

# auth_hooks = [
# 	"project_enhancements.auth.validate"
# ]

# Automatically update python controller files with type annotations for this app.
# export_python_type_annotations = True

# default_log_clearing_doctypes = {
# 	"Logging DocType Name": 30  # days to retain logs
# }
#fixtures = [
#    {
#        "doctype": "Custom Field",
#        "filters": [
#            ["dt", "=", "Project"]
#        ]
#    }
#]
