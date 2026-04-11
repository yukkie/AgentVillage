# AgentVillage — 技術的負債メモ

コードレビュー（simplify）で発見した問題を記録する。
優先度: 🔴 High / 🟡 Medium / 🟢 Low

---

## 🔴 CO_ANNOUNCEMENT の文字列パース（replay.py）

**場所:** `src/ui/replay.py` `ReplayPager._build_lines()`

```python
marker = "claims to be "
idx = event.content.find(marker)
dynamic_agents[event.agent].claimed_role = event.content[idx + len(marker):].strip()
```

`game.py` のログ出力フォーマット（`f"{agent.name} claims to be {agent.claimed_role}"`）を文字列パースしている。
フォーマットを変えると即壊れる。

**修正案:** `LogEvent` に `claimed_role: str | None` フィールドを追加し、`CO_ANNOUNCEMENT` 記録時に値を入れる。
既存アーカイブとの後方互換は `default=None` で対応可能。

---

## 🟡 `build_system_prompt` のパラメータ過多

**場所:** `src/llm/prompt.py` `build_system_prompt()`

現在12引数。`wolf_partners` 追加でさらに増えた。

**修正案:** Ideas.md §20 の Role クラス化（`build_role_prompt` を Role クラスのメソッドに移管）を実施するタイミングで整理する。役職固有の引数（`wolf_partners` など）は Role クラスが保持することで signature を減らせる。

---

## 🟡 `build_role_prompt` に guard がない

**場所:** `src/llm/prompt.py` `build_role_prompt()`

`wolf_partners` が None でない場合に Werewolf 以外が渡されても動作がおかしくなるケースがある（呼び出し元が誤った使い方をした場合）。現状は `game.py` 側で正しく制御しているが、関数の契約として明示されていない。

**修正案:** Role クラス化（§20）のタイミングで解消。または短期的に `assert role == "Werewolf" or wolf_partners is None` を追加。

---

## 🟡 `_load_agents()` が `store.load_all()` と重複

**場所:** `src/ui/replay.py` `ReplayPager._load_agents()`

`src/agent/store.load_all()` と同じパターン（glob → JSON parse → model_validate）だが、ディレクトリが `state_archive/xxx/agents/` で異なるため直接呼べない。

**修正案:** `store.load_all_from_dir(path: Path) -> list[AgentState]` を追加して両者から呼ぶ。

---

## 🟢 `_load_events()` の JSONL パースが重複しうる

**場所:** `src/ui/replay.py` `ReplayPager._load_events()`

JSONL の読み込み・パターンは `src/logger/writer.py` の書き込み処理の逆。将来 logger 側に読み込みユーティリティ（`load_events(path)`）を追加すれば共通化できる。

---

## 🟢 役職名がすべて文字列リテラル

**場所:** `src/engine/game.py`, `src/llm/prompt.py` 他多数

`"Werewolf"`, `"Seer"`, `"Villager"` 等を文字列で比較している。タイポ時に実行時エラーにならない。

**修正案:** Ideas.md §20 の Role クラス化で定数に集約。現状の規模では許容範囲。

---

## 🟢 CO 判断プロンプトの Werewolf / Madman ブロックが類似

**場所:** `src/llm/prompt.py` `build_system_prompt()` の `intended_co` ブロック

Werewolf と Madman で内容が似た文字列ブロックが並んでいる。Role クラス化時に `co_prompt()` メソッドとして各クラスに移管する。

---

## 🟢 replay.py のコメントが WHAT 説明になっている

**場所:** `src/ui/replay.py` `_build_lines()`

「Reset claimed_role to None so...」「Update claimed_role in real time...」など、コードを読めばわかることを説明しているコメントがある。
WHY（なぜ end-of-game state をそのまま使えないか）だけ残して WHAT コメントは削除してよい。

---

*最終更新: 2026-04-11*
