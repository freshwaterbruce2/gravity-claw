import { create } from 'zustand';
import { fetchSkills, normalizeSkill, type LiveSkill } from '../lib/liveApi';

export type Skill = LiveSkill;

interface SkillsState {
  skills: Skill[];
  hydrated: boolean;
  lastUpdated: number;
  loadSkills: (options?: { force?: boolean }) => Promise<void>;
  replaceSkills: (skills: Skill[]) => void;
  upsertSkill: (skill: Skill) => void;
}

export function getSkillCategories(skills: Skill[]): string[] {
  const categories = new Set(skills.map((skill) => skill.category).filter(Boolean));
  return ['All', ...Array.from(categories).sort((a, b) => a.localeCompare(b))];
}

export const useSkillsStore = create<SkillsState>((set, get) => ({
  skills: [],
  hydrated: false,
  lastUpdated: 0,

  loadSkills: async (options) => {
    if (get().hydrated && !options?.force) {
      return;
    }

    try {
      const skills = await fetchSkills();
      set({
        skills,
        hydrated: true,
        lastUpdated: Date.now(),
      });
    } catch {
      set({ hydrated: true, lastUpdated: Date.now() });
    }
  },

  replaceSkills: (skills) =>
    set({
      skills: skills.map((skill) => normalizeSkill(skill)),
      hydrated: true,
      lastUpdated: Date.now(),
    }),

  upsertSkill: (skill) =>
    set((state) => {
      const nextSkill = normalizeSkill(skill);
      const skills = state.skills.some((item) => item.id === nextSkill.id)
        ? state.skills.map((item) => (item.id === nextSkill.id ? nextSkill : item))
        : [nextSkill, ...state.skills];

      return {
        skills,
        hydrated: true,
        lastUpdated: Date.now(),
      };
    }),
}));

