import { EDITOR_TABS, parseEditorTab, tabHref } from './editor-tab';

describe('parseEditorTab', () => {
  it('accepts every known tab', () => {
    for (const tab of EDITOR_TABS) {
      expect(parseEditorTab(tab)).toBe(tab);
    }
  });

  it('falls back to lineup when the parameter is missing', () => {
    expect(parseEditorTab(null)).toBe('lineup');
    expect(parseEditorTab(undefined)).toBe('lineup');
    expect(parseEditorTab('')).toBe('lineup');
  });

  it('falls back to lineup for a stale or hostile value', () => {
    // A hand-edited URL must never leave the editor with no panel rendered.
    expect(parseEditorTab('lineups')).toBe('lineup');
    expect(parseEditorTab('__proto__')).toBe('lineup');
    expect(parseEditorTab('LINEUP')).toBe('lineup');
  });
});

describe('tabHref', () => {
  const path = '/zh/matches/42/tactics';

  it('does not write the default tab into the URL', () => {
    expect(tabHref(path, '', 'lineup')).toBe(path);
    expect(tabHref(path, 'tab=tactics', 'lineup')).toBe(path);
  });

  it('writes a non-default tab', () => {
    expect(tabHref(path, '', 'tactics')).toBe(`${path}?tab=tactics`);
    expect(tabHref(path, '', 'changes')).toBe(`${path}?tab=changes`);
  });

  it('keeps unrelated query parameters', () => {
    expect(tabHref(path, 'debug=1', 'tactics')).toBe(`${path}?debug=1&tab=tactics`);
  });

  it('replaces rather than appends the tab parameter', () => {
    // Appending would produce `?tab=tactics&tab=changes`, and the first value
    // wins on read — the player would stay on the previous tab.
    expect(tabHref(path, 'tab=tactics', 'changes')).toBe(`${path}?tab=changes`);
  });

  it('never leaves a trailing question mark', () => {
    expect(tabHref(path, '', 'lineup')).not.toContain('?');
    expect(tabHref(path, 'tab=changes', 'lineup')).not.toContain('?');
  });
});
