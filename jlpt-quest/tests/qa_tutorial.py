"""Existing-flow regressions dismiss the first-run guide through its actual UI.
The dedicated tutorial041 suite separately checks first-run and persistence.
"""
def dismiss_tutorial(page):
 button=page.locator('[data-action="tutorial-skip"]')
 if button.count():
  button.click()
  page.wait_for_selector('.tutorial',state='detached')
