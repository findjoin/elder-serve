# Elder Serve 数据架构

## 一、12 张数据库表

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

家属账号规则：

- 老人档案只保存家属联系人和电话；家属登录账号事实源是 `users.role="family" + users.role_entity_id=elders.id`。
- 院长端编辑老人时，如果该老人已有 `familyUserId`，保存账号应更新同一条 `users` 记录；不能重复创建新的家属账号。
- 修改家属登录账号会覆盖 `users.username`；密码输入框留空表示不修改密码，填写密码时必须同时更新 `password_hash` 和 `password_hint`。

护工账号规则：

- 护工档案事实源是 `caregivers`，护工登录账号事实源是 `users.role="caregiver" + users.role_entity_id=caregivers.id`。
- 院长端编辑护工时，如果该护工已有 `cloudUserId`，保存账号应更新同一条 `users` 记录；不能只重置密码，也不能重复创建新账号。
- 修改护工登录账号会覆盖 `users.username`；密码输入框留空表示不修改密码，填写密码时必须同时更新 `password_hash` 和 `password_hint`。

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

护工档案规则：

- `caregivers.status` 不是院长端可编辑档案字段，只能作为旧兼容/当前打卡状态缓存；真实考勤状态以 `attendance_records` 为准。
- 院长端编辑护工只能维护姓名、岗位、工号、负责楼层、班次、默认排班、登录账号、登录密码和联系电话等档案字段。
- 超管“护工档案”必须展示和院长端编辑项一致的业务表格；账号字段来自 `users.role="caregiver" + users.role_entity_id=caregivers.id`，不能显示 JSON 或把密码哈希当密码。
- 登录密码展示来自 `users.password_hint`，该字段在创建账号或重置密码时同步写入；真实登录仍以 `password_hash` 校验。历史账号如果没有 `password_hint`，只能重置后显示。

### 6. `attendance_records` — 护工考勤记录

| 列 | 类型 | 说明 |
|----|------|------|
| id | String PK | `attendance-{uuid}` |
| institution_id | String INDEX | 所属机构 |
| record_date | String INDEX | 考勤日期，业务日期 |
| caregiver_id | String INDEX | → caregivers.id |
| caregiver_name | String | 护工姓名快照 |
| employee_no | String INDEX | 护工工号 |
| registered_user_id | String INDEX | → users.id，注册登录账号 ID |
| username | String INDEX | 登录账号名 |
| shift_id | String INDEX | `morning` / `afternoon` / `night` |
| shift_name | String | 早班/中班/晚班 |
| shift_start | String | 上班时间，如 `08:00` |
| shift_end | String | 下班时间，如 `16:00` |
| clock_in_at | String(ISO) | 实际打卡时间 |
| clock_out_at | String(ISO) | 预留，下班打卡时间 |
| status | String INDEX | `present` / `late` / `absent` |
| late | Integer | 0/1 |
| late_minutes | Integer | 超过“上班时间 + 30 分钟”的分钟数 |
| source | String | `caregiver-app` / `director-app` 等 |
| raw_payload | JSON | 原始打卡上下文 |
| created_at | String(ISO) | |
| updated_at | String(ISO) | |

考勤规则：

- `attendance_records` 是护工考勤唯一事实源，不使用 `caregivers.status`、任务卡完成状态或本地会话状态反推考勤。
- 业务唯一索引是 `institution_id + record_date + caregiver_id + shift_id`，同一护工同一天同一班次只能有一条考勤记录。
- 超过班次上班时间 30 分钟后打卡算迟到；有打卡且未迟到为 `present`；无打卡为 `absent`。
- `registered_user_id/username` 来自 `users`，用于把注册账号和护工档案绑定到同一张考勤表。
- 护工端“我的考勤”按钮进入考勤页后必须读取 `GET /api/attendance-records`；上班打卡必须写 `POST /api/attendance-records`，不能只写本地 `session.clockInAt`。
- 超管“数据库总览 -> 护工考勤表”必须按 `record_date + caregiver_id` 聚合成一张当天护工考勤表；早班、中班、晚班三列都要显示，未打卡班次显示缺勤，不能只铺 `attendance_records` 物理行。

### 7. `elders` — 老人档案（新表）

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

老人日报模板绑定规则：

