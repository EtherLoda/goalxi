import { positionShortLabel } from './position-legend';

describe('positionShortLabel', () => {
  describe('canonical 24-slot FE keys render their short label', () => {
    it.each([
      ['GK', 'GK'],
      ['CBL', 'CBL'],
      ['CB', 'CBC'],
      ['CBR', 'CBR'],
      ['LB', 'LB'],
      ['RB', 'RB'],
      ['LWB', 'LWB'],
      ['RWB', 'RWB'],
      ['DMFL', 'DML'],
      ['DMF', 'DMC'],
      ['DMFR', 'DMR'],
      ['CML', 'CML'],
      ['CM', 'CMC'],
      ['CMR', 'CMR'],
      ['CAML', 'AML'],
      ['CAM', 'AMC'],
      ['CAMR', 'AMR'],
      ['LM', 'LM'],
      ['RM', 'RM'],
      ['LW', 'LW'],
      ['RW', 'RW'],
      ['CFL', 'CFL'],
      ['CF', 'CF'],
      ['CFR', 'CFR'],
    ])('"%s" → "%s"', (input, expected) => {
      expect(positionShortLabel(input)).toBe(expected);
    });
  });

  describe('bench short labels', () => {
    it.each([
      ['BENCH_GK', 'GK'],
      ['BENCH_CB', 'CB'],
      ['BENCH_FB', 'FB'],
      ['BENCH_W', 'W'],
      ['BENCH_CM', 'CM'],
      ['BENCH_FW', 'FW'],
    ])('"%s" → "%s"', (input, expected) => {
      expect(positionShortLabel(input)).toBe(expected);
    });
  });

  describe('new senior canonical keys (post commit 2) fold to FE-display family', () => {
    // The engine was renamed from CAM/CAML/CAMR (3-slot AM centre /
    // left / right) to AM/AML/AMR in commit 2 of the position-key
    // unification plan. The FE PitchSlot union has not been updated
    // yet (commit 3 of the same plan), so we fold the new keys to
    // their old FE-display counterpart at the marker layer.
    it.each([
      ['AM', 'AMC'],     // centre
      ['AML', 'AML'],    // left
      ['AMR', 'AMR'],    // right
    ])('"%s" folds to "%s"', (input, expected) => {
      expect(positionShortLabel(input)).toBe(expected);
    });

    it.each([
      ['DM', 'DMC'],     // centre
      ['DML', 'DML'],    // left
      ['DMR', 'DMR'],    // right
    ])('"%s" folds to "%s"', (input, expected) => {
      expect(positionShortLabel(input)).toBe(expected);
    });
  });

  describe('historical 1-slot CD family (pre-refactor) renders', () => {
    // These keys were retired by the position-fit refactor but
    // historical `match_tactics.lineupV2` JSONB rows from before
    // that refactor still emit them. They land in the engine via
    // `SLOT_KEY_NORMALIZER` (see attribute-calculator.ts), but the
    // FE's position-legend short-label table does not list them.
    // We return a `?<raw>` placeholder rather than blank so the
    // marker is still visible in historical replays.
    it.each([
      ['CD', '?CD'],
      ['CDL', '?CDL'],
      ['CDR', '?CDR'],
    ])('"%s" returns debuggable placeholder', (input, expected) => {
      expect(positionShortLabel(input)).toBe(expected);
    });
  });

  describe('unknown keys return a non-empty debuggable placeholder', () => {
    it('emits "?<raw>" for an unmapped key', () => {
      expect(positionShortLabel('XYZ_NEW_POS')).toBe('?XYZ_NEW_POS');
    });
    it('does not return empty string for any input', () => {
      expect(positionShortLabel('')).toBe('?');
      expect(positionShortLabel('???')).toBe('????');
    });
    it('handles youth-editor keys (LCB/RCB/...) with debuggable placeholder', () => {
      // Youth keys aren't expected to reach the FE marker layer
      // (the engine folds them upstream via YOUTH_POSITION_ALIASES),
      // but if one ever does slip through, we want a visible
      // marker rather than an empty bubble.
      expect(positionShortLabel('LCB')).toBe('?LCB');
      expect(positionShortLabel('ST')).toBe('?ST');
    });
  });
});
