import { renderIcon } from "../utils/caregiverUi.js";

function renderPhoto(label, date) {
  return `
    <div class="history-detail__photo">
      <span class="history-photo history-photo--large">${label}</span>
      <small>${date}</small>
    </div>
  `;
}

export function renderHistoryDetailPage({ selectors }) {
  const item = selectors.selectedHistory;

  if (!item) {
    return `<section class="empty-state">记录不存在。</section>`;
  }

  return `
    <section class="history-detail-page">
      <div class="history-detail-page__header">
        <h1>护理记录详情</h1>
      </div>

      <div class="history-detail-page__content">
        <article class="detail-card">
          <div class="history-detail__identity">
            <span class="history-detail__avatar">${renderIcon("profile")}</span>
            <div>
              <strong>${item.elder}</strong>
              <small>${item.room} 房间 · 护理项：${item.task}</small>
            </div>
          </div>
          <div class="history-detail__grid">
            <span>执行护工</span><strong>${item.caregiver}</strong>
            <span>执行状态</span><strong>${item.status}</strong>
            <span>完成时间</span><strong>${item.time}</strong>
          </div>
        </article>

        <article class="detail-card">
          <h3>护理时间轴流程</h3>
          <div class="history-detail__steps">
            ${item.steps
              .map(
                (step, index) => `
                  <div class="history-step">
                    <span class="history-step__dot ${index === item.steps.length - 1 ? "is-active" : ""}"></span>
                    <p>${step}</p>
                  </div>
                `,
              )
              .join("")}
          </div>
        </article>

        <article class="detail-card">
          <h3>操作详情记录</h3>
          <div class="history-detail__quote">"${item.details}"</div>
          ${
            item.exception
              ? `<div class="history-detail__exception">${renderIcon("warning")}<p>${item.exception}</p></div>`
              : ""
          }
        </article>

        <article class="detail-card">
          <h3>现场照片留痕</h3>
          ${renderPhoto(item.photoLabel, item.time.split(" ")[0])}
        </article>
      </div>
    </section>
  `;
}
