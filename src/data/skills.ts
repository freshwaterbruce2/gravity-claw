export const DEFAULT_SKILL_CATEGORIES = [
  'All',
  'Files & System',
  'Web & Browser',
  'Communication',
  'Code & Dev',
  'Data & Research',
  'Productivity',
  'Creative',
] as const;

export type SkillCategory = (typeof DEFAULT_SKILL_CATEGORIES)[number];

export const SKILL_CATEGORIES = [...DEFAULT_SKILL_CATEGORIES];

