// スタブデータ — Issue #309 Spectator feed screen
// 本実装（#318 Replay viewer）で fetch('../state_archive/.../spectator_log.jsonl') に差し替える

// 役職割り当て（観戦者視点の真実情報 — 実ログには存在しない）
export const ROLE_ASSIGNMENT = {
  Mira:  'Knight',
  Ren:   'Seer',      // 偽占い師 CO
  Kai:   'Werewolf',  // 真の狼1
  Toma:  'Villager',
  Shiki: 'Medium',
  Rei:   'Knight',
  Sable: 'Villager',
  Sera:  'Werewolf',  // 真の狼2
  Kael:  'Madman',
  Sora:  'Villager',
  Nox:   'Seer',      // 真の占い師
};

// 夜の結果サマリ
export const NIGHT_RESULTS = {
  1: { attacked: 'Sora' },
  2: { attacked: 'Rei' },
};

// 処刑サマリ
export const EXEC_RESULTS = {
  1: { target: 'Toma', votes: 4 },
  2: { target: 'Ren',  votes: 7 },
};

// 投票内訳 Day 1
export const VOTE_TABLE_D1 = [
  { from: 'Mira',  to: 'Toma' },
  { from: 'Ren',   to: 'Sable' },
  { from: 'Kai',   to: 'Toma' },
  { from: 'Toma',  to: 'Mira' },
  { from: 'Shiki', to: 'Toma' },
  { from: 'Rei',   to: 'Sable' },
  { from: 'Sable', to: 'Toma' },
  { from: 'Sera',  to: 'Mira' },
  { from: 'Kael',  to: 'Sable' },
  { from: 'Sora',  to: 'Sable' },
  { from: 'Nox',   to: 'Toma' },
];

// 夜のアクション履歴（観戦者視点）
export const ACTIONS_TIMELINE = [
  { day: 1, when: 'N', kind: 'attack', who: 'Kai+Sera', target: 'Sora',  label: '襲撃', note: '人狼陣営' },
  { day: 1, when: 'N', kind: 'divine', who: 'Nox',      target: 'Kai',   label: '占い', result: 'black' },
  { day: 1, when: 'N', kind: 'guard',  who: 'Rei',      target: 'Nox',   label: '護衛' },
  { day: 1, when: 'D', kind: 'exec',   who: '村',       target: 'Toma',  label: '処刑', votes: 4 },
  { day: 2, when: 'N', kind: 'attack', who: 'Kai+Sera', target: 'Rei',   label: '襲撃' },
  { day: 2, when: 'N', kind: 'divine', who: 'Nox',      target: 'Sera',  label: '占い', result: 'black' },
  { day: 2, when: 'D', kind: 'exec',   who: '村',       target: 'Ren',   label: '処刑', votes: 7 },
];

