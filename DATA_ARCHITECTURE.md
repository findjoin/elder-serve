# Elder Serve 数据架构

## 一、14 张数据库表

### 1. `institutions` — 养老院机构

| 列 | 类型 | 说明 |
|----|------|------|
| id | String PK | 机构唯一标识（如 `demo-qinghe-care`、`test-elderserve`） |
| name | String | 机构名称 |
| floors | JSON | 楼层结构，如 `[{"floor":1,"label":"一层"}]` |
| status | String | `active` / `suspended` |
| storage_quota_bytes | Integer | 存储配额（0=不限） |
| storage_used_bytes | Integer | 已用存储 |
| created_at | String(ISO) | |
| updated_at | String(ISO) | |

### 2. `admins` — 平台管理员

| 列 | 类型 | 说明 |
|----|------|------|
| id | String PK | `admin-{uuid}` |
| username | String | 登录用户名 |
| password_hash | String | scrypt 哈希 |
| role | String | `admin` / `superadmin` |
| status | String | `active` / `disabled` |
| created_at | String(ISO) | |
| updated_at | String(ISO) | |

> 预设账号：`admin` / `admin123` (superadmin)

### 3. `users` — 登录账号

| 列 | 类型 | 说明 |
|----|------|------|
| id | String PK | `user-{uuid}` 或 `director-{uuid}` |
| institution_id | String INDEX | 所属机构 |
| username | String | 登录用户名 |
| password_hash | String | scrypt 哈希 |
| display_name | String | 显示名 |
| role | String | `director` / `caregiver` / `family` |
| role_entity_id | String | 指向 CaregiverTable.id 或 ElderTable.id |
| status | String | `active` / `disabled` |
| created_at | String(ISO) | |
| updated_at | String(ISO) | |

> 三种角色：**director**（院长，role_entity_id 无意义）、**caregiver**（护工，role_entity_id → CaregiverTable.id）、**family**（家属，role_entity_id → ElderTable.id）

### 4. `sessions` — 登录会话

| 列 | 类型 | 说明 |
|----|------|------|
| token | String PK | Bearer token |
| user_id | String INDEX | → users.id |
| institution_id | String | 冗余，方便查询 |
| username | String | 冗余 |
| role | String | 冗余 |
| role_entity_id | String | 冗余 |
| display_name | String | 冗余 |
| created_at | String(ISO) | |
| expires_at | String(ISO) | 过期时间 |
| revoked | Integer | 0=有效，1=已撤销 |

### 5. `caregivers` — 护工档案（新表）

| 列 | 类型 | 说明 |
|----|------|------|
| id | String PK | `caregiver-{timestamp}` |
| institution_id | String INDEX | |
| name | String | 护工姓名 |
| employee_no | String | 工号 |
| floor | Integer | 所属楼层 |
| shift | String | 班次，如 `07:00 - 15:30` |
| status | String INDEX | `on-duty` / `off-duty` |
| phone | String | 电话 |
| created_at | String(ISO) | |
| updated_at | String(ISO) | |

### 6. `elders` — 老人档案（新表）

| 列 | 类型 | 说明 |
|----|------|------|
| id | String PK | |
| institution_id | String INDEX | |
| name | String | 姓名 |
| gender | String | 男/女 |
| age | Integer | |
| floor | Integer | 楼层 |
| room | String | 房间号 |
| bed | String | 床位号 |
| level | String | 护理等级（一级护理/二级护理等） |
| report_template_id | String | 关联的日报模板 |
| report_template_title | String | |
| tags | JSON | 标签，如 `["高血压","晨间协助"]` |
| family_contact | String | 家属联系人 |
| family_phone | String | 家属电话 |
| photo_url | String | 头像 URL |
| medical_data | JSON | `{"bloodPressure":"120/80","heartRate":70}` |
| diet_info | String | 饮食信息 |
| medication_records | JSON | 用药记录数组 |
| emergency_contact | String | 紧急联系人 |
| created_at | String(ISO) | |
| updated_at | String(ISO) | |

### 7. `published_tasks` — 已发布护理任务

