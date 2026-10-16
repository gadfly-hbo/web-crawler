/** RssPicker：RSS 场景表单（UI 合同裁决①，2026-10-16 已批准）。 */
export function RssPicker(props: {
  urlsText: string;
  limitText: string;
  onChangeUrlsText: (text: string) => void;
  onChangeLimitText: (text: string) => void;
}) {
  const { urlsText, limitText, onChangeUrlsText, onChangeLimitText } = props;

  const feedCount = urlsText
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#')).length;

  return (
    <div className="card">
      <div className="eyebrow">场景配置</div>
      <h3 className="card-h" style={{ marginBottom: 12 }}>
        公开 RSS 资讯采集
      </h3>
      <p className="card-sub" style={{ marginBottom: 16 }}>
        输入获准采集的公开 RSS/Atom Feed URL 列表（每行一个，1-5 个）。任务即白名单：只读拉取条目元数据，不抓正文与附件。
      </p>

      <div className="fld">
        <label htmlFor="f-rss-urls" style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Feed URL 清单</span>
          <span style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 400 }}>已输入 {feedCount} 个有效 Feed</span>
        </label>
        <textarea
          id="f-rss-urls"
          rows={5}
          value={urlsText}
          onChange={(e) => onChangeUrlsText(e.target.value)}
          placeholder={'https://news.example.com/feed.xml\nhttps://blog.example.org/atom.xml'}
        />
        <div className="hint">每行一个 URL；# 开头为注释行；最少 1 个、最多 5 个。</div>
      </div>

      <div className="fld">
        <label htmlFor="f-rss-limit">条目上限（可选）</label>
        <input
          id="f-rss-limit"
          className="input-short"
          type="number"
          min={1}
          value={limitText}
          onChange={(e) => onChangeLimitText(e.target.value)}
        />
        <div className="hint">每个 Feed 保留前 N 条（1-500），留空默认 50。</div>
      </div>
    </div>
  );
}
