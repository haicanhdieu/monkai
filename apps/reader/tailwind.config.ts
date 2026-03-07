import type { Config } from 'tailwindcss'

export default {
    content: ['./index.html', './src/**/*.{ts,tsx}'],
    theme: {
        extend: {
            colors: {
                kem: '#F5EDD6',
                'nau-tram': '#3D2B1F',
                'vang-dat': '#C8883A',
            },
            fontFamily: {
                serif: ['Lora', 'Georgia', 'Times New Roman', 'serif'],
                sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
            },
        },
    },
    plugins: [],
} satisfies Config
