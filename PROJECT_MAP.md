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
└── 同步：buildInstitutionStateSnapshot → POST /api/institution-state
         其他端轮询 → applyInstitutionStateSnapshot → 7 字段逐一 JSON 对比
```

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
| `/api/admin/published-tasks` | GET | 超管查看所有发布任务 |
| `/api/admin/sessions` | GET/DELETE | 超管查看/踢出在线会话 |
| `/api/admin/app-releases` | GET | 超管查看 APP 发布历史 |

**Auth 双通道**：`get_current_user` 中间件优先检查 `Authorization: Bearer <token>` → 回退 `x-api-key`。无效 Bearer 直接 401 不回退。新增 4 张表：`users`、`sessions`、`institutions`、`admins`。

**Web 管理后台**：`http://49.235.183.62/admin` — 独立 Web 页面（static/admin.html），超管登录后可查看全部 11 张数据库表数据（8 个 Tab：机构管理 / 用户管理 / 在线会话 / APP版本 / 老人档案 / 日报模板 / 护理记录 / 发布任务）。

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

> **任务生成已从 APP 端迁移到服务端。服务端的正确性是整个系统的根基。以下 3 个模式绝对不可改坏。**

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

### 修改服务端前必须回答的 5 个问题

修改 `remote-main.py` 的 `upsert_published_task`、`task_to_dict`、`generate_tasks_for_date` 之前：

1. **结构字段会不会丢？** — request 是部分更新还是全量？Pydantic model 的默认值会不会覆盖 DB？
2. **raw_payload 是合并还是替换？** — 用 `=` 赋值还是用 dict merge + non-empty guard？
3. **task_to_dict 返回的数据完整吗？** — 优先级顺序对吗？空值过滤有效吗？
4. **用 curl 验证过了吗？** — 至少覆盖：创建任务 → 护工标记异常 → 再次查询 → 任务标题/时间/老人名是否还在？
5. **改了 generate_tasks_for_date 后 regenerate 测试了吗？** — `POST /api/tasks` 触发 regen → 检查返回的任务数量和字段完整性

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
- 模板字段渲染：`renderReportTemplateFields()` 在 `caregiverDailyReportPage.js:51`
- 院长日报页：`renderDirectorCareRecordsPage()` 在 `directorPage.js:3018`
- 日历：`renderDirectorInboxCalendar()` 在 `directorPage.js:405`
- 单日详情：`renderDirectorInboxDayDialog()` 在 `directorPage.js:466`
- 归档预览：`renderDirectorCareRecordPreview()` 在 `directorPage.js:631`
- 后端摘要：`create_summary()` 在 `remote-main.py:56`
- 云端表：`care_records` 在 `remote-main.py:220`

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
- 共享快照：`institution_states` (`remote-main.py:312`) 存 `personnelInfo`，其他端通过 `state.js:2077 refreshInstitutionSharedState()` 拉取。

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
  → directorPage.js:1541 renderSelectedPlan()
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

修复点：

- `state.js:654 syncPendingElderTasksToCaregiver()`：老人改分配后，立即把当天、非临时、`pending` 的本地任务 `caregiverId/defaultCaregiverId` 改为目标护工，已完成/异常/不配合任务保留原护工归属，避免覆盖执行记录。
- `state.js:691 uploadSyncedElderTasks()`：将上述受影响任务逐条 `uploadPublishedTask()` 到云端 `POST /api/tasks`，直接更新 `published_tasks`，不再只依赖 `POST /api/institution-state` 后端重生成。
- `state.js:4492 reassignElderCaregiver()` / `state.js:4526 reassignElderToCaregiver()`：分配动作现在顺序执行“本地任务归属更新 -> 上传整院共享状态 -> 上传受影响任务 -> 院长端按当前日期刷新云端任务”。
- `state.js:4337 refreshDirectorCloudTasks()`：支持传入 `recordDate`，分配完成后按 `state.director.date` 拉取云端任务，确保院长页面和护工任务中心使用同一日期的云端任务表。

云端对应：

- 老人手动绑定仍写入 `institution_states.personnelInfo.elders[].assignedCaregiverId`，后端 `remote-main.py:2466 upsert_institution_state()` 会同步到 `elders.assigned_caregiver_id` 并触发当天任务重生成；快照里的 `taskInfo.recordDate` 也会触发该业务日期的任务重生成，避免 APP 日期和服务器 UTC 日期不一致。
- 前端新增的直接任务同步写入 `published_tasks`，后端入口是 `remote-main.py:2150 upsert_published_task()`；护工任务中心通过 `GET /api/tasks?caregiverId=...&recordDate=...` 拉取时会立即看到新归属任务。
### 13.9 2026-05-14 院长护理方案时间轴重复日报任务修复

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

### 13.10 2026-05-14 APK v4.24 发布记录

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
