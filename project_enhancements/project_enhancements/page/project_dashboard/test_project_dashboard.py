# -*- coding: utf-8 -*-
# Copyright (c) 2024, Sapphire Fountains and Contributors
# See license.txt
from __future__ import unicode_literals

import frappe
import unittest
from unittest.mock import patch

from project_enhancements.project_enhancements.page.project_dashboard.project_dashboard import (
    check_permission,
    get_project_data,
    update_project_details,
    get_priority_options,
    get_status_options,
    get_project_tasks
)

class TestProjectDashboardPermissions(unittest.TestCase):
    @patch('project_enhancements.project_enhancements.page.project_dashboard.project_dashboard.frappe.get_roles')
    @patch('project_enhancements.project_enhancements.page.project_dashboard.project_dashboard.frappe.get_all')
    def test_check_permission_allowed(self, mock_get_all, mock_get_roles):
        """Test that permission is granted when user has a permitted role."""
        mock_get_all.return_value = [{'role': 'Project Manager'}]
        mock_get_roles.return_value = ['Project Manager', 'System User']
        self.assertTrue(check_permission())

    @patch('project_enhancements.project_enhancements.page.project_dashboard.project_dashboard.frappe.get_roles')
    @patch('project_enhancements.project_enhancements.page.project_dashboard.project_dashboard.frappe.get_all')
    def test_check_permission_denied(self, mock_get_all, mock_get_roles):
        """Test that permission is denied when user does not have a permitted role."""
        mock_get_all.return_value = [{'role': 'Project Manager'}]
        mock_get_roles.return_value = ['Project User', 'System User']
        self.assertFalse(check_permission())

    @patch('project_enhancements.project_enhancements.page.project_dashboard.project_dashboard.frappe.get_all')
    def test_check_permission_no_roles_configured(self, mock_get_all):
        """Test that permission is denied when no roles are configured in settings."""
        mock_get_all.return_value = []
        self.assertFalse(check_permission())

    @patch('project_enhancements.project_enhancements.page.project_dashboard.project_dashboard.frappe.log_error')
    @patch('project_enhancements.project_enhancements.page.project_dashboard.project_dashboard.frappe.get_all')
    def test_check_permission_exception(self, mock_get_all, mock_log_error):
        """Test that permission is denied on exception."""
        mock_get_all.side_effect = Exception("DB Error")
        self.assertFalse(check_permission())
        mock_log_error.assert_called_once()

