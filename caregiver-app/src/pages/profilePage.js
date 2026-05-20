import { renderAvatar, renderIcon } from "../utils/caregiverUi.js";

export function renderProfilePage({ state }) {
  return `
    <section class="profile-page">
      <div class="profile-page__hero">
        ${renderAvatar(state.caregiver.name, "avatar--hero")}
        <h2>${state.caregiver.name}</h2>
        <p>${state.caregiver.role} | 工号：${state.caregiver.employeeNo}</p>
      </div>

      <div class="profile-menu">
        <button class="profile-menu__item" data-action="navigate" data-route="history">
          <span class="profile-menu__label">
            ${renderIcon("history")}
            <strong>护理记录（过程）</strong>
          </span>
          ${renderIcon("caretRight")}
        </button>

        <button class="profile-menu__item" data-action="navigate" data-route="attendance">
          <span class="profile-menu__label">
            ${renderIcon("note")}
            <strong>我的考勤</strong>
          </span>
          ${renderIcon("caretRight")}
        </button>

        <div class="profile-menu__item">
          <span class="profile-menu__label">
            ${renderIcon("tasks")}
            <strong>设置</strong>
          </span>
          ${renderIcon("caretRight")}
        </div>

        <button class="button button--danger button--block profile-page__logout" data-action="logout">退出登录</button>
      </div>
    </section>
  `;
}
