import { DEFAULT_WEATHER_CITIES } from '../../../../shared/task-params';

export function WeatherPicker(props: {
  city: string;
  onChangeCity: (city: string) => void;
}) {
  const { city, onChangeCity } = props;

  return (
    <div className="card">
      <div className="eyebrow">业务参数</div>
      <h3 className="card-h">城市天气数据采集设置</h3>
      <p className="small" style={{ marginBottom: 12 }}>
        由 AI 固化的官方开放气象接口驱动，免鉴权稳定采集，无需编写或配置任何接口参数。
      </p>

      <div className="fld">
        <label>快速选择主要城市</label>
        <div className="city-tag-grid">
          {DEFAULT_WEATHER_CITIES.map((c) => {
            const isSelected = city === c;
            return (
              <button
                key={c}
                type="button"
                className={`city-tag-btn ${isSelected ? 'active' : ''}`}
                onClick={() => onChangeCity(c)}
              >
                {c}
              </button>
            );
          })}
        </div>
      </div>

      <div className="fld">
        <label>或输入指定城市名称</label>
        <input
          type="text"
          className="input-medium"
          value={city}
          placeholder="如：武汉、苏州、或拼音如 Hangzhou"
          onChange={(e) => onChangeCity(e.target.value)}
        />
        <div className="hint">支持中文城市名或标准拼音。</div>
      </div>

      <div className="banner" style={{ marginTop: 16, marginBottom: 0 }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>📋 数据采集说明：</div>
        <div className="small">
          • 采集内容：目标城市未来 3 天逐日最高温、最低温、日均气温、紫外线指数及 3 小时粒度天气。
          <br />
          • 数据格式：自动结构化为标准 JSON 并落盘至数据中心，任务完成后可直接下载或供系统分析。
        </div>
      </div>
    </div>
  );
}
