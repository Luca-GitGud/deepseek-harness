/**
 * Settings → Plugins → Skills tab: the user-invocable skill catalog of the
 * Session retained by the main view, grouped by installation scope and
 * searchable. Subagent sessions and the absence of a main-view Session show
 * the no-session state.
 */
import { useEffect, useMemo, useState } from 'react'
import type { SkillEntry } from '@deepseek-ai/dsh-api-remotes/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { IconSearchOutlineRegular, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { scopeOrder, sortSkills, sourceLabelKey, type SourceLabelKey } from './catalog.ts'
import css from './SkillsSettingsTab.module.css'

/** Registration-side catalog loader for the Skills settings tab. */
export interface SkillsSettingsTabInjected {
  /** List the user-invocable skills visible to one retained Session. */
  list: (sessionId: SessionId) => Promise<readonly SkillEntry[]>
  /** Observe settlement or invalidation of one Session's cached catalog; returns the unsubscribe. */
  subscribe: (sessionId: SessionId, listener: () => void) => () => void
  /** False for Sessions without their own catalog (subagent sessions). */
  hasCatalog: (sessionId: SessionId) => boolean
}

/** Props assembled by the Plugins settings tab renderer. */
export type SkillsSettingsTabProps = PropsRuntime<'settings.plugins.tab'>
  & PropsLocale<'skill'>
  & InjectFace<SkillsSettingsTabInjected>

type ViewState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly sessionId: SessionId; readonly skills: readonly SkillEntry[] }

/** Current-session Skills catalog grouped by installation scope. */
export function SkillsSettingsTab({ t, useSessions, list, subscribe, hasCatalog }: SkillsSettingsTabProps) {
  const mainSessionId = useSessions(snapshot => Object.values(snapshot.byId)
    .find(session => (session.retainedBy.mainView ?? 0) > 0)?.id)
  const sessionId = mainSessionId !== undefined && hasCatalog(mainSessionId) ? mainSessionId : undefined
  const [query, setQuery] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<ViewState>({ status: 'idle' })

  useEffect(() => {
    if (sessionId === undefined) {
      setState({ status: 'idle' })
      return
    }
    let active = true
    // A reload of the displayed Session keeps its list until the new result lands.
    setState(previous => previous.status === 'ready' && previous.sessionId === sessionId ? previous : { status: 'loading' })
    void list(sessionId).then(
      (skills) => { if (active) setState({ status: 'ready', sessionId, skills }) },
      (error: unknown) => {
        // An invalidated shared fetch aborts; the invalidation notice reloads.
        if (!active || (error instanceof Error && error.name === 'AbortError')) return
        console.error('[ui-skill] skills overview failed:', error)
        setState({ status: 'error' })
      },
    )
    return () => { active = false }
  }, [attempt, list, sessionId])

  useEffect(() => {
    if (sessionId === undefined) return
    return subscribe(sessionId, () => { setAttempt(value => value + 1) })
  }, [subscribe, sessionId])

  const groups = useMemo(() => {
    if (state.status !== 'ready') return []
    const normalized = query.trim().toLocaleLowerCase()
    const filtered = state.skills.filter(skill => normalized.length === 0
      || skill.name.toLocaleLowerCase().includes(normalized)
      || skill.description.toLocaleLowerCase().includes(normalized)
      || skill.group?.toLocaleLowerCase().includes(normalized))
    const byLabel = new Map<SourceLabelKey, SkillEntry[]>()
    for (const skill of filtered) {
      const key = sourceLabelKey(skill.source)
      const bucket = byLabel.get(key) ?? []
      bucket.push(skill)
      byLabel.set(key, bucket)
    }
    return [...byLabel.entries()]
      .sort((a, b) => scopeOrder(a[0]) - scopeOrder(b[0]))
      .map(([key, skills]) => ({ key, skills: sortSkills(skills) }))
  }, [query, state])

  if (sessionId === undefined) return <p className={css.status} role="status">{t('overview.noSession')}</p>
  if (state.status === 'idle' || state.status === 'loading') return <p className={css.status} role="status">{t('overview.loading')}</p>
  if (state.status === 'error') {
    return (
      <div className={css.failure} role="alert">
        <p>{t('overview.error')}</p>
        <button type="button" onClick={() => { setAttempt(value => value + 1) }}>{t('overview.retry')}</button>
      </div>
    )
  }

  return (
    <section className={css.section}>
      <label className={css.search}>
        <IconSearchOutlineRegular size={16} aria-hidden="true" />
        <input
          type="search"
          value={query}
          placeholder={t('overview.search')}
          aria-label={t('overview.search')}
          onChange={(event) => { setQuery(event.target.value) }}
        />
      </label>
      {groups.length === 0
        ? <p className={css.status}>{t(state.skills.length === 0 ? 'overview.none' : 'overview.empty')}</p>
        : groups.map(group => (
          <section className={css.group} key={group.key}>
            <header className={css.groupHeader}>
              <h3>{t(group.key)}</h3>
              <span>{t(group.skills.length === 1 ? 'overview.count.one' : 'overview.count.other', { count: group.skills.length })}</span>
            </header>
            <ul className={css.cards}>
              {group.skills.map(skill => (
                <li className={css.card} key={skill.name}>
                  <div className={css.cardHeading}>
                    <code>/{skill.name}</code>
                    <span className={css.tags}>
                      {skill.group === undefined ? null : <Tag tone="neutral">{skill.group}</Tag>}
                      {skill.modelInvocable ? null : <Tag tone="neutral">{t('menu.userOnly')}</Tag>}
                    </span>
                  </div>
                  <p>{skill.description}</p>
                </li>
              ))}
            </ul>
          </section>
        ))}
    </section>
  )
}
