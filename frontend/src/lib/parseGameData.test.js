import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEventLine, parseGameData, normalizeEvents, aggregateDayResults, aggregateNightResults, buildActionsTimeline, aggregateCoStatus, aggregateDayActions, computeDeadByDay } from './parseGameData.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const sourceLogDir = path.join(repoRoot, 'design/proposal/source_logs');

function readFixture(relativePath) {
  return fs.readFileSync(path.join(sourceLogDir, relativePath), 'utf8');
}

function readAgent(name) {
  return JSON.parse(readFixture(`agents/${name.toLowerCase()}.json`));
}

describe('parseEventLine', () => {
  it('parses one JSONL event line', () => {
    /**
     * SUT: parseEventLine
     * Mock: なし
     * Level: unit
     * Objective: JSONL の1行を LogEvent オブジェクトに変換できることを検証する。
     */
    const event = parseEventLine('{"event_type":"speech","agent":"Mira"}');
    expect(event).toEqual({ event_type: 'speech', agent: 'Mira' });
  });

  it('returns null for blank lines', () => {
    /**
     * SUT: parseEventLine
     * Mock: なし
     * Level: unit
     * Objective: JSONL 末尾の空行を無視できることを検証する。
     */
    expect(parseEventLine('   ')).toBeNull();
  });
});

describe('normalizeEvents', () => {
  it('merges private THINK rows into their public speech event', () => {
    /**
     * SUT: normalizeEvents
     * Mock: なし
     * Level: unit
     * Objective: spectator_log.jsonl の非公開 THINK 行が公開 speech の thought に結合されることを検証する。
     */
    const events = normalizeEvents([
      { day: 1, event_type: 'speech', agent: 'Mira', speech_id: 1, is_public: true, content: 'おはよう' },
      { day: 1, event_type: 'speech', agent: 'Mira', speech_id: 1, is_public: false, content: '[THINK] 内心' },
    ]);

    expect(events).toHaveLength(1);
    expect(events[0].content).toBe('おはよう');
    expect(events[0].reasoning).toBe('内心');
  });

  it('merges private THINK wolf_chat rows into their visible wolf_chat event', () => {
    /**
     * SUT: normalizeEvents
     * Mock: なし
     * Level: unit
     * Objective: speech_id を持たない wolf_chat の THINK 行が同じカードの reasoning に結合されることを検証する。
     */
    const events = normalizeEvents([
      { day: 1, phase: 'night_wolf_chat', event_type: 'wolf_chat', agent: 'Nox', is_public: false, content: 'Nox: Renを噛みたい' },
      { day: 1, phase: 'night_wolf_chat', event_type: 'wolf_chat', agent: 'Nox', is_public: false, content: '[THINK] Renは騎士ではなさそう' },
    ]);

    expect(events).toHaveLength(1);
    expect(events[0].content).toBe('Nox: Renを噛みたい');
    expect(events[0].reasoning).toBe('Renは騎士ではなさそう');
  });

  it('merges pending private THINK wolf_chat rows when they appear before visible chat', () => {
    /**
     * SUT: normalizeEvents
     * Mock: なし
     * Level: unit
     * Objective: JSONL 順序が逆転しても wolf_chat THINK 行を後続の表示イベントへ結合できることを検証する。
     */
    const events = normalizeEvents([
      { day: 1, phase: 'night_wolf_chat', event_type: 'wolf_chat', agent: 'Nox', is_public: false, content: '[THINK] 先に考えた内容' },
      { day: 1, phase: 'night_wolf_chat', event_type: 'wolf_chat', agent: 'Nox', is_public: false, content: 'Nox: Soraを噛もう' },
    ]);

    expect(events).toHaveLength(1);
    expect(events[0].content).toBe('Nox: Soraを噛もう');
    expect(events[0].reasoning).toBe('先に考えた内容');
  });
});

