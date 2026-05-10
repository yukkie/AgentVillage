/**
 * config/icons/{name}.png へのパスを解決して <img> を返す薄いラッパー。
 * Vite の server.fs.allow でリポジトリルートへのアクセスが許可されている前提。
 * @param {string} name - エージェント名（例: "Mira"）
 * @param {string} alt
 * @param {string} className
 */
export default function Icon({ name, alt, className, style }) {
  return (
    <img
      src={`/icons/${name}.png`}
      alt={alt ?? name}
      className={className}
      style={style}
    />
  );
}
