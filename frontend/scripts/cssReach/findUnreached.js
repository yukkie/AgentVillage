/**
 * findUnreached.js — CSS ランタイム到達性ゲート（#634）の判定（純粋関数）。
 *
 * vitest はテストファイルごとに別ワーカーで走るため、setup.js はファイル単位で
 * 計測結果（{source, selector, matched, error}[]）を書き出す。本関数はそれを横断マージし、
 * 「1ファイルでも一致すれば到達」として未到達を判定する。
 */

/**
 * @param {Array<Array<{source: string, selector: string, matched: boolean, error: string|null}>>} perFileRecords
 * @param {string[]} cssModuleFiles - 静的に列挙した全 `*.module.css`（setup.js の source と同じ正規化済みパス）
 * @returns {{
 *   unreachedSelectors: {source: string, selector: string}[],
 *   invalidSelectors: {source: string, selector: string, error: string}[],
 *   unloadedModules: string[],
 * }}
 */
export function findUnreached(perFileRecords, cssModuleFiles) {
  const merged = new Map();
  for (const records of perFileRecords) {
    for (const { source, selector, matched, error } of records) {
      const key = `${source}\u0000${selector}`;
      const prev = merged.get(key);
      merged.set(key, {
        source,
        selector,
        matched: Boolean(prev?.matched || matched),
        error: prev?.error || error || null,
      });
    }
  }

  const unreachedSelectors = [];
  const invalidSelectors = [];
  for (const { source, selector, matched, error } of merged.values()) {
    if (matched) continue;
    if (error) invalidSelectors.push({ source, selector, error });
    else unreachedSelectors.push({ source, selector });
  }

  const loaded = new Set([...merged.values()].map((r) => r.source));
  const unloadedModules = cssModuleFiles.filter((f) => !loaded.has(f));

  return { unreachedSelectors, invalidSelectors, unloadedModules };
}
