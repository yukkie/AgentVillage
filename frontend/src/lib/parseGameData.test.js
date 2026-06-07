import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEventLine, parseGameData, normalizeEvents, aggregateDaySummary, aggregateNightResults, buildActionsTimeline, aggregateCoStatus, computeDeadByDay } from './parseGameData.js';

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
    expect(day1.execResult.target).toBeTruthy();
    expect(typeof day1.execResult.votes).toBe('number');
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

describe('aggregateDaySummary', () => {
  it('extracts elimination target and top vote count', () => {
    /*
     * SUT: aggregateDaySummary
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
    const summary = aggregateDaySummary(events);
    expect(summary[1].execResult.target).toBe('Kael');
    expect(summary[1].execResult.votes).toBe(2);
  });

  it('sets nightDone true when public night_attack exists', () => {
    /*
     * SUT: aggregateDaySummary
     * Mock: なし
     * Level: unit
     * Objective: is_public な night_attack イベントがある日は nightDone が true、ない日は false になることを検証する。
     */
    const events = [
      { day: 1, event_type: 'night_attack', agent: 'Rei',  is_public: true },
      { day: 2, event_type: 'night_attack', agent: 'Sora', is_public: false },
    ];
    const summary = aggregateDaySummary(events);
    expect(summary[1].nightDone).toBe(true);
    expect(summary[2].nightDone).toBe(false);
  });

  it('counts speech events per day', () => {
    /*
     * SUT: aggregateDaySummary
     * Mock: なし
     * Level: unit
     * Objective: speech イベントが speechCount に集計され、複数日が独立して集計されることを検証する。
     */
    const events = [
      { day: 1, event_type: 'speech', agent: 'Mira', speech_id: 1 },
      { day: 1, event_type: 'speech', agent: 'Kael', speech_id: 2 },
      { day: 2, event_type: 'speech', agent: 'Nox',  speech_id: 1 },
    ];
    const summary = aggregateDaySummary(events);
    expect(summary[1].speechCount).toBe(2);
    expect(summary[2].speechCount).toBe(1);
  });
});

describe('aggregateCoStatus: new schema (speech.claimed_role)', () => {
  it('reads claimed_role from speech events (new log path)', () => {
    /*
     * SUT: aggregateCoStatus
     * Mock: なし
     * Level: unit
     * Objective: 新スキーマでは speech.claimed_role から CO を集計できることを検証する（新経路 contract テスト）。
     */
    const events = [
      { day: 2, event_type: 'speech', agent: 'Jonas', claimed_role: 'Seer', is_public: true, content: '占い師COします' },
      { day: 3, event_type: 'speech', agent: 'SQ',    claimed_role: 'Medium', is_public: true, content: '霊媒師COします' },
      { day: 3, event_type: 'speech', agent: 'Nox',   claimed_role: null, is_public: true, content: 'ただの発言' },
    ];
    expect(aggregateCoStatus(events)).toEqual({ Jonas: 'Seer', SQ: 'Medium' });
  });

  it('new-path CO obeys upToDay filter', () => {
    /*
     * SUT: aggregateCoStatus
     * Mock: なし
     * Level: unit
     * Objective: speech.claimed_role の新経路も upToDay フィルタが効くことを検証する。
     */
    const events = [
      { day: 1, event_type: 'speech', agent: 'Jonas', claimed_role: 'Seer',   is_public: true, content: 'CO' },
      { day: 3, event_type: 'speech', agent: 'SQ',    claimed_role: 'Medium', is_public: true, content: 'CO' },
    ];
    expect(aggregateCoStatus(events, 2)).toEqual({ Jonas: 'Seer' });
  });

  it('speech.claimed_role and co_announcement coexist: both paths contribute', () => {
    /*
     * SUT: aggregateCoStatus
     * Mock: なし
     * Level: unit
     * Objective: 新ログ（speech.claimed_role）と旧ログ（co_announcement）が混在しても両方の CO が集計されることを検証する（後方互換）。
     */
    const events = [
      { day: 2, event_type: 'speech',         agent: 'Jonas', claimed_role: 'Seer',   is_public: true },
      { day: 3, event_type: 'co_announcement', agent: 'SQ',    claimed_role: 'Medium', is_public: true },
    ];
    expect(aggregateCoStatus(events)).toEqual({ Jonas: 'Seer', SQ: 'Medium' });
  });
});

