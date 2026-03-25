# Copyright (c) 2024, jules and contributors
# For license information, please see license.txt
"""This module defines the Project Dashboard Settings doctype."""

# import frappe
from frappe.model.document import Document


class ProjectDashboardSettings(Document):
	"""A single DocType for configuring the Project Dashboard.

	This DocType stores settings related to the project dashboard, such as
	which roles have permission to view it. It uses a child table to link to
	standard Role DocTypes.
	"""

	pass