| 列 | 类型 | 说明 |
|----|------|------|
| id | String PK | 云端任务 ID |
| task_id | String INDEX | 前端本地任务 ID |
| institution_id | String INDEX | |
| institution_name | String | |
| record_date | String INDEX | 任务日期 |
| elder_id | String INDEX | → elders.id |
| elder_name | String | |
| elder_room | String INDEX | |
| elder_bed | String | |
| elder_floor | String INDEX | |
| caregiver_id | String INDEX | 实际执行的护工 → caregivers.id |
| caregiver_name | String | |
| default_caregiver_id | String | 默认分配护工 |
| default_caregiver_name | String | |
| plan_id | String | 护理方案 ID |
| plan_item_id | String INDEX | 方案项 ID |
| template_id | String | 日报模板 ID |
| title | String | 任务标题 |
| schedule | String | 执行时段，如 `07:00`、`15:30` |
| window | String | 时间窗口描述 |
| require_photo | String | `"true"` / `"false"` |
| status | String INDEX | `pending` / `completed` / `risk` / `refused` |
| note | Text | 备注 |
| category | String | 分类 |
| template_group | String | `special` / 模板分组名 |
| source | String | `manual` / `template` / `temporary` |
| source_app | String | `director-app` / `caregiver-app` |
| assignment_mode | String | `manual` / `auto` |
| assignment_status | String | `published` / `accepted` |
| workflow_status | String | `published` |
| published_at | String | 发布时间 |
| accepted_at | String | 护工接受时间 |
| cloud_task_id | String | 云端任务 ID 冗余 |
| raw_payload | JSON | 前端发来的原始 JSON |
| created_at | String(ISO) | |
| updated_at | String(ISO) | |

> **注意**：异常字段（exception、exceptionNote 等）已从此表移除，异常数据独立到 `anomalies` 表。

### 8. `task_completions` — 任务完成记录

| 列 | 类型 | 说明 |
|----|------|------|
| id | String PK | |
| institution_id | String INDEX | |
| task_id | String INDEX | → published_tasks.task_id |
| caregiver_id | String INDEX | |
| elder_id | String INDEX | |
| record_date | String INDEX | |
| floor | Integer | |
| completed_at | String | 完成时间 |
| type | String | 完成类型，`check` / `exception` 等 |
| note | Text | 备注 |
| photos | JSON | 照片 URL 数组 |
| created_at | String(ISO) | |
| synced_at | String | 同步时间 |

### 9. `vitals` — 生命体征记录

| 列 | 类型 | 说明 |
|----|------|------|
| id | String PK | |
| institution_id | String INDEX | |
| elder_id | String INDEX | |
| caregiver_id | String | |
| blood_pressure | String | 血压 |
| heart_rate | String | 心率 |
| blood_sugar | String | 血糖 |
| temperature | String | 体温 |
| recorded_at | String INDEX | 记录时间 |
| note | Text | |
| created_at | String(ISO) | |

### 10. `anomalies` — 异常事件（独立建模）

| 列 | 类型 | 说明 |
|----|------|------|
| id | String PK | |
| institution_id | String INDEX | |
| elder_id | String INDEX | |
| caregiver_id | String | |
| type | String | 异常类型 |
| note | Text | 文字说明 |
| photos | JSON | 照片 URL 数组 |
| reported_at | String INDEX | 上报时间 |
| resolved_at | String | 处理完成时间 |
| status | String INDEX | `已上报` / `处理中` / `已处理` |
| created_at | String(ISO) | |
| updated_at | String(ISO) | |

### 11. `care_records` — 护理日报（大 JSON）

| 列 | 类型 | 说明 |
|----|------|------|
| id | String PK | |
| client_record_id | String INDEX | 客户端去重 ID |
| institution_id | String | |
| institution_name | String | |
| elder_id | String INDEX | |
| elder_name | String | |
| gender | String | |
| age | String | |
| room | String INDEX | |
| bed | String | |
| care_type | String | `semi-care` / `full-care` |
| care_level_label | String | |
| record_date | String INDEX | |
| record_time | String | |
| caregiver_id | String INDEX | |
| caregiver_name | String | |
| reviewer_name | String | 审核人姓名 |
| daily_care | JSON | 日常照料数据 |
| report_items | JSON | 任务项完成状态 `{"item_xxx":true,...}` |
| report_template_snapshot | JSON | 日报模板快照 |
| medication | JSON | 用药记录 |
| health | JSON | 健康状态 |
| inventory | JSON | 库存补充 |
| signatures | JSON | 签名信息 |
| summary | JSON | `{"dailyCount":N,"medicationCount":N,"issueCount":N,"refillCount":N}` |
| workflow_status | String | `draft` / `submitted` |
| sync_status | String | `local-draft` / `pending-sync` / `synced` / `sync-failed` |
| source | String | `caregiver-app` / `director-app` |
| created_at | String(ISO) | |
| updated_at | String(ISO) | |
| submitted_at | String | |
| filled_at | String | |