- 院长端编辑老人时，日报下拉的事实源是 `daily_report_templates(templateType="instance")`。
- 保存老人日报模板必须写入 `POST /api/elders/{elder_id}/update` 的 `reportTemplateId/reportTemplateTitle`，最终落到 `elders.report_template_id/report_template_title`。
- 不能通过旧快照或本地 state 保存老人日报模板；否则重新进入页面会被云端 `elders` 事实表覆盖回旧值。

### 8. `published_tasks` — 已发布护理任务

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

### 11. `daily_report_templates` — 日报模板

| 列 | 类型 | 说明 |
|----|------|------|
| id | String PK | 模板 ID |
| institution_id | String INDEX | |
| title | String | |
| version | Integer | |
| template | JSON | 4 个 section（生活照料/饮食照料/护理协助/健康监测），每节若干 item；必须包含 `templateType` |
| updated_by | String | |
| source | String | `director-app` |
| created_at | String(ISO) | |
| updated_at | String(ISO) | |

模板类型规则：

- 基础模板：`template.templateType = "base"`，只作为院长端“导入模板”的来源，不绑定老人，不生成每日任务。
- 实例模板：`template.templateType = "instance"`，由院长导入基础模板后调整时间、频率、标题生成；老人 `elders.report_template_id` 只能指向实例模板。
- 实例模板必须保留 `template.baseTemplateId` 指向来源基础模板；不能保存时覆盖基础模板 ID。
- 导入基础模板新建实例时必须生成唯一实例 ID；同名实例模板允许并存，不能用标题 slug 作为唯一 ID 覆盖旧实例。

### 12. `app_releases` — APK 版本发布

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

### 考勤记录
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/attendance-records` | 列表 `?institutionId=&recordDate=&caregiverId=&employeeNo=&registeredUserId=&username=&shiftId=&status=` |
| POST | `/api/attendance-records` | 创建/更新同一护工同一天同一班次的考勤记录，自动计算 `present/late/absent` |

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
| GET | `/api/daily-report-templates` | 列表，支持 `templateType=base|instance` |
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
| `refreshDirectorCloudReports` | 手动/进入页面 | `GET /api/tasks`（按月份逐日收集） | `state.tasks` + `state.cloud.careReportsFetchedAt` |
| `refreshDirectorCloudTasks` | 60s/手动 | `GET /api/tasks` | `state.tasks`（签名对比后 notify） |
| `refreshInstitutionSharedState` | 12s | 事实表接口（机构/护工/老人/模板/用户） | `state.caregivers/elders/institution/dailyReportTemplates`；禁止写旧快照 |

### 登录后数据加载顺序

```
login()
  ├── state.institution.id = result.user.institutionId
  ├── _loadCloudInstitutionInfo()    → GET /api/institution → state.institution.name
  ├── _loadCloudPersonnel()          → GET /api/caregivers + GET /api/elders + GET /api/auth/users
  │     ├── 合并 → state.caregivers (带 cloudUserId/cloudUserStatus)
  │     └── 合并 → state.elders (带 assignedCaregiverId/familyUserStatus)
  └── loadDirectorInitialData()
        ├── refreshDailyReportTemplates()     → GET /api/daily-report-templates
        ├── refreshInstitutionSharedState()   → GET /api/institution + caregivers + elders + users + templates
        ├── refreshDirectorCloudTasks()       → GET /api/tasks
        └── refreshDirectorCloudReports()     → GET /api/tasks（按月份逐日收集日报任务卡）
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
| 护工考勤 | 本地会话 `clockInStatus` / `caregivers.status` | `attendance_records` 表 |
| 老人数据 | `institution_states.personnel_info.elders` (JSON blob) | `elders` 表 + `users` 表 (role=family) |
| 异常事件 | `published_tasks.exception*` 字段（已移除） | `anomalies` 表 |
| 任务完成 | `task_completions` 表 | `published_tasks.status/completedAt` |
| 体征记录 | 内嵌在日报 JSON 中 | `vitals` 表 |
| 机构信息 | `institution_states.institution_info` | `institutions` 表 |
| 日报模板 | `institution_states.task_info.dailyReportTemplate` | `daily_report_templates` 表 |
| 护理日报/月度日报 | `care_records` 表 | `published_tasks` 按老人实例模板生成 A4 月度勾叉表 |
| 护工任务操作记录 | `care_records` 表 | `GET /api/caregiver-task-records` 只读聚合视图 |
| 任务发布 | `published_tasks` 表（已独立） | 不变 |

