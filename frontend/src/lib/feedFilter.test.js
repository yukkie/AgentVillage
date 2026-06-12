import { describe, it, expect } from 'vitest';
import { filterByAgents, filterByRoles, filterFeedEvents } from './feedFilter.js';

const ev = (overrides) => ({
  day: 1,
  event_type: 'speech',
  is_public: true,
  phase: 'day_discussion',
  content: '',
  agent: 'Alice',
  target: null,
  ...overrides,
});

describe('filterFeedEvents', () => {
  /*
  SUT: filterFeedEvents
  Mock: なし
  Level: unit
  Objective: discuss フェーズで speech / phase_start(TURN) / co_announcement のみ返すことを検証する
  */
  it('discuss: speech と TURN phase_start と co_announcement を返す', () => {
    const events = [
      ev({ event_type: 'speech', is_public: true, phase: 'day_discussion', content: 'hello' }),
      ev({ event_type: 'phase_start', phase: 'day_discussion', content: '=== DAY 1  TURN 1 ===' }),
      ev({ event_type: 'co_announcement', phase: 'day_discussion', content: 'Sera claims Seer' }),
      ev({ event_type: 'vote', phase: 'day_vote', content: 'Alice votes for Bob' }),
      ev({ event_type: 'elimination', phase: 'day_vote' }),
      ev({ event_type: 'night_attack', phase: 'night', is_public: true }),
    ];
    const result = filterFeedEvents(events, 1, 'discuss');
    expect(result.map(e => e.event_type)).toEqual(['speech', 'phase_start', 'co_announcement']);
  });

  /*
  SUT: filterFeedEvents
  Mock: なし
  Level: unit
  Objective: discuss フェーズで VOTE / NIGHT 系の phase_start を除外することを検証する
  */
  it('discuss: VOTE / NIGHT 系 phase_start を除外する', () => {
    const events = [
      ev({ event_type: 'phase_start', phase: 'day_discussion', content: '=== DAY 1  TURN 2 ===' }),
      ev({ event_type: 'phase_start', phase: 'day_vote', content: '=== DAY 1  VOTE ===' }),
      ev({ event_type: 'phase_start', phase: 'night', content: '=== NIGHT 1 ===' }),
    ];
    const result = filterFeedEvents(events, 1, 'discuss');
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe('=== DAY 1  TURN 2 ===');
  });

  /*
  SUT: filterFeedEvents
  Mock: なし
  Level: unit
  Objective: vote フェーズで vote / elimination / medium_result と VOTE 系 phase_start を返すことを検証する
  */
  it('vote: vote / elimination / medium_result / VOTE phase_start を返す', () => {
    const events = [
      ev({ event_type: 'phase_start', phase: 'day_vote', content: '=== DAY 1  VOTE ===' }),
      ev({ event_type: 'vote', phase: 'day_vote', content: 'Alice votes for Bob' }),
      ev({ event_type: 'elimination', phase: 'day_vote', content: 'Bob was executed' }),
      ev({ event_type: 'medium_result', phase: 'day_vote', is_public: false, content: 'medium senses Bob' }),
      ev({ event_type: 'speech', phase: 'day_discussion', content: 'hello' }),
      ev({ event_type: 'night_attack', phase: 'night', is_public: true }),
    ];
    const result = filterFeedEvents(events, 1, 'vote');
    expect(result.map(e => e.event_type)).toEqual(['phase_start', 'vote', 'elimination', 'medium_result']);
  });

  /*
  SUT: filterFeedEvents
  Mock: なし
  Level: unit
  Objective: night フェーズで夜関連イベント全種別（wolf_chat 含む）を返すことを検証する
  */
  it('night: wolf_chat / inspection / guard / guard_block / night_attack / NIGHT phase_start を返す', () => {
    const events = [
      ev({ event_type: 'phase_start', phase: 'night', content: '=== NIGHT 1 ===' }),
      ev({ event_type: 'phase_start', phase: 'night_wolf_chat', content: '=== NIGHT_WOLF_CHAT ===' }),
      ev({ event_type: 'wolf_chat', phase: 'night_wolf_chat', is_public: false, content: 'wolf says' }),
      ev({ event_type: 'inspection', phase: 'night', is_public: false }),
      ev({ event_type: 'guard', phase: 'night', is_public: false }),
      ev({ event_type: 'guard_block', phase: 'night', is_public: false }),
      ev({ event_type: 'guard_block', phase: 'night', is_public: true }),
      ev({ event_type: 'night_attack', phase: 'night', is_public: false }),
      ev({ event_type: 'night_attack', phase: 'night', is_public: true }),
      ev({ event_type: 'speech', phase: 'day_discussion', content: 'hello' }),
      ev({ event_type: 'vote', phase: 'day_vote' }),
    ];
    const result = filterFeedEvents(events, 1, 'night');
    const types = result.map(e => e.event_type);
    expect(types).toContain('phase_start');
    expect(types).toContain('wolf_chat');
    expect(types).toContain('inspection');
    expect(types).toContain('guard');
    expect(types).toContain('guard_block');
    expect(types).toContain('night_attack');
    expect(types).not.toContain('speech');
    expect(types).not.toContain('vote');
  });

  /*
  SUT: filterFeedEvents
  Mock: なし
  Level: unit
  Objective: day が異なるイベントをフィルタ除外することを検証する
  */
  it('day が一致しないイベントを除外する', () => {
    const events = [
      ev({ day: 1, event_type: 'speech', phase: 'day_discussion' }),
      ev({ day: 2, event_type: 'speech', phase: 'day_discussion' }),
    ];
    const result = filterFeedEvents(events, 1, 'discuss');
    expect(result).toHaveLength(1);
    expect(result[0].day).toBe(1);
  });

  /*
  SUT: filterFeedEvents
  Mock: なし
  Level: unit
  Objective: private speech（is_public=false の THINK行）を discuss フェーズで除外することを検証する
  */
  it('discuss: private speech（is_public=false）を除外する', () => {
    const events = [
      ev({ event_type: 'speech', is_public: true }),
      ev({ event_type: 'speech', is_public: false, content: '[THINK] thinking...' }),
    ];
    const result = filterFeedEvents(events, 1, 'discuss');
    expect(result).toHaveLength(1);
    expect(result[0].is_public).toBe(true);
  });

  /*
  SUT: filterFeedEvents
  Mock: なし
  Level: unit
  Objective: spectator 専用の suspicion_update / threat_update は discuss フェーズの中央フィードに渡すことを検証する
  */
  it('discuss: suspicion_update / threat_update を返す', () => {
    const events = [
      ev({ event_type: 'suspicion_update', is_public: false, suspicion_snapshot: { Bob: 0.82 } }),
      ev({ event_type: 'threat_update', is_public: false, threat_snapshot: { Alice: 0.74 } }),
      ev({ event_type: 'speech', is_public: false, content: '[THINK] thinking...' }),
    ];
    const result = filterFeedEvents(events, 1, 'discuss');
    expect(result.map(e => e.event_type)).toEqual(['suspicion_update', 'threat_update']);
  });

  /*
  SUT: filterFeedEvents
  Mock: なし
  Level: unit
  Objective: GAME START phase_start が discuss フェーズで含まれることを検証する
  */
  it('discuss: GAME START phase_start を含む', () => {
    const events = [
      ev({ event_type: 'phase_start', phase: 'init', content: '=== GAME START ===' }),
    ];
    const result = filterFeedEvents(events, 1, 'discuss');
    expect(result).toHaveLength(1);
  });

  /*
  SUT: filterFeedEvents
  Mock: なし
  Level: unit
  Objective: 未知の phase 値が渡されたとき空配列を返すことを検証する
  */
  it('未知の phase 値では何も返さない', () => {
    const events = [
      ev({ event_type: 'speech', is_public: true }),
      ev({ event_type: 'vote' }),
      ev({ event_type: 'night_attack', is_public: true }),
    ];
    const result = filterFeedEvents(events, 1, 'unknown');
    expect(result).toHaveLength(0);
  });

  /*
  SUT: filterFeedEvents
  Mock: なし
  Level: unit
  Objective: game_over フェーズで game_over イベントのみ返すことを検証する
  */
  it('game_over: game_over イベントのみ返す', () => {
    const events = [
      ev({ day: 3, event_type: 'game_over', phase: 'game_over', is_public: true, content: 'GAME OVER — Werewolves win!', winner: 'Werewolves' }),
      ev({ day: 3, event_type: 'speech', phase: 'day_discussion', content: 'hello' }),
    ];
    const result = filterFeedEvents(events, 3, 'game_over');
    expect(result).toHaveLength(1);
    expect(result[0].event_type).toBe('game_over');
  });

  /*
  SUT: filterFeedEvents
  Mock: なし
  Level: unit
  Objective: game_over フェーズで日が一致しないイベントを除外することを検証する
  */
  it('game_over: 日が一致しないイベントを除外する', () => {
    const events = [
      ev({ day: 3, event_type: 'game_over', phase: 'game_over', is_public: true }),
      ev({ day: 2, event_type: 'game_over', phase: 'game_over', is_public: true }),
    ];
    const result = filterFeedEvents(events, 3, 'game_over');
    expect(result).toHaveLength(1);
    expect(result[0].day).toBe(3);
  });

  /*
  SUT: filterFeedEvents
  Mock: なし
  Level: unit
  Objective: eve フェーズで game_start_narrative / role_assigned イベントを返すことを検証する
  */
  it('eve: game_start_narrative / role_assigned イベントを返す', () => {
    const events = [
      ev({ day: 0, event_type: 'game_start_narrative', phase: 'init', is_public: true, content: 'A werewolf lurks...' }),
      ev({ day: 0, event_type: 'role_assigned', phase: 'init', agent: null, is_public: true, content: 'This village has 3 Villagers · 1 Seer · 1 Werewolf' }),
      ev({ day: 0, event_type: 'role_assigned', phase: 'init', agent: 'Alice', is_public: false, content: 'Alice came to realize they were the Seer.' }),
      ev({ day: 1, event_type: 'speech', phase: 'day_discussion' }),
    ];
    const result = filterFeedEvents(events, 0, 'eve');
    expect(result.map(e => e.event_type)).toEqual(['game_start_narrative', 'role_assigned', 'role_assigned']);
  });

  /*
  SUT: filterFeedEvents
  Mock: なし
  Level: unit
  Objective: eve フェーズで game_start_narrative 以外のイベントを除外することを検証する
  */
  it('eve: game_start_narrative 以外は除外する', () => {
    const events = [
      ev({ day: 0, event_type: 'phase_start', phase: 'init', is_public: true }),
      ev({ day: 0, event_type: 'speech', phase: 'init', is_public: true }),
    ];
    const result = filterFeedEvents(events, 0, 'eve');
    expect(result).toHaveLength(0);
  });
});