### 12. `daily_report_templates` — 日报模板

| 列 | 类型 | 说明 |
|----|------|------|
| id | String PK | 模板 ID |
| institution_id | String INDEX | |
| title | String | |
| version | Integer | |
| template | JSON | 4 个 section（生活照料/饮食照料/护理协助/健康监测），每节若干 item |
| updated_by | String | |
| source | String | `director-app` |
| created_at | String(ISO) | |
| updated_at | String(ISO) | |

### 13. `institution_states` — 整院状态快照（旧兼容层）

| 列 | 类型 | 说明 |
|----|------|------|
| institution_id | String PK | |
| institution_name | String | |
| data_schema_version | Integer | |
| task_info | JSON | `{dailyReports:[],temporaryTasks:[],dailyReportTemplate:{},elderCarePlans:[]}` |
| personnel_info | JSON | `{caregivers:[],elders:[]}` |
| institution_info | JSON | `{institution:{...},floorCount,roomCount,...}` |
| raw_payload | JSON | 原始请求体 |
| created_at | String(ISO) | |
| updated_at | String(ISO) | |

> **状态**：逐步废弃中。人员数据已迁移到 `caregivers` + `elders` + `users`，异常已迁移到 `anomalies`，任务完成已迁移到 `task_completions`。目前仍被读写，但新功能优先使用独立表。

### 14. `app_releases` — APK 版本发布

| 列 | 类型 | 说明 |
|----|------|------|
| id | String PK | |
| platform | String INDEX | `android` |
| channel | String INDEX | `stable` |
| version_code | Integer INDEX | 整数递增 |
| version_name | String | 语义化版本 |
| apk_path | String | 服务器路径 |
| apk_url | String | 公网下载 URL |
| sha256 | String | |
| size_bytes | Integer | |
| release_notes | Text | |
| force_update | String | `"true"` / `"false"` |
| source_filename | String | |
| created_at | String(ISO) | |
| updated_at | String(ISO) | |

---

## 二、关系链全景

```
┌─────────────────────────────────────────────────────────────────┐
│                     InstitutionTable                            │
│                     (养老院机构)                                  │
│                     id = "test-elderserve"                       │
└──────┬──────────────┬──────────────┬──────────────┬─────────────┘
       │              │              │              │
       ▼              ▼              ▼              ▼
  ┌─────────┐   ┌──────────┐  ┌───────────┐  ┌────────────────┐
  │UserTable│   │Caregiver │  │ElderTable │  │InstitutionState│
  │(登录账号)│   │Table     │  │(老人档案)  │  │Table (旧快照)   │
  │         │   │(护工档案)  │  │           │  │                │
  │role=    │   │          │  │           │  │personnel_info: │
  │director │   │          │  │           │  │ {caregivers:[],│
  │caregiver│──→│←─role_   │  │           │  │  elders:[]}    │
  │family   │   │entity_id │  │           │  │                │
  │         │   │          │  │           │  │task_info:      │
  │         │   │          │  │           │  │ {dailyReports  │
  │         │   │          │  │           │  │  :[], ...}     │
  └─────────┘   └────┬─────┘  └─────┬─────┘  └────────────────┘
                     │              │
        ┌────────────┼──────────────┼───────────────────┐
        │            │              │                   │
        ▼            ▼              ▼                   ▼
  ┌──────────┐ ┌──────────┐ ┌───────────┐  ┌─────────────────┐
  │Published │ │Task      │ │VitalTable │  │AnomalyTable     │
  │TaskTable │ │Completion│ │(体征)      │  │(异常事件)         │
  │(护理任务) │ │Table     │ │           │  │                 │
  │          │ │(完成记录)  │ │elder_id───│──│elder_id          │
  │elder_id──│─│elder_id   │ │caregiver_ │  │caregiver_id     │
  │caregiver │ │caregiver_ │ │id         │  │status: 已上报    │
  │_id       │ │id        │ │           │  │  → 处理中 → 已处理│
  │status:   │ │task_id───│→│           │  │                 │
  │pending→  │ │           │ │           │  │                 │
  │completed │ │           │ │           │  │                 │
  └──────────┘ └──────────┘ └───────────┘  └─────────────────┘
        │
        │ (护理日报)
        ▼
  ┌────────────────┐
  │CareRecordTable │
  │(护理日报)        │
  │                │
  │daily_care(JSON)│
  │medication(JSON)│
  │health(JSON)    │
  │signatures(JSON)│
  └────────────────┘
```

