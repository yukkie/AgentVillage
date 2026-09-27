// CSS ランタイム到達性ゲート（#634）専用 config。通常の `npm test` を遅くしないため分離している。
// 実行: npm run audit:css:runtime（doc/FrontendDesign.md §7.6）
import { defineConfig, mergeConfig } from 'vitest/config';
import baseConfig from './vitest.config.js';

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      setupFiles: ['./scripts/cssReach/setup.js'],
      globalSetup: ['./scripts/cssReach/globalSetup.js'],
    },
  })
);
