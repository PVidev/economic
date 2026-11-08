import React, { useCallback, useEffect, useMemo, useState } from "react";

const SHEET_URL =
  "https://docs.google.com/spreadsheets/d/1jVOYWZhe833ymgLlUBtLaUDbhRnBtJbi/gviz/tq?tqx=out:csv&gid=303961714";
const SHEET_PAGE =
  "https://docs.google.com/spreadsheets/d/1jVOYWZhe833ymgLlUBtLaUDbhRnBtJbi/edit?gid=303961714#gid=303961714";
const COLORS = [
  { key: "blue", label: "Сини", color: "#7ba7ff" },
  { key: "green", label: "Зелени", color: "#5bd6a3" },
  { key: "red", label: "Червени", color: "#ff718b" },
];
const EVENT_START = "2027-02-12";
const EVENT_END = "2027-02-16";

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"' && quoted && text[index + 1] === '"') {
      cell += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }
  if (cell || row.length) {
    row.push(cell);
    if (row.some((value) => value.trim())) rows.push(row);
  }

  return rows;
}

function parseNumber(value, field) {
  const number = Number(String(value ?? "").replace(",", ".").trim());
  if (!Number.isFinite(number)) {
    throw new Error(`Невалидна стойност за „${field}“ в Google Sheets.`);
  }
  return number;
}

