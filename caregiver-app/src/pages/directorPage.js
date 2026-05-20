import { renderAvatar, renderIcon } from "../utils/caregiverUi.js";

function renderDirectorHeader(title, date, actionsHtml = "") {
  const assistantButton = `<button type="button" class="director-ai-button" data-action="open-director-assistant">${renderIcon("sparkles")} AI助手</button>`;
  return `
    <header class="director-header">
      <div class="director-header__main">
        <div>
          <h1>${title}</h1>
          <p>${date}</p>
        </div>
        <div class="director-header__actions">${actionsHtml || ""}${assistantButton}</div>
      </div>
    </header>
  `;
}

export function renderDirectorAssistant(selectors) {
  const assistant = selectors.directorAssistant || {};
  if (!assistant.open) {
    return `<button type="button" class="director-ai-fab" data-action="open-director-assistant">${renderIcon("sparkles")}<span>AI</span></button>`;
  }
  const messages = assistant.messages || [];
  return `
    <section class="director-ai-panel" role="dialog" aria-modal="true">
      <button type="button" class="director-ai-panel__backdrop" data-action="close-director-assistant" aria-label="关闭AI助手"></button>
      <div class="director-ai-panel__dialog">
        <div class="director-ai-panel__head">
          <div>
            <strong>院长端 AI 助手</strong>
            <span>Demo：可问操作方法和当前云端数据，写操作只给建议。</span>
          </div>
          <button type="button" class="icon-button" data-action="close-director-assistant">${renderIcon("close")}</button>
        </div>
        <div class="director-ai-panel__messages">
          ${messages
            .map((message, messageIndex) => `
              <article class="director-ai-message director-ai-message--${message.role === "user" ? "user" : "assistant"}">
                <p>${message.text || ""}</p>
                ${
                  message.warnings?.length
                    ? `<div class="director-ai-message__warnings">${message.warnings.map((item) => `<span>${item}</span>`).join("")}</div>`
                    : ""
                }
                ${
                  message.actions?.length
                    ? `<div class="director-ai-actions">
                        ${message.actions
                          .map((item, actionIndex) => `
                            <button type="button" class="button button--small ${item.requiresConfirmation ? "button--secondary" : "button--primary"}" data-action="run-director-assistant-action" data-value="${messageIndex}:${actionIndex}">
                              ${item.label || item.type || "执行建议"}
                            </button>
                          `)
                          .join("")}
                      </div>`
                    : ""
                }
              </article>
            `)
            .join("")}
          ${assistant.loading ? '<article class="director-ai-message director-ai-message--assistant"><p>AI 正在分析当前页面和云端数据...</p></article>' : ""}
        </div>
        <div class="director-ai-panel__input">
          <textarea data-director-assistant-input rows="3" placeholder="例如：李美兰今天还有哪些任务？怎么给老人发布临时任务？">${assistant.input || ""}</textarea>
          <button type="button" class="button button--primary" data-action="send-director-assistant" ${assistant.loading ? "disabled" : ""}>发送</button>
        </div>
      </div>
    </section>
  `;
}

function renderDirectorAnomalyDateFilter(date) {
  return `
    <article class="director-card director-card--dense director-audit-filter">
      <div class="director-card__head director-card__head--compact">
        <div>
          <strong>按日期查看异常</strong>
          <p>异常状态只显示所选日期的任务卡异常和快速异常。</p>
        </div>
      </div>
      <div class="director-audit-filter__group">
        <span>日期</span>
        <div class="director-chip-row director-chip-row--with-input">
          <label class="director-date-field">
            <small>选择日期</small>
            <input type="date" value="${date}" data-director-anomaly-date />
          </label>
        </div>
      </div>
    </article>
  `;
}

function renderStatusPill(text, tone) {
  return `<span class="status-pill status-pill--${tone}">${text}</span>`;
}

function renderDirectorAuditButton(field, item, currentValue) {
  return `
    <button
      class="director-chip ${currentValue === item.key ? "is-active" : ""}"
      data-action="set-director-audit-filter"
      data-field="${field}"
      data-value="${item.key}"
    >
      ${item.label}
    </button>
  `;
}

function renderDirectorAuditFilters(selectors, { showFloor = true } = {}) {
  const filters = selectors.directorAuditFilters;

  return `
    <article class="director-card director-card--dense director-audit-filter">
      <div class="director-card__head director-card__head--compact">
        <div>
          <strong>抽查筛选</strong>
          <p>按楼层、日期和护理项目快速定位，适合迎检抽查。</p>
        </div>
        ${renderStatusPill(`${selectors.directorInboxSummary.total} 条日报`, "success")}
      </div>
      ${
        showFloor
          ? `
            <div class="director-audit-filter__group">
              <span>楼层</span>
              <div class="director-chip-row">
                ${selectors.directorAuditFloorOptions.map((item) => renderDirectorAuditButton("floor", item, filters.floor)).join("")}
              </div>
            </div>
          `
          : ""
      }
      <div class="director-audit-filter__group">
        <span>日期</span>
        <div class="director-chip-row director-chip-row--with-input">
          ${selectors.directorAuditDateOptions.map((item) => renderDirectorAuditButton("date", item, filters.date)).join("")}
          <label class="director-date-field">
            <small>选择日期</small>
            <input type="date" value="${filters.date}" data-director-audit-date />
          </label>
        </div>
      </div>
      <div class="director-audit-filter__group">
        <span>护理项目</span>
        <div class="director-chip-row">
          ${selectors.directorAuditProjectOptions.map((item) => renderDirectorAuditButton("project", item, filters.project)).join("")}
        </div>
      </div>
    </article>
  `;
}

function renderProjectAuditRow(row) {
  return `
    <button class="director-project-row director-project-row--${row.tone}" data-action="select-director-elder" data-value="${row.elderName}">
      <span class="director-project-row__identity">
        ${renderAvatar(row.elderName)}
        <span>
          <strong>${row.floor} · ${row.room}室 · ${row.elderName}</strong>
          <small>${row.taskCount} 项任务 · ${row.evidenceLabel}</small>
        </span>
      </span>
      <span class="director-project-row__status">
        ${renderStatusPill(row.statusLabel, row.tone)}
        ${renderIcon("caretRight")}
      </span>
    </button>
  `;
}

function renderProjectAuditPanel(selectors, { limit = 6 } = {}) {
  const rows = selectors.directorProjectAuditRows.slice(0, limit);
  const summary = selectors.directorProjectAuditSummary;

  return `
    <article class="director-card director-card--dense director-project-audit">
      <div class="director-card__head director-card__head--compact">
        <div>
          <strong>按护理项目查看</strong>
          <p>选项目后查看全层/全院老人状态，可继续下钻看证据。</p>
        </div>
        ${renderStatusPill(`已处理 ${summary.handled}/${summary.total}`, "primary")}
      </div>
      <div class="director-care-record-summary-row">
        ${renderStatusPill(`异常 ${summary.issue}`, summary.issue ? "error" : "success")}
        ${renderStatusPill(`不配合 ${summary.refused}`, summary.refused ? "warning" : "success")}
      </div>
      <div class="director-project-list">
        ${rows.length ? rows.map(renderProjectAuditRow).join("") : '<div class="empty-state empty-state--soft">当前筛选下没有记录。</div>'}
      </div>
    </article>
  `;
}

function renderDirectorFloorCaregiverProgressRow(item) {
  return `
    <article class="director-floor-caregiver-progress-row">
      <div class="director-floor-caregiver-progress-row__name">
        <strong>${item.name}</strong>
        <span>${item.role || "护工"}</span>
      </div>
      <div class="director-floor-caregiver-progress-row__body">
        <div class="director-floor-caregiver-progress-row__meta">
          <span>预期 ${item.expectedRate}</span>
          <span>实际 ${item.actualRate}</span>
        </div>
        <div class="director-dual-progress" aria-label="预期和实际完成率">
          <i class="director-dual-progress__expected" style="width:${item.expectedPercent}%"></i>
          <i class="director-dual-progress__actual" style="width:${item.actualPercent}%"></i>
        </div>
      </div>
    </article>
  `;
}

function renderDirectorFloorCaregiverProgressPanel(selectors) {
  const caregivers = selectors.directorSelectedFloor.caregivers || [];

  return `
    <article class="director-card director-card--dense director-floor-caregiver-progress">
      <div class="director-card__head director-card__head--compact">
        <strong>全层员工执行率</strong>
        ${renderStatusPill(`${caregivers.length} 名护工`, "success")}
      </div>
      <div class="director-floor-caregiver-progress-list">
        ${
          caregivers.length
            ? caregivers.map(renderDirectorFloorCaregiverProgressRow).join("")
            : '<div class="empty-state empty-state--soft">当前楼层暂无护工。</div>'
        }
      </div>
    </article>
  `;
}

function renderDirectorFloorCalendarButton(selectors) {
  const date = selectors.directorAuditFilters?.date || "";

  return `
    <article class="director-card director-card--dense director-floor-calendar-card">
      <label class="director-floor-calendar-button">
        ${renderIcon("calendar")}
        <span>选择日期</span>
        <strong>${date}</strong>
        <input type="date" value="${date}" data-director-audit-date aria-label="选择抽查日期" />
      </label>
    </article>
  `;
}

function renderDirectorFloorElderList(selectors) {
  const elders = selectors.directorSelectedFloor.elders || [];

  return `
    <article class="director-card director-card--dense director-floor-elder-list">
      <div class="director-card__head director-card__head--compact">
        <strong>老人名单</strong>
        ${renderStatusPill(`${elders.length} 位`, "primary")}
      </div>
      <div class="director-project-list">
        ${
          elders.length
            ? elders
                .map(
                  (elder) => `
                    <button class="director-project-row director-project-row--${elder.tone || "warning"}" data-action="select-director-elder" data-value="${elder.name}">
                      <span class="director-project-row__identity">
                        ${renderAvatar(elder.name)}
                        <span>
                          <strong>${elder.name} ${elder.room} 室</strong>
                          <small>${elder.taskCount || 0} 项任务 · 已处理 ${elder.handledCount || 0} · 异常 ${elder.issueCount || 0}</small>
                        </span>
                      </span>
                      <span class="director-project-row__status">
                        ${renderStatusPill(elder.status, elder.tone || "warning")}
                        ${renderIcon("caretRight")}
                      </span>
                    </button>
                  `,
                )
                .join("")
            : '<div class="empty-state empty-state--soft">当前日期没有老人记录。</div>'
        }
      </div>
    </article>
  `;
}

function renderCloudCareRecordItem(record, selectedId) {
  const reportCount = countCheckedReportItems(record);
  const filledTime = record.filledAt || record.submittedAt || record.updatedAt || "";

  return `
    <button
      class="director-cloud-record ${record.id === selectedId ? "is-active" : ""}"
      data-action="load-cloud-care-record"
      data-value="${record.id}"
    >
      <div class="director-cloud-record__head">
        <strong>${record.elderLabel}</strong>
        ${renderStatusPill(record.syncMeta.text, record.syncMeta.tone)}
      </div>
      <div class="director-cloud-record__meta">
        <span>${record.floorLabel || "--"} · ${record.recordDate || "--"} ${record.recordTime || ""}</span>
        <span>${record.caregiverLabel}${filledTime ? ` · ${String(filledTime).slice(11, 16)}` : ""}</span>
      </div>
      <div class="director-cloud-record__chips">
        ${renderStatusPill(`项目 ${reportCount || record.summary?.dailyCount || 0}`, "success")}
        ${renderStatusPill(`服药 ${record.summary?.medicationCount || 0}`, "primary")}
        ${renderStatusPill(`异常 ${record.summary?.issueCount || 0}`, record.summary?.issueCount ? "warning" : "success")}
      </div>
    </button>
  `;
}

function padCalendarNumber(value) {
  return String(value).padStart(2, "0");
}

function parseCalendarDate(dateString) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateString || ""));
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

function getCalendarDateKey(year, month, day) {
  return `${year}-${padCalendarNumber(month)}-${padCalendarNumber(day)}`;
}

