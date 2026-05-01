# 后续优化计划

## P0：稳定当前迭代速度

1. 维护 `PROJECT_MAP.md`
   - 每次新增页面、状态字段、云端接口后补充索引。
   - 目标是把常见定位时间压到 1 到 3 分钟。

2. 每个可运行版本提交 Git
   - 推荐提交信息格式：`feat: xxx`、`fix: xxx`、`docs: xxx`。
   - 发布云端前先看 `git diff --stat`，确认改动范围。

3. 建立 smoke test
   - 先覆盖四条主链路：日报模板、人员同步、临时任务、护工时间轴。
   - 目标是减少依赖虚拟机手动验证。

## P1：拆分大文件

1. `directorPage.js`
   - 拆出 `directorHomePage.js`
   - 拆出 `directorReportTemplatePage.js`
   - 拆出 `directorPeoplePage.js`
   - 拆出 `directorPlanPage.js`
   - 拆出 `directorTemporaryTaskPage.js`

2. `state.js`
   - 拆出 `taskStore.js`
   - 拆出 `peopleStore.js`
   - 拆出 `dailyReportStore.js`
   - 拆出 `cloudSyncStore.js`

## P2：云端模型强化

1. 按机构 ID 建立清晰隔离
   - 所有人员、任务、日报、模板、物资都带 `institutionId`。
   - 本地缓存也按 `institutionId` 分区。

2. 增加版本字段
   - 日报模板版本。
   - 人员数据版本。
   - 养老院基础信息版本。

3. 增加冲突策略
   - 院长端优先。
   - 护工端离线记录按时间戳合并。

## P3：体验与性能

1. 减少全页重绘
   - 对输入框、时间轴、弹窗使用局部状态更新。
   - 定时器只更新需要变化的 DOM。

2. 降低虚拟机依赖
   - 用浏览器 smoke test 验证主要逻辑。
   - 虚拟机只验证安装包、WebView、相机/文件选择、系统更新流程。