describe('normalizeEvents: reasoning passthrough for non-THINK event types', () => {
  it.each([
    ['vote',          { event_type: 'vote',          agent: 'Alice', target: 'Bob',  content: 'Alice votes for Bob',              is_public: true  }],
    ['inspection',    { event_type: 'inspection',    agent: 'Alice', target: 'Bob',  content: 'Alice inspects Bob: Werewolf',     is_public: false }],
    ['guard',         { event_type: 'guard',         agent: 'Carol', target: 'Alice', content: 'Carol guards Alice',             is_public: false }],
    ['medium_result', { event_type: 'medium_result', agent: 'Alice', target: 'Bob',  content: 'Alice senses: Bob was Werewolf',  is_public: false }],
  ])('preserves ev.reasoning for %s events', (_eventType, rawEvent) => {
    /**
     * SUT: normalizeEvents
     * Mock: なし
     * Level: unit
     * Objective: vote / inspection / guard / medium_result の reasoning フィールドが
     *            normalizeEvents を通過しても失われないことを検証する。
     *            これらはTHINKハックの対象外であり、ログの reasoning フィールドをそのまま
     *            FeedItem に渡す必要がある（contract テスト）。
     */
    const events = normalizeEvents([{ ...rawEvent, reasoning: '対象選択の理由。' }]);

    expect(events).toHaveLength(1);
    expect(events[0].reasoning).toBe('対象選択の理由。');
  });

  it.each([
    ['vote',          { event_type: 'vote',          agent: 'Alice', target: 'Bob',  content: 'Alice votes for Bob',              is_public: true  }],
    ['inspection',    { event_type: 'inspection',    agent: 'Alice', target: 'Bob',  content: 'Alice inspects Bob: Werewolf',     is_public: false }],
    ['guard',         { event_type: 'guard',         agent: 'Carol', target: 'Alice', content: 'Carol guards Alice',             is_public: false }],
    ['medium_result', { event_type: 'medium_result', agent: 'Alice', target: 'Bob',  content: 'Alice senses: Bob was Werewolf',  is_public: false }],
  ])('reasoning is undefined when absent for %s events', (_eventType, rawEvent) => {
    /**
     * SUT: normalizeEvents
     * Mock: なし
     * Level: unit
     * Objective: reasoning フィールドがないイベントでは undefined のまま出力されることを検証する。
     */
    const events = normalizeEvents([rawEvent]);

    expect(events).toHaveLength(1);
    expect(events[0].reasoning).toBeUndefined();
  });
});

describe('parseGameData', () => {
  it('parses real spectator_log.jsonl into events and agents', () => {
    /**
     * SUT: parseGameData
     * Mock: なし（design/proposal/source_logs/ の実ログを fixture に使用）
     * Level: unit
     * Objective: 実ログから GameData の events と agents を生成できることを検証する。
     */
    const gameData = parseGameData(readFixture('spectator_log.jsonl'), {
      Mira: readAgent('Mira'),
      Ren: readAgent('Ren'),
      Nox: readAgent('Nox'),
    });

    expect(gameData.events.length).toBeGreaterThan(0);
    expect(gameData.agents.Mira.name).toBe('Mira');
    expect(gameData.agents.Ren.name).toBe('Ren');
    expect(gameData.agents.Nox.name).toBe('Nox');
  });

  it('attaches thought text from real spectator_log.jsonl', () => {
    /**
     * SUT: parseGameData
     * Mock: なし（design/proposal/source_logs/ の実ログを fixture に使用）
     * Level: unit
     * Objective: 実 spectator log の THINK 行が speech.reasoning として利用できることを検証する。
     */
    const gameData = parseGameData(readFixture('spectator_log.jsonl'));
    const miraSpeech = gameData.events.find(
      event => event.event_type === 'speech' && event.agent === 'Mira' && event.speech_id === 1
    );

    expect(miraSpeech.reasoning).toContain('Day 1');
    expect(miraSpeech.reasoning).not.toContain('[THINK]');
  });

  it('includes daySummary in returned GameData', () => {
    /*
     * SUT: parseGameData
     * Mock: なし（design/proposal/source_logs/ の実ログを fixture に使用）
     * Level: unit
     * Objective: parseGameData の返り値に daySummary が含まれ、実ログの elimination/night_attack から正しく導出されることを検証する。
     */
    const gameData = parseGameData(readFixture('spectator_log.jsonl'));
    expect(gameData.daySummary).toBeDefined();
    const day1 = gameData.daySummary[1];
    expect(day1.target).toBeTruthy();
    expect(typeof day1.votes).toBe('number');
    expect(typeof day1.nightDone).toBe('boolean');
  });
});

