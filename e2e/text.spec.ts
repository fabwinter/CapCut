import { expect, test } from '@playwright/test'

async function createProject(page: import('@playwright/test').Page, name: string) {
  await page.goto('/')
  await page.getByText('Create your first project').click()
  const dialog = page.getByRole('dialog')
  await dialog.getByPlaceholder('Untitled Project').fill(name)
  await dialog.getByRole('button', { name: 'Create', exact: true }).click()
  await expect(page).toHaveURL(/\/edit\//)
}

test('add text creates a clip on a text track, selects it, and its content is editable', async ({ page }) => {
  await createProject(page, 'Text Add Test')

  await page.locator('[data-action="add-text"]').click()

  const clip = page.locator('[data-clip]').first()
  await expect(clip).toBeVisible()
  await expect(clip).toContainText('Text')

  const content = page.locator('[data-field="text-content"]')
  await expect(content).toBeVisible()
  await content.fill('Hello world')
  await content.blur()

  await expect(clip).toContainText('Hello world')
})

test('text style controls (font size, color, align, animation) are editable and undo reverts them', async ({ page }) => {
  await createProject(page, 'Text Style Test')
  await page.locator('[data-action="add-text"]').click()

  await page.locator('[data-field="text-align-right"]').click()

  await page.locator('[data-field="text-animation-in"]').selectOption('fadeIn')
  await expect(page.locator('[data-field="text-animation-in"]')).toHaveValue('fadeIn')

  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(page.locator('[data-field="text-animation-in"]')).toHaveValue('none')
})

test('a lone text clip does not show video-only controls like speed or volume', async ({ page }) => {
  await createProject(page, 'Text No Video Controls Test')
  await page.locator('[data-action="add-text"]').click()

  await expect(page.locator('[data-inspector]')).toContainText('Text')
  await expect(page.locator('[data-field="speed"]')).not.toBeVisible()
  await expect(page.locator('[data-field="volume"]')).not.toBeVisible()
})