describe('normalizeEvents: new schema reasoning passthrough', () => {
  it('speech with reasoning field passes through without THINK merge', () => {
    /*
     * SUT: normalizeEvents
     * Mock: なし
     * Level: unit
     * Objective: 新スキーマで reasoning フィールドが直接セットされた speech イベントは、
     *            [THINK] マージ処理なしで reasoning がそのまま保持されることを検証する（新経路 contract テスト）。
     */
    const events = normalizeEvents([
      { day: 1, event_type: 'speech', agent: 'Mira', speech_id: 1, is_public: true, content: 'おはよう', reasoning: '内心の思考' },
    ]);
    expect(events).toHaveLength(1);
    expect(events[0].content).toBe('おはよう');
    expect(events[0].reasoning).toBe('内心の思考');
  });

  it('wolf_chat with reasoning field passes through without THINK merge', () => {
    /*
     * SUT: normalizeEvents
     * Mock: なし
     * Level: unit
     * Objective: 新スキーマで reasoning フィールドが直接セットされた wolf_chat は、
     *            [THINK] 別行なしで reasoning が保持されることを検証する（新経路 contract テスト）。
     */
    const events = normalizeEvents([
      { day: 1, event_type: 'wolf_chat', agent: 'Nox', is_public: false, content: 'Renを噛もう', reasoning: '騎士ではなさそう' },
    ]);
    expect(events).toHaveLength(1);
    expect(events[0].content).toBe('Renを噛もう');
    expect(events[0].reasoning).toBe('騎士ではなさそう');
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

  it('filters out co_announcement events after upToDay', () => {
    /*
     * SUT: aggregateCoStatus
     * Mock: なし
     * Level: unit
     * Objective: upToDay を指定した場合、その日以降の CO イベントが除外されることを検証する。
     */
    const events = [
      { day: 1, event_type: 'co_announcement', agent: 'Jonas', claimed_role: 'Seer',   is_public: true },
      { day: 2, event_type: 'co_announcement', agent: 'SQ',    claimed_role: 'Medium', is_public: true },
      { day: 3, event_type: 'co_announcement', agent: 'Ren',   claimed_role: 'Hunter', is_public: true },
    ];
    expect(aggregateCoStatus(events, 2)).toEqual({ Jonas: 'Seer', SQ: 'Medium' });
  });

  it('returns only CO up to upToDay=1 when later days exist', () => {
    /*
     * SUT: aggregateCoStatus
     * Mock: なし
     * Level: unit
     * Objective: Day 1 のみ選択時に Day 1 の CO だけが返されることを検証する。
     */
    const events = [
      { day: 1, event_type: 'co_announcement', agent: 'Jonas', claimed_role: 'Seer',   is_public: true },
      { day: 2, event_type: 'co_announcement', agent: 'SQ',    claimed_role: 'Medium', is_public: true },
    ];
    expect(aggregateCoStatus(events, 1)).toEqual({ Jonas: 'Seer' });
  });

  it('accumulates CO correctly when upToDay matches later days', () => {
    /*
     * SUT: aggregateCoStatus
     * Mock: なし
     * Level: unit
     * Objective: upToDay を後の日に設定すると、その日までの CO が累積されることを検証する。
     */
    const events = [
      { day: 1, event_type: 'co_announcement', agent: 'Jonas', claimed_role: 'Seer',   is_public: true },
      { day: 2, event_type: 'co_announcement', agent: 'SQ',    claimed_role: 'Medium', is_public: true },
      { day: 3, event_type: 'co_announcement', agent: 'Ren',   claimed_role: 'Hunter', is_public: true },
    ];
    expect(aggregateCoStatus(events, 3)).toEqual({ Jonas: 'Seer', SQ: 'Medium', Ren: 'Hunter' });
  });
});

describe('computeDeadByDay', () => {
  it('returns empty Maps for all days when there are no eliminations', () => {
    /*
     * SUT: computeDeadByDay
     * Mock: なし
     * Level: unit
     * Objective: elimination イベントがない場合、全日で空の Map が返ることを検証する。
     */
    const events = [
      { day: 1, event_type: 'speech', agent: 'Mira' },
    ];
    const result = computeDeadByDay(events);
    expect(result[1]).toEqual(new Map());
  });

  it('includes only Day 1 victim in Day 1 dead map', () => {
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
     * Objective: Day 2 以降を選択したとき、それ以前の累積死亡者が Map に含まれることを検証する（AC2）。
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

  it('final day map contains all dead agents (AC3)', () => {
    /*
     * SUT: computeDeadByDay
     * Mock: なし
     * Level: unit
     * Objective: 最終日の Map が全死亡者を含むことを検証する（AC3）。
     */
    const events = [
      { day: 1, event_type: 'elimination', agent: 'Toma' },
      { day: 2, event_type: 'elimination', agent: 'Nox' },
    ];
    const result = computeDeadByDay(events);
    expect(result[2].has('Toma')).toBe(true);
    expect(result[2].has('Nox')).toBe(true);
    expect(result[2].size).toBe(2);
  });

  it('handles days with no elimination by copying previous day dead map', () => {
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

  it('includes night_attack victim in dead map (AC1)', () => {
    /*
     * SUT: computeDeadByDay
     * Mock: なし
     * Level: unit
     * Objective: private night_attack の target が死亡者 Map に含まれることを検証する（AC1）。
     */
    const events = [
      { day: 1, event_type: 'night_attack', target: 'Rei', is_public: false },
    ];
    const result = computeDeadByDay(events);
    expect(result[1].has('Rei')).toBe(true);
  });

  it('does not include night_attack victim when guard_block exists for same target (AC2)', () => {
    /*
     * SUT: computeDeadByDay
     * Mock: なし
     * Level: unit
     * Objective: 同日同 target の private guard_block がある場合、night_attack の target が死亡者 Map に含まれないことを検証する（AC2）。
     */
    const events = [
      { day: 1, event_type: 'night_attack', target: 'Toma', is_public: false },
      { day: 1, event_type: 'guard_block',  target: 'Toma', is_public: false },
    ];
    const result = computeDeadByDay(events);
    expect(result[1].has('Toma')).toBe(false);
  });

  it('night_attack victim appears in later days if killed on earlier day', () => {
    /*
     * SUT: computeDeadByDay
     * Mock: なし
     * Level: unit
     * Objective: 夜襲犠牲者は翌日以降の累積 Map にも引き継がれることを検証する。
     */
    const events = [
      { day: 1, event_type: 'night_attack', target: 'Rei', is_public: false },
      { day: 2, event_type: 'speech', agent: 'Mira' },
    ];
    const result = computeDeadByDay(events);
    expect(result[2].has('Rei')).toBe(true);
  });

  it('guard_block on different day does not protect night_attack victim', () => {
    /*
     * SUT: computeDeadByDay
     * Mock: なし
     * Level: unit
     * Objective: guard_block が別の日のものであれば、night_attack の target は死亡者 Map に含まれることを検証する。
     */
    const events = [
      { day: 1, event_type: 'night_attack', target: 'Rei', is_public: false },
      { day: 2, event_type: 'guard_block',  target: 'Rei', is_public: false },
    ];
    const result = computeDeadByDay(events);
    expect(result[1].has('Rei')).toBe(true);
  });

  it('stores day and content metadata for elimination victim (contract)', () => {
    /*
     * SUT: computeDeadByDay
     * Mock: なし
     * Level: unit
     * Objective: elimination 死亡者のメタデータ（day, content）が Map の value として取得できることを検証する（#391 contract）。
     */
    const events = [
      { day: 2, event_type: 'elimination', agent: 'Toma', content: 'Toma was executed.', is_public: true },
    ];
    const result = computeDeadByDay(events);
    expect(result[2].get('Toma')).toEqual({ day: 2, content: 'Toma was executed.' });
  });

  it('stores day and content metadata for night_attack victim (contract)', () => {
    /*
     * SUT: computeDeadByDay
     * Mock: なし
     * Level: unit
     * Objective: night_attack 死亡者のメタデータ（day, content）が Map の value として取得できることを検証する（#391 contract）。
     */
    const events = [
      { day: 1, event_type: 'night_attack', target: 'Rei', content: 'Werewolves attacked Rei.', is_public: false },
    ];
    const result = computeDeadByDay(events);
    expect(result[1].get('Rei')).toEqual({ day: 1, content: 'Werewolves attacked Rei.' });
  });

  it('metadata is preserved when victim carries over to later days', () => {
    /*
     * SUT: computeDeadByDay
     * Mock: なし
     * Level: unit
     * Objective: 死亡者のメタデータが翌日以降の Map にも引き継がれることを検証する（#391 contract）。
     */
    const events = [
      { day: 1, event_type: 'elimination', agent: 'Toma', content: 'Toma was executed.', is_public: true },
      { day: 2, event_type: 'speech', agent: 'Mira' },
    ];
    const result = computeDeadByDay(events);
    expect(result[2].get('Toma')).toEqual({ day: 1, content: 'Toma was executed.' });
  });
});

describe('aggregateDaySummary action fields', () => {
  it('collects night actions and exec result per day', () => {
    /*
     * SUT: aggregateDaySummary
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
    const result = aggregateDaySummary(events);
    const d1 = result[1];

    expect(d1.nightActions).toHaveLength(3);
    expect(d1.nightActions.find(a => a.event_type === 'inspection')).toBeTruthy();
    expect(d1.nightActions.find(a => a.event_type === 'guard')).toBeTruthy();
    expect(d1.nightActions.find(a => a.event_type === 'night_attack' && !a.is_public)).toBeTruthy();

    expect(d1.execResult.target).toBe('Toma');
    expect(d1.execResult.votes).toBe(2);
    expect(d1.execResult.voteTable).toEqual([
      { from: 'Nox',  to: 'Toma' },
      { from: 'Mira', to: 'Toma' },
      { from: 'Kai',  to: 'Nox' },
    ]);
  });

  it('excludes public night_attack from nightActions (already shown in feed)', () => {
    /*
     * SUT: aggregateDaySummary
     * Mock: なし
     * Level: unit
     * Objective: is_public な night_attack（夜明け公知イベント）は nightActions に含まれないことを検証する。
     */
    const events = [
      { day: 1, event_type: 'night_attack', agent: 'Kai',  target: 'Sora', is_public: false },
      { day: 1, event_type: 'night_attack', agent: 'Sora', target: null,   is_public: true },
    ];
    const result = aggregateDaySummary(events);
    expect(result[1].nightActions).toHaveLength(1);
    expect(result[1].nightActions[0].is_public).toBe(false);
  });

  it('returns no summary entry for days with no summary-relevant events', () => {
    /*
     * SUT: aggregateDaySummary
     * Mock: なし
     * Level: unit
     * Objective: 該当イベントがない日は daySummary エントリを作らないことを検証する。
     */
    const events = [
      { day: 1, event_type: 'phase_start', phase: 'day_discussion' },
    ];
    const result = aggregateDaySummary(events);
    expect(result[1]).toBeUndefined();
  });
});

describe('parseGameData winner extraction', () => {
  it('extracts winner from game_over event', () => {
    /*
     * SUT: parseGameData
     * Mock: なし
     * Level: unit
     * Objective: spectator_log.jsonl に game_over イベントがあるとき winner フィールドが
     *            parseGameData の戻り値に含まれることを検証する。
     */
    const jsonl = JSON.stringify({ day: 3, phase: 'game_over', event_type: 'game_over', content: 'GAME OVER — Werewolves win!', winner: 'Werewolves', is_public: true });
    const result = parseGameData(jsonl);
    expect(result.winner).toBe('Werewolves');
  });

  it('returns null winner when game_over has no winner field (legacy log)', () => {
    /*
     * SUT: parseGameData
     * Mock: なし
     * Level: unit
     * Objective: winner フィールドのない旧アーカイブを読んでもクラッシュせず winner=null になることを検証する。
     */
    const jsonl = JSON.stringify({ day: 3, phase: 'game_over', event_type: 'game_over', content: 'GAME OVER — Villagers win!', is_public: true });
    const result = parseGameData(jsonl);
    expect(result.winner).toBeNull();
  });

  it('returns null winner when no game_over event exists', () => {
    /*
     * SUT: parseGameData
     * Mock: なし
     * Level: unit
     * Objective: game_over イベントがない場合 winner=null になることを検証する。
     */
    const jsonl = JSON.stringify({ day: 1, phase: 'day_discussion', event_type: 'speech', agent: 'Alice', content: 'hello', is_public: true });
    const result = parseGameData(jsonl);
    expect(result.winner).toBeNull();
  });
});