class TestProjectDashboard(unittest.TestCase):
    @patch('project_enhancements.project_enhancements.page.project_dashboard.project_dashboard.check_permission')
    @patch('project_enhancements.project_enhancements.page.project_dashboard.project_dashboard.frappe.db.count')
    @patch('project_enhancements.project_enhancements.page.project_dashboard.project_dashboard.frappe.get_list')
    def test_get_project_data_success(self, mock_get_list, mock_db_count, mock_check_permission):
        """Test successful retrieval and enrichment of project data."""
        mock_check_permission.return_value = True
        mock_projects = [{'name': 'PROJ-001', 'project_name': 'Test Project 1'}]
        mock_get_list.return_value = mock_projects
        mock_db_count.side_effect = [5, 2]

        result = get_project_data()

        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]['name'], 'PROJ-001')
        self.assertEqual(result[0]['total_tasks'], 5)
        self.assertEqual(result[0]['completed_tasks'], 2)
        mock_get_list.assert_called_once_with(
            'Project',
            fields=['name', 'project_name', 'status', 'project_type', 'project_user', 'custom_project_priority', 'is_active'],
            filters={'status': ['!=', 'Cancelled']},
            order_by='creation desc'
        )
        self.assertEqual(mock_db_count.call_count, 2)
        mock_db_count.assert_any_call('Task', {'project': 'PROJ-001'})
        mock_db_count.assert_any_call('Task', {'project': 'PROJ-001', 'status': 'Completed'})

    @patch('project_enhancements.project_enhancements.page.project_dashboard.project_dashboard.check_permission')
    def test_get_project_data_permission_denied(self, mock_check_permission):
        """Test that project data is not returned when permission is denied."""
        mock_check_permission.return_value = False
        result = get_project_data()
        self.assertEqual(result, {"error": "You do not have permission to view the Project Dashboard."})

    @patch('project_enhancements.project_enhancements.page.project_dashboard.project_dashboard.check_permission')
    @patch('project_enhancements.project_enhancements.page.project_dashboard.project_dashboard.frappe.log_error')
    @patch('project_enhancements.project_enhancements.page.project_dashboard.project_dashboard.frappe.get_list')
    def test_get_project_data_exception(self, mock_get_list, mock_log_error, mock_check_permission):
        """Test error handling when fetching project data fails."""
        mock_check_permission.return_value = True
        mock_get_list.side_effect = Exception("Database connection failed")
        result = get_project_data()
        self.assertEqual(result, {"error": "Could not fetch project data. Please check the logs."})
        mock_log_error.assert_called_once()

    @patch('project_enhancements.project_enhancements.page.project_dashboard.project_dashboard.frappe.get_list')
    def test_get_project_tasks_success(self, mock_get_list):
        """Test successful fetching and structuring of project tasks."""
        mock_tasks = [
            frappe._dict({'name': 'TASK-001', 'subject': 'Root Task 1', 'parent_task': None}),
            frappe._dict({'name': 'TASK-002', 'subject': 'Child Task 1.1', 'parent_task': 'TASK-001'}),
            frappe._dict({'name': 'TASK-003', 'subject': 'Root Task 2', 'parent_task': None}),
            frappe._dict({'name': 'TASK-004', 'subject': 'Child Task 1.2', 'parent_task': 'TASK-001'}),
        ]
        mock_get_list.return_value = mock_tasks
        with patch('project_enhancements.project_enhancements.page.project_dashboard.project_dashboard._get_assignee_names', return_value="test user"):
            result = get_project_tasks('PROJ-001')

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
    @patch('project_enhancements.project_enhancements.page.project_dashboard.project_dashboard._fetch_all_project_tasks')
    def test_get_project_tasks_exception(self, mock_fetch_tasks, mock_log_error):
        """Test error handling when fetching tasks fails."""
        mock_fetch_tasks.side_effect = Exception("DB Error")
        result = get_project_tasks('PROJ-001')
        self.assertEqual(result, {"error": "Could not fetch tasks for project PROJ-001. Please check logs."})
        mock_log_error.assert_called_once()

    @patch('project_enhancements.project_enhancements.page.project_dashboard.project_dashboard.frappe.get_meta')
    def test_get_priority_options_success(self, mock_get_meta):
        """Test fetching priority options successfully."""
        mock_meta = mock_get_meta.return_value
        mock_meta.fields = [
            frappe._dict({
                'fieldname': 'custom_project_priority',
                'options': 'High\nMedium\nLow'
            })
        ]
        result = get_priority_options()
        self.assertEqual(result, ['High', 'Medium', 'Low'])

    @patch('project_enhancements.project_enhancements.page.project_dashboard.project_dashboard.frappe.get_meta')
    def test_get_priority_options_no_field(self, mock_get_meta):
        """Test fetching priority options when the field does not exist."""
        mock_meta = mock_get_meta.return_value
        mock_meta.fields = []
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
        result = update_project_details('PROJ-001', 'status', 'Completed')
        mock_set_value.assert_called_once_with('Project', 'PROJ-001', 'status', 'Completed')
        self.assertEqual(result, {"status": "success"})

    @patch('project_enhancements.project_enhancements.page.project_dashboard.project_dashboard.frappe.log_error')
    @patch('project_enhancements.project_enhancements.page.project_dashboard.project_dashboard.frappe.db.set_value')
    def test_update_project_details_exception(self, mock_set_value, mock_log_error):
        """Test error handling when updating a project fails."""
        mock_set_value.side_effect = Exception("Failed to write to database")
        result = update_project_details('PROJ-001', 'status', 'Completed')
        self.assertEqual(result, {"status": "error", "message": "Could not update project. Please check the logs."})
        mock_log_error.assert_called_once()