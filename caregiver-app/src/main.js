import { actions, notify, selectors, state, subscribe } from "./store/state.js";
import { renderAttendancePage } from "./pages/attendancePage.js";
import {
  renderDirectorAnomalyPage,
  renderDirectorAssignmentsPage,
  renderDirectorCaregiverPage,
  renderDirectorCareRecordsPage,
  renderDirectorCarePlansPage,
  renderDirectorDispatchPage,
  renderDirectorElderTimelinePage,
  renderDirectorFloorDetailPage,
  renderDirectorHomePage,
  renderDirectorInventoryPage,
  renderDirectorPeoplePage,
  renderDirectorProfilePage,
  renderDirectorTaskDetailDialog,
  renderDirectorStatisticsPage,
  renderDirectorTemplateLibraryPage,
} from "./pages/directorPage.js";
import { renderCaregiverDailyReportPage } from "./pages/caregiverDailyReportPage.js";
import { renderElderDetailPage } from "./pages/elderDetailPage.js";
import { renderFamilyHealthPage, renderFamilyHomePage, renderFamilyMessagesPage, renderFamilyProfilePage } from "./pages/familyPage.js";
import { renderHistoryDetailPage } from "./pages/historyDetailPage.js";
import { renderHistoryPage } from "./pages/historyPage.js";
import { renderHomePage } from "./pages/homePage.js";
import { renderInventoryUsagePage } from "./pages/inventoryUsagePage.js";
import { renderLoginPage } from "./pages/loginPage.js";
import { renderProfilePage } from "./pages/profilePage.js";
import { renderRoomSelectPage } from "./pages/roomSelectPage.js";
import { renderTaskDetailPage } from "./pages/taskDetailPage.js";
import { getAuthToken, requestJson, setAuthToken } from "./utils/cloudApi.js";
import { renderIcon } from "./utils/caregiverUi.js";

const app = document.getElementById("app");
const routeScrollPositions = new Map();
let pendingScrollRestore = null;
let lockedScrollRestore = null;
let pendingAnchorRestore = null;
let isRestoringBrowserHistory = false;
let lastHistorySignature = "";
let directorCloudPollTimer = 0;
let directorCareReportsPollTimer = 0;
let caregiverTaskPollTimer = 0;
let caregiverRecordSyncSignature = "";
let institutionStatePollTimer = 0;
let directorInventoryPollTimer = 0;
let liveClockTimer = 0;
let lastUserScrollAt = 0;
let deferredScrollRenderTimer = 0;
let directorPlanReturnScrollSnapshot = null;
let reportTemplateScheduleDrag = null;
let skipCaregiverTimelineAutoFocus = false;
let lastCaregiverTimelineFocusKey = "";
let directorDatePickerHoldUntil = 0;
let directorDatePickerRenderTimer = 0;
let directorElderAssignmentDrag = null;

const DIRECTOR_TASK_POLL_INTERVAL_MS = 3000;
const DIRECTOR_CARE_REPORT_POLL_INTERVAL_MS = 60000;
const DIRECTOR_INVENTORY_POLL_INTERVAL_MS = 5000;

const REPORT_TEMPLATE_SCHEDULE_START_MINUTES = 0;
const REPORT_TEMPLATE_SCHEDULE_END_MINUTES = 24 * 60;
const REPORT_TEMPLATE_SCHEDULE_PX_PER_MINUTE = 1;
const REPORT_TEMPLATE_SCHEDULE_STEP_MINUTES = 15;
const REPORT_TEMPLATE_SCHEDULE_MIN_DURATION = 15;
const REPORT_TEMPLATE_SCHEDULE_CARD_MIN_HEIGHT = 72;
const TASK_EVIDENCE_MAX_EDGE = 1280;
const TASK_EVIDENCE_JPEG_QUALITY = 0.72;

function getVisualViewportHeight() {
  const height = window.visualViewport?.height || window.innerHeight || document.documentElement.clientHeight || 0;
  return Math.max(320, Math.floor(height));
}

function syncVisualViewportMetrics() {
  const viewport = window.visualViewport;
  const height = getVisualViewportHeight();
  const offsetTop = Math.max(0, Math.floor(viewport?.offsetTop || 0));
  const innerHeight = window.innerHeight || height;
  const keyboardInset = Math.max(0, Math.floor(innerHeight - height - offsetTop));

  document.documentElement.style.setProperty("--visual-viewport-height", `${height}px`);
  document.documentElement.style.setProperty("--keyboard-inset", `${keyboardInset}px`);
}

function scrollTaskRecordNoteIntoStableView(target = document.activeElement) {
  if (!target?.matches?.("[data-task-record-note]")) return;

  syncVisualViewportMetrics();

  const dialog = target.closest(".task-record-modal__dialog");
  if (!dialog) return;

  const viewportHeight = getVisualViewportHeight();
  const dialogRect = dialog.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const topLimit = Math.max(12, dialogRect.top + 12);
  const bottomLimit = Math.min(viewportHeight - 12, dialogRect.bottom - 12);

  if (targetRect.bottom > bottomLimit) {
    dialog.scrollTop += targetRect.bottom - bottomLimit;
  } else if (targetRect.top < topLimit) {
    dialog.scrollTop -= topLimit - targetRect.top;
  }
}

function stabilizeTaskRecordNoteFocus(target = document.activeElement) {
  if (!target?.matches?.("[data-task-record-note]")) return;

  window.requestAnimationFrame(() => {
    scrollTaskRecordNoteIntoStableView(target);
    window.requestAnimationFrame(() => scrollTaskRecordNoteIntoStableView(target));
  });

  [60, 140, 280, 460].forEach((delay) => {
    window.setTimeout(() => scrollTaskRecordNoteIntoStableView(target), delay);
  });
}

function holdDirectorDatePickerAutoRefresh(durationMs = 20000) {
  directorDatePickerHoldUntil = Math.max(directorDatePickerHoldUntil, Date.now() + durationMs);
}

function releaseDirectorDatePickerAutoRefresh(delayMs = 1200) {
  directorDatePickerHoldUntil = Math.max(directorDatePickerHoldUntil, Date.now() + delayMs);
}

function clearDirectorDatePickerAutoRefresh() {
  directorDatePickerHoldUntil = 0;
  window.clearTimeout(directorDatePickerRenderTimer);
  directorDatePickerRenderTimer = 0;
}

function isDirectorDatePickerProtected() {
  return Date.now() < directorDatePickerHoldUntil;
}

function deferRenderUntilDirectorDatePickerSettles() {
  const delay = Math.max(80, directorDatePickerHoldUntil - Date.now() + 120);
  window.clearTimeout(directorDatePickerRenderTimer);
  directorDatePickerRenderTimer = window.setTimeout(() => {
    directorDatePickerRenderTimer = 0;
    renderApp();
  }, delay);
}

const routes = {
  login: renderLoginPage,
  attendance: renderAttendancePage,
  home: renderHomePage,
  "room-select": renderRoomSelectPage,
  "elder-detail": renderElderDetailPage,
  "caregiver-daily-report": renderCaregiverDailyReportPage,
  tasks: renderHomePage,
  "task-detail": renderTaskDetailPage,
  history: renderHistoryPage,
  "history-detail": renderHistoryDetailPage,
  "inventory-usage": renderInventoryUsagePage,
  profile: renderProfilePage,
  "family-home": renderFamilyHomePage,
  "family-health": renderFamilyHealthPage,
  "family-messages": renderFamilyMessagesPage,
  "family-profile": renderFamilyProfilePage,
  "director-home": renderDirectorHomePage,
  "director-floor-detail": renderDirectorFloorDetailPage,
  "director-caregiver": renderDirectorCaregiverPage,
  "director-assignments": renderDirectorAssignmentsPage,
  "director-template-library": renderDirectorTemplateLibraryPage,
  "director-care-plans": renderDirectorCarePlansPage,
  "director-care-records": renderDirectorCareRecordsPage,
  "director-dispatch": renderDirectorDispatchPage,
  "director-inventory": renderDirectorInventoryPage,
  "director-people": renderDirectorPeoplePage,
  "director-profile": renderDirectorProfilePage,
  "director-anomaly": renderDirectorAnomalyPage,
  "director-statistics": renderDirectorStatisticsPage,
  "director-elder-timeline": renderDirectorElderTimelinePage,
};

function getBottomNavItemsLegacy() {
  if (state.session.identity === "caregiver") {
    return [
      { key: "home", route: "home", label: "鎴戠殑浠诲姟", icon: "tasks" },
      { key: "history", route: "history", label: "鎶ょ悊璁板綍", icon: "history" },
      { key: "profile", route: "profile", label: "涓汉涓績", icon: "profile" },
    ];
  }

  if (state.session.identity === "family") {
    return [
      { key: "family-home", route: "family-home", label: "棣栭〉", icon: "home" },
      { key: "family-health", route: "family-health", label: "鍋ュ悍", icon: "pulse" },
      { key: "family-messages", route: "family-messages", label: "娑堟伅", icon: "message" },
      { key: "family-profile", route: "family-profile", label: "鎴戠殑", icon: "profile" },
    ];
  }

  if (state.session.identity === "director" || state.session.identity === "admin" || state.session.identity === "superadmin") {
    return [
      { key: "director-home", route: "director-home", label: "鎬昏", icon: "home" },
      { key: "director-care-plans", route: "director-care-plans", label: "鏂规", icon: "users" },
      { key: "director-people", route: "director-people", label: "浜哄憳", icon: "profile" },
      { key: "director-profile", route: "director-profile", label: "鎴戠殑", icon: "profile" },
    ];
  }

  if (false && state.session.identity === "director") {
    return [
      { key: "director-home", route: "director-home", label: "鎬昏", icon: "home" },
      { key: "director-inventory", route: "director-inventory", label: "搴撳瓨", icon: "package" },
      { key: "director-anomaly", route: "director-anomaly", label: "寮傚父", icon: "warning" },
      { key: "director-statistics", route: "director-statistics", label: "缁熻", icon: "chart" },
    ];
  }

  return [];
}

function getBottomNavItems() {
  if (state.session.identity === "caregiver") {
    return [
      { key: "home", route: "home", label: "我的任务", icon: "tasks" },
      { key: "history", route: "history", label: "护理记录", icon: "history" },
      { key: "profile", route: "profile", label: "个人中心", icon: "profile" },
    ];
  }

  if (state.session.identity === "family") {
    return [
      { key: "family-home", route: "family-home", label: "首页", icon: "home" },
      { key: "family-health", route: "family-health", label: "健康", icon: "pulse" },
      { key: "family-messages", route: "family-messages", label: "消息", icon: "message" },
      { key: "family-profile", route: "family-profile", label: "我的", icon: "profile" },
    ];
  }

  if (state.session.identity === "director" || state.session.identity === "admin" || state.session.identity === "superadmin") {
    return [
      { key: "director-home", route: "director-home", label: "总览", icon: "home" },
      { key: "director-care-plans", route: "director-care-plans", label: "方案", icon: "users" },
      { key: "director-people", route: "director-people", label: "人员", icon: "profile" },
      { key: "director-profile", route: "director-profile", label: "我的", icon: "profile" },
    ];
  }

  return [];
}

function shouldShowBottomNav() {
  if (state.ui.route === "login") return false;

  if (state.session.identity === "caregiver") {
    return !["attendance", "history-detail", "caregiver-daily-report"].includes(state.ui.route);
  }

  return getBottomNavItems().length > 0;
}

function renderBottomNav() {
  const items = getBottomNavItems();
  if (!shouldShowBottomNav() || !items.length) return "";

  return `
    <nav class="tab-bar" style="--tab-count: ${items.length}">
      ${items
        .map(
          (item) => `
            <button
              class="nav-item ${state.ui.activeTab === item.key ? "is-active" : ""}"
              data-action="navigate"
              data-route="${item.route}"
            >
              ${renderIcon(item.icon)}
              <span>${item.label}</span>
            </button>
          `,
        )
        .join("")}
    </nav>
  `;
}