describe('aggregateNightResults', () => {
  it('returns attacked name from private night_attack per day', () => {
    /*
     * SUT: aggregateNightResults
     * Mock: なし
     * Level: unit
     * Objective: is_public=false の night_attack の target（被害者）を day ごとにインデックスし、
     *            { attacked: string } を返すことを検証する。
     *            is_public=true の night_attack は agent/target が逆転しているバグがあるため使わない。
     */
    const events = [
      { day: 1, event_type: 'night_attack', agent: 'Kai', target: 'Sora', is_public: false },
      { day: 2, event_type: 'night_attack', agent: 'Kai', target: 'Rei',  is_public: false },
      { day: 2, event_type: 'night_attack', agent: 'Rei', target: null,   is_public: true },
    ];
    const result = aggregateNightResults(events);
    expect(result[1]).toEqual({ attacked: 'Sora' });
    expect(result[2]).toEqual({ attacked: 'Rei' });
  });

  it('ignores public night_attack events', () => {
    /*
     * SUT: aggregateNightResults
     * Mock: なし
     * Level: unit
     * Objective: is_public=true の night_attack は agent/target が逆転しているバグがあるため無視することを検証する。
     */
    const events = [
      { day: 1, event_type: 'night_attack', agent: 'Sora', target: null, is_public: true },
    ];
    const result = aggregateNightResults(events);
    expect(result[1]).toBeUndefined();
  });

  it('returns empty object when no night_attack events', () => {
    /*
     * SUT: aggregateNightResults
     * Mock: なし
     * Level: unit
     * Objective: night_attack がないイベント列では空オブジェクトを返すことを検証する。
     */
    const result = aggregateNightResults([
      { day: 1, event_type: 'speech', agent: 'Mira' },
    ]);
    expect(result).toEqual({});
  });
});

