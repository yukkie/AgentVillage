// TODO #321: config/*.json を Python/JS 共有にして fetch に置き換える（現状は仮置き）
// 役職キーは Python 側の Role.name と一致させる（先頭大文字）
export const ROLES = {
  Villager: { ja: '村人',   short: '村', color: 'var(--r-villager)', team: 'village' },
  Seer:     { ja: '占い師', short: '占', color: 'var(--r-seer)',      team: 'village' },
  Medium:   { ja: '霊媒師', short: '霊', color: 'var(--r-medium)',    team: 'village' },
  Knight:   { ja: '狩人',   short: '狩', color: 'var(--r-hunter)',    team: 'village' },
  Madman:   { ja: '狂人',   short: '狂', color: 'var(--r-madman)',    team: 'wolf' },
  Werewolf: { ja: '人狼',   short: '狼', color: 'var(--r-werewolf)',  team: 'wolf' },
};

// エージェントごとのパレット（アバター背景グラデーションに使う個人カラー）
export const AGENT_PALETTE = {
  Mira:  '#7fb0e0',
  Ren:   '#c89a5d',
  Kai:   '#7ed1a3',
  Toma:  '#d98a8a',
  Shiki: '#a18bd0',
  Rei:   '#d6b978',
  Sable: '#9aa3b6',
  Sera:  '#e08fb8',
  Kael:  '#7ec9c2',
  Sora:  '#cdd29a',
  Nox:   '#b06b8c',
  Haru:  '#88c0a8',
  Lumi:  '#c4a0d8',
  Nana:  '#e0b87a',
  Vael:  '#7a9fd4',
};
