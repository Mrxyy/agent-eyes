const { CodeInspectorPlugin } = require('code-inspector-plugin');

module.exports = {
  // ...other code
  chainWebpack: (config) => {
    // add this configuration in the development environment
    config.plugin('code-inspector-plugin').use(
      CodeInspectorPlugin({
        bundler: 'webpack',
        agent: {
          acp: {
            // command: 'claude-agent-acp',
            command: 'codex-acp',
            args: [],
            // command: 'gemini',
            // args: ['--experimental-acp'],
            persistSession: true,
            authMethodId: process.env.CODE_INSPECTOR_ACP_AUTH_METHOD_ID,
          },
        },
      })
    );

    config.module
      .rule('pug')
      .test(/\.pug$/) // 替换为你的文件扩展名
      .use('pug-plain-loader')
      .loader('pug-plain-loader'); // 替换为你的 loader 名称
  },
};