describe('buildActionsTimeline', () => {
  it('maps inspection event to divine kind entry', () => {
    /*
     * SUT: buildActionsTimeline
     * Mock: なし
     * Level: unit
     * Objective: inspection イベントが kind="divine" のタイムラインエントリに変換されることを検証する。
     */
    const events = [
      { day: 1, event_type: 'inspection', agent: 'Nox', target: 'Kai', content: 'Nox inspects Kai: Werewolf', is_public: false },
    ];
    const timeline = buildActionsTimeline(events);
    expect(timeline).toHaveLength(1);
    expect(timeline[0]).toMatchObject({ day: 1, when: 'N', kind: 'divine', who: 'Nox', target: 'Kai' });
  });

  it('maps guard event to guard kind entry', () => {
    /*
     * SUT: buildActionsTimeline
     * Mock: なし
     * Level: unit
     * Objective: guard イベントが kind="guard" のタイムラインエントリに変換されることを検証する。
     */
    const events = [
      { day: 1, event_type: 'guard', agent: 'Rei', target: 'Nox', content: 'Rei guards Nox', is_public: false },
    ];
    const timeline = buildActionsTimeline(events);
    expect(timeline).toHaveLength(1);
    expect(timeline[0]).toMatchObject({ day: 1, when: 'N', kind: 'guard', who: 'Rei', target: 'Nox' });
  });

  it('maps private night_attack to attack kind entry', () => {
    /*
     * SUT: buildActionsTimeline
     * Mock: なし
     * Level: unit
     * Objective: is_public=false の night_attack が kind="attack" に変換されることを検証する
     *            （狼視点の行動を表す）。
     */
    const events = [
      { day: 1, event_type: 'night_attack', agent: 'Kai', target: 'Sora', content: 'Kai attacks Sora', is_public: false },
    ];
    const timeline = buildActionsTimeline(events);
    expect(timeline).toHaveLength(1);
    expect(timeline[0]).toMatchObject({ day: 1, when: 'N', kind: 'attack', who: 'Kai', target: 'Sora' });
  });

  it('maps elimination to exec kind entry with when="D"', () => {
    /*
     * SUT: buildActionsTimeline
     * Mock: なし
     * Level: unit
     * Objective: elimination イベントが kind="exec", when="D" のタイムラインエントリに変換されることを検証する。
     */
    const events = [
      { day: 1, event_type: 'elimination', agent: 'Toma', target: null, content: 'Toma was eliminated.', is_public: true },
    ];
    const timeline = buildActionsTimeline(events);
    expect(timeline).toHaveLength(1);
    expect(timeline[0]).toMatchObject({ day: 1, when: 'D', kind: 'exec', who: '村', target: 'Toma' });
  });

  it('ignores public night_attack (result announcement) in timeline', () => {
    /*
     * SUT: buildActionsTimeline
     * Mock: なし
     * Level: unit
     * Objective: is_public=true の night_attack（村への結果通知）はタイムラインに含まれないことを検証する。
     */
    const events = [
      { day: 1, event_type: 'night_attack', target: 'Sora', is_public: true },
    ];
    const timeline = buildActionsTimeline(events);
    expect(timeline).toHaveLength(0);
  });

  it('orders entries: night actions before day actions', () => {
    /*
     * SUT: buildActionsTimeline
     * Mock: なし
     * Level: unit
     * Objective: 同日内で夜行動（when="N"）が昼行動（when="D"）より先に並ぶことを検証する。
     */
    const events = [
      { day: 1, event_type: 'elimination', agent: 'Toma', is_public: true },
      { day: 1, event_type: 'inspection',  agent: 'Nox',  target: 'Kai', is_public: false },
    ];
    const timeline = buildActionsTimeline(events);
    expect(timeline[0].when).toBe('N');
    expect(timeline[1].when).toBe('D');
  });

  it('parseGameData returns nightResults and actionsTimeline', () => {
    /*
     * SUT: parseGameData
     * Mock: なし
     * Level: unit
     * Objective: parseGameData の戻り値に nightResults と actionsTimeline が含まれることを検証する。
     */
    const jsonl = [
      JSON.stringify({ day: 1, event_type: 'night_attack', agent: 'Kai', target: 'Sora', is_public: false }),
      JSON.stringify({ day: 1, event_type: 'inspection', agent: 'Nox', target: 'Kai', is_public: false }),
    ].join('\n');
    const result = parseGameData(jsonl);
    expect(result.nightResults).toBeDefined();
    expect(result.nightResults[1]).toEqual({ attacked: 'Sora' });
    expect(result.actionsTimeline).toBeDefined();
    expect(result.actionsTimeline.length).toBeGreaterThan(0);
  });
});

describe('aggregateDayResults', () => {
  it('extracts elimination target and top vote count', () => {
    /*
     * SUT: aggregateDayResults
     * Mock: なし
     * Level: unit
     * Objective: elimination イベントの agent フィールドが daySummary の target に反映され、vote 集計で最多票数が votes に入ることを検証する。
     */
    const events = [
      { day: 1, event_type: 'elimination', agent: 'Kael', is_public: true },
      { day: 1, event_type: 'vote', agent: 'Nox',  target: 'Kael' },
      { day: 1, event_type: 'vote', agent: 'Mira', target: 'Kael' },
      { day: 1, event_type: 'vote', agent: 'Ren',  target: 'Sora' },
    ];
    const summary = aggregateDayResults(events);
    expect(summary[1].target).toBe('Kael');
    expect(summary[1].votes).toBe(2);
  });

  it('sets nightDone true when public night_attack exists', () => {
    /*
     * SUT: aggregateDayResults
     * Mock: なし
     * Level: unit
     * Objective: is_public な night_attack イベントがある日は nightDone が true、ない日は false になることを検証する。
     */
    const events = [
      { day: 1, event_type: 'night_attack', agent: 'Rei',  is_public: true },
      { day: 2, event_type: 'night_attack', agent: 'Sora', is_public: false },
    ];
    const summary = aggregateDayResults(events);
    expect(summary[1].nightDone).toBe(true);
    expect(summary[2]).toBeUndefined();
  });

  it('returns no entry for days with only speech events', () => {
    /*
     * SUT: aggregateDayResults
     * Mock: なし
     * Level: unit
     * Objective: speech のみのイベント列では daySummary にエントリが作られないことを検証する。
     */
    const events = [
      { day: 1, event_type: 'speech', agent: 'Mira', speech_id: 1 },
    ];
    const summary = aggregateDayResults(events);
    expect(summary[1]).toBeUndefined();
  });
});

