/* global process:false, __dirname:false */

const rspack = require('@rspack/core');
const MonacoWebpackPlugin = require('monaco-editor-webpack-plugin');
const { TsCheckerRspackPlugin } = require('ts-checker-rspack-plugin');
const fs = require('node:fs');
const path = require('node:path');

const allKeybindingNames = fs
  .globSync('./node_modules/ace-builds/src-noconflict/keybinding-*.js')
  .map((n) => path.basename(n))
  .map((n) => n.replace(/^keybinding-/, ''))
  .map((n) => n.replace(/.js$/, ''));
const allThemeNames = fs
  .globSync('./node_modules/ace-builds/src-noconflict/theme-*.js')
  .map((n) => path.basename(n))
  .map((n) => n.replace(/^theme-/, ''))
  .map((n) => n.replace(/.js$/, ''));
// There's a builtin/default keybinding that we call `ace`.
const allKeybindings = allKeybindingNames.concat(['ace']).sort();
const allThemes = allThemeNames;

// The page is web/index.html, and everything it loads is in web/dist/ui,
// next to the toolchain (scripts/build-web.sh). The kernel worker is not
// bundled: the page starts it from web/kernel.
const outputDir = path.resolve(__dirname, '../web/dist/ui');

// Writes build/packages.json: the npm packages whose code is in the
// bundle, for the licenses page (scripts/licenses.py).
class PackagesManifestPlugin {
  apply(compiler) {
    compiler.hooks.done.tap('PackagesManifestPlugin', (stats) => {
      const dirs = new Set();
      const add = (m) => {
        // Orphan modules are in no chunk; ignored ones are empty stand-ins.
        if (m.orphan || m.moduleType === 'runtime' || m.moduleType === 'ignored') return;
        const match = /^(.*\/node_modules\/(?:@[^/]+\/)?[^/]+)\//.exec(m.nameForCondition ?? '');
        if (match) dirs.add(match[1]);
        for (const nested of m.modules ?? []) add(nested);
      };
      const walk = (json) => {
        for (const m of json.modules ?? []) add(m);
        for (const child of json.children ?? []) walk(child);
      };
      walk(stats.toJson({ all: false, modules: true, nestedModules: true, children: true }));
      fs.mkdirSync(`${__dirname}/build`, { recursive: true });
      fs.writeFileSync(
        `${__dirname}/build/packages.json`,
        JSON.stringify([...dirs].sort(), null, 1),
      );
    });
  }
}

// The name is nicer to debug with, but changing names breaks long-term-caching
const developmentFilenameTemplate = '[name]-[contenthash]';
const developmentChunkFilenameTemplate = '[name]-[chunkhash]';

const productionFilenameTemplate = '[contenthash]';
const productionChunkFilenameTemplate = '[chunkhash]';

module.exports = function (_, argv) {
  const isProduction = argv.mode === 'production';
  const filenameTemplate = isProduction ? productionFilenameTemplate : developmentFilenameTemplate;
  const chunkFilenameTemplate = isProduction
    ? productionChunkFilenameTemplate
    : developmentChunkFilenameTemplate;

  const devtool = isProduction ? false : 'inline-source-map';

  return {
    entry: './index.tsx',

    devtool,

    cache: {
      type: 'persistent',

      buildDependencies: [__filename],
    },

    output: {
      publicPath: 'auto',
      path: outputDir,
      clean: true,
      filename: `${filenameTemplate}.js`,
      chunkFilename: `${chunkFilenameTemplate}.js`,
    },

    resolve: {
      extensions: ['.js', '.jsx', '.ts', '.tsx'],
      // Ignoring these brought in from web-tree-sitter
      fallback: {
        'fs/promises': false,
        module: false,
      },
    },

    module: {
      rules: [
        {
          test: /\.(?:js|mjs|jsx|ts|tsx)$/,
          exclude: /node_modules/,
          use: [
            {
              loader: 'builtin:swc-loader',
              options: {
                jsc: {
                  transform: {
                    react: {
                      runtime: 'automatic',
                      development: !isProduction,
                    },
                    reactCompiler: {
                      compilationMode: 'annotation',
                    },
                  },
                },
                detectSyntax: 'auto',
              },
            },
          ],
        },
        {
          test: /\.css$/,
          oneOf: [
            // Prism styles as separate files for the shadow DOM
            {
              test: [/prismjs\/themes/, /prismjs-overrides.css$/],
              type: 'asset/resource',
            },

            // Any other CSS
            {
              use: ['postcss-loader'],
              type: 'css/auto',
            },
          ],
        },
        // This inlines the codicon.ttf file from Monaco. Using a
        // regular file fails because it looks for
        // `/assets/assets/...`. Inlining saves a file, and it's
        // pretty small compared to the rest of Monaco.
        {
          test: /\.ttf$/,
          include: /node_modules\/monaco-editor/,
          type: 'asset/inline',
        },
        {
          test: /\.svg$/,
          type: 'asset/inline',
        },
      ],
    },

    plugins: [
      new TsCheckerRspackPlugin(),
      new rspack.DefinePlugin({
        ACE_KEYBINDINGS: JSON.stringify(allKeybindings),
        ACE_THEMES: JSON.stringify(allThemes),
      }),
      new rspack.HtmlRspackPlugin({
        title: 'Rust in the Browser',
        template: 'index.ejs',
        filename: '../../index.html',
      }),
      new PackagesManifestPlugin(),
      new MonacoWebpackPlugin({
        filename: `${filenameTemplate}.worker.js`,
        languages: ['rust'],
      }),
    ],

    optimization: {
      splitChunks: {
        chunks: 'all',
      },
    },
  };
};
