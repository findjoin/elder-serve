import { renderIcon } from "../utils/caregiverUi.js";

function getDisplayDate() {
  const now = new Date();
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).format(now);
}

export function renderAttendancePage({ state }) {
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai" }).format(new Date());
  const caregiverId = state.caregiver?.id || "";
  const cloudRecords = (state.attendance?.records || []).filter((item) => (
    (item.date || item.recordDate) === today && item.caregiverId === caregiverId
  ));
  const latestRecord = cloudRecords.find((item) => item.clockInAt) || null;
  const clockInAt = latestRecord?.clockInTime || String(latestRecord?.clockInAt || "").slice(11, 16) || state.session.clockInAt;
  const hasClockInRecord = Boolean((state.session.loggedIn && state.session.clockInAt) || latestRecord?.clockInAt);
  const statusText = latestRecord?.status === "late"
    ? `迟到 ${latestRecord.lateMinutes || 0} 分钟`
    : latestRecord?.status === "present"
      ? "上班打卡成功"
      : "上班打卡成功";
  const buttonMeta = hasClockInRecord
    ? { action: "enter-workbench", icon: "arrowRight", label: "进入工作台", disabled: false }
    : { action: "clock-in", icon: "fingerprint", label: "上班打卡", disabled: false };

  const summaryHtml = hasClockInRecord
    ? `
      <div class="attendance-summary">
        <div class="attendance-summary__row">
          <span>打卡结果</span>
          <strong>${statusText}</strong>
        </div>
        <div class="attendance-summary__row">
          <span>打卡时间</span>
          <strong>${clockInAt || "--"}</strong>
        </div>
        <div class="attendance-summary__row">
          <span>打卡地点</span>
          <strong>${state.session.clockInLocation || "院内打卡"}</strong>
        </div>
        <div class="attendance-summary__row">
          <span>班次</span>
          <strong>${latestRecord?.shiftName || "早班"}（${latestRecord?.shiftStart && latestRecord?.shiftEnd ? `${latestRecord.shiftStart} - ${latestRecord.shiftEnd}` : state.caregiver.shift}）</strong>
        </div>
        <div class="attendance-summary__row">
          <span>云端同步</span>
          <strong>${state.cloud.attendanceError ? "同步失败" : "已同步"}</strong>
        </div>
      </div>
    `
    : "";

  return `
    <section class="attendance-page">
      <div class="attendance-page__hero">
        <div class="attendance-page__logo">${renderIcon("fingerprint")}</div>
        <h1>青禾镇智慧护理</h1>
        <p>今天是 ${getDisplayDate()}</p>
      </div>

      <div class="attendance-card">
        <p>当前班次：早班（${state.caregiver.shift}）</p>
        <div class="attendance-card__caption">点击下方按钮完成本次上班打卡。</div>
        ${state.cloud.attendanceLoading ? `<div class="attendance-card__caption">正在读取云端考勤...</div>` : ""}
        ${state.cloud.attendanceError ? `<div class="attendance-feedback attendance-feedback--error"><strong>云端同步失败</strong><p>${state.cloud.attendanceError}</p></div>` : ""}

        <button
          class="button button--primary button--block"
          data-action="${buttonMeta.action}"
          ${buttonMeta.disabled ? "disabled" : ""}
        >
          ${renderIcon(buttonMeta.icon)}
          <span>${buttonMeta.label}</span>
        </button>

        ${summaryHtml}
      </div>
    </section>
  `;
}