---

## 三、三种身份与数据对应

### 院长 (role=director)
- `UserTable.role = "director"`
- `UserTable.role_entity_id` 无意义
- 创建方式：`POST /api/admin/institutions` 时自动生成，或 `POST /api/admin/institutions/{id}/users`

### 护工 (role=caregiver)
- `CaregiverTable` 存档案（name, floor, shift, phone...）
- `UserTable` 存登录账号（username, password, display_name），`role_entity_id` → `CaregiverTable.id`
- 创建流程：先建 CaregiverTable 记录 → 再建 UserTable 记录并绑定 role_entity_id

### 家属 (role=family)
- `ElderTable` 存老人档案（name, room, floor, age, level...）
- `UserTable` 存家属登录账号，`role_entity_id` → `ElderTable.id`
- 创建流程：先建 ElderTable 记录 → 再建 UserTable 记录并绑定 role_entity_id

---

## 四、任务生命周期

```
院长制定日报模板 (DailyReportTemplateTable)
  │
  ▼
applyDailyReportTemplate() → rebuildTasks() → 生成 PublishedTaskTable 记录
  │                                               status = "pending"
  │                                               caregiver_id = 按楼层分配
  │
  ▼
POST /api/tasks ← publishReportTemplateGeneratedTasks()
  │
  ▼
护工端轮询 GET /api/tasks?caregiverId=...
  │
  ├── 正常完成：护工提交日报
  │     completeTask() → POST /api/task-completions
  │     task.status = "completed"
  │     POST /api/care-records（护理日报）
  │
  └── 异常处理：护工标记异常
        markTaskException() → task.status = "risk"/"refused"
        addAnomaly() → POST /api/anomalies
        anomaly.status = "已上报"
          │
          ▼
        院长处理异常
          updateAnomaly() → POST /api/anomalies/{id}/update
          anomaly.status = "已处理", resolved_at = 时间戳
```

### 临时任务 (source=temporary)
- 院长从方案页直接发布 → `POST /api/tasks`，`source = "temporary"`
- 不受日报模板影响，`rebuildTasks()` 会保留所有临时任务
- 其他流程与常规任务相同

---

## 五、API 端点总览

### 认证
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/login` | 登录（需 institutionId + username + password） |
| POST | `/api/auth/logout` | 登出 |
| GET | `/api/auth/me` | 当前用户信息 |
| GET | `/api/auth/users` | 机构用户列表 `?institutionId=...` |
| POST | `/api/auth/users` | 创建用户 |
| POST | `/api/auth/users/{id}/reset-password` | 重置密码 |
| PUT | `/api/auth/users/{id}/disable` | 禁用/启用用户 |

### 护工 CRUD（新）
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/caregivers` | 列表 `?institutionId=...` |
| POST | `/api/caregivers` | 创建（name 必填） |
| POST | `/api/caregivers/{id}/update` | 更新 |
| DELETE | `/api/caregivers/{id}` | 删除 |

### 老人 CRUD
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/elders` | 列表（基础信息） |
| POST | `/api/elders` | 创建 |
| GET | `/api/elders/{id}` | 详情（全字段） |
| POST | `/api/elders/{id}/update` | 更新（10 个可选字段） |
| DELETE | `/api/elders/{id}` | 删除 |

### 任务
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/tasks` | 列表 `?institutionId=&caregiverId=&elderId=&recordDate=` |
| POST | `/api/tasks` | 创建/更新（含 upsert 逻辑） |
| GET | `/api/tasks/{id}` | 详情 |

### 任务完成（新）
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/task-completions` | 列表 |
| POST | `/api/task-completions` | 创建 |

### 体征（新）
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/vitals` | 列表 |
| POST | `/api/vitals` | 创建 |

### 异常（新）
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/anomalies` | 列表 |
| POST | `/api/anomalies` | 创建 |
| POST | `/api/anomalies/{id}/update` | 更新（status/resolvedAt/note） |

### 护理日报
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/care-records` | 列表 |
| POST | `/api/care-records` | 创建/更新 |
| GET | `/api/care-records/{id}` | 详情 |