function getCalendarMonth(dateString, fallbackDate) {
  const parsed = parseCalendarDate(dateString) || parseCalendarDate(fallbackDate);
  if (parsed) {
    return { year: parsed.year, month: parsed.month };
  }
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

function shiftCalendarMonth(dateString, fallbackDate, offset) {
  const current = getCalendarMonth(dateString, fallbackDate);
  const shifted = new Date(current.year, current.month - 1 + offset, 1);
  return getCalendarDateKey(shifted.getFullYear(), shifted.getMonth() + 1, 1);
}

function formatCalendarDateLabel(dateString) {
  const parsed = parseCalendarDate(dateString);
  if (!parsed) return dateString || "--";
  return `${parsed.year}年${parsed.month}月${parsed.day}日`;
}

function getCareRecordDate(record = {}) {
  return record.recordDate || String(record.submittedAt || record.updatedAt || "").slice(0, 10);
}

function isDailyReportTask(task = {}) {
  const source = String(task.source || task.templateGroup || task.assignmentMode || "");
  return (
    source.includes("daily") ||
    source.includes("report") ||
    source.includes("template") ||
    Boolean(task.templateId)
  );
}

function getTaskItemKeys(task = {}) {
  const rawKeys = [
    task.planItemId,
    task.templateItemId,
    task.itemId,
    task.rawItemId,
    task.templateId,
    String(task.templateId || "").split(":").pop(),
    task.title,
  ];
  return Array.from(new Set(rawKeys.map((item) => String(item || "").trim()).filter(Boolean)));
}

function getTemplateItemKeys(item = {}) {
  const rawKeys = [item.id, item.key, item.itemId, item.rawItemId, item.templateItemId, item.label, item.title];
  return Array.from(new Set(rawKeys.map((value) => String(value || "").trim()).filter(Boolean)));
}

function isReportTaskCompleted(task = {}) {
  return task.status === "completed" || Boolean(task.completedAt);
}

function getReportTemplateItemFrequencyDays(item = {}) {
  const frequencyDays = Math.max(1, Number(item.frequencyDays || item.frequency || 1));
  return Number.isFinite(frequencyDays) ? frequencyDays : 1;
}

function isReportTemplateItemDue(item = {}, dateString = "") {
  const frequencyDays = getReportTemplateItemFrequencyDays(item);
  if (frequencyDays <= 1) return true;
  const day = Number(String(dateString || "").slice(-2)) || 1;
  return (day - 1) % frequencyDays === 0;
}

function getReportTemplateItemPeriods(item = {}, daysInMonth = 31) {
  const frequencyDays = getReportTemplateItemFrequencyDays(item);
  const safeDays = Math.max(1, Number(daysInMonth) || 31);
  const periods = [];

  for (let start = 1; start <= safeDays; start += frequencyDays) {
    const span = Math.min(frequencyDays, safeDays - start + 1);
    periods.push({
      start,
      end: start + span - 1,
      span,
      days: Array.from({ length: span }, (_, index) => start + index),
    });
  }

  return periods;
}

function getTaskWindowStartMinutes(task = {}) {
  const value = String(task.window || task.schedule || task.timeWindow || "");
  const match = /(\d{1,2}):(\d{2})/.exec(value);
  if (!match) return 0;
  return (Number(match[1]) || 0) * 60 + (Number(match[2]) || 0);
}

function isReportTaskNotDue(task = {}, dateString = "", nowDate = "", nowMinutes = 24 * 60) {
  if (!nowDate || dateString < nowDate) return false;
  if (dateString > nowDate) return true;
  return getTaskWindowStartMinutes(task) > nowMinutes;
}

function getMonthPrefixFromDate(dateString = "") {
  const parsed = parseCalendarDate(dateString);
  if (!parsed) return "";
  return `${parsed.year}-${padCalendarNumber(parsed.month)}`;
}

function getCurrentTimeMinutes() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function getElderReportTemplate(elder = {}, state = {}) {
  const templates = state.dailyReportTemplates || {};
  return templates[elder.reportTemplateId] || Object.values(templates).find((tpl) => tpl.id === elder.reportTemplateId) || null;
}

function getTemplateItems(template = {}) {
  return (template.sections || []).flatMap((section) =>
    (section.items || []).map((item) => ({
      ...item,
      sectionTitle: section.title || "",
    })),
  );
}

function buildDailyReportMetrics(dayTasks = [], dateString = "", today = "", nowMinutes = 24 * 60) {
  const reportGroups = new Map();

  (dayTasks || []).forEach((task) => {
    const elderKey = task.elderId || task.elderName || "";
    if (!elderKey) return;
    if (!reportGroups.has(elderKey)) reportGroups.set(elderKey, []);
    reportGroups.get(elderKey).push(task);
  });

  const reportRows = Array.from(reportGroups.entries()).map(([elderKey, tasks]) => {
    const dueTasks = tasks.filter((task) => !isReportTaskNotDue(task, dateString, today, nowMinutes));
    const completedTaskCount = dueTasks.filter(isReportTaskCompleted).length;
    const pendingTaskCount = Math.max(0, dueTasks.length - completedTaskCount);
    return {
      elderKey,
      tasks,
      dueTasks,
      taskCount: dueTasks.length,
      completedTaskCount,
      pendingTaskCount,
      isCompleted: tasks.length > 0 && dueTasks.length === tasks.length && pendingTaskCount === 0,
    };
  });

  return {
    reportRows,
    reportCount: reportRows.length,
    completedReportCount: reportRows.filter((row) => row.isCompleted).length,
    pendingReportCount: reportRows.filter((row) => !row.isCompleted).length,
    taskCount: reportRows.reduce((sum, row) => sum + row.taskCount, 0),
    completedTaskCount: reportRows.reduce((sum, row) => sum + row.completedTaskCount, 0),
    pendingTaskCount: reportRows.reduce((sum, row) => sum + row.pendingTaskCount, 0),
  };
}

function buildMonthlyReportIndex(state, selectors) {
  const current = getCalendarMonth(state.ui.directorAuditDate, state.director.date);
  const monthPrefix = `${current.year}-${padCalendarNumber(current.month)}`;
  const today = state.director.date || "";
  const nowMinutes = getCurrentTimeMinutes();
  const daysInMonth = new Date(current.year, current.month, 0).getDate();
  const tasks = (state.tasks || []).filter((task) => String(task.recordDate || "").startsWith(monthPrefix) && isDailyReportTask(task));
  const tasksByDate = new Map();
  const elders = [...(state.elders || [])].sort((left, right) => {
    if (Number(left.floor) !== Number(right.floor)) return Number(left.floor) - Number(right.floor);
    return String(left.room || "").localeCompare(String(right.room || ""), "zh-CN", { numeric: true });
  });

  tasks.forEach((task) => {
    const date = task.recordDate || "";
    if (!date) return;
    if (!tasksByDate.has(date)) tasksByDate.set(date, []);
    tasksByDate.get(date).push(task);
  });

  const daySummaries = new Map();
  Array.from({ length: daysInMonth }, (_, index) => index + 1).forEach((day) => {
    const date = getCalendarDateKey(current.year, current.month, day);
    const dayTasks = tasksByDate.get(date) || [];
    const metrics = buildDailyReportMetrics(dayTasks, date, today, nowMinutes);
    daySummaries.set(date, {
      date,
      day,
      isFuture: Boolean(today && date > today),
      total: metrics.reportCount,
      completed: metrics.completedReportCount,
      pending: metrics.pendingReportCount,
      taskCount: metrics.taskCount,
      completedTaskCount: metrics.completedTaskCount,
      pendingTaskCount: metrics.pendingTaskCount,
      tasks: dayTasks,
    });
  });

  const elderSheets = elders.map((elder) => {
    const template = getElderReportTemplate(elder, state) || selectors.dailyReportTemplate || {};
    const templateItems = getTemplateItems(template);
    const elderTasks = tasks.filter((task) => task.elderId === elder.id);
    const tasksByDateAndItem = new Map();
    elderTasks.forEach((task) => {
      const date = task.recordDate || "";
      if (!date) return;
      getTaskItemKeys(task).forEach((key) => {
        tasksByDateAndItem.set(`${date}|${key}`, task);
      });
    });
    return {
      elder,
      template,
      templateItems,
      tasks: elderTasks,
      tasksByDateAndItem,
    };
  });

  return {
    year: current.year,
    month: current.month,
    monthPrefix,
    institutionName: state.institution?.name || "养老院",
    caregivers: state.caregivers || [],
    today,
    nowMinutes,
    daysInMonth,
    tasks,
    tasksByDate,
    daySummaries,
    elderSheets,
  };
}

function getResponsibleCaregiverForElder(elder, state) {
  const task =
    (state.tasks || []).find((item) => item.elderId === elder.id && item.caregiverId) ||
    (state.tasks || []).find((item) => item.elderId === elder.id && item.defaultCaregiverId);
  const caregiverId = task?.caregiverId || task?.defaultCaregiverId || "";
  const caregiver =
    (state.caregivers || []).find((item) => item.id === caregiverId) ||
    (state.caregivers || []).find((item) => Number(item.floor) === Number(elder.floor));

  return caregiver
    ? {
        id: caregiver.id,
        name: caregiver.name,
        role: caregiver.role || "护工",
      }
    : {
        id: "",
        name: "未分配护工",
        role: "",
      };
}

function buildInboxDaySummary(dateString, state, reports) {
  const index = buildMonthlyReportIndex(state, {});
  const dayTasks = (state.tasks || []).filter((task) => task.recordDate === dateString && isDailyReportTask(task));
  const today = state.director.date || "";
  const nowMinutes = getCurrentTimeMinutes();
  const metrics = buildDailyReportMetrics(dayTasks, dateString, today, nowMinutes);
  const elderRows = (state.elders || [])
    .map((elder) => {
      const allTasks = dayTasks.filter((task) => task.elderId === elder.id);
      const tasks = allTasks.filter((task) => !isReportTaskNotDue(task, dateString, today, nowMinutes));
      const completed = tasks.filter(isReportTaskCompleted).length;
      return {
        ...elder,
        caregiver: getResponsibleCaregiverForElder(elder, state),
        reportTaskCount: allTasks.length,
        taskCount: tasks.length,
        completedCount: completed,
        pendingCount: Math.max(0, tasks.length - completed),
        reportCompleted: allTasks.length > 0 && tasks.length === allTasks.length && tasks.length === completed,
      };
    })
    .filter((elder) => elder.reportTaskCount > 0);

  return {
    date: dateString,
    isFuture: Boolean(today && dateString > today),
    expectedCount: metrics.reportCount,
    receivedCount: metrics.completedReportCount,
    missingCount: metrics.pendingReportCount,
    missing: elderRows.filter((elder) => !elder.reportCompleted),
    elderRows,
    reportCount: metrics.reportCount,
    completedReportCount: metrics.completedReportCount,
    pendingReportCount: metrics.pendingReportCount,
    taskCount: metrics.taskCount,
    completedCount: metrics.completedReportCount,
    pendingCount: metrics.pendingReportCount,
    completedTaskCount: metrics.completedTaskCount,
    pendingTaskCount: metrics.pendingTaskCount,
    monthIndex: index,
  };
}

function getInboxDayReports(dateString, reports = []) {
  const receivedByElder = new Map();

  (reports || []).forEach((item) => {
    if (getCareRecordDate(item) !== dateString) return;
    const key = item.elderId || item.id;
    if (!key || receivedByElder.has(key)) return;
    receivedByElder.set(key, item);
  });

  return Array.from(receivedByElder.values()).sort((left, right) => {
    const leftFloor = Number.parseInt(left.floorLabel || left.floor || "0", 10) || 0;
    const rightFloor = Number.parseInt(right.floorLabel || right.floor || "0", 10) || 0;
    if (leftFloor !== rightFloor) return leftFloor - rightFloor;
    const leftRoom = Number.parseInt(left.room || "0", 10) || 0;
    const rightRoom = Number.parseInt(right.room || "0", 10) || 0;
    return leftRoom - rightRoom;
  });
}

function getElderMonthReportMap(elderId, year, month, targetDay, allReports) {
  const prefix = `${year}-${String(month).padStart(2, "0")}`;
  const dayMap = new Map();

  (allReports || []).forEach((item) => {
    if (item.elderId !== elderId && (item.elderId || item.id) !== elderId) return;
    const dateStr = getCareRecordDate(item);
    if (!dateStr || !dateStr.startsWith(prefix)) return;
    const day = parseInt(dateStr.slice(-2), 10);
    if (!day || day > targetDay || dayMap.has(day)) return;
    dayMap.set(day, item);
  });

  return dayMap;
}

function getInboxDayTone(summary) {
  if (summary.isFuture) return "future";
  if (!summary.expectedCount) return "empty";
  return "partial";
}

function renderInboxCalendarDay(dateString, dayNumber, state, reports) {
  const summary = buildInboxDaySummary(dateString, state, reports);
  const tone = getInboxDayTone(summary);
  const selected = state.ui.directorInboxSelectedDate === dateString || state.ui.directorAuditDate === dateString;

  return `
    <button
      class="director-inbox-day director-inbox-day--${tone} ${selected ? "is-selected" : ""}"
      data-action="open-director-inbox-day"
      data-value="${dateString}"
    >
      <strong>${dayNumber}</strong>
    </button>
  `;
}

function renderDirectorInboxCalendar(state, selectors) {
  const current = getCalendarMonth(state.ui.directorAuditDate, state.director.date);
  const monthIndex = buildMonthlyReportIndex(state, selectors);
  const firstDay = new Date(current.year, current.month - 1, 1);
  const daysInMonth = new Date(current.year, current.month, 0).getDate();
  const leadingBlankCount = firstDay.getDay();
  const monthReportCount = Array.from(monthIndex.daySummaries.values()).reduce((sum, item) => sum + item.total, 0);
  const previousMonth = shiftCalendarMonth(state.ui.directorAuditDate, state.director.date, -1);
  const nextMonth = shiftCalendarMonth(state.ui.directorAuditDate, state.director.date, 1);
  const fetchedAt = selectors.cloudStatus?.fetchedAt || "";
  const fetchedAtLabel = fetchedAt ? `上次刷新 ${fetchedAt.slice(11, 16)} · 自动60秒` : "尚未刷新 · 自动60秒";
  const calendarCells = [
    ...Array.from({ length: leadingBlankCount }, (_, index) => `<span class="director-inbox-day director-inbox-day--blank" aria-hidden="true" data-blank="${index}"></span>`),
    ...Array.from({ length: daysInMonth }, (_, index) => {
      const day = index + 1;
      return renderInboxCalendarDay(getCalendarDateKey(current.year, current.month, day), day, state, []);
    }),
  ];

  return `
    <article class="director-card director-card--dense director-inbox-calendar-card">
      <div class="director-card__head director-card__head--compact">
        <div>
          <strong>日报收件日历</strong>
        </div>
        <div class="director-inline-actions">
          <span class="director-inbox-refresh-time">${fetchedAtLabel}</span>
          <button class="director-inline-link" data-action="refresh-cloud-care-records">
            ${selectors.cloudStatus.loading ? "刷新中" : "手动刷新"}
          </button>
          ${renderStatusPill(`本月日报 ${monthReportCount} 份`, "success")}
        </div>
      </div>
      <div class="director-inbox-calendar__toolbar">
        <button class="director-icon-button" data-action="set-director-inbox-month" data-value="${previousMonth}" aria-label="上个月">
          ${renderIcon("back")}
        </button>
        <strong>${current.year}年${current.month}月</strong>
        <button class="director-icon-button director-icon-button--next" data-action="set-director-inbox-month" data-value="${nextMonth}" aria-label="下个月">
          ${renderIcon("caretRight")}
        </button>
      </div>
      <div class="director-inbox-weekdays">
        ${["日", "一", "二", "三", "四", "五", "六"].map((item) => `<span>${item}</span>`).join("")}
      </div>
      <div class="director-inbox-calendar">
        ${calendarCells.join("")}
      </div>
      <div class="director-inbox-calendar__legend">
        <span><i class="is-partial"></i>已查询到日报任务</span>
        <span><i class="is-missing"></i>暂无日报任务</span>
      </div>
      ${
        selectors.cloudStatus.error
          ? `<div class="care-report-syncbar care-report-syncbar--error">${selectors.cloudStatus.error}</div>`
          : ""
      }
    </article>
  `;
}

function renderDirectorInboxDayDialog(state, selectors) {
  const selectedDate = state.ui.directorInboxSelectedDate;
  if (!selectedDate) return "";

  const summary = buildInboxDaySummary(selectedDate, state, selectors.directorCloudReports || []);
  const statusTone = summary.reportCount ? "success" : "warning";
  const statusLabel = summary.reportCount ? `已查询 ${summary.reportCount} 份日报` : "暂无日报任务";

  return `
    <section class="director-inbox-day-modal">
      <button class="director-care-record-preview__backdrop" data-action="close-director-inbox-day" aria-label="关闭日报收件详情"></button>
      <div class="director-inbox-day-modal__dialog">
        <div class="director-card__head director-card__head--compact">
          <div>
            <strong>${formatCalendarDateLabel(selectedDate)}</strong>
          </div>
          <div class="director-inbox-day-modal__head-actions">
            ${renderStatusPill(statusLabel, statusTone)}
            <button class="director-inline-link" data-action="close-director-inbox-day">关闭</button>
          </div>
        </div>

        <div class="director-inbox-missing-list">
          <strong>日报查询</strong>
          <div class="empty-state empty-state--soft">
            ${
              summary.reportCount
                ? `云端当天共有 ${summary.reportCount} 份老人日报任务记录。导出日报时会按月读取任务卡状态生成勾叉表。`
                : "云端当天暂无实例模板生成的日报任务记录。可以先手动刷新云端。"
            }
          </div>
        </div>

        <div class="director-inbox-day-modal__actions">
          <button class="button button--secondary" data-action="close-director-inbox-day">关闭</button>
          <button class="button button--primary" data-action="refresh-cloud-care-records">刷新云端</button>
          <button
            class="button button--primary"
            data-action="open-director-inbox-export"
            data-value="${selectedDate}"
          >导出日报</button>
        </div>
      </div>
    </section>
  `;
}

function renderDirectorInboxExportDialog(state, selectors) {
  const exportDate = state.ui.directorInboxExportDate;
  if (!exportDate) return "";

  const monthIndex = buildMonthlyReportIndex(state, selectors);
  const canExport = monthIndex.elderSheets.some((item) => item.templateItems.length);

  return `
    <section class="director-inbox-export-modal">
      <button class="director-care-record-preview__backdrop" data-action="close-director-inbox-export" aria-label="关闭日报导出"></button>
      <div class="director-inbox-export-modal__dialog">
        <div class="director-card__head director-card__head--compact">
          <div>
            <strong>导出${getMonthPrefixFromDate(exportDate)}月度日报</strong>
          </div>
          ${renderStatusPill(`${monthIndex.elderSheets.length} 位老人`, monthIndex.elderSheets.length ? "success" : "warning")}
        </div>
        <div class="director-inbox-export-modal__body">
          <span>根据老人实例模板和本月云端任务卡完成情况生成 A4 护理记录表。</span>
          ${
            canExport
              ? `<strong>已完成任务卡显示对号，未完成显示错号，未来或未到时间任务留空。</strong>`
              : `<strong>当前月份没有可导出的实例模板任务，请先手动刷新云端。</strong>`
          }
        </div>
        <div class="director-inbox-export-modal__actions">
          <button class="button button--secondary" data-action="close-director-inbox-export">取消</button>
          <button
            class="button button--secondary"
            data-action="export-director-inbox-day"
            data-field="image"
            data-value="${exportDate}"
            ${canExport ? "" : "disabled"}
          >导出图片</button>
          <button
            class="button button--primary"
            data-action="export-director-inbox-day"
            data-field="print"
            data-value="${exportDate}"
            ${canExport ? "" : "disabled"}
          >导出PDF</button>
        </div>
      </div>
    </section>
  `;
}

function renderMonthlyCompilation(batchDate, state, selectors) {
  if (!batchDate) return "";
  const index = buildMonthlyReportIndex(state, selectors);
  const monthLabel = `${index.year}年${index.month}月`;
  return index.elderSheets
    .filter((sheet) => sheet.templateItems.length)
    .map((sheet) => renderMonthlyCareSheetFromTasks(sheet, index, monthLabel))
    .join("");
}

function renderDirectorCareRecordPreview(state, selectors) {
  if (!state.ui.directorCareRecordPreviewOpen) return "";

  const batchDate = state.ui.directorCareRecordBatchDate;
  const monthlyContent = batchDate ? renderMonthlyCompilation(batchDate, state, selectors) : "";
  const useMonthly = Boolean(monthlyContent);
  const records = batchDate
    ? getInboxDayReports(batchDate, selectors.directorCloudReports || [])
    : [selectors.directorCareRecordDraft].filter(Boolean);
  const canExport = useMonthly || records.length > 0;

  const title = useMonthly
    ? `${formatCalendarDateLabel(batchDate)} 月度汇总导出`
    : batchDate
      ? `${formatCalendarDateLabel(batchDate)}日报导出`
      : "监管归档表（A4）预览";

  const pillLabel = useMonthly
    ? `${buildMonthlyReportIndex(state, selectors).elderSheets.filter((sheet) => sheet.templateItems.length).length} 位老人`
    : `${records.length} 份`;

  return `
    <section class="director-care-record-preview">
      <button class="director-care-record-preview__backdrop" data-action="close-care-record-preview" aria-label="关闭监管归档表预览"></button>
      <div class="director-care-record-preview__dialog">
        <div class="director-care-record-preview__topbar">
          <strong>${title}</strong>
          ${renderStatusPill(pillLabel, "success")}
        </div>
        <div class="director-care-record-preview__body">
          ${
            useMonthly
              ? `<div class="care-record-export-batch" data-care-record-export-batch>${monthlyContent}</div>`
              : records.length
                ? `<div class="care-record-export-batch" data-care-record-export-batch>${records.map(renderCareRecordSheet).join("")}</div>`
                : `<div class="empty-state empty-state--soft">云端没有可导出的日报。</div>`
          }
        </div>
        <div class="director-care-record-preview__actions">
          <button class="button button--secondary" data-action="close-care-record-preview">关闭</button>
          <button class="button button--secondary" data-action="export-care-record-image" ${canExport ? "" : "disabled"}>导出图片</button>
          <button class="button button--primary" data-action="print-care-record" ${canExport ? "" : "disabled"}>导出PDF</button>
        </div>
      </div>
    </section>
  `;
}

function renderCoreEntry(route, icon, title, summary, meta, tone = "primary") {
  return `
    <button class="director-core-entry director-core-entry--${tone}" data-action="navigate" data-route="${route}">
      <span class="director-core-entry__icon">${renderIcon(icon)}</span>
      <span class="director-core-entry__body">
        <strong>${title}</strong>
        <small>${summary}</small>
      </span>
      <span class="director-core-entry__meta">
        <em>${meta}</em>
        ${renderIcon("caretRight")}
      </span>
    </button>
  `;
}

function renderInfoStat(label, value, tone = "primary") {
  return `
    <article class="director-kpi-card director-kpi-card--${tone}">
      <p>${label}</p>
      <strong>${value}</strong>
    </article>
  `;
}

function renderDispatchFilterStat(label, value, tone, filter, activeFilter) {
  return `
    <button class="director-kpi-card director-kpi-card--${tone} director-kpi-card--button ${activeFilter === filter ? "is-active" : ""}" data-action="set-director-dispatch-filter" data-value="${filter}">
      <p>${label}</p>
      <strong>${value}</strong>
    </button>
  `;
}

function renderDirectorDispatchDraftDialog(draft, selectors) {
  if (!draft) return "";
  const isCreate = draft.mode === "temporary" || !draft.taskId;
  const statusLabel = isCreate
    ? "临时任务"
    : draft.status === "risk" || draft.status === "refused"
      ? "紧急"
      : draft.caregiverId
        ? "已发布"
        : "待分配";
  const statusTone = isCreate
    ? "warning"
    : draft.status === "risk" || draft.status === "refused"
      ? "error"
      : draft.caregiverId
        ? "success"
        : "warning";
  const caregiverOptions = selectors.caregiverLoads.map((item) => ({
    value: item.id,
    label: `${item.name} · ${item.floor}F · 待办${item.pendingCount}`,
  }));
  const elderPicker = selectors.directorDispatchElderPicker || {
    floorOptions: [],
    roomOptions: [],
    elderOptions: [],
    searchResults: [],
  };
  const timeMode = draft.timeMode === "range" ? "range" : "now";
  const searchResults = elderPicker.searchResults || [];

  return `
    <div class="director-dialog-backdrop" data-action="close-director-dispatch-draft"></div>
    <section class="director-dialog-shell director-dialog-shell--template">
      <article class="director-dialog-card director-dialog-card--template">
        <div class="director-card__head director-card__head--compact">
          <div>
            <strong>${isCreate ? "发布临时任务" : "修改发布任务"}</strong>
          </div>
          ${renderStatusPill(statusLabel, statusTone)}
        </div>

        <form class="director-editor-form" data-director-dispatch-draft-form>
          <div class="director-form-grid">
            <label class="director-field director-field--temporary-title">
              <span>任务名称</span>
              <input name="title" type="text" value="${draft.title || ""}" />
            </label>
            ${
              isCreate
                ? `
                  <label class="director-field director-field--temporary-elder">
                    <span>相关老人</span>
                    <div class="director-temporary-elder-picker">
                      <select name="floor" class="director-select" data-director-temporary-floor>
                        ${renderSelectOptions(elderPicker.floorOptions || [], String(draft.floor || elderPicker.floor || ""))}
                      </select>
                      <select name="room" class="director-select" data-director-temporary-room>
                        ${renderSelectOptions(elderPicker.roomOptions || [], String(draft.room || elderPicker.room || ""))}
                      </select>
                      <select name="elderId" class="director-select" data-director-temporary-elder>
                        ${renderSelectOptions(elderPicker.elderOptions || [], draft.elderId || "")}
                      </select>
                      <button type="button" class="director-temporary-search-button" data-action="toggle-director-temporary-elder-search" aria-label="按姓名搜索老人">
                        ${renderIcon("search")}
                      </button>
                    </div>
                  </label>
                `
                : `
            <label class="director-field">
              <span>执行时间</span>
              <input name="schedule" type="text" value="${draft.schedule || ""}" />
            </label>
                `
            }
          </div>

          ${
            isCreate && draft.elderSearchOpen
              ? `
                <div class="director-temporary-search-panel">
                  <input
                    name="elderSearch"
                    type="text"
                    value="${draft.elderSearch || ""}"
                    placeholder="输入老人姓名"
                    data-director-temporary-elder-search
                  />
                  <div class="director-temporary-search-results">
                    ${
                      searchResults.length
                        ? searchResults
                            .map(
                              (elder) => `
                                <button type="button" data-action="select-director-temporary-elder" data-value="${elder.id}">
                                  ${elder.floor}F · ${elder.room}室 · ${elder.name}
                                </button>
                              `,
                            )
                            .join("")
                        : '<span>输入姓名后显示匹配老人</span>'
                    }
                  </div>
                </div>
              `
              : ""
          }

          ${
            isCreate
              ? `
                <div class="director-temporary-time">
                  <div class="director-temporary-time__head">
                    <strong>任务时间</strong>
                    <small>${timeMode === "now" ? "发布后立即进入目标护工时间轴" : "按指定时间段进入目标护工时间轴"}</small>
                  </div>
                  <div class="director-temporary-time__options">
                    <label class="director-temporary-time-card ${timeMode === "now" ? "is-active" : ""}">
                      <input type="radio" name="timeMode" value="now" ${timeMode === "now" ? "checked" : ""} data-director-temporary-time-mode />
                      <span>立即执行</span>
                      <small>现在提醒</small>
                    </label>
                    <label class="director-temporary-time-card ${timeMode === "range" ? "is-active" : ""}">
                      <input type="radio" name="timeMode" value="range" ${timeMode === "range" ? "checked" : ""} data-director-temporary-time-mode />
                      <span>选择时间段</span>
                      <small>预约提醒</small>
                    </label>
                  </div>
                  ${
                    timeMode === "range"
                      ? `
                        <div class="director-temporary-time__range">
                          <label class="director-field">
                            <span>开始</span>
                            <input name="startTime" type="time" value="${draft.startTime || ""}" />
                          </label>
                          <label class="director-field">
                            <span>结束</span>
                            <input name="endTime" type="time" value="${draft.endTime || ""}" />
                          </label>
                        </div>
                      `
                      : ""
                  }
                </div>
              `
              : `
          <div class="director-form-grid">
            <label class="director-field">
              <span>任务状态</span>
              <select name="status" class="director-select">
                ${renderSelectOptions(
                  [
                    { value: "pending", label: "待处理" },
                    { value: "risk", label: "紧急" },
                    { value: "refused", label: "不配合" },
                  ],
                  draft.status || "pending",
                )}
              </select>
            </label>
            <label class="director-field">
              <span>留痕方式</span>
              <select name="recordType" class="director-select">
                ${renderSelectOptions(
                  [
                    { value: "text", label: "文字记录" },
                    { value: "photo", label: "拍照留痕" },
                  ],
                  draft.requirePhoto ? "photo" : "text",
                )}
              </select>
            </label>
          </div>
              `
          }

          <label class="director-field director-field--full">
            <span>目标护工</span>
            <select name="caregiverId" class="director-select">
              ${renderSelectOptions(
                isCreate ? caregiverOptions : [{ value: "", label: "暂不分配" }, ...caregiverOptions],
                draft.caregiverId || "",
              )}
            </select>
          </label>

          <label class="director-field director-field--full">
            <span>任务描述</span>
            <textarea name="${isCreate ? "description" : "note"}" rows="3">${draft.description || draft.note || ""}</textarea>
          </label>
        </form>

        <div class="director-editor-actions">
          <button class="button button--muted" data-action="close-director-dispatch-draft">取消</button>
          <button class="button button--primary" data-action="save-director-dispatch-draft">${isCreate ? "发布任务" : "保存调整"}</button>
        </div>
      </article>
    </section>
  `;
}

function renderDirectorPlanNoteDraftDialog(draft) {
  if (!draft) return "";

  return `
    <div class="director-dialog-backdrop" data-action="close-director-plan-note-draft"></div>
    <section class="director-dialog-shell director-dialog-shell--template">
      <article class="director-dialog-card director-dialog-card--template director-plan-note-edit-dialog">
        <div class="director-card__head director-card__head--compact">
          <div>
            <strong>编辑建议与注意事项</strong>
          </div>
          ${renderStatusPill("同步护工端", "warning")}
        </div>
        <label class="director-field director-field--full">
          <span>内容</span>
          <textarea rows="6" data-director-plan-note-input>${draft.note || ""}</textarea>
        </label>
        <div class="director-editor-actions">
          <button class="button button--muted" data-action="close-director-plan-note-draft">取消</button>
          <button class="button button--primary" data-action="save-director-plan-note-draft">保存</button>
        </div>
      </article>
    </section>
  `;
}

function getDirectorTemporaryStatusText(task) {
  if (task.status === "completed") return "已完成";
  if (task.status === "risk") return "异常";
  if (task.status === "refused") return "不配合";
  return task.caregiverId ? "待处理" : "未分配";
}

function renderDirectorPlanTemporaryDialog(plan) {
  if (!plan) return "";
  const tasks = plan.temporaryTasks || [];

  return `
    <div class="director-dialog-backdrop" data-action="close-director-plan-temporary-dialog"></div>
    <section class="director-dialog-shell director-dialog-shell--template">
      <article class="director-dialog-card director-dialog-card--template director-plan-temporary-dialog">
        <div class="director-card__head director-card__head--compact">
          <div>
            <strong>${plan.elder?.room || "--"}室 · ${plan.elder?.name || "老人"}临时任务</strong>
          </div>
          ${renderStatusPill(`${tasks.length}项`, "warning")}
        </div>
        <div class="director-plan-temporary-dialog-list">
          ${
            tasks.length
              ? tasks
                  .map((task) => {
                    const caregiverName = task.caregiver?.name || task.assignedCaregiver?.name || task.caregiverName || "未分配";
                    return `
                      <article class="director-plan-temporary-item">
                        <div>
                          <strong>${task.title || "临时任务"}</strong>
                          <small>${task.schedule || "立即"} · 分配给 ${caregiverName}</small>
                        </div>
                        ${renderStatusPill(getDirectorTemporaryStatusText(task), task.status === "completed" ? "success" : task.status === "risk" || task.status === "refused" ? "error" : "warning")}
                      </article>
                    `;
                  })
                  .join("")
              : '<div class="empty-state empty-state--soft">这位老人今天没有临时任务。</div>'
          }
        </div>
        <div class="director-editor-actions">
          <button class="button button--primary" data-action="close-director-plan-temporary-dialog">知道了</button>
        </div>
      </article>
    </section>
  `;
}

function parsePercent(value) {
  const numeric = Number(String(value || "0").replace("%", ""));
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(100, numeric));
}

function renderProgressMeter(value, tone = "success") {
  const percent = parsePercent(value);
  return `
    <div class="director-meter director-meter--${tone}" aria-hidden="true">
      <span style="width: ${percent}%;"></span>
    </div>
  `;
}

function renderDirectorTaskOverviewBars(overview) {
  const expected = overview?.expectedPercent || 0;
  const actual = overview?.actualPercent || 0;
  const temporary = overview?.temporaryPercent || 0;

  return `
    <div class="director-task-overview-bars">
      <div class="director-task-overview-bars__head">
        <span>预期 ${overview.expectedDue}/${overview.dailyTotal}</span>
        <span>实际 ${overview.actualHandled}/${overview.dailyTotal}</span>
      </div>
      <div class="director-progress-stack" aria-hidden="true">
        <span class="director-progress-stack__expected" style="width: ${expected}%;"></span>
        <span class="director-progress-stack__actual" style="width: ${actual}%;"></span>
      </div>
      <div class="director-task-overview-legend">
        <span><i class="is-expected"></i>预期进度</span>
        <span><i class="is-actual"></i>实际完成</span>
      </div>
      <div class="director-task-overview-bars__head">
        <span>临时 ${overview.temporaryHandled}/${overview.temporaryTotal}</span>
      </div>
      <div class="director-progress-stack" aria-hidden="true">
        <span class="director-progress-stack__temporary" style="width: ${temporary}%;"></span>
      </div>
      <div class="director-task-overview-legend">
        <span><i class="is-temporary"></i>临时任务</span>
      </div>
    </div>
  `;
}

function renderCommandMetric(label, value, helper, tone = "primary") {
  return `
    <article class="director-command-metric director-command-metric--${tone}">
      <p>${label}</p>
      <strong>${value}</strong>
      <small>${helper}</small>
    </article>
  `;
}

function renderDirectorStatTaskLine(task, emptyText) {
  if (!task) return `<li>${emptyText}</li>`;
  const elder = task.elder ? `${task.elder.room}室 · ${task.elder.name}` : "未绑定老人";
  return `<li><strong>${task.schedule} ${task.title}</strong><span>${elder}</span></li>`;
}

