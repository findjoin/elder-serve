# Elder Serve 项目开发手册

## 项目概述

青禾镇颐养护理院管理系统。Web 前端 + FastAPI 后端 + Android WebView 壳。

**三种身份**：护工(caregiver)、院长(director)、家属(family)
**核心逻辑**：院长制定日报模板 → 生成每日护理任务 → 按楼层分配给护工 → 护工执行并提交日报 → 院长实时查看

## 运行架构

```
Android App (WebView 壳)
  └── caregiver-app/ (Web 前端 SPA)
        ├── main.js      — 路由、事件分发、弹窗、轮询
        ├── store/state.js — 全局状态、业务动作、云端同步
        ├── pages/        — 页面渲染函数（纯 HTML 生成）
        ├── utils/cloudApi.js — 云端 API 客户端
        └── styles/       — CSS 样式
            ↓ HTTP (x-api-key 认证)
      remote-main.py (FastAPI + SQLite, 运行在 49.235.183.62:80)
```

- Web 前端通过 `window.AndroidBridge` 调用原生能力（打卡、文件保存、打印、更新）
- 数据按 `institutionId` 隔离（当前：`demo-qinghe-care`）
- 前端 API 配置来源：Android `local.properties` → `resValue` → `MainActivity` → `AndroidBridge.getRuntimeInfo()` → `cloudApi.js`

## 关键文件

| 文件 | 作用 |
|------|------|
| `caregiver-app/src/store/state.js` | 核心：数据结构、业务动作、云端同步 |
| `caregiver-app/src/main.js` | 路由、事件分发、轮询、弹窗 |
| `caregiver-app/src/pages/directorPage.js` | 院长端所有页面（4027行，待拆分） |
| `caregiver-app/src/utils/cloudApi.js` | 前端 HTTP 客户端 |
| `caregiver-app/src/data/mockData.js` | 本地初始数据 + `buildTasksFromConfiguration` |
| `remote-main.py` | 后端 FastAPI 服务 |
| `PROJECT_MAP.md` | 项目地图（路由、API、业务流程速查） |
| `DATA_ARCHITECTURE.md` | 云端数据库架构（14 表、关系链、API 概览） |
| `CLAUDE.md` | 本文件（开发习惯 + 操作手册） |

## 强制工作流（每次代码改动必须执行）

当用户要求执行任何代码修改任务时，严格按以下 5 步执行，不可跳过任何一步。

### 步骤 1：项目地图检查

**读任何源码文件前，先读 `PROJECT_MAP.md` 的目录索引（第 1-20 行），找到对应章节，再按章节指引定位到具体文件和行号。**

- 禁止直接打开大文件从头读到尾
- PROJECT_MAP.md 第 3 节是按症状查找的问题定位索引
- PROJECT_MAP.md 第 4 节是核心函数速查（有精确行号）

### 步骤 2：当前任务记录（TodoWrite）

**确定任务范围后，用 TodoWrite 将任务拆分为可追踪的子任务。** 每个子任务完成后立即标记为 `completed`，同时只有一个 `in_progress`。

- 拆分粒度：每个独立可验证的操作为一个子任务
- 完成后立即更新状态，不要批量标记

### 步骤 3：6-agent 并行审查

**TodoWrite 记录后、写代码前，启动 6 个 Agent 并行审查变更方案：**

| # | 审查维度 | 关注点 |
|---|---------|--------|
| 1 | 正确性 | 逻辑是否正确，是否引入 bug |
| 2 | 性能 | 是否影响渲染/轮询/内存 |
| 3 | 代码风格 | 是否符合项目风格（不写注释、不抽象、不改无关代码） |
| 4 | 边界情况 | 网络断开、空数据、身份切换等异常路径 |
| 5 | 系统集成 | 与现有数据流/轮询/路由是否冲突 |
| 6 | 安全 | XSS、注入、信息泄露、权限绕过 |

- **全部 6 个同意后才能动手修改代码**
- 纯只读操作（Glob/Grep/Read）可跳过

### 步骤 4：执行任务

按审查通过的方案修改代码。修改后必须：

- **构建 APK**：`cd caregiver-android && ./gradlew.bat clean assembleDebug`（必须 clean，防止 Web 资产过期）
- **安装验证**：`adb uninstall com.elderserve.caregiver && adb install ...`

### 步骤 5：更新项目地图

**如果变更涉及以下任何一项，必须更新 `PROJECT_MAP.md`：**

- 新增/删除页面路由
- 新增/修改核心函数（state.js / main.js 中的导出函数）
- 新增/修改 API 端点
- 数据流或同步机制变化
- 已知问题的新增或修复