---

## 八、任务表与护工任务记录事实源

### 1. 老人每日任务表

- `published_tasks` 不是“发布任务配置表”，而是每日任务实例表。
- 业务索引是 `institution_id + record_date + elder_id`：每天每个老人只有一张任务表。
- 一张老人每日任务表里有多行任务卡，每行来自日报实例模板、护理方案或临时任务。
- 临时任务必须插入该老人当天同一张任务表，不能另起一张护工任务表。
- 护工不是任务表的拥有者；护工只是任务行上的负责/操作人，字段是 `caregiver_id/default_caregiver_id`。
- 任务卡相对静态，来自老人当天任务表；护工任务是动态分配到这些任务卡上的执行责任。已完成、异常、不配合或已有文字/图片记录的任务卡不参与动态重新分配，只保留实际操作护工。
- 动态分配只作用于“未操作的日报任务卡”：`pending + report-template/daily-report + 无 completedAt/recordNote/recordEvidence/exception*`。临时任务 `temporary` 只归属发布时指定的护工，不跟随老人默认负责人变化。
- 取消打卡后任务卡回到 `pending`，同时移除完成时间；如果没有文字、图片、异常等其它操作痕迹，它可以重新参与动态分配。
- 超管详情查看老人每日任务表时，必须按 `institution_id + record_date + elder_id` 重新读取完整 `published_tasks`；不能用当前分页/搜索结果缓存当作完整任务表。

### 2. 护工任务记录

- “护理记录”和“任务完成记录”在业务展示上统一叫“护工任务记录”。
- 护工任务记录记录的是护工对任务卡的操作流水，不反向决定老人每日任务表归属。
- 护工端“护理记录”只展示该护工实际操作过的任务卡，按 `record_date + elder_id + caregiver_id` 聚合；未操作但分配给该护工的待办任务不能出现在护理记录里。
- 管理端第一层索引是 `institution_id + record_date + caregiver_id`：每天每个护工一张“护工每日任务记录表”。
- 第一层只显示表数量和摘要；任务卡操作流水只能在详情中展开。
- 任务卡有三类操作：打卡完成、文字/图片记录、任务卡异常。
- 快速异常记录独立于任务卡，来源是 `anomalies`，但也要进入护工任务记录视图。
- 任务卡异常只能写入对应 `published_tasks` 行的 `status/exceptionNote/exceptionType/exceptionEvidence/exceptionReportedAt`，不能同时写 `anomalies`；否则同一次任务卡异常会被拆成“任务卡异常 + 快速异常”。
- 任务卡异常的照片属于 `exceptionEvidence`，不属于普通 `recordEvidence`；兼容旧数据时，后端聚合可以把异常状态下的旧 `recordEvidence` 合并显示到同一条“任务卡异常”，但不能再额外生成“文字/图片记录”行。
- 任务卡上报类型互斥：护工只能选择“记录上报”或“异常上报”之一。普通记录只写 `recordNote/recordEvidence/recordedAt`；异常只写 `status=risk/refused + exceptionNote/exceptionType/exceptionEvidence/exceptionReportedAt`。
- 已经记录上报的任务卡不能再异常上报；已经异常上报的任务卡不能再记录上报或标记完成。前端必须禁用另一侧入口，后端 `/api/tasks` 必须用 `409` 防御旧客户端或重复请求。
- 历史混合脏数据按任务卡当前状态归一：`risk/refused` 以异常上报为准并清理普通记录字段；非异常状态以记录上报为准并清理异常字段。只有专门的清理/撤销异常流程才允许清除异常状态和异常字段。
- 后端统一只读接口是 `GET /api/caregiver-task-records`，聚合以下事实源：
  - `published_tasks.status="completed"` 或 `raw_payload.completedAt`：任务卡打卡。
  - `published_tasks.raw_payload.recordNote/recordEvidence`：任务卡文字和图片记录。
  - `published_tasks.raw_payload.exceptionNote/exceptionType/exceptionEvidence`：任务卡异常。
  - `anomalies`：快速异常记录。
