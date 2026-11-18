import { defineConfig } from 'vitepress'

const zhSidebar = [
  { text: '用户指南', items: [
    { text: '用户指南总览', link: '/guide/user/' },
    { text: '首次连接与文件传输', link: '/guide/user/first-connection' },
    { text: '本地终端与串口', link: '/guide/user/local-and-serial' },
    { text: '功能与插件目录', link: '/guide/user/features' },
    { text: '设置与数据', link: '/guide/user/settings' },
    { text: '故障排查', link: '/guide/user/troubleshooting' },
  ] },
  { text: '开发者指南', items: [
    { text: '开发者指南总览', link: '/guide/developer/' },
    { text: '环境搭建与启动', link: '/guide/developer/getting-started' },
    { text: '架构与代码地图', link: '/guide/developer/architecture' },
    { text: 'IPC 与进程边界', link: '/guide/developer/ipc-reference' },
    { text: '数据模型与迁移', link: '/guide/developer/data-model' },
    { text: '配置与环境变量', link: '/guide/developer/configuration' },
    { text: '外置插件开发', link: '/guide/developer/plugins/' },
    { text: '插件 API 与插槽参考', link: '/guide/developer/plugin-api' },
    { text: '构建、测试与打包', link: '/guide/developer/build-test' },
    { text: '历史决策摘要', link: '/guide/developer/decision-history' },
    { text: '需求与计划状态', link: '/guide/developer/roadmap' },
  ] },
]

const enSidebar = [
  { text: 'User Guide', items: [
    { text: 'User Guide Overview', link: '/en/guide/user/' },
    { text: 'First Connection and File Transfer', link: '/en/guide/user/first-connection' },
    { text: 'Local Terminal and Serial', link: '/en/guide/user/local-and-serial' },
    { text: 'Features and Plugins', link: '/en/guide/user/features' },
    { text: 'Settings and Data', link: '/en/guide/user/settings' },
    { text: 'Troubleshooting', link: '/en/guide/user/troubleshooting' },
  ] },
  { text: 'Developer Guide', items: [
    { text: 'Developer Guide Overview', link: '/en/guide/developer/' },
    { text: 'Environment and Startup', link: '/en/guide/developer/getting-started' },
    { text: 'Architecture and Code Map', link: '/en/guide/developer/architecture' },
    { text: 'IPC and Process Boundaries', link: '/en/guide/developer/ipc-reference' },
    { text: 'Data Model and Migrations', link: '/en/guide/developer/data-model' },
    { text: 'Configuration and Environment', link: '/en/guide/developer/configuration' },
    { text: 'External Plugin Development', link: '/en/guide/developer/plugins/' },
    { text: 'Plugin API and Slots', link: '/en/guide/developer/plugin-api' },
    { text: 'Build, Test, and Package', link: '/en/guide/developer/build-test' },
    { text: 'Decision History', link: '/en/guide/developer/decision-history' },
    { text: 'Requirements and Plan Status', link: '/en/guide/developer/roadmap' },
  ] },
]

export default defineConfig({
  title: 'HyperShell Wiki',
  description: 'HyperShell user and developer guides',
  cleanUrls: true,
  lastUpdated: true,
  locales: {
    root: {
      label: '简体中文',
      lang: 'zh-CN',
      themeConfig: {
        nav: [
          { text: '用户指南', link: '/guide/user/' },
          { text: '开发者指南', link: '/guide/developer/' },
          { text: '项目仓库', link: 'https://github.com/tomertec/HyperShell' },
        ],
        sidebar: zhSidebar,
        outline: { label: '本页目录', level: [2, 3] },
        docFooter: { prev: '上一页', next: '下一页' },
        lastUpdated: { text: '最后更新' },
      },
    },
    en: {
      label: 'English',
      lang: 'en-US',
      link: '/en/',
      themeConfig: {
        nav: [
          { text: 'User Guide', link: '/en/guide/user/' },
          { text: 'Developer Guide', link: '/en/guide/developer/' },
          { text: 'Repository', link: 'https://github.com/tomertec/HyperShell' },
        ],
        sidebar: enSidebar,
        outline: { label: 'On this page', level: [2, 3] },
        lastUpdated: { text: 'Last updated' },
      },
    },
  },
  themeConfig: {
    logo: '/logo.svg',
    socialLinks: [{ icon: 'github', link: 'https://github.com/tomertec/HyperShell' }],
    search: {
      provider: 'local',
      options: {
        locales: {
          root: {
            translations: {
              button: { buttonText: '搜索文档', buttonAriaLabel: '搜索文档' },
              modal: {
                displayDetails: '显示详细结果',
                resetButtonTitle: '清除搜索',
                backButtonTitle: '关闭搜索',
                noResultsText: '没有找到结果',
                footer: {
                  selectText: '选择', selectKeyAriaLabel: '回车',
                  navigateText: '切换结果', navigateUpKeyAriaLabel: '向上',
                  navigateDownKeyAriaLabel: '向下', closeText: '关闭',
                  closeKeyAriaLabel: 'Esc',
                },
              },
            },
          },
        },
      },
    },
  },
})