更新方式：在 PROJECT_MAP.md 对应章节添加条目并注明行号。

### 补充规则

**新增 `data-action` handler** 如果会触发 `notify()`，必须在 action 前调用 `requestScrollRestore(state.ui.route, getCurrentContentScrollTop())`。跳转到其他页面的 action（route 变更）例外。

---

## 代码修改习惯

1. **默认不写注释** — 只在不明显的约束、hack、修复处加一行简注
2. **直接编辑，不创建新文件** — 除非是新功能
3. **不改无关代码** — Bug 修复不做顺手重构
4. **不要过度抽象** — 三行重复代码好过过早抽象
5. **不设计假想未来需求** — 只做当前任务
6. **不写多行 JSDoc/文档注释**
7. **不改 `.env` / `local.properties` / SSH 密钥** — 永远不要读或改敏感文件
8. **修改代码后要强制完整构建 APK** — `cd caregiver-android && ./gradlew.bat clean assembleDebug`（必须 clean，否则可能用过期的 Web 资产打包）
9. **APK 安装前先卸载旧版** — `adb uninstall com.elderserve.caregiver && adb install ...`
10. **验证后端接口用 curl** — 不要假设服务器状态

## 必须了解的软件逻辑

### 日报模板 → 日常任务 生成流程（服务端负责）

1. 院长进入 `director-care-records` → 编辑日报模板
2. 模板有 4 个 section（生活照料、饮食照料、护理协助、健康监测），每节有若干 items
3. 院长保存模板 → `POST /api/daily-report-template` → 服务端自动 `regenerate_tasks_for_elders`
4. 护工端/院长端轮询 `GET /api/tasks` → 服务端检查当天任务数=0 时自动 `generate_tasks_for_date`
5. 任务按**楼层**分配给护工（服务端 `_resolve_caregiver_for_elder`：assignedCaregiverId 优先 → 同楼层轮转）
6. **前端不再生成本地任务** — `buildTasksFromConfiguration` 已废弃，`rebuildTasks` 已删除

### 护工日报提交流程

1. 护工填写日报 → `submitCaregiverDailyReport()` → `POST /api/care-records`
2. 院长端每 10 秒轮询 `/api/care-records`（所有 `director-*` 页面）
3. 院长在 `director-care-records` 收件箱中查看

### 人员管理 → 云端同步

1. 院长修改人员（add/update/delete elder/caregiver）→ 调用 `POST /api/elders` 或 `/api/caregivers`
2. **服务端自动 regenerate 受影响老人的任务** — 护工分配、任务时间、老人名等即时更新
3. `persistInstitutionSharedState()` 仍同步 `POST /api/institution-state`（兼容旧轮询）
4. 护工端通过 `refreshInstitutionSharedState()` 拉取新人员信息

### 临时任务

- 院长从方案页发布 → `submitDirectorDispatchDraft()` → `POST /api/tasks`
- 临时任务 source="temporary"，不受日报模板影响
- `rebuildTasks()` 会保留所有临时任务（不会被清掉）

### 数据隔离

- 所有接口必须带 `institutionId`（当前 `demo-qinghe-care`）
- 前端 `downloadDirectorCareReports` 已加 `institutionId`
- 后端 `list_care_records` 已加 `institutionId` 过滤
- `/api/elders` 已通过 `_get_elder_or_404()` 实现隔离

### 登录与账号系统

- 登录接口 `POST /api/auth/login` 支持可选 `institutionId`（为空时跨机构搜索用户名）
- `_loadCloudPersonnel()` 将云端 auth users 与本地 caregivers 按 `roleEntityId` 匹配合并，设置 `cloudUserId`/`username`/`cloudUserStatus`
- 本地 mockData 的 caregiver/elder 默认无 `cloudUserId`/`familyUserId`，首次云端同步后填充
- 人员管理页显示账号状态标签：`账号正常`(active)、`账号已禁用`(disabled)、`账号未同步`(无 cloudUserId)
- 新增护工/老人时，`saveDirectorPersonnelDraft` 自动调用 `createAuthUser` 创建云端账号

## 操作手册

### 云端服务器

```
地址: http://49.235.183.62
SSH:   ubuntu@49.235.183.62 (凭据见 .claude/server-credentials.md)
认证:  x-api-key: elder_safe_token_2026
管理后台: http://49.235.183.62/admin (admin / admin123)
健康检查: curl http://49.235.183.62/healthz
```

> **需要登录云服务器时**，先读取 `.claude/server-credentials.md` 获取 SSH 密钥路径和 sudo 密码。

### 启动虚拟手机 (Android Emulator)