- `published_tasks.accepted_at` 只表示任务被接收/排程过，不能作为打卡完成证据；待完成任务即使有 `accepted_at` 也不能出现在“打卡完成”流水中。

### 3. 日报收件箱 / 月度日报

- 院长端“日报收件箱”不是应收/已收收件箱，不再统计“应收、已收、未收”。
- 月度日报的事实源是 `published_tasks`，按 `institution_id + record_date + elder_id` 读取老人当天任务表。
- 日报任务行必须来自老人绑定的日报实例模板；基础模板只用于生成实例模板，导出时以老人当前实例模板的分组和任务项作为 A4 表格行。
- 日报收件箱只是“云端日报任务查询 + 月度导出”入口，不在页面层维护或展示完成/未完成状态。
- 日报收件箱日历只显示日期和是否查询到当天日报任务；点开日期不展开老人表。
- 当天每个有实例模板日报任务的老人算 1 份日报，页面可以显示查询到几份日报，但不能用任务卡数量做收件箱分母。
- 系统收集日报时只记录任务卡是否打卡完成：`status="completed"` 或 `completedAt` 表示对号；已到时间但未完成表示错号；未来日期或当天未到任务时间留空。
- 完成/未完成只体现在导出的 A4 表格单元格里，不作为收件箱日历状态。
- 日报实例模板任务项的 `frequencyDays` 表示 N 天一个周期。A4 预览和月报导出必须把 N 天对应日期列合并成一个周期单元格。
- 频次周期内任意一天对应任务卡有打卡完成，该合并单元格填对号；周期已结束且没有任何完成记录才填错号；周期未结束或未来周期留空。
- 月度日报不读取也不导出任务卡文字、图片、异常说明；这些属于护工任务记录或老人异常汇总。
- 院长可以在日报收件箱手动刷新/收集当前月份，前端逐日调用 `GET /api/tasks` 合并 `state.tasks` 后即时生成月度 A4 表。
- 禁止用 `/api/caregiver-task-records`、`care_records` 或本地日报草稿作为月度日报事实源；这些会把操作流水、文字图片和异常混入只需要勾叉的月报。
- 院长端老人卡片展示日报配置时必须使用 `elders.report_template_id/report_template_title`，不能用旧 `elderCarePlans` 是否存在显示“未建方案”，否则会把个体化护理方案和日报实例模板混淆。

### 4. 禁止链路

- 不能把 `care_records` 当作任务卡操作事实源；它是日报/交班归档视图。
- 不能按 `caregiver_id + record_date` 新建一张护工任务表；护工记录只能引用老人每日任务表内的任务行。
- 不能从 `task_completions` 或 `care_records` 反推老人默认负责人。
- 不能把列表页为了展示图片而全量返回 base64；图片只能按需读取。
- 管理端“任务记录/护工任务记录”下拉和第一层列表的数量必须是表数量，不能用任务卡数量或操作行数量冒充表数量。
- 日报收件箱不能恢复“应收/已收/未收”逻辑，也不能要求某天存在 `careReports` 缓存后才允许导出。

### 5. 超管业务表展示规则

- `institutions` 在超管数据库总览中显示为养老院机构业务表格：机构名称、机构 ID、楼层、状态、存储配额、已用存储、创建/更新时间；不展示 JSON。
- `anomalies` 在超管数据库总览中显示为“老人异常汇总表”，第一层按老人索引，不加日期索引。
- 老人异常汇总要合并两类来源：`published_tasks` 里的任务卡异常，以及 `anomalies` 里的快速异常。
- 老人异常汇总详情必须列出任务卡、提交异常的护工、异常类型、说明、图片数量和快速异常信息。
- 院长端“异常状态”必须按日期索引查看，默认日期为当前业务日期；切换日期时必须重新读取该日期 `published_tasks` 的任务卡异常，不能把不同日期异常堆在同一页。
- 院长端异常状态不再提供“标记已读/已读信息箱/删除已读”分流；异常卡是否显示只由云端异常事实源和日期决定，不能被本地已读状态隐藏。
- 任务卡是否真实异常只能由 `published_tasks.status=risk/refused` 判定。
- 历史 `exceptionNote`、`exceptionType`、`exceptionEvidence`、旧 `exception` 可能与 `pending` 状态不一致，只能作为异常详情字段，不能单独把待完成任务提升为异常。

