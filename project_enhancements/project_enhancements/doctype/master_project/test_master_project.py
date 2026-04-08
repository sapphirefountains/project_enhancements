# Copyright (c) 2024, Sapphire Fountains and Contributors
# See license.txt

import frappe
from frappe.tests.utils import FrappeTestCase

class TestMasterProject(FrappeTestCase):
    def test_master_project_naming(self):
        title = "Test Master Project Naming"

        # Cleanup in case it exists
        if frappe.db.exists("Master Project", title):
            frappe.delete_doc("Master Project", title)

        doc = frappe.get_doc({
            "doctype": "Master Project",
            "title": title
        })
        doc.insert()

        self.assertEqual(doc.name, title)

    def test_master_project_duplicate_title(self):
        title = "Test Duplicate Master Project Title"

        # Cleanup in case it exists
        if frappe.db.exists("Master Project", title):
            frappe.delete_doc("Master Project", title)

        doc1 = frappe.get_doc({
            "doctype": "Master Project",
            "title": title
        })
        doc1.insert()

        doc2 = frappe.get_doc({
            "doctype": "Master Project",
            "title": title
        })

        with self.assertRaises(frappe.UniqueValidationError):
            doc2.insert()
