/**
 * paths.js — CSS ランタイム到達性ゲート（#634）の共有パス。
 * setup.js（vitest ワーカー）・globalSetup.js・report.mjs が同じ出力先を参照する。
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const FRONTEND_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
// テストファイル単位の計測結果（JSON）の出力先。gitignore 済み。
export const OUT_DIR = path.join(FRONTEND_ROOT, '.tmp', 'css-reach');

/**
 * 絶対パスを FRONTEND_ROOT 相対・スラッシュ区切りに正規化する（例: `src/components/Avatar.module.css`）。
 * @param {string} absPath
 * @returns {string}
 */
export function toFrontendRelative(absPath) {
  return path.relative(FRONTEND_ROOT, absPath).split(path.sep).join('/');
}
