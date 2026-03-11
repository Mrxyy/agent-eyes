import {
  transformCode,
  normalizePath,
  CodeOptions,
  getCodeWithWebComponent,
  RecordInfo,
  isJsTypeFile,
  isDev,
  getMappingFilePath,
  isExcludedFile,
  getProjectRecord,
  clientJsPath,
} from '@code-inspector/core';
import chalk from 'chalk';

const PluginName = '@code-inspector/vite';

const OrderedPlugins = [
  {
    name: 'vite:react-babel',
    package: '@vitejs/plugin-react',
  },
  {
    name: 'vite:react-swc',
    package: '@vitejs/plugin-react-swc',
  },
  {
    name: 'vite:react-oxc:config',
    package: '@vitejs/plugin-react-oxc',
  },
  {
    name: 'solid',
    package: 'vite-plugin-solid',
  },
  {
    name: 'vite-plugin-qwik',
    package: 'qwikVite',
  },
  {
    name: 'vite-plugin-qwik-city',
    package: 'qwikCity',
  },
  {
    name: 'vite-plugin-qwik-react',
    package: 'qwikReact',
  },
  {
    name: 'vite:preact-jsx',
    package: '@preact/preset-vite',
  },
  {
    name: 'vite-plugin-svelte',
    package: '@sveltejs/vite-plugin-svelte',
  },
];

const jsxParamList = ['isJsx', 'isTsx', 'lang.jsx', 'lang.tsx'];

function printOrderWarning(plugins: { name: string }[] = []) {
  const pluginIndex = plugins.findIndex((plugin) => plugin.name === PluginName);
  OrderedPlugins.forEach((p) => {
    const _pluginIndex = plugins.findIndex((plugin) => plugin.name === p.name);
    if (_pluginIndex !== -1 && _pluginIndex < pluginIndex) {
      const info = [
        chalk.yellow('[WARNING]'),
        'You need to put',
        chalk.green('code-inspector-plugin'),
        'before',
        chalk.green(p.package),
        'in the vite config file.',
      ];
      console.log(info.join(' '));
    }
  });
}

interface Options extends CodeOptions {
  close?: boolean;
  output: string;
}

export function ViteCodeInspectorPlugin(options: Options) {
  const record: RecordInfo = {
    port: 0,
    entry: '',
    output: options.output,
    envDir: '',
  };
  return {
    name: PluginName,
    ...(options.enforcePre === false ? {} : { enforce: 'pre' as 'pre' }),
    apply(_, { command }) {
      return !options.close && isDev(options.dev, command === 'serve');
    },
    configResolved(config) {
      record.envDir = config.envDir || config.root;
      record.root = config.root;
    },
    async transform(code: string, id: string) {
      const [_completePath, query = ''] = id.split('?', 2);
      const completePath = normalizePath(_completePath);

      if (isExcludedFile(completePath, options)) {
        return code;
      }

      code = await getCodeWithWebComponent({
        options,
        file: completePath,
        code,
        record,
      });

      const { escapeTags = [], mappings } = options;

      let filePath = completePath;
      filePath = getMappingFilePath(filePath, mappings);
      const params = new URLSearchParams(query);
      // 仅对符合正则的生效
      if (options.match && !options.match.test(filePath)) {
        return code;
      }

      let fileType = '';
      if (
        isJsTypeFile(filePath) ||
        (filePath.endsWith('.vue') &&
          (jsxParamList.some((param) => params.get(param) !== null) ||
            params.get('lang') === 'tsx' ||
            params.get('lang') === 'jsx'))
      ) {
        // jsx 代码
        fileType = 'jsx';
      } else if (
        filePath.endsWith('.html') &&
        params.get('type') === 'template' &&
        params.has('vue')
      ) {
        // <template src="xxx.html"></template>
        fileType = 'vue';
      } else if (
        filePath.endsWith('.vue') &&
        params.get('type') !== 'style' &&
        params.get('raw') === null
      ) {
        // vue 代码
        fileType = 'vue';
      } else if (filePath.endsWith('.svelte')) {
        // svelte 代码
        fileType = 'svelte';
      }

      if (fileType) {
        return await transformCode({
          content: code,
          filePath,
          fileType,
          escapeTags,
          pathType: options.pathType,
        });
      }

      return code;
    },
    // 追加到 html 中，适配 MPA 项目
    async transformIndexHtml(html) {
      if (options.skipSnippets?.includes?.('htmlScript')) {
        return html;
      }
      const code = await getCodeWithWebComponent({
        options: { ...options, importClient: 'code' },
        file: 'main.js',
        code: '',
        record,
        inject: true,
      });
      return html.replace(
        '<head>',
        `<head><script type="module">\n${code}\n</script>`
      );
    },
    configureServer(server) {
      const originalLog = server.config.logger.info;

      server.config.logger.info = function (message, options) {
        originalLog.call(this, message, options);

        printOrderWarning(server.config.plugins);

        server.config.logger.info = originalLog;
      };

      if (options.importClient !== 'file') {
        return;
      }

      const debounce = (fn: () => void, delayMs: number) => {
        let timer: NodeJS.Timeout | undefined;
        return () => {
          if (timer) clearTimeout(timer);
          timer = setTimeout(fn, delayMs);
        };
      };

      const iifePath = clientJsPath.replace(/client\.umd\.js$/, 'client.iife.js');
      server.watcher.add([clientJsPath, iifePath]);

      const injectTargets = Array.isArray(options.injectTo)
        ? options.injectTo
        : options.injectTo
          ? [options.injectTo]
          : [];

      const refreshInjectedFile = debounce(() => {
        const targetFile = injectTargets[0];
        const port = getProjectRecord(record)?.port;
        if (!targetFile || !port) {
          return;
        }
        getCodeWithWebComponent({
          options,
          record,
          file: targetFile,
          code: '',
          inject: true,
        }).catch(() => {});
      }, 300);

      server.watcher.on('change', (file: string) => {
        const normalized = normalizePath(file);
        if (normalized === normalizePath(clientJsPath) || normalized === normalizePath(iifePath)) {
          refreshInjectedFile();
        }
      });
    },
  };
}
