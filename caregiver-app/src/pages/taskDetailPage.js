import { renderIcon } from "../utils/caregiverUi.js";

function getTimelineDotClass(task, selectedTaskId) {
  if (task.id === selectedTaskId) return "timeline-dot timeline-dot--current";
  if (task.status === "completed") return "timeline-dot timeline-dot--done";
  if (task.status === "risk" || task.status === "refused") return "timeline-dot timeline-dot--risk";
  return "timeline-dot";
}

function getCurrentTask(selectors) {
  const selectedTask = selectors.selectedTask;
  const elderTasks = selectors.elderTasks || [];
  if (selectedTask && elderTasks.some((task) => task.id === selectedTask.id)) return selectedTask;
  return elderTasks.find((task) => task.status === "pending") || elderTasks.find((task) => task.status !== "completed") || elderTasks[0] || null;
}

function hasTaskRecord(selectors, taskId) {
  const task = (selectors.elderTasks || []).find((item) => item.id === taskId);
  const recordEvidence = selectors.taskRecordEvidence?.[taskId] || selectors.taskEvidence?.[taskId];
  const hasEvidence = Array.isArray(recordEvidence) ? recordEvidence.length > 0 : Boolean(recordEvidence);
  return Boolean(
    hasEvidence ||
      task?.recordNote ||
      task?.recordUpdatedAt ||
      task?.recordedAt ||
      (Array.isArray(task?.recordEvidence) && task.recordEvidence.length > 0) ||
      selectors.taskRecordNotes?.[taskId] ||
      selectors.taskNotes?.[taskId],
  );
}

function hasTaskException(selectors, task) {
  if (!task) return false;
  return Boolean(
    task.status === "risk" ||
      task.status === "refused" ||
      task.exceptionNote ||
      task.exceptionType ||
      task.exceptionReportedAt ||
      (Array.isArray(task.exceptionEvidence) && task.exceptionEvidence.length > 0) ||
      selectors.taskExceptionEvidence?.[task.id] ||
      selectors.taskExceptionNotes?.[task.id],
  );
}

function getEvidenceName(evidence) {
  if (!evidence) return "";
  if (Array.isArray(evidence)) return evidence.length ? `${evidence.length}张照片` : "";
  if (typeof evidence === "string") return evidence;
  return evidence.name || "";
}

function renderTaskCompleteButton(task, disabled = false) {
  const completed = task.status === "completed";
  return `
    <button
      type="button"
      class="timeline-complete-toggle ${completed ? "is-complete" : ""}"
      data-action="complete-task"
      data-value="${task.id}"
      aria-label="${completed ? "已完成" : "标记完成"}"
      ${disabled ? 'disabled aria-disabled="true" title="已异常上报，不能再标记完成"' : ""}
    >
      ${completed ? "✓" : ""}
    </button>
  `;
}

function renderTaskActionButtons(selectors, item, variant = "compact") {
  const isRisk = hasTaskException(selectors, item);
  const recordReady = hasTaskRecord(selectors, item.id);
  const recordDisabledAttrs = isRisk ? 'disabled aria-disabled="true" title="已异常上报，不能再记录上报"' : "";
  const exceptionDisabledAttrs = recordReady ? 'disabled aria-disabled="true" title="已记录上报，不能再异常上报"' : "";

  if (variant === "full") {
    return `
      <button type="button" data-action="open-task-record" data-value="${item.id}" ${recordDisabledAttrs}>记录</button>
      <button
        type="button"
        class="${isRisk ? "is-active" : ""}"
        data-action="open-task-exception"
        data-value="${item.id}"
        ${exceptionDisabledAttrs}
      >异常</button>
    `;
  }

  return `
    <button
      type="button"
      class="timeline-action-button ${recordReady ? "is-ready" : ""}"
      data-action="open-task-record"
      data-value="${item.id}"
      ${recordDisabledAttrs}
    >记录</button>
    <button
      type="button"
      class="timeline-action-button timeline-action-button--risk ${isRisk ? "is-active" : ""}"
      data-action="open-task-exception"
      data-value="${item.id}"
      ${exceptionDisabledAttrs}
    >异常</button>
  `;
}

function renderEmbeddedTaskTimeline({ selectors, activeTask, isFullscreen = false, readonly = false }) {
  const listAttribute = isFullscreen ? "data-caregiver-timeline-fullscreen-list" : "data-caregiver-timeline-list";

  return `
    <section class="caregiver-task-timeline caregiver-task-timeline--embedded">
      <div class="caregiver-task-timeline__list scroll-hide" ${listAttribute}>
        ${selectors.elderTasks
          .map((item) => {
            const isActive = item.id === activeTask.id;
            const isRisk = hasTaskException(selectors, item);
            const evidenceName = getEvidenceName(selectors.taskRecordEvidence?.[item.id] || selectors.taskEvidence?.[item.id]);
            const note = selectors.taskRecordNotes?.[item.id] || selectors.taskNotes?.[item.id] || item.recordNote || "";
            const planNote = item.planNote ? ` · ${item.planNote}` : "";
            return `
              <article
                class="timeline-compact-task ${isActive ? "is-active" : ""} ${item.status === "completed" ? "is-complete" : ""} ${isRisk ? "is-risk" : ""}"
                data-current-task="${isActive ? "true" : "false"}"
              >
                <div class="timeline-compact-task__rail">
                  <span class="${getTimelineDotClass(item, activeTask.id)}"></span>
                </div>
                <div class="timeline-compact-task__card ${readonly ? "is-readonly" : ""}">
                  ${readonly ? "" : renderTaskCompleteButton(item, isRisk)}
                  <button class="timeline-compact-task__main" data-action="focus-task" data-value="${item.id}">
                    <strong>${item.schedule}</strong>
                    <span class="timeline-compact-task__title">
                      ${item.requirePhoto ? '<em class="task-require-photo">需要拍照</em>' : ""}
                      <b>${item.title}</b>
                    </span>
                    <small>${item.sourceLabel}${planNote}${evidenceName ? " · 已拍照" : ""}${note ? " · 有记录" : ""}</small>
                  </button>
                  ${readonly ? "" : `<div class="timeline-compact-task__actions">${renderTaskActionButtons(selectors, item)}</div>`}
                </div>
              </article>
            `;
          })
          .join("")}
      </div>
    </section>
  `;
}

