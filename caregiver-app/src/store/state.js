import {
  buildDirectorOverview,
  buildTasksFromConfiguration,
  createCareRecordDraft,
  createDirectorCareRecordDraft,
  createMockState,
  createReportTemplateItems,
} from "../data/mockData.js";
import {
  fetchCareRecords,
  fetchDailyReportTemplate,
  fetchDailyReportTemplates,
  fetchInstitutionState,
  fetchLatestAppRelease,
  fetchPublishedTasks,
  getAuthToken,
  getCloudApiConfig,
  isCloudSyncConfigured,
  requestJson,
  setAuthToken,
  uploadCareRecord,
  uploadDailyReportTemplate,
  uploadInstitutionState,
  uploadPublishedTask,
} from "../utils/cloudApi.js";

export const state = createMockState();

const listeners = new Set();
const DIRECTOR_AUDIT_PROJECTS = [
  { key: "all", label: "全部项目" },
  { key: "turning", label: "翻身" },
  { key: "medication", label: "用药" },
  { key: "feeding", label: "助餐" },
  { key: "wash", label: "洗漱" },
  { key: "exception", label: "异常" },
];

const DEFAULT_REPORT_TEMPLATE_IMPORT_INSTITUTIONS = [
  { id: "demo-qinghe-care", name: "青禾镇颐养护理院" },
  { id: "inst-001", name: "福乐镇智慧养老院" },
  { id: "sanxiang-songfeng", name: "湘潭县三湘松风园老年公寓" },
  { id: "zhuzhou-demo", name: "株洲示范养老院" },
];

export function notify() {
  if (state._holdNotify) return;
  listeners.forEach((listener) => listener(state));
}

function isReportTemplateWorkspaceOpen() {
  return Boolean(
    state.ui.directorReportTemplateDraft ||
      state.ui.directorReportTemplateScheduleSectionId ||
      state.ui.directorReportTemplateImportOpen ||
      state.ui.directorReportTemplatePreviewOpen,
  );
}

function formatNowTime() {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
}

function formatNowDate() {
  return new Intl.DateTimeFormat("sv-SE").format(new Date());
}

function shiftDate(dateString, offsetDays) {
  const base = dateString ? new Date(`${dateString}T00:00:00`) : new Date();
  if (Number.isNaN(base.getTime())) return formatNowDate();
  base.setDate(base.getDate() + offsetDays);
  return new Intl.DateTimeFormat("sv-SE").format(base);
}

function getDirectorAuditDateOptions() {
  const today = state.director.date || formatNowDate();
  return [
    { key: today, label: "今天" },
    { key: shiftDate(today, -1), label: "昨天" },
  ];
}

function touchToast(message) {
  state.ui.toast = message;
  notify();

  window.clearTimeout(touchToast.timer);
  touchToast.timer = window.setTimeout(() => {
    state.ui.toast = "";
    notify();
  }, 1800);
}

function readAppRuntimeInfo() {
  try {
    const raw = window.AndroidBridge?.getRuntimeInfo?.();
    return raw ? JSON.parse(raw) : {};
  } catch (error) {
    return {};
  }
}

function normalizeUpdateRelease(item = {}) {
  if (!item) return null;
  return {
    id: item.id || "",
    platform: item.platform || "android",
    channel: item.channel || "stable",
    versionCode: Number(item.versionCode || item.version_code || 0),
    versionName: item.versionName || item.version_name || "",
    apkPath: item.apkPath || item.apk_path || "",
    apkUrl: item.apkUrl || item.apk_url || "",
    sha256: String(item.sha256 || "").toLowerCase(),
    sizeBytes: Number(item.sizeBytes || item.size_bytes || 0),
    releaseNotes: item.releaseNotes || item.release_notes || "",
    forceUpdate: Boolean(item.forceUpdate || item.force_update),
    publishedAt: item.publishedAt || item.createdAt || item.created_at || "",
  };
}

function setAppUpdateState(nextState = {}) {
  state.ui.appUpdate = {
    ...(state.ui.appUpdate || { open: false, status: "idle", message: "", progress: 0, release: null }),
    ...nextState,
  };
}

function createAttendanceVerificationState(overrides = {}) {
  return {
    status: "idle",
    fingerprintStatus: "idle",
    locationStatus: "idle",
    errorStage: "",
    errorMessage: "",
    locationLabel: "",
    locationAccuracy: "",
    ...overrides,
  };
}

function normalizeClockInLocation(location = {}) {
  const latitude = Number(location.latitude);
  const longitude = Number(location.longitude);
  const accuracy = Number(location.accuracy);

  return {
    latitude: Number.isFinite(latitude) ? latitude : null,
    longitude: Number.isFinite(longitude) ? longitude : null,
    accuracy: Number.isFinite(accuracy) ? accuracy : null,
    capturedAt: String(location.capturedAt || ""),
  };
}

function formatClockInLocation(location = {}) {
  const normalized = normalizeClockInLocation(location);
  if (!Number.isFinite(normalized.latitude) || !Number.isFinite(normalized.longitude)) {
    return "";
  }

  const latitudeLabel = `${normalized.latitude >= 0 ? "北纬" : "南纬"} ${Math.abs(normalized.latitude).toFixed(4)}`;
  const longitudeLabel = `${normalized.longitude >= 0 ? "东经" : "西经"} ${Math.abs(normalized.longitude).toFixed(4)}`;

  return `${latitudeLabel} / ${longitudeLabel}`;
}

function formatClockInAccuracy(location = {}) {
  const accuracy = Number(location.accuracy);
  if (!Number.isFinite(accuracy)) return "";
  return `±${Math.round(accuracy)}米`;
}

function cloneCareRecordDraft(draft) {
  return JSON.parse(JSON.stringify(draft));
}

function createCareReportId(elderId, recordDate) {
  return `care-report-${elderId}-${recordDate}`;
}

function summarizeCareRecordDraft(record = {}) {
  const reportItemCount = Object.values(record.reportItems || {}).filter(Boolean).length;
  return {
    dailyCount: reportItemCount || Object.values(record.dailyCare || {}).filter(Boolean).length,
    medicationCount:
      [record.medication?.morning, record.medication?.afternoon, record.medication?.evening].filter(Boolean).length +
      (record.medication?.specialStatus === "taken" ? 1 : 0),
    issueCount:
      [
        record.health?.appetitePoor,
        record.health?.sleepPoor,
        record.health?.dizziness,
        record.health?.nausea,
        record.health?.bowelIssue,
        record.health?.skinIssue,
        record.health?.fall,
      ].filter(Boolean).length + (record.health?.other ? 1 : 0),
    refillCount: Object.values(record.inventory || {}).filter((value) => value === "refill").length,
  };
}

function normalizeDailyReportTemplate(template = {}) {
  const fallback = state.dailyReportTemplate || { id: "daily-report-basic", version: 1, title: "护理记录日报模板", sections: [] };
  const candidateCareLevel = template.careLevel || fallback.careLevel || "all";
  const normalized = {
    id: template.id || fallback.id || "daily-report-basic",
    version: Number(template.version || fallback.version || 1),
    title: String(template.title || fallback.title || "护理记录日报模板").trim(),
    description: String(template.description || fallback.description || "").trim(),
    careLevel: candidateCareLevel === "all" || CARE_LEVEL_OPTIONS.includes(candidateCareLevel) ? candidateCareLevel : "all",
    updatedAt: template.updatedAt || "",
    sections: [],
  };
  const usedIds = new Set();

  (template.sections || []).forEach((section, sectionIndex) => {
    const sectionTitle = String(section.title || "").trim();
    const items = [];

    (section.items || []).forEach((item, itemIndex) => {
      const label = String(item.label || "").trim();
      if (!label) return;
      let id = String(item.id || `${section.id || `section-${sectionIndex + 1}`}-${itemIndex + 1}`)
        .trim()
        .replace(/[^A-Za-z0-9_-]/g, "-");
      if (!id) id = `field-${sectionIndex + 1}-${itemIndex + 1}`;
      while (usedIds.has(id)) {
        id = `${id}-${itemIndex + 1}`;
      }
      usedIds.add(id);
      items.push({
        id,
        label,
        frequencyDays: Math.max(1, Number(item.frequencyDays || item.frequency || 1)),
        timeWindow: String(item.timeWindow || item.schedule || item.window || "").trim(),
        requirePhoto: Boolean(item.requirePhoto),
      });
    });

    if (!sectionTitle || !items.length) return;
    normalized.sections.push({
      id: String(section.id || `section-${sectionIndex + 1}`).replace(/[^A-Za-z0-9_-]/g, "-"),
      title: sectionTitle,
      items,
    });
  });

  return normalized;
}

function countDailyReportTemplateItems(template = {}) {
  return (template.sections || []).reduce((total, section) => total + (section.items || []).length, 0);
}

function normalizeCloudDailyReportTemplate(template = {}) {
  const normalized = normalizeDailyReportTemplate(template);
  return {
    ...normalized,
    institutionId: template.institutionId || "",
    institutionName: template.institutionName || "",
    updatedBy: template.updatedBy || "",
    source: template.source || "",
    createdAt: template.createdAt || "",
    updatedAt: template.updatedAt || normalized.updatedAt || "",
  };
}

function buildReportTemplateImportView() {
  const importState = state.ui.directorReportTemplateImportCatalog || {};
  const cloudItems = (importState.items || []).map(normalizeCloudDailyReportTemplate).filter((item) => item.sections.length);
  const institutions = new Map();

  DEFAULT_REPORT_TEMPLATE_IMPORT_INSTITUTIONS.forEach((institution) => {
    institutions.set(institution.id, { ...institution });
  });
  institutions.set(state.institution.id, {
    id: state.institution.id,
    name: state.institution.name || state.institution.id,
  });
  (importState.institutions || []).forEach((institution) => {
    if (!institution?.id) return;
    const existingName = institutions.get(institution.id)?.name;
    institutions.set(institution.id, {
      id: institution.id,
      name: institution.name && institution.name !== institution.id ? institution.name : existingName || institution.id,
    });
  });
  cloudItems.forEach((item) => {
    if (!item.institutionId) return;
    institutions.set(item.institutionId, {
      id: item.institutionId,
      name: item.institutionName || institutions.get(item.institutionId)?.name || item.institutionId,
    });
  });

  const selectedInstitutionId =
    state.ui.directorReportTemplateImportInstitutionId || state.institution.id || DEFAULT_REPORT_TEMPLATE_IMPORT_INSTITUTIONS[0].id;
  const templates = cloudItems.filter((item) => item.institutionId === selectedInstitutionId);
  const selectedTemplateId =
    state.ui.directorReportTemplateImportTemplateId ||
    templates[0]?.id ||
    "";

  return {
    open: Boolean(state.ui.directorReportTemplateImportOpen),
    loading: Boolean(state.ui.directorReportTemplateImportLoading),
    error: state.ui.directorReportTemplateImportError || "",
    selectedInstitutionId,
    selectedTemplateId,
    institutions: Array.from(institutions.values()),
    templates: templates.map((template) => ({
      ...template,
      sectionCount: (template.sections || []).length,
      itemCount: countDailyReportTemplateItems(template),
      selected: template.id === selectedTemplateId,
    })),
  };
}

function createDailyReportTemplateDraft(template = state.dailyReportTemplate) {
  return normalizeDailyReportTemplate(JSON.parse(JSON.stringify(template || {})));
}

function createReportTemplateSectionId(title = "") {
  const base =
    String(title || "section")
      .trim()
      .replace(/[^A-Za-z0-9_-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "section";
  return `custom-${base}-${Date.now()}`;
}

function createReportTemplateItemId(label = "") {
  const base =
    String(label || "item")
      .trim()
      .replace(/[^A-Za-z0-9_-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "item";
  return `custom-${base}-${Date.now()}`;
}

function hydrateReportItems(record = {}, template = state.dailyReportTemplate) {
  return {
    ...createReportTemplateItems(template),
    ...(record.reportItems || {}),
  };
}

function applyDailyReportTemplate(template = {}, options = {}) {
  const nextTemplate = normalizeDailyReportTemplate(template);
  if (!nextTemplate.sections.length) return null;

  state.dailyReportTemplate = nextTemplate;
  if (state.ui.caregiverDailyReportDraft) {
    state.ui.caregiverDailyReportDraft.reportTemplateSnapshot = nextTemplate;
    state.ui.caregiverDailyReportDraft.reportItems = hydrateReportItems(state.ui.caregiverDailyReportDraft, nextTemplate);
  }
  if (state.ui.directorCareRecordDraft) {
    state.ui.directorCareRecordDraft.reportTemplateSnapshot = nextTemplate;
    state.ui.directorCareRecordDraft.reportItems = hydrateReportItems(state.ui.directorCareRecordDraft, nextTemplate);
  }

  if (options.rebuild !== false) rebuildTasks();
  return nextTemplate;
}

function getDailyReportTemplateChoice(templateId = "") {
  const currentTemplate = normalizeDailyReportTemplate(state.dailyReportTemplate || {});
  return {
    id: currentTemplate.id || templateId || "daily-report-basic",
    title: currentTemplate.title || "护理记录日报模板",
  };
}

function normalizeProjectText(value = "") {
  return String(value || "").replace(/\s+/g, "");
}

function taskMatchesProject(task = {}, projectKey = "all") {
  if (!projectKey || projectKey === "all") return true;
  const text = normalizeProjectText(`${task.title || ""}${task.category || ""}${task.note || ""}`);

  if (projectKey === "turning") return text.includes("翻身") || text.includes("拍背");
  if (projectKey === "medication") return text.includes("药") || text.includes("用药");
  if (projectKey === "feeding") return text.includes("助餐") || text.includes("喂饭") || text.includes("进食") || text.includes("餐饮");
  if (projectKey === "wash") return text.includes("洗漱") || text.includes("擦身") || text.includes("清洁");
  if (projectKey === "exception") return task.status === "risk" || task.status === "refused" || text.includes("异常") || text.includes("回访");

  return true;
}

function careRecordMatchesProject(record = {}, projectKey = "all") {
  if (!projectKey || projectKey === "all") return true;
  const dailyCare = record.dailyCare || {};
  const medication = record.medication || {};
  const health = record.health || {};

  if (projectKey === "turning") return Boolean(dailyCare.turning);
  if (projectKey === "medication") {
    return Boolean(medication.morning || medication.afternoon || medication.evening || medication.specialStatus === "taken" || medication.commonDrugs);
  }
  if (projectKey === "feeding") return Boolean(dailyCare.feedingMeal || dailyCare.feedingWater);
  if (projectKey === "wash") return Boolean(dailyCare.hygiene || dailyCare.bathWipe);
  if (projectKey === "exception") return summarizeCareRecordDraft(record).issueCount > 0;

  return true;
}

function getCareRecordFloor(record = {}) {
  const elder = getElderById(record.elderId) || state.elders.find((item) => String(item.room) === String(record.room));
  return elder ? `${elder.floor}F` : "";
}

function getTaskStatusTone(tasks = []) {
  if (!tasks.length) return "muted";
  if (tasks.some((task) => task.status === "risk")) return "error";
  if (tasks.some((task) => task.status === "refused")) return "warning";
  if (tasks.every((task) => task.status === "completed")) return "success";
  return "warning";
}

function getTaskStatusText(tasks = []) {
  if (!tasks.length) return "无该项目";
  if (tasks.some((task) => task.status === "risk")) return "异常已留痕";
  if (tasks.some((task) => task.status === "refused")) return "不配合已留痕";
  if (tasks.every((task) => task.status === "completed")) return "已处理";
  return "待处理";
}

function getCareReportStatusMeta(status = "local-draft") {
  if (status === "pending-sync") {
    return {
      text: "\u5f85\u540c\u6b65\u5230\u9662\u957f\u7aef",
      detail: "\u65e5\u62a5\u5df2\u63d0\u4ea4\uff0c\u6b63\u5728\u540c\u6b65\u5230\u4e91\u7aef\u548c\u9662\u957f\u7aef\u3002",
      tone: "warning",
    };
  }

  if (status === "synced") {
    return {
      text: "\u5df2\u540c\u6b65",
      detail: "\u5f53\u524d\u65e5\u62a5\u5df2\u7ecf\u540c\u6b65\u5230\u76d1\u7ba1\u7aef\u3002",
      tone: "success",
    };
  }

  if (status === "sync-failed") {
    return {
      text: "\u540c\u6b65\u5931\u8d25",
      detail: "\u6570\u636e\u5df2\u4fdd\u5b58\u5728\u672c\u673a\uff0c\u540e\u7eed\u53ef\u91cd\u8bd5\u540c\u6b65\u3002",
      tone: "error",
    };
  }

  return {
    text: "\u4ec5\u4fdd\u5b58\u5728\u672c\u673a",
    detail: "\u53ef\u4ee5\u5148\u4fdd\u5b58\u8349\u7a3f\uff0c\u63d0\u4ea4\u65f6\u518d\u4e0a\u4f20\u5230\u4e91\u7aef\u3002",
    tone: "success",
  };
}

function createCloudStatusMeta() {
  const config = getCloudApiConfig();
  return {
    configured: isCloudSyncConfigured(),
    baseUrl: config.baseUrl,
    loading: Boolean(state.cloud?.careReportsLoading),
    error: state.cloud?.careReportsError || "",
    fetchedAt: state.cloud?.careReportsFetchedAt || "",
    count: Array.isArray(state.cloud?.careReports) ? state.cloud.careReports.length : 0,
  };
}

function normalizeCloudCareRecord(record = {}) {
  const normalized = cloneCareRecordDraft(record);
  normalized.id = String(normalized.id || createCareReportId(normalized.elderId || "unknown", normalized.recordDate || formatNowDate()));
  normalized.syncStatus = normalized.syncStatus || "synced";
  normalized.reportTemplateSnapshot = normalized.reportTemplateSnapshot || state.dailyReportTemplate;
  normalized.reportItems = hydrateReportItems(normalized, normalized.reportTemplateSnapshot);
  normalized.summary = normalized.summary || summarizeCareRecordDraft(normalized);
  return normalized;
}

function mergeCloudCareRecord(record = {}) {
  const normalized = normalizeCloudCareRecord(record);
  const cloudIndex = state.cloud.careReports.findIndex((item) => item.id === normalized.id);

  if (cloudIndex >= 0) {
    state.cloud.careReports.splice(cloudIndex, 1, normalized);
  } else {
    state.cloud.careReports.unshift(normalized);
  }

  const reportIndex = state.dailyReports.findIndex((item) => item.id === normalized.id);
  if (reportIndex >= 0) {
    state.dailyReports.splice(reportIndex, 1, normalized);
  } else {
    state.dailyReports.unshift(normalized);
  }

  state.cloud.careReports.sort((left, right) => {
    const cmp = String(right.updatedAt || "").localeCompare(String(left.updatedAt || ""));
    return cmp !== 0 ? cmp : (left.id || "").localeCompare(right.id || "");
  });

  return cloneCareRecordDraft(normalized);
}

function serializeCloudTask(task = {}, sourceApp = task.sourceApp || "director-app") {
  const elder = getElderById(task.elderId);
  const caregiver = getCaregiverById(task.caregiverId);
  const defaultCaregiver = getCaregiverById(task.defaultCaregiverId);
  const timestamp = `${formatNowDate()} ${formatNowTime()}`;

  return {
    ...task,
    taskId: task.id,
    institutionId: state.institution.id,
    institutionName: state.institution.name,
    recordDate: state.director.date,
    elderName: elder?.name || "",
    elderRoom: elder?.room || "",
    elderBed: elder?.bed || "",
    elderFloor: elder?.floor || "",
    caregiverName: caregiver?.name || "",
    defaultCaregiverName: defaultCaregiver?.name || "",
    workflowStatus: "published",
    sourceApp,
    updatedAt: timestamp,
  };
}

function normalizeCloudTask(task = {}) {
  const taskId = String(task.taskId || task.id || "");
  if (!taskId) return null;

  return {
    id: taskId,
    planId: task.planId || "",
    planItemId: task.planItemId || "",
    elderId: task.elderId || "",
    caregiverId: task.caregiverId || "",
    defaultCaregiverId: task.defaultCaregiverId || "",
    templateId: task.templateId || "",
    title: task.title || "院长发布任务",
    schedule: task.schedule || task.window || "即时",
    window: task.window || task.schedule || "即时",
    requirePhoto: Boolean(task.requirePhoto),
    status: task.status || "pending",
    note: task.note || "",
    category: task.category || "",
    templateGroup: task.templateGroup || "special",
    source: task.source || "manual",
    assignmentMode: task.assignmentMode || "manual",
    assignmentStatus: task.assignmentStatus || "published",
    description: task.description || task.note || "",
    exception: task.exception || task.exceptionNote || "",
    exceptionNote: task.exceptionNote || task.exception || "",
    exceptionType: task.exceptionType || "",
    exceptionReportedAt: task.exceptionReportedAt || "",
    exceptionEvidence: normalizeEvidenceList(task.exceptionEvidence || task.evidence || task.photos || []),
    publishedAt: task.publishedAt || task.updatedAt || "",
    acceptedAt: task.acceptedAt || task.publishedAt || task.updatedAt || "",
    planNote: task.planNote || "",
    cloudTaskId: task.id || task.cloudTaskId || taskId,
    updatedAt: task.updatedAt || "",
  };
}

function mergeCloudTask(task = {}) {
  const normalized = normalizeCloudTask(task);
  if (!normalized) return null;

  state.cloud.tasks = Array.isArray(state.cloud.tasks) ? state.cloud.tasks : [];
  const cloudIndex = state.cloud.tasks.findIndex((item) => (item.taskId || item.id) === normalized.id);
  const cloudItem = { ...task, taskId: normalized.id };

  if (cloudIndex >= 0) {
    state.cloud.tasks.splice(cloudIndex, 1, cloudItem);
  } else {
    state.cloud.tasks.unshift(cloudItem);
  }

  const taskIndex = state.tasks.findIndex(
    (item) => item.id === normalized.id || (normalized.planItemId && item.planItemId === normalized.planItemId),
  );

  if (taskIndex >= 0) {
    state.tasks.splice(taskIndex, 1, {
      ...state.tasks[taskIndex],
      ...normalized,
    });
  } else {
    state.tasks.push(normalized);
  }

  state.tasks = sortTasksBySchedule(state.tasks);
  return normalized;
}

function buildInstitutionStateSnapshot() {
  const timestamp = `${formatNowDate()} ${formatNowTime()}`;
  const temporaryTasks = state.tasks.filter(isTemporaryTask).map((task) => serializeCloudTask(task));
  const roomsByFloor = state.elders.reduce((result, elder) => {
    const floor = String(elder.floor || "");
    if (!floor) return result;
    result[floor] = result[floor] || [];
    result[floor].push({
      elderId: elder.id,
      room: elder.room,
      bed: elder.bed,
      elderName: elder.name,
    });
    return result;
  }, {});

  return {
    institutionId: state.institution.id,
    institutionName: state.institution.name,
    dataSchemaVersion: 1,
    updatedAt: timestamp,
    source: "director-app",
    taskInfo: {
      dailyReportTemplate: JSON.parse(JSON.stringify(state.dailyReportTemplate || {})),
      elderCarePlans: JSON.parse(JSON.stringify(state.elderCarePlans || [])),
      dailyReports: JSON.parse(JSON.stringify(state.dailyReports || [])),
      temporaryTasks,
      reportTemplateId: state.dailyReportTemplate?.id || "",
      updatedAt: timestamp,
    },
    personnelInfo: {
      caregivers: JSON.parse(JSON.stringify(state.caregivers || [])),
      elders: JSON.parse(JSON.stringify(state.elders || [])),
      updatedAt: timestamp,
    },
    institutionInfo: {
      institution: JSON.parse(JSON.stringify(state.institution || {})),
      floorCount: Math.max(0, ...state.elders.map((elder) => Number(elder.floor || 0))),
      roomCount: state.elders.length,
      roomsByFloor,
      dailyReportTemplateId: state.dailyReportTemplate?.id || "",
      inventory: JSON.parse(JSON.stringify(state.inventory || state.director?.inventory || {})),
      updatedAt: timestamp,
    },
  };
}

function normalizeInstitutionStateSnapshot(response = {}) {
  if (!response) return null;
  if (response.item) return response.item;
  if (response.state) return response.state;
  if (
    response.taskInfo ||
    response.personnelInfo ||
    response.institutionInfo ||
    response.task_info ||
    response.personnel_info ||
    response.institution_info
  ) {
    return response;
  }
  return null;
}

function applyInstitutionStateSnapshot(snapshot = {}) {
  const data = normalizeInstitutionStateSnapshot(snapshot);
  if (!data) return false;

  const personnelInfo = data.personnelInfo || data.personnel_info || {};
  const institutionInfo = data.institutionInfo || data.institution_info || {};
  const taskInfo = data.taskInfo || data.task_info || {};
  let structureChanged = false;
  let changed = false;

  if (Array.isArray(personnelInfo.caregivers)) {
    const sorted = [...personnelInfo.caregivers].sort((a, b) => (a.id || "").localeCompare(b.id || ""));
    const prev = JSON.stringify([...state.caregivers].sort((a, b) => (a.id || "").localeCompare(b.id || "")));
    state.caregivers = JSON.parse(JSON.stringify(sorted));
    if (JSON.stringify(sorted) !== prev) structureChanged = true;
  }
  if (Array.isArray(personnelInfo.elders)) {
    const sorted = [...personnelInfo.elders].sort((a, b) => (a.id || "").localeCompare(b.id || ""));
    const prev = JSON.stringify([...state.elders].sort((a, b) => (a.id || "").localeCompare(b.id || "")));
    state.elders = JSON.parse(JSON.stringify(sorted));
    if (JSON.stringify(sorted) !== prev) structureChanged = true;
  }
  if (institutionInfo.institution) {
    const prevInst = JSON.stringify(state.institution);
    state.institution = { ...state.institution, ...JSON.parse(JSON.stringify(institutionInfo.institution)) };
    const nextInst = JSON.stringify(state.institution);
    if (nextInst !== prevInst) {
      structureChanged = true;
    }
  }
  if (taskInfo.dailyReportTemplate?.sections?.length) {
    const prev = JSON.stringify(state.dailyReportTemplate);
    applyDailyReportTemplate(taskInfo.dailyReportTemplate, { rebuild: false });
    if (JSON.stringify(state.dailyReportTemplate) !== prev) structureChanged = true;
  }
  if (Array.isArray(taskInfo.elderCarePlans) && taskInfo.elderCarePlans.length) {
    const hasPlanItems = taskInfo.elderCarePlans.some((plan) => Array.isArray(plan.items) && plan.items.length > 0);
    if (hasPlanItems || !state.elderCarePlans.length) {
      const sorted = [...taskInfo.elderCarePlans].sort((a, b) => (a.elderId || a.id || "").localeCompare(b.elderId || b.id || ""));
      const prev = JSON.stringify([...state.elderCarePlans].sort((a, b) => (a.elderId || a.id || "").localeCompare(b.elderId || b.id || "")));
      state.elderCarePlans = JSON.parse(JSON.stringify(sorted));
      if (JSON.stringify(sorted) !== prev) structureChanged = true;
    }
  }

  if (structureChanged) {
    if (currentCaregiver) {
      state.caregiver = { ...currentCaregiver };
    } else if (state.session.identity === "caregiver" && state.caregivers[0]) {
      state.caregiver = { ...state.caregivers[0] };
    }
    rebuildTasks();
    changed = true;
  }

  if (Array.isArray(taskInfo.dailyReports)) {
    taskInfo.dailyReports.forEach((record) => mergeCloudCareRecord(record));
  }

  if (Array.isArray(taskInfo.temporaryTasks)) {
    taskInfo.temporaryTasks.forEach((task) => {
      if (isTemporaryTask(task)) mergeCloudTask(task);
    });
  }

  if (changed) {
    state.cloud.institutionStateFetchedAt = data.updatedAt || data.updated_at || `${formatNowDate()} ${formatNowTime()}`;
    refreshDirectorOverview();
    ensureCurrentSelections();
  }

  return changed;
}

function queueCaregiverTemporaryTaskReminder(task = {}) {
  if (!task.caregiverId) return null;

  const elder = getElderById(task.elderId);
  const caregiver = getCaregiverById(task.caregiverId);
  const timestamp = `${formatNowDate()} ${formatNowTime()}`;
  const reminder = {
    id: `reminder-${Date.now()}`,
    type: "temporary-task",
    taskId: task.id,
    caregiverId: task.caregiverId,
    caregiverName: caregiver?.name || "",
    elderId: task.elderId || "",
    elderName: elder?.name || "",
    elderRoom: elder?.room || "",
    title: "临时任务",
    content: `${elder ? `${elder.room}室 · ${elder.name}` : "相关老人"}：${task.title || "院长发布任务"}`,
    status: "queued",
    read: false,
    createdAt: timestamp,
  };

  state.cloud.caregiverReminders = Array.isArray(state.cloud.caregiverReminders) ? state.cloud.caregiverReminders : [];
  state.cloud.caregiverReminders.unshift(reminder);
  return reminder;
}
/*
  if (status === "pending-sync") {
    return {
      text: "寰呭悓姝ュ埌闄㈤暱绔? ,
      detail: "宸叉彁浜ゆ棩鎶ワ紝鍚庣画鍙帴鍏ヤ簯绔笂浼犮€?",
      tone: "warning",
    };
  }

  if (status === "synced") {
    return {
      text: "宸插悓姝? ,
      detail: "褰撳墠鏃ユ姤宸茬粡鍚屾鍒扮洃绠＄銆?",
      tone: "success",
    };
  }

  if (status === "sync-failed") {
    return {
      text: "鍚屾澶辫触",
      detail: "鏁版嵁宸蹭繚瀛樺湪鏈満锛屽悗缁彲閲嶈瘯鍚屾銆?",
      tone: "error",
    };
  }

  return {
    text: "浠呬繚瀛樺湪鏈満",
    detail: "鍙厛淇濆瓨鑽夌锛屽悗缁啀鎺ュ叆浜戠鍚屾銆?",
    tone: "success",
  };
}

*/
function buildCaregiverDailyReportDraft(elderId, existingReport = null) {
  if (existingReport) {
    return cloneCareRecordDraft(existingReport);
  }

  return createCareRecordDraft({
    elderId,
    recordDate: formatNowDate(),
    recordTime: formatNowTime(),
    institutionName: state.institution.name,
    reviewerName: "",
    caregiverName: state.caregiver.name,
    elders: state.elders,
    caregivers: state.caregivers,
    reportTemplate: state.dailyReportTemplate,
  });
}

function findDailyReport(elderId, recordDate = formatNowDate()) {
  return state.dailyReports.find(
    (item) => item.elderId === elderId && item.recordDate === recordDate && item.caregiverId === state.caregiver.id,
  );
}

function upsertDailyReport(record, syncStatus) {
  const normalizedRecord = cloneCareRecordDraft(record);
  const reportId = normalizedRecord.id || createCareReportId(normalizedRecord.elderId, normalizedRecord.recordDate);
  const timestamp = `${formatNowDate()} ${formatNowTime()}`;
  const nextReport = {
    ...normalizedRecord,
    id: reportId,
    caregiverId: state.caregiver.id,
    caregiverName: normalizedRecord.caregiverName || state.caregiver.name,
    reportTemplateSnapshot: normalizedRecord.reportTemplateSnapshot || state.dailyReportTemplate,
    reportItems: hydrateReportItems(normalizedRecord, normalizedRecord.reportTemplateSnapshot || state.dailyReportTemplate),
    syncStatus,
    updatedAt: timestamp,
    submittedAt: syncStatus === "pending-sync" ? timestamp : normalizedRecord.submittedAt || "",
    filledAt: syncStatus === "pending-sync" ? timestamp : normalizedRecord.filledAt || "",
  };
  const existingIndex = state.dailyReports.findIndex((item) => item.id === reportId);

  if (existingIndex >= 0) {
    state.dailyReports.splice(existingIndex, 1, nextReport);
  } else {
    state.dailyReports.unshift(nextReport);
  }

  return cloneCareRecordDraft(nextReport);
}

function normalizeRoomLabel(value = "") {
  return String(value).replace(/[^\dA-Za-z]/g, "");
}

function isLinkedFamilyCareRecord(record = {}) {
  const familyElder = state.family?.elder || {};
  const familyRoom = normalizeRoomLabel(familyElder.room);
  const recordRoom = normalizeRoomLabel(record.room);
  const familyName = String(familyElder.name || "").trim();
  const recordName = String(record.elderName || "").trim();

  return Boolean((familyRoom && recordRoom && familyRoom === recordRoom) || (familyName && recordName && familyName === recordName));
}

function upsertFamilyCareReportNotice(record = {}, syncStatus = "pending-sync") {
  if (!isLinkedFamilyCareRecord(record)) return;

  const summary = record.summary || summarizeCareRecordDraft(record);
  const statusLabel = syncStatus === "synced" ? "已同步" : syncStatus === "sync-failed" ? "待院方补同步" : "已提交";
  const messageId = `family-report-${record.id}`;
  const logId = `family-log-${record.id}`;
  const timeLabel = record.recordTime || formatNowTime();
  const preview = `${record.recordDate || formatNowDate()} ${record.room || ""}室交班日报${statusLabel}：日常 ${summary.dailyCount} 项、服药 ${summary.medicationCount} 项、异常 ${summary.issueCount} 项。`;
  const nextMessage = {
    id: messageId,
    title: "交班日报更新",
    preview,
    time: timeLabel,
    read: false,
  };
  const nextLog = {
    id: logId,
    time: timeLabel,
    title: "交班日报",
    description: preview,
    tone: summary.issueCount ? "primary" : "success",
  };

  const messageIndex = state.family.messages.findIndex((item) => item.id === messageId);
  if (messageIndex >= 0) {
    state.family.messages.splice(messageIndex, 1, nextMessage);
  } else {
    state.family.messages.unshift(nextMessage);
  }

  const logIndex = state.family.logs.findIndex((item) => item.id === logId);
  if (logIndex >= 0) {
    state.family.logs.splice(logIndex, 1, nextLog);
  } else {
    state.family.logs.unshift(nextLog);
  }

  state.family.careSummary = {
    ...(state.family.careSummary || {}),
    conclusion: summary.issueCount ? "今日有异常已处理" : "今日护理总体正常",
    handledCount: summary.dailyCount + summary.medicationCount + summary.issueCount,
    totalCount: Math.max(summary.dailyCount + summary.medicationCount + summary.issueCount, 1),
    latestTime: timeLabel,
    caregiver: record.caregiverName || state.caregiver.name,
    shift: "今日班次",
    syncStatus: statusLabel,
    evidence: summary.issueCount ? "异常处理已留痕" : "关键护理已留痕",
  };
  state.family.medicationSummary = {
    ...(state.family.medicationSummary || {}),
    conclusion: summary.medicationCount ? "今日用药已确认" : "今日暂无用药记录",
    status: summary.medicationCount ? "已处理" : "无用药",
    latestTime: timeLabel,
    caregiver: record.caregiverName || state.caregiver.name,
    reviewer: record.reviewerName || "院方",
    source: "交班日报（提交）",
  };
  state.family.anomalySummary = {
    ...(state.family.anomalySummary || {}),
    conclusion: summary.issueCount ? "异常已上报并处理" : "暂无未处理异常",
    status: summary.issueCount ? "已处理" : "平稳",
    latestTime: timeLabel,
    chain: summary.issueCount ? ["护工上报", "院长已查看", "处理情况已记录"] : ["今日记录已同步", "暂无异常"],
    evidence: summary.issueCount ? "处理链路已留痕" : "日报已同步",
  };
  state.family.logs = state.family.logs.slice(0, 5);
}

function setCloudCareReportsLoading(isLoading) {
  state.cloud.careReportsLoading = Boolean(isLoading);
}

function setCloudCareReportsError(message = "") {
  state.cloud.careReportsError = message;
}

function setCloudCareReportsFetchedAt(timestamp = "") {
  state.cloud.careReportsFetchedAt = timestamp;
}

async function downloadDirectorCareReports(filters = {}, options = {}) {
  const response = await fetchCareRecords({
    limit: filters.limit || 120,
    elderId: filters.elderId || "",
    recordDate: filters.recordDate || "",
    caregiverId: filters.caregiverId || "",
    institutionId: state.institution.id || "",
  });
  const nextItems = Array.isArray(response?.items) ? response.items.map((item) => normalizeCloudCareRecord(item)) : [];

  if (options.clear) {
    state.cloud.careReports = [];
  }

  const prevCount = state.cloud.careReports.length;
  nextItems.forEach((item) => {
    mergeCloudCareRecord(item);
  });

  setCloudCareReportsFetchedAt(response?.fetchedAt || `${formatNowDate()} ${formatNowTime()}`);
  setCloudCareReportsError("");

  return nextItems;
}

function setCloudTasksLoading(isLoading) {
  state.cloud.tasksLoading = Boolean(isLoading);
}

function setCloudTasksError(message = "") {
  state.cloud.tasksError = message;
}

function setCloudTasksFetchedAt(timestamp = "") {
  state.cloud.tasksFetchedAt = timestamp;
}

const CARE_LEVEL_OPTIONS = ["一级护理", "二级护理", "三级护理"];
const REVIEW_CYCLE_OPTIONS = ["每日复核", "每周复核", "每日晨会复核", "每周重点复核"];

let draftItemCounter = 1;

function createDraftItemId() {
  draftItemCounter += 1;
  return `draft-plan-item-${Date.now()}-${draftItemCounter}`;
}

function createTemplateDraft(input = "daily") {
  const template = typeof input === "string" ? null : input;
  const group = template ? template.group : input;
  const isSpecial = group === "special";

  return {
    mode: template ? "edit" : "create",
    templateId: template?.id || "",
    group,
    title: template?.title || "",
    category: template?.category || "",
    requirePhoto: template ? Boolean(template.requirePhoto) : isSpecial,
    batchEligible: template ? Boolean(template.batchEligible) : !isSpecial,
    appliesToLevels: template?.appliesToLevels?.length ? [...template.appliesToLevels] : isSpecial ? ["二级护理", "三级护理"] : [...CARE_LEVEL_OPTIONS],
    defaultNote: template?.defaultNote || "",
    isActive: template ? template.isActive !== false : true,
  };
}

function createPlanDraftItem(overrides = {}) {
  return {
    id: createDraftItemId(),
    templateId: "",
    schedule: "08:00",
    assignment: "floor-owner",
    note: "",
    isEnabled: true,
    ...overrides,
  };
}

function createPlanItemDraft(item) {
  const source = item ? createPlanDraftItem(item) : createPlanDraftItem();

  return {
    mode: item ? "edit" : "create",
    itemId: source.id,
    templateId: source.templateId,
    schedule: source.schedule,
    assignment: source.assignment,
    note: source.note,
    isEnabled: source.isEnabled !== false,
  };
}

function createPlanDraft(elder, plan) {
  return {
    mode: plan ? "edit" : "create",
    planId: plan?.id || "",
    elderId: elder?.id || "",
    level: plan?.level || elder?.level || CARE_LEVEL_OPTIONS[0],
    reviewCycle: plan?.reviewCycle || REVIEW_CYCLE_OPTIONS[1],
    note: plan?.note || "",
    items:
      plan?.items?.length
        ? sortTasksBySchedule(plan.items).map((item) =>
            createPlanDraftItem({
              id: item.id,
              templateId: item.templateId,
              schedule: item.schedule,
              assignment: item.assignment,
              note: item.note || "",
              isEnabled: item.isEnabled !== false,
            }),
          )
        : [],
  };
}

function resolvePlanDraftItem(planDraft, itemDraft) {
  const templateId = String(itemDraft?.templateId || "").trim();
  const schedule = String(itemDraft?.schedule || "").trim();
  if (!planDraft || !itemDraft || !templateId || !schedule) {
    return { error: "请先选择任务模板和执行时间" };
  }

  const nextItem = createPlanDraftItem({
    id: itemDraft.itemId || createDraftItemId(),
    templateId,
    schedule,
    assignment: itemDraft.assignment === "manual" ? "manual" : "floor-owner",
    note: String(itemDraft.note || "").trim(),
    isEnabled: itemDraft.isEnabled !== false,
  });

  if (itemDraft.mode === "edit") {
    const hasCurrentItem = planDraft.items.some((item) => item.id === itemDraft.itemId);
    if (!hasCurrentItem) {
      return { error: "当前任务已失效，请重新打开后再编辑" };
    }

    return {
      items: sortTasksBySchedule(planDraft.items.map((item) => (item.id === itemDraft.itemId ? nextItem : item))),
      mode: "edit",
    };
  }

  return {
    items: sortTasksBySchedule([...planDraft.items, nextItem]),
    mode: "create",
  };
}

function sortTasksBySchedule(taskList) {
  return [...taskList].sort((left, right) => {
    const cmp = (left.schedule || "").localeCompare(right.schedule || "");
    return cmp !== 0 ? cmp : (left.id || "").localeCompare(right.id || "");
  });
}

function scheduleToMinutes(value = "") {
  const match = String(value || "").match(/(\d{1,2}):(\d{2})/);
  if (!match) return Number.POSITIVE_INFINITY;
  return Number.parseInt(match[1], 10) * 60 + Number.parseInt(match[2], 10);
}

function currentClockMinutes() {
  const [hour, minute] = formatNowTime().split(":").map((item) => Number.parseInt(item, 10) || 0);
  return hour * 60 + minute;
}

function countExpectedDueTasks(taskList = [], nowLimit = currentClockMinutes(), handledCount = 0) {
  const scheduledDue = taskList.filter((task) => scheduleToMinutes(task.schedule) <= nowLimit).length;
  return Math.max(scheduledDue, handledCount);
}

function isTemporaryTask(task = {}) {
  return task.assignmentMode === "temporary" || task.source === "temporary" || task.templateGroup === "temporary";
}

function isHandledTask(task = {}) {
  return task.status === "completed" || task.status === "risk" || task.status === "refused";
}

function percentNumber(count, total) {
  if (!total) return 0;
  return Math.max(0, Math.min(100, Math.round((count / total) * 100)));
}

function percentLabel(count, total) {
  return `${percentNumber(count, total)}%`;
}

function taskEndMinutes(task = {}) {
  const windowText = String(task.window || "");
  const match = windowText.match(/\d{1,2}:\d{2}\s*-\s*(\d{1,2}:\d{2})/);
  if (match) return scheduleToMinutes(match[1]);
  return scheduleToMinutes(task.schedule);
}

function getDirectorTimelineStatus(task = {}, selectedDate = formatNowDate()) {
  if (task.status === "completed") {
    return { label: "已完成", tone: "success" };
  }

  if (task.status === "risk") {
    return { label: "异常", tone: "error" };
  }

  if (task.status === "refused") {
    return { label: "不配合", tone: "error" };
  }

  const today = formatNowDate();
  const isPastDate = selectedDate < today;
  const isToday = selectedDate === today || selectedDate === state.director.date;
  const isOverdue = isPastDate || (isToday && taskEndMinutes(task) < currentClockMinutes());

  if (isOverdue) {
    return { label: "超时", tone: "overdue" };
  }

  return { label: "未完成", tone: "muted" };
}

function pickCurrentTask(taskList = []) {
  const sorted = sortTasksBySchedule(taskList);
  const pending = sorted.filter((task) => task.status !== "completed");
  if (!pending.length) return sorted[0] || null;

  const now = currentClockMinutes();
  const dueTasks = pending.filter((task) => scheduleToMinutes(task.schedule) <= now);
  if (dueTasks.length) return dueTasks[dueTasks.length - 1];

  return pending.find((task) => scheduleToMinutes(task.schedule) >= now) || pending[0] || null;
}

function getTaskById(taskId) {
  return state.tasks.find((task) => task.id === taskId);
}

function getElderById(elderId) {
  return state.elders.find((elder) => elder.id === elderId);
}

function getElderByRoom(room) {
  return state.elders.find((elder) => elder.room === room);
}

function getHistoryById(historyId) {
  return state.history.find((item) => item.id === historyId);
}

function getTemplateById(templateId) {
  return state.taskTemplates.find((item) => item.id === templateId);
}

function getCaregiverById(caregiverId) {
  return state.caregivers.find((item) => item.id === caregiverId);
}

function getCaregiverForFloor(floor) {
  const normalizedFloor = Number(floor || 0);
  return state.caregivers.find((item) => Number(item.floor) === normalizedFloor) || state.caregivers[0] || null;
}

function sortEldersByFloorRoom(elderList = state.elders) {
  return [...elderList].sort((left, right) => {
    const leftFloor = Number(left.floor || 0);
    const rightFloor = Number(right.floor || 0);
    if (leftFloor !== rightFloor) return leftFloor - rightFloor;
    const roomOrder = String(left.room || "").localeCompare(String(right.room || ""), "zh-CN", { numeric: true });
    if (roomOrder !== 0) return roomOrder;
    return String(left.name || "").localeCompare(String(right.name || ""), "zh-CN");
  });
}

function getDirectorTemporaryElderPicker(draft = {}) {
  const sortedElders = sortEldersByFloorRoom();
  const selectedElder = getElderById(draft.elderId);
  const floors = Array.from(new Set(sortedElders.map((elder) => String(elder.floor || "")))).filter(Boolean);
  const floor = String(draft.floor || selectedElder?.floor || floors[0] || "");
  const floorElders = sortedElders.filter((elder) => String(elder.floor || "") === floor);
  const rooms = Array.from(new Set(floorElders.map((elder) => String(elder.room || "")))).filter(Boolean);
  const room = String(draft.room || selectedElder?.room || rooms[0] || "");
  const roomElders = floorElders.filter((elder) => String(elder.room || "") === room);
  const searchText = String(draft.elderSearch || "").trim();
  const searchResults = searchText
    ? sortedElders.filter((elder) => String(elder.name || "").includes(searchText)).slice(0, 8)
    : [];

  return {
    floor,
    room,
    floors,
    rooms,
    elders: roomElders,
    floorOptions: floors.map((item) => ({ value: item, label: `${item}F` })),
    roomOptions: rooms.map((item) => ({ value: item, label: `${item}室` })),
    elderOptions: roomElders.map((elder) => ({ value: elder.id, label: elder.name })),
    searchResults,
  };
}

function normalizeDirectorTemporaryTaskDraft(input = {}) {
  const sortedElders = sortEldersByFloorRoom();
  const selectedElder = getElderById(input.elderId);
  const floors = Array.from(new Set(sortedElders.map((elder) => String(elder.floor || "")))).filter(Boolean);
  let floor = String(input.floor || selectedElder?.floor || floors[0] || "");
  let floorElders = sortedElders.filter((elder) => String(elder.floor || "") === floor);

  if (!floorElders.length && floors.length) {
    floor = floors[0];
    floorElders = sortedElders.filter((elder) => String(elder.floor || "") === floor);
  }

  const rooms = Array.from(new Set(floorElders.map((elder) => String(elder.room || "")))).filter(Boolean);
  let room = String(input.room || selectedElder?.room || rooms[0] || "");
  let roomElders = floorElders.filter((elder) => String(elder.room || "") === room);

  if (!roomElders.length && rooms.length) {
    room = rooms[0];
    roomElders = floorElders.filter((elder) => String(elder.room || "") === room);
  }

  let elderId = input.elderId || "";
  if (!roomElders.some((elder) => elder.id === elderId)) {
    elderId = roomElders[0]?.id || "";
  }

  return {
    ...input,
    floor,
    room,
    elderId,
    timeMode: input.timeMode || "now",
    startTime: input.startTime || "",
    endTime: input.endTime || "",
    elderSearch: input.elderSearch || "",
    elderSearchOpen: Boolean(input.elderSearchOpen),
  };
}

function getPlanById(planId) {
  return state.elderCarePlans.find((plan) => plan.id === planId);
}

function getPlanByElderId(elderId) {
  return state.elderCarePlans.find((plan) => plan.elderId === elderId);
}

function getPlanByRoom(room) {
  const elder = getElderByRoom(room);
  return elder ? getPlanByElderId(elder.id) : null;
}

function getPlanItem(planId, planItemId) {
  const plan = getPlanById(planId);
  return plan ? plan.items.find((item) => item.id === planItemId) : null;
}

function getFloorOwner(floor) {
  return state.caregivers.find((item) => item.floor === floor) || state.caregivers[0];
}

function getDirectorPlanEldersByFloor(floor) {
  return state.elders.filter((elder) => elder.floor === floor).sort((left, right) => left.room.localeCompare(right.room));
}

function syncDirectorPlanSelection() {
  const floor = state.ui.selectedDirectorPlanFloor;
  const elders = getDirectorPlanEldersByFloor(floor);

  if (!elders.length) {
    state.ui.selectedDirectorPlanRoom = "";
    state.ui.directorPlanTimelineOpen = false;
    state.ui.directorPlanTimelineSettled = false;
    return;
  }

  const hasCurrentResident = elders.some((elder) => elder.id === state.ui.selectedDirectorPlanRoom);
  if (!hasCurrentResident) {
    state.ui.selectedDirectorPlanRoom = elders[0].id;
  }
}

function getActiveTab(route) {
  if (["home", "tasks", "room-select", "elder-detail", "task-detail", "caregiver-daily-report"].includes(route)) return "home";
  if (["history", "history-detail"].includes(route)) return "history";
  if (route === "profile") return "profile";

  if (["family-home", "family-health", "family-messages", "family-profile"].includes(route)) {
    return route;
  }

  if (["director-home", "director-floor-detail", "director-caregiver", "director-elder-timeline", "director-assignments", "director-inventory", "director-anomaly", "director-statistics", "director-care-records"].includes(route)) {
    return "director-home";
  }

  if (["director-template-library", "director-care-plans", "director-dispatch"].includes(route)) {
    return "director-care-plans";
  }

  if (route === "director-people") {
    return "director-people";
  }

  if (route === "director-profile") {
    return "director-profile";
  }

  return state.ui.activeTab || "home";
}

function setCurrentRoom(room) {
  const elder = state.elders.find((item) => item.room === room);
  if (!elder) return;

  state.ui.selectedRoom = room;
  state.ui.selectedFloor = elder.floor;
  state.ui.selectedElderId = elder.id;

  const elderTasks = sortTasksBySchedule(state.tasks.filter((task) => task.elderId === elder.id && task.caregiverId === state.caregiver.id));
  const pendingTask = pickCurrentTask(elderTasks);

  state.ui.selectedTaskId = (pendingTask || elderTasks[0] || {}).id || "";
}

function ensureCurrentSelections() {
  const currentSelectedElder = getElderById(state.ui.selectedElderId) || state.elders[0];

  if (currentSelectedElder) {
    state.ui.selectedElderId = currentSelectedElder.id;
    state.ui.selectedRoom = currentSelectedElder.room;
    state.ui.selectedFloor = currentSelectedElder.floor;
  }

  const caregiverTasks = state.tasks.filter((task) => task.caregiverId === state.caregiver.id);
  const elderTasks = currentSelectedElder ? sortTasksBySchedule(caregiverTasks.filter((task) => task.elderId === currentSelectedElder.id)) : [];

  if (!elderTasks.some((task) => task.id === state.ui.selectedTaskId)) {
    const replacementTask =
      pickCurrentTask(elderTasks) ||
      elderTasks[0] ||
      caregiverTasks.find((task) => task.status !== "completed") ||
      caregiverTasks[0];

    state.ui.selectedTaskId = replacementTask ? replacementTask.id : "";

    if (replacementTask) {
      const elder = getElderById(replacementTask.elderId);
      if (elder) {
        state.ui.selectedElderId = elder.id;
        state.ui.selectedRoom = elder.room;
        state.ui.selectedFloor = elder.floor;
      }
    }
  }

  if (state.ui.route === "task-detail" && !state.ui.selectedTaskId) {
    state.ui.route = "elder-detail";
  }

  syncDirectorPlanSelection();
}

function refreshDirectorOverview() {
  const overview = buildDirectorOverview({
    tasks: state.tasks,
    caregivers: state.caregivers,
    elders: state.elders,
  });

  state.director.attendance = overview.attendance;
  state.director.taskProgress = overview.taskProgress;
  state.director.floors = overview.floors;
  state.director.statistics = overview.statistics;
}

function syncCurrentCaregiverStatus(status) {
  state.caregiver.status = status;

  const currentCaregiver = state.caregivers.find((item) => item.id === state.caregiver.id);
  if (currentCaregiver) {
    currentCaregiver.status = status;
  }

  refreshDirectorOverview();
}

function rebuildTasks() {
  const previousTemporaryTasks = state.tasks.filter(
    (task) =>
      task.source === "temporary" ||
      task.assignmentMode === "temporary" ||
      task.templateGroup === "temporary" ||
      String(task.id || "").startsWith("temp-task-"),
  );
  state.tasks = buildTasksFromConfiguration({
    elderCarePlans: state.elderCarePlans,
    taskTemplates: state.taskTemplates,
    elders: state.elders,
    caregivers: state.caregivers,
    dailyReportTemplate: state.dailyReportTemplate,
    recordDate: state.director.date || formatNowDate(),
    previousTasks: state.tasks,
  });
  state.tasks = state.tasks.map((task) => {
    const plan = getPlanByElderId(task.elderId);
    return plan?.note ? { ...task, planNote: plan.note } : task;
  });
  previousTemporaryTasks.forEach((task) => {
    if (!state.tasks.some((item) => item.id === task.id)) {
      state.tasks.push(task);
    }
  });
  state.tasks = sortTasksBySchedule(state.tasks);
  refreshDirectorOverview();
  ensureCurrentSelections();
}

function getReportTemplateGeneratedTasks() {
  return state.tasks.filter((task) => task.source === "report-template" && task.caregiverId);
}

function getCurrentDailyReportTaskTemplateIds(template = state.dailyReportTemplate) {
  const ids = new Set();
  (template?.sections || []).forEach((section) => {
    (section.items || []).forEach((item) => {
      if (item?.id) ids.add(`daily-report:${item.id}`);
    });
  });
  return ids;
}

function shouldAcceptCloudTask(task = {}) {
  const templateId = String(task.templateId || "");
  const source = task.source || "";
  const assignmentMode = task.assignmentMode || "";
  const isReportTemplateTask =
    source === "report-template" ||
    assignmentMode === "report-template" ||
    templateId.startsWith("daily-report:");

  if (!isReportTemplateTask) return true;

  const elder = state.elders.find((item) => item.id === task.elderId);
  if (!elder) return false;

  const currentTemplateId = state.dailyReportTemplate?.id || "daily-report-basic";
  const hasReportTemplateAssignments = state.elders.some((item) => item.reportTemplateId);
  if (hasReportTemplateAssignments && elder.reportTemplateId !== currentTemplateId) {
    return false;
  }

  if (templateId.startsWith("daily-report:") && !getCurrentDailyReportTaskTemplateIds().has(templateId)) {
    return false;
  }

  return true;
}

async function publishReportTemplateGeneratedTasks() {
  if (!isCloudSyncConfigured()) {
    setCloudTasksError("云端任务接口未配置");
    return { ok: 0, failed: 0, skipped: getReportTemplateGeneratedTasks().length };
  }

  const tasks = getReportTemplateGeneratedTasks();
  if (!tasks.length) return { ok: 0, failed: 0, skipped: 0 };

  const results = await Promise.allSettled(
    tasks.map(async (task) => {
      const response = await uploadPublishedTask(serializeCloudTask(task));
      return response?.item || response?.task || serializeCloudTask(task);
    }),
  );

  let ok = 0;
  let failed = 0;
  results.forEach((result) => {
    if (result.status === "fulfilled") {
      ok += 1;
      mergeCloudTask(result.value);
    } else {
      failed += 1;
    }
  });

  setCloudTasksFetchedAt(`${formatNowDate()} ${formatNowTime()}`);
  setCloudTasksError(failed ? "部分日报任务云端同步失败" : "");
  refreshDirectorOverview();
  ensureCurrentSelections();
  return { ok, failed, skipped: 0 };
}

async function syncCaregiverTaskToCloud(task, failureMessage = "任务云端同步失败") {
  if (!task || !isCloudSyncConfigured()) return false;

  try {
    const response = await uploadPublishedTask(serializeCloudTask(task, "caregiver-app"));
    const cloudTask = response?.item || response?.task || serializeCloudTask(task, "caregiver-app");
    mergeCloudTask(cloudTask);
    setCloudTasksFetchedAt(response?.fetchedAt || `${formatNowDate()} ${formatNowTime()}`);
    setCloudTasksError("");
    refreshDirectorOverview();
    ensureCurrentSelections();
    return true;
  } catch (error) {
    setCloudTasksError(error?.message || failureMessage);
    return false;
  }
}

function appendHistoryRecord(task, status, details, exception = "") {
  const elder = getElderById(task.elderId);
  if (!elder) return;

  state.history.unshift({
    id: `history-${Date.now()}`,
    time: `${formatNowDate()} ${formatNowTime()}`,
    elderId: elder.id,
    elder: elder.name,
    room: elder.room,
    task: task.title,
    caregiver: getCaregiverById(task.caregiverId)?.name || state.caregiver.name,
    status,
    photoLabel: task.requirePhoto ? "护理留痕" : "记录留痕",
    details,
    steps: [
      `进入房间 (${formatNowTime()})`,
      `执行护理 (${formatNowTime()})`,
      `完成记录 (${formatNowTime()})`,
    ],
    exception,
  });
}

function addAnomaly(task, type, note) {
  state.anomalies.unshift({
    id: `anomaly-${Date.now()}`,
    type,
    level: "high",
    elderId: task.elderId,
    time: formatNowTime(),
    status: "已同步院长端",
    note,
  });
}

function addQuickAnomaly(elder, note) {
  if (!elder) return;
  state.anomalies.unshift({
    id: `anomaly-${Date.now()}`,
    type: "快速异常上报",
    level: "high",
    elderId: elder.id,
    time: formatNowTime(),
    status: "已同步院长端",
    note,
  });
}

function appendQuickExceptionHistory(elder, note) {
  if (!elder) return;
  state.history.unshift({
    id: `history-${Date.now()}`,
    time: `${formatNowDate()} ${formatNowTime()}`,
    elderId: elder.id,
    elder: elder.name,
    room: elder.room,
    task: "快速异常上报",
    caregiver: state.caregiver.name,
    status: "异常",
    photoLabel: "异常留痕",
    details: note || "发现老人状态异常，已快速上报并留痕。",
    steps: [`发现异常 (${formatNowTime()})`, `快速上报 (${formatNowTime()})`, `等待院方处理 (${formatNowTime()})`],
    exception: note || "快速异常上报。",
  });
}

function normalizeEvidenceItem(evidence) {
  if (!evidence) return null;
  if (typeof evidence === "string") {
    return { name: evidence, dataUrl: "", capturedAt: "" };
  }
  return {
    name: String(evidence.name || "护理留痕照片"),
    dataUrl: String(evidence.dataUrl || ""),
    capturedAt: String(evidence.capturedAt || ""),
  };
}

function normalizeEvidenceList(evidence) {
  if (!evidence) return [];
  const source = Array.isArray(evidence) ? evidence : [evidence];
  return source.map(normalizeEvidenceItem).filter(Boolean);
}

function matchHistoryTimeFilter(item) {
  const filter = state.ui.historyFilter.time;
  if (filter === "全部") return true;

  const itemDate = new Date(item.time.replace(" ", "T"));
  if (Number.isNaN(itemDate.getTime())) return true;

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfWeek.getDate() - 6);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  if (filter === "今日") return itemDate >= startOfToday;
  if (filter === "昨日") return itemDate >= startOfYesterday && itemDate < startOfToday;
  if (filter === "本周") return itemDate >= startOfWeek;
  if (filter === "本月") return itemDate >= startOfMonth;

  return true;
}

function getTaskAssignmentLabel(task) {
  if (!task.caregiverId) {
    return { text: "待分配", tone: "warning" };
  }

  if (task.assignmentMode === "manual" && !task.defaultCaregiverId) {
    return { text: "院长发布", tone: "warning" };
  }

  if (task.assignmentMode === "report-template" || task.source === "report-template") {
    return { text: "日常任务", tone: "success" };
  }

  if (task.assignmentMode === "temporary" || task.source === "temporary" || task.templateGroup === "temporary") {
    return { text: "院长发布", tone: "warning" };
  }

  if (task.defaultCaregiverId && task.caregiverId !== task.defaultCaregiverId) {
    return { text: "院长调整", tone: "warning" };
  }

  return { text: "方案默认", tone: "success" };
}

function getTaskSourceLabel(task) {
  if (!task.caregiverId) return "待分配";
  if (task.assignmentMode === "report-template" || task.source === "report-template") return "日报生成";
  if (task.assignmentMode === "temporary" || task.source === "temporary" || task.templateGroup === "temporary") return "临时发布";
  if (task.assignmentStatus === "published") return "院长已发布";
  if (task.assignmentMode === "manual") return "院长直派";
  if (task.defaultCaregiverId && task.caregiverId !== task.defaultCaregiverId) return "临时调整";
  return "方案生成";
}

function getTaskReceiptLabel(task) {
  if (!task.caregiverId) return { text: "未分配", tone: "warning" };
  return { text: "已发布", tone: "success" };
}

function enrichTask(task) {
  const elder = getElderById(task.elderId);
  const template = getTemplateById(task.templateId);
  const caregiver = getCaregiverById(task.caregiverId);
  const defaultCaregiver = getCaregiverById(task.defaultCaregiverId);
  const assignment = getTaskAssignmentLabel(task);
  const receipt = getTaskReceiptLabel(task);

  return {
    ...task,
    elder,
    template,
    caregiver,
    defaultCaregiver,
    assignmentLabel: assignment.text,
    assignmentTone: assignment.tone,
    receiptLabel: receipt.text,
    receiptTone: receipt.tone,
    sourceLabel: getTaskSourceLabel(task),
    recordLabel: task.requirePhoto ? "需拍照" : "文字记录",
  };
}

function buildDirectorTaskOverview(tasks = state.tasks) {
  const dailyTasks = tasks.filter((task) => !isTemporaryTask(task));
  const temporaryTasks = tasks.filter(isTemporaryTask);
  const now = currentClockMinutes();
  const actualHandled = dailyTasks.filter(isHandledTask).length;
  const expectedDue = countExpectedDueTasks(dailyTasks, now, actualHandled);
  const temporaryHandled = temporaryTasks.filter(isHandledTask).length;
  const exceptionCount = tasks.filter((task) => task.status === "risk" || task.status === "refused").length;

  return {
    total: tasks.length,
    dailyTotal: dailyTasks.length,
    expectedDue,
    expectedRate: percentLabel(expectedDue, dailyTasks.length),
    expectedPercent: percentNumber(expectedDue, dailyTasks.length),
    actualHandled,
    actualRate: percentLabel(actualHandled, dailyTasks.length),
    actualPercent: percentNumber(actualHandled, dailyTasks.length),
    temporaryTotal: temporaryTasks.length,
    temporaryHandled,
    temporaryRate: percentLabel(temporaryHandled, temporaryTasks.length),
    temporaryPercent: percentNumber(temporaryHandled, temporaryTasks.length),
    exceptionCount,
    nowLabel: formatNowTime(),
  };
}

function buildDirectorCaregiverStatistics(tasks = state.tasks) {
  const now = currentClockMinutes();

  return state.caregivers.map((caregiver) => {
    const assigned = sortTasksBySchedule(tasks.filter((task) => task.caregiverId === caregiver.id)).map(enrichTask);
    const activeTasks = assigned.filter((task) => {
      const start = scheduleToMinutes(task.schedule);
      const end = taskEndMinutes(task);
      return !isHandledTask(task) && start <= now && now <= end;
    });
    const overdueTasks = assigned.filter((task) => !isHandledTask(task) && taskEndMinutes(task) < now);
    const nextTask =
      activeTasks[0] ||
      assigned.find((task) => !isHandledTask(task) && scheduleToMinutes(task.schedule) >= now) ||
      assigned.find((task) => !isHandledTask(task)) ||
      null;
    const handled = assigned.filter(isHandledTask).length;

    return {
      id: caregiver.id,
      name: caregiver.name,
      role: caregiver.role || "护工",
      floor: caregiver.floor,
      assignedCount: assigned.length,
      handledCount: handled,
      progressRate: percentLabel(handled, assigned.length),
      tone: overdueTasks.length ? "warning" : "success",
      statusLabel: overdueTasks.length ? `超时 ${overdueTasks.length}` : activeTasks.length ? `进行中 ${activeTasks.length}` : "按时",
      currentTasks: activeTasks,
      overdueTasks,
      nextTask,
    };
  });
}

function buildDirectorFloorCaregiverProgress(floor, tasks = state.tasks) {
  const floorNumber = Number.parseInt(floor, 10) || 1;
  const selectedDate = state.ui.directorAuditDate || state.director.date || formatNowDate();
  const isToday = selectedDate === state.director.date || selectedDate === formatNowDate();
  const nowLimit = isToday ? currentClockMinutes() : 24 * 60;

  return state.caregivers
    .filter((caregiver) => Number(caregiver.floor) === floorNumber)
    .map((caregiver) => {
      const assigned = tasks.filter((task) => {
        const elder = getElderById(task.elderId);
        return task.caregiverId === caregiver.id && elder?.floor === floorNumber;
      });
      const handled = assigned.filter(isHandledTask).length;
      const expectedDue = countExpectedDueTasks(assigned, nowLimit, handled);

      return {
        id: caregiver.id,
        name: caregiver.name,
        role: caregiver.role || "护工",
        total: assigned.length,
        expectedDue,
        expectedRate: percentLabel(expectedDue, assigned.length),
        expectedPercent: percentNumber(expectedDue, assigned.length),
        handled,
        actualRate: percentLabel(handled, assigned.length),
        actualPercent: percentNumber(handled, assigned.length),
      };
    });
}

function buildDirectorExceptionReports(tasks = state.tasks, opts = {}) {
  const saved = state.ui.taskExceptionSaved || {};
  const notes = state.ui.taskExceptionNotes || {};
  const evidence = state.ui.taskExceptionEvidence || {};
  const readIds = new Set(state.ui.directorReadExceptionIds || []);

  return sortTasksBySchedule(tasks)
    .filter(
      (task) => {
        const isException =
          task.status === "risk" ||
          task.status === "refused" ||
          saved[task.id] ||
          notes[task.id] ||
          evidence[task.id] ||
          task.exception ||
          task.exceptionNote ||
          normalizeEvidenceList(task.exceptionEvidence).length > 0;
        if (!isException) return false;
        if (opts.readOnly) return readIds.has(task.id);
        return !readIds.has(task.id);
      },
    )
    .map((task) => {
      const enriched = enrichTask(task);
      return {
        id: task.id,
        title: task.title,
        schedule: task.schedule,
        window: task.window || task.schedule,
        status: task.status,
        statusLabel: task.status === "refused" ? "不配合" : "异常",
        elderName: enriched.elder?.name || "未知老人",
        room: enriched.elder?.room || "--",
        floor: enriched.elder?.floor || "--",
        caregiverName: enriched.caregiver?.name || "未分配护工",
        note: notes[task.id] || task.exceptionNote || task.exception || task.note || "未填写文字说明",
        evidence: normalizeEvidenceList(evidence[task.id] || task.exceptionEvidence || task.evidence || task.photos || []).slice(0, 6),
        reportedAt: task.exceptionReportedAt || "",
      };
    });
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const actions = {
  toggleLoginMenu() {
    state.ui.loginMenuOpen = !state.ui.loginMenuOpen;
    notify();
  },
  closeLoginMenu() {
    state.ui.loginMenuOpen = false;
    notify();
  },
  tickClock() {
    notify();
  },
  openAppInfoDialog(kind = "about") {
    state.ui.loginMenuOpen = false;
    state.ui.appInfoDialog = kind;
    notify();
  },
  closeAppInfoDialog() {
    state.ui.appInfoDialog = "";
    notify();
  },
  closeAppUpdateDialog() {
    state.ui.appUpdate.open = false;
    state.ui.appUpdate.status = "idle";
    state.ui.appUpdate.message = "";
    state.ui.appUpdate.progress = 0;
    notify();
  },
  async checkAppUpdate() {
    const runtime = readAppRuntimeInfo();
    const currentVersionCode = Number(runtime.versionCode || 0);

    state.ui.loginMenuOpen = false;
    setAppUpdateState({
      open: true,
      status: "checking",
      message: "正在连接云端检查版本",
      progress: 0,
      release: null,
    });
    notify();

    try {
      const response = await fetchLatestAppRelease({
        platform: "android",
        channel: "stable",
        currentVersionCode,
      });
      const release = normalizeUpdateRelease(response?.item);
      const updateAvailable =
        Boolean(response?.updateAvailable) ||
        Boolean(release && release.versionCode > currentVersionCode);

      if (updateAvailable && release) {
        setAppUpdateState({
          open: true,
          status: "available",
          message: `发现新版本 ${release.versionName || release.versionCode}`,
          progress: 0,
          release,
        });
      } else {
        setAppUpdateState({
          open: true,
          status: "latest",
          message: "当前已是最新版本",
          progress: 0,
          release: null,
        });
      }
    } catch (error) {
      setAppUpdateState({
        open: true,
        status: "error",
        message: error?.message || "检查更新失败",
        progress: 0,
        release: null,
      });
    }

    notify();
  },
  downloadAppUpdate() {
    const release = state.ui.appUpdate.release;
    if (!release) {
      setAppUpdateState({ open: true, status: "error", message: "没有可下载的新版本" });
      notify();
      return;
    }

    if (!window.AndroidBridge || typeof window.AndroidBridge.downloadAndInstallUpdate !== "function") {
      setAppUpdateState({
        open: true,
        status: "error",
        message: "当前环境不支持自动安装，请在手机 APK 内操作",
      });
      notify();
      return;
    }

    setAppUpdateState({
      open: true,
      status: "downloading",
      message: "正在下载更新包",
      progress: 0,
    });
    notify();
    window.AndroidBridge.downloadAndInstallUpdate(JSON.stringify(release));
  },
  handleAppUpdateStatus(payload = {}) {
    const type = payload.type || payload.status || "idle";
    const nextStatus =
      type === "progress"
        ? "downloading"
        : type === "installing"
          ? "installing"
          : type === "error"
            ? "error"
            : type === "done"
              ? "installing"
              : state.ui.appUpdate.status;

    setAppUpdateState({
      open: true,
      status: nextStatus,
      message: payload.message || state.ui.appUpdate.message || "",
      progress: Number(payload.progress || state.ui.appUpdate.progress || 0),
    });
    notify();
  },
  async persistInstitutionSharedState(options = {}) {
    if (!isCloudSyncConfigured()) {
      if (!options.silent) touchToast("云端接口未配置，人员信息仅保存在本机");
      return false;
    }

    const snapshot = buildInstitutionStateSnapshot();
    try {
      const response = await uploadInstitutionState(snapshot);
      const applied = normalizeInstitutionStateSnapshot(response);
      state.cloud.institutionStateFetchedAt = applied?.updatedAt || response?.fetchedAt || snapshot.updatedAt;
      state.cloud.institutionStateError = "";
      if (!options.silent) touchToast("整院共享数据已同步云端");
      return true;
    } catch (error) {
      state.cloud.institutionStateError = error?.message || "整院共享数据同步失败";
      if (!options.silent) touchToast(state.cloud.institutionStateError);
      return false;
    }
  },
  async refreshInstitutionSharedState(options = {}) {
    if (!isCloudSyncConfigured()) return false;
    if (options.silent && (isReportTemplateWorkspaceOpen() || state.ui.directorPersonnelDraft || state.ui.directorDispatchDraft)) {
      return false;
    }

    try {
      const response = await fetchInstitutionState({ institutionId: state.institution.id });
      const changed = applyInstitutionStateSnapshot(response);
      state.cloud.institutionStateFetchedAt = response?.fetchedAt || state.cloud.institutionStateFetchedAt || "";
      state.cloud.institutionStateError = "";
      if (changed && !options.silent) {
        touchToast("整院共享数据已刷新");
      } else if (changed) {
        notify();
      }
      return changed;
    } catch (error) {
      state.cloud.institutionStateError = error?.message || "整院共享数据拉取失败";
      if (!options.silent) {
        touchToast(state.cloud.institutionStateError);
      }
      return false;
    }
  },
  enterCaregiver() {
    state.ui.loginMenuOpen = false;
    state.ui.appInfoDialog = "";
    state.ui.appUpdate.open = false;
    state.session.identity = "caregiver";
    state.session.loggedIn = false;
    state.ui.route = "attendance";
    state.ui.activeTab = "home";
    notify();
    actions.refreshInstitutionSharedState({ silent: true });
  },
  enterFamily() {
    state.ui.loginMenuOpen = false;
    state.ui.appInfoDialog = "";
    state.ui.appUpdate.open = false;
    state.session.identity = "family";
    state.session.loggedIn = true;
    state.ui.route = "family-home";
    state.ui.activeTab = "family-home";
    notify();
  },
  enterDirector() {
    state.ui.loginMenuOpen = false;
    state.ui.appInfoDialog = "";
    state.ui.appUpdate.open = false;
    state.session.identity = "director";
    state.session.loggedIn = true;
    state.ui.route = "director-home";
    state.ui.activeTab = "director-home";
    notify();
    actions.loadDirectorInitialData();
  },
  async loadDirectorInitialData() {
    state._holdNotify = true;
    try {
      state.ui.syncPhase = "正在同步日报模板与人员数据...";
      const el = document.getElementById("sync-status");
      if (el) el.textContent = state.ui.syncPhase;

      await Promise.all([
        actions.refreshDailyReportTemplate({ silent: true }),
        actions.refreshInstitutionSharedState({ silent: true }),
      ]);
      if (state.cloud.institutionStateFetchedAt) {
        state.ui.syncPhase = "正在同步护理任务...";
        if (el) el.textContent = state.ui.syncPhase;
        await actions.refreshDirectorCloudTasks({ silent: true });
      }
    } finally {
      state._holdNotify = false;
      notify();
      state.ui.syncPhase = "";
    }
  },
  async login(institutionId, username, password) {
    const result = await requestJson("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ institutionId, username, password }),
    });
    if (!result || result.status !== "success") {
      throw new Error((result && result.detail) || "登录失败");
    }
    setAuthToken(result.token);
    state.session.token = result.token;
    state.session.user = result.user;
    state.session.identity = result.user.role;
    state.session.loggedIn = true;
    state.ui.loginMenuOpen = false;
    state.ui.appInfoDialog = "";
    state.ui.appUpdate.open = false;

    const role = result.user.role;
    if (role === "caregiver") {
      state.ui.route = "attendance";
      state.ui.activeTab = "home";
      notify();
      actions.refreshInstitutionSharedState({ silent: true });
    } else if (role === "family") {
      state.ui.route = "family-home";
      state.ui.activeTab = "family-home";
      notify();
    } else if (role === "director") {
      state.ui.route = "director-home";
      state.ui.activeTab = "director-home";
      notify();
      actions.loadDirectorInitialData();
    } else if (role === "admin" || role === "superadmin") {
      state.ui.route = "director-home";
      state.ui.activeTab = "director-home";
      notify();
      touchToast("管理员登录成功");
      actions.loadDirectorInitialData();
    }
  },
  clockIn() {
    state.session.loggedIn = true;
    state.session.clockInAt = formatNowTime();
    state.ui.route = "home";
    state.ui.activeTab = "home";
    touchToast(`上班打卡成功 ${state.session.clockInAt}`);
    actions.refreshInstitutionSharedState({ silent: true });
  },
  async logout() {
    try { await requestJson("/api/auth/logout", { method: "POST" }); } catch (_) {}
    setAuthToken("");
    state.session.token = "";
    state.session.user = null;
    state.session.identity = "";
    state.session.loggedIn = false;
    state.session.clockInAt = "";
    state.session.clockOutAt = "";
    state.ui.route = "login";
    state.ui.activeTab = "home";
    state.ui.batchPanelOpen = false;
    state.ui.batchExceptionPrompt = null;
    state.ui.taskRecordEvidence = {};
    state.ui.taskExceptionEvidence = {};
    state.ui.quickExceptionEvidence = {};
    state.ui.taskRecordNotes = {};
    state.ui.taskExceptionNotes = {};
    state.ui.quickExceptionNotes = {};
    state.ui.taskRecordDialog = null;
    state.ui.taskExceptionSaved = {};
    state.ui.quickExceptionSaved = {};
    state.ui.caregiverTimelineFullscreen = false;
    state.ui.directorCareRecordPreviewOpen = false;
    state.ui.directorCareRecordBatchDate = "";
    state.ui.directorInboxExportDate = "";
    state.ui.selectedCaregiverReportElderId = "";
    state.ui.caregiverDailyReportDraft = null;
    state.ui.pendingCareRecordAction = "";
    state.ui.loginMenuOpen = false;
    state.ui.appInfoDialog = "";
    state.ui.appUpdate.open = false;
    touchToast("已退出登录");
  },
  navigate(route) {
    state.ui.route = route;
    state.ui.activeTab = getActiveTab(route);
    if (route !== "director-care-plans") {
      state.ui.directorPlanTimelineOpen = false;
      state.ui.directorPlanTimelineSettled = false;
    }
    if (route !== "director-care-records") {
      state.ui.directorCareRecordPreviewOpen = false;
      state.ui.directorCareRecordBatchDate = "";
      state.ui.directorInboxExportDate = "";
      state.ui.pendingCareRecordAction = "";
    }
    notify();
  },
  chooseFloor(value) {
    state.ui.selectedFloor = Number.parseInt(value, 10) || 1;
    state.ui.route = "room-select";
    state.ui.activeTab = "home";
    notify();
  },
  chooseRoom(room) {
    setCurrentRoom(room);
    state.ui.route = "elder-detail";
    state.ui.activeTab = "home";
    notify();
  },
  openCaregiverDailyReport(elderId) {
    const elder = getElderById(elderId);
    if (!elder) return;

    const existingReport = findDailyReport(elder.id);
    state.ui.selectedCaregiverReportElderId = elder.id;
    state.ui.caregiverDailyReportDraft = buildCaregiverDailyReportDraft(elder.id, existingReport);
    state.ui.route = "caregiver-daily-report";
    state.ui.activeTab = "home";
    notify();
    actions.refreshDailyReportTemplate({ silent: true });
  },
  openBatchPanel() {
    if (state.session.identity !== "caregiver") return;
    state.ui.batchPanelOpen = true;
    notify();
  },
  closeBatchPanel() {
    state.ui.batchPanelOpen = false;
    notify();
  },
  completeBatch(key) {
    const job = state.batchJobs.find((item) => item.key === key);
    if (!job) return;

    job.completed = true;
    job.completedAt = formatNowTime();
    state.ui.batchPanelOpen = false;
    state.ui.batchExceptionPrompt = {
      floor: state.ui.selectedFloor,
      jobKey: job.key,
      jobTitle: job.title,
      total: job.total,
      completedAt: job.completedAt,
    };
    touchToast(`${job.title}已批量记录，可补充异常/不配合`);
  },
  openBatchExceptionReview() {
    state.ui.route = "room-select";
    state.ui.activeTab = "home";
    state.ui.batchPanelOpen = false;
    touchToast("请选择本层老人，补充异常或不配合留痕");
    notify();
  },
  selectTask(taskId) {
    const task = getTaskById(taskId);
    if (!task) return;
    if (task.caregiverId !== state.caregiver.id) {
      touchToast("只能查看分配给自己的任务");
      return;
    }

    state.ui.selectedTaskId = taskId;
    const elder = getElderById(task.elderId);
    if (elder) {
      state.ui.selectedElderId = elder.id;
      state.ui.selectedRoom = elder.room;
      state.ui.selectedFloor = elder.floor;
    }
    state.ui.route = "task-detail";
    state.ui.activeTab = "home";
    notify();
  },
  focusTask(taskId) {
    const task = getTaskById(taskId);
    if (!task) return;
    if (task.caregiverId !== state.caregiver.id) {
      touchToast("只能查看分配给自己的任务");
      return;
    }

    state.ui.selectedTaskId = taskId;
    const elder = getElderById(task.elderId);
    if (elder) {
      state.ui.selectedElderId = elder.id;
      state.ui.selectedRoom = elder.room;
      state.ui.selectedFloor = elder.floor;
    }
    notify();
  },
  setTaskEvidence(target, evidence) {
    const targetMeta = typeof target === "object" && target ? target : { taskId: target, kind: "record" };
    const kind = targetMeta.kind === "exception" || targetMeta.kind === "quick" ? targetMeta.kind : "record";
    const key = kind === "quick" ? targetMeta.elderId : targetMeta.taskId;
    if (!key) return;

    if (kind === "quick") {
      const elder = getElderById(key);
      if (!elder) return;
    } else {
      const task = getTaskById(key);
      if (!task || task.caregiverId !== state.caregiver.id) {
        touchToast("只能给自己的任务添加留痕");
        return;
      }
    }

    const storeKey =
      kind === "quick" ? "quickExceptionEvidence" : kind === "exception" ? "taskExceptionEvidence" : "taskRecordEvidence";
    state.ui[storeKey] = state.ui[storeKey] || {};
    if (!evidence) {
      touchToast("已取消拍照");
      return;
    }

    const currentList = normalizeEvidenceList(state.ui[storeKey][key]);
    if (currentList.length >= 6) {
      touchToast("最多保留6张照片");
      return;
    }

    const nextEvidence = normalizeEvidenceItem(
      typeof evidence === "string"
        ? { name: evidence, dataUrl: "", capturedAt: formatNowTime() }
        : {
            name: evidence.name || "护理留痕照片",
            dataUrl: evidence.dataUrl || "",
            capturedAt: evidence.capturedAt || formatNowTime(),
          },
    );
    state.ui[storeKey][key] = [...currentList, nextEvidence].slice(0, 6);
    if (kind === "exception") {
      const task = getTaskById(key);
      if (task) {
        task.exceptionEvidence = normalizeEvidenceList(state.ui[storeKey][key]);
        if (task.status === "risk" || task.status === "refused" || task.exception || task.exceptionNote) {
          syncCaregiverTaskToCloud(task, "异常照片云端同步失败").catch(() => {});
        }
      }
    }
    if (kind === "quick") {
      const quickTask = state.tasks.find(
        (t) => t.elderId === key && t.source === "quick-exception" && t.status === "risk",
      );
      if (quickTask) {
        quickTask.exceptionEvidence = normalizeEvidenceList(state.ui[storeKey][key]);
        syncCaregiverTaskToCloud(quickTask, "快速异常照片云端同步失败").catch(() => {});
      }
    }
    touchToast(kind === "exception" || kind === "quick" ? "异常照片已保存" : "照片已保存到记录");
  },
  deleteTaskEvidence(target) {
    const targetMeta = typeof target === "object" && target ? target : { taskId: target, kind: "record" };
    const kind = targetMeta.kind === "exception" || targetMeta.kind === "quick" ? targetMeta.kind : "record";
    const key = kind === "quick" ? targetMeta.elderId : targetMeta.taskId;
    const storeKey =
      kind === "quick" ? "quickExceptionEvidence" : kind === "exception" ? "taskExceptionEvidence" : "taskRecordEvidence";
    if (!key || !state.ui[storeKey]?.[key]) return;
    const currentList = normalizeEvidenceList(state.ui[storeKey][key]);
    const index = Number.parseInt(targetMeta.index, 10);
    if (Number.isInteger(index) && index >= 0) {
      currentList.splice(index, 1);
    } else {
      currentList.length = 0;
    }
    if (currentList.length) {
      state.ui[storeKey][key] = currentList;
    } else {
      delete state.ui[storeKey][key];
    }
    if (state.ui.taskRecordDialog) {
      state.ui.taskRecordDialog.previewIndex = null;
    }
    if (kind === "exception") {
      const task = getTaskById(key);
      if (task) {
        task.exceptionEvidence = normalizeEvidenceList(state.ui[storeKey]?.[key]);
        if (task.status === "risk" || task.status === "refused" || task.exception || task.exceptionNote) {
          syncCaregiverTaskToCloud(task, "异常照片云端同步失败").catch(() => {});
        }
      }
    }
    touchToast("照片已删除");
  },
  openTaskEvidencePreview(target, index) {
    if (!state.ui.taskRecordDialog) return;
    const targetMeta = typeof target === "object" && target ? target : { taskId: target, kind: "record" };
    state.ui.taskRecordDialog.previewTarget = targetMeta;
    state.ui.taskRecordDialog.previewIndex = Number.parseInt(index, 10) || 0;
    notify();
  },
  closeTaskEvidencePreview() {
    if (!state.ui.taskRecordDialog) return;
    state.ui.taskRecordDialog.previewIndex = null;
    notify();
  },
  openTaskRecordDialog(taskId) {
    const task = getTaskById(taskId);
    if (!task) return;
    if (task.caregiverId !== state.caregiver.id) {
      touchToast("只能处理分配给自己的任务");
      return;
    }
    state.ui.taskRecordDialog = {
      taskId,
      type: "record",
      note: state.ui.taskRecordNotes?.[taskId] || state.ui.taskNotes?.[taskId] || "",
    };
    notify();
  },
  openTaskExceptionDialog(taskId) {
    const task = getTaskById(taskId);
    if (!task) return;
    if (task.caregiverId !== state.caregiver.id) {
      touchToast("只能处理分配给自己的任务");
      return;
    }
    state.ui.taskRecordDialog = {
      taskId,
      type: "exception",
      note: state.ui.taskExceptionNotes?.[taskId] || task.exceptionNote || task.exception || "",
    };
    notify();
  },
  openQuickExceptionDialog(elderId) {
    const elder = getElderById(elderId);
    if (!elder) return;
    state.ui.taskRecordDialog = {
      elderId,
      type: "quick",
      note: state.ui.quickExceptionNotes?.[elderId] || "",
    };
    notify();
  },
  updateTaskRecordDialogNote(note) {
    if (!state.ui.taskRecordDialog) return;
    state.ui.taskRecordDialog.note = note;
  },
  closeTaskRecordDialog() {
    state.ui.taskRecordDialog = null;
    notify();
  },
  async saveTaskRecordDialog(payload = {}) {
    const dialog = state.ui.taskRecordDialog;
    if (!dialog) return;

    if (dialog.type === "quick") {
      const elder = getElderById(dialog.elderId);
      if (!elder) {
        state.ui.taskRecordDialog = null;
        notify();
        return;
      }
      const note = String(payload.note ?? dialog.note ?? "").trim();
      state.ui.quickExceptionNotes = state.ui.quickExceptionNotes || {};
      state.ui.quickExceptionSaved = state.ui.quickExceptionSaved || {};
      state.ui.quickExceptionNotes[elder.id] = note;
      if (!state.ui.quickExceptionSaved[elder.id]) {
        addQuickAnomaly(elder, note || `${elder.name}出现异常，已快速上报。`);
        appendQuickExceptionHistory(elder, note || "快速异常上报已留痕。");
        state.ui.quickExceptionSaved[elder.id] = true;
        const quickTaskId = `quick-exception-${Date.now()}`;
        const quickEvidence = normalizeEvidenceList(state.ui.quickExceptionEvidence?.[elder.id]);
        const quickTask = {
          id: quickTaskId,
          planItemId: quickTaskId,
          elderId: elder.id,
          caregiverId: state.caregiver.id,
          title: `快速异常：${elder.name}`,
          schedule: formatNowTime(),
          window: formatNowTime(),
          status: "risk",
          source: "quick-exception",
          assignmentMode: "temporary",
          exception: note || `${elder.name}出现异常，已快速上报。`,
          exceptionNote: note || `${elder.name}出现异常，已快速上报。`,
          exceptionType: "快速异常上报",
          exceptionReportedAt: `${formatNowDate()} ${formatNowTime()}`,
          exceptionEvidence: quickEvidence,
          requirePhoto: false,
          templateId: "",
          publishedAt: `${formatNowDate()} ${formatNowTime()}`,
        };
        state.tasks.push(quickTask);
        refreshDirectorOverview();
        syncCaregiverTaskToCloud(quickTask, "快速异常云端同步失败").catch(() => {});
      }
      state.ui.taskRecordDialog = null;
      notify();
      touchToast("快速异常已同步院长端");
      return;
    }

    const task = getTaskById(dialog.taskId);
    if (!task) {
      state.ui.taskRecordDialog = null;
      notify();
      return;
    }
    if (task.caregiverId !== state.caregiver.id) {
      touchToast("只能处理分配给自己的任务");
      return;
    }

    const note = String(payload.note ?? dialog.note ?? "").trim();
    state.ui.taskRecordNotes = state.ui.taskRecordNotes || {};
    state.ui.taskExceptionNotes = state.ui.taskExceptionNotes || {};
    state.ui.taskExceptionSaved = state.ui.taskExceptionSaved || {};
    if (dialog.type === "exception") {
      state.ui.taskExceptionNotes[task.id] = note;
      const exceptionEvidence = normalizeEvidenceList(state.ui.taskExceptionEvidence?.[task.id]);
      task.status = "risk";
      task.exception = note || "异常情况已记录。";
      task.exceptionNote = task.exception;
      task.exceptionType = "异常情况";
      task.exceptionReportedAt = `${formatNowDate()} ${formatNowTime()}`;
      task.exceptionEvidence = exceptionEvidence;
      if (!state.ui.taskExceptionSaved[task.id]) {
        addAnomaly(task, "异常情况", note || `${task.title}执行中发现异常，已同步上报。`);
        appendHistoryRecord(task, "异常", note || "护理过程中发现异常情况，已同步上报。", "异常情况已记录。");
        state.ui.taskExceptionSaved[task.id] = true;
      }
      refreshDirectorOverview();
      state.ui.taskRecordDialog = null;
      notify();
      const synced = await syncCaregiverTaskToCloud(task, "异常任务云端同步失败");
      touchToast(synced ? "异常已同步院长端" : "异常已本机保存，云端同步失败");
      return;
    }

    state.ui.taskRecordNotes[task.id] = note;
    task.recordNote = note;
    task.recordUpdatedAt = `${formatNowDate()} ${formatNowTime()}`;
    appendHistoryRecord(task, "记录", note || `${task.title}已补充文字记录。`);
    state.ui.taskRecordDialog = null;
    touchToast("记录已保存");
  },
  completeTask(taskId) {
    const task = getTaskById(taskId);
    if (!task) return;
    if (task.caregiverId !== state.caregiver.id) {
      touchToast("只能处理分配给自己的任务");
      return;
    }
    if (task.status === "completed") {
      task.status = "pending";
      refreshDirectorOverview();
      syncCaregiverTaskToCloud(task, "任务取消打卡云端同步失败").catch(() => {});
      touchToast("已取消打卡");
      return;
    }
    const recordEvidence = normalizeEvidenceList(state.ui.taskRecordEvidence?.[taskId] || state.ui.taskEvidence?.[taskId]);
    if (task.requirePhoto && !recordEvidence.length) {
      touchToast("请先拍照或选择留痕图片");
      return;
    }

    task.status = "completed";
    task.completedAt = `${formatNowDate()} ${formatNowTime()}`;
    task.recordNote = state.ui.taskRecordNotes?.[taskId] || state.ui.taskNotes?.[taskId] || "";
    task.recordEvidence = recordEvidence;
    appendHistoryRecord(task, "已完成", state.ui.taskRecordNotes?.[taskId] || state.ui.taskNotes?.[taskId] || `${task.title}已完成，并已留痕记录。`);
    refreshDirectorOverview();
    syncCaregiverTaskToCloud(task, "任务完成状态云端同步失败").catch(() => {});
    touchToast("打卡记录成功");
  },
  openCaregiverTimelineFullscreen() {
    state.ui.caregiverTimelineFullscreen = true;
    notify();
  },
  closeCaregiverTimelineFullscreen() {
    state.ui.caregiverTimelineFullscreen = false;
    notify();
  },
  markTaskException(taskId, type) {
    const task = getTaskById(taskId);
    if (!task) return;
    if (task.caregiverId !== state.caregiver.id) {
      touchToast("只能处理分配给自己的任务");
      return;
    }
    if (type === "risk") {
      actions.openTaskExceptionDialog(taskId);
      return;
    }
    if (type === "refused") {
      task.status = "refused";
      task.exception = "老人情绪波动，暂时拒绝配合护理。";
      task.exceptionNote = task.exception;
      task.exceptionType = "老人不配合";
      task.exceptionReportedAt = `${formatNowDate()} ${formatNowTime()}`;
      task.exceptionEvidence = normalizeEvidenceList(state.ui.taskExceptionEvidence?.[task.id]);
      addAnomaly(task, "老人不配合", `${task.title}执行时老人拒绝配合，建议稍后再次处理。`);
      appendHistoryRecord(task, "老人不配合", "老人情绪波动，暂时拒绝配合护理。", "已记录老人不配合原因。");
      touchToast("已记录不配合原因");
    } else {
      task.status = "risk";
      task.exception = `${task.title}执行中发现老人状态异常，已同步上报。`;
      task.exceptionNote = task.exception;
      task.exceptionType = "身体不适";
      task.exceptionReportedAt = `${formatNowDate()} ${formatNowTime()}`;
      task.exceptionEvidence = normalizeEvidenceList(state.ui.taskExceptionEvidence?.[task.id]);
      addAnomaly(task, "身体不适", `${task.title}执行中发现老人状态异常，已同步上报。`);
      appendHistoryRecord(task, "异常", "护理过程中发现异常情况，已同步上报。", "异常情况已上报，等待后续处理。");
      touchToast("异常上报成功，请补充留痕");
    }

    refreshDirectorOverview();
    syncCaregiverTaskToCloud(task, "异常任务云端同步失败").catch(() => {});
    notify();
  },
  toggleMessageRead(id) {
    const item = state.messages.find((message) => message.id === id);
    if (!item) return;
    item.read = !item.read;
    notify();
  },
  toggleFamilyMessage(id) {
    const item = state.family.messages.find((message) => message.id === id);
    if (!item) return;
    item.read = !item.read;
    notify();
  },
  setHistoryTimeFilter(value) {
    state.ui.historyFilter.time = value;
    notify();
  },
  setHistoryStatusFilter(value) {
    state.ui.historyFilter.status = value;
    notify();
  },
  setHistorySearch(value) {
    state.ui.historyFilter.search = value;
    notify();
  },
  selectHistory(id) {
    if (!getHistoryById(id)) return;
    state.ui.selectedHistoryId = id;
    state.ui.route = "history-detail";
    state.ui.activeTab = "history";
    notify();
  },
  selectDirectorFloor(value) {
    state.ui.selectedDirectorFloor = value;
    state.ui.directorAuditFloor = value || state.ui.directorAuditFloor;
    state.ui.route = "director-floor-detail";
    state.ui.activeTab = "director-home";
    notify();
  },
  openDirectorCaregiver() {
    state.ui.route = "director-caregiver";
    state.ui.activeTab = "director-home";
    notify();
  },
  openDirectorAssignments() {
    state.ui.route = "director-assignments";
    state.ui.activeTab = "director-home";
    notify();
  },
  openDirectorCareRecords(elderId = "") {
    const nextElderId = elderId || state.ui.selectedDirectorCareRecordElderId || state.elders[0]?.id || "";
    const currentDraft = state.ui.directorCareRecordDraft || {};
    state.ui.selectedDirectorCareRecordElderId = nextElderId;
    state.ui.directorCareRecordDraft = createDirectorCareRecordDraft({
      elderId: nextElderId,
      recordDate: currentDraft.recordDate || state.director.date,
      recordTime: currentDraft.recordTime || "15:30",
      institutionName: currentDraft.institutionName || state.institution.name,
      reviewerName: currentDraft.reviewerName || state.director.reviewerName,
      elders: state.elders,
      caregivers: state.caregivers,
    });
    state.ui.directorCareRecordPreviewOpen = false;
    state.ui.pendingCareRecordAction = "";
    state.ui.route = "director-care-records";
    state.ui.activeTab = "director-home";
    notify();
    actions.refreshDirectorCloudReports({ silent: true });
    actions.loadLatestDirectorCareRecord(nextElderId, currentDraft.recordDate || state.director.date);
  },
  openDirectorPersonnelDraft(type = "caregiver", id = "") {
    state.ui.directorPersonnelDraft = {
      type: type === "elder" ? "elder" : "caregiver",
      mode: id ? "edit" : "create",
      id,
    };
    notify();
  },
  openDirectorPersonnelEdit(type = "caregiver", id = "") {
    actions.openDirectorPersonnelDraft(type, id);
  },
  setDirectorPersonnelType(type = "caregiver") {
    state.ui.directorPersonnelType = type === "elder" ? "elder" : "caregiver";
    notify();
  },
  setDirectorPersonnelFloor(value = 1) {
    state.ui.directorPersonnelFloor = Math.min(5, Math.max(1, Number.parseInt(value, 10) || 1));
    notify();
  },
  closeDirectorPersonnelDraft() {
    state.ui.directorPersonnelDraft = null;
    notify();
  },
  async saveDirectorPersonnelDraft(input = {}) {
    const draft = state.ui.directorPersonnelDraft;
    if (!draft) return;

    const saved =
      draft.mode === "edit"
        ? draft.type === "elder"
          ? actions.updateElder(draft.id, input)
          : actions.updateCaregiver(draft.id, input)
        : draft.type === "elder"
          ? actions.addElder(input)
          : actions.addCaregiver(input);
    if (!saved) return;

    state.ui.directorPersonnelDraft = null;
    notify();
    await actions.persistInstitutionSharedState({ silent: true });
    publishReportTemplateGeneratedTasks().catch(() => {});
  },
  addCaregiver(input = {}) {
    const name = String(input.name || "").trim();
    if (!name) {
      touchToast("请先填写护工姓名");
      return false;
    }

    const floor = Math.min(5, Math.max(1, Number.parseInt(input.floor, 10) || 1));
    const nowStamp = Date.now();
    const nextCaregiver = {
      id: `caregiver-${nowStamp}`,
      name,
      role: String(input.role || "").trim() || "护工",
      employeeNo: String(input.employeeNo || "").trim() || `YG${String(state.caregivers.length + 1).padStart(3, "0")}`,
      floor,
      shift: String(input.shift || "").trim() || "07:00 - 15:30",
      status: input.status === "on-duty" ? "on-duty" : "off-duty",
    };

    state.caregivers.push(nextCaregiver);
    rebuildTasks();
    touchToast(`已新增护工 ${name}`);
    return true;
  },
  updateCaregiver(caregiverId, input = {}) {
    const caregiver = getCaregiverById(caregiverId);
    if (!caregiver) return false;

    const name = String(input.name || "").trim();
    if (!name) {
      touchToast("请先填写护工姓名");
      return false;
    }

    caregiver.name = name;
    caregiver.role = String(input.role || "").trim() || caregiver.role || "护工";
    caregiver.employeeNo = String(input.employeeNo || "").trim() || caregiver.employeeNo;
    caregiver.floor = Math.min(5, Math.max(1, Number.parseInt(input.floor, 10) || caregiver.floor || 1));
    caregiver.shift = String(input.shift || "").trim() || caregiver.shift || "07:00 - 15:30";
    caregiver.status = input.status === "on-duty" ? "on-duty" : "off-duty";

    if (state.caregiver.id === caregiver.id) {
      state.caregiver = { ...caregiver };
    }

    rebuildTasks();
    touchToast(`已更新护工 ${name}`);
    return true;
  },
  removeCaregiver(caregiverId) {
    const caregiver = getCaregiverById(caregiverId);
    if (!caregiver) return;
    if (state.caregivers.length <= 1) {
      touchToast("至少保留一名护工");
      return;
    }

    state.caregivers = state.caregivers.filter((item) => item.id !== caregiver.id);
    state.tasks = state.tasks.filter((task) => task.caregiverId !== caregiver.id && task.defaultCaregiverId !== caregiver.id);
    state.cloud.tasks = state.cloud.tasks.filter((task) => task.caregiverId !== caregiver.id);
    if (state.caregiver.id === caregiver.id) {
      state.caregiver = { ...state.caregivers[0] };
    }

    rebuildTasks();
    touchToast(`已删除护工 ${caregiver.name}`);
    actions.persistInstitutionSharedState({ silent: true });
    publishReportTemplateGeneratedTasks().catch(() => {});
  },
  addElder(input = {}) {
    const name = String(input.name || "").trim();
    const room = String(input.room || "").trim();
    if (!name || !room) {
      touchToast("请填写老人姓名和房间号");
      return false;
    }
    if (state.elders.some((elder) => elder.room === room)) {
      touchToast("这个房间号已存在");
      return false;
    }

    const floor = Math.min(5, Math.max(1, Number.parseInt(input.floor, 10) || Number.parseInt(room.charAt(0), 10) || 1));
    const reportTemplate = getDailyReportTemplateChoice(input.reportTemplateId);
    const nextElder = {
      id: `elder-${room}-${Date.now()}`,
      room,
      bed: String(input.bed || "").trim() || `${room}-1床`,
      floor,
      name,
      gender: input.gender === "男" ? "男" : "女",
      age: Math.min(120, Math.max(1, Number.parseInt(input.age, 10) || 80)),
      level: CARE_LEVEL_OPTIONS[1],
      reportTemplateId: reportTemplate.id,
      reportTemplateTitle: reportTemplate.title,
      tags: String(input.tags || "")
        .split(/[，,]/)
        .map((tag) => tag.trim())
        .filter(Boolean),
      familyContact: String(input.familyContact || "").trim() || "家属：未填写",
      familyPhone: String(input.familyPhone || "").trim() || "",
      latestBloodPressure: String(input.latestBloodPressure || "").trim() || "--",
      latestHeartRate: String(input.latestHeartRate || "").trim() || "--",
    };

    state.elders.push(nextElder);
    state.ui.directorPersonnelFloor = floor;
    state.ui.selectedDirectorPlanFloor = floor;
    state.ui.selectedDirectorPlanRoom = nextElder.id;
    state.ui.selectedDirectorCareRecordElderId = nextElder.id;
    state.ui.directorCareRecordDraft = createDirectorCareRecordDraft({
      elderId: nextElder.id,
      recordDate: state.director.date,
      institutionName: state.institution.name,
      reviewerName: state.director.reviewerName,
      elders: state.elders,
      caregivers: state.caregivers,
    });
    rebuildTasks();
    touchToast(`已新增老人 ${name}`);
    return true;
  },
  updateElder(elderId, input = {}) {
    const elder = getElderById(elderId);
    if (!elder) return false;

    const name = String(input.name || "").trim();
    const room = String(input.room || "").trim();
    if (!name || !room) {
      touchToast("请填写老人姓名和房间号");
      return false;
    }
    if (state.elders.some((item) => item.id !== elder.id && item.room === room)) {
      touchToast("这个房间号已存在");
      return false;
    }

    const floor = Math.min(5, Math.max(1, Number.parseInt(input.floor, 10) || Number.parseInt(room.charAt(0), 10) || elder.floor || 1));
    const reportTemplate = getDailyReportTemplateChoice(input.reportTemplateId || elder.reportTemplateId);

    elder.name = name;
    elder.room = room;
    elder.bed = String(input.bed || "").trim() || elder.bed || `${room}-1床`;
    elder.floor = floor;
    elder.gender = input.gender === "男" ? "男" : "女";
    elder.age = Math.min(120, Math.max(1, Number.parseInt(input.age, 10) || elder.age || 80));
    elder.level = elder.level || CARE_LEVEL_OPTIONS[1];
    elder.reportTemplateId = reportTemplate.id;
    elder.reportTemplateTitle = reportTemplate.title;
    elder.tags = String(input.tags || "")
      .split(/[,，]/)
      .map((tag) => tag.trim())
      .filter(Boolean);
    elder.familyContact = String(input.familyContact || "").trim() || elder.familyContact || "家属：未填写";
    elder.familyPhone = String(input.familyPhone || "").trim() || elder.familyPhone || "";

    if (state.ui.selectedDirectorPlanRoom === elder.id) {
      state.ui.selectedRoom = room;
      state.ui.selectedElderId = elder.id;
    }
    state.ui.directorPersonnelFloor = floor;

    rebuildTasks();
    touchToast(`已更新老人 ${name}`);
    return true;
  },
  removeElder(elderId) {
    const elder = getElderById(elderId);
    if (!elder) return;
    if (state.elders.length <= 1) {
      touchToast("至少保留一位老人");
      return;
    }

    state.elders = state.elders.filter((item) => item.id !== elder.id);
    state.elderCarePlans = state.elderCarePlans.filter((plan) => plan.elderId !== elder.id);
    state.tasks = state.tasks.filter((task) => task.elderId !== elder.id);
    state.history = state.history.filter((item) => item.elderId !== elder.id);
    state.vitals = state.vitals.filter((item) => item.elderId !== elder.id);
    state.anomalies = state.anomalies.filter((item) => item.elderId !== elder.id);
    state.dailyReports = state.dailyReports.filter((item) => item.elderId !== elder.id);
    state.cloud.careReports = state.cloud.careReports.filter((item) => item.elderId !== elder.id);
    state.cloud.tasks = state.cloud.tasks.filter((task) => task.elderId !== elder.id);

    const fallbackElder = state.elders[0] || null;
    if (fallbackElder) {
      state.ui.selectedElderId = fallbackElder.id;
      state.ui.selectedRoom = fallbackElder.room;
      state.ui.selectedFloor = fallbackElder.floor;
      state.ui.selectedDirectorPlanFloor = fallbackElder.floor;
      state.ui.selectedDirectorPlanRoom = fallbackElder.id;
      state.ui.selectedDirectorCareRecordElderId = fallbackElder.id;
      state.ui.directorCareRecordDraft = createDirectorCareRecordDraft({
        elderId: fallbackElder.id,
        recordDate: state.director.date,
        institutionName: state.institution.name,
        reviewerName: state.director.reviewerName,
        elders: state.elders,
        caregivers: state.caregivers,
      });
    }

    rebuildTasks();
    touchToast(`已删除老人 ${elder.name}`);
    actions.persistInstitutionSharedState({ silent: true });
    publishReportTemplateGeneratedTasks().catch(() => {});
  },
  openDirectorPersonnelPlanDetail(elderId = "") {
    if (!getElderById(elderId)) return;
    state.ui.directorPersonnelPlanDetailElderId = elderId;
    notify();
  },
  closeDirectorPersonnelPlanDetail() {
    state.ui.directorPersonnelPlanDetailElderId = "";
    notify();
  },
  markExceptionRead(taskId) {
    if (!taskId) return;
    if (!state.ui.directorReadExceptionIds) state.ui.directorReadExceptionIds = [];
    if (!state.ui.directorReadExceptionIds.includes(taskId)) {
      state.ui.directorReadExceptionIds.push(taskId);
    }
    touchToast("已标记为已读");
  },
  restoreReadException(taskId) {
    if (!taskId) return;
    state.ui.directorReadExceptionIds = (state.ui.directorReadExceptionIds || []).filter((id) => id !== taskId);
    touchToast("已恢复为未读");
  },
  deleteReadException(taskId) {
    if (!taskId) return;
    const task = getTaskById(taskId);
    if (task) {
      if (task.status === "risk" || task.status === "refused") task.status = "pending";
      task.exceptionNote = "";
      task.exception = "";
      task.exceptionType = "";
      task.exceptionEvidence = [];
      task.exceptionReportedAt = "";
    }
    const saved = state.ui.taskExceptionSaved || {};
    if (saved[taskId]) delete saved[taskId];
    const notes = state.ui.taskExceptionNotes || {};
    if (notes[taskId]) delete notes[taskId];
    const evidence = state.ui.taskExceptionEvidence || {};
    if (evidence[taskId]) delete evidence[taskId];
    state.ui.directorReadExceptionIds = (state.ui.directorReadExceptionIds || []).filter((id) => id !== taskId);
    touchToast("已删除");
    if (task && isCloudSyncConfigured()) {
      uploadPublishedTask(serializeCloudTask(task, "director-app")).catch(() => {});
    }
  },
  deleteAllReadExceptions() {
    const readIds = (state.ui.directorReadExceptionIds || []).slice();
    if (!readIds.length) {
      touchToast("没有已读记录");
      return;
    }
    if (!window.confirm(`确认删除全部 ${readIds.length} 条已读记录？`)) return;
    const saved = state.ui.taskExceptionSaved || {};
    const notes = state.ui.taskExceptionNotes || {};
    const evidence = state.ui.taskExceptionEvidence || {};
    const tasksToUpload = [];
    for (const id of readIds) {
      const task = getTaskById(id);
      if (task) {
        if (task.status === "risk" || task.status === "refused") task.status = "pending";
        task.exceptionNote = "";
        task.exception = "";
        task.exceptionType = "";
        task.exceptionEvidence = [];
        task.exceptionReportedAt = "";
        tasksToUpload.push(task);
      }
      if (saved[id]) delete saved[id];
      if (notes[id]) delete notes[id];
      if (evidence[id]) delete evidence[id];
    }
    state.ui.directorReadExceptionIds = [];
    touchToast(`已删除 ${readIds.length} 条记录`);
    if (tasksToUpload.length && isCloudSyncConfigured()) {
      tasksToUpload.forEach((task) => {
        uploadPublishedTask(serializeCloudTask(task, "director-app")).catch(() => {});
      });
    }
  },
  openDailyReportTemplateEditor() {
    state.ui.directorReportTemplateDraft = createDailyReportTemplateDraft(state.dailyReportTemplate);
    state.ui.directorReportTemplateTransient = { newSectionTitle: "", newItems: {} };
    state.ui.directorReportTemplatePreviewOpen = false;
    state.ui.directorReportTemplatePreviewZoom = 1;
    state.ui.directorReportTemplateScheduleSectionId = "";
    notify();
  },
  closeDailyReportTemplateEditor() {
    state.ui.directorReportTemplateDraft = null;
    state.ui.directorReportTemplateTransient = { newSectionTitle: "", newItems: {} };
    state.ui.directorReportTemplatePreviewOpen = false;
    state.ui.directorReportTemplateScheduleSectionId = "";
    notify();
  },
  updateDailyReportTemplateDraft(draft) {
    if (!draft) return;
    state.ui.directorReportTemplateDraft = {
      ...(state.ui.directorReportTemplateDraft || state.dailyReportTemplate),
      ...draft,
      sections: Array.isArray(draft.sections) ? draft.sections : [],
    };
    notify();
  },
  addDailyReportTemplateSection(draft, sectionTitle = "") {
    const title = String(sectionTitle || "").trim();
    if (!title) {
      touchToast("请先填写父标题名称");
      return;
    }

    state.ui.directorReportTemplateDraft = {
      ...(state.ui.directorReportTemplateDraft || state.dailyReportTemplate),
      ...(draft || {}),
      sections: [
        ...((draft?.sections || state.ui.directorReportTemplateDraft?.sections || []).filter((section) => section.title)),
        {
          id: createReportTemplateSectionId(title),
          title,
          items: [],
        },
      ],
    };
    state.ui.directorReportTemplateTransient = {
      ...(state.ui.directorReportTemplateTransient || { newItems: {} }),
      newSectionTitle: "",
    };
    notify();
  },
  addDailyReportTemplateItem(draft, sectionId = "", item = {}) {
    const label = String(item.label || "").trim();
    if (!sectionId) return;
    if (!label) {
      touchToast("请先填写子标题名称");
      return;
    }

    const current = {
      ...(state.ui.directorReportTemplateDraft || state.dailyReportTemplate),
      ...(draft || {}),
      sections: Array.isArray(draft?.sections) ? draft.sections : state.ui.directorReportTemplateDraft?.sections || [],
    };

    state.ui.directorReportTemplateDraft = {
      ...current,
      sections: (current.sections || []).map((section) =>
        section.id === sectionId
          ? {
              ...section,
              items: [
                ...(section.items || []),
                {
                  id: createReportTemplateItemId(label),
                  label,
                  frequencyDays: Math.max(1, Number(item.frequencyDays || 1)),
                  timeWindow: item.timeWindow || "",
                  requirePhoto: Boolean(item.requirePhoto),
                },
              ],
            }
          : section,
      ),
    };
    state.ui.directorReportTemplateTransient = {
      ...(state.ui.directorReportTemplateTransient || { newItems: {} }),
      newItems: {
        ...((state.ui.directorReportTemplateTransient || {}).newItems || {}),
        [sectionId]: { label: "", frequencyDays: "1" },
      },
    };
    notify();
  },
  deleteDailyReportTemplateItem(draft, sectionId = "", itemId = "") {
    if (!sectionId || !itemId) return;

    const current = {
      ...(state.ui.directorReportTemplateDraft || state.dailyReportTemplate),
      ...(draft || {}),
      sections: Array.isArray(draft?.sections) ? draft.sections : state.ui.directorReportTemplateDraft?.sections || [],
    };

    state.ui.directorReportTemplateDraft = {
      ...current,
      sections: (current.sections || []).map((section) =>
        section.id === sectionId
          ? {
              ...section,
              items: (section.items || []).filter((item) => item.id !== itemId),
            }
          : section,
      ),
    };
    notify();
  },
  toggleDailyReportTemplateItemPhoto(draft, sectionId = "", itemId = "") {
    if (!sectionId || !itemId) return;

    const current = {
      ...(state.ui.directorReportTemplateDraft || state.dailyReportTemplate),
      ...(draft || {}),
      sections: Array.isArray(draft?.sections) ? draft.sections : state.ui.directorReportTemplateDraft?.sections || [],
    };

    state.ui.directorReportTemplateDraft = {
      ...current,
      sections: (current.sections || []).map((section) =>
        section.id === sectionId
          ? {
              ...section,
              items: (section.items || []).map((item) =>
                item.id === itemId ? { ...item, requirePhoto: !Boolean(item.requirePhoto) } : item,
              ),
            }
          : section,
      ),
    };
    notify();
  },
  openDailyReportTemplateSchedule(draft, sectionId = "") {
    if (draft) {
      state.ui.directorReportTemplateDraft = {
        ...(state.ui.directorReportTemplateDraft || state.dailyReportTemplate),
        ...draft,
        sections: Array.isArray(draft.sections) ? draft.sections : [],
      };
    }

    const targetSectionId = sectionId || state.ui.directorReportTemplateDraft?.sections?.[0]?.id || "";
    if (!targetSectionId) {
      touchToast("请先添加父标题");
      return;
    }

    state.ui.directorReportTemplateScheduleSectionId = targetSectionId;
    state.ui.directorReportTemplatePreviewOpen = false;
    notify();
  },
  closeDailyReportTemplateSchedule() {
    state.ui.directorReportTemplateScheduleSectionId = "";
    notify();
  },
  setDailyReportTemplateItemTime(sectionId = "", itemId = "", timeWindow = "") {
    if (!sectionId || !itemId || !state.ui.directorReportTemplateDraft) return;

    state.ui.directorReportTemplateDraft = {
      ...state.ui.directorReportTemplateDraft,
      sections: (state.ui.directorReportTemplateDraft.sections || []).map((section) =>
        section.id === sectionId
          ? {
              ...section,
              items: (section.items || []).map((item) => (item.id === itemId ? { ...item, timeWindow } : item)),
            }
          : section,
      ),
    };
    notify();
  },
  openDailyReportTemplatePreview(draft) {
    if (draft) {
      state.ui.directorReportTemplateDraft = {
        ...(state.ui.directorReportTemplateDraft || state.dailyReportTemplate),
        ...draft,
        sections: Array.isArray(draft.sections) ? draft.sections : [],
      };
    }
    state.ui.directorReportTemplatePreviewOpen = true;
    state.ui.directorReportTemplatePreviewZoom = state.ui.directorReportTemplatePreviewZoom || 1;
    notify();
  },
  closeDailyReportTemplatePreview() {
    state.ui.directorReportTemplatePreviewOpen = false;
    notify();
  },
  zoomDailyReportTemplatePreview(direction = "in") {
    const current = Number(state.ui.directorReportTemplatePreviewZoom || 1);
    const delta = direction === "out" ? -0.15 : 0.15;
    state.ui.directorReportTemplatePreviewZoom = Math.min(1.8, Math.max(0.75, Number((current + delta).toFixed(2))));
    notify();
  },
  async openDailyReportTemplateImport(draft) {
    if (draft) {
      state.ui.directorReportTemplateDraft = {
        ...(state.ui.directorReportTemplateDraft || state.dailyReportTemplate),
        ...draft,
        sections: Array.isArray(draft.sections) ? draft.sections : [],
      };
    }
    state.ui.directorReportTemplateImportOpen = true;
    state.ui.directorReportTemplateImportInstitutionId =
      state.ui.directorReportTemplateImportInstitutionId || state.institution.id || "demo-qinghe-care";
    state.ui.directorReportTemplateImportError = "";
    notify();

    await actions.refreshDailyReportTemplateImportCatalog();
  },
  closeDailyReportTemplateImport() {
    state.ui.directorReportTemplateImportOpen = false;
    notify();
  },
  async refreshDailyReportTemplateImportCatalog() {
    if (!isCloudSyncConfigured()) {
      state.ui.directorReportTemplateImportLoading = false;
      state.ui.directorReportTemplateImportError = "云端接口未配置";
      notify();
      return;
    }

    state.ui.directorReportTemplateImportLoading = true;
    state.ui.directorReportTemplateImportError = "";
    notify();

    try {
      const response = await fetchDailyReportTemplates({ limit: 100 });
      const items = Array.isArray(response?.items) ? response.items : [];
      const institutions = Array.isArray(response?.institutions) ? response.institutions : [];
      state.ui.directorReportTemplateImportCatalog = { items, institutions };

      const selectedInstitutionId = state.ui.directorReportTemplateImportInstitutionId || state.institution.id;
      const matchedTemplates = items.filter((item) => item.institutionId === selectedInstitutionId);
      if (!matchedTemplates.some((item) => item.id === state.ui.directorReportTemplateImportTemplateId)) {
        state.ui.directorReportTemplateImportTemplateId = matchedTemplates[0]?.id || "";
      }
    } catch (error) {
      try {
        const response = await fetchDailyReportTemplate({
          institutionId: state.ui.directorReportTemplateImportInstitutionId || state.institution.id,
        });
        const item = response?.item ? [response.item] : [];
        state.ui.directorReportTemplateImportCatalog = {
          items: item,
          institutions: item.length
            ? [
                {
                  id: item[0].institutionId || state.ui.directorReportTemplateImportInstitutionId || state.institution.id,
                  name: item[0].institutionName || state.institution.name,
                },
              ]
            : [],
        };
        state.ui.directorReportTemplateImportTemplateId = item[0]?.id || "";
      } catch (fallbackError) {
        state.ui.directorReportTemplateImportError = error?.message || fallbackError?.message || "读取云端模板失败";
      }
    } finally {
      state.ui.directorReportTemplateImportLoading = false;
      notify();
    }
  },
  setDailyReportTemplateImportInstitution(institutionId = "") {
    state.ui.directorReportTemplateImportInstitutionId = institutionId || state.institution.id;
    const items = state.ui.directorReportTemplateImportCatalog?.items || [];
    const matchedTemplates = items.filter((item) => item.institutionId === state.ui.directorReportTemplateImportInstitutionId);
    state.ui.directorReportTemplateImportTemplateId = matchedTemplates[0]?.id || "";
    notify();
  },
  selectDailyReportTemplateImportTemplate(templateId = "") {
    state.ui.directorReportTemplateImportTemplateId = templateId;
    notify();
  },
  applyDailyReportTemplateImport(templateId = "") {
    const targetTemplateId = templateId || state.ui.directorReportTemplateImportTemplateId;
    const item = (state.ui.directorReportTemplateImportCatalog?.items || []).find((template) => template.id === targetTemplateId);
    if (!item) {
      touchToast("请选择要导入的云端模板");
      return;
    }

    const imported = normalizeDailyReportTemplate(item);
    if (!imported.sections.length) {
      touchToast("这个云端模板没有可导入的栏目");
      return;
    }

    state.ui.directorReportTemplateDraft = {
      ...imported,
      id: state.dailyReportTemplate?.id || "daily-report-basic",
      version: Number(state.dailyReportTemplate?.version || 1),
      updatedAt: state.dailyReportTemplate?.updatedAt || "",
    };
    state.ui.directorReportTemplateTransient = { newSectionTitle: "", newItems: {} };
    state.ui.directorReportTemplateImportOpen = false;
    state.ui.directorReportTemplatePreviewOpen = false;
    touchToast("已导入云端模板，保存后同步到本院");
    notify();
  },
  setDirectorInboxMonth(value = "") {
    state.ui.directorAuditDate = value || state.ui.directorAuditDate || state.director.date || formatNowDate();
    state.ui.directorInboxSelectedDate = "";
    notify();
  },
  openDirectorInboxDay(date = "") {
    if (!date) return;
    state.ui.directorAuditDate = date;
    state.ui.directorInboxSelectedDate = date;
    notify();
  },
  closeDirectorInboxDay() {
    state.ui.directorInboxSelectedDate = "";
    state.ui.directorInboxExportDate = "";
    state.ui.directorCareRecordBatchDate = "";
    notify();
  },
  async openDirectorInboxExport(date = "") {
    const targetDate = date || state.ui.directorInboxSelectedDate;
    if (!targetDate) return;

    state.ui.directorInboxExportDate = targetDate;
    if (!isCloudSyncConfigured()) {
      setCloudCareReportsError("云端接口未配置，无法下载日报数据");
      notify();
      return;
    }

    setCloudCareReportsLoading(true);
    setCloudCareReportsError("");
    notify();

    try {
      await downloadDirectorCareReports({ recordDate: targetDate, limit: 200 });
    } catch (error) {
      setCloudCareReportsError(error?.message || "下载云端日报失败");
    } finally {
      setCloudCareReportsLoading(false);
      notify();
    }
  },
  closeDirectorInboxExport() {
    state.ui.directorInboxExportDate = "";
    notify();
  },
  async requestDirectorInboxDayExport(date = "", mode = "print") {
    const targetDate = date || state.ui.directorInboxExportDate || state.ui.directorInboxSelectedDate;
    if (!targetDate) return;

    if (!isCloudSyncConfigured()) {
      setCloudCareReportsError("云端接口未配置，无法下载日报数据");
      notify();
      return;
    }

    setCloudCareReportsLoading(true);
    setCloudCareReportsError("");
    notify();

    try {
      const downloaded = await downloadDirectorCareReports({ recordDate: targetDate, limit: 200 });
      const hasReports =
        downloaded.length ||
        state.cloud.careReports.some((item) => String(item.recordDate || item.submittedAt || "").startsWith(targetDate));

      if (!hasReports) {
        touchToast("这一天云端没有已收到的日报，不能导出");
        return;
      }

      state.ui.directorCareRecordBatchDate = targetDate;
      state.ui.directorCareRecordPreviewOpen = true;
      state.ui.directorInboxExportDate = "";
      state.ui.pendingCareRecordAction = mode === "image" ? "image" : "print";
    } catch (error) {
      setCloudCareReportsError(error?.message || "下载云端日报失败");
    } finally {
      setCloudCareReportsLoading(false);
      notify();
    }
  },
  async refreshDailyReportTemplate(options = {}) {
    if (!isCloudSyncConfigured()) return;
    if (options.silent && isReportTemplateWorkspaceOpen()) return;

    try {
      const response = await fetchDailyReportTemplate({
        id: state.dailyReportTemplate?.id || "daily-report-basic",
        institutionId: state.institution.id,
      });
      if (response?.item) {
        applyDailyReportTemplate(response.item);
        if (!options.silent) {
          touchToast("日报模板已同步");
        } else {
          notify();
        }
      }
    } catch (error) {
      if (!options.silent) {
        touchToast(error?.message || "日报模板同步失败");
      }
    }
  },
  async saveDailyReportTemplateDraft(draft) {
    const nextTemplate = normalizeDailyReportTemplate({
      ...(draft || {}),
      id: state.dailyReportTemplate?.id || "daily-report-basic",
      version: Number(state.dailyReportTemplate?.version || 1) + 1,
      updatedAt: `${formatNowDate()} ${formatNowTime()}`,
    });

    if (!nextTemplate.sections.length) {
      touchToast("日报模板至少保留一个栏目");
      return;
    }

    applyDailyReportTemplate(nextTemplate);
    state.ui.directorReportTemplateDraft = null;
    state.ui.directorReportTemplateTransient = { newSectionTitle: "", newItems: {} };
    state.ui.directorReportTemplateScheduleSectionId = "";
    state.ui.directorReportTemplatePreviewOpen = false;
    notify();

    if (isCloudSyncConfigured()) {
      try {
        const response = await uploadDailyReportTemplate({
          ...nextTemplate,
          institutionId: state.institution.id,
          institutionName: state.institution.name,
          updatedBy: state.director.reviewerName || "director",
          source: "director-app",
        });
        if (response?.item) {
          applyDailyReportTemplate(response.item);
        }
        const taskSync = await publishReportTemplateGeneratedTasks();
        if (taskSync.failed) {
          touchToast(`日报模板已同步，${taskSync.failed} 个任务云端同步失败`);
        } else {
          touchToast(`日报模板和 ${taskSync.ok} 个任务已同步云端`);
        }
        actions.persistInstitutionSharedState({ silent: true });
        return;
      } catch (error) {
        touchToast(error?.message || "日报模板已本机更新，云端同步失败");
        return;
      }
    }
    actions.persistInstitutionSharedState({ silent: true });
    touchToast("日报模板已更新");
  },
  setDirectorTemplateFilter(value) {
    state.ui.directorTemplateFilter = value || "all";
    notify();
  },
  setDirectorTemplateSearch(value) {
    state.ui.directorTemplateSearch = value || "";
    notify();
  },
  setDirectorAssignmentFilter(value) {
    state.ui.directorAssignmentFilter = value;
    notify();
  },
  setDirectorDispatchFilter(value) {
    state.ui.directorDispatchFilter = value || "pending";
    notify();
  },
  selectDirectorStatisticsCaregiver(caregiverId) {
    state.ui.selectedDirectorStatisticsCaregiverId =
      state.ui.selectedDirectorStatisticsCaregiverId === caregiverId ? "" : caregiverId;
    notify();
  },
  openDirectorTemporaryTaskDraft() {
    const selectedElder =
      getElderById(state.ui.selectedDirectorPlanRoom) ||
      getElderById(state.ui.selectedElderId) ||
      state.elders[0] ||
      null;
    const targetCaregiver = selectedElder ? getCaregiverForFloor(selectedElder.floor) : state.caregivers[0] || null;

    state.ui.directorDispatchDraft = normalizeDirectorTemporaryTaskDraft({
      mode: "temporary",
      taskId: "",
      title: "",
      schedule: formatNowTime(),
      status: "pending",
      requirePhoto: false,
      floor: selectedElder?.floor || "",
      room: selectedElder?.room || "",
      elderId: selectedElder?.id || "",
      caregiverId: targetCaregiver?.id || "",
      timeMode: "now",
      startTime: "",
      endTime: "",
      elderSearch: "",
      elderSearchOpen: false,
      note: "",
      description: "",
    });
    notify();
  },
  updateDirectorTemporaryTaskDraft(draft = {}, options = {}) {
    if (!state.ui.directorDispatchDraft) return;
    state.ui.directorDispatchDraft = normalizeDirectorTemporaryTaskDraft({
      ...state.ui.directorDispatchDraft,
      ...draft,
      mode: "temporary",
    });
    if (!options.silent) {
      notify();
    }
  },
  toggleDirectorTemporaryTaskSearch() {
    if (!state.ui.directorDispatchDraft) return;
    state.ui.directorDispatchDraft = {
      ...state.ui.directorDispatchDraft,
      elderSearchOpen: !state.ui.directorDispatchDraft.elderSearchOpen,
    };
    notify();
  },
  selectDirectorTemporaryTaskElder(elderId) {
    if (!state.ui.directorDispatchDraft) return;
    const elder = getElderById(elderId);
    if (!elder) return;
    state.ui.directorDispatchDraft = normalizeDirectorTemporaryTaskDraft({
      ...state.ui.directorDispatchDraft,
      floor: elder.floor,
      room: elder.room,
      elderId: elder.id,
      elderSearchOpen: false,
      elderSearch: "",
    });
    notify();
  },
  openDirectorDispatchDraft(taskId) {
    const task = getTaskById(taskId);
    if (!task) return;

    state.ui.directorDispatchDraft = {
      taskId: task.id,
      title: task.title || "",
      schedule: task.schedule || "",
      status: task.status || "pending",
      requirePhoto: Boolean(task.requirePhoto),
      elderId: task.elderId || "",
      caregiverId: task.caregiverId || "",
      note: task.note || task.description || "",
      description: task.description || task.note || "",
    };
    notify();
  },
  closeDirectorDispatchDraft() {
    state.ui.directorDispatchDraft = null;
    notify();
  },
  async saveDirectorDispatchDraft(draft = null) {
    const nextDraft = draft || state.ui.directorDispatchDraft;
    if (!nextDraft) return;

    const isTemporaryCreate = nextDraft.mode === "temporary" || !nextDraft.taskId;
    const task = getTaskById(nextDraft.taskId);
    if (!task && !isTemporaryCreate) {
      state.ui.directorDispatchDraft = null;
      touchToast("当前任务已失效");
      return;
    }

    const title = String(nextDraft.title || "").trim();
    if (!title) {
      touchToast("请填写任务名称");
      return;
    }

    if (isTemporaryCreate) {
      const elder = getElderById(nextDraft.elderId);
      const caregiver = getCaregiverById(nextDraft.caregiverId);

      if (!elder) {
        touchToast("请选择相关老人");
        return;
      }
      if (!caregiver) {
        touchToast("请选择目标护工");
        return;
      }

      const nowTime = formatNowTime();
      const timeMode = nextDraft.timeMode === "range" ? "range" : "now";
      const startTime = String(nextDraft.startTime || "").trim();
      const endTime = String(nextDraft.endTime || "").trim();
      if (timeMode === "range") {
        if (!startTime || !endTime) {
          touchToast("请选择任务时间段");
          return;
        }
        if (scheduleToMinutes(endTime) <= scheduleToMinutes(startTime)) {
          touchToast("结束时间要晚于开始时间");
          return;
        }
      }
      const schedule = timeMode === "range" ? startTime : nowTime;
      const windowLabel = timeMode === "range" ? `${startTime}-${endTime}` : "立即执行";
      const taskId = `temp-task-${Date.now()}`;
      const description = String(nextDraft.note || nextDraft.description || "").trim();
      const temporaryTask = {
        id: taskId,
        planId: `temporary-${elder.id}`,
        planItemId: taskId,
        elderId: elder.id,
        caregiverId: caregiver.id,
        defaultCaregiverId: "",
        templateId: "",
        title,
        schedule,
        window: windowLabel,
        requirePhoto: Boolean(nextDraft.requirePhoto),
        status: "pending",
        note: description,
        description,
        category: "临时任务",
        templateGroup: "temporary",
        source: "temporary",
        assignmentMode: "temporary",
        assignmentStatus: "published",
        publishedAt: `${formatNowDate()} ${nowTime}`,
        acceptedAt: "",
      };

      state.tasks.push(temporaryTask);
      state.tasks = sortTasksBySchedule(state.tasks);
      mergeCloudTask(serializeCloudTask(temporaryTask));
      queueCaregiverTemporaryTaskReminder(temporaryTask);
      state.ui.directorDispatchDraft = null;
      refreshDirectorOverview();
      ensureCurrentSelections();
      notify();

      if (!isCloudSyncConfigured()) {
        touchToast(`已本机发布给 ${caregiver.name}`);
        actions.persistInstitutionSharedState({ silent: true });
        return;
      }

      try {
        const response = await uploadPublishedTask(serializeCloudTask(temporaryTask));
        const cloudTask = response?.item || response?.task || serializeCloudTask(temporaryTask);
        mergeCloudTask(cloudTask);
        setCloudTasksFetchedAt(response?.fetchedAt || `${formatNowDate()} ${formatNowTime()}`);
        setCloudTasksError("");
        refreshDirectorOverview();
        ensureCurrentSelections();
        actions.persistInstitutionSharedState({ silent: true });
        touchToast(`已发布到云端并提醒 ${caregiver.name}`);
      } catch (error) {
        setCloudTasksError(error?.message || "临时任务云端发布失败");
        touchToast(error?.message || "任务已本机发布，云端同步失败");
      }
      return;
    }

    const previousCaregiverId = task.caregiverId || "";
    task.title = title;
    task.schedule = String(nextDraft.schedule || "").trim() || "即时";
    task.window = task.schedule;
    task.status = ["risk", "refused"].includes(nextDraft.status) ? nextDraft.status : "pending";
    task.requirePhoto = Boolean(nextDraft.requirePhoto);
    task.note = String(nextDraft.note || nextDraft.description || "").trim();
    task.description = task.note;
    task.caregiverId = nextDraft.caregiverId || "";
    task.assignmentStatus = task.caregiverId ? "published" : "unassigned";
    task.source = task.assignmentMode === "manual" ? "manual" : "manual-adjusted";
    if (task.caregiverId && task.caregiverId !== previousCaregiverId) {
      task.publishedAt = formatNowTime();
      task.acceptedAt = "";
    }
    if (!task.caregiverId) {
      task.publishedAt = "";
      task.acceptedAt = "";
    }

    state.ui.directorDispatchDraft = null;
    refreshDirectorOverview();
    ensureCurrentSelections();
    notify();

    if (!task.caregiverId) {
      touchToast("已保存，任务仍在待分配");
      return;
    }

    if (!isCloudSyncConfigured()) {
      touchToast("已本机保存，云端未配置");
      return;
    }

    try {
      const response = await uploadPublishedTask(serializeCloudTask(task));
      const cloudTask = response?.item || response?.task || serializeCloudTask(task);
      mergeCloudTask(cloudTask);
      setCloudTasksFetchedAt(response?.fetchedAt || `${formatNowDate()} ${formatNowTime()}`);
      setCloudTasksError("");
      refreshDirectorOverview();
      ensureCurrentSelections();
      touchToast("已保存并同步云端");
    } catch (error) {
      setCloudTasksError(error?.message || "任务云端同步失败");
      touchToast(error?.message || "已本机保存，云端同步失败");
    }
  },
  setDirectorAuditFilter(field, value) {
    if (!field) return;
    if (field === "floor") {
      state.ui.directorAuditFloor = value || "all";
    }
    if (field === "project") {
      const exists = DIRECTOR_AUDIT_PROJECTS.some((item) => item.key === value);
      state.ui.directorAuditProject = exists ? value : "all";
    }
    if (field === "date") {
      state.ui.directorAuditDate = value || state.director.date || formatNowDate();
    }
    notify();
  },
  setDirectorAuditDate(value) {
    state.ui.directorAuditDate = value || state.director.date || formatNowDate();
    notify();
  },
  setDirectorResidentSearch(value) {
    state.ui.directorResidentSearch = value || "";
    notify();
  },
  selectDirectorElder(value) {
    state.ui.selectedDirectorElder = value;
    state.ui.route = "director-elder-timeline";
    state.ui.activeTab = "director-home";
    notify();
  },
  selectDirectorCareRecordElder(elderId) {
    const elder = getElderById(elderId);
    if (!elder) return;

    const currentDraft = state.ui.directorCareRecordDraft || {};
    state.ui.selectedDirectorCareRecordElderId = elder.id;
    state.ui.directorCareRecordDraft = createDirectorCareRecordDraft({
      elderId: elder.id,
      recordDate: currentDraft.recordDate || state.director.date,
      recordTime: currentDraft.recordTime || "15:30",
      institutionName: currentDraft.institutionName || state.institution.name,
      reviewerName: currentDraft.reviewerName || state.director.reviewerName,
      elders: state.elders,
      caregivers: state.caregivers,
    });
    state.ui.directorCareRecordPreviewOpen = false;
    state.ui.pendingCareRecordAction = "";
    notify();
    actions.loadLatestDirectorCareRecord(elder.id, currentDraft.recordDate || state.director.date);
  },
  setDirectorCareRecordDraft(draft) {
    if (!draft) return;
    state.ui.selectedDirectorCareRecordElderId = draft.elderId || state.ui.selectedDirectorCareRecordElderId;
    state.ui.directorCareRecordDraft = draft;
    notify();
  },
  openDirectorCareRecordPreview(draft = null) {
    if (draft) {
      state.ui.selectedDirectorCareRecordElderId = draft.elderId || state.ui.selectedDirectorCareRecordElderId;
      state.ui.directorCareRecordDraft = draft;
    }
    state.ui.directorCareRecordBatchDate = "";
    state.ui.directorCareRecordPreviewOpen = true;
    state.ui.pendingCareRecordAction = "";
    notify();
  },
  closeDirectorCareRecordPreview() {
    if (!state.ui.directorCareRecordPreviewOpen) return;
    state.ui.directorCareRecordPreviewOpen = false;
    state.ui.directorCareRecordBatchDate = "";
    state.ui.pendingCareRecordAction = "";
    notify();
  },
  requestDirectorCareRecordPrint(draft = null) {
    if (draft) {
      state.ui.selectedDirectorCareRecordElderId = draft.elderId || state.ui.selectedDirectorCareRecordElderId;
      state.ui.directorCareRecordDraft = draft;
    }
    state.ui.directorCareRecordBatchDate = "";
    state.ui.directorCareRecordPreviewOpen = true;
    state.ui.pendingCareRecordAction = "print";
    notify();
  },
  requestDirectorCareRecordImage(draft = null) {
    if (draft) {
      state.ui.selectedDirectorCareRecordElderId = draft.elderId || state.ui.selectedDirectorCareRecordElderId;
      state.ui.directorCareRecordDraft = draft;
    }
    state.ui.directorCareRecordBatchDate = "";
    state.ui.directorCareRecordPreviewOpen = true;
    state.ui.pendingCareRecordAction = "image";
    notify();
  },
  setCaregiverDailyReportDraft(draft) {
    if (!draft) return;
    state.ui.selectedCaregiverReportElderId = draft.elderId || state.ui.selectedCaregiverReportElderId;
    state.ui.caregiverDailyReportDraft = cloneCareRecordDraft(draft);
    notify();
  },
  saveCaregiverDailyReport(draft = null) {
    const nextDraft = cloneCareRecordDraft(draft || state.ui.caregiverDailyReportDraft);
    if (!nextDraft?.elderId) return;

    const savedReport = upsertDailyReport(nextDraft, "local-draft");
    state.ui.selectedCaregiverReportElderId = savedReport.elderId;
    state.ui.caregiverDailyReportDraft = savedReport;
    touchToast("\u65e5\u62a5\u5df2\u4fdd\u5b58\u5230\u672c\u673a");
  },
  async submitCaregiverDailyReport(draft = null) {
    const nextDraft = cloneCareRecordDraft(draft || state.ui.caregiverDailyReportDraft);
    if (!nextDraft?.elderId) return;

    const savedReport = upsertDailyReport(nextDraft, "pending-sync");
    state.ui.selectedCaregiverReportElderId = savedReport.elderId;
    state.ui.caregiverDailyReportDraft = savedReport;
    upsertFamilyCareReportNotice(savedReport, "pending-sync");
    notify();

    try {
      const response = await uploadCareRecord({
        ...savedReport,
        institutionId: state.institution.id,
        caregiverId: savedReport.caregiverId || state.caregiver.id,
        caregiverName: savedReport.caregiverName || state.caregiver.name,
        workflowStatus: "submitted",
        source: "caregiver-app",
      });
      const syncedReport = mergeCloudCareRecord({
        ...response?.item,
        syncStatus: "synced",
      });
      state.ui.selectedCaregiverReportElderId = syncedReport.elderId;
      state.ui.caregiverDailyReportDraft = syncedReport;
      upsertFamilyCareReportNotice(syncedReport, "synced");
      setCloudCareReportsError("");
      setCloudCareReportsFetchedAt(response?.fetchedAt || `${formatNowDate()} ${formatNowTime()}`);
      await actions.persistInstitutionSharedState({ silent: true });
      touchToast("交班日报已上传到云端");
    } catch (error) {
      const failedReport = upsertDailyReport(savedReport, "sync-failed");
      state.ui.selectedCaregiverReportElderId = failedReport.elderId;
      state.ui.caregiverDailyReportDraft = failedReport;
      upsertFamilyCareReportNotice(failedReport, "sync-failed");
      setCloudCareReportsError(error?.message || "云端同步失败");
      touchToast(error?.message || "云端同步失败");
    }
  },
  async refreshDirectorCloudReports(options = {}) {
    if (options.silent && isReportTemplateWorkspaceOpen()) return;

    if (!isCloudSyncConfigured()) {
      if (!options.silent) {
        setCloudCareReportsError("云端接口未配置");
        notify();
      }
      return;
    }

    setCloudCareReportsLoading(true);
    if (!options.preserveError) {
      setCloudCareReportsError("");
    }
    if (!options.silent) notify();

    const prevSnapshot = JSON.stringify(state.cloud.careReports);
    try {
      await downloadDirectorCareReports(
        {
          limit: options.limit || 120,
          elderId: options.elderId || "",
          recordDate: options.recordDate || "",
          caregiverId: options.caregiverId || "",
        },
        { clear: false },
      );
    } catch (error) {
      setCloudCareReportsError(error?.message || "拉取云端交班日报失败");
    } finally {
      setCloudCareReportsLoading(false);
      if (JSON.stringify(state.cloud.careReports) !== prevSnapshot) notify();
    }
  },
  async loadLatestDirectorCareRecord(elderId, recordDate = "", options = {}) {
    if (!elderId || !isCloudSyncConfigured()) return;

    try {
      const response = await fetchCareRecords({
        elderId,
        recordDate,
        limit: 1,
      });
      const latestRecord = Array.isArray(response?.items) ? response.items[0] : null;
      if (!latestRecord) {
        if (!options.silent) {
          notify();
        }
        return;
      }

      const hydrated = mergeCloudCareRecord(latestRecord);
      state.ui.selectedDirectorCareRecordElderId = hydrated.elderId || elderId;
      state.ui.directorCareRecordDraft = hydrated;
      state.ui.directorCareRecordPreviewOpen = false;
      state.ui.directorCareRecordBatchDate = "";
      state.ui.pendingCareRecordAction = "";
      setCloudCareReportsFetchedAt(response?.fetchedAt || `${formatNowDate()} ${formatNowTime()}`);
      setCloudCareReportsError("");
      notify();
    } catch (error) {
      setCloudCareReportsError(error?.message || "获取日报收件箱记录失败");
      if (!options.silent) {
        notify();
      }
    }
  },
  loadDirectorCareRecordFromCloud(recordId) {
    const targetRecord = state.cloud.careReports.find((item) => item.id === recordId);
    if (!targetRecord) {
      touchToast("这条云端交班日报暂时不可用");
      return;
    }

    const hydrated = mergeCloudCareRecord(targetRecord);
    state.ui.selectedDirectorCareRecordElderId = hydrated.elderId || state.ui.selectedDirectorCareRecordElderId;
    state.ui.directorCareRecordDraft = hydrated;
    state.ui.directorCareRecordPreviewOpen = false;
    state.ui.directorCareRecordBatchDate = "";
    state.ui.pendingCareRecordAction = "";
    notify();
    touchToast("已载入护工端交班日报");
  },
  async refreshCaregiverCloudTasks(options = {}) {
    if (state.session.identity !== "caregiver" || !state.caregiver?.id) return;
    // updatedAt excluded — changes on every fetch, would break signature no-op
    const buildTaskSignature = () =>
      JSON.stringify(
        state.tasks
          .filter((task) => task.caregiverId === state.caregiver.id)
          .map((task) => [task.id, task.elderId, task.caregiverId, task.status, task.publishedAt]),
      );
    let shouldNotify = !options.silent;
    const beforeSignature = buildTaskSignature();

    if (!isCloudSyncConfigured()) {
      if (!options.silent) {
        setCloudTasksError("云端任务接口未配置");
        notify();
      }
      return;
    }

    setCloudTasksLoading(true);
    if (!options.preserveError) {
      setCloudTasksError("");
    }
    if (!options.silent) notify();

    try {
      const response = await fetchPublishedTasks({
        institutionId: state.institution.id,
        caregiverId: state.caregiver.id,
        recordDate: options.recordDate || state.director.date,
        limit: options.limit || 100,
      });
      const nextItems = Array.isArray(response?.items)
        ? response.items
        : Array.isArray(response?.tasks)
          ? response.tasks
          : Array.isArray(response)
            ? response
            : [];

      nextItems.forEach((item) => {
        if (!shouldAcceptCloudTask(item)) return;
        if (!item?.caregiverId || item.caregiverId === state.caregiver.id) {
          mergeCloudTask(item);
        }
      });

      refreshDirectorOverview();
      ensureCurrentSelections();
      setCloudTasksFetchedAt(response?.fetchedAt || `${formatNowDate()} ${formatNowTime()}`);
      setCloudTasksError("");
      shouldNotify = shouldNotify || beforeSignature !== buildTaskSignature();
    } catch (error) {
      setCloudTasksError(error?.message || "拉取云端任务失败");
    } finally {
      setCloudTasksLoading(false);
      if (shouldNotify) {
        notify();
      }
    }
  },
  async refreshDirectorCloudTasks(options = {}) {
    if (state.session.identity !== "director" && state.session.identity !== "admin" && state.session.identity !== "superadmin") return;

    if (!isCloudSyncConfigured()) return;

    if (!state.cloud.institutionStateFetchedAt) return;

    // updatedAt excluded — changes on every fetch, would break signature no-op
    const buildTaskSignature = () =>
      state.tasks.map((task) => [task.id, task.status, task.exceptionNote, task.exception, (task.exceptionEvidence || []).length]);

    const signToString = (sig) => JSON.stringify(sig);

    let shouldNotify = !options.silent;
    const beforeSignature = buildTaskSignature();

    try {
      const response = await fetchPublishedTasks({
        institutionId: state.institution.id,
        limit: options.limit || 200,
      });
      const nextItems = Array.isArray(response?.items)
        ? response.items
        : Array.isArray(response?.tasks)
          ? response.tasks
          : Array.isArray(response)
            ? response
            : [];

      nextItems.forEach((item) => {
        if (!shouldAcceptCloudTask(item)) return;
        mergeCloudTask(item);
      });

      setCloudTasksFetchedAt(response?.fetchedAt || `${formatNowDate()} ${formatNowTime()}`);
      setCloudTasksError("");

      const afterSignature = buildTaskSignature();
      if (signToString(beforeSignature) !== signToString(afterSignature)) {
        refreshDirectorOverview();
        ensureCurrentSelections();
        if (!options.silent) {
          touchToast("云端任务已刷新");
        }
        shouldNotify = true;
      }
    } catch (error) {
      setCloudTasksError(error?.message || "拉取云端任务失败");
    } finally {
      if (shouldNotify) notify();
    }
  },
  restoreNavigationSnapshot(snapshot = {}) {
    if (!snapshot || !snapshot.route) return;

    state.ui.route = snapshot.route;
    state.ui.activeTab = snapshot.activeTab || getActiveTab(snapshot.route);
    state.ui.selectedFloor = snapshot.selectedFloor ?? state.ui.selectedFloor;
    state.ui.selectedRoom = snapshot.selectedRoom ?? state.ui.selectedRoom;
    state.ui.selectedElderId = snapshot.selectedElderId ?? state.ui.selectedElderId;
    state.ui.selectedTaskId = snapshot.selectedTaskId ?? state.ui.selectedTaskId;
    state.ui.selectedHistoryId = snapshot.selectedHistoryId ?? state.ui.selectedHistoryId;
    state.ui.selectedDirectorFloor = snapshot.selectedDirectorFloor ?? state.ui.selectedDirectorFloor;
    state.ui.selectedDirectorElder = snapshot.selectedDirectorElder ?? state.ui.selectedDirectorElder;
    state.ui.selectedDirectorPlanFloor = snapshot.selectedDirectorPlanFloor ?? state.ui.selectedDirectorPlanFloor;
    state.ui.selectedDirectorPlanRoom = snapshot.selectedDirectorPlanRoom ?? state.ui.selectedDirectorPlanRoom;
    state.ui.directorPersonnelType = snapshot.directorPersonnelType ?? state.ui.directorPersonnelType;
    state.ui.directorPersonnelFloor = snapshot.directorPersonnelFloor ?? state.ui.directorPersonnelFloor;
    state.ui.directorAuditFloor = snapshot.directorAuditFloor ?? state.ui.directorAuditFloor;
    state.ui.directorAuditDate = snapshot.directorAuditDate ?? state.ui.directorAuditDate;
    state.ui.directorAuditProject = snapshot.directorAuditProject ?? state.ui.directorAuditProject;
    state.ui.directorInboxSelectedDate = snapshot.directorInboxSelectedDate ?? state.ui.directorInboxSelectedDate;
    state.ui.directorInboxExportDate = snapshot.directorInboxExportDate ?? state.ui.directorInboxExportDate;
    state.ui.directorPlanTimelineOpen = Boolean(snapshot.directorPlanTimelineOpen);
    state.ui.directorPlanTimelineSettled = Boolean(snapshot.directorPlanTimelineSettled);
    state.ui.selectedDirectorCareRecordElderId =
      snapshot.selectedDirectorCareRecordElderId ?? state.ui.selectedDirectorCareRecordElderId;
    state.ui.directorCareRecordPreviewOpen = Boolean(snapshot.directorCareRecordPreviewOpen);
    state.ui.directorCareRecordBatchDate = snapshot.directorCareRecordBatchDate ?? state.ui.directorCareRecordBatchDate;
    state.ui.batchPanelOpen = Boolean(snapshot.batchPanelOpen);
    state.ui.batchExceptionPrompt = state.ui.batchExceptionPrompt || null;
    state.ui.selectedCaregiverReportElderId =
      snapshot.selectedCaregiverReportElderId ?? state.ui.selectedCaregiverReportElderId;
    ensureCurrentSelections();
    notify();
  },
  announce(message) {
    if (!message) return;
    touchToast(message);
  },
  selectDirectorPlanFloor(value) {
    const nextFloor = Number.parseInt(value, 10) || 1;
    if ((state.ui.directorPlanDraft || state.ui.directorPlanItemDraft) && nextFloor !== state.ui.selectedDirectorPlanFloor) {
      touchToast("请先保存或取消当前方案");
      return;
    }

    state.ui.selectedDirectorPlanFloor = nextFloor;
    state.ui.directorPlanTimelineOpen = false;
    state.ui.directorPlanTimelineSettled = false;
    syncDirectorPlanSelection();
    notify();
  },
  selectDirectorPlanRoom(room) {
    if ((state.ui.directorPlanDraft || state.ui.directorPlanItemDraft) && room !== state.ui.selectedDirectorPlanRoom) {
      touchToast("请先保存或取消当前方案");
      return;
    }

    const wasTimelineOpen = state.ui.directorPlanTimelineOpen;
    state.ui.selectedDirectorPlanRoom = room;
    state.ui.directorPlanTimelineOpen = true;
    state.ui.directorPlanTimelineSettled = wasTimelineOpen;
    notify();
  },
  previewDirectorPlanRoom(room, options = {}) {
    if ((state.ui.directorPlanDraft || state.ui.directorPlanItemDraft) && room !== state.ui.selectedDirectorPlanRoom) {
      touchToast("请先保存或取消当前方案");
      return;
    }

    state.ui.selectedDirectorPlanRoom = room;
    state.ui.directorPlanTimelineOpen = false;
    state.ui.directorPlanTimelineSettled = false;
    if (!options.silent) {
      notify();
    }
  },
  closeDirectorPlanTimeline() {
    if (!state.ui.directorPlanTimelineOpen) return;
    state.ui.directorPlanTimelineOpen = false;
    state.ui.directorPlanTimelineSettled = false;
    notify();
  },
  openDirectorPlanNoteDraft(elderId = "") {
    const plan = getPlanByElderId(elderId || state.ui.selectedDirectorPlanRoom);
    if (!plan) return;
    state.ui.directorPlanNoteDraft = {
      elderId: plan.elderId,
      note: plan.note || "",
    };
    notify();
  },
  closeDirectorPlanNoteDraft() {
    state.ui.directorPlanNoteDraft = null;
    notify();
  },
  updateDirectorPlanNoteDraft(note = "") {
    if (!state.ui.directorPlanNoteDraft) return;
    state.ui.directorPlanNoteDraft = {
      ...state.ui.directorPlanNoteDraft,
      note: String(note || ""),
    };
  },
  async saveDirectorPlanNoteDraft(note = "") {
    const draft = state.ui.directorPlanNoteDraft;
    if (!draft) return;
    const plan = getPlanByElderId(draft.elderId);
    if (!plan) {
      state.ui.directorPlanNoteDraft = null;
      notify();
      return;
    }

    plan.note = String(note || draft.note || "").trim();
    state.ui.directorPlanNoteDraft = null;
    rebuildTasks();
    notify();
    await actions.persistInstitutionSharedState({ silent: true });
    if (isCloudSyncConfigured()) {
      publishReportTemplateGeneratedTasks().catch(() => {});
    }
    touchToast("建议与注意事项已更新");
  },
  openDirectorPlanTemporaryDialog(elderId = "") {
    state.ui.directorPlanTemporaryDialogElderId = elderId || state.ui.selectedDirectorPlanRoom || "";
    notify();
  },
  closeDirectorPlanTemporaryDialog() {
    state.ui.directorPlanTemporaryDialogElderId = "";
    notify();
  },
  async assignTask(taskId, caregiverId) {
    const task = getTaskById(taskId);
    const caregiver = getCaregiverById(caregiverId);
    if (!task || !caregiver) return;

    task.caregiverId = caregiver.id;
    task.source = task.defaultCaregiverId && caregiver.id === task.defaultCaregiverId ? "plan" : task.assignmentMode === "manual" ? "manual" : "manual-adjusted";
    task.assignmentStatus = "published";
    task.publishedAt = formatNowTime();
    task.acceptedAt = "";
    refreshDirectorOverview();
    ensureCurrentSelections();
    notify();

    if (!isCloudSyncConfigured()) {
      setCloudTasksError("云端任务接口未配置");
      touchToast(`已本机发布给 ${caregiver.name}，云端未配置`);
      return;
    }

    try {
      const response = await uploadPublishedTask(serializeCloudTask(task));
      const cloudTask = response?.item || response?.task || serializeCloudTask(task);
      mergeCloudTask(cloudTask);
      setCloudTasksFetchedAt(response?.fetchedAt || `${formatNowDate()} ${formatNowTime()}`);
      setCloudTasksError("");
      refreshDirectorOverview();
      ensureCurrentSelections();
      touchToast(`已发布到云端并分配给 ${caregiver.name}`);
    } catch (error) {
      setCloudTasksError(error?.message || "任务云端发布失败");
      touchToast(error?.message || "任务已本机发布，云端同步失败");
    }
  },
  clearTaskAssignment(taskId) {
    const task = getTaskById(taskId);
    if (!task) return;

    if (task.status === "completed") {
      touchToast("已完成任务不建议撤回发布");
      return;
    }

    task.caregiverId = "";
    task.source = task.assignmentMode === "manual" ? "manual" : "manual-adjusted";
    task.assignmentStatus = "unassigned";
    task.publishedAt = "";
    task.acceptedAt = "";
    refreshDirectorOverview();
    ensureCurrentSelections();
    touchToast("已撤回发布，任务回到待分配池");
  },
  toggleTemplateActive(templateId) {
    const template = getTemplateById(templateId);
    if (!template) return;

    template.isActive = !template.isActive;
    rebuildTasks();
    touchToast(`${template.title}${template.isActive ? "已启用" : "已停用"}`);
  },
  createTemplate(group) {
    state.ui.directorTemplateDraft = createTemplateDraft(group);
    notify();
  },
  openTemplateDraft(templateId) {
    const template = getTemplateById(templateId);
    if (!template) return;

    state.ui.directorTemplateDraft = createTemplateDraft(template);
    notify();
  },
  closeTemplateDraft() {
    state.ui.directorTemplateDraft = null;
    notify();
  },
  saveTemplateDraft() {
    const draft = state.ui.directorTemplateDraft;
    if (!draft) return;

    const group = draft.group === "special" ? "special" : "daily";
    const isSpecial = group === "special";
    const title = String(draft.title || "").trim();
    const category = String(draft.category || "").trim();
    const appliesToLevels = Array.from(new Set((draft.appliesToLevels || []).filter(Boolean)));
    const existingTemplate = draft.mode === "edit" ? getTemplateById(draft.templateId) : null;

    if (!title || !category) {
      touchToast("请先填写模板名称和任务分类");
      return;
    }

    if (!appliesToLevels.length) {
      touchToast("请至少选择一个适用护理等级");
      return;
    }

    if (existingTemplate) {
      existingTemplate.title = title;
      existingTemplate.group = group;
      existingTemplate.groupLabel = "任务模板";
      existingTemplate.category = category;
      existingTemplate.requirePhoto = Boolean(draft.requirePhoto);
      existingTemplate.batchEligible = Boolean(draft.batchEligible);
      existingTemplate.appliesToLevels = appliesToLevels;
      existingTemplate.defaultNote = String(draft.defaultNote || "").trim() || (isSpecial ? "请按院内临时安排执行。" : "请按院内常规护理流程执行。");
      rebuildTasks();
      state.ui.directorTemplateDraft = null;
      touchToast(`已更新模板 ${title}`);
      return;
    }

    state.taskTemplates.unshift({
      id: `template-custom-${Date.now()}`,
      title,
      group,
      groupLabel: "任务模板",
      category,
      requirePhoto: Boolean(draft.requirePhoto),
      batchEligible: Boolean(draft.batchEligible),
      appliesToLevels,
      defaultNote: String(draft.defaultNote || "").trim() || (isSpecial ? "请按院内临时安排执行。" : "请按院内常规护理流程执行。"),
      isActive: true,
    });

    rebuildTasks();
    state.ui.directorTemplateDraft = null;
    touchToast(`已新增模板 ${title}`);
  },
  openPlanDraft() {
    const elder = getElderById(state.ui.selectedDirectorPlanRoom) || getDirectorPlanEldersByFloor(state.ui.selectedDirectorPlanFloor)[0];
    if (!elder) {
      touchToast("当前楼层没有可配置的老人");
      return;
    }

    state.ui.directorPlanTimelineOpen = false;
    state.ui.directorPlanTimelineSettled = false;
    state.ui.directorPlanDraft = createPlanDraft(elder, getPlanByElderId(elder.id));
    state.ui.directorPlanItemDraft = null;
    notify();
  },
  closePlanDraft() {
    state.ui.directorPlanDraft = null;
    state.ui.directorPlanItemDraft = null;
    notify();
  },
  addPlanDraftItem() {
    this.openPlanItemDraft();
  },
  removePlanDraftItem(itemId) {
    if (!state.ui.directorPlanDraft) return;

    state.ui.directorPlanDraft = {
      ...state.ui.directorPlanDraft,
      items: state.ui.directorPlanDraft.items.filter((item) => item.id !== itemId),
    };
    if (state.ui.directorPlanItemDraft?.itemId === itemId) {
      state.ui.directorPlanItemDraft = null;
    }
    notify();
  },
  openPlanItemDraft(itemId = "") {
    if (!state.ui.directorPlanDraft) return;
    if (state.ui.directorPlanItemDraft) {
      if ((itemId || "") === state.ui.directorPlanItemDraft.itemId) {
        notify();
        return;
      }
      touchToast("请先保存或取消当前任务");
      return;
    }

    const currentItem = itemId ? state.ui.directorPlanDraft.items.find((item) => item.id === itemId) : null;
    state.ui.directorPlanItemDraft = createPlanItemDraft(currentItem || null);
    notify();
  },
  closePlanItemDraft() {
    state.ui.directorPlanItemDraft = null;
    notify();
  },
  savePlanItemDraft() {
    const planDraft = state.ui.directorPlanDraft;
    const itemDraft = state.ui.directorPlanItemDraft;
    if (!planDraft || !itemDraft) return;

    const templateId = String(itemDraft.templateId || "").trim();
    const schedule = String(itemDraft.schedule || "").trim();

    if (!templateId || !schedule) {
      touchToast("请先选择任务模板和执行时间");
      return;
    }

    const nextItem = createPlanDraftItem({
      id: itemDraft.itemId || createDraftItemId(),
      templateId,
      schedule,
      assignment: itemDraft.assignment === "manual" ? "manual" : "floor-owner",
      note: String(itemDraft.note || "").trim(),
      isEnabled: itemDraft.isEnabled !== false,
    });

    const items =
      itemDraft.mode === "edit"
        ? planDraft.items.map((item) => (item.id === itemDraft.itemId ? nextItem : item))
        : [...planDraft.items, nextItem];

    state.ui.directorPlanDraft = {
      ...planDraft,
      items: sortTasksBySchedule(items),
    };
    state.ui.directorPlanItemDraft = null;
    touchToast(itemDraft.mode === "edit" ? "任务已更新到时间轴" : "任务已加入时间轴");
  },
  togglePlanDraftItemEnabled(itemId) {
    if (!state.ui.directorPlanDraft) return;

    state.ui.directorPlanDraft = {
      ...state.ui.directorPlanDraft,
      items: state.ui.directorPlanDraft.items.map((item) =>
        item.id === itemId
          ? {
              ...item,
              isEnabled: item.isEnabled === false,
            }
          : item,
      ),
    };
    notify();
  },
  savePlanDraft() {
    const draft = state.ui.directorPlanDraft;
    if (!draft) return;

    const elder = getElderById(draft.elderId);
    if (!elder) {
      touchToast("请先选择方案对应的老人");
      return;
    }

    const timestamp = Date.now();
    const normalizedItems = (draft.items || [])
      .map((item, index) => ({
        id: String(item.id || "").startsWith("draft-plan-item-") ? `plan-${elder.room}-${timestamp}-${index + 1}` : item.id,
        templateId: item.templateId,
        schedule: item.schedule,
        assignment: item.assignment === "manual" ? "manual" : "floor-owner",
        note: String(item.note || "").trim(),
        isEnabled: item.isEnabled !== false,
      }))
      .filter((item) => item.templateId && item.schedule);

    if (!normalizedItems.length) {
      touchToast("请至少新增一条有效任务");
      return;
    }

    const existingPlan = getPlanByElderId(elder.id);
    const nextPlan = {
      id: existingPlan?.id || `plan-${elder.room}`,
      elderId: elder.id,
      level: draft.level || elder.level || CARE_LEVEL_OPTIONS[0],
      reviewCycle: draft.reviewCycle || REVIEW_CYCLE_OPTIONS[1],
      note: String(draft.note || "").trim() || "请按护理方案执行并做好留痕记录。",
      items: normalizedItems.map((item) => ({
        id: item.id,
        templateId: item.templateId,
        schedule: item.schedule,
        assignment: item.assignment,
        initialStatus: "pending",
        isEnabled: item.isEnabled,
        note: item.note,
      })),
    };

    if (existingPlan) {
      existingPlan.level = nextPlan.level;
      existingPlan.reviewCycle = nextPlan.reviewCycle;
      existingPlan.note = nextPlan.note;
      existingPlan.items = nextPlan.items;
    } else {
      state.elderCarePlans.push(nextPlan);
    }

    state.ui.selectedDirectorPlanFloor = elder.floor;
    state.ui.selectedDirectorPlanRoom = elder.id;
    state.ui.directorPlanTimelineOpen = false;
    state.ui.directorPlanTimelineSettled = false;
    state.ui.directorPlanDraft = null;
    state.ui.directorPlanItemDraft = null;
    rebuildTasks();
    touchToast(existingPlan ? "护理方案已更新" : "护理方案已新增");
  },
  togglePlanItem(planId, planItemId) {
    const item = getPlanItem(planId, planItemId);
    if (!item) return;

    item.isEnabled = item.isEnabled === false;
    rebuildTasks();
    touchToast(`方案项已${item.isEnabled ? "启用" : "停用"}`);
  },
};

actions.enterCaregiver = function enterCaregiver() {
  state.session.identity = "caregiver";
  state.session.loggedIn = false;
  state.session.clockInAt = "";
  state.session.clockOutAt = "";
  state.session.clockInLocation = "";
  state.session.clockInLocationRaw = null;
  state.ui.attendanceVerification = createAttendanceVerificationState();
  state.ui.route = "attendance";
  state.ui.activeTab = "home";
  notify();
};

actions.devEnterCaregiver = function devEnterCaregiver() {
  state.session.identity = "caregiver";
  state.session.loggedIn = true;
  state.session.clockInAt = formatNowTime();
  state.session.clockOutAt = "";
  state.session.clockInLocation = "开发者模式：已跳过定位验证";
  state.session.clockInLocationRaw = null;
  state.ui.attendanceVerification = createAttendanceVerificationState({
    status: "success",
    fingerprintStatus: "success",
    locationStatus: "success",
    locationLabel: state.session.clockInLocation,
  });
  state.ui.route = "home";
  state.ui.activeTab = "home";
  syncCurrentCaregiverStatus("on-duty");
  actions.refreshDailyReportTemplate({ silent: true });
  touchToast("已通过开发者入口进入护工端");
};

actions.clockIn = function clockIn() {
  if (state.session.loggedIn && state.session.clockInAt) return;

  state.session.loggedIn = true;
  state.session.clockInAt = formatNowTime();
  state.session.clockOutAt = "";
  state.session.clockInLocation = "院内打卡";
  state.session.clockInLocationRaw = null;
  state.ui.attendanceVerification = createAttendanceVerificationState({
    status: "success",
    fingerprintStatus: "success",
    locationStatus: "success",
    locationLabel: "院内打卡",
  });
  syncCurrentCaregiverStatus("on-duty");
  state.ui.route = "home";
  state.ui.activeTab = "home";
  touchToast("上班打卡成功 " + state.session.clockInAt);
  actions.refreshInstitutionSharedState({ silent: true });
};

actions.enterWorkbench = function enterWorkbench() {
  state.ui.route = "home";
  state.ui.activeTab = "home";
  notify();
};

actions.logout = function logout() {
  const caregiverSession = state.session.identity === "caregiver";

  state.session.identity = "";
  state.session.loggedIn = false;
  state.session.clockInAt = "";
  state.session.clockOutAt = "";
  state.session.clockInLocation = "";
  state.session.clockInLocationRaw = null;
  state.ui.route = "login";
  state.ui.activeTab = "home";
  state.ui.batchPanelOpen = false;
  state.ui.batchExceptionPrompt = null;
  state.ui.attendanceVerification = createAttendanceVerificationState();
  state.ui.taskEvidence = {};
  state.ui.taskNotes = {};
  state.ui.taskRecordEvidence = {};
  state.ui.taskExceptionEvidence = {};
  state.ui.quickExceptionEvidence = {};
  state.ui.taskRecordNotes = {};
  state.ui.taskExceptionNotes = {};
  state.ui.quickExceptionNotes = {};
  state.ui.taskRecordDialog = null;
  state.ui.taskExceptionSaved = {};
  state.ui.quickExceptionSaved = {};
  state.ui.caregiverTimelineFullscreen = false;
  state.ui.directorCareRecordPreviewOpen = false;
  state.ui.selectedCaregiverReportElderId = "";
  state.ui.caregiverDailyReportDraft = null;
  state.ui.pendingCareRecordAction = "";

  if (caregiverSession) {
    syncCurrentCaregiverStatus("off-duty");
  }

  touchToast("已退出登录");
};

actions.savePlanItemDraft = function savePlanItemDraft() {
  const planDraft = state.ui.directorPlanDraft;
  const itemDraft = state.ui.directorPlanItemDraft;
  if (!planDraft || !itemDraft) return;

  const resolved = resolvePlanDraftItem(planDraft, itemDraft);
  if (resolved.error) {
    touchToast(resolved.error);
    return;
  }

  state.ui.directorPlanDraft = {
    ...planDraft,
    items: resolved.items,
  };
  state.ui.directorPlanItemDraft = null;
  touchToast(resolved.mode === "edit" ? "任务已更新到时间轴" : "任务已加入时间轴");
};

actions.savePlanDraft = function savePlanDraft() {
  let draft = state.ui.directorPlanDraft;
  if (!draft) return;

  if (state.ui.directorPlanItemDraft) {
    const resolved = resolvePlanDraftItem(draft, state.ui.directorPlanItemDraft);
    if (resolved.error) {
      touchToast("请先完成当前任务配置，或取消后再保存方案");
      return;
    }

    draft = {
      ...draft,
      items: resolved.items,
    };
    state.ui.directorPlanDraft = draft;
    state.ui.directorPlanItemDraft = null;
  }

  const elder = getElderById(draft.elderId);
  if (!elder) {
    touchToast("请先选择方案对应的老人");
    return;
  }

  const timestamp = Date.now();
  const normalizedItems = (draft.items || [])
    .map((item, index) => ({
      id: String(item.id || "").startsWith("draft-plan-item-") ? `plan-${elder.room}-${timestamp}-${index + 1}` : item.id,
      templateId: item.templateId,
      schedule: item.schedule,
      assignment: item.assignment === "manual" ? "manual" : "floor-owner",
      note: String(item.note || "").trim(),
      isEnabled: item.isEnabled !== false,
    }))
    .filter((item) => item.templateId && item.schedule);

  if (!normalizedItems.length) {
    touchToast("请至少新增一条有效任务");
    return;
  }

  const existingPlan = getPlanByElderId(elder.id);
  const nextPlan = {
    id: existingPlan?.id || `plan-${elder.room}`,
    elderId: elder.id,
    level: draft.level || elder.level || CARE_LEVEL_OPTIONS[0],
    reviewCycle: draft.reviewCycle || REVIEW_CYCLE_OPTIONS[1],
    note: String(draft.note || "").trim() || "请按护理方案执行并做好留痕记录。",
    items: normalizedItems.map((item) => ({
      id: item.id,
      templateId: item.templateId,
      schedule: item.schedule,
      assignment: item.assignment,
      initialStatus: "pending",
      isEnabled: item.isEnabled,
      note: item.note,
    })),
  };

  if (existingPlan) {
    existingPlan.level = nextPlan.level;
    existingPlan.reviewCycle = nextPlan.reviewCycle;
    existingPlan.note = nextPlan.note;
    existingPlan.items = nextPlan.items;
  } else {
    state.elderCarePlans.push(nextPlan);
  }

  state.ui.selectedDirectorPlanFloor = elder.floor;
  state.ui.selectedDirectorPlanRoom = elder.id;
  state.ui.directorPlanTimelineOpen = false;
  state.ui.directorPlanTimelineSettled = false;
  state.ui.directorPlanDraft = null;
  state.ui.directorPlanItemDraft = null;
  rebuildTasks();
  touchToast(existingPlan ? "护理方案已更新" : "护理方案已新增");
};

export function selectors() {
  const selectedElder = getElderById(state.ui.selectedElderId);
  const rawSelectedTask = getTaskById(state.ui.selectedTaskId);
  const selectedTask = rawSelectedTask?.caregiverId === state.caregiver.id ? rawSelectedTask : null;
  const selectedHistory = getHistoryById(state.ui.selectedHistoryId);
  const taskRecordEvidence = state.ui.taskRecordEvidence || state.ui.taskEvidence || {};
  const taskExceptionEvidence = state.ui.taskExceptionEvidence || {};
  const quickExceptionEvidence = state.ui.quickExceptionEvidence || {};
  const taskRecordNotes = state.ui.taskRecordNotes || state.ui.taskNotes || {};
  const taskExceptionNotes = state.ui.taskExceptionNotes || {};
  const quickExceptionNotes = state.ui.quickExceptionNotes || {};
  const selectedTaskEvidence = selectedTask ? taskRecordEvidence[selectedTask.id] || "" : "";

  const caregiverTasks = sortTasksBySchedule(state.tasks.filter((task) => task.caregiverId === state.caregiver.id)).map(enrichTask);

  const elderTasks = selectedElder ? caregiverTasks.filter((task) => task.elderId === selectedElder.id) : [];
  const pendingTasks = caregiverTasks.filter((task) => task.status === "pending");
  const riskTasks = caregiverTasks.filter((task) => task.status === "risk" || task.status === "refused");
  const completedTasks = caregiverTasks.filter((task) => task.status === "completed");

  const floorRooms = state.elders
    .filter((elder) => elder.floor === state.ui.selectedFloor)
    .sort((left, right) => left.room.localeCompare(right.room))
    .filter((elder) => caregiverTasks.some((task) => task.elderId === elder.id))
    .map((elder) => {
      const taskList = caregiverTasks.filter((task) => task.elderId === elder.id);
      const hasRisk = taskList.some((task) => task.status === "risk" || task.status === "refused");
      const allDone = taskList.length > 0 && taskList.every((task) => task.status === "completed");
      const nextPending = taskList.find((task) => task.status === "pending");

      return {
        room: elder.room,
        floor: elder.floor,
        elderId: elder.id,
        elderName: elder.name,
        type: hasRisk ? "error" : allDone ? "completed" : "pending",
        statusText: hasRisk ? "异常情况" : allDone ? "已完成" : nextPending ? `${nextPending.title}未完成` : "待处理",
      };
    });

  const filteredHistory = state.history.filter((item) => {
    const search = state.ui.historyFilter.search.trim();
    const matchesSearch = !search || item.elder.includes(search) || item.room.includes(search) || item.task.includes(search);
    const matchesStatus = state.ui.historyFilter.status === "全部" || item.status === state.ui.historyFilter.status;

    return matchesSearch && matchesStatus && matchHistoryTimeFilter(item);
  });

  const floorSummaries = [1, 2, 3, 4, 5].map((floor) => ({
    floor,
    pendingCount: caregiverTasks.filter((task) => {
      const elder = getElderById(task.elderId);
      return elder && elder.floor === floor && task.status !== "completed";
    }).length,
  })).filter((item) => item.pendingCount > 0);

  const directorSelectedFloorBase =
    state.director.floorDetails[state.ui.selectedDirectorFloor] ||
    state.director.floorDetails[state.director.floors[0]?.name] ||
    { completion: "0%", elders: [] };
  const directorSelectedFloorOverview =
    state.director.floors.find((floor) => floor.name === state.ui.selectedDirectorFloor) || null;
  const directorSelectedFloorNumber = Number.parseInt(state.ui.selectedDirectorFloor, 10) || 1;
  const directorSelectedFloorElders = state.elders
    .filter((elder) => elder.floor === directorSelectedFloorNumber)
    .sort((left, right) => left.room.localeCompare(right.room))
    .map((elder) => {
      const elderTasks = state.tasks.filter((task) => task.elderId === elder.id);
      const riskTask = elderTasks.find((task) => task.status === "risk" || task.status === "refused");
      const pendingTask = elderTasks.find((task) => !task.caregiverId || task.status === "pending");
      const allHandled =
        elderTasks.length > 0 && elderTasks.every((task) => ["completed", "risk", "refused"].includes(task.status));

      return {
        id: elder.id,
        name: elder.name,
        room: elder.room,
        floor: elder.floor,
        taskCount: elderTasks.length,
        handledCount: elderTasks.filter((task) => isHandledTask(task)).length,
        issueCount: elderTasks.filter((task) => task.status === "risk" || task.status === "refused").length,
        status: riskTask ? "异常待处理" : !elderTasks.length ? "未配置方案" : !pendingTask && allHandled ? "已处理" : "进行中",
        anomaly: riskTask ? riskTask.title : pendingTask && !pendingTask.caregiverId ? `${pendingTask.title}待分配` : "",
        tone: riskTask ? "error" : !elderTasks.length ? "muted" : !pendingTask && allHandled ? "success" : "warning",
      };
    });
  const directorSelectedFloorCaregivers = buildDirectorFloorCaregiverProgress(state.ui.selectedDirectorFloor, state.tasks);
  const directorSelectedFloor = {
    ...directorSelectedFloorBase,
    completion: directorSelectedFloorOverview?.rate || directorSelectedFloorBase.completion,
    elders: directorSelectedFloorElders,
    caregivers: directorSelectedFloorCaregivers,
    issueRate: directorSelectedFloorOverview?.issueRate || "0%",
    refusedRate: directorSelectedFloorOverview?.refusedRate || "0%",
    riskCount: directorSelectedFloorOverview?.error || 0,
  };
  const selectedDirectorElder =
    state.elders.find((elder) => elder.name === state.ui.selectedDirectorElder) || state.elders[0] || null;
  const selectedDirectorElderTasks = selectedDirectorElder
    ? sortTasksBySchedule(state.tasks.filter((task) => task.elderId === selectedDirectorElder.id))
    : [];
  const fallbackDirectorTimeline =
    state.director.timelines.find((item) => item.elderName === state.ui.selectedDirectorElder) || state.director.timelines[0];
  const directorTimelineDate = state.ui.directorAuditDate || state.director.date || formatNowDate();
  const directorSelectedTimeline = selectedDirectorElder
    ? {
        elderName: selectedDirectorElder.name,
        room: `${selectedDirectorElder.room}室`,
        level: selectedDirectorElder.level,
        date: directorTimelineDate,
        entries: selectedDirectorElderTasks.length
          ? selectedDirectorElderTasks.map((task) => {
              const enriched = enrichTask(task);
              const timelineStatus = getDirectorTimelineStatus(task, directorTimelineDate);
              return {
                time: task.schedule,
                title: task.title,
                statusLabel: timelineStatus.label,
                statusTone: timelineStatus.tone,
                note: `${enriched.sourceLabel}${enriched.caregiver?.name ? ` · ${enriched.caregiver.name}` : ""}`,
                tone: timelineStatus.tone,
              };
            })
          : fallbackDirectorTimeline?.entries || [],
      }
    : fallbackDirectorTimeline;

  const caregiverLoads = state.caregivers
    .map((caregiver) => {
      const assigned = state.tasks.filter((task) => task.caregiverId === caregiver.id);
      return {
        ...caregiver,
        assignedCount: assigned.length,
        pendingCount: assigned.filter((task) => task.status === "pending").length,
        riskCount: assigned.filter((task) => task.status === "risk" || task.status === "refused").length,
        overloaded: assigned.length >= 5,
      };
    })
    .sort((left, right) => {
      if (left.assignedCount !== right.assignedCount) return left.assignedCount - right.assignedCount;
      if (left.pendingCount !== right.pendingCount) return left.pendingCount - right.pendingCount;
      return left.riskCount - right.riskCount;
    });

  const allDirectorTasks = sortTasksBySchedule(state.tasks).map(enrichTask);
  const directorAuditFilters = {
    floor: state.ui.directorAuditFloor || "all",
    date: state.ui.directorAuditDate || state.director.date || formatNowDate(),
    project: state.ui.directorAuditProject || "all",
  };
  const directorAuditFloorOptions = [
    { key: "all", label: "全院" },
    ...[1, 2, 3, 4, 5].map((floor) => ({ key: `${floor}F`, label: `${floor}F` })),
  ];
  const directorAuditDateOptions = getDirectorAuditDateOptions();
  const auditElders = state.elders
    .filter((elder) => directorAuditFilters.floor === "all" || `${elder.floor}F` === directorAuditFilters.floor)
    .sort((left, right) => {
      if (left.floor !== right.floor) return left.floor - right.floor;
      return left.room.localeCompare(right.room);
    });
  const directorProjectAuditRows = auditElders.map((elder) => {
    const elderTasks = allDirectorTasks.filter(
      (task) => task.elderId === elder.id && taskMatchesProject(task, directorAuditFilters.project),
    );
    const tone = getTaskStatusTone(elderTasks);
    const statusLabel = getTaskStatusText(elderTasks);
    const evidenceCount = elderTasks.filter((task) => task.requirePhoto || task.status === "risk" || task.status === "refused").length;

    return {
      elderId: elder.id,
      elderName: elder.name,
      room: elder.room,
      floor: `${elder.floor}F`,
      taskCount: elderTasks.length,
      handledCount: elderTasks.filter((task) => task.status === "completed" || task.status === "risk" || task.status === "refused").length,
      statusLabel,
      tone,
      evidenceLabel: evidenceCount ? `${evidenceCount} 条留痕` : "文字记录",
      tasks: elderTasks,
    };
  });
  const directorProjectAuditSummary = {
    total: directorProjectAuditRows.length,
    handled: directorProjectAuditRows.filter((row) => row.taskCount > 0 && row.handledCount === row.taskCount).length,
    issue: directorProjectAuditRows.filter((row) => row.statusLabel === "异常已留痕").length,
    refused: directorProjectAuditRows.filter((row) => row.statusLabel === "不配合已留痕").length,
  };
  const unassignedTasks = allDirectorTasks.filter((task) => !task.caregiverId);
  const assignedTasks = allDirectorTasks.filter((task) => task.caregiverId);
  const riskDirectorTasks = allDirectorTasks.filter((task) => task.status === "risk" || task.status === "refused");
  const directorTaskOverview = buildDirectorTaskOverview(state.tasks);
  const directorCaregiverStatistics = buildDirectorCaregiverStatistics(state.tasks);
  const selectedDirectorCaregiverStat =
    directorCaregiverStatistics.find((item) => item.id === state.ui.selectedDirectorStatisticsCaregiverId) || null;
  const directorExceptionReports = buildDirectorExceptionReports(state.tasks);
  const directorReadExceptionReports = buildDirectorExceptionReports(state.tasks, { readOnly: true });

  const dispatchTasks = allDirectorTasks
    .filter((task) => task.assignmentMode === "manual" || task.assignmentMode === "temporary" || task.templateGroup === "special" || task.templateGroup === "temporary")
    .map((task) => {
      const floor = task.elder?.floor || 0;
      const candidateCaregivers = [...caregiverLoads].sort((left, right) => {
        const leftRank = left.floor === floor ? 0 : 1;
        const rightRank = right.floor === floor ? 0 : 1;

        if (leftRank !== rightRank) return leftRank - rightRank;
        if (left.assignedCount !== right.assignedCount) return left.assignedCount - right.assignedCount;
        if (left.pendingCount !== right.pendingCount) return left.pendingCount - right.pendingCount;
        return left.riskCount - right.riskCount;
      });

      return {
        ...task,
        scopeLabel: task.elder ? `${task.elder.room}室 · ${task.elder.name}` : task.schedule,
        urgencyTone: task.status === "risk" || task.status === "refused" ? "error" : !task.caregiverId ? "warning" : "success",
        urgencyLabel: task.status === "risk" || task.status === "refused" ? "紧急" : !task.caregiverId ? "待分配" : "已发布",
        candidateCaregivers: candidateCaregivers.slice(0, 3),
        recommendedCaregiver: candidateCaregivers[0] || null,
      };
    });

  const visibleDispatchTasks =
    state.ui.directorDispatchFilter === "assigned"
      ? dispatchTasks.filter((task) => task.caregiverId)
      : state.ui.directorDispatchFilter === "urgent"
        ? dispatchTasks.filter((task) => task.status === "risk" || task.status === "refused")
        : state.ui.directorDispatchFilter === "all"
          ? dispatchTasks
          : dispatchTasks.filter((task) => !task.caregiverId);

  const visibleDirectorTasks = visibleDispatchTasks;

  const templateUsage = state.taskTemplates.map((template) => {
    const linkedPlanItems = state.elderCarePlans.flatMap((plan) => plan.items.filter((item) => item.templateId === template.id));
    const enabledPlanItems = linkedPlanItems.filter((item) => item.isEnabled !== false);
    const activeTasks = state.tasks.filter((task) => task.templateId === template.id);

    return {
      ...template,
      planCount: linkedPlanItems.length,
      enabledCount: enabledPlanItems.length,
      activeTaskCount: activeTasks.length,
      assignedCount: activeTasks.filter((task) => task.caregiverId).length,
    };
  });

  const templateGroups = [
    {
      key: "all",
      label: "任务模板",
      helper: "",
      items: templateUsage,
    },
  ];

  const templateSearch = state.ui.directorTemplateSearch.trim();
  const visibleTemplateGroups = templateGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        const matchesSearch =
          !templateSearch ||
          item.title.includes(templateSearch) ||
          item.category.includes(templateSearch);

        return matchesSearch;
      }),
    }))
    .filter((group) => group.items.length > 0);

  const elderPlanSummaries = state.elderCarePlans.map((plan) => {
    const elder = getElderById(plan.elderId);
    const elderTasks = sortTasksBySchedule(state.tasks.filter((task) => task.elderId === plan.elderId)).map(enrichTask);
    const dailyTasks = elderTasks.filter((task) => !isTemporaryTask(task));
    const temporaryTasks = elderTasks.filter(isTemporaryTask);
    const now = currentClockMinutes();
    const actualHandled = dailyTasks.filter(isHandledTask).length;
    const expectedDue = countExpectedDueTasks(dailyTasks, now, actualHandled);
    const items = plan.items.map((item) => {
      const template = getTemplateById(item.templateId);
      const activeTask = state.tasks.find((task) => task.planItemId === item.id);
      const assignedCaregiver = activeTask ? getCaregiverById(activeTask.caregiverId) : null;

      return {
        ...item,
        template,
        activeTask: activeTask ? enrichTask(activeTask) : null,
        assignedCaregiver,
        isEnabled: item.isEnabled !== false,
      };
    });

    return {
      ...plan,
      elder,
      items,
      enabledCount: items.filter((item) => item.isEnabled).length,
      disabledCount: items.filter((item) => !item.isEnabled).length,
      manualCount: items.filter((item) => item.assignment === "manual" && item.isEnabled).length,
      templateTitles: items.filter((item) => item.isEnabled).map((item) => item.template?.title || item.templateId),
      timelineTasks: elderTasks,
      temporaryTasks,
      temporaryTaskCount: temporaryTasks.length,
      expectedDue,
      expectedPercent: percentNumber(expectedDue, dailyTasks.length),
      actualHandled,
      actualPercent: percentNumber(actualHandled, dailyTasks.length),
      dailyTaskTotal: dailyTasks.length,
    };
  });

  const directorPlanFloors = [1, 2, 3, 4, 5].map((floor) => {
    const floorPlans = elderPlanSummaries.filter((plan) => plan.elder && plan.elder.floor === floor);
    return {
      floor,
      elderCount: floorPlans.length,
      enabledCount: floorPlans.reduce((total, plan) => total + plan.enabledCount, 0),
      selected: state.ui.selectedDirectorPlanFloor === floor,
    };
  });

  const directorPlanRooms = elderPlanSummaries
    .filter((plan) => plan.elder && plan.elder.floor === state.ui.selectedDirectorPlanFloor)
    .sort((left, right) => left.elder.room.localeCompare(right.elder.room))
    .map((plan) => ({
      id: plan.elder.id,
      room: plan.elder.room,
      elderName: plan.elder.name,
      level: plan.level,
      enabledCount: plan.enabledCount,
      selected: state.ui.selectedDirectorPlanRoom === plan.elder.id,
      status: plan.items.some((item) => item.assignment === "manual" && item.isEnabled) ? "需院长关注" : "常规执行",
    }));

  const selectedDirectorPlan =
    elderPlanSummaries.find((plan) => plan.elder && plan.elder.id === state.ui.selectedDirectorPlanRoom) || null;

  const directorPlanFloorCards = [1, 2, 3, 4, 5].map((floor) => {
    const floorElders = state.elders.filter((elder) => elder.floor === floor);
    const floorPlans = elderPlanSummaries.filter((plan) => plan.elder && plan.elder.floor === floor);
    const floorCaregivers = state.caregivers.filter((caregiver) => caregiver.floor === floor);

    return {
      floor,
      elderCount: floorElders.length,
      caregiverCount: floorCaregivers.length,
      enabledCount: floorPlans.reduce((total, plan) => total + plan.enabledCount, 0),
      selected: state.ui.selectedDirectorPlanFloor === floor,
    };
  });

  const directorPlanResidents = getDirectorPlanEldersByFloor(state.ui.selectedDirectorPlanFloor).map((elder) => {
    const plan = elderPlanSummaries.find((item) => item.elder?.id === elder.id) || null;

    return {
      id: elder.id,
      room: elder.room,
      bed: elder.bed,
      elderName: elder.name,
      level: plan?.level || elder.level,
      hasPlan: Boolean(plan),
      enabledCount: plan?.enabledCount || 0,
      manualCount:
        plan?.items.filter((item) => item.assignment === "manual" && item.isEnabled !== false).length || 0,
      selected: state.ui.selectedDirectorPlanRoom === elder.id,
      status: !plan ? "未配置方案" : plan.items.some((item) => item.assignment === "manual" && item.isEnabled) ? "需院长关注" : "常规执行",
    };
  });

  const allDirectorPlanResidents = directorPlanResidents;
  const selectedPlanFloorCaregivers = state.caregivers.filter((caregiver) => caregiver.floor === state.ui.selectedDirectorPlanFloor);
  const selectedPlanFloorElders = getDirectorPlanEldersByFloor(state.ui.selectedDirectorPlanFloor);
  const directorPlanFloorStaff = selectedPlanFloorCaregivers.map((caregiver) => ({
    ...caregiver,
    rooms: [],
  }));

  selectedPlanFloorElders.forEach((elder, elderIndex) => {
    const elderTasks = state.tasks.filter((task) => task.elderId === elder.id);
    const matchedCaregiverId =
      elderTasks.find((task) => task.caregiverId && getCaregiverById(task.caregiverId)?.floor === elder.floor)?.caregiverId ||
      elderTasks.find((task) => task.defaultCaregiverId && getCaregiverById(task.defaultCaregiverId)?.floor === elder.floor)?.defaultCaregiverId ||
      "";
    const fallbackCaregiver = directorPlanFloorStaff.length ? directorPlanFloorStaff[elderIndex % directorPlanFloorStaff.length] : null;
    const targetCaregiver = directorPlanFloorStaff.find((caregiver) => caregiver.id === matchedCaregiverId) || fallbackCaregiver;

    if (targetCaregiver) {
      targetCaregiver.rooms.push({
        room: elder.room,
        elderName: elder.name,
        level: elder.level,
      });
    }
  });

  const residentSearch = state.ui.directorResidentSearch.trim();
  const visibleDirectorPlanResidents = allDirectorPlanResidents.filter((resident) => {
    if (!residentSearch) return true;
    return resident.elderName.includes(residentSearch) || resident.room.includes(residentSearch);
  });

  const selectedDirectorPlanResident = visibleDirectorPlanResidents.find((resident) => resident.selected) || null;
  const selectedDirectorPlanRecord =
    selectedDirectorPlanResident
      ? elderPlanSummaries.find((plan) => plan.elder && plan.elder.id === selectedDirectorPlanResident.id) || null
      : null;

  const directorCareRecordDraftSource =
    state.ui.directorCareRecordDraft ||
    createDirectorCareRecordDraft({
      elderId: state.ui.selectedDirectorCareRecordElderId || state.elders[0]?.id,
      recordDate: state.director.date,
      institutionName: state.institution.name,
      reviewerName: state.director.reviewerName,
      elders: state.elders,
      caregivers: state.caregivers,
      reportTemplate: state.dailyReportTemplate,
    });
  const directorCareRecordDraft = {
    ...directorCareRecordDraftSource,
    reportTemplateSnapshot: directorCareRecordDraftSource.reportTemplateSnapshot || state.dailyReportTemplate,
    reportItems: hydrateReportItems(directorCareRecordDraftSource, directorCareRecordDraftSource.reportTemplateSnapshot || state.dailyReportTemplate),
  };
  const directorCareRecordElders = [...state.elders]
    .sort((left, right) => {
      if (left.floor !== right.floor) return left.floor - right.floor;
      return left.room.localeCompare(right.room);
    })
    .map((elder) => ({
      id: elder.id,
      label: `${elder.floor}F · ${elder.room}室 · ${elder.name}`,
      room: elder.room,
      floor: elder.floor,
      selected: directorCareRecordDraft.elderId === elder.id,
    }));
  const selectedDirectorCareRecordElder =
    getElderById(directorCareRecordDraft.elderId) ||
    getElderById(state.ui.selectedDirectorCareRecordElderId) ||
    state.elders[0] ||
    null;
  const directorCareRecordSummary = summarizeCareRecordDraft(directorCareRecordDraft);
  const caregiverDailyReportDraftSource =
    state.ui.caregiverDailyReportDraft ||
    (state.ui.selectedCaregiverReportElderId
      ? buildCaregiverDailyReportDraft(
          state.ui.selectedCaregiverReportElderId,
          findDailyReport(state.ui.selectedCaregiverReportElderId),
        )
      : null);
  const caregiverDailyReportDraft = caregiverDailyReportDraftSource
    ? {
        ...caregiverDailyReportDraftSource,
        reportTemplateSnapshot: caregiverDailyReportDraftSource.reportTemplateSnapshot || state.dailyReportTemplate,
        reportItems: hydrateReportItems(
          caregiverDailyReportDraftSource,
          caregiverDailyReportDraftSource.reportTemplateSnapshot || state.dailyReportTemplate,
        ),
      }
    : null;
  const selectedCaregiverReportElder = caregiverDailyReportDraft
    ? getElderById(caregiverDailyReportDraft.elderId) || null
    : null;
  const caregiverDailyReportSummary = caregiverDailyReportDraft
    ? summarizeCareRecordDraft(caregiverDailyReportDraft)
    : null;
  const caregiverDailyReportStatus = getCareReportStatusMeta(caregiverDailyReportDraft?.syncStatus);
  const batchExceptionPrompt =
    state.ui.batchExceptionPrompt && Number(state.ui.batchExceptionPrompt.floor) === Number(state.ui.selectedFloor)
      ? state.ui.batchExceptionPrompt
      : null;
  const directorCloudReports = state.cloud.careReports.map((item) => ({
    ...item,
    summary: item.summary || summarizeCareRecordDraft(item),
    syncMeta: getCareReportStatusMeta(item.syncStatus || "synced"),
    elderLabel: `${item.room || "--"}室 · ${item.elderName || "未命名老人"}`,
    caregiverLabel: item.caregiverName || "未填写护理员",
    floorLabel: getCareRecordFloor(item),
  }));
  const directorFilteredCloudReports = directorCloudReports.filter((item) => {
    const matchesFloor = directorAuditFilters.floor === "all" || item.floorLabel === directorAuditFilters.floor;
    const matchesDate = !directorAuditFilters.date || item.recordDate === directorAuditFilters.date;
    const matchesProject = careRecordMatchesProject(item, directorAuditFilters.project);
    return matchesFloor && matchesDate && matchesProject;
  });
  const directorInboxSummary = {
    total: directorFilteredCloudReports.length,
    issue: directorFilteredCloudReports.filter((item) => (item.summary?.issueCount || 0) > 0).length,
    medication: directorFilteredCloudReports.filter((item) => (item.summary?.medicationCount || 0) > 0).length,
  };
  const cloudStatus = createCloudStatusMeta();

  const templateOptions = state.taskTemplates.map((template) => ({
    id: template.id,
    label: `${template.title} · ${template.category}`,
  }));
  const dailyReportTemplateOptions = [
    {
      value: state.dailyReportTemplate?.id || "daily-report-basic",
      label: state.dailyReportTemplate?.title || "护理记录日报模板",
    },
  ];
  const directorDispatchElderOptions = [...state.elders]
    .sort((left, right) => {
      if (left.floor !== right.floor) return Number(left.floor) - Number(right.floor);
      return String(left.room || "").localeCompare(String(right.room || ""), "zh-CN", { numeric: true });
    })
    .map((elder) => ({
      value: elder.id,
      label: `${elder.floor}F · ${elder.room}室 · ${elder.name}`,
    }));
  const directorDispatchElderPicker = getDirectorTemporaryElderPicker(state.ui.directorDispatchDraft || {});
  const directorPlanNoteDraft = state.ui.directorPlanNoteDraft || null;
  const directorPlanTemporaryDialog = state.ui.directorPlanTemporaryDialogElderId
    ? elderPlanSummaries.find((plan) => plan.elder?.id === state.ui.directorPlanTemporaryDialogElderId) || null
    : null;

  const caregiverDashboard = {
    pendingCount: pendingTasks.length,
    completedCount: completedTasks.length,
    photoCount: pendingTasks.filter((task) => task.requirePhoto).length,
    manualCount: pendingTasks.filter((task) => task.assignmentLabel === "院长发布" || task.assignmentLabel === "院长调整").length,
  };

  const directorAssignmentSummary = {
    activeTemplates: templateUsage.filter((item) => item.isActive).length,
    inactiveTemplates: templateUsage.filter((item) => !item.isActive).length,
    enabledPlanItems: elderPlanSummaries.reduce((total, plan) => total + plan.enabledCount, 0),
    unassignedCount: unassignedTasks.length,
    assignedCount: assignedTasks.length,
    riskCount: riskDirectorTasks.length,
  };

  const directorCoreSummary = {
    activeTemplates: templateUsage.filter((item) => item.isActive).length,
    configuredResidents: elderPlanSummaries.length,
    dispatchPending: dispatchTasks.filter((task) => !task.caregiverId).length,
    specialTemplates: templateUsage.filter((item) => item.group === "special" && item.isActive).length,
  };

  const dispatchSummary = {
    pendingCount: dispatchTasks.filter((task) => !task.caregiverId).length,
    assignedCount: dispatchTasks.filter((task) => task.caregiverId).length,
    urgentCount: dispatchTasks.filter((task) => task.status === "risk" || task.status === "refused").length,
  };

  return {
    selectedElder,
    selectedTask: selectedTask ? enrichTask(selectedTask) : null,
    selectedHistory,
    selectedTaskEvidence,
    taskEvidence: taskRecordEvidence,
    taskRecordEvidence,
    taskExceptionEvidence,
    quickExceptionEvidence,
    taskNotes: taskRecordNotes,
    taskRecordNotes,
    taskExceptionNotes,
    quickExceptionNotes,
    taskRecordDialog: state.ui.taskRecordDialog,
    caregiverTimelineFullscreen: Boolean(state.ui.caregiverTimelineFullscreen),
    elderTasks,
    elderVitals: state.vitals.filter((item) => item.elderId === state.ui.selectedElderId).slice(0, 4),
    pendingTasks,
    riskTasks,
    completedTasks,
    floorRooms,
    filteredHistory,
    floorSummaries,
    activeBatchJobs: state.batchJobs.filter((item) => !item.completed),
    unreadMessages: state.messages.filter((item) => !item.read).length,
    unreadFamilyMessages: state.family.messages.filter((item) => !item.read).length,
    directorSelectedFloor,
    directorSelectedTimeline,
    caregiverLoads,
    allDirectorTasks,
    unassignedTasks,
    assignedTasks,
    visibleDirectorTasks,
    riskDirectorTasks,
    dispatchTasks,
    visibleDispatchTasks,
    directorAuditFilters,
    directorAuditFloorOptions,
    directorAuditDateOptions,
    directorAuditProjectOptions: DIRECTOR_AUDIT_PROJECTS,
    directorProjectAuditRows,
    directorProjectAuditSummary,
    templateUsage,
    templateGroups,
    visibleTemplateGroups,
    templateOptions,
    elderPlanSummaries,
    directorPlanFloors: directorPlanFloorCards,
    directorPlanFloorStaff,
    directorPlanRooms: visibleDirectorPlanResidents,
    directorPlanResidentOptions: allDirectorPlanResidents,
    selectedDirectorPlan: selectedDirectorPlanRecord,
    selectedDirectorPlanResident,
    directorCareRecordDraft,
    directorCareRecordElders,
    selectedDirectorCareRecordElder,
    directorCareRecordSummary,
    caregiverDailyReportDraft,
    selectedCaregiverReportElder,
    caregiverDailyReportSummary,
    caregiverDailyReportStatus,
    batchExceptionPrompt,
    directorCloudReports,
    directorFilteredCloudReports,
    directorInboxSummary,
    directorTaskOverview,
    directorCaregiverStatistics,
    selectedDirectorCaregiverStat,
    directorExceptionReports,
    directorReadExceptionReports,
    cloudStatus,
    dailyReportTemplate: state.dailyReportTemplate,
    dailyReportTemplateOptions,
    directorReportTemplateDraft: state.ui.directorReportTemplateDraft,
    directorReportTemplateTransient: state.ui.directorReportTemplateTransient || { newSectionTitle: "", newItems: {} },
    directorReportTemplateScheduleSectionId: state.ui.directorReportTemplateScheduleSectionId,
    directorReportTemplateImport: buildReportTemplateImportView(),
    directorTemplateDraft: state.ui.directorTemplateDraft,
    directorDispatchDraft: state.ui.directorDispatchDraft,
    directorDispatchElderOptions,
    directorDispatchElderPicker,
    directorPlanNoteDraft,
    directorPlanTemporaryDialog,
    directorPlanDraft: state.ui.directorPlanDraft,
    directorPlanItemDraft: state.ui.directorPlanItemDraft,
    directorPersonnelType: state.ui.directorPersonnelType,
    directorPersonnelFloor: state.ui.directorPersonnelFloor,
    directorPersonnelDraft: state.ui.directorPersonnelDraft,
    directorPersonnelPlanDetailElderId: state.ui.directorPersonnelPlanDetailElderId,
    careLevelOptions: CARE_LEVEL_OPTIONS,
    reviewCycleOptions: REVIEW_CYCLE_OPTIONS,
    caregiverDashboard,
    directorAssignmentSummary,
    directorCoreSummary,
    dispatchSummary,
  };
}

refreshDirectorOverview();
syncDirectorPlanSelection();
setCurrentRoom(state.ui.selectedRoom);
