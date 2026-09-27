// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SkillEntry } from '@deepseek-ai/dsh-api-remotes/client'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { SkillsSettingsTab, type SkillsSettingsTabProps } from '../src/client/SkillsSettingsTab.tsx'
import { zh } from '../src/client/locales.ts'

const sessionId = 'skills-session' as SessionId
const otherId = 'other-session' as SessionId
const t: SkillsSettingsTabProps['t'] = makeTranslate(zh, commonZh)

function sessionList(mainView: SessionId | null): SessionListState {
  const row = (id: SessionId) => ({
    id,
    displayTitle: id,
    running: false,
    blank: false,
    updatedAt: 1,
    retainedBy: id === mainView ? { mainView: 1 } : {},
  })
  return {
    ids: [sessionId, otherId],
    byId: { [sessionId]: row(sessionId), [otherId]: row(otherId) },
    phase: 'ready',
    projectionsBySession: {},
  }
}

interface Harness {
  readonly props: SkillsSettingsTabProps
  /** Fire the catalog notification registered for `id`. */
  readonly notify: (id: SessionId) => void
  readonly unsubscribe: ReturnType<typeof vi.fn>
}

function harness(
  list: SkillsSettingsTabProps['list'],
  mainView: SessionId | null = sessionId,
  hasCatalog: SkillsSettingsTabProps['hasCatalog'] = () => true,
): Harness {
  const listeners = new Map<SessionId, () => void>()
  const unsubscribe = vi.fn()
  const state = sessionList(mainView)
  return {
    props: {
      t,
      list,
      hasCatalog,
      subscribe: (id, listener) => {
        listeners.set(id, listener)
        return unsubscribe
      },
      useSessions: select => select(state),
    } as SkillsSettingsTabProps,
    notify: (id) => { act(() => { listeners.get(id)!() }) },
    unsubscribe,
  }
}

