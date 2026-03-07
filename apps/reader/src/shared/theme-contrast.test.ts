import { describe, it, expect } from 'vitest'

function hexToRgb(hex: string): [number, number, number] {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)!
    return [
        parseInt(result[1], 16),
        parseInt(result[2], 16),
        parseInt(result[3], 16),
    ]
}

function relativeLuminance(r: number, g: number, b: number): number {
    const [rs, gs, bs] = [r, g, b].map(c => {
        const s = c / 255
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
    })
    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs
}

function contrastRatio(hex1: string, hex2: string): number {
    const l1 = relativeLuminance(...hexToRgb(hex1))
    const l2 = relativeLuminance(...hexToRgb(hex2))
    const lighter = Math.max(l1, l2)
    const darker = Math.min(l1, l2)
    return (lighter + 0.05) / (darker + 0.05)
}

const themes = {
    sepia: { text: '#3D2B1F', background: '#F5EDD6' },
    light: { text: '#1A1A1A', background: '#FFFFFF' },
    dark: { text: '#E8D5B0', background: '#1A1207' },
}

describe('Reading theme WCAG AA contrast', () => {
    Object.entries(themes).forEach(([name, { text, background }]) => {
        it(`${name} theme passes WCAG AA (≥4.5:1)`, () => {
            const ratio = contrastRatio(text, background)
            expect(ratio).toBeGreaterThanOrEqual(4.5)
        })
    })
})
