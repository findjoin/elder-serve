import { renderIcon } from "../utils/caregiverUi.js";

function renderRecordMetric(label, value, tone = "") {
  return `
    <span class="care-record-workbench-metric ${tone ? `care-record-workbench-metric--${tone}` : ""}">
      <strong>${value}</strong>
      <small>${label}</small>
    </span>
  `;
}

function renderRecordStatusPill(status) {
  return `<span class="care-record-status care-record-status--${status.tone || "muted"}">${status.text}</span>`;
}

function renderElderRecordCard(item) {
  const rows = Array.isArray(item.recordRows) ? item.recordRows : [];
  const location = item.floor && item.room
    ? `${item.floor}F · ${item.room}室`
    : item.room
      ? `${item.room}室`
      : "房间未填";

  return `
    <article class="care-record-elder-card">
      <div class="care-record-elder-card__top">
        <div>
          <span>${location}</span>
          <strong>${item.name}</strong>
          <small>${item.level || "护理等级未填"} · ${item.bed || "床位未填"}</small>
        </div>
        ${renderRecordStatusPill(item.reportStatus)}
      </div>

      <div class="care-record-task-list">
        ${
          rows.length
            ? rows
                .map(
                  (row) => `
                    <button class="care-record-task-card" type="button" data-action="open-caregiver-record-tasks" data-value="${item.elderId}" data-task-id="${row.id || ""}">
                      <span>${row.taskName || "任务卡"}</span>
                      <small>${row.checkInTime ? `打卡 ${row.checkInTime.slice(11, 16) || row.checkInTime}` : "未打卡"} · 文字 ${row.note ? 1 : 0} · 图片 ${row.photoCount || 0}</small>
                    </button>
                  `,
                )
                .join("")
            : `<div class="care-record-task-empty">该日期暂无任务卡记录</div>`
        }
      </div>
    </article>
  `;
}

export function renderHistoryPage({ state, selectors }) {
  const workspace = selectors.caregiverRecordWorkspace || { cards: [], summary: {}, recordDate: "" };
  const summary = workspace.summary || {};
  const sync = summary.cloudSync || {};
  const syncHint = summary.cloudError
    ? `<div class="empty-state__hint">云端护理记录拉取失败：${summary.cloudError}</div>`
    : summary.cloudLoading
      ? `<div class="empty-state__hint">正在拉取云端护理记录...</div>`
      : sync.fetchedAt
        ? `<div class="empty-state__hint">云端返回 ${sync.returnedCount || 0} 条，合并 ${sync.mergedCount || 0} 张记录表。</div>`
        : `<div class="empty-state__hint">尚未拉取云端护理记录。</div>`;

  return `
    <section class="care-record-workbench">
      <section class="sticky-section care-record-workbench__sticky">
        <div class="page-header page-header--compact">
          <h1>护理记录</h1>
          <p>只记录当前护工实际操作过的任务卡，按日期和老人归档。</p>
        </div>

        <div class="care-record-workbench-hero">
          <label class="care-record-date-field">
            <span>记录日期</span>
            <input type="date" value="${workspace.recordDate}" data-care-record-date />
          </label>
          <button type="button" class="button button--small button--secondary" data-action="open-inventory-usage">记录库存使用</button>
        </div>

        <div class="care-record-workbench-summary">
          ${renderRecordMetric("记录老人", summary.total || 0)}
          ${renderRecordMetric("打卡", summary.synced || 0, "success")}
          ${renderRecordMetric("文字", summary.notes || 0)}
          ${renderRecordMetric("图片", summary.issues || 0)}
        </div>

        <div class="history-filters history-filters--workbench">
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
              ${["全部", "有打卡", "有记录"]
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

      <section class="care-record-elder-list">
        ${
          workspace.cards.length
            ? workspace.cards.map(renderElderRecordCard).join("")
            : `
              <div class="empty-state empty-state--soft">
                当前日期没有该护工操作过的任务卡。
                ${syncHint}
              </div>
            `
        }
      </section>
    </section>
  `;
}
