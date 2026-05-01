import { renderAvatar, renderIcon } from "../utils/caregiverUi.js";
import { renderCaregiverTaskTimeline } from "./taskDetailPage.js";

function renderTimelineFullscreen(selectors) {
  if (!selectors.caregiverTimelineFullscreen) return "";

  return `
    <section class="caregiver-timeline-fullscreen" role="dialog" aria-modal="true">
      <header class="caregiver-timeline-fullscreen__head">
        <div>
          <strong>今日时间轴</strong>
          <small>${selectors.elderTasks.length} 项任务</small>
        </div>
        <button class="icon-button" type="button" data-action="close-caregiver-timeline-fullscreen" aria-label="退出全屏">
          ${renderIcon("close")}
        </button>
      </header>
      <div class="caregiver-timeline-fullscreen__body">
        ${renderCaregiverTaskTimeline({ selectors, mode: "fullscreen" })}
      </div>
    </section>
  `;
}

export function renderElderDetailPage({ selectors }) {
  const elder = selectors.selectedElder;
  const latestVitals = selectors.elderVitals[0];

  if (!elder) {
    return `<section class="empty-state">未找到老人档案。</section>`;
  }

  return `
    <section class="subpage-header subpage-header--center">
      <h1>老人档案</h1>
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
        <button class="button button--secondary button--small" data-action="open-quick-exception" data-value="${elder.id}">
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

      <article class="detail-card detail-card--timeline">
        <div class="detail-card__row detail-card__row--timeline-head">
          <strong>今日时间轴</strong>
          <span class="timeline-head-actions">
            <small>${selectors.elderTasks.length} 项任务</small>
            <button class="icon-button timeline-fullscreen-button" type="button" data-action="open-caregiver-timeline-fullscreen" aria-label="全屏查看时间轴">
              ${renderIcon("fullscreen")}
            </button>
          </span>
        </div>
        ${renderCaregiverTaskTimeline({ selectors, mode: "embedded" })}
      </article>
    </section>
    ${renderTimelineFullscreen(selectors)}
  `;
}