// イベント列（data.js から抜粋・最小化）
// GameData.md ギャップ: thought フィールドは spectator_log.jsonl の非公開イベントから結合する
export const EVENTS = [
  { day: 1, event_type: 'phase_start', phase: 'init',           content: '=== GAME START ===',   agent: null, speech_id: null, reply_to: null },
  { day: 1, event_type: 'phase_start', phase: 'day_opening',    content: '=== DAY 1  TURN 1 ===', agent: null, speech_id: null, reply_to: null },
  {
    day: 1, event_type: 'speech', agent: 'Mira', speech_id: 1, reply_to: null, claimed_role: null,
    content: 'みんな、おはよう。Day 1だから、まずは様子を見ていこう。今は誰が何の役職かわからないから、みんなで協力して情報を集めるのが大事だと思う。何か気になることがあれば、遠慮なく言ってほしいね。',
    thought: 'Day 1なので、具体的な情報はまだ何もない。全員がまだ信頼できる状態だから、様子見をするのが最適。自分はナイトだが、今は役職を明かすべき時ではない。COするなら、もっと後の段階でゲームの流れを見てから判断する。まずは村全体で協力する雰囲気を作ることが大切。',
  },
  {
    day: 1, event_type: 'speech', agent: 'Ren', speech_id: 2, reply_to: null, claimed_role: null,
    content: '皆さん、こんにちは。初日はまだ情報が限られていますが、落ち着いて進めていきましょう。ここからは、皆さんの発言をよく聞き、誰が信頼できるのか見極めていくことが大切だと思います。無理に結論を出さず、まずは様子を見守ることをお勧めします。',
    thought: '初日の段階では、私はセイアーであることを隠しておく必要があります。すべてのプレイヤーに対して同じ疑惑度（0.50）を持っているため、誰かを具体的に指摘することは避けるべきです。むしろ、落ち着いた態度で議論の進め方を示唆し、他のプレイヤーの反応を観察することが重要です。',
  },
  {
    day: 1, event_type: 'speech', agent: 'Kai', speech_id: 3, reply_to: null, claimed_role: null,
    content: '初日だから、まず情報を整理しておこう。俺たちは11人で、狼が3体いる計算だ。特に根拠のない段階で誰かを指摘するのは無意味。今日は誰がどう反応するか、その過程をじっくり観察するのが賢明。疑わしい発言や矛盾点が出てくるまで、様子見で十分だと思う。',
    thought: '初日なので、まだ誰も発言していない状態だ。この段階では、具体的な情報がないため、慎重なアプローチを取るべき。村人として、ゲームの流れを観察し、他のプレイヤーの反応を見ることが重要だ。',
  },
  {
    day: 1, event_type: 'speech', agent: 'Toma', speech_id: 4, reply_to: null, claimed_role: null,
    content: 'おっす、みんな。Day 1ってことで、まず自己紹介しておくか。俺はトマだ。特に怪しい動きは今のところ見当たらないから、落ち着いて進めようぜ。みんなで協力して村を守ろう。',
    thought: 'これはDay 1の最初の発言だ。俺はオオカミだけど、今はまだ誰も疑われていない状況。無難に村人らしく振る舞って、注目を集めないようにする。',
  },
  {
    day: 1, event_type: 'speech', agent: 'Shiki', speech_id: 5, reply_to: null, claimed_role: null,
    content: '皆さん、こんにちは。初日は情報が少ないですが、各自の発言から手がかりを探していきましょう。私は注意深く観察しています。何か気づいたことがあれば共有しましょう。',
    thought: '霊媒師として、初日は役職を隠しておくのが最善。まだ処刑者がいないので霊媒結果も出ていない。じっくり観察する。',
  },
  {
    day: 1, event_type: 'speech', agent: 'Nox', speech_id: 6, reply_to: '1', claimed_role: null,
    content: 'Mira の言う通り、初日は情報収集が大事だと思う。ただ、あまり受け身すぎても狼のペースに乗せられる。積極的に疑問を投げかけ合う方がいい。例えば、なぜこの人数設定なのか？陣営バランスについて誰か考えは？',
    thought: '占い師として、初日から積極的に議論をリードする姿勢を見せることが重要。ただし役職はまだ隠す。Kai の黒結果を昨夜得たが、それはまだ発表しない。',
  },
  {
    day: 1, event_type: 'speech', agent: 'Sable', speech_id: 7, reply_to: null, claimed_role: null,
    content: '初日は様子見が基本だけど、Nox の言う通り積極性も必要だよね。個人的に気になるのは、あまりにも当たり障りのない発言が続いている点。誰か少しでも踏み込んだ意見を言える人はいない？',
    thought: '村人として、議論を活性化させることが役割。まだ何も分からないが、受け身の村は狼に有利だ。',
  },
  {
    day: 1, event_type: 'speech', agent: 'Sera', speech_id: 8, reply_to: null, claimed_role: null,
    content: 'Sable の言う通り、具体的な議論が必要だと思う。私が気になるのは Kai の発言。「様子見で十分」って言ってるけど、それって消極的すぎない？初日から積極的に動くべきだと思う。',
    thought: '狼として、誰かに疑いの目を向けさせることが重要。Kai に疑いを向けつつ、自分は積極的な村人を演じる。',
  },
  {
    day: 1, event_type: 'speech', agent: 'Kael', speech_id: 9, reply_to: null, claimed_role: null,
    content: 'Sera の指摘は鋭い。Kai の様子見発言は確かに気になる。ただ、初日に誰かを吊るのはリスクが高い。もう少し情報を集めてから判断すべきじゃないかな。',
    thought: '狂人として、村人に疑いを向けさせつつ処刑を遅らせることが目標。今は議論を撹乱する。',
  },
  {
    day: 1, event_type: 'speech', agent: 'Sora', speech_id: 10, reply_to: null, claimed_role: null,
    content: 'みんな活発に議論してるね。私は Sera の Kai への疑いには少し同意。でも初日はまだ根拠が薄い。COをしてくれる人がいれば、そこから議論を絞れるのに。',
    thought: '村人として、役職COを促すことで情報を集めたい。まだ誰もCOしていないので、議論は抽象的だ。',
  },
  {
    day: 1, event_type: 'speech', agent: 'Rei', speech_id: 11, reply_to: null, claimed_role: null,
    content: '皆さんの意見を聞いていました。Sera の Kai への指摘は参考になりますが、私はもう少し全員の発言パターンを見たい。特定の人を急いで吊るより、今日は情報収集に徹しましょう。',
    thought: '狩人として、目立たず情報収集することが重要。今夜は誰を護衛するか考えておく必要がある。',
  },
  // Day 2 speeches — COあり
  {
    day: 2, event_type: 'speech', agent: 'Ren', speech_id: 1, reply_to: null, claimed_role: 'Seer',
    content: '皆さん、重要な情報があります。私は占い師です。昨夜 Mira を占いました。結果は白（村人陣営）です。Nox が対抗COしてくるかもしれませんが、私が真の占い師です。',
    thought: '狼として、偽占い師COで村を混乱させる。Mira は白結果を出せるので信頼を得やすい。Nox が真占いとして対抗してくるはずだが、どちらが信じられるかは議論次第。',
  },
  {
    day: 2, event_type: 'speech', agent: 'Nox', speech_id: 2, reply_to: null, claimed_role: 'Seer',
    content: '対抗します。私が真の占い師です。昨夜 Kai を占いました。結果は黒（人狼陣営）です。Ren は偽占い師です。Kai を今日処刑すべきです。',
    thought: '真占い師として、黒結果を持っている。Ren が先にCOしてきたが、私の情報の方が村に有益だ。Kai の黒結果を出すことで真偽の判断材料を提供する。',
  },
  {
    day: 2, event_type: 'speech', agent: 'Kai', speech_id: 3, reply_to: null, claimed_role: null,
    content: 'Nox の黒判定は嘘だ。俺は村人だ。Nox こそ怪しい。なぜ初日に Mira ではなく俺を占った？明らかに俺を陥れようとしている。Ren の白判定の方が信用できる。',
    thought: '狼として、Nox の真占い師COを否定する必要がある。自分が黒判定されているので、Nox の信頼性を崩すことが重要。',
  },
  {
    day: 2, event_type: 'speech', agent: 'Shiki', speech_id: 4, reply_to: null, claimed_role: null,
    content: '占い師が2人出ましたね。どちらが本物かが今日の焦点です。Ren の白結果 vs Nox の黒結果。村として、どちらを信じるかを慎重に判断する必要があります。私は Nox の積極的な情報提供を評価します。',
    thought: '霊媒師として、占い師対抗の情報を整理する。Nox の方が真占い師らしい行動をとっている。',
  },
];