### 6. 已删除废弃表

- `task_completions`：任务完成状态统一写入 `published_tasks`，旧接口 `/api/task-completions` 返回 `410 Gone`。
- `care_records`：护理记录/日报归档旧表已取消，护工记录统一通过 `/api/caregiver-task-records` 读取，旧接口 `/api/care-records` 返回 `410 Gone`。
- `institution_states`：整院兼容快照已取消，人员、老人、模板、任务、机构信息全部走独立事实表接口，旧接口 `/api/institution-state` 返回 `410 Gone`。
- 后端启动时会执行 `DROP TABLE IF EXISTS task_completions/care_records/institution_states`，禁止重新把它们加入超管表清单或前端写入链路。

### 7. 库存系统

- `inventory_items` 是养老院全局库存事实表，按 `institution_id` 隔离，不按日期建表或索引业务主键。
- `inventory_items.quantity` 是当前库存余额唯一事实源；不能用前端本地状态、旧快照或护理记录覆盖。
- 前端刷新 `GET /api/inventory/items` 后必须用云端列表全量替换本地库存列表；不能 merge mock/旧缓存，否则手机端会显示云端不存在的物资或旧数量。
- `inventory_items` 只维护消耗品名称、分类、单位、当前数量、预警线、存放位置、状态和时间戳；不维护“规格”字段。
- 院长端新增/编辑/调整库存统一写 `POST /api/inventory/items`；删除物资只把 `status` 置为 `deleted`，不物理删除历史流水。
- `inventory_usages` 是护工提交的库存消耗流水，按 `institution_id + used_at 日期 + item_name/item_id` 查询展示。
- 护工端库存使用记录只记录消耗品、数量、护工、备注和使用时间；不关联老人，也不能要求选择老人。
- 护工端只能通过 `POST /api/inventory/usages` 生成消耗流水；后端必须在同一事务里校验库存存在、数量足够、扣减 `inventory_items.quantity` 并写入 `inventory_usages`。
- 院长端库存名片点击后直接展示该物资的消耗趋势和按日期消耗记录，同时只保留“调整库存、删除物资”两个操作；删除必须二次确认。
- 调整库存入口必须先选择“增加/减少”两个按钮之一，再填写本次数量；不能复用新增物资的完整编辑表单，避免误改名称、分类、单位、预警线和位置。
- 调整库存数量输入时不能触发整页 `notify()` 重渲染；否则移动端键盘会在每次输入或刷新时收起。
- 物资名片弹窗必须直接展示该物资按日期聚合的消耗记录和趋势折线图；“使用流水”底部区域保留为全部物资的日期/名称索引列表。
- 院长端使用流水栏按日期和消耗品名称筛选云端 `inventory_usages`；不能从本地历史、日报或护理记录拼装。

### 8. 前端适配规则

- `caregiver-app/src/utils/cloudApi.js` 不能再导出 `/api/care-records`、`/api/task-completions`、`/api/institution-state` 的封装。
- 任务完成、文字记录、图片记录、任务卡异常统一通过 `uploadPublishedTask()` 写回 `published_tasks.raw_payload` 和 `published_tasks.status`。
- 护工端任务时间轴只能用护工业务日期查询 `GET /api/tasks?institutionId=&caregiverId=&recordDate=`；不能复用院长端 `state.director.date`。
- 护工端“护理记录”工作台必须以 `GET /api/caregiver-task-records?institutionId=&caregiverId=&recordDate=` 的云端聚合结果为主，再用本地已操作任务缓存补充；不能只依赖本地任务数组，否则重新进入页面或缓存不完整时会显示 0。
- 护工端“护理记录”展示不能把本地 `state.elders` 作为硬前置。云端聚合记录已经返回 `elderId/elderName/room/bed/floor` 等老人快照时，本地老人档案只能用于增强显示；本地老人缓存暂缺时必须用云端快照兜底展示。
- 护工端请求护工任务记录时，`institutionId` 必须来自登录会话/当前护工绑定，不能直接使用可能仍停留在 mock 机构的 `state.institution.id`。
- 自动登录恢复会话时，必须先用 `/api/auth/me` 返回的 `users.institution_id` 绑定 `state.institution.id`、清空旧机构本地列表，再拉机构、人员、模板和任务事实表；不能先渲染 mock/demo 机构。
- 后端 `/api/auth/me` 不能只信任 `sessions` 里的登录快照；每次恢复会话都必须重新校验 `users` 账号存在且 active、`users.institution_id` 与 session 一致、`institutions` 机构存在且 active。用户或机构已删除时必须撤销 session 并要求重新登录。
- 护工端一次任务同步只能清理本次 `recordDate` 下该护工的本地任务缓存；不能因为其它日期或错误日期返回 0 条就清空该护工所有日期任务。
- 院长端“日报收件箱”路由和 UI 可保留，但底层只能按月读取 `GET /api/tasks` 中的日报实例模板任务卡，并生成“老人 + 模板任务项 + 日期”的月度勾叉表；不能再映射旧 careReports 收件模型。
- `persistInstitutionSharedState()` / `refreshInstitutionSharedState()` 如因兼容旧调用点保留函数名，内部只能刷新事实表，不能写旧快照。

