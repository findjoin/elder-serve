import { renderIcon } from "../utils/caregiverUi.js";

function getStatusClass(status) {
  if (status === "已完成") return "history-badge history-badge--success";
  return "history-badge history-badge--error";
}

function renderHistoryPhoto(label) {
  return `<span class="history-photo">${label}</span>`;
}

export function renderHistoryPage({ state, selectors }) {
  return `
    <section class="sticky-section">
      <div class="page-header page-header--compact">
        <h1>护理记录（过程）</h1>
        <p>回看已完成、异常和不配合处理留痕</p>
      </div>

      <div class="history-filters">
        <div class="history-filter-chips">
          ${["今日", "昨日", "本周", "本月"]
            .map(
              (item) => `
                <button
                  class="history-filter-chip ${state.ui.historyFilter.time === item ? "is-active" : ""}"
                  data-action="set-history-time"
                  data-value="${item}"
                >
                  ${item}
                </button>
              `,
            )
            .join("")}
        </div>

        <div class="history-filter-row">
          <label class="search-field">
            <span>${renderIcon("search")}</span>
            <input
              type="text"
              placeholder="老人姓名/房间号"
              value="${state.ui.historyFilter.search}"
              data-history-search
            />
          </label>

          <select class="history-select" data-history-status>
            ${["全部", "已完成", "异常", "老人不配合"]
              .map(
                (item) => `
                  <option value="${item}" ${state.ui.historyFilter.status === item ? "selected" : ""}>
                    ${item}
                  </option>
                `,
              )
              .join("")}
          </select>
        </div>
      </div>
    </section>

    <section class="history-list">
      ${
        selectors.filteredHistory.length
          ? selectors.filteredHistory
              .map(
                (item) => `
                  <button class="history-card" data-action="select-history" data-value="${item.id}">
                    <div class="history-card__head">
                      <div>
                        <strong>${item.elder} <small>${item.room}室</small></strong>
                        <p>${item.time}</p>
                      </div>
                      <span class="${getStatusClass(item.status)}">${item.status}</span>
                    </div>

                    <div class="history-card__body">
                      ${renderHistoryPhoto(item.photoLabel)}
                      <div class="history-card__copy">
                        <strong>${item.task}</strong>
                        <small>执行人：${item.caregiver}</small>
                        <p>"${item.details}"</p>
                      </div>
                    </div>
                  </button>
                `,
              )
              .join("")
          : '<div class="empty-state empty-state--soft">暂无符合条件的记录</div>'
      }
    </section>
  `;
}
