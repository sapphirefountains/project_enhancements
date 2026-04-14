# Project Enhancements

This app enhances the ERPNext Projects module with a feature-rich, interactive dashboard and other quality-of-life improvements. It is designed to provide a high-level overview of all projects, facilitate quick updates, and improve project visibility for managers and developers at Sapphire Fountains.

## Features

### 1. Interactive Project Dashboard

A custom page that provides a comprehensive, real-time view of all projects.

- **Tabbed Navigation**: Separate views for "Active," "Inactive," high-priority projects, and a hierarchical "Tasks Tree".
- **Dynamic Grouping**: Projects are grouped by "Project Type." The order of these groups is customizable via a drag-and-drop interface and is saved locally to your browser.
- **Search and Sort**:
  - Instantly search for projects within the current tab.
  - Sort project groups alphabetically, by project count, or using your custom order.
  - Sort projects within each group by fields like Project Name, Series, Status, Priority, and more.
- **Inline Editing**: Quickly update a project's `Status` or `Priority` directly from the dashboard. The task view allows for inline editing of status, dates, and assignees.
- **Task Progress**: See at a glance the number of completed vs. total tasks for each project.
- **Hierarchical Task View**: A dedicated tab to view a project's tasks and sub-tasks in a collapsible tree structure.

### 2. Default List View Grouping

- The standard "Project" list view is now automatically grouped by "Project Type" by default, providing better organization out of the box.

## Installation

You can install this app using the [bench](https://github.com/frappe/bench) CLI:

```bash
cd $PATH_TO_YOUR_BENCH
bench get-app $URL_OF_THIS_REPO --branch main
bench install-app project_enhancements
```

After installation, the "Projects Dashboard" will be available in the Desk.

## Usage

### Accessing the Dashboard

1.  Navigate to the "Build" module in the ERPNext Desk.
2.  Click on "Projects Dashboard" under the "Custom Pages" section.

### Using the Dashboard

- **Switching Views**: Click the "Active Projects," "Inactive Projects," "Priority Overview," or "Tasks Tree" tabs to change the view.
- **Searching**: Use the search bar at the top to filter projects or tasks in the current view.
- **Sorting Groups**: Use the "Sort Groups" dropdown to change the order of the project type containers. Select "Custom" to use your personalized order.
- **Customizing Group Order**: Click the gear icon (`<i class="fa fa-cog"></i>`) to open the "Configure Custom Group Order" dialog. Drag and drop the project types into your preferred sequence and click "Save Order."
- **Sorting Projects/Tasks**: Click on the column headers within any table to sort the items in that group. Click again to reverse the order.
- **Updating Projects/Tasks**: Change values directly in the tables (e.g., Status, Priority, Dates). The changes are saved automatically.
- **Expanding/Collapsing Groups**: Click on the header of any project type group to toggle its visibility.

## Technical Overview

This application is built on the Frappe Framework and consists of several key components working together:

### 1. Project Dashboard (Custom Page)

- **`project_dashboard.js`**: This is the core frontend file that builds the entire interactive dashboard. It handles all UI rendering, state management (filters, sorting, tabs), user event listeners (clicks, dropdown changes), and communication with the backend via `frappe.call`.
- **`project_dashboard.py`**: This backend file provides the necessary API for the frontend. It contains whitelisted Python functions that:
  - Check user permissions.
  - Fetch and process project and task data.
  - Handle inline updates to project and task documents.
  - Retrieve metadata like status and priority options from other DocTypes.

### 2. Project Doctype Customizations

- **`project_list.js`**: A simple client script that hooks into the standard "Project" list view. On load, it calls a backend function to set a default `group_by` setting, organizing the list by "Project Type" automatically.
- **`project.py`**: Contains the server-side function `get_project_grouping_option` that provides the default grouping setting to `project_list.js`.

### 3. Custom DocTypes

- **`Project Dashboard Settings` (Single DocType)**: A settings page for administrators to configure the application. Its primary purpose is to manage access to the Project Dashboard by linking to `Role` DocTypes in a child table.
- **`Project Dashboard Permitted Role` (Child DocType)**: A child table within "Project Dashboard Settings" that holds the list of roles permitted to view the dashboard.

## Contributing

This app uses `pre-commit` for code formatting and linting. Please [install pre-commit](https://pre-commit.com/#installation) and enable it for this repository before making changes:

```bash
# Navigate to the app's directory
cd apps/project_enhancements

# Install the git hook scripts
pre-commit install
```

Pre-commit is configured to use the following tools for checking and formatting your code:

- ruff
- eslint
- prettier
- pyupgrade

## License

MIT
