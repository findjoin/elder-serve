import { renderIcon } from "../utils/caregiverUi.js";

function readRuntimeInfo() {
  try {
    const raw = window.AndroidBridge?.getRuntimeInfo?.();
    return raw ? JSON.parse(raw) : {};
  } catch (error) {
    return {};
  }
}

function formatVersion(runtimeInfo) {
  const name = runtimeInfo.versionName || "1.0";
  const code = runtimeInfo.versionCode ? ` (${runtimeInfo.versionCode})` : "";
  return `v${name}${code}`;
}

function formatSize(bytes) {
  const value = Number(bytes || 0);
  if (!value) return "";
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  if (value >= 1024) return `${Math.round(value / 1024)} KB`;
  return `${value} B`;
}

function renderLoginMenu(state, runtimeInfo) {
  if (!state?.ui?.loginMenuOpen) return "";

  return `
    <div class="login-more-menu">
      <button type="button" class="login-more-menu__item" data-action="open-app-info" data-value="version">
        <span>当前版本</span>
        <em>${formatVersion(runtimeInfo)}</em>
      </button>
      <button type="button" class="login-more-menu__item" data-action="open-app-info" data-value="about">关于我们</button>
      <button type="button" class="login-more-menu__item" data-action="open-app-info" data-value="contact">联系开发者</button>
      <button type="button" class="login-more-menu__item is-primary" data-action="check-app-update">检查更新</button>
    </div>
  `;
}

function renderInfoDialog(state, runtimeInfo) {
  const kind = state?.ui?.appInfoDialog || "";
  if (!kind) return "";

  const content = {
    version: {
      title: "当前版本",
      body: `<strong>${formatVersion(runtimeInfo)}</strong><span>${runtimeInfo.packageName || "com.elderserve.caregiver"}</span>`,
    },
    about: {
      title: "关于我们",
      body: "<strong>青禾镇颐养护理院</strong><span>面向乡镇养老院的护理记录、任务分配和日报归档系统。</span>",
    },
    contact: {
      title: "联系开发者",
      body: "<strong>开发者支持</strong><span>请联系项目维护人员处理部署、升级和数据同步问题。</span>",
    },
  }[kind] || {
    title: "应用信息",
    body: "",
  };

  return `
    <section class="login-modal">
      <button class="login-modal__backdrop" data-action="close-app-info" aria-label="关闭"></button>
      <div class="login-modal__dialog">
        <h2>${content.title}</h2>
        <div class="login-modal__content">${content.body}</div>
        <button type="button" class="button button--primary button--block" data-action="close-app-info">关闭</button>
      </div>
    </section>
  `;
}

function renderUpdateDialog(state) {
  const update = state?.ui?.appUpdate || {};
  if (!update.open) return "";

  const release = update.release || {};
  const titleMap = {
    checking: "正在检查更新",
    latest: "当前已是最新版本",
    available: "发现新版本",
    downloading: "正在下载更新",
    installing: "准备安装更新",
    error: "更新检查失败",
  };
  const status = update.status || "idle";
  const title = titleMap[status] || "检查更新";
  const sizeLabel = formatSize(release.sizeBytes);

  return `
    <section class="login-modal">
      <button class="login-modal__backdrop" data-action="close-app-update-dialog" aria-label="关闭"></button>
      <div class="login-modal__dialog">
        <h2>${title}</h2>
        <div class="login-update-status login-update-status--${status}">
          <strong>${update.message || ""}</strong>
          ${
            release.versionCode
              ? `<span>版本 ${release.versionName || release.versionCode}${sizeLabel ? ` · ${sizeLabel}` : ""}</span>`
              : ""
          }
          ${status === "downloading" ? `<div class="login-update-progress"><span style="width:${Math.max(4, Math.min(100, update.progress || 4))}%"></span></div>` : ""}
          ${release.releaseNotes ? `<p>${release.releaseNotes}</p>` : ""}
        </div>
        <div class="login-modal__actions">
          <button type="button" class="button button--secondary" data-action="close-app-update-dialog">关闭</button>
          ${
            status === "available"
              ? '<button type="button" class="button button--primary" data-action="download-app-update">立即更新</button>'
              : ""
          }
          ${
            status === "error"
              ? '<button type="button" class="button button--primary" data-action="check-app-update">重试</button>'
              : ""
          }
        </div>
      </div>
    </section>
  `;
}

export function renderLoginPage({ state } = {}) {
  const runtimeInfo = readRuntimeInfo();
  const errorMsg = state?.ui?.loginError || "";

  return `
    <section class="role-select-page">
      <button type="button" class="role-select-page__more" data-action="toggle-login-menu" aria-label="更多">
        ${renderIcon("moreVertical")}
      </button>
      ${renderLoginMenu(state, runtimeInfo)}

      <div class="role-select-page__hero">
        <div class="role-select-page__logo">
          ${renderIcon("home")}
        </div>
        <h1>青禾镇颐养护理院</h1>
        <p>科技守护，情暖夕阳</p>
      </div>

      <div class="role-select-page__content">
        <form class="login-form" autocomplete="off">
          <div class="login-form__field">
            <label class="login-form__label">用户名</label>
            <input type="text" class="login-form__input" name="username" placeholder="请输入用户名" autocomplete="off" />
          </div>
          <div class="login-form__field">
            <label class="login-form__label">密码</label>
            <input type="password" class="login-form__input" name="password" placeholder="请输入密码" autocomplete="off" />
          </div>
          ${errorMsg ? `<p class="login-form__error">${errorMsg}</p>` : ""}
          <button type="button" class="button button--primary button--block login-form__submit" data-action="login-submit">登录</button>
        </form>
        <p class="login-form__footnote">联系院长申请账号</p>
      </div>

      <div class="role-select-page__footer">
        <p>Powered by Smart ElderCare System</p>
        <p>当前版本：${formatVersion(runtimeInfo)}</p>
      </div>
      ${renderInfoDialog(state, runtimeInfo)}
      ${renderUpdateDialog(state)}
    </section>
  `;
}
