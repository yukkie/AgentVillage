/**
 * globalSetup.js — CSS ランタイム到達性ゲート（#634）。実行開始時に前回の計測結果を消し、
 * 削除済みテストファイル等の古い JSON が判定に混ざらないようにする。
 */
import fs from 'node:fs';
import { OUT_DIR } from './paths.js';

export default function setup() {
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
}