function parseSales(csv) {
  const rows = parseCsv(csv);
  const header = rows[0]?.map((value) => value.trim().toLocaleLowerCase("bg"));
  const column = (label) => header.indexOf(label.toLocaleLowerCase("bg"));
  const dateIndex = column("Дата");
  const totalIndex = column("Общо");
  const blueIndex = column("Сини");
  const greenIndex = column("Зелени");
  const redIndex = column("Червени");

  if ([dateIndex, totalIndex, blueIndex, greenIndex, redIndex].some((i) => i < 0)) {
    throw new Error("Липсват очакваните колони в Google Sheets.");
  }

  const sales = rows.slice(1)
    .filter((cells) => /^\d{4}-\d{2}-\d{2}$/.test(cells[dateIndex]?.trim() ?? ""))
    .map((cells) => ({
      date: cells[dateIndex].trim(),
      total: parseNumber(cells[totalIndex], "Общо"),
      blue: parseNumber(cells[blueIndex], "Сини"),
      green: parseNumber(cells[greenIndex], "Зелени"),
      red: parseNumber(cells[redIndex], "Червени"),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  if (!sales.length) {
    throw new Error("В Google Sheets не бяха намерени дневни продажби.");
  }
  return sales;
}

function formatNumber(number, decimals = 0) {
  return new Intl.NumberFormat("bg-BG", {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  }).format(number);
}

function distribute(total, shares) {
  const raw = shares.map((share) => total * share);
  const result = raw.map(Math.floor);
  let remainder = total - result.reduce((sum, value) => sum + value, 0);
  const priority = raw
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction);

  for (let index = 0; index < remainder; index += 1) {
    result[priority[index % priority.length].index] += 1;
  }
  return result;
}

function MetricCard({ label, value, detail, accent }) {
  return (
    <article className={`metric-card ${accent ? `metric-${accent}` : ""}`}>
      <p className="metric-label">{label}</p>
      <p className="metric-value">{value}</p>
      <p className="metric-detail">{detail}</p>
    </article>
  );
}

function SalesChart({ sales }) {
  const width = 900;
  const height = 280;
  const padding = { top: 24, right: 20, bottom: 38, left: 38 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const maxValue = Math.max(14, ...sales.map((day) => day.total));
  const x = (index) => padding.left + (index / Math.max(1, sales.length - 1)) * plotWidth;
  const y = (value) => padding.top + plotHeight - (value / maxValue) * plotHeight;
  const points = sales.map((day, index) => `${x(index)},${y(day.total)}`).join(" ");
  const eventDays = sales.filter(
    (day) => day.date >= EVENT_START && day.date <= EVENT_END,
  );
  const firstEvent = sales.findIndex(
    (day) => day.date >= EVENT_START && day.date <= EVENT_END,
  );
  const lastEvent = sales
    .map((day) => day.date)
    .lastIndexOf(eventDays[eventDays.length - 1]?.date);
  const chartDays = [1, 7, 14, 21, 28];

  return (
    <div className="chart-wrap">
      <svg
        className="sales-chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Линейна графика на дневните продажби през февруари"
      >
        {[0, 5, 10, 15].map((tick) => (
          <g key={tick}>
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={y(tick)}
              y2={y(tick)}
              className="chart-grid"
            />
            <text x={padding.left - 10} y={y(tick) + 4} className="chart-axis" textAnchor="end">
              {tick}
            </text>
          </g>
        ))}
        {firstEvent >= 0 && lastEvent >= 0 && (
          <g>
            <rect
              x={x(firstEvent) - plotWidth / (sales.length - 1) / 2}
              y={padding.top}
              width={x(lastEvent) - x(firstEvent) + plotWidth / (sales.length - 1)}
              height={plotHeight}
              rx="8"
              className="event-band"
            />
            <text
              x={(x(firstEvent) + x(lastEvent)) / 2}
              y={padding.top + 13}
              textAnchor="middle"
              className="event-label"
            >
              Св. Валентин
            </text>
          </g>
        )}
        <polyline points={points} className="chart-line" />
        {sales.map((day, index) => (
          <circle
            key={day.date}
            cx={x(index)}
            cy={y(day.total)}
            r={day.date >= EVENT_START && day.date <= EVENT_END ? 5 : 3.5}
            className={
              day.date >= EVENT_START && day.date <= EVENT_END
                ? "chart-point chart-point-event"
                : "chart-point"
            }
          >
            <title>{`${day.date}: ${day.total} продажби`}</title>
          </circle>
        ))}
        {chartDays.map((day) => {
          const index = sales.findIndex((entry) => Number(entry.date.slice(-2)) === day);
          if (index < 0) return null;
          return (
            <text
              key={day}
              x={x(index)}
              y={height - 10}
              className="chart-axis"
              textAnchor="middle"
            >
              {day} фев.
            </text>
          );
        })}
      </svg>
    </div>
  );
}

function App() {
  const [sales, setSales] = useState([]);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [uplift, setUplift] = useState(15);
  const [copyStatus, setCopyStatus] = useState("");

  const loadSales = useCallback(async () => {
    setStatus("loading");
    setError("");
    try {
      const response = await fetch(SHEET_URL, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Google Sheets върна HTTP ${response.status}.`);
      }
      const csv = await response.text();
      setSales(parseSales(csv));
      setStatus("ready");
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Неуспешно зареждане на данните от Google Sheets.",
      );
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    loadSales();
  }, [loadSales]);

  const analysis = useMemo(() => {
    if (!sales.length) return null;

    const totals = sales.reduce(
      (sum, day) => ({
        total: sum.total + day.total,
        blue: sum.blue + day.blue,
        green: sum.green + day.green,
        red: sum.red + day.red,
      }),
      { total: 0, blue: 0, green: 0, red: 0 },
    );
    const eventSales = sales.filter(
      (day) => day.date >= EVENT_START && day.date <= EVENT_END,
    );
    const eventTotal = eventSales.reduce((sum, day) => sum + day.total, 0);
    const eventRed = eventSales.reduce((sum, day) => sum + day.red, 0);
    const regularSales = sales.filter(
      (day) => day.date < EVENT_START || day.date > EVENT_END,
    );
    const regularTotal = regularSales.reduce((sum, day) => sum + day.total, 0);
    const regularByColor = regularSales.reduce(
      (sum, day) => [
        sum[0] + day.blue,
        sum[1] + day.green,
        sum[2] + day.red,
      ],
      [0, 0, 0],
    );
    const baseline = Math.round((regularTotal / regularSales.length) * 31);
    const forecast = Math.round(baseline * (1 + uplift / 100));
    const regularColorTotal = regularByColor.reduce((sum, value) => sum + value, 0);
    const colorShares = regularByColor.map((value) => value / regularColorTotal);
    const baselineColorPlan = distribute(baseline, colorShares);
    const colorPlan = distribute(forecast, colorShares);

    return {
      totals,
      eventTotal,
      eventRed,
      eventDays: eventSales.length,
      regularTotal,
      regularDays: regularSales.length,
      baseline,
      naiveForecast: Math.round((totals.total / sales.length) * 31),
      forecast,
      baselineColorPlan,
      colorPlan,
      redShare: eventTotal ? (eventRed / eventTotal) * 100 : 0,
      average: totals.total / sales.length,
    };
  }, [sales, uplift]);

  const copyText = async (text, label) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus(`${label} е копиран.`);
    } catch {
      setCopyStatus("Копирането не беше разрешено от браузъра.");
    }
  };

  const prompt = `Ти си бизнес анализатор на малка фирма, която продава персонализирани бутилки.

Данните по-долу са реални продажби за февруари 2027 г., заредени от Google Sheets.
Анализирай общите продажби и цветовете, отбележи пика около Св. Валентин (12–16 февруари) и обясни кои изводи са подкрепени с данни.

Направи отделно хипотетичен сценарий за март с ${uplift}% ръст спрямо базовата прогноза без празничния пик. Не представяй сценария като реални данни. Посочи допусканията и рисковете.

Февруари: ${sales
    .map((day) => `${day.date}: общо ${day.total} (сини ${day.blue}, зелени ${day.green}, червени ${day.red})`)
    .join("; ")}

Базова прогноза за март: ${analysis?.baseline ?? 0} бутилки.
Хипотетичен план с ${uplift}% ръст: ${analysis?.forecast ?? 0} бутилки (сини ${analysis?.colorPlan[0] ?? 0}, зелени ${analysis?.colorPlan[1] ?? 0}, червени ${analysis?.colorPlan[2] ?? 0}).

Не измисляй липсващи данни. Представи резултатите в таблица и посочи каква допълнителна информация би подобрила прогнозата.`;

  return (
    <main className="page-shell">
      <header className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Открит урок · 8. клас · Бизнес анализ</p>
          <h1>Продажбите разказват история.</h1>
          <p className="hero-description">
            Проучи данните за персонализираните бутилки през февруари и тествай
            хипотетичен план за март.
          </p>
        </div>
        <a className="source-link" href={SHEET_PAGE} target="_blank" rel="noreferrer">
          Отвори Google Sheets <span aria-hidden="true">↗</span>
        </a>
      </header>

      <div className="data-status" aria-live="polite">
        <span className={`status-dot ${status}`} />
        {status === "loading" && "Зареждане на данните от Google Sheets…"}
        {status === "ready" && "Данните са заредени директно от Google Sheets"}
        {status === "error" && (
          <>
            <span>{error}</span>
            <button type="button" className="text-button" onClick={loadSales}>
              Опитай отново
            </button>
          </>
        )}
      </div>

      {status === "ready" && analysis && (
        <>
          <section className="metrics-grid" aria-label="Основни показатели">
            <MetricCard
              label="Продажби през февруари"
              value={formatNumber(analysis.totals.total)}
              detail={`${sales.length} отчетени дни`}
              accent="blue"
            />
            <MetricCard
              label="Пик · 12–16 февруари"
              value={formatNumber(analysis.eventTotal)}
              detail={`${analysis.eventDays} дни · ${formatNumber((analysis.eventTotal / analysis.eventDays), 1)} средно на ден`}
              accent="pink"
            />
            <MetricCard
              label="Червени в пиковия период"
              value={`${formatNumber(analysis.redShare, 1)}%`}
              detail={`${analysis.eventRed} от ${analysis.eventTotal} бутилки`}
              accent="red"
            />
            <MetricCard
              label="Март · базов сценарий"
              value={formatNumber(analysis.baseline)}
              detail="Без пиковия период · 31 дни"
              accent="green"
            />
          </section>

          <section className="panel trend-panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Февруари 2027</p>
                <h2>Дневни продажби</h2>
              </div>
              <span className="chart-legend">
                <span className="legend-line" /> Продадени бутилки
              </span>
            </div>
            <SalesChart sales={sales} />
            <p className="chart-caption">
              Оцветеният участък показва 12–16 февруари. Тогава са продадени{" "}
              <strong>{analysis.eventTotal} бутилки</strong> —{" "}
              {formatNumber((analysis.eventTotal / analysis.totals.total) * 100, 1)}%
              {" "}от всички продажби за месеца.
            </p>
          </section>

          <section className="panel breakdown-panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Какво се купува?</p>
                <h2>Продажби по цвят</h2>
              </div>
              <span className="muted">Общо за февруари</span>
            </div>
            <div className="color-list">
              {COLORS.map((color) => {
                const count = analysis.totals[color.key];
                const share = (count / analysis.totals.total) * 100;
                return (
                  <div className="color-row" key={color.key}>
                    <div className="color-label">
                      <span className="color-dot" style={{ backgroundColor: color.color }} />
                      <span>{color.label}</span>
                    </div>
                    <div className="color-track" aria-label={`${color.label}: ${count}`}>
                      <span style={{ width: `${share}%`, backgroundColor: color.color }} />
                    </div>
                    <strong>{count}</strong>
                    <span className="color-share">{formatNumber(share, 0)}%</span>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="panel forecast-panel">
            <div className="section-heading forecast-heading">
              <div>
                <p className="eyebrow">Хипотетичен сценарий · не е реална прогноза</p>
                <h2>Какво ако март е по-силен?</h2>
              </div>
              <div className="forecast-total">
                <strong>{analysis.forecast}</strong>
                <span>бутилки</span>
              </div>
            </div>
            <p className="forecast-explanation">
              Базата е средният дневен темп извън 12–16 февруари, умножен по 31
              дни: {analysis.regularTotal} продажби за {analysis.regularDays} дни
              ≈ {analysis.baseline} бутилки. Добави хипотетичен ръст за март:
            </p>
            <div className="slider-row">
              <label htmlFor="uplift">
                Допускан ръст <strong>{uplift}%</strong>
              </label>
              <input
                id="uplift"
                type="range"
                min="0"
                max="50"
                step="5"
                value={uplift}
                onChange={(event) => setUplift(Number(event.target.value))}
              />
              <div className="range-labels"><span>0%</span><span>50%</span></div>
            </div>
            <div className="scenario-table-wrap">
              <table className="scenario-table">
                <thead>
                  <tr><th>Сценарий</th><th>Общо</th>{COLORS.map((color) => <th key={color.key}>{color.label}</th>)}</tr>
                </thead>
                <tbody>
                  <tr>
                    <th scope="row">Базов · без пиков период</th>
                    <td>{analysis.baseline}</td>
                    {analysis.baselineColorPlan.map((value, index) => (
                      <td key={COLORS[index].key}>{value}</td>
                    ))}
                  </tr>
                  <tr className="scenario-highlight">
                    <th scope="row">С ръст от {uplift}%</th>
                    <td>{analysis.forecast}</td>
                    {analysis.colorPlan.map((value, index) => <td key={COLORS[index].key}>{value}</td>)}
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="scenario-note">
              <span aria-hidden="true">ⓘ</span>
              <p>
                Разпределението по цветове използва дела им в продажбите извън
                валентинския период. Сценарият предполага, че този състав се
                запазва; той не отчита наличности, цени, реклама или мартенски
                празници.
              </p>
            </div>
            <div className="comparison">
              <span>Сравнение: наивно пренасяне на февруарския темп — <strong>{analysis.naiveForecast}</strong> бр.</span>
              <span>Това включва празничния пик и може да надцени базовото търсене.</span>
            </div>
          </section>

          <section className="panel prompt-panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Продължи с ИИ</p>
                <h2>Попитай бизнес анализатора</h2>
              </div>
            </div>
            <p className="muted">
              Копирай промпта с актуалните данни и го постави в нов разговор.
              Включени са реалните стойности и отделно маркираният сценарий за март.
            </p>
            <div className="action-row">
              <button type="button" className="primary-button" onClick={() => copyText(prompt, "Промптът")}>
                Копирай промпта
              </button>
              <a className="secondary-button" href="https://chatgpt.com/" target="_blank" rel="noreferrer">
                Отвори ChatGPT ↗
              </a>
            </div>
            <p className="copy-status" role="status">{copyStatus}</p>
          </section>
        </>
      )}

      <footer className="page-footer">
        Данните се зареждат от{" "}
        <a href={SHEET_PAGE} target="_blank" rel="noreferrer">Google Sheets</a>.
        Мартенският сценарий е хипотетичен и служи за учебна дискусия. Дизайна на сайта е направен
        от <a href="https://pvidev.dev/" target="_blank" rel="noreferrer">PVidev Dev.</a>
      </footer>
    </main>
  );
}

export default App;