function renderBatchPanel() {
  if (state.session.identity !== "caregiver") return "";

  return `
    <div class="modal-overlay ${state.ui.batchPanelOpen ? "is-active" : ""}" data-action="close-batch-panel"></div>
    <section class="batch-panel ${state.ui.batchPanelOpen ? "is-active" : ""}">
      <div class="batch-panel__header">
        <h3>鎵归噺浠诲姟閫夋嫨</h3>
        <button class="icon-button" data-action="close-batch-panel">${renderIcon("close")}</button>
      </div>
      <p class="batch-panel__hint">褰撳墠鍥哄畾璐熻矗 ${state.ui.selectedFloor}F锛屼紭鍏堝鐞嗗崍椁愬姪椁愶紱鎵归噺鍚庡彲琛ュ厖寮傚父/涓嶉厤鍚堛€?/p>

      <div class="batch-panel__grid">
        ${state.batchJobs
          .map(
            (job) => `
              <button class="batch-panel__item ${job.completed ? "is-completed" : ""}" data-action="complete-batch" data-value="${job.key}">
                <span class="batch-panel__item-icon">${renderIcon(job.icon)}</span>
                <span>${job.title}</span>
                <small>鍏ㄥ眰 ${job.total} 浜?{job.completed ? " 路 宸茶褰? : ""}</small>
              </button>
            `,
          )
          .join("")}
      </div>

      <button class="button button--muted button--block" data-action="close-batch-panel">鍙栨秷</button>
    </section>
  `;
}

function renderToast() {
  return state.ui.toast ? `<div class="toast">${state.ui.toast}</div>` : "";
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeTaskEvidence(evidence) {
  if (!evidence) return { name: "", dataUrl: "", capturedAt: "" };
  if (typeof evidence === "string") return { name: evidence, dataUrl: "", capturedAt: "" };
  return {
    name: String(evidence.name || ""),
    dataUrl: String(evidence.dataUrl || ""),
    capturedAt: String(evidence.capturedAt || ""),
  };
}

function normalizeTaskEvidenceList(evidence) {
  if (!evidence) return [];
  const source = Array.isArray(evidence) ? evidence : [evidence];
  return source.map(normalizeTaskEvidence).filter((item) => item.name || item.dataUrl);
}

function renderDirectorTaskDetail() {
  const taskId = state.ui.directorTaskDetailId;
  if (state.session.identity !== "director" || !taskId) return "";
  const task = state.tasks.find((t) => t.id === taskId);
  if (!task) return "";
  return renderDirectorTaskDetailDialog(task, state);
}

function renderCaregiverRecordDetail() {
  const detail = selectors().caregiverRecordDetail;
  if (state.session.identity !== "caregiver" || !detail) return "";
  const rows = Array.isArray(detail.rows) ? detail.rows : [];
  const previewIndex = Number.isInteger(state.ui.caregiverRecordPhotoPreviewIndex)
    ? state.ui.caregiverRecordPhotoPreviewIndex
    : null;
  const previewTaskId = state.ui.caregiverRecordPhotoPreviewTaskId || "";
  const previewRow = previewIndex !== null
    ? rows.find((row) => row.id === previewTaskId && Array.isArray(row.photos) && row.photos[previewIndex])
    : null;
  const previewPhoto = previewRow ? previewRow.photos[previewIndex] : null;
  const previewUrl = previewPhoto?.dataUrl || previewPhoto?.url || "";

  return `
    <section class="caregiver-record-detail-modal" role="dialog" aria-modal="true">
      <button class="caregiver-record-detail-modal__backdrop" type="button" data-action="close-caregiver-record-detail" aria-label="关闭记录"></button>
      <article class="caregiver-record-detail-modal__dialog">
        <header class="caregiver-record-detail-modal__head">
          <div>
            <strong>${escapeHtml(detail.elderName || "老人任务记录")}</strong>
            <small>${escapeHtml(detail.recordDate || "")} · ${escapeHtml(detail.caregiverName || "")}</small>
          </div>
          <button class="icon-button" type="button" data-action="close-caregiver-record-detail">${renderIcon("close")}</button>
        </header>
        <div class="caregiver-record-detail-modal__summary">
          <span>打卡 ${detail.checkInCount || 0}</span>
          <span>文字 ${detail.noteCount || 0}</span>
          <span>图片 ${detail.photoCount || 0}</span>
        </div>
        <div class="caregiver-record-detail-table">
          ${
            rows.length
              ? rows
                  .map(
                    (row) => `
                      <div class="caregiver-record-detail-row">
                        <div>
                          <strong>${escapeHtml(row.taskName || "任务卡")}</strong>
                          <small>${escapeHtml(row.checkInTime || "未打卡")}</small>
                        </div>
                        <p>${escapeHtml(row.note || "无文字记录")}</p>
                        <div class="caregiver-record-detail-row__media">
                          <span>${Number(row.photoCount || 0)} 张图片</span>
                          ${
                            Number(row.photoCount || 0) > 0
                              ? `<button type="button" data-action="preview-caregiver-record-photo" data-task-id="${escapeHtml(row.id || "")}" data-photo-index="0">查看图片</button>`
                              : ""
                          }
                        </div>
                      </div>
                    `,
                  )
                  .join("")
              : `<div class="empty-state empty-state--soft">该日期没有可查看的任务卡记录。</div>`
          }
        </div>
      </article>
      ${
        previewUrl
          ? `<button class="task-record-lightbox" type="button" data-action="close-caregiver-record-photo-preview" aria-label="返回记录">
              <img src="${escapeHtml(previewUrl)}" alt="${escapeHtml(previewPhoto?.name || "任务图片")}" />
            </button>`
          : ""
      }
    </section>
  `;
}

function renderTaskRecordDialog() {
  const dialog = state.ui.taskRecordDialog;
  if (state.session.identity !== "caregiver" || !dialog) return "";

  const isQuick = dialog.type === "quick";
  const isException = dialog.type === "exception";
  const task = isQuick ? null : state.tasks.find((item) => item.id === dialog.taskId);
  if (!isQuick && !task) return "";

  const elder = isQuick
    ? state.elders.find((item) => item.id === dialog.elderId)
    : state.elders.find((item) => item.id === task.elderId);
  if (isQuick && !elder) return "";
  const evidenceKey = isQuick ? elder.id : task.id;
  const evidenceKind = isQuick ? "quick" : isException ? "exception" : "record";
  const evidenceSource = isQuick
    ? state.ui.quickExceptionEvidence?.[evidenceKey]
    : isException
      ? state.ui.taskExceptionEvidence?.[evidenceKey]
      : state.ui.taskRecordEvidence?.[evidenceKey] || state.ui.taskEvidence?.[evidenceKey];
  const evidenceList = normalizeTaskEvidenceList(evidenceSource).slice(0, 6);
  const isSaving = Boolean(dialog.saving);
  const noteSource = isQuick
    ? state.ui.quickExceptionNotes?.[evidenceKey]
    : isException
      ? state.ui.taskExceptionNotes?.[evidenceKey]
      : state.ui.taskRecordNotes?.[evidenceKey] || state.ui.taskNotes?.[evidenceKey];
  const note = dialog.note ?? noteSource ?? "";
  const title = isQuick ? "快速异常上报" : isException ? "异常记录" : "任务记录";
  const meta = isQuick
    ? `${elder.room || ""}室 · ${elder.name || ""}`
    : `${elder ? `${elder.room || ""}室 · ${elder.name || ""}` : ""} ${task.schedule || ""} · ${task.title || ""}`;
  const previewIndex = Number.isInteger(dialog.previewIndex) ? dialog.previewIndex : null;
  const previewEvidence = previewIndex !== null ? evidenceList[previewIndex] : null;
  const targetAttrs = `
    data-evidence-task="${task ? task.id : ""}"
    data-evidence-elder="${elder ? elder.id : ""}"
    data-evidence-kind="${evidenceKind}"
  `;

  return `
    <section class="task-record-modal" role="dialog" aria-modal="true">
      <button class="task-record-modal__backdrop" type="button" data-action="close-task-record-dialog" aria-label="关闭记录"></button>
      <article class="task-record-modal__dialog">
        <header class="task-record-modal__head">
          <div>
            <strong>${title}</strong>
            <small>${meta}</small>
          </div>
          <button class="icon-button" type="button" data-action="close-task-record-dialog">${renderIcon("close")}</button>
        </header>

        <div class="task-record-modal__photo">
          <div class="task-record-photo-grid">
            ${evidenceList
              .map(
                (evidence, index) => `
                  <button
                    class="task-record-thumb"
                    type="button"
                    data-action="preview-task-evidence"
                    ${targetAttrs}
                    data-evidence-index="${index}"
                    data-evidence-preview-task="${task ? task.id : ""}"
                    data-evidence-preview-elder="${elder ? elder.id : ""}"
                    data-evidence-preview-kind="${evidenceKind}"
                    data-evidence-preview-index="${index}"
                  >
                    ${
                      evidence.dataUrl
                        ? `<img src="${escapeHtml(evidence.dataUrl)}" alt="${escapeHtml(evidence.name || "任务照片")}" />`
                        : `<span>${escapeHtml(evidence.name || "照片")}</span>`
                    }
                  </button>
                `,
              )
              .join("")}
            ${
              evidenceList.length < 6
                ? `<label class="task-record-thumb task-record-thumb--add">
            <input
              class="visually-hidden"
              type="file"
              accept="image/*"
              capture="environment"
              ${targetAttrs}
            />
            <span>+</span>
          </label>`
                : ""
            }
          </div>
          <p>${evidenceList.length ? `已添加 ${evidenceList.length}/6 张，长按缩略图可删除` : "暂无照片"}</p>
        </div>

        <label class="task-record-modal__field">
          <span>${isException || isQuick ? "异常说明" : "文字记录"}</span>
          <textarea
            rows="5"
            data-task-record-note
            placeholder="${isException || isQuick ? "填写异常情况、处理经过或后续提醒" : "填写护理过程、补充说明或交接事项"}"
          >${escapeHtml(note)}</textarea>
        </label>

        <div class="task-record-modal__actions">
          <button class="button button--muted" type="button" data-action="close-task-record-dialog" ${isSaving ? "disabled" : ""}>取消</button>
          <button class="button button--primary" type="button" data-action="save-task-record-dialog" ${isSaving ? "disabled" : ""}>${isSaving ? "保存中..." : "保存"}</button>
        </div>
      </article>
      ${
        previewEvidence?.dataUrl
          ? `<button class="task-record-lightbox" type="button" data-action="close-task-evidence-preview" aria-label="返回记录">
              <img src="${escapeHtml(previewEvidence.dataUrl)}" alt="${escapeHtml(previewEvidence.name || "任务照片")}" />
            </button>`
          : ""
      }
    </section>
  `;
}

function getPrimaryScrollContainer() {
  const routeScroller = app.querySelector(".director-page--care-plans");
  if (
    routeScroller &&
    routeScroller.scrollHeight > routeScroller.clientHeight + 4 &&
    (routeScroller.scrollTop > 0 || !app.querySelector(".content-area"))
  ) {
    return routeScroller;
  }

  return app.querySelector(".content-area");
}

function getScrollSnapshot() {
  const reportTemplateSections = {};
  app.querySelectorAll(".director-report-template-section[data-report-template-section]").forEach((section) => {
    const sectionId = section.dataset.reportTemplateSection;
    if (sectionId) {
      reportTemplateSections[sectionId] = section.open;
    }
  });

  return {
    primary: getPrimaryScrollContainer()?.scrollTop || 0,
    content: app.querySelector(".content-area")?.scrollTop || 0,
    directorPlan: app.querySelector(".director-page--care-plans")?.scrollTop || 0,
    directorPlanSidebar: app.querySelector(".director-plan-sidebar__panel")?.scrollTop || 0,
    directorPlanResidentDrawer: app.querySelector(".director-plan-resident-drawer__panel")?.scrollTop || 0,
    directorPlanFloorStrip: app.querySelector(".director-plan-floor-strip")?.scrollLeft || 0,
    caregiverTimeline:
      app.querySelector("[data-caregiver-timeline-fullscreen-list]")?.scrollTop ||
      app.querySelector("[data-caregiver-timeline-list]")?.scrollTop ||
      0,
    taskRecordDialog: app.querySelector(".task-record-modal__dialog")?.scrollTop || 0,
    reportTemplateDialog: app.querySelector(".director-report-template-modal__dialog")?.scrollTop || 0,
    reportTemplateSchedule: app.querySelector(".director-report-schedule-page__body")?.scrollTop || 0,
    reportTemplateSections,
  };
}

function getDirectorTimelineScrollSnapshot() {
  const snapshot = getScrollSnapshot();
  const sidebarTop = app.querySelector(".director-plan-sidebar__panel")?.scrollTop || snapshot.directorPlanSidebar || 0;
  return {
    ...snapshot,
    primary: sidebarTop,
    directorPlanSidebar: sidebarTop,
  };
}

function normalizeScrollSnapshot(value) {
  if (value && typeof value === "object") {
    return {
      primary: Number(value.primary) || 0,
      content: Number(value.content) || 0,
      directorPlan: Number(value.directorPlan) || 0,
      directorPlanSidebar: Number(value.directorPlanSidebar) || 0,
      directorPlanResidentDrawer: Number(value.directorPlanResidentDrawer) || 0,
      directorPlanFloorStrip: Number(value.directorPlanFloorStrip) || 0,
      caregiverTimeline: Number(value.caregiverTimeline) || 0,
      taskRecordDialog: Number(value.taskRecordDialog) || 0,
      reportTemplateDialog: Number(value.reportTemplateDialog) || 0,
      reportTemplateSchedule: Number(value.reportTemplateSchedule) || 0,
      reportTemplateSections:
        value.reportTemplateSections && typeof value.reportTemplateSections === "object"
          ? value.reportTemplateSections
          : {},
    };
  }

  const scrollTop = Number(value) || 0;
  return {
    primary: scrollTop,
    content: scrollTop,
    directorPlan: scrollTop,
    directorPlanSidebar: scrollTop,
    directorPlanResidentDrawer: 0,
    directorPlanFloorStrip: 0,
    caregiverTimeline: 0,
    taskRecordDialog: 0,
    reportTemplateDialog: 0,
    reportTemplateSchedule: 0,
    reportTemplateSections: {},
  };
}

function restoreReportTemplateSectionState(sectionState = {}) {
  app.querySelectorAll(".director-report-template-section[data-report-template-section]").forEach((section) => {
    const sectionId = section.dataset.reportTemplateSection;
    if (sectionId && Object.prototype.hasOwnProperty.call(sectionState, sectionId)) {
      section.open = Boolean(sectionState[sectionId]);
    }
  });
}

function rememberScrollPosition() {
  const scroller = getPrimaryScrollContainer();
  if (!scroller) return;

  const route = scroller.dataset.route || state.ui.route;
  if (pendingScrollRestore?.route === route) return;
  routeScrollPositions.set(route, getScrollSnapshot());
}

function restoreScrollPosition(route) {
  const scroller = getPrimaryScrollContainer();
  if (!scroller) return;

  scroller.dataset.route = route;
  const hasPendingRestore = pendingScrollRestore?.route === route;
  const hasLockedRestore = lockedScrollRestore?.route === route && Date.now() < lockedScrollRestore.expiresAt;
  const snapshot = normalizeScrollSnapshot(
    hasPendingRestore
      ? pendingScrollRestore.scrollTop
      : hasLockedRestore
        ? lockedScrollRestore.scrollTop
        : routeScrollPositions.get(route) || 0,
  );
  const applyScroll = () => {
    const currentPrimary = getPrimaryScrollContainer();
    if (currentPrimary) {
      currentPrimary.scrollTop = Math.min(snapshot.primary, Math.max(0, currentPrimary.scrollHeight - currentPrimary.clientHeight));
    }

    const contentScroller = app.querySelector(".content-area");
    if (contentScroller) {
      contentScroller.scrollTop = Math.min(snapshot.content, Math.max(0, contentScroller.scrollHeight - contentScroller.clientHeight));
    }

    const directorPlanScroller = app.querySelector(".director-page--care-plans");
    if (directorPlanScroller) {
      directorPlanScroller.scrollTop = Math.min(snapshot.directorPlan || snapshot.primary, Math.max(0, directorPlanScroller.scrollHeight - directorPlanScroller.clientHeight));
    }

    const directorPlanSidebar = app.querySelector(".director-plan-sidebar__panel");
    if (directorPlanSidebar) {
      directorPlanSidebar.scrollTop = Math.min(snapshot.directorPlanSidebar, Math.max(0, directorPlanSidebar.scrollHeight - directorPlanSidebar.clientHeight));
    }

    const directorPlanResidentDrawer = app.querySelector(".director-plan-resident-drawer__panel");
    if (directorPlanResidentDrawer) {
      directorPlanResidentDrawer.scrollTop = Math.min(snapshot.directorPlanResidentDrawer, Math.max(0, directorPlanResidentDrawer.scrollHeight - directorPlanResidentDrawer.clientHeight));
    }

    const directorPlanFloorStrip = app.querySelector(".director-plan-floor-strip");
    if (directorPlanFloorStrip) {
      directorPlanFloorStrip.scrollLeft = snapshot.directorPlanFloorStrip;
    }

    const caregiverTimeline =
      app.querySelector("[data-caregiver-timeline-fullscreen-list]") || app.querySelector("[data-caregiver-timeline-list]");
    if (caregiverTimeline) {
      caregiverTimeline.scrollTop = snapshot.caregiverTimeline;
    }

    const taskRecordDialog = app.querySelector(".task-record-modal__dialog");
    if (taskRecordDialog) {
      taskRecordDialog.scrollTop = snapshot.taskRecordDialog;
    }

    const reportTemplateDialog = app.querySelector(".director-report-template-modal__dialog");
    if (reportTemplateDialog) {
      reportTemplateDialog.scrollTop = snapshot.reportTemplateDialog;
    }

    const reportTemplateSchedule = app.querySelector(".director-report-schedule-page__body");
    if (reportTemplateSchedule) {
      reportTemplateSchedule.scrollTop = snapshot.reportTemplateSchedule;
    }

    restoreReportTemplateSectionState(snapshot.reportTemplateSections);
  };

  window.requestAnimationFrame(() => {
    applyScroll();
    window.requestAnimationFrame(applyScroll);
  });
  window.setTimeout(applyScroll, 80);
  window.setTimeout(applyScroll, 180);
  window.setTimeout(applyScroll, 320);
  window.setTimeout(applyScroll, 520);

  if (hasPendingRestore) {
    pendingScrollRestore = null;
  }
}

function requestScrollRestore(route, scrollTop = 0) {
  pendingScrollRestore = { route, scrollTop };
  skipCaregiverTimelineAutoFocus = true;
}

function lockScrollRestore(route, scrollTop = 0, durationMs = 1600) {
  const snapshot = normalizeScrollSnapshot(scrollTop);
  pendingScrollRestore = { route, scrollTop: snapshot };
  lockedScrollRestore = {
    route,
    scrollTop: snapshot,
    expiresAt: Date.now() + durationMs,
  };
  skipCaregiverTimelineAutoFocus = true;
}

function releaseScrollRestoreLock() {
  if (!lockedScrollRestore) return;
  const restore = lockedScrollRestore;
  window.setTimeout(() => {
    if (lockedScrollRestore === restore) {
      lockedScrollRestore = null;
    }
  }, 180);
}

function markUserScrollActivity() {
  lastUserScrollAt = Date.now();
}

function isUserRecentlyScrolling(windowMs = 1400) {
  return Date.now() - lastUserScrollAt < windowMs;
}

function isDirectorRoute(route = state.ui.route) {
  return typeof route === "string" && route.startsWith("director-");
}

function isDirectorScrollProtected(windowMs = 1400) {
  return isDirectorRoute() && isUserRecentlyScrolling(windowMs);
}

function isCaregiverRoute(route = state.ui.route) {
  return ["home", "room-select", "elder-detail", "task-detail", "history", "history-detail", "inventory-usage", "profile"].includes(route);
}

function isCaregiverScrollProtected(windowMs = 1400) {
  return state.session.identity === "caregiver" && isCaregiverRoute() && isUserRecentlyScrolling(windowMs);
}

function isAppScrollProtected(windowMs = 1400) {
  return isDirectorScrollProtected(windowMs) || isCaregiverScrollProtected(windowMs);
}

function isCarePlansScrollProtected(windowMs = 1400) {
  return state.ui.route === "director-care-plans" && isUserRecentlyScrolling(windowMs);
}

function deferScrollProtectedRender() {
  window.clearTimeout(deferredScrollRenderTimer);
  deferredScrollRenderTimer = window.setTimeout(() => {
    deferredScrollRenderTimer = 0;
    renderApp();
  }, 260);
}

function findActionElement(action, value) {
  return Array.from(app.querySelectorAll(`[data-action="${action}"]`)).find((item) => item.dataset.value === value) || null;
}

function requestAnchorRestore(action, value) {
  const element = findActionElement(action, value);
  if (!element) return;

  pendingAnchorRestore = {
    action,
    value,
    top: element.getBoundingClientRect().top,
  };
}

function restoreAnchorPosition() {
  if (!pendingAnchorRestore) return;

  const anchor = pendingAnchorRestore;
  const scroller = getPrimaryScrollContainer();
  if (!scroller) {
    pendingAnchorRestore = null;
    return;
  }

  const applyAnchor = () => {
    const element = findActionElement(anchor.action, anchor.value);
    if (!element) return;
    const delta = element.getBoundingClientRect().top - anchor.top;
    if (Math.abs(delta) > 1) {
      scroller.scrollTop += delta;
    }
  };

  window.requestAnimationFrame(() => {
    applyAnchor();
    window.requestAnimationFrame(applyAnchor);
  });
  window.setTimeout(applyAnchor, 80);
  window.setTimeout(applyAnchor, 180);
  window.setTimeout(applyAnchor, 320);
  window.setTimeout(() => {
    applyAnchor();
    if (pendingAnchorRestore === anchor) {
      pendingAnchorRestore = null;
    }
  }, 480);
}

function getCurrentContentScrollTop() {
  return getScrollSnapshot();
}

function restoreScrollSnapshot(snapshot) {
  const normalized = normalizeScrollSnapshot(snapshot);
  const contentScroller = app.querySelector(".content-area");
  const directorPlanScroller = app.querySelector(".director-page--care-plans");
  const directorPlanFloorStrip = app.querySelector(".director-plan-floor-strip");
  const caregiverTimeline =
    app.querySelector("[data-caregiver-timeline-fullscreen-list]") || app.querySelector("[data-caregiver-timeline-list]");
  const reportTemplateDialog = app.querySelector(".director-report-template-modal__dialog");
  const reportTemplateSchedule = app.querySelector(".director-report-schedule-page__body");

  if (contentScroller) {
    contentScroller.scrollTop = normalized.content;
  }

  if (directorPlanScroller) {
    directorPlanScroller.scrollTop = normalized.directorPlan || normalized.primary;
  }

  if (directorPlanFloorStrip) {
    directorPlanFloorStrip.scrollLeft = normalized.directorPlanFloorStrip;
  }

  if (caregiverTimeline) {
    caregiverTimeline.scrollTop = normalized.caregiverTimeline;
  }

  if (reportTemplateDialog) {
    reportTemplateDialog.scrollTop = normalized.reportTemplateDialog;
  }

  if (reportTemplateSchedule) {
    reportTemplateSchedule.scrollTop = normalized.reportTemplateSchedule;
  }

  restoreReportTemplateSectionState(normalized.reportTemplateSections);
}

function syncCaregiverTimelineFocus() {
  if (state.session.identity !== "caregiver") return;
  if (state.ui.route !== "elder-detail" && state.ui.route !== "task-detail") return;
  if (skipCaregiverTimelineAutoFocus) {
    skipCaregiverTimelineAutoFocus = false;
    return;
  }

  const focusKey = `${state.ui.route}:${state.ui.selectedElderId}`;
  if (focusKey === lastCaregiverTimelineFocusKey) return;
  lastCaregiverTimelineFocusKey = focusKey;

  const timeline = app.querySelector("[data-caregiver-timeline-list]");
  const currentTask = timeline?.querySelector('[data-current-task="true"]');
  if (!timeline || !currentTask) return;

  const apply = () => {
    const targetTop = Math.max(0, currentTask.offsetTop - timeline.offsetTop - 8);
    timeline.scrollTop = targetTop;
  };

  window.requestAnimationFrame(apply);
  window.setTimeout(apply, 80);
}

function renderDirectorPlanPreviewInPlace(scrollSnapshot) {
  app.querySelectorAll('[data-action="preview-director-plan-room"]').forEach((card) => {
    card.classList.toggle("is-active", card.dataset.value === state.ui.selectedDirectorPlanRoom);
  });

  restoreScrollSnapshot(scrollSnapshot);
  window.requestAnimationFrame(() => restoreScrollSnapshot(scrollSnapshot));
  window.setTimeout(() => restoreScrollSnapshot(scrollSnapshot), 80);
  window.setTimeout(() => restoreScrollSnapshot(scrollSnapshot), 180);
}

function renderDirectorTemporarySearchResultsInPlace() {
  const panel = app.querySelector(".director-temporary-search-results");
  if (!panel) return;

  const searchResults = selectors().directorDispatchElderPicker?.searchResults || [];
  panel.replaceChildren();

  if (!searchResults.length) {
    const empty = document.createElement("span");
    empty.textContent = "杈撳叆濮撳悕鍚庢樉绀哄尮閰嶈€佷汉";
    panel.appendChild(empty);
    return;
  }

  searchResults.forEach((elder) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.action = "select-director-temporary-elder";
    button.dataset.value = elder.id;
    button.textContent = `${elder.floor}F 路 ${elder.room}瀹?路 ${elder.name}`;
    panel.appendChild(button);
  });
}

function buildNavigationSnapshot() {
  return {
    route: state.ui.route,
    activeTab: state.ui.activeTab,
    selectedFloor: state.ui.selectedFloor,
    selectedRoom: state.ui.selectedRoom,
    selectedElderId: state.ui.selectedElderId,
    selectedTaskId: state.ui.selectedTaskId,
    selectedHistoryId: state.ui.selectedHistoryId,
    selectedDirectorFloor: state.ui.selectedDirectorFloor,
    selectedDirectorElder: state.ui.selectedDirectorElder,
    selectedDirectorPlanFloor: state.ui.selectedDirectorPlanFloor,
    selectedDirectorPlanRoom: state.ui.selectedDirectorPlanRoom,
    directorPersonnelType: state.ui.directorPersonnelType,
    directorPersonnelFloor: state.ui.directorPersonnelFloor,
    directorAuditFloor: state.ui.directorAuditFloor,
    directorAuditDate: state.ui.directorAuditDate,
    directorAuditProject: state.ui.directorAuditProject,
    directorInboxSelectedDate: state.ui.directorInboxSelectedDate,
    directorInboxExportDate: state.ui.directorInboxExportDate,
    directorPlanTimelineOpen: state.ui.directorPlanTimelineOpen,
    directorPlanTimelineSettled: state.ui.directorPlanTimelineSettled,
    selectedDirectorCareRecordElderId: state.ui.selectedDirectorCareRecordElderId,
    directorCareRecordPreviewOpen: state.ui.directorCareRecordPreviewOpen,
    directorCareRecordBatchDate: state.ui.directorCareRecordBatchDate,
    batchPanelOpen: state.ui.batchPanelOpen,
    selectedCaregiverReportElderId: state.ui.selectedCaregiverReportElderId,
  };
}

function syncBrowserHistory() {
  if (isRestoringBrowserHistory) return;

  const snapshot = buildNavigationSnapshot();
  const signature = JSON.stringify(snapshot);
  if (signature === lastHistorySignature) return;

  const method = window.history.state?.appNav ? "pushState" : "replaceState";
  window.history[method]({ appNav: snapshot }, "", "");
  lastHistorySignature = signature;
}

function goBackOrNavigate(fallbackRoute = "home") {
  if (window.history.state?.appNav && window.history.length > 1) {
    window.history.back();
    return;
  }

  actions.navigate(fallbackRoute);
}

function navigateBackByPageLayer() {
  const route = state.ui.route;

  if (state.ui.appUpdate?.open) {
    actions.closeAppUpdateDialog();
    return true;
  }

  if (state.ui.appInfoDialog) {
    actions.closeAppInfoDialog();
    return true;
  }

  if (state.ui.loginMenuOpen) {
    actions.closeLoginMenu();
    return true;
  }

  if (state.ui.taskRecordDialog) {
    actions.closeTaskRecordDialog();
    return true;
  }

  if (state.ui.selectedCaregiverReportElderId) {
    if (Number.isInteger(state.ui.caregiverRecordPhotoPreviewIndex)) {
      actions.closeCaregiverRecordPhotoPreview();
      return true;
    }
    actions.closeCaregiverRecordDetail();
    return true;
  }

  if (state.ui.caregiverTimelineFullscreen) {
    actions.closeCaregiverTimelineFullscreen();
    return true;
  }

  if (state.ui.directorReportTemplatePreviewOpen) {
    actions.closeDailyReportTemplatePreview();
    return true;
  }

  if (state.ui.directorReportTemplateImportOpen) {
    actions.closeDailyReportTemplateImport();
    return true;
  }

  if (state.ui.directorReportTemplateScheduleSectionId) {
    actions.closeDailyReportTemplateSchedule();
    return true;
  }

  if (state.ui.directorReportTemplateDraft) {
    actions.closeDailyReportTemplateEditor();
    return true;
  }

  if (state.ui.directorCareRecordPreviewOpen) {
    actions.closeDirectorCareRecordPreview();
    return true;
  }

  if (state.ui.directorInboxExportDate) {
    actions.closeDirectorInboxExport();
    return true;
  }

  if (state.ui.directorPlanTimelineOpen) {
    actions.closeDirectorPlanTimeline();
    return true;
  }

  if (state.ui.batchPanelOpen) {
    actions.closeBatchPanel();
    return true;
  }

  if (state.ui.directorDispatchDraft) {
    actions.closeDirectorDispatchDraft();
    return true;
  }

  if (state.ui.directorPersonnelDraft) {
    actions.closeDirectorPersonnelDraft();
    return true;
  }

  if (state.ui.directorPersonnelPlanDetailElderId) {
    actions.closeDirectorPersonnelPlanDetail();
    return true;
  }

  if (state.ui.directorTemplateDraft) {
    actions.closeTemplateDraft();
    return true;
  }

  if (state.ui.directorPlanItemDraft) {
    actions.closePlanItemDraft();
    return true;
  }

  if (state.ui.directorPlanDraft) {
    actions.closePlanDraft();
    return true;
  }

  const layerFallbacks = {
    attendance: "home",
    "room-select": "home",
    "elder-detail": "room-select",
    "task-detail": "elder-detail",
    "caregiver-daily-report": "room-select",
    "history-detail": "history",
    history: "home",
    profile: "home",
    "family-health": "family-home",
    "family-messages": "family-home",
    "family-profile": "family-home",
    "director-floor-detail": "director-home",
    "director-caregiver": "director-home",
    "director-assignments": "director-home",
    "director-template-library": "director-care-plans",
    "director-care-plans": "director-home",
    "director-care-records": "director-home",
    "director-people": "director-home",
    "director-profile": "director-home",
    "director-dispatch": "director-home",
    "director-inventory": "director-home",
    "director-anomaly": "director-home",
    "director-statistics": "director-home",
  };

  const fallbackRoute = layerFallbacks[route];
  if (!fallbackRoute) return false;

  goBackOrNavigate(fallbackRoute);
  return true;
}

function collectDirectorTemplateDraftForm() {
  const draft = state.ui.directorTemplateDraft;
  const form = document.querySelector("[data-template-draft-form]");
  if (!draft || !form) return draft;

  return {
    ...draft,
    group: form.elements.group?.value || draft.group,
    title: form.elements.title?.value || "",
    category: form.elements.category?.value || "",
    requirePhoto: (form.elements.recordType?.value || "text") === "photo",
    batchEligible: (form.elements.executionMode?.value || "single") === "batch",
    appliesToLevels: Array.from(form.querySelectorAll('input[name="appliesToLevels"]:checked')).map((input) => input.value),
    defaultNote: form.elements.defaultNote?.value || "",
  };
}

function collectDirectorPlanDraftForm() {
  const draft = state.ui.directorPlanDraft;
  const form = document.querySelector("[data-plan-draft-form]");
  if (!draft || !form) return draft;

  return {
    ...draft,
    elderId: form.elements.elderId?.value || "",
    level: form.elements.level?.value || "",
    reviewCycle: form.elements.reviewCycle?.value || "",
    note: form.elements.note?.value || "",
    items: draft.items,
  };
}

function collectDirectorPersonnelForm(type) {
  const form = document.querySelector(`[data-personnel-form="${type}"]`);
  if (!form) return {};

  const data = new FormData(form);
  return Object.fromEntries(data.entries());
}

function collectDirectorPlanItemDraftForm() {
  const draft = state.ui.directorPlanItemDraft;
  const form = document.querySelector("[data-plan-item-draft-form]");
  if (!draft || !form) return draft;

  return {
    ...draft,
    templateId: form.elements.templateId?.value || "",
    schedule: form.elements.schedule?.value || "",
    assignment: form.elements.assignment?.value || "floor-owner",
    note: form.elements.note?.value || "",
  };
}

function collectDirectorDispatchDraftForm() {
  const draft = state.ui.directorDispatchDraft;
  const form = document.querySelector("[data-director-dispatch-draft-form]");
  if (!draft || !form) return draft;

  return {
    ...draft,
    mode: draft.mode || "",
    title: form.elements.title?.value || "",
    schedule: form.elements.schedule?.value || "",
    floor: form.elements.floor?.value || draft.floor || "",
    room: form.elements.room?.value || draft.room || "",
    timeMode: form.elements.timeMode?.value || draft.timeMode || "now",
    startTime: form.elements.startTime?.value || draft.startTime || "",
    endTime: form.elements.endTime?.value || draft.endTime || "",
    elderSearch: form.elements.elderSearch?.value || draft.elderSearch || "",
    elderSearchOpen: Boolean(draft.elderSearchOpen),
    status: form.elements.status?.value || "pending",
    requirePhoto: (form.elements.recordType?.value || "text") === "photo",
    elderId: form.elements.elderId?.value || draft.elderId || "",
    caregiverId: form.elements.caregiverId?.value || "",
    note: form.elements.description?.value || form.elements.note?.value || "",
    description: form.elements.description?.value || form.elements.note?.value || "",
  };
}

function getCareTypeLabel(value) {
  if (value === "self-care") return "自理";
  if (value === "full-care") return "全护理";
  return "半自理";
}

function getTemplateItemLookup(template = state.dailyReportTemplate) {
  const lookup = new Map();
  (template?.sections || []).forEach((section) => {
    (section.items || []).forEach((item) => {
      lookup.set(item.id, item.label || "");
    });
  });
  return lookup;
}

function collectReportTemplateItems(form, fallback = {}) {
  const nextItems = { ...(fallback || {}) };
  form.querySelectorAll("[data-report-template-item]").forEach((input) => {
    nextItems[input.dataset.reportTemplateItem] = Boolean(input.checked);
  });
  return nextItems;
}

function deriveDailyCareFromReportItems(reportItems, template = state.dailyReportTemplate) {
  const lookup = getTemplateItemLookup(template);
  const checkedLabels = Object.entries(reportItems || {})
    .filter(([, checked]) => Boolean(checked))
    .map(([id]) => lookup.get(id) || id)
    .join(" ");

  return {
    morningCare: /晨|起床|早/.test(checkedLabels),
    eveningCare: /晚|睡前/.test(checkedLabels),
    feedingWater: /水|饮水/.test(checkedLabels),
    feedingMeal: /餐|饮食|助餐|喂饭/.test(checkedLabels),
    hygiene: /洗脸|刷牙|梳头|口腔|面部|卫生|清洁/.test(checkedLabels),
    dressing: /更衣|穿衣/.test(checkedLabels),
    turning: /翻身/.test(checkedLabels),
    toiletAssist: /下床|行走|站立|坐立/.test(checkedLabels),
    diaperPadChange: /尿不湿|护理垫|会阴/.test(checkedLabels),
    bathWipe: /洗澡|擦身|洗头|泡脚/.test(checkedLabels),
  };
}

function collectDailyReportTemplateDraft() {
  const form = document.querySelector("[data-daily-report-template-form]");
  const current = state.ui.directorReportTemplateDraft || state.dailyReportTemplate;
  if (!form || !current) return current;

  const sections = Array.from(form.querySelectorAll("[data-report-template-section]"))
    .map((section, sectionIndex) => {
      const sectionId = section.dataset.reportTemplateSection || `section-${sectionIndex + 1}`;
      const title = section.querySelector("[data-report-template-section-title]")?.value?.trim() || "";
      const rows = Array.from(section.querySelectorAll("[data-report-template-item-row]"))
        .map((row, itemIndex) => {
          const label = row.querySelector("[data-report-template-item-label]")?.value?.trim() || "";
          const itemId = row.dataset.reportTemplateItemRow || `${sectionId}-${itemIndex + 1}`;
          const previousItem = (current.sections || [])
            .find((itemSection) => itemSection.id === sectionId)
            ?.items?.find((item) => item.id === itemId);
          return {
            id: itemId,
            label,
            frequencyDays: Math.max(1, Number(row.querySelector("[data-report-template-item-frequency]")?.value || 1)),
            timeWindow: previousItem?.timeWindow || "",
            requirePhoto: Boolean(previousItem?.requirePhoto),
          };
        })
        .filter(Boolean);
      return {
        id: sectionId,
        title,
        items: rows,
      };
    })
    .filter((section) => section.id);

  return {
    ...current,
    title: form.elements.templateTitle?.value?.trim() || current.title,
    careLevel: form.elements.templateCareLevel?.value || current.careLevel || "all",
    sections,
  };
}

function collectDailyReportTemplateTransient() {
  const form = document.querySelector("[data-daily-report-template-form]");
  if (!form) return { newSectionTitle: "", newItems: {} };

  const newItems = {};
  form.querySelectorAll("[data-report-template-section]").forEach((section) => {
    const sectionId = section.dataset.reportTemplateSection || "";
    if (!sectionId) return;
    newItems[sectionId] = {
      label: section.querySelector("[data-report-template-new-item-label]")?.value || "",
      frequencyDays: section.querySelector("[data-report-template-new-item-frequency]")?.value || "1",
    };
  });

  return {
    newSectionTitle: form.elements.newSectionTitle?.value || "",
    newItems,
  };
}

function persistDailyReportTemplateEditorState() {
  const form = document.querySelector("[data-daily-report-template-form]");
  if (!form || !state.ui.directorReportTemplateDraft) return;

  const draft = collectDailyReportTemplateDraft();
  state.ui.directorReportTemplateDraft = {
    ...(state.ui.directorReportTemplateDraft || state.dailyReportTemplate),
    ...(draft || {}),
    sections: Array.isArray(draft?.sections) ? draft.sections : [],
  };
  state.ui.directorReportTemplateTransient = collectDailyReportTemplateTransient();
}

function formatReportTemplateScheduleTime(minutes = REPORT_TEMPLATE_SCHEDULE_START_MINUTES) {
  const normalized = Math.max(0, Math.min(24 * 60, Math.round(Number(minutes || 0))));
  return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`;
}

function buildReportTemplateScheduleWindow(startMinutes, duration = 60) {
  const normalizedDuration = Math.min(
    REPORT_TEMPLATE_SCHEDULE_END_MINUTES - REPORT_TEMPLATE_SCHEDULE_START_MINUTES,
    Math.max(REPORT_TEMPLATE_SCHEDULE_MIN_DURATION, Number(duration || 60)),
  );
  const start = Math.max(
    REPORT_TEMPLATE_SCHEDULE_START_MINUTES,
    Math.min(REPORT_TEMPLATE_SCHEDULE_END_MINUTES - normalizedDuration, Number(startMinutes || 0)),
  );
  const end = Math.min(REPORT_TEMPLATE_SCHEDULE_END_MINUTES, start + normalizedDuration);
  return `${formatReportTemplateScheduleTime(start)}-${formatReportTemplateScheduleTime(end)}`;
}

function clampReportTemplateScheduleTop(top, duration = 60) {
  const normalizedDuration = Math.min(
    REPORT_TEMPLATE_SCHEDULE_END_MINUTES - REPORT_TEMPLATE_SCHEDULE_START_MINUTES,
    Math.max(REPORT_TEMPLATE_SCHEDULE_MIN_DURATION, Number(duration || 60)),
  );
  const maxTop =
    (REPORT_TEMPLATE_SCHEDULE_END_MINUTES -
      REPORT_TEMPLATE_SCHEDULE_START_MINUTES -
      normalizedDuration) *
    REPORT_TEMPLATE_SCHEDULE_PX_PER_MINUTE;
  return Math.max(0, Math.min(maxTop, Number(top || 0)));
}

function minutesFromReportTemplateScheduleTop(top) {
  const rawMinutes = REPORT_TEMPLATE_SCHEDULE_START_MINUTES + Number(top || 0) / REPORT_TEMPLATE_SCHEDULE_PX_PER_MINUTE;
  return Math.round(rawMinutes / REPORT_TEMPLATE_SCHEDULE_STEP_MINUTES) * REPORT_TEMPLATE_SCHEDULE_STEP_MINUTES;
}

function updateReportTemplateScheduleCard(card, top) {
  if (!card) return "";
  const duration = Math.min(
    REPORT_TEMPLATE_SCHEDULE_END_MINUTES - REPORT_TEMPLATE_SCHEDULE_START_MINUTES,
    Math.max(REPORT_TEMPLATE_SCHEDULE_MIN_DURATION, Number(card.dataset.duration || 60)),
  );
  const nextTop = clampReportTemplateScheduleTop(top, duration);
  const nextMinutes = Math.max(
    REPORT_TEMPLATE_SCHEDULE_START_MINUTES,
    Math.min(REPORT_TEMPLATE_SCHEDULE_END_MINUTES - duration, minutesFromReportTemplateScheduleTop(nextTop)),
  );
  const snappedTop = (nextMinutes - REPORT_TEMPLATE_SCHEDULE_START_MINUTES) * REPORT_TEMPLATE_SCHEDULE_PX_PER_MINUTE;
  const timeWindow = buildReportTemplateScheduleWindow(nextMinutes, duration);

  card.style.top = `${snappedTop}px`;
  card.style.height = `${Math.max(
    REPORT_TEMPLATE_SCHEDULE_CARD_MIN_HEIGHT,
    duration * REPORT_TEMPLATE_SCHEDULE_PX_PER_MINUTE,
  )}px`;
  card.dataset.minutes = String(nextMinutes);
  const timeNode = card.querySelector("[data-report-template-schedule-time]");
  if (timeNode) timeNode.textContent = timeWindow;
  return timeWindow;
}

function handleReportTemplateSchedulePointerDown(event) {
  const card = event.target.closest("[data-report-template-schedule-card]");
  if (!card) return;
  if (event.target.closest("[data-report-template-schedule-menu]")) return;

  event.preventDefault();
  reportTemplateScheduleDrag = {
    card,
    pointerId: event.pointerId,
    startY: event.clientY,
    startTop: parseFloat(card.style.top || "0") || 0,
    startTimeWindow: card.querySelector("[data-report-template-schedule-time]")?.textContent || "",
    hasMoved: false,
    sectionId: card.dataset.sectionId,
    itemId: card.dataset.itemId,
  };
  card.classList.add("is-dragging");
  card.setPointerCapture?.(event.pointerId);
}

function handleReportTemplateSchedulePointerMove(event) {
  if (!reportTemplateScheduleDrag) return;
  event.preventDefault();
  if (Math.abs(event.clientY - reportTemplateScheduleDrag.startY) > 3) {
    reportTemplateScheduleDrag.hasMoved = true;
  }
  const nextTop = reportTemplateScheduleDrag.startTop + event.clientY - reportTemplateScheduleDrag.startY;
  updateReportTemplateScheduleCard(reportTemplateScheduleDrag.card, nextTop);
}

function handleReportTemplateSchedulePointerUp(event) {
  if (!reportTemplateScheduleDrag) return;
  const drag = reportTemplateScheduleDrag;
  const nextTop = drag.startTop + (Number(event.clientY || drag.startY) - drag.startY);
  const timeWindow = updateReportTemplateScheduleCard(drag.card, nextTop);

  drag.card.classList.remove("is-dragging");
  drag.card.releasePointerCapture?.(drag.pointerId);
  reportTemplateScheduleDrag = null;

  if (drag.hasMoved && timeWindow && timeWindow !== drag.startTimeWindow) {
    requestScrollRestore(state.ui.route, getCurrentContentScrollTop());
    actions.setDailyReportTemplateItemTime(drag.sectionId, drag.itemId, timeWindow);
  }
}

function collectCareRecordForm() {
  const draft =
    state.ui.route === "caregiver-daily-report" ? state.ui.caregiverDailyReportDraft : state.ui.directorCareRecordDraft;
  const form = document.querySelector("[data-care-record-form]");
  if (!draft || !form) return draft;

  const careType = form.elements.careType?.value || draft.careType;
  const health = {
    none: Boolean(form.elements.healthNone?.checked),
    appetitePoor: Boolean(form.elements.healthAppetitePoor?.checked),
    sleepPoor: Boolean(form.elements.healthSleepPoor?.checked),
    dizziness: Boolean(form.elements.healthDizziness?.checked),
    nausea: Boolean(form.elements.healthNausea?.checked),
    bowelIssue: Boolean(form.elements.healthBowelIssue?.checked),
    skinIssue: Boolean(form.elements.healthSkinIssue?.checked),
    fall: Boolean(form.elements.healthFall?.checked),
    other: form.elements.healthOther?.value?.trim() || "",
    treatment: form.elements.healthTreatment?.value?.trim() || "",
  };
  const hasHealthIssue =
    health.appetitePoor ||
    health.sleepPoor ||
    health.dizziness ||
    health.nausea ||
    health.bowelIssue ||
    health.skinIssue ||
    health.fall ||
    Boolean(health.other);

  health.none = hasHealthIssue ? false : true;
  const reportTemplateSnapshot = draft.reportTemplateSnapshot || state.dailyReportTemplate;
  const reportItems = collectReportTemplateItems(form, draft.reportItems || {});
  const derivedDailyCare = deriveDailyCareFromReportItems(reportItems, reportTemplateSnapshot);
  const hasLegacyDailyInputs = Boolean(form.elements.dailyMorningCare);

  return {
    ...draft,
    institutionName: form.elements.institutionName?.value?.trim() || draft.institutionName,
    elderId: form.elements.elderId?.value || draft.elderId,
    elderName: form.elements.elderName?.value?.trim() || draft.elderName,
    gender: form.elements.gender?.value?.trim() || draft.gender,
    age: form.elements.age?.value?.trim() || draft.age,
    room: form.elements.room?.value?.trim() || draft.room,
    bed: form.elements.bed?.value?.trim() || draft.bed,
    careType,
    careLevelLabel: getCareTypeLabel(careType),
    recordDate: form.elements.recordDate?.value || draft.recordDate,
    recordTime: form.elements.recordTime?.value || draft.recordTime,
    caregiverName: form.elements.caregiverName?.value?.trim() || "",
    reviewerName: form.elements.reviewerName?.value?.trim() || "",
    dailyCare: hasLegacyDailyInputs
      ? {
          morningCare: Boolean(form.elements.dailyMorningCare?.checked),
          eveningCare: Boolean(form.elements.dailyEveningCare?.checked),
          feedingWater: Boolean(form.elements.dailyFeedingWater?.checked),
          feedingMeal: Boolean(form.elements.dailyFeedingMeal?.checked),
          hygiene: Boolean(form.elements.dailyHygiene?.checked),
          dressing: Boolean(form.elements.dailyDressing?.checked),
          turning: Boolean(form.elements.dailyTurning?.checked),
          toiletAssist: Boolean(form.elements.dailyToiletAssist?.checked),
          diaperPadChange: Boolean(form.elements.dailyDiaperPadChange?.checked),
          bathWipe: Boolean(form.elements.dailyBathWipe?.checked),
        }
      : derivedDailyCare,
    medication: {
      morning: Boolean(form.elements.medicationMorning?.checked),
      afternoon: Boolean(form.elements.medicationAfternoon?.checked),
      evening: Boolean(form.elements.medicationEvening?.checked),
      specialStatus: form.elements.specialMedicationStatus?.value || "none",
      commonDrugs: form.elements.commonDrugs?.value?.trim() || "",
    },
    health,
    inventory: {
      medicine: form.elements.inventoryMedicine?.value || "enough",
      diaper: form.elements.inventoryDiaper?.value || "enough",
      pad: form.elements.inventoryPad?.value || "enough",
      supplies: form.elements.inventorySupplies?.value || "enough",
    },
    signatures: {
      caregiverSign: form.elements.caregiverSign?.value?.trim() || "",
      reviewerSign: form.elements.reviewerSign?.value?.trim() || "",
      remark: form.elements.remark?.value?.trim() || "",
    },
    reportItems,
    reportTemplateSnapshot,
    filledAt: draft.filledAt || "",
  };
}

function collectInventoryItemForm() {
  const form = document.querySelector("[data-inventory-item-form]");
  if (!form) return {};
  return {
    name: form.elements.name?.value?.trim() || "",
    category: form.elements.category?.value?.trim() || "",
    unit: form.elements.unit?.value?.trim() || "件",
    quantity: Number(form.elements.quantity?.value || 0),
    warningQuantity: Number(form.elements.warningQuantity?.value || 0),
    location: form.elements.location?.value?.trim() || "",
  };
}

function collectInventoryUsageForm() {
  const form = document.querySelector("[data-inventory-usage-form]");
  if (!form) return {};
  return {
    itemId: form.elements.itemId?.value || "",
    quantity: Number(form.elements.quantity?.value || 0),
    note: form.elements.note?.value?.trim() || "",
  };
}

function collectInventoryStockAdjustForm() {
  const form = document.querySelector("[data-inventory-stock-adjust-form]");
  if (!form) return {};
  return {
    mode: form.elements.mode?.value || "increase",
    amount: Number(form.elements.amount?.value || 0),
  };
}

function persistDirectorAssignmentDrafts() {
  if (!["director-template-library", "director-care-plans", "director-dispatch"].includes(state.ui.route)) return;

  const templateDraft = collectDirectorTemplateDraftForm();
  const planDraft = collectDirectorPlanDraftForm();
  const planItemDraft = collectDirectorPlanItemDraftForm();
  const dispatchDraft = collectDirectorDispatchDraftForm();

  if (templateDraft) {
    state.ui.directorTemplateDraft = templateDraft;
  }

  if (planDraft) {
    state.ui.directorPlanDraft = planDraft;
  }

  if (planItemDraft) {
    state.ui.directorPlanItemDraft = planItemDraft;
  }

  if (dispatchDraft) {
    state.ui.directorDispatchDraft = dispatchDraft;
  }
}

function collectPrintableCss() {
  return Array.from(document.styleSheets)
    .map((sheet) => {
      try {
        return Array.from(sheet.cssRules || [])
          .map((rule) => rule.cssText)
          .join("\n");
      } catch {
        return "";
      }
    })
    .join("\n");
}

async function renderElementToCanvas(element) {
  if (window.html2canvas) {
    return window.html2canvas(element, {
      scale: 2,
      backgroundColor: "#ffffff",
      useCORS: true,
    });
  }

  const width = Math.ceil(element.scrollWidth || element.getBoundingClientRect().width || 794);
  const height = Math.ceil(element.scrollHeight || element.getBoundingClientRect().height || 1123);
  const scale = 2;
  const clone = element.cloneNode(true);
  clone.style.width = `${width}px`;
  clone.style.minHeight = `${height}px`;
  clone.style.margin = "0";

  const html = new XMLSerializer().serializeToString(clone);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width * scale}" height="${height * scale}" viewBox="0 0 ${width} ${height}">
      <foreignObject width="100%" height="100%">
        <div xmlns="http://www.w3.org/1999/xhtml">
          <style>${collectPrintableCss()}</style>
          ${html}
        </div>
      </foreignObject>
    </svg>
  `;

  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = height * scale;
  canvas._svgFallback = svg;
  canvas._svgWidth = width;
  canvas._svgHeight = height;
  canvas._svgScale = scale;

  return canvas;
}

function buildCareRecordFileName(record, extension) {
  const elderName = String(record?.elderName || "鑰佷汉").replace(/[\\/:*?"<>|]/g, "-");
  const room = String(record?.room || "鎴块棿").replace(/[\\/:*?"<>|]/g, "-");
  const recordDate = String(record?.recordDate || "鎶ょ悊璁板綍").replace(/[\\/:*?"<>|]/g, "-");
  return `${recordDate}_${room}_${elderName}_鐩戠褰掓。琛?${extension}`;
}

function buildDirectorExportFileName(record, extension) {
  const ext = String(extension || "png").replace(/^\./, "");
  const elderName = String(record?.elderName || "鑰佷汉").replace(/[\\/:*?"<>|]/g, "-");
  const room = String(record?.room || "鏃ユ姤").replace(/[\\/:*?"<>|]/g, "-");
  const recordDate = String(record?.recordDate || "鎶ょ悊璁板綍").replace(/[\\/:*?"<>|]/g, "-");
  return `${recordDate}_${room}_${elderName}_鐩戠褰掓。琛?${ext}`;
}

async function exportDirectorCareRecordImage(preview, record) {
  try {
    const canvas = await renderElementToCanvas(preview);

    if (canvas._svgFallback) {
      const svgFileName = buildDirectorExportFileName(record, "svg");
      const svgMarkup = canvas._svgFallback;
      const svgBlob = new Blob([svgMarkup], { type: "image/svg+xml;charset=utf-8" });
      const svgUrl = URL.createObjectURL(svgBlob);

      if (window.AndroidBridge && typeof window.AndroidBridge.saveBase64File === "function") {
        try {
          const reader = new FileReader();
          const base64Promise = new Promise((resolve) => {
            reader.onloadend = () => resolve(String(reader.result).split(",")[1] || "");
          });
          reader.readAsDataURL(svgBlob);
          const base64 = await base64Promise;
          window.AndroidBridge.saveBase64File(svgFileName, "image/svg+xml", base64);
          actions.announce("鍥剧墖宸蹭繚瀛樺埌涓嬭浇鐩綍");
          return;
        } catch (_) {}
      }

      const link = document.createElement("a");
      link.download = svgFileName;
      link.href = svgUrl;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(svgUrl), 60000);
      actions.announce("监管归档表图片已开始导出");
      return;
    }

    const fileName = buildDirectorExportFileName(record, "png");
    const imageDataUrl = canvas.toDataURL("image/png");

    if (window.AndroidBridge && typeof window.AndroidBridge.saveBase64File === "function") {
      try {
        window.AndroidBridge.saveBase64File(fileName, "image/png", imageDataUrl.split(",")[1] || "");
        actions.announce("鍥剧墖宸蹭繚瀛樺埌涓嬭浇鐩綍");
        return;
      } catch (_) {}
    }

    const link = document.createElement("a");
    link.download = fileName;
    link.href = imageDataUrl;
    document.body.appendChild(link);
    link.click();
    link.remove();
    actions.announce("监管归档表图片已开始导出");
  } catch (error) {
    console.error(error);
    actions.announce("鍥剧墖瀵煎嚭澶辫触锛岃绋嶅悗閲嶈瘯");
  }
}

function escapeCsvValue(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function exportDirectorInboxCsv() {
  const currentSelectors = selectors();
  const rows = currentSelectors.directorFilteredCloudReports || [];
  const headers = ["日期", "时间", "楼层", "房间", "老人", "护理员", "日常项", "服药项", "异常项", "同步状态"];
  const csvRows = rows.map((item) =>
    [
      item.recordDate,
      item.recordTime,
      item.floorLabel,
      item.room,
      item.elderName,
      item.caregiverLabel,
      item.summary?.dailyCount || 0,
      item.summary?.medicationCount || 0,
      item.summary?.issueCount || 0,
      item.syncMeta?.text || "",
    ]
      .map(escapeCsvValue)
      .join(","),
  );
  const csv = ["\ufeff" + headers.map(escapeCsvValue).join(","), ...csvRows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const date = currentSelectors.directorAuditFilters?.date || state.director.date || "浠婃棩";
  const link = document.createElement("a");
  link.href = url;
  link.download = `${date}_日报收件箱_筛选清单.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  actions.announce(rows.length ? "Excel清单已开始导出" : "当前筛选没有收件箱记录");
}

function runPendingDirectorCareRecordAction() {
  const pendingAction = state.ui.pendingCareRecordAction;
  if (!pendingAction) return;

  const preview = document.querySelector("[data-care-record-export-batch]") || document.querySelector("[data-care-record-sheet]");
  const record = state.ui.directorCareRecordBatchDate
    ? {
        recordDate: state.ui.directorCareRecordBatchDate,
        room: "鏃ユ姤",
        elderName: "褰撴棩鍏ㄩ儴鏃ユ姤",
      }
    : state.ui.directorCareRecordDraft;
  if (!preview || !record) return;

  state.ui.pendingCareRecordAction = "";

  window.requestAnimationFrame(() => {
    if (pendingAction === "print") {
      if (window.AndroidBridge && typeof window.AndroidBridge.printCurrentPage === "function") {
        try {
          window.AndroidBridge.printCurrentPage(buildDirectorExportFileName(record, "pdf").replace(/\.pdf$/i, ""));
          return;
        } catch (_) {}
      }
      window.print();
      return;
    }

    if (pendingAction === "image") {
      exportDirectorCareRecordImage(preview, record);
    }
  });
}

function collectTaskRecordDialogForm() {
  return {
    note: app.querySelector("[data-task-record-note]")?.value || "",
  };
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("file read failed"));
    reader.readAsDataURL(file);
  });
}

function loadImageFromFile(file) {
  if (window.createImageBitmap) {
    return window.createImageBitmap(file).then((bitmap) => ({
      width: bitmap.width,
      height: bitmap.height,
      drawTo(ctx, width, height) {
        ctx.drawImage(bitmap, 0, 0, width, height);
      },
      close() {
        bitmap.close?.();
      },
    }));
  }

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve({
        width: image.naturalWidth || image.width,
        height: image.naturalHeight || image.height,
        drawTo(ctx, width, height) {
          ctx.drawImage(image, 0, 0, width, height);
        },
        close() {},
      });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image load failed"));
    };
    image.src = url;
  });
}

async function compressTaskEvidenceImage(file) {
  if (!file?.type?.startsWith("image/")) {
    return readFileAsDataUrl(file);
  }

  const source = await loadImageFromFile(file);
  try {
    const scale = Math.min(1, TASK_EVIDENCE_MAX_EDGE / Math.max(source.width || 1, source.height || 1));
    const width = Math.max(1, Math.round((source.width || 1) * scale));
    const height = Math.max(1, Math.round((source.height || 1) * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("canvas unavailable");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, width, height);
    source.drawTo(ctx, width, height);
    return canvas.toDataURL("image/jpeg", TASK_EVIDENCE_JPEG_QUALITY);
  } finally {
    source.close();
  }
}

function captureTaskEvidence(target, file) {
  if (!file) {
    actions.setTaskEvidence(target, null);
    return;
  }

  const evidence = {
    name: file.name || "鎶ょ悊鐣欑棔鐓х墖",
    dataUrl: "",
    capturedAt: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }),
  };

  compressTaskEvidenceImage(file)
    .catch(() => readFileAsDataUrl(file))
    .then((dataUrl) => {
      requestScrollRestore(state.ui.route, getScrollSnapshot());
      actions.setTaskEvidence(target, { ...evidence, dataUrl });
    })
    .catch(() => {
      requestScrollRestore(state.ui.route, getScrollSnapshot());
      actions.setTaskEvidence(target, null);
    });
}

function renderApp() {
  if (isDirectorDatePickerProtected()) {
    deferRenderUntilDirectorDatePickerSettles();
    return;
  }

  if (
    isAppScrollProtected(900) &&
    !pendingScrollRestore &&
    !pendingAnchorRestore &&
    !lockedScrollRestore &&
    !state.ui.directorPlanDraft &&
    !state.ui.directorPlanItemDraft &&
    !state.ui.directorPlanNoteDraft &&
    !state.ui.directorPlanTemporaryDialogElderId
  ) {
    deferScrollProtectedRender();
    return;
  }

  rememberScrollPosition();

  const routeRenderer = routes[state.ui.route] || renderLoginPage;
  const view = routeRenderer({ state, selectors: selectors() });

  app.innerHTML = `
    <main class="workspace">
      <section class="app-shell" data-role="${state.session.identity || "guest"}">
        <section class="content-area scroll-hide">
          ${view}
        </section>
        ${renderBottomNav()}
      </section>
      ${renderTaskRecordDialog()}
      ${renderDirectorTaskDetail()}
      ${renderCaregiverRecordDetail()}
      ${renderToast()}
    </main>
  `;

  stabilizeDirectorPlanTimelineAfterRender();
  restoreScrollPosition(state.ui.route);
  restoreAnchorPosition();
  syncCaregiverTimelineFocus();
  syncBrowserHistory();
  runPendingDirectorCareRecordAction();
  syncDirectorCloudPolling();
  syncCaregiverTaskPolling();
  syncCaregiverRecordRoute();
  syncDirectorInventoryPolling();
  syncInstitutionSharedStatePolling();
  syncLiveClockTimer();
}

function stabilizeDirectorPlanTimelineAfterRender() {
  if (state.ui.route !== "director-care-plans") return;
  if (!state.ui.directorPlanTimelineOpen || state.ui.directorPlanTimelineSettled) return;

  // Keep the first drawer entrance animation on the current DOM, but make
  // subsequent task-detail renders use the settled class instead of replaying it.
  state.ui.directorPlanTimelineSettled = true;
}

async function handleLoginSubmit(event) {
  const form = event.target.closest(".login-form");
  if (!form) return;
  event.preventDefault();

  const username = form.querySelector('[name="username"]')?.value?.trim() || "";
  const password = form.querySelector('[name="password"]')?.value || "";
  if (!username || !password) {
    state.ui.loginError = "请输入用户名和密码";
    notify();
    return;
  }
  state.ui.loginError = "";
  notify();
  try {
    await actions.login("", username, password);
  } catch (err) {
    state.ui.loginError = err.message || "登录失败，请检查账号密码";
    notify();
  }
}

function handleClick(event) {
  const trigger = event.target.closest("[data-action]");
  if (!trigger) {
    const tag = event.target.tagName;
    if (tag !== "INPUT" && tag !== "TEXTAREA" && tag !== "SELECT" && tag !== "LABEL" && !event.target.closest("label")) {
      if (document.activeElement && (document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "TEXTAREA")) {
        document.activeElement.blur();
      }
    }
    return;
  }

  persistDirectorAssignmentDrafts();

  const action = trigger.dataset.action;
  const route = trigger.dataset.route;
  const value = trigger.dataset.value;
  const field = trigger.dataset.field;
  const caregiverId = trigger.dataset.caregiverId;
  const planId = trigger.dataset.planId;

  if (action === "preview-director-plan-room" || action === "select-director-plan-room") {
    event.preventDefault();
    trigger.blur?.();
  }

  if (action === "enter-caregiver") return actions.enterCaregiver();
  if (action === "dev-enter-caregiver") return actions.devEnterCaregiver();
  if (action === "enter-family") return actions.enterFamily();
  if (action === "enter-director") return actions.enterDirector();
  if (action === "toggle-login-menu") return actions.toggleLoginMenu();
  if (action === "close-login-menu") return actions.closeLoginMenu();
  if (action === "open-dev-login") return actions.openDevLogin();
  if (action === "close-dev-login") return actions.closeDevLogin();
  if (action === "dev-login-account") {
    const username = trigger.dataset.username || "";
    const password = trigger.dataset.password || "";
    state.ui.loginError = "";
    notify();
    actions.login("inst-001", username, password).catch((err) => {
      state.ui.loginError = err.message || "开发者登录失败";
      notify();
    });
    return;
  }
  if (action === "open-app-info") return actions.openAppInfoDialog(value);
  if (action === "close-app-info") return actions.closeAppInfoDialog();
  if (action === "check-app-update") return actions.checkAppUpdate();
  if (action === "download-app-update") return actions.downloadAppUpdate();
  if (action === "close-app-update-dialog") return actions.closeAppUpdateDialog();
  if (action === "login-submit") {
    const form = trigger.closest(".login-form");
    if (!form) return;
    const username = form.querySelector('[name="username"]')?.value?.trim() || "";
    const password = form.querySelector('[name="password"]')?.value || "";
    if (!username || !password) {
      state.ui.loginError = "请输入用户名和密码";
      notify();
      return;
    }
    state.ui.loginError = "";
    notify();
    actions.login("", username, password).catch((err) => {
      state.ui.loginError = err.message || "鐧诲綍澶辫触";
      notify();
    });
    return;
  }
  if (action === "login") return actions.login();
  if (action === "clock-in") return actions.clockIn();
  if (action === "enter-workbench") return actions.enterWorkbench();
  if (action === "logout") return actions.logout();
  if (action === "app-back") return goBackOrNavigate(route);
  if (action === "navigate") return actions.navigate(route);
  if (action === "refresh-caregiver-tasks") return actions.refreshCaregiverCloudTasks({ force: true });
  if (action === "choose-floor") return actions.chooseFloor(value);
  if (action === "choose-room") return actions.chooseRoom(value, trigger.dataset.room || "");
  if (action === "open-inventory-usage") return actions.openCaregiverInventoryUsage();
  if (action === "open-inventory-usage-elder") return actions.openCaregiverInventoryUsageForElder(value);
  if (action === "open-caregiver-record-tasks") return actions.openCaregiverElderRecordTasks(value, trigger.dataset.taskId || "");
  if (action === "close-caregiver-record-detail") return actions.closeCaregiverRecordDetail();
  if (action === "preview-caregiver-record-photo") return actions.openCaregiverRecordPhotoPreview(trigger.dataset.taskId || "", trigger.dataset.photoIndex || "0");
  if (action === "close-caregiver-record-photo-preview") return actions.closeCaregiverRecordPhotoPreview();
  if (action === "sync-auto-care-record") {
    requestScrollRestore(state.ui.route, getCurrentContentScrollTop());
    requestAnchorRestore("sync-auto-care-record", value);
    return actions.syncCaregiverAutoCareRecord(value, { deferNotify: true });
  }
  if (action === "close-inventory-usage") return actions.closeCaregiverInventoryUsage();
  if (action === "submit-inventory-usage") return actions.submitInventoryUsage(collectInventoryUsageForm());
  if (action === "open-daily-report") return actions.openCaregiverDailyReport(value);
  if (action === "open-batch-panel") return actions.openBatchPanel();
  if (action === "close-batch-panel") return actions.closeBatchPanel();
  if (action === "complete-batch") return actions.completeBatch(value);
  if (action === "open-batch-exception-review") return actions.openBatchExceptionReview();
  if (action === "open-caregiver-timeline-fullscreen") {
    requestScrollRestore(state.ui.route, getCurrentContentScrollTop());
    return actions.openCaregiverTimelineFullscreen();
  }
  if (action === "close-caregiver-timeline-fullscreen") {
    requestScrollRestore(state.ui.route, getCurrentContentScrollTop());
    return actions.closeCaregiverTimelineFullscreen();
  }
  if (action === "focus-task") {
    requestScrollRestore(state.ui.route, getCurrentContentScrollTop());
    return actions.focusTask(value);
  }
  if (action === "select-task") return actions.selectTask(value);
  if (action === "complete-task") {
    requestScrollRestore(state.ui.route, getCurrentContentScrollTop());
    return actions.completeTask(value);
  }
  if (action === "open-task-record") {
    requestScrollRestore(state.ui.route, getCurrentContentScrollTop());
    return actions.openTaskRecordDialog(value);
  }
  if (action === "open-task-exception" || action === "mark-risk") {
    requestScrollRestore(state.ui.route, getCurrentContentScrollTop());
    return actions.openTaskExceptionDialog(value);
  }
  if (action === "open-quick-exception") {
    requestScrollRestore(state.ui.route, getCurrentContentScrollTop());
    return actions.openQuickExceptionDialog(value);
  }
  if (action === "preview-task-evidence") {
    const taskNote = app.querySelector("[data-task-record-note]");
    if (taskNote) {
      actions.updateTaskRecordDialogNote(taskNote.value);
    }
    requestScrollRestore(state.ui.route, getCurrentContentScrollTop());
    return actions.openTaskEvidencePreview(
      {
        taskId: trigger.dataset.evidenceTask || "",
        elderId: trigger.dataset.evidenceElder || "",
        kind: trigger.dataset.evidenceKind || "record",
      },
      trigger.dataset.evidenceIndex || "0",
    );
  }
  if (action === "close-task-evidence-preview") {
    requestScrollRestore(state.ui.route, getCurrentContentScrollTop());
    return actions.closeTaskEvidencePreview();
  }
  if (action === "close-task-record-dialog") {
    requestScrollRestore(state.ui.route, getCurrentContentScrollTop());
    return actions.closeTaskRecordDialog();
  }
  if (action === "save-task-record-dialog") {
    requestScrollRestore(state.ui.route, getCurrentContentScrollTop());
    return actions.saveTaskRecordDialog(collectTaskRecordDialogForm());
  }
  if (action === "mark-refused") return actions.markTaskException(value, "refused");
  if (action === "toggle-message") return actions.toggleMessageRead(value);
  if (action === "toggle-family-message") return actions.toggleFamilyMessage(value);
  if (action === "set-history-time") return actions.setHistoryTimeFilter(value);
  if (action === "select-history") return actions.selectHistory(value);
  if (action === "select-director-floor") return actions.selectDirectorFloor(value);
  if (action === "select-director-stat-caregiver") return actions.selectDirectorStatisticsCaregiver(value);
  if (action === "open-director-caregiver") return actions.openDirectorCaregiver();
  if (action === "open-director-assignments") return actions.openDirectorAssignments();
  if (action === "open-director-care-records") return actions.openDirectorCareRecords(value);
  if (action === "toggle-personnel-card") {
    const card = trigger.closest(".director-people-row");
    if (!card) return;
    app.querySelectorAll(".director-people-row.is-menu-open").forEach((item) => {
      if (item !== card) item.classList.remove("is-menu-open");
    });
    card.classList.toggle("is-expanded");
    return;
  }
  if (action === "toggle-personnel-menu") {
    const card = trigger.closest(".director-people-row");
    if (!card) return;
    app.querySelectorAll(".director-people-row.is-menu-open").forEach((item) => {
      if (item !== card) item.classList.remove("is-menu-open");
    });
    const opening = !card.classList.contains("is-menu-open");
    card.classList.toggle("is-menu-open");
    if (opening) {
      const menu = card.querySelector(".director-people-menu");
      if (menu) {
        const btnRect = trigger.getBoundingClientRect();
        menu.style.position = "fixed";
        menu.style.right = (window.innerWidth - btnRect.right) + "px";
        const estMenuHeight = 140;
        if (btnRect.bottom + estMenuHeight > window.innerHeight) {
          menu.style.top = "auto";
          menu.style.bottom = (window.innerHeight - btnRect.top + 4) + "px";
        } else {
          menu.style.top = (btnRect.bottom + 4) + "px";
          menu.style.bottom = "auto";
        }
      }
    }
    return;
  }
  if (action === "toggle-elder-template-menu") {
    const menu = trigger.closest(".director-people-menu");
    if (menu) {
      menu.querySelectorAll(".director-people-menu.is-template-open").forEach((item) => {
        if (item !== menu) item.classList.remove("is-template-open");
      });
      menu.classList.toggle("is-template-open");
    }
    return;
  }
  if (action === "set-elder-report-template") {
    const templateId = trigger.dataset.template;
    requestScrollRestore(state.ui.route, getCurrentContentScrollTop());
    return actions.setElderReportTemplate(value, templateId);
  }
  if (action === "set-director-personnel-type") {
    requestScrollRestore(state.ui.route, getCurrentContentScrollTop());
    return actions.setDirectorPersonnelType(value);
  }
  if (action === "set-director-personnel-floor") {
    requestScrollRestore(state.ui.route, getCurrentContentScrollTop());
    return actions.setDirectorPersonnelFloor(value);
  }
  if (action === "set-director-attendance-shift") {
    requestScrollRestore(state.ui.route, getCurrentContentScrollTop());
    return actions.setDirectorAttendanceShift(value);
  }
  if (action === "toggle-attendance-shift-settings") {
    requestScrollRestore(state.ui.route, getCurrentContentScrollTop());
    return actions.toggleAttendanceShiftSettings();
  }
  if (action === "open-personnel-draft") {
    requestScrollRestore(state.ui.route, getCurrentContentScrollTop());
    return actions.openDirectorPersonnelDraft(value);
  }
  if (action === "open-personnel-edit") {
    const [type, id] = String(value || "").split(":");
    requestScrollRestore(state.ui.route, getCurrentContentScrollTop());
    return actions.openDirectorPersonnelEdit(type, id);
  }
  if (action === "close-personnel-draft") {
    requestScrollRestore(state.ui.route, getCurrentContentScrollTop());
    return actions.closeDirectorPersonnelDraft();
  }
  if (action === "save-personnel-draft") {
    const personnelType = state.ui.directorPersonnelDraft?.type || "caregiver";
    requestScrollRestore(state.ui.route, getCurrentContentScrollTop());
    return actions.saveDirectorPersonnelDraft(collectDirectorPersonnelForm(personnelType));
  }
  if (action === "add-caregiver") return actions.addCaregiver(collectDirectorPersonnelForm("caregiver"));
  if (action === "remove-caregiver") {
    requestScrollRestore(state.ui.route, getCurrentContentScrollTop());
    return actions.removeCaregiver(value);
  }
  if (action === "add-elder") return actions.addElder(collectDirectorPersonnelForm("elder"));
  if (action === "remove-elder") {
    requestScrollRestore(state.ui.route, getCurrentContentScrollTop());
    return actions.removeElder(value);
  }
  if (action === "open-personnel-elder-detail") {
    requestScrollRestore(state.ui.route, getCurrentContentScrollTop());
    return actions.openDirectorPersonnelPlanDetail(value);
  }
  if (action === "close-personnel-elder-detail") {
    requestScrollRestore(state.ui.route, getCurrentContentScrollTop());
    return actions.closeDirectorPersonnelPlanDetail();
  }
  if (action === "refresh-cloud-care-records") return actions.refreshDirectorCloudReports();
  if (action === "refresh-cloud-inventory") {
    lockScrollRestore(state.ui.route, getScrollSnapshot(), 2200);
    return actions.refreshCloudInventory().finally(releaseScrollRestoreLock);
  }
  if (action === "open-inventory-date-picker") {
    const input = trigger.closest(".inventory-date-filter")?.querySelector("[data-inventory-date-picker]");
    if (input?.showPicker) input.showPicker();
    else input?.focus();
    return;
  }
  if (action === "open-inventory-item-draft") return actions.openInventoryItemDraft(value);
  if (action === "close-inventory-item-draft") return actions.closeInventoryItemDraft();
  if (action === "open-inventory-item-actions") return actions.openInventoryItemActions(value);
  if (action === "close-inventory-item-actions") return actions.closeInventoryItemActions();
  if (action === "open-inventory-stock-adjust") return actions.openInventoryStockAdjust(value);
  if (action === "close-inventory-stock-adjust") return actions.closeInventoryStockAdjust();
  if (action === "set-inventory-stock-adjust-mode") return actions.setInventoryStockAdjustMode(value);
  if (action === "save-inventory-stock-adjust") return actions.saveInventoryStockAdjust(collectInventoryStockAdjustForm());
  if (action === "delete-inventory-item") {
    if (!window.confirm("确认删除这个物资？删除后院长端和员工端都不会再显示。")) return;
    return actions.deleteInventoryItem(value);
  }
  if (action === "save-inventory-item") return actions.saveInventoryItem(collectInventoryItemForm());
  if (action === "load-cloud-care-record") return actions.loadDirectorCareRecordFromCloud(value);
  if (action === "set-director-inbox-month") {
    requestScrollRestore(state.ui.route, getCurrentContentScrollTop());
    return actions.setDirectorInboxMonth(value);
  }
  if (action === "open-director-inbox-day") {
    requestScrollRestore(state.ui.route, getCurrentContentScrollTop());
    return actions.openDirectorInboxDay(value);
  }
  if (action === "close-director-inbox-day") {
    requestScrollRestore(state.ui.route, getCurrentContentScrollTop());
    return actions.closeDirectorInboxDay();
  }
  if (action === "open-director-inbox-export") {
    requestScrollRestore(state.ui.route, getCurrentContentScrollTop());
    return actions.openDirectorInboxExport(value);
  }
  if (action === "close-director-inbox-export") {
    requestScrollRestore(state.ui.route, getCurrentContentScrollTop());
    return actions.closeDirectorInboxExport();
  }
  if (action === "export-director-inbox-day") {
    requestScrollRestore(state.ui.route, getCurrentContentScrollTop());
    return actions.requestDirectorInboxDayExport(value, field);
  }
  if (action === "open-report-template-editor") {
    requestScrollRestore(state.ui.route, getCurrentContentScrollTop());
    return actions.openDailyReportTemplateEditor();
  }
  if (action === "new-report-template-instance") {
    requestScrollRestore(state.ui.route, getCurrentContentScrollTop());
    return actions.createNewDailyReportTemplateInstanceFromCurrent(collectDailyReportTemplateDraft());
  }
  if (action === "open-report-template-import") {
    requestScrollRestore(state.ui.route, getCurrentContentScrollTop());
    return actions.openDailyReportTemplateImport(collectDailyReportTemplateDraft());
  }
  if (action === "open-report-template-schedule") {
    requestScrollRestore(state.ui.route, getCurrentContentScrollTop());
    return actions.openDailyReportTemplateSchedule(collectDailyReportTemplateDraft(), value);
  }
  if (action === "close-report-template-schedule") {
    requestScrollRestore(state.ui.route, getCurrentContentScrollTop());
    return actions.closeDailyReportTemplateSchedule();
  }
  if (action === "set-report-template-schedule-duration") {
    event.preventDefault();
    event.stopPropagation();
    const card = trigger.closest("[data-report-template-schedule-card]");
    const customDuration =
      value === "custom" ? window.prompt("请输入持续时间（分钟）", card?.dataset.duration || "60") : value;
    if (value === "custom" && customDuration === null) return;
    const duration = Math.min(
      REPORT_TEMPLATE_SCHEDULE_END_MINUTES - REPORT_TEMPLATE_SCHEDULE_START_MINUTES,
      Math.max(REPORT_TEMPLATE_SCHEDULE_MIN_DURATION, Number(customDuration || 60)),
    );
    if (!Number.isFinite(duration)) {
      actions.announce("持续时间格式不正确");
      return;
    }
    const start = Number(card?.dataset.minutes || 0);
    const timeWindow = buildReportTemplateScheduleWindow(start, duration);
    if (card) {
      card.dataset.duration = String(duration);
      updateReportTemplateScheduleCard(card, (start - REPORT_TEMPLATE_SCHEDULE_START_MINUTES) * REPORT_TEMPLATE_SCHEDULE_PX_PER_MINUTE);
      card.querySelector("[data-report-template-schedule-menu]")?.removeAttribute("open");
    }
    requestScrollRestore(state.ui.route, getCurrentContentScrollTop());
    return actions.setDailyReportTemplateItemTime(trigger.dataset.sectionId, trigger.dataset.itemId, timeWindow);
  }
  if (action === "toggle-report-template-item-photo") {
    event.preventDefault();
    event.stopPropagation();
    requestScrollRestore(state.ui.route, getCurrentContentScrollTop());
    return actions.toggleDailyReportTemplateItemPhoto(
      collectDailyReportTemplateDraft(),
      trigger.dataset.sectionId || "",
      trigger.dataset.itemId || "",
    );
  }
  if (action === "save-report-template-schedule") {
    event.preventDefault();
    event.stopPropagation();
    requestScrollRestore(state.ui.route, getCurrentContentScrollTop());
    return actions.closeDailyReportTemplateSchedule();
  }
  if (action === "add-report-template-item-from-schedule") {
    const label = window.prompt("璇疯緭鍏ュ瓙鏍囬鍚嶇О", "");
    if (label === null) return;
    requestScrollRestore(state.ui.route, getCurrentContentScrollTop());
    return actions.addDailyReportTemplateItem(collectDailyReportTemplateDraft(), value, {
      label,
      frequencyDays: 1,
      timeWindow: buildReportTemplateScheduleWindow(6 * 60, 60),
      requirePhoto: false,
    });
  }
  if (action === "close-report-template-import") {
    requestScrollRestore(state.ui.route, getCurrentContentScrollTop());
    return actions.closeDailyReportTemplateImport();
  }
  if (action === "refresh-report-template-import") {
    requestScrollRestore(state.ui.route, getCurrentContentScrollTop());
    return actions.refreshDailyReportTemplateImportCatalog();
  }
  if (action === "select-report-template-import-template") {
    return actions.selectDailyReportTemplateImportTemplate(value);
  }
  if (action === "apply-report-template-import") {
    if (!window.confirm("瀵煎叆鍚庝細瑕嗙洊褰撳墠缂栬緫鍐呭锛岀‘璁ゅ鍏ワ紵")) return;
    requestScrollRestore(state.ui.route, getCurrentContentScrollTop());
    return actions.applyDailyReportTemplateImport(value);
  }
  if (action === "add-report-template-section") {
    const form = document.querySelector("[data-daily-report-template-form]");
    const sectionTitle = form?.elements.newSectionTitle?.value?.trim() || "";
    requestScrollRestore(state.ui.route, getCurrentContentScrollTop());
    return actions.addDailyReportTemplateSection(collectDailyReportTemplateDraft(), sectionTitle);
  }
  if (action === "add-report-template-item") {
    const section = trigger.closest("[data-report-template-section]");
    const sectionId = section?.dataset.reportTemplateSection || "";
    const label = section?.querySelector("[data-report-template-new-item-label]")?.value?.trim() || "";
    const frequencyDays = Math.max(1, Number(section?.querySelector("[data-report-template-new-item-frequency]")?.value || 1));
    requestScrollRestore(state.ui.route, getCurrentContentScrollTop());
    return actions.addDailyReportTemplateItem(collectDailyReportTemplateDraft(), sectionId, { label, frequencyDays });
  }
  if (action === "delete-report-template-item") {
    event.preventDefault();
    event.stopPropagation();
    if (!window.confirm("纭鍒犻櫎杩欎釜瀛愭爣棰橈紵")) return;
    const row = trigger.closest("[data-report-template-item-row]");
    const section = trigger.closest("[data-report-template-section]");
    requestScrollRestore(state.ui.route, getCurrentContentScrollTop());
    return actions.deleteDailyReportTemplateItem(
      collectDailyReportTemplateDraft(),
      section?.dataset.reportTemplateSection || "",
      row?.dataset.reportTemplateItemRow || "",
    );
  }
  if (action === "delete-report-template-item-by-id") {
    event.preventDefault();
    event.stopPropagation();
    if (!window.confirm("纭鍒犻櫎杩欎釜瀛愭爣棰橈紵")) return;
    requestScrollRestore(state.ui.route, getCurrentContentScrollTop());
    return actions.deleteDailyReportTemplateItem(
      collectDailyReportTemplateDraft(),
      trigger.dataset.sectionId || "",
      trigger.dataset.itemId || "",
    );
  }
  if (action === "delete-report-template-section") {
    event.preventDefault();
    event.stopPropagation();
    if (!window.confirm("确认删除这个父标题？父标题下的子标题也会一起删除。")) return;
    trigger.closest("[data-report-template-section]")?.remove();
    requestScrollRestore(state.ui.route, getCurrentContentScrollTop());
    return actions.updateDailyReportTemplateDraft(collectDailyReportTemplateDraft());
  }
  if (action === "open-report-template-preview") {
    requestScrollRestore(state.ui.route, getCurrentContentScrollTop());
    return actions.openDailyReportTemplatePreview(collectDailyReportTemplateDraft());
  }
  if (action === "close-report-template-preview") {
    requestScrollRestore(state.ui.route, getCurrentContentScrollTop());
    return actions.closeDailyReportTemplatePreview();
  }
  if (action === "zoom-report-template-preview") {
    return actions.zoomDailyReportTemplatePreview(value);
  }
  if (action === "close-report-template-editor") {
    requestScrollRestore(state.ui.route, getCurrentContentScrollTop());
    return actions.closeDailyReportTemplateEditor();
  }
  if (action === "save-report-template-editor") {
    requestScrollRestore(state.ui.route, getCurrentContentScrollTop());
    return actions.saveDailyReportTemplateDraft(collectDailyReportTemplateDraft());
  }
  if (action === "edit-saved-report-template") {
    requestScrollRestore(state.ui.route, getCurrentContentScrollTop());
    const tpl = (state.dailyReportTemplates || {})[value];
    if (tpl) return actions.openDailyReportTemplateEditor(tpl, { editExisting: true });
    return;
  }
  if (action === "director-view-task-detail") {
    var _dtid = trigger.dataset.value || value;
    lockScrollRestore(state.ui.route, getDirectorTimelineScrollSnapshot(), 1800);
    actions.loadTaskEvidence(_dtid).then(function () {
      state.ui.directorTaskDetailId = _dtid;
      notify();
    }).finally(releaseScrollRestoreLock);
    return;
  }
  if (action === "close-director-task-detail") {
    lockScrollRestore(state.ui.route, getDirectorTimelineScrollSnapshot(), 1200);
    state.ui.directorTaskDetailId = "";
    notify();
    releaseScrollRestoreLock();
    return;
  }
  if (action === "set-director-template-filter") return actions.setDirectorTemplateFilter(value);
  if (action === "set-director-assignment-filter") return actions.setDirectorAssignmentFilter(value);
  if (action === "set-director-dispatch-filter") return actions.setDirectorDispatchFilter(value);
  if (action === "open-director-temporary-task") {
    requestScrollRestore(state.ui.route, getCurrentContentScrollTop());
    return actions.openDirectorTemporaryTaskDraft();
  }
  if (action === "toggle-director-temporary-elder-search") {
    requestScrollRestore(state.ui.route, getCurrentContentScrollTop());
    actions.updateDirectorTemporaryTaskDraft(collectDirectorDispatchDraftForm());
    return actions.toggleDirectorTemporaryTaskSearch();
  }
  if (action === "select-director-temporary-elder") {
    requestScrollRestore(state.ui.route, getCurrentContentScrollTop());
    actions.updateDirectorTemporaryTaskDraft(collectDirectorDispatchDraftForm());
    return actions.selectDirectorTemporaryTaskElder(value);
  }
  if (action === "open-director-dispatch-draft") {
    requestScrollRestore(state.ui.route, getCurrentContentScrollTop());
    return actions.openDirectorDispatchDraft(value);
  }
  if (action === "close-director-dispatch-draft") {
    requestScrollRestore(state.ui.route, getCurrentContentScrollTop());
    return actions.closeDirectorDispatchDraft();
  }
  if (action === "save-director-dispatch-draft") {
    requestScrollRestore(state.ui.route, getCurrentContentScrollTop());
    return actions.saveDirectorDispatchDraft(collectDirectorDispatchDraftForm());
  }
  if (action === "set-director-audit-filter") return actions.setDirectorAuditFilter(field, value);
  if (action === "select-director-elder") return actions.selectDirectorElder(value);
  if (action === "generate-care-record-preview") return actions.openDirectorCareRecordPreview(collectCareRecordForm());
  if (action === "close-care-record-preview") return actions.closeDirectorCareRecordPreview();
  if (action === "print-care-record" && state.ui.directorCareRecordBatchDate) {
    return actions.requestDirectorInboxDayExport(state.ui.directorCareRecordBatchDate, "print");
  }
  if (action === "export-care-record-image" && state.ui.directorCareRecordBatchDate) {
    return actions.requestDirectorInboxDayExport(state.ui.directorCareRecordBatchDate, "image");
  }
  if (action === "print-care-record") return actions.requestDirectorCareRecordPrint(collectCareRecordForm());
  if (action === "export-care-record-image") return actions.requestDirectorCareRecordImage(collectCareRecordForm());
  if (action === "export-director-inbox-excel") return exportDirectorInboxCsv();
  if (action === "save-daily-report") return actions.saveCaregiverDailyReport(collectCareRecordForm());
  if (action === "submit-daily-report") return actions.submitCaregiverDailyReport(collectCareRecordForm());
  if (action === "select-director-plan-floor") {
    requestScrollRestore(state.ui.route, getCurrentContentScrollTop());
    return actions.selectDirectorPlanFloor(value);
  }
  if (action === "preview-director-plan-room") {
    const scrollSnapshot = getCurrentContentScrollTop();
    actions.previewDirectorPlanRoom(value, { silent: true });
    renderDirectorPlanPreviewInPlace(scrollSnapshot);
    return;
  }
  if (action === "select-director-plan-room") {
    if (!state.ui.directorPlanTimelineOpen) {
      directorPlanReturnScrollSnapshot = getScrollSnapshot();
    }
    lockScrollRestore(state.ui.route, getDirectorTimelineScrollSnapshot(), 1400);
    return actions.selectDirectorPlanRoom(value);
  }
  if (action === "close-director-plan-timeline") {
    requestScrollRestore(state.ui.route, directorPlanReturnScrollSnapshot || getScrollSnapshot());
    directorPlanReturnScrollSnapshot = null;
    return actions.closeDirectorPlanTimeline();
  }
  if (action === "reassign-elder-caregiver") {
    const elderId = trigger.dataset.elderId;
    const floor = Number(trigger.dataset.floor || 1);
    if (elderId) actions.reassignElderCaregiver(elderId, floor);
    return;
  }
  if (action === "open-director-plan-note-draft") return actions.openDirectorPlanNoteDraft(value);
  if (action === "close-director-plan-note-draft") return actions.closeDirectorPlanNoteDraft();
  if (action === "save-director-plan-note-draft") {
    const noteInput = app.querySelector("[data-director-plan-note-input]");
    return actions.saveDirectorPlanNoteDraft(noteInput?.value || "");
  }
  if (action === "open-director-plan-temporary-dialog") return actions.openDirectorPlanTemporaryDialog(value);
  if (action === "close-director-plan-temporary-dialog") return actions.closeDirectorPlanTemporaryDialog();
  if (action === "assign-task") return actions.assignTask(value, caregiverId);
  if (action === "clear-task-assignment") return actions.clearTaskAssignment(value);
  if (["create-template", "open-template-draft"].includes(action)) {
    requestScrollRestore(state.ui.route, getCurrentContentScrollTop());
  }
  if (action === "open-plan-draft") {
    requestScrollRestore(state.ui.route, 0);
  }
  if (action === "close-template-draft" || action === "save-template-draft") {
    requestScrollRestore(state.ui.route, getCurrentContentScrollTop());
  }
  if (action === "create-template") return actions.createTemplate(value);
  if (action === "open-template-draft") return actions.openTemplateDraft(value);
  if (action === "close-template-draft") return actions.closeTemplateDraft();
  if (action === "save-template-draft") return actions.saveTemplateDraft();
  if (action === "open-plan-draft") return actions.openPlanDraft();
  if (action === "close-plan-draft") return actions.closePlanDraft();
  if (action === "open-plan-item-draft") return actions.openPlanItemDraft(value);
  if (action === "close-plan-item-draft") return actions.closePlanItemDraft();
  if (action === "save-plan-item-draft") return actions.savePlanItemDraft();
  if (action === "add-plan-draft-item") return actions.addPlanDraftItem();
  if (action === "remove-plan-draft-item") return actions.removePlanDraftItem(value);
  if (action === "toggle-plan-draft-item-enabled") return actions.togglePlanDraftItemEnabled(value);
  if (action === "save-plan-draft") return actions.savePlanDraft();
  if (action === "toggle-template-active") return actions.toggleTemplateActive(value);
  if (action === "toggle-plan-item") return actions.togglePlanItem(planId, value);
}

function handleInput(event) {
  if (event.target.matches("[data-task-record-note]")) {
    actions.updateTaskRecordDialogNote(event.target.value);
    return;
  }

  if (event.target.closest("[data-daily-report-template-form]")) {
    persistDailyReportTemplateEditorState();
    return;
  }

  if (event.target.matches("[data-history-search]")) {
    actions.setHistorySearch(event.target.value);
    return;
  }

  if (event.target.matches("[data-director-template-search]")) {
    actions.setDirectorTemplateSearch(event.target.value);
    return;
  }

  if (event.target.matches("[data-director-temporary-elder-search]")) {
    actions.updateDirectorTemporaryTaskDraft(collectDirectorDispatchDraftForm(), { silent: true });
    renderDirectorTemporarySearchResultsInPlace();
    return;
  }

  if (event.target.matches("[data-director-plan-note-input]")) {
    actions.updateDirectorPlanNoteDraft(event.target.value);
    return;
  }

  if (event.target.matches("[data-director-resident-search]")) {
    actions.setDirectorResidentSearch(event.target.value);
    return;
  }

  if (event.target.matches("[data-inventory-usage-filter]")) {
    requestScrollRestore(state.ui.route, getScrollSnapshot());
    actions.setInventoryUsageFilter({ [event.target.dataset.inventoryUsageFilter]: event.target.value });
    return;
  }

  if (event.target.matches("[data-inventory-stock-adjust-form] input[name='amount']")) {
    const form = event.target.closest("[data-inventory-stock-adjust-form]");
    const mode = form?.elements.mode?.value || "increase";
    const amount = Math.max(0, Number(event.target.value || 0));
    const current = Number(state.ui.inventoryStockAdjustDraft?.currentQuantity || 0);
    const unit = state.ui.inventoryStockAdjustDraft?.unit || "件";
    const nextQuantity = Math.max(0, current + (mode === "decrease" ? -amount : amount));
    const preview = form?.querySelector("[data-inventory-adjust-preview]");
    if (preview) preview.textContent = `${nextQuantity}${unit}`;
    return;
  }

}

function handleChange(event) {
  if (event.target.matches("[data-history-status]")) {
    actions.setHistoryStatusFilter(event.target.value);
    return;
  }

  if (event.target.matches("[data-care-record-date]")) {
    actions.setCareRecordDate(event.target.value);
    return;
  }

  if (event.target.matches("[data-evidence-task]")) {
    requestScrollRestore(state.ui.route, getScrollSnapshot());
    const taskNote = app.querySelector("[data-task-record-note]");
    if (taskNote) {
      actions.updateTaskRecordDialogNote(taskNote.value);
    }
    const file = event.target.files && event.target.files[0];
    captureTaskEvidence(
      {
        taskId: event.target.dataset.evidenceTask || "",
        elderId: event.target.dataset.evidenceElder || "",
        kind: event.target.dataset.evidenceKind || "record",
      },
      file,
    );
    return;
  }

  if (event.target.matches("[data-care-record-elder]")) {
    actions.selectDirectorCareRecordElder(event.target.value);
    return;
  }

  if (event.target.matches("[data-director-audit-date]")) {
    clearDirectorDatePickerAutoRefresh();
    actions.setDirectorAuditDate(event.target.value);
    return;
  }

  if (event.target.matches("[data-director-anomaly-date]")) {
    clearDirectorDatePickerAutoRefresh();
    actions.setDirectorAnomalyDate(event.target.value);
    return;
  }

  if (
    event.target.matches("[data-director-temporary-floor]") ||
    event.target.matches("[data-director-temporary-room]") ||
    event.target.matches("[data-director-temporary-elder]") ||
    event.target.matches("[data-director-temporary-time-mode]")
  ) {
    requestScrollRestore(state.ui.route, getCurrentContentScrollTop());
    actions.updateDirectorTemporaryTaskDraft(collectDirectorDispatchDraftForm());
    return;
  }

  if (event.target.matches("[data-attendance-shift-time]")) {
    actions.updateAttendanceShiftTemplate(event.target.dataset.shiftId || "", {
      [event.target.dataset.field || "start"]: event.target.value,
    });
    return;
  }

  if (event.target.matches("[data-report-template-import-institution]")) {
    actions.setDailyReportTemplateImportInstitution(event.target.value);
  }
}

document.addEventListener("click", handleClick);
document.addEventListener("submit", handleLoginSubmit);
document.addEventListener("input", handleInput);
document.addEventListener("change", handleChange);
document.addEventListener("focusin", (event) => {
  if (event.target.matches("[data-task-record-note]")) {
    stabilizeTaskRecordNoteFocus(event.target);
  }
  if (event.target.matches("[data-director-audit-date]")) {
    holdDirectorDatePickerAutoRefresh();
  }
  if (event.target.matches("[data-director-anomaly-date]")) {
    holdDirectorDatePickerAutoRefresh();
  }
});
document.addEventListener("pointerdown", (event) => {
  if (event.target.closest("[data-director-audit-date], .director-floor-calendar-button")) {
    holdDirectorDatePickerAutoRefresh();
  }
  if (event.target.closest("[data-director-anomaly-date]")) {
    holdDirectorDatePickerAutoRefresh();
  }
});
document.addEventListener("focusout", (event) => {
  if (event.target.matches("[data-director-audit-date]")) {
    releaseDirectorDatePickerAutoRefresh();
  }
  if (event.target.matches("[data-director-anomaly-date]")) {
    releaseDirectorDatePickerAutoRefresh();
  }
});
document.addEventListener("contextmenu", (event) => {
  const preview = event.target.closest("[data-evidence-preview-task]");
  if (!preview) return;

  event.preventDefault();
  const target = {
    taskId: preview.dataset.evidencePreviewTask || "",
    elderId: preview.dataset.evidencePreviewElder || "",
    kind: preview.dataset.evidencePreviewKind || "record",
    index: preview.dataset.evidencePreviewIndex || "0",
  };
  if (window.confirm("删除这张照片？")) {
    requestScrollRestore(state.ui.route, getCurrentContentScrollTop());
    actions.deleteTaskEvidence(target);
  }
});
document.addEventListener("pointerdown", handleReportTemplateSchedulePointerDown);
document.addEventListener("pointermove", handleReportTemplateSchedulePointerMove);
document.addEventListener("pointerup", handleReportTemplateSchedulePointerUp);
document.addEventListener("pointercancel", handleReportTemplateSchedulePointerUp);
document.addEventListener("dragstart", (event) => {
  const tag = event.target.closest("[draggable]");
  if (!tag) return;
  const elderId = tag.dataset.elderId;
  const floor = tag.dataset.floor;
  if (elderId && floor) {
    directorElderAssignmentDrag = { elderId, floor };
    event.dataTransfer?.setData?.("text/plain", JSON.stringify({ elderId, floor }));
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
    tag.style.opacity = "0.5";
    const onEnd = () => {
      tag.style.opacity = "";
      window.setTimeout(() => { directorElderAssignmentDrag = null; }, 0);
    };
    tag.addEventListener("dragend", onEnd, { once: true });
  }
});
document.addEventListener("dragover", (event) => {
  const dropZone = event.target.closest("[data-drop-caregiver-id]");
  if (!dropZone) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  dropZone.classList.add("is-drag-over");
});
document.addEventListener("dragleave", (event) => {
  const dropZone = event.target.closest("[data-drop-caregiver-id]");
  if (!dropZone) return;
  if (!dropZone.contains(event.relatedTarget)) {
    dropZone.classList.remove("is-drag-over");
  }
});
document.addEventListener("drop", (event) => {
  const dropZone = event.target.closest("[data-drop-caregiver-id]");
  if (!dropZone) return;
  event.preventDefault();
  dropZone.classList.remove("is-drag-over");
  try {
    const raw = event.dataTransfer?.getData?.("text/plain") || "";
    const parsed = raw ? JSON.parse(raw) : directorElderAssignmentDrag || {};
    const { elderId } = parsed;
    const caregiverId = dropZone.dataset.dropCaregiverId;
    if (elderId && caregiverId) {
      actions.reassignElderToCaregiver(elderId, caregiverId);
    } else {
      actions.announce("拖拽分配未识别，请重新拖动老人标签");
    }
  } catch (_) {
    actions.announce("拖拽分配失败，请重新拖动老人标签");
  } finally {
    directorElderAssignmentDrag = null;
  }
});
window.addEventListener("popstate", (event) => {
  const snapshot = event.state?.appNav;
  if (!snapshot) return;

  isRestoringBrowserHistory = true;
  lastHistorySignature = JSON.stringify(snapshot);
  actions.restoreNavigationSnapshot(snapshot);
  isRestoringBrowserHistory = false;
});

syncVisualViewportMetrics();
window.addEventListener("resize", syncVisualViewportMetrics);
window.addEventListener("orientationchange", () => window.setTimeout(syncVisualViewportMetrics, 120));
window.visualViewport?.addEventListener("resize", () => {
  syncVisualViewportMetrics();
  stabilizeTaskRecordNoteFocus();
});
window.visualViewport?.addEventListener("scroll", () => {
  syncVisualViewportMetrics();
  stabilizeTaskRecordNoteFocus();
});

window.__elderServeAndroidBack = navigateBackByPageLayer;
window.__onElderServeUpdate = (rawPayload) => {
  try {
    const payload = typeof rawPayload === "string" ? JSON.parse(rawPayload) : rawPayload;
    actions.handleAppUpdateStatus(payload || {});
  } catch (error) {
    actions.handleAppUpdateStatus({ type: "error", message: "更新状态解析失败" });
  }
};

function registerServiceWorker() {
  const isAndroidAppAssets = window.location.hostname === "appassets.androidplatform.net";
  const isSecureLocalHost = ["localhost", "127.0.0.1"].includes(window.location.hostname);

  if (isAndroidAppAssets || !("serviceWorker" in navigator) || !(window.location.protocol === "https:" || isSecureLocalHost)) {
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch((error) => {
      console.warn("Service worker registration failed:", error);
    });
  });
}

function syncDirectorCloudPolling() {
  const isReportTemplateWorkspaceOpen = Boolean(
    state.ui.directorReportTemplateDraft ||
      state.ui.directorReportTemplateScheduleSectionId ||
      state.ui.directorReportTemplateImportOpen ||
      state.ui.directorReportTemplatePreviewOpen,
  );
  const shouldPoll =
    (state.session.identity === "director" || state.session.identity === "admin" || state.session.identity === "superadmin") &&
    state.ui.route.startsWith("director-") &&
    !isReportTemplateWorkspaceOpen;

  if (!shouldPoll) {
    window.clearInterval(directorCloudPollTimer);
    window.clearInterval(directorCareReportsPollTimer);
    directorCloudPollTimer = 0;
    directorCareReportsPollTimer = 0;
    return;
  }

  if (!state._holdNotify && !state._loadingDirectorData) {
    if (!isEditingTextInput() && !isDirectorDatePickerProtected() && !isInventoryModalInputActive() && !isDirectorScrollProtected()) {
      actions.refreshDirectorCloudTasks({ silent: true });
    }
    if (state.ui.route === "director-care-records") {
      actions.refreshDirectorCloudReports({ silent: true });
    }
  }

  if (!directorCloudPollTimer) {
    directorCloudPollTimer = window.setInterval(() => {
      if (isEditingTextInput() || isDirectorDatePickerProtected()) return;
      if (isInventoryModalInputActive()) return;
      if (isDirectorScrollProtected()) return;
      actions.refreshDirectorCloudTasks({ silent: true });
    }, DIRECTOR_TASK_POLL_INTERVAL_MS);
  }

  if (!directorCareReportsPollTimer) {
    directorCareReportsPollTimer = window.setInterval(() => {
      actions.refreshDirectorCloudReports({ silent: true });
    }, DIRECTOR_CARE_REPORT_POLL_INTERVAL_MS);
  }
}

function syncCaregiverTaskPolling() {
  const shouldPoll =
    state.session.identity === "caregiver" &&
    state.session.loggedIn &&
    !["login", "attendance"].includes(state.ui.route);

  if (!shouldPoll) {
    window.clearInterval(caregiverTaskPollTimer);
    caregiverTaskPollTimer = 0;
    return;
  }

  if (caregiverTaskPollTimer) return;

  if (!isEditingTextInput() && !isCaregiverScrollProtected()) {
    actions.refreshCaregiverCloudTasks({ silent: true, ensureInstitutionState: true });
  }
  caregiverTaskPollTimer = window.setInterval(() => {
    if (isEditingTextInput() || isCaregiverScrollProtected()) return;
    actions.refreshCaregiverCloudTasks({ silent: true });
  }, 10000);
}

function syncCaregiverRecordRoute() {
  const shouldSync =
    state.session.identity === "caregiver" &&
    state.session.loggedIn &&
    state.ui.route === "history" &&
    !isEditingTextInput() &&
    !isCaregiverScrollProtected();

  if (!shouldSync) {
    caregiverRecordSyncSignature = "";
    return;
  }

  const recordDate = state.ui.historyFilter?.time && /^\d{4}-\d{2}-\d{2}$/.test(state.ui.historyFilter.time)
    ? state.ui.historyFilter.time
    : selectors().caregiverTaskRecordDate;
  const signature = [
    state.session.user?.institutionId || state.caregiver?.institutionId || state.institution?.id || "",
    state.caregiver?.id || "",
    recordDate || "",
  ].join("|");

  if (signature && signature !== caregiverRecordSyncSignature) {
    caregiverRecordSyncSignature = signature;
    actions.refreshCaregiverTaskRecords({ silent: true, recordDate });
  }
}

function syncDirectorInventoryPolling() {
  const shouldPoll =
    state.session.loggedIn &&
    (state.session.identity === "director" || state.session.identity === "admin" || state.session.identity === "superadmin") &&
    state.ui.route === "director-inventory";

  if (!shouldPoll) {
    window.clearInterval(directorInventoryPollTimer);
    directorInventoryPollTimer = 0;
    return;
  }

  if (!state._holdNotify && !isEditingTextInput() && !isInventoryModalInputActive() && !isAppScrollProtected()) {
    actions.refreshCloudInventory({ silent: true, checkStatus: true });
  }

  if (directorInventoryPollTimer) return;
  directorInventoryPollTimer = window.setInterval(() => {
    if (isEditingTextInput() || isInventoryModalInputActive() || isAppScrollProtected()) return;
    actions.refreshCloudInventory({ silent: true, checkStatus: true });
  }, DIRECTOR_INVENTORY_POLL_INTERVAL_MS);
}

function isEditingTextInput() {
  const active = document.activeElement;
  if (!active) return false;
  return Boolean(active.closest?.("input, textarea, select, [contenteditable='true']"));
}

function isInventoryModalInputActive() {
  const active = document.activeElement;
  if (!active) return false;
  return Boolean(active.closest?.("[data-inventory-stock-adjust-form], [data-inventory-item-form]"));
}

function getLiveClockText() {
  return new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

let lastClockMinute = -1;

function updateLiveClockNodes() {
  document.querySelectorAll("[data-live-clock]").forEach((node) => {
    node.textContent = getLiveClockText();
  });

  const minute = new Date().getMinutes();
  if (minute !== lastClockMinute) {
    lastClockMinute = minute;
    if (
      (state.session.identity === "director" || state.session.identity === "admin" || state.session.identity === "superadmin") &&
      state.session.loggedIn &&
      !isEditingTextInput() &&
      !isInventoryModalInputActive() &&
      !isAppScrollProtected()
    ) {
      actions.tickClock();
    }
  }
}

function syncLiveClockTimer() {
  const hasClock = Boolean(document.querySelector("[data-live-clock]"));

  if (!hasClock) {
    window.clearInterval(liveClockTimer);
    liveClockTimer = 0;
    return;
  }

  updateLiveClockNodes();

  if (liveClockTimer) return;

  liveClockTimer = window.setInterval(updateLiveClockNodes, 1000);
}

function syncInstitutionSharedStatePolling() {
  const shouldPoll =
    state.session.loggedIn &&
    (state.session.identity === "director" || state.session.identity === "caregiver" || state.session.identity === "admin" || state.session.identity === "superadmin") &&
    !["login", "attendance"].includes(state.ui.route);

  if (!shouldPoll) {
    window.clearInterval(institutionStatePollTimer);
    institutionStatePollTimer = 0;
    return;
  }

  if (institutionStatePollTimer) return;

  if (!state._holdNotify) {
    if (!isAppScrollProtected()) {
      actions.refreshInstitutionSharedState({ silent: true });
    }
  }
  institutionStatePollTimer = window.setInterval(() => {
    if (isEditingTextInput()) return;
    if (isAppScrollProtected()) return;
    actions.refreshInstitutionSharedState({ silent: true });
  }, 12000);
}

app.addEventListener("scroll", markUserScrollActivity, true);
app.addEventListener("touchmove", markUserScrollActivity, { passive: true });
app.addEventListener("wheel", markUserScrollActivity, { passive: true });

subscribe(renderApp);
registerServiceWorker();

(async function autoLogin() {
  const token = getAuthToken();
  if (!token) { renderApp(); return; }
  try {
    const result = await requestJson("/api/auth/me");
    if (result && result.status === "success" && result.user) {
      setAuthToken(token);
      state.session.token = token;
      state.session.user = result.user;
      state.session.identity = result.user.role;
      state.session.loggedIn = true;
      const instId = actions.bindSessionUserToState
        ? actions.bindSessionUserToState(result.user)
        : (result.user.institutionId || "");
      if (instId) {
        await actions._loadCloudInstitutionInfo(instId);
      }
      const role = result.user.role;
      if (role === "caregiver") {
        const roleEntityId = result.user.roleEntityId || "";
        if (roleEntityId) {
          state.caregiver = {
            id: roleEntityId,
            name: result.user.displayName || result.user.username || "鎶ゅ伐",
            username: result.user.username || "",
            role: "鎶ゅ伐",
            floor: 1,
            shift: "",
            status: "on-duty",
            cloudUserId: result.user.id || "",
            cloudUserStatus: result.user.status || "active",
            institutionId: instId || state.institution.id || "",
          };
          state.caregivers = [state.caregiver, ...(state.caregivers || []).filter(function(c) { return c.id !== roleEntityId; })];
        }
        state.ui.route = "attendance";
        state.ui.activeTab = "home";
      } else if (role === "family") {
        state.ui.route = "family-home";
        state.ui.activeTab = "family-home";
      } else if (role === "director" || role === "admin" || role === "superadmin") {
        state.ui.route = "director-home";
        state.ui.activeTab = "director-home";
      }
      renderApp();
      if (role === "caregiver") {
        const roleEntityId = result.user.roleEntityId || "";
        if (instId) await actions._loadCloudPersonnel(instId);
        if (roleEntityId) {
          const matched = state.caregivers.find(function(c) { return c.id === roleEntityId; });
          if (matched) {
            state.caregiver = { ...matched };
          } else {
            state.caregiver = {
              id: roleEntityId,
              name: result.user.displayName || result.user.username || "鎶ゅ伐",
              username: result.user.username || "",
              role: "鎶ゅ伐",
              floor: 1,
              shift: "",
              status: "on-duty",
              cloudUserId: result.user.id || "",
              cloudUserStatus: result.user.status || "active",
              institutionId: instId || state.institution.id || "",
            };
            state.caregivers = [state.caregiver, ...(state.caregivers || []).filter(function(c) { return c.id !== roleEntityId; })];
          }
        }
        if (!state.caregiver?.id && !roleEntityId) {
          const cgName = result.user.displayName || result.user.username || "";
          const byName = state.caregivers.find(function(c) { return c.name === cgName; });
          if (byName) state.caregiver = { ...byName };
        }
        await actions.refreshInstitutionSharedState({ silent: true });
        await actions.refreshCaregiverCloudTasks({ silent: true, force: true });
      } else if (role === "director" || role === "admin" || role === "superadmin") {
        if (instId) await actions._loadCloudPersonnel(instId);
        actions.loadDirectorInitialData();
      }
      return;
    }
  } catch (_) {}
  setAuthToken("");
  state.session.token = "";
  state.session.user = null;
  renderApp();
})();
