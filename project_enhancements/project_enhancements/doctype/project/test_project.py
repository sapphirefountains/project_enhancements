# -*- coding: utf-8 -*-
# Copyright (c) 2024, Sapphire Fountains and Contributors
# See license.txt
from __future__ import unicode_literals

import frappe
import unittest

from project_enhancements.project_enhancements.doctype.project.project import get_project_grouping_option

class TestProject(unittest.TestCase):
	def test_get_project_grouping_option(self):
		"""Test that the project grouping option is returned correctly."""
		# Call the function
		result = get_project_grouping_option()

		# Define the expected output
		expected = {"group_by": "project_type"}

		# Assert that the result matches the expected output
		self.assertEqual(result, expected)