import { contrastRatio, relativeLuminance } from './color-contrast';

describe('contrastRatio', () => {
    it('returns 21 for black on white (max contrast)', () => {
        expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 1);
    });

    it('returns 1 for same color (min contrast)', () => {
        expect(contrastRatio('#FF0000', '#FF0000')).toBeCloseTo(1, 5);
    });

    it('is symmetric', () => {
        const a = contrastRatio('#FF0000', '#FFFFFF');
        const b = contrastRatio('#FFFFFF', '#FF0000');
        expect(a).toBeCloseTo(b, 5);
    });

    it('meets WCAG AA threshold (>= 3) for #000000 on #FFFFFF', () => {
        expect(contrastRatio('#000000', '#FFFFFF')).toBeGreaterThanOrEqual(3);
    });

    it('fails WCAG AA threshold for light gray on white', () => {
        expect(contrastRatio('#EEEEEE', '#FFFFFF')).toBeLessThan(3);
    });

    it('accepts hex without leading #', () => {
        expect(contrastRatio('FF0000', 'FFFFFF')).toBeCloseTo(
            contrastRatio('#FF0000', '#FFFFFF'),
            5,
        );
    });
});

describe('relativeLuminance', () => {
    it('returns 1 for white', () => {
        expect(relativeLuminance('#FFFFFF')).toBeCloseTo(1, 5);
    });

    it('returns 0 for black', () => {
        expect(relativeLuminance('#000000')).toBeCloseTo(0, 5);
    });
});
