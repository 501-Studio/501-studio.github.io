"""Legacy suites test returning users. First-run behavior is tested separately."""
def returning_user(page):
    page.add_locator_handler(page.locator('#function-tutorial[open]'),lambda dialog:dialog.locator('[data-tour-action="skip"]').click())