const skill = (name: string, source: SkillEntry['source'], extra: Partial<SkillEntry> = {}): SkillEntry =>
  ({ name, description: `${name} flow`, source, modelInvocable: true, ...extra })

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('SkillsSettingsTab', () => {
  it('groups by installation scope and sorts commands alphabetically', async () => {
    const list = vi.fn<SkillsSettingsTabProps['list']>().mockResolvedValue([
      { name: 'zeta', description: 'Last project skill', source: 'project-dsh', modelInvocable: true },
      { name: 'alpha', description: 'First project skill', source: 'project-agents', modelInvocable: true },
      { name: 'review', description: 'Review changes', group: 'Matt Pocock', source: 'user-dsh', modelInvocable: false },
    ])
    render(<SkillsSettingsTab {...harness(list).props} />)

    await waitFor(() => { expect(screen.getByText('/alpha')).toBeTruthy() })
    expect(list).toHaveBeenCalledExactlyOnceWith(sessionId)
    expect(screen.getByRole('heading', { name: '项目' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: '用户安装' })).toBeTruthy()
    expect(screen.getAllByRole('listitem').map(row => row.querySelector('code')?.textContent))
      .toEqual(['/alpha', '/zeta', '/review'])
    expect(screen.getByText('2 个技能')).toBeTruthy()
    expect(screen.getByText('1 个技能')).toBeTruthy()
    expect(screen.getByText('Matt Pocock')).toBeTruthy()
    expect(screen.getByText('仅用户')).toBeTruthy()
  })

  it('filters names, descriptions, and repository labels, and reports no matches', async () => {
    const list = vi.fn<SkillsSettingsTabProps['list']>().mockResolvedValue([
      { name: 'baseline-ui', description: 'Polish interfaces', group: 'UI Skills', source: 'user-dsh', modelInvocable: true },
      { name: 'code-review', description: 'Review changes', group: 'Matt Pocock', source: 'user-dsh', modelInvocable: true },
    ])
    render(<SkillsSettingsTab {...harness(list).props} />)
    await screen.findByText('/baseline-ui')

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Matt' } })
    expect(screen.queryByText('/baseline-ui')).toBeNull()
    expect(screen.getByText('/code-review')).toBeTruthy()
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'polish' } })
    expect(screen.getByText('/baseline-ui')).toBeTruthy()
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'zzz' } })
    expect(screen.getByText('没有匹配的技能')).toBeTruthy()
  })

  it('distinguishes an empty catalog from a search without matches', async () => {
    render(<SkillsSettingsTab {...harness(vi.fn().mockResolvedValue([])).props} />)
    expect(await screen.findByText('此会话没有可用的技能')).toBeTruthy()
  })

  it('asks for a session when the main view retains none', () => {
    const list = vi.fn<SkillsSettingsTabProps['list']>()
    render(<SkillsSettingsTab {...harness(list, null).props} />)
    expect(screen.getByRole('status').textContent).toBe('打开一个会话以查看其可用技能')
    expect(list).not.toHaveBeenCalled()
  })

  it('treats a subagent session in the main view as no session', () => {
    const list = vi.fn<SkillsSettingsTabProps['list']>()
    const hasCatalog = vi.fn(() => false)
    render(<SkillsSettingsTab {...harness(list, sessionId, hasCatalog).props} />)
    expect(hasCatalog).toHaveBeenCalledWith(sessionId)
    expect(screen.getByRole('status').textContent).toBe('打开一个会话以查看其可用技能')
    expect(list).not.toHaveBeenCalled()
  })

  it('logs a failed load, shows the error with Retry, and recovers on retry', async () => {
    const failure = new Error('boom')
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    const list = vi.fn<SkillsSettingsTabProps['list']>()
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce([skill('deploy', 'custom')])
    render(<SkillsSettingsTab {...harness(list).props} />)

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('无法加载技能')
    expect(logged).toHaveBeenCalledWith('[ui-skill] skills overview failed:', failure)
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(await screen.findByText('/deploy')).toBeTruthy()
    expect(list).toHaveBeenCalledTimes(2)
  })

  it('keeps loading through an aborted shared fetch and reloads on the invalidation notice', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    const aborted = Object.assign(new Error('aborted'), { name: 'AbortError' })
    const list = vi.fn<SkillsSettingsTabProps['list']>()
      .mockRejectedValueOnce(aborted)
      .mockResolvedValueOnce([skill('deploy', 'custom')])
    const bench = harness(list)
    render(<SkillsSettingsTab {...bench.props} />)
    await waitFor(() => { expect(list).toHaveBeenCalledTimes(1) })
    await act(async () => { await Promise.resolve() })

    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByRole('status').textContent).toBe('正在加载技能…')
    expect(logged).not.toHaveBeenCalled()
    bench.notify(sessionId)
    expect(await screen.findByText('/deploy')).toBeTruthy()
  })

  it('keeps the displayed list while a notification reloads the same session', async () => {
    let release: ((skills: readonly SkillEntry[]) => void) | undefined
    const list = vi.fn<SkillsSettingsTabProps['list']>()
      .mockResolvedValueOnce([skill('deploy', 'custom')])
      .mockImplementationOnce(async () => await new Promise((resolve) => { release = resolve }))
    const bench = harness(list)
    const { unmount } = render(<SkillsSettingsTab {...bench.props} />)
    await screen.findByText('/deploy')

    bench.notify(sessionId)
    expect(list).toHaveBeenCalledTimes(2)
    expect(screen.getByText('/deploy')).toBeTruthy()
    await act(async () => { release!([skill('lint', 'custom')]) })
    expect(screen.getByText('/lint')).toBeTruthy()
    unmount()
    expect(bench.unsubscribe).toHaveBeenCalledOnce()
  })

  it('ignores a superseded session result after the main view switches', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    let rejectFirst: ((error: Error) => void) | undefined
    let resolveOther: ((skills: readonly SkillEntry[]) => void) | undefined
    let resolveStale: ((skills: readonly SkillEntry[]) => void) | undefined
    const list = vi.fn<SkillsSettingsTabProps['list']>()
      .mockImplementationOnce(async () => await new Promise((_resolve, reject) => { rejectFirst = reject }))
      .mockImplementationOnce(async () => await new Promise((resolve) => { resolveOther = resolve }))
      .mockImplementationOnce(async () => await new Promise((resolve) => { resolveStale = resolve }))
      .mockResolvedValueOnce([skill('fmt', 'custom')])
    const { rerender } = render(<SkillsSettingsTab {...harness(list, sessionId).props} />)
    rerender(<SkillsSettingsTab {...harness(list, otherId).props} />)
    await act(async () => { rejectFirst!(new Error('late')) })
    expect(logged).not.toHaveBeenCalled()
    await act(async () => { resolveOther!([skill('lint', 'custom')]) })
    expect(screen.getByText('/lint')).toBeTruthy()

    rerender(<SkillsSettingsTab {...harness(list, sessionId).props} />)
    expect(screen.getByRole('status').textContent).toBe('正在加载技能…')
    rerender(<SkillsSettingsTab {...harness(list, otherId).props} />)
    await act(async () => { resolveStale!([skill('stale', 'custom')]) })
    expect(await screen.findByText('/fmt')).toBeTruthy()
    expect(screen.queryByText('/stale')).toBeNull()
  })
})