### 8.1 云端轮询与增量同步规则

- 院长端、护工端所有后台轮询必须优先走“状态检查”接口，而不是周期性全量拉取事实表。
- 当前实现接口：`GET /api/sync/status?institutionId=&recordDate=&domains=tasks,personnel,templates,inventory,anomalies,attendance&known={...}`。
- `known` 是客户端上次保存的 `{ domain: version }`；服务端按域返回 `version/count/latestUpdatedAt/changed`。
- 状态检查接口按业务域返回版本摘要，例如任务、人员、老人、模板、库存、异常分别返回 `version/updatedAt/count/checksum`。
- `published_tasks.updated_at` 是任务同步版本事实源，必须由后端在写入时使用高精度服务器时间 `now_iso()` 生成；不能使用前端提交的分钟级 `updatedAt`，否则同一分钟内多次打卡会让 `/api/sync/status` 误判无变化。
- 客户端保存每个业务域最后一次成功同步的 `version` 或 `checksum`；轮询时只请求轻量状态。
- 如果服务端返回 `304 Not Modified` 或 `changed=false`，前端不能调用全量列表接口，也不能触发 `notify()` 重渲染。
- 如果服务端返回 `200 changed=true`，前端只拉取变更域的数据；例如只有 `published_tasks` 变化时，只刷新任务，不刷新人员、模板、库存。
- 如果服务端返回 `409/410 schemaChanged` 或本地版本缺失，客户端才允许执行一次全量重建。
- 列表接口返回数据后，前端必须按事实源类型决定 `replace` 还是 `merge`：事实全集列表用 `replace`，单条详情或流水分页用 `merge/upsert`。
- 后台静默刷新不能在用户滚动、输入、弹窗编辑或日期选择器打开时重建页面；必要时延迟到用户停止操作后再渲染。
- 不允许再恢复“每 10/12 秒全量拉所有事实表并覆盖本地 state”的同步方式。

### 8.2 机构存储配额与暂停服务规则

- `institutions.storage_quota_bytes` 是该养老院存储上限，`0` 表示不限额。
- `institutions.storage_used_bytes` 由后端统计，不允许前端提交覆盖。
- 当前统计口径包括带 `institution_id` 的业务行 JSON 字节数：`elders/caregivers/users/sessions/attendance_records/vitals/anomalies/inventory_items/inventory_usages/daily_report_templates/published_tasks`，以及老人头像等 `/static/` 文件大小。
- `GET /api/admin/institutions` 会刷新每个机构的已用存储；`POST /api/admin/institutions/{id}/recalculate-storage` 可手动重算。
- 当 `storage_quota_bytes > 0` 且 `storage_used_bytes > storage_quota_bytes`，后端自动把 `institutions.status` 置为 `suspended` 并撤销该机构普通用户 session。
- 普通院长/护工/家属登录和 `/api/auth/me` 会实时检查机构是否 `suspended`；暂停机构返回 `403`，超级管理员仍可进入后台调整配额或恢复机构。
- 配额暂停是机构级服务开关，不是前端 UI 状态；不能只在页面隐藏入口。

### 9. 清理任务记录/异常记录的口径

- 清理“任务记录”不是删除 `published_tasks` 任务行；只重置任务卡操作状态。
- 可清理字段包括：`published_tasks.status` 回到 `pending`、`accepted_at` 清空、`raw_payload.completedAt/recordNote/recordEvidence/exceptionNote/exceptionType/exceptionEvidence/exceptionReportedAt` 等操作字段移除。
- 清理“异常记录”包括删除 `anomalies` 快速异常行，并清除任务卡异常状态。
- 清理后必须验证：
  - `GET /api/caregiver-task-records?...` 返回空数组。
  - `GET /api/anomalies?...` 返回空数组。
  - `GET /api/tasks?...` 仍返回任务卡，且任务卡状态为 `pending`。

### 10. 模板任务与临时任务边界

- 日常任务只由老人绑定的日报实例模板生成，事实源是 `daily_report_templates(template.templateType="instance")` + `elders.report_template_id`。
- 老人切换日报实例模板，或院长编辑了已绑定给老人的实例模板后，必须重建该老人当天任务表。
- 重建任务表时只能删除同一老人、同一日期、未被护工操作过的旧 `source=report-template/template_group=daily-report` 任务行；已打卡、已有文字/图片/异常记录的任务行不能删除。
- 老人当天中途切换日报实例模板时，后端以保存时的北京时间作为切换点：切换点之前只保留已有真实护工操作的任务卡；切换点之前未操作的旧任务卡和切换点之后所有旧模板任务卡都删除；切换点之后按新实例模板的任务时间补齐任务卡。
- 模板切换保留判断不能把 `accepted_at` 当成真实操作。真实操作只包括打卡完成、拒绝/跳过/异常状态，以及 `completedAt/recordNote/recordEvidence/exceptionNote/exceptionEvidence` 等护工提交内容。
- 基础模板只供院长导入，不能出现在老人编辑下拉中，也不能参与 `generate_tasks_for_date()`。
- 院长端“导入云端模板”弹窗只能显示 `GET /api/daily-report-templates?templateType=base` 返回的真实云端机构；不能合并本地硬编码 demo 机构。
- 院长端实例模板列表必须按 `baseTemplateId` 显示父基础模板层级，便于确认实例模板来源。
- 院长端保存实例模板成功后只提示保存成功，并停留在当前编辑器；不能自动关闭回到日历页。
- 院长端进入模板编辑器时默认是“新建实例模板”模式，不能自动选中已有实例；只有点击“编辑此实例”才进入编辑模式。
- 院长端“新建实例”必须先弹出基础模板选择弹窗；选择基础模板后再生成实例草稿，不能和“另存当前实例”混用。
- 前端显示父模板时优先显示基础模板中文标题，只有找不到基础模板时才显示 `baseTemplateId`。
- 临时任务直接写入 `published_tasks` 当天老人任务表，`source=temporary` 或 `manual`，不再通过旧护理方案列表生成。
- 旧 `source=plan` / `template-feed-breakfast` / `template-medication` 这类护理方案任务来源已废弃。
- 院长端老人编辑下拉只能显示云端存在的实例模板；不能为了兼容历史脏数据，把老人身上已失效的 `reportTemplateId` 临时插入下拉。

### 11. 老人档案与任务时间轴入口

- 老人档案事实源是 `elders`，必须展示基础档案字段、`report_template_id/report_template_title`、`assigned_caregiver_id` 等业务字段。
- 超管“老人档案”不能默认展示 JSON；详情入口应是“查看任务时间轴”。
- 老人某天任务时间轴事实源是 `published_tasks`，索引为 `institution_id + record_date + elder_id`。
- 该时间轴由两部分组成：老人绑定的日报实例模板自动生成的任务行，以及院长临时分配插入到同一天同一老人任务表的任务行。
- 院长端“方案”页老人名片箭头入口也是该老人当天任务时间轴，只读展示 `published_tasks`；任务卡必须显示当前 `caregiver_id/caregiver_name`，点击任务卡后展示该任务卡在护工任务记录中的操作内容（打卡时间、文字、图片、异常）。
- 院长端方案页不能把护理方案配置项、日报模板草稿或本地计划项混入老人当天任务时间轴；配置层只能用于生成任务，展示层以云端任务记录为准。
- `GET /api/admin/tables/published_tasks` 支持 `elderId` 精确过滤；查看老人任务时间轴时不能用模糊搜索代替老人 ID 过滤。
