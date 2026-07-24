/**
 * Set 内の要素を無条件にトグルする純粋関数（#597）。
 * 要素があれば削除、なければ追加した新しい Set を返す。入力 Set は変更しない。
 * 容量ガード等のドメイン制約は呼び出し側で扱う（この関数はトグル核のみを担う）。
 */
export function toggleInSet(set, item) {
  const next = new Set(set);
  if (next.has(item)) {
    next.delete(item);
  } else {
    next.add(item);
  }
  return next;
}
