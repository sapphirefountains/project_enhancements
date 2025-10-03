import re
from playwright.sync_api import sync_playwright, expect

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    try:
        # 1. Log in to the application
        print("Navigating to login page...")
        page.goto("http://localhost:8000/login")

        print("Entering credentials...")
        page.get_by_placeholder("Email").fill("Administrator")
        page.get_by_placeholder("Password").fill("admin")
        page.get_by_role("button", name="Login").click()

        # Wait for the main desk page to load after login
        expect(page).to_have_url(re.compile(r".*/app"), timeout=30000)
        print("Login successful.")

        # 2. Navigate to the Project Dashboard
        print("Navigating to Project Dashboard...")
        page.goto("http://localhost:8000/app/project-dashboard")

        # 3. Switch to the 'Tasks Tree' tab
        print("Switching to Tasks Tree tab...")
        tasks_tree_tab = page.get_by_role("link", name="Tasks Tree")
        expect(tasks_tree_tab).to_be_visible()
        tasks_tree_tab.click()

        # 4. Find and click the 'View Tasks' button for the target project
        print("Looking for project 'Big D Construction - Lagoon Peacock Splash Pad'...")
        # The project name is in a link, and the button is in the same list item
        project_list_item = page.locator("li.list-group-item", has_text="Big D Construction - Lagoon Peacock Splash Pad")
        view_tasks_button = project_list_item.get_by_role("button", name="View Tasks")

        expect(view_tasks_button).to_be_visible(timeout=15000)
        print("Project found. Clicking 'View Tasks'...")
        view_tasks_button.click()

        # 5. Verify the task tree has loaded and take a screenshot
        print("Waiting for task tree to render...")
        task_grid_header = page.locator(".task-grid-header")
        expect(task_grid_header).to_be_visible(timeout=15000)

        # Specifically wait for a nested task to ensure the view is complete
        # This locator finds a child task container that is not empty
        nested_task = page.locator(".child-tasks-container .task-node")
        expect(nested_task.first).to_be_visible(timeout=15000)
        print("Task tree rendered.")

        print("Taking screenshot...")
        screenshot_path = "jules-scratch/verification/verification.png"
        page.screenshot(path=screenshot_path)
        print(f"Screenshot saved to {screenshot_path}")

    except Exception as e:
        print(f"An error occurred: {e}")
        # Take a screenshot on error for debugging
        page.screenshot(path="jules-scratch/verification/error.png")
        raise
    finally:
        browser.close()

if __name__ == "__main__":
    with sync_playwright() as playwright:
        run(playwright)