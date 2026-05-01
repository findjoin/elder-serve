# 项目地图

这个文件用于减少后续改动前的重复定位时间。改功能前先查这里，再进入具体文件。

## 目录入口

- `caregiver-app/src/main.js`：Web 端总入口、路由渲染、全局点击/输入事件、轮询与滚动恢复。
- `caregiver-app/src/store/state.js`：核心状态、选择器、业务动作、云端同步、任务/日报/人员数据转换。
- `caregiver-app/src/data/mockData.js`：本地演示初始数据。
- `caregiver-app/src/pages/directorPage.js`：院长端全部主要页面渲染。
- `caregiver-app/src/pages/elderDetailPage.js`：护工端老人档案与今日时间轴。
- `caregiver-app/src/pages/homePage.js`：护工端任务中心/楼层入口。
- `caregiver-app/src/pages/caregiverDailyReportPage.js`：护工端日报填写。
- `caregiver-app/src/styles/pages.css`：主要页面样式。
- `caregiver-app/src/utils/cloudApi.js`：云端 API 客户端。
- `caregiver-android/`：Android WebView 壳、APK 构建与更新安装。
- `scripts/publish_apk.ps1`：发布 APK 到云端更新接口。
- `scripts/seed_demo_institution.py`：生成并上传演示养老院、人员、日报模板、任务和记录。

## 常改页面索引

- 院长端总览页：`renderDirectorHomePage` in `caregiver-app/src/pages/directorPage.js`
- 院长端楼层状态详情：`renderDirectorFloorDetailPage` in `caregiver-app/src/pages/directorPage.js`
- 院长端方案页：`renderDirectorCarePlansPage` in `caregiver-app/src/pages/directorPage.js`
- 院长端日报模板编辑：`renderReportTemplateEditor` in `caregiver-app/src/pages/directorPage.js`
- 院长端临时任务发布：搜索 `directorTemporaryTask` / `publish temporary task` in `caregiver-app/src/pages/directorPage.js` and `state.js`
- 院长端人员管理：`renderDirectorPeoplePage` in `caregiver-app/src/pages/directorPage.js`
- 护工端老人档案时间轴：`renderElderDetailPage` in `caregiver-app/src/pages/elderDetailPage.js`
- 护工端任务记录/异常记录：搜索 `taskRecord` / `taskException` in `caregiver-app/src/main.js` and `state.js`

## 核心状态字段

- `state.tasks`：所有日常任务和临时任务。
- `state.dailyReportTemplates`：日报模板定义。
- `state.careRecords`：护工填写日报后的记录。
- `state.caregivers`：护工人员信息。
- `state.elders`：老人信息和日报模板绑定。
- `state.institution`：养老院基础信息。
- `state.ui`：当前页面、弹窗、草稿、搜索、滚动/选择状态。

## 关键选择器/计算

- `buildDirectorTaskOverview`：院长端任务总览，包含预期进度、实际完成、临时任务、异常数。
- `buildDirectorFloorCaregiverProgress`：楼层详情内护工预期/实际进度。
- `buildDirectorExceptionReports`：异常报告列表。
- `buildDirectorCaregiverStatistics`：统计页护工状态。
- `enrichTask`：任务关联老人、护工、模板后的展示模型。

## 云端数据分层

- 任务信息：日报模板、日报记录、日常任务、临时任务。
- 人员信息：护工、老人、房间楼层归属、日报绑定。
- 养老院信息：机构名称、楼层/房间、默认模板、物资等。

## 构建与发布

- 构建调试包：在 `caregiver-android` 下运行 `.\gradlew.bat assembleDebug`。
- 发布更新包：使用 `scripts/publish_apk.ps1`。
- Git 绝对路径：`C:\Program Files\Git\cmd\git.exe`
