import { renderAvatar, renderIcon } from "../utils/caregiverUi.js";

function renderTaskSummary(task) {
  return `
    <div class="director-plan-item">
      <div>
        <strong>${task.title}</strong>
        <small>${task.schedule} · ${task.sourceLabel}</small>
      </div>
      <div class="director-plan-item__actions">
        <span class="director-plan-item__assignee">${task.recordLabel}</span>
      </div>
    </div>
  `;
}

export function renderElderDetailPage({ selectors }) {
  const elder = selectors.selectedElder;
  const latestVitals = selectors.elderVitals[0];
  const nextTask = selectors.elderTasks.find((task) => task.status !== "completed") || selectors.elderTasks[0];

  if (!elder) {
    return `<section class="empty-state">未找到老人档案。</section>`;
  }

  return `
    <section class="subpage-header subpage-header--center">
      <h1>老人档案</h1>
      <span class="icon-button icon-button--ghost">${renderIcon("note")}</span>
    </section>

    <section class="detail-stack">
      <article class="detail-card detail-card--elder">
        ${renderAvatar(elder.name, "avatar--large")}
        <div class="detail-card__body">
          <h2>${elder.name}</h2>
          <p>${elder.age}岁 | ${elder.bed}</p>
          <span class="detail-tag">${elder.level}</span>
        </div>
      </article>

      <article class="detail-card">
        <div class="detail-card__row">
          <strong>紧急联系人</strong>
          <span class="detail-card__icon">${renderIcon("phone")}</span>
        </div>
        <div class="detail-card__row detail-card__row--muted">
          <span>${elder.familyContact}</span>
          <span>${elder.familyPhone}</span>
        </div>
      </article>

      <article class="detail-card detail-card--quick-risk">
        <div>
          <strong>快速异常上报</strong>
          <p>先电话/口头通知院方，再一键留痕进入闭环。</p>
        </div>
        <button class="button button--secondary button--small" data-action="mark-risk" data-value="${nextTask ? nextTask.id : ""}" ${
          nextTask ? "" : "disabled"
        }>
          异常留痕
        </button>
      </article>

      <section class="stat-grid stat-grid--two">
        <article class="detail-card detail-card--compact">
          <small>最近血压</small>
          <strong>${latestVitals ? latestVitals.bloodPressure : elder.latestBloodPressure} <span>mmHg</span></strong>
        </article>
        <article class="detail-card detail-card--compact">
          <small>最近心率</small>
          <strong>${elder.latestHeartRate} <span>bpm</span></strong>
        </article>
      </section>

      <article class="detail-card">
        <div class="detail-card__row">
          <strong>今日护理方案</strong>
          <small>${selectors.elderTasks.length} 项任务</small>
        </div>
        <div class="director-plan-items">
          ${selectors.elderTasks.length ? selectors.elderTasks.map(renderTaskSummary).join("") : '<div class="empty-state empty-state--soft">当前没有派给我的任务。</div>'}
        </div>
      </article>

      <button class="button button--primary button--block" data-action="select-task" data-value="${nextTask ? nextTask.id : ""}" ${
        nextTask ? "" : "disabled"
      }>
        进入照护时间轴
      </button>
    </section>
  `;
}
