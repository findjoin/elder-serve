function formatTaskLabel(state, task) {
  const elder = state.elders.find((item) => item.id === task.elderId);
  const roomLabel = elder ? `${elder.room}室` : "未绑定房间";
  const elderLabel = elder ? elder.name : "未知老人";
  return `${roomLabel} · ${elderLabel}`;
}

function uniqueElders(state, tasks, anomalies) {
  const elderIds = new Set();

  tasks.forEach((task) => {
    if (task.elderId) elderIds.add(task.elderId);
  });

  anomalies.forEach((item) => {
    if (item.elderId) elderIds.add(item.elderId);
  });

  return [...elderIds]
    .map((elderId) => state.elders.find((item) => item.id === elderId))
    .filter(Boolean)
    .slice(0, 4);
}

export function renderHandoverPage({ state, selectors }) {
  const pendingTasks = selectors.pendingTasks.slice(0, 4);
  const riskTasks = selectors.riskTasks.slice(0, 4);
  const focusElders = uniqueElders(state, riskTasks, state.anomalies.filter((item) => item.level !== "low")).slice(0, 4);
  const latestRecord = state.handoverRecords[0];
  const unreadCount = state.messages.filter((item) => !item.read).length;

  return `
    <section class="page-stack">
      <article class="hero-strip">
        <div>
          <p class="eyebrow">下班前交接</p>
          <h2>把未完成事项一次交清</h2>
          <p class="hero-copy">按任务、重点老人、物资缺口整理后提交，确保接班人能直接接手。</p>
        </div>
        <div class="shift-badge">${state.caregiver.shift}</div>
      </article>

      <section class="metric-grid metric-grid--compact">
        <article class="metric-card">
          <span>未完成任务</span>
          <strong>${selectors.pendingTasks.length}</strong>
          <small>下班前需逐项交代</small>
        </article>
        <article class="metric-card metric-card--amber">
          <span>重点事项</span>
          <strong>${selectors.riskTasks.length}</strong>
          <small>异常与风险任务需单独说明</small>
        </article>
        <article class="metric-card metric-card--sage">
          <span>已完成</span>
          <strong>${selectors.completedTasks.length}</strong>
          <small>可直接交班的工作量</small>
        </article>
      </section>

      <article class="panel">
        <div class="panel__header">
          <div>
            <h3>交接摘要</h3>
            <p>先把今天还没收尾的任务、重点老人和物资缺口写清楚，再提交。</p>
          </div>
        </div>
        <div class="detail-grid">
          <div>
            <span>待交接任务</span>
            <strong>${selectors.pendingTasks.length} 项</strong>
          </div>
          <div>
            <span>重点老人</span>
            <strong>${focusElders.length} 位</strong>
          </div>
          <div>
            <span>未读消息</span>
            <strong>${unreadCount} 条</strong>
          </div>
          <div>
            <span>交接状态</span>
            <strong>${latestRecord ? "已有记录" : "待提交"}</strong>
          </div>
        </div>
      </article>

      <article class="panel">
        <div class="panel__header">
          <div>
            <h3>未完成任务</h3>
            <p>把还没做完、需要接班补上的内容列出来，接班人可直接照着处理。</p>
          </div>
        </div>
        <div class="task-list">
          ${pendingTasks.length
            ? pendingTasks
                .map(
                  (task) => `
                    <div class="task-row">
                      <div>
                        <strong>${task.title}</strong>
                        <p>${formatTaskLabel(state, task)} · ${task.window}</p>
                        <p>${task.note}</p>
                      </div>
                      <span class="status-pill status-pill--pending">待完成</span>
                    </div>
                  `,
                )
                .join("")
            : '<div class="warning-chip">当前没有未完成任务，可以直接提交交接。</div>'}
        </div>
      </article>

      <article class="panel">
        <div class="panel__header">
          <div>
            <h3>重点老人</h3>
            <p>风险老人、异常跟进和需要重点观察的对象，建议在口头交接时再确认一次。</p>
          </div>
        </div>
        <div class="warning-list">
          ${focusElders.length
            ? focusElders
                .map(
                  (elder) => `
                    <div class="warning-chip">
                      ${elder.room}室 · ${elder.name} · ${elder.level}
                    </div>
                  `,
                )
                .join("")
            : '<div class="warning-chip">暂无需要单独交接的重点老人。</div>'}
        </div>
      </article>

      <article class="panel">
        <div class="panel__header">
          <div>
            <h3>物资缺口与补充</h3>
            <p>记录缺少的护理用品、临时借用和需要补货的物资，避免下一班重复追问。</p>
          </div>
        </div>
        <div class="form-grid">
          <textarea
            class="input input--textarea"
            data-handover-field="risks"
            placeholder="例如：103 床晨起不适，105 室需要复测血压，交班后继续观察。"
          >${state.ui.handoverDraft.risks}</textarea>
          <textarea
            class="input input--textarea"
            data-handover-field="supply"
            placeholder="例如：护理垫余量不足、手套需补、消毒湿巾已用到最后一包。"
          >${state.ui.handoverDraft.supply}</textarea>
          <button class="primary-button primary-button--large" type="button" data-action="submit-handover">
            提交交接班
          </button>
        </div>
      </article>

      ${latestRecord
        ? `
          <article class="panel">
            <div class="panel__header">
              <div>
                <h3>最新交接记录</h3>
                <p>提交后会保留一条可回看记录，便于接班人确认重点。</p>
              </div>
            </div>
            <div class="detail-grid">
              <div>
                <span>交接时间</span>
                <strong>${latestRecord.time}</strong>
              </div>
              <div>
                <span>接班人</span>
                <strong>${latestRecord.receiver}</strong>
              </div>
            </div>
            <div class="warning-list" style="margin-top: 12px;">
              <div class="warning-chip">重点事项：${latestRecord.risks || "无"}</div>
              <div class="warning-chip">物资缺口：${latestRecord.supply || "无"}</div>
            </div>
          </article>
        `
        : ""}
    </section>
  `;
}
