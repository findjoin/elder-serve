import { renderAvatar, renderIcon } from "../utils/caregiverUi.js";

function buildSparkline(values) {
  const width = 280;
  const height = 140;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const gap = width / (values.length - 1 || 1);

  const points = values
    .map((value, index) => {
      const ratio = max === min ? 0.5 : (value - min) / (max - min);
      const x = index * gap;
      const y = height - ratio * (height - 24) - 12;
      return `${x},${y}`;
    })
    .join(" ");

  return `
    <svg class="family-sparkline" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="familyTrendFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="rgba(144, 201, 119, 0.35)"></stop>
          <stop offset="100%" stop-color="rgba(144, 201, 119, 0.04)"></stop>
        </linearGradient>
      </defs>
      <polyline points="${points}" fill="none" stroke="#90C977" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"></polyline>
    </svg>
  `;
}

function renderFamilyHero(state) {
  const elder = state.family.elder;
  const care = state.family.careSummary || {};
  const medication = state.family.medicationSummary || {};
  const anomaly = state.family.anomalySummary || {};
  const heroCareLabel = String(care.conclusion || "").includes("异常") ? "有异常" : "总体正常";

  return `
    <section class="family-hero">
      <div class="family-hero__top">
        <div class="family-hero__identity">
          ${renderAvatar(elder.name, "avatar--hero")}
          <div>
            <h1>${elder.name}（${elder.relation}）</h1>
            <p>入住天数：${elder.stayDays} 天 | ${elder.room}</p>
          </div>
        </div>
        <button class="icon-button icon-button--light" data-action="navigate" data-route="family-profile">
          ${renderIcon("gear")}
        </button>
      </div>

      <div class="family-metric-grid">
        <div class="family-metric">
          <p>今日结论</p>
          <strong>${heroCareLabel}</strong>
        </div>
        <div class="family-metric">
          <p>用药状态</p>
          <strong>${medication.status || "已处理"}</strong>
        </div>
        <div class="family-metric">
          <p>异常提醒</p>
          <strong>${anomaly.status || "平稳"}</strong>
        </div>
      </div>

      <div class="family-health-bubble">
        <div class="family-health-bubble__item">
          <span class="family-health-bubble__icon family-health-bubble__icon--red">${renderIcon("heart")}</span>
          <div>
            <p>最新血压</p>
            <strong>${elder.latestBloodPressure} <small>mmHg</small></strong>
          </div>
        </div>
        <div class="family-health-bubble__item">
          <span class="family-health-bubble__icon family-health-bubble__icon--orange">${renderIcon("drop")}</span>
          <div>
            <p>今日血糖</p>
            <strong>${elder.bloodSugar} <small>mmol/L</small></strong>
          </div>
        </div>
      </div>
    </section>
  `;
}

function renderFamilyPriorityCard({ icon, title, conclusion, meta, details = [], actionLabel = "查看详情" }) {
  return `
    <article class="family-priority-card">
      <div class="family-priority-card__head">
        <span class="family-priority-card__icon">${renderIcon(icon)}</span>
        <div>
          <p>${title}</p>
          <strong>${conclusion}</strong>
        </div>
      </div>
      <div class="family-priority-card__meta">${meta}</div>
      <div class="family-trust-line">
        ${details.map((item) => `<span>${item}</span>`).join("")}
      </div>
      <button class="family-link" data-action="navigate" data-route="family-messages">${actionLabel}</button>
    </article>
  `;
}