describe('filterByAgents', () => {
  /*
  SUT: filterByAgents
  Mock: なし
  Level: unit
  Objective: selectedAgents が空の場合は入力イベントを全件返すことを検証する
  */
  it('filterByAgents: 空選択は全件返す', () => {
    const events = [
      ev({ event_type: 'phase_start', agent: null }),
      ev({ event_type: 'speech', agent: 'Alice', content: 'hello' }),
      ev({ event_type: 'speech', agent: 'Bob', content: 'hi' }),
    ];

    expect(filterByAgents(events, new Set())).toEqual(events);
  });

  /*
  SUT: filterByAgents
  Mock: なし
  Level: unit
  Objective: selectedAgents がある場合は agent が選択名に一致するイベントのみ返すことを検証する
  */
  it('filterByAgents: 選択時は agent 一致イベントのみ返す', () => {
    const events = [
      ev({ event_type: 'speech', agent: 'Alice', content: 'Alice speaks' }),
      ev({ event_type: 'speech', agent: 'Bob', content: 'Bob speaks' }),
      ev({ event_type: 'vote', agent: 'Carol', content: 'Carol votes' }),
    ];

    const result = filterByAgents(events, new Set(['Alice']));

    expect(result.map(e => e.content)).toEqual(['Alice speaks']);
  });

  /*
  SUT: filterByAgents
  Mock: なし
  Level: unit
  Objective: agent を持たないシステムイベントは参加者選択中でも残ることを検証する
  */
  it('filterByAgents: agent を持たないイベントは選択中でも残す', () => {
    const events = [
      ev({ event_type: 'phase_start', agent: null, content: 'Day 1 starts' }),
      ev({ event_type: 'speech', agent: 'Alice', content: 'Alice speaks' }),
      ev({ event_type: 'speech', agent: 'Bob', content: 'Bob speaks' }),
    ];

    const result = filterByAgents(events, new Set(['Bob']));

    expect(result.map(e => e.content)).toEqual(['Day 1 starts', 'Bob speaks']);
  });

  /*
  SUT: filterByAgents
  Mock: なし
  Level: unit
  Objective: 複数選択時は選択された参加者の和集合としてイベントを返すことを検証する
  */
  it('filterByAgents: 複数選択は和集合で返す', () => {
    const events = [
      ev({ event_type: 'speech', agent: 'Alice', content: 'Alice speaks' }),
      ev({ event_type: 'speech', agent: 'Bob', content: 'Bob speaks' }),
      ev({ event_type: 'speech', agent: 'Carol', content: 'Carol speaks' }),
    ];

    const result = filterByAgents(events, new Set(['Alice', 'Carol']));

    expect(result.map(e => e.content)).toEqual(['Alice speaks', 'Carol speaks']);
  });
});

