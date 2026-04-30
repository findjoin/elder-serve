import { renderIcon } from "../utils/caregiverUi.js";

function getTimelineDotClass(task, selectedTaskId) {
  if (task.id === selectedTaskId) return "timeline-dot timeline-dot--current";
  if (task.status === "completed") return "timeline-dot timeline-dot--done";
  return "timeline-dot";
}

export function renderTaskDetailPage({ selectors }) {
  const elder = selectors.selectedElder;
  const task = selectors.selectedTask;
  const evidenceName = selectors.selectedTaskEvidence;

  if (!elder || !task) {
    return `<section class="empty-state">未找到护理任务。</section>`;
  }

  return `
    <section class="timeline-page">
      <div class="timeline-page__header">
        <h1>${elder.name} 的任务执行</h1>
      </div>

      <div class="timeline-layout">
        <div class="timeline-layout__left">
          ${selectors.elderTasks
            .map(
              (item) => `
                <article class="timeline-task-card ${item.id === task.id ? "is-active" : ""}">
                  <button class="timeline-item" data-action="select-task" data-value="${item.id}">
                    <span class="${getTimelineDotClass(item, task.id)}"></span>
                    <strong>${item.schedule}</strong>
                    <small>${item.title}</small>
                  </button>
                  <div class="timeline-task-card__actions">
                    <label>
                      <input class="visually-hidden" type="file" accept="image/*" capture="environment" data-evidence-task="${item.id}" />
                      <span>${item.requirePhoto ? "拍照留痕" : "补拍"}</span>
                    </label>
                    <button type="button" data-action="mark-risk" data-value="${item.id}">异常</button>
                  </div>
                </article>
              `,
            )
            .join("")}
        </div>

        <div class="timeline-layout__right">
          <article class="current-task-card">
            <h3>当前任务：${task.title}</h3>
            <p>计划时间：${task.window}</p>
            <p>任务来源：${task.sourceLabel} · ${task.assignmentLabel} · ${task.receiptLabel} · ${task.recordLabel}</p>
          </article>

          <div class="timeline-actions">
            <label class="upload-box">
              <input class="visually-hidden" type="file" accept="image/*" capture="environment" data-evidence-task="${task.id}" />
              <span>护理留痕图片</span>
              <small>${evidenceName || "点击选择现场照片"}</small>
            </label>
            <div class="upload-feedback ${evidenceName ? "is-ready" : ""}">
              <strong>${evidenceName ? "照片已在本机暂存" : task.requirePhoto ? "本任务需拍照留痕" : "本任务不强制拍照"}</strong>
              <small>${evidenceName ? "提交后同步云端，弱网失败可重试。" : "翻身、助餐、异常处置优先留痕；支持重拍/补拍。"}</small>
            </div>

            <button class="button button--success button--block" data-action="complete-task" data-value="${task.id}">
              <span>已完成</span>
              <small>${task.requirePhoto ? "（必须拍照后提交）" : "（可直接提交）"}</small>
            </button>

            <div class="timeline-actions__group">
              <p>未完成反馈：</p>
              <button class="button button--secondary button--block" data-action="mark-risk" data-value="${task.id}">
                ${renderIcon("warning")}
                <span>异常情况（需留痕）</span>
              </button>
              <button class="button button--secondary button--block" data-action="mark-refused" data-value="${task.id}">
                ${renderIcon("userMinus")}
                <span>老人不配合（记原因）</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  `;
}
