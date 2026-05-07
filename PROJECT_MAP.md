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
    cloudApi.js ─── HTTP 客户端（10 个接口函数）
       │
    mockData.js ─── 任务生成引擎（模板 → 日常任务）
```

**核心循环**：`用户操作 → action 修改 state → notify() → renderApp() → app.innerHTML = 新 HTML`

### 1.1 State 容器（state.js）

```
state
├── tasks[]              ← 所有任务（日常+临时+异常），核心数据集
├── elders[]             ← 老人信息（楼层、房间、护理方案绑定）
├── caregivers[]         ← 护工信息（楼层、班次、考勤）
├── careRecords[]        ← 护工日报记录
├── dailyReportTemplate  ← 当前启用的日报模板
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

### 1.5 任务引擎（mockData.js + state.js）

```
buildTasksFromConfiguration()
├── 遍历 elderCarePlans → 按护理方案生成 care plan 任务
├── 遍历 dailyReportTemplate → 按日报模板生成 report template 任务
├── 主匹配：planItemId（精确匹配旧任务状态）
└── 备匹配：elderId|title|schedule（模板变更后兜底匹配）

rebuildTasks()
├── 保留所有临时任务（isTemporaryTask）
├── 调用 buildTasksFromConfiguration 重建日常任务
└── 触发 refreshDirectorOverview + ensureCurrentSelections

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
  │   ├─ rebuildTasks() (state.js:1435) — 重建日常任务
  │   │   └─ 被 applyInstitutionStateSnapshot (state.js:668) 调用
  │   │       条件：caregivers/elders/institution/template/carePlans 任一 JSON 变更
  │   ├─ refreshDirectorCloudTasks (main.js:2102, 10s轮询)
  │   │   └─ mergeCloudTask (state.js:573) — Cloud-Last-Write-Wins
  │   │   └─ buildTaskSignature 对比后才 notify (state.js:3902)
  │   ├─ refreshDirectorCloudReports (main.js:2101, 10s轮询) — 合并 careReports
  │   ├─ refreshInstitutionSharedState (main.js:2169, 12s轮询) — 人员/模板快照
  │   │   └─ applyInstitutionStateSnapshot → 5 字段 JSON 对比 → rebuildTasks
  │   └─ tickClock() (state.js:1883) — 每分钟触发 notify()
  │
  └─ 已知不稳定点：
      ├─ buildTasksFromConfiguration (mockData.js:926) 排序用 elderId tiebreak
      │   vs sortTasksBySchedule (state.js:1098) 排序用 id tiebreak → 不一致
      ├─ applyInstitutionStateSnapshot 中 roomsByFloor 内数组未排序 → JSON 对比假阳性
      └─ previousByFallback Map "last wins" 在输入顺序变化时非确定性
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
│   ├── applyDailyReportTemplate → rebuildTasks → buildTasksFromConfiguration
│   │   → 遍历每个老人，检查 elder.reportTemplateId === 模板.id
│   │   → 按模板 section×item 生成任务，每条带 timeWindow 作为执行时间区间
│   └── publishReportTemplateGeneratedTasks → 每条任务 POST /api/tasks
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

### 2.5 人员管理

```
挂载点：state.caregivers + state.elders
├── 操作：add/update/remove → rebuildTasks（任务重分配）→ syncInstitutionSharedState → publishReportTemplateGeneratedTasks
├── 渲染：renderDirectorPeoplePage + renderPersonnelDraftDialog
└── 同步：buildInstitutionStateSnapshot → POST /api/institution-state
         其他端轮询 → applyInstitutionStateSnapshot → 7 字段逐一 JSON 对比
```

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
  ① rebuildTasks 是否被意外触发？
     → 看控制台 [INST-CHANGE] / [STRUCTURE-CHANGED] / [REBUILD-TASKS] 日志
     → applyInstitutionStateSnapshot (state.js:668) 5 字段 JSON 对比是否假阳性
     → roomsByFloor 内数组未排序、Map 遍历顺序不稳定都可能触发
  ② 排序不一致导致百分比漂移？
     → buildTasksFromConfiguration (mockData.js:926) sort 用 elderId tiebreak
     → sortTasksBySchedule (state.js:1098) sort 用 id tiebreak
     → 不同排序下 countExpectedDueTasks 的 handledCount 可能差 1
  ③ 云端轮询是否反复覆盖本地？
     → 看控制台 [CLOUD-TASKS] 日志
     → buildTaskSignature (state.js:3902) 计算签名是否漏掉变化字段
     → serializeCloudTask (state.js:512) 每次都生成新 updatedAt → 签名始终变化？
  ④ 选择器计算逻辑是否正确？
     → countExpectedDueTasks (state.js:1116): max(scheduledDue, handledCount)
     → percentNumber (state.js:1129): 分子/分母，total=0 返回 0
  ⑤ 数据来源是否正确？
     → 本地：查 mockData.js buildTasksFromConfiguration
     → 云端：curl GET /api/tasks?institutionId=demo-qinghe-care
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
     → shouldAcceptCloudTask 是否拒绝了该任务？
  ③ 合并逻辑是否正确？
     → mergeCloudTask 是否覆盖了本地修改？
  ④ rebuildTasks 是否在院长端删除了云端数据？
     → 人员/模板变更后 rebuildTasks 会重建所有任务
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
| `buildTasksFromConfiguration` | mockData.js:926 | 模板→任务生成（按 planItemId 匹配旧状态） |
| `rebuildTasks` | state.js:1435 | 重建日常任务（保留临时），触发 overview 更新 |
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
| `shouldAcceptCloudTask` | state.js:~1466 | 判断是否接受云端任务 |
| `buildTaskSignature` | state.js:3902 (director) / 3968 (caregiver) | 任务集合签名 = JSON([id,status,exception...]) |
| `applyInstitutionStateSnapshot` | state.js:668 | 5 字段 JSON 对比 → structureChanged → rebuildTasks |
| `syncDirectorCloudPolling` | main.js:2079 | 院长端 10s 轮询（tasks + care-records） |
| `syncCaregiverTaskPolling` | main.js:2107 | 护工端 10s 轮询（自己的 tasks） |
| `syncInstitutionSharedStatePolling` | main.js:2169 | 12s 全局轮询（人员/机构快照） |

### 4.4 院长选择器 & 渲染链

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
6. **临时任务隔离** — `temp-task-` 前缀 ID，rebuildTasks 时保留，不受模板影响
7. **轮询仅变更通知** — 签名对比/JSON 对比，数据未变不触发 DOM 重建
8. **实时时钟绕过渲染** — 每秒直接操作 DOM textContent，分钟变更才触发 notify 更新进度
9. **sortTasksBySchedule id tiebreak** — schedule 相同时按 id 排序，保证任务列表确定性
10. **进度百分比 = max(时间到期, 已处理)** — expectedDue 取 scheduledDue 和 handledCount 的较大值，确保已处理的不会因时间未到而"缩水"

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
