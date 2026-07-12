import { test, expect } from '@playwright/test'

test.describe('project gallery and editor shell', () => {
  test('create, rename, undo/redo, autosave, and persist across reload', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('No projects yet')).toBeVisible()

    await page.getByText('Create your first project').click()
    const createDialog = page.getByRole('dialog')
    await createDialog.getByPlaceholder('Untitled Project').fill('My Test Project')
    await createDialog.getByRole('button', { name: 'Create', exact: true }).click()

    await expect(page).toHaveURL(/\/edit\//)
    await expect(page.locator('[data-track-header]')).toHaveCount(2)

    await page.getByRole('button', { name: 'My Test Project' }).click()
    const nameInput = page.locator('header input')
    await nameInput.fill('Renamed Project')
    await nameInput.press('Enter')
    await expect(page.getByRole('button', { name: 'Renamed Project' })).toBeVisible()

    const undoBtn = page.getByRole('button', { name: 'Undo' })
    await expect(undoBtn).toBeEnabled()
    await undoBtn.click()
    await expect(page.getByRole('button', { name: 'My Test Project' })).toBeVisible()

    await page.getByRole('button', { name: 'Redo' }).click()
    await expect(page.getByRole('button', { name: 'Renamed Project' })).toBeVisible()

    await expect(page.locator('[data-save-state="saved"]')).toBeVisible({ timeout: 5000 })

    await page.getByRole('button', { name: 'Back to projects' }).click()
    await expect(page.getByText('Renamed Project')).toBeVisible()

    await page.reload()
    await expect(page.getByText('Renamed Project')).toBeVisible()
  })

  test('duplicate and delete a project from the gallery', async ({ page }) => {
    await page.goto('/')
    await page.getByText('Create your first project').click()
    const createDialog = page.getByRole('dialog')
    await createDialog.getByPlaceholder('Untitled Project').fill('Dup Source')
    await createDialog.getByRole('button', { name: 'Create', exact: true }).click()
    await expect(page).toHaveURL(/\/edit\//)

    await page.getByRole('button', { name: 'Back to projects' }).click()
    await expect(page.getByText('Dup Source')).toBeVisible()

    await page.getByRole('button', { name: 'Actions for Dup Source' }).click()
    await page.getByRole('menuitem', { name: 'Duplicate' }).click()
    // Wait for the close animation to finish before opening another menu —
    // otherwise both dropdowns' "Delete" items are briefly in the DOM together.
    await expect(page.getByRole('menuitem', { name: 'Duplicate' })).toHaveCount(0)
    await expect(page.getByText('Dup Source copy')).toBeVisible()

    await page.getByRole('button', { name: 'Actions for Dup Source copy' }).click()
    const copyMenu = page.getByRole('menu').last()
    await copyMenu.getByRole('menuitem', { name: 'Delete' }).click()
    const alertDialog = page.getByRole('alertdialog')
    await alertDialog.getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(page.getByText('Dup Source copy')).toHaveCount(0)
    await expect(page.getByText('Dup Source', { exact: true })).toBeVisible()
  })
})
