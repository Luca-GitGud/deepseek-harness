// Web e2e scenario: the real host serves grouped skills to the browser. A
// fresh workspace seeded with project skills in two `group:` frontmatter
// labels, one ungrouped project skill, and one ungrouped user skill renders
// the empty-query `/` menu as named groups A→Z followed by installation-scope
// fallbacks, and Settings → Built-in plugins → Skills as installation-scope
// groups with group and user-only tags. No model call is issued, so a stray
// stream fails loud on the open LLM seam.
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import {
  assertFixtureInventory,
  captureStableAria,
  compareOrRefreshGolden,
  launchWebScaffold,
  watchConsole,
  webSnapshotMode,
  type WebScaffold,
} from './scaffold.ts'
import { connectFreshWorkspace, newEnglishPage, openSettings, saveFailureShot, writeComposerDraft } from './support.ts'

const SNAPSHOT_DIR = fileURLToPath(new URL('./expected/skills-overview', import.meta.url))
const MENU_EXPECTED = join(SNAPSHOT_DIR, 'menu.expected.md')
const SETTINGS_EXPECTED = join(SNAPSHOT_DIR, 'settings.expected.md')
const MODE = webSnapshotMode()

interface SeedSkill {
  name: string
  description: string
  scope: 'project' | 'user'
  frontmatter: readonly string[]
}

const SKILLS: readonly SeedSkill[] = [
  { name: 'release-notes', description: 'Draft release notes from merged changes', scope: 'project', frontmatter: ['group: Release'] },
  { name: 'changelog-check', description: 'Check the changelog against tagged commits', scope: 'project', frontmatter: ['group: Release'] },
  { name: 'docs-lint', description: 'Lint Markdown documentation', scope: 'project', frontmatter: ['group: Docs'] },
  { name: 'tidy-imports', description: 'Sort and prune imports', scope: 'project', frontmatter: [] },
  { name: 'standup-summary', description: 'Summarize yesterday for standup', scope: 'user', frontmatter: ['disable-model-invocation: true'] },
]

async function seedSkills(workspaceCwd: string): Promise<void> {
  for (const skill of SKILLS) {
    const root = skill.scope === 'project'
      ? join(workspaceCwd, 'workspace', '.agents', 'skills')
      : join(workspaceCwd, '.agents-home', 'skills')
    const directory = join(root, skill.name)
    await mkdir(directory, { recursive: true })
    await writeFile(join(directory, 'SKILL.md'), [
      '---',
      `name: ${skill.name}`,
      `description: ${skill.description}`,
      ...skill.frontmatter,
      '---',
      '',
      `# ${skill.name}`,
      '',
    ].join('\n'))
  }
}

describe('web e2e: skill groups in the slash menu and the Skills settings tab', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>

  beforeAll(async () => {
    scaffold = await launchWebScaffold({})
    await seedSkills(scaffold.workspaceCwd)
    browser = await chromium.launch()
    page = await newEnglishPage(browser)
    tripwire = watchConsole(page)
    await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
    await connectFreshWorkspace(page, scaffold.workspaceCwd)
  }, 120_000)

  afterAll(async () => {
    await browser?.close()
    await scaffold?.close()
  })

  it('sections the empty-query slash menu by group, then by installation scope, A→Z', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-skills-overview-menu'))
    const input = page.locator('[data-composer-input]').first()
    await writeComposerDraft(page, input, '/')
    const menu = page.getByRole('listbox', { name: 'Trigger suggestions' })
    await expect.poll(
      () => menu.getByRole('option', { name: /standup-summary/ }).count(),
      { timeout: 10_000 },
    ).toBe(1)
    await menu.getByRole('status').waitFor({ state: 'hidden', timeout: 10_000 })
    const snapshot = await captureStableAria(page, '[role="listbox"]', scaffold.workspaceCwd)
    await compareOrRefreshGolden(MENU_EXPECTED, snapshot, MODE)
    expect(snapshot.indexOf('text: Docs')).toBeLessThan(snapshot.indexOf('text: Release'))
    expect(snapshot.indexOf('text: Release')).toBeLessThan(snapshot.indexOf('text: Project'))
    expect(snapshot.indexOf('text: Project')).toBeLessThan(snapshot.indexOf('text: User installed'))
    expect(snapshot.indexOf('changelog-check')).toBeLessThan(snapshot.indexOf('release-notes'))
    await input.press('Escape')
    await writeComposerDraft(page, input, '')
    await expect.poll(() => menu.count()).toBe(0)
    expect(tripwire.pageErrors).toEqual([])
    expect(tripwire.warnings).toEqual([])
  })

  it('lists the session skills by installation scope in Settings → Built-in plugins → Skills', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-skills-overview-settings'))
    await openSettings(page, 'en')
    const dialog = page.getByRole('dialog', { name: 'Settings' })
    await dialog.getByRole('button', { name: 'Built-in plugins', exact: true }).click()
    await dialog.getByRole('tab', { name: 'Skills', exact: true }).click()
    const panel = dialog.getByRole('tabpanel', { name: 'Skills' })
    await panel.getByRole('searchbox', { name: 'Search skills' }).waitFor({ timeout: 10_000 })
    await panel.getByRole('heading', { name: 'User installed' }).waitFor({ timeout: 10_000 })
    const snapshot = await captureStableAria(page, '[role="dialog"] [role="tabpanel"]:not([hidden])', scaffold.workspaceCwd)
    await compareOrRefreshGolden(SETTINGS_EXPECTED, snapshot, MODE)

    await panel.getByRole('searchbox', { name: 'Search skills' }).fill('release')
    await expect.poll(() => panel.getByRole('listitem').allTextContents()).toEqual([
      '/changelog-checkReleaseCheck the changelog against tagged commits',
      '/release-notesReleaseDraft release notes from merged changes',
    ])
    await page.keyboard.press('Escape')
    await expect.poll(() => dialog.count()).toBe(0)
    expect(tripwire.pageErrors).toEqual([])
    expect(tripwire.warnings).toEqual([])
  })

  it('keeps its snapshot inventory closed', async () => {
    await assertFixtureInventory(SNAPSHOT_DIR, ['menu.expected.md', 'settings.expected.md'])
  })
})
