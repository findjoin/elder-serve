function getElderLabel(state, elderId) {
  const elder = state.elders.find((item) => item.id === elderId);
  return elder ? `${elder.room} 室 ${elder.name}` : "未绑定老人";
}

function getPriorityTone(item) {
  if (item.status.includes("待")) return "pending";
  return "risk";
}

function getTypeHint(type) {
  if (type === "老人身体不适") return "适用于头晕、发热、疼痛、胸闷等突发不适。";
  if (type === "老人不配合") return "适用于拒绝护理、情绪激动、无法继续执行任务。";
  if (type === "摔倒风险") return "适用于站立不稳、滑倒隐患、床旁风险等情况。";
  return "适用于护理垫、手套、药盒等物资余量不足。";
}

function renderStatusTrail(anomalies) {
  if (!anomalies.length) {
    return '<div class="note-box">当前还没有异常上报记录，首次上报后会在这里显示状态链路。</div>';
  }

  return `
    <div class="timeline">
      ${anomalies
        .slice(0, 4)
        .map(
          (item, index) => `
            <div class="timeline__item">
              <strong>${index === 0 ? "刚刚上报" : index === 1 ? "已同步" : index === 2 ? "待跟进" : "已留档"}</strong>
              <span>${item.type} · ${item.time} · ${item.status}</span>
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

export function renderAnomalyPage({ state }) {
  const recentAnomalies = state.anomalies.slice(0, 5);
  const active = recentAnomalies[0];

  return `
    <section class="page-stack">
      <article class="panel">
        <div class="panel__header">
          <div>
            <h3>异常上报</h3>
            <p>发现问题后立即录入，文字备注和状态追踪会进入交接班。</p>
          </div>
        </div>
        <div class="form-grid">
          <select class="input" data-anomaly-field="type">
            ${["老人身体不适", "老人不配合", "摔倒风险", "物资短缺"]
              .map(
                (item) => `
                  <option value="${item}" ${state.ui.anomalyDraft.type === item ? "selected" : ""}>${item}</option>
                `,
              )
              .join("")}
          </select>
          <select class="input" data-anomaly-field="elderId">
            <option value="">不绑定老人</option>
            ${state.elders
              .map(
                (elder) => `
                  <option value="${elder.id}" ${state.ui.anomalyDraft.elderId === elder.id ? "selected" : ""}>
                    ${elder.room} 室 ${elder.name}
                  </option>
                `,
              )
              .join("")}
          </select>
          <textarea class="input input--textarea" data-anomaly-field="note" placeholder="填写异常详情、现场处理和后续建议">${state.ui.anomalyDraft.note}</textarea>
          <button class="primary-button primary-button--large" type="button" data-action="submit-anomaly">
            提交异常
          </button>
        </div>
      </article>

      <section class="metric-grid">
        <article class="metric-card">
          <span>当前类型</span>
          <strong>${state.ui.anomalyDraft.type}</strong>
          <small>${getTypeHint(state.ui.anomalyDraft.type)}</small>
        </article>
        <article class="metric-card metric-card--sage">
          <span>绑定对象</span>
          <strong>${state.ui.anomalyDraft.elderId ? getElderLabel(state, state.ui.anomalyDraft.elderId) : "未绑定老人"}</strong>
          <small>备注会与异常记录一起保存</small>
        </article>
        <article class="metric-card metric-card--amber">
          <span>最新状态</span>
          <strong>${active ? active.status : "等待上报"}</strong>
          <small>${active ? "最新异常会进入跟进链路" : "提交后开始同步状态"}</small>
        </article>
      </section>

      <article class="panel">
        <div class="panel__header">
          <div>
            <h3>状态链路</h3>
            <p>方便院长端查看，也方便交接班时快速复核处理进展。</p>
          </div>
        </div>
        ${renderStatusTrail(recentAnomalies)}
      </article>

      <article class="panel">
        <div class="panel__header">
          <div>
            <h3>最近上报</h3>
            <p>展示最新 5 条异常，便于回看和追踪。</p>
          </div>
        </div>
        <div class="card-stack">
          ${recentAnomalies
            .map(
              (item) => `
                <div class="anomaly-row">
                  <div class="detail-head" style="margin-bottom: 6px;">
                    <strong>${item.type}</strong>
                    <div class="status-pill status-pill--${getPriorityTone(item)}">${item.status}</div>
                  </div>
                  <p>${item.note}</p>
                  <small>${item.time} · ${item.elderId ? getElderLabel(state, item.elderId) : "未绑定老人"}</small>
                </div>
              `,
            )
            .join("")}
        </div>
      </article>
    </section>
  `;
}
