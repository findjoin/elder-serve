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

  return `
    <section class="page-header">
      <h1>任务中心</h1>
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
          <small>院长发布</small>
          <strong>${selectors.caregiverDashboard.manualCount} <span>项</span></strong>
        </article>
        <article class="detail-card detail-card--compact">
          <small>已完成</small>
          <strong>${selectors.caregiverDashboard.completedCount} <span>项</span></strong>
        </article>
      </section>
    </section>

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
          : '<div class="empty-state empty-state--soft">当前没有待办楼层。</div>'
      }
    </section>
  `;
}
