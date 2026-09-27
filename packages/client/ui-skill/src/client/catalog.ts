/**
 * Skill catalog grouping shared by the `/` menu and the Skills settings tab:
 * installation-scope label keys, their display order, and the menu's section
 * assembly.
 */
import type { SkillEntry } from '@deepseek-ai/dsh-api-remotes/client'
import type { SkillKey } from './locales.ts'

/** Locale key of one installation-scope label. */
export type SourceLabelKey = Extract<SkillKey, `scope.${string}`>

/**
 * Map a skill source to its installation-scope label key.
 * @param source - `SkillEntry.source` reported by the host.
 * @returns the scope label key; unknown sources map to `scope.other`.
 */
export function sourceLabelKey(source: string): SourceLabelKey {
  switch (source) {
    case 'project-dsh':
    case 'project-agents': return 'scope.project'
    case 'user-dsh':
    case 'user-agents': return 'scope.user'
    case 'custom': return 'scope.custom'
    case 'bundled': return 'scope.bundled'
    case 'runtime': return 'scope.runtime'
    // SkillSource is merge-extensible: a provider-added source has no dedicated label.
    default: return 'scope.other'
  }
}

const SCOPE_ORDER: Record<SourceLabelKey, number> = {
  'scope.project': 0,
  'scope.user': 1,
  'scope.custom': 2,
  'scope.bundled': 3,
  'scope.runtime': 4,
  'scope.other': 5,
}

/**
 * Rank an installation scope for display.
 * @param key - scope label key.
 * @returns a sort key; lower values display first.
 */
export function scopeOrder(key: SourceLabelKey): number {
  return SCOPE_ORDER[key]
}

/**
 * Sort skills by command name.
 * @param skills - skills to sort; not mutated.
 * @returns a new array in A→Z name order.
 */
export function sortSkills(skills: readonly SkillEntry[]): SkillEntry[] {
  return [...skills].sort((a, b) => a.name.localeCompare(b.name))
}

/** One `/` menu section: a named `group`, or an installation-scope fallback for skills without one. */
export type SkillSection =
  | { readonly kind: 'group'; readonly group: string; readonly skills: readonly SkillEntry[] }
  | { readonly kind: 'scope'; readonly scope: SourceLabelKey; readonly skills: readonly SkillEntry[] }

/**
 * Partition skills into `/` menu sections. A named group and a scope fallback
 * never share a section, even when the group's name equals a scope label.
 * @param ranked - skills in match-rank order.
 * @param alphabetical - true for an empty query: named groups A→Z, then scope
 *   fallbacks in {@link scopeOrder}, names A→Z within each section. False keeps
 *   rank order within each section and orders sections by their best-ranked member.
 * @returns the non-empty sections in display order.
 */
export function sectionSkills(ranked: readonly SkillEntry[], alphabetical: boolean): SkillSection[] {
  const sections = new Map<string, SkillSection & { readonly skills: SkillEntry[] }>()
  for (const skill of ranked) {
    const scope = sourceLabelKey(skill.source)
    const key = skill.group === undefined ? `scope:${scope}` : `group:${skill.group}`
    let section = sections.get(key)
    if (section === undefined) {
      section = skill.group === undefined
        ? { kind: 'scope', scope, skills: [] }
        : { kind: 'group', group: skill.group, skills: [] }
      sections.set(key, section)
    }
    section.skills.push(skill)
  }
  const ordered: SkillSection[] = [...sections.values()]
  if (!alphabetical) return ordered
  const groups = ordered.filter(section => section.kind === 'group').sort((a, b) => a.group.localeCompare(b.group))
  const scopes = ordered.filter(section => section.kind === 'scope').sort((a, b) => scopeOrder(a.scope) - scopeOrder(b.scope))
  return [...groups, ...scopes].map(section => ({ ...section, skills: sortSkills(section.skills) }))
}
