# Elder Serve Agent Rules

本文件是 Codex 进入本项目后的最高优先级项目规则。每次分析、修 Bug、改代码前必须先读本文件，再按 `PROJECT_MAP.md` 和 `DATA_ARCHITECTURE.md` 定位。

## 0. 工作流程硬规则

1. 先确认数据事实源，再判断页面 Bug。不要从截图直接推断云端状态。
2. 每次修 Bug 必须更新 `PROJECT_MAP.md`，写清楚问题、根因、禁止再犯规则、验证方式。
3. 涉及数据流、表结构、事实源变化时，必须同步更新 `DATA_ARCHITECTURE.md`。
4. 前端改动后必须发布并安装最新版 APK：
   `.\scripts\release_frontend_apk.ps1 -BaseUrl "http://49.235.183.62" -ApiKey "elder_safe_token_2026" -ReleaseNotes "..."`
5. 后端改动必须部署到 `49.235.183.62:/home/ubuntu/elder_backend/main.py`，执行 `py_compile`，重启 `elder.service`，确认服务 `active`。
6. 不要回退用户或历史任务已有改动；当前工作区长期存在未提交改动，改动前用 `git status --short` 识别范围。

## 1. 核心事实源

| 业务问题 | 唯一事实源 | 不能使用 |
|---|---|---|
| 护工是谁、账号是否正常 | `caregivers` + `users.role_entity_id` | 已删除的 `institution_states` / 本地快照新增人员 |
| 老人是谁、在哪个房间 | `elders` | 任务里的老人快照反写老人表 |
| 老人默认负责人 | `elders.assigned_caregiver_id` | `published_tasks.caregiver_id` 反推默认负责人 |
| 护工当天要做什么 | `published_tasks` 按 `caregiver_id + record_date` 查询 | `caregivers.floor` 推断任务 |
| 护理记录 | `care_records` | 本地草稿当云端事实 |
| 异常事件 | `anomalies`；旧任务异常字段只做兼容显示 | `published_tasks.note` 当异常状态 |
| 库存数量 | `inventory_items.quantity` | 已删除的 `institution_states` 快照 |
| 库存使用流水 | `inventory_usages` | 前端本地历史 |
| App 最新版 | `app_releases` | 本地 APK 文件名猜测 |

## 2. 护工、楼层、分配规则

- `caregivers.floor` 只是护工常驻/默认楼层展示字段，不是权限，不是分配限制。
- 护工可以负责多个楼层老人，也可以接收其它楼层临时/特殊任务。
- 院长分配老人给护工的事实源是 `elders.assigned_caregiver_id`。
- 院长发布临时任务给护工的事实源是 `published_tasks.caregiver_id`。
- 后端 `_resolve_caregiver_for_elder()` 只能使用显式 `assigned_caregiver_id`，不要求同楼层；老人未指定负责人时必须返回空，不能用 `caregivers.floor` 自动兜底到护工端。
- `POST /api/elder-assignment` 只能校验同机构和实体存在，不能因为楼层不同拒绝分配。
- 院长端“某楼层任务分配”面板必须按本楼层老人实际 `assignedCaregiverId` 反推出护工列表；不能只显示 `caregiver.floor === 当前楼层` 的护工。
- 如果护工常驻某楼层，或实际被分配到某楼层老人，该楼层任务分配面板都必须显示该护工名片；即使当前没有负责房间，也要显示“本层暂无负责房间”作为可拖拽分配目标。
- 护工端任务中心必须按 `published_tasks` 聚合楼层和房间；不能只按护工档案楼层显示。

## 3. 已删除旧表规则

- `institution_states`、`care_records`、`task_completions` 已从后端物理表中删除。
- 旧接口 `/api/institution-state`、`/api/care-records`、`/api/task-completions` 只允许返回 `410 Gone`，不能重新启用写入。
- `applyInstitutionStateSnapshot()` 这类旧快照逻辑后续前端升级时必须移除，不能把陌生护工/老人合入当前机构事实列表。
- `_loadCloudPersonnel()` 必须拉 `/api/caregivers`、`/api/elders`、`/api/auth/users`，再用事实表修正本地 `state`。
- 禁止恢复 `institution_states` 作为跨端同步层；跨端同步必须走独立事实表接口。

## 4. 老人分配数据流

正确链路：

```text
院长端拖拽/点击分配
  -> state.js reassignElderToCaregiver / reassignElderCaregiver
  -> cloudApi.js assignElderCaregiver
  -> POST /api/elder-assignment
  -> elders.assigned_caregiver_id
  -> regenerate_tasks_for_elders
  -> published_tasks.caregiver_id/default_caregiver_id
  -> 护工端 GET /api/tasks
```

禁止链路：

```text
published_tasks 反推老人默认负责人
已删除的 institution_states 空 assignedCaregiverId 覆盖 elders.assigned_caregiver_id
caregiver.floor 限制院长跨楼层分配
caregiver.floor 把未分配老人自动塞给常驻楼层护工
前端 uploadInstitutionState 自己拼负责人同步
```

## 5. 验证清单

修数据流 Bug 后至少验证：

- 云端事实表：直接查对应 API，不只看页面。
- 前端展示：院长端和护工端都确认。
- 跨端同步：重新登录或刷新后仍一致。
- APK：前端改动必须确认虚拟手机安装版本 `adb shell dumpsys package com.elderserve.caregiver`。
- 后端：接口变更必须确认 `systemctl is-active elder.service`。

常用接口：

```powershell
Invoke-RestMethod -Uri "http://49.235.183.62/api/elders?institutionId=inst-001" -Headers @{"x-api-key"="elder_safe_token_2026"}
Invoke-RestMethod -Uri "http://49.235.183.62/api/caregivers?institutionId=inst-001" -Headers @{"x-api-key"="elder_safe_token_2026"}
Invoke-RestMethod -Uri "http://49.235.183.62/api/tasks?institutionId=inst-001&caregiverId=caregiver-02&recordDate=2026-05-18" -Headers @{"x-api-key"="elder_safe_token_2026"}
```

## 6. 文档分工

- `AGENTS.md`：项目硬规则和工作流程，保持短而强约束。
- `DATA_ARCHITECTURE.md`：事实表、字段含义、数据流。
- `PROJECT_MAP.md`：代码定位、问题索引、回归防护、Bug 修复记录。
- `CLAUDE.md`：历史操作手册，可参考但如与本文件冲突，以 `AGENTS.md` 为准。