describe('filterByRoles', () => {
  const roles = {
    Alice: 'Seer',
    Bob: 'Werewolf',
    Carol: 'Knight',
  };

  /*
  SUT: filterByRoles
  Mock: なし
  Level: unit
  Objective: selectedRoles が空の場合は入力イベントを全件返すことを検証する
  */
  it('filterByRoles: 空選択は全件返す', () => {
    const events = [
      ev({ event_type: 'phase_start', agent: null }),
      ev({ event_type: 'speech', agent: 'Alice', content: 'seer speech' }),
      ev({ event_type: 'speech', agent: 'Bob', content: 'wolf speech' }),
    ];

    expect(filterByRoles(events, new Set(), roles)).toEqual(events);
  });

  /*
  SUT: filterByRoles
  Mock: なし
  Level: unit
  Objective: selectedRoles がある場合は roleAssignment の役職が選択役職に一致するイベントのみ返すことを検証する
  */
  it('filterByRoles: 選択時は roleAssignment の役職一致のみ返す', () => {
    const events = [
      ev({ event_type: 'speech', agent: 'Alice', content: 'seer speech' }),
      ev({ event_type: 'speech', agent: 'Bob', content: 'wolf speech' }),
      ev({ event_type: 'speech', agent: 'Carol', content: 'knight speech' }),
    ];

    const result = filterByRoles(events, new Set(['Seer']), roles);

    expect(result.map(e => e.content)).toEqual(['seer speech']);
  });

  /*
  SUT: filterByRoles
  Mock: なし
  Level: unit
  Objective: agent を持たないシステムイベントは役職選択中でも残ることを検証する
  */
  it('filterByRoles: agent を持たないイベントは残す', () => {
    const events = [
      ev({ event_type: 'phase_start', agent: null, content: 'Day 1 starts' }),
      ev({ event_type: 'speech', agent: 'Alice', content: 'seer speech' }),
      ev({ event_type: 'speech', agent: 'Bob', content: 'wolf speech' }),
    ];

    const result = filterByRoles(events, new Set(['Werewolf']), roles);

    expect(result.map(e => e.content)).toEqual(['Day 1 starts', 'wolf speech']);
  });

  /*
  SUT: filterByRoles
  Mock: なし
  Level: unit
  Objective: roleAssignment に存在しない agent のイベントは役職選択中に除外されることを検証する
  */
  it('filterByRoles: roleAssignment に存在しない agent は選択中に除外する', () => {
    const events = [
      ev({ event_type: 'speech', agent: 'Alice', content: 'seer speech' }),
      ev({ event_type: 'speech', agent: 'Dave', content: 'unknown role speech' }),
    ];

    const result = filterByRoles(events, new Set(['Seer']), roles);

    expect(result.map(e => e.content)).toEqual(['seer speech']);
  });

  /*
  SUT: filterByRoles
  Mock: なし
  Level: unit
  Objective: 複数役職選択時は選択された役職の和集合としてイベントを返すことを検証する
  */
  it('filterByRoles: 複数役職の和集合で返す', () => {
    const events = [
      ev({ event_type: 'speech', agent: 'Alice', content: 'seer speech' }),
      ev({ event_type: 'speech', agent: 'Bob', content: 'wolf speech' }),
      ev({ event_type: 'speech', agent: 'Carol', content: 'knight speech' }),
    ];

    const result = filterByRoles(events, new Set(['Seer', 'Knight']), roles);

    expect(result.map(e => e.content)).toEqual(['seer speech', 'knight speech']);
  });
});
