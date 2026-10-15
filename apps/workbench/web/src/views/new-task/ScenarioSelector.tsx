import { COLLECTOR_SCENARIOS, type ScenarioId } from '../../../../shared/task-params';

export function ScenarioSelector(props: {
  scenario: ScenarioId;
  onSelect: (scenario: ScenarioId) => void;
}) {
  const { scenario, onSelect } = props;

  const getChipClass = (cat: string) => {
    if (cat === 'crawler') return 'chip chip-ok';
    if (cat === 'api') return 'chip chip-accent';
    return 'chip chip-queue';
  };

  return (
    <div className="card">
      <div className="eyebrow">采集场景库</div>
      <h3 className="card-h" style={{ marginBottom: 12 }}>
        选择已固化的数据采集场景
      </h3>
      <div className="scenario-grid">
        {COLLECTOR_SCENARIOS.map((item) => {
          const isActive = item.id === scenario;
          return (
            <button
              key={item.id}
              type="button"
              className={`scenario-card ${isActive ? 'active' : ''}`}
              onClick={() => onSelect(item.id)}
            >
              <div className="scenario-head">
                <span className="scenario-title">{item.title}</span>
                <span className={getChipClass(item.category)}>{item.badge}</span>
              </div>
              <p className="scenario-desc">{item.description}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
