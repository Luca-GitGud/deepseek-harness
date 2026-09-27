/** `skill` namespace dictionaries for the tool row, the `/` menu, and the Skills settings tab. */

/** Dictionary namespace owned by this plugin. */
export const NS = 'skill'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'row.title': '加载技能',
  'row.running': '正在加载 skill',
  'row.preparing': '准备加载技能',
  'row.failed': 'skill 加载失败',
  'row.stopped': 'skill 加载已中止',
  'row.instructions': '说明',
  'row.inspect': '查看',
  'menu.userOnly': '仅用户',
  'overview.tab': '技能',
  'overview.search': '搜索技能',
  'overview.loading': '正在加载技能…',
  'overview.error': '无法加载技能',
  'overview.retry': '重试',
  'overview.noSession': '打开一个会话以查看其可用技能',
  'overview.empty': '没有匹配的技能',
  'overview.none': '此会话没有可用的技能',
  'overview.count.one': '{count} 个技能',
  'overview.count.other': '{count} 个技能',
  'scope.project': '项目',
  'scope.user': '用户安装',
  'scope.custom': '自定义',
  'scope.bundled': 'DSH 内置',
  'scope.runtime': '运行时',
  'scope.other': '其他',
} satisfies Record<string, string>

/** The skill namespace key union. */
export type SkillKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'row.title': 'Skill',
  'row.running': 'Loading skill',
  'row.preparing': 'Preparing to load a skill',
  'row.failed': 'Skill load failed',
  'row.stopped': 'Skill load stopped',
  'row.instructions': 'Instructions',
  'row.inspect': 'Inspect',
  'menu.userOnly': 'user-only',
  'overview.tab': 'Skills',
  'overview.search': 'Search skills',
  'overview.loading': 'Loading skills…',
  'overview.error': 'Skills could not be loaded.',
  'overview.retry': 'Retry',
  'overview.noSession': 'Open a session to see its available skills.',
  'overview.empty': 'No matching skills.',
  'overview.none': 'No skills are available in this session.',
  'overview.count.one': '{count} skill',
  'overview.count.other': '{count} skills',
  'scope.project': 'Project',
  'scope.user': 'User installed',
  'scope.custom': 'Custom',
  'scope.bundled': 'Bundled with DSH',
  'scope.runtime': 'Runtime',
  'scope.other': 'Other',
} satisfies Record<SkillKey, string>
