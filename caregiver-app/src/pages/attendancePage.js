import { renderIcon } from "../utils/caregiverUi.js";

function getDisplayDate() {
  const now = new Date();
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).format(now);
}

function buildStatusMeta(status, type) {
  if (type === "fingerprint") {
    if (status === "processing") return { text: "验证中", tone: "warning", detail: "请按压指纹完成身份验证" };
    if (status === "success") return { text: "已通过", tone: "success", detail: "身份校验已完成" };
    if (status === "error") return { text: "失败", tone: "error", detail: "请重新进行指纹验证" };
    return { text: "待验证", tone: "warning", detail: "打卡前需完成指纹验证" };
  }

  if (status === "processing") return { text: "定位中", tone: "warning", detail: "正在记录当前位置" };
  if (status === "success") return { text: "已记录", tone: "success", detail: "打卡位置已成功写入记录" };
  if (status === "error") return { text: "失败", tone: "error", detail: "请确认定位权限和位置信号" };
  return { text: "待获取", tone: "warning", detail: "打卡时会自动记录当前位置" };
}

function buildButtonMeta(verification, hasClockInRecord) {
  if (hasClockInRecord || verification.status === "success") {
    return {
      action: "enter-workbench",
      icon: "arrowRight",
      label: "进入工作台",
      disabled: false,
    };
  }

  if (verification.status === "fingerprint") {
    return {
      action: "clock-in",
      icon: "fingerprint",
      label: "指纹验证中...",
      disabled: true,
    };
  }

  if (verification.status === "location") {
    return {
      action: "clock-in",
      icon: "mapPin",
      label: "定位校验中...",
      disabled: true,
    };
  }

  return {
    action: "clock-in",
    icon: "fingerprint",
    label: verification.status === "error" ? "重新打卡" : "指纹+定位上班打卡",
    disabled: false,
  };
}

function renderStatusItem(iconName, label, meta) {
  return `
    <div class="attendance-status__item is-${meta.tone}">
      <div class="attendance-status__meta">
        <span class="attendance-status__icon">${renderIcon(iconName)}</span>
        <div>
          <strong>${label}</strong>
          <small>${meta.detail}</small>
        </div>
      </div>
      <span class="attendance-status__value">${meta.text}</span>
    </div>
  `;
}

function renderSummaryRow(label, value) {
  return `
    <div class="attendance-summary__row">
      <span>${label}</span>
      <strong>${value}</strong>
    </div>
  `;
}

export function renderAttendancePage({ state }) {
  const verification = state.ui.attendanceVerification || {};
  const hasClockInRecord = Boolean(state.session.loggedIn && state.session.clockInAt);
  const fingerprintMeta = buildStatusMeta(verification.fingerprintStatus || (hasClockInRecord ? "success" : "idle"), "fingerprint");
  const locationMeta = buildStatusMeta(verification.locationStatus || (hasClockInRecord ? "success" : "idle"), "location");
  const buttonMeta = buildButtonMeta(verification, hasClockInRecord);
  const locationLabel = verification.locationLabel || state.session.clockInLocation || "院内定位已记录";
  const accuracyLabel = verification.locationAccuracy || "";
  const feedbackHtml =
    verification.status === "error"
      ? `
        <div class="attendance-feedback attendance-feedback--error">
          <strong>${verification.errorStage === "location" ? "定位校验失败" : "身份验证失败"}</strong>
          <p>${verification.errorMessage || "当前打卡未完成，请重新尝试"}</p>
        </div>
      `
      : "";
  const summaryHtml = hasClockInRecord
    ? `
      <div class="attendance-summary">
        ${renderSummaryRow("打卡结果", "上班打卡成功")}
        ${renderSummaryRow("打卡时间", state.session.clockInAt)}
        ${renderSummaryRow("打卡地点", locationLabel)}
        ${accuracyLabel ? renderSummaryRow("定位精度", accuracyLabel) : ""}
        ${renderSummaryRow("班次", `早班（${state.caregiver.shift}）`)}
      </div>
    `
    : "";

  return `
    <section class="attendance-page">
      <div class="attendance-page__hero">
        <div class="attendance-page__logo">${renderIcon("fingerprint")}</div>
        <h1>福乐镇智慧护理</h1>
        <p>今天是 ${getDisplayDate()}</p>
      </div>

      <div class="attendance-card">
        <p>当前班次：早班（${state.caregiver.shift}）</p>
        <div class="attendance-card__caption">请先按压指纹，再记录当前位置，完成本次上班打卡。</div>

        <div class="attendance-status">
          ${renderStatusItem("fingerprint", "指纹验证", fingerprintMeta)}
          ${renderStatusItem("mapPin", "定位校验", locationMeta)}
        </div>

        <button
          class="button button--primary button--block"
          data-action="${buttonMeta.action}"
          ${buttonMeta.disabled ? "disabled" : ""}
        >
          ${renderIcon(buttonMeta.icon)}
          <span>${buttonMeta.label}</span>
        </button>

        ${feedbackHtml}
        ${summaryHtml}
      </div>
    </section>
  `;
}
