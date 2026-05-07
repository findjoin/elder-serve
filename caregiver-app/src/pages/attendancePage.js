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
  const hasClockInRecord = Boolean(state.session.loggedIn && state.session.clockInAt);
  const buttonMeta = hasClockInRecord
    ? { action: "enter-workbench", icon: "arrowRight", label: "进入工作台", disabled: false }
    : { action: "clock-in", icon: "fingerprint", label: "上班打卡", disabled: false };

  const summaryHtml = hasClockInRecord
    ? `
      <div class="attendance-summary">
        <div class="attendance-summary__row">
          <span>打卡结果</span>
          <strong>上班打卡成功</strong>
        </div>
        <div class="attendance-summary__row">
          <span>打卡时间</span>
          <strong>${state.session.clockInAt}</strong>
        </div>
        <div class="attendance-summary__row">
          <span>打卡地点</span>
          <strong>${state.session.clockInLocation || "院内打卡"}</strong>
        </div>
        <div class="attendance-summary__row">
          <span>班次</span>
          <strong>早班（${state.caregiver.shift}）</strong>
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
