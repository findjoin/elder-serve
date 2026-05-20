import { renderIcon } from "../utils/caregiverUi.js";

function getRoomTone(type) {
  if (type === "completed") return "room-status-dot room-status-dot--success";
  if (type === "error") return "room-status-dot room-status-dot--error";
  return "room-status-dot";
}

export function renderRoomSelectPage({ state, selectors }) {
  return `
    <section class="subpage-header">
      <div class="subpage-header__main">
        <h1>${state.ui.selectedFloor}F 房间列表</h1>
      </div>
    </section>

    <section class="room-list">
      ${
        selectors.floorRooms.length
          ? selectors.floorRooms
              .map(
                (room) => `
                  <article class="room-row">
                    <button class="room-row__main" data-action="choose-room" data-value="${room.elderId}" data-room="${room.room}">
                      <span class="${getRoomTone(room.type)}"></span>
                      <span class="room-row__label">
                        <strong>${room.room} ${room.elderName}</strong>
                        <small>${room.statusText}</small>
                      </span>
                      <span class="room-row__arrow">${renderIcon("caretRight")}</span>
                    </button>
                  </article>
                `,
              )
              .join("")
          : '<div class="empty-state empty-state--soft">当前楼层没有派给我的任务。</div>'
      }
    </section>
  `;
}
