import { renderAvatar, renderIcon } from "../utils/caregiverUi.js";

function renderTaskBadges(task) {
  return `
    <span class="director-chip ${task.assignmentLabel === "方案默认" ? "is-active" : ""}">${task.assignmentLabel}</span>
    <span class="director-chip is-active">${task.receiptLabel}</span>
    <span class="director-chip">${task.recordLabel}</span>
  `;
}

export function renderTaskCenterPage({ selectors }) {
  const visibleTasks = [...selectors.pendingTasks, ...selectors.riskTasks].slice(0, 8);

  return `
    <section class="sticky-section">
      <div class="page-header page-header--compact">
        <h1>我的任务</h1>
        <p>优先处理院长发布和需拍照任务</p>
      </div>
    </section>

    <section class="task-feed">
      ${visibleTasks
        .map(
          (task) => `
            <article class="task-feed__item">
              <button class="task-feed__main" data-action="select-task" data-value="${task.id}">
                <span class="task-feed__avatar">${renderAvatar(task.elder ? task.elder.name : "护")}</span>
                <span class="task-feed__body">
                  <strong>${task.elder ? `${task.elder.name} - ${task.elder.bed}` : task.title}</strong>
                  <small>任务：${task.title} · ${task.sourceLabel}</small>
                  <span class="task-feed__badges">${renderTaskBadges(task)}</span>
                </span>
              </button>
              <span class="task-feed__meta">
                <small>${task.status === "risk" || task.status === "refused" ? "异常" : "待处理"}</small>
                ${renderIcon("caretRight")}
              </span>
            </article>
          `,
        )
        .join("")}
    </section>
  `;
}