describe('aggregateCoStatus', () => {
  it('returns agent→claimed_role map from co_announcement events', () => {
    /*
     * SUT: aggregateCoStatus
     * Mock: なし
     * Level: unit
     * Objective: co_announcement イベントから { エージェント名: claimed_role } マップを生成できることを検証する。
     */
    const events = [
      { day: 2, event_type: 'co_announcement', agent: 'Jonas', claimed_role: 'Seer', is_public: true },
      { day: 3, event_type: 'co_announcement', agent: 'SQ',    claimed_role: 'Medium', is_public: true },
    ];
    expect(aggregateCoStatus(events)).toEqual({ Jonas: 'Seer', SQ: 'Medium' });
  });

  it('returns empty object when no co_announcement events', () => {
    /*
     * SUT: aggregateCoStatus
     * Mock: なし
     * Level: unit
     * Objective: co_announcement がない場合は空オブジェクトを返すことを検証する。
     */
    const events = [
      { day: 1, event_type: 'speech', agent: 'Mira', speech_id: 1, is_public: true },
    ];
    expect(aggregateCoStatus(events)).toEqual({});
  });

  it('uses the last co_announcement when the same agent CO twice', () => {
    /*
     * SUT: aggregateCoStatus
     * Mock: なし
     * Level: unit
     * Objective: 同一エージェントが複数回COした場合、最後のCOが上書きされることを検証する。
     */
    const events = [
      { day: 2, event_type: 'co_announcement', agent: 'Ren', claimed_role: 'Seer',   is_public: true },
      { day: 3, event_type: 'co_announcement', agent: 'Ren', claimed_role: 'Villager', is_public: true },
    ];
    expect(aggregateCoStatus(events)).toEqual({ Ren: 'Villager' });
  });
});

describe('computeDeadByDay', () => {
  it('returns empty Sets for all days when there are no eliminations', () => {
    /*
     * SUT: computeDeadByDay
     * Mock: なし
     * Level: unit
     * Objective: elimination イベントがない場合、全日で空の Set が返ることを検証する。
     */
    const events = [
      { day: 1, event_type: 'speech', agent: 'Mira' },
    ];
    const result = computeDeadByDay(events);
    expect(result[1]).toEqual(new Set());
  });

  it('includes only Day 1 victim in Day 1 dead set', () => {
    /*
     * SUT: computeDeadByDay
     * Mock: なし
     * Level: unit
     * Objective: Day 1 を選択したとき、Day 1 の処刑対象のみが死亡者として含まれることを検証する（AC1）。
     */
    const events = [
      { day: 1, event_type: 'elimination', agent: 'Toma' },
      { day: 2, event_type: 'elimination', agent: 'Nox' },
    ];
    const result = computeDeadByDay(events);
    expect(result[1].has('Toma')).toBe(true);
    expect(result[1].has('Nox')).toBe(false);
  });

  it('accumulates previous victims in later days (AC2)', () => {
    /*
     * SUT: computeDeadByDay
     * Mock: なし
     * Level: unit
     * Objective: Day 2 以降を選択したとき、それ以前の累積死亡者が Set に含まれることを検証する（AC2）。
     */
    const events = [
      { day: 1, event_type: 'elimination', agent: 'Toma' },
      { day: 2, event_type: 'elimination', agent: 'Nox' },
      { day: 3, event_type: 'elimination', agent: 'Rei' },
    ];
    const result = computeDeadByDay(events);
    expect(result[2].has('Toma')).toBe(true);
    expect(result[2].has('Nox')).toBe(true);
    expect(result[2].has('Rei')).toBe(false);
  });

  it('final day set matches total dead (AC3)', () => {
    /*
     * SUT: computeDeadByDay
     * Mock: なし
     * Level: unit
     * Objective: 最終日の Set が全死亡者を含むことを検証する（AC3）。
     */
    const events = [
      { day: 1, event_type: 'elimination', agent: 'Toma' },
      { day: 2, event_type: 'elimination', agent: 'Nox' },
    ];
    const result = computeDeadByDay(events);
    expect(result[2]).toEqual(new Set(['Toma', 'Nox']));
  });

  it('handles days with no elimination by copying previous day dead set', () => {
    /*
     * SUT: computeDeadByDay
     * Mock: なし
     * Level: unit
     * Objective: elimination がない日（speech のみ）も前日の累積を引き継ぐことを検証する。
     */
    const events = [
      { day: 1, event_type: 'speech', agent: 'Mira' },
      { day: 1, event_type: 'elimination', agent: 'Toma' },
      { day: 2, event_type: 'speech', agent: 'Mira' },
    ];
    const result = computeDeadByDay(events);
    expect(result[2].has('Toma')).toBe(true);
  });
});

