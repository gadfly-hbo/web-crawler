const REQUIREMENT_TEMPLATE = `我想在工作台新增一个采集场景：
1. 场景名称：[例如：某行业研报批量抓取 / 社交平台热搜榜 / 某公开数据接口]
2. 数据源地址：[例如：目标网站网址，或公开 API 文档链接]
3. 需要采集的字段：[例如：标题、发布日期、内容摘要、PDF/图片附件]
4. 业务筛选条件：[例如：按关键词、按分类、按时间范围]`;

export function CustomScenarioGuide(props: { showToast: (msg: string) => void }) {
  const handleCopy = () => {
    void navigator.clipboard.writeText(REQUIREMENT_TEMPLATE);
    props.showToast('需求模版已复制到剪贴板，直接粘贴发给 AI 即可！');
  };

  return (
    <div className="card">
      <div className="eyebrow">AI 研发协同</div>
      <h3 className="card-h">如何让 AI 为您接入并固化新数据源？</h3>
      <p className="small" style={{ marginBottom: 16 }}>
        您无需懂代码或接口技术，只需将业务诉求告诉 AI，AI 将完成代码开发、自动化测试并直接固化上架到本工作台。
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 16 }}>
        <div style={{ padding: 12, background: 'var(--surface-2)', borderRadius: 'var(--rounded-sm)' }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>① 填写需求</div>
          <div className="small">复制下方模版，填入您的目标网址或 API 文档链接。</div>
        </div>
        <div style={{ padding: 12, background: 'var(--surface-2)', borderRadius: 'var(--rounded-sm)' }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>② 发送给 AI</div>
          <div className="small">在 agy-cli 对话框中把需求发给 AI，AI 负责编写并验证爬虫。</div>
        </div>
        <div style={{ padding: 12, background: 'var(--surface-2)', borderRadius: 'var(--rounded-sm)' }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>③ 自动上架</div>
          <div className="small">AI 完成固化后，工作台刷新即可直接点选使用专属业务卡片！</div>
        </div>
      </div>

      <div className="fld">
        <label>需求模版</label>
        <textarea
          readOnly
          value={REQUIREMENT_TEMPLATE}
          rows={6}
          style={{
            width: '100%',
            padding: '8px 12px',
            fontFamily: 'var(--font-mono)',
            fontSize: '12px',
            borderRadius: 'var(--rounded-sm)',
            border: '1px solid var(--border-strong)',
            background: 'var(--surface-2)',
            color: 'var(--text)',
            resize: 'none',
          }}
        />
      </div>

      <button type="button" className="btn btn-secondary" onClick={handleCopy}>
        📋 一键复制需求模版
      </button>
    </div>
  );
}