function formatShortDateTimeLabel(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^\d{1,2}:\d{2}/.test(text)) return text.slice(0, 5);

  const parsed = new Date(text.includes("T") ? text : text.replace(" ", "T"));
  if (!Number.isNaN(parsed.getTime())) {
    const pad = (number) => String(number).padStart(2, "0");
    return `${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())} ${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
  }

  const compactMatch = text.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/);
  if (compactMatch) return `${compactMatch[1].slice(5)} ${compactMatch[2]}`;
  return text.length > 16 ? text.slice(0, 16) : text;
}

function formatDirectorExceptionMeta(report) {
  const reportedAt = formatShortDateTimeLabel(report.reportedAt);
  const schedule = formatShortDateTimeLabel(report.schedule);
  if (reportedAt && schedule && reportedAt !== schedule) return `${reportedAt} · ${schedule}`;
  return reportedAt || schedule || "";
}

function renderDirectorCaregiverStatCard(item, selectedId) {
  const selected = item.id === selectedId;

  return `
    <button
      type="button"
      class="director-caregiver-stat-card director-caregiver-stat-card--${item.tone} ${selected ? "is-active" : ""}"
      data-action="select-director-stat-caregiver"
      data-value="${item.id}"
    >
      <span class="director-caregiver-stat-card__dot"></span>
      <span class="director-caregiver-stat-card__main">
        <strong>${item.name}</strong>
        <small>${item.role} · ${item.floor}F · ${item.progressRate}</small>
      </span>
      ${renderStatusPill(item.statusLabel, item.tone)}
    </button>
  `;
}

function renderDirectorCaregiverStatDetail(item) {
  if (!item) return "";

  return `
    <article class="director-card director-card--dense director-caregiver-stat-detail">
      <div class="director-card__head director-card__head--compact">
        <div>
          <strong>${item.name}</strong>
        </div>
        ${renderStatusPill(item.statusLabel, item.tone)}
      </div>
      <div class="director-stat-task-columns">
        <section>
          <h3>未按时完成</h3>
          <ul>
            ${
              item.overdueTasks.length
                ? item.overdueTasks.map((task) => renderDirectorStatTaskLine(task, "暂无超时任务")).join("")
                : renderDirectorStatTaskLine(null, "暂无超时任务")
            }
          </ul>
        </section>
        <section>
          <h3>当前任务</h3>
          <ul>
            ${renderDirectorStatTaskLine(item.currentTasks[0] || item.nextTask, "当前没有待处理任务")}
          </ul>
        </section>
      </div>
    </article>
  `;
}

function renderDirectorExceptionReportCard(report) {
  const timeMeta = formatDirectorExceptionMeta(report);
  return `
    <article class="director-card director-card--dense director-exception-report">
      <div class="director-card__head director-card__head--compact">
        <div>
          <strong>${report.room}室 · ${report.elderName} · ${report.title}</strong>
          <div class="director-exception-report__meta">
            <span>负责护工：${report.caregiverName}</span>
            ${timeMeta ? `<span>${timeMeta}</span>` : ""}
          </div>
        </div>
        ${renderStatusPill(report.statusLabel, "error")}
      </div>
      <p class="director-exception-report__note">${report.note}</p>
      <div class="director-exception-report__photos">
        ${
          report.evidence.length
            ? report.evidence
                .map((item) =>
                  item.dataUrl
                    ? `<img src="${item.dataUrl}" alt="${item.name || "异常照片"}" />`
                    : `<span>${report.evidencePending ? "照片加载中..." : "照片未同步，请重新上传"}</span>`,
                )
                .join("")
            : `<span>${report.evidencePending ? "照片加载中..." : "暂无照片"}</span>`
        }
      </div>
    </article>
  `;
}

export function renderDirectorTaskDetailDialog(task, state = {}) {
  if (!task || !state.ui?.directorTaskDetailId) return "";

  const elder = (state.elders || []).find((e) => e.id === task.elderId) || {};
  const caregiver = (state.caregivers || []).find((c) => c.id === task.caregiverId) || {};
  const status = getTaskStatusForTimeline(task);
  const evidenceList = [];
  if (task.exceptionEvidence) {
    try {
      const parsed = typeof task.exceptionEvidence === "string" ? JSON.parse(task.exceptionEvidence) : task.exceptionEvidence;
      if (Array.isArray(parsed)) evidenceList.push(...parsed.filter((e) => e && e.dataUrl));
    } catch (_) {}
  }
  if (task.recordEvidence) {
    try {
      const parsed = typeof task.recordEvidence === "string" ? JSON.parse(task.recordEvidence) : task.recordEvidence;
      if (Array.isArray(parsed)) evidenceList.push(...parsed.filter((e) => e && e.dataUrl));
    } catch (_) {}
  }

  return `
    <section class="director-dialog-backdrop" data-action="close-director-task-detail" aria-label="关闭详情"></section>
    <section class="director-dialog-shell director-dialog-shell--wide">
      <article class="director-dialog-card director-task-detail">
        <div class="director-dialog-head">
          <div>
            <strong>任务详情</strong>
            <small>${task.schedule} · ${elder.room || ""}室 · ${elder.name || task.elderId}</small>
          </div>
          <button type="button" class="icon-button" data-action="close-director-task-detail">X</button>
        </div>

        <div class="director-dialog-body">
          <div class="director-task-detail__info">
            <p><strong>任务：</strong>${task.title}</p>
            <p><strong>护工：</strong>${caregiver.name || "未分配"}</p>
            <p><strong>状态：</strong>${renderStatusPill(status.label, status.tone)}</p>
            ${task.completedAt ? `<p><strong>打卡时间：</strong>${task.completedAt}</p>` : ""}
            ${task.recordedAt ? `<p><strong>记录时间：</strong>${task.recordedAt}</p>` : ""}
          </div>

          ${task.recordNote ? `
            <div class="director-task-detail__section">
              <strong>护工记录</strong>
              <p class="director-task-detail__note">${task.recordNote}</p>
            </div>
          ` : ""}

          ${task.exceptionNote ? `
            <div class="director-task-detail__section director-task-detail__section--alert">
              <strong>异常上报${task.exceptionType ? ` · ${task.exceptionType}` : ""}</strong>
              <p class="director-task-detail__note">${task.exceptionNote}</p>
              ${task.exceptionReportedAt ? `<small>上报时间：${task.exceptionReportedAt}</small>` : ""}
            </div>
          ` : ""}

          ${evidenceList.length ? `
            <div class="director-task-detail__section">
              <strong>拍照留痕（${evidenceList.length}张）</strong>
              <div class="director-task-detail__photos">
                ${evidenceList.map((e) => `<img src="${e.dataUrl}" alt="${e.name || "照片"}" />`).join("")}
              </div>
            </div>
          ` : ""}
        </div>

        <div class="director-dialog-actions">
          <button type="button" class="btn btn--primary" data-action="close-director-task-detail">关闭</button>
        </div>
      </article>
    </section>
  `;
}

function renderSupportShortcut(route, icon, title, meta, tone = "primary") {
  return `
    <button class="director-support-card director-support-card--${tone}" data-action="navigate" data-route="${route}">
      <span class="director-support-card__icon">${renderIcon(icon)}</span>
      <strong>${title}</strong>
      <small>${meta}</small>
    </button>
  `;
}

function renderFloorStatusRow(floor) {
  const tone = floor.error > 0 ? "error" : floor.status === "success" ? "success" : "warning";

  return `
    <button class="director-floor-row director-floor-row--${tone}" data-action="select-director-floor" data-value="${floor.name}">
      <span class="director-floor-row__left">
        <span class="director-floor-badge director-floor-badge--${floor.status}">${floor.name}</span>
        <span class="director-floor-row__body">
          <strong>${floor.total} 人</strong>
          <small>执行率 ${floor.rate} · 异常 ${floor.issueRate || "0%"}</small>
          ${renderProgressMeter(floor.rate, tone)}
        </span>
      </span>
      <span class="director-floor-row__right">
        ${floor.error > 0 ? renderStatusPill(`异常/不配合 ${floor.error}`, "error") : renderStatusPill("平稳", "success")}
        ${renderIcon("caretRight")}
      </span>
    </button>
  `;
}

function renderSelectOptions(options, selectedValue) {
  return options
    .map((option) => `<option value="${option.value}" ${option.value === selectedValue ? "selected" : ""}>${option.label}</option>`)
    .join("");
}

function renderTemplateRow(item) {
  const tone = item.isActive ? "success" : "warning";

  return `
    <article class="director-template-row ${item.isActive ? "" : "is-inactive"}">
      <button class="director-template-row__main director-template-row__main--button" data-action="open-template-draft" data-value="${item.id}">
        <div class="director-template-row__head">
          <strong>${item.title}</strong>
          ${renderStatusPill(item.isActive ? "启用中" : "已停用", tone)}
        </div>
        <div class="director-template-row__meta">
          <span>${item.category}</span>
          <span>${item.appliesToLevels.join(" / ")}</span>
        </div>
        <div class="director-template-row__meta">
          <span>${item.requirePhoto ? "拍照留痕" : "文字记录"}</span>
          <span>${item.batchEligible ? "支持批量" : "单项执行"}</span>
          <span>${item.enabledCount} 个老人方案在用</span>
        </div>
      </button>
      <div class="director-template-row__actions">
        <button class="director-inline-link" data-action="open-template-draft" data-value="${item.id}">
          编辑
        </button>
        <button class="director-inline-link" data-action="toggle-template-active" data-value="${item.id}">
        ${item.isActive ? "停用" : "启用"}
        </button>
      </div>
    </article>
  `;
}

function renderTemplateDraftForm(draft) {
  if (!draft) return "";
  const isEditing = draft.mode === "edit";
  const heading = isEditing ? "编辑任务模板" : "新增任务模板";
  const actionLabel = isEditing ? "保存调整" : "保存模板";

  return `
    <div class="director-dialog-backdrop" data-action="close-template-draft"></div>
    <section class="director-dialog-shell director-dialog-shell--template">
      <article class="director-dialog-card director-dialog-card--template">
      <div class="director-card__head director-card__head--compact">
        <div>
          <strong>${heading}</strong>
        </div>
        ${renderStatusPill("任务模板", "success")}
      </div>

      <form class="director-editor-form" data-template-draft-form>
        <div class="director-form-grid">
          <label class="director-field">
            <span>模板名称</span>
            <input name="title" type="text" value="${draft.title || ""}" placeholder="例如：翻身护理" />
          </label>
        </div>

        <label class="director-field director-field--full">
          <span>任务分类</span>
          <input name="category" type="text" value="${draft.category || ""}" placeholder="例如：晨间护理 / 健康监测 / 临时关怀" />
        </label>

        <label class="director-field director-field--full">
          <span>适用护理等级</span>
          <span class="director-check-chip-row">
            ${["一级护理", "二级护理", "三级护理"]
              .map(
                (level) => `
                  <label class="director-check-chip">
                    <input type="checkbox" name="appliesToLevels" value="${level}" ${draft.appliesToLevels?.includes(level) ? "checked" : ""} />
                    <span>${level}</span>
                  </label>
                `,
              )
              .join("")}
          </span>
        </label>

        <div class="director-form-grid">
          <label class="director-field">
            <span>留痕方式</span>
            <select name="recordType" class="director-select">
              ${renderSelectOptions(
                [
                  { value: "text", label: "文字记录" },
                  { value: "photo", label: "拍照打卡" },
                ],
                draft.requirePhoto ? "photo" : "text",
              )}
            </select>
          </label>
          <label class="director-field">
            <span>执行方式</span>
            <select name="executionMode" class="director-select">
              ${renderSelectOptions(
                [
                  { value: "batch", label: "支持批量" },
                  { value: "single", label: "单项执行" },
                ],
                draft.batchEligible ? "batch" : "single",
              )}
            </select>
          </label>
        </div>

        <label class="director-field director-field--full">
          <span>执行说明</span>
          <textarea name="defaultNote" rows="3" placeholder="例如：先确认老人状态，再执行任务。">${draft.defaultNote || ""}</textarea>
        </label>
      </form>

      <div class="director-editor-actions">
        <button class="button button--muted" data-action="close-template-draft">取消</button>
        <button class="button button--primary" data-action="save-template-draft">${actionLabel}</button>
      </div>
      </article>
    </section>
  `;
}

function renderResidentRow(resident) {
  const templateLabel = resident.reportTemplateTitle || (resident.reportTemplateId ? "已分配日报模板" : "未分配日报模板");
  const statusLabel = resident.manualCount
      ? `${resident.manualCount}项需院长发布`
      : resident.reportTemplateId
        ? "日报模板已分配"
        : "待分配日报模板";

  return `
    <article
      class="director-plan-resident-card ${resident.selected ? "is-active" : ""}"
      data-action="preview-director-plan-room"
      data-value="${resident.id}"
    >
      <span class="director-plan-resident-card__title">${resident.room}室 · ${resident.elderName}</span>
      <span class="director-plan-resident-card__meta">${resident.level} · ${templateLabel}</span>
      <span class="director-plan-resident-card__foot">
        <em class="director-plan-resident-card__status ${resident.manualCount ? "is-warning" : !resident.reportTemplateId ? "is-muted" : ""}">
          ${statusLabel}
        </em>
        <button
          type="button"
          class="director-plan-resident-card__arrow"
          data-action="select-director-plan-room"
          data-value="${resident.id}"
          aria-label="进入${resident.elderName}护理方案"
        >
          ${renderIcon("caretRight")}
        </button>
      </span>
    </article>
  `;
}

function renderFloorStaffDetail(selectedFloor, staff = [], unassignedResidents = []) {
  const floorLabel = selectedFloor ? `${selectedFloor.floor}F` : "本层";
  const assignedStaff = staff.filter((caregiver) => caregiver.rooms.length);
  return `
    <article class="director-panel director-panel--floor-staff">
      <div class="director-panel__head director-panel__head--compact">
        <div>
          <strong>${floorLabel} 任务分配</strong>
          <small>显示本层常驻护工和已分配到本层的跨楼层护工。</small>
        </div>
        ${renderStatusPill(`${staff.length}名护工`, "success")}
      </div>
      <div class="director-floor-staff-list">
        ${
          staff.length
            ? staff
                .map(
                  (caregiver) => `
                    <div class="director-floor-staff-row" data-drop-caregiver-id="${caregiver.id}">
                      <div class="director-floor-staff-row__main">
                        <strong>${caregiver.name}</strong>
                        <span>${caregiver.role || "护工"}${caregiver.isCrossFloorForSelectedFloor ? ` · 常驻${caregiver.floor}F` : ""}</span>
                      </div>
                      <div class="director-floor-staff-row__rooms">
                        ${
                          caregiver.rooms.length
                            ? caregiver.rooms.map((room) => `<span class="director-floor-room-tag" draggable="true" data-elder-id="${room.elderId}" data-floor="${room.floor}" title="拖动到其他护工即可重新分配">${room.room}室 · ${room.elderName}</span>`).join("")
                            : "<em>本层暂无负责房间</em>"
                        }
                      </div>
                    </div>
                  `,
                )
                .join("")
            : '<div class="empty-state empty-state--soft">当前楼层还没有负责人分配。</div>'
        }
        ${
          unassignedResidents.length
            ? `
              <div class="director-floor-staff-row director-floor-staff-row--unassigned">
                <div class="director-floor-staff-row__main">
                  <strong>未分配</strong>
                  <span>需要院长指定负责人</span>
                </div>
                <div class="director-floor-staff-row__rooms">
                  ${unassignedResidents.map((room) => `<span class="director-floor-room-tag" draggable="true" data-elder-id="${room.elderId}" data-floor="${room.floor}" title="拖动到护工即可分配">${room.room}室 · ${room.elderName}</span>`).join("")}
                </div>
              </div>
            `
            : ""
        }
      </div>
    </article>
  `;
}

function renderPlanAssignmentLabel(assignment) {
  return assignment === "manual" ? "需要院长发布" : "默认发布给楼层护工";
}

function getPlanPeriodLabel(schedule = "") {
  const hour = Number.parseInt(String(schedule).split(":")[0], 10);
  if (Number.isNaN(hour)) return "待安排";
  if (hour < 11) return "晨间";
  if (hour < 15) return "午间";
  if (hour < 19) return "下午";
  return "晚间";
}

function summarizePlanPeriods(items) {
  const periodMap = new Map();
  items.forEach((item) => {
    const label = getPlanPeriodLabel(item.schedule);
    periodMap.set(label, (periodMap.get(label) || 0) + 1);
  });

  return ["晨间", "午间", "下午", "晚间", "待安排"]
    .filter((label) => periodMap.has(label))
    .map((label) => ({
      label,
      count: periodMap.get(label),
    }));
}

function renderPlanTimelineEntry(item, { editable = false } = {}) {
  const template = item.template || null;
  const title = item.title || template?.title || "未选择任务模板";
  const note = String(item.note || "").trim();
  const sourceText = item.sourceLabel || template?.category || "任务模板";
  const assignmentText = item.assignment ? renderPlanAssignmentLabel(item.assignment) : item.caregiver?.name || item.assignmentLabel || "实时任务";

  return `
    <article class="director-timeline__item director-timeline__item--plan">
      <div class="director-timeline__time director-timeline__time--plan">
        <strong>${item.schedule || "--:--"}</strong>
        <small>${item.isEnabled === false ? "已停用" : "已启用"}</small>
      </div>
      <div class="director-timeline__line">
        <span class="director-timeline__dot ${item.isEnabled === false ? "" : "is-active"}"></span>
      </div>
      <div class="director-timeline__card director-timeline__card--plan ${item.isEnabled === false ? "is-disabled" : ""}">
        <div class="director-timeline__card-head">
          <div>
            <strong>${title}</strong>
            <small>${sourceText} · ${assignmentText}</small>
          </div>
          ${renderStatusPill(item.status === "completed" ? "已完成" : item.isEnabled === false ? "已停用" : "进行中", item.status === "completed" ? "success" : item.isEnabled === false ? "warning" : "primary")}
        </div>
        ${note ? `<p class="director-timeline__copy">${note}</p>` : ""}
        ${
          editable
            ? `
              <div class="director-timeline__actions">
                <button type="button" class="director-inline-link" data-action="open-plan-item-draft" data-value="${item.id}">编辑</button>
                <button type="button" class="director-inline-link" data-action="toggle-plan-draft-item-enabled" data-value="${item.id}">
                  ${item.isEnabled === false ? "启用" : "停用"}
                </button>
                <button type="button" class="director-inline-link director-inline-link--danger" data-action="remove-plan-draft-item" data-value="${item.id}">删除</button>
              </div>
            `
            : ""
        }
      </div>
    </article>
  `;
}

function getTaskStatusForTimeline(task) {
  if (task.status === "completed") return { label: "已完成", tone: "success" };
  if (task.status === "risk") return { label: "异常", tone: "error" };
  if (task.status === "refused") return { label: "不配合", tone: "error" };
  const now = new Date();
  const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  if (task.schedule && task.schedule < currentTime) return { label: "超时", tone: "overdue" };
  return { label: "未完成", tone: "muted" };
}

function hasTimelineEvidence(value) {
  if (Array.isArray(value)) return value.length > 0;
  if (!value || value === "[]" || value === "{}") return false;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.length > 0 : Boolean(parsed);
    } catch (_) {
      return value.trim().length > 0;
    }
  }
  return Boolean(value);
}

function renderDirectorTimelineTaskEntry(task) {
  const status = getTaskStatusForTimeline(task);
  const caregiverName = task.caregiver?.name || task.caregiverName || "未分配护工";
  const hasRecord = !!(task.recordNote || hasTimelineEvidence(task.recordEvidence) || Number(task.recordEvidenceCount || 0) > 0);
  const hasException = !!(
    task.exceptionNote ||
    task.exceptionType ||
    task.exceptionReportedAt ||
    hasTimelineEvidence(task.exceptionEvidence) ||
    Number(task.exceptionEvidenceCount || 0) > 0 ||
    task.status === "risk" ||
    task.status === "refused"
  );
  const clickable = true;
  const clickAction = `data-action="director-view-task-detail" data-value="${task.id}"`;
  const badge = hasException ? `<span class="timeline-badge timeline-badge--alert">!</span>` : hasRecord ? `<span class="timeline-badge timeline-badge--info">i</span>` : "";

  return `
    <article class="director-timeline__item director-timeline__item--task ${clickable ? "is-clickable" : ""}" ${clickAction} data-task-id="${task.id}" data-task-tone="${status.tone}" data-task-status="${status.label}">
      <div class="director-timeline__time director-timeline__time--plan">
        <strong>${task.schedule || "--:--"}</strong>
        <small>${task.source === "report-template" ? "日报" : "任务"}</small>
      </div>
      <div class="director-timeline__line">
        <span class="director-timeline__dot is-active director-timeline__dot--${status.tone}"></span>
      </div>
      <div class="director-timeline__card director-timeline__card--plan">
        <div class="director-timeline__card-head">
          <div>
            <strong>${task.title}</strong>
            <small>${task.source === "report-template" ? "日报模板" : "临时任务"} · 负责护工：${caregiverName}</small>
          </div>
          <div class="director-timeline__card-badges">
            ${badge}
            ${renderStatusPill(status.label, status.tone)}
          </div>
        </div>
      </div>
    </article>
  `;
}

function getTimelineTaskDisplayKey(task = {}) {
  return [
    task.elderId || "",
    task.templateId || "",
    task.title || "",
    task.schedule || task.window || "",
  ].join("|");
}

function getTimelineEntryComparableKey(item = {}, resident = {}) {
  const template = item.template || {};
  return [
    item.elderId || resident?.id || "",
    item.templateId || template.id || "",
    item.title || template.title || "",
    item.schedule || item.window || "",
  ].join("|");
}

function preferTimelineTask(candidate, current, targetDate = "") {
  if (!current) return candidate;
  const candidateExactDate = targetDate && candidate.recordDate === targetDate;
  const currentExactDate = targetDate && current.recordDate === targetDate;
  if (candidateExactDate !== currentExactDate) return candidateExactDate ? candidate : current;

  const candidateUpdated = String(candidate.updatedAt || candidate.completedAt || candidate.publishedAt || "");
  const currentUpdated = String(current.updatedAt || current.completedAt || current.publishedAt || "");
  if (candidateUpdated && currentUpdated && candidateUpdated !== currentUpdated) {
    return candidateUpdated > currentUpdated ? candidate : current;
  }

  const candidateHandled = ["completed", "risk", "refused"].includes(candidate.status);
  const currentHandled = ["completed", "risk", "refused"].includes(current.status);
  if (candidateHandled !== currentHandled) return candidateHandled ? candidate : current;

  return current;
}

function getVisibleReportTimelineTasks(tasks = [], resident, state = {}) {
  if (!resident) return [];
  const targetDate = state?.director?.date || "";
  const candidates = tasks.filter((task) => {
    if (task.elderId !== resident.id) return false;
    if (task.status === "cancelled") return false;
    if (targetDate && task.recordDate && task.recordDate !== targetDate) return false;
    return true;
  });

  const byDisplayKey = new Map();
  candidates.forEach((task) => {
    const key = getTimelineTaskDisplayKey(task);
    byDisplayKey.set(key, preferTimelineTask(task, byDisplayKey.get(key), targetDate));
  });

  return Array.from(byDisplayKey.values());
}

function renderPlanTimelineSidebar(plan, resident, isOpen = false, tasks = [], state = {}) {
  if (!resident) return "";

  const allItems = getVisibleReportTimelineTasks(tasks, resident, state)
    .map((task) => ({ ...task, _type: "task" }))
    .sort((left, right) => String(left.schedule || "").localeCompare(String(right.schedule || "")));

  const hasAnyContent = allItems.length > 0;

  if (!hasAnyContent) {
    return `
      <aside class="director-plan-sidebar ${isOpen ? "is-open" : ""}">
        <div class="director-plan-sidebar__panel">
          <div class="director-plan-sidebar__head">
            <div>
              <p>${resident.room}室 · ${resident.elderName}</p>
              <strong>今日任务时间轴为空</strong>
              <small>${resident.level}</small>
            </div>
          </div>

          <div class="empty-state empty-state--soft">
            云端今天还没有生成这位老人的任务记录。
          </div>
        </div>
      </aside>
    `;
  }

  const totalCount = allItems.length;

  return `
    <aside class="director-plan-sidebar ${isOpen ? "is-open" : ""}">
      <div class="director-plan-sidebar__panel">
        <div class="director-plan-sidebar__head">
          <div>
            <p>${resident.room}室 · ${resident.elderName}</p>
            <strong>今日任务时间轴</strong>
            <small>${resident.level} · ${totalCount}项任务</small>
          </div>
        </div>

        <section class="director-plan-sidebar__timeline">
          <div class="director-plan-sidebar__section-head">
            <strong>从早到晚</strong>
            ${renderStatusPill(`${totalCount}项任务`, "success")}
          </div>
          <div class="director-plan-timeline director-plan-timeline--sidebar">
            ${allItems.map((item) => renderDirectorTimelineTaskEntry(item)).join("")}
          </div>
        </section>

      </div>
    </aside>
  `;
}

function renderPlanResidentDrawer(selectedResident, residentOptions = [], isOpen = false) {
  if (!selectedResident) return "";

  const sortedResidents = [...residentOptions].sort((left, right) => left.room.localeCompare(right.room));
  const renderResidentRow = (resident) => `
    <button
      type="button"
      class="director-plan-drawer-table-row ${resident.selected ? "is-active" : ""}"
      data-action="select-director-plan-room"
      data-value="${resident.id}"
    >
      <span class="director-plan-drawer-table-row__room">${resident.room}</span>
      <span class="director-plan-drawer-table-row__person">
        <strong>${resident.elderName}</strong>
        <small>${resident.level}</small>
      </span>
    </button>
  `;

  return `
    <aside class="director-plan-resident-drawer ${isOpen ? "is-open" : ""}">
      <div class="director-plan-resident-drawer__panel">
        <div class="director-plan-resident-drawer__head">
          <div>
            <strong>老人名单</strong>
          </div>
          ${renderStatusPill(`${sortedResidents.length} 位`, "success")}
        </div>

        <section class="director-plan-drawer-table">
          <div class="director-plan-drawer-table__head">
            <span>房间</span>
            <span>老人 / 护理等级</span>
          </div>
          <div class="director-plan-drawer-table__body">
            ${sortedResidents.map(renderResidentRow).join("")}
          </div>
        </section>
      </div>
    </aside>
  `;
}

function renderPlanItemDraftDialog(itemDraft, selectors, state) {
  if (!itemDraft) return "";

  const template = state.taskTemplates.find((item) => item.id === itemDraft.templateId) || null;

  return `
    <div class="director-dialog-backdrop" data-action="close-plan-item-draft"></div>
    <section class="director-dialog-shell">
      <article class="director-dialog-card">
        <div class="director-card__head director-card__head--compact">
          <div>
            <strong>${itemDraft.mode === "edit" ? "编辑任务" : "新增任务"}</strong>
            <small>只配置这条任务的时间和指派方式，保存后直接进入时间轴。</small>
          </div>
          ${template ? renderStatusPill(template.category || "任务模板", "success") : ""}
        </div>

        <form class="director-editor-form" data-plan-item-draft-form>
          <label class="director-field director-field--full">
            <span>任务模板</span>
            <select name="templateId" class="director-select">
              ${renderSelectOptions(selectors.templateOptions.map((option) => ({ value: option.id, label: option.label })), itemDraft.templateId)}
            </select>
          </label>

          <div class="director-form-grid">
            <label class="director-field">
              <span>执行时间</span>
              <input name="schedule" type="time" value="${itemDraft.schedule || "08:00"}" />
            </label>
            <label class="director-field">
              <span>发布方式</span>
              <select name="assignment" class="director-select">
                ${renderSelectOptions(
                  [
                    { value: "floor-owner", label: "默认分配给楼层护工" },
                    { value: "manual", label: "需要院长发布" },
                  ],
                  itemDraft.assignment || "floor-owner",
                )}
              </select>
            </label>
          </div>

          <label class="director-field director-field--full">
            <span>补充说明</span>
            <textarea name="note" rows="3" placeholder="选填，例如：饭前执行或注意复测。">${itemDraft.note || ""}</textarea>
          </label>
        </form>

        <div class="director-editor-actions">
          ${itemDraft.mode === "edit" ? `<button type="button" class="button button--muted" data-action="remove-plan-draft-item" data-value="${itemDraft.itemId}">删除任务</button>` : ""}
          <button type="button" class="button button--muted" data-action="close-plan-item-draft">取消</button>
          <button type="button" class="button button--primary" data-action="save-plan-item-draft">${itemDraft.mode === "edit" ? "保存修改" : "加入时间轴"}</button>
        </div>
      </article>
    </section>
  `;
}

function renderPlanDraftForm(draft, selectors, selectedResident, state) {
  if (!draft) return "";

  const residentOptions = selectors.directorPlanResidentOptions.map((resident) => ({
    value: resident.id,
    label: `${resident.room}室 · ${resident.elderName}`,
  }));
  const draftResident = selectors.directorPlanResidentOptions.find((resident) => resident.id === draft.elderId) || selectedResident;
  const timelineItems = [...draft.items]
    .sort((left, right) => left.schedule.localeCompare(right.schedule))
    .map((item) => ({
      ...item,
      template: state.taskTemplates.find((template) => template.id === item.templateId) || null,
    }));

  return `
    <article class="director-editor-card director-editor-card--plan">
      <div class="director-card__head director-card__head--compact">
        <div>
          <strong>${draft.mode === "edit" ? "调整护理方案" : "新建护理方案"}</strong>
          <small>${draftResident ? `当前目标：${draftResident.room}室 · ${draftResident.elderName}` : "先确认当前老人"}</small>
        </div>
        ${renderStatusPill(draft.mode === "edit" ? "方案编辑" : "新建方案", "primary")}
      </div>

      <form class="director-editor-form" data-plan-draft-form>
        <div class="director-form-grid">
          <label class="director-field">
            <span>对应老人</span>
            <select name="elderId" class="director-select">
              ${renderSelectOptions(residentOptions, draft.elderId)}
            </select>
          </label>
          <label class="director-field">
            <span>护理等级</span>
            <select name="level" class="director-select">
              ${renderSelectOptions(selectors.careLevelOptions.map((item) => ({ value: item, label: item })), draft.level)}
            </select>
          </label>
          <label class="director-field">
            <span>复核周期</span>
            <select name="reviewCycle" class="director-select">
              ${renderSelectOptions(selectors.reviewCycleOptions.map((item) => ({ value: item, label: item })), draft.reviewCycle)}
            </select>
          </label>
        </div>

        <label class="director-field director-field--full">
          <span>方案备注</span>
          <textarea name="note" rows="3" placeholder="例如：重点关注晨间状态，午后任务暂不启用。">${draft.note || ""}</textarea>
        </label>
      </form>

      <section class="director-plan-timeline-panel">
        <div class="director-editor-subhead director-editor-subhead--timeline">
          <div>
            <strong>任务时间轴</strong>
          </div>
          <button type="button" class="button button--small button--secondary" data-action="open-plan-item-draft">新增任务</button>
        </div>

        ${
          timelineItems.length
            ? `
              <div class="director-timeline director-timeline--plan">
                ${timelineItems.map((item) => renderPlanTimelineEntry(item, { editable: true })).join("")}
              </div>
            `
            : '<div class="empty-state empty-state--soft">当前还没有任务，点击“新增任务”后会按时间进入这条时间轴。</div>'
        }
      </section>

      <div class="director-editor-actions">
        <button type="button" class="button button--muted" data-action="close-plan-draft">取消</button>
        <button type="button" class="button button--primary" data-action="save-plan-draft">保存方案</button>
      </div>
    </article>
    ${renderPlanItemDraftDialog(selectors.directorPlanItemDraft, selectors, state)}
  `;
}

function renderDispatchTaskCard(task) {
  const sameFloorRecommended = task.recommendedCaregiver && task.elder?.floor === task.recommendedCaregiver.floor;
  const recommendationReason = task.recommendedCaregiver
    ? `${sameFloorRecommended ? "同楼层优先" : "跨楼层补位"} · 当前 ${task.recommendedCaregiver.pendingCount} 项待办`
    : "暂无可推荐护工";
  const assigneeLabel = task.caregiver ? `当前：${task.caregiver.name}` : `推荐：${task.recommendedCaregiver?.name || "暂无"}`;

  return `
    <article class="director-dispatch-card director-dispatch-card--${task.urgencyTone}" data-action="open-director-dispatch-draft" data-value="${task.id}" role="button" tabindex="0">
      <div class="director-dispatch-row__main">
        <div class="director-dispatch-row__title">
          <strong>${task.title}</strong>
          ${renderStatusPill(task.urgencyLabel, task.urgencyTone)}
        </div>
        <p>${task.scopeLabel} · ${task.schedule}</p>
      </div>
      <div class="director-dispatch-row__meta">
        <span>${task.assignmentMode === "temporary" || task.templateGroup === "temporary" ? "临时任务" : task.assignmentMode === "manual" ? "手动发布" : "特殊模板"}</span>
        <span>${task.receiptLabel}</span>
        <span>${task.requirePhoto ? "拍照" : "文字"}</span>
        <span>${assigneeLabel}</span>
      </div>
      <small class="director-dispatch-row__hint">${recommendationReason}</small>
      <button class="director-dispatch-row__arrow" data-action="open-director-dispatch-draft" data-value="${task.id}" aria-label="选择发布护工">
        ${renderIcon("caretRight")}
      </button>
    </article>
  `;
}

function renderLoadMeter(item) {
  const actionableCount = item.pendingCount + item.riskCount;
  const percent = Math.min(100, Math.round((actionableCount / 6) * 100));
  const tone = item.riskCount > 0 ? "error" : actionableCount >= 5 ? "warning" : "success";

  return `
    <div class="director-load-meter director-load-meter--${tone}">
      <span style="width: ${percent}%;"></span>
    </div>
  `;
}

function renderLoadRow(item) {
  const actionableCount = item.pendingCount + item.riskCount;

  return `
    <article class="director-load-row ${actionableCount >= 5 ? "is-warning" : ""}">
      <div class="director-load-row__main">
        <strong>${item.name}</strong>
        <small>${item.floor}F 责任护工 · 待完成 ${item.pendingCount} 项 · 风险 ${item.riskCount} 项</small>
        ${renderLoadMeter(item)}
      </div>
      <div class="director-load-row__count">
        <strong>${actionableCount}</strong>
        <small>${actionableCount >= 5 ? "偏满" : "可分配"}</small>
      </div>
    </article>
  `;
}

function renderLoadChartRow(item, maxAssignedCount) {
  const assignedCount = Number(item.assignedCount || 0);
  const pendingCount = Number(item.pendingCount || 0);
  const riskCount = Number(item.riskCount || 0);
  const completedCount = Math.max(0, assignedCount - pendingCount - riskCount);
  const percent = maxAssignedCount ? Math.max(8, Math.round((assignedCount / maxAssignedCount) * 100)) : 0;
  const pendingPercent = assignedCount ? Math.round((pendingCount / assignedCount) * 100) : 0;
  const riskPercent = assignedCount ? Math.round((riskCount / assignedCount) * 100) : 0;
  const completedPercent = Math.max(0, 100 - pendingPercent - riskPercent);
  const tone = riskCount ? "danger" : assignedCount >= 5 ? "warning" : assignedCount ? "steady" : "quiet";

  return `
    <article class="director-load-chart-row director-load-chart-row--${tone}">
      <div class="director-load-chart-row__label">
        <strong>${item.name}</strong>
        <small>${item.floor}F · ${assignedCount ? `${assignedCount} 项任务` : "暂无任务"}</small>
      </div>
      <div class="director-load-chart-row__track" aria-label="${item.name} 护工负载 ${assignedCount} 项">
        <div class="director-load-chart-row__bar" style="width:${percent}%">
          ${completedPercent ? `<span class="is-completed" style="width:${completedPercent}%"></span>` : ""}
          ${pendingPercent ? `<span class="is-pending" style="width:${pendingPercent}%"></span>` : ""}
          ${riskPercent ? `<span class="is-risk" style="width:${riskPercent}%"></span>` : ""}
        </div>
      </div>
      <div class="director-load-chart-row__count">
        <strong>${assignedCount}</strong>
        <small>${riskCount ? `异常 ${riskCount}` : pendingCount ? `待办 ${pendingCount}` : assignedCount ? "稳定" : "空闲"}</small>
      </div>
    </article>
  `;
}

function renderCaregiverLoadChart(loads = []) {
  const maxAssignedCount = Math.max(1, ...loads.map((item) => Number(item.assignedCount || 0)));
  const totalAssigned = loads.reduce((sum, item) => sum + Number(item.assignedCount || 0), 0);
  const totalPending = loads.reduce((sum, item) => sum + Number(item.pendingCount || 0), 0);
  const totalRisk = loads.reduce((sum, item) => sum + Number(item.riskCount || 0), 0);

  return `
    <article class="director-panel director-panel--load-chart">
      <div class="director-panel__head director-panel__head--compact">
        <div>
          <strong>护工负载</strong>
          <small>按当前业务日期统计每位护工任务量。</small>
        </div>
        ${renderStatusPill(`${totalAssigned}项`, totalRisk ? "error" : totalPending ? "warning" : "success")}
      </div>
      <div class="director-load-chart-summary">
        <span><strong>${loads.length}</strong><small>护工</small></span>
        <span><strong>${totalPending}</strong><small>待办</small></span>
        <span class="${totalRisk ? "is-danger" : ""}"><strong>${totalRisk}</strong><small>异常</small></span>
      </div>
      <div class="director-load-chart-legend">
        <span><i class="is-completed"></i>已处理</span>
        <span><i class="is-pending"></i>待办</span>
        <span><i class="is-risk"></i>异常</span>
      </div>
      <div class="director-load-chart">
        ${
          loads.length
            ? loads.map((item) => renderLoadChartRow(item, maxAssignedCount)).join("")
            : '<div class="empty-state empty-state--soft">当前养老院还没有可统计的护工。</div>'
        }
      </div>
    </article>
  `;
}

function renderCareRecordCheckOption(name, label, checked) {
  return `
    <label class="director-check-chip director-check-chip--record">
      <input type="checkbox" name="${name}" ${checked ? "checked" : ""} />
      <span>${label}</span>
    </label>
  `;
}

function renderCareRecordRadioOption(name, value, label, selectedValue) {
  return `
    <label class="director-check-chip director-check-chip--record">
      <input type="radio" name="${name}" value="${value}" ${value === selectedValue ? "checked" : ""} />
      <span>${label}</span>
    </label>
  `;
}

function countReportTemplateItems(template = {}) {
  return (template.sections || []).reduce((total, section) => total + (section.items || []).length, 0);
}

function countCheckedReportItems(record = {}) {
  return Object.values(record.reportItems || {}).filter(Boolean).length;
}

function renderReportTemplateSection(section, record) {
  return `
    <section class="care-report-template-section">
      <div class="care-report-template-section__title">${section.title}</div>
      <div class="director-check-chip-row director-check-chip-row--record-grid">
        ${(section.items || [])
          .map(
            (item) => `
              <label class="director-check-chip director-check-chip--record">
                <input
                  type="checkbox"
                  name="reportItem_${item.id}"
                  data-report-template-item="${item.id}"
                  ${record.reportItems?.[item.id] ? "checked" : ""}
                />
                <span>
                  ${item.label}
                  ${item.timeWindow ? `<small>${item.timeWindow}</small>` : ""}
                </span>
              </label>
            `,
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderReportTemplateFields(record, template) {
  const activeTemplate = template || record.reportTemplateSnapshot || {};
  const sections = activeTemplate.sections || [];

  if (!sections.length) {
    return `<div class="empty-state empty-state--soft">当前没有可填写的日报项目。</div>`;
  }

  return `
    <div class="care-report-template-groups">
      ${sections.map((section) => renderReportTemplateSection(section, record)).join("")}
    </div>
  `;
}

function renderReportTemplateFrequencyInput(value = 1, attributes = "") {
  const current = Math.max(1, Number(value || 1));

  return `
    <input ${attributes} type="number" min="1" step="1" inputmode="numeric" value="${current}" placeholder="天数" />
  `;
}

const REPORT_TEMPLATE_SCHEDULE_START_MINUTES = 0;
const REPORT_TEMPLATE_SCHEDULE_END_MINUTES = 24 * 60;
const REPORT_TEMPLATE_SCHEDULE_PX_PER_MINUTE = 1;
const REPORT_TEMPLATE_SCHEDULE_MIN_DURATION = 15;
const REPORT_TEMPLATE_SCHEDULE_CARD_MIN_HEIGHT = 72;
const REPORT_TEMPLATE_SCHEDULE_HEIGHT =
  (REPORT_TEMPLATE_SCHEDULE_END_MINUTES - REPORT_TEMPLATE_SCHEDULE_START_MINUTES) * REPORT_TEMPLATE_SCHEDULE_PX_PER_MINUTE;

function formatReportTemplateScheduleTime(minutes = REPORT_TEMPLATE_SCHEDULE_START_MINUTES) {
  const normalized = Math.max(0, Math.min(24 * 60, Math.round(Number(minutes || 0))));
  const hour = String(Math.floor(normalized / 60)).padStart(2, "0");
  const minute = String(normalized % 60).padStart(2, "0");
  return `${hour}:${minute}`;
}

function parseReportTemplateScheduleWindow(value = "") {
  const match = String(value || "").match(/(\d{1,2}):(\d{2})\s*[-~—]\s*(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const start = Number(match[1]) * 60 + Number(match[2]);
  const end = Number(match[3]) * 60 + Number(match[4]);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  const clampedStart = Math.max(
    REPORT_TEMPLATE_SCHEDULE_START_MINUTES,
    Math.min(REPORT_TEMPLATE_SCHEDULE_END_MINUTES - REPORT_TEMPLATE_SCHEDULE_MIN_DURATION, start),
  );
  const clampedEnd = Math.max(
    clampedStart + REPORT_TEMPLATE_SCHEDULE_MIN_DURATION,
    Math.min(REPORT_TEMPLATE_SCHEDULE_END_MINUTES, end),
  );

  return {
    start: clampedStart,
    duration: Math.max(REPORT_TEMPLATE_SCHEDULE_MIN_DURATION, clampedEnd - clampedStart),
  };
}

function buildReportTemplateScheduleWindow(startMinutes, duration = 60) {
  const normalizedDuration = Math.min(
    REPORT_TEMPLATE_SCHEDULE_END_MINUTES - REPORT_TEMPLATE_SCHEDULE_START_MINUTES,
    Math.max(REPORT_TEMPLATE_SCHEDULE_MIN_DURATION, Number(duration || 60)),
  );
  const start = Math.max(
    REPORT_TEMPLATE_SCHEDULE_START_MINUTES,
    Math.min(REPORT_TEMPLATE_SCHEDULE_END_MINUTES - normalizedDuration, Number(startMinutes || REPORT_TEMPLATE_SCHEDULE_START_MINUTES)),
  );
  const end = Math.min(REPORT_TEMPLATE_SCHEDULE_END_MINUTES, start + normalizedDuration);
  return `${formatReportTemplateScheduleTime(start)}-${formatReportTemplateScheduleTime(end)}`;
}

function renderReportTemplateScheduleTicks() {
  return Array.from({ length: 25 }, (_, index) => {
    const minutes = REPORT_TEMPLATE_SCHEDULE_START_MINUTES + index * 60;
    const top = (minutes - REPORT_TEMPLATE_SCHEDULE_START_MINUTES) * REPORT_TEMPLATE_SCHEDULE_PX_PER_MINUTE;
    return `
      <span class="director-report-schedule-tick" style="top:${top}px;">
        ${formatReportTemplateScheduleTime(minutes)}
      </span>
    `;
  }).join("");
}

function renderReportTemplateItemRow(item = {}, index = 0) {
  return `
    <div class="director-report-template-item-row" data-report-template-item-row="${item.id || `item-${index + 1}`}">
      <span>${index + 1}</span>
      <input data-report-template-item-label type="text" value="${item.label || ""}" />
      ${renderReportTemplateFrequencyInput(item.frequencyDays || 1, "data-report-template-item-frequency")}
      <details class="director-report-template-item-menu">
        <summary aria-label="子标题操作">${renderIcon("moreVertical")}</summary>
        <div>
          <button
            type="button"
            class="director-report-template-menu-danger"
            data-action="delete-report-template-item"
            aria-label="删除子标题"
          >
            删除
          </button>
        </div>
      </details>
    </div>
  `;
}

function renderReportTemplateSchedulePage(draft = {}, scheduleSectionId = "") {
  if (!scheduleSectionId) return "";
  const section = (draft.sections || []).find((item) => item.id === scheduleSectionId);
  if (!section) return "";
  const items = section.items || [];

  return `
    <section class="director-report-schedule-page">
      <header class="director-report-schedule-page__header">
        <button class="button button--small button--secondary" type="button" data-action="close-report-template-schedule">
          返回编辑
        </button>
        <div class="director-report-schedule-page__title">
          <strong>安排：${section.title || "未命名分组"}</strong>
          <span>${items.length} 个子标题</span>
        </div>
        <div class="director-report-schedule-actions">
          <button
            class="button button--small button--secondary director-report-schedule-save-button"
            type="button"
            data-action="save-report-template-schedule"
          >
            保存
          </button>
          <button
            class="button button--small button--primary director-report-schedule-add-button"
            type="button"
            data-action="add-report-template-item-from-schedule"
            data-value="${section.id}"
          >
            新建
          </button>
        </div>
      </header>

      <div class="director-report-schedule-page__body">
        <div class="director-report-schedule-board">
          <div class="director-report-schedule-timeline" style="height:${REPORT_TEMPLATE_SCHEDULE_HEIGHT}px;">
            ${renderReportTemplateScheduleTicks()}
          </div>
          <div class="director-report-schedule-lane" style="height:${REPORT_TEMPLATE_SCHEDULE_HEIGHT}px;">
            ${
              items.length
                ? items
                    .map((item, index) => {
                      const parsed = parseReportTemplateScheduleWindow(item.timeWindow);
                      const fallbackStart = Math.min(REPORT_TEMPLATE_SCHEDULE_END_MINUTES - 60, 6 * 60 + index * 45);
                      const start = parsed?.start ?? fallbackStart;
                      const duration = parsed?.duration || 60;
                      const top = (start - REPORT_TEMPLATE_SCHEDULE_START_MINUTES) * REPORT_TEMPLATE_SCHEDULE_PX_PER_MINUTE;
                      const height = Math.max(
                        REPORT_TEMPLATE_SCHEDULE_CARD_MIN_HEIGHT,
                        duration * REPORT_TEMPLATE_SCHEDULE_PX_PER_MINUTE,
                      );
                      const timeWindow = item.timeWindow || buildReportTemplateScheduleWindow(start, duration);

                      return `
                        <article
                          class="director-report-schedule-card"
                          style="top:${top}px; height:${height}px;"
                          data-report-template-schedule-card
                          data-section-id="${section.id}"
                          data-item-id="${item.id}"
                          data-duration="${duration}"
                          data-minutes="${start}"
                        >
                          <div class="director-report-schedule-card__content">
                            <strong>${item.label || "未命名子标题"}</strong>
                            <span data-report-template-schedule-time>${timeWindow}</span>
                            ${item.requirePhoto ? '<em class="director-report-schedule-card__badge">拍照留痕</em>' : ""}
                          </div>
                          <div class="director-report-schedule-card__actions">
                            <details class="director-report-schedule-card__menu" data-report-template-schedule-menu>
                              <summary aria-label="设置持续时间">${renderIcon("alarmClock")}</summary>
                              <div>
                                ${[
                                  [15, "15分钟"],
                                  [30, "30分钟"],
                                  [60, "1小时"],
                                ]
                                  .map(
                                    ([minutes, label]) => `
                                      <button
                                        type="button"
                                        data-action="set-report-template-schedule-duration"
                                        data-section-id="${section.id}"
                                        data-item-id="${item.id}"
                                        data-value="${minutes}"
                                      >
                                        ${label}
                                      </button>
                                    `,
                                  )
                                  .join("")}
                                <button
                                  type="button"
                                  data-action="set-report-template-schedule-duration"
                                  data-section-id="${section.id}"
                                  data-item-id="${item.id}"
                                  data-value="custom"
                                >
                                  自定义
                                </button>
                              </div>
                            </details>
                            <details class="director-report-schedule-card__menu" data-report-template-schedule-menu>
                              <summary aria-label="子标题操作">${renderIcon("moreVertical")}</summary>
                              <div>
                                <button
                                  type="button"
                                  data-action="toggle-report-template-item-photo"
                                  data-section-id="${section.id}"
                                  data-item-id="${item.id}"
                                >
                                  ${item.requirePhoto ? "取消拍照留痕" : "需要拍照留痕"}
                                </button>
                                <button
                                  type="button"
                                  class="director-report-template-menu-danger"
                                  data-action="delete-report-template-item-by-id"
                                  data-section-id="${section.id}"
                                  data-item-id="${item.id}"
                                >
                                  删除
                                </button>
                              </div>
                            </details>
                          </div>
                        </article>
                      `;
                    })
                    .join("")
                : `<div class="director-report-schedule-empty">这个父标题还没有子标题</div>`
            }
          </div>
        </div>
      </div>
    </section>
  `;
}

function renderReportTemplateSectionEditor(section = {}, sectionIndex = 0, transient = {}) {
  const pendingItem = transient?.newItems?.[section.id] || {};

  return `
    <details class="director-report-template-section" data-report-template-section="${section.id}">
      <summary>
        <span>
          <strong>${section.title || "未命名分组"}</strong>
          <em>${(section.items || []).length} 项</em>
        </span>
        <span class="director-report-template-section__tools">
          <button
            type="button"
            class="director-report-template-delete-button director-report-template-delete-button--section"
            data-action="delete-report-template-section"
            data-value="${section.id}"
          >
            删除
          </button>
          ${renderIcon("caretRight")}
        </span>
      </summary>
      <div class="director-report-template-section__body">
        <div class="director-report-template-section-title-row">
          <label class="director-field director-field--full">
            <span>父标题</span>
            <input data-report-template-section-title type="text" value="${section.title || ""}" />
          </label>
          <button
            type="button"
            class="director-report-template-schedule-button"
            data-action="open-report-template-schedule"
            data-value="${section.id}"
          >
            安排
          </button>
        </div>
        <div class="director-report-template-item-table">
          <div class="director-report-template-item-row director-report-template-item-row--head">
            <span>序号</span>
            <span>子标题</span>
            <span>频次/天</span>
            <span></span>
          </div>
          ${(section.items || []).map(renderReportTemplateItemRow).join("")}
        </div>
        <div class="director-report-template-add-child">
          <span>+</span>
          <input data-report-template-new-item-label type="text" placeholder="新增子标题" value="${pendingItem.label || ""}" />
          ${renderReportTemplateFrequencyInput(pendingItem.frequencyDays || 1, "data-report-template-new-item-frequency")}
          <button type="button" class="director-report-template-add-button" data-action="add-report-template-item">添加</button>
        </div>
      </div>
    </details>
  `;
}

function renderReportTemplateA4Preview(draft = {}) {
  const days = Array.from({ length: 31 }, (_, index) => index + 1);
  const sections = draft.sections || [];
  const renderPreviewPeriodCells = (item = {}) =>
    getReportTemplateItemPeriods(item, days.length)
      .map((period) => `<td colspan="${period.span}" class="${period.span > 1 ? "is-merged-period" : ""}"></td>`)
      .join("");

  return `
    <article class="director-report-template-preview">
      <div class="director-report-template-preview__page">
        <h3>护理记录</h3>
        <div class="director-report-template-preview__meta">
          <span>老人姓名：自动生成</span>
          <span>房间号：自动生成</span>
          <span>性别：自动生成</span>
          <span>护理级别：自动生成</span>
          <span>责任护理员：自动生成</span>
          <span>月份：自动生成</span>
        </div>
        <div class="director-report-template-preview__scroll">
          <table>
            <thead>
              <tr>
                <th class="group-col">项目</th>
                <th class="item-col">内容</th>
                ${days.map((day) => `<th>${day}</th>`).join("")}
              </tr>
            </thead>
            <tbody>
              ${sections
                .map((section) =>
                  (section.items || [])
                    .map(
                      (item, itemIndex) => `
                        <tr>
                          ${
                            itemIndex === 0
                              ? `<th class="group-col" rowspan="${Math.max(1, (section.items || []).length)}">${section.title}</th>`
                              : ""
                          }
                          <td class="item-col">
                            ${item.label}
                            <small>
                              ${[
                                item.timeWindow || "",
                                getReportTemplateItemFrequencyDays(item) === 1 ? "" : `每${getReportTemplateItemFrequencyDays(item)}天`,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </small>
                          </td>
                          ${renderPreviewPeriodCells(item)}
                        </tr>
                      `,
                    )
                    .join(""),
                )
                .join("")}
              <tr>
                <th class="group-col">备注</th>
                <td class="item-col">备注</td>
                ${days.map(() => "<td></td>").join("")}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </article>
  `;
}

function renderReportTemplatePreviewOverlay(draft = {}, previewOpen = false, zoom = 1) {
  if (!previewOpen) return "";
  const normalizedZoom = Math.min(1.8, Math.max(0.75, Number(zoom || 1)));
  const canvasWidth = Math.ceil(920 * normalizedZoom);
  const canvasHeight = Math.ceil(1260 * normalizedZoom);

  return `
    <section class="director-report-template-preview-modal">
      <button class="director-report-template-preview-modal__backdrop" data-action="close-report-template-preview" aria-label="返回编辑"></button>
      <div class="director-report-template-preview-modal__dialog">
        <div class="director-report-template-preview-modal__toolbar">
          <button type="button" class="button button--small button--secondary" data-action="close-report-template-preview">返回编辑</button>
          <div class="director-report-template-preview-modal__zoom">
            <button type="button" data-action="zoom-report-template-preview" data-value="out">-</button>
            <span>${Math.round(normalizedZoom * 100)}%</span>
            <button type="button" data-action="zoom-report-template-preview" data-value="in">+</button>
          </div>
        </div>
        <div class="director-report-template-preview-modal__viewport">
          <div class="director-report-template-preview-modal__canvas" style="width:${canvasWidth}px; min-height:${canvasHeight}px;">
            <div class="director-report-template-preview-modal__scale" style="transform: scale(${normalizedZoom});">
              ${renderReportTemplateA4Preview(draft)}
            </div>
          </div>
        </div>
      </div>
    </section>
  `;
}

function renderReportTemplateImportDialog(importState = {}) {
  if (!importState.open) return "";
  const institutions = importState.institutions || [];
  const templates = importState.templates || [];
  const selectedTemplate = templates.find((template) => template.selected) || templates[0] || null;

  return `
    <section class="director-report-template-import">
      <button class="director-report-template-import__backdrop" type="button" data-action="close-report-template-import" aria-label="关闭模板导入"></button>
      <div class="director-report-template-import__dialog">
        <div class="director-card__head director-card__head--compact">
          <div>
            <strong>选择基础模板</strong>
          </div>
          <button class="button button--small button--secondary" type="button" data-action="refresh-report-template-import">
            ${importState.loading ? "读取中" : "刷新"}
          </button>
        </div>

        <label class="director-field">
          <span>养老院</span>
          <select data-report-template-import-institution>
            ${institutions
              .map(
                (institution) => `
                  <option value="${institution.id}" ${institution.id === importState.selectedInstitutionId ? "selected" : ""}>
                    ${institution.name}
                  </option>
                `,
              )
              .join("")}
          </select>
        </label>

        <div class="director-report-template-import__list">
          ${
            importState.error
              ? `<div class="director-report-template-import__empty">${importState.error}</div>`
              : templates.length
                ? templates
                    .map(
                      (template) => `
                        <button
                          type="button"
                          class="director-report-template-import__item ${template.selected ? "is-active" : ""}"
                          data-action="select-report-template-import-template"
                          data-value="${template.id}"
                        >
                          <span>
                            <strong>${template.title || "未命名模板"}</strong>
                            <small>${template.sectionCount} 个父标题 · ${template.itemCount} 个子标题</small>
                          </span>
                          ${renderStatusPill(`版本 ${template.version || 1}`, template.selected ? "success" : "muted")}
                        </button>
                      `,
                    )
                    .join("")
                : `<div class="director-report-template-import__empty">${importState.loading ? "正在读取云端模板" : "这个养老院暂无云端模板"}</div>`
          }
        </div>

        <div class="director-report-template-import__actions">
          <button class="button button--secondary" type="button" data-action="close-report-template-import">取消</button>
          <button
            class="button button--primary"
            type="button"
            data-action="apply-report-template-import"
            data-value="${selectedTemplate?.id || ""}"
            ${selectedTemplate ? "" : "disabled"}
          >
            创建实例
          </button>
        </div>
      </div>
    </section>
  `;
}

function renderReportTemplateHierarchy(savedTemplates = [], templateHierarchy = [], editingId = "") {
  if (!savedTemplates.length) return "";
  const groups = templateHierarchy?.length
    ? templateHierarchy
    : [
        {
          id: "",
          title: "未关联基础模板",
          templates: savedTemplates,
        },
      ];

  return `
    <div class="director-report-template-saved-list">
      <div class="director-report-template-saved-list__title">云端实例模板层级</div>
      ${groups
        .map(
          (group) => `
            <section class="director-report-template-tree">
              <div class="director-report-template-tree__base">
                <strong>${group.title || "未命名基础模板"}</strong>
                <small>${group.id ? `基础模板 ID：${group.id}` : "没有父基础模板记录"}</small>
              </div>
              ${(group.templates || [])
                .map(
                  (tpl) => `
                    <button class="director-report-template-saved-item director-report-template-tree__instance ${editingId === tpl.id ? "is-editing" : ""}" type="button" data-action="edit-saved-report-template" data-value="${tpl.id}">
                      <span>${tpl.title || "未命名实例模板"}</span>
                      <small>${editingId === tpl.id ? "正在编辑 · " : "编辑此实例 · "}版本 ${tpl.version || 1}${tpl.baseTemplateId ? ` · 父模板 ${group.title || tpl.baseTemplateId}` : ""}</small>
                    </button>
                  `,
                )
                .join("")}
            </section>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderReportTemplateEditor(draft, importState = {}, scheduleSectionId = "", transient = {}, careLevelOptions = [], savedTemplates = [], templateHierarchy = [], editingId = "") {
  if (!draft) return "";
  const editingTemplate = editingId ? savedTemplates.find((tpl) => tpl.id === editingId) : null;
  const isEditingExisting = Boolean(editingTemplate);
  const reportTemplateCareLevelOptions = [
    { value: "all", label: "全部护理等级" },
    ...(careLevelOptions || []).map((item) => ({ value: item, label: item })),
  ];

  const importedTemplate = importState.selectedTemplateId
    ? (importState.templates || []).find((t) => t.id === importState.selectedTemplateId)
    : null;
  const baseTemplateId = draft.baseTemplateId || "";
  const baseTemplateGroup = baseTemplateId ? (templateHierarchy || []).find((group) => group.id === baseTemplateId) : null;
  const baseTemplateName = importedTemplate?.id === baseTemplateId
    ? importedTemplate.title || importedTemplate.id
    : baseTemplateGroup?.title || baseTemplateId;

  return `
    <section class="director-report-template-modal">
      <button class="director-care-record-preview__backdrop" data-action="close-report-template-editor" aria-label="关闭日报模板编辑"></button>
      <div class="director-report-template-modal__dialog">
        <form class="director-report-template-form" data-daily-report-template-form>
          <div class="director-card__head director-card__head--compact">
            <div>
              <strong>${isEditingExisting ? "编辑实例模板" : "新建实例模板"}</strong>
              <p>${isEditingExisting ? `正在编辑：${editingTemplate.title || editingTemplate.id}` : "当前未选中任何已有实例，保存会创建新模板"}</p>
            </div>
            <div class="director-report-template-head-tools">
              <button class="button button--small button--secondary" type="button" data-action="new-report-template-instance">新建实例</button>
              ${renderStatusPill(`版本 ${draft.version || 1}`, "success")}
            </div>
          </div>

          <div class="director-report-template-import-info">
            ${isEditingExisting ? `当前模式：编辑已有实例 · ${editingTemplate.title || editingId}` : `当前模式：新建实例 · ${baseTemplateName ? `父模板 ${baseTemplateName}` : "请点击“新建实例”选择基础模板"}`}
            ${importedTemplate ? `<br/>当前导入模板：${importedTemplate.title || importedTemplate.id}` : ""}
          </div>

          <div class="director-form-grid">
            <label class="director-field">
              <span>模板名称</span>
              <input name="templateTitle" type="text" value="${draft.title || ""}" />
            </label>
            <label class="director-field">
              <span>护理等级</span>
              <select name="templateCareLevel" class="director-select">
                ${renderSelectOptions(reportTemplateCareLevelOptions, draft.careLevel || "all")}
              </select>
            </label>
          </div>

          <div class="director-report-template-sections">
            ${(draft.sections || []).map((section, index) => renderReportTemplateSectionEditor(section, index, transient)).join("")}

            <div class="director-report-template-add-section">
              <input name="newSectionTitle" type="text" placeholder="新增父标题" value="${transient.newSectionTitle || ""}" />
              <button type="button" data-action="add-report-template-section">+</button>
            </div>
          </div>

          <div class="director-report-template-modal__actions">
            <button class="button button--secondary" type="button" data-action="close-report-template-editor">取消</button>
            <button class="button button--secondary" type="button" data-action="open-report-template-preview">预览</button>
            <button class="button button--primary" type="button" data-action="save-report-template-editor">保存模板</button>
          </div>

          ${renderReportTemplateHierarchy(savedTemplates, templateHierarchy, editingId)}
        </form>
      </div>
      ${renderReportTemplateImportDialog(importState)}
      ${renderReportTemplateSchedulePage(draft, scheduleSectionId)}
    </section>
  `;
}

function renderMonthlyCareSheet(elderName, elderInfo, dayReportsMap, template, targetDay, monthLabel) {
  const sections = (template && template.sections) ? template.sections : [];
  const days = Array.from({ length: targetDay }, (_, i) => i + 1);
  const info = elderInfo || {};

  return `
    <article class="care-record-sheet care-record-sheet--monthly" data-care-record-sheet>
      <header class="care-record-sheet__header">
        <p>${renderCareRecordSheetField(info.institutionName)}</p>
        <h2>护理记录月报表</h2>
        <div class="care-record-sheet__header-meta">
          <span>月份：${monthLabel}</span>
          <span>记录截止：${targetDay}日</span>
        </div>
      </header>

      <section class="care-record-sheet__block">
        <div class="care-record-sheet__section-title">一、基本信息</div>
        <table class="care-record-sheet__table care-record-sheet__table--meta">
          <tbody>
            <tr>
              <th>老人姓名</th>
              <td>${renderCareRecordSheetField(elderName)}</td>
              <th>房间号</th>
              <td>${renderCareRecordSheetField(info.room)}</td>
            </tr>
            <tr>
              <th>性别 / 年龄</th>
              <td>${renderCareRecordSheetField(info.gender)} / ${renderCareRecordSheetField(info.age)} 岁</td>
              <th>床位号</th>
              <td>${renderCareRecordSheetField(info.bed)}</td>
            </tr>
            <tr>
              <th>护理等级</th>
              <td colspan="3" class="care-record-sheet__choices">
                ${renderCareRecordSheetOption(info.careType, "self-care", "自理")}
                ${renderCareRecordSheetOption(info.careType, "semi-care", "半自理")}
                ${renderCareRecordSheetOption(info.careType, "full-care", "全护理")}
              </td>
            </tr>
            <tr>
              <th>护理员</th>
              <td>${renderCareRecordSheetField(info.caregiverName)}</td>
              <th>审核人</th>
              <td>${renderCareRecordSheetField(info.reviewerName)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section class="care-record-sheet__block">
        <div class="care-record-sheet__section-title">二、月度护理记录</div>
        <div class="care-record-sheet__monthly-scroll">
          <table class="care-record-sheet__monthly-table">
            <thead>
              <tr>
                <th class="monthly-group-col">项目</th>
                <th class="monthly-item-col">内容</th>
                ${days.map((day) => `<th class="monthly-day-col">${day}</th>`).join("")}
              </tr>
            </thead>
            <tbody>
              ${sections
                .map((section) =>
                  (section.items || [])
                    .map(
                      (item, itemIndex) => `
                        <tr>
                          ${
                            itemIndex === 0
                              ? `<th class="monthly-group-col" rowspan="${Math.max(1, (section.items || []).length)}">${section.title}</th>`
                              : ""
                          }
                          <td class="monthly-item-col">
                            ${item.label}
                            ${item.timeWindow ? `<small>${item.timeWindow}</small>` : ""}
                          </td>
                          ${days
                            .map((day) => {
                              const report = dayReportsMap.get(day);
                              return `<td class="monthly-day-col">${report && report.reportItems && report.reportItems[item.id] ? renderCareRecordSheetMark(true) : ""}</td>`;
                            })
                            .join("")}
                        </tr>
                      `,
                    )
                    .join(""),
                )
                .join("")}
              <tr>
                <th class="monthly-group-col">备注</th>
                <td class="monthly-item-col">备注</td>
                ${days.map(() => '<td class="monthly-day-col"></td>').join("")}
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </article>
  `;
}

function renderMonthlyCareSheetFromTasks(sheet, index, monthLabel) {
  const elder = sheet.elder || {};
  const days = Array.from({ length: index.daysInMonth }, (_, i) => i + 1);
  const caregiver = getResponsibleCaregiverForElder(elder, { tasks: index.tasks, caregivers: index.caregivers || [] });
  const templateSections = sheet.template?.sections || [];

  const getTaskForItemDay = (item, day) => {
    const date = getCalendarDateKey(index.year, index.month, day);
    return getTemplateItemKeys(item)
      .map((key) => sheet.tasksByDateAndItem.get(`${date}|${key}`))
      .find(Boolean);
  };

  const renderTaskPeriodCell = (item, period) => {
    const periodTasks = period.days
      .map((day) => {
        const date = getCalendarDateKey(index.year, index.month, day);
        const task = getTaskForItemDay(item, day);
        return task ? { task, date } : null;
      })
      .filter(Boolean);
    const completed = periodTasks.some(({ task }) => isReportTaskCompleted(task));
    const hasNotDueTask = period.days.some((day) => {
      const date = getCalendarDateKey(index.year, index.month, day);
      const task = getTaskForItemDay(item, day);
      if (task) return isReportTaskNotDue(task, date, index.today, index.nowMinutes);
      return !index.today || date >= index.today;
    });
    const mark = completed ? "✓" : hasNotDueTask ? "" : "×";
    return `<td class="monthly-day-col ${period.span > 1 ? "is-merged-period" : ""}" colspan="${period.span}">${mark}</td>`;
  };

  return `
    <article class="care-record-sheet care-record-sheet--monthly" data-care-record-sheet>
      <header class="care-record-sheet__header">
        <p>${renderCareRecordSheetField(index.institutionName)} 护理记录</p>
        <div class="care-record-sheet__header-meta">
          <span>老人姓名：${renderCareRecordSheetField(elder.name)}</span>
          <span>房间号：${renderCareRecordSheetField(elder.room)}</span>
          <span>性别：${renderCareRecordSheetField(elder.gender)}</span>
          <span>护理级别：${renderCareRecordSheetField(elder.level)}</span>
          <span>责任护理员：${renderCareRecordSheetField(caregiver.name)}</span>
          <span>${monthLabel}</span>
        </div>
      </header>

      <section class="care-record-sheet__block">
        <div class="care-record-sheet__monthly-scroll">
          <table class="care-record-sheet__monthly-table">
            <thead>
              <tr>
                <th class="monthly-group-col">项目</th>
                <th class="monthly-item-col">内容</th>
                ${days.map((day) => `<th class="monthly-day-col">${day}</th>`).join("")}
              </tr>
            </thead>
            <tbody>
              ${templateSections
                .map((section) => {
                  const items = section.items || [];
                  return items
                    .map(
                      (item, itemIndex) => `
                        <tr>
                          ${
                            itemIndex === 0
                              ? `<th class="monthly-group-col" rowspan="${Math.max(1, items.length)}">${section.title || "护理项目"}</th>`
                              : ""
                          }
                          <td class="monthly-item-col">${item.label || item.title || "未命名任务"}</td>
                          ${getReportTemplateItemPeriods(item, index.daysInMonth).map((period) => renderTaskPeriodCell(item, period)).join("")}
                        </tr>
                      `,
                    )
                    .join("");
                })
                .join("")}
              <tr>
                <th class="monthly-group-col">备注</th>
                <td class="monthly-item-col">备注</td>
                ${days.map(() => '<td class="monthly-day-col"></td>').join("")}
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </article>
  `;
}

function renderCareRecordSheetMark(checked) {
  return `<span class="care-record-sheet__mark">${checked ? "☑" : "☐"}</span>`;
}

function renderCareRecordSheetField(value) {
  return value ? String(value) : "__________";
}

function renderCareRecordSheetOption(value, expected, label) {
  return `<span class="care-record-sheet__choice">${renderCareRecordSheetMark(value === expected)}${label}</span>`;
}

function renderCareRecordSheet(record) {
  const templateSections = record.reportTemplateSnapshot?.sections || [];
  const dailyRows = [
    [
      ["晨间护理", record.dailyCare?.morningCare],
      ["晚间护理", record.dailyCare?.eveningCare],
    ],
    [
      ["喂水", record.dailyCare?.feedingWater],
      ["喂饭", record.dailyCare?.feedingMeal],
    ],
    [
      ["洗漱", record.dailyCare?.hygiene],
      ["穿衣整理", record.dailyCare?.dressing],
    ],
    [
      ["定时翻身", record.dailyCare?.turning],
      ["协助如厕", record.dailyCare?.toiletAssist],
    ],
    [
      ["更换尿不湿 / 护垫", record.dailyCare?.diaperPadChange],
      ["洗澡 / 擦身", record.dailyCare?.bathWipe],
    ],
  ];
  const healthItems = [
    ["无异常", record.health?.none],
    ["食欲差", record.health?.appetitePoor],
    ["睡眠不佳", record.health?.sleepPoor],
    ["头晕 / 头痛", record.health?.dizziness],
    ["恶心 / 呕吐", record.health?.nausea],
    ["腹泻 / 便秘", record.health?.bowelIssue],
    ["皮肤异常", record.health?.skinIssue],
    ["摔倒 / 磕碰", record.health?.fall],
    ["其他", Boolean(record.health?.other)],
  ];
  const dailyReportContent = templateSections.length
    ? `
      <table class="care-record-sheet__table">
        <tbody>
          ${templateSections
            .map(
              (section) => `
                <tr>
                  <th>${section.title}</th>
                  <td class="care-record-sheet__choices" colspan="2">
                    ${(section.items || [])
                      .map(
                        (item) => `
                          <span class="care-record-sheet__choice">
                            ${renderCareRecordSheetMark(Boolean(record.reportItems?.[item.id]))}
                            ${item.label}
                          </span>
                        `,
                      )
                      .join("")}
                  </td>
                </tr>
              `,
            )
            .join("")}
        </tbody>
      </table>
    `
    : `
      <table class="care-record-sheet__table">
        <tbody>
          ${dailyRows
            .map(
              (row) => `
                <tr>
                  ${row
                    .map(
                      ([label, checked]) => `
                        <td class="care-record-sheet__check-cell">
                          ${renderCareRecordSheetMark(Boolean(checked))}
                          <span>${label}</span>
                          <em>已完成</em>
                        </td>
                      `,
                    )
                    .join("")}
                </tr>
              `,
            )
            .join("")}
        </tbody>
      </table>
    `;

  return `
    <article class="care-record-sheet" data-care-record-sheet>
      <header class="care-record-sheet__header">
        <p>${renderCareRecordSheetField(record.institutionName)}</p>
        <h2>监管归档表（A4）</h2>
        <div class="care-record-sheet__header-meta">
          <span>记录日期：${renderCareRecordSheetField(record.recordDate)}</span>
          <span>记录时间：${renderCareRecordSheetField(record.recordTime)}</span>
        </div>
      </header>

      <section class="care-record-sheet__block">
        <div class="care-record-sheet__section-title">一、基本信息</div>
        <table class="care-record-sheet__table care-record-sheet__table--meta">
          <tbody>
            <tr>
              <th>养老院名称</th>
              <td colspan="3">${renderCareRecordSheetField(record.institutionName)}</td>
            </tr>
            <tr>
              <th>老人姓名</th>
              <td>${renderCareRecordSheetField(record.elderName)}</td>
              <th>房间号</th>
              <td>${renderCareRecordSheetField(record.room)}</td>
            </tr>
            <tr>
              <th>性别 / 年龄</th>
              <td>${renderCareRecordSheetField(record.gender)} / ${renderCareRecordSheetField(record.age)} 岁</td>
              <th>床位号</th>
              <td>${renderCareRecordSheetField(record.bed)}</td>
            </tr>
            <tr>
              <th>护理等级</th>
              <td colspan="3" class="care-record-sheet__choices">
                ${renderCareRecordSheetOption(record.careType, "self-care", "自理")}
                ${renderCareRecordSheetOption(record.careType, "semi-care", "半自理")}
                ${renderCareRecordSheetOption(record.careType, "full-care", "全护理")}
              </td>
            </tr>
            <tr>
              <th>护理员</th>
              <td>${renderCareRecordSheetField(record.caregiverName)}</td>
              <th>审核人</th>
              <td>${renderCareRecordSheetField(record.reviewerName)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section class="care-record-sheet__block">
        <div class="care-record-sheet__section-title">二、日报项目记录</div>
        ${dailyReportContent}
      </section>

      <section class="care-record-sheet__block">
        <div class="care-record-sheet__section-title">三、服药记录</div>
        <table class="care-record-sheet__table">
          <tbody>
            <tr>
              <td>${renderCareRecordSheetMark(Boolean(record.medication?.morning))}<span>上午服药</span><em>已服</em></td>
              <td>${renderCareRecordSheetMark(Boolean(record.medication?.afternoon))}<span>下午服药</span><em>已服</em></td>
              <td>${renderCareRecordSheetMark(Boolean(record.medication?.evening))}<span>晚上服药</span><em>已服</em></td>
            </tr>
            <tr>
              <td colspan="3" class="care-record-sheet__choices">
                <span>特殊用药：</span>
                ${renderCareRecordSheetOption(record.medication?.specialStatus, "taken", "已服")}
                ${renderCareRecordSheetOption(record.medication?.specialStatus, "none", "无")}
              </td>
            </tr>
            <tr>
              <th>常用药物</th>
              <td colspan="2">${renderCareRecordSheetField(record.medication?.commonDrugs)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section class="care-record-sheet__block">
        <div class="care-record-sheet__section-title">四、健康状况与异常记录</div>
        <div class="care-record-sheet__check-grid">
          ${healthItems
            .map(
              ([label, checked]) => `
                <div class="care-record-sheet__check-pill">
                  ${renderCareRecordSheetMark(Boolean(checked))}
                  <span>${label}${label === "其他" && record.health?.other ? `：${record.health.other}` : ""}</span>
                </div>
              `,
            )
            .join("")}
        </div>
        <div class="care-record-sheet__paragraph">
          <strong>处理情况：</strong>
          <span>${renderCareRecordSheetField(record.health?.treatment)}</span>
        </div>
      </section>

      <section class="care-record-sheet__block">
        <div class="care-record-sheet__section-title">五、物品库存提醒</div>
        <table class="care-record-sheet__table">
          <tbody>
            <tr>
              <th>药品</th>
              <td class="care-record-sheet__choices">
                ${renderCareRecordSheetOption(record.inventory?.medicine, "enough", "充足")}
                ${renderCareRecordSheetOption(record.inventory?.medicine, "refill", "需补充")}
              </td>
            </tr>
            <tr>
              <th>尿不湿</th>
              <td class="care-record-sheet__choices">
                ${renderCareRecordSheetOption(record.inventory?.diaper, "enough", "充足")}
                ${renderCareRecordSheetOption(record.inventory?.diaper, "refill", "需补充")}
              </td>
            </tr>
            <tr>
              <th>护垫</th>
              <td class="care-record-sheet__choices">
                ${renderCareRecordSheetOption(record.inventory?.pad, "enough", "充足")}
                ${renderCareRecordSheetOption(record.inventory?.pad, "refill", "需补充")}
              </td>
            </tr>
            <tr>
              <th>生活用品</th>
              <td class="care-record-sheet__choices">
                ${renderCareRecordSheetOption(record.inventory?.supplies, "enough", "充足")}
                ${renderCareRecordSheetOption(record.inventory?.supplies, "refill", "需补充")}
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section class="care-record-sheet__block">
        <div class="care-record-sheet__section-title">六、签字确认</div>
        <div class="care-record-sheet__signature-grid">
          <div>
            <strong>护理员签名：</strong>
            <span>${renderCareRecordSheetField(record.signatures?.caregiverSign)}</span>
          </div>
          <div>
            <strong>审核人签名：</strong>
            <span>${renderCareRecordSheetField(record.signatures?.reviewerSign)}</span>
          </div>
        </div>
        <div class="care-record-sheet__paragraph">
          <strong>备注：</strong>
          <span>${renderCareRecordSheetField(record.signatures?.remark)}</span>
        </div>
      </section>
    </article>
  `;
}

export function renderDirectorCareRecordsPage({ state, selectors }) {
  return `
    <section class="director-page director-page--care-records">
      ${renderDirectorHeader(
        "日报收件箱（云端）",
        state.director.date,
        `<button class="button button--small button--primary" data-action="open-report-template-editor">编辑日报模板</button>`,
      )}

      <div class="director-stack">
        ${renderDirectorInboxCalendar(state, selectors)}
      </div>

      ${renderDirectorInboxDayDialog(state, selectors)}
      ${renderDirectorInboxExportDialog(state, selectors)}
      ${renderDirectorCareRecordPreview(state, selectors)}
      ${renderReportTemplateEditor(
        selectors.directorReportTemplateDraft,
        selectors.directorReportTemplateImport,
        selectors.directorReportTemplateScheduleSectionId,
        selectors.directorReportTemplateTransient,
        selectors.careLevelOptions,
        Object.values(state.dailyReportTemplates || {}),
        selectors.dailyReportTemplateHierarchy,
        selectors.directorReportTemplateEditingId,
      )}
      ${renderReportTemplatePreviewOverlay(
        selectors.directorReportTemplateDraft,
        state.ui.directorReportTemplatePreviewOpen,
        state.ui.directorReportTemplatePreviewZoom,
      )}
    </section>
  `;

  const record = selectors.directorCareRecordDraft;
  const summary = selectors.directorCareRecordSummary;
  const cloudStatus = selectors.cloudStatus;
  const cloudReports = selectors.directorFilteredCloudReports;
  const inboxSummary = selectors.directorInboxSummary;
  const dailyReportTemplate = selectors.dailyReportTemplate || record.reportTemplateSnapshot || {};
  const templateItemCount = countReportTemplateItems(dailyReportTemplate);

  return `
    <section class="director-page director-page--care-records">
      ${renderDirectorHeader(
        "日报收件箱（云端）",
        state.director.date,
        `<button class="button button--small button--primary" data-action="open-report-template-editor">编辑日报模板</button>`,
      )}

      <div class="director-stack">
        ${renderDirectorAuditFilters(selectors)}
        ${renderProjectAuditPanel(selectors)}

        <article class="director-card director-card--dense director-report-template-summary">
          <div class="director-card__head director-card__head--compact">
            <div>
              <strong>${dailyReportTemplate.title || "护理记录日报模板"}</strong>
              <small>${(dailyReportTemplate.sections || []).length} 个栏目 · ${templateItemCount} 个项目</small>
            </div>
            <button class="director-inline-link" data-action="open-report-template-editor">修改栏目</button>
          </div>
        </article>

        <article class="director-card director-card--dense director-cloud-panel">
          <div class="director-card__head director-card__head--compact">
            <div>
              <strong>日报收件箱（云端）</strong>
              <p>来自护工提交的日报，点开生成监管归档表（A4）。</p>
            </div>
            <div class="director-inline-actions">
              <button class="director-inline-link" data-action="export-director-inbox-excel">导出Excel清单</button>
              <button class="director-inline-link" data-action="refresh-cloud-care-records">
                ${cloudStatus.loading ? "刷新中" : "立即刷新"}
              </button>
            </div>
          </div>
          <div class="director-cloud-panel__meta">
            ${renderStatusPill(cloudStatus.configured ? "已连接云端" : "未配置云端", cloudStatus.configured ? "success" : "warning")}
            ${cloudStatus.fetchedAt ? renderStatusPill(`最近 ${cloudStatus.fetchedAt.slice(11, 16)}`, "primary") : ""}
            ${renderStatusPill(`筛选 ${inboxSummary.total}/${cloudStatus.count} 条`, "success")}
            ${renderStatusPill(`异常 ${inboxSummary.issue}`, inboxSummary.issue ? "warning" : "success")}
            ${renderStatusPill(`用药 ${inboxSummary.medication}`, "primary")}
          </div>
          ${
            cloudStatus.error
              ? `<div class="care-report-syncbar care-report-syncbar--error">${cloudStatus.error}</div>`
              : ""
          }
          <div class="director-cloud-records">
            ${
              cloudReports.length
                ? cloudReports.map((item) => renderCloudCareRecordItem(item, record?.id)).join("")
                : `<div class="director-cloud-records__empty">当前筛选下没有交班日报，可调整楼层、日期或护理项目。</div>`
            }
          </div>
        </article>

        <article class="director-card director-card--dense director-care-record-intro">
            <div>
              <strong>护工交班日报回填后生成监管归档表（A4）</strong>
              <p>收件箱负责接收输入；A4 预览层负责打印留档、迎检抽查、保存 PDF 和导出图片。</p>
            </div>
          <div class="director-care-record-summary-row">
            ${renderStatusPill(`日常 ${summary.dailyCount} 项`, "success")}
            ${renderStatusPill(`服药 ${summary.medicationCount} 项`, "primary")}
            ${renderStatusPill(`异常 ${summary.issueCount} 项`, summary.issueCount ? "warning" : "success")}
            ${renderStatusPill(`补货 ${summary.refillCount} 项`, summary.refillCount ? "warning" : "success")}
          </div>
        </article>

        <form class="director-care-record-form" data-care-record-form>
          <article class="director-editor-card">
            <div class="director-card__head director-card__head--compact">
              <div>
                <strong>记录范围</strong>
                <small>先选老人和记录时间，再做勾选。机构名称、房间、床位和护工会自动带出。</small>
              </div>
            </div>

            <div class="director-form-grid">
              <label class="director-field">
                <span>养老院名称</span>
                <input name="institutionName" type="text" value="${record.institutionName || ""}" />
              </label>
              <label class="director-field">
                <span>老人</span>
                <select name="elderId" class="director-select" data-care-record-elder>
                  ${renderSelectOptions(
                    selectors.directorCareRecordElders.map((item) => ({ value: item.id, label: item.label })),
                    record.elderId,
                  )}
                </select>
              </label>
            </div>

            <div class="director-form-grid director-form-grid--compact">
              <label class="director-field">
                <span>性别</span>
                <input name="gender" type="text" value="${record.gender || ""}" readonly />
              </label>
              <label class="director-field">
                <span>年龄</span>
                <input name="age" type="text" value="${record.age || ""}" readonly />
              </label>
              <label class="director-field">
                <span>房间号</span>
                <input name="room" type="text" value="${record.room || ""}" readonly />
              </label>
            </div>

            <div class="director-form-grid director-form-grid--compact">
              <label class="director-field">
                <span>床位号</span>
                <input name="bed" type="text" value="${record.bed || ""}" readonly />
              </label>
              <label class="director-field">
                <span>记录日期</span>
                <input name="recordDate" type="date" value="${record.recordDate || ""}" />
              </label>
              <label class="director-field">
                <span>记录时间</span>
                <input name="recordTime" type="time" value="${record.recordTime || ""}" />
              </label>
            </div>

            <label class="director-field director-field--full">
              <span>护理等级</span>
              <span class="director-check-chip-row director-check-chip-row--record">
                ${renderCareRecordRadioOption("careType", "self-care", "自理", record.careType)}
                ${renderCareRecordRadioOption("careType", "semi-care", "半自理", record.careType)}
                ${renderCareRecordRadioOption("careType", "full-care", "全护理", record.careType)}
              </span>
            </label>

            <div class="director-form-grid">
              <label class="director-field">
                <span>护理员</span>
                <input name="caregiverName" type="text" value="${record.caregiverName || ""}" />
              </label>
              <label class="director-field">
                <span>审核人</span>
                <input name="reviewerName" type="text" value="${record.reviewerName || ""}" />
              </label>
            </div>

            <input name="elderName" type="hidden" value="${record.elderName || ""}" />
          </article>

          <article class="director-editor-card">
            <div class="director-card__head director-card__head--compact">
              <div>
                <strong>日报项目</strong>
                <small>${record.reportTemplateSnapshot?.title || dailyReportTemplate.title || "护理记录日报模板"}</small>
              </div>
              ${renderStatusPill(`已选 ${countCheckedReportItems(record)} 项`, "success")}
            </div>
            ${renderReportTemplateFields(record, record.reportTemplateSnapshot || dailyReportTemplate)}
          </article>

          <article class="director-editor-card">
            <div class="director-card__head director-card__head--compact">
              <div>
                <strong>服药记录</strong>
                <small>把已执行的时段勾上，特殊用药单独标记。</small>
              </div>
            </div>

            <div class="director-check-chip-row director-check-chip-row--record">
              ${renderCareRecordCheckOption("medicationMorning", "上午服药", record.medication?.morning)}
              ${renderCareRecordCheckOption("medicationAfternoon", "下午服药", record.medication?.afternoon)}
              ${renderCareRecordCheckOption("medicationEvening", "晚上服药", record.medication?.evening)}
            </div>

            <label class="director-field director-field--full">
              <span>特殊用药</span>
              <span class="director-check-chip-row director-check-chip-row--record">
                ${renderCareRecordRadioOption("specialMedicationStatus", "taken", "已服", record.medication?.specialStatus)}
                ${renderCareRecordRadioOption("specialMedicationStatus", "none", "无", record.medication?.specialStatus)}
              </span>
            </label>

            <label class="director-field director-field--full">
              <span>常用药物</span>
              <input name="commonDrugs" type="text" value="${record.medication?.commonDrugs || ""}" placeholder="例如：降压片、维生素 D" />
            </label>
          </article>

          <article class="director-editor-card">
            <div class="director-card__head director-card__head--compact">
              <div>
                <strong>健康状况与异常</strong>
                <small>异常项尽量少写长句，交给监管归档表里的“处理情况”承接。</small>
              </div>
            </div>

            <div class="director-check-chip-row director-check-chip-row--record-grid">
              ${renderCareRecordCheckOption("healthNone", "无异常", record.health?.none)}
              ${renderCareRecordCheckOption("healthAppetitePoor", "食欲差", record.health?.appetitePoor)}
              ${renderCareRecordCheckOption("healthSleepPoor", "睡眠不佳", record.health?.sleepPoor)}
              ${renderCareRecordCheckOption("healthDizziness", "头晕 / 头痛", record.health?.dizziness)}
              ${renderCareRecordCheckOption("healthNausea", "恶心 / 呕吐", record.health?.nausea)}
              ${renderCareRecordCheckOption("healthBowelIssue", "腹泻 / 便秘", record.health?.bowelIssue)}
              ${renderCareRecordCheckOption("healthSkinIssue", "皮肤异常", record.health?.skinIssue)}
              ${renderCareRecordCheckOption("healthFall", "摔倒 / 磕碰", record.health?.fall)}
            </div>

            <label class="director-field director-field--full">
              <span>其他异常</span>
              <input name="healthOther" type="text" value="${record.health?.other || ""}" placeholder="可选填写，例如：午后轻微头晕" />
            </label>

            <label class="director-field director-field--full">
              <span>处理情况</span>
              <textarea name="healthTreatment" rows="3" placeholder="例如：已卧床休息，通知值班护士复测血压。">${record.health?.treatment || ""}</textarea>
            </label>
          </article>

          <article class="director-editor-card">
            <div class="director-card__head director-card__head--compact">
              <div>
                <strong>物品库存提醒</strong>
                <small>这里不写数量，只标“充足 / 需补充”，适合快速留档。</small>
              </div>
            </div>

            <div class="director-care-record-status-list">
              <div class="director-care-record-status-row">
                <strong>药品</strong>
                <div class="director-check-chip-row director-check-chip-row--record">
                  ${renderCareRecordRadioOption("inventoryMedicine", "enough", "充足", record.inventory?.medicine)}
                  ${renderCareRecordRadioOption("inventoryMedicine", "refill", "需补充", record.inventory?.medicine)}
                </div>
              </div>
              <div class="director-care-record-status-row">
                <strong>尿不湿</strong>
                <div class="director-check-chip-row director-check-chip-row--record">
                  ${renderCareRecordRadioOption("inventoryDiaper", "enough", "充足", record.inventory?.diaper)}
                  ${renderCareRecordRadioOption("inventoryDiaper", "refill", "需补充", record.inventory?.diaper)}
                </div>
              </div>
              <div class="director-care-record-status-row">
                <strong>护垫</strong>
                <div class="director-check-chip-row director-check-chip-row--record">
                  ${renderCareRecordRadioOption("inventoryPad", "enough", "充足", record.inventory?.pad)}
                  ${renderCareRecordRadioOption("inventoryPad", "refill", "需补充", record.inventory?.pad)}
                </div>
              </div>
              <div class="director-care-record-status-row">
                <strong>生活用品</strong>
                <div class="director-check-chip-row director-check-chip-row--record">
                  ${renderCareRecordRadioOption("inventorySupplies", "enough", "充足", record.inventory?.supplies)}
                  ${renderCareRecordRadioOption("inventorySupplies", "refill", "需补充", record.inventory?.supplies)}
                </div>
              </div>
            </div>
          </article>

          <article class="director-editor-card">
            <div class="director-card__head director-card__head--compact">
              <div>
                <strong>签字确认</strong>
                <small>监管归档表会保留签字栏，打印后可以继续手写补签。</small>
              </div>
            </div>

            <div class="director-form-grid">
              <label class="director-field">
                <span>护理员签名</span>
                <input name="caregiverSign" type="text" value="${record.signatures?.caregiverSign || ""}" placeholder="可先填姓名或留空待打印后签字" />
              </label>
              <label class="director-field">
                <span>审核人签名</span>
                <input name="reviewerSign" type="text" value="${record.signatures?.reviewerSign || ""}" placeholder="可先填姓名或留空待打印后签字" />
              </label>
            </div>

            <label class="director-field director-field--full">
              <span>备注</span>
              <textarea name="remark" rows="3" placeholder="例如：重点关注 101 室老人午后翻身与补水。">${record.signatures?.remark || ""}</textarea>
            </label>
          </article>
        </form>

        <article class="director-card director-card--dense director-care-record-action-card">
          <div>
            <strong>先生成监管归档表（A4），再做打印或导出</strong>
            <p>用于打印留档与迎检抽查。点击后会进入独立的 A4 预览层，可直接打印、另存为 PDF 或导出图片。</p>
          </div>
          <button class="button button--primary button--block" data-action="generate-care-record-preview">生成监管归档表（A4）</button>
        </article>
      </div>

      ${
        state.ui.directorCareRecordPreviewOpen
          ? `
            <section class="director-care-record-preview">
              <button class="director-care-record-preview__backdrop" data-action="close-care-record-preview" aria-label="关闭监管归档表预览"></button>
              <div class="director-care-record-preview__dialog">
                <div class="director-care-record-preview__topbar">
                  <strong>监管归档表（A4）预览</strong>
                </div>
                <div class="director-care-record-preview__body">
                  ${renderCareRecordSheet(record)}
                </div>
                <div class="director-care-record-preview__actions">
                  <button class="button button--secondary" data-action="close-care-record-preview">关闭</button>
                  <button class="button button--secondary" data-action="export-care-record-image">导出图片</button>
                  <button class="button button--primary" data-action="print-care-record">打印 / 保存 PDF</button>
                </div>
              </div>
            </section>
          `
          : ""
      }
      ${renderReportTemplateEditor(
        selectors.directorReportTemplateDraft,
        selectors.directorReportTemplateImport,
        selectors.directorReportTemplateScheduleSectionId,
        selectors.directorReportTemplateTransient,
        selectors.careLevelOptions,
        Object.values(state.dailyReportTemplates || {}),
        selectors.dailyReportTemplateHierarchy,
        selectors.directorReportTemplateEditingId,
      )}
      ${renderReportTemplatePreviewOverlay(
        selectors.directorReportTemplateDraft,
        state.ui.directorReportTemplatePreviewOpen,
        state.ui.directorReportTemplatePreviewZoom,
      )}
    </section>
  `;
}

export function renderDirectorHomePage({ state, selectors }) {
  const { taskProgress, floors } = state.director;
  const syncing = !!state.ui.syncPhase;
  const inventoryMeta = `${state.director.inventorySummary.warningCount} 项预警`;
  const anomalyMeta = `${selectors.directorExceptionReports?.length || 0} 条记录`;
  const issueFloorCount = floors.filter((floor) => floor.error > 0).length;
  const executionRate = taskProgress.executionRate || taskProgress.rate;
  const handledCount = taskProgress.handled ?? taskProgress.completed;
  const overview = selectors.directorTaskOverview || {
    dailyTotal: taskProgress.total,
    expectedDue: 0,
    actualHandled: handledCount,
    temporaryTotal: 0,
    temporaryHandled: 0,
    expectedRate: "0%",
    actualRate: executionRate,
    temporaryRate: "0%",
    exceptionCount: taskProgress.issue || 0,
  };

  return `
    <section class="director-page">
      ${renderDirectorHeader("院长工作台", state.director.date)}
      ${syncing ? `<div class="director-sync-banner"><span id="sync-status">${state.ui.syncPhase || "正在同步数据..."}</span></div>` : ""}

      <div class="director-stack">
        <article class="director-command-center">
          <div class="director-command-center__head">
            <div>
              <p>今日进度</p>
              <div class="director-command-title-row director-command-title-row--overview">
                <h2>任务总览</h2>
                <button type="button" class="director-inline-stat-button" data-action="navigate" data-route="director-statistics">
                  ${renderIcon("chart")}
                  统计
                </button>
              </div>
            </div>
            ${renderStatusPill(issueFloorCount ? `${issueFloorCount} 个楼层需关注` : "运行平稳", issueFloorCount ? "error" : "success")}
          </div>

          <div class="director-command-center__progress">
            <div>
              <span>任务进度</span>
              <strong>${overview.actualRate || executionRate}</strong>
            </div>
            ${renderDirectorTaskOverviewBars(overview)}
          </div>

          <div class="director-command-grid">
            ${renderCommandMetric("预期进度", overview.expectedRate || "0%", `应完成 ${overview.expectedDue || 0}/${overview.dailyTotal || 0}`, "primary")}
            ${renderCommandMetric("实际完成", overview.actualRate || "0%", `已完成 ${overview.actualHandled || 0}/${overview.dailyTotal || 0}`, "success")}
            ${renderCommandMetric("异常事件", `${overview.exceptionCount || 0}`, "员工异常报告", overview.exceptionCount ? "error" : "success")}
          </div>
        </article>

        <article class="director-card">
          <div class="director-card__head">
            <div>
              <h3>楼层状态</h3>
              <p>含异常标记，先看风险楼层再下钻。</p>
            </div>
          </div>
          <div class="director-floor-list">
            ${floors.map(renderFloorStatusRow).join("")}
          </div>
        </article>

        <div class="director-support-grid director-support-grid--overview">
          ${[
            { route: "director-anomaly", icon: "warning", title: "异常", meta: anomalyMeta, tone: "error" },
            { route: "director-inventory", icon: "package", title: "库存", meta: inventoryMeta, tone: "primary" },
          ]
            .map((item) => renderSupportShortcut(item.route, item.icon, item.title, item.meta, item.tone))
            .join("")}
        </div>

      </div>
    </section>
  `;
}

export function renderDirectorAssignmentsPage({ state, selectors }) {
  return `
    <section class="director-page">
      ${renderDirectorHeader("护理任务配置", state.director.date)}

      <div class="director-stack">
        <article class="director-card director-card--dense">
          <div class="director-card__head director-card__head--compact">
            <div>
              <h3>配置逻辑</h3>
              <p>只保留 3 个动作，避免在一屏里同时做太多决定。</p>
            </div>
          </div>
          <div class="director-step-strip">
            <span>1. 建模板</span>
            <span>2. 绑老人</span>
            <span>3. 派特殊任务</span>
          </div>
        </article>

        <div class="director-core-nav director-core-nav--stack">
          ${renderCoreEntry("director-template-library", "note", "任务模板库", "先定义护理任务模板", `${selectors.directorCoreSummary.activeTemplates} 个启用`, "success")}
          ${renderCoreEntry("director-care-plans", "users", "老人护理方案", "给楼层/房间中的老人启用任务", `${selectors.directorCoreSummary.configuredResidents} 位已配置`, "primary")}
          ${renderCoreEntry("director-dispatch", "warning", "今日发布与负载", "只处理需要人工介入的特殊任务", `${selectors.dispatchSummary.pendingCount} 项待分配`, "warning")}
        </div>
      </div>
    </section>
  `;
}

export function renderDirectorTemplateLibraryPage({ state, selectors }) {
  const templateSearchAction = `
    <label class="director-header-search director-header-search--template ${state.ui.directorTemplateSearch ? "has-value" : ""}">
      ${renderIcon("search")}
      <input type="text" value="${state.ui.directorTemplateSearch || ""}" placeholder="" aria-label="搜索模板名称或分类" data-director-template-search />
    </label>
  `;

  return `
    <section class="director-page">
      ${renderDirectorHeader("任务模板库", state.director.date, templateSearchAction)}

      <div class="director-stack">
        <article class="director-card director-card--dense">
          <div class="director-card__head director-card__head--toolbar">
            <div>
              <h3>模板管理</h3>
            </div>
            <button
              class="button button--small button--primary"
              data-action="create-template"
              data-value="daily"
            >
              + 新增模板
            </button>
          </div>
        </article>

        ${renderTemplateDraftForm(selectors.directorTemplateDraft)}

        ${
          selectors.visibleTemplateGroups.length
            ? selectors.visibleTemplateGroups
                .map(
                  (group) => `
                    <section class="director-panel">
                      <div class="director-panel__head">
                        <div>
                          <strong>${group.label}</strong>
                          ${group.helper ? `<small>${group.helper}</small>` : ""}
                        </div>
                        ${renderStatusPill(`${group.items.length} 个`, "success")}
                      </div>
                      <div class="director-list">
                        ${group.items.map(renderTemplateRow).join("")}
                      </div>
                    </section>
                  `,
                )
                .join("")
            : '<div class="empty-state empty-state--soft">当前筛选条件下没有模板。</div>'
        }
      </div>
    </section>
  `;
}

export function renderDirectorCarePlansPage({ state, selectors }) {
  const selectedFloor = selectors.directorPlanFloors.find((item) => item.selected);
  const selectedResident = selectors.selectedDirectorPlanResident;
  const selectedPlan = selectors.selectedDirectorPlan;
  const isTimelineOpen = Boolean(state.ui.directorPlanTimelineOpen && selectedResident && !selectors.directorPlanDraft);
  const isTimelineSettled = Boolean(isTimelineOpen && state.ui.directorPlanTimelineSettled);
  const planHeaderPrimaryActions = selectors.directorPlanDraft
    ? ""
    : `
      <div class="director-plan-header-actions">
        <button type="button" class="director-header-action-button" data-action="open-director-temporary-task">
          发布临时任务
        </button>
        <button type="button" class="director-header-action-button director-header-action-button--soft" data-action="navigate" data-route="director-care-records">
          日报收件箱
        </button>
      </div>
    `;
  const planHeaderActions = planHeaderPrimaryActions;
  const floorSummary = selectedFloor
    ? `${selectedFloor.elderCount}位老人 · ${selectedFloor.enabledCount}项已启用`
    : "先选择楼层，再查看对应老人的护理方案。";

  return `
    <section class="director-page director-page--care-plans">
      <div class="director-plan-shell ${isTimelineOpen ? "is-timeline-open" : ""} ${isTimelineSettled ? "is-timeline-settled" : ""}">
        ${
          selectors.directorPlanDraft
            ? ""
            : renderPlanTimelineSidebar(selectedPlan, selectedResident, isTimelineOpen, state.tasks, state)
        }
        ${
          selectors.directorPlanDraft
            ? ""
            : renderPlanResidentDrawer(selectedResident, selectors.directorPlanResidentOptions, isTimelineOpen)
        }

        ${isTimelineOpen ? '<button class="director-plan-shell-backdrop" data-action="close-director-plan-timeline" aria-label="收起抽屉"></button>' : ""}

        <section class="director-plan-main">
          <div class="director-page__inner director-page__inner--care-plans ${isTimelineOpen ? "is-timeline-open" : ""}">
            ${renderDirectorHeader("老人护理方案", state.director.date, planHeaderActions)}

            <div class="director-stack director-stack--care-plans ${isTimelineOpen ? "is-timeline-open" : ""}">
              ${
                selectors.directorPlanDraft
                  ? `
                    <article class="director-plan-context director-plan-context--editing">
                      <div>
                        <strong>当前进入方案编辑层</strong>
                        <small>编辑内容单独展开，避免和楼层切换、老人选择混在同一屏。</small>
                      </div>
                      <button type="button" class="button button--small button--muted" data-action="close-plan-draft">返回概览</button>
                    </article>
                    ${renderPlanDraftForm(selectors.directorPlanDraft, selectors, selectedResident, state)}
                  `
                  : `
                    <div class="director-plan-floor-strip ${isTimelineOpen ? "is-background" : ""}">
                      ${selectors.directorPlanFloors
                        .map(
                          (item) => `
                            <button
                              class="director-plan-floor-pill ${item.selected ? "is-active" : ""}"
                              data-action="select-director-plan-floor"
                              data-value="${item.floor}"
                            >
                              <strong>${item.floor}F</strong>
                              <span><em class="director-plan-floor-pill__label">成员数：</em>${item.elderCount}个</span>
                              <span><em class="director-plan-floor-pill__label">护工：</em>${item.caregiverCount}名</span>
                            </button>
                          `,
                        )
                        .join("")}
                    </div>

                    ${
                      isTimelineOpen
                        ? ""
                        : `
                          ${renderFloorStaffDetail(selectedFloor, selectors.directorPlanFloorStaff, selectors.unassignedPlanFloorResidents)}

                          <article class="director-panel director-panel--resident-picker director-panel--resident-picker-large">
                            <div class="director-panel__head director-panel__head--compact">
                              <div>
                                <strong>${selectedFloor ? `${selectedFloor.floor}F 切换老人` : "切换老人"}</strong>
                                <small>${selectedResident ? `当前：${selectedResident.room}室 · ${selectedResident.elderName}` : "先选一位老人"}</small>
                              </div>
                              ${renderStatusPill(`${selectors.directorPlanRooms.length}位`, "success")}
                            </div>

                            <div class="director-plan-resident-strip director-plan-resident-strip--large">
                              ${
                                selectors.directorPlanRooms.length
                                  ? selectors.directorPlanRooms.map(renderResidentRow).join("")
                                  : '<div class="empty-state empty-state--soft">没有匹配到老人。</div>'
                              }
                            </div>
                          </article>

                          ${renderCaregiverLoadChart(selectors.caregiverLoads)}
                        `
                    }
                  `
              }
            </div>
          </div>
        </section>
      </div>
      ${renderDirectorDispatchDraftDialog(selectors.directorDispatchDraft, selectors)}
      ${renderDirectorPlanNoteDraftDialog(selectors.directorPlanNoteDraft)}
      ${renderDirectorPlanTemporaryDialog(selectors.directorPlanTemporaryDialog)}
    </section>
  `;
}

export function renderDirectorDispatchPage({ state, selectors }) {
  return `
    <section class="director-page">
      ${renderDirectorHeader("今日发布与负载", state.director.date)}

      <div class="director-stack">
        <div class="director-kpi-grid director-kpi-grid--strip">
          ${renderDispatchFilterStat("待分配", selectors.dispatchSummary.pendingCount, "warning", "pending", state.ui.directorDispatchFilter)}
          ${renderDispatchFilterStat("紧急", selectors.dispatchSummary.urgentCount, "error", "urgent", state.ui.directorDispatchFilter)}
          ${renderDispatchFilterStat("已发布", selectors.dispatchSummary.assignedCount, "success", "assigned", state.ui.directorDispatchFilter)}
        </div>

        <div class="director-list">
          ${
            selectors.visibleDispatchTasks.length
              ? selectors.visibleDispatchTasks.map(renderDispatchTaskCard).join("")
              : '<div class="empty-state empty-state--soft">当前筛选条件下没有需要处理的特殊任务。</div>'
          }
        </div>

        <article class="director-panel">
          <div class="director-panel__head">
            <div>
              <strong>护工实时负载</strong>
              <small>先看负载，再决定是否跨楼层调度。</small>
            </div>
          </div>
          <div class="director-list">
            ${selectors.caregiverLoads.map(renderLoadRow).join("")}
          </div>
        </article>
      </div>
      ${renderDirectorDispatchDraftDialog(selectors.directorDispatchDraft, selectors)}
    </section>
  `;
}

export function renderDirectorFloorDetailPage({ state, selectors }) {
  return `
    <section class="director-page">
      ${renderDirectorHeader(`${state.ui.selectedDirectorFloor} 楼层状态`, state.director.date)}

      <div class="director-stack">
        ${renderDirectorFloorCaregiverProgressPanel(selectors)}
        ${renderDirectorFloorCalendarButton(selectors)}
        ${renderDirectorFloorElderList(selectors)}
      </div>
    </section>
  `;
}

export function renderDirectorCaregiverPage({ state, selectors }) {
  return `
    <section class="director-page">
      ${renderDirectorHeader("护工效能监管", state.director.date)}

      <div class="director-stack">
        <div class="director-record-list">
          ${selectors.caregiverLoads
            .map(
              (item) => `
                <article class="director-card director-card--dense">
                  <div class="director-card__head director-card__head--compact">
                    <span class="director-record-card__identity">
                      ${renderAvatar(item.name)}
                      <span>
                        <strong>${item.name}</strong>
                        <small>负责楼层：${item.floor}F</small>
                      </span>
                    </span>
                    <span class="director-rate ${item.riskCount > 0 ? "is-warning" : "is-success"}">
                      ${item.assignedCount ? `${Math.round(((item.assignedCount - item.pendingCount) / item.assignedCount) * 100)}%` : "0%"}
                    </span>
                  </div>
                  <div class="director-kpi-grid director-kpi-grid--mini">
                    <div>
                      <strong>${item.assignedCount}</strong>
                      <small>已分配</small>
                    </div>
                    <div>
                      <strong>${item.pendingCount}</strong>
                      <small>待完成</small>
                    </div>
                    <div>
                      <strong>${item.riskCount}</strong>
                      <small>异常次数</small>
                    </div>
                  </div>
                </article>
              `,
            )
            .join("")}
        </div>
      </div>
    </section>
  `;
}

function renderPersonnelDraftDialog(draft, selectors, state) {
  if (!draft) return "";

  const type = draft.type === "elder" ? "elder" : "caregiver";
  const isElder = type === "elder";
  const isEdit = draft.mode === "edit";
  const current = isEdit
    ? isElder
      ? state.elders.find((item) => item.id === draft.id)
      : state.caregivers.find((item) => item.id === draft.id)
    : null;
  const floorOptions = [1, 2, 3, 4, 5].map((floor) => ({ value: floor, label: `${floor}F` }));
  const shiftOptions = (state.attendance?.shiftTemplates || [
    { id: "morning", name: "早班", start: "07:00", end: "15:00" },
    { id: "afternoon", name: "午班", start: "15:00", end: "23:00" },
    { id: "night", name: "晚班", start: "23:00", end: "07:00" },
  ]).map((shift) => ({ value: shift.id, label: `${shift.name} ${shift.start}-${shift.end}` }));
  const genderOptions = [
    { value: "女", label: "女" },
    { value: "男", label: "男" },
  ];
  const reportTemplateOptions = [...(selectors.dailyReportTemplateOptions || [])];
  const selectedReportTemplateId =
    reportTemplateOptions.some((option) => option.value === current?.reportTemplateId)
      ? current.reportTemplateId
      : selectors.dailyReportTemplate?.id || reportTemplateOptions[0]?.value || "daily-report-basic";

  return `
    <div class="director-dialog-backdrop" data-action="close-personnel-draft"></div>
    <section class="director-dialog-shell director-dialog-shell--people">
      <article class="director-dialog-card director-dialog-card--people">
        <div class="director-dialog-head">
          <div>
            <strong>${isEdit ? "编辑" : "新增"}${isElder ? "老人" : "护工"}</strong>
          </div>
          <button type="button" class="icon-button" data-action="close-personnel-draft" aria-label="关闭">
            ${renderIcon("close")}
          </button>
        </div>

        <form class="director-people-form director-people-form--dialog" data-personnel-form="${type}">
          ${
            isElder
              ? `
                <label class="director-field">
                  <span>姓名</span>
                  <input name="name" type="text" placeholder="老人姓名" value="${current?.name || ""}" />
                </label>
                <label class="director-field">
                  <span>房间号</span>
                  <input name="room" type="text" placeholder="如 106" value="${current?.room || ""}" />
                </label>
                <label class="director-field">
                  <span>楼层</span>
                  <select name="floor" class="director-select">
                    ${renderSelectOptions(floorOptions, current?.floor || 1)}
                  </select>
                </label>
                <label class="director-field">
                  <span>性别</span>
                  <select name="gender" class="director-select">
                    ${renderSelectOptions(genderOptions, current?.gender || "女")}
                  </select>
                </label>
                <label class="director-field">
                  <span>年龄</span>
                  <input name="age" type="number" min="1" max="120" placeholder="80" value="${current?.age || ""}" />
                </label>
                <label class="director-field">
                  <span>日报</span>
                  <select name="reportTemplateId" class="director-select">
                    ${renderSelectOptions(
                      reportTemplateOptions.length
                        ? reportTemplateOptions
                        : [{ value: "daily-report-basic", label: "护理记录日报模板" }],
                      selectedReportTemplateId,
                    )}
                  </select>
                </label>
                <label class="director-field">
                  <span>联系人</span>
                  <input name="familyContact" type="text" placeholder="家属：姓名" value="${current?.familyContact || ""}" />
                </label>
                <label class="director-field">
                  <span>联系电话</span>
                  <input name="familyPhone" type="tel" placeholder="手机号" value="${current?.familyPhone || ""}" />
                </label>
                <label class="director-field director-field--full">
                  <span>标签</span>
                  <input name="tags" type="text" placeholder="用逗号分隔，如 高血压,用药提醒" value="${Array.isArray(current?.tags) ? current.tags.join(",") : ""}" />
                </label>
                <label class="director-field">
                  <span>家属登录账号</span>
                  <input name="username" type="text" placeholder="家属登录用户名" value="${current?.username || ""}" />
                </label>
                <label class="director-field">
                  <span>家属登录密码</span>
                  <input name="password" type="password" placeholder="${isEdit ? "留空则不修改" : "至少8位"}" value="" />
                </label>
              `
              : `
                <label class="director-field">
                  <span>姓名</span>
                  <input name="name" type="text" placeholder="护工姓名" value="${current?.name || ""}" />
                </label>
                <label class="director-field">
                  <span>岗位</span>
                  <input name="role" type="text" placeholder="护工" value="${current?.role || ""}" />
                </label>
                <label class="director-field">
                  <span>工号</span>
                  <input name="employeeNo" type="text" placeholder="自动生成" value="${current?.employeeNo || ""}" />
                </label>
                <label class="director-field">
                  <span>负责楼层</span>
                  <select name="floor" class="director-select">
                    ${renderSelectOptions(floorOptions, current?.floor || 1)}
                  </select>
                </label>
                <label class="director-field">
                  <span>班次</span>
                  <input name="shift" type="text" value="${current?.shift || "07:00 - 15:30"}" />
                </label>
                <label class="director-field">
                  <span>默认排班</span>
                  <select name="defaultShiftId" class="director-select">
                    ${renderSelectOptions(shiftOptions, current?.defaultShiftId || current?.shiftIds?.[0] || "morning")}
                  </select>
                </label>
                <label class="director-field">
                  <span>登录账号</span>
                  <input name="username" type="text" placeholder="护工登录用户名" value="${current?.username || ""}" />
                </label>
                <label class="director-field">
                  <span>登录密码</span>
                  <input name="password" type="text" placeholder="${isEdit ? "云端暂无密码记录，留空则不修改" : "至少8位"}" value="${current?.passwordHint || ""}" />
                </label>
              `
          }
        </form>

        <div class="director-editor-actions">
          <button type="button" class="button button--muted" data-action="close-personnel-draft">取消</button>
          <button type="button" class="button button--primary" data-action="save-personnel-draft">保存${isElder ? "老人" : "护工"}</button>
        </div>
      </article>
    </section>
  `;
}

function renderPersonnelPlanDetailDialog(elderId, selectors, state) {
  if (!elderId) return "";

  const elder = state.elders.find((item) => item.id === elderId);
  if (!elder) return "";

  const plan = selectors.elderPlanSummaries.find((item) => item.elder?.id === elder.id) || null;
  const timelineItems = plan ? [...plan.items].sort((left, right) => left.schedule.localeCompare(right.schedule)) : [];

  return `
    <div class="director-dialog-backdrop" data-action="close-personnel-elder-detail"></div>
    <section class="director-dialog-shell director-dialog-shell--people">
      <article class="director-dialog-card director-dialog-card--people director-dialog-card--plan-detail">
        <div class="director-dialog-head">
          <div>
            <strong>${elder.room}室 · ${elder.name}</strong>
            <small>${elder.level} · 护理方案</small>
          </div>
          <button type="button" class="icon-button" data-action="close-personnel-elder-detail" aria-label="关闭">
            ${renderIcon("close")}
          </button>
        </div>

        ${
          plan
            ? `
              <div class="director-plan-quick-stats director-plan-quick-stats--dialog">
                <span class="director-plan-quick-stat">${plan.enabledCount}项已启用</span>
                <span class="director-plan-quick-stat ${plan.manualCount ? "is-warning" : ""}">
                  ${plan.manualCount ? `${plan.manualCount}项需手动发布` : "无手动发布"}
                </span>
                <span class="director-plan-quick-stat">复核 ${plan.reviewCycle}</span>
              </div>
              ${plan.note ? `<div class="director-plan-note">${plan.note}</div>` : ""}
              <div class="director-personnel-plan-list">
                ${timelineItems.map((item) => renderPlanTimelineEntry(item)).join("")}
              </div>
            `
            : `
              <div class="empty-state empty-state--soft">
                这位老人还没有建立护理方案。
              </div>
            `
        }

        <div class="director-editor-actions">
          <button type="button" class="button button--primary" data-action="close-personnel-elder-detail">关闭</button>
        </div>
      </article>
    </section>
  `;
}

function renderPersonnelMenu(type, id, selectors) {
  const isElder = type === "elder";
  const templateOptions = isElder ? [...(selectors?.dailyReportTemplateOptions || [])] : [];
  return `
    <div class="director-people-menu" data-personnel-ignore>
      <button type="button" data-action="open-personnel-edit" data-value="${type}:${id}">${isElder ? "基础信息" : "编辑"}</button>
      ${
        isElder && templateOptions.length
          ? `
            <button type="button" data-action="toggle-elder-template-menu">护理方案</button>
            <div class="director-people-submenu">
              ${templateOptions
                .map(
                  (t) => `
                    <button type="button" data-action="set-elder-report-template" data-value="${id}" data-template="${t.value}">${t.label}</button>
                  `,
                )
                .join("")}
            </div>
          `
          : ""
      }
      ${
        isElder
          ? `<button type="button" data-action="open-personnel-elder-detail" data-value="${id}">详情</button>`
          : ""
      }
      <button type="button" class="is-danger" data-action="${isElder ? "remove-elder" : "remove-caregiver"}" data-value="${id}">删除</button>
    </div>
  `;
}

function renderCaregiverPersonnelRow(caregiver, load) {
  const schedules = Array.isArray(load?.shiftSchedules) ? load.shiftSchedules : [];
  const shiftSummary = schedules.length
    ? schedules.map((item) => `${item.shiftName} ${item.start}-${item.end} · ${item.clockInAt ? `${item.late ? "迟到" : "已打卡"} ${item.clockInAt}` : "缺勤"}`).join(" / ")
    : "今日未排班";
  return `
    <article class="director-people-row director-people-row--collapsible" data-action="toggle-personnel-card" data-value="caregiver:${caregiver.id}">
      <div class="director-people-row__top">
        <div class="director-people-row__identity">
          ${renderAvatar(caregiver.name)}
          <span>
            <strong>${caregiver.name}</strong>
            <small>${caregiver.role} · ${caregiver.employeeNo}${caregiver.cloudUserId ? (caregiver.cloudUserStatus === "disabled" ? ' · <span style="color:#dc2626">账号已禁用</span>' : ' · <span style="color:#16a34a">账号正常</span>') : (caregiver.username ? ' · <span style="color:#d97706">账号未同步</span>' : '')}</small>
          </span>
        </div>
        <button type="button" class="director-people-row__more" data-action="toggle-personnel-menu" data-value="caregiver:${caregiver.id}" aria-label="更多操作">...</button>
        ${renderPersonnelMenu("caregiver", caregiver.id, null)}
      </div>
      <div class="director-people-row__details">
        <div class="director-people-row__meta">
          <span>${caregiver.floor}F</span>
          <span>${shiftSummary}</span>
          <span>待办 ${load?.pendingCount || 0}</span>
        </div>
      </div>
    </article>
  `;
}

function renderElderPersonnelRow(elder, plan, selectors) {
  return `
    <article class="director-people-row director-people-row--collapsible" data-action="toggle-personnel-card" data-value="elder:${elder.id}">
      <div class="director-people-row__top">
        <div class="director-people-row__identity">
          ${renderAvatar(elder.name)}
          <span>
            <strong>${elder.name}</strong>
            <small>${elder.room}室 · ${elder.level}${elder.familyUserId ? (elder.familyUserStatus === "disabled" ? ' · <span style="color:#dc2626">账号已禁用</span>' : ' · <span style="color:#16a34a">账号正常</span>') : (elder.username ? ' · <span style="color:#d97706">账号未同步</span>' : '')}</small>
          </span>
        </div>
        <button type="button" class="director-people-row__more" data-action="toggle-personnel-menu" data-value="elder:${elder.id}" aria-label="更多操作">...</button>
        ${renderPersonnelMenu("elder", elder.id, selectors)}
      </div>
      <div class="director-people-row__details">
        <div class="director-people-row__meta">
          <span>${elder.floor}F</span>
          <span>${elder.age}岁</span>
          <span>${elder.reportTemplateTitle ? `日报模板：${elder.reportTemplateTitle}` : "未分配日报模板"}</span>
        </div>
      </div>
    </article>
  `;
}

function renderPersonnelTypeSwitch(activeType) {
  return `
    <div class="director-personnel-switch" role="tablist" aria-label="人员类型">
      <button
        type="button"
        class="${activeType === "caregiver" ? "is-active" : ""}"
        data-action="set-director-personnel-type"
        data-value="caregiver"
      >
        护工
      </button>
      <button
        type="button"
        class="${activeType === "elder" ? "is-active" : ""}"
        data-action="set-director-personnel-type"
        data-value="elder"
      >
        老人
      </button>
    </div>
  `;
}

function renderElderFloorPicker(elders, selectedFloor) {
  return `
    <div class="director-people-floor-picker" aria-label="选择老人楼层">
      ${[1, 2, 3, 4, 5]
        .map((floor) => {
          const count = elders.filter((elder) => elder.floor === floor).length;
          return `
            <button
              type="button"
              class="${selectedFloor === floor ? "is-active" : ""}"
              data-action="set-director-personnel-floor"
              data-value="${floor}"
            >
              <strong>${floor}F</strong>
              <span>${count}位</span>
            </button>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderSelectedElderFloorList(elders, selectors, selectedFloor) {
  const visibleElders = elders.filter((elder) => elder.floor === selectedFloor);

  if (!visibleElders.length) {
    return `
      <div class="empty-state empty-state--soft">
        ${selectedFloor}F 当前没有老人档案。
      </div>
    `;
  }

  return `
    <div class="director-people-list director-people-list--floor">
      ${visibleElders
        .map((elder) => {
          const plan = selectors.elderPlanSummaries.find((item) => item.elder?.id === elder.id);
          return renderElderPersonnelRow(elder, plan, selectors);
        })
        .join("")}
    </div>
  `;
}

function renderCaregiverAttendancePanel(attendance) {
  const expected = attendance?.expected || 0;
  const checkedIn = attendance?.checkedIn || 0;
  const late = attendance?.late || 0;
  const missing = attendance?.missing || 0;
  const rate = attendance?.rate || (expected ? `${Math.round((checkedIn / expected) * 100)}%` : "0%");
  const settingsOpen = Boolean(attendance?.settingsOpen);

  return `
    <div class="director-attendance-shifts" aria-label="选择班次">
      ${[{ id: "all", name: "全部班次" }, ...(attendance?.shiftTemplates || [])]
        .map((shift) => `
          <button
            type="button"
            class="${(attendance?.shiftId || "all") === shift.id ? "is-active" : ""}"
            data-action="set-director-attendance-shift"
            data-value="${shift.id}"
          >${shift.name}${shift.start ? `<small>${shift.start}-${shift.end}</small>` : ""}</button>
        `)
        .join("")}
    </div>
    <div class="director-shift-settings ${settingsOpen ? "is-open" : ""}">
      <button
        type="button"
        class="director-shift-settings__toggle"
        data-action="toggle-attendance-shift-settings"
        aria-expanded="${settingsOpen ? "true" : "false"}"
      >
        <span>班次设置</span>
        <small>设置早班、午班、晚班上班时间</small>
      </button>
      ${settingsOpen ? `
        <div class="director-shift-editor" aria-label="班次时间设置">
          ${(attendance?.shiftTemplates || []).map((shift) => `
            <label>
              <span>${shift.name}</span>
              <input type="time" value="${shift.start}" data-attendance-shift-time data-shift-id="${shift.id}" data-field="start" />
              <em>-</em>
              <input type="time" value="${shift.end}" data-attendance-shift-time data-shift-id="${shift.id}" data-field="end" />
            </label>
          `).join("")}
          <small>规则：超过上班时间 30 分钟打卡算迟到；未打卡算缺勤。</small>
        </div>
      ` : ""}
    </div>
    <div class="director-attendance-strip" aria-label="今日护工考勤">
      <div>
        <span>应出勤</span>
        <strong>${expected}</strong>
      </div>
      <div>
        <span>已打卡</span>
        <strong>${checkedIn}</strong>
      </div>
      <div class="${late ? "is-warning" : "is-success"}">
        <span>迟到</span>
        <strong>${late}</strong>
      </div>
      <div class="${missing ? "is-warning" : "is-success"}">
        <span>缺勤</span>
        <strong>${missing}</strong>
      </div>
    </div>
    <div class="director-attendance-rate">出勤率 ${rate}</div>
  `;
}

export function renderDirectorPeoplePage({ state, selectors }) {
  const activeType = selectors.directorPersonnelType === "elder" ? "elder" : "caregiver";
  const selectedPersonnelFloor = Math.min(5, Math.max(1, Number.parseInt(selectors.directorPersonnelFloor, 10) || 1));
  const sortedCaregivers = [...state.caregivers]
    .sort((left, right) => {
      if (left.floor !== right.floor) return left.floor - right.floor;
      return left.name.localeCompare(right.name);
    });
  const sortedElders = [...state.elders]
    .sort((left, right) => {
      if (left.floor !== right.floor) return left.floor - right.floor;
      return left.room.localeCompare(right.room);
    });

  return `
    <section class="director-page director-page--people">
      ${renderDirectorHeader("人员管理", state.director.date, renderPersonnelTypeSwitch(activeType))}

      <div class="director-stack director-stack--people">
        <section class="director-panel director-people-panel">
          <div class="director-panel__head">
            <div>
              <strong>${activeType === "elder" ? "老人管理" : "护工管理"}</strong>
            </div>
            <div class="director-panel__actions">
              ${renderStatusPill(activeType === "elder" ? `${sortedElders.length}位` : `${sortedCaregivers.length}名`, activeType === "elder" ? "primary" : "success")}
              <button type="button" class="button button--small button--primary" data-action="open-personnel-draft" data-value="${activeType}">
                ${activeType === "elder" ? "新增老人" : "新增护工"}
              </button>
            </div>
          </div>

          ${
            activeType === "elder"
              ? `
                ${renderElderFloorPicker(sortedElders, selectedPersonnelFloor)}
                ${renderSelectedElderFloorList(sortedElders, selectors, selectedPersonnelFloor)}
              `
              : `
                ${renderCaregiverAttendancePanel(selectors.directorAttendance)}
                <div class="director-people-list">
                  ${sortedCaregivers
                    .map((caregiver) => {
                      const load = selectors.caregiverLoads.find((item) => item.id === caregiver.id);
                      if (load && selectors.directorAttendance?.schedules) {
                        load.shiftSchedules = selectors.directorAttendance.schedules.filter((item) => item.caregiverId === caregiver.id);
                      }
                      return renderCaregiverPersonnelRow(caregiver, load);
                    })
                    .join("")}
                </div>
              `
          }
        </section>
      </div>
      ${renderPersonnelDraftDialog(selectors.directorPersonnelDraft, selectors, state)}
      ${renderPersonnelPlanDetailDialog(selectors.directorPersonnelPlanDetailElderId, selectors, state)}
    </section>
  `;
}

export function renderDirectorProfilePage({ state }) {
  const sessionUser = state.session?.user || {};
  const directorName = sessionUser.displayName || sessionUser.display_name || state.director.reviewerName || state.director.name || "院长";
  const directorRole = sessionUser.role === "director" ? "院长" : state.director.role || "院长";
  const accountId = sessionUser.username || state.director.accountId || "director-001";
  const directorPhone = sessionUser.phone || sessionUser.mobile || state.director.phone || "未设置";
  const institution = state.institution || {};
  const loginStatus = state.session.loggedIn ? "已登录" : "未登录";

  return `
    <section class="director-page director-page--profile">
      ${renderDirectorHeader("我的", state.director.date)}

      <div class="director-stack">
        <article class="director-card director-card--dense director-profile-card">
          <div class="director-card__head director-card__head--compact">
            <div class="director-record-card__identity">
              ${renderAvatar(directorName)}
              <span>
                <strong>${directorName}</strong>
                <small>${directorRole} · ${accountId}</small>
              </span>
            </div>
            ${renderStatusPill(loginStatus, state.session.loggedIn ? "success" : "warning")}
          </div>

          <div class="director-profile-list">
            <div>
              <span>账号角色</span>
              <strong>${directorRole}</strong>
            </div>
            <div>
              <span>联系电话</span>
              <strong>${directorPhone}</strong>
            </div>
            <div>
              <span>账号编号</span>
              <strong>${accountId}</strong>
            </div>
          </div>
        </article>

        <article class="director-card director-card--dense director-profile-card">
          <div class="director-card__head director-card__head--compact">
            <div>
              <strong>养老院信息</strong>
            </div>
          </div>
          <div class="director-profile-list">
            <div>
              <span>养老院名称</span>
              <strong>${institution.name || "未设置"}</strong>
            </div>
            <div>
              <span>机构编号</span>
              <strong>${institution.id || "未设置"}</strong>
            </div>
            <div>
              <span>任务模式</span>
              <strong>${institution.taskMode || "未设置"}</strong>
            </div>
          </div>
        </article>

        <button type="button" class="button button--danger button--block" style="margin-top:16px" data-action="logout">退出登录</button>
      </div>
    </section>
  `;
}

function renderInventoryItemDraft(draft) {
  if (!draft) return "";
  return `
    <section class="inventory-editor-modal" role="dialog" aria-modal="true">
      <button class="inventory-editor-modal__backdrop" data-action="close-inventory-item-draft" aria-label="关闭库存编辑"></button>
      <div class="inventory-editor-modal__dialog">
        <div class="inventory-editor-modal__topbar">
          <strong>${draft.id ? "编辑库存" : "新增库存"}</strong>
          <button class="icon-button" data-action="close-inventory-item-draft">${renderIcon("close")}</button>
        </div>
        <form class="inventory-form" data-inventory-item-form>
          <div class="inventory-form__grid">
            <label class="inventory-field inventory-field--full">名称<input name="name" value="${draft.name || ""}" placeholder="如 成人护理垫" /></label>
            <label class="inventory-field">分类<input name="category" value="${draft.category || "护理用品"}" /></label>
            <label class="inventory-field">单位<input name="unit" value="${draft.unit || "件"}" /></label>
            <label class="inventory-field">当前数量<input name="quantity" type="number" min="0" value="${draft.quantity || 0}" /></label>
            <label class="inventory-field">预警线<input name="warningQuantity" type="number" min="0" value="${draft.warningQuantity || 0}" /></label>
            <label class="inventory-field inventory-field--full">存放位置<input name="location" value="${draft.location || ""}" placeholder="如 2F护理站" /></label>
          </div>
          <div class="inventory-form__actions">
            <button type="button" class="button button--secondary" data-action="close-inventory-item-draft">取消</button>
            <button type="button" class="button button--primary" data-action="save-inventory-item">保存到云端</button>
          </div>
        </form>
      </div>
    </section>
  `;
}

function renderInventoryStockAdjustDraft(draft) {
  if (!draft) return "";
  const mode = draft.mode === "decrease" ? "decrease" : "increase";
  const modeText = mode === "decrease" ? "减少" : "增加";
  const initialAmount = Number(draft.amount || 0);
  const nextQuantity = Math.max(0, Number(draft.currentQuantity || 0) + (mode === "decrease" ? -initialAmount : initialAmount));
  return `
    <section class="inventory-editor-modal" role="dialog" aria-modal="true">
      <button type="button" class="inventory-editor-modal__backdrop" data-action="close-inventory-stock-adjust" aria-label="关闭库存调整"></button>
      <div class="inventory-editor-modal__dialog">
        <div class="inventory-editor-modal__topbar">
          <strong>调整库存</strong>
          <button type="button" class="icon-button" data-action="close-inventory-stock-adjust">${renderIcon("close")}</button>
        </div>
        <form class="inventory-form" data-inventory-stock-adjust-form>
          <div class="inventory-action-sheet">
            <p>${draft.name || "未命名物资"} · 当前库存 ${draft.currentQuantity || 0}${draft.unit || "件"}</p>
            <input type="hidden" name="mode" value="${mode}" />
            <div class="inventory-adjust-mode" role="group" aria-label="选择库存调整方向">
              <button type="button" class="inventory-adjust-mode__button ${mode === "increase" ? "is-active" : ""}" data-action="set-inventory-stock-adjust-mode" data-value="increase">增加</button>
              <button type="button" class="inventory-adjust-mode__button ${mode === "decrease" ? "is-active" : ""}" data-action="set-inventory-stock-adjust-mode" data-value="decrease">减少</button>
            </div>
            <label class="inventory-field inventory-field--full">
              ${modeText}数量
              <input name="amount" type="number" min="1" inputmode="numeric" value="${draft.amount || ""}" placeholder="输入数量" />
            </label>
            <p>调整后剩余物资会变为 <strong data-inventory-adjust-preview>${nextQuantity}${draft.unit || "件"}</strong></p>
          </div>
          <div class="inventory-form__actions">
            <button type="button" class="button button--secondary" data-action="close-inventory-stock-adjust">取消</button>
            <button type="button" class="button button--primary" data-action="save-inventory-stock-adjust">保存调整</button>
          </div>
        </form>
      </div>
    </section>
  `;
}

function getInventoryUsageDate(value = "") {
  const raw = String(value || "");
  return raw.slice(0, 10) || "未记录日期";
}

function renderInventoryUsageSparkline(dailyRows, unit = "件") {
  if (!dailyRows.length) {
    return '<div class="inventory-usage-chart inventory-usage-chart--empty">暂无消耗趋势</div>';
  }
  const width = 320;
  const height = 120;
  const padding = 18;
  const maxValue = Math.max(1, ...dailyRows.map((row) => row.quantity));
  const points = dailyRows.map((row, index) => {
    const x = dailyRows.length === 1 ? width / 2 : padding + (index * (width - padding * 2)) / (dailyRows.length - 1);
    const y = height - padding - (row.quantity / maxValue) * (height - padding * 2);
    return { ...row, x, y };
  });
  const path = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
  const area = `${path} L ${points[points.length - 1].x.toFixed(1)} ${height - padding} L ${points[0].x.toFixed(1)} ${height - padding} Z`;
  return `
    <div class="inventory-usage-chart">
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="消耗趋势折线图">
        <path class="inventory-usage-chart__area" d="${area}"></path>
        <path class="inventory-usage-chart__line" d="${path}"></path>
        ${points.map((point) => `<circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="4"><title>${point.date}: ${point.quantity}${unit}</title></circle>`).join("")}
      </svg>
      <div class="inventory-usage-chart__labels">
        <span>${dailyRows[0]?.date || ""}</span>
        <strong>最高 ${maxValue}${unit}</strong>
        <span>${dailyRows[dailyRows.length - 1]?.date || ""}</span>
      </div>
    </div>
  `;
}

function renderInventoryItemActions(item, usages = []) {
  if (!item) return "";
  const dailyMap = new Map();
  usages.forEach((usage) => {
    const date = getInventoryUsageDate(usage.usedAt || usage.createdAt);
    dailyMap.set(date, (dailyMap.get(date) || 0) + Number(usage.quantity || 0));
  });
  const dailyRows = Array.from(dailyMap.entries())
    .map(([date, quantity]) => ({ date, quantity }))
    .sort((left, right) => left.date.localeCompare(right.date));
  const recentUsages = [...usages].sort((left, right) => String(right.usedAt || "").localeCompare(String(left.usedAt || ""))).slice(0, 8);
  const safeUsages = recentUsages.map((usage) => ({
    quantity: Number(usage.quantity || 0),
    unit: usage.unit || item.unit,
    usedAt: usage.usedAt || usage.createdAt || "",
    caregiverName: usage.caregiverName || "未记录员工",
    note: usage.note || "",
  }));
  return `
    <section class="inventory-editor-modal" role="dialog" aria-modal="true">
      <button type="button" class="inventory-editor-modal__backdrop" data-action="close-inventory-item-actions" aria-label="关闭库存操作"></button>
      <div class="inventory-editor-modal__dialog">
        <div class="inventory-editor-modal__topbar">
          <strong>${item.name}</strong>
          <button type="button" class="icon-button" data-action="close-inventory-item-actions">${renderIcon("close")}</button>
        </div>
        <div class="inventory-action-sheet">
          <p>${item.category || "未分类"} · 当前库存 ${item.quantity}${item.unit}</p>
          <div class="inventory-item-usage-panel">
            <div class="inventory-item-usage-panel__head">
              <strong>消耗记录</strong>
              <span>${dailyRows.length} 天 · ${usages.length} 条</span>
            </div>
            ${renderInventoryUsageSparkline(dailyRows, item.unit)}
            <div class="inventory-item-usage-days">
              ${
                dailyRows.length
                  ? dailyRows
                      .slice(-7)
                      .reverse()
                      .map((row) => `<span><strong>${row.date}</strong><em>${row.quantity}${item.unit}</em></span>`)
                      .join("")
                  : '<span class="inventory-item-usage-days__empty">暂无按日期记录</span>'
              }
            </div>
            <div class="inventory-item-usage-list">
              ${
                recentUsages.length
                  ? safeUsages
                      .map(
                        (usage) => `
                          <article>
                            <strong>${usage.quantity}${usage.unit}</strong>
                            <span>${usage.usedAt || usage.createdAt || ""}</span>
                            <em>${usage.caregiverName || "未记录员工"}${usage.note ? ` · ${usage.note}` : ""}</em>
                          </article>
                        `,
                      )
                      .join("")
                  : '<div class="empty-state empty-state--soft">暂无该物资消耗记录。</div>'
              }
            </div>
          </div>
          <button type="button" class="button button--primary button--block" data-action="open-inventory-stock-adjust" data-value="${item.id}">调整库存</button>
          <button type="button" class="button button--danger button--block" data-action="delete-inventory-item" data-value="${item.id}">删除物资</button>
        </div>
      </div>
    </section>
  `;
}

export function renderDirectorInventoryPage({ state, selectors }) {
  const items = selectors.inventoryItems || [];
  const usages = selectors.inventoryUsages || [];
  const summary = selectors.inventorySummary || { types: 0, warningCount: 0, usageCount: 0 };
  const filters = selectors.inventoryUsageFilters || {};
  return `
    <section class="director-page">
      ${renderDirectorHeader(
        "物品库存管理",
        state.director.date,
        `<button class="button button--small" data-action="open-inventory-item-draft">新增库存</button>`,
      )}

      <div class="director-stack">
        <div class="director-grid-2">
          <article class="director-card director-card--dense">
            <p>总品类数</p>
            <strong>${summary.types}</strong>
          </article>
          <article class="director-card director-card--dense">
            <p>库存预警</p>
            <strong class="is-error">${summary.warningCount}</strong>
          </article>
        </div>

        <div class="director-record-list">
          ${items.length
            ? items
            .map((item) => {
              const percent = item.warningQuantity ? Math.min(100, Math.round((item.quantity / item.warningQuantity) * 100)) : 100;
              const tone = item.quantity <= item.warningQuantity ? "error" : item.quantity <= item.warningQuantity * 1.5 ? "warning" : "success";
              const statusText = item.quantity <= item.warningQuantity ? "需补货" : "充足";

              return `
                <article class="director-card director-card--dense inventory-item-card" data-action="open-inventory-item-actions" data-value="${item.id}">
                  <div class="director-card__head director-card__head--compact">
                    <div>
                      <strong>${item.name}</strong>
                      <p>${item.category || "未分类"} · ${item.unit}</p>
                    </div>
                    ${renderStatusPill(statusText, tone)}
                  </div>
                  <div class="director-card__meta">
                    <span>位置：${item.location || "未填写"}</span>
                    <span>预警线：${item.warningQuantity}${item.unit}</span>
                  </div>
                  <div class="director-progress">
                    <span class="director-progress__bar director-progress__bar--${tone}" style="width: ${percent}%"></span>
                  </div>
                  <div class="director-card__meta">
                    <strong>当前库存 ${item.quantity}${item.unit}</strong>
                    <span>点击名片操作</span>
                  </div>
                </article>
              `;
            })
            .join("")
            : '<div class="empty-state empty-state--soft">还没有配置库存品项。</div>'}
        </div>

        <article class="director-card director-card--dense">
          <div class="director-card__head director-card__head--compact">
            <div>
              <strong>使用流水</strong>
              <p>按日期和消耗品名称索引，员工提交后自动扣减库存。</p>
            </div>
            <div class="inventory-usage-head-actions">
              ${renderStatusPill(`${summary.usageCount} 条`, summary.usageCount ? "success" : "muted")}
              <button class="button button--small button--outline" data-action="refresh-cloud-inventory">刷新</button>
            </div>
          </div>
          <div class="inventory-usage-filters">
            <label class="inventory-date-filter">
              <span>日期</span>
              <button type="button" class="inventory-date-filter__button" data-action="open-inventory-date-picker" aria-label="选择日期">${renderIcon("calendar")}</button>
              <input type="date" data-inventory-date-picker data-inventory-usage-filter="recordDate" value="${filters.recordDate || ""}" />
            </label>
            <label>消耗品<input data-inventory-usage-filter="itemName" value="${filters.itemName || ""}" placeholder="输入名称筛选" /></label>
          </div>
          <div class="director-record-list">
            ${
              usages.length
                ? usages
                    .slice(0, 30)
                    .map(
                      (usage) => `
                        <article class="director-record-card">
                          <div class="director-record-card__identity">
                            <strong>${usage.itemName}</strong>
                            <small>${usage.usedAt || usage.createdAt || ""}</small>
                          </div>
                          <div class="director-record-card__status">
                            <strong>${usage.quantity}${usage.unit}</strong>
                            <small>${usage.caregiverName || "未记录员工"}${usage.note ? ` · ${usage.note}` : ""}</small>
                          </div>
                        </article>
                      `,
                    )
                    .join("")
                : '<div class="empty-state empty-state--soft">暂无库存使用记录。</div>'
            }
          </div>
        </article>
      </div>
      ${renderInventoryItemDraft(selectors.inventoryItemDraft)}
      ${renderInventoryStockAdjustDraft(selectors.inventoryStockAdjustDraft)}
      ${renderInventoryItemActions(selectors.inventoryItemActions, selectors.inventoryItemActionUsages || [])}
    </section>
  `;
}

export function renderDirectorAnomalyPage({ state, selectors }) {
  const reports = selectors.directorExceptionReports || [];
  const anomalyDate = selectors.directorAnomalyDate || state.ui.directorAuditDate || state.director.date;

  return `
    <section class="director-page">
      ${renderDirectorHeader("异常状态", anomalyDate)}

      <div class="director-stack">
        ${renderDirectorAnomalyDateFilter(anomalyDate)}
        ${
          reports.length
            ? reports.map(renderDirectorExceptionReportCard).join("")
            : '<div class="empty-state empty-state--soft">当前没有员工上传的异常任务报告。</div>'
        }
      </div>
    </section>
  `;
}

export function renderDirectorStatisticsPage({ state, selectors }) {
  const caregiverStats = selectors.directorCaregiverStatistics || [];
  const selectedStat = selectors.selectedDirectorCaregiverStat;
  const exceptionCount = selectors.directorExceptionReports?.length || 0;

  return `
    <section class="director-page">
      ${renderDirectorHeader("任务统计", state.director.date)}

      <div class="director-stack">
        <button type="button" class="director-exception-entry" data-action="navigate" data-route="director-anomaly">
          <span>
            <strong>异常状态</strong>
            <small>查看员工上传的异常任务报告</small>
          </span>
          ${renderStatusPill(`${exceptionCount} 条`, exceptionCount ? "error" : "success")}
        </button>

        <div class="director-caregiver-stat-list">
          ${caregiverStats.map((item) => renderDirectorCaregiverStatCard(item, state.ui.selectedDirectorStatisticsCaregiverId)).join("")}
        </div>

        ${renderDirectorCaregiverStatDetail(selectedStat)}
      </div>
    </section>
  `;
}

export function renderDirectorElderTimelinePage({ state, selectors }) {
  const timeline = selectors.directorSelectedTimeline;

  return `
    <section class="director-page">
      ${renderDirectorHeader(`${timeline.elderName} 护理记录`, state.director.date)}

      <div class="director-stack">
        <article class="director-card">
          <div class="director-card__head director-card__head--compact">
            <span class="director-record-card__identity">
              ${renderAvatar(timeline.elderName)}
              <span>
                <strong>${timeline.elderName}</strong>
                <small>${timeline.room} · ${timeline.level}</small>
              </span>
            </span>
          </div>
        </article>

        <section class="director-timeline">
          ${timeline.entries
            .map((item) => {
              const tone = item.statusTone || item.tone || "muted";
              const statusLabel = item.statusLabel || (tone === "success" ? "已完成" : tone === "overdue" ? "超时" : "未完成");
              return `
                <article class="director-timeline__item director-timeline__item--${tone}" data-task-id="${item.id || ""}" data-task-tone="${tone}" data-task-status="${statusLabel}">
                  <div class="director-timeline__time">${item.time}</div>
                  <div class="director-timeline__line">
                    <span class="director-timeline__dot director-timeline__dot--${tone}"></span>
                  </div>
                  <div class="director-timeline__card director-timeline__card--${tone}">
                    <div class="director-timeline__card-head director-timeline__card-head--status">
                      <strong>${item.title}</strong>
                      <span class="director-timeline__status director-timeline__status--${tone}">${statusLabel}</span>
                    </div>
                    <p>${item.note}</p>
                  </div>
                </article>
              `;
            })
            .join("")}
        </section>
      </div>
    </section>
  `;
}
