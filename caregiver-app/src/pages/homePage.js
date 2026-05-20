function getDisplayDate() {
  const now = new Date();
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "long",
  }).format(now);
}

export function renderHomePage({ state, selectors }) {
  const ownerFloor = state.caregiver.floor;
  const sync = selectors.caregiverTaskSyncStatus || {};
  const syncDetail = sync.detail || {};
  const syncMeta = [
    `机构ID：${sync.institutionId || syncDetail.institutionId || "--"}`,
    `护工ID：${sync.caregiverId || syncDetail.caregiverId || "--"}`,
    `返回：${Number.isFinite(Number(syncDetail.returnedCount)) ? syncDetail.returnedCount : "--"}`,
    `合并：${Number.isFinite(Number(syncDetail.mergedCount)) ? syncDetail.mergedCount : "--"}`,
  ].join(" · ");
  const hasNoTasks = !selectors.caregiverDashboard.pendingCount && !selectors.caregiverDashboard.completedCount;

  return `
    <section class="page-header">
      <h1>我的任务</h1>
      <p>${getDisplayDate()}</p>
    </section>

    <section class="detail-stack">
      <section class="stat-grid stat-grid--two">
        <article class="detail-card detail-card--compact">
          <small>待办任务</small>
          <strong>${selectors.caregiverDashboard.pendingCount} <span>项</span></strong>
        </article>
        <article class="detail-card detail-card--compact">
          <small>需拍照留痕</small>
          <strong>${selectors.caregiverDashboard.photoCount} <span>项</span></strong>
        </article>
        <article class="detail-card detail-card--compact">
          <small>临时任务</small>
          <strong>${selectors.caregiverDashboard.manualCount} <span>项</span></strong>
        </article>
        <article class="detail-card detail-card--compact">
          <small>已完成</small>
          <strong>${selectors.caregiverDashboard.completedCount} <span>项</span></strong>
        </article>
      </section>
    </section>

    ${
      sync.error
        ? `<section class="empty-state empty-state--soft caregiver-task-empty">
            <strong>云端任务同步失败</strong>
            <span>查询日期：${selectors.caregiverTaskRecordDate || "--"} · 护工ID：${sync.caregiverId || "--"}</span>
            <span class="caregiver-task-empty__error">${sync.error}</span>
            <button type="button" class="button button--secondary button--small" data-action="refresh-caregiver-tasks">手动刷新</button>
          </section>`
        : hasNoTasks && sync.fetchedAt
          ? `<section class="empty-state empty-state--soft caregiver-task-empty">
              <strong>云端已同步，但当前没有分配给我的任务</strong>
              <span>查询日期：${selectors.caregiverTaskRecordDate || "--"} · 上次同步：${sync.fetchedAt}</span>
              <span>${syncMeta}</span>
              <button type="button" class="button button--secondary button--small" data-action="refresh-caregiver-tasks">重新拉取</button>
            </section>`
          : sync.loading
            ? `<section class="empty-state empty-state--soft caregiver-task-empty">
                <strong>正在同步我的任务...</strong>
                <span>查询日期：${selectors.caregiverTaskRecordDate || "--"} · 护工ID：${sync.caregiverId || "--"}</span>
              </section>`
            : ""
    }

    <section class="floor-grid">
      ${
        selectors.floorSummaries.length
          ? selectors.floorSummaries
              .map((item) => {
                const isOwnerFloor = item.floor === ownerFloor;
                return `
                  <button class="floor-card ${isOwnerFloor ? "is-owner-floor" : "is-support-floor"}" data-action="choose-floor" data-value="${item.floor}">
                    <strong>${item.floor}F</strong>
                    <span>待办 ${item.pendingCount}</span>
                  </button>
                `;
              })
              .join("")
          : '<div class="empty-state empty-state--soft">当前没有分配给我的待办任务。</div>'
      }
    </section>
  `;
}