### 日报模板
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/daily-report-template` | 单个（`?institutionId=&title=`） |
| GET | `/api/daily-report-templates` | 列表 |
| POST | `/api/daily-report-template` | 创建/更新 |

### 机构
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/institution` | 详情 `?institutionId=...` |
| POST | `/api/institution/update` | 更新 name/floors |
| GET | `/api/institution-state` | 旧快照读取 |
| POST | `/api/institution-state` | 旧快照写入 |

### 管理员
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/admin/login` | 管理员登录 |
| POST | `/api/admin/institutions` | 创建机构 + 院长账号 |
| GET | `/api/admin/institutions` | 机构列表 |
| PUT | `/api/admin/institutions/{id}/quota` | 更新配额 |
| PUT | `/api/admin/institutions/{id}/suspend` | 停用机构 |
| GET | `/api/admin/institutions/{id}/users` | 机构用户列表 |
| POST | `/api/admin/institutions/{id}/users` | 创建用户 |
| POST | `/api/admin/institutions/{id}/users/{uid}/reset-password` | 重置密码 |
| PUT | `/api/admin/institutions/{id}/users/{uid}/disable` | 禁用/启用用户 |
| GET | `/api/admin/stats` | 全局统计 |
| GET | `/api/admin/sessions` | 在线会话 |
| DELETE | `/api/admin/sessions/{token}` | 踢出用户 |
| POST | `/api/admin/sessions/cleanup` | 清理过期会话 |

### APP 版本
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/app-releases/latest` | 最新版本 `?platform=&channel=&currentVersionCode=` |
| POST | `/api/app-releases` | 上传 APK |

### 其他
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/healthz` | 健康检查 |
| GET | `/admin` | 管理后台 SPA |

---

## 六、前端云端同步架构

### 三路并发轮询（院长端）

| 轮询 | 间隔 | 端点 | 修改的状态 |
|------|------|------|-----------|
| `refreshDirectorCloudReports` | 10s | `GET /api/care-records` | `state.cloud.careReports`（合并去重） |
| `refreshDirectorCloudTasks` | 10s | `GET /api/tasks` | `state.tasks`（签名对比后 notify） |
| `refreshInstitutionSharedState` | 12s | `GET /api/institution-state` | `state.caregivers/elders/institution/dailyReportTemplate/elderCarePlans`（JSON 对比）+ `state.cloud.careReports`（后台合并）+ `state.tasks`（temporaryTasks 合并） |

### 登录后数据加载顺序

```
login()
  ├── state.institution.id = result.user.institutionId
  ├── _loadCloudInstitutionInfo()    → GET /api/institution → state.institution.name
  ├── _loadCloudPersonnel()          → GET /api/caregivers + GET /api/auth/users
  │     ├── 合并 → state.caregivers (带 cloudUserId/cloudUserStatus)
  │     └── role=family → state.elders (带 familyUserId/familyUserStatus)
  └── loadDirectorInitialData()
        ├── persistInstitutionSharedState()  → POST /api/institution-state
        ├── refreshDailyReportTemplate()     → GET /api/daily-report-template
        ├── refreshInstitutionSharedState()  → GET /api/institution-state
        │     └── applyInstitutionStateSnapshot() → 覆盖 caregivers/elders（非空时才覆盖已有 cloud 数据）
        └── refreshDirectorCloudTasks()       → GET /api/tasks
```

### 数据隔离

- 所有接口通过 `institutionId` 参数隔离
- Token 认证：`state.session.user.institutionId` 由后端登录返回
- x-api-key 认证：`institution_id = ""`（system），需手动传 `?institutionId=`
- 当前机构：`demo-qinghe-care`（生产）/ `test-elderserve`（测试）

---

## 七、新旧表功能对照

| 功能 | 旧实现 | 新实现 |
|------|--------|--------|
| 护工数据 | `institution_states.personnel_info.caregivers` (JSON blob) | `caregivers` 表 + `users` 表 |
| 老人数据 | `institution_states.personnel_info.elders` (JSON blob) | `elders` 表 + `users` 表 (role=family) |
| 异常事件 | `published_tasks.exception*` 字段（已移除） | `anomalies` 表 |
| 任务完成 | `published_tasks.status = "completed"` | `task_completions` 表（独立记录） |
| 体征记录 | 内嵌在日报 JSON 中 | `vitals` 表 |
| 机构信息 | `institution_states.institution_info` | `institutions` 表 |
| 日报模板 | `institution_states.task_info.dailyReportTemplate` | `daily_report_templates` 表 |
| 护理日报 | `care_records` 表（已独立） | 不变 |
| 任务发布 | `published_tasks` 表（已独立） | 不变 |
