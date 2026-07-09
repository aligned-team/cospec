import { defineConfig } from 'vitepress'
import llmstxt from 'vitepress-plugin-llms'

export default defineConfig({
  title: 'cospec',
  description: 'Conventional openspec — the spec-driven workflow, sized to your commit type.',
  cleanUrls: true,
  lastUpdated: true,
  sitemap: {
    hostname: 'https://cospec.aligned.team',
  },

  head: [
    [
      'link',
      {
        rel: 'preload',
        href: '/fonts/AvertaPE-Regular.woff2',
        as: 'font',
        type: 'font/woff2',
        crossorigin: '',
      },
    ],
    [
      'link',
      {
        rel: 'preload',
        href: '/fonts/ABCArizonaFlare-Thin.woff2',
        as: 'font',
        type: 'font/woff2',
        crossorigin: '',
      },
    ],
    ['meta', { name: 'theme-color', content: '#f1f0ed' }],
  ],

  vite: {
    plugins: [llmstxt()],
    resolve: {
      // Bun's isolated linker (bunfig.toml `install.linker = "isolated"`)
      // nests scoped sibling deps (e.g. @vue/server-renderer, a direct dep
      // of vue) behind a chain of symlinks. Without this, Vite/rolldown's
      // SSR build resolves `vue`'s own subpath imports against the
      // project-root-relative symlink path instead of the realpath, and
      // fails with "Cannot find module '@vue/server-renderer'".
      preserveSymlinks: true,
    },
  },

  themeConfig: {
    logo: '/aligned-logo.svg',

    nav: [
      { text: 'Guide', link: '/guide/installation' },
      { text: 'Concepts', link: '/concepts/types-and-artifacts' },
      { text: 'Reference', link: '/reference/commands' },
      { text: 'GitHub', link: 'https://github.com/aligned-team/cospec' },
    ],

    sidebar: [
      {
        items: [{ text: 'Overview', link: '/' }],
      },
      {
        text: 'Guide',
        items: [
          { text: 'Installation', link: '/guide/installation' },
          { text: 'The workflow', link: '/guide/workflow' },
          { text: 'Harness setup', link: '/guide/harness-setup' },
        ],
      },
      {
        text: 'Concepts',
        items: [
          { text: 'Types & artifacts', link: '/concepts/types-and-artifacts' },
          { text: 'Verification', link: '/concepts/verification' },
          { text: 'Apply & archive', link: '/concepts/apply-and-archive' },
          { text: 'Blocking changes', link: '/concepts/blocking-changes' },
          {
            text: 'How it relates to OpenSpec',
            link: '/concepts/how-it-relates-to-openspec',
          },
        ],
      },
      {
        text: 'Reference',
        items: [
          { text: 'Commands', link: '/reference/commands' },
          { text: 'Validation rules', link: '/reference/validation-rules' },
          { text: 'Configuration', link: '/reference/configuration' },
        ],
      },
    ],

    socialLinks: [{ icon: 'github', link: 'https://github.com/aligned-team/cospec' }],

    search: {
      provider: 'local',
    },

    outline: 'deep',

    editLink: {
      pattern: 'https://github.com/aligned-team/cospec/edit/main/apps/docs/:path',
      text: 'Edit this page on GitHub',
    },
  },
})