```powershell
# 查看可用的 AVD
& "C:\Users\14110\AppData\Local\Android\Sdk\emulator\emulator" -list-avds

# 启动（当前只有一个）
& "C:\Users\14110\AppData\Local\Android\Sdk\emulator\emulator" -avd ElderServe_API34
```

模拟器信息：Pixel 6 / Android 14 (API 34) / x86_64 / 2GB RAM

### CDP 远程控制 WebView（自动登录/操作）

模拟器中的 WebView 支持 Chrome DevTools Protocol 远程调试，可用于自动填写表单、点击按钮、检测页面状态。

**WebView DevTools socket 命名规则**：`webview_devtools_remote_{PID}`（PID 是 WebView 进程 ID，每次启动变化，必须动态发现）。

#### 步骤 1：发现 socket 并转发

```powershell
# 查找 WebView DevTools socket（关键：动态 PID）
adb shell "cat /proc/net/unix | grep devtools"

# 输出示例：00000000: 00000002 00000000 ... @webview_devtools_remote_12345
# 记下 PID（如 12345），然后转发
adb forward tcp:9222 localabstract:webview_devtools_remote_12345
```

#### 步骤 2：用 CDP 脚本操作

```powershell
# 检测当前页面
python scripts/cdp_raw.py page

# 登录（默认用户名/密码，可指定）
python scripts/cdp_raw.py login testdirector test123456

# 登录指定账号
python scripts/cdp_raw.py login director01 test123456

# 执行任意 JS
python scripts/cdp_raw.py eval "document.title"

# 点击元素
python scripts/cdp_raw.py click ".login-form__submit"

# 填写输入框
python scripts/cdp_raw.py type "input[name='username']" myuser
```

`cdp_raw.py` 是纯标准库 WebSocket 客户端（无需额外依赖），通过 `Runtime.evaluate` 在 WebView 中执行 JS。`_discover_target()` 自动通过 `http://localhost:9222/json` 发现页面 target，无需硬编码 PID。

#### 登录流程原理

```
cdp_raw.py login <username> <password>
  → Runtime.evaluate: el.value=<username> on input[name='username']
  → Runtime.evaluate: el.value=<password> on input[name='password']
  → Runtime.evaluate: el.click() on .login-form__submit
  → sleep 3s → cdp_detect_page() 验证登录后的页面路由
```

### 构建和安装 APK

**每次 JS 代码修改后必须用 `clean assembleDebug`，不能用单独的 `assembleDebug`。**

> `syncWebAssets` 任务将 `caregiver-app/` 源文件复制到 `app/src/main/assets/app/`，Gradle 增量构建可能将其标记为 UP-TO-DATE 而不实际复制修改过的 JS 文件，导致 APK 包含过期代码。`clean` 强制重新打包。验证方法：如果 `assembleDebug` 全部 UP-TO-DATE 且 <1s 完成，说明 APK 未重新打包。

```powershell
# 强制完整构建
cd caregiver-android
.\gradlew.bat clean assembleDebug

# 安装到模拟器（先卸载再装）
adb uninstall com.elderserve.caregiver
adb install app\build\outputs\apk\debug\app-debug.apk

# 启动 APP
adb shell am start -n com.elderserve.caregiver/.MainActivity
```

### 发布 APK 到云端

**版本号单一来源**：版本号只在 `caregiver-android/gradle.properties` 中维护。`publish_apk.ps1` 会自动从中读取，无需手动传 `-VersionCode`/`-VersionName`（除非需要临时覆盖）。

#### 步骤 1：查询云端当前版本

```bash
curl -s -H "x-api-key: elder_safe_token_2026" \
  "http://49.235.183.62/api/app-releases/latest?platform=android&channel=stable&currentVersionCode=0"
```

#### 步骤 2：更新版本号并构建

编辑 `caregiver-android/gradle.properties`，递增 `appVersionCode` 和 `appVersionName`：

```
appVersionCode=40
appVersionName=4.0
```

然后构建：

```powershell
cd caregiver-android
.\gradlew.bat assembleDebug
```

#### 步骤 3：发布到云端

```powershell
.\scripts\publish_apk.ps1 `
  -BaseUrl $env:ELDER_CLOUD_BASE_URL `
  -ApiKey $env:ELDER_CLOUD_API_KEY `
  -ReleaseNotes "变更说明"
```

版本号自动从 `gradle.properties` 读取。如需手动覆盖：

```powershell
.\scripts\publish_apk.ps1 -VersionCode 30 -VersionName "3.0" -ReleaseNotes "..."
```

#### 步骤 4：安装到本地验证

```powershell
adb install -r caregiver-android\app\build\outputs\apk\debug\app-debug.apk
adb shell am start -n com.elderserve.caregiver/.MainActivity
```

#### 版本号规则

- `versionCode`：整数递增，不可回退
- `versionName`：语义化版本
- 同版本号重新发布会覆盖云端记录

#### 更新失败排查

| 症状 | 可能原因 | 检查方法 |
|------|---------|---------|--|
| "version is not newer" | gradle.properties 版本号未更新 | `adb shell dumpsys package` 对比云端 API |
| "sha256 mismatch" | 发布后云端文件未刷新 | 对比本地 SHA256 与 API 返回值 |
| "signature mismatch" | 签名密钥变更 | 检查 debug.keystore 是否被替换 |
| "apk path not allowed" | 服务端 apkPath 格式异常 | 检查 remote-main.py 的 `PUBLIC_BASE_URL` |

### Git

```powershell
& "C:\Program Files\Git\cmd\git.exe" status --short
& "C:\Program Files\Git\cmd\git.exe" log --oneline -5
```

### 测试云端 API

```bash
# 健康检查
curl -s http://49.235.183.62/healthz

# 查任务
curl -s -H "x-api-key: elder_safe_token_2026" \
  "http://49.235.183.62/api/tasks?institutionId=demo-qinghe-care&limit=5"

# 查机构快照
curl -s -H "x-api-key: elder_safe_token_2026" \
  "http://49.235.183.62/api/institution-state?institutionId=demo-qinghe-care"

# 查日报记录
curl -s -H "x-api-key: elder_safe_token_2026" \
  "http://49.235.183.62/api/care-records?institutionId=demo-qinghe-care&limit=5"

# 查最新 APP 版本
curl -s -H "x-api-key: elder_safe_token_2026" \
  "http://49.235.183.62/api/app-releases/latest?platform=android&channel=stable&currentVersionCode=0"
```

### 数据重新播种（慎用）

```bash
python scripts/seed_demo_institution.py
```

## 当前云端人员状态

### 机构：demo-qinghe-care (v4.0, versionCode=40)

| 楼层 | 护工 | 老人 | 护工登录账号 |
|------|------|------|-------------|
| 1F | 张建国 | 王大爷、李奶奶、张爷爷 | cg01 / test123456 |
| 2F | 李美兰 | 陈奶奶、赵大爷、胡奶奶 | cg02 / test123456 |
| 3F | 陈秀英 | 孙奶奶、刘大爷 | cg03 / test123456 |
| 4F | — | 何爷爷、黄奶奶 | — |
| 5F | 周桂芬 | 周爷爷、冯奶奶 | — |

- 院长账号：`testdirector` / `test123456`（云端 active）
- 旧账号（director01, caregiver01, zhangsan, Qq, wangxiaoming 等）已 disabled
- 周桂芬（caregiver-demo-04）暂无云端账号
- 所有老人暂无家属账号（familyUserId 为空）

## 已知问题 & 已修复

1. ~~`/api/elders` 数据隔离缺失~~ → 已加 `institution_id` + `_get_elder_or_404()`
2. ~~`/api/care-records` GET 缺少 institutionId 过滤~~ → 前后端都已加
3. ~~院长轮询只在 `director-care-records` 页面~~ → 扩展到所有 `director-*` 页面
4. ~~云端 `elderCarePlans` 空 items 覆盖本地数据~~ → 空时不覆盖
5. ~~人员变更后日报任务不上传 `/api/tasks`~~ → `saveDirectorPersonnelDraft` 等加了 `publishReportTemplateGeneratedTasks()`
6. 云端 `institution-state` 的 `elderCarePlans` items 为空 — 是种子脚本设计如此，日报任务由模板直接生成
7. ~~院长端页面每 10-12 秒跳动~~ → `applyInstitutionStateSnapshot` 所有字段加 JSON 对比，`refreshDirectorCloudTasks` 加签名对比，`refreshDirectorCloudReports` 不再 clear 改用合并。根因：两个端点返回日报数量不同（care-records 42 条 vs institution-state dailyReports 51 条），clear+refill 导致数组在两种状态间切换，每次触发 `notify()` → `app.innerHTML` 全量 DOM 重建。
8. ~~院长异常页缺少护工文字说明~~ → 两个根因：(a) `pages.css` 中 `.director-copy` 被 `display: none !important` 全局隐藏，异常卡片用了这个 class 渲染 note；(b) `buildTasksFromConfiguration` 重建任务时不保留 `exceptionNote`/`exceptionType`/`exceptionEvidence`/`exceptionReportedAt` 字段，`rebuildTasks()` 触发后立即丢失异常数据，需等下次云端轮询才能恢复。
9. ~~`settings.json` JSON 解析失败~~ → `C:\*` 中的 `\*` 是非法 JSON 转义序列，改成 `C:\\*`。
10. ~~院长总览页显示 0 位老人 / 人员页显示 0 护工 0 老人~~ → `buildDirectorOverview` 和 `renderDirectorPeoplePage` 加了 `familyUserId`/`cloudUserId` 过滤条件，但本地 mockData 中无人有云端账号，全部被过滤。修复：移除过滤，账号状态标签已足够指示云端同步状态。
11. ~~`upsert_published_task` 整体替换 raw_payload 导致结构字段丢失~~ → 护工标记异常后 `existing.raw_payload = payload` 把 schedule/title/elderName 等全清空。修复：合并非空值 `existing_raw = dict(existing.raw_payload or {}); for k,v in payload.items(): if v: existing_raw[k]=v`。
12. ~~`upsert_published_task` 显式列被空值覆盖~~ → Pydantic model_dump 对未传字段填充默认空字符串，`existing.schedule = normalize_text(request.schedule)` 把已有 schedule 覆盖成空。修复：所有显式列加 `if normalize_text(request.xxx):` 守卫。
13. ~~`task_to_dict` status 覆盖顺序错误~~ → `payload.update({"status": row.status})` 在 raw_payload 之后执行，raw_payload.status="risk" 被 row.status="pending" 覆盖。修复：先显式列，后 raw_payload 覆盖（非空值过滤）。
14. ~~异常页显示 6-7 条而非 2 条~~ → `buildDirectorExceptionReports` 遍历所有 `state.anomalies`，即使无匹配的 cloud risk task。修复：`if (!matchedTask) return;` 跳过孤立异常。

## 院长端轮询与渲染机制

### 三路并发轮询

| 轮询函数 | 间隔 | 云端接口 | 修改的状态 |
|---|---|---|---|
| `refreshDirectorCloudReports` | 10s | `GET /api/care-records` | `state.cloud.careReports`（合并，不去重，不清空） |
| `refreshDirectorCloudTasks` | 10s | `GET /api/tasks` | `state.tasks`（mergeCloudTask，签名对比后才 notify） |
| `refreshInstitutionSharedState` | 12s | `GET /api/institution-state` | `state.caregivers/elders/institution/dailyReportTemplate/elderCarePlans`（JSON 对比后才触发 rebuildTasks）+ `state.cloud.careReports`（后台合并，不触发 notify）+ `state.tasks`（temporaryTasks 合并，不触发 notify） |

### 渲染触发链

```
notify() → renderApp() → app.innerHTML = 新HTML → 全量DOM重建
```

`renderApp()` 用 `innerHTML` 整体替换页面，即使 HTML 完全一致也会导致浏览器重绘+重排。**任何不必要的 `notify()` 都会造成视觉跳动。** 当前已通过对比逻辑确保仅在数据实际变更时才 `notify()`。

### 实时时钟

时钟 (`data-live-clock`) 通过 `liveClockTimer` 每秒直接更新 DOM 节点 `textContent`，不经过 `notify()`/`renderApp()`，不影响页面其他部分。

## 服务端关键模式 — 修改前必须读

修改 `remote-main.py` 中的以下 3 个函数时，必须先读 `PROJECT_MAP.md` 第 11 节：

1. **`upsert_published_task`** (POST /api/tasks) — raw_payload **只能合并不能替换**，所有显式列**非空才覆盖**
2. **`task_to_dict`** (DB 行 → JSON) — **先显式列 → 后 raw_payload 覆盖**，raw_payload 空值过滤
3. **`generate_tasks_for_date`** (任务生成) — 按 `planItemId` upsert，不可删已有任务

**核心原则**：APP 发到 `/api/tasks` 的是**部分更新**，不是全量替换。任何用 Pydantic model 全量字段覆盖 DB 列的代码都会导致数据丢失。修改后用 curl 验证：创建→标记异常→查询→确认结构字段完整。
## Frontend Release Rule

After any frontend change under `caregiver-app/`, build, publish, and install the latest Android APK with:

```powershell
.\scripts\release_frontend_apk.ps1 -BaseUrl "http://49.235.183.62" -ApiKey "elder_safe_token_2026" -ReleaseNotes "frontend update"
```

This script increments `caregiver-android/gradle.properties`, runs `caregiver-android\gradlew.bat clean assembleDebug`, uploads the APK to the cloud release API, uninstalls the old emulator app, installs the new APK, and starts `com.elderserve.caregiver/.MainActivity`.
