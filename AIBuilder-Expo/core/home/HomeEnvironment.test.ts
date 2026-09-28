import {
  DEFAULT_AI_BUILDER_HOME,
  createHomeEnvironment,
  resolveAiBuilderHome,
} from './HomeEnvironment';

describe('HomeEnvironment', () => {
  it('uses explicit AI_BUILDER_HOME as the canonical HOME', () => {
    const env = createHomeEnvironment({ AI_BUILDER_HOME: '/data/aibuilder' });
    expect(env.AI_BUILDER_HOME).toBe('/data/aibuilder');
    expect(env.HOME).toBe('/data/aibuilder');
    expect(env.layout.projects).toBe('/data/aibuilder/projects');
  });

  it('accepts an existing AIBuilderTermux HOME', () => {
    expect(resolveAiBuilderHome({ HOME: '/storage/emulated/0/AIBuilderTermux' }))
      .toBe('/storage/emulated/0/AIBuilderTermux');
  });

  it('does not promote unrelated Termux HOME', () => {
    expect(resolveAiBuilderHome({ HOME: '/data/data/com.termux/files/home' }))
      .toBe(DEFAULT_AI_BUILDER_HOME);
  });

  it('does not mutate the supplied environment object', () => {
    const input = { HOME: '/storage/emulated/0/AIBuilderTermux' };
    createHomeEnvironment(input);
    expect(input).toEqual({ HOME: '/storage/emulated/0/AIBuilderTermux' });
  });
});