export function renderCaregiverTaskTimeline({ selectors, mode = "page" }) {
  const task = getCurrentTask(selectors);
  if (!task) {
    const sync = selectors.caregiverTaskSyncStatus || {};
    return `
      <section class="empty-state empty-state--soft caregiver-task-empty">
        <strong>${sync.loading ? "正在同步任务时间轴" : "当前没有派给我的任务"}</strong>
        <span>查询日期：${selectors.caregiverTaskRecordDate || "--"} · 护工ID：${sync.caregiverId || "--"}</span>
        ${sync.fetchedAt ? `<span>上次同步：${sync.fetchedAt}</span>` : ""}
        ${sync.error ? `<span class="caregiver-task-empty__error">同步错误：${sync.error}</span>` : ""}
        <button type="button" class="button button--secondary button--small" data-action="refresh-caregiver-tasks">手动刷新</button>
      </section>
    `;
  }

  const itemAction = mode === "embedded" ? "focus-task" : "select-task";
  const classes = ["caregiver-task-timeline"];
  if (mode === "embedded") classes.push("caregiver-task-timeline--embedded");
  const readonly = Boolean(selectors.caregiverTimelineReadonly);
  const taskHasException = hasTaskException(selectors, task);
  const taskHasRecord = hasTaskRecord(selectors, task.id);
  const taskRecordDisabledAttrs = taskHasException ? 'disabled aria-disabled="true" title="已异常上报，不能再记录上报"' : "";
  const taskExceptionDisabledAttrs = taskHasRecord ? 'disabled aria-disabled="true" title="已记录上报，不能再异常上报"' : "";

  if (mode === "embedded" || mode === "fullscreen") {
    return renderEmbeddedTaskTimeline({ selectors, activeTask: task, isFullscreen: mode === "fullscreen", readonly });
  }

  return `
    <section class="${classes.join(" ")}">
      <div class="timeline-layout">
        <div class="timeline-layout__left">
          ${selectors.elderTasks
            .map(
              (item) => `
                <article class="timeline-task-card ${item.id === task.id ? "is-active" : ""}">
                  <button class="timeline-item" data-action="${itemAction}" data-value="${item.id}">
                    <span class="${getTimelineDotClass(item, task.id)}"></span>
                    <strong>${item.schedule}</strong>
                    <small>${item.title}</small>
                  </button>
                  ${
                    readonly
                      ? ""
                      : `<div class="timeline-task-card__actions">
                          ${item.requirePhoto ? '<span class="task-require-photo">需要拍照</span>' : ""}
                          ${renderTaskActionButtons(selectors, item, "full")}
                        </div>`
                  }
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

          ${
            readonly
              ? ""
              : `<div class="timeline-actions">
                  <button
                    class="button button--success button--block"
                    data-action="complete-task"
                    data-value="${task.id}"
                    ${taskHasException ? 'disabled aria-disabled="true" title="已异常上报，不能再标记完成"' : ""}
                  >
                    <span>完成任务</span>
                    <small>${task.requirePhoto ? "需要拍照后完成" : "可直接完成"}</small>
                  </button>

                  <div class="timeline-actions__group">
                    <button class="button button--secondary button--block" data-action="open-task-record" data-value="${task.id}" ${taskRecordDisabledAttrs}>
                      ${renderIcon("note")}
                      <span>记录</span>
                    </button>
                    <button class="button button--secondary button--block" data-action="open-task-exception" data-value="${task.id}" ${taskExceptionDisabledAttrs}>
                      ${renderIcon("warning")}
                      <span>异常</span>
                    </button>
                  </div>
                </div>`
          }
        </div>
      </div>
    </section>
  `;
}

export function renderTaskDetailPage({ selectors }) {
  const elder = selectors.selectedElder;
  const task = getCurrentTask(selectors);

  if (!elder || !task) {
    return `<section class="empty-state">未找到护理任务。</section>`;
  }

  return `
    <section class="timeline-page">
      <div class="timeline-page__header">
        <h1>${elder.name} 的${selectors.caregiverTimelineReadonly ? "护理记录" : "任务执行"}</h1>
      </div>
      ${renderCaregiverTaskTimeline({ selectors })}
    </section>
  `;
}
