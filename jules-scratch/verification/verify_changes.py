import time
from playwright.sync_api import sync_playwright, expect, Error

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    # Give the server a moment to start
    time.sleep(10)

    for i in range(2): # Retry once
        try:
            # Log in
            page.goto("http://localhost:8000/login")
            page.fill('input[name="usr"]', "Administrator")
            page.fill('input[name="pwd"]', "admin")
            page.click('button[type="submit"]')
            page.wait_for_load_state("networkidle")

            # Navigate to the project dashboard
            page.goto("http://localhost:8000/app/project-dashboard")
            page.wait_for_load_state("networkidle")

            # Click on the "Priority Overview" tab
            page.click('a[data-status="PriorityOverview"]')
            page.wait_for_load_state("networkidle")

            # Take a screenshot
            page.screenshot(path="jules-scratch/verification/verification.png")

            break # Success
        except Error as e:
            print(f"Attempt {i+1} failed: {e}")
            if i == 0:
                time.sleep(5) # Wait before retrying
            else:
                raise

    browser.close()

with sync_playwright() as playwright:
    run(playwright)