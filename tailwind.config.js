/**
 * Tailwind theme 扩展 · 把 token 体系接进来
 *
 * 设计原则（docs/DESIGN_TOKENS.md §8）：
 * - colors 走 var(--*)：暗色主题切换时自动跟随
 * - spacing / radius / shadow 走 var(--*)：保持单一来源
 *
 * 命名约定（v4 · macOS Native）：
 * - brand-{50..900}   —— Brand 主色（Tech Blue，macOS System Blue 基准）
 * - accent-{500,600}  —— 关键 CTA 强调色（v4 起收敛为 brand 别名）
 * - gray-{50..950}    —— 冷调中性灰（同时暗色主题会重定义同名 var）
 * - surface-{0..3}    —— 表面分层（画布/面板/浮卡/模态）+ hover/active/inverse
 * - line-{subtle,default,strong} —— hairline 描边层级
 * - fg-{primary..muted,inverse,brand} —— 文本层级
 * - glass-{bg,bg-strong,border,highlight} —— 毛玻璃材质浮层
 * - overlay           —— 模态遮罩
 * - 语义色 success / warning / danger / info 直接暴露（HIG System Colors）
 */

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{vue,js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50: 'var(--brand-50)',
          100: 'var(--brand-100)',
          200: 'var(--brand-200)',
          300: 'var(--brand-300)',
          400: 'var(--brand-400)',
          500: 'var(--brand-500)',
          600: 'var(--brand-600)',
          700: 'var(--brand-700)',
          900: 'var(--brand-900)'
        },
        accent: {
          500: 'var(--accent-500)',
          600: 'var(--accent-600)'
        },
        gray: {
          50: 'var(--gray-50)',
          100: 'var(--gray-100)',
          200: 'var(--gray-200)',
          300: 'var(--gray-300)',
          400: 'var(--gray-400)',
          500: 'var(--gray-500)',
          600: 'var(--gray-600)',
          700: 'var(--gray-700)',
          800: 'var(--gray-800)',
          900: 'var(--gray-900)',
          950: 'var(--gray-950)'
        },
        // v2 · 表面分层
        surface: {
          0: 'var(--surface-0)',
          1: 'var(--surface-1)',
          2: 'var(--surface-2)',
          3: 'var(--surface-3)',
          hover: 'var(--surface-hover)',
          active: 'var(--surface-active)',
          inverse: 'var(--surface-inverse)'
        },
        // v2 · 描边层级（用法：border-line-subtle / border-line-default）
        line: {
          subtle: 'var(--border-subtle)',
          default: 'var(--border-default)',
          strong: 'var(--border-strong)'
        },
        // v2 · 文本层级（用法：text-fg-primary / text-fg-secondary）
        fg: {
          primary: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          tertiary: 'var(--text-tertiary)',
          muted: 'var(--text-muted)',
          inverse: 'var(--text-inverse)',
          brand: 'var(--text-brand)',
          danger: 'var(--text-danger)',
          success: 'var(--text-success)'
        },
        // v2 · 玻璃拟态
        glass: {
          bg: 'var(--glass-bg)',
          'bg-strong': 'var(--glass-bg-strong)',
          border: 'var(--glass-border)',
          highlight: 'var(--glass-highlight)'
        },
        overlay: 'var(--overlay-bg)',
        success: 'var(--color-success)',
        warning: 'var(--color-warning)',
        danger: 'var(--color-danger)',
        info: 'var(--color-info)',
        // Pomodoro module — Stitch ZenFocus Design System
        pomo: {
          work: 'var(--pomo-work)',
          'work-soft': 'var(--pomo-work-soft)',
          'work-glow': 'var(--pomo-work-glow)',
          short: 'var(--pomo-short)',
          'short-soft': 'var(--pomo-short-soft)',
          long: 'var(--pomo-long)',
          'long-soft': 'var(--pomo-long-soft)',
          paused: 'var(--pomo-paused)',
          'paused-soft': 'var(--pomo-paused-soft)',
          idle: 'var(--pomo-idle)',
          'idle-soft': 'var(--pomo-idle-soft)',
          surface: 'var(--pomo-surface)',
          'surface-alt': 'var(--pomo-surface-alt)',
          'surface-container': 'var(--pomo-surface-container)',
          'surface-container-low': 'var(--pomo-surface-container-low)',
          'surface-variant': 'var(--pomo-surface-variant)',
          'glass-bg': 'var(--pomo-glass-bg)',
          'glass-bg-elevated': 'var(--pomo-glass-bg-elevated)',
          'glass-border': 'var(--pomo-glass-border)',
          'glass-border-elevated': 'var(--pomo-glass-border-elevated)',
          outline: 'var(--pomo-outline)',
          'outline-variant': 'var(--pomo-outline-variant)',
          'text-strong': 'var(--pomo-text-strong)',
          'text-soft': 'var(--pomo-text-soft)',
          'text-muted': 'var(--pomo-text-muted)',
          'priority-high': 'var(--pomo-priority-high)',
          'priority-med': 'var(--pomo-priority-med)',
          'priority-low': 'var(--pomo-priority-low)'
        }
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
        '2xl': '1.5rem',
        full: '9999px'
      },
      fontFamily: {
        sans: ['var(--font-sans)'],
        mono: ['var(--font-mono)']
      },
      // bg-gradient-primary：录屏模块沿用已久的类名（此前从未定义 → 幽灵类），
      // 在此接入 token，保证亮/暗主题都可用
      backgroundImage: {
        'gradient-primary': 'var(--gradient-primary)'
      },
      fontSize: {
        'timer-display': [
          '120px',
          { lineHeight: '120px', letterSpacing: '-0.05em', fontWeight: '300' }
        ],
        'timer-mobile': ['80px', { lineHeight: '80px', fontWeight: '300' }],
        'headline-lg': [
          '32px',
          { lineHeight: '40px', letterSpacing: '-0.02em', fontWeight: '600' }
        ],
        'headline-md': ['24px', { lineHeight: '32px', fontWeight: '600' }],
        'body-lg': ['18px', { lineHeight: '28px', fontWeight: '400' }],
        'body-md': ['16px', { lineHeight: '24px', fontWeight: '400' }],
        'label-md': ['14px', { lineHeight: '20px', letterSpacing: '0.02em', fontWeight: '500' }],
        'label-sm': ['12px', { lineHeight: '16px', letterSpacing: '0.05em', fontWeight: '500' }]
      },
      animation: {
        'zf-breathe': 'zf-breathe 8s ease-in-out infinite',
        'zf-breathe-fast': 'zf-breathe 4s ease-in-out infinite',
        'zf-glow-shift': 'zf-glow-shift 10s ease-in-out infinite',
        'zf-fade-in-up': 'zf-fade-in-up 0.8s cubic-bezier(0.16,1,0.3,1) forwards',
        'zf-fade-in-up-1': 'zf-fade-in-up 0.8s cubic-bezier(0.16,1,0.3,1) 0.1s forwards',
        'zf-fade-in-up-2': 'zf-fade-in-up 0.8s cubic-bezier(0.16,1,0.3,1) 0.2s forwards',
        'zf-blink': 'zf-blink 1.4s infinite both',
        'zf-pulse-slow': 'zf-pulse-slow 3s cubic-bezier(0.4,0,0.6,1) infinite'
      },
      keyframes: {
        'zf-breathe': {
          '0%,100%': { transform: 'scale(1)', opacity: '1' },
          '50%': { transform: 'scale(1.02)', opacity: '0.95' }
        },
        'zf-glow-shift': {
          '0%,100%': { transform: 'translate(0,0) scale(1)', opacity: '0.6' },
          '33%': { transform: 'translate(2%,-2%) scale(1.05)', opacity: '0.8' },
          '66%': { transform: 'translate(-2%,2%) scale(0.95)', opacity: '0.5' }
        },
        'zf-fade-in-up': {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        },
        'zf-blink': {
          '0%': { opacity: '0.2' },
          '20%': { opacity: '1' },
          '100%': { opacity: '0.2' }
        },
        'zf-pulse-slow': {
          '0%,100%': { opacity: '1' },
          '50%': { opacity: '0.4' }
        }
      },
      boxShadow: {
        xs: 'var(--shadow-xs)',
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
        glow: 'var(--shadow-glow)',
        'ring-focus': 'var(--shadow-ring-focus)',
        'ring-danger': 'var(--shadow-ring-danger)'
      },
      transitionTimingFunction: {
        leaf: 'cubic-bezier(0.16, 1, 0.3, 1)'
      },
      transitionDuration: {
        instant: '40ms',
        fast: '80ms',
        normal: '160ms',
        slow: '280ms',
        spring: '360ms'
      }
    }
  },
  plugins: []
}
