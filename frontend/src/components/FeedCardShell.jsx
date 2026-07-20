import AgentLink from './AgentLink.jsx';
import Avatar from './Avatar.jsx';

/**
 * `SpeechCard` / `AgentEpisodeCard` / `WolfChatCard` が共有するフィードカードの骨格（#596）。
 * 所有範囲: `<article>` → `AgentLink>Avatar` → `.vert` → `<div>` → `.spHead` の div →
 * `.spHead` 内の名前リンク（`AgentLink > span.name`）まで。
 *
 * CSS は持たない（判断2-A案）。`className` / `vertClassName` / `spHeadClassName` / `nameClassName` は
 * 呼び出し側（`FeedCard.module.css`）の class をそのまま props で受け取る。
 *
 * - `head`: `.spHead` 内・名前リンクの**後ろ**に差し込まれる追加要素（turn / RoleTag / CoBadge / time など）。
 *   カードごとに異なる。渡さなければ名前だけのヘッダになる（WolfChatCard）。
 * - `children`: `.spHead` の**外**、本文以降（quote / spBody / ThoughtDetails）。
 */
export default function FeedCardShell({
  className,
  vertClassName,
  spHeadClassName,
  nameClassName,
  style,
  ariaLabel,
  agent,
  avatarRole,
  sessionId,
  viewerMode,
  head,
  children,
}) {
  return (
    <article className={className} style={style} aria-label={ariaLabel}>
      <AgentLink sessionId={sessionId} name={agent} viewerMode={viewerMode}>
        <Avatar name={agent} role={avatarRole} />
      </AgentLink>
      <div className={vertClassName} />
      <div>
        <div className={spHeadClassName}>
          <AgentLink sessionId={sessionId} name={agent} viewerMode={viewerMode}>
            <span className={nameClassName}>{agent}</span>
          </AgentLink>
          {head}
        </div>
        {children}
      </div>
    </article>
  );
}