export function renderFamilyHomePage({ state }) {
  const care = state.family.careSummary || {};
  const medication = state.family.medicationSummary || {};
  const anomaly = state.family.anomalySummary || {};

  return `
    ${renderFamilyHero(state)}

    <section class="family-page">
      <section class="family-priority-grid">
        ${renderFamilyPriorityCard({
          icon: "checkCircle",
          title: "今日护理摘要",
          conclusion: care.conclusion || "今日护理总体正常",
          meta: `已处理 ${care.handledCount || 0}/${care.totalCount || 0} 项 · 最近 ${care.latestTime || "--"}`,
          details: [`执行人：${care.caregiver || "院方"}`, `班次：${care.shift || "今日班次"}`, care.evidence || "关键护理已留痕"],
          actionLabel: "查看护理摘要",
        })}
        ${renderFamilyPriorityCard({
          icon: "note",
          title: "用药记录",
          conclusion: medication.conclusion || "今日用药已确认",
          meta: `${medication.status || "已处理"} · 最近 ${medication.latestTime || "--"}`,
          details: [`执行人：${medication.caregiver || "院方"}`, `复核：${medication.reviewer || "院方"}`, medication.source || "交班日报"],
          actionLabel: "查看用药记录",
        })}
        ${renderFamilyPriorityCard({
          icon: "warning",
          title: "异常提醒",
          conclusion: anomaly.conclusion || "暂无未处理异常",
          meta: `${anomaly.status || "平稳"} · 最近 ${anomaly.latestTime || "--"}`,
          details: anomaly.chain || ["今日记录已同步", "暂无异常"],
          actionLabel: "查看处理链路",
        })}
      </section>

      <article class="family-contact-card">
        <div>
          <strong>${state.family.contactPolicy?.title || "家属留言"}</strong>
          <p>${state.family.contactPolicy?.description || "院方工作时间内处理留言。"}</p>
        </div>
        <button class="button button--secondary button--small" data-action="navigate" data-route="family-messages">去留言</button>
      </article>

      <section class="family-section">
        <div class="family-section__head">
          <h2>最新动态</h2>
          <button class="family-link" data-action="navigate" data-route="family-messages">查看全部日志</button>
        </div>

        <div class="family-log-card">
          ${state.family.logs
            .map(
              (item) => `
                <article class="family-log-item">
                  <span class="family-log-item__line family-log-item__line--${item.tone}"></span>
                  <div class="family-log-item__body">
                    <p>${item.time} · ${item.title}</p>
                    <strong>${item.description}</strong>
                  </div>
                </article>
              `,
            )
            .join("")}
        </div>
      </section>

      <section class="family-section">
        <div class="family-section__head">
          <h2>近 7 日血压趋势</h2>
        </div>
        <div class="family-chart-card">
          ${buildSparkline(state.family.trendValues)}
          <div class="family-chart-card__labels">
            ${state.family.trendLabels.map((label) => `<span>${label}</span>`).join("")}
          </div>
        </div>
      </section>

      <section class="family-section family-section--last">
        <div class="family-section__head">
          <h2>生活瞬间</h2>
        </div>
        <div class="family-moment-grid">
          ${state.family.moments
            .map(
              (item) => `
                <article class="family-moment-card family-moment-card--${item.theme}">
                  <div class="family-moment-card__overlay">
                    <small>${item.subtitle}</small>
                    <strong>${item.title}</strong>
                  </div>
                </article>
              `,
            )
            .join("")}
        </div>
      </section>
    </section>
  `;
}

export function renderFamilyHealthPage({ state }) {
  const elder = state.family.elder;

  return `
    <section class="family-page family-page--simple">
      <div class="family-subpage-header">
        <h1>健康看护</h1>
        <p>${elder.name} · ${elder.room}</p>
      </div>

      <div class="family-health-grid">
        <article class="family-health-card">
          <span class="family-health-card__icon">${renderIcon("heart")}</span>
          <p>最新血压</p>
          <strong>${elder.latestBloodPressure}</strong>
          <small>今日 08:30 更新</small>
        </article>
        <article class="family-health-card">
          <span class="family-health-card__icon family-health-card__icon--orange">${renderIcon("drop")}</span>
          <p>今日血糖</p>
          <strong>${elder.bloodSugar}</strong>
          <small>空腹状态平稳</small>
        </article>
        <article class="family-health-card">
          <span class="family-health-card__icon family-health-card__icon--green">${renderIcon("pulse")}</span>
          <p>今日步数</p>
          <strong>${elder.stepCount}</strong>
          <small>活动量较昨日提升</small>
        </article>
      </div>

      <div class="family-chart-card family-chart-card--tight">
        ${buildSparkline(state.family.trendValues)}
        <div class="family-chart-card__labels">
          ${state.family.trendLabels.map((label) => `<span>${label}</span>`).join("")}
        </div>
      </div>
    </section>
  `;
}

export function renderFamilyMessagesPage({ state, selectors }) {
  return `
    <section class="family-page family-page--simple">
      <div class="family-subpage-header">
        <h1>消息中心</h1>
        <p>未读 ${selectors.unreadFamilyMessages} 条</p>
      </div>

      <div class="family-message-list">
        ${state.family.messages
          .map(
            (item) => `
              <button
                class="family-message-card ${item.read ? "is-read" : ""}"
                data-action="toggle-family-message"
                data-value="${item.id}"
              >
                <div class="family-message-card__head">
                  <strong>${item.title}</strong>
                  <span>${item.time}</span>
                </div>
                <p>${item.preview}</p>
              </button>
            `,
          )
          .join("")}
      </div>
    </section>
  `;
}

export function renderFamilyProfilePage({ state }) {
  const elder = state.family.elder;

  return `
    <section class="family-page family-page--simple">
      <div class="family-profile-card">
        ${renderAvatar(elder.name, "avatar--hero")}
        <h2>${elder.name}</h2>
        <p>${elder.relation} · ${elder.room}</p>
      </div>

      <div class="profile-menu">
        <button class="profile-menu__item" data-action="navigate" data-route="family-health">
          <span class="profile-menu__label">
            ${renderIcon("pulse")}
            <strong>健康数据</strong>
          </span>
          ${renderIcon("caretRight")}
        </button>
        <button class="profile-menu__item" data-action="navigate" data-route="family-messages">
          <span class="profile-menu__label">
            ${renderIcon("message")}
            <strong>消息提醒</strong>
          </span>
          ${renderIcon("caretRight")}
        </button>
        <button class="profile-menu__item" data-action="logout">
          <span class="profile-menu__label">
            ${renderIcon("note")}
            <strong>退出登录</strong>
          </span>
          ${renderIcon("caretRight")}
        </button>
      </div>
    </section>
  `;
}