describe('aggregateDayActions', () => {
  it('collects night actions and exec result per day', () => {
    /*
     * SUT: aggregateDayActions
     * Mock: なし
     * Level: unit
     * Objective: inspection / guard / night_attack(private) / elimination / vote から日別サマリを生成することを検証する。
     */
    const events = [
      { day: 1, event_type: 'inspection',  agent: 'Nox',   target: 'Kai', content: 'Nox inspects Kai: Werewolf', is_public: false },
      { day: 1, event_type: 'guard',       agent: 'Rei',   target: 'Nox', content: 'Rei guards Nox',             is_public: false },
      { day: 1, event_type: 'night_attack', agent: 'Kai',  target: 'Sora', content: 'Werewolves attack Sora',    is_public: false },
      { day: 1, event_type: 'vote',         agent: 'Nox',  target: 'Toma', content: 'Nox votes for Toma',        is_public: true },
      { day: 1, event_type: 'vote',         agent: 'Mira', target: 'Toma', content: 'Mira votes for Toma',       is_public: true },
      { day: 1, event_type: 'vote',         agent: 'Kai',  target: 'Nox',  content: 'Kai votes for Nox',         is_public: true },
      { day: 1, event_type: 'elimination',  agent: 'Toma', target: null,   content: 'Toma was executed.',        is_public: true },
    ];
    const result = aggregateDayActions(events);
    const d1 = result[1];

    expect(d1.nightActions).toHaveLength(3);
    expect(d1.nightActions.find(a => a.event_type === 'inspection')).toBeTruthy();
    expect(d1.nightActions.find(a => a.event_type === 'guard')).toBeTruthy();
    expect(d1.nightActions.find(a => a.event_type === 'night_attack' && !a.is_public)).toBeTruthy();

    expect(d1.execResult.target).toBe('Toma');
    expect(d1.execResult.voteTable).toEqual([
      { from: 'Nox',  to: 'Toma' },
      { from: 'Mira', to: 'Toma' },
      { from: 'Kai',  to: 'Nox' },
    ]);
  });

  it('excludes public night_attack from nightActions (already shown in feed)', () => {
    /*
     * SUT: aggregateDayActions
     * Mock: なし
     * Level: unit
     * Objective: is_public な night_attack（夜明け公知イベント）は nightActions に含まれないことを検証する。
     */
    const events = [
      { day: 1, event_type: 'night_attack', agent: 'Kai',  target: 'Sora', is_public: false },
      { day: 1, event_type: 'night_attack', agent: 'Sora', target: null,   is_public: true },
    ];
    const result = aggregateDayActions(events);
    expect(result[1].nightActions).toHaveLength(1);
    expect(result[1].nightActions[0].is_public).toBe(false);
  });

  it('returns empty nightActions and null execResult for days with no relevant events', () => {
    /*
     * SUT: aggregateDayActions
     * Mock: なし
     * Level: unit
     * Objective: 該当イベントがない日はデフォルト値を返すことを検証する。
     */
    const events = [
      { day: 1, event_type: 'speech', agent: 'Mira', speech_id: 1 },
    ];
    const result = aggregateDayActions(events);
    expect(result[1]).toBeUndefined();
  });
});
