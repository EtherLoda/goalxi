/**
 * WCAG contrast ratio between two hex colors.
 * Returns a number in [1, 21] where 21 = max contrast (black/white).
 *
 * Formula: (L1 + 0.05) / (L2 + 0.05) where L is relative luminance.
 */
export function contrastRatio(hex1: string, hex2: string): number {
    const l1 = relativeLuminance(hex1);
    const l2 = relativeLuminance(hex2);
    const [bright, dark] = l1 > l2 ? [l1, l2] : [l2, l1];
    return (bright + 0.05) / (dark + 0.05);
}

/**
 * WCAG relative luminance for a #RRGGBB color.
 * https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 */
export function relativeLuminance(hex: string): number {
    const rgb = parseHex(hex);
    const [r, g, b] = [rgb.r, rgb.g, rgb.b].map((c) => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function parseHex(hex: string): { r: number; g: number; b: number } {
    const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
    if (!m) {
        return { r: 0, g: 0, b: 0 };
    }
    return {
        r: parseInt(m[1], 16),
        g: parseInt(m[2], 16),
        b: parseInt(m[3], 16),
    };
}
