function parseBloodPressure(value) {
  const [systolic, diastolic] = String(value || "")
    .split("/")
    .map((part) => Number.parseFloat(part));

  return {
    systolic: Number.isFinite(systolic) ? systolic : null,
    diastolic: Number.isFinite(diastolic) ? diastolic : null,
  };
}

function getVitalsTone(item) {
  const { systolic, diastolic } = parseBloodPressure(item.bloodPressure);
  const bloodSugar = Number.parseFloat(item.bloodSugar);
  const temperature = Number.parseFloat(item.temperature);
  const abnormal =
    (systolic !== null && systolic >= 150) ||
    (diastolic !== null && diastolic >= 95) ||
    (Number.isFinite(bloodSugar) && (bloodSugar < 3.9 || bloodSugar > 10)) ||
    (Number.isFinite(temperature) && (temperature < 36 || temperature > 37.3));

  return abnormal ? "risk" : "completed";
}

function getVitalsLabel(item) {
  const labels = [];
  const { systolic, diastolic } = parseBloodPressure(item.bloodPressure);
  const bloodSugar = Number.parseFloat(item.bloodSugar);
  const temperature = Number.parseFloat(item.temperature);

  if ((systolic !== null && systolic >= 150) || (diastolic !== null && diastolic >= 95)) labels.push("血压偏高");
  if (Number.isFinite(bloodSugar) && (bloodSugar < 3.9 || bloodSugar > 10)) labels.push("血糖异常");
  if (Number.isFinite(temperature) && (temperature < 36 || temperature > 37.3)) labels.push("体温异常");

  return labels.length ? labels.join(" / ") : "正常";
}

export function renderHealthPage({ state, selectors }) {
  const selectedElder = selectors.selectedElder;
  const elderVitals = selectors.elderVitals;
  const latest = elderVitals[0];
  const abnormalCount = state.vitals.filter((item) => getVitalsTone(item) === "risk").length;

  return `
    <section class="page-stack">
      <article class="panel">
        <div class="panel__header">
          <div>
            <h3>老人选择</h3>
            <p>先选老人，再录入体温、血压和血糖，数据会进入健康档案。</p>
          </div>
        </div>
        <div class="chip-row">
          ${state.elders
            .map(
              (elder) => `
                <button class="chip ${state.ui.selectedElderId === elder.id ? "is-active" : ""}" data-action="pick-elder" data-value="${elder.id}">
                  ${elder.room} ${elder.name}
                </button>
              `,
            )
            .join("")}
        </div>
      </article>

      <section class="metric-grid">
        <article class="metric-card">
          <span>当前对象</span>
          <strong>${selectedElder ? selectedElder.room : "--"}</strong>
          <small>${selectedElder ? selectedElder.name : "请先选择老人"}</small>
        </article>
        <article class="metric-card metric-card--sage">
          <span>最近记录</span>
          <strong>${elderVitals.length}</strong>
          <small>当前老人最近 4 条体征</small>
        </article>
        <article class="metric-card metric-card--amber">
          <span>异常提醒</span>
          <strong>${abnormalCount}</strong>
          <small>异常值会同步到异常上报链路</small>
        </article>
      </section>

      <article class="panel">
        <div class="panel__header">
          <div>
            <h3>当前老人摘要</h3>
            <p>保持重点对象信息可见，避免录错人。</p>
          </div>
        </div>
        ${
          selectedElder
            ? `
              <div class="detail-grid">
                <div>
                  <span>房间与姓名</span>
                  <strong>${selectedElder.room} 室 · ${selectedElder.name}</strong>
                </div>
                <div>
                  <span>年龄与等级</span>
                  <strong>${selectedElder.age} 岁 · ${selectedElder.level}</strong>
                </div>
                <div>
                  <span>护理标签</span>
                  <strong>${selectedElder.tags.join(" / ")}</strong>
                </div>
                <div>
                  <span>最新判断</span>
                  <strong>${latest ? getVitalsLabel(latest) : "暂无最新体征"}</strong>
                </div>
              </div>
            `
            : '<div class="note-box">请先从上方选择老人，再开始录入健康数据。</div>'
        }
        <div class="note-box">
          异常阈值参考：血压高于 150/95，血糖低于 3.9 或高于 10，体温低于 36.0 或高于 37.3。
        </div>
      </article>

      <article class="panel">
        <div class="panel__header">
          <div>
            <h3>最近体征</h3>
            <p>方便值班期间快速回看变化趋势。</p>
          </div>
        </div>
        <div class="vitals-grid">
          ${elderVitals.length
            ? elderVitals
                .map(
                  (item) => `
                    <div class="vitals-card">
                      <div class="detail-head" style="margin-bottom: 8px;">
                        <strong>${item.time}</strong>
                        <div class="status-pill status-pill--${getVitalsTone(item)}">${getVitalsLabel(item)}</div>
                      </div>
                      <p>血压 ${item.bloodPressure}</p>
                      <p>血糖 ${item.bloodSugar}</p>
                      <p>体温 ${item.temperature}</p>
                    </div>
                  `,
                )
                .join("")
            : '<div class="note-box">当前老人还没有体征记录。</div>'}
        </div>
      </article>

      <article class="panel">
        <div class="panel__header">
          <div>
            <h3>实时录入</h3>
            <p>护理结束后立即保存，避免班后补录。</p>
          </div>
        </div>
        <form id="vitals-form" class="form-grid">
          <select class="input" name="elderId">
            ${state.elders
              .map(
                (elder) => `
                  <option value="${elder.id}" ${state.ui.selectedElderId === elder.id ? "selected" : ""}>
                    ${elder.room} 室 ${elder.name}
                  </option>
                `,
              )
              .join("")}
          </select>
          <input class="input" name="bloodPressure" placeholder="血压，例如 128/84" />
          <input class="input" name="bloodSugar" placeholder="血糖，例如 5.8" />
          <input class="input" name="temperature" placeholder="体温，例如 36.6" />
          <button class="primary-button primary-button--large" type="submit">保存健康数据</button>
        </form>
      </article>
    </section>
  `;
}
