# Project Enhancements

This app enhances the ERPNext Projects module with a feature-rich, interactive dashboard and other quality-of-life improvements. It is designed to provide a high-level overview of all projects, facilitate quick updates, and improve project visibility for managers and developers at Sapphire Fountains.

## Features

### 1. Interactive Project Dashboard

A custom page that provides a comprehensive, real-time view of all projects.

- **Tabbed Navigation**: Separate views for "Active," "Inactive," and high-priority projects.
- **Dynamic Grouping**: Projects are grouped by "Project Type." The order of these groups is customizable via a drag-and-drop interface and is saved locally to your browser.
- **Search and Sort**:
    - Instantly search for projects within the current tab.
    - Sort project groups alphabetically, by project count, or using your custom order.
    - Sort projects within each group by fields like Project Name, Series, Status, Priority, and more.
- **Inline Editing**: Quickly update a project's `Status` or `Priority` directly from the dashboard using dropdown menus.
- **Task Progress**: See at a glance the number of completed vs. total tasks for each project.
- **Responsive Design**: The dashboard is designed to be usable across different screen sizes.

### 2. Default List View Grouping

- The standard "Project" list view is now automatically grouped by "Project Type" by default, providing better organization out of the box.

## Installation

You can install this app using the [bench](https://github.com/frappe/bench) CLI:

```bash
cd $PATH_TO_YOUR_BENCH
bench get-app $URL_OF_THIS_REPO --branch develop
bench install-app project_enhancements
```

After installation, the "Projects Dashboard" will be available in the Desk.

## Usage

### Accessing the Dashboard

1.  Navigate to the "Build" module in the ERPNext Desk.
2.  Click on "Projects Dashboard" under the "Custom Pages" section.

### Using the Dashboard

- **Switching Views**: Click the "Active Projects," "Inactive Projects," or "Priority Overview" tabs to filter the projects shown.
- **Searching**: Use the search bar at the top to filter projects in the current view by any field (name, type, status, etc.).
- **Sorting Groups**: Use the "Sort Groups" dropdown to change the order of the project type containers. Select "Custom" to use your personalized order.
- **Customizing Group Order**: Click the gear icon (`<i class="fa fa-cog"></i>`) to open the "Configure Custom Group Order" dialog. Drag and drop the project types into your preferred sequence and click "Save Order."
- **Sorting Projects**: Click on the column headers within any group's table (e.g., "Project Name," "Priority") to sort the projects in that group. Click again to reverse the order.
- **Updating Projects**: Change the "Status" or "Priority" of any project using the dropdowns in its row. The change is saved automatically.
- **Expanding/Collapsing Groups**: Click on the header of any project type group to toggle its visibility.

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
