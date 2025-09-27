import re
from playwright.sync_api import sync_playwright, Page, expect

def run(playwright):
    """
    This script verifies the functionality of the new Task Tree view in the Project Dashboard.
    """
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    try:
        # 1. Navigate to the Project Dashboard
        # Note: This assumes the user is already authenticated and the app is running on localhost:8000.
        base_url = "http://localhost:8000"
        page.goto(f"{base_url}/app/project-dashboard", wait_until="networkidle")

        # 2. Click on the "Tasks" tab
        print("Navigating to the Tasks tab...")
        tasks_tab = page.get_by_role("link", name="Tasks")
        expect(tasks_tab).to_be_visible(timeout=10000)
        tasks_tab.click()

        # 3. Click the "View Tasks" button for the first project
        print("Selecting the first project to view tasks...")
        view_tasks_button = page.get_by_role("button", name="View Tasks").first
        expect(view_tasks_button).to_be_visible(timeout=10000)
        view_tasks_button.click()

        # 4. Wait for the task tree to load and verify the header
        print("Waiting for the task tree view to load...")
        task_table_header = page.get_by_role("cell", name="Task", exact=True)
        expect(task_table_header).to_be_visible(timeout=10000)
        print("Task tree view loaded successfully.")

        # 5. Take a screenshot for visual verification
        screenshot_path = "jules-scratch/verification/task-tree-verification.png"
        page.screenshot(path=screenshot_path)
        print(f"Screenshot saved to {screenshot_path}")

    except Exception as e:
        print(f"An error occurred during verification: {e}")
        # Take a screenshot even on failure for debugging
        page.screenshot(path="jules-scratch/verification/error.png")
        raise

    finally:
        # Clean up
        context.close()
        browser.close()

if __name__ == "__main__":
    with sync_playwright() as playwright:
        run(playwright)