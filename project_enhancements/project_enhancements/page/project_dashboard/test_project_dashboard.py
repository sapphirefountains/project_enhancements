# -*- coding: utf-8 -*-
# Copyright (c) 2024, Sapphire Fountains and Contributors
# See license.txt
from __future__ import unicode_literals

import frappe
import unittest
from unittest.mock import patch

from project_enhancements.project_enhancements.page.project_dashboard.project_dashboard import (
    get_project_data,
    update_project_details,
    get_priority_options,
    get_status_options,
    get_project_tasks
)

class TestProjectDashboard(unittest.TestCase):
	@patch('project_enhancements.project_enhancements.page.project_dashboard.project_dashboard.frappe.db.count')
	@patch('project_enhancements.project_enhancements.page.project_dashboard.project_dashboard.frappe.get_list')
	def test_get_project_data_success(self, mock_get_list, mock_db_count):
		"""Test successful retrieval and enrichment of project data."""
		# Mock the return value of frappe.get_list
		mock_projects = [{'name': 'PROJ-001', 'project_name': 'Test Project 1'}]
		mock_get_list.return_value = mock_projects

		# Mock the return values of frappe.db.count
		# First call (total_tasks), second call (completed_tasks)
		mock_db_count.side_effect = [5, 2]

		# Call the function
		result = get_project_data()

		# Check assertions
		self.assertEqual(len(result), 1)
		self.assertEqual(result[0]['name'], 'PROJ-001')
		self.assertEqual(result[0]['total_tasks'], 5)
		self.assertEqual(result[0]['completed_tasks'], 2)

		# Verify that get_list was called correctly
		mock_get_list.assert_called_once_with(
			'Project',
			fields=['name', 'project_name', 'status', 'project_type', 'project_user', 'custom_project_priority', 'is_active'],
			filters={'status': ['!=', 'Cancelled']},
			order_by='creation desc'
		)

		# Verify that db.count was called correctly
		self.assertEqual(mock_db_count.call_count, 2)
		mock_db_count.assert_any_call('Task', {'project': 'PROJ-001'})
		mock_db_count.assert_any_call('Task', {'project': 'PROJ-001', 'status': 'Completed'})

	@patch('project_enhancements.project_enhancements.page.project_dashboard.project_dashboard.frappe.log_error')
	@patch('project_enhancements.project_enhancements.page.project_dashboard.project_dashboard.frappe.get_list')
	def test_get_project_data_exception(self, mock_get_list, mock_log_error):
		"""Test error handling when fetching project data fails."""
		# Configure the mock to raise an exception
		mock_get_list.side_effect = Exception("Database connection failed")

		# Call the function
		result = get_project_data()

		# Check that the error response is correct
		self.assertEqual(result, {"error": "Could not fetch project data. Please check the logs."})

		# Verify that the error was logged
		mock_log_error.assert_called_once()

	@patch('project_enhancements.project_enhancements.page.project_dashboard.project_dashboard.frappe.get_list')
	def test_get_project_tasks_success(self, mock_get_list):
		"""Test successful fetching and structuring of project tasks."""
		# Mock task data
		mock_tasks = [
			frappe._dict({'name': 'TASK-001', 'subject': 'Root Task 1'}),
			frappe._dict({'name': 'TASK-002', 'subject': 'Child Task 1.1', 'parent_task': 'TASK-001'}),
			frappe._dict({'name': 'TASK-003', 'subject': 'Root Task 2'}),
			frappe._dict({'name': 'TASK-004', 'subject': 'Child Task 1.2', 'parent_task': 'TASK-001'}),
		]
		mock_get_list.return_value = mock_tasks

		result = get_project_tasks('PROJ-001')

		# Expected structure: 2 root tasks, one with 2 children
		self.assertEqual(len(result), 2)
		root1 = next(t for t in result if t['name'] == 'TASK-001')
		root2 = next(t for t in result if t['name'] == 'TASK-003')

		self.assertEqual(len(root1['children']), 2)
		self.assertEqual(len(root2['children']), 0)
		child_names = {c['name'] for c in root1['children']}
		self.assertEqual(child_names, {'TASK-002', 'TASK-004'})


	def test_get_project_tasks_no_project(self):
		"""Test error handling when no project is provided."""
		result = get_project_tasks(None)
		self.assertEqual(result, {"error": "Project name is required."})


	@patch('project_enhancements.project_enhancements.page.project_dashboard.project_dashboard.frappe.log_error')
	@patch('project_enhancements.project_enhancements.page.project_dashboard.project_dashboard.frappe.get_list')
	def test_get_project_tasks_exception(self, mock_get_list, mock_log_error):
		"""Test error handling when fetching tasks fails."""
		mock_get_list.side_effect = Exception("DB Error")
		result = get_project_tasks('PROJ-001')
		self.assertEqual(result, {"error": "Could not fetch tasks for project PROJ-001. Please check logs."})
		mock_log_error.assert_called_once()

	@patch('project_enhancements.project_enhancements.page.project_dashboard.project_dashboard.frappe.get_meta')
	def test_get_priority_options_success(self, mock_get_meta):
		"""Test fetching priority options successfully."""
		# Mock the DocType metadata
		mock_meta = mock_get_meta.return_value
		mock_meta.fields = [
			frappe._dict({
				'fieldname': 'custom_project_priority',
				'options': 'High\nMedium\nLow'
			})
		]

		# Call the function
		result = get_priority_options()

		# Assert the result is correct
		self.assertEqual(result, ['High', 'Medium', 'Low'])

	@patch('project_enhancements.project_enhancements.page.project_dashboard.project_dashboard.frappe.get_meta')
	def test_get_priority_options_no_field(self, mock_get_meta):
		"""Test fetching priority options when the field does not exist."""
		mock_meta = mock_get_meta.return_value
		mock_meta.fields = [] # No priority field

		result = get_priority_options()
		self.assertEqual(result, [])

	@patch('project_enhancements.project_enhancements.page.project_dashboard.project_dashboard.frappe.log_error')
	@patch('project_enhancements.project_enhancements.page.project_dashboard.project_dashboard.frappe.get_meta')
	def test_get_priority_options_exception(self, mock_get_meta, mock_log_error):
		"""Test error handling for priority options."""
		mock_get_meta.side_effect = Exception("Meta error")
		result = get_priority_options()
		self.assertEqual(result, {'error': 'Could not fetch priority options.'})
		mock_log_error.assert_called_once()


	@patch('project_enhancements.project_enhancements.page.project_dashboard.project_dashboard.frappe.get_meta')
	def test_get_status_options_success(self, mock_get_meta):
		"""Test fetching status options successfully."""
		mock_meta = mock_get_meta.return_value
		mock_meta.fields = [
			frappe._dict({
				'fieldname': 'status',
				'options': 'Open\nIn Progress\nCompleted'
			})
		]
		result = get_status_options()
		self.assertEqual(result, ['Open', 'In Progress', 'Completed'])

	@patch('project_enhancements.project_enhancements.page.project_dashboard.project_dashboard.frappe.log_error')
	@patch('project_enhancements.project_enhancements.page.project_dashboard.project_dashboard.frappe.get_meta')
	def test_get_status_options_exception(self, mock_get_meta, mock_log_error):
		"""Test error handling for status options."""
		mock_get_meta.side_effect = Exception("Meta error")
		result = get_status_options()
		self.assertEqual(result, {'error': 'Could not fetch status options.'})
		mock_log_error.assert_called_once()

	@patch('project_enhancements.project_enhancements.page.project_dashboard.project_dashboard.frappe.db.set_value')
	def test_update_project_details_success(self, mock_set_value):
		"""Test successful update of a project field."""
		# Call the function with test data
		result = update_project_details('PROJ-001', 'status', 'Completed')

		# Assert that frappe.db.set_value was called correctly
		mock_set_value.assert_called_once_with('Project', 'PROJ-001', 'status', 'Completed')

		# Assert that the success response is returned
		self.assertEqual(result, {"status": "success"})

	@patch('project_enhancements.project_enhancements.page.project_dashboard.project_dashboard.frappe.log_error')
	@patch('project_enhancements.project_enhancements.page.project_dashboard.project_dashboard.frappe.db.set_value')
	def test_update_project_details_exception(self, mock_set_value, mock_log_error):
		"""Test error handling when updating a project fails."""
		# Configure the mock to raise an exception
		mock_set_value.side_effect = Exception("Failed to write to database")

		# Call the function
		result = update_project_details('PROJ-001', 'status', 'Completed')

		# Assert that the error response is correct
		self.assertEqual(result, {"status": "error", "message": "Could not update project. Please check the logs."})

		# Verify that the error was logged
		mock_log_error.assert_called_once()