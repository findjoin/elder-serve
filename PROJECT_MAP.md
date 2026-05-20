# 项目框架地图

> 理解这棵树的骨架，之后所有问题都能沿着分支快速定位。

## 目录索引

| 节 | 内容 | 用途 |
|----|------|------|
| [1](#1-框架骨架主干) | 5 核心模块（state / main / pages / cloudApi / mockData） | 理解整体架构 |
| [2](#2-功能分支挂在骨架上的积木) | 6 大功能组（院长总览 / 异常页 / 护工时间轴 / 日报 / 人员 / 其余） | 按功能定位代码 |
| [3](#3-问题定位索引按症状查找) | 6 类症状 → 检查顺序（不显示 / 数据错 / 跳动 / 同步失败 / 不一致 / CSS） | Bug 排查入口 |
| [4](#4-核心函数速查按模块) | 4 张速查表（渲染链 / 任务生命周期 / 云端同步 / 院长选择器） | 快速定位函数名和位置 |
| [5](#5-关键设计决策理解框架必须知道) | 8 个关键设计决策 | 理解为什么这样设计 |
| [6](#6-项目结构) | 文件路径 → 作用 | 找文件 |
| [7](#7-云端-api参考用) | 6 个 API 端点 | 后端接口 |
| [8](#8-ui-导航网络) | 完整导航图 + 28 路由索引 | UI 页面跳转关系 |
| [9](#9-构建命令) | 构建 / 安装 / 启动命令 | 操作参考 |
| [10](#10-未来规划) | 登录系统 / 机构管理 / 待规划功能 | 了解后续方向，避免重复设计 |
| [11](#11-回归防护清单) | 3 个关键模式 + 5 条修改检查清单 | 防止再次改坏系统 |
| [12](#12-功能-代码-云端对照) | APP 主要功能 → 前端代码 → 云端接口 → 后端实现 | 端到端定位业务闭环 |
| [13](#13-后端架构评估与优化清单) | 后端结构、性能/安全风险、可优化方向 | 改后端前评估影响 |
| [14](#14-高危架构规则索引) | 事实源、禁止反推、跨楼层分配、快照边界 | 修 Bug 前必读 |

---

## 14. 高危架构规则索引

> 本节和 `AGENTS.md` 是防止重复踩坑的入口。任何数据不一致 Bug，先按这里查事实源，再看页面。

### 14.1 事实源红线

| 问题 | 事实源 | 禁止做法 |
|------|--------|----------|
| 老人默认负责人 | `elders.assigned_caregiver_id` | 从 `published_tasks.caregiver_id` 反推 |
| 护工当天任务 | `published_tasks` 按 `caregiver_id + record_date` | 从 `caregivers.floor` 推断 |
| 护工常驻楼层 | `caregivers.floor` | 当成分配权限 |
| 人员列表 | `/api/caregivers`、`/api/elders`、`/api/auth/users` | 直接信任 `institution_states` 新增人员 |
| 异常事件 | `anomalies` | 把普通 `note` 当异常 |
| 库存数量 | `inventory_items.quantity` | 用快照或前端本地数量覆盖 |

### 14.2 护工跨楼层规则

- 护工可以负责多个楼层老人，也可以接收其它楼层特殊任务。
- `caregivers.floor` 只表示常驻/默认楼层，不能限制院长分配。
- `caregivers.floor` 不能把未分配老人自动兜底到护工任务中心；老人没有 `assignedCaregiverId` 时，日常任务必须保持未分配。
- 院长端楼层分配面板按本楼层老人 `assignedCaregiverId` 反推护工列表，不能只显示常驻本楼层护工。
- 院长端楼层分配面板必须显示“常驻本楼层护工 + 实际负责本楼层老人的跨楼层护工”的名片；没有负责房间的常驻护工也要显示，作为拖拽分配目标。
- 护工端房间列表按当天 `published_tasks` 聚合楼层和老人，不能只显示护工常驻楼层。
- 后端 `_resolve_caregiver_for_elder()` 必须只认显式负责人且允许跨楼层；未指定负责人返回空。

### 14.3 快照边界

- `institution_states` 是旧兼容快照，不是事实表。
- 快照空值不能覆盖 `elders.assigned_caregiver_id`、账号绑定、库存数量等事实字段。
- 保存快照必须过滤当前机构白名单，避免 demo 或其它机构数据污染。
- 拉人员必须走 `_loadCloudPersonnel()`，同时请求 `/api/caregivers`、`/api/elders`、`/api/auth/users`。

### 14.4 修 Bug 验证顺序

1. 查云端事实表 API。
2. 查前端 `state.js` 合并逻辑。
3. 查页面 selector，不直接看渲染 HTML 下结论。
4. 后端改动部署并确认 `elder.service active`。
5. 前端改动发布 APK 并确认虚拟手机安装版本。
6. 更新本文件对应章节，记录禁止再犯规则。

---

## 1. 框架骨架（主干）

```
APP 由 5 个核心模块构成，每个功能都是挂在这 5 个模块上的积木：

    state.js ────── 数据中心（数据 + 选择器 + 动作 + 同步）
       │
    main.js ─────── 渲染引擎 + 事件分发 + 轮询
       │
    pages/*.js ──── 页面渲染函数（纯 HTML 生成，只读 state）
       │
    cloudApi.js ─── HTTP 客户端（14 个接口函数，含用户管理）
       │
    mockData.js ─── 本地初始数据 + 辅助函数（任务生成已迁移到 remote-main.py 服务端）
```

**核心循环**：`用户操作 → action 修改 state → notify() → renderApp() → app.innerHTML = 新 HTML`

### 1.1 State 容器（state.js）

```
state
├── tasks[]              ← 所有任务（日常+临时+异常），核心数据集
├── elders[]             ← 老人信息（楼层、房间、护理方案绑定）
├── caregivers[]         ← 护工信息（楼层、班次、考勤）
├── careRecords[]        ← 护工日报记录
├── dailyReportTemplates ← 命名模板 map（key=template.id），支持多模板并存
├── dailyReportTemplate   ← 计算属性，返回第一个命名模板
├── inventory[]          ← 库存/物资
├── institution          ← 养老院基础信息
├── ui                   ← 弹窗、草稿、筛选、选中项（不持久化）
├── cloud                ← 云端加载状态、错误、拉取时间
└── session              ← 当前用户身份、登录状态
```

**关键机制**：
- `notify()` 是唯一渲染触发器，`_holdNotify=true` 时可以阻塞
- 选择器（selectors）是 state 的计算视图，每次渲染时实时计算，不缓存
- 动作（actions）是唯一修改 state 的入口

### 1.2 渲染引擎（main.js）

```
renderApp()                     ← 唯一渲染入口
├── 根据 state.ui.route 选择页面函数
├── 调用页面函数 → 得到 HTML 字符串
├── app.innerHTML = html        ← 全量 DOM 重建
└── 恢复滚动位置

renderBottomNav()               ← 底部导航栏
renderToast()                   ← Toast 提示
renderTaskRecordDialog()        ← 任务记录/异常弹窗
```

**28 条路由**全部指向页面渲染函数，无动态加载。

### 1.3 事件系统（main.js）

```
document.addEventListener("click", handleClick)    ← ~80 个 data-action 分支
document.addEventListener("input", handleInput)    ← 表单输入
document.addEventListener("change", handleChange)  ← select/checkbox
```

所有交互通过 `data-action="xxx"` 属性声明，事件代理在 document 层统一处理。

### 1.4 云端管道（cloudApi.js + state.js sync 函数）

```
上传：action → serializeCloudTask → uploadPublishedTask → POST /api/tasks
下载：poll → fetchPublishedTasks → GET /api/tasks → normalizeCloudTask → mergeCloudTask → notify()

三路并发轮询（仅数据变更时 notify）：
├── syncDirectorCloudPolling (10s)        — 院长端：care-records + tasks
├── syncCaregiverTaskPolling (10s)        — 护工端：自己的 tasks
└── syncInstitutionSharedStatePolling (12s) — 全局：人员/机构快照
```

合并策略：**Cloud-Last-Write-Wins**（`{...local, ...cloud}`）

### 1.5 任务引擎（remote-main.py 服务端）

```
generate_tasks_for_date(institution_id, record_date, db)
├── Phase 1: 遍历 elderCarePlans → 按护理方案生成 care plan 任务
├── Phase 2: 遍历 elders → 每人按 elder.reportTemplateId 查找 dailyReportTemplates → 生成 report template 任务
├── 匹配策略：planItemId 精确匹配（upsert 保留旧状态）
├── 护工分配：_resolve_caregiver_for_elder() — assignedCaregiverId 优先 → 同楼层轮转
└── 触发点：GET /api/tasks（当天无任务时自动生成）、POST /api/institution-state、POST /api/daily-report-template

任务状态：pending → completed / risk / refused
```

---

## 2. 功能分支（挂在骨架上的积木）

### 2.1 院长任务总览

```
挂载点：selectors.directorTaskOverview (state.js:4869)
├── 选择器：buildDirectorTaskOverview (state.js:1734)
│   ├── 计算 dailyTotal（当天全部日常任务数）
│   ├── 计算 expectedDue = countExpectedDueTasks(state.js:1116) → max(按时到期, 已处理)
│   ├── 计算 handledCount（已完成+异常+拒绝）
│   ├── 计算 expectedPercent = percentNumber(expectedDue, dailyTotal) (state.js:1129)
│   ├── 计算 actualPercent = percentNumber(handledCount, dailyTotal)
│   ├── 计算 temporaryHandled / temporaryTotal / temporaryPercent
│   └── 返回 { dailyTotal, expectedDue, handledCount, expectedPercent, actualPercent, temporaryHandled, temporaryTotal, temporaryPercent }
├── 渲染：renderDirectorHomePage (directorPage.js:3047) → renderDirectorTaskOverviewBars (directorPage.js:931)
│   └── 两层堆叠进度条（日常预期+日常完成）+ 独立临时任务进度条
├── 实时时钟：liveClockTimer (main.js:2166) 每秒更新 textContent，分钟变更时调用 tickClock() → notify()
└── 楼层卡片：renderFloorStatusRow — 每楼层护工+老人+任务状态
```

**进度百分比数据管道**（56%→57% 跳动调试入口）：

```
数据源                        计算层                         渲染层
  │                            │                              │
  ├─ state.tasks[] ──→ buildDirectorTaskOverview ──→ renderDirectorTaskOverviewBars
  │    │                  (state.js:1734)              (directorPage.js:931)
  │    │                        │
  │    ├─ 日常任务 (source≠temp)  ├─ expectedDue = countExpectedDueTasks(daily, now, handled)
  │    ├─ 临时任务 (id^temp-task-)├─ expectedPercent = percentNumber(expectedDue, dailyTotal)
  │    └─ 排序: sortTasksBySchedule └─ actualPercent = percentNumber(handledCount, dailyTotal)
  │              (state.js:1098)
  │
  ├─ 数据变更触发点（任一触发都可能导致百分比跳动）：
  │   ├─ 服务端 generate_tasks_for_date() — 任务由服务端统一生成（GET /api/tasks 自动触发）
  │   ├─ refreshDirectorCloudTasks (main.js:2102, 10s轮询)
  │   │   └─ mergeCloudTask (state.js:573) — Cloud-Last-Write-Wins
  │   │   └─ buildTaskSignature 对比后才 notify (state.js:3902)
  │   ├─ refreshDirectorCloudReports (main.js:2101, 10s轮询) — 合并 careReports
  │   ├─ refreshInstitutionSharedState (main.js:2169, 12s轮询) — 人员/模板快照
  │   │   └─ applyInstitutionStateSnapshot → 5 字段 JSON 对比（不再触发任务生成，由服务端负责）
  │   └─ tickClock() (state.js:1883) — 每分钟触发 notify()
  │
  └─ 已知不稳定点：
      ├─ applyInstitutionStateSnapshot 中 roomsByFloor 内数组未排序 → JSON 对比假阳性
```

### 2.2 院长异常页面

```
挂载点：selectors.directorExceptionReports
├── 选择器：buildDirectorExceptionReports (state.js:1808)
│   ├── 过滤：status=risk/refused 或 有 exceptionNote/exceptionEvidence
│   ├── 已读：state.ui.directorReadExceptionIds，只从未读列表移到已读箱
│   ├── 删除：state.ui.directorDeletedExceptionIds，从未读和已读两处隐藏
│   └── note 读取链：UI状态 → task.exceptionNote → task.exception → task.note → "未填写文字说明"
├── 渲染：renderDirectorAnomalyPage → renderDirectorExceptionReportCard (directorPage.js:1032)
│   ├── 标题行：房间·老人·任务名
│   ├── 元信息：护工名、时间
│   ├── 文字说明：.director-exception-report__note
│   └── 照片区：.director-exception-report__photos
└── 样式：pages.css .director-exception-report__*
```

### 2.3 护工时间轴

```
挂载点：state.tasks（按 caregiverId + date 筛选）
├── 渲染：renderTaskDetailPage → renderEmbeddedTaskTimeline (taskDetailPage.js:59)
│   ├── 状态颜色：completed=绿, risk/refused=红, pending=灰
│   ├── 时间线卡片：任务名、时间、状态标签
│   └── 操作按钮：完成、记录、异常
├── 动作：
│   ├── completeTask → status=toggle → syncCaregiverTaskToCloud
│   ├── openTaskRecordDialog → 弹窗输入 → saveTaskRecordDialog → task.records[]
│   └── openTaskExceptionDialog → 弹窗输入 → saveTaskExceptionDialog → task.exceptionNote/exceptionEvidence[]
└── 云端同步：syncCaregiverTaskToCloud → serializeCloudTask → POST /api/tasks
```

### 2.4 日报系统

```
挂载点：dailyReportTemplate + careRecords
├── 模板编辑（院长）：
│   ├── 4 个 section × N 个 item → 编辑 → saveDailyReportTemplateDraft
│   ├── 时间调整：renderReportTemplateSchedulePage (directorPage.js:1962)
│   │   → 拖拽设置每个 item 的 timeWindow → setDailyReportTemplateItemTime (state.js:3021)
│   ├── 人员分配：人员编辑弹窗中 <select reportTemplateId> (directorPage.js:3476)
│   │   → addElder (state.js:2727) / updateElder (state.js:2782) 保存到老人对象
│   ├── applyDailyReportTemplate → saveDailyReportTemplateDraft → POST /api/daily-report-template
│   │   → 服务端保存模板后自动 regenerate 受影响老人的任务
│   └── 任务上传由服务端自动完成，不再需要前端 publish
├── 日报填写（护工）：
│   ├── buildCaregiverDailyReportDraft → 根据模板生成草稿
│   ├── 填写 → saveCaregiverDailyReport → upsertDailyReport
│   └── submitCaregiverDailyReport → uploadCareRecord → POST /api/care-records
├── 日报收件箱（院长）：
│   ├── downloadDirectorCareReports → GET /api/care-records
│   ├── renderDirectorInboxCalendar → 日历视图
│   └── renderDirectorInboxDayDialog → 当天详情 + 导出
└── 导入：openDailyReportTemplateImport → fetchDailyReportTemplates → 选择模板
```

### 2.5 人员管理 + 云端账号体系

```
挂载点：state.caregivers + state.elders + UserTable（云端 users 表）
├── 操作：add/update/remove → POST /api/elders（或 caregivers）→ 服务端自动 regenerate 任务 → 前端拉取最新任务
├── 护工新增 → 自动创建云端账号（createAuthUser / POST /api/auth/users）
│   ├── caregiver.username / caregiver.cloudUserId / caregiver.cloudUserStatus 三字段关联
│   └── role_entity_id 桥接 caregiver.id ↔ UserTable.id
├── 护工删除 → 自动禁用云端账号（disableAuthUser / PUT /api/auth/users/{id}/disable）
├── 渲染：renderDirectorPeoplePage + renderPersonnelDraftDialog（含 username/password 字段）
│   └── 账号状态指示：绿色"账号正常" / 橙色"账号未同步" / 红色"账号已禁用"
└── 同步：事实表 users/caregivers/elders 优先；institution_states 只是旧兼容快照
         其他端轮询 → applyInstitutionStateSnapshot → 只合并当前机构事实表允许的人员
```

**人员隔离硬规则**：院长端人员列表不能把 `institution_states.personnelInfo.caregivers` 当事实源新增护工。登录后 `_loadCloudPersonnel()` 从 `/api/caregivers + /api/auth/users` 得到的 `role_entity_id` 是当前机构护工白名单；旧快照只能更新这些 id 的展示字段，不能合入 `caregiver-demo-*` 或其他养老院账号。保存快照时 `buildInstitutionStateSnapshot()` 也必须先过滤到当前白名单，避免把污染数据再次写回云端。

**开发者入口测试账号硬规则**：`loginPage.js` 的开发者入口账号必须和云端 `users.password_hash` 保持一致，不能只修改 `passwordHint` 或只改前端常量。测试养老院 `inst-001` 的 `cg02` 是李美兰（`role_entity_id=caregiver-02`），固定测试密码为 `test123456`；如登录失败，优先通过 `/api/auth/users/{id}/reset-password` 重置云端 hash 和 hint，而不是把入口密码改成漂移数据。

**后台层级视图**：`static/admin.html` 新增"层级视图"tab，按机构 → 院长/护工/家属树状展示用户状态。

### 2.6 其余功能（快速定位）

| 功能 | 选择器/数据 | 渲染函数 | 文件 |
|------|-----------|---------|------|
| 楼层状态详情 | `buildDirectorFloorCaregiverProgress` | `renderDirectorFloorDetailPage` | directorPage.js |
| 老人时间轴 | `selectors.directorSelectedTimeline` | `renderDirectorElderTimelinePage` | directorPage.js |
| 护工统计 | `buildDirectorCaregiverStatistics` | `renderDirectorStatisticsPage` | directorPage.js |
| 库存 | `state.inventory` | `renderDirectorInventoryPage` | directorPage.js |
| 临时任务 | `state.ui.directorTemporaryTaskDraft` | `renderDirectorDispatchDraftDialog` | directorPage.js |
| APP 更新 | `state.ui.appUpdate` | loginPage.js 弹窗 | main.js |
| 打卡 | `state.session.clockInStatus` | `renderAttendancePage` | attendancePage.js |
| 家属首页 | `selectors.familyElders` | `renderFamilyHomePage` | familyPage.js |
| 护理历史 | `state.history` | `renderHistoryPage` | historyPage.js |

---

## 3. 问题定位索引（按症状查找）

### 3.1 "XX 页面/元素不显示"

```
检查顺序：
  ① 渲染函数有没有生成这个 HTML？
     → 查该页面渲染函数，确认对应 DOM 是否存在
  ② CSS 是否隐藏了？
     → 搜索 .element-class 在 pages.css 中是否有 display:none
  ③ 数据源是否为 undefined/null/空数组？
     → 查渲染函数读取的 state/selector 字段
  ④ 条件渲染是否被跳过？
     → 查 if/?:/&& 条件，确认当前数据是否满足
```

### 3.2 "数据值不对 / 进度百分比异常"

```
检查顺序（按概率从高到低）：
  ① applyInstitutionStateSnapshot 是否假阳性触发？
     → 看控制台 [INST-CHANGE] / [STRUCTURE-CHANGED] / [REBUILD-TASKS] 日志
     → applyInstitutionStateSnapshot (state.js:668) 5 字段 JSON 对比是否假阳性
     → roomsByFloor 内数组未排序、Map 遍历顺序不稳定都可能触发
  ② 排序不一致导致百分比漂移？
     → 不同排序下 countExpectedDueTasks 的 handledCount 可能差 1
  ③ 云端轮询是否反复覆盖本地？
     → 看控制台 [CLOUD-TASKS] 日志
     → buildTaskSignature (state.js:3902) 计算签名是否漏掉变化字段
     → serializeCloudTask (state.js:512) 每次都生成新 updatedAt → 签名始终变化？
  ④ 选择器计算逻辑是否正确？
     → countExpectedDueTasks (state.js:1116): max(scheduledDue, handledCount)
     → percentNumber (state.js:1129): 分子/分母，total=0 返回 0
  ⑤ 数据来源是否正确？
     → 本地：查 cloud：服务端 generate_tasks_for_date 是唯一数据源
```

### 3.2a "预期进度不随时间增长"

```
检查顺序：
  ① tickClock 是否在运行？
     → 控制台查看，或检查 liveClockTimer (main.js:2166)
  ② updateLiveClockNodes (main.js:2139) 是否在分钟变更时调 tickClock？
     → lastClockMinute 变量追踪
  ③ countExpectedDueTasks 的 nowLimit 参数是否随分钟更新？
     → currentClockMinutes() 返回当前时分，随 tickClock→notify→rebuildOverview 更新
```

### 3.3 "页面每 10-12 秒跳动"

```
检查顺序：
  ① 哪个轮询在触发 notify()？
     → refreshDirectorCloudTasks (10s)
     → refreshDirectorCloudReports (10s)
     → refreshInstitutionSharedState (12s)
  ② 对比逻辑是否失效？
     → 签名对比：buildTaskSignature 是否覆盖了变化字段？
     → JSON 对比：applyInstitutionStateSnapshot 是否无变化也 change=true？
  ③ 是否有非轮询代码在调用 notify()？
     → 搜索 state.js 中所有 notify() 调用点（~152 处）
```

### 3.4 "操作后数据没同步到云端"

```
检查顺序：
  ① action 是否调用了 sync 函数？
     → 查对应 action，确认末尾有 syncXxxToCloud 或 uploadXxx
  ② 云端接口是否返回错误？
     → 检查 state.cloud.xxxError 字段
  ③ API 配置是否存在？
     → isCloudSyncConfigured() → 检查 baseUrl 和 apiKey
  ④ 后端是否收到请求？
     → curl 直接测试对应接口
```

### 3.5 "护工端和院长端数据不一致"

```
检查顺序：
  ① 护工端是否成功上传？
     → 检查 syncCaregiverTaskToCloud 返回值 + state.cloud.tasksError
  ② 院长端轮询是否拉取到？
     → GET /api/tasks?caregiverId=xxx 返回的任务是否匹配？（服务端过滤）
  ③ 合并逻辑是否正确？
     → mergeCloudTask 是否覆盖了本地修改？
  ④ 服务端 generate_tasks_for_date 是否正确赋值 caregiverId？
```

### 3.6 "CSS 样式不生效"

```
检查顺序：
  ① 是否有 !important 覆盖？
     → 搜索 pages.css 中 display:none !important 的全局隐藏规则
  ② 选择器优先级是否正确？
  ③ class 名是否拼写错误？
```

---

## 4. 核心函数速查（按模块）

### 4.1 渲染触发链

| 函数 | 位置 | 作用 |
|------|------|------|
| `notify()` | state.js:44 | 唯一渲染触发器，`_holdNotify` 时跳过 |
| `renderApp()` | main.js:1451 | 全量 DOM 重建 |
| `_holdNotify` | state.js:45 | 阻塞渲染标志 |

### 4.2 任务生命周期

| 函数 | 位置 | 作用 |
|------|------|------|
| `generate_tasks_for_date` | remote-main.py | 服务端任务生成（两阶段：方案+模板），GET /api/tasks 自动触发 |
| `isTemporaryTask` | state.js:1121 | 判断是否临时任务（id 以 temp-task- 开头） |
| `sortTasksBySchedule` | state.js:1098 | 按 schedule→id 排序（id tiebreak 保证确定性） |
| `completeTask` | state.js:2460 | 打卡完成/取消 |
| `markTaskException` | state.js:2497 | 快速标记异常（硬编码文案） |
| `saveTaskRecordDialog` | state.js:2365 | 弹窗保存记录/异常（用户输入） |
| `refreshDirectorOverview` | state.js:1411 | 重算 directorTaskOverview（含进度百分比） |

### 4.3 云端同步

| 函数 | 位置 | 作用 |
|------|------|------|
| `serializeCloudTask` | state.js:512 | 本地→云端格式（每次生成新 updatedAt） |
| `normalizeCloudTask` | state.js:536 | 云端→本地格式 |
| `mergeCloudTask` | state.js:573 | Cloud-Last-Write-Wins 合并（云端覆盖本地同名字段） |
| `buildTaskSignature` | state.js:3902 (director) / 3968 (caregiver) | 任务集合签名 = JSON([id,status,exception...]) |
| `applyInstitutionStateSnapshot` | state.js:668 | 5 字段 JSON 对比（不再调 rebuildTasks）|
| `syncDirectorCloudPolling` | main.js:2079 | 院长端 10s 轮询（tasks + care-records） |
| `syncCaregiverTaskPolling` | main.js:2107 | 护工端 10s 轮询（自己的 tasks） |
| `syncInstitutionSharedStatePolling` | main.js:2169 | 12s 全局轮询（人员/机构快照） |

### 4.4 服务端核心函数（remote-main.py）

| 函数 | 作用 | 关键细节 |
|------|------|---------|
| `generate_tasks_for_date` | 两阶段任务生成（方案+模板） | 按 planItemId upsert，保留已有状态 |
| `task_to_dict(row)` | DB 行 → API JSON | **先显式列，后 raw_payload 覆盖**（非空值才覆盖） |
| `upsert_published_task` | POST /api/tasks 处理 | **合并 raw_payload**（不替换），显式列非空才写 |
| `list_published_tasks` | GET /api/tasks 查询 | 当天任务数=0 时自动触发生成 |
| `_resolve_caregiver_for_elder` | 护工分配 | assignedCaregiverId 优先 → 同楼层过滤 → 轮转 |

### 4.5 院长选择器 & 渲染链

| 函数 | 位置 | 输出 |
|------|------|------|
| `buildDirectorTaskOverview` | state.js:1734 | 任务总览进度（expectedPercent, actualPercent, temporaryPercent） |
| `countExpectedDueTasks` | state.js:1116 | 到期任务数 = max(按时到期, 已处理) |
| `percentNumber` | state.js:1129 | 百分比计算，total=0 返回 0 |
| `currentClockMinutes` | state.js:1111 | 当前时分（HH:MM），用于判断任务是否到期 |
| `buildDirectorExceptionReports` | state.js:1827 | 异常报告列表 |
| `buildDirectorFloorCaregiverProgress` | state.js:~1777 | 楼层护工执行率 |
| `buildDirectorCaregiverStatistics` | state.js:~1742 | 护工统计排行 |
| `renderDirectorTaskOverviewBars` | directorPage.js:931 | 进度条 HTML（2层日常 + 独立临时） |
| `renderDirectorHomePage` | directorPage.js:3047 | 院长首页（含任务总览 + 楼层卡片 + 时钟） |
| `tickClock` | state.js:1883 | 每分钟触发 notify()，更新预期进度 |
| `updateLiveClockNodes` | main.js:2139 | 每秒更新时钟 textContent，分钟变更调 tickClock |
| `renderApp` | main.js:1451 | 全量 DOM 重建入口 |
| `handleClick` | main.js:1481 | 事件代理（~80 个 data-action 分支） |

---

## 5. 关键设计决策（理解框架必须知道）

1. **innerHTML 全量渲染** — 没有虚拟 DOM，`notify()` 就是整页刷新。性能靠减少 notify 次数保证
2. **`_holdNotify` 批处理** — 多个数据加载完成前阻塞渲染，最后一次性显示
3. **Cloud-Last-Write-Wins** — 云端数据直接覆盖本地同名字段，无冲突解决
4. **planItemId 匹配** — 任务身份标识，跨 rebuild 保持任务状态
5. **fallback 匹配** — `elderId|title|schedule` 兜底，模板变更后仍能保留状态
6. **临时任务隔离** — `temp-task-` 前缀 ID，服务端任务生成时保留，不受模板影响
7. **轮询仅变更通知** — 签名对比/JSON 对比，数据未变不触发 DOM 重建
8. **实时时钟绕过渲染** — 每秒直接操作 DOM textContent，分钟变更才触发 notify 更新进度
9. **sortTasksBySchedule id tiebreak** — schedule 相同时按 id 排序，保证任务列表确定性
10. **进度百分比 = max(时间到期, 已处理)** — expectedDue 取 scheduledDue 和 handledCount 的较大值，确保已处理的不会因时间未到而"缩水"
11. **命名模板架构** — 院长可从基础模板导入 → 编辑 → 命名保存为命名模板（`dailyReportTemplates` map）。每位老人只需选择所用命名模板（`elder.reportTemplateId`），任务按老人各自模板生成。模板编辑器中新建模板时弹出命名对话框，编辑已有模板则直接保存。

---

## 6. 项目结构

| 路径 | 作用 |
|------|------|
| `caregiver-app/src/main.js` | 路由、事件、轮询、弹窗、渲染入口 |
| `caregiver-app/src/store/state.js` | 数据、选择器、动作、云端同步 |
| `caregiver-app/src/data/mockData.js` | 本地初始数据 + 任务生成引擎 |
| `caregiver-app/src/pages/directorPage.js` | 院长端所有页面（待拆分） |
| `caregiver-app/src/pages/taskDetailPage.js` | 护工时间轴 |
| `caregiver-app/src/pages/*.js` | 其余页面渲染函数 |
| `caregiver-app/src/utils/cloudApi.js` | 云端 HTTP 客户端 |
| `caregiver-app/src/styles/pages.css` | 页面样式 |
| `caregiver-android/` | Android WebView 壳 |
| `remote-main.py` | FastAPI 后端 |

---

## 7. 云端 API（参考用）

| 端点 | 方法 | 用途 |
|------|------|------|
| `/api/tasks` | GET/POST | 任务发布与查询 |
| `/api/care-records` | GET/POST | 日报记录 |
| `/api/daily-report-template` | GET/POST | 日报模板 |
| `/api/daily-report-templates` | GET | 模板列表（导入用） |
| `/api/institution-state` | GET/POST | 机构共享快照 |
| `/api/app-releases/latest` | GET | APP 更新检查 |
| `/api/auth/login` | POST | 用户登录，返回 session token (x-api-key 或 Bearer) |
| `/api/auth/logout` | POST | 退出登录，revoke session (Bearer) |
| `/api/auth/me` | GET | 获取当前用户信息 (Bearer) |
| `/api/auth/users` | GET/POST | 院长管理本机构用户 (Bearer, director) |
| `/api/auth/users/<id>/reset-password` | POST | 院长重置用户密码 (Bearer, director) |
| `/api/auth/users/<id>/disable` | PUT | 院长禁用/启用用户 (Bearer, director) |
| `/api/admin/login` | POST | 超管登录 |
| `/api/admin/institutions` | GET/POST | 超管机构管理 |
| `/api/admin/institutions/<id>/quota` | PUT | 超管修改机构容量配额 |
| `/api/admin/institutions/<id>/suspend` | PUT | 超管暂停/恢复机构 |
| `/api/admin/institutions/<id>/users` | GET/POST | 超管为任意机构管理用户 |
| `/api/admin/institutions/<id>/users/<uid>/reset-password` | POST | 超管重置用户密码 |
| `/api/admin/institutions/<id>/users/<uid>/disable` | PUT | 超管禁用/启用用户 |
| `/api/admin/stats` | GET | 超管全局统计（机构数/用户数/老人数/存储） |
| `/api/admin/elders` | GET | 超管查看所有老人档案 |
| `/api/admin/report-templates` | GET | 超管查看所有日报模板 |
| `/api/admin/care-records` | GET | 超管查看所有护理记录 |
| `/api/admin/published-tasks` | GET | 超管查看所有任务记录 |
| `/api/admin/sessions` | GET/DELETE | 超管查看/踢出在线会话 |
| `/api/admin/app-releases` | GET | 超管查看 APP 发布历史 |
| `/api/admin/tables` | GET | 超管查看所有白名单事实表、字段和行数 |
| `/api/admin/tables/{table_name}` | GET | 超管只读浏览单表完整字段，支持机构过滤/搜索/分页，敏感字段脱敏 |

**Auth 双通道**：`get_current_user` 中间件优先检查 `Authorization: Bearer <token>` → 回退 `x-api-key`。无效 Bearer 直接 401 不回退。新增 4 张表：`users`、`sessions`、`institutions`、`admins`。

**Web 管理后台**：`http://49.235.183.62/admin` — 独立 Web 页面（static/admin.html），超管登录后可查看业务 Tab，并通过“数据库总览”只读浏览后端白名单内全部 ORM 表。该入口是自上而下调试的云端事实核查入口，不允许写入，不暴露原始密码哈希和完整会话 token。

**数据库总览显示规则**：`static/admin.html` 的 `RAW_TABLE_LABELS` 负责把后端英文表名显示为中文业务名；`<option value>` 必须继续保留英文表名用于 `/api/admin/tables/{table_name}` 查询，不能把接口参数也改成中文。

**机构主表一致性规则**：`institutions.id` 是机构存在的事实源。`users/caregivers/elders/published_tasks` 等业务表出现的 `institution_id` 必须在 `institutions` 有对应行；当前调试只保留 `inst-001 = 福乐镇智慧养老院`。后端启动时只补齐 `DEFAULT_INSTITUTIONS` 里的当前调试机构并删除空 ID 机构，禁止再次出现“业务表有 inst-001，但机构列表没有”的孤儿机构引用，也禁止自动恢复旧 demo 机构。

**数据库总览机构筛选规则**：`static/admin.html` 的“数据库总览”必须用独立状态 `S.rawInstitutionId` 保存机构筛选，并在请求 `/api/admin/tables/{table_name}` 时写入 `institutionId` 参数。不能只改变下拉框文本或复用其它 Tab 的机构 selector，否则会出现下拉选择福乐镇但表格仍显示青禾数据。

**日报模板后台展示规则**：超管“数据库总览 -> 日报模板”不能只显示 `template` JSON。`static/admin.html` 必须解析 `daily_report_templates.template.sections[].items[]`，列表展示模板类型、栏目数、子项数，详情展示“栏目/子项/时间窗口/频率/是否拍照”的表格。基础模板和实例模板用 `daily_report_templates.template.templateType` 显式区分：`base` 是可复用导入来源，`instance` 是院长导入基础模板后调整时间/频率生成的实际配置。禁止再用 `source=demo-seed` 或标题猜测模板类型。

**任务记录后台展示规则**：`published_tasks` 在超管“数据库总览”里必须显示为“任务记录”，概念上是每日任务实例/执行记录表，不是“发布任务配置表”。业务口径是“每天每个老人只有一张任务表”：`record_date + elder_id` 是后台任务表索引，护工只是表内任务行的负责/操作人，不是任务表归属主体。后台第一层必须按“日期 + 老人”汇总成老人当天的每日任务表，并只显示“老人每日任务表 1 张/共 N 张每日任务表”的索引口径；不能按护工拆表，也不能在第一层显示每张表有多少小任务、完成多少、待完成多少。点开后再以表格列出该老人当天的任务名称、操作护工、状态、文字记录、图片记录和来源。临时任务也必须作为该老人当天表内的一行插入，不能另起一张护工任务表。`static/admin.html` 必须提供日期输入框，向 `/api/admin/tables/published_tasks` 传 `recordDate` 参数；`remote-main.py admin_read_table()` 必须按 `record_date` 精确过滤。不能把几百条任务逐条铺成默认列表，也不能把 `raw_payload` JSON 作为默认视图；必须显示 `caregiver_name/default_caregiver_name`，用于判断任务行由谁负责或操作。

**数据库总览加载竞争规则**：`static/admin.html loadRawData()` 必须用 `S.rawLoadSeq` 标记当前请求，后发请求覆盖先发请求，旧请求返回时必须丢弃。否则进入“数据库总览”时默认表请求和用户/状态选择的任务记录请求并发，旧的机构表响应可能晚返回并覆盖任务记录页面，表现为下拉框是“任务记录”，表头却停在“养老院机构/正在按机构筛选”。进入数据库总览时默认优先加载 `published_tasks`，避免先渲染机构表再切换造成视觉卡顿。

**数据库总览大字段规则**：`/api/admin/tables/published_tasks` 不能把完整 `raw_payload` 和图片 base64 返回给列表页。`remote-main.py _admin_row_to_dict()` 对 `PublishedTaskTable.raw_payload` 必须改成摘要：保留 `recordNote/exceptionNote/exceptionType/completedAt/timeWindow`、图片数量和去掉 `dataUrl/base64/content/bytes` 后的证据链接摘要。否则 300 多条任务会因为图片证据膨胀到 10MB 级 JSON，表现为后台“任务记录”进入很慢。完整图片内容应通过业务文件链接或专门详情接口按需读取，不能由数据库总览列表全量拉取。

**任务图片按需查看规则**：超管“任务记录”表格只显示“图片 N/有图片”状态，不在列表加载图片内容。点击图片按钮时，`static/admin.html` 调用 `GET /api/admin/task-records/{task_id}/evidence`，后端只返回该单条任务的 `recordEvidence/exceptionEvidence` 完整图片数据并在弹窗展示。禁止为了图片预览把 `published_tasks.raw_payload` 的 base64 重新塞回 `/api/admin/tables/published_tasks` 列表接口。

**任务图片点击事件规则**：`raw-task-evidence` 按钮会出现在两处：数据库总览表格 `#rawDataTable` 和“查看日报任务表”弹窗 `#rawDetailTableContent`。两处都必须绑定事件委托并调用同一个 `openTaskEvidence(taskId)`。不能只监听外层表格，否则弹窗内的“图片 N”点击没有反应。

**任务图片大图规则**：任务图片弹窗内的缩略图卡片必须可点击，事件委托仍放在 `#rawDetailTableContent`。点击 `raw-evidence-preview` 后用 `renderLargeEvidenceImage()` 在同一弹窗显示大图，并保留 `S.rawEvidenceDetailHtml` 用于“返回图片列表”。不要新开全量图片列表接口，也不要在任务记录列表阶段预加载大图。

---

## 8. UI 导航网络

> 28 条路由 = 28 个节点。边 = `data-action="navigate"` | `data-action="..." → state.ui.route = "..."` | 底部 Tab。
> 箭头方向 = 从 → 到，标注 `[触发方式] 代码位置`。

### 8.1 身份入口（Login → 3 种身份 + 开发者）

```
                ┌── enter-caregiver ──→ attendance (打卡)
                │    [data-action] loginPage.js:147 → state.js:2027
                │
  login ────────┼── dev-enter-caregiver ──→ home (跳过打卡)
                │    [data-action] loginPage.js:156 → state.js:4373
                │
                ├── enter-family ──→ family-home
                │    [data-action] loginPage.js:162 → state.js:2038
                │
                └── enter-director ──→ director-home
                     [data-action] loginPage.js:171 → state.js:2048
```

### 8.2 护工端导航图（caregiver）

```
                              ┌──── 底部 Tab ────┐
                              │ home  history profile │
                              └──────────────────┘

  attendance ──[clock-in]──→ home ──[choose-floor]──→ room-select ──[choose-room]──→ elder-detail
  (state.js:2071)             │    homePage.js:48        roomSelectPage.js:24          state.js:2129
                              │    → state.js:2123
                              │
                              ├──[select-task]──→ task-detail
                              │   taskCenterPage.js:27 → state.js:2192
                              │
                              └──[底部 tab: history]──→ history ──[select-history]──→ history-detail
                              │                           historyPage.js:69 → state.js:2561
                              │
                              └──[底部 tab: profile]──→ profile
                                                            ├──[navigate→history] profilePage.js:13
                                                            └──[logout] → login  state.js:2081

  elder-detail
    ├──[focus-task]──→ task-detail          elderDetailPage.js (embedded timeline)
    │                 state.js:2192
    ├──[open-daily-report]──→ caregiver-daily-report   state.js:2140
    ├──[open-batch-exception-review]──→ room-select   state.js:2171
    └──[open-caregiver-timeline-fullscreen] ──→ (全屏 timeline, 同页 overlay)

  task-detail
    ├──[focus-task]──→ task-detail (切换任务)  taskDetailPage.js:83 → state.js:2192
    ├──[complete-task] ──→ (action, 同页)       state.js:2460
    ├──[open-task-record] ──→ (弹窗, 同页)      state.js:2365
    └──[open-task-exception / mark-risk / mark-refused] ──→ (弹窗, 同页)

  caregiver-daily-report
    ├──[save-daily-report] ──→ (action, 同页)
    └──[submit-daily-report] ──→ POST /api/care-records (同页)
```

### 8.3 院长端导航图（director）

```
                              ┌──────── 底部 Tab ────────┐
                              │ director-home  director-care-plans
                              │ director-people  director-profile │
                              └────────────────────────────┘

  director-home ─────────────────────────────────────────────────────────────────
    │                                                                             │
    ├──[select-director-floor]──→ director-floor-detail                          │
    │   directorPage.js:1077 → state.js:2568                                     │
    │                                                                             │
    ├──[navigate→director-anomaly] support shortcut  directorPage.js:3086        │
    ├──[navigate→director-inventory] support shortcut  directorPage.js:3087      │
    ├──[navigate→director-care-records] support shortcut  directorPage.js:3088   │
    │                                                                             │
    └──[底部 tab: director-care-plans]──→ director-care-plans                    │
    └──[底部 tab: director-people]──→ director-people                            │
    └──[底部 tab: director-profile]──→ director-profile                          │

  director-floor-detail ──────────────────────────────────────────────────────────
    │
    ├──[select-director-elder]──→ director-elder-timeline
    │   directorPage.js:80,191 → state.js:3599
    │
    └──[select-director-stat-caregiver]──→ (展开护工统计卡片, 同页)

  director-elder-timeline ────────────────────────────────────────────────────────
    └── (查看老人时间轴, 无下级跳转)

  director-statistics ────────────────────────────────────────────────────────────
    │
    ├──[navigate→director-anomaly]  directorPage.js:3962
    │
    └──[select-director-stat-caregiver]──→ (展开护工详情, 同页)

  director-anomaly ───────────────────────────────────────────────────────────────
    │
    ├──[mark-exception-read]──→ (标记已读, 同页)
    └──[navigate→director-read-inbox]──→ (信封按钮, header)  directorPage.js:3980

  director-read-inbox ────────────────────────────────────────────────────────────
    │
    ├──[restore-read-exception]──→ (还原到未读, 同页)
    ├──[delete-read-exception]──→ (删除, 同页)
    ├──[delete-all-read-exceptions]──→ (全部删除, 同页)
    └──[navigate→director-anomaly]──→ (返回按钮, header)

  director-care-plans ────────────────────────────────────────────────────────────
    │
    ├──[select-director-plan-floor]──→ (切换楼层筛选, 同页)
    ├──[select-director-plan-room]──→ (展开老人时间轴侧边栏, 同页)
    ├──[open-plan-draft]──→ (进入方案编辑层, 同页)      main.js:1900
    ├──[open-plan-note-draft]──→ (备注弹窗, 同页)
    ├──[open-director-plan-temporary-dialog]──→ (临时任务弹窗, 同页)
    ├──[assign-task / clear-task-assignment]──→ (action, 同页)
    └──[open-director-temporary-task]──→ (发布临时任务, 同页 header 按钮)

  director-people ────────────────────────────────────────────────────────────────
    │
    ├──[navigate→director-statistics]  directorPage.js:3048
    ├──[open-personnel-draft]──→ (新建人员弹窗, 同页)
    ├──[open-personnel-edit]──→ (编辑人员弹窗, 同页)
    ├──[open-personnel-elder-detail]──→ (老人方案详情弹窗, 同页)
    │   directorPage.js:3599 → state.js:2851
    ├──[toggle-personnel-card]──→ (展开/折叠卡片, 同页)
    └──[remove-caregiver / remove-elder]──→ (删除确认, 同页)

  director-assignments ───────────────────────────────────────────────────────────
    │   三个核心入口 (renderCoreEntry):
    ├──[navigate→director-template-library]  directorPage.js:3120
    ├──[navigate→director-care-plans]        directorPage.js:3121
    └──[navigate→director-dispatch]          directorPage.js:3122

  director-template-library ──────────────────────────────────────────────────────
    │
    ├──[create-template]──→ (新建模板, 同页)
    └──[open-template-draft]──→ (打开已有模板编辑, 同页)

  director-care-records ──────────────────────────────────────────────────────────
    │   日报收件箱 + 模板编辑器
    ├──[open-report-template-editor]──→ (日报模板编辑器, 同页)
    │   directorPage.js:2655,2693,2706 → main.js:1679
    ├──[open-report-template-import]──→ (导入模板弹窗, 同页)
    │   directorPage.js:2353 → main.js:1683
    ├──[open-report-template-schedule]──→ (任务时间调度器, 同页)
    │   directorPage.js:2134 → main.js:1687
    ├──[open-director-inbox-day]──→ (当天日报详情弹窗, 同页)
    │   directorPage.js:380 → main.js:1659
    ├──[generate-care-record-preview]──→ (预览归档表, 同页)
    ├──[print-care-record / export-care-record-image]──→ (导出, 同页)
    └──[export-director-inbox-excel]──→ (导出 CSV, 同页)

  director-dispatch ──────────────────────────────────────────────────────────────
    │
    ├──[open-director-dispatch-draft]──→ (临时任务草稿弹窗, 同页)
    └──[open-director-temporary-task]──→ (发布临时任务, 同页 header)

  director-inventory ─────────────────────────────────────────────────────────────
    └── (库存管理, 无下级跳转)

  director-profile ───────────────────────────────────────────────────────────────
    └──[logout]──→ login   state.js:2081/4444
```

### 8.4 家属端导航图（family）

```
                              ┌────────── 底部 Tab ──────────┐
                              │ family-home  family-health    │
                              │ family-messages  family-profile │
                              └──────────────────────────────┘

  family-home
    ├──[navigate→family-profile]   familyPage.js:49
    └──[navigate→family-messages]  familyPage.js:103,149,155

  family-profile
    ├──[navigate→family-health]    familyPage.js:294
    ├──[navigate→family-messages]  familyPage.js:301
    └──[logout]──→ login           familyPage.js:308 → state.js:2081

  family-health + family-messages
    └── (无下级跳转)
```

### 8.5 跨身份通用路径

```
 所有身份:
   profile / director-profile ──[logout]──→ login
   任何页面 ──[app-back]──→ 浏览器回退或 fallback route   main.js:685

 弹窗/对话框（不改变路由，叠加在页面上）:
   taskRecordDialog, taskExceptionDialog, quickExceptionDialog
   directorPersonnelDraft, directorDispatchDraft, directorPlanTemporaryDialog
   dailyReportTemplateEditor, reportTemplateImport, reportTemplateSchedule
   directorInboxDay, directorCareRecordPreview
   batchPanel, batchExceptionPrompt
   appInfoDialog, appUpdateDialog
   loginMenu
```

### 8.6 导航实现方式速查

| 方式 | 代码模式 | 示例 |
|------|---------|------|
| HTML 声明式 | `data-action="navigate" data-route="xxx"` | 底部 Tab、核心入口卡、support shortcut |
| HTML 专用 action | `data-action="select-director-floor" data-value="1F"` | 楼层行、人员行、任务卡片 |
| JS 程序式 | `state.ui.route = "xxx"; notify()` | 打卡后跳转、登录后跳转 |
| JS 动作包装 | `actions.navigate(route)` | 底部 Tab 点击、app-back fallback |
| 浏览器回退 | `window.history.back()` | `goBackOrNavigate()` main.js:685 |

### 8.7 28 路由完整索引

| route | 渲染函数 | 文件 | 底部 Tab |
|-------|---------|------|---------|
| `login` | `renderLoginPage` | loginPage.js | — |
| `attendance` | `renderAttendancePage` | attendancePage.js | — |
| `home` | `renderHomePage` | homePage.js | caregiver |
| `room-select` | `renderRoomSelectPage` | roomSelectPage.js | — |
| `elder-detail` | `renderElderDetailPage` | elderDetailPage.js | — |
| `caregiver-daily-report` | `renderCaregiverDailyReportPage` | caregiverDailyReportPage.js | — |
| `tasks` | `renderHomePage` | homePage.js | — |
| `task-detail` | `renderTaskDetailPage` | taskDetailPage.js | — |
| `history` | `renderHistoryPage` | historyPage.js | caregiver |
| `history-detail` | `renderHistoryDetailPage` | historyDetailPage.js | — |
| `profile` | `renderProfilePage` | profilePage.js | caregiver |
| `family-home` | `renderFamilyHomePage` | familyPage.js | family |
| `family-health` | `renderFamilyHealthPage` | familyPage.js | family |
| `family-messages` | `renderFamilyMessagesPage` | familyPage.js | family |
| `family-profile` | `renderFamilyProfilePage` | familyPage.js | family |
| `director-home` | `renderDirectorHomePage` | directorPage.js | director |
| `director-floor-detail` | `renderDirectorFloorDetailPage` | directorPage.js | — |
| `director-caregiver` | `renderDirectorCaregiverPage` | directorPage.js | — |
| `director-assignments` | `renderDirectorAssignmentsPage` | directorPage.js | — |
| `director-template-library` | `renderDirectorTemplateLibraryPage` | directorPage.js | — |
| `director-care-plans` | `renderDirectorCarePlansPage` | directorPage.js | director |
| `director-care-records` | `renderDirectorCareRecordsPage` | directorPage.js | — |
| `director-dispatch` | `renderDirectorDispatchPage` | directorPage.js | — |
| `director-inventory` | `renderDirectorInventoryPage` | directorPage.js | — |
| `director-people` | `renderDirectorPeoplePage` | directorPage.js | director |
| `director-profile` | `renderDirectorProfilePage` | directorPage.js | director |
| `director-anomaly` | `renderDirectorAnomalyPage` | directorPage.js | — |
| `director-read-inbox` | `renderDirectorReadInboxPage` | directorPage.js | — |
| `director-statistics` | `renderDirectorStatisticsPage` | directorPage.js | — |
| `director-elder-timeline` | `renderDirectorElderTimelinePage` | directorPage.js | — |

---

## 9. 构建命令

### 强制完整构建（每次 JS 代码修改后必须执行）

```powershell
cd caregiver-android
.\gradlew.bat clean assembleDebug
adb uninstall com.elderserve.caregiver
adb install app\build\outputs\apk\debug\app-debug.apk
adb shell am start -n com.elderserve.caregiver/.MainActivity
```

> **必须用 `clean assembleDebug`，不能只用 `assembleDebug`。**
>
> `syncWebAssets` 任务将 `caregiver-app/` 源文件复制到 `app/src/main/assets/app/`。Gradle 增量构建可能将 `syncWebAssets` 标记为 UP-TO-DATE 而不实际复制修改过的 JS 文件。`clean` 删除 build 目录后会强制 `mergeDebugAssets` 重新执行，确保 APK 包含最新 Web 资产。
>
> **验证方法：** 如果 `assembleDebug` 全部 UP-TO-DATE 且 `<1s` 完成，说明 APK 未重新打包，修改后的代码未包含在内。

### 快速重新同步（仅刷新 Web 资产，不重建 APK）

```powershell
cd caregiver-android
.\gradlew.bat syncWebAssets --rerun-tasks
# 然后正常构建
.\gradlew.bat assembleDebug
```

---

## 10. 未来规划

> 当前阶段：**稳定底层（state / 轮询 / 云端同步 / 异常闭环）**。以下功能待底层稳定后实施。

### 10.1 登录与用户系统

**现状：** 账号密码登录已实现（Phase 1+2 完成，v3.2 修复 admin 卡在加载页）。
- 后端：4 张新表 + `/api/auth/*` + `/api/admin/*` 端点 + `get_current_user` 双通道中间件（Bearer token → session 表，x-api-key 回退）
- 密码哈希使用 `hashlib.scrypt`（Python 标准库，零外部依赖）
- 前端：登录表单（`loginPage.js`），`state.js` 导出 `notify` 供 `main.js` 使用，`cloudApi.js` 加 `Authorization` header
- 按钮使用 `type="button"` + `data-action="login-submit"` click handler（Android WebView 不冒泡 form submit 事件）
- 角色由服务端返回 → 客户端根据 `user.role` 自动路由（`director`/`caregiver`/`family`/`admin`）
- admin/superadmin 视为 director 同权：可访问院长工作台、底部导航、轮询、自动登录恢复
- 超管通过 `/api/admin/*` 端点跨机构管理

**已完成（v3.6）：**
- 护工云端账号体系打通：院长新增护工自动创建云端账号，删除护工自动禁用云端账号
- 后台层级视图：`static/admin.html` 新增"层级视图"tab，按机构 → 院长/护工/家属树状展示
- `caregiver` 记录新增 `username`/`cloudUserId`/`cloudUserStatus` 三字段
- `role_entity_id` 桥接 `caregiver.id` ↔ `UserTable.id`
- CDP 脚本修复：`cdp_raw.py` 无 Origin header 绕过 WebView 安全策略

**待完成：**
- Phase 3：院长端用户管理 UI（`directorPage.js` 添加"账号管理"tab）
- Phase 4：开发者后台独立 Web 页面
- 初始 admin 账号由 `on_startup` 自动创建（`admin`/`admin123`）
- 初始 demo 机构自动创建（`demo-qinghe-care`，容量配额 0=无限）

### 10.2 机构云端管理

**现状：** 机构结构（楼层、房间、人员、护理方案）由种子脚本 `scripts/seed_demo_institution.py` 在云端创建，APP 端无创建/修改机构能力，只能通过人员管理页面增删护工和老人。

**规划：**
- APP 端机构设置页：修改机构名称、楼层数、房间分配
- 云端 `institution_states` 表当前是冗余聚合——长期考虑拆分为独立实体表，`institution-state` 端点仅用于跨端同步变更通知
- 多机构支持：超管可以切换机构，普通用户绑定单一机构

**涉及文件：**
| 文件 | 变更 |
|------|------|
| `remote-main.py` | 新增 `/api/institution` CRUD 端点 |
| `directorPage.js` | 新增 `renderDirectorInstitutionPage` 机构设置页 |
| `state.js` | 新增 `actions.updateInstitution()` 等 |

### 10.3 待规划功能清单

| 功能 | 优先级 | 说明 |
|------|--------|------|
| 护工任务推送通知 | 中 | 新任务/临时任务下发时，APP 收到通知（目前只能轮询发现） |
| 家属端消息系统 | 中 | 当前 `family-messages` 页为空壳，需后端 + 前端实现消息收发 |
| 健康数据图表 | 低 | 老人血压/心率历史趋势图（`family-health` 页） |
| 数据导出 PDF 美化 | 低 | 当前导出为基础 HTML→PDF，需设计 A4 排版模板 |
| 离线模式 | 低 | 无网络时缓存操作，联网后批量同步（当前完全依赖在线） |
| 操作日志/审计 | 低 | 记录谁在什么时候做了什么操作（`ai_analysis_logs` 表可复用） |
| 多语言支持 | 低 | 当前文案均为硬编码中文 |

---

## 11. 回归防护清单

> **任务生成已从 APP 端迁移到服务端。服务端的正确性是整个系统的根基。以下 4 个模式绝对不可改坏。**

### 模式 1：raw_payload 只能合并，不能替换

**位置**：`upsert_published_task` (remote-main.py)，POST /api/tasks 处理函数

**为什么危险**：APP 发的是**部分更新**（只含变化的字段）。护工标记异常时 request 只有 `status/exceptionNote/exceptionType`，没有 `schedule/title/elderName` 等结构字段。如果用 `existing.raw_payload = payload` 整体替换，结构字段就永久丢失了。

**正确做法**：
```python
# 合并：只覆盖非空值，保留未传的结构字段
existing_raw = dict(existing.raw_payload or {})
for k, v in payload.items():
    if v is not None and v != "" and v != [] and v != {}:
        existing_raw[k] = v
existing.raw_payload = existing_raw
```

**连带伤害**：raw_payload 被清空后，`task_to_dict` 返回的结构字段也丢失 → 护工时间轴任务无标题、无时间、无老人名 → 时间轴完全不可用。

### 模式 2：显式列非空才覆盖

**位置**：`upsert_published_task` (remote-main.py)，显式列赋值块

**为什么危险**：Pydantic model 对未传字段会自动填默认值（空字符串）。`existing.schedule = normalize_text(request.schedule)` 在 request 没传 schedule 时会把已有值覆盖成空字符串。原因：Pydantic `model_dump()` 生成**所有字段**的键值对，不区分"没传"和"传了空"。

**正确做法**：
```python
if normalize_text(request.schedule):
    existing.schedule = normalize_text(request.schedule)
# 同理：title、elderName、caregiverName、source、sourceApp 等所有结构字段
```

**涉及字段**：schedule、title、elder_name、caregiver_name、elder_room、elder_bed、elder_floor、institution_name、record_date、plan_item_id、template_id、category、note、source、source_app 等 — 全部需要非空守卫。

### 模式 3：task_to_dict 先显式列，后 raw_payload 覆盖

**位置**：`task_to_dict` (remote-main.py)，DB 行 → API JSON

**为什么危险**：raw_payload 存的是 APP 最后一次 POST 的完整结构数据。显式列（如 `row.status`）是数据库权威值。但如果显式列在 raw_payload 之后覆盖，raw_payload 中的 `"status": "risk"` 会被 `row.status`（可能是 `"pending"`）覆盖。

**正确做法**：
```python
# 1. 先从显式列构建
payload = {"id": row.id, "status": row.status, ...}
# 2. 再用 raw_payload 的非空值覆盖（raw_payload 有更丰富的结构信息）
rp = dict(row.raw_payload or {})
for k, v in rp.items():
    if v is not None and v != "" and v != [] and v != {}:
        payload[k] = v
```

**注意**：raw_payload 可能包含空字符串的 `id`、`taskId` 等字段，空值过滤 (`v != ""`) 是关键。

### 模式 4：任务备注不是异常说明

**位置**：`generate_tasks_for_date` (remote-main.py)，方案任务和日报模板任务两段生成逻辑

**为什么危险**：任务生成会按 `planItemId/templateId` upsert 已有任务。如果把普通任务 `note` 当成 `exceptionNote`，下一次 `GET /api/tasks` 自动生成任务时会把“先确认老人精神状态，再协助离床。”这类普通说明重新写成 `status=risk`，导致院长端又出现一批假异常。

**正确做法**：
```python
prev_e_note = prev_payload.get("exceptionNote") or prev_payload.get("exception") or ""
prev_e_type = prev_payload.get("exceptionType") or ""
prev_e_evid = prev_payload.get("exceptionEvidence") or None
prev_e_time = prev_payload.get("exceptionReportedAt") or ""
has_real_exception = bool(prev_e_note or prev_e_type or prev_e_evid or prev_e_time)
preserved_status = prev_status if prev_status in ("risk", "refused") and has_real_exception else ""
```

**禁止**：`prev_payload.get("note")`、`recordNote`、`recordEvidence` 不能作为异常保留依据。院长端和服务端任务生成不能制造异常状态；`risk/refused` 只能来自护工端真实异常上报或真实异常字段。

### 修改服务端前必须回答的 6 个问题

修改 `remote-main.py` 的 `upsert_published_task`、`task_to_dict`、`generate_tasks_for_date` 之前：

1. **结构字段会不会丢？** — request 是部分更新还是全量？Pydantic model 的默认值会不会覆盖 DB？
2. **raw_payload 是合并还是替换？** — 用 `=` 赋值还是用 dict merge + non-empty guard？
3. **task_to_dict 返回的数据完整吗？** — 优先级顺序对吗？空值过滤有效吗？
4. **用 curl 验证过了吗？** — 至少覆盖：创建任务 → 护工标记异常 → 再次查询 → 任务标题/时间/老人名是否还在？
5. **改了 generate_tasks_for_date 后 regenerate 测试了吗？** — `POST /api/tasks` 触发 regen → 检查返回的任务数量和字段完整性
6. **异常是否有真实异常字段？** — 普通 `note/recordNote/recordEvidence` 不能让任务保留或生成 `risk/refused`

---

## 12. 功能-代码-云端对照

> 这一节用于把“APP 里看到的功能”直接串到前端代码、云端接口和后端实现。查业务问题时先按功能找闭环，再回到前面章节看细节。

### 12.1 前端主干

| 模块 | 位置 | 职责 |
|------|------|------|
| PWA 入口 | `caregiver-app/index.html:15` | 加载 4 个 CSS 和 `src/main.js` |
| 路由表 | `caregiver-app/src/main.js:57` | `state.ui.route` → 页面渲染函数，28 条路由集中注册 |
| 渲染入口 | `caregiver-app/src/main.js:1488` | `renderApp()` 全量重建页面、底部导航、弹窗、toast |
| 点击分发 | `caregiver-app/src/main.js:1541` | 全局 `data-action` 事件代理，页面只声明动作 |
| 轮询入口 | `caregiver-app/src/main.js:2268`、`2298`、`2360` | 院长任务/日报轮询、护工任务轮询、整院状态轮询 |
| 自动登录 | `caregiver-app/src/main.js:2386` | token 恢复，调用 `/api/auth/me` 校验身份 |
| 全局状态 | `caregiver-app/src/store/state.js:35` | `state` 数据中心，由 `createMockState()` 初始化 |
| actions | `caregiver-app/src/store/state.js:1927` | 唯一业务状态修改入口 |
| selectors | `caregiver-app/src/store/state.js:5011` | 页面派生数据入口，每次渲染实时计算 |
| 云端客户端 | `caregiver-app/src/utils/cloudApi.js:45`、`94` | 读取 Android/本地配置，统一 `requestJson()` |
| Android 桥 | `caregiver-android/app/src/main/java/com/elderserve/caregiver/MainActivity.java:219` | 注入 `AndroidBridge`，提供运行信息、定位、文件保存、打印、APK 更新 |
| 后台管理页 | `static/admin.html:332` | 独立后台，不复用 APP store，直接调用 `/api/admin/*` |

### 12.2 登录、身份和自动恢复

```
loginPage.js:126
  → main.js:1578 login-submit
  → state.js:2226 actions.login()
  → cloudApi.requestJson("/api/auth/login")
  → remote-main.py:2708 auth_login()
  → users/sessions 表
  → 按 role 跳转：caregiver=attendance, family=family-home, director/admin=director-home
  → main.js:2386 自动登录时调用 /api/auth/me
  → remote-main.py:2792 auth_me()
```

- 前端页面：`caregiver-app/src/pages/loginPage.js:126`
- 前端状态：`state.session`、`state.ui.loginError`、`state.ui.loginMenuOpen`
- 后端认证：`get_current_user()` 在 `remote-main.py:550`，`hash_password()`/`verify_password()` 在 `remote-main.py:805`
- 云端表：`users` (`remote-main.py:345`)、`sessions` (`remote-main.py:360`)、`admins` (`remote-main.py:388`)
- 注意：`cloudApi.js:74` 默认带 `x-api-key`，登录后再叠加 Bearer token。
- 护工登录硬规则：`/api/auth/login` 返回的 `user.roleEntityId` 是护工绑定事实。如果后端已返回 `role=caregiver` 和非空 `roleEntityId`，前端不能因为本地 `state.caregivers` 尚未同步就报“账号未绑定到当前养老院护工”。`actions.login()` 必须先按 `roleEntityId` 匹配，匹配不到时用登录返回的 `displayName/username/id` 创建临时当前护工会话，再等待 `_loadCloudPersonnel()`/`refreshInstitutionSharedState()` 补齐详情。
- 密码提示不是绑定依据：`users.password_hint` 只用于院长端显示/测试提示，真实登录以 `password_hash` 校验为准。改护工密码时必须同步更新 `password_hash` 和 `password_hint`，避免页面显示的密码和实际密码不一致。

### 12.3 APP 更新

```
loginPage.js:26 更多菜单
  → main.js:1571 check-app-update
  → state.js:1955 checkAppUpdate()
  → cloudApi.js:225 fetchLatestAppRelease()
  → GET /api/app-releases/latest
  → remote-main.py:2677 get_latest_app_release()
  → state.js:2009 downloadAppUpdate()
  → AndroidBridge.downloadAndInstallUpdate()
  → main.js:2244 window.__onElderServeUpdate 回写状态
```

- 发布接口：`POST /api/app-releases` 在 `remote-main.py:2596`
- 发布脚本：`scripts/publish_apk.ps1`
- 发布记录表：`app_releases` 在 `remote-main.py:326`
- Android 版本来源：`caregiver-android/gradle.properties`

### 12.4 护工打卡与工作台入口

```
attendancePage.js:12
  → main.js:1597 clock-in / enter-workbench
  → attendanceBridge.js:163 requestAttendanceVerification()
  → state.js:2285 actions.clockIn()
  → state.js:4869 actions.enterWorkbench()
  → route=home
```

- 页面：`caregiver-app/src/pages/attendancePage.js:12`
- 原生桥：`caregiver-app/src/utils/attendanceBridge.js:163`
- 状态：`state.session.clockInAt`、`clockInLocation`、`clockInStatus`
- 云端：当前打卡主要是本地会话状态，未独立落云端考勤表；院长端考勤展示来自本地/共享状态派生。

### 12.5 护工任务中心、执行和异常

```
homePage.js:11 楼层/任务概览
  → roomSelectPage.js:9 房间列表
  → elderDetailPage.js:25 老人详情
  → taskDetailPage.js:188 任务详情
  → main.js:1601-1664 choose/select/complete/record/exception
  → state.js:2659 completeTask()
  → state.js:2567 saveTaskRecordDialog()
  → state.js:1552 syncCaregiverTaskToCloud()
  → cloudApi.js:187 uploadPublishedTask()
  → POST /api/tasks
  → remote-main.py:2150 upsert_published_task()
```

- 时间线渲染：`renderCaregiverTaskTimeline()` 在 `taskDetailPage.js:115`
- 任务云端拉取：`state.js:4195 refreshCaregiverCloudTasks()` → `cloudApi.js:194 fetchPublishedTasks()` → `remote-main.py:2229 list_published_tasks()`
- 完成记录：`state.js:2687 createTaskCompletion()` → `cloudApi.js:274` → `remote-main.py:2294 create_task_completion()`
- 异常记录：`state.js:1595 addAnomaly()`、`1617 addQuickAnomaly()` → `cloudApi.js:302 createAnomaly()` → `remote-main.py:2394 create_anomaly()`
- 云端表：`published_tasks` (`remote-main.py:271`)、`task_completions` (`remote-main.py:169`)、`anomalies` (`remote-main.py:203`)
- 关键字段：`status=pending/completed/risk/refused`，异常文本在 `exceptionNote/exceptionType/exceptionEvidence`。

### 12.6 护工交班日报与院长收件箱

```
historyPage.js:72 renderHistoryPage()
  → state.js buildCaregiverRecordWorkspace()
  → 按 recordDate + caregiverId 聚合老人护理记录工作台
  → data-care-record-date 原生日历选择记录日期
  → sync-auto-care-record
  → state.js syncCaregiverAutoCareRecord()
  → 自动读取该日期时间轴任务的 completed/risk/refused、recordNote、recordEvidence、exceptionNote、exceptionEvidence
  → POST /api/care-records

caregiverDailyReportPage.js:66
  → main.js:2021 save-daily-report / submit-daily-report
  → state.js:4042 saveCaregiverDailyReport()
  → state.js:4051 submitCaregiverDailyReport()
  → cloudApi.js:137 uploadCareRecord()
  → POST /api/care-records
  → remote-main.py:2030 upsert_care_record()
  → 院长 state.js:4090 refreshDirectorCloudReports()
  → cloudApi.js:144 fetchCareRecords()
  → remote-main.py:2104 list_care_records()
  → directorPage.js:405/466/539/631 日历、单日详情、导出、归档预览
```

- 护工日报页面：`caregiver-app/src/pages/caregiverDailyReportPage.js:66`
- 护工底部“护理记录”入口：`caregiver-app/src/pages/historyPage.js`，当前不是旧过程流水列表，而是按日期和老人聚合的护理记录工作台；日期必须用日历选择，不再用“今天/昨天”按钮。
- 护理记录页滚动规则：顶部日期/统计/筛选区不能使用通用 `.sticky-section` 的粘性覆盖效果；该区块高度较大，粘住后会压住老人卡，导致滚动时文字重叠和日历交互抖动。样式应由 `.care-record-workbench__sticky` 覆盖为普通文档流。
- 自动维护：`care_records` 是云端按“护工 + 日期 + 老人”维护的操作记录表，不是用户点击按钮后才上传的表。护工端完成任务、取消打卡、保存文字、拍照留痕、上报异常/不配合时，必须通过 `refreshCareRecordFromTask()` 自动重算并 upsert 对应 `care_records`；页面按钮只能作为“刷新记录/查看结果”，不能再表达为“同步云端”。
- 护理记录页的“查看时间轴”必须只读：从 `historyPage.js` 进入时 `state.ui.caregiverTimelineReadonly=true`，`taskDetailPage.js renderCaregiverTaskTimeline()` 不得渲染完成、记录、异常等编辑按钮；任务执行入口正常进入时才允许编辑。
- 护理记录页刷新记录不能跳屏：点击 `sync-auto-care-record` 前必须通过 `requestScrollRestore(state.ui.route, getCurrentContentScrollTop())` 保留当前列表位置，异步 upsert 后重渲染要恢复原滚动。
- 自动同步：`state.js refreshCareRecordFromTask()` / `syncCaregiverAutoCareRecord()` 从该日期时间轴任务自动生成 `care_records`，同步任务打卡状态、文字记录、照片留痕、异常记录；护工端不应要求手动重填这些内容。
- 模板字段渲染：`renderReportTemplateFields()` 在 `caregiverDailyReportPage.js:51`
- 院长日报页：`renderDirectorCareRecordsPage()` 在 `directorPage.js:3018`
- 日历：`renderDirectorInboxCalendar()` 在 `directorPage.js:405`
- 单日详情：`renderDirectorInboxDayDialog()` 在 `directorPage.js:466`
- 归档预览：`renderDirectorCareRecordPreview()` 在 `directorPage.js:631`
- 后端摘要：`create_summary()` 在 `remote-main.py:56`
- 云端表：`care_records` 在 `remote-main.py:220`
- 护工端护理记录三分法：`historyPage.js` 只做“日期 + 老人”的记录工作台；任务过程留痕仍走 `taskDetailPage.js` / `saveTaskRecordDialog()`；云端日报仍走 `caregiverDailyReportPage.js` / `submitCaregiverDailyReport()`。UI 可以聚合入口，数据流不能混成一套。
- 字段边界：普通任务记录只能写 `recordNote/recordEvidence`；异常只能由 `exceptionNote/exceptionType/exceptionEvidence` 驱动；日报 `care_records` 是日结归档，不应反向制造任务异常。
- 自动生成边界：护理记录只从目标 `recordDate + elderId + caregiverId` 的任务时间轴读取数据；不能跨日期混入任务，也不能让日报反向覆盖任务状态。
- 表单协议：`data-care-record-form` 和 `reportItem_*`、`medication*`、`health*`、`inventory*` 等 input name 是 `collectCareRecordForm()` 的隐式接口，重构 UI 时不能随意改名。

### 12.7 院长首页、总览、楼层和统计

```
directorPage.js:3388 renderDirectorHomePage()
  → state.js:5011 selectors()
  → state.js:1761 buildDirectorTaskOverview()
  → state.js:1788 buildDirectorCaregiverStatistics()
  → state.js:1823 buildDirectorFloorCaregiverProgress()
  → state.js:1855 buildDirectorExceptionReports()
  → state.js:4266 refreshDirectorCloudTasks()
  → GET /api/tasks
  → remote-main.py:2229 list_published_tasks()
```

- 院长首页：`renderDirectorHomePage()` 在 `directorPage.js:3388`
- 楼层详情：`renderDirectorFloorDetailPage()` 在 `directorPage.js:3715`
- 护工统计：`renderDirectorStatisticsPage()` 在 `directorPage.js:4395`
- 实时时钟：`main.js:2330 updateLiveClockNodes()`，分钟变化时触发 `actions.tickClock()`
- 渲染风险：`renderApp()` 使用 `innerHTML` 全量重建，不必要 `notify()` 会导致页面跳动。

### 12.8 院长人员管理与云端账号

```
directorPage.js:4161 renderDirectorPeoplePage()
  → directorPage.js:3776 renderPersonnelDraftDialog()
  → main.js:1675-1768 personnel actions
  → state.js:2828 saveDirectorPersonnelDraft()
  → state.js:2892 addCaregiver() / 2919 updateCaregiver() / 2945 removeCaregiver()
  → state.js:2969 addElder() / 3025 updateElder() / 3083 removeElder()
  → cloudApi.js:237 createAuthUser()
  → POST /api/auth/users
  → remote-main.py:2832 auth_create_user()
  → state.js:2057 persistInstitutionSharedState()
  → POST /api/institution-state
  → remote-main.py:2466 upsert_institution_state()
```

- 人员页面：`renderDirectorPeoplePage()` 在 `directorPage.js:4161`
- 护工行：`renderCaregiverPersonnelRow()` 在 `directorPage.js:4014`
- 老人行：`renderElderPersonnelRow()` 在 `directorPage.js:4039`
- 账号禁用：`disableAuthUser()` 在 `cloudApi.js:248`，后端 `auth_disable_user()` 在 `remote-main.py:2859`
- 云端人员表：`elders` (`remote-main.py:114`)、`caregivers` (`remote-main.py:154`)、`users` (`remote-main.py:345`)
- 共享快照：`institution_states` (`remote-main.py:312`) 存 `personnelInfo`，其他端通过 `state.js:2077 refreshInstitutionSharedState()` 拉取；它是兼容层，不是人员事实表。
- 回归防护：`state.js filterSnapshotCaregiversForCurrentInstitution()` 必须保留。若当前已有带 `cloudUserId` 的护工白名单，`applyInstitutionStateSnapshot()` 和 `buildInstitutionStateSnapshot()` 都只能保留白名单内护工，不能让旧快照把其他机构或 demo 护工合入当前养老院。

### 12.9 日报模板、排程和自动任务生成

```
directorPage.js:3018 renderDirectorCareRecordsPage()
  → directorPage.js:2590 renderReportTemplateEditor()
  → directorPage.js:2216 renderReportTemplateSchedulePage()
  → main.js:1795-1948 收集模板/排程/导入/预览动作
  → state.js:3606 saveDailyReportTemplateDraft()
  → cloudApi.js:156 uploadDailyReportTemplate()
  → POST /api/daily-report-template
  → remote-main.py:1924 upsert_daily_report_template()
  → remote-main.py:1581 regenerate_tasks_for_elders()
  → remote-main.py:1262 generate_tasks_for_date()
```

- 模板导入：`renderReportTemplateImportDialog()` 在 `directorPage.js:2512`，`state.js:3415 openDailyReportTemplateImport()`
- 模板目录：`state.js:3669 refreshDailyReportTemplates()` → `cloudApi.js:175 fetchDailyReportTemplates()` → `remote-main.py:1977 list_daily_report_templates()`
- 任务生成分两段：护理方案任务在 `remote-main.py:1355`，日报模板任务在 `remote-main.py:1435`
- 护工分配：`_resolve_caregiver_for_elder()` 在 `remote-main.py:1243`，优先老人绑定护工，再按楼层轮转。

### 12.10 护理方案、临时任务和派单

```
directorPage.js:3559 renderDirectorCarePlansPage()
  → directorPage.js renderPlanTimelineSidebar()
  → directorPage.js renderFloorStaffDetail()
  → directorPage.js renderResidentRow()
  → directorPage.js renderDispatchTaskCard() / renderLoadRow()
  → directorPage.js:713 renderDirectorDispatchDraftDialog()
  → directorPage.js:3678 renderDirectorDispatchPage()
  → main.js:1966-2078 plan/dispatch actions
  → state.js:3791 saveDirectorDispatchDraft()
  → state.js:4512 assignTask()
  → cloudApi.js:187 uploadPublishedTask()
  → remote-main.py:2150 upsert_published_task()
```

- 方案草稿：`state.ui.directorPlanDraft`、`state.ui.directorPlanItemDraft`
- 临时任务：`source="temporary"`，不受日报模板重生成影响
- 任务分配：`assignmentMode/assignmentStatus/caregiverId/caregiverName`
- 回归重点：`POST /api/tasks` 是部分更新，后端 `raw_payload` 只能合并非空值。

### 12.11 院长异常、已读箱和任务详情

```
taskDetailPage.js:188 护工提交异常
  → state.js:2567 saveTaskRecordDialog()
  → state.js:1595 addAnomaly()
  → POST /api/anomalies
  → remote-main.py:2394 create_anomaly()
  → POST /api/tasks 更新 risk
  → directorPage.js:4344 renderDirectorAnomalyPage()
  → state.js:1855 buildDirectorExceptionReports()
  → directorPage.js:4367 renderDirectorReadInboxPage()
```

- 院长异常卡：`renderDirectorExceptionReportCard()` 在 `directorPage.js:1112`
- 已读箱卡：`renderReadExceptionCard()` 在 `directorPage.js:1146`
- 院长任务详情：`renderDirectorTaskDetailDialog()` 在 `directorPage.js:1168`
- 已读/还原/删除 actions：`state.js:3137`、`3145`、`3150`、`3178`
- 后端异常更新：`update_anomaly()` 在 `remote-main.py:2442`
- 回归防护：已读和删除不是同一件事。`markExceptionRead()` 只能加入 `directorReadExceptionIds`；`restoreReadException()` 只能从已读移回未读；`deleteReadException()`/`deleteAllReadExceptions()` 必须加入 `directorDeletedExceptionIds`，不能只是从 `directorReadExceptionIds` 移除，否则刷新后会重新出现在异常状态。

### 12.12 家属端

```
main.js:68-71 family routes
  → familyPage.js:108 renderFamilyHomePage()
  → familyPage.js:210 renderFamilyHealthPage()
  → familyPage.js:251 renderFamilyMessagesPage()
  → familyPage.js:282 renderFamilyProfilePage()
  → state.js:2742 toggleFamilyMessage()
```

- 当前家属端主要读本地/共享状态，云端账号已支持 `role=family`。
- 家属账号创建入口在院长人员管理：`saveDirectorPersonnelDraft()` 中调用 `createAuthUser()`。
- 后续真正消息系统需要新增后端消息表和 `/api/messages`。

### 12.13 后台管理

```
static/admin.html:332 api()
  → static/admin.html:371 doLogin()
  → POST /api/admin/login
  → remote-main.py:2891 admin_login()
  → static/admin.html:611-681 各 tab 拉取数据
  → /api/admin/institutions / users / elders / report-templates / care-records / published-tasks / sessions / app-releases
  → remote-main.py:2941-3181
```

- 独立页面：`static/admin.html`
- 后端入口：`require_admin()` 在 `remote-main.py:2886`
- 支持范围：机构、用户、老人、日报模板、护理记录、任务、会话、APK 发布记录
- 已修复：后台任务列表不再访问不存在的 `t.exception_type` 字段，改从 `raw_payload.exceptionType` 读取。

### 12.14 cloudApi.js 对照表

| 前端函数 | 位置 | HTTP | 后端实现 | 主要调用方 |
|----------|------|------|----------|------------|
| `requestJson()` | `cloudApi.js:94` | 通用 | 所有 API | `login()`、`logout()`、`loadTaskEvidence()`、自动登录 |
| `uploadCareRecord()` | `cloudApi.js:137` | `POST /api/care-records` | `remote-main.py:2030` | `submitCaregiverDailyReport()` |
| `fetchCareRecords()` | `cloudApi.js:144` | `GET /api/care-records` | `remote-main.py:2104` | `downloadDirectorCareReports()`、`loadLatestDirectorCareRecord()` |
| `uploadDailyReportTemplate()` | `cloudApi.js:156` | `POST /api/daily-report-template` | `remote-main.py:1924` | `saveDailyReportTemplateDraft()` |
| `fetchDailyReportTemplate()` | `cloudApi.js:163` | `GET /api/daily-report-template` | `remote-main.py:2009` | 模板导入 fallback |
| `fetchDailyReportTemplates()` | `cloudApi.js:175` | `GET /api/daily-report-templates` | `remote-main.py:1977` | 模板目录/导入 |
| `uploadPublishedTask()` | `cloudApi.js:187` | `POST /api/tasks` | `remote-main.py:2150` | 完成/异常/临时任务/派单 |
| `fetchPublishedTasks()` | `cloudApi.js:194` | `GET /api/tasks` | `remote-main.py:2229` | 院长/护工任务轮询 |
| `uploadInstitutionState()` | `cloudApi.js:206` | `POST /api/institution-state` | `remote-main.py:2466` | 人员/机构/模板共享快照 |
| `fetchInstitutionState()` | `cloudApi.js:213` | `GET /api/institution-state` | `remote-main.py:2545` | 全局共享状态轮询 |
| `fetchLatestAppRelease()` | `cloudApi.js:225` | `GET /api/app-releases/latest` | `remote-main.py:2677` | APP 更新检查 |
| `createAuthUser()` | `cloudApi.js:237` | `POST /api/auth/users` | `remote-main.py:2832` | 新增护工/家属账号 |
| `fetchAuthUsers()` | `cloudApi.js:244` | `GET /api/auth/users` | `remote-main.py:2811` | `_loadCloudPersonnel()` |
| `disableAuthUser()` | `cloudApi.js:248` | `PUT /api/auth/users/{id}/disable` | `remote-main.py:2859` | 删除护工/老人时禁用账号 |
| `fetchCaregivers()` | `cloudApi.js:252` | `GET /api/caregivers` | `remote-main.py:1775` | `_loadCloudPersonnel()` |
| `createTaskCompletion()` | `cloudApi.js:274` | `POST /api/task-completions` | `remote-main.py:2294` | `completeTask()` |
| `fetchTaskCompletions()` | `cloudApi.js:278` | `GET /api/task-completions` | `remote-main.py:2322` | 当前少用/预留 |
| `createVital()` | `cloudApi.js:288` | `POST /api/vitals` | `remote-main.py:2348` | 当前少用/预留 |
| `fetchVitals()` | `cloudApi.js:292` | `GET /api/vitals` | `remote-main.py:2374` | 当前少用/预留 |
| `createAnomaly()` | `cloudApi.js:302` | `POST /api/anomalies` | `remote-main.py:2394` | `addAnomaly()`、`addQuickAnomaly()` |
| `fetchAnomalies()` | `cloudApi.js:306` | `GET /api/anomalies` | `remote-main.py:2419` | 当前少用/预留 |
| `updateAnomaly()` | `cloudApi.js:316` | `POST /api/anomalies/{id}/update` | `remote-main.py:2442` | 异常已读/处理 |
| `updateInstitution()` | `cloudApi.js:320` | `POST /api/institution/update` | `remote-main.py:2561` | 当前少用/预留 |
| `fetchInstitution()` | `cloudApi.js:324` | `GET /api/institution` | `remote-main.py:2583` | 登录后加载机构信息 |

---

## 13. 后端架构评估与优化清单

### 13.1 后端结构总览

`remote-main.py` 是单文件 FastAPI 后端，采用“配置 → ORM 表定义 → Pydantic 请求模型 → 序列化函数 → 业务函数 → API 路由”的集中式结构。

| 区域 | 位置 | 说明 |
|------|------|------|
| 环境配置 | `remote-main.py:26` | `ELDER_API_KEY`、`ELDER_PUBLIC_BASE_URL`、`ELDER_DATABASE_URL`、OpenClaw 配置 |
| DB 初始化 | `remote-main.py:41` | SQLAlchemy engine/session，SQLite `check_same_thread=False` |
| ORM 表 | `remote-main.py:114` | 老人、护工、任务、日报、机构、用户、管理员、版本等 |
| 手写迁移 | `remote-main.py:403`、`423`、`449`、`512` | SQLite `ALTER TABLE` 补列 |
| FastAPI app | `remote-main.py:481` | CORS、`/static`、`/admin` |
| 认证 | `remote-main.py:550` | Bearer session 或 `x-api-key` 双通道 |
| 请求模型 | `remote-main.py:583` | Pydantic request models |
| 序列化 | `remote-main.py:845` | `*_to_dict()` 系列 |
| 任务生成 | `remote-main.py:1262` | `generate_tasks_for_date()` 核心任务引擎 |
| 路由 | `remote-main.py:1651` 起 | 所有 `/api/*` 端点集中定义 |

### 13.2 表结构与职责

| 表 | 位置 | 职责 |
|----|------|------|
| `elders` | `remote-main.py:114` | 老人档案、楼层房床、护理等级、日报模板、责任护工、家属信息 |
| `caregivers` | `remote-main.py:154` | 护工档案、楼层、班次、状态、电话 |
| `task_completions` | `remote-main.py:169` | 任务完成记录 |
| `vitals` | `remote-main.py:187` | 体征记录 |
| `anomalies` | `remote-main.py:203` | 异常记录 |
| `care_records` | `remote-main.py:220` | 护工日报/交班日报，包含模板快照和各类护理项 JSON |
| `daily_report_templates` | `remote-main.py:257` | 日报模板 JSON |
| `published_tasks` | `remote-main.py:271` | 日常任务、临时任务、异常任务状态和分配信息 |
| `institution_states` | `remote-main.py:312` | 整院共享快照，兼容 APP 端状态同步 |
| `app_releases` | `remote-main.py:326` | APK 发布记录 |
| `users` | `remote-main.py:345` | 机构内院长/护工/家属账号 |
| `sessions` | `remote-main.py:360` | 登录 token 会话 |
| `institutions` | `remote-main.py:375` | 机构记录、容量配额 |
| `admins` | `remote-main.py:388` | 平台管理员 |

### 13.3 后端 API 分组

| 分组 | 端点 | 实现位置 |
|------|------|----------|
| 健康/静态 | `GET /`、`GET /healthz`、`GET /admin` | `remote-main.py:507`、`1651` |
| 老人 | `GET/POST /api/elders`、`GET/POST/DELETE /api/elders/{id}`、头像上传 | `remote-main.py:1664` |
| 护工 | `GET/POST /api/caregivers`、`POST/DELETE /api/caregivers/{id}` | `remote-main.py:1775` |
| AI | `/api/task-to-openclaw`、`/api/ai/analyze-daily-tasks`、`/api/ai/analyses` | `remote-main.py:1847` |
| 日报模板 | `POST /api/daily-report-template`、`GET /api/daily-report-template(s)` | `remote-main.py:1924` |
| 日报 | `POST/GET /api/care-records`、`GET /api/care-records/{id}` | `remote-main.py:2030` |
| 任务 | `POST/GET /api/tasks`、`GET /api/tasks/{id}` | `remote-main.py:2150` |
| 执行/体征/异常 | `/api/task-completions`、`/api/vitals`、`/api/anomalies` | `remote-main.py:2294` |
| 共享状态 | `POST/GET /api/institution-state` | `remote-main.py:2466` |
| 机构 | `POST /api/institution/update`、`GET /api/institution` | `remote-main.py:2561` |
| APK | `POST /api/app-releases`、`GET /api/app-releases/latest` | `remote-main.py:2596` |
| 登录/账号 | `/api/auth/*` | `remote-main.py:2708` |
| 平台后台 | `/api/admin/*` | `remote-main.py:2886` |

### 13.4 云端任务生成机制

```
generate_tasks_for_date(institution_id, record_date, db) remote-main.py:1262
  → 读取 elders/caregivers/templates/institution_state
  → 如果独立表为空，从 institution_state.personnel_info 补齐老人/护工
  → Phase 1: elderCarePlans 生成护理方案任务 remote-main.py:1355
  → Phase 2: dailyReportTemplates 生成日报模板任务 remote-main.py:1435
  → _resolve_caregiver_for_elder() 分配护工 remote-main.py:1243
  → 按 planItemId/fallback key upsert 到 published_tasks
```

触发点：

- `GET /api/tasks` 当 `autoGenerate=true` 且当天任务为空时触发，见 `remote-main.py:2241`
- 保存日报模板后触发受影响老人任务重生成，见 `remote-main.py:1960`
- 更新护工楼层后触发当天任务重生成，见 `remote-main.py:1826`
- 上传 `institution-state` 后同步人员并触发当天任务重生成，见 `remote-main.py:2495`

回归原则：

- `upsert_published_task()` (`remote-main.py:2150`) 处理 APP 部分更新，不是全量替换。
- `task_to_dict()` (`remote-main.py:1065`) 要保留 raw payload 中的结构字段。
- `generate_tasks_for_date()` (`remote-main.py:1262`) 不能删除已有状态，必须 upsert 保留已完成/异常。

### 13.5 架构合理性判断

当前架构适合演示、小规模单机构和快速迭代：前端、Android WebView、FastAPI、SQLite 的闭环完整；`published_tasks`、`care_records`、`institution_states` 足以支撑院长端和护工端同步；`cloudApi.js` 也把云端调用统一收口。

它不适合直接作为高并发生产架构：后端单文件超过 3000 行，认证、业务、迁移、AI、文件、后台管理都耦合在 `remote-main.py`；SQLite 写锁与多端 10 秒级轮询叠加后容易出现锁竞争；`GET /api/tasks` 带写入副作用，会让只读轮询承担任务生成职责。

### 13.6 必须谨慎改的风险点

1. **多租户隔离**：大量接口依赖客户端传入 `institutionId` 过滤，例如老人/护工/日报/任务在 `remote-main.py:1664`、`1775`、`2104`、`2229`；只有部分详情接口做了 session 机构校验。生产化前应统一 `resolve_institution_id(current_user, requested_id)`。
2. **API Key 权限过宽**：`get_current_user()` 中 `x-api-key` 直接返回 `role=system`，见 `remote-main.py:571`；前端默认每次请求都带 `x-api-key`，见 `cloudApi.js:74`。后续应区分设备同步 key、机构 key、平台管理 key。
3. **GET 请求有写副作用**：`list_published_tasks()` 会在查询时调用 `generate_tasks_for_date()` 并提交事务，见 `remote-main.py:2241`。并发轮询下要防重复生成和状态覆盖。
4. ~~**任务字段合并**~~：`upsert_published_task()` 已改为 `exclude_unset` + 仅请求实际携带且非空的显式列才覆盖 + `raw_payload` 非空合并；新任务缺少 `institutionId/recordDate/title` 时返回 404，避免部分更新 miss 后创建壳任务。
5. **SQLite 写锁**：轮询、日报、任务、版本发布共用一个 SQLite DB。迁移 PostgreSQL/MySQL 前必须补唯一约束、索引、迁移脚本和事务边界。
6. ~~**后台任务列表字段错误**~~：已改为从 `raw_payload.exceptionType` / `exception_type` 读取，不再访问不存在的 `t.exception_type`。
7. ~~**会话吊销接口不匹配**~~：`admin_revoke_session()` 已兼容后台 UI 传入的 `token[:16] + "..."` 截断前缀，并在前缀不唯一时返回 409。
8. **文件上传限制不足**：头像上传 `remote-main.py:1740` 缺少大小/MIME 限制；APK 上传 `remote-main.py:2596` 有扩展名和 SHA256，但也应纳入配额和审计。
9. **业务日期时区**：后端 `now_iso()` 使用 UTC，自动任务重生成用 `datetime.now(timezone.utc).date()`，见 `remote-main.py:1828`、`1961`、`2497`；中国机构凌晨可能跨日错位。

### 13.7 可优化方向

| 优化项 | 建议 |
|--------|------|
| 模块拆分 | 拆为 `models.py`、`schemas.py`、`auth.py`、`routes/*`、`services/task_generation.py`、`services/institution_sync.py` |
| DB 迁移 | 用 Alembic 替代 `Base.metadata.create_all()` + 手写 `ALTER TABLE` |
| 索引 | 已通过 `ensure_performance_indexes()` 增加 `care_records(institution_id, record_date, updated_at)`、`published_tasks(institution_id, record_date, caregiver_id, status)`、`sessions(token, revoked, expires_at)` |
| 轮询负载 | 增加 `updatedAfter`、ETag、游标分页，或改 WebSocket/SSE 推送 |
| JSON 大字段 | 证据文件、照片、日报详情拆表或对象存储，列表接口只返回摘要 |
| 登录安全 | `auth_login()`、`admin_login()` 增加失败限速、账号锁定、审计日志 |
| API 响应 | 统一 `{status, item/items, fetchedAt}` envelope，减少前端兼容分支 |
| 部分任务重生成 | `regenerate_tasks_for_elders()` 当前仍调用完整生成后过滤，见 `remote-main.py:1581`；可真正按 elder ids 查询和 upsert |
| 主键 | `add_elder()` 使用 4 位随机数，见 `remote-main.py:1673`；建议改 UUID 或机构内序列号 |

### 13.8 2026-05-14 老人分配后护工任务中心刷新修复

问题链路：

```
director-care-plans 页面拖拽/点击分配老人
  -> main.js:2039 reassign-elder-caregiver
  -> main.js:2228 drop handler
  -> state.js:4492 reassignElderCaregiver()
  -> state.js:4526 reassignElderToCaregiver()
```

当前契约：

- `POST /api/elder-assignment` 是老人默认负责人变更的唯一云端写入口；前端只能调用 `state.js syncElderAssignmentToCloud()` -> `cloudApi.js assignElderCaregiver()`，不能再用 `uploadPublishedTask()` 或 `uploadInstitutionState()` 自己拼负责人同步。
- 后端 `main.py assign_elder_caregiver()` 必须先更新 `institution_states.personnel_info/raw_payload` 里的 `assignedCaregiverId`，再调用 `regenerate_tasks_for_elders()` 补齐该老人当天任务，最后把该老人当天 `pending` 任务的 `caregiverId/defaultCaregiverId` 改成目标护工。
- `generate_tasks_for_date()` 只能使用快照里的非空 `assignedCaregiverId` 覆盖 `elders.assigned_caregiver_id`；快照为空不能清空数据库负责人，否则下一次任务生成会把刚分配的负责人冲掉。
- 后端写 `InstitutionStateTable.personnel_info/raw_payload` 这种 JSON 字段后必须 `flag_modified()`，否则 SQLite/SQLAlchemy 可能不持久化嵌套对象修改。
- 护工档案里的 `caregivers.floor` 只是常驻/默认楼层展示字段，不能作为能否负责某楼层老人的硬限制。护工可以跨楼层负责老人，也可以被院长发布到其它楼层做特殊任务。
- 院长端 `renderFloorStaffDetail()` 的“任务分配”面板只能按当前楼层老人 `elders.assignedCaregiverId` 反推出实际负责人；不能只用 `caregiver.floor === 当前楼层` 过滤护工，不能再从 `published_tasks.caregiverId/defaultCaregiverId` 反推默认负责人，也不能用楼层轮转 fallback 伪造分配。否则会出现“护工常驻 1F，但负责 2F 老人时，2F 面板看不到该护工”的错觉。
- 后端 `_resolve_caregiver_for_elder()` 必须只使用显式 `assigned_caregiver_id`，不要求同楼层；老人未指定负责人时返回空，不能用 `caregivers.floor` 自动兜底到护工端。`POST /api/elder-assignment` 也不能拒绝跨楼层分配，只能校验同机构。
- 院长端登录/刷新人员时，`state.js _loadCloudPersonnel()` 必须同时拉 `/api/caregivers`、`/api/elders`、`/api/auth/users`。`/api/elders` 返回的 `assignedCaregiverId` 是任务分配面板的前端事实源；只拉共享快照会导致旧 `institution_states.personnelInfo.elders` 空负责人把页面显示成“暂无负责房间”。
- `applyInstitutionStateSnapshot()` 只能把共享快照当兼容数据。若本地已从 `/api/elders` 得到非空 `assignedCaregiverId`，快照里的空值不能覆盖它；`loadDirectorInitialData()` 在拉共享快照后还要再拉一次 `_loadCloudPersonnel()`，确保事实表优先。
- 护工端只读 `GET /api/tasks?institutionId=...&caregiverId=...&recordDate=...`；所以“护工端能看到几个老人”取决于云端 `published_tasks` 里该护工当天任务覆盖了几个 `elderId`，不是只看本地 `assignedCaregiverId`。
- 养老院数据必须按 `institutionId` 隔离。`inst-001` 不能混入 `elder-demo-*` / `caregiver-demo-*`，跨机构老人分配应由后端返回 403。

云端对应：

- `elders.assigned_caregiver_id` 是默认负责人事实表。
- `institution_states.personnel_info/raw_payload.personnelInfo.elders[].assignedCaregiverId` 是前端共享快照，必须和事实表保持一致，但不能用空值覆盖事实表；显示任务分配前必须以 `/api/elders` 为准修正本地 `state.elders`。
- `published_tasks.caregiver_id/default_caregiver_id` 是护工端任务列表事实表；分配老人时必须保证该老人当天任务存在并写到目标护工。
- 未分配老人仍可有院长端可见的日常任务，但 `published_tasks.caregiver_id/default_caregiver_id` 必须为空；员工端不得看到这些任务。

### 13.9 2026-05-18 库存系统云端闭环

目标：

- 院长端配置当前养老院有哪些消耗品、分类、单位、当前数量、预警线和存放位置，不维护规格。
- 护工端记录使用了哪个库存、数量、护工和备注，不关联老人。
- 云端在同一事务中写入使用流水并扣减库存，院长端刷新后能看到“谁在什么时候用了什么、用了多少”。

云端事实表：

- `inventory_items`：库存品项事实表，按 `institution_id` 隔离，是养老院全局变量；字段包括 `name/category/unit/quantity/warning_quantity/location/status`，不按日期索引。
- `inventory_usages`：库存使用流水表，按 `institution_id + used_at 日期 + item_name/item_id` 查询；字段包括 `item_id/item_name/category/quantity/unit/caregiver_id/caregiver_name/note/used_at`。

云端接口：

- `GET /api/inventory/items?institutionId=...`：院长端和护工端读取可用库存。
- `POST /api/inventory/items`：院长端新增或调整库存数量。
- `GET /api/inventory/usages?institutionId=...&recordDate=...&itemName=...&limit=...`：院长端按日期和消耗品名称读取库存使用流水。
- `POST /api/inventory/usages`：护工端提交使用记录；后端校验库存存在、同养老院、数量充足，然后扣减 `inventory_items.quantity` 并新增 `inventory_usages`。

前端入口：

- 院长端 `director-inventory`：展示库存数量、预警和使用流水；库存名片整体可点击，弹窗直接展示单物资消耗趋势，并提供“调整库存、删除物资”。
- 调整库存必须是独立弹窗，上方提供“增加/减少”两个按钮，下方只输入数量；不能复用新增/编辑物资表单，否则会让院长在只想调整数量时误改基础档案字段。
- 护工端 `inventory-usage`：只提交消耗品、数量和备注；动作在 `state.js openCaregiverInventoryUsage/submitInventoryUsage`。

不可破坏约束：

- 不要把库存继续塞进日报 `care_records.inventory`，该字段只是日报里的“是否需补货”提醒，不是库存事实表。
- 不要用 `institution_states` 快照维护库存数量；库存数量必须以 `inventory_items.quantity` 为准。
- 护工端只允许通过 `POST /api/inventory/usages` 扣减库存，不能直接覆盖库存数量。
- 不要恢复规格字段，也不要在库存使用里恢复“关联老人”；库存消耗和老人任务记录是两条独立业务线。

### 13.10 2026-05-14 院长护理方案时间轴重复日报任务修复

现象：
- 李美兰员工端完成 `房间整理` 后，院长端 `老人护理方案 -> 日报任务时间轴` 同一老人出现两条 `房间整理`：一条超时、一条已完成；其他日报任务也成对出现。

源码定位：
- `caregiver-app/src/pages/directorPage.js:3560` `renderDirectorCarePlansPage()` 渲染院长端老人护理方案页面。
- `caregiver-app/src/pages/directorPage.js:3640` 调用 `renderPlanTimelineSidebar(selectedPlan, selectedResident, isTimelineOpen, state.tasks, state)`。
- `caregiver-app/src/pages/directorPage.js:1747` `renderPlanTimelineSidebar()` 生成右侧日报任务时间轴。
- `caregiver-app/src/pages/directorPage.js:1727` `getVisibleReportTimelineTasks()` 负责按老人、日期和展示 key 过滤日报任务。
- `caregiver-app/src/pages/directorPage.js:1666` `renderDirectorTimelineTaskEntry()` 渲染单条时间轴任务卡片。

根因：
- 原 `renderPlanTimelineSidebar()` 只按 `source === "report-template"` 和 `elderId === resident.id` 过滤，未按 `recordDate/state.director.date` 过滤。
- 院长端云端任务刷新会把多日期任务合并到 `state.tasks`，导致旧日期的超时任务和当前日期的已完成任务同时出现在同一个老人时间轴里。

修复：
- `getVisibleReportTimelineTasks()` 只展示当前院长业务日期的日报任务；没有 `recordDate` 的历史兼容任务仍保留。
- `getTimelineTaskDisplayKey()` / `preferTimelineTask()` 对同一老人、同一模板、同一标题、同一时间的日报任务做展示去重；优先当前日期，其次较新的 `updatedAt/completedAt/publishedAt`，再优先已处理状态。
- 本修复只影响院长端护理方案时间轴展示，不修改员工端打卡逻辑，也不改云端 `published_tasks` 数据结构。

### 13.11 院长护理方案详情板块删除

现象：
- “老人护理方案”页中间的详情/空态板块操作价值低，且容易把“护理方案”误解为日常任务唯一来源。
- 当前页面主视角改为“楼层 → 切换老人 → 护工负载柱状图”，把真实可用的容量信息放大到整屏。

源码定位：
- `caregiver-app/src/pages/directorPage.js` `renderDirectorCarePlansPage()`：不再渲染选中老人详情卡；未展开时间轴时直接展示放大的“切换老人”和“护工负载”区域。
- `caregiver-app/src/pages/directorPage.js` `renderCaregiverLoadChart()`：护工负载用柱状图展示已处理、待办、异常，不再在该页塞旧“任务分配”列表。
- `caregiver-app/src/main.js` `renderDirectorPlanPreviewInPlace()`：只保留老人卡 active 状态与滚动恢复，不再局部替换已删除的详情卡。
- `caregiver-app/src/styles/pages.css`：`director-panel--resident-picker-large`、`director-plan-resident-strip--large`、`director-panel--load-chart`、`director-load-chart-row` 控制放大布局和柱状图。

产品规则：
- 不要恢复 `renderSelectedPlan()` 这种中间详情/空态卡；用户要求该板块删除。
- 不要把旧“任务分配”列表塞进护理方案页；该页只保留切换老人和护工负载容量图。
- 不要把日报模板改名为护理方案；`reportTemplateId` 是日常任务源，`elderCarePlans` 是个体化补充任务源。
- 不要新增“方案负责人”字段；责任护工继续使用 `assignedCaregiverId` 和云端 `published_tasks.caregiverId/defaultCaregiverId`。

### 13.12 2026-05-14 APK v4.24 发布记录

发布目的：
- 将 `13.9` 的院长端日报任务时间轴重复展示修复发布到 Android APK。
- 由于云端已有 `versionCode=63 / versionName=4.23`，本次递增到 `versionCode=64 / versionName=4.24`，确保手机端检查更新能识别为新版本。

源码定位：
- 版本号来源：`caregiver-android/gradle.properties`，字段 `appVersionCode=64`、`appVersionName=4.24`。
- 构建入口：`caregiver-android/gradlew.bat clean assembleDebug`。
- APK 产物：`caregiver-android/app/build/outputs/apk/debug/app-debug.apk`。
- 发布脚本：`scripts/publish_apk.ps1`，读取 `gradle.properties` 版本号并调用 `POST /api/app-releases`。
- 云端发布接口：`remote-main.py:2596` `create_app_release()`。
- APP 检查更新链路：`main.js:1575` `check-app-update` → `state.js:1955` `checkAppUpdate()` → `cloudApi.js:225` `fetchLatestAppRelease()` → `remote-main.py:2677` `get_latest_app_release()`。

本版本包含：
- `caregiver-app/src/pages/directorPage.js:1727` 当前业务日期过滤和展示去重，修复同一老人同一日报任务显示旧日期超时 + 当前日期已完成两条的问题。

### 13.13 2026-05-18 护工护理记录时间轴横排与刷新防跳动

现象：
- 护理记录里的只读“今日时间轴”卡片隐藏完成按钮后，仍保留两列网格，导致“需要拍照”和任务标题被挤成竖排。
- 护工点击“刷新记录”时，自动护理记录会先写入待同步态再写入云端同步态，多次 `notify()` 重渲染导致列表上下跳动。

修复：
- `caregiver-app/src/pages/taskDetailPage.js`：只读时间轴卡片增加 `is-readonly` 标记。
- `caregiver-app/src/styles/pages.css`：`.timeline-compact-task__card.is-readonly` 改为单列布局，`.task-require-photo` 强制横排。
- `caregiver-app/src/main.js`：`sync-auto-care-record` 点击前记录当前卡片锚点，并调用 `syncCaregiverAutoCareRecord(value, { deferNotify: true })`。
- `caregiver-app/src/store/state.js`：`syncCaregiverAutoCareRecord(elderId, options)` 支持跳过中间态重渲染，减少刷新过程中的滚动位移。

### 13.14 2026-05-18 云端任务分配事实与楼层类型约束

云端审查结论：
- 2026-05-18，`inst-001` 下李美兰是 `caregiver-02`，云端 `published_tasks` 已分配任务：共 37 条，其中 pending 34 条、completed 3 条、requirePhoto 14 条。
- 因此“待办任务 34 项”不是凭空产生，也不是云端没给李美兰分配任务；它来自 `GET /api/tasks?institutionId=inst-001&recordDate=2026-05-18&caregiverId=caregiver-02`。
- 页面出现“34 项待办但没有待办楼层”的根因是前端楼层口径不一致：任务统计直接按 `caregiverId` 计数，而楼层卡片按 `elder.floor === floor` 严格比较；云端/快照链路里 `floor` 可能以字符串 `"1"` 到达，前端楼层枚举是数字 `1`，导致聚合为 0。

云端数据结构约束：
- `elders.floor` 和 `caregivers.floor` 在后端表结构是 Integer，但经 `/api/institution-state` 快照、旧数据或 JSON 合并进入前端时，前端必须兼容字符串数字。
- `published_tasks.elder_floor` 是 String，任务列表可用它作为老人事实表缺失时的楼层兜底，但不能把它反写成老人事实表。
- 护工端任务中心顶部统计、楼层卡片、房间列表必须使用同一日期、同一 `caregiverId`、同一楼层归一化规则。

前端修复：
- `caregiver-app/src/store/state.js` 增加 `normalizeFloorNumber()`，合并云端 caregivers/elders 时把楼层统一成数字。
- `normalizeCloudTask()` 必须保留 `elderName/elderRoom/elderBed/elderFloor`，否则护工端初次加载任务早于人员快照时无法用任务自带楼层兜底。
- `floorSummaries` 统计先读 `getElderById(task.elderId).floor`，缺失时用 `task.elderFloor` 兜底，避免“任务存在但楼层卡片为空”。
- `floorRooms` 必须从护工当日 `caregiverTasks` 聚合房间，`state.elders` 只做补充；否则任务先于人员快照到达时会出现“楼层有待办，进入后房间列表为空”。
- `setCurrentRoom()` 和 `openCaregiverElderRecordTasks()` 也使用数字楼层和任务兜底，避免进入房间/记录页后再次出现字符串与数字比较问题。

### 13.15 2026-05-18 APK v4.84 发布记录

发布目的：
- 将 `13.13` 护理记录时间轴横排与刷新防跳动修复、`13.14` 护工任务中心楼层/房间任务映射修复发布到 Android APK。
- 云端上一版为 `versionCode=123 / versionName=4.83`，本次递增到 `versionCode=124 / versionName=4.84`。

发布结果：
- 本地版本号来源：`caregiver-android/gradle.properties`，字段 `appVersionCode=124`、`appVersionName=4.84`。
- 构建与发布命令：`scripts/release_frontend_apk.ps1 -BaseUrl http://49.235.183.62 -ApiKey elder_safe_token_2026 -ReleaseNotes "修复护工任务中心楼层与房间任务映射，护理记录时间轴横排与刷新防跳动"`。
- 云端发布记录：`android-stable-124`。
- APK URL：`http://49.235.183.62/static/releases/android/stable/elder-serve-android-stable-v124-4b263037a1f3.apk`。
- SHA256：`4b263037a1f32591b419e32468b47127be89baf114a71127a926bd9a728e9c28`。
- 已通过 `GET /api/app-releases/latest?platform=android&channel=stable&currentVersionCode=0` 校验云端最新版返回 `4.84 (124)`。

### 13.16 2026-05-19 护工任务记录统一视图与旧表删除

业务规则：
- `published_tasks` 是老人每日任务表的任务行，业务索引是 `institution_id + record_date + elder_id`，每天每个老人只有一张任务表。
- 护工不是任务表归属主体；护工只是在任务行上作为负责/操作人出现。
- 临时任务必须按老人和日期插入同一张老人每日任务表，不能另建护工任务表。
- “护理记录”和“任务完成记录”在业务展示上统一叫“护工任务记录”，它是护工对任务卡的操作流水。
- `task_completions`、`care_records`、`institution_states` 已从后端物理表中删除；旧接口保留但只返回 `410 Gone`。

源码定位：
- `remote-main.py build_caregiver_task_records()`：统一聚合护工任务记录。
- `remote-main.py drop_deprecated_tables()`：启动时 `DROP TABLE IF EXISTS task_completions/care_records/institution_states`。
- `GET /api/caregiver-task-records`：普通只读接口，支持 `institutionId/caregiverId/elderId/recordDate/taskId` 过滤。
- `GET /api/admin/tables/caregiver_task_records`：超管“数据库总览”里的虚拟只读表。
- `static/admin.html renderCaregiverTaskRecordsRawTable()`：第一层按 `日期 + 护工` 汇总成“护工每日任务记录表”，只显示表数量、涉及老人、文字/图片/异常摘要；点开详情才展示具体任务卡操作流水。
- `remote-main.py _published_task_sheet_count()` / `_caregiver_record_sheet_count()`：超管下拉括号数量显示“表数量”，不是任务卡/操作行数量。
- `static/admin.html`：移除左侧“护理记录”独立菜单，数据库总览不再列出 `task_completions/care_records/institution_states`。

事实源：
- 打卡完成：`published_tasks.status/completedAt`。
- 文字/图片记录：`published_tasks.raw_payload.recordNote/recordEvidence`。
- 任务卡异常：`published_tasks.raw_payload.exceptionNote/exceptionType/exceptionEvidence` 和 `status=risk/refused`。
- 快速异常：`anomalies`，不依附任务卡，但进入护工任务记录视图。

禁止再犯：
- 不要再把 `care_records` 当成任务卡操作事实源；它是日报/交班归档视图。
- 不要再按 `caregiver_id + record_date` 创建护工自己的任务表；护工记录只能引用老人每日任务表里的任务行。
- 不要从 `task_completions/care_records` 反推老人默认负责人。
- 不要让管理端列表全量加载图片 base64；图片只显示数量，详细图片按需读取。
- 超管“任务记录”和“护工任务记录”的第一层只能显示“每日任务表/每日任务记录表”的数量；任务卡数量和操作行数量只能放到详情弹窗内。
- 不要重新启用 `/api/care-records`、`/api/task-completions`、`/api/institution-state`；前端全面升级后必须改用独立事实表和 `/api/caregiver-task-records`。

### 13.17 2026-05-19 超管机构与异常事件业务表展示

业务规则：
- 超管“数据库总览”的 `institutions` 不是 JSON 浏览器，必须显示为养老院机构业务表格：机构名称、机构 ID、楼层、状态、存储配额、已用存储、创建/更新时间。
- `anomalies` 逻辑上是异常任务卡和快速异常的总结，不是单纯 `anomalies` 物理表行。
- 异常事件第一层按老人名字/老人 ID 索引，不按日期索引；详情中再列出异常任务卡、提交异常的护工、快速异常、异常类型、说明和图片数量。

源码定位：
- `remote-main.py build_admin_anomaly_records()`：聚合 `published_tasks` 任务卡异常与 `anomalies` 快速异常。
- `remote-main.py admin_read_table(table_name=\"anomalies\")`：超管读取异常事件时返回聚合记录，不直接铺物理异常表。
- `static/admin.html renderInstitutionsRawTable()`：养老院机构专用业务表格，不再显示 JSON 详情。
- `static/admin.html renderAnomaliesRawTable()` / `renderAnomalyGroupDetailTable()`：老人维度异常汇总与详情。

禁止再犯：
- 不要把 `institutions.floors` 原始 JSON 直接展示给用户；必须转换成可读楼层文本。
- 不要把异常事件只按 `anomalies` 物理表显示，否则会漏掉任务卡异常。
- 不要给异常事件第一层加日期索引；日期只作为详情里的异常发生/提交时间。

### 13.18 2026-05-19 任务卡异常误判修复

现象：
- 超管“护工任务记录”里大量待完成任务显示为“任务卡异常”，但“任务记录”详情里这些任务状态仍是 `pending`。
- 具体样例：`report-2026-05-18-elder-202-test-meal-care-test-water` 状态为 `pending`，但旧 `raw_payload.exceptionNote` 被污染成“饮食照料 · 日报自动生成”。

根因：
- `remote-main.py build_caregiver_task_records()` 和 `build_admin_anomaly_records()` 把 `payload.exceptionNote` / 旧 `payload.exception` 当成异常依据。
- 历史任务里该字段可能保存普通备注或自动生成说明，不代表护工提交了异常。

修复：
- 新增 `remote-main.py _task_has_real_exception()`。
- 真实任务卡异常只认 `published_tasks.status=risk/refused`。
- `exceptionNote/exceptionType/exceptionEvidence` 只能在已经判定真实异常后作为说明展示，不能单独触发异常记录。

禁止再犯：
- 不要用 `note`、`recordNote`、`exceptionNote`、`exceptionType`、`exceptionEvidence`、旧 `exception` 单独判断任务异常。
- 待完成 `pending` 任务即使残留异常字段，护工任务记录也不能显示“任务卡异常”；这类残留只能作为待后续清理的脏字段。
### 13.19 2026-05-19 前端旧表接口移除与新信息流适配

范围：
- 不改页面布局和 UI，只替换前端数据流。
- `caregiver-app/src/main.js` 的路由和 `director-care-records` 页面名称继续保留，避免影响现有导航。

源码定位：
- `caregiver-app/src/utils/cloudApi.js`：新增 `fetchCaregiverTaskRecords()`，移除旧 `/api/care-records`、`/api/task-completions`、`/api/institution-state` 封装。
- `caregiver-app/src/store/state.js`：`refreshDirectorCloudReports()` 改读 `/api/caregiver-task-records`，并把护工操作流水按 `recordDate + elderId + caregiverId` 映射成旧收件箱展示对象。
- `caregiver-app/src/store/state.js`：`completeTask()` 不再写 `task_completions`；任务完成只通过 `syncCaregiverTaskToCloud()` 写 `published_tasks.status/completedAt`。
- `caregiver-app/src/store/state.js`：`submitCaregiverDailyReport()` / `syncCaregiverAutoCareRecord()` 不再写 `care_records`，只同步相关任务卡并刷新本地展示。
- `caregiver-app/src/store/state.js`：`persistInstitutionSharedState()` / `refreshInstitutionSharedState()` 保留函数名但内部只刷新 `institution/caregivers/elders/users/daily_report_templates` 事实表，不再调用旧快照接口。
- `caregiver-app/src/store/state.js`：`serializeCloudTask()` 必须携带 `completedAt`、`recordNote`、`recordEvidence`、`exceptionNote`、`exceptionEvidence`、`exceptionReportedAt`，否则 `/api/caregiver-task-records` 聚合不到护工操作记录。

禁止再犯：
- 不要在前端重新添加 `uploadCareRecord/fetchCareRecords/createTaskCompletion/fetchTaskCompletions/uploadInstitutionState/fetchInstitutionState`。
- 不要为了兼容旧页面偷偷调用返回 `410 Gone` 的接口。
- 不要把“日报收件箱”的路由名当成 `care_records` 仍存在的证据；它只是旧 UI 壳，事实源是护工任务记录聚合视图。

验证方式：
- `rg "care-records|task-completions|institution-state|fetchCareRecords|uploadCareRecord|createTaskCompletion|fetchInstitutionState|uploadInstitutionState" caregiver-app/src` 只能命中路由/CSS 名称，不得命中可调用 API 封装。
- 打卡、文字记录、异常记录后，云端 `GET /api/tasks` 应看到 `published_tasks` 状态和 raw payload 变化。
- 院长端日报收件箱刷新应请求 `/api/caregiver-task-records`，不再出现旧接口 `410 Gone`。

### 13.20 2026-05-19 云端任务记录/异常记录清理与任务生成旧快照残留修复

操作：
- 已备份服务器数据库到 `/home/ubuntu/elder_backend/elder_care.before_clear_records_20260519T025039Z.db`。
- 已删除云端 `anomalies` 快速异常记录。
- 已清除 `published_tasks` 中的操作记录字段：完成时间、文字记录、图片记录、任务卡异常字段，并把已完成/异常任务状态重置为 `pending`。
- 未删除 `published_tasks` 任务卡本身。

结果：
- 清理前 `tasksWithStatusOrNoteBefore=326`，清理后 `tasksWithStatusOrNoteAfter=0`。
- 清理前 `tasksWithRawOperationBefore=309`，清理后 `tasksWithRawOperationAfter=0`。
- `rawPayloadRowsUpdated=327`，`statusRowsReset=326`。
- `GET /api/caregiver-task-records?institutionId=inst-001` 返回空数组。
- `GET /api/anomalies?institutionId=inst-001` 返回空数组。
- `GET /api/tasks?institutionId=inst-001&recordDate=2026-05-19` 正常返回任务卡，状态为 `pending`。

顺手修复：
- `remote-main.py generate_tasks_for_date()` 仍残留旧 `institution_states` 快照变量 `personnel`，导致 `/api/tasks` 在触发自动生成时 500。
- 已移除从快照补护工和 `_apply_personnel_snapshot_assignments(elders_all, personnel)` 的调用；任务生成只能读取事实表 `caregivers/elders/daily_report_templates`。
- 已部署到 `/home/ubuntu/elder_backend/main.py`，`py_compile` 通过，`elder.service` 已重启且状态 `active`。

禁止再犯：
- 不要在 `generate_tasks_for_date()` 里使用 `personnel`、`institution_states` 或快照字段兜底生成护工/负责人。
- 清理任务记录时不要删除 `published_tasks` 行，否则老人每日任务表会丢失。

### 13.21 2026-05-19 旧护理方案任务来源删除与模板下拉事实源修复

现象：
- 超管“任务记录”详情中出现 `协助喂药`、`早餐助餐`，但这些不是护工任务记录，而是 `published_tasks` 里的旧 `source=plan` 任务卡。
- 院长端老人编辑下拉显示 3 个日报模板，而超管 `daily_report_templates` 只有 2 个实例模板。

根因：
- 云端仍有旧护理方案任务卡：`source=plan`、`plan_id=plan-102`、`template-feed-breakfast/template-medication`。
- 前端人员编辑弹窗会把当前老人身上已失效的 `reportTemplateId` 临时插入下拉，导致 `daily-report-qinghe-basic` 这种不在云端实例模板表里的历史 ID 也显示出来。
- `mockData.js` 仍把旧 `elderCarePlans` 作为初始 state，容易让旧护理方案概念继续污染页面理解。

修复：
- 云端删除 `inst-001` 下 14 条 `source=plan` 旧任务卡。
- 云端修正 5 个绑定缺失模板 ID 的老人，统一改为存在的 `daily-report-basic`。
- `remote-main.py generate_tasks_for_date()` 移除 plan-based task 生成阶段，只保留日报实例模板生成任务。
- `directorPage.js` 老人编辑模板下拉只显示 `selectors.dailyReportTemplateOptions`，不再插入历史失效模板 ID。
- `mockData.js createMockState()` 初始 `dailyReportTemplates` 和 `elderCarePlans` 改为空，避免离线 seed 旧护理方案。

验证：
- `GET /api/tasks?institutionId=inst-001&elderId=elder-102&recordDate=2026-05-18` 返回空数组。
- SQL：`published_tasks where source='plan'` 为 0。
- SQL：老人绑定不存在模板的数量为 0。
- 云端实例模板仍为 2 个：`daily-report-basic`、`daily-report-smoke`。
- 后端已部署，`elder.service active`。
- 前端 APK 已发布并安装：`versionName=4.90`，`versionCode=130`。

禁止再犯：
- 不要恢复 `source=plan` 护理方案任务生成。
- 临时任务直接写 `published_tasks`，不要通过 `elderCarePlans` 中转。
- 老人模板下拉只以 `daily_report_templates` 为事实源。

### 2026-05-19 日报模板拆分为基础模板和实例模板

现象：
- 院长端“日报模板”导入目录看不到基础模板，用户质疑没有基础模板时实例模板从哪里生成。
- 老人编辑下拉只应该选择实例模板，不能把基础模板当成可绑定模板。

根因：
- 旧逻辑没有显式区分基础模板和实例模板，后台曾按 `source` 或历史标题猜测模板类型。
- 导入基础模板后如果沿用原模板 ID，会把“模板定义”误当成“养老院实际配置”，后续任务生成也可能误读基础模板。

修复：
- `remote-main.py DailyReportTemplateRequest` 增加 `templateType` 和 `baseTemplateId`。
- `GET /api/daily-report-templates` 支持 `templateType=base|instance`；`generate_tasks_for_date()` 只读取 `templateType="instance"`。
- 院长端导入弹窗只拉 `templateType=base`；导入时新建 `templateType="instance"` 的实例模板，并写入 `baseTemplateId`。
- 院长端老人编辑模板下拉只拉 `templateType=instance`，基础模板不会出现在老人绑定列表。

验证：
- `GET /api/daily-report-templates?institutionId=inst-001&templateType=base` 返回基础模板 `base-daily-report-basic`。
- `GET /api/daily-report-templates?institutionId=inst-001&templateType=instance` 返回实例模板，当前为 `daily-report-basic` 和 `daily-report-smoke`。
- 后端已部署，`elder.service active`。

禁止再犯：
- 基础模板只能用于导入，不能绑定老人，不能生成任务。
- 实例模板必须由基础模板复制调整后保存，保存时必须生成新实例 ID，不能覆盖基础模板 ID。
- 任务生成、老人模板下拉、护工端任务拉取都只能使用实例模板。

### 2026-05-19 删除废弃 `daily-report-smoke` 测试实例模板

现象：
- 云端实例模板列表里仍有 `daily-report-smoke`，这是早期接口 smoke 测试数据，不应出现在院长端可选模板中。

处理：
- 删除前检查 `elders.report_template_id = 'daily-report-smoke'`，结果为 0，没有老人绑定该测试模板。
- 已备份云端数据库到 `/home/ubuntu/elder_backend/backups/elder_care_before_delete_daily_report_smoke_20260519T080442Z.db`。
- 已从 `daily_report_templates` 删除 `inst-001 / daily-report-smoke`。

验证：
- `GET /api/daily-report-templates?institutionId=inst-001&templateType=instance` 只返回 `daily-report-basic`。
- `GET /api/daily-report-templates?institutionId=inst-001&templateType=base` 仍返回 `base-daily-report-basic`。
- `elder.service active`。

禁止再犯：
- 不要把接口 smoke 测试模板写入正式调试机构的实例模板目录。
- 新增测试模板必须使用独立测试机构或测试后立即清理，不能让老人下拉和任务生成读到测试模板。

### 2026-05-19 院长端云端模板导入机构列表与实例层级修复

现象：
- 院长端“导入云端模板”弹窗显示青禾、三湘、株洲等多个养老院，但当前云端只保留 `inst-001`。
- 默认选中旧 demo 机构时显示“这个养老院暂无云端模板”，看起来像没有读取到云端基础模板。
- 已保存实例模板列表只平铺显示，不能看出实例模板来自哪个基础模板。

根因：
- `state.js` 里遗留 `DEFAULT_REPORT_TEMPLATE_IMPORT_INSTITUTIONS`，导入弹窗把这些本地硬编码机构和云端返回机构合并。
- 打开导入弹窗时会复用上次选择的机构或旧默认机构，即使该机构没有基础模板。
- 实例模板 UI 只显示 `state.dailyReportTemplates` 平铺列表，没有按 `baseTemplateId` 关联基础模板目录。

修复：
- 删除导入弹窗对硬编码 demo 机构的依赖；机构列表只来自 `GET /api/daily-report-templates?templateType=base` 返回的 `institutions/items`。
- 打开和刷新导入目录时，自动选择当前机构下有基础模板的机构，否则选择第一个有基础模板的机构。
- `selectors.dailyReportTemplateHierarchy` 按 `baseTemplateId` 分组实例模板；编辑器底部显示“基础模板 -> 实例模板”的层级结构和父模板 ID。

验证：
- 云端 `templateType=base` 只返回 `base-daily-report-basic / inst-001`。
- 云端 `templateType=instance` 只返回 `daily-report-basic`，且 `baseTemplateId=base-daily-report-basic`。
- 前端 APK 发布后，导入弹窗不应再显示青禾、三湘、株洲等旧机构。

禁止再犯：
- 院长端导入模板机构列表不能再使用本地硬编码机构清单；只能由云端基础模板目录反推。
- 实例模板必须显示父基础模板，不要再平铺到看不出来源。

### 2026-05-19 超管后台日报模板层级显示补齐

现象：
- 用户要求“云端实例模板需要显示父模板层级”，上次只改了 APP 院长端编辑器，超级管理员后台“数据库总览 -> 日报模板”仍是平铺列表。

根因：
- APP 院长端和超管后台是两个独立前端：APP 在 `caregiver-app/src/pages/directorPage.js`，超管后台在 `static/admin.html`。
- `static/admin.html renderReportTemplatesRawTable()` 只按行展示 `daily_report_templates`，没有用 `template.baseTemplateId` 建树。

修复：
- `static/admin.html` 增加 `getReportTemplateType()`、`getReportTemplateBaseId()`、`sortReportTemplatesAsTree()`。
- 超管“数据库总览 -> 日报模板”改为按“基础模板 -> 实例模板”渲染，实例模板缩进显示，并新增“父模板”列。
- 模板详情弹窗增加“父基础模板/基础模板只供导入”的摘要信息。
- 已部署到 `/home/ubuntu/elder_backend/static/admin.html`。

验证：
- `http://49.235.183.62/admin` 页面内容已包含 `template-tree` 和“按基础模板 -> 实例模板层级展示”。
- `elder.service active`。

禁止再犯：
- 涉及“超管后台”时必须改 `static/admin.html`，不能只改 APP 院长端。
- 日报模板在超管后台也必须按 `template.templateType` 和 `template.baseTemplateId` 显示层级，不能只平铺表行。

### 2026-05-19 院长端实例模板编辑与保存停留页修复

现象：
- 院长端只能通过“导入基础模板”生成实例模板，用户感知上不能稳定编辑已有实例模板。
- 连续生成两个同名实例模板时，第一个会被第二个覆盖。
- 点击“保存模板”同步成功后，编辑器关闭并回到日报日历页面，用户需要重新进入。

根因：
- `saveDailyReportTemplateDraft()` 新建实例时用标题 slug 生成 ID，例如 `daily-report-测试日报模板-15项`，同名保存会命中同一个 ID 并覆盖旧实例。
- 保存成功后主动清空 `state.ui.directorReportTemplateDraft` 和 `directorReportTemplateEditingId`，导致编辑器关闭。

修复：
- 新建实例模板时优先保留导入阶段生成的唯一草稿 ID；若没有唯一 ID，则用 `institution + titleSlug + Date.now()` 生成，允许同名实例并存。
- 编辑已有实例模板时继续使用原 `editingId`，保存后版本号递增。
- 保存后不关闭编辑器，而是用云端返回的模板刷新当前草稿，设置 `directorReportTemplateEditingId` 为当前实例 ID，并只显示同步成功提示。

验证：
- 前端 APK 发布后，连续导入同一基础模板并保存两个同名实例，不应互相覆盖。
- 点击实例模板层级里的实例项应能打开并编辑该实例。
- 保存成功后仍停留在“编辑日报模板”页面，不回到日历。

禁止再犯：
- 实例模板 ID 不能由标题单独决定；标题不是唯一键。
- 保存云端成功不能清空编辑器状态，除非用户点“取消/关闭”。

### 2026-05-19 院长端新建实例与编辑实例模式拆分

现象：
- 进入“编辑日报模板”页面时自动加载已有实例模板，导致用户想新增子模板时实际上在修改旧实例。
- 页面没有取消已选实例的入口，也没有明确“新建/编辑”模式提示。

根因：
- `openDailyReportTemplateEditor()` 无参数打开时默认取 `Object.values(state.dailyReportTemplates)[0]` 作为草稿，并设置 `directorReportTemplateEditingId`。
- 已有实例卡片既承担展示又隐含当前编辑对象，用户无法判断保存会新建还是覆盖。

修复：
- 无参数打开模板编辑器时创建空白新建草稿，不再自动选中任何实例模板。
- 点击实例卡片时才调用 `openDailyReportTemplateEditor(tpl, { editExisting: true })` 进入编辑模式。
- 增加“新建实例”按钮，可从当前草稿另存为新实例并清空 `directorReportTemplateEditingId`。
- 顶部显示“新建实例模板/编辑实例模板”和当前模式；实例卡片只有当前编辑项显示“正在编辑”。

验证：
- 进入页面默认显示“当前模式：新建实例”，实例列表不应有正在编辑状态。
- 点击“编辑此实例”后才进入编辑模式。
- 点击“新建实例”后再次保存应生成新模板，不覆盖旧实例。

禁止再犯：
- 模板编辑器默认入口不能自动选择第一个实例模板。
- 列表展示不能等同于当前编辑状态；当前编辑状态只能由 `directorReportTemplateEditingId` 决定。

### 2026-05-19 新建实例与导入基础模板合并

现象：
- 院长端同时显示“新建实例”和“导入模板”，概念重复。
- 当前模式里显示父模板英文 ID，例如 `base-daily-report-basic`，不利于业务理解。

根因：
- “新建实例”原本只是把当前草稿另存为新 ID，没有强制选择基础模板。
- 当前模式文案直接输出 `draft.baseTemplateId`，没有从基础模板目录反查中文标题。

修复：
- `new-report-template-instance` 改为打开基础模板选择弹窗；选择基础模板后由 `applyDailyReportTemplateImport()` 生成新实例草稿。
- 编辑器顶部只保留“新建实例”按钮，不再单独显示“导入模板”按钮。
- 当前模式父模板显示优先使用基础模板中文标题；实例列表的父模板信息也显示父模板名称。

验证：
- 点击“新建实例”应弹出“导入云端模板”对话框。
- 选择基础模板后进入新建实例草稿。
- 当前模式显示“父模板 基础日报模板（15项）”，不直接显示英文 ID。

禁止再犯：
- 新建实例不能绕过基础模板选择。
- 面向院长端的父模板展示优先显示业务名称，不能默认暴露内部 ID。

### 2026-05-19 编辑老人日报模板未同步云端修复

现象：
- 院长端编辑老人时更改“日报”下拉并保存，重新进入编辑老人页面仍显示旧日报模板。

根因：
- `saveDirectorPersonnelDraft()` 保存老人只更新本地 `state.elders`，随后调用旧兼容 `persistInstitutionSharedState()`。
- 当前架构中老人事实源是云端 `elders` 表；旧快照不是事实源，所以重新加载 `/api/elders` 会用云端旧 `report_template_id` 覆盖本地选择。

修复：
- `cloudApi.js` 增加 `updateElder(id, payload, filters)`，调用 `POST /api/elders/{id}/update?institutionId=...`。
- `saveDirectorPersonnelDraft()` 编辑老人成功后直接写云端 `reportTemplateId/reportTemplateTitle` 以及姓名、房间、楼层等档案字段。
- 云端写入成功后调用 `_loadCloudPersonnel(state.institution.id)` 重新拉事实表；写入失败则回滚本地老人快照并提示错误。

验证：
- 修改老人日报模板后，`GET /api/elders?institutionId=inst-001` 对应老人 `reportTemplateId` 应变为新选择。
- 关闭并重新进入编辑老人页面，下拉应保留新选择。

禁止再犯：
- 老人档案字段变更必须写 `elders` 事实表接口，不能只写本地 state 或旧快照。
- `reportTemplateId` 不能通过任务或快照反推，只能以 `elders.report_template_id` 为准。
- `_loadCloudPersonnel()` 的参数只能是机构 ID 字符串，不能传 `{ silent: true }` 这类 options 对象，否则会用错误 `institutionId` 刷新人员事实表。

### 2026-05-19 超管老人档案业务表与任务时间轴入口

现象：
- 超管“数据库总览 -> 老人档案”只显示部分老人基础字段，并提供“查看 JSON”，无法直接看到老人当前绑定的日报任务，也无法从老人档案进入该老人当天任务时间轴。

业务确认：
- `published_tasks` 不是配置表，而是某个老人在某天生成的任务时间轴。
- 该时间轴一部分来自老人绑定的日报实例模板，另一部分来自院长临时任务，临时任务插入同一天同一老人的任务表。

修复：
- `static/admin.html renderEldersRawTable()`：老人档案改为业务表，显示老人基础信息、位置、护理等级、当前日报模板、默认负责人、家属联系和“查看任务时间轴”入口。
- `static/admin.html openElderTaskTimeline()`：点击后按当前日期和老人 ID 拉取 `published_tasks`，复用老人每日任务表详情，不显示 JSON。
- `remote-main.py admin_read_table()`：增加 `elderId` 精确过滤参数，避免用模糊搜索查老人任务时间轴。

验证：
- 超管登录后进入数据库总览，选择“老人档案”，不应再出现“查看 JSON”作为老人档案详情入口。
- 点击某个老人的“查看任务时间轴”，应显示该老人当前日期的任务行，来源列能区分“日报模板”和“临时分配”。

禁止再犯：
- 超管面向业务人员的老人档案不能默认暴露 JSON。
- 查看老人任务时间轴必须按 `institution_id + record_date + elder_id` 精确过滤 `published_tasks`。
- 不要把日报模板绑定本身误认为任务记录；任务记录是模板任务和临时任务生成后的每日任务实例。

### 2026-05-19 日报实例模板变更后旧任务卡残留修复

现象：
- 王大爷 `elder-101` 已绑定新的 5 项实例模板 `daily-report-inst-001-1779181833239 / 基础测试`，老人档案显示正确。
- 但超管“查看任务时间轴”仍显示旧 15 项日报任务卡，内容和当前子模板不一致。

根因：
- `generate_tasks_for_date()` 只 upsert 当前模板应该生成的任务行，但不会删除同一老人同一天由旧模板生成的日报任务行。
- `POST /api/elders/{elder_id}/update` 修改 `reportTemplateId` 后只保存老人事实表，没有重建该老人当天任务表。
- `POST /api/daily-report-template` 编辑已有实例模板后调用全量生成，但旧模板中不再存在的任务行仍残留。

修复：
- `remote-main.py _task_has_caregiver_operation()`：识别已被护工操作过的任务行，避免清理时丢失打卡/文字/图片/异常记录。
- `remote-main.py prune_stale_report_template_tasks()`：删除同一老人同一天未操作过的旧日报模板任务行，仅限 `source=report-template` 且 `template_group=daily-report`。
- `regenerate_tasks_for_elders()` 在生成当前模板任务后清理旧日报任务。
- `update_elder()` 当 `reportTemplateId` 变化时立即重建该老人当天任务表。
- `upsert_daily_report_template()` 编辑已被老人绑定的实例模板后按受影响老人重建当天任务表。

验证：
- 王大爷绑定 5 项实例模板后，`GET /api/tasks?institutionId=inst-001&recordDate=2026-05-19&elderId=elder-101` 应只返回当前实例模板应生成的 5 项日报任务，加上当天临时任务。
- 已经有操作记录的旧任务不会被删除，避免丢失护工操作审计。

禁止再犯：
- 改模板或改老人模板绑定不能只更新 `daily_report_templates/elders`，必须同步重建 `published_tasks` 当天老人任务表。
- 清理旧任务只能清理未操作过的日报模板任务，不能删除临时任务和已有操作记录。

### 2026-05-19 护工端真机看不到任务时间轴修复

现象：
- 云端 `inst-001 / caregiver-02 / 李美兰 / 2026-05-19` 通过 `GET /api/tasks?institutionId=inst-001&caregiverId=caregiver-02&recordDate=2026-05-19` 能查到任务，但真机护工端时间轴显示 0 项，虚拟手机同账号能看到。

根因：
- 护工端 `refreshCaregiverCloudTasks()` 和 `selectors().caregiverTasks` 复用了院长端 `state.director.date` 作为任务日期。
- 真机和虚拟机的本地状态/日期不一致时，护工端可能按错误日期查询；如果该日期返回 0 条，旧过滤逻辑会清掉该护工本地所有非临时任务，页面只剩空时间轴。

修复：
- `caregiver-app/src/store/state.js` 新增 `getCaregiverRecordDate()`，护工端任务查询和筛选使用独立 `state.ui.caregiverTaskRecordDate || Asia/Shanghai today`，不再依赖 `state.director.date`。
- `refreshCaregiverCloudTasks()` 只清理本次同步日期 `syncDate` 下该护工的本地任务，避免一次错误日期空响应清空其它日期任务。
- `taskDetailPage.js` 空时间轴显示查询日期、护工 ID、上次同步时间、同步错误和“手动刷新”按钮，方便真机直接定位日期/接口/缓存问题。

验证：
- 云端事实源确认：`GET /api/tasks?institutionId=inst-001&caregiverId=caregiver-02&recordDate=2026-05-19` 返回成功且有任务。
- 本机缺少 `node` 命令，无法执行 `node --check`；需以后续 APK 发布脚本构建结果作为前端语法验证。

禁止再犯：
- 护工端当天任务事实源只能是 `published_tasks` 按 `institutionId + caregiverId + recordDate` 查询；不能复用院长端日期状态。
- 护工端任务同步过滤必须限定 `recordDate`，不能因为某次空结果清空该护工全部本地任务缓存。

### 2026-05-19 虚拟手机北京时间启动流程

现象：
- 虚拟手机曾反复回到错误日期/时间，导致护工端按错误业务日期拉取任务，表现为任务时间轴为空或与云端不一致。

修复：
- 新增 `scripts/sync_emulator_beijing_time.ps1`，统一执行：
  - `adb wait-for-device`
  - 关闭虚拟机 `auto_time/auto_time_zone`
  - 固定系统显示为 24 小时制：`settings put system time_12_24 24`
  - 设置 `persist.sys.timezone=Asia/Shanghai`
  - 用电脑当前北京时间写入 Android 系统时间
  - 可选 `-LaunchApp` 启动 `com.elderserve.caregiver/.MainActivity`
- `scripts/release_frontend_apk.ps1` 安装 APK 后不再内联零散 `adb` 时区命令，统一调用 `sync_emulator_beijing_time.ps1 -LaunchApp`。

固定流程：
- 每次“打开虚拟手机/重启虚拟手机/安装新版 APK 后启动 APP”前，先运行：
  `.\scripts\sync_emulator_beijing_time.ps1 -LaunchApp`
- 验证必须看到：
  - `Emulator timezone: Asia/Shanghai`
  - `Emulator date: ... CST 2026`
  - `Emulator time format: 24`

禁止再犯：
- 不要只设置时区不设置系统日期时间；虚拟机自动时间关闭时，时区正确也可能日期漂移。
- 不要忽略 12/24 小时制；状态栏显示 `8:25` 可能只是 20:25 的 12 小时制显示，不代表北京时间错误。
- 不要在多个脚本里复制不同的 `adb date/timezone` 命令；统一维护 `sync_emulator_beijing_time.ps1`。

### 2026-05-19 护工自动登录恢复后进入错误账号修复

现象：
- 护工端退出 APP 后重新进入，页面显示打卡页；点击进入工作台后当前护工变成张建国，而不是上次登录的李美兰。

根因：
- APP 冷启动自动登录路径在 `main.js autoLogin()` 中先渲染打卡页，再异步 `_loadCloudPersonnel()` 并尝试绑定 `roleEntityId`。
- 在人员同步完成前，`state.caregiver` 仍可能是 `createMockState()` 的默认第一个护工；用户点击打卡/进入工作台会按默认护工写入状态。
- `applyInstitutionStateSnapshot()` 遇到结构变化时曾在当前护工找不到时回退到 `state.caregivers[0]`，这会把护工 session 错绑到列表第一个人。

修复：
- `state.js` 新增 `buildCaregiverFromSessionUser()` 和 `bindCurrentCaregiverFromSession()`。
- 自动登录拿到 `/api/auth/me` 后，立即用 `user.roleEntityId` 设置当前护工占位，再渲染打卡页，避免同步竞态窗口。
- 登录、快照刷新、打卡、进入工作台都优先按 `session.user.roleEntityId` 重新绑定当前护工；找不到云端档案时创建临时当前护工，不回退第一个护工。
- APK 已发布为 `4.99 (139)`。

验证：
- 云端 `cg02` 仍绑定 `roleEntityId=caregiver-02`，张建国是 `cg01/caregiver-01`。
- APK 构建成功，已上传 `android-stable-139` 并安装到虚拟手机。
- 发布脚本已同步虚拟手机北京时间：`Asia/Shanghai / CST`。

禁止再犯：
- 护工端当前登录人只能由 `users.role_entity_id` 决定；不能用本地列表第一个护工兜底。
- 自动登录恢复时必须先建立当前护工占位再渲染可操作的打卡页。
- `applyInstitutionStateSnapshot()` 不能在护工 session 下因结构变化把 `state.caregiver` 改成 `state.caregivers[0]`。
### 2026-05-19 护工端点击房间/任务误跳到其他老人修复

现象：
- 真机护工端点击老人 `123` 的任务卡/房间卡后进入了王大爷页面，并显示“当前没有派给我的任务”。
- 虚拟手机同版本无法稳定复现；云端事实表确认 `inst-001 / caregiver-02 / 2026-05-19` 下 `123` 有任务，且负责人正确。

根因：
- 房间列表 `roomSelectPage.js` 点击只传 `room.room`，没有携带老人唯一 ID；真实手机本地状态或缓存短暂不完整时，只靠房间号重建选择容易命中错误老人。
- `setCurrentRoom()` 只按房间号和楼层找老人；找不到实体时才用任务快照兜底。
- `ensureCurrentSelections()` 在当前老人不存在时会回退到 `state.elders[0]`，真实手机旧缓存/异步加载窗口下容易把选中老人改成列表第一个老人，表现为跳到王大爷。

修复：
- `roomSelectPage.js` 的房间按钮改为携带 `elderId`，`main.js` 调用 `actions.chooseRoom(elderId, room)`。
- `setCurrentRoom()` 优先按 `elderId` 定位；老人实体暂缺时使用当天 `published_tasks` 任务快照创建只读老人兜底，不再依赖房间号猜测。
- `ensureCurrentSelections()` 去掉护工端选择路径里的 `state.elders[0]` 兜底；当前老人缺失时只允许使用当前任务或替代任务的 `elderId/elderName/elderRoom` 快照。
- `selectTask()` 和 `focusTask()` 找不到老人实体时也使用任务快照，避免点击任务卡后丢失老人上下文。

验证：
- 云端事实源：`GET /api/tasks?institutionId=inst-001&caregiverId=caregiver-02&recordDate=2026-05-19` 返回 `elder-123-1777577323008 / 123 / caregiver-02` 的任务。
- 代码检查：`rg 'state\.elders\[0\]' caregiver-app/src` 不再命中护工端当前老人选择链路，只剩院长端/统计兜底。
- 前端改动需发布 APK，并在真机必要时清理旧缓存后重新登录验证 `123` 房间进入后仍显示 `123` 的时间轴。

禁止再犯：
- 护工端从房间/老人/任务进入详情必须携带 `elderId`，不能只传房间号或老人姓名。
- 护工端当前老人选择不能回退到 `state.elders[0]`；只能使用显式选中的 `elderId` 或 `published_tasks` 中的老人快照。
- 真机无法复现于虚拟手机时，优先检查本地缓存、异步加载窗口、点击参数是否缺唯一 ID，不要先改后端事实表。
### 2026-05-19 真机更新后护工端任务为 0 的缓存/配置分叉修复

现象：
- 真机更新到最新版后，李美兰登录护工端首页显示待办 0、无待办楼层；同一账号在虚拟手机显示 50 个待办、1F 有任务。
- 云端事实表确认 `inst-001 / caregiver-02 / 2026-05-19` 有任务，所以不是后端任务丢失。

根因：
- `cloudApi.js` 允许 `localStorage.elderCloudBaseUrl` 和 `localStorage.elderCloudApiKey` 覆盖 Android APK 内置的 `cloudBaseUrl/cloudApiKey`。真机历史调试或旧版本写入过错误覆盖值时，APK 更新不会清 `localStorage`，导致真机和虚拟机同版本访问不同云端配置。
- `release_frontend_apk.ps1` 上传 APK 使用了 `-BaseUrl/-ApiKey`，但构建 APK 时没有显式传给 Gradle；构建配置和发布配置可能漂移。
- 护工端任务轮询常用 silent 模式，失败时首页只显示 0 项，没有暴露查询日期、护工 ID、同步错误，导致“请求失败”和“确实没任务”混淆。
- Android WebView 可能保留旧资源缓存；APK 更新后如果继续跑旧 JS，会出现真机和虚拟机行为不一致。

修复：
- Android 环境下 `getCloudApiConfig()` 固定优先使用 `AndroidBridge.getRuntimeInfo()` 返回的 APK 内置云端配置，并主动删除旧的 `elderCloudBaseUrl/elderCloudApiKey` 覆盖项。
- `release_frontend_apk.ps1` 构建时显式传入 `-PcloudApiBaseUrl` 和 `-PcloudApiKey`，保证 APK 内置配置与发布上传目标一致。
- `MainActivity` 在 APP 版本号变化时清理 WebView cache/history，并设置 `LOAD_NO_CACHE`，避免新版 APK 继续运行旧 JS 资源。
- 护工端首页增加云端同步状态：同步失败时显示错误、查询日期、护工 ID 和手动刷新按钮；云端成功返回空时明确显示“云端已同步但当前查询没有任务”。

验证：
- 云端事实源：`GET /api/tasks?institutionId=inst-001&caregiverId=caregiver-02&recordDate=2026-05-19&limit=300` 返回李美兰任务。
- 发布后必须确认 APK 版本号，并在真机首页看到同步状态不再静默吞错。

禁止再犯：
- Android APP 内置云端配置是事实配置，真机不得被历史 `localStorage` 覆盖；调试覆盖只能用于浏览器/PWA，不用于原生 APK。
- 发布脚本的上传目标和 APK 构建运行目标必须来自同一组 `BaseUrl/ApiKey` 参数。
- 护工端任务为空必须区分三种状态：同步中、同步失败、云端成功返回空；不能统一渲染成 0 项。
- 真机和虚拟机同版本表现不一致时，优先检查运行时配置、WebView 资源缓存、登录 token/roleEntityId、请求参数，不要把“缓存”当最终解释。
### 2026-05-19 真机云端返回成功但护工任务仍为 0 修复

现象：
- 真机护工端显示“云端已同步，但当前查询没有任务”，查询参数为 `recordDate=2026-05-19`、`caregiverId=caregiver-02`。
- 用同一组参数直接请求云端 `GET /api/tasks?institutionId=inst-001&caregiverId=caregiver-02&recordDate=2026-05-19&limit=100&light=true` 返回 51 条任务。

根因：
- `refreshCaregiverCloudTasks()` 发请求时使用 `state.caregiver.id`，但响应回来后再次读取“当前的” `state.caregiver.id` 做清理和合并判断。真机登录/人员同步较慢时，响应窗口内状态可能被 `_loadCloudPersonnel()` 或会话绑定刷新，导致返回的任务被本地判断全部跳过。
- `nextItems.forEach()` 直接用 `item.caregiverId === state.caregiver.id` 判断，没有先 `normalizeCloudTask()`；如果后端字段形态出现蛇形/驼峰差异，也会导致合并为 0。

修复：
- `refreshCaregiverCloudTasks()` 在请求开始时固定 `syncCaregiverId` 和 `syncInstitutionId`，本次请求、清理和合并全程使用同一组参数。
- 响应项先经过 `normalizeCloudTask()` 再判断 `normalized.caregiverId === syncCaregiverId`，合并时也传标准化对象。
- `normalizeCloudTask()` 增加蛇形字段兼容：`caregiver_id/elder_id/record_date/plan_item_id/...`，避免后端字段形态变化导致前端任务丢失。

验证：
- 云端同参数返回 51 条任务，前端合并不应再显示“云端已同步但当前查询没有任务”。
- 修复后发布 APK，真机更新后应看到 `caregiver-02` 的 50 个待办任务和 1F 楼层卡。

禁止再犯：
- 异步请求开始时必须锁定本次事实参数，响应处理不能重新读取可能变化的全局状态做过滤。
- 云端数据进入本地 state 前必须标准化，再做业务判断；不能直接依赖原始返回字段名。
- “云端成功但页面为空”必须检查响应项是否被前端合并逻辑丢弃，而不是只检查接口是否返回空。
### 2026-05-19 护工端任务查询机构 ID 固定与诊断增强

现象：
- 真机仍显示“云端已同步，但当前查询没有任务”，页面显示 `caregiverId=caregiver-02` 和 `recordDate=2026-05-19`。
- 用同样的护工 ID 和日期请求云端返回 51 条，但如果请求携带 `institutionId=undefined` 会成功返回 0 条，页面表现完全一致。

根因：
- 初始 mock 机构是 `demo-qinghe-care`。护工登录/自动恢复期间，如果全局 `state.institution.id` 未及时切到登录用户的 `inst-001`，任务查询会带错误机构 ID，并得到合法空结果。
- 页面之前没有显示 `institutionId`、云端返回条数和前端合并条数，导致无法判断是请求空、标准化失败还是合并失败。

修复：
- 新增 `getCurrentSessionInstitutionId()`，护工端任务同步优先使用 `session.user.institutionId`，其次 `caregiver.institutionId`，最后才使用全局 `state.institution.id`。
- `refreshCaregiverCloudTasks()` 开始时锁定 `syncInstitutionId`，并同步修正 `state.institution.id`，避免带 `demo/undefined` 机构查询任务。
- 增加 `state.cloud.lastCaregiverTaskSync` 诊断字段，记录本次机构 ID、护工 ID、日期、云端返回条数、标准化条数、合并条数和跳过条数。
- 护工首页空状态显示机构 ID、返回条数、合并条数，后续截图可以直接定位断点。

验证：
- `GET /api/tasks?institutionId=undefined&caregiverId=caregiver-02&recordDate=2026-05-19` 返回 0，说明错误机构 ID 会制造“同步成功但无任务”。
- `GET /api/tasks?institutionId=inst-001&caregiverId=caregiver-02&recordDate=2026-05-19` 返回 51，真机必须用这个机构 ID。

禁止再犯：
- 护工端业务查询的机构 ID 只能来自登录会话或当前护工绑定，不要依赖 mock 初始机构。
- 任何“云端成功但页面为空”的提示必须显示请求关键参数和返回/合并计数，不能只显示 fetchedAt。
### 2026-05-19 护工端真机任务仍为 0 与任务合并串老人修复

现象：
- 云端事实源确认 `inst-001 / caregiver-02 / 2026-05-19` 有 51 条任务，但真机护工端仍可能显示“云端已同步，但当前查询没有任务”。
- 之前真机还出现过点击老人 `123` 的任务卡跳到王大爷、任务时间轴错乱的问题。

根因：
- `mergeCloudTask()` 用 `planItemId` 作为全局兜底唯一键；同一个实例模板会给多个老人生成相同 `planItemId` 的任务卡，前端会把不同老人的任务互相覆盖。
- 护工端刷新时清理本地任务也把 `planItemId` 当作云端存在性判断，可能保留或覆盖错误老人任务。
- 首页新增诊断文案曾出现乱码和模板插值损坏，导致真机无法直接显示 `institutionId / returnedCount / mergedCount`，不利于定位是接口返回 0 还是前端合并为 0。

修复：
- `caregiver-app/src/store/state.js`：云端任务合并优先按云端任务 `id/cloudTaskId` 匹配；`planItemId` 只允许在同老人、同护工、同日期下兜底匹配。
- `getTaskSyncKeys()` 移除全局 `planItemId` key，避免跨老人误判同一任务。
- 护工任务刷新清理逻辑只按云端任务 ID 保留本次同步任务，不再按全局 `planItemId` 保留。
- `caregiver-app/src/pages/homePage.js`：重写护工首页中文文案和诊断插值，空状态必须显示机构 ID、护工 ID、云端返回条数和本地合并条数。

验证：
- 云端事实源：`GET /api/tasks?institutionId=inst-001&caregiverId=caregiver-02&recordDate=2026-05-19&limit=100&light=true` 返回 51 条。
- APK 发布后真机如果仍显示空任务，首页诊断必须能直接区分：
  - `机构ID` 不是 `inst-001`：登录会话/机构绑定仍错误。
  - `返回 0`：请求参数或运行时云端地址仍错误。
  - `返回 51 合并 0`：前端标准化/护工匹配仍错误。
  - `返回 51 合并 51` 但统计 0：页面 selector/date/status 过滤仍错误。

禁止再犯：
- `planItemId` 是模板条目 ID，不是每日任务实例全局唯一 ID；不能跨老人、跨护工、跨日期当作任务唯一键。
- 护工端任务卡跳转和合并必须以 `published_tasks.id + elderId + caregiverId + recordDate` 为事实上下文，不能只用模板条目或房间号推断。
- 任何“云端成功但页面为空”的提示必须暴露关键请求参数和返回/合并计数，不能只显示 0 项。
### 2026-05-19 超管老人每日任务表详情只显示分页缓存修复

现象：
- 手机端老人 `123` 今日时间轴显示 15 项任务，但超管“数据库总览 -> 任务记录 -> 查看老人任务表”弹窗只显示 2 项。
- 云端事实源确认 `GET /api/tasks?institutionId=inst-001&elderId=elder-123-1777577323008&recordDate=2026-05-19` 返回 15 项，其中 1 项已完成、14 项待完成。

根因：
- `static/admin.html renderTaskRecordsRawTable()` 的第一层列表来自当前分页数据。
- 点击“查看老人任务表”时直接用 `S.rawTaskGroups[index].rows` 渲染详情；如果当前页/搜索/分页只加载到该老人部分任务行，详情弹窗就会把分页缓存误当成完整老人每日任务表。
- 正确事实源应是 `published_tasks` 按 `institution_id + record_date + elder_id` 精确读取，而不是后台列表当前页缓存。

修复：
- `static/admin.html` 新增 `openTaskGroupDetail(group)`。
- 点击任务记录详情时重新请求 `/api/admin/tables/published_tasks?institutionId=...&recordDate=...&elderId=...&limit=300`，再渲染完整老人每日任务表。
- 已部署 `static/admin.html` 到服务器 `/home/ubuntu/elder_backend/static/admin.html`。

验证：
- 管理接口带管理员 token 请求 `/api/admin/tables/published_tasks?institutionId=inst-001&recordDate=2026-05-19&elderId=elder-123-1777577323008&limit=200` 返回 `total=15 / rows=15`。
- 手机端同一老人当天显示 15 项任务，后台详情应与之对齐。

禁止再犯：
- 老人每日任务表详情不能用列表分页缓存渲染，必须按 `institution_id + record_date + elder_id` 重新查完整事实表。
- “任务记录”第一层是索引/摘要，不是事实详情；任何详情弹窗都必须重新按业务主键读取。
- 任务卡相对静态，护工任务是动态分配到任务卡上的执行责任；已完成任务卡不参与动态重新分配。
### 2026-05-19 护工端“我的任务”与动态分配边界收口

业务确认：
- 护工端默认看到的是“我的任务”，即任务分配器分配给当前护工的任务卡子集，不是老人完整时间轴。
- 临时任务是指派给特定护工的任务卡，和老人默认负责人无关。
- 老人负责人来自护理方案/任务分配选择，最终写入 `elders.assigned_caregiver_id`。
- 护理记录只记录该护工实际操作过的任务卡，按老人姓名和日期索引，对应云端护工任务记录表格。
- 取消打卡后任务回到未完成；如果没有其它操作痕迹，可重新参与动态分配。

修复：
- `remote-main.py` 新增 `_is_dynamic_assignable_task()` 和 `_task_has_record_payload()`，动态分配只允许修改未操作的日报任务卡：`pending + report-template/daily-report + 无 completedAt/recordNote/recordEvidence/exception*`。
- `/api/elder-assignment` 和 `_align_pending_tasks_with_elder_assignments()` 改为使用统一动态分配判断，临时任务、已完成任务、异常任务、有文字/图片记录任务不再跟随老人默认负责人变化。
- `generate_tasks_for_date()` 保留已完成任务状态，不再因任务重建把 completed 回退成 pending。
- `caregiver-app/src/pages/homePage.js` 和底部导航改为“我的任务”。
- `caregiver-app/src/store/state.js` 新增 `hasCaregiverTaskOperation()`；护理记录工作台、自动护理记录、护理记录详情入口只纳入当前护工实际操作过的任务卡。
- `caregiver-app/src/pages/historyPage.js` 重写为 UTF-8 正常中文文案，明确“只记录当前护工实际操作过的任务卡”。

验证：
- `python -m py_compile remote-main.py` 通过。
- 前端改动需发布 APK 并确认虚拟手机安装版本。

禁止再犯：
- 护工端“我的任务”不能渲染老人完整时间轴；只能渲染 `GET /api/tasks?caregiverId=&recordDate=` 返回的当前分配任务。
- 护理记录不能把未操作待办任务计入记录，也不能把日报模板自带 `note/description` 当作护工文字记录。
- 动态分配不能直接改已操作任务卡；所有入口必须走同一判断规则。
### 2026-05-19 护工任务记录误把待完成任务算作打卡完成修复

现象：
- 李美兰在“我的任务”里有 2 张王大爷任务卡已完成，但护工端“护理记录”可能显示 0。
- 云端 `/api/caregiver-task-records?institutionId=inst-001&caregiverId=caregiver-02&recordDate=2026-05-19` 曾返回 10 条，其中“洗脸刷牙/协助起床/卫生间清洁/房间整理”等任务状态仍是 `pending`，却被标成“打卡完成”。

根因：
- `remote-main.py build_caregiver_task_records()` 把 `published_tasks.accepted_at` 当作完成时间兜底；`accepted_at` 只是接收/排程时间，不是护工打卡证据。
- 护工端 `buildCaregiverRecordWorkspace()` 主要从本地 `state.tasks` 派生护理记录，重新进入页面或本地缓存未及时合并时，即使云端聚合接口已有记录，页面仍可能显示 0。

修复：
- `remote-main.py`：护工任务记录只在 `status="completed"` 或 `raw_payload.completedAt` 存在时生成“打卡完成”；不再使用 `accepted_at` 判断完成。
- `caregiver-app/src/store/state.js`：护理记录工作台把当前日期、当前护工的云端聚合记录纳入主数据源，用 `timelineTaskSnapshot` 计算已操作任务卡、异常、文字和照片数量。
- 前端进入护理记录页或切换日期仍请求 `/api/caregiver-task-records`，刷新后云端记录会合并到 `state.dailyReports`。

验证：
- 后端已部署到 `49.235.183.62:/home/ubuntu/elder_backend/main.py`，`py_compile` 通过，`elder.service` 为 `active`。
- 修复后同接口返回 3 条：王大爷 2 条真实 `completed` 任务，以及 1 条 `123` 的文字/图片记录；错误混入的待完成任务不再出现。
- 前端改动需要发布新版 APK 后在真机/虚拟手机确认“护理记录”按云端记录显示。

禁止再犯：
- `accepted_at`、`published_at`、`schedule/window` 都不是完成证据；只有 `status=completed` 或显式 `completedAt` 能生成打卡完成记录。
- 护工端“护理记录”不能只看本地任务缓存，必须读取 `/api/caregiver-task-records` 的云端聚合视图。
- 任何“云端有记录但页面没有”的问题，先查 `/api/caregiver-task-records`，再查前端是否合并进 `state.dailyReports`。
### 2026-05-19 任务卡异常重复拆分与护理记录机构取数修复

现象：
- 超管“护工任务记录”里同一次 `123 / 房间整理` 异常被拆成三行：文字/图片记录、任务卡异常、快速异常记录。
- 护工端“护理记录”页面显示 0，但云端 `/api/caregiver-task-records?institutionId=inst-001&caregiverId=caregiver-02&recordDate=2026-05-19` 已有王大爷 2 条完成记录。
- 超管任务记录列表直接显示 `elder-123-1777577323008` 这类技术 ID，业务上不可读。

根因：
- 任务卡异常保存时把异常照片写入了 `recordEvidence`，同时又设置 `status=risk/exceptionNote`，后端聚合就拆成“普通记录 + 异常记录”。
- 任务卡异常前端还调用了 `addAnomaly()`，把任务卡异常额外写入 `anomalies`；旧 `createAnomaly()` 把 `institutionId` 放在 body，后端实际只读 query，导致这些异常以空机构写入。
- 护工端进入护理记录页/切换日期时，`downloadDirectorCareReports()` 调用点传入的机构 ID 可能仍是旧 `state.institution.id`，没有固定使用登录会话机构。

修复：
- `caregiver-app/src/store/state.js`：任务卡异常只写 `published_tasks`，照片写 `exceptionEvidence`，不再生成 `anomalies`；老人不配合/身体不适快捷标记也只写任务卡异常字段。
- `remote-main.py build_caregiver_task_records()`：异常任务卡不再单独生成“文字/图片记录”行；若旧数据把异常照片放在 `recordEvidence`，合并到同一条“任务卡异常”显示。
- `caregiver-app/src/utils/cloudApi.js`：快速异常 `createAnomaly()` 把 `institutionId` 写入 query，避免新快速异常落到空机构。
- `caregiver-app/src/store/state.js`：护理记录页拉 `/api/caregiver-task-records` 时使用 `getCurrentSessionInstitutionId()`。
- `static/admin.html`：任务记录、护工记录、异常汇总第一层和详情表隐藏老人 ID / 任务 ID / 护工 ID，技术 ID 只作为接口查询条件，不直接展示给业务用户。
- 已清理云端 3 条旧的空机构任务卡异常记录；`anomalies` 当前为空。

验证：
- 修复后 `GET /api/caregiver-task-records?institutionId=inst-001&caregiverId=caregiver-02&recordDate=2026-05-19` 返回 3 条：`123/房间整理` 任务卡异常 1 条（含文字和 1 张图片），王大爷 2 条打卡完成。
- `GET /api/anomalies?institutionId=inst-001&caregiverId=caregiver-02&elderId=elder-123-1777577323008` 返回空数组。
- 后端 `py_compile` 通过，`elder.service` 为 `active`；前端已发布 APK `4.107 (147)` 并安装到虚拟手机。

禁止再犯：
- 任务卡异常和快速异常是两条不同业务链路：任务卡异常只能写 `published_tasks`，快速异常才写 `anomalies`。
- 异常图片必须进入 `exceptionEvidence`，普通记录图片才进入 `recordEvidence`。
- 护工端所有护理记录/任务记录查询必须使用登录会话机构 ID，不能直接依赖全局机构 state。
- 超管业务表默认不展示技术 ID；需要调试时另开详情或开发者字段，不要放在业务列表主信息里。
### 2026-05-20 任务卡异常保存导致 APP 卡死/启动失败修复

现象：
- 护工端点击任务卡“异常”，拍照并填写异常说明后点击保存，APP 表现为卡死。
- 复现过程中发现更严重问题：APP 重新启动后直接显示 `App startup failed: Cannot read properties of null (reading 'elderName')`。

根因：
- 上一次护理记录兜底修复中，`createElderFallbackFromCareReport(report, elderId)` 在 `report=null` 且 `elderId` 存在时仍读取 `report.elderName`，导致启动渲染阶段空指针。
- 异常保存没有防重复提交状态，用户连续点击保存或图片仍在同步时可能多次进入同一保存链路，造成 UI 长时间无响应。

修复：
- `caregiver-app/src/store/state.js`：`createElderFallbackFromCareReport()` 改为先转为安全 `source` 对象，再读取字段。
- `caregiver-app/src/store/state.js`：`saveTaskRecordDialog()` 增加 `dialog.saving` 防重入；异常图片校验失败时恢复 `saving=false`。
- `caregiver-app/src/store/state.js`：异常照片校验只在确实有照片时执行，允许“仅文字异常”保存；否则无照片异常会被空数组误拦截，表现为点击保存没反应。
- `caregiver-app/src/main.js`：异常/记录弹窗保存中禁用取消和保存按钮，保存按钮显示“保存中...”，避免重复触发。
- `caregiver-app/src/main.js`：清理多处历史乱码导致的启动级 `SyntaxError`，包括破损字符串和破损正则。

验证：
- 发布新版 APK 后必须确认 APP 不再出现启动失败。
- 进入李护工任务卡异常弹窗，保存异常后弹窗应关闭并回到任务页；云端同步失败只能吐司提示，不能卡死页面。

禁止再犯：
- 所有兜底对象函数必须允许 `null/undefined` 输入；不能把默认参数 `{}` 误认为能覆盖显式传入的 `null`。
- 任务卡保存、异常上报、图片上传这类写操作必须有防重复提交状态；保存链路不能因为用户重复点击造成多次写入或 UI 卡死。

### 2026-05-20 护工端护理记录云端有数据但页面显示 0 修复

现象：
- 云端事实源 `GET /api/caregiver-task-records?institutionId=inst-001&caregiverId=caregiver-02&recordDate=2026-05-19` 返回 3 条操作记录。
- 护工端“护理记录”同日期仍显示记录老人 0、云端记录 0、当前日期没有该护工操作过的任务卡。

根因：
- `buildCaregiverRecordWorkspace()` 已经把 `/api/caregiver-task-records` 合并到 `state.dailyReports`，但渲染卡片时又强制执行 `getElderById(elderId)`。
- 真机本地 `state.elders` 在登录恢复、人员同步慢或缓存不完整时可能暂时缺少对应老人，代码直接 `return null`，导致云端记录被丢弃。
- 这类错误本质是把“本地老人缓存”当成了“护工任务记录展示的硬前置”，违背了护理记录必须以 `/api/caregiver-task-records` 为主的规则。

修复：
- `caregiver-app/src/store/state.js` 新增 `createElderFallbackFromCareReport()`。
- 护理记录卡片构建改为本地 `elders` 优先，找不到时使用云端聚合记录里的 `elderName/room/bed/floor/careLevelLabel` 兜底。
- “云端记录”统计改为按 `report.syncStatus === "synced"` 计数，避免旧状态文案影响统计。

验证：
- 云端同参数确认仍返回 3 条记录，其中王大爷 2 条打卡完成、123 1 条文字/图片记录。
- 前端改动后需要发布并安装新版 APK，再用 cg02 / 李美兰进入“护理记录”验证 2026-05-19 至少显示 2 张老人记录表。

禁止再犯：
- 护工端“护理记录”展示不能因为本地 `state.elders` 缺失而丢弃 `/api/caregiver-task-records` 返回的记录。
- 云端聚合记录已经包含业务展示所需的老人快照时，前端必须允许只读兜底展示；本地老人档案只能增强显示，不能作为记录存在性的判定条件。
### 2026-05-20 护理记录图片预览拉取完整云端图片

现象：
- 护理记录任务卡详情点击“查看图片”后停在“图片正在加载或暂无可预览图片”遮罩。
- 超级管理员后台同一任务卡可以看到图片，说明云端图片存在。

根因：
- 手机端护理记录列表/详情来自轻量聚合数据，只包含 `photoCount` 和图片摘要，不包含完整 `dataUrl`。
- 超级管理员后台查看图片走的是任务图片完整读取链路，所以能看到图片。

修复：
- `openCaregiverRecordPhotoPreview(taskId, index)` 改为按任务卡 ID 请求 `/api/tasks/{taskId}`，读取完整 `recordEvidence/exceptionEvidence`。
- 完整图片缓存到 `state.ui.caregiverRecordEvidenceByTaskId`，再打开大图预览。
- 删除“图片正在加载或暂无可预览图片”的遮罩显示；没有图片时只 toast 提示“该任务卡没有图片”。

验证：
- 云端有图片的任务卡，手机端点击“查看图片”必须直接打开图片。
- 若云端确实没有图片，显示短提示，不保留卡住用户的全屏遮罩。

禁止再犯：
- 轻量列表的图片数量不能当作可预览图片数据；预览必须拉完整图片字段。
- 不要用永久遮罩表达“加载中/无图”，失败必须可退出且有短提示。

### 2026-05-20 新增护工考勤事实表

背景：
- 院长端需要按日期、员工姓名、工号/注册账号 ID 查看早班/中班/晚班打卡记录、是否迟到和打卡时间。
- 旧实现里 `state.session.clockInStatus` 只是本地会话状态，`caregivers.status` 只是护工当前展示状态，都不能作为云端考勤事实源。

实现：
- 后端 `remote-main.py` 新增 `AttendanceRecordTable`，表名 `attendance_records`。
- 唯一业务索引：`institution_id + record_date + caregiver_id + shift_id`，防止同一护工同一天同一班次重复写多条考勤。
- 新增 `POST /api/attendance-records`：创建/更新考勤记录，按 `shift_start + 30 分钟` 自动计算 `present/late/absent`、`late`、`late_minutes`，并从 `caregivers + users` 补齐护工姓名、工号、注册账号 ID、用户名。
- 新增 `GET /api/attendance-records`：支持按机构、日期、护工、工号、注册账号 ID、用户名、班次、状态查询。
- 超管 `GET /api/admin/tables` 已纳入 `attendance_records`，可在数据库总览按表查看。

禁止再犯：
- 考勤不能从任务卡完成状态、护理记录、`caregivers.status` 或本地打卡状态反推。
- 任务卡“打卡完成”是护理任务完成；护工“上班打卡”是考勤，两者必须分表、分接口。
- 班次迟到规则统一在后端计算，前端只提交班次配置和实际打卡时间。

验证：
- `python -m py_compile remote-main.py` 必须通过。
- 部署后调用 `POST /api/attendance-records` 写入一条记录，再用 `GET /api/attendance-records?institutionId=...&recordDate=...` 确认返回同一条记录且迟到字段正确。

### 2026-05-20 护工端“我的考勤”接入云端考勤表

现象：
- 个人中心“我的考勤”只是静态菜单项，点击没有进入真实考勤记录。
- 护工端上班打卡只写本地 `state.session.clockInAt` 和旧本地 `state.attendance.records`，没有写入云端 `attendance_records`。

修复：
- `caregiver-app/src/pages/profilePage.js`：把“我的考勤”改为按钮，点击进入 `attendance` 路由。
- `caregiver-app/src/utils/cloudApi.js`：新增 `fetchAttendanceRecords()` 和 `upsertAttendanceRecord()`。
- `caregiver-app/src/store/state.js`：新增云端考勤拉取、考勤 upsert、云端记录合并和北京时间 ISO 打卡时间生成。
- `actions.clockIn()` 和开发者护工入口打卡后写 `POST /api/attendance-records`，不再通过旧快照持久化表达考勤。
- `caregiver-app/src/pages/attendancePage.js`：优先展示当天云端考勤记录，包括班次、打卡时间、迟到分钟和同步状态。

禁止再犯：
- “我的考勤”和“上班打卡”必须接入 `attendance_records`，不能停留在本地 session 或 `caregivers.status`。
- 前端只提交打卡事实和班次配置；迟到状态以后端返回为准。
- 个人中心里的可点击业务入口必须使用 button + `data-action`，不能用静态 div 冒充入口。

验证：
- 前端改动后必须发布并安装 APK。
- 用护工账号进入“个人中心 -> 我的考勤”，应进入考勤页并读取云端当天考勤。
- 点击上班打卡后，云端 `GET /api/attendance-records?institutionId=inst-001&caregiverId=caregiver-02&recordDate=当天` 必须出现/更新对应班次记录。

### 2026-05-20 超管护工考勤表按日期和护工聚合

现象：
- 超管“数据库总览 -> attendance_records”只显示物理行，只有 ID、机构、日期、护工、班次等字段。
- 用户需要的是一张业务考勤表：当天某护工早/中/晚三个班次各自什么时候打卡、属于哪个班次、是正常/迟到/缺勤。

修复：
- `static/admin.html` 增加 `renderAttendanceRawTable()`，按 `record_date + caregiver_id` 聚合物理行。
- 第一层展示列改为：日期、护工、注册账号、早班、中班、晚班、原始记录。
- 未打卡班次直接显示“缺勤”；有记录时显示班次名、打卡时间、班次时间和后端返回的正常/迟到状态。
- 详情弹窗 `renderAttendanceGroupDetailTable()` 展示早中晚三行明细，不再默认展示 JSON。
- `remote-main.py` 的超管表数量对 `attendance_records` 改为考勤表张数，而不是物理行数。

禁止再犯：
- 超管业务表不能直接把物理行当业务表。考勤第一层必须按“日期 + 护工”索引，班次作为列/明细行。
- 缺勤不是物理行，必须由展示层按班次模板补出来；不能因为云端没有记录就让中班/晚班消失。
- `attendance_records` 详情默认展示业务明细表，JSON 只能作为调试兜底。

验证：
- 选择 `attendance_records` 时，表头必须是日期/护工/注册账号/早班/中班/晚班/原始记录。
- 只有早班打卡时，中班和晚班必须显示缺勤。

### 2026-05-20 护理记录任务卡详情查看图片

现象：
- 护工端护理记录任务卡详情只显示 `1 张图片`，但没有查看图片入口。

修复：
- `main.js renderCaregiverRecordDetail()` 在任务卡详情行中增加 `查看图片` 按钮。
- 点击后打开大图预览；Android 返回键优先关闭图片预览，再关闭详情弹窗。
- `state.js` 增加 `caregiverRecordPhotoPreviewIndex` 状态和打开/关闭动作。
- `buildCaregiverRecordDetail()` 对云端 `timelineTaskSnapshot.evidence` 执行图片数据标准化，优先使用 `dataUrl/url`。

限制：
- 如果当前云端轻量记录只有 `photoCount`，没有图片 `dataUrl/url`，前端会显示“图片正在加载或暂无可预览图片”。

禁止再犯：
- 任何显示“有图片”的业务详情，都必须提供明确的查看入口；如果只有数量没有图片数据，也必须给出可理解提示，不能点击无反应。

### 2026-05-20 护理记录空房间显示为 0F 修复

现象：
- 护工端护理记录老人卡片顶部显示 `0F · 室`。

根因：
- 护理记录列表允许用云端记录快照兜底展示老人。
- 当云端聚合记录没有楼层/房间字段时，`createElderFallbackFromCareReport()` 把缺失楼层归一化成 `0`。
- `historyPage.js` 又硬拼 `${floor}F · ${room}室`，导致空值被显示成业务上无意义的 `0F · 室`。

修复：
- 缺失楼层不再归一化成 `0`，保留为空。
- 护理记录卡片位置显示改为：
  - 有楼层和房间：`1F · 101室`
  - 只有房间：`101室`
  - 都缺失：`房间未填`

禁止再犯：
- 楼层 `0F` 不是合法业务显示；缺失位置必须显示“房间未填”或只显示已有字段。
- 云端聚合记录快照缺字段时只能做只读兜底展示，不能伪造楼层。

### 2026-05-20 护理记录任务卡点击无反应修复

现象：
- 护工端护理记录列表能显示老人和任务卡，但点击任务卡没有任何反应。

根因：
- 列表卡片允许用 `/api/caregiver-task-records` 聚合记录里的老人快照兜底显示。
- 点击处理 `openCaregiverElderRecordTasks()` 却只调用 `getElderById(elderId)`，如果本地 `state.elders` 暂时没有该老人，就直接 `return`。
- 这违反了“护理记录展示不能依赖本地老人缓存”的规则。

修复：
- `openCaregiverElderRecordTasks(elderId, taskId)` 改为先找本地老人，找不到时用 `findDailyReport(elderId, recordDate)` 和 `createElderFallbackFromCareReport()` 构造只读老人快照。
- 点击任务卡后仍按 `selectedCaregiverReportElderId + selectedCaregiverRecordTaskId` 打开只读任务卡详情。

验证：
- 即使本地老人档案缓存缺失，只要云端护工任务记录有老人快照，护理记录任务卡点击也必须能打开详情。

禁止再犯：
- 护理记录列表和详情都以云端护工任务记录为主；本地 `state.elders` 只能增强展示，不能作为点击详情存在性的硬前提。

### 2026-05-20 护理记录列表直接显示任务卡

现象：
- 护工端护理记录老人卡片仍显示 `查看记录 / 刷新记录 / 库存` 三个按钮。
- 用户要求该页直接看到任务卡；点击任务卡后只看该任务卡的文字和图片，不需要额外按钮。

修复：
- `historyPage.js`：删除老人卡片底部 `查看记录 / 刷新记录 / 库存` 按钮，改为直接渲染当天已操作任务卡列表。
- 每个任务卡按钮展示：任务名、打卡时间、文字数量、图片数量。
- `state.js openCaregiverElderRecordTasks(elderId, taskId)` 改为打开只读记录弹窗，不再跳转老人详情页。
- `buildCaregiverRecordDetail()` 支持 `selectedCaregiverRecordTaskId`，点击某张任务卡时详情只显示这张卡。

验证：
- 护理记录列表中老人卡片下方应直接出现任务卡。
- 点击任务卡弹窗只显示该任务卡的打卡时间、文字记录和图片数量。
- 页面不再显示刷新记录、库存、查看记录按钮。

禁止再犯：
- 护理记录页不放库存入口；库存使用入口属于库存/使用记录流程。
- 护理记录刷新应由进入页面、切换日期和后台同步触发，不要求用户逐个老人手动刷新。
- 老人卡片下方的主交互对象必须是任务卡本身，不是中间按钮。

### 2026-05-20 护理记录按老人姓名索引和任务卡详情表

现象：
- 护工端护理记录列表虽然按老人聚合，但详情入口仍不够像云端“护工每日任务记录表”。
- 用户要求手机端和云端显示方式一致：按老人名字索引，点进去查看任务卡详情；详情只显示打卡时间、文字记录、图片记录。

修复：
- `caregiver-app/src/store/state.js` 新增 `buildCaregiverRecordDetail(elderId)`：
  - 按 `selectedCaregiverReportElderId + recordDate + caregiverId` 生成只读任务卡详情表。
  - 优先读取云端聚合后的 `timelineTaskSnapshot`，并用本地已操作任务卡补齐。
  - 行级字段收敛为 `任务名 / 打卡时间 / 文字 / 图片数`。
- `caregiver-app/src/main.js` 新增 `renderCaregiverRecordDetail()` 弹窗，并接入关闭动作和 Android 返回键。
- `caregiver-app/src/styles/pages.css` 增加手机端任务记录表弹窗样式。

验证：
- 护工端护理记录列表按老人姓名展示。
- 点击“查看记录”后弹出该老人当天任务卡表，不进入可编辑日报，也不显示 JSON/来源/异常统计等技术字段。
- 表格行只显示任务卡名称、打卡时间、文字记录和图片数量。

禁止再犯：
- 护工端护理记录详情必须是只读任务卡操作表，不是日报编辑器。
- 手机端和云端后台的任务记录展示口径要一致：按日期 + 护工 + 老人索引，再查看任务卡行。
- 详情页不要暴露 `sourceTable`、技术 ID、云端来源等调试字段。

### 2026-05-20 护工端护理记录页信息过载修复

现象：
- 护工端“护理记录”列表卡片同时显示未完成、异常、文字、照片、待归档、云端记录、下一任务提示等信息。
- 用户实际只需要在这里看到任务卡打卡情况，以及该护工上传过的文字/图片消息；异常任务卡也只应作为一条任务卡记录展示，不应在索引卡上堆状态。

根因：
- `historyPage.js renderElderRecordCard()` 把护理记录索引页做成了状态统计页。
- `buildCaregiverRecordWorkspace()` 同时暴露 pending/issue/reportStatus/cloudSync 等多个技术或流程指标，导致业务视图混乱。

修复：
- `caregiver-app/src/pages/historyPage.js`：摘要指标改为 `记录老人 / 打卡 / 文字 / 图片`。
- 老人记录卡只保留 `打卡情况` 进度、`打卡/文字/图片` 三个标签和最近文字/图片提示。
- 筛选项改为 `全部 / 有打卡 / 有记录`，不再在护理记录索引页突出异常状态。
- `caregiver-app/src/store/state.js`：为记录卡增加 `checkInCount/messageCount/latestNote`，摘要按打卡、文字、图片聚合。

验证：
- 进入护工端“护理记录”页面，卡片不应再出现 `未完成`、`异常`、`待归档`、`云端记录` 这类混杂指标。
- 点击“查看记录”仍应能看到该日期该老人下护工实际操作过的任务卡记录，包括异常任务卡上传的文字和图片。

禁止再犯：
- “护理记录”列表页是操作记录索引，不是异常统计页，也不是任务待办页。
- 异常任务卡在护理记录中只作为任务卡的一种记录内容存在；索引卡不要把异常拆成额外状态噪声。
- 待完成/未完成属于“我的任务”页，不属于“护理记录”页。

### 2026-05-20 底部导航中文乱码修复

现象：
- APP 底部导航显示 `鎴戠殑浠诲姟`、`鎶ょ悊璁板綍`、`涓汉涓績` 这类乱码，看起来像字体异常。

根因：
- 不是字体缺失，而是 `caregiver-app/src/main.js` 的中文文案被错误编码写坏，源码中已经存成了 mojibake 字符串。
- WebView 只是正常渲染了错误字符串，所以更换字体不能解决。

修复：
- 保留原乱码函数为 `getBottomNavItemsLegacy()`，新增运行时使用的 `getBottomNavItems()` 正确中文定义。
- 护工端底部导航恢复为：`我的任务 / 护理记录 / 个人中心`。
- 家属端和院长端底部导航同步恢复中文：`首页 / 健康 / 消息 / 我的`，`总览 / 方案 / 人员 / 我的`。

验证：
- 前端改动后必须发布并安装新版 APK。
- 安装后检查 WebView 日志不能出现 `SyntaxError`、`ReferenceError`、`App startup failed`。

禁止再犯：
- 不要用 PowerShell 默认编码或乱码终端输出复制中文回源码。
- 修中文文案时必须检查源码实际字符串，不能把截图乱码当成字体问题处理。
- 大范围修乱码前要分模块推进；不要一次性全局替换所有 mojibake，避免破坏 JS 模板字符串和正则。

### 2026-05-20 任务卡异常带图片保存卡死修复

现象：
- 护工端点击任务卡“异常”，拍照/选择图片后填写异常说明并保存，APP 表现为长时间无响应或像卡死。
- 上一轮已修复纯文字异常保存，但带图片路径仍未覆盖验证，风险集中在图片证据进入状态和上传链路。

根因：
- `main.js captureTaskEvidence()` 直接用 `FileReader.readAsDataURL(file)` 把手机原图读入 `state.ui.taskExceptionEvidence`。
- 手机拍照原图通常为数 MB，转成 base64 后更大；随后 WebView 要立即重渲染缩略图，并把大 JSON 通过 `/api/tasks` 上传，容易造成 UI 阻塞。
- `saveTaskRecordDialog()` 个别早退分支没有复位 `dialog.saving`，会制造“按钮一直保存中”的假卡死。

修复：
- `caregiver-app/src/main.js`：新增任务证据图片压缩流程，进入前端状态前统一压缩到最长边 `1280`，JPEG 质量 `0.72`；压缩失败才回退原始读取。
- `caregiver-app/src/store/state.js`：保存异常时如果命中“不是自己的任务”等早退分支，复位 `dialog.saving=false` 并刷新 UI。
- 已发布并安装 APK `4.116 (156)`，发布说明为“修复任务卡异常带图上传卡死：前端压缩证据图片并补齐保存状态复位”。

验证：
- `adb shell dumpsys package com.elderserve.caregiver` 确认虚拟手机安装 `versionCode=156 / versionName=4.116`。
- 安装后执行北京时间同步，虚拟手机为 `Asia/Shanghai`、24 小时制。
- 启动日志未出现 `App startup failed`、`SyntaxError`、`TypeError`、`ReferenceError`、`Uncaught` 或 `ANR`；仅有当前 HTTP 接口的 Mixed Content 警告。

禁止再犯：
- 护工端任务卡、异常、护理记录的图片证据进入 `state` 前必须压缩，不能直接把拍照原图 base64 写入状态或上传。
- 任务卡保存、异常上报、图片上传等写操作必须有可复位的保存状态；任何早退和校验失败都要清理 `saving`。
- 带图片异常必须单独验证，不能用“纯文字异常保存成功”替代带图路径验证。

### 2026-05-20 任务卡普通记录覆盖异常与记录图片缺失修复

现象：
- 王大爷任务卡先点“异常”再点“记录”后，云端任务卡详情里异常状态/异常字段会被普通记录保存链路覆盖或隐藏。
- 通过“记录”按钮上传的图片在云端任务卡里看不到；当前云端该任务只存在 `exceptionEvidence`，且历史图片对象只有 `name/capturedAt`，没有 `dataUrl/url`，因此无法预览。

根因：
- `serializeCloudTask()` 把 `exceptionNote/exceptionType/exceptionEvidence/exceptionReportedAt` 和当前 `status` 绑定；后续普通记录或打卡如果把状态带成非异常，就会序列化为空异常字段或把云端状态降级。
- `saveTaskRecordDialog()` 的普通记录分支只保存 `recordNote`，没有把 `state.ui.taskRecordEvidence[task.id]` 写入 `task.recordEvidence`，所以记录图片从未进入 `/api/tasks` 上传 payload。
- 后端 `/api/tasks` 只做非空字段合并，缺少“已有真实异常时不能被普通更新降级”的服务端防线。

修复：
- `caregiver-app/src/store/state.js`：`serializeCloudTask()` 始终携带已有 `record*` 与 `exception*` 两套字段，普通记录图片通过 `recordEvidence` 上传，不再按 `status` 清空异常字段。
- `caregiver-app/src/store/state.js`：普通记录保存时读取并校验 `taskRecordEvidence/taskEvidence`，有图片则写入 `task.recordEvidence` 后同步云端。
- `remote-main.py`：`POST /api/tasks` 和批量 upsert 共用逻辑增加防御，已有 `status=risk/refused` 且存在真实异常字段时，旧客户端提交 `pending/completed` 不允许降级，raw_payload 中的 `status` 也保留异常状态。

验证：
- `python -m py_compile remote-main.py` 通过。
- 云端当前 `report-2026-05-20-elder-101-test-life-care-test-room-tidy` 仍可查到 `status=risk`、`exceptionNote=Qqq`、`recordNote=22`；但历史异常图片只有文件名没有图片数据，不能恢复预览。
- 前端发布后，重新用“记录”按钮上传图片，`GET /api/tasks/{taskId}` 必须能看到 `recordEvidence[].dataUrl` 或可预览 URL，同时保留原 `exception*` 字段。

禁止再犯：
- 普通记录和任务卡异常是同一任务卡的两个独立字段域：普通记录只写 `recordNote/recordEvidence/recordedAt`，异常只写 `exceptionNote/exceptionType/exceptionEvidence/exceptionReportedAt`。
- 任意保存、打卡、取消打卡、批量同步都不能因为当前操作不是异常就清空或降级已有异常字段。
- “有图片”不等于“可预览图片”：可预览必须有 `dataUrl/url/src/path/fileUrl/imageUrl`，只有 `name/capturedAt` 的历史对象只能显示图片元信息，不能显示大图。

### 2026-05-20 任务卡上报类型互斥改造

需求：
- 同一张任务卡上报时只能选择“记录上报”或“异常上报”之一。
- 如果先点异常并保存，该任务卡不能再点记录，也不能再标记完成覆盖异常。
- 如果先点记录并保存，该任务卡不能再点异常。

实现：
- `caregiver-app/src/pages/taskDetailPage.js`：任务时间轴按钮层按任务卡已有 `record*` 或 `exception*` 状态禁用另一侧入口，并整理该页面乱码文案。
- `caregiver-app/src/store/state.js`：新增 `taskHasRecordReport()` / `taskHasExceptionReport()`；`openTaskRecordDialog()`、`openTaskExceptionDialog()`、`saveTaskRecordDialog()`、`completeTask()`、`markTaskException()` 都做二次拦截，防止旧页面状态或重复点击绕过按钮禁用。
- `remote-main.py`：`POST /api/tasks` 和 bulk upsert 增加 `_enforce_task_report_exclusivity()`，新数据同时/交叉提交记录与异常时返回 `409`。
- `remote-main.py`：历史混合脏数据用 `_normalize_mixed_task_report_payload()` 归一；`risk/refused` 以异常为准并清理普通记录字段，非异常以记录为准并清理异常字段。

验证：
- `python -m py_compile remote-main.py` 通过。
- 当前环境没有 `node` 命令，无法用 `node --check` 做 JS 语法检查；前端最终以 APK 构建结果为准。

禁止再犯：
- 任务卡操作不是“记录和异常两套可叠加信息”，而是二选一上报类型。
- 不要只在 UI 禁按钮；保存动作和后端接口必须同时拦截互斥规则。
- 老数据清理必须有明确归一规则，不能继续让同一任务卡同时显示“异常 + 文字记录 + 图片记录”。

### 2026-05-20 超级管理员后台实时刷新

现象：
- 超级管理员网页只有局部“刷新”按钮，没有统一的实时刷新能力。
- 查看数据库总览、任务记录、考勤记录时，需要手动刷新才能看到手机端或院长端刚写入的数据。

实现：
- `static/admin.html` 顶部统计卡下新增实时刷新状态条，默认开启。
- 自动刷新周期为 30 秒；每次刷新会重新拉 `/api/admin/stats`，并调用当前 tab 的加载函数。
- 数据库总览 tab 会保持当前表、机构、日期、搜索、分页等过滤条件，只刷新当前视图。
- 页面有弹窗打开、浏览器标签页在后台、或上一轮刷新未结束时，实时刷新自动暂停，避免打断详情查看、用户编辑或造成并发请求。
- 新增“暂停/开启实时刷新”和“立即刷新”按钮。

验证：
- `git diff --check -- static/admin.html PROJECT_MAP.md` 通过。
- 已部署 `static/admin.html` 后，刷新超级管理员页面应看到“实时刷新：开启，30 秒一次”状态条。

禁止再犯：
- 超管后台这种只读事实表页面需要自动刷新，但不能在弹窗/编辑状态下刷新覆盖用户当前操作。
- 自动刷新必须复用当前 tab 的加载函数，不能另写一套数据源造成页面事实源不一致。
### 2026-05-20 院长端方案页老人任务时间轴入口
现象：
- 院长端“方案”页老人名片箭头打开的侧栏混合显示护理方案项和当天任务卡，容易把配置层当成云端任务记录。
- 任务卡没有直接显示当前负责护工，点击未留痕任务卡也不能查看详情。

修复：
- `caregiver-app/src/pages/directorPage.js`：方案页侧栏改为只展示该老人当天 `published_tasks` 任务行，包含日报任务和临时任务，不再混入护理方案草稿项。
- 侧栏任务卡显示“负责护工：xxx”，并允许点击任意任务卡打开任务详情。
- 任务详情补充显示 `completedAt/recordedAt`，继续展示文字记录、异常记录和图片留痕。
- 方案页栏目顺序改为“任务分配 -> 护工负载 -> 切换老人”，避免切换老人把负载信息挤到页面底部。
- `caregiver-app/src/store/state.js`：云端任务标准化和详情补齐保留 `caregiverName/defaultCaregiverName/completedAt/recordedAt`，防止详情弹窗缺少护工任务记录字段。

验证：
- `git diff --check -- caregiver-app/src/pages/directorPage.js caregiver-app/src/store/state.js` 通过。
- 前端发布后，在院长端方案页点击老人名片箭头，侧栏必须只显示该老人当天云端任务卡；每张卡显示负责护工，点击后能看到该任务卡的打卡时间、文字和图片记录。

禁止再犯：
- 方案页老人箭头入口是“老人当天任务表”只读视图，事实源只能是 `published_tasks(record_date + elder_id)`，不能把护理方案配置项混进来。
- 任务卡详情展示的是任务卡操作记录，不是编辑护理方案，也不是从 `caregiver.floor` 或本地草稿推断的伪记录。

### 2026-05-20 院长端方案页切换老人和护工负载顺序调整
现象：
- 院长端“方案”页中“护工负载”显示在“切换老人”上方，不符合当前操作顺序，用户需要先切换老人再参考负载。
- 第一次只调整 DOM 顺序后实机仍显示旧顺序，原因是 CSS `.director-panel--resident-picker { order: 3; }` 覆盖了 DOM 顺序。

修复：
- `caregiver-app/src/pages/directorPage.js`：仅调整渲染顺序，改为“任务分配 -> 切换老人 -> 护工负载”，不改变任务分配、老人时间轴或负载计算逻辑。
- `caregiver-app/src/styles/pages.css`：移除 `.director-panel--resident-picker` 的强制 `order: 3`，让页面按照 DOM 顺序显示。

验证：
- `git diff --check -- caregiver-app/src/pages/directorPage.js caregiver-app/src/styles/pages.css PROJECT_MAP.md` 通过。
- 前端发布后，院长端方案页应先看到切换老人卡片，再看到护工负载卡片。

禁止再犯：
- 方案页同屏模块顺序属于操作流，不要为了展示统计信息把“护工负载”再次放到“切换老人”前面，除非用户明确要求。
- 调整模块顺序时必须同时检查 CSS `order`，不能只看 JSX/模板字符串的 DOM 顺序。

### 2026-05-20 护工档案字段与超管业务表
现象：
- 院长端“编辑护工”仍有“状态”下拉，但到岗/离岗应由员工打卡写入考勤表，不应由院长设置。
- 超管“数据库总览 -> 护工档案”显示英文物理列和“查看 JSON”，没有和院长端编辑字段对齐，也看不到账号绑定信息。

修复：
- `caregiver-app/src/pages/directorPage.js`：移除护工编辑弹窗的“状态”字段。
- `caregiver-app/src/store/state.js`：新增/编辑护工不再写 `caregivers.status`；编辑护工档案时同步调用 `/api/caregivers/{id}/update`，只提交姓名、工号、楼层、班次、电话等档案字段。
- `remote-main.py`：`CaregiverUpdateRequest` 不再接受 `status`；新建护工默认 `off-duty`，真实出勤仍以 `attendance_records` 为准。
- `remote-main.py`：超管 `GET /api/admin/tables/caregivers` 改为业务视图，聚合 `caregivers` 和 `users.role_entity_id`，返回姓名、岗位、工号、负责楼层、班次、登录账号、账号状态、电话、更新时间等字段。
- `static/admin.html`：护工档案使用专用中文表格和“查看详情”业务表，不再展示 JSON。
- `remote-main.py`：护工档案详情的“登录密码”改为读取 `users.password_hint`；历史账号如果没有明文提示，只能重置后显示。

验证：
- `python -m py_compile remote-main.py` 通过。
- `git diff --check -- caregiver-app/src/pages/directorPage.js caregiver-app/src/store/state.js static/admin.html remote-main.py DATA_ARCHITECTURE.md PROJECT_MAP.md` 通过。
- 部署后打开超管“护工档案”，表头应为中文业务字段，详情为可读表格；院长端编辑护工不再出现“状态”下拉。

禁止再犯：
- 护工档案和考勤状态是两件事：院长不能编辑到岗状态，到岗/迟到/缺勤只读 `attendance_records`。
- 超管业务表优先可读表格；只有调试兜底才允许 JSON，人员/老人/任务/考勤这类核心业务表不能默认展示 JSON。
- 超管可见密码来源只能是 `users.password_hint`，创建账号和重置密码必须同时更新 `password_hash` 与 `password_hint`；不要尝试从哈希反推明文密码。
- 方案页时间轴抽屉首次打开后必须进入 `directorPlanTimelineSettled` 稳定态；任务卡详情弹窗打开/关闭只允许改变详情层，不能重新触发 `director-plan-main/sidebar/resident-enter` 入场动画。
- 院长端编辑老人里的家属账号是 `users(role=family, role_entity_id=elder.id)`；已有 `familyUserId` 时必须更新同一条账号，用户名覆盖，密码非空才覆盖，禁止重复创建家属账号。
- 院长端编辑护工里的员工账号是 `users(role=caregiver, role_entity_id=caregiver.id)`；已有 `cloudUserId` 时必须更新同一条账号，用户名覆盖，密码非空才覆盖，禁止只重置密码导致账号名不变。
### 2026-05-20 院长端日报收件箱改为月度勾叉日报

现象：
- “日报收件箱”仍残留应收/已收/未收和旧日报缓存判断，和当前“老人每日任务表 + 任务卡完成状态”的后端架构不一致。
- 导出日报时不应依赖 `careReports` 缓存，也不应把文字、图片、异常混入月度日报。

根因：
- 旧 UI 把日报当作护工提交的一份收件记录；新架构中日报来自老人绑定的实例模板，实际完成情况只应从 `published_tasks` 的日报任务卡读取。
- `requestDirectorInboxDayExport()` 仍检查 `getCachedCareReportsByDate()`，导致云端任务卡已经存在时也可能提示没有日报。

修复：
- `caregiver-app/src/pages/directorPage.js`：日报收件箱按月构建 `published_tasks` 索引；月度 A4 表按老人实例模板任务项生成，完成显示 `✓`，已到时间未完成显示 `×`，未来或未到时间留空。
- `caregiver-app/src/store/state.js`：`refreshDirectorCloudReports()` 改为按月份逐日调用 `refreshDirectorCloudTasks()` 收集 `/api/tasks`；导出前自动刷新目标月份，不再检查旧 `careReports` 缓存。
- `DATA_ARCHITECTURE.md`：补充“日报收件箱/月度日报”事实源规则，明确禁止恢复应收/已收/未收和 `care_records` 逻辑。

验证：
- 云端 `GET /api/tasks?institutionId=inst-001&recordDate=2026-05-20&limit=5` 返回 `source=report-template`、`templateGroup=daily-report` 的日报任务卡，字段包含 `recordDate/elderId/planItemId/templateId/status/window`。
- `git diff --check -- caregiver-app/src/pages/directorPage.js caregiver-app/src/store/state.js DATA_ARCHITECTURE.md PROJECT_MAP.md` 必须通过。

禁止再犯：
- 日报收件箱不是“收件数量统计”，不能再显示或计算应收/已收/未收。
- 月度日报只读 `published_tasks` 的日报任务卡完成状态；不能用 `/api/caregiver-task-records`、`care_records`、本地日报草稿或文字图片记录生成月报。
- 收件箱日历只显示日期和是否查询到日报任务；不显示“本月已完成”、完成比例或老人表。
- 导出日报不能因为某天没有 `careReports` 缓存而失败；只要老人有实例模板并且 `/api/tasks` 能收集到任务卡，就应该可以生成月度表。

### 2026-05-20 日报收件箱去掉完成度和老人表

现象：
- 日报收件箱日历继续显示 `已完成/总数`，点开日期还显示老人表，页面语义仍像“完成度看板”。

根因：
- 收件箱页面沿用了上一次“日报份数完成度”的展示，但业务口径已经进一步简化：页面只需要查询云端当天任务记录并提供导出，不需要在 UI 层判断完成/未完成。

修复：
- `caregiver-app/src/pages/directorPage.js`：日历格子只显示日期；顶部显示“本月日报 N 份”；点开日期只显示查询摘要和刷新/导出按钮，不再展开老人表。
- `caregiver-app/src/styles/pages.css`：日历颜色改为“已查询到日报任务/暂无日报任务”，不再用红绿表达完成/未完成。
- `DATA_ARCHITECTURE.md`：明确日报收件箱是“云端日报任务查询 + 月度导出”入口，完成/未完成只体现在导出的 A4 表格单元格中。

禁止再犯：
- 日报收件箱 UI 不能重新引入“已完成/未完成/全部完成/部分完成”状态。
- 日期详情弹窗不能显示老人表；老人任务卡详情应在任务记录/方案时间轴里看，不属于日报收件箱。

### 2026-05-20 日报收件箱入口移动到方案页

现象：
- 日报收件箱入口在院长端首页底部快捷区，和当前“按老人护理方案/实例模板导出月报”的业务位置不够贴近。
- 方案页右上角只有一个放大镜，实际功能是搜索老人/房间，但图标语义不清。

修复：
- `caregiver-app/src/pages/directorPage.js`：首页快捷区移除“日报收件箱”；方案页顶部操作区在“发布临时任务”下方新增“日报收件箱”按钮。
- `caregiver-app/src/pages/directorPage.js`：方案页搜索框占位文案改为“搜索老人”，明确可按姓名或房间筛选切换老人列表。
- `caregiver-app/src/styles/pages.css`：方案页操作区改为纵向按钮组，搜索框默认显示文案，不再只是一个放大镜图标。

禁止再犯：
- 日报收件箱入口属于方案/日报模板工作流，不要再放回首页快捷区。
- 只用放大镜图标会造成语义不清；方案页搜索必须显示“搜索老人”文案。

### 2026-05-20 方案页移除搜索放大镜

现象：
- 方案页右上角搜索入口不再需要，保留放大镜会干扰“发布临时任务/日报收件箱”两个主要操作。

修复：
- `caregiver-app/src/pages/directorPage.js`：移除方案页 header 中的搜索老人输入框，只保留“发布临时任务”和“日报收件箱”按钮。

禁止再犯：
- 方案页顶部操作区只放高频业务动作；不要再恢复孤立的放大镜搜索入口，除非重新设计完整筛选交互。

### 2026-05-20 方案页老人卡片“未建方案”文案修正

现象：
- 方案页“切换老人”卡片和人员页老人信息显示“未建方案/待建方案”，用户无法判断指的是日报模板还是护理方案。

根因：
- 该文案来自旧 `elderCarePlans` 个体化护理方案是否存在，但当前日报任务生成的核心事实源是 `elders.report_template_id/report_template_title`。
- 在日报模板工作流里显示“未建方案”会误导用户，以为老人没有日报任务模板。

修复：
- `caregiver-app/src/pages/directorPage.js`：方案页老人卡片改为显示 `reportTemplateTitle`，无模板时显示“未分配日报模板”。
- `caregiver-app/src/pages/directorPage.js`：人员页老人元信息同步改为显示“日报模板：xxx”或“未分配日报模板”。
- `DATA_ARCHITECTURE.md`：补充老人卡片展示日报配置必须读取 `elders.report_template_id/report_template_title`，不能用旧 `elderCarePlans` 文案。

禁止再犯：
- “未建方案”这类旧 `elderCarePlans` 文案不能用于日报模板绑定状态。
- 老人是否会生成日报任务，看 `elders.report_template_id` 是否绑定实例模板，而不是看个体化护理方案对象是否存在。

### 2026-05-20 日报模板频次周期合并

现象：
- 实例模板里任务项可以设置 `频次/天`，例如测量血压为 2，但 A4 预览和导出仍按每天一个格子展示，只是在非执行日留空。
- 用户期望频次为 2 时，两天合并成一个周期格；只要两天内任意一天打卡，该周期格就显示对号。

修复：
- `caregiver-app/src/pages/directorPage.js`：新增 `getReportTemplateItemFrequencyDays()` 和 `getReportTemplateItemPeriods()`，统一把任务项频次转换成月内周期。
- `renderReportTemplateA4Preview()`：按频次用 `colspan` 合并预览表格日期单元格。
- `renderMonthlyCareSheetFromTasks()`：月报导出按频次周期合并单元格；周期内任一任务卡完成显示 `✓`，周期结束且没有完成显示 `×`，未到期留空。
- `caregiver-app/src/styles/pages.css`：给合并周期格增加浅色背景，便于识别。
- `DATA_ARCHITECTURE.md`：补充 `frequencyDays` 的 A4 报表语义。

禁止再犯：
- 频次不是“只在某些日期留空”的显示规则，而是报表周期合并规则。
- 月报导出的对号判断必须按周期聚合，不能只检查周期第一天的任务卡。

### 2026-05-20 老人中途更换日报模板切换点规则

现象：
- 老人当天中途更换日报实例模板时，旧逻辑按整天重建任务，容易出现已过时间段的旧任务残留，或把未完成旧任务继续留在当天任务表。
- `accepted_at` 曾被部分任务清理逻辑误认为“护工已经操作”，导致只是接收/排程过的未完成任务卡在换模板后被保留。

根因：
- `POST /api/elders/{id}/update` 修改 `reportTemplateId` 后调用通用 `regenerate_tasks_for_elders()`，没有“保存时间点”概念。
- 通用旧任务清理只区分“是否有操作痕迹”，没有区分真实护工提交和 `accepted_at` 这种非完成字段。

修复：
- 服务器 `/home/ubuntu/elder_backend/main.py` 新增 `regenerate_tasks_for_elder_template_change()`，按当前北京时间作为切换点处理当天任务表。
- 切换点之前：只保留已有真实护工操作的日报任务卡；未操作旧任务卡删除。
- 切换点之后：旧模板任务卡删除，按新实例模板的任务时间补齐任务卡。
- 真实护工操作不包括 `accepted_at`，只包括打卡完成、拒绝/跳过/异常状态，以及 `completedAt/recordNote/recordEvidence/exceptionNote/exceptionEvidence` 等护工提交内容。

验证：
- `python3 -m py_compile /home/ubuntu/elder_backend/main.py` 通过。
- `systemctl is-active elder.service` 返回 `active`。
- 修改老人日报模板后，查询 `GET /api/tasks?institutionId=inst-001&elderId=<elderId>&recordDate=<today>`：切换点前只应有已操作旧任务卡，切换点后只应有新模板任务卡。

禁止再犯：
- 模板中途切换不是整天覆盖，也不是无条件保留旧任务；必须以保存时北京时间作为切换边界。
- `accepted_at` 只表示接收/排程，不能作为完成、护理记录、模板切换保留或日报勾叉的证据。

### 2026-05-20 院长端异常状态按日期索引

现象：
- 院长端“异常状态”只在标题显示当天日期，没有日期选择入口，业务上看起来像把异常全堆在一个列表里。
- 任务卡异常虽然来自当天 `published_tasks`，但用户无法切换查看其它日期，也无法确认当前列表是哪一天的异常。

根因：
- `renderDirectorAnomalyPage()` 直接使用 `state.director.date` 作为标题日期。
- `directorExceptionReports` 原本跟随 `directorDateTasks`，没有独立的异常日期索引。

修复：
- `caregiver-app/src/pages/directorPage.js`：异常状态页新增“按日期查看异常”日期选择器，标题和列表使用 `directorAnomalyDate`。
- `caregiver-app/src/store/state.js`：新增 `directorAnomalyDate` 和 `setDirectorAnomalyDate()`；切换日期后立即调用 `refreshDirectorCloudTasks(recordDate=所选日期)` 拉取该日云端任务卡。
- `buildDirectorExceptionReports()` 对快速异常也按 `recordDate/date/reportedAt/time` 做日期过滤，避免跨日混入。

验证：
- 进入院长端“异常状态”，应看到日期选择器。
- 选择其它日期后，列表只显示该日期 `published_tasks.status=risk/refused` 的任务卡异常和该日期快速异常。
- `git diff --check -- caregiver-app/src/pages/directorPage.js caregiver-app/src/store/state.js caregiver-app/src/main.js DATA_ARCHITECTURE.md PROJECT_MAP.md` 通过。

禁止再犯：
- 异常状态页是“某一天的异常工作台”，不是全量异常池；必须按日期索引。
- 标题显示日期不等于数据按日期可控，页面必须提供可见日期选择并在切换时拉取对应日期云端数据。

### 2026-05-20 院长端异常已读箱废弃

现象：
- 院长端异常卡仍显示“标记已读”，点击后异常卡进入“已读信息箱”。
- 当前业务不再需要已读/未读分流；异常状态应该只按日期展示云端事实源中的异常。

根因：
- 旧逻辑用 `state.ui.directorReadExceptionIds` 和 `state.ui.directorDeletedExceptionIds` 在前端本地隐藏异常卡。
- `director-read-inbox` 路由、已读箱入口和已读/还原/删除 action 仍保留，导致异常卡不是纯云端事实展示。

修复：
- `caregiver-app/src/pages/directorPage.js`：移除异常卡“标记已读”按钮、已读信息箱入口和已读箱页面渲染。
- `caregiver-app/src/store/state.js`：`buildDirectorExceptionReports()` 不再读取本地已读/删除 ID，也不再生成 `directorReadExceptionReports`；异常卡显示只由日期和云端异常事实源决定。
- `caregiver-app/src/main.js`：移除 `director-read-inbox` 路由和已读/还原/删除事件处理。

验证：
- 院长端“异常状态”异常卡不再显示“标记已读”。
- 页面顶部不再出现“已读信息箱”入口。
- 旧本地已读 ID 不会再把异常卡从异常状态页面隐藏。

禁止再犯：
- 异常状态页不是消息收件箱，不要恢复已读/未读分流。
- 异常卡是否显示只能由 `published_tasks.status=risk/refused`、`anomalies` 快速异常和所选日期决定，不能由本地 UI 已读数组决定。

### 2026-05-20 自动登录恢复到错误养老院修复

现象：
- 退出 APP 后重新进入会自动登录，但“我的 -> 养老院信息”有时显示 `demo-qinghe-care / 青禾镇颐养护理院`，而不是当前账号所属的 `inst-001 / 福乐镇智慧养老院`。
- 同一个院长账号页面中账号信息和机构信息不一致。

根因：
- 手动登录会在 `actions.login()` 里用登录结果的 `user.institutionId` 覆盖 `state.institution.id`，再拉云端机构和人员。
- 自动登录 `autoLogin()` 只设置了 token 和用户角色，没有先把 token 用户的机构 ID 绑定到 `state.institution`，页面会先用 mock/default 机构渲染，并可能继续按旧机构刷新。
- 部分刷新函数仍直接使用 `state.institution.id`，当它还停在旧机构时会继续拉错机构事实表。

修复：
- `caregiver-app/src/store/state.js`：新增 `bindSessionUserToState()`，手动登录和自动登录共用；检测到机构 ID 变化时清空旧机构本地人员、老人、任务、模板、异常缓存。
- `caregiver-app/src/main.js`：自动登录 `/api/auth/me` 成功后先调用 `bindSessionUserToState()`，再拉机构信息、人员和院长初始数据。
- `refreshInstitutionSharedState()`、`persistInstitutionSharedState()`、`refreshDailyReportTemplates()` 改为优先使用 `getCurrentSessionInstitutionId()`。
- `renderDirectorProfilePage()` 优先显示 `state.session.user` 的账号名、角色和云端机构信息，避免 mock 院长资料残留。

验证：
- 重启 APP 自动登录后，“我的 -> 养老院信息”必须显示 token 用户所属机构。
- `director-001` 自动登录后不能再显示 `demo-qinghe-care`。
- `git diff --check -- caregiver-app/src/main.js caregiver-app/src/store/state.js caregiver-app/src/pages/directorPage.js DATA_ARCHITECTURE.md PROJECT_MAP.md` 通过。

禁止再犯：
- 自动登录和手动登录必须走同一套会话绑定规则，不能让自动登录绕过机构绑定。
- 前端任何事实表刷新都应优先使用 `state.session.user.institutionId`，不能依赖可能仍是 mock/demo 的 `state.institution.id`。

### 2026-05-20 旧 session token 绕过已删除机构修复

现象：
- 云端机构表已经只保留当前调试养老院，但手机退出 APP 后仍可能自动恢复到旧的 `demo-qinghe-care`。
- 这不是重新登录成功，而是本机保存的旧 `elderSessionToken` 通过 `/api/auth/me` 恢复了历史 session 快照。

根因：
- 后端 `get_current_user()` 只检查 `sessions.token/revoked/expires_at`。
- `sessions` 表保存了登录当时的 `institution_id/username/role/display_name` 快照；即使对应 `users` 或 `institutions` 后来被删除，旧 token 仍会被当成有效用户返回。

修复：
- 服务器 `/home/ubuntu/elder_backend/main.py`：`get_current_user()` 找到 session 后，重新查询 `users` 或 `admins`。
- 普通用户必须满足：账号存在、状态 active、`users.institution_id == sessions.institution_id`、机构存在且 active。
- 校验失败时立即把 session 标记为 revoked，并返回 401，要求客户端重新登录。

验证：
- `python3 -m py_compile /home/ubuntu/elder_backend/main.py` 通过。
- `systemctl is-active elder.service` 返回 `active`。
- `/healthz` 返回 `{"status":"ok","service":"elder-backend"}`。

禁止再犯：
- `sessions` 只是登录会话，不是用户和机构事实源。
- `/api/auth/me` 必须实时校验 `users` 和 `institutions`，不能只返回 session 快照。

### 2026-05-20 库存名片操作弹窗交互修复

现象：
- 院长端库存名片弹窗里删除按钮写成“删除名片”，业务语义不准确。
- 点击“查看消耗记录”没有明显反馈，用户不知道下方使用流水是否已按该物资筛选。
- 点击“调整库存”会打开完整库存编辑表单，院长只想增减库存数量时会看到名称、分类、单位、预警线、位置等无关字段。

根因：
- 库存名片操作复用了 `openInventoryItemDraft()`，把“编辑物资档案”和“调整库存余额”混在一个入口。
- `openInventoryItemUsage()` 只改本地筛选字段并静默刷新，没有关闭弹窗后的明确提示，也没有把“查看消耗记录”定义成可见的筛选动作。

修复：
- `directorPage.js`：删除按钮文案改为“删除物资”；新增 `renderInventoryStockAdjustDraft()`，调整库存只显示本次增加/减少数量和调整后库存。
- `state.js`：新增 `openInventoryStockAdjust/updateInventoryStockAdjustDraft/saveInventoryStockAdjust/closeInventoryStockAdjust`；保存时仍写 `POST /api/inventory/items`，只更新数量。
- `main.js`：新增库存调整表单采集和 action 分发；删除二次确认文案改为“删除这个物资”。
- `openInventoryItemUsage()` 关闭操作弹窗、设置 `inventoryUsageFilters.itemName`、刷新云端流水并 toast 提示“已筛选某物资的消耗记录”。

验证：
- 点击库存名片后按钮应显示“调整库存 / 查看消耗记录 / 删除物资”。
- 点击“调整库存”只出现增减数量输入框，不出现名称/分类/单位/预警线/位置。
- 点击“查看消耗记录”应关闭弹窗，并在使用流水区域按物资名称筛选。

禁止再犯：
- “新增/编辑物资档案”和“调整库存余额”是两种操作，不能共用同一个表单。
- 删除库存品项的业务文案统一叫“删除物资”，不要再叫“删除名片”。

### 2026-05-20 库存调整输入框重渲染导致键盘收起修复

现象：
- 院长端库存调整弹窗中，每输入一个字符，数字键盘就会收回。
- 不输入时等待一会儿，弹窗也可能因为页面刷新/同步重新渲染导致键盘收起。
- 调整方式只靠一个“增减数量”输入框表达，不够直观。

根因：
- `handleInput()` 监听 `[data-inventory-stock-adjust-form]` 后调用 `updateInventoryStockAdjustDraft()`。
- `updateInventoryStockAdjustDraft()` 每次输入都 `notify()`，导致整个弹窗 DOM 重建，移动端输入焦点丢失，键盘收起。

修复：
- `directorPage.js`：库存调整弹窗改为“增加 / 减少”两个按钮 + 单独数量输入框。
- `main.js`：删除库存调整输入框的 input 实时 state 更新，只在保存时读取表单数量。
- `state.js`：用 `setInventoryStockAdjustMode()` 只在切换增加/减少按钮时重渲染；保存时按 `mode + amount` 计算最终库存。
- `pages.css`：新增库存调整方向按钮样式。

验证：
- 在库存调整数量输入框输入多位数字，键盘不应因每个字符输入而收起。
- 点击“增加/减少”按钮后只切换方向，不改变当前物资档案字段。

禁止再犯：
- 移动端正在输入的表单字段不要在 `input` 事件里触发全局 `notify()`，除非明确做了焦点和输入值原位恢复。
- 库存调整只读当前数量并提交最终数量，不能让输入框实时驱动整页重渲染。

### 2026-05-21 库存云端事实源与物资详情趋势图修复

现象：
- 手机端库存数量和超管云端 `inventory_items` 表不一致，手机端还显示云端没有或已删除的旧物资。
- 调整库存输入框偶发键盘刚弹出就收回，或停留一段时间后收回。
- 用户希望点击物资名片后直接看到该物资的按日期消耗记录和折线图，而不是点“查看消耗记录”后只筛选底部流水。

根因：
- `refreshCloudInventory()` 使用 `mergeInventoryItems()` 合并云端库存，mock 初始库存和旧缓存不会被清除，导致手机端库存列表不是云端事实表的全量镜像。
- 后台库存刷新、院长轮询和每分钟时钟 `tickClock()` 仍可能在库存调整输入框聚焦时触发 `notify()`，重建弹窗导致移动端键盘收起。
- 物资名片弹窗只提供操作按钮，没有把该物资的 `inventory_usages` 聚合成详情视图。

修复：
- `state.js` 新增 `replaceInventoryItems()`，库存刷新后用云端 `GET /api/inventory/items` 结果全量替换本地库存列表，不再 merge mock/旧缓存。
- `refreshCloudInventory()` 检测库存编辑/调整表单正在输入时，更新内存数据但跳过 `notify()`，避免重建弹窗。
- `main.js` 的院长轮询和每分钟时钟更新在库存输入框聚焦时跳过，避免后台刷新收起键盘。
- `directorPage.js` 物资名片弹窗直接展示该物资的按日期消耗记录、最近流水和 SVG 折线趋势图，移除“查看消耗记录”按钮。
- 底部“使用流水”仍保留为全部物资的日期和名称筛选入口。

验证：
- 进入院长端库存页后，物资列表和云端 `inventory_items?institutionId=inst-001` active 记录一致。
- 打开库存调整输入框并停留超过一分钟，键盘不应被后台刷新或时钟 tick 收起。
- 点击物资名片应直接看到该物资消耗趋势图和按日期聚合记录。

禁止再犯：
- 云端事实表列表型数据如果是事实全集，前端刷新必须 replace，不要 merge mock 数据。
- 正在输入的移动端弹窗必须屏蔽后台 `notify()` 重建；特别是轮询、时钟、静默刷新。
- 物资详情和全局使用流水是两个不同视图：名片详情看单物资趋势，底部流水看全物资索引。

### 2026-05-21 库存使用流水筛选与刷新跳动修复

现象：
- 云端 `inventory_usages` 中仍有早期测试生成的“测试使用”流水。
- 院长端库存页底部“使用流水”的日期筛选显示成完整输入框，占位笨重。
- 点击“按条件刷新”后页面会上下跳动，用户当前位置丢失。
- 刷新按钮放在筛选区里，不符合“右上角刷新”的操作习惯。

根因：
- 测试流水没有清理，仍在云端事实表中被正常查询。
- `refresh-cloud-inventory` action 直接刷新后 `notify()`，没有保存当前滚动快照。
- 使用流水筛选区把日期 input 作为可见控件，且刷新按钮参与筛选区布局。

修复：
- 云端删除 `inventory_usages` 中备注为“测试使用”的测试记录：`inventory-usage-d039cfdbf48e47cb9b512ad7bd1f6c27`。
- `directorPage.js`：使用流水卡片右上角放“刷新”按钮；日期筛选改为日历图标按钮 + 隐藏 date input。
- `main.js`：点击库存刷新前调用 `requestScrollRestore(state.ui.route, getScrollSnapshot())`，刷新后恢复滚动位置。
- `pages.css`：新增 `inventory-usage-head-actions`、`inventory-date-filter` 样式。

验证：
- `GET /api/inventory/usages?institutionId=inst-001&limit=100` 不再返回备注“测试使用”的流水。
- 点击库存页使用流水右上角刷新，页面应保持当前滚动位置。
- 日期筛选区域只显示日历图标，不显示完整日期输入框。

禁止再犯：
- 测试生成的库存流水要么使用测试机构，要么测试后立即清理，不能混入当前调试养老院事实表。
- 列表局部刷新如果会 `notify()`，必须保存并恢复滚动位置。

### 2026-05-21 库存使用流水连续跳动二次修复

现象：
- 院长端库存页点击使用流水刷新后，页面仍会上下乱跳，而且不止跳一次。

根因：
- `refreshCloudInventory()` 一次手动刷新至少触发 loading、数据写入、toast/完成状态多次 `notify()`，第一次修复只在点击前保存了一次滚动快照，后续重渲染仍会覆盖当前位置。
- 库存页顶部和使用流水卡片同时存在 `refresh-cloud-inventory` 按钮，用户看到的“刷新”入口不唯一，刷新动作更容易和页面级刷新混淆。
- 使用流水筛选输入变化会触发 `setInventoryUsageFilter()` 的 `notify()`，但没有在筛选前保存滚动位置。

修复：
- `main.js`：新增 `lockScrollRestore()` / `releaseScrollRestoreLock()`，库存刷新期间用同一滚动快照锁定 2.2 秒，覆盖刷新过程中的连续多次重渲染。
- `main.js`：使用流水筛选输入变化前也调用 `requestScrollRestore()`，避免筛选导致滚动回弹。
- `directorPage.js`：移除库存页标题栏的重复“刷新”按钮，只保留使用流水卡片右上角刷新。

验证：
- 点击使用流水右上角刷新，loading、数据返回、toast 完成期间页面应保持在原位置，不应连续上下跳。
- 修改日期或物资名称筛选后，页面不应跳回顶部。
- 库存页刷新入口只保留在使用流水卡片右上角。

禁止再犯：
- 异步动作如果会连续触发多次 `notify()`，不能只做一次性滚动恢复；必须在整个刷新窗口内锁定同一个滚动快照。
- 同一页面同一语义的刷新入口不要重复放置，否则会造成页面级刷新和局部刷新混淆。

### 2026-05-21 院长端方案页滑动时自动跳动修复

现象：
- 院长端“方案”页正常上下滑动时会突然跳动。
- 有时用户不操作，页面也会自己跳动。

根因：
- 方案页存在后台静默刷新源：院长任务轮询、整院事实表同步、每分钟时钟 `tickClock()`。
- 这些刷新可能在用户滑动中或滑动刚结束时触发 `notify()`，导致页面 DOM 重建并按旧滚动快照恢复，看起来像页面自己上下跳。
- `.director-page--care-plans` 只是方案页容器，真实滚动通常仍在 `.content-area`；旧逻辑可能把非真实滚动容器当成主滚动容器处理，放大恢复误差。

修复：
- `main.js`：记录用户滚动/触摸/滚轮时间，方案页滚动中或刚滚动后跳过任务轮询、整院同步和时钟 tick 的静默刷新。
- `main.js`：如果静默刷新已经返回并触发渲染，方案页在滚动保护窗口内延迟渲染，等滚动停止后再重建 DOM。
- `main.js`：修正 `getPrimaryScrollContainer()`，只有 `.director-page--care-plans` 真的可滚动时才把它当主滚动容器，否则使用 `.content-area`。

验证：
- 在院长端方案页持续上下滑动 20 秒，页面不应突然跳回旧位置。
- 停在方案页不操作，等待机构同步/任务轮询/分钟刷新，不应出现肉眼可见的上下跳动。
- 打开老人时间轴、编辑方案等显式用户操作仍应正常渲染，不被滚动保护吞掉。

禁止再犯：
- 长列表/复杂页面不能在用户滚动过程中被后台静默刷新重建 DOM；轮询返回必须避开滚动窗口或做局部 patch。
- 判断滚动容器必须确认该元素实际可滚动，不能只按页面 class 猜测。

### 2026-05-21 院长端方案页时间轴详情滚动位置修复

现象：
- 在老人时间轴中滚动到中间位置后，点击任务卡打开详情，页面会跳回时间轴顶部。
- 关闭任务详情后也可能回到顶部。
- 从方案页点击老人名片进入时间轴，再返回方案页时，方案页回到最上面，丢失进入前位置。

根因：
- `director-view-task-detail` 和 `close-director-task-detail` 直接修改 `state.ui.directorTaskDetailId` 后 `notify()`，没有为时间轴当前滚动位置加恢复锁。
- `select-director-plan-room` 之前使用锚点恢复 `preview-director-plan-room`，适合“预览选中老人”，不适合“进入全屏/抽屉时间轴”；时间轴 DOM 结构变化后锚点会把方案页位置带偏。
- `closeDirectorPlanTimeline()` 只关闭时间轴状态，没有保存并恢复进入时间轴前的方案页滚动快照。

修复：
- `main.js`：点击时间轴任务卡前调用 `lockScrollRestore()`，加载图片证据并打开详情期间保持时间轴滚动位置。
- `main.js`：关闭任务详情时同样锁定当前滚动位置，避免弹窗层关闭导致底层时间轴回顶。
- `main.js`：进入老人时间轴前保存 `directorPlanReturnScrollSnapshot`；关闭时间轴时用该快照恢复方案页位置。
- `main.js`：进入时间轴不再使用 `requestAnchorRestore("preview-director-plan-room")`，避免锚点恢复和时间轴布局切换冲突。

验证：
- 在时间轴滚到 10:45 附近，点击任意任务卡，打开详情后底层时间轴仍保持原位置。
- 关闭任务详情后，时间轴仍保持原位置。
- 从方案页中部进入老人时间轴再返回，方案页应回到进入前的老人名片/负载区域附近，而不是回到顶部。

禁止再犯：
- 弹窗/详情层只改变覆盖层时，必须保持底层滚动位置，不能让底层列表重新定位。
- 页面模式切换如果会改变 DOM 结构，返回时必须用进入前的滚动快照恢复，不要依赖锚点猜测。

### 2026-05-21 院长端全页面后台刷新跳动与总览时钟移除

现象：
- 院长端总览页“任务总览”标题左侧显示实时时钟，占位明显且用户要求取消。
- 总览页不操作时也会自己跳动。
- 方案页之外的院长端页面同样共用后台静默刷新，理论上都可能出现滚动位置被重渲染抢走的问题。

根因：
- `syncDirectorCloudPolling()` 对所有 `director-*` 页面都会周期性刷新任务；`syncInstitutionSharedStatePolling()` 会刷新机构、人员、老人、模板；`tickClock()` 每分钟触发 `notify()`。
- 之前只对 `director-care-plans` 做了滚动保护，导致 `director-home`、`director-people`、`director-anomaly`、`director-inventory` 等页面仍可能在滚动或静止时被后台刷新重建。
- 总览页左侧时钟由 `renderDirectorLiveClock()` + `data-live-clock` 驱动，时钟本身还会让页面存在每秒 DOM 文本更新和每分钟 `notify()` 风险。

修复：
- `directorPage.js`：移除任务总览标题左侧的 `renderDirectorLiveClock()`。
- `pages.css`：删除 `.director-live-clock` 样式。
- `main.js`：新增通用 `isDirectorScrollProtected()`，把滚动保护从方案页扩展到所有 `director-*` 页面。
- `main.js`：院长端任务轮询、整院事实表同步、分钟 tick 在任意院长端页面滚动中或刚滚动后都跳过。
- `main.js`：后台刷新返回后如果处于院长端滚动保护窗口，会延迟重渲染，避免总览/人员/异常/库存页面跳动。
- `DATA_ARCHITECTURE.md`：补充云端轮询增量同步规则，后续改为先查版本/状态，再决定是否拉取具体事实表。

验证：
- 总览页任务总览标题左侧不再显示时钟。
- 在总览页、人员页、异常页、库存页滚动或停留等待后台轮询，不应出现自动跳动。
- 后续做流量优化时，必须实现状态检查/版本号机制，不能继续周期性全量覆盖前端 state。

禁止再犯：
- 院长端任意页面只要是滚动列表，都不能被后台静默刷新直接重建 DOM。
- 页面可见的实时时钟不能作为业务卡片装饰；如需要当前时间，只能放在系统状态区且不能触发整页 `notify()`。
- 云端轮询必须先查轻量状态，只有变化时才拉取变更域数据。
### 2026-05-21 院长端时间轴滚动回顶与任务同步延迟修复

现象：
- 院长端方案页进入老人时间轴后，滚到中部点击任务卡，页面又跳回时间轴最上方。
- 从老人时间轴返回方案页后，方案页回到最上方而不是进入前的位置。
- 护工端打卡后云端表格很快更新，但院长端任务卡状态同步明显慢。

根因：
- 滚动快照只保存 `.content-area` / `.director-page--care-plans`，没有保存真正滚动的 `.director-plan-sidebar__panel` 和右侧老人列表抽屉滚动位置。
- 点击任务卡详情时使用普通 `getScrollSnapshot()`，在时间轴模式下会把“时间轴内滚动”和“返回方案页滚动”混在一起。
- 新增的 `/api/sync/status` 状态检查在返回 `changed=true` 时立即写入本地版本缓存，随后真正拉取任务前如果再次检查就可能误判无变化；同时 10 秒轮询对院长端状态感知太慢。

修复：
- `main.js`：滚动快照新增 `directorPlanSidebar`、`directorPlanResidentDrawer`，恢复时分别恢复两个真实滚动容器。
- `main.js`：新增 `getDirectorTimelineScrollSnapshot()`；打开/关闭任务详情时只锁定时间轴滚动，不覆盖进入时间轴前保存的方案页返回快照。
- `main.js`：进入时间轴时只在非时间轴状态保存 `directorPlanReturnScrollSnapshot`，避免右侧老人切换或任务详情覆盖返回位置。
- `main.js`：院长端任务轻量轮询间隔从 10 秒改为 3 秒；仍先走 `/api/sync/status`，无变化不拉全量。
- `state.js`：`checkCloudSyncDomains()` 支持 `commit:false`；任务状态检查只有在确认无需拉取或拉取成功后才提交版本缓存，避免“先写版本再跳过拉取”。

验证：
- 在老人时间轴中滚到 08:30/09:30 附近点击任务卡，打开和关闭详情后仍停留在原位置。
- 从时间轴返回方案页后，应回到进入前的老人名片/任务分配附近，而不是顶部。
- 护工端完成任务后，院长端通常 3 秒左右通过状态检查发现变化并刷新任务卡。

禁止再犯：
- 复杂抽屉/侧栏页面必须保存真实滚动容器，不能只保存主内容容器。
- 状态检查接口返回 `changed=true` 时不能立刻提交本地版本，必须等对应事实表成功拉取后再提交。
- 院长端任务状态同步可以提高轻量检查频率，但不能恢复为高频全量拉取。

### 2026-05-21 院长端老人拖拽分配首次无反馈修复

现象：
- 院长端方案页把老人标签拖到护工名片时，第一次拖动可能没有任何页面变化或提示，第二次拖动才像是成功。

根因：
- 原生 HTML5 `drag/drop` 只依赖 `event.dataTransfer.getData("text/plain")` 传递 `elderId`。
- Android WebView 上第一次长按/拖动时 `dataTransfer` 可能为空或读取失败，旧代码 `catch (_) {}` 静默吞掉错误，导致没有任何提示。
- 分配动作先本地改负责人再异步写 `/api/elder-assignment`，云端失败时没有回滚负责人，提示也不够明确。

修复：
- `caregiver-app/src/main.js`：`dragstart` 时同时保存 `directorElderAssignmentDrag` 备用状态；`drop` 时优先读 `dataTransfer`，为空则读备用状态。
- `drop` 解析失败或缺少 `elderId/caregiverId` 时调用 `actions.announce()` 给出明确提示，不再静默失败。
- `caregiver-app/src/store/state.js`：`reassignElderToCaregiver()` 记录旧负责人；云端同步失败时回滚 `elder.assignedCaregiverId` 并提示“分配失败，云端未保存，请重试”；成功后提示“分配已同步云端”。

验证：
- 在 Android WebView 第一次拖动老人标签到护工名片，应立即触发分配或显示明确失败提示。
- 云端失败时 UI 不能保留假成功负责人。
- 分配成功后 `/api/elders?institutionId=inst-001` 中该老人 `assignedCaregiverId` 必须与页面一致。

禁止再犯：
- 移动端拖拽不能只依赖 HTML5 `dataTransfer`；必须保留内存级备用拖拽上下文。
- 任何拖拽分配失败都不能 `catch (_) {}` 静默吞掉。
- 老人默认负责人变更必须以 `/api/elder-assignment` 成功为准；失败必须回滚或明确显示未保存。

### 2026-05-21 云端轮询状态检查与机构存储配额落地

现象：
- 院长端和护工端后台轮询仍会周期性请求全量任务/人员/模板，数据未变化时也可能触发状态写入和页面重建。
- 超管机构表已有 `storage_quota_bytes/storage_used_bytes/status`，但 `storage_used_bytes` 没有按机构实际数据统计，超过配额也不会自动暂停机构服务。

根因：
- 前端缺少轻量状态接口，只能通过全量列表接口判断是否变化。
- 后端没有把机构业务行、图片/静态文件计入机构用量，也没有在鉴权链路检查机构暂停状态。

修复：
- `remote-main.py`：新增 `GET /api/sync/status`，按 `tasks/personnel/templates/inventory/anomalies/attendance` 返回 `version/count/latestUpdatedAt/changed`。
- `state.js/cloudApi.js`：新增 `fetchSyncStatus()` 和域版本缓存；院长任务轮询、护工任务轮询、整院事实表轮询先查状态，`changed=false` 时不拉全量、不 `notify()`。
- `remote-main.py`：新增 `calculate_institution_storage_bytes()`、`refresh_institution_storage()` 和 `POST /api/admin/institutions/{id}/recalculate-storage`。
- `GET /api/admin/institutions` 和修改配额会刷新已用存储；超过配额自动设置 `institutions.status=suspended` 并撤销该机构 session。
- `get_current_user()` 和 `/api/auth/login` 对普通用户检查机构 `suspended`，暂停后返回 403；管理员后台仍可操作配额和恢复。
- `DATA_ARCHITECTURE.md`：补充状态检查接口、机构存储统计口径和暂停服务规则。

验证：
- 本地 `ELDER_API_KEY=dummy python -m py_compile remote-main.py` 通过。
- `git diff --check -- remote-main.py caregiver-app/src/utils/cloudApi.js caregiver-app/src/store/state.js caregiver-app/src/data/mockData.js` 通过。
- 部署后需验证 `/api/sync/status?institutionId=inst-001&domains=tasks,personnel&recordDate=YYYY-MM-DD` 返回域版本。
- 超管刷新机构列表后，`storageUsedBytes` 应为真实统计值；把 quota 调低到低于 used 时机构应变为 `suspended`。

禁止再犯：
- 后台轮询不能跳过状态检查直接全量覆盖 state；数据没变化不能触发重渲染。
- `storage_used_bytes` 只能由后端统计，不允许前端提交或本地估算。
- 机构暂停必须在后端鉴权链路拦截，不能只靠前端隐藏按钮。

### 2026-05-21 任务卡同步时快时慢与轮询重叠修复

现象：
- 护工端打卡后，院长端有时秒级看到任务卡变化，有时需要等待二十多秒。
- 用户担心如果某次同步请求一直不响应，前端会不会长期不刷新。

根因：
- 院长端任务状态检查间隔是 3 秒，护工端任务轮询间隔是 10 秒；如果刚好错过一轮，就要等下一轮。
- `requestJson()` 默认 30 秒超时，旧任务轮询没有单飞锁；网络抖动或服务器慢响应时，同一日期任务刷新可能重叠发起，多轮请求互相拖慢。
- `/api/sync/status` 是轻量状态检查，正常情况下很快；但它和 `/api/tasks` 旧逻辑都沿用 30 秒默认超时，导致“慢的时候二十多秒”是可能发生的。

修复：
- `cloudApi.js`：`fetchSyncStatus()` 和 `fetchPublishedTasks()` 支持前端传入 `timeout`，且不会把 `timeout` 拼进 URL 查询参数。
- `state.js`：任务状态检查超时固定为 6 秒，任务明细拉取超时固定为 10 秒。
- `state.js`：新增 `taskRefreshInFlight` 单飞锁；同一端、同一机构、同一日期、同一护工的任务刷新如果上一轮还没结束，下一轮直接复用上一轮 Promise，不再叠加请求。
- 超时或失败不提交本地 sync version，下一轮轮询仍会继续检查并拉取，避免一次失败后永久误判“无变化”。

验证：
- `node --check caregiver-app/src/utils/cloudApi.js` 通过。
- `node --check caregiver-app/src/store/state.js` 通过。
- `git diff --check -- caregiver-app/src/utils/cloudApi.js caregiver-app/src/store/state.js PROJECT_MAP.md` 通过。
- 前端发布后确认 APK 安装版本。

禁止再犯：
- 轮询类任务必须有 in-flight 单飞锁，不能允许慢请求堆积。
- 轻量状态检查和全量数据拉取必须分别设置短超时；不能把 30 秒默认超时用于高频轮询。
- 只有确认无需拉取或拉取成功后，才能提交本地 sync version；失败不能污染版本缓存。

### 2026-05-21 同一分钟反复打卡导致院长端任务状态一分钟后才同步修复

现象：
- 护工端反复点击“房间整理”等同一任务卡，云端超管表已经显示完成，但院长端等待 30 秒以上仍未同步，约 1 分钟左右才更新。
- 该问题在同一分钟内连续取消/完成同一任务时更容易出现。

根因：
- 前端 `serializeCloudTask()` 提交的 `updatedAt` 是展示时间，精度只有 `YYYY-MM-DD HH:mm`。
- 后端 `/api/tasks` 和 `/api/tasks/bulk` 直接把 `request.updatedAt` 写入 `published_tasks.updated_at`。
- `/api/sync/status` 的 tasks 域版本只由 `record_date + count + latestUpdatedAt` 生成；同一分钟内多次任务状态变化时 `latestUpdatedAt` 没变，院长端状态检查误判 `changed=false`，所以不会拉 `/api/tasks`。

修复：
- `remote-main.py`：`upsert_published_task()` 和 `_upsert_published_task_row()` 的 `existing.updated_at` 改为后端 `current_time = now_iso()`，不再接受前端 `updatedAt` 作为同步版本时间。
- 前端提交的 `completedAt/recordedAt/exceptionReportedAt` 仍保留为业务时间；只有 `updated_at` 作为同步检测字段必须使用服务器高精度写入时间。
- `DATA_ARCHITECTURE.md`：补充 `published_tasks.updated_at` 是任务同步版本事实源，禁止使用前端分钟级时间。

验证：
- `python -m py_compile remote-main.py` 通过。
- 部署后 `systemctl is-active elder.service` 必须返回 `active`。
- 同一分钟内连续取消/完成同一任务卡，`GET /api/sync/status?domains=tasks` 的 tasks version 必须变化，院长端应在下一轮 3 秒状态检查后刷新。

禁止再犯：
- 所有用于同步版本、轮询判断、增量检查的 `updated_at` 必须由后端生成，不能信任前端传入时间。
- 前端业务显示时间可以分钟级；后端事实表版本时间必须具备秒/微秒级变化能力。

### 2026-05-21 院长端库存页不自动同步库存使用修复

现象：
- 护工端提交库存使用后，云端库存数量已经变化，但院长端库存页停留不动时数量不刷新。
- 只有点击物资名片、手动刷新或重新进入库存页后，库存数量才会更新。

根因：
- 库存事实源是 `inventory_items.quantity` 和 `inventory_usages`，后端写使用记录时已经同步更新这两张表。
- 前端院长端库存页只在进入页面、手动刷新、打开物资名片时调用 `refreshCloudInventory()`。
- 后台轮询只覆盖任务、人员、模板等域，没有对 `inventory` 域做 `/api/sync/status` 检查，所以跨端库存变化不会主动刷新当前页面。

修复：
- `main.js`：新增院长端库存页专用 `syncDirectorInventoryPolling()`，停留在 `director-inventory` 时每 5 秒检查一次 `inventory` 域状态。
- `state.js`：`refreshCloudInventory()` 支持 `checkStatus`，先走 `/api/sync/status?domains=inventory`，无变化不拉全量，有变化才拉 `inventory_items` 和 `inventory_usages`。
- `state.js`：库存刷新增加 `inventoryRefreshInFlight` 单飞锁，避免慢请求叠加。
- 进入库存页和护工端库存使用页时使用 `checkStatus: "force"` 强制首次全量刷新；后台轮询才使用轻量状态检查。

验证：
- `git diff --check -- caregiver-app/src/main.js caregiver-app/src/store/state.js PROJECT_MAP.md` 通过。
- 前端发布后确认 APK 安装版本。
- 护工端提交库存使用后，院长端库存页不点名片、不重新进入页面，也应在下一轮库存状态检查后刷新数量和使用流水。

禁止再犯：
- 新增事实表如果需要跨端实时感知，必须接入对应业务域的轻量状态检查轮询。
- 页面“进入时刷新”和“点开详情刷新”不是跨端同步，不能替代后台状态检查。
- 事实全集类库存列表刷新必须 replace 云端列表；流水可以按分页/筛选 merge。

### 2026-05-21 护工端后台刷新导致页面自动跳动排查与修复

现象：
- 护工端页面正常上下滑动或停留时，页面可能自己跳动。
- 风险页面包括首页任务、老人详情时间轴、任务详情、护理记录、库存使用和我的页面。

根因：
- 院长端之前已经有 `isDirectorScrollProtected()`，后台任务轮询、机构事实表同步和分钟刷新会避开院长端滚动。
- 护工端没有对应保护；`syncCaregiverTaskPolling()`、`syncCaregiverRecordRoute()`、`syncInstitutionSharedStatePolling()` 等静默刷新返回后仍可能 `notify()` 重建 DOM。
- `renderApp()` 只在院长端滚动中延迟重渲染，护工端滚动时没有延迟保护，因此后台刷新会抢走滚动位置。

修复：
- `main.js`：新增 `isCaregiverRoute()`、`isCaregiverScrollProtected()`、`isAppScrollProtected()`。
- `main.js`：`renderApp()` 从院长端专用滚动保护扩展为当前应用滚动保护，护工端滚动中非显式重渲染会延迟。
- `main.js`：护工任务轮询在护工端滚动/输入时跳过，避免任务同步返回时重建当前列表。
- `main.js`：护工护理记录路由刷新在滚动时跳过。
- `main.js`：整院事实表轮询从只判断院长端滚动改为判断所有受保护页面滚动。

验证：
- `git diff --check -- caregiver-app/src/main.js PROJECT_MAP.md` 通过。
- 前端发布后确认 APK 安装版本。
- 护工端在首页、老人详情时间轴、任务详情、护理记录页持续滑动 20 秒，不应因后台刷新自动跳动。

禁止再犯：
- 任何后台静默刷新只要可能触发 `notify()`，都必须检查当前角色页面是否正在滚动或输入。
- 滚动保护不能只做院长端；护工端和后续家属端如果有后台轮询，也必须接入统一保护。
- 显式用户操作可以立即渲染；静默轮询必须避开滚动窗口或做局部 patch。

### 2026-05-21 院长端 OpenClaw AI 助手 Demo

现象：
- 用户希望院长端内置 AI 助手，可以问不会操作的地方，并逐步支持替院长准备一些 APP 操作。

架构决策：
- AI key 和 URL 只能放在后端，使用现有 `OPENCLAW_GATEWAY_URL/OPENCLAW_AUTH_TOKEN/OPENCLAW_TEXT_MODEL`。
- 前端只调用后端代理接口，不能暴露 OpenClaw key。
- AI demo 不直接写数据库，不直接操作 DOM；只能返回回答和建议动作。
- 当前 demo 仅允许 `open_page` 低风险动作直接执行；写操作需要后续确认卡片体系。

实现：
- `remote-main.py`：新增 `DirectorAssistantRequest`、`build_director_assistant_prompt()`、`POST /api/ai/director-assistant`。
- 后端为 AI 注入当前机构的护工、老人、当天任务、库存概要，并要求 OpenClaw 返回严格 JSON。
- `cloudApi.js`：新增 `askDirectorAssistant()`。
- `state.js`：新增院长 AI 助手状态、发送消息 action、建议动作执行入口。
- `directorPage.js/pages.css/main.js`：院长端通用头部增加 AI 助手按钮，AI 面板由全局渲染层挂载，所有院长页面都能打开。
- `remote-main.py`：OpenClaw 网关如果返回 UTF-8 被误按 Latin-1 解码的中文，后端统一修复后再返回前端。
- `DATA_ARCHITECTURE.md`：记录 AI 助手事实源、权限边界和动作限制。

验证：
- 后端 `python -m py_compile remote-main.py` 必须通过。
- 前端发布后确认 APK 安装版本。
- 院长端打开 AI 助手，输入问题后应由 `/api/ai/director-assistant` 返回中文回答；若 OpenClaw 不可用，前端应显示错误而不是白屏。
- 不只在院长首页验证，人员、方案、库存等院长页面点击通用头部 AI 按钮也必须能看到同一个 AI 面板。

禁止再犯：
- AI 不能直接写事实表，必须走白名单 action/API。
- AI 不能跨机构读取上下文。
- 写操作必须有确认卡片和操作日志后才能执行，不能从自然语言直接落库。
- 通用头部里的入口不能只在某一个页面渲染对应弹窗；入口和面板必须在同一全局作用域可用。
