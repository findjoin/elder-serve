import {
  buildDirectorOverview,
  createCareRecordDraft,
  createDirectorCareRecordDraft,
  createMockState,
  createReportTemplateItems,
} from "../data/mockData.js";
import {
  createAnomaly,
  createAuthUser,
  createInventoryUsage,
  disableAuthUser,
  assignElderCaregiver,
  fetchAnomalies,
  fetchAttendanceRecords,
  fetchAuthUsers,
  fetchCaregiverTaskRecords,
  fetchCaregivers,
  fetchDailyReportTemplate,
  fetchDailyReportTemplates,
  fetchElders,
  fetchInstitution,
  fetchInventoryItems,
  fetchInventoryUsages,
  fetchLatestAppRelease,
  fetchPublishedTasks,
  fetchSyncStatus,
  updateCaregiver as updateCloudCaregiver,
  updateAuthUser,
  updateElder as updateCloudElder,
  getAuthToken,
  getCloudApiConfig,
  isCloudSyncConfigured,
  requestJson,
  setAuthToken,
  upsertAttendanceRecord,
  upsertInventoryItem,
  uploadDailyReportTemplate,
  uploadPublishedTask,
  uploadPublishedTasksBulk,
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

let directorCareReportsRequestInFlight = false;
let caregiverCareReportsRequestInFlight = false;
let inventoryRefreshInFlight = null;
const taskEvidenceRequestsInFlight = new Set();
let institutionStateRefreshInFlight = null;
const syncDomainVersions = {};
const TASK_SYNC_STATUS_TIMEOUT_MS = 6000;
const TASK_SYNC_FETCH_TIMEOUT_MS = 10000;
const INVENTORY_SYNC_STATUS_TIMEOUT_MS = 6000;
const taskRefreshInFlight = {
  caregiver: null,
  director: null,
};
const DEFAULT_SHIFT_TEMPLATES = [
  { id: "morning", name: "早班", start: "07:00", end: "15:00" },
  { id: "afternoon", name: "午班", start: "15:00", end: "23:00" },
  { id: "night", name: "晚班", start: "23:00", end: "07:00" },
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

function nowBeijingIso() {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date()).replace(" ", "T");
  return `${parts}+08:00`;
}

function formatNowDate() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai" }).format(new Date());
}

function getCaregiverRecordDate(options = {}) {
  if (options.recordDate) return options.recordDate;
  const uiDate = state.ui?.caregiverTaskRecordDate || "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(uiDate))) return uiDate;
  return formatNowDate();
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

function normalizeInventoryItem(item = {}) {
  const quantity = Number(item.quantity ?? item.stock ?? 0);
  const warningQuantity = Number(item.warningQuantity ?? item.warning_quantity ?? item.limit ?? 0);
  return {
    id: item.id || `inventory-${Date.now()}`,
    institutionId: item.institutionId || item.institution_id || state.institution.id,
    name: String(item.name || "").trim(),
    category: item.category || item.type || "消耗品",
    unit: item.unit || "件",
    quantity: Number.isFinite(quantity) ? Math.max(0, quantity) : 0,
    warningQuantity: Number.isFinite(warningQuantity) ? Math.max(0, warningQuantity) : 0,
    location: item.location || "",
    status: item.status || "active",
    updatedAt: item.updatedAt || item.updated_at || "",
  };
}

function normalizeInventoryUsage(item = {}) {
  return {
    id: item.id || `inventory-usage-${Date.now()}`,
    institutionId: item.institutionId || item.institution_id || state.institution.id,
    itemId: item.itemId || item.item_id || "",
    itemName: item.itemName || item.item_name || "",
    quantity: Math.max(0, Number(item.quantity || 0)),
    unit: item.unit || "件",
    caregiverId: item.caregiverId || item.caregiver_id || "",
    caregiverName: item.caregiverName || item.caregiver_name || "",
    note: item.note || "",
    usedAt: item.usedAt || item.used_at || item.createdAt || item.created_at || "",
    createdAt: item.createdAt || item.created_at || "",
  };
}

function mergeInventoryItems(items = []) {
  state.inventory = Array.isArray(state.inventory) ? state.inventory : [];
  items.map(normalizeInventoryItem).filter((item) => item.id && item.name).forEach((item) => {
    const index = state.inventory.findIndex((existing) => existing.id === item.id);
    if (index >= 0) {
      state.inventory.splice(index, 1, item);
    } else {
      state.inventory.unshift(item);
    }
  });
  state.inventory.sort((left, right) => {
    const warningDiff = Number(left.quantity <= left.warningQuantity) - Number(right.quantity <= right.warningQuantity);
    if (warningDiff) return warningDiff;
    return (left.name || "").localeCompare(right.name || "");
  });
  state.director.inventory = state.inventory;
  state.director.inventoryCategories = ["全部", ...Array.from(new Set(state.inventory.map((item) => item.category).filter(Boolean)))];
  state.director.inventorySummary = {
    types: state.inventory.filter((item) => item.status !== "deleted").length,
    warningCount: state.inventory.filter((item) => item.status !== "deleted" && item.quantity <= item.warningQuantity).length,
  };
}

function replaceInventoryItems(items = []) {
  state.inventory = items.map(normalizeInventoryItem).filter((item) => item.id && item.name);
  state.inventory.sort((left, right) => {
    const warningDiff = Number(left.quantity <= left.warningQuantity) - Number(right.quantity <= right.warningQuantity);
    if (warningDiff) return warningDiff;
    return (left.name || "").localeCompare(right.name || "");
  });
  state.director.inventory = state.inventory;
  state.director.inventoryCategories = ["全部", ...Array.from(new Set(state.inventory.map((item) => item.category).filter(Boolean)))];
  state.director.inventorySummary = {
    types: state.inventory.filter((item) => item.status !== "deleted").length,
    warningCount: state.inventory.filter((item) => item.status !== "deleted" && item.quantity <= item.warningQuantity).length,
  };
}

function mergeInventoryUsages(items = []) {
  state.inventoryUsages = Array.isArray(state.inventoryUsages) ? state.inventoryUsages : [];
  items.map(normalizeInventoryUsage).filter((item) => item.id && item.itemId).forEach((item) => {
    const index = state.inventoryUsages.findIndex((existing) => existing.id === item.id);
    if (index >= 0) {
      state.inventoryUsages.splice(index, 1, item);
    } else {
      state.inventoryUsages.unshift(item);
    }
  });
  state.inventoryUsages.sort((left, right) => String(right.usedAt || "").localeCompare(String(left.usedAt || "")));
}

function getInventoryItemById(itemId) {
  return (state.inventory || []).find((item) => item.id === itemId);
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

function getTaskEvidenceList(task = {}) {
  return [
    ...normalizeEvidenceList(task.recordEvidence),
    ...normalizeEvidenceList(task.exceptionEvidence),
  ];
}

function getTaskRecordText(task = {}) {
  return String(task.recordNote || task.exceptionNote || "").trim();
}

function hasCaregiverTaskOperation(task = {}) {
  return Boolean(
    task.status === "completed" ||
      task.status === "risk" ||
      task.status === "refused" ||
      task.completedAt ||
      task.exceptionReportedAt ||
      getTaskRecordText(task) ||
      getTaskEvidenceList(task).length ||
      Number(task.recordEvidenceCount || 0) ||
      Number(task.exceptionEvidenceCount || 0),
  );
}

function createAutoReportItemsFromTasks(tasks = [], template = Object.values(state.dailyReportTemplates || {})[0]) {
  const nextItems = createReportTemplateItems(template);
  const taskText = tasks
    .filter((task) => ["completed", "risk", "refused"].includes(task.status))
    .map((task) => `${task.title || ""} ${task.category || ""}`)
    .join(" ");

  (template?.sections || []).forEach((section) => {
    (section.items || []).forEach((item) => {
      const label = String(item.label || "").trim();
      if (!label) return;
      nextItems[item.id] = taskText.includes(label) || tasks.some((task) => label.includes(task.title || ""));
    });
  });

  return nextItems;
}

function createAutoCareRecordFromTimeline(elder, tasks = [], recordDate = formatNowDate(), existingRecord = null) {
  const operatedTasks = tasks.filter(hasCaregiverTaskOperation);
  const template = existingRecord?.reportTemplateSnapshot || Object.values(state.dailyReportTemplates || {})[0];
  const completedTasks = operatedTasks.filter((task) => task.status === "completed");
  const issueTasks = operatedTasks.filter((task) => task.status === "risk" || task.status === "refused");
  const evidence = operatedTasks.flatMap(getTaskEvidenceList);
  const notes = operatedTasks.map(getTaskRecordText).filter(Boolean);
  const reportItems = createAutoReportItemsFromTasks(operatedTasks, template);
  const nowTime = formatNowTime();
  const healthOther = issueTasks.map((task) => `${task.schedule || ""} ${task.title || ""} ${getTaskRecordText(task)}`.trim()).join("；");
  const treatment = issueTasks.length
    ? issueTasks.map((task) => getTaskRecordText(task) || `${task.title || "护理任务"}已记录异常`).join("；")
    : "";

  return cloneCareRecordDraft({
    ...(existingRecord || {}),
    id: existingRecord?.id || createCareReportId(elder.id, recordDate),
    institutionName: state.institution.name,
    elderId: elder.id,
    elderName: elder.name,
    gender: elder.gender || "",
    age: elder.age || "",
    room: elder.room || "",
    bed: elder.bed || "",
    careType: elder.careType || "semi-care",
    careLevelLabel: elder.level || "",
    recordDate,
    recordTime: nowTime,
    caregiverId: state.caregiver.id,
    caregiverName: state.caregiver.name,
    reviewerName: existingRecord?.reviewerName || "",
    reportTemplateSnapshot: template,
    reportItems,
    dailyCare: {
      ...(existingRecord?.dailyCare || {}),
      timelineCompleted: completedTasks.length > 0,
    },
    medication: existingRecord?.medication || {},
    health: {
      ...(existingRecord?.health || {}),
      none: issueTasks.length === 0,
      other: healthOther,
      treatment,
    },
    inventory: existingRecord?.inventory || {},
    signatures: {
      ...(existingRecord?.signatures || {}),
      caregiverSign: state.caregiver.name || "",
      remark: [
        `自动同步 ${operatedTasks.length} 项已操作任务卡，已完成 ${completedTasks.length} 项，异常 ${issueTasks.length} 项。`,
        notes.length ? `文字记录：${notes.join("；")}` : "",
        evidence.length ? `照片留痕：${evidence.length} 张。` : "",
      ].filter(Boolean).join("\n"),
    },
    timelineTaskSnapshot: operatedTasks.map((task) => ({
      taskId: task.id,
      title: task.title || "",
      schedule: task.schedule || "",
      status: task.status || "",
      note: getTaskRecordText(task),
      evidenceCount: getTaskEvidenceList(task).length + Number(task.recordEvidenceCount || 0) + Number(task.exceptionEvidenceCount || 0),
      evidence: getTaskEvidenceList(task),
      completedAt: task.completedAt || "",
      exceptionReportedAt: task.exceptionReportedAt || "",
    })),
    source: "caregiver-auto-timeline",
    syncStatus: existingRecord?.syncStatus || "local-draft",
    workflowStatus: existingRecord?.workflowStatus || "draft",
  });
}

function normalizeDailyReportTemplate(template = {}) {
  const fallback = Object.values(state.dailyReportTemplates || {})[0] || { id: "daily-report-basic", version: 1, title: "护理记录日报模板", sections: [] };
  const candidateCareLevel = template.careLevel || fallback.careLevel || "all";
  const normalized = {
    id: template.id || fallback.id || "daily-report-basic",
    version: Number(template.version || fallback.version || 1),
    title: String(template.title || fallback.title || "护理记录日报模板").trim(),
    description: String(template.description || fallback.description || "").trim(),
    careLevel: candidateCareLevel === "all" || CARE_LEVEL_OPTIONS.includes(candidateCareLevel) ? candidateCareLevel : "all",
    templateType: template.templateType || template.kind || fallback.templateType || "instance",
    baseTemplateId: template.baseTemplateId || fallback.baseTemplateId || "",
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
  const cloudItems = (importState.items || [])
    .map(normalizeCloudDailyReportTemplate)
    .filter((item) => item.sections.length && (item.templateType || "base") === "base");
  const institutions = new Map();

  (importState.institutions || []).forEach((institution) => {
    if (!institution?.id) return;
    institutions.set(institution.id, {
      id: institution.id,
      name: institution.name && institution.name !== institution.id ? institution.name : institution.id,
    });
  });
  cloudItems.forEach((item) => {
    if (!item.institutionId) return;
    institutions.set(item.institutionId, {
      id: item.institutionId,
      name: item.institutionName || institutions.get(item.institutionId)?.name || item.institutionId,
    });
  });
  if (!institutions.size && state.institution.id) {
    institutions.set(state.institution.id, {
      id: state.institution.id,
      name: state.institution.name || state.institution.id,
    });
  }

  const requestedInstitutionId = state.ui.directorReportTemplateImportInstitutionId || state.institution.id || "";
  const institutionIdsWithTemplates = new Set(cloudItems.map((item) => item.institutionId).filter(Boolean));
  const selectedInstitutionId = institutionIdsWithTemplates.has(requestedInstitutionId)
    ? requestedInstitutionId
    : institutionIdsWithTemplates.has(state.institution.id)
      ? state.institution.id
      : Array.from(institutions.keys())[0] || requestedInstitutionId;
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

function createDailyReportTemplateDraft(template) {
  const source = template || Object.values(state.dailyReportTemplates || {})[0] || { id: "daily-report-basic", version: 1, title: "护理记录日报模板", sections: [] };
  return normalizeDailyReportTemplate(JSON.parse(JSON.stringify(source)));
}

function createBlankDailyReportTemplateDraft() {
  return {
    id: `daily-report-${state.institution.id || "institution"}-${Date.now()}`,
    version: 1,
    title: "",
    description: "",
    careLevel: "all",
    templateType: "instance",
    baseTemplateId: "",
    sections: [],
    updatedAt: "",
  };
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

function hydrateReportItems(record = {}, template = Object.values(state.dailyReportTemplates || {})[0]) {
  return {
    ...createReportTemplateItems(template),
    ...(record.reportItems || {}),
  };
}

function applyDailyReportTemplate(template = {}, options = {}) {
  const nextTemplate = normalizeDailyReportTemplate(template);
  if (!nextTemplate.sections.length) return null;

  if (!state.dailyReportTemplates) state.dailyReportTemplates = {};
  state.dailyReportTemplates[nextTemplate.id] = nextTemplate;
  if (state.ui.caregiverDailyReportDraft) {
    state.ui.caregiverDailyReportDraft.reportTemplateSnapshot = nextTemplate;
    state.ui.caregiverDailyReportDraft.reportItems = hydrateReportItems(state.ui.caregiverDailyReportDraft, nextTemplate);
  }
  if (state.ui.directorCareRecordDraft) {
    state.ui.directorCareRecordDraft.reportTemplateSnapshot = nextTemplate;
    state.ui.directorCareRecordDraft.reportItems = hydrateReportItems(state.ui.directorCareRecordDraft, nextTemplate);
  }

  return nextTemplate;
}

function getDailyReportTemplateChoice(templateId = "") {
  const templates = Object.values(state.dailyReportTemplates || {});
  const currentTemplate = templateId
    ? templates.find((t) => t.id === templateId)
    : templates[0];
  return {
    id: currentTemplate?.id || templateId || "daily-report-basic",
    title: currentTemplate?.title || "护理记录日报模板",
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
  normalized.reportTemplateSnapshot = normalized.reportTemplateSnapshot || Object.values(state.dailyReportTemplates || {})[0];
  normalized.reportItems = hydrateReportItems(normalized, normalized.reportTemplateSnapshot);
  normalized.summary = normalized.summary || summarizeCareRecordDraft(normalized);
  return normalized;
}

function taskRecordOperationIsIssue(record = {}) {
  return ["task_exception", "quick_exception"].includes(String(record.operationType || ""));
}

function buildCareReportFromTaskRecordGroup(group = {}) {
  const records = Array.isArray(group.records) ? group.records : [];
  const first = records[0] || {};
  const elder = getElderById(group.elderId || first.elderId);
  const caregiver = getCaregiverById(group.caregiverId || first.caregiverId);
  const recordDate = group.recordDate || first.recordDate || formatNowDate();
  const issueRecords = records.filter(taskRecordOperationIsIssue);
  const noteRecords = records.filter((item) => String(item.note || "").trim());
  const photoCount = records.reduce((sum, item) => sum + Number(item.photoCount || 0), 0);
  const taskCount = new Set(records.map((item) => item.taskId || item.sourceId || item.id).filter(Boolean)).size;
  const latestTime = records
    .map((item) => item.operationTime || "")
    .filter(Boolean)
    .sort()
    .pop() || "";

  return cloneCareRecordDraft({
    id: `caregiver-task-record-${group.elderId || first.elderId || "unknown"}-${group.caregiverId || first.caregiverId || "unknown"}-${recordDate}`,
    institutionName: state.institution.name,
    elderId: group.elderId || first.elderId || "",
    elderName: elder?.name || group.elderName || first.elderName || "",
    gender: elder?.gender || "",
    age: elder?.age || "",
    room: elder?.room || first.elderRoom || "",
    bed: elder?.bed || first.elderBed || "",
    careType: elder?.careType || "semi-care",
    careLevelLabel: elder?.level || "",
    recordDate,
    recordTime: String(latestTime || "").slice(11, 16) || formatNowTime(),
    caregiverId: group.caregiverId || first.caregiverId || "",
    caregiverName: caregiver?.name || group.caregiverName || first.caregiverName || "",
    reviewerName: "",
    reportTemplateSnapshot: Object.values(state.dailyReportTemplates || {})[0],
    reportItems: {},
    dailyCare: {
      timelineCompleted: records.some((item) => item.operationType === "check"),
    },
    medication: {},
    health: {
      none: issueRecords.length === 0,
      other: issueRecords.map((item) => [item.taskTitle, item.note].filter(Boolean).join("：")).filter(Boolean).join("；"),
      treatment: issueRecords.map((item) => item.note || item.taskTitle || item.operationLabel).filter(Boolean).join("；"),
    },
    inventory: {},
    signatures: {
      caregiverSign: caregiver?.name || group.caregiverName || first.caregiverName || "",
      reviewerSign: "",
      remark: [
        `云端护工任务记录：${taskCount} 个任务卡操作。`,
        noteRecords.length ? `文字记录：${noteRecords.map((item) => item.note).join("；")}` : "",
        photoCount ? `图片记录：${photoCount} 张。` : "",
        issueRecords.length ? `异常记录：${issueRecords.length} 条。` : "",
      ].filter(Boolean).join("\n"),
    },
    timelineTaskSnapshot: records.map((item) => ({
      taskId: item.taskId || "",
      title: item.taskTitle || item.operationLabel || "",
      schedule: String(item.operationTime || "").slice(11, 16),
      status: item.taskStatus || "",
      note: item.note || "",
      evidenceCount: Number(item.photoCount || 0),
      evidence: Array.isArray(item.photos) ? item.photos : [],
      completedAt: item.operationType === "check" ? item.operationTime || "" : "",
      exceptionReportedAt: taskRecordOperationIsIssue(item) ? item.operationTime || "" : "",
    })),
    source: "caregiver-task-records",
    syncStatus: "synced",
    workflowStatus: "submitted",
    updatedAt: latestTime || `${formatNowDate()} ${formatNowTime()}`,
    submittedAt: latestTime || "",
  });
}

function groupTaskRecordsAsCareReports(records = []) {
  const groups = new Map();
  records.forEach((record) => {
    const key = [record.recordDate || "", record.elderId || "", record.caregiverId || ""].join("|");
    if (!groups.has(key)) {
      groups.set(key, {
        recordDate: record.recordDate || "",
        elderId: record.elderId || "",
        elderName: record.elderName || "",
        caregiverId: record.caregiverId || "",
        caregiverName: record.caregiverName || "",
        records: [],
      });
    }
    groups.get(key).records.push(record);
  });

  return Array.from(groups.values()).map((group) => buildCareReportFromTaskRecordGroup(group));
}

function mergeCloudCareRecord(record = {}, opts = {}) {
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

  if (!opts.skipSort) {
    state.cloud.careReports.sort((left, right) => {
      const cmp = String(right.updatedAt || "").localeCompare(String(left.updatedAt || ""));
      return cmp !== 0 ? cmp : (left.id || "").localeCompare(right.id || "");
    });
  }

  return cloneCareRecordDraft(normalized);
}

function serializeCloudTask(task = {}, sourceApp = task.sourceApp || "director-app") {
  const elder = getElderById(task.elderId);
  const caregiver = getCaregiverById(task.caregiverId);
  const defaultCaregiver = getCaregiverById(task.defaultCaregiverId);
  const timestamp = `${formatNowDate()} ${formatNowTime()}`;
  const hasExceptionDetail = Boolean(
    task.exceptionNote ||
      task.exceptionType ||
      task.exception ||
      task.exceptionReportedAt ||
      evidenceArray(task.exceptionEvidence).length,
  );
  const requestedStatus = task.status || "pending";
  const status =
    sourceApp === "director-app" || (["risk", "refused"].includes(requestedStatus) && !hasExceptionDetail)
      ? ["risk", "refused"].includes(requestedStatus)
        ? "pending"
        : requestedStatus
      : requestedStatus;

  return {
    taskId: task.id,
    institutionId: state.institution.id,
    institutionName: state.institution.name,
    recordDate: task.recordDate || state.director.date || "",
    elderId: task.elderId || "",
    elderName: elder?.name || task.elderName || "",
    elderRoom: elder?.room || task.elderRoom || "",
    elderBed: elder?.bed || task.elderBed || "",
    elderFloor: elder?.floor || task.elderFloor || "",
    caregiverId: task.caregiverId || "",
    caregiverName: caregiver?.name || task.caregiverName || "",
    defaultCaregiverId: task.defaultCaregiverId || "",
    defaultCaregiverName: defaultCaregiver?.name || task.defaultCaregiverName || "",
    planId: task.planId || "",
    planItemId: task.planItemId || "",
    templateId: task.templateId || "",
    title: task.title || "director-task",
    schedule: task.schedule || "即时",
    window: task.window || task.schedule || "即时",
    requirePhoto: Boolean(task.requirePhoto),
    status,
    note: status === "risk" || status === "refused" ? task.exceptionNote || task.note || "" : task.note || "",
    completedAt: task.completedAt || "",
    recordNote: task.recordNote || "",
    recordedAt: task.recordUpdatedAt || task.recordedAt || "",
    exceptionNote: task.exceptionNote || "",
    exceptionType: task.exceptionType || "",
    recordEvidence: normalizeEvidenceList(task.recordEvidence),
    exceptionEvidence: normalizeEvidenceList(task.exceptionEvidence),
    exceptionReportedAt: task.exceptionReportedAt || (hasExceptionDetail ? timestamp : ""),
    category: task.category || "",
    templateGroup: task.templateGroup || "special",
    source: task.source || "manual",
    sourceApp,
    assignmentMode: task.assignmentMode || "manual",
    assignmentStatus: task.assignmentStatus || "published",
    workflowStatus: "published",
    publishedAt: task.publishedAt || timestamp,
    acceptedAt: task.acceptedAt || "",
    cloudTaskId: task.cloudTaskId || task.id || "",
    updatedAt: timestamp,
  };
}

function normalizeCloudTask(task = {}) {
  const taskId = String(task.taskId || task.id || "");
  if (!taskId) return null;

  return {
    id: taskId,
    recordDate: task.recordDate || task.record_date || "",
    planId: task.planId || task.plan_id || "",
    planItemId: task.planItemId || task.plan_item_id || "",
    elderId: task.elderId || task.elder_id || "",
    elderName: task.elderName || task.elder_name || "",
    elderRoom: task.elderRoom || task.elder_room || "",
    elderBed: task.elderBed || task.elder_bed || "",
    elderFloor: normalizeFloorNumber(task.elderFloor || task.elder_floor, 0) || "",
    caregiverId: task.caregiverId || task.caregiver_id || "",
    defaultCaregiverId: task.defaultCaregiverId || task.default_caregiver_id || "",
    templateId: task.templateId || task.template_id || "",
    title: task.title || "院长发布任务",
    schedule: task.schedule || task.window || "即时",
    window: task.window || task.schedule || "即时",
    requirePhoto: Boolean(task.requirePhoto || task.require_photo),
    status: task.status || "pending",
    note: task.note || "",
    exceptionNote: task.exceptionNote || task.exception_note || "",
    exceptionType: task.exceptionType || task.exception_type || "",
    exceptionEvidence: task.exceptionEvidence || task.exception_evidence || null,
    exceptionEvidenceCount: Number(task.exceptionEvidenceCount || task.exception_evidence_count || 0),
    exceptionReportedAt: task.exceptionReportedAt || task.exception_reported_at || "",
    recordNote: task.recordNote || task.record_note || "",
    recordEvidence: task.recordEvidence || task.record_evidence || null,
    recordEvidenceCount: Number(task.recordEvidenceCount || task.record_evidence_count || 0),
    recordedAt: task.recordedAt || task.recorded_at || "",
    completedAt: task.completedAt || task.completed_at || "",
    caregiverName: task.caregiverName || task.caregiver_name || "",
    defaultCaregiverName: task.defaultCaregiverName || task.default_caregiver_name || "",
    category: task.category || "",
    templateGroup: task.templateGroup || task.template_group || "special",
    source: task.source || "manual",
    sourceApp: task.sourceApp || task.source_app || "",
    assignmentMode: task.assignmentMode || task.assignment_mode || "manual",
    assignmentStatus: task.assignmentStatus || task.assignment_status || "published",
    workflowStatus: task.workflowStatus || task.workflow_status || "published",
    description: task.description || task.note || "",
    publishedAt: task.publishedAt || task.published_at || task.updatedAt || task.updated_at || "",
    acceptedAt: task.acceptedAt || task.accepted_at || task.publishedAt || task.published_at || task.updatedAt || task.updated_at || "",
    planNote: task.planNote || "",
    cloudTaskId: task.id || task.cloudTaskId || task.cloud_task_id || taskId,
    updatedAt: task.updatedAt || task.updated_at || "",
  };
}

function mergeCloudTask(task = {}, opts = {}) {
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

  const taskIndex = state.tasks.findIndex((item) => {
    if (item.id === normalized.id || item.cloudTaskId === normalized.id) return true;
    if (normalized.cloudTaskId && (item.id === normalized.cloudTaskId || item.cloudTaskId === normalized.cloudTaskId)) return true;
    if (!normalized.planItemId || item.planItemId !== normalized.planItemId) return false;
    return (
      item.elderId === normalized.elderId &&
      item.caregiverId === normalized.caregiverId &&
      (!item.recordDate || !normalized.recordDate || item.recordDate === normalized.recordDate)
    );
  });

  if (taskIndex >= 0) {
    const local = state.tasks[taskIndex];
    for (var _ek of ["recordEvidence", "exceptionEvidence"]) {
      var _locEv = local[_ek];
      var _cldEv = normalized[_ek];
      if (!Array.isArray(_cldEv) && Array.isArray(_locEv)) {
        normalized[_ek] = _locEv;
        continue;
      }
      if (Array.isArray(_locEv) && Array.isArray(_cldEv)) {
        for (var _i = 0; _i < _locEv.length && _i < _cldEv.length; _i++) {
          if (_locEv[_i] && _locEv[_i].dataUrl && _cldEv[_i] && !_cldEv[_i].dataUrl) {
            _cldEv[_i] = { ..._cldEv[_i], dataUrl: _locEv[_i].dataUrl };
          }
        }
      }
    }
    state.tasks.splice(taskIndex, 1, {
      ...local,
      ...normalized,
    });
  } else {
    state.tasks.push(normalized);
  }

  if (!opts.skipSort) state.tasks = sortTasksBySchedule(state.tasks);
  return normalized;
}

function getTaskSyncKeys(task = {}) {
  return [
    task.id,
    task.taskId,
    task.cloudTaskId,
  ].filter(Boolean).map(String);
}

function taskMatchesSyncKeys(task = {}, keys = new Set()) {
  return getTaskSyncKeys(task).some((key) => keys.has(key));
}

function evidenceArray(value) {
  return Array.isArray(value) ? value : [];
}

function evidenceCount(task, keys) {
  return keys.reduce((total, key) => total + Number(task?.[key] || 0), 0);
}

function taskNeedsEvidenceHydration(task = {}) {
  if (task.status !== "risk" && task.status !== "refused") return false;
  const visibleEvidence = [
    ...evidenceArray(task.recordEvidence),
    ...evidenceArray(task.exceptionEvidence),
  ];
  if (visibleEvidence.some((item) => item && !item.dataUrl)) return true;
  const localEvidenceCount =
    evidenceArray(task.recordEvidence).length + evidenceArray(task.exceptionEvidence).length;
  const cloudEvidenceCount = evidenceCount(task, ["recordEvidenceCount", "exceptionEvidenceCount"]);
  return cloudEvidenceCount > localEvidenceCount;
}

function hydrateMissingDirectorExceptionEvidence(items = []) {
  const ids = [];
  items.forEach((item) => {
    const taskId = item?.taskId || item?.id || "";
    if (!taskId || !taskNeedsEvidenceHydration(item)) return;
    const local = state.tasks.find((task) => task.id === taskId || task.cloudTaskId === taskId);
    if (local && !taskNeedsEvidenceHydration(local)) return;
    ids.push(taskId);
  });
  ids.forEach((taskId) => actions.loadTaskEvidence(taskId));
}

function syncPendingElderTasksToCaregiver(elderId, caregiverId) {
  const targetCaregiver = getCaregiverById(caregiverId);
  if (!elderId || !targetCaregiver) return [];

  const targetDate = state.director.date || formatNowDate();
  const changedTasks = [];

  state.tasks.forEach((task) => {
    if (task.elderId !== elderId || isTemporaryTask(task)) return;
    const taskDate = task.recordDate || targetDate;
    if (taskDate !== targetDate) return;
    if ((task.status || "pending") !== "pending") return;

    const previousCaregiverId = task.caregiverId || "";
    if (previousCaregiverId === caregiverId && task.defaultCaregiverId === caregiverId && task.recordDate === targetDate) return;

    task.recordDate = targetDate;
    task.caregiverId = caregiverId;
    task.defaultCaregiverId = caregiverId;
    task.assignmentStatus = "published";
    if (previousCaregiverId !== caregiverId) {
      task.acceptedAt = "";
      task.publishedAt = formatNowTime();
    }
    changedTasks.push(task);
  });

  if (changedTasks.length) {
    state.tasks = sortTasksBySchedule(state.tasks);
    refreshDirectorOverview();
    ensureCurrentSelections();
  }

  return changedTasks;
}

async function uploadSyncedElderTasks(tasks = []) {
  if (!tasks.length || !isCloudSyncConfigured()) return { ok: true, count: 0 };

  const payloads = tasks.map((task) => serializeCloudTask(task, "director-app"));

  try {
    const response = await uploadPublishedTasksBulk(payloads);
    const cloudTasks = Array.isArray(response?.items)
      ? response.items
      : Array.isArray(response?.tasks)
        ? response.tasks
        : [];
    cloudTasks.forEach((cloudTask) => mergeCloudTask(cloudTask, { skipSort: true }));
    state.tasks = sortTasksBySchedule(state.tasks);
    setCloudTasksFetchedAt(response?.fetchedAt || `${formatNowDate()} ${formatNowTime()}`);
    setCloudTasksError("");
    return { ok: true, count: cloudTasks.length || tasks.length };
  } catch (error) {
    const message = String(error?.message || "");
    if (!message.includes("404") && !message.toLowerCase().includes("not found")) {
      setCloudTasksError(error?.message || "任务云端同步失败");
      return { ok: false, count: 0 };
    }
  }

  let syncedCount = 0;
  for (const payload of payloads) {
    try {
      const response = await uploadPublishedTask(payload);
      const cloudTask = response?.item || response?.task || payload;
      mergeCloudTask(cloudTask, { skipSort: true });
      syncedCount += 1;
    } catch (error) {
      state.tasks = sortTasksBySchedule(state.tasks);
      setCloudTasksError(error?.message || "任务云端同步失败");
      return { ok: false, count: syncedCount };
    }
  }

  state.tasks = sortTasksBySchedule(state.tasks);
  setCloudTasksFetchedAt(`${formatNowDate()} ${formatNowTime()}`);
  setCloudTasksError("");
  return { ok: true, count: syncedCount };
}

async function syncElderAssignmentToCloud(elderId, caregiverId) {
  if (!elderId || !caregiverId || !isCloudSyncConfigured()) return { ok: true, count: 0 };
  try {
    const response = await assignElderCaregiver({
      institutionId: state.institution.id,
      elderId,
      caregiverId,
      recordDate: state.director.date || formatNowDate(),
    });
    const cloudTasks = Array.isArray(response?.tasks) ? response.tasks : [];
    cloudTasks.forEach((cloudTask) => mergeCloudTask(cloudTask, { skipSort: true }));
    state.tasks = sortTasksBySchedule(state.tasks);
    setCloudTasksFetchedAt(response?.fetchedAt || `${formatNowDate()} ${formatNowTime()}`);
    setCloudTasksError("");
    return { ok: true, count: Number(response?.item?.updatedTaskCount || cloudTasks.length || 0) };
  } catch (error) {
    setCloudTasksError(error?.message || "任务云端同步失败");
    return { ok: false, count: 0 };
  }
}

function buildInstitutionStateSnapshot() {
  const timestamp = `${formatNowDate()} ${formatNowTime()}`;
  const recordDate = formatNowDate();
  ensureAttendanceState();
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
      dailyReportTemplates: JSON.parse(JSON.stringify(state.dailyReportTemplates || {})),
      elderCarePlans: JSON.parse(JSON.stringify(state.elderCarePlans || [])),
      dailyReports: JSON.parse(JSON.stringify(state.dailyReports || [])),
      temporaryTasks,
      recordDate,
      selectedRecordDate: recordDate,
      taskSignalVersion: state.taskSignalVersion || 0,
      updatedAt: timestamp,
    },
    personnelInfo: {
      caregivers: filterSnapshotCaregiversForCurrentInstitution(dedupeCaregiverRecords(state.caregivers || [])),
      elders: dedupeElderRecords(state.elders || []),
      attendance: JSON.parse(JSON.stringify(state.attendance || {})),
      updatedAt: timestamp,
    },
    institutionInfo: {
      institution: JSON.parse(JSON.stringify(state.institution || {})),
      floorCount: Math.max(0, ...state.elders.map((elder) => Number(elder.floor || 0))),
      roomCount: state.elders.length,
      roomsByFloor,
      dailyReportTemplateId: Object.keys(state.dailyReportTemplates || {})[0] || "",
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

function normalizeFloorNumber(value, fallback = 1) {
  const floor = Number.parseInt(value, 10);
  return Number.isFinite(floor) && floor > 0 ? floor : fallback;
}

function normalizeCaregiverDedupeValue(value) {
  return String(value || "").trim().toLowerCase();
}

function getCaregiverDedupeKeys(caregiver = {}) {
  const keys = [];
  const id = normalizeCaregiverDedupeValue(caregiver.id);
  const employeeNo = normalizeCaregiverDedupeValue(caregiver.employeeNo || caregiver.employee_no);
  const name = normalizeCaregiverDedupeValue(caregiver.name);
  const floor = normalizeCaregiverDedupeValue(caregiver.floor);
  const username = normalizeCaregiverDedupeValue(caregiver.username);
  if (id) keys.push(`id:${id}`);
  if (employeeNo) keys.push(`employee:${employeeNo}`);
  if (username) keys.push(`username:${username}`);
  if (name && floor) keys.push(`name-floor:${name}:${floor}`);
  return keys;
}

function caregiverRecordScore(caregiver = {}) {
  let score = 0;
  const id = String(caregiver.id || "");
  if (caregiver.cloudUserId) score += 100;
  if (caregiver.username) score += 40;
  if (id && !id.includes("-demo-")) score += 20;
  if (caregiver.employeeNo || caregiver.employee_no) score += 10;
  if (caregiver.status === "on-duty" || caregiver.status === "active") score += 5;
  return score;
}

function mergeCaregiverRecords(primary = {}, fallback = {}) {
  const merged = { ...fallback, ...primary };
  Object.keys(fallback).forEach((key) => {
    if (merged[key] === undefined || merged[key] === null || merged[key] === "") {
      merged[key] = fallback[key];
    }
  });
  merged.floor = normalizeFloorNumber(merged.floor, normalizeFloorNumber(fallback.floor, 1));
  return merged;
}

function dedupeCaregiverRecords(caregivers = []) {
  const result = [];
  const keyToIndex = new Map();
  caregivers.forEach((item) => {
    if (!item || typeof item !== "object") return;
    const record = JSON.parse(JSON.stringify(item));
    record.floor = normalizeFloorNumber(record.floor, 1);
    const keys = getCaregiverDedupeKeys(record);
    const existingIndexes = keys.map((key) => keyToIndex.get(key)).filter((index) => index !== undefined);
    const existingIndex = existingIndexes.length ? existingIndexes[0] : -1;
    if (existingIndex < 0) {
      const nextIndex = result.length;
      result.push(record);
      keys.forEach((key) => keyToIndex.set(key, nextIndex));
      return;
    }
    const existing = result[existingIndex];
    const preferred = caregiverRecordScore(record) > caregiverRecordScore(existing) ? record : existing;
    const fallback = preferred === record ? existing : record;
    result[existingIndex] = mergeCaregiverRecords(preferred, fallback);
    getCaregiverDedupeKeys(result[existingIndex]).forEach((key) => keyToIndex.set(key, existingIndex));
  });
  return result;
}

function getAuthoritativeCloudCaregiverIds() {
  const ids = new Set();
  (state.caregivers || []).forEach((caregiver) => {
    if (caregiver?.cloudUserId && caregiver?.id) ids.add(caregiver.id);
  });
  return ids;
}

function filterSnapshotCaregiversForCurrentInstitution(caregivers = []) {
  const authoritativeIds = getAuthoritativeCloudCaregiverIds();
  if (!authoritativeIds.size) return caregivers;
  return caregivers.filter((caregiver) => authoritativeIds.has(caregiver?.id));
}

function normalizeElderDedupeValue(value) {
  return String(value || "").trim().toLowerCase();
}

function getElderDedupeKeys(elder = {}) {
  const keys = [];
  const id = normalizeElderDedupeValue(elder.id);
  const room = normalizeElderDedupeValue(elder.room);
  const bed = normalizeElderDedupeValue(elder.bed);
  const name = normalizeElderDedupeValue(elder.name);
  if (id) keys.push(`id:${id}`);
  if (room && bed) keys.push(`room-bed:${room}:${bed}`);
  if (name && room) keys.push(`name-room:${name}:${room}`);
  return keys;
}

function elderRecordScore(elder = {}) {
  let score = 0;
  const id = String(elder.id || "");
  const familyAccounts = Array.isArray(elder.familyAccounts) ? elder.familyAccounts : [];
  if (familyAccounts.length) score += 100 + familyAccounts.length;
  if (elder.familyUserId) score += 80;
  if (elder.username) score += 30;
  if (id && !id.includes("-demo-")) score += 20;
  if (elder.assignedCaregiverId && !String(elder.assignedCaregiverId).includes("-demo-")) score += 10;
  if (elder.room) score += 5;
  return score;
}

function mergeElderRecords(primary = {}, fallback = {}) {
  const merged = { ...fallback, ...primary };
  Object.keys(fallback).forEach((key) => {
    if (merged[key] === undefined || merged[key] === null || merged[key] === "") {
      merged[key] = fallback[key];
    }
  });
  merged.floor = normalizeFloorNumber(merged.floor, normalizeFloorNumber(fallback.floor, 1));
  const accounts = [
    ...(Array.isArray(fallback.familyAccounts) ? fallback.familyAccounts : []),
    ...(Array.isArray(primary.familyAccounts) ? primary.familyAccounts : []),
  ];
  const accountMap = new Map();
  accounts.forEach((account) => {
    const key = account?.id || account?.username;
    if (key && !accountMap.has(key)) accountMap.set(key, account);
  });
  merged.familyAccounts = Array.from(accountMap.values());
  if (!merged.familyUserId && merged.familyAccounts[0]) {
    merged.familyUserId = merged.familyAccounts[0].id || "";
    merged.familyUserStatus = merged.familyAccounts[0].status || "";
    merged.username = merged.username || merged.familyAccounts[0].username || "";
  }
  return merged;
}

function mergeCloudEldersIntoState(cloudElders = [], users = []) {
  const normalized = (Array.isArray(cloudElders) ? cloudElders : [])
    .filter((elder) => elder && elder.id)
    .map((elder) => ({
      ...elder,
      institutionId: elder.institutionId || elder.institution_id || state.institution.id || "",
      floor: normalizeFloorNumber(elder.floor, 1),
      assignedCaregiverId: elder.assignedCaregiverId || elder.assigned_caregiver_id || "",
      reportTemplateId: elder.reportTemplateId || elder.report_template_id || "",
      reportTemplateTitle: elder.reportTemplateTitle || elder.report_template_title || "",
    }));
  if (!normalized.length) return false;

  const previous = JSON.stringify([...state.elders].sort((a, b) => (a.id || "").localeCompare(b.id || "")));
  let merged = dedupeElderRecords([...normalized, ...(state.elders || [])]);
  const cloudById = new Map(normalized.map((elder) => [elder.id, elder]));
  merged = merged.map((elder) => {
    const cloud = cloudById.get(elder.id);
    if (!cloud) return elder;
    return {
      ...elder,
      ...cloud,
      familyAccounts: elder.familyAccounts || cloud.familyAccounts || [],
      familyUserIds: elder.familyUserIds || cloud.familyUserIds || [],
      familyUserId: elder.familyUserId || cloud.familyUserId || "",
      familyUserStatus: elder.familyUserStatus || cloud.familyUserStatus || "",
      username: elder.username || cloud.username || "",
    };
  });
  if (Array.isArray(users) && users.length) {
    merged = attachFamilyAccountsToElders(merged, users);
  }
  state.elders = JSON.parse(JSON.stringify(merged.sort((a, b) => (a.id || "").localeCompare(b.id || ""))));
  return JSON.stringify(state.elders) !== previous;
}

function dedupeElderRecords(elders = []) {
  const result = [];
  const keyToIndex = new Map();
  elders.forEach((item) => {
    if (!item || typeof item !== "object") return;
    const record = JSON.parse(JSON.stringify(item));
    record.floor = normalizeFloorNumber(record.floor, 1);
    const keys = getElderDedupeKeys(record);
    const existingIndexes = keys.map((key) => keyToIndex.get(key)).filter((index) => index !== undefined);
    const existingIndex = existingIndexes.length ? existingIndexes[0] : -1;
    if (existingIndex < 0) {
      const nextIndex = result.length;
      result.push(record);
      keys.forEach((key) => keyToIndex.set(key, nextIndex));
      return;
    }
    const existing = result[existingIndex];
    const preferred = elderRecordScore(record) > elderRecordScore(existing) ? record : existing;
    const fallback = preferred === record ? existing : record;
    result[existingIndex] = mergeElderRecords(preferred, fallback);
    getElderDedupeKeys(result[existingIndex]).forEach((key) => keyToIndex.set(key, existingIndex));
  });
  return result;
}

function attachFamilyAccountsToElders(elders = [], users = []) {
  const familyUsersByElderId = new Map();
  users.filter((u) => u.role === "family" && u.status === "active").forEach((user) => {
    const elderId = user.roleEntityId || user.role_entity_id || "";
    if (!elderId) return;
    if (!familyUsersByElderId.has(elderId)) familyUsersByElderId.set(elderId, []);
    familyUsersByElderId.get(elderId).push({
      id: user.id || "",
      username: user.username || "",
      displayName: user.displayName || user.display_name || user.username || "",
      status: user.status || "",
    });
  });
  return elders.map((elder) => {
    const familyAccounts = familyUsersByElderId.get(elder.id) || elder.familyAccounts || [];
    const primaryAccount = familyAccounts[0] || null;
    return {
      ...elder,
      familyAccounts,
      familyUserIds: familyAccounts.map((account) => account.id).filter(Boolean),
      familyUserId: elder.familyUserId || primaryAccount?.id || "",
      familyUserStatus: elder.familyUserStatus || primaryAccount?.status || "",
      username: elder.username || primaryAccount?.username || "",
    };
  });
}

function ensureAttendanceState() {
  state.attendance = state.attendance || {};
  state.attendance.shiftTemplates = Array.isArray(state.attendance.shiftTemplates) && state.attendance.shiftTemplates.length
    ? state.attendance.shiftTemplates
    : JSON.parse(JSON.stringify(DEFAULT_SHIFT_TEMPLATES));
  state.attendance.records = Array.isArray(state.attendance.records) ? state.attendance.records : [];
  state.ui.selectedAttendanceShift = state.ui.selectedAttendanceShift || "all";
  state.ui.attendanceShiftSettingsOpen = Boolean(state.ui.attendanceShiftSettingsOpen);
  return state.attendance;
}

function getCaregiverDefaultShiftIds(caregiver = {}) {
  ensureAttendanceState();
  const knownIds = new Set(state.attendance.shiftTemplates.map((shift) => shift.id));
  const raw = Array.isArray(caregiver.shiftIds) && caregiver.shiftIds.length
    ? caregiver.shiftIds
    : [caregiver.defaultShiftId || "morning"];
  return raw.filter((id) => knownIds.has(id));
}

function timeToMinutes(value = "00:00") {
  const [hour, minute] = String(value || "00:00").split(":").map((item) => Number.parseInt(item, 10) || 0);
  return hour * 60 + minute;
}

function buildCaregiverShiftSchedules(date = formatNowDate()) {
  ensureAttendanceState();
  return state.caregivers
    .filter((caregiver) => caregiver.cloudUserId)
    .flatMap((caregiver) => getCaregiverDefaultShiftIds(caregiver).map((shiftId) => {
      const shift = state.attendance.shiftTemplates.find((item) => item.id === shiftId) || state.attendance.shiftTemplates[0];
      const record = state.attendance.records.find(
        (item) => item.date === date && item.caregiverId === caregiver.id && item.shiftId === shift.id,
      );
      return {
        id: `${date}:${caregiver.id}:${shift.id}`,
        date,
        caregiverId: caregiver.id,
        caregiverName: caregiver.name,
        shiftId: shift.id,
        shiftName: shift.name,
        start: shift.start,
        end: shift.end,
        clockInAt: record?.clockInAt || "",
        clockOutAt: record?.clockOutAt || "",
        late: Boolean(record?.clockInAt && timeToMinutes(record.clockInAt) > timeToMinutes(shift.start) + 30),
        status: record?.clockInAt
          ? (timeToMinutes(record.clockInAt) > timeToMinutes(shift.start) + 30 ? "late" : "checked-in")
          : "missing",
      };
    }));
}

function buildDirectorAttendanceSummary(date = formatNowDate(), shiftId = "all") {
  const schedules = buildCaregiverShiftSchedules(date);
  const visibleSchedules = shiftId && shiftId !== "all" ? schedules.filter((item) => item.shiftId === shiftId) : schedules;
  const unitKeys = shiftId && shiftId !== "all"
    ? visibleSchedules.map((item) => item.id)
    : Array.from(new Set(visibleSchedules.map((item) => item.caregiverId)));
  const checkedInKeys = new Set();
  const lateKeys = new Set();
  visibleSchedules.forEach((item) => {
    const key = shiftId && shiftId !== "all" ? item.id : item.caregiverId;
    if (item.clockInAt) checkedInKeys.add(key);
    if (item.late) lateKeys.add(key);
  });
  const expected = unitKeys.length;
  const checkedIn = checkedInKeys.size;
  const late = lateKeys.size;
  const missing = Math.max(0, expected - checkedIn);
  return {
    date,
    shiftId,
    expected,
    checkedIn,
    late,
    missing,
    rate: expected ? `${Math.round((checkedIn / expected) * 100)}%` : "0%",
    schedules: visibleSchedules,
    shiftTemplates: ensureAttendanceState().shiftTemplates,
    settingsOpen: Boolean(state.ui.attendanceShiftSettingsOpen),
  };
}

function normalizeAttendanceRecord(record = {}) {
  const date = record.date || record.recordDate || record.record_date || formatNowDate();
  const clockInRaw = record.clockInAt || record.clock_in_at || "";
  const clockOutRaw = record.clockOutAt || record.clock_out_at || "";
  const shiftId = record.shiftId || record.shift_id || "morning";
  const shift = ensureAttendanceState().shiftTemplates.find((item) => item.id === shiftId) || {};
  return {
    id: record.id || `attendance-${date}-${record.caregiverId || record.caregiver_id || ""}-${shiftId}`,
    institutionId: record.institutionId || record.institution_id || "",
    date,
    recordDate: date,
    caregiverId: record.caregiverId || record.caregiver_id || "",
    caregiverName: record.caregiverName || record.caregiver_name || "",
    employeeNo: record.employeeNo || record.employee_no || "",
    registeredUserId: record.registeredUserId || record.registered_user_id || "",
    username: record.username || "",
    shiftId,
    shiftName: record.shiftName || record.shift_name || shift.name || "",
    shiftStart: record.shiftStart || record.shift_start || shift.start || "",
    shiftEnd: record.shiftEnd || record.shift_end || shift.end || "",
    clockInAt: clockInRaw,
    clockOutAt: clockOutRaw,
    clockInTime: String(clockInRaw || "").slice(11, 16) || clockInRaw,
    status: record.status || "",
    late: Boolean(record.late),
    lateMinutes: Number(record.lateMinutes ?? record.late_minutes ?? 0) || 0,
    source: record.source || "",
    updatedAt: record.updatedAt || record.updated_at || "",
  };
}

function mergeAttendanceRecord(record = {}) {
  const normalized = normalizeAttendanceRecord(record);
  if (!normalized.caregiverId || !normalized.date || !normalized.shiftId) return null;
  ensureAttendanceState();
  const index = state.attendance.records.findIndex(
    (item) => item.date === normalized.date && item.caregiverId === normalized.caregiverId && item.shiftId === normalized.shiftId,
  );
  if (index >= 0) {
    state.attendance.records[index] = { ...state.attendance.records[index], ...normalized };
  } else {
    state.attendance.records.push(normalized);
  }
  return normalized;
}

function buildAttendancePayloadFromRecord(record = {}) {
  const institutionId = getCurrentSessionInstitutionId();
  const caregiver = state.caregiver || {};
  const shift = ensureAttendanceState().shiftTemplates.find((item) => item.id === record.shiftId) || {};
  return {
    institutionId,
    recordDate: record.date || record.recordDate || formatNowDate(),
    caregiverId: record.caregiverId || caregiver.id,
    caregiverName: record.caregiverName || caregiver.name || "",
    employeeNo: record.employeeNo || caregiver.employeeNo || "",
    registeredUserId: caregiver.cloudUserId || state.session?.user?.id || "",
    username: caregiver.username || state.session?.user?.username || "",
    shiftId: record.shiftId || shift.id || "morning",
    shiftName: record.shiftName || shift.name || "",
    shiftStart: record.shiftStart || shift.start || "",
    shiftEnd: record.shiftEnd || shift.end || "",
    clockInAt: record.clockInAt || nowBeijingIso(),
    clockOutAt: record.clockOutAt || "",
    source: "caregiver-app",
    rawPayload: {
      location: state.session.clockInLocation || "",
      locationRaw: state.session.clockInLocationRaw || null,
    },
  };
}

function recordCurrentCaregiverClockIn() {
  if (!state.caregiver?.id) return null;
  ensureAttendanceState();
  const date = formatNowDate();
  const nowTime = formatNowTime();
  const clockInAt = nowBeijingIso();
  const currentMinutes = timeToMinutes(nowTime);
  const shiftIds = getCaregiverDefaultShiftIds(state.caregiver);
  const candidates = state.attendance.shiftTemplates.filter((shift) => shiftIds.includes(shift.id));
  const targetShift = candidates.find((shift) => {
    const start = timeToMinutes(shift.start);
    const end = timeToMinutes(shift.end);
    if (end <= start) return currentMinutes >= start || currentMinutes < end;
    return currentMinutes >= start && currentMinutes < end;
  }) || candidates[0] || state.attendance.shiftTemplates[0];
  const existing = state.attendance.records.find(
    (item) => item.date === date && item.caregiverId === state.caregiver.id && item.shiftId === targetShift.id,
  );
  if (existing) {
    existing.clockInAt = existing.clockInAt || clockInAt;
    existing.clockInTime = existing.clockInTime || nowTime;
    return existing;
  }
  const record = {
    id: `attendance-${date}-${state.caregiver.id}-${targetShift.id}`,
    institutionId: getCurrentSessionInstitutionId(),
    date,
    recordDate: date,
    caregiverId: state.caregiver.id,
    caregiverName: state.caregiver.name,
    employeeNo: state.caregiver.employeeNo || "",
    registeredUserId: state.caregiver.cloudUserId || state.session?.user?.id || "",
    username: state.caregiver.username || state.session?.user?.username || "",
    shiftId: targetShift.id,
    shiftName: targetShift.name,
    shiftStart: targetShift.start,
    shiftEnd: targetShift.end,
    clockInAt,
    clockInTime: nowTime,
    clockOutAt: "",
  };
  state.attendance.records.push(record);
  return record;
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
    const snapshotCaregivers = filterSnapshotCaregiversForCurrentInstitution(personnelInfo.caregivers);
    if (snapshotCaregivers.length || !state.caregivers.some((c) => c.cloudUserId)) {
      const existingAccounts = {};
      state.caregivers.forEach((c) => {
        if (c.cloudUserId) {
          existingAccounts[c.id] = {
            cloudUserId: c.cloudUserId,
            cloudUserStatus: c.cloudUserStatus,
            username: c.username,
            passwordHint: c.passwordHint,
          };
        }
      });
      const cloudIds = new Set(snapshotCaregivers.map((c) => c.id));
      const localOnly = state.caregivers.filter((c) => !cloudIds.has(c.id));
      const combined = [...snapshotCaregivers, ...localOnly];
      combined.forEach((c) => {
        if (existingAccounts[c.id]) {
          c.cloudUserId = existingAccounts[c.id].cloudUserId;
          c.cloudUserStatus = existingAccounts[c.id].cloudUserStatus;
          c.username = c.username || existingAccounts[c.id].username;
          c.passwordHint = c.passwordHint || existingAccounts[c.id].passwordHint || "";
        }
      });
      const sorted = dedupeCaregiverRecords(combined).sort((a, b) => (a.id || "").localeCompare(b.id || ""));
      const prev = JSON.stringify([...state.caregivers].sort((a, b) => (a.id || "").localeCompare(b.id || "")));
      state.caregivers = JSON.parse(JSON.stringify(sorted));
      if (JSON.stringify(sorted) !== prev) structureChanged = true;
    }
  }
  if (Array.isArray(personnelInfo.elders)) {
    const hasCloudData = state.elders.some((e) => e.familyUserId);
    if (personnelInfo.elders.length || !hasCloudData) {
      const existingAccounts = {};
      const existingAssignments = {};
      state.elders.forEach((e) => {
        if (e.familyUserId) existingAccounts[e.id] = { familyUserId: e.familyUserId, familyUserStatus: e.familyUserStatus, username: e.username };
        if (e.assignedCaregiverId) existingAssignments[e.id] = e.assignedCaregiverId;
      });
      const snapshotElders = personnelInfo.elders.map((e) => {
        const item = { ...e };
        if (!item.assignedCaregiverId && existingAssignments[item.id]) {
          item.assignedCaregiverId = existingAssignments[item.id];
        }
        return item;
      });
      const cloudIds = new Set(snapshotElders.map((e) => e.id));
      const localOnly = state.elders.filter((e) => !cloudIds.has(e.id));
      const combined = [...snapshotElders, ...localOnly];
      combined.forEach((e) => {
        if (existingAccounts[e.id]) {
          e.familyUserId = existingAccounts[e.id].familyUserId;
          e.familyUserStatus = existingAccounts[e.id].familyUserStatus;
          e.username = e.username || existingAccounts[e.id].username;
        }
      });
      const sorted = dedupeElderRecords(combined).sort((a, b) => (a.id || "").localeCompare(b.id || ""));
      const prev = JSON.stringify([...state.elders].sort((a, b) => (a.id || "").localeCompare(b.id || "")));
      state.elders = JSON.parse(JSON.stringify(sorted));
      if (JSON.stringify(sorted) !== prev) structureChanged = true;
    }
  }
  if (personnelInfo.attendance && typeof personnelInfo.attendance === "object") {
    const prev = JSON.stringify(state.attendance || {});
    state.attendance = {
      ...ensureAttendanceState(),
      ...JSON.parse(JSON.stringify(personnelInfo.attendance)),
    };
    ensureAttendanceState();
    if (JSON.stringify(state.attendance || {}) !== prev) structureChanged = true;
  } else {
    ensureAttendanceState();
  }
  if (institutionInfo.institution) {
    const prevInst = JSON.stringify(state.institution);
    state.institution = { ...state.institution, ...JSON.parse(JSON.stringify(institutionInfo.institution)) };
    const nextInst = JSON.stringify(state.institution);
    if (nextInst !== prevInst) {
      structureChanged = true;
    }
  }
  if (taskInfo.dailyReportTemplates && Object.keys(taskInfo.dailyReportTemplates).length) {
    const prev = JSON.stringify(state.dailyReportTemplates || {});
    state.dailyReportTemplates = JSON.parse(JSON.stringify(taskInfo.dailyReportTemplates));
    if (JSON.stringify(state.dailyReportTemplates) !== prev) structureChanged = true;
  } else if (taskInfo.dailyReportTemplate?.sections?.length) {
    const tpl = normalizeDailyReportTemplate(taskInfo.dailyReportTemplate);
    if (!state.dailyReportTemplates) state.dailyReportTemplates = {};
    state.dailyReportTemplates[tpl.id] = tpl;
    structureChanged = true;
  }
  if (Array.isArray(taskInfo.elderCarePlans)) {
    const sorted = [...taskInfo.elderCarePlans].sort((a, b) => (a.elderId || a.id || "").localeCompare(b.elderId || b.id || ""));
    const prev = JSON.stringify([...state.elderCarePlans].sort((a, b) => (a.elderId || a.id || "").localeCompare(b.elderId || b.id || "")));
    state.elderCarePlans = JSON.parse(JSON.stringify(sorted));
    if (JSON.stringify(sorted) !== prev) structureChanged = true;
  }
  const cloudRecordDate = taskInfo.recordDate || taskInfo.record_date || taskInfo.selectedRecordDate || "";
  const localBusinessDate = formatNowDate();
  const effectiveCloudRecordDate = cloudRecordDate && cloudRecordDate >= localBusinessDate ? cloudRecordDate : "";
  if (cloudRecordDate && cloudRecordDate < localBusinessDate) {
    taskInfo.recordDate = localBusinessDate;
    taskInfo.selectedRecordDate = localBusinessDate;
    changed = true;
  }
  if (effectiveCloudRecordDate && state.director.date !== effectiveCloudRecordDate) {
    state.director.date = effectiveCloudRecordDate;
    if (!state.ui.directorAuditDate) state.ui.directorAuditDate = effectiveCloudRecordDate;
    changed = true;
  }

  if (structureChanged) {
    if (state.session.identity === "caregiver" && bindCurrentCaregiverFromSession()) {
      // Current caregiver is pinned by session.roleEntityId, not by list order.
    } else {
      const currentCaregiver = state.caregiver?.id ? getCaregiverById(state.caregiver.id) : null;
      if (currentCaregiver) {
        state.caregiver = { ...currentCaregiver };
      }
    }
    changed = true;
  }

  if (Array.isArray(taskInfo.dailyReports)) {
    state.dailyReports = JSON.parse(JSON.stringify(taskInfo.dailyReports));
    if (!taskInfo.dailyReports.length) state.cloud.careReports = [];
    taskInfo.dailyReports.forEach((record) => mergeCloudCareRecord(record, { skipSort: true }));
    state.cloud.careReports.sort((left, right) => {
      const cmp = String(right.updatedAt || "").localeCompare(String(left.updatedAt || ""));
      return cmp !== 0 ? cmp : (left.id || "").localeCompare(right.id || "");
    });
  }

  if (Array.isArray(taskInfo.temporaryTasks)) {
    taskInfo.temporaryTasks.forEach((task) => {
      if (isTemporaryTask(task)) mergeCloudTask(task, { skipSort: true });
    });
    if (taskInfo.temporaryTasks.some((t) => isTemporaryTask(t))) state.tasks = sortTasksBySchedule(state.tasks);
  }

  if (taskInfo.taskSignalVersion && taskInfo.taskSignalVersion > (state.lastTaskSignalVersion || 0)) {
    state.lastTaskSignalVersion = taskInfo.taskSignalVersion;
    if (state.session.identity === "caregiver") {
      changed = true;
      setTimeout(() => actions.refreshCaregiverCloudTasks({ force: true }), 200);
    }
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
    reportTemplate: Object.values(state.dailyReportTemplates || {})[0],
  });
}

function findDailyReport(elderId, recordDate = formatNowDate()) {
  return state.dailyReports.find(
    (item) => item.elderId === elderId && item.recordDate === recordDate && item.caregiverId === state.caregiver.id,
  );
}

function getHistoryRecordDate(item) {
  const text = String(item?.time || "");
  const match = text.match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : "";
}

function getHistoryFilterRecordDate() {
  const filter = state.ui.historyFilter.time;
  const today = formatNowDate();
  if (filter === "昨日") return shiftDate(today, -1);
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(filter || ""))) return filter;
  return today;
}

function getCareReportStatusMetaForRecord(record) {
  if (!record) return { text: "未填写", tone: "muted", rank: 0 };
  if (record.syncStatus === "synced") return { text: "已上传", tone: "success", rank: 3 };
  if (record.syncStatus === "pending-sync") return { text: "待同步", tone: "warning", rank: 2 };
  if (record.syncStatus === "sync-failed") return { text: "上传失败", tone: "error", rank: 1 };
  return { text: "草稿", tone: "warning", rank: 1 };
}

function createElderFallbackFromCareReport(report = {}, elderId = "") {
  const source = report || {};
  if (!report && !elderId) return null;
  const sourceFloor = source.floor || source.elderFloor;
  return {
    id: elderId || source.elderId || "",
    name: source.elderName || source.name || "未知老人",
    room: source.room || "",
    floor: sourceFloor ? normalizeFloorNumber(sourceFloor, 0) : "",
    level: source.careLevelLabel || source.level || "",
    bed: source.bed || "",
  };
}

function buildCaregiverRecordWorkspace(caregiverTasks = []) {
  const recordDate = getHistoryFilterRecordDate();
  const search = String(state.ui.historyFilter.search || "").trim();
  const statusFilter = state.ui.historyFilter.status || "全部";
  const tasksForDate = caregiverTasks.filter((task) => !task.recordDate || task.recordDate === recordDate);
  const operatedTasksForDate = tasksForDate.filter(hasCaregiverTaskOperation);
  const cloudReportsForDate = state.dailyReports.filter(
    (record) => record.caregiverId === state.caregiver.id && record.recordDate === recordDate,
  );
  const elderIds = new Set([
    ...operatedTasksForDate.map((task) => task.elderId).filter(Boolean),
    ...cloudReportsForDate.map((record) => record.elderId).filter(Boolean),
  ]);

  const cards = Array.from(elderIds)
    .map((elderId) => {
      const report = findDailyReport(elderId, recordDate) || null;
      const elder = getElderById(elderId) || createElderFallbackFromCareReport(report, elderId);
      if (!elder) return null;
      const tasks = operatedTasksForDate.filter((task) => task.elderId === elder.id);
      const completedCount = tasks.filter((task) => task.status === "completed").length;
      const issueCount = tasks.filter((task) => task.status === "risk" || task.status === "refused").length;
      const pendingCount = tasks.filter((task) => task.status === "pending").length;
      const historyCount = state.history.filter(
        (item) => item.elderId === elder.id && getHistoryRecordDate(item) === recordDate,
      ).length;
      const reportStatus = getCareReportStatusMetaForRecord(report);
      const nextTask = tasks.find((task) => task.status === "pending") || null;
      const cloudRows = Array.isArray(report?.timelineTaskSnapshot) ? report.timelineTaskSnapshot : [];
      const cloudCompletedCount = cloudRows.filter((item) => item.completedAt).length;
      const cloudIssueCount = cloudRows.filter((item) => item.exceptionReportedAt).length;
      const cloudEvidenceCount = cloudRows.reduce((sum, item) => sum + Number(item.evidenceCount || 0), 0);
      const cloudNoteCount = cloudRows.filter((item) => String(item.note || "").trim()).length;
      const cloudNotePreview = cloudRows
        .map((item) => String(item.note || "").trim())
        .filter(Boolean)
        .slice(0, 2)
        .join("；");
      const evidenceCount = tasks.reduce(
        (sum, task) =>
          sum +
          getTaskEvidenceList(task).length +
          Number(task.recordEvidenceCount || 0) +
          Number(task.exceptionEvidenceCount || 0),
        0,
      );
      const noteCount = tasks.filter((task) => getTaskRecordText(task)).length;
      const totalTasks = Math.max(tasks.length, cloudRows.length);
      const checkInCount = Math.max(completedCount, cloudCompletedCount);
      const messageCount = Math.max(noteCount, cloudNoteCount) + Math.max(evidenceCount, cloudEvidenceCount);
      const recordRows = buildCaregiverRecordRowsForElder(elder.id, recordDate);

      return {
        id: elder.id,
        elderId: elder.id,
        name: elder.name,
        room: elder.room,
        floor: elder.floor || "",
        level: elder.level,
        bed: elder.bed,
        recordDate,
        report,
        reportStatus,
        totalTasks,
        completedCount: checkInCount,
        checkInCount,
        pendingCount,
        issueCount: Math.max(issueCount, cloudIssueCount),
        historyCount,
        evidenceCount: Math.max(evidenceCount, cloudEvidenceCount),
        noteCount: Math.max(noteCount, cloudNoteCount),
        messageCount,
        latestNote: cloudNotePreview || tasks.map((task) => getTaskRecordText(task)).filter(Boolean).slice(0, 2).join("；"),
        recordRows,
        nextTask,
      };
    })
    .filter(Boolean)
    .filter((item) => {
      const matchesSearch = !search || item.name.includes(search) || String(item.room).includes(search);
      const matchesStatus =
        statusFilter === "全部" ||
        (statusFilter === "有打卡" && item.checkInCount > 0) ||
        (statusFilter === "有记录" && item.messageCount > 0);
      return matchesSearch && matchesStatus;
    })
    .sort((left, right) => {
      if (left.reportStatus.rank !== right.reportStatus.rank) return left.reportStatus.rank - right.reportStatus.rank;
      if (left.issueCount !== right.issueCount) return right.issueCount - left.issueCount;
      if (left.floor !== right.floor) return left.floor - right.floor;
      return String(left.room).localeCompare(String(right.room));
    });

  const summary = {
    total: cards.length,
    synced: cards.reduce((sum, item) => sum + item.checkInCount, 0),
    drafts: 0,
    issues: cards.reduce((sum, item) => sum + item.evidenceCount, 0),
    notes: cards.reduce((sum, item) => sum + item.noteCount, 0),
    messages: cards.reduce((sum, item) => sum + item.messageCount, 0),
    cloudFetchedAt: state.cloud.careReportsFetchedAt || "",
    cloudLoading: Boolean(state.cloud.careReportsLoading),
    cloudError: state.cloud.careReportsError || "",
    cloudSync: state.cloud.lastCaregiverRecordSync || null,
  };

  return {
    recordDate,
    cards,
    summary,
  };
}

function buildCaregiverRecordDetail(elderId = "") {
  const recordDate = getHistoryFilterRecordDate();
  const elder = getElderById(elderId) || createElderFallbackFromCareReport(findDailyReport(elderId, recordDate), elderId);
  const report = findDailyReport(elderId, recordDate) || null;
  const cloudRows = Array.isArray(report?.timelineTaskSnapshot) ? report.timelineTaskSnapshot : [];
  const localTasks = sortTasksBySchedule(
    state.tasks.filter(
      (task) =>
        task.caregiverId === state.caregiver.id &&
        task.elderId === elderId &&
        (!task.recordDate || task.recordDate === recordDate) &&
        hasCaregiverTaskOperation(task),
    ),
  );
  const rowsByKey = new Map();

  cloudRows.forEach((item, index) => {
    const key = item.taskId || `cloud-${index}`;
    rowsByKey.set(key, {
      id: key,
      time: item.completedAt || item.exceptionReportedAt || (item.schedule ? `${recordDate} ${item.schedule}` : ""),
      taskName: item.title || "任务卡",
      checkInTime: item.completedAt || "",
      note: String(item.note || "").trim(),
      photos: normalizeEvidenceList(item.evidence),
      photoCount: Number(item.evidenceCount || 0),
    });
  });

  localTasks.forEach((task, index) => {
    const evidence = getTaskEvidenceList(task);
    const key = task.id || `local-${index}`;
    const existing = rowsByKey.get(key) || {};
    rowsByKey.set(key, {
      id: key,
      time: existing.time || task.completedAt || task.exceptionReportedAt || task.recordedAt || task.recordUpdatedAt || "",
      taskName: existing.taskName || task.title || "任务卡",
      checkInTime: existing.checkInTime || task.completedAt || "",
      note: existing.note || getTaskRecordText(task),
      photos: existing.photos?.length ? existing.photos : evidence,
      photoCount: Math.max(Number(existing.photoCount || 0), evidence.length, Number(task.recordEvidenceCount || 0) + Number(task.exceptionEvidenceCount || 0)),
    });
  });

  const rows = Array.from(rowsByKey.values())
    .filter((row) => row.checkInTime || row.note || row.photoCount > 0)
    .sort((left, right) => String(left.time || "").localeCompare(String(right.time || "")));
  const hydratedEvidence = state.ui.caregiverRecordEvidenceByTaskId || {};
  rows.forEach((row) => {
    const hydrated = normalizeEvidenceList(hydratedEvidence[row.id]);
    if (hydrated.length) {
      row.photos = hydrated;
      row.photoCount = Math.max(Number(row.photoCount || 0), hydrated.length);
    }
  });
  const selectedRowId = state.ui.selectedCaregiverRecordTaskId || "";
  const visibleRows = selectedRowId ? rows.filter((row) => row.id === selectedRowId) : rows;

  return {
    elderId,
    elderName: elder?.name || report?.elderName || "",
    room: elder?.room || report?.room || "",
    floor: elder?.floor || "",
    recordDate,
    caregiverName: state.caregiver.name || report?.caregiverName || "",
    checkInCount: visibleRows.filter((row) => row.checkInTime).length,
    noteCount: visibleRows.filter((row) => row.note).length,
    photoCount: visibleRows.reduce((sum, row) => sum + Number(row.photoCount || 0), 0),
    rows: visibleRows,
  };
}

function buildCaregiverRecordRowsForElder(elderId = "") {
  return buildCaregiverRecordDetail(elderId).rows.filter(Boolean);
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
    reportTemplateSnapshot: normalizedRecord.reportTemplateSnapshot || Object.values(state.dailyReportTemplates || {})[0],
    reportItems: hydrateReportItems(normalizedRecord, normalizedRecord.reportTemplateSnapshot || Object.values(state.dailyReportTemplates || {})[0]),
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

function getCachedCareReportsByDate(dateString = "") {
  if (!dateString) return [];
  const receivedByElder = new Map();
  (state.cloud.careReports || []).forEach((item) => {
    const recordDate = item.recordDate || String(item.submittedAt || item.updatedAt || "").slice(0, 10);
    if (recordDate !== dateString) return;
    const key = item.elderId || item.id;
    if (!key || receivedByElder.has(key)) return;
    receivedByElder.set(key, item);
  });
  return Array.from(receivedByElder.values());
}

async function downloadDirectorCareReports(filters = {}, options = {}) {
  const institutionId = filters.institutionId || getCurrentSessionInstitutionId() || state.institution.id || "";
  if (!institutionId) {
    throw new Error("当前登录会话缺少养老院ID，无法拉取护理记录");
  }
  const response = await fetchCaregiverTaskRecords({
    limit: filters.limit || 120,
    elderId: filters.elderId || "",
    recordDate: filters.recordDate || "",
    caregiverId: filters.caregiverId || "",
    institutionId,
  });
  const taskRecordItems = Array.isArray(response?.items) ? response.items : [];
  const nextItems = groupTaskRecordsAsCareReports(taskRecordItems).map((item) => normalizeCloudCareRecord(item));
  state.cloud.lastCaregiverRecordSync = {
    institutionId,
    caregiverId: filters.caregiverId || "",
    recordDate: filters.recordDate || "",
    returnedCount: taskRecordItems.length,
    mergedCount: nextItems.length,
    fetchedAt: response?.fetchedAt || `${formatNowDate()} ${formatNowTime()}`,
  };

  if (options.clear) {
    state.cloud.careReports = [];
  }

  const prevCount = state.cloud.careReports.length;
  nextItems.forEach((item) => {
    mergeCloudCareRecord(item, { skipSort: true });
  });
  state.cloud.careReports.sort((left, right) => {
    const cmp = String(right.updatedAt || "").localeCompare(String(left.updatedAt || ""));
    return cmp !== 0 ? cmp : (left.id || "").localeCompare(right.id || "");
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

function setCloudInventoryLoading(isLoading) {
  state.cloud.inventoryLoading = Boolean(isLoading);
}

function setCloudInventoryError(message = "") {
  state.cloud.inventoryError = message;
}

function setCloudInventoryFetchedAt(timestamp = "") {
  state.cloud.inventoryFetchedAt = timestamp;
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
  const isOverdue = isPastDate || ((selectedDate === today) && taskEndMinutes(task) < currentClockMinutes());

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

function buildCaregiverFromSessionUser(user = {}) {
  const roleEntityId = user.roleEntityId || user.role_entity_id || "";
  if (!roleEntityId) return null;
  return {
    id: roleEntityId,
    name: user.displayName || user.display_name || user.username || "护工",
    username: user.username || "",
    role: "护工",
    employeeNo: "",
    floor: 1,
    shift: "",
    status: "on-duty",
    phone: "",
    cloudUserId: user.id || "",
    cloudUserStatus: user.status || "active",
    institutionId: user.institutionId || user.institution_id || state.institution.id || "",
  };
}

function bindSessionUserToState(user = {}) {
  if (!user) return "";
  const instId = user.institutionId || user.institution_id || "";
  if (instId && state.institution.id !== instId) {
    state.institution = {
      ...state.institution,
      id: instId,
      name: "",
    };
    state.caregivers = [];
    state.elders = [];
    state.tasks = [];
    state.dailyReportTemplates = {};
    state.elderCarePlans = [];
    state.anomalies = [];
  }

  if (user.role === "director" || user.role === "admin" || user.role === "superadmin") {
    state.director.reviewerName = user.displayName || user.display_name || user.username || state.director.reviewerName || "院长";
    state.director.name = state.director.reviewerName;
    state.director.role = user.role === "director" ? "院长" : "管理员";
    state.director.accountId = user.username || user.id || state.director.accountId || "";
    state.director.phone = user.phone || user.mobile || state.director.phone || "未设置";
  }

  return instId;
}

function bindCurrentCaregiverFromSession(user = state.session.user, options = {}) {
  if (!user || user.role !== "caregiver") return false;
  const roleEntityId = user.roleEntityId || user.role_entity_id || "";
  if (!roleEntityId) return false;

  const matched = getCaregiverById(roleEntityId);
  if (matched) {
    state.caregiver = { ...matched };
    return true;
  }

  const fallback = buildCaregiverFromSessionUser(user);
  if (!fallback) return false;
  state.caregiver = fallback;
  if (options.insertFallback !== false) {
    state.caregivers = dedupeCaregiverRecords([fallback, ...(state.caregivers || [])]);
  }
  return true;
}

function getCurrentSessionInstitutionId() {
  const userInstitutionId = state.session?.user?.institutionId || state.session?.user?.institution_id || "";
  const caregiverInstitutionId = state.caregiver?.institutionId || state.caregiver?.institution_id || "";
  const stateInstitutionId = state.institution?.id || "";
  return userInstitutionId || caregiverInstitutionId || stateInstitutionId || "";
}

function getSyncVersionKey(institutionId, recordDate, domain) {
  return [institutionId || "", recordDate || "", domain || ""].join("|");
}

async function checkCloudSyncDomains(domains = [], options = {}) {
  if (!isCloudSyncConfigured()) return null;
  const institutionId = options.institutionId || getCurrentSessionInstitutionId();
  if (!institutionId) return null;
  const recordDate = options.recordDate || formatNowDate();
  const domainList = Array.isArray(domains) ? domains.filter(Boolean) : String(domains || "").split(",").filter(Boolean);
  const known = {};
  domainList.forEach((domain) => {
    const key = getSyncVersionKey(institutionId, recordDate, domain);
    if (syncDomainVersions[key]) known[domain] = syncDomainVersions[key];
  });
  const response = await fetchSyncStatus({
    institutionId,
    recordDate,
    domains: domainList,
    known,
    timeout: options.timeout || TASK_SYNC_STATUS_TIMEOUT_MS,
  });
  const domainStatus = response?.domains || {};
  if (options.commit !== false) {
    commitCloudSyncDomains(domainStatus, { institutionId, recordDate });
  }
  return domainStatus;
}

function commitCloudSyncDomains(domainStatus = {}, options = {}) {
  const institutionId = options.institutionId || getCurrentSessionInstitutionId();
  const recordDate = options.recordDate || formatNowDate();
  Object.entries(domainStatus || {}).forEach(([domain, info]) => {
    if (info?.version) {
      syncDomainVersions[getSyncVersionKey(institutionId, recordDate, domain)] = info.version;
    }
  });
}

function syncDomainChanged(status, domain) {
  if (!status || !status[domain]) return true;
  return Boolean(status[domain].changed);
}

function getCaregiverForFloor(floor, elderId = null) {
  const normalizedFloor = Number(floor || 0);
  if (elderId) {
    const elder = getElderById(elderId);
    if (elder && elder.assignedCaregiverId) {
      const assigned = getCaregiverById(elder.assignedCaregiverId);
      if (assigned) return assigned;
    }
  }

  const floorCaregivers = state.caregivers.filter((item) => Number(item.floor) === normalizedFloor);
  if (!floorCaregivers.length) return state.caregivers[0] || null;

  if (floorCaregivers.length === 1 || !elderId) return floorCaregivers[0];

  const floorElders = state.elders.filter((e) => e.floor === normalizedFloor).sort((a, b) => a.room.localeCompare(b.room));
  const index = floorElders.findIndex((e) => e.id === elderId);
  if (index < 0) return floorCaregivers[0];
  return floorCaregivers[index % floorCaregivers.length];
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
  const registered = state.caregivers.filter((item) => item.cloudUserId);
  return registered.find((item) => item.floor === floor) || registered[0] || null;
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
  if (route === "inventory-usage") return "history";
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

function setCurrentRoom(target, roomFallback = "") {
  const selectedFloor = normalizeFloorNumber(state.ui.selectedFloor, 0);
  const targetObject = typeof target === "object" && target ? target : {};
  const rawTarget = typeof target === "string" ? target : "";
  const rawTargetIsElderId =
    !!rawTarget && (state.elders.some((elder) => elder.id === rawTarget) || state.tasks.some((task) => task.elderId === rawTarget));
  const targetElderId = targetObject.elderId || (rawTargetIsElderId ? rawTarget : "");
  const room = targetObject.room || roomFallback || (!targetElderId ? rawTarget : "");
  const activeRecordDate = getCaregiverRecordDate();
  const elder = targetElderId
    ? getElderById(targetElderId)
    : state.elders.find(
        (item) => item.room === room && (!selectedFloor || normalizeFloorNumber(item.floor, 0) === selectedFloor),
      );
  const fallbackTask = state.tasks.find(
    (task) =>
      task.caregiverId === state.caregiver.id &&
      (!task.recordDate || task.recordDate === activeRecordDate) &&
      (targetElderId
        ? task.elderId === targetElderId
        : String(task.elderRoom || "") === String(room || "")) &&
      (!selectedFloor || normalizeFloorNumber(task.elderFloor, 0) === selectedFloor),
  );
  const selectedElder = elder || createTaskElderFallback(fallbackTask);
  if (!selectedElder) return false;

  state.ui.selectedRoom = selectedElder.room || room;
  state.ui.selectedFloor = normalizeFloorNumber(selectedElder.floor || fallbackTask?.elderFloor, 1);
  state.ui.selectedElderId = selectedElder.id || "";

  const elderTasks = sortTasksBySchedule(
    state.tasks.filter(
      (task) =>
        task.elderId === state.ui.selectedElderId &&
        task.caregiverId === state.caregiver.id &&
        (!task.recordDate || task.recordDate === activeRecordDate),
    ),
  );
  const pendingTask = pickCurrentTask(elderTasks);

  state.ui.selectedTaskId = (pendingTask || elderTasks[0] || {}).id || "";
  return true;
}

function ensureCurrentSelections() {
  const activeRecordDate = getCaregiverRecordDate();
  const rawSelectedTask = getTaskById(state.ui.selectedTaskId);
  let currentSelectedElder =
    getElderById(state.ui.selectedElderId) ||
    (rawSelectedTask?.caregiverId === state.caregiver.id ? createTaskElderFallback(rawSelectedTask) : null);

  if (currentSelectedElder) {
    state.ui.selectedElderId = currentSelectedElder.id;
    state.ui.selectedRoom = currentSelectedElder.room;
    state.ui.selectedFloor = currentSelectedElder.floor;
  }

  const caregiverTasks = state.tasks.filter(
    (task) => task.caregiverId === state.caregiver.id && (!task.recordDate || task.recordDate === activeRecordDate),
  );
  const elderTasks = currentSelectedElder ? sortTasksBySchedule(caregiverTasks.filter((task) => task.elderId === currentSelectedElder.id)) : [];

  if (!elderTasks.some((task) => task.id === state.ui.selectedTaskId)) {
    const replacementTask =
      pickCurrentTask(elderTasks) ||
      elderTasks[0] ||
      caregiverTasks.find((task) => task.status !== "completed") ||
      caregiverTasks[0];

    state.ui.selectedTaskId = replacementTask ? replacementTask.id : "";

    if (replacementTask) {
      const elder = getElderById(replacementTask.elderId) || createTaskElderFallback(replacementTask);
      if (elder) {
        currentSelectedElder = elder;
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
  const overviewDate = state.director.date || formatNowDate();
  const overviewTasks = state.tasks.filter((task) => task.recordDate === overviewDate);
  const overview = buildDirectorOverview({
    tasks: overviewTasks,
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
    window.__lastSyncError = { message: error?.message, time: `${formatNowDate()} ${formatNowTime()}` };
    setCloudTasksError(error?.message || failureMessage);
    return false;
  }
}

async function refreshCareRecordFromTask(task, options = {}) {
  if (!task || !task.elderId || !task.caregiverId) return false;

  const elder = getElderById(task.elderId);
  if (!elder) return false;

  const recordDate = task.recordDate || options.recordDate || formatNowDate();
    const timelineTasks = sortTasksBySchedule(
      state.tasks.filter(
        (item) =>
          item.caregiverId === task.caregiverId &&
          item.elderId === task.elderId &&
          (!item.recordDate || item.recordDate === recordDate) &&
          hasCaregiverTaskOperation(item),
      ),
    );
  const existingReport = findDailyReport(elder.id, recordDate);
  const autoRecord = createAutoCareRecordFromTimeline(elder, timelineTasks, recordDate, existingReport);
  const pendingRecord = upsertDailyReport(autoRecord, "pending-sync");
  upsertFamilyCareReportNotice(pendingRecord, "pending-sync");

  const syncedReport = mergeCloudCareRecord({ ...pendingRecord, syncStatus: "synced", workflowStatus: "submitted" });
  upsertFamilyCareReportNotice(syncedReport, "synced");
  setCloudCareReportsError("");
  setCloudCareReportsFetchedAt(`${formatNowDate()} ${formatNowTime()}`);
  return true;
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
  const record = {
    id: `anomaly-${Date.now()}`,
    type,
    elderId: task.elderId,
    caregiverId: task.caregiverId || state.caregiver.id,
    time: formatNowTime(),
    status: "已上报",
    note,
  };
  state.anomalies.unshift(record);
  if (isCloudSyncConfigured()) {
    const institutionId = getCurrentSessionInstitutionId();
    createAnomaly({
      institutionId,
      elderId: record.elderId,
      caregiverId: record.caregiverId,
      type: record.type,
      note: record.note,
      reportedAt: `${formatNowDate()} ${formatNowTime()}`,
    }).catch(() => {});
  }
}

function addQuickAnomaly(elder, note) {
  if (!elder) return;
  const record = {
    id: `anomaly-${Date.now()}`,
    type: "快速异常上报",
    elderId: elder.id,
    caregiverId: state.caregiver.id,
    time: formatNowTime(),
    status: "已上报",
    note,
  };
  state.anomalies.unshift(record);
  if (isCloudSyncConfigured()) {
    const institutionId = getCurrentSessionInstitutionId();
    createAnomaly({
      institutionId,
      elderId: record.elderId,
      caregiverId: record.caregiverId,
      type: record.type,
      note: record.note,
      reportedAt: `${formatNowDate()} ${formatNowTime()}`,
    }).catch(() => {});
  }
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

function evidenceListHasImageData(evidence) {
  return normalizeEvidenceList(evidence).some((item) => item.dataUrl);
}

function taskHasRecordReport(task = {}) {
  return Boolean(
    String(task.recordNote || "").trim() ||
      String(task.recordUpdatedAt || task.recordedAt || "").trim() ||
      normalizeEvidenceList(task.recordEvidence).length,
  );
}

function taskHasExceptionReport(task = {}) {
  return Boolean(
    task.status === "risk" ||
      task.status === "refused" ||
      String(task.exceptionNote || "").trim() ||
      String(task.exceptionType || "").trim() ||
      String(task.exceptionReportedAt || "").trim() ||
      normalizeEvidenceList(task.exceptionEvidence).length,
  );
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

function createTaskElderFallback(task = {}) {
  if (!task?.elderId) return null;
  return {
    id: task.elderId,
    name: task.elderName || "未命名老人",
    age: "",
    floor: normalizeFloorNumber(task.elderFloor, 1),
    room: task.elderRoom || "",
    bed: task.elderBed || "",
    level: "护理等级未填",
    familyContact: "",
    familyPhone: "",
    latestBloodPressure: "--",
    latestHeartRate: "--",
  };
}

function enrichTask(task) {
  const elder = getElderById(task.elderId) || createTaskElderFallback(task);
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

  return state.caregivers.filter((c) => c.cloudUserId).map((caregiver) => {
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
    .filter((c) => c.cloudUserId)
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

function buildDirectorExceptionReports(_tasks = state.tasks, opts = {}) {
  const tasks = Array.isArray(_tasks) ? _tasks : [];
  const targetDate = opts.recordDate || state.ui.directorAuditDate || state.director.date || formatNowDate();
  const anomalies = (state.anomalies || []).slice();
  const reports = [];

  const coveredPairs = {};

  anomalies
    .filter((an) => {
      if (!an) return false;
      const anomalyDate = an.recordDate || an.date || String(an.reportedAt || an.time || "").slice(0, 10);
      if (anomalyDate && targetDate && anomalyDate !== targetDate) return false;
      return true;
    })
    .forEach((an) => {
      const elder = getElderById(an.elderId);
      const caregiver = getCaregiverById(an.caregiverId);
      const matchedTask = tasks.find(
        (t) => t.elderId === an.elderId && t.caregiverId === an.caregiverId && (t.status === "risk" || t.status === "refused"),
      );
      if (!matchedTask) return;
      coveredPairs[(an.elderId || "") + "|" + (an.caregiverId || "")] = true;
      reports.push({
        id: an.id,
        title: matchedTask.title || an.type || "异常报备",
        schedule: matchedTask.schedule || matchedTask.window || "",
        window: matchedTask.window || matchedTask.schedule || "",
        status: matchedTask.status || "risk",
        statusLabel: an.type === "老人不配合" ? "不配合" : "异常",
        elderName: elder?.name || "未知老人",
        room: elder?.room || "--",
        floor: elder?.floor || "--",
        caregiverName: caregiver?.name || "未分配护工",
        note: an.note || "未填写文字说明",
        evidence: evidenceArray(matchedTask.recordEvidence).length
          ? evidenceArray(matchedTask.recordEvidence)
          : evidenceArray(matchedTask.exceptionEvidence),
        evidencePending: taskNeedsEvidenceHydration(matchedTask),
        reportedAt: an.reportedAt || an.time || matchedTask.exceptionReportedAt || matchedTask.updatedAt || "",
        anomalyId: an.id,
      });
    });

  tasks.forEach((task) => {
    if (task.status !== "risk" && task.status !== "refused") return;
    if (coveredPairs[(task.elderId || "") + "|" + (task.caregiverId || "")]) return;
    const elder = getElderById(task.elderId);
    const caregiver = getCaregiverById(task.caregiverId);
    reports.push({
      id: task.id,
      title: task.title || "异常报备",
      schedule: task.schedule || task.window || "",
      window: task.window || task.schedule || "",
      status: task.status,
      statusLabel: task.status === "refused" ? "不配合" : "异常",
      elderName: elder ? elder.name : "未知老人",
      room: elder ? elder.room : "--",
      floor: elder ? elder.floor : "--",
      caregiverName: caregiver ? caregiver.name : "未分配护工",
      note: task.exceptionNote || task.recordNote || "未填写文字说明",
      evidence: evidenceArray(task.recordEvidence).length ? evidenceArray(task.recordEvidence) : evidenceArray(task.exceptionEvidence),
      evidencePending: taskNeedsEvidenceHydration(task),
      reportedAt: task.exceptionReportedAt || task.updatedAt || task.createdAt || "",
      anomalyId: task.id,
    });
  });

  return reports;
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const actions = {
  bindSessionUserToState(user = state.session.user) {
    return bindSessionUserToState(user);
  },
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

    try {
      const institutionId = getCurrentSessionInstitutionId();
      await Promise.all([
        actions._loadCloudInstitutionInfo(institutionId),
        actions._loadCloudPersonnel(institutionId),
        actions.refreshDailyReportTemplates({ silent: true }),
      ]);
      state.cloud.institutionStateFetchedAt = `${formatNowDate()} ${formatNowTime()}`;
      state.cloud.institutionStateError = "";
      if (!options.silent) touchToast("整院事实表已刷新");
      return true;
    } catch (error) {
      state.cloud.institutionStateError = error?.message || "整院事实表刷新失败";
      if (!options.silent) touchToast(state.cloud.institutionStateError);
      return false;
    }
  },
  async refreshInstitutionSharedState(options = {}) {
    if (!isCloudSyncConfigured()) return false;
    if (options.silent && (isReportTemplateWorkspaceOpen() || state.ui.directorPersonnelDraft || state.ui.directorDispatchDraft)) {
      return false;
    }
    if (institutionStateRefreshInFlight) {
      return institutionStateRefreshInFlight;
    }

    institutionStateRefreshInFlight = (async () => {
      try {
        const institutionId = getCurrentSessionInstitutionId();
        if (options.checkStatus !== false) {
          const syncStatus = await checkCloudSyncDomains(["personnel", "templates"], {
            institutionId,
            recordDate: options.recordDate || state.director?.date || formatNowDate(),
          });
          if (
            syncStatus &&
            !syncDomainChanged(syncStatus, "personnel") &&
            !syncDomainChanged(syncStatus, "templates")
          ) {
            state.cloud.institutionStateFetchedAt = `${formatNowDate()} ${formatNowTime()}`;
            state.cloud.institutionStateError = "";
            return false;
          }
        }
        const before = JSON.stringify({
          institution: state.institution,
          caregivers: state.caregivers,
          elders: state.elders,
          templates: state.dailyReportTemplates,
        });
        await Promise.all([
          actions._loadCloudInstitutionInfo(institutionId),
          actions._loadCloudPersonnel(institutionId),
          actions.refreshDailyReportTemplates({ silent: true }),
        ]);
        const after = JSON.stringify({
          institution: state.institution,
          caregivers: state.caregivers,
          elders: state.elders,
          templates: state.dailyReportTemplates,
        });
        const changed = before !== after;
        state.cloud.institutionStateFetchedAt = `${formatNowDate()} ${formatNowTime()}`;
        state.cloud.institutionStateError = "";
        if (changed && !options.silent) {
          touchToast("整院事实表已刷新");
        } else if (changed) {
          notify();
        }
        return changed;
      } catch (error) {
        state.cloud.institutionStateError = error?.message || "整院事实表拉取失败";
        if (!options.silent) {
          touchToast(state.cloud.institutionStateError);
        }
        return false;
      } finally {
        institutionStateRefreshInFlight = null;
      }
    })();

    return institutionStateRefreshInFlight;
  },
  async refreshAttendanceRecords(options = {}) {
    if (state.session.identity === "caregiver") {
      bindCurrentCaregiverFromSession();
    }
    const institutionId = options.institutionId || getCurrentSessionInstitutionId();
    const caregiverId = options.caregiverId || state.caregiver?.id || "";
    if (!institutionId || !caregiverId) return false;

    ensureAttendanceState();
    state.cloud.attendanceLoading = true;
    if (!options.silent) notify();
    try {
      const response = await fetchAttendanceRecords({
        institutionId,
        caregiverId,
        recordDate: options.recordDate || formatNowDate(),
      });
      const items = Array.isArray(response?.items) ? response.items : [];
      items.forEach((item) => mergeAttendanceRecord(item));
      state.cloud.attendanceFetchedAt = response?.fetchedAt || `${formatNowDate()} ${formatNowTime()}`;
      state.cloud.attendanceError = "";
      return true;
    } catch (error) {
      state.cloud.attendanceError = error?.message || "考勤记录拉取失败";
      if (!options.silent) touchToast(state.cloud.attendanceError);
      return false;
    } finally {
      state.cloud.attendanceLoading = false;
      if (!options.silent) notify();
    }
  },
  async syncAttendanceRecord(record, options = {}) {
    const payload = buildAttendancePayloadFromRecord(record);
    if (!payload.institutionId || !payload.caregiverId) return false;
    try {
      const response = await upsertAttendanceRecord(payload);
      if (response?.item) mergeAttendanceRecord(response.item);
      state.cloud.attendanceFetchedAt = response?.fetchedAt || `${formatNowDate()} ${formatNowTime()}`;
      state.cloud.attendanceError = "";
      if (!options.silent) notify();
      return true;
    } catch (error) {
      state.cloud.attendanceError = error?.message || "考勤同步失败";
      if (!options.silent) touchToast(state.cloud.attendanceError);
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
  openDevLogin() {
    state.ui.loginMenuOpen = false;
    state.ui.devLoginOpen = true;
    state.ui.appInfoDialog = "";
    state.ui.appUpdate.open = false;
    notify();
  },
  closeDevLogin() {
    state.ui.devLoginOpen = false;
    notify();
  },
  async _loadCloudInstitutionInfo(instId) {
    try {
      const resp = await fetchInstitution(instId);
      if (resp?.status === "success" && resp.item) {
        if (resp.item.name) state.institution.name = resp.item.name;
      }
    } catch (_) {}
  },
  async _loadCloudPersonnel(instId) {
    try {
      const [cgResp, eldersResp, usersResp] = await Promise.all([
        fetchCaregivers({ institutionId: instId }),
        fetchElders({ institutionId: instId }),
        fetchAuthUsers(instId),
      ]);
      const cgList = Array.isArray(cgResp) ? cgResp : [];
      const elderList = Array.isArray(eldersResp) ? eldersResp : [];
      const users = Array.isArray(usersResp) ? usersResp : [];
      const merged = cgList.map((cg) => {
        const auth = users.find((u) => u.roleEntityId === cg.id && u.role === "caregiver");
        return {
          id: cg.id,
          name: cg.name || auth?.displayName || "",
          role: "护工",
          employeeNo: cg.employeeNo || "",
          floor: cg.floor || 1,
          shift: cg.shift || "",
          status: cg.status || "on-duty",
          phone: cg.phone || "",
          username: auth?.username || "",
          passwordHint: auth?.passwordHint || "",
          cloudUserId: auth?.id || "",
          cloudUserStatus: auth?.status || "",
        };
      });
      if (merged.length) {
        state.caregivers = dedupeCaregiverRecords(merged);
      } else {
        const caregiverUsers = users.filter((u) => u.role === "caregiver" && u.status === "active");
        if (caregiverUsers.length) {
          state.caregivers = state.caregivers.map((cg) => {
            const auth = caregiverUsers.find((u) => u.roleEntityId === cg.id);
            if (auth) return { ...cg, username: auth.username, passwordHint: auth.passwordHint || "", cloudUserId: auth.id, cloudUserStatus: auth.status };
            return cg;
          });
        }
      }
      const familyUsers = users.filter((u) => u.role === "family" && u.status === "active");
      mergeCloudEldersIntoState(elderList, familyUsers);
      if (familyUsers.length) {
        state.elders = attachFamilyAccountsToElders(state.elders, familyUsers);
      }
    } catch (_) {}
  },
  async loadDirectorInitialData() {
    if (state._loadingDirectorData) return;
    state._loadingDirectorData = true;
    state._holdNotify = true;
    try {
      state.ui.syncPhase = "正在同步日报模板与人员数据...";
      const el = document.getElementById("sync-status");
      if (el) el.textContent = state.ui.syncPhase;

      await Promise.all([
        actions.refreshDailyReportTemplates({ silent: true }),
        actions.refreshInstitutionSharedState({ silent: true }),
      ]);
      if (state.institution.id) {
        await actions._loadCloudPersonnel(state.institution.id);
      }
      await actions.persistInstitutionSharedState({ silent: true });

      if (state.cloud.institutionStateFetchedAt) {
        state._holdNotify = false;
        state.ui.syncPhase = "正在后台同步护理任务...";
        notify();
        actions.refreshDirectorCloudTasks({ silent: true }).finally(() => {
          if (state.ui.syncPhase === "正在后台同步护理任务...") {
            state.ui.syncPhase = "";
            notify();
          }
        });
      }
    } finally {
      state._holdNotify = false;
      state._loadingDirectorData = false;
      if (state.ui.syncPhase !== "正在后台同步护理任务...") {
        state.ui.syncPhase = "";
      }
      notify();
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
    state.ui.devLoginOpen = false;
    state.ui.appInfoDialog = "";
    state.ui.appUpdate.open = false;

    const instId = bindSessionUserToState(result.user);
    if (instId) {
      await actions._loadCloudInstitutionInfo(instId);
    }

    const role = result.user.role;
    if (role === "caregiver") {
      state.ui.route = "attendance";
      state.ui.activeTab = "home";
      const roleEntityId = result.user.roleEntityId;
      state.caregiver = {};
      notify();
      if (instId) await actions._loadCloudPersonnel(instId);
      await actions.refreshInstitutionSharedState({ silent: true });
      if (roleEntityId) {
        bindCurrentCaregiverFromSession(result.user);
      }
      if (!state.caregiver?.id && !roleEntityId) {
        const cgName = result.user.displayName || result.user.username || "";
        const byName = state.caregivers.find((c) => c.name === cgName);
        if (byName) state.caregiver = { ...byName };
      }
      if (!state.caregiver?.id) {
        setAuthToken("");
        state.session.token = "";
        state.session.user = null;
        state.session.identity = "";
        state.session.loggedIn = false;
        state.ui.route = "login";
        throw new Error("账号未绑定到当前养老院护工，请检查云端账号绑定");
      }
    } else if (role === "family") {
      state.ui.route = "family-home";
      state.ui.activeTab = "family-home";
      notify();
    } else if (role === "director") {
      state.ui.route = "director-home";
      state.ui.activeTab = "director-home";
      notify();
      if (instId) await actions._loadCloudPersonnel(instId);
      actions.loadDirectorInitialData();
    } else if (role === "admin" || role === "superadmin") {
      state.ui.route = "director-home";
      state.ui.activeTab = "director-home";
      notify();
      touchToast("管理员登录成功");
      if (instId) await actions._loadCloudPersonnel(instId);
      actions.loadDirectorInitialData();
    }
  },
  async clockIn() {
    state.session.loggedIn = true;
    state.session.clockInAt = formatNowTime();
    const attendanceRecord = recordCurrentCaregiverClockIn();
    state.ui.route = "home";
    state.ui.activeTab = "home";
    touchToast(`上班打卡成功 ${state.session.clockInAt}`);
    await actions.syncAttendanceRecord(attendanceRecord, { silent: true });
    actions.refreshCaregiverCloudTasks({ silent: true, ensureInstitutionState: true });
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
    if (route === "director-inventory" || route === "inventory-usage") {
      actions.refreshCloudInventory({ silent: true, checkStatus: "force" });
    }
    if (route === "history") {
      actions.refreshCaregiverCloudTasks({ silent: true, recordDate: getHistoryFilterRecordDate() });
      actions.refreshCaregiverTaskRecords({ silent: true, recordDate: getHistoryFilterRecordDate() });
    }
    if (route === "attendance") {
      actions.refreshAttendanceRecords({ silent: true });
    }
    notify();
  },
  chooseFloor(value) {
    state.ui.selectedFloor = Number.parseInt(value, 10) || 1;
    state.ui.route = "room-select";
    state.ui.activeTab = "home";
    notify();
  },
  chooseRoom(elderId, room = "") {
    setCurrentRoom(elderId, room);
    state.ui.caregiverTimelineReadonly = false;
    state.ui.route = "elder-detail";
    state.ui.activeTab = "home";
    notify();
  },
  openCaregiverElderRecordTasks(elderId = "", taskId = "") {
    const recordDate = getHistoryFilterRecordDate();
    const report = findDailyReport(elderId, recordDate) || null;
    const elder = getElderById(elderId) || createElderFallbackFromCareReport(report, elderId);
    if (!elder) return;
    state.ui.selectedElderId = elder.id;
    state.ui.selectedRoom = elder.room;
    state.ui.selectedFloor = normalizeFloorNumber(elder.floor, 1);
    state.ui.selectedCaregiverReportElderId = elder.id;
    state.ui.selectedCaregiverRecordTaskId = taskId || "";
    state.ui.activeTab = "history";
    notify();
  },
  openCaregiverInventoryUsage() {
    state.ui.inventoryUsageDraft = {
      itemId: (state.inventory || [])[0]?.id || "",
      quantity: 1,
      note: "",
    };
    state.ui.route = "inventory-usage";
    state.ui.activeTab = "history";
    notify();
    actions.refreshCloudInventory({ silent: true, checkStatus: "force" });
  },
  openCaregiverInventoryUsageForElder(elderId = "") {
    const elder = getElderById(elderId);
    if (elder) {
      state.ui.selectedElderId = elder.id;
      state.ui.selectedRoom = elder.room;
      state.ui.selectedFloor = elder.floor;
    }
    return actions.openCaregiverInventoryUsage();
  },
  closeCaregiverInventoryUsage() {
    state.ui.inventoryUsageDraft = null;
    state.ui.route = "history";
    state.ui.activeTab = "history";
    notify();
  },
  updateInventoryUsageDraft(patch = {}) {
    state.ui.inventoryUsageDraft = {
      ...(state.ui.inventoryUsageDraft || {}),
      ...patch,
    };
    notify();
  },
  async submitInventoryUsage(input = {}) {
    const draft = {
      ...(state.ui.inventoryUsageDraft || {}),
      ...input,
    };
    const item = getInventoryItemById(draft.itemId);
    const quantity = Math.max(0, Number(draft.quantity || 0));
    if (!item) {
      touchToast("请选择库存物品");
      return;
    }
    if (!quantity) {
      touchToast("请输入使用数量");
      return;
    }
    if (quantity > item.quantity) {
      touchToast("库存数量不足");
      return;
    }
    if (!isCloudSyncConfigured()) {
      touchToast("云端接口未配置，无法记录库存使用");
      return;
    }
    try {
      const response = await createInventoryUsage({
        institutionId: getCurrentSessionInstitutionId(),
        itemId: item.id,
        quantity,
        caregiverId: state.caregiver.id,
        caregiverName: state.caregiver.name,
        note: draft.note || "",
        usedAt: `${formatNowDate()} ${formatNowTime()}`,
      });
      mergeInventoryItems(response?.inventoryItem ? [response.inventoryItem] : []);
      mergeInventoryUsages(response?.item ? [response.item] : []);
      setCloudInventoryFetchedAt(response?.fetchedAt || `${formatNowDate()} ${formatNowTime()}`);
      setCloudInventoryError("");
      state.ui.inventoryUsageDraft = null;
      state.ui.route = "history";
      state.ui.activeTab = "history";
      touchToast("库存使用已同步");
      notify();
    } catch (error) {
      setCloudInventoryError(error?.message || "库存使用同步失败");
      touchToast(error?.message || "库存使用同步失败");
    }
  },
  openCaregiverDailyReport(elderId) {
    const elder = getElderById(elderId);
    if (!elder) return;

    const recordDate = getHistoryFilterRecordDate();
    const existingReport = findDailyReport(elder.id, recordDate);
    state.ui.selectedCaregiverReportElderId = elder.id;
    state.ui.caregiverDailyReportDraft = buildCaregiverDailyReportDraft(elder.id, existingReport);
    state.ui.caregiverDailyReportDraft.recordDate = recordDate;
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
    const elder = getElderById(task.elderId) || createTaskElderFallback(task);
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
    const elder = getElderById(task.elderId) || createTaskElderFallback(task);
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
    if (!nextEvidence?.dataUrl) {
      touchToast("照片未读取成功，请重新拍照或选择图片");
      return;
    }
    state.ui[storeKey][key] = [...currentList, nextEvidence].slice(0, 6);
    if (kind === "quick") {
      const quickTask = state.tasks.find(
        (t) => t.elderId === key && t.source === "quick-exception" && t.status === "risk",
      );
      if (quickTask) {
        quickTask.recordEvidence = normalizeEvidenceList(state.ui[storeKey][key]);
        quickTask.exceptionEvidence = quickTask.recordEvidence;
        syncCaregiverTaskToCloud(quickTask, "快速异常照片云端同步失败")
          .then(() => refreshCareRecordFromTask(quickTask, { source: "caregiver-quick-exception-photo" }))
          .catch(() => {});
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
    if (taskHasExceptionReport(task)) {
      touchToast("该任务已选择异常上报，不能再添加普通记录");
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
    if (taskHasRecordReport(task)) {
      touchToast("该任务已选择记录上报，不能再添加异常上报");
      return;
    }
    state.ui.taskRecordDialog = {
      taskId,
      type: "exception",
      note: state.ui.taskExceptionNotes?.[taskId] || "",
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
    if (dialog.saving) return;
    dialog.saving = true;

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
        const evidence = (state.ui.quickExceptionEvidence && state.ui.quickExceptionEvidence[elder.id]) || [];
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
          requirePhoto: false,
          templateId: "",
          note: note,
          exceptionNote: note,
          exceptionType: "快速异常",
          recordEvidence: evidence,
          publishedAt: `${formatNowDate()} ${formatNowTime()}`,
        };
        state.tasks.push(quickTask);
        refreshDirectorOverview();
        syncCaregiverTaskToCloud(quickTask, "快速异常云端同步失败")
          .then(() => refreshCareRecordFromTask(quickTask, { source: "caregiver-quick-exception" }))
          .catch(() => {});
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
      if (taskHasRecordReport(task)) {
        dialog.saving = false;
        touchToast("该任务已选择记录上报，不能再添加异常上报");
        notify();
        return;
      }
      const exceptionEvidence = normalizeEvidenceList(state.ui.taskExceptionEvidence?.[task.id]);
      if (exceptionEvidence.length && !evidenceListHasImageData(exceptionEvidence)) {
        dialog.saving = false;
        touchToast("异常照片未同步，请重新拍照或选择图片");
        return;
      }
      state.ui.taskExceptionNotes[task.id] = note;
      task.status = "risk";
      task.exceptionNote = note;
      task.exceptionType = "异常情况";
      task.exceptionEvidence = exceptionEvidence;
      task.exceptionReportedAt = `${formatNowDate()} ${formatNowTime()}`;
      if (!state.ui.taskExceptionSaved[task.id]) {
        appendHistoryRecord(task, "异常", note || "护理过程中发现异常情况，已同步上报。", "异常情况已记录。");
        state.ui.taskExceptionSaved[task.id] = true;
      }
      refreshDirectorOverview();
      state.ui.taskRecordDialog = null;
      notify();
      touchToast("异常已上报");
      syncCaregiverTaskToCloud(task, "异常任务云端同步失败")
        .then(() => refreshCareRecordFromTask(task, { source: "caregiver-task-exception" }))
        .catch(() => {});
      return;
    }

    if (taskHasExceptionReport(task)) {
      dialog.saving = false;
      touchToast("该任务已选择异常上报，不能再添加普通记录");
      notify();
      return;
    }
    state.ui.taskRecordNotes[task.id] = note;
    const recordEvidence = normalizeEvidenceList(state.ui.taskRecordEvidence?.[task.id] || state.ui.taskEvidence?.[task.id]);
    if (recordEvidence.length && !evidenceListHasImageData(recordEvidence)) {
      dialog.saving = false;
      touchToast("记录照片未同步，请重新拍照或选择图片");
      return;
    }
    task.recordNote = note;
    if (recordEvidence.length) {
      task.recordEvidence = recordEvidence;
    }
    task.recordUpdatedAt = `${formatNowDate()} ${formatNowTime()}`;
    appendHistoryRecord(task, "记录", note || `${task.title}已补充文字记录。`);
    state.ui.taskRecordDialog = null;
    syncCaregiverTaskToCloud(task, "文字记录云端同步失败")
      .then(() => refreshCareRecordFromTask(task, { source: "caregiver-task-note" }))
      .catch(() => {});
    touchToast("记录已保存");
  },
  completeTask(taskId) {
    const task = getTaskById(taskId);
    if (!task) return;
    if (task.caregiverId !== state.caregiver.id) {
      touchToast("只能处理分配给自己的任务");
      return;
    }
    if (taskHasExceptionReport(task)) {
      touchToast("该任务已异常上报，不能再标记完成");
      return;
    }
    if (task.status === "completed") {
      task.status = "pending";
      task.completedAt = "";
      refreshDirectorOverview();
      syncCaregiverTaskToCloud(task, "任务取消打卡云端同步失败")
        .then(() => refreshCareRecordFromTask(task, { source: "caregiver-task-uncomplete" }))
        .catch(() => {});
      touchToast("已取消打卡");
      return;
    }
    const recordEvidence = normalizeEvidenceList(state.ui.taskRecordEvidence?.[taskId] || state.ui.taskEvidence?.[taskId]);
    if (recordEvidence.length && !evidenceListHasImageData(recordEvidence)) {
      touchToast("照片未同步，请重新拍照或选择图片");
      return;
    }
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
    syncCaregiverTaskToCloud(task, "任务完成状态云端同步失败")
      .then(() => refreshCareRecordFromTask(task, { source: "caregiver-task-completion" }))
      .catch(() => {});
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
    if (taskHasRecordReport(task)) {
      touchToast("该任务已选择记录上报，不能再添加异常上报");
      return;
    }
    if (type === "risk") {
      actions.openTaskExceptionDialog(taskId);
      return;
    }
    if (type === "refused") {
      task.status = "refused";
      task.exceptionNote = `${task.title}执行时老人拒绝配合，建议稍后再次处理。`;
      task.exceptionType = "老人不配合";
      task.exceptionReportedAt = `${formatNowDate()} ${formatNowTime()}`;
      appendHistoryRecord(task, "老人不配合", "老人情绪波动，暂时拒绝配合护理。", "已记录老人不配合原因。");
      touchToast("已记录不配合原因");
    } else {
      task.status = "risk";
      task.exceptionNote = `${task.title}执行中发现老人状态异常，已同步上报。`;
      task.exceptionType = "身体不适";
      task.exceptionReportedAt = `${formatNowDate()} ${formatNowTime()}`;
      appendHistoryRecord(task, "异常", "护理过程中发现异常情况，已同步上报。", "异常情况已上报，等待后续处理。");
      touchToast("异常上报成功，请补充留痕");
    }

    refreshDirectorOverview();
    syncCaregiverTaskToCloud(task, "异常任务云端同步失败")
      .then(() => refreshCareRecordFromTask(task, { source: "caregiver-task-exception" }))
      .catch(() => {});
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
  setCareRecordDate(value) {
    const nextDate = /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? value : formatNowDate();
    state.ui.historyFilter.time = nextDate;
    actions.refreshCaregiverCloudTasks({ silent: true, recordDate: nextDate });
    actions.refreshCaregiverTaskRecords({ silent: true, recordDate: nextDate });
    notify();
  },
  closeCaregiverRecordDetail() {
    state.ui.selectedCaregiverReportElderId = "";
    state.ui.selectedCaregiverRecordTaskId = "";
    state.ui.caregiverRecordPhotoPreviewIndex = null;
    state.ui.caregiverRecordPhotoPreviewTaskId = "";
    notify();
  },
  async openCaregiverRecordPhotoPreview(taskId = "", index = "0") {
    const normalizedTaskId = String(taskId || state.ui.selectedCaregiverRecordTaskId || "");
    const photoIndex = Number.parseInt(index, 10) || 0;
    if (!normalizedTaskId) return;

    state.ui.caregiverRecordEvidenceByTaskId = state.ui.caregiverRecordEvidenceByTaskId || {};
    let evidence = normalizeEvidenceList(state.ui.caregiverRecordEvidenceByTaskId[normalizedTaskId]);
    if (!evidence.some((item) => item.dataUrl || item.url)) {
      try {
        const detail = await requestJson("/api/tasks/" + encodeURIComponent(normalizedTaskId));
        const item = detail?.item || {};
        evidence = [
          ...normalizeEvidenceList(item.recordEvidence || item.record_evidence),
          ...normalizeEvidenceList(item.exceptionEvidence || item.exception_evidence),
        ].filter((entry) => entry.dataUrl || entry.url);
        if (evidence.length) {
          state.ui.caregiverRecordEvidenceByTaskId[normalizedTaskId] = evidence;
        }
      } catch (error) {
        touchToast(error?.message || "图片读取失败");
        return;
      }
    }

    if (!evidence.length) {
      touchToast("该任务卡没有图片");
      return;
    }

    state.ui.caregiverRecordPhotoPreviewTaskId = normalizedTaskId;
    state.ui.caregiverRecordPhotoPreviewIndex = Math.min(photoIndex, evidence.length - 1);
    notify();
  },
  closeCaregiverRecordPhotoPreview() {
    state.ui.caregiverRecordPhotoPreviewIndex = null;
    state.ui.caregiverRecordPhotoPreviewTaskId = "";
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
  setDirectorAttendanceShift(value = "all") {
    ensureAttendanceState();
    const valid = new Set(["all", ...state.attendance.shiftTemplates.map((shift) => shift.id)]);
    state.ui.selectedAttendanceShift = valid.has(value) ? value : "all";
    notify();
  },
  toggleAttendanceShiftSettings() {
    ensureAttendanceState();
    state.ui.attendanceShiftSettingsOpen = !state.ui.attendanceShiftSettingsOpen;
    notify();
  },
  updateAttendanceShiftTemplate(shiftId, patch = {}) {
    ensureAttendanceState();
    const target = state.attendance.shiftTemplates.find((shift) => shift.id === shiftId);
    if (!target) return;
    const start = String(patch.start || target.start || "").slice(0, 5);
    const end = String(patch.end || target.end || "").slice(0, 5);
    if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) return;
    target.start = start;
    target.end = end;
    notify();
    actions.persistInstitutionSharedState({ silent: true });
  },
  closeDirectorPersonnelDraft() {
    state.ui.directorPersonnelDraft = null;
    notify();
  },
  async saveDirectorPersonnelDraft(input = {}) {
    const draft = state.ui.directorPersonnelDraft;
    if (!draft) return;

    const previousElder =
      draft.type === "elder" && draft.mode === "edit" ? JSON.parse(JSON.stringify(getElderById(draft.id) || null)) : null;
    const saved =
      draft.mode === "edit"
        ? draft.type === "elder"
          ? actions.updateElder(draft.id, input)
          : actions.updateCaregiver(draft.id, input)
        : draft.type === "elder"
          ? actions.addElder(input)
          : actions.addCaregiver(input);
    if (!saved) return;

    if (draft.type === "elder" && draft.mode === "edit" && isCloudSyncConfigured()) {
      const elder = getElderById(draft.id);
      if (elder) {
        try {
          await updateCloudElder(
            elder.id,
            {
              name: elder.name,
              gender: elder.gender,
              age: elder.age,
              floor: elder.floor,
              room: elder.room,
              bed: elder.bed,
              level: elder.level,
              reportTemplateId: elder.reportTemplateId,
              reportTemplateTitle: elder.reportTemplateTitle,
              assignedCaregiverId: elder.assignedCaregiverId || "",
              tags: elder.tags || [],
              familyContact: elder.familyContact || "",
              familyPhone: elder.familyPhone || "",
            },
            { institutionId: state.institution.id },
          );
          await actions._loadCloudPersonnel(state.institution.id);
        } catch (error) {
          if (previousElder) Object.assign(elder, previousElder);
          notify();
          touchToast(error?.message || "老人档案云端保存失败");
          return;
        }
      }
    }

    if (draft.type === "caregiver" && draft.mode === "edit" && isCloudSyncConfigured()) {
      const caregiver = getCaregiverById(draft.id);
      if (caregiver) {
        try {
          await updateCloudCaregiver(caregiver.id, {
            name: caregiver.name,
            employeeNo: caregiver.employeeNo || "",
            floor: caregiver.floor,
            shift: caregiver.shift || "",
            phone: caregiver.phone || "",
          });
          await actions._loadCloudPersonnel(state.institution.id);
        } catch (error) {
          touchToast(error?.message || "护工档案云端保存失败");
          return;
        }
      }
    }

    const caregiverUsernameInput = String(input.username || "").trim();
    const caregiverPasswordInput = String(input.password || "");
    if (draft.type === "caregiver" && (draft.mode === "create" || draft.mode === "edit") && (caregiverUsernameInput || caregiverPasswordInput)) {
      const caregiver = draft.mode === "edit"
        ? getCaregiverById(draft.id)
        : state.caregivers.find((c) => c.username === caregiverUsernameInput && !c.cloudUserId);
      if (caregiver && !caregiver.cloudUserId && caregiverUsernameInput && caregiverPasswordInput) {
        try {
          const result = await createAuthUser({
            username: caregiverUsernameInput,
            password: caregiverPasswordInput,
            displayName: input.name || caregiverUsernameInput,
            role: "caregiver",
            roleEntityId: caregiver.id,
          });
          caregiver.cloudUserId = result.user.id;
          caregiver.cloudUserStatus = result.user.status;
          caregiver.username = result.user.username || caregiverUsernameInput;
          caregiver.passwordHint = result.user.passwordHint || caregiverPasswordInput;
          notify();
        } catch (error) {
          touchToast("云端账号创建失败：" + (error.message || "网络错误"));
        }
      } else if (caregiver && caregiver.cloudUserId) {
        try {
          const payload = {
            displayName: input.name || caregiverUsernameInput || caregiver.name,
            roleEntityId: caregiver.id,
            status: "active",
          };
          if (caregiverUsernameInput) payload.username = caregiverUsernameInput;
          if (caregiverPasswordInput) payload.password = caregiverPasswordInput;
          const result = await updateAuthUser(caregiver.cloudUserId, {
            ...payload,
          });
          caregiver.username = result.user?.username || caregiverUsernameInput || caregiver.username;
          caregiver.cloudUserStatus = result.user?.status || "active";
          if (caregiverPasswordInput) caregiver.passwordHint = result.user?.passwordHint || caregiverPasswordInput;
          notify();
        } catch (error) {
          touchToast("云端账号更新失败：" + (error.message || "网络错误"));
        }
      }
    }

    const familyUsernameInput = String(input.username || "").trim();
    const familyPasswordInput = String(input.password || "");
    if (draft.type === "elder" && (draft.mode === "create" || draft.mode === "edit") && (familyUsernameInput || familyPasswordInput)) {
      const elder = draft.mode === "edit"
        ? getElderById(draft.id)
        : state.elders.find((e) => e.username === familyUsernameInput && !e.familyUserId);
      if (elder && !elder.familyUserId && familyUsernameInput && familyPasswordInput) {
        try {
          const result = await createAuthUser({
            username: familyUsernameInput,
            password: familyPasswordInput,
            displayName: input.name || familyUsernameInput,
            role: "family",
            roleEntityId: elder.id,
          });
          elder.familyUserId = result.user.id;
          elder.familyUserStatus = result.user.status;
          notify();
        } catch (error) {
          touchToast("家属账号创建失败：" + (error.message || "网络错误"));
        }
      } else if (elder && elder.familyUserId) {
        try {
          const payload = {
            displayName: input.name || familyUsernameInput || elder.name,
            roleEntityId: elder.id,
            status: "active",
          };
          if (familyUsernameInput) payload.username = familyUsernameInput;
          if (familyPasswordInput) payload.password = familyPasswordInput;
          const result = await updateAuthUser(elder.familyUserId, {
            ...payload,
          });
          elder.username = result.user?.username || familyUsernameInput || elder.username;
          elder.familyUserStatus = result.user?.status || "active";
          notify();
        } catch (error) {
          touchToast("家属账号更新失败：" + (error.message || "网络错误"));
        }
      }
    }

    state.ui.directorPersonnelDraft = null;
    notify();

    await actions.persistInstitutionSharedState({ silent: true });

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
      defaultShiftId: String(input.defaultShiftId || "").trim() || "morning",
      shiftIds: [String(input.defaultShiftId || "").trim() || "morning"],
      status: "off-duty",
      username: String(input.username || "").trim(),
      cloudUserId: "",
      cloudUserStatus: "",
    };

    state.caregivers.push(nextCaregiver);

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
    caregiver.defaultShiftId = String(input.defaultShiftId || "").trim() || caregiver.defaultShiftId || "morning";
    caregiver.shiftIds = [caregiver.defaultShiftId];
    if (input.username !== undefined) caregiver.username = String(input.username || "").trim();

    if (state.caregiver.id === caregiver.id) {
      state.caregiver = { ...caregiver };
    }


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

    if (caregiver.cloudUserId) {
      disableAuthUser(caregiver.cloudUserId).catch(() => {});
    }

    state.caregivers = state.caregivers.filter((item) => item.id !== caregiver.id);
    state.tasks = state.tasks.filter((task) => task.caregiverId !== caregiver.id && task.defaultCaregiverId !== caregiver.id);
    state.cloud.tasks = state.cloud.tasks.filter((task) => task.caregiverId !== caregiver.id);
    if (state.caregiver.id === caregiver.id) {
      state.caregiver = { ...state.caregivers[0] };
    }


    touchToast(`已删除护工 ${caregiver.name}`);
    actions.persistInstitutionSharedState({ silent: true });

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
      username: String(input.username || "").trim(),
      familyUserId: "",
      familyUserStatus: "",
      assignedCaregiverId: "",
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
    if (input.username !== undefined) elder.username = String(input.username || "").trim();
    if (input.assignedCaregiverId !== undefined) elder.assignedCaregiverId = String(input.assignedCaregiverId || "").trim();
    elder.familyContact = String(input.familyContact || "").trim() || elder.familyContact || "家属：未填写";
    elder.familyPhone = String(input.familyPhone || "").trim() || elder.familyPhone || "";

    if (state.ui.selectedDirectorPlanRoom === elder.id) {
      state.ui.selectedRoom = room;
      state.ui.selectedElderId = elder.id;
    }
    state.ui.directorPersonnelFloor = floor;


    touchToast(`已更新老人 ${name}`);
    return true;
  },
  setElderReportTemplate(elderId, templateId) {
    if (!templateId) return;
    const elder = getElderById(elderId);
    if (!elder) return;
    const reportTemplate = getDailyReportTemplateChoice(templateId);
    elder.reportTemplateId = reportTemplate.id;
    elder.reportTemplateTitle = reportTemplate.title;

    actions.persistInstitutionSharedState({ silent: true });

    notify();
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

    if (elder.familyUserId) {
      disableAuthUser(elder.familyUserId).catch(() => {});
    }

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


    touchToast(`已删除老人 ${elder.name}`);
    actions.persistInstitutionSharedState({ silent: true });

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
  openDailyReportTemplateEditor(draft, options = {}) {
    const shouldEditExisting = Boolean(options.editExisting && draft?.id);
    state.ui.directorReportTemplateDraft = shouldEditExisting
      ? createDailyReportTemplateDraft(draft)
      : createBlankDailyReportTemplateDraft();
    state.ui.directorReportTemplateEditingId = shouldEditExisting ? draft.id : "";
    state.ui.directorReportTemplateTransient = { newSectionTitle: "", newItems: {} };
    state.ui.directorReportTemplatePreviewOpen = false;
    state.ui.directorReportTemplatePreviewZoom = 1;
    state.ui.directorReportTemplateScheduleSectionId = "";
    notify();
  },
  createNewDailyReportTemplateInstanceFromCurrent(draft) {
    if (draft) {
      state.ui.directorReportTemplateDraft = {
        ...(state.ui.directorReportTemplateDraft || createBlankDailyReportTemplateDraft()),
        ...draft,
        sections: Array.isArray(draft.sections) ? draft.sections : [],
      };
    }
    state.ui.directorReportTemplateEditingId = "";
    return actions.openDailyReportTemplateImport(state.ui.directorReportTemplateDraft);
  },
  closeDailyReportTemplateEditor() {
    state.ui.directorReportTemplateDraft = null;
    state.ui.directorReportTemplateEditingId = "";
    state.ui.directorReportTemplateTransient = { newSectionTitle: "", newItems: {} };
    state.ui.directorReportTemplatePreviewOpen = false;
    state.ui.directorReportTemplateScheduleSectionId = "";
    notify();
  },
  updateDailyReportTemplateDraft(draft) {
    if (!draft) return;
    state.ui.directorReportTemplateDraft = {
      ...(state.ui.directorReportTemplateDraft || Object.values(state.dailyReportTemplates || {})[0]),
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
      ...(state.ui.directorReportTemplateDraft || Object.values(state.dailyReportTemplates || {})[0]),
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
      ...(state.ui.directorReportTemplateDraft || Object.values(state.dailyReportTemplates || {})[0]),
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
      ...(state.ui.directorReportTemplateDraft || Object.values(state.dailyReportTemplates || {})[0]),
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
      ...(state.ui.directorReportTemplateDraft || Object.values(state.dailyReportTemplates || {})[0]),
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
        ...(state.ui.directorReportTemplateDraft || Object.values(state.dailyReportTemplates || {})[0]),
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
        ...(state.ui.directorReportTemplateDraft || Object.values(state.dailyReportTemplates || {})[0]),
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
        ...(state.ui.directorReportTemplateDraft || Object.values(state.dailyReportTemplates || {})[0]),
        ...draft,
        sections: Array.isArray(draft.sections) ? draft.sections : [],
      };
    }
    state.ui.directorReportTemplateImportOpen = true;
    state.ui.directorReportTemplateImportInstitutionId =
      state.ui.directorReportTemplateImportInstitutionId || state.institution.id || "";
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
      const response = await fetchDailyReportTemplates({ templateType: "base", limit: 100 });
      const items = Array.isArray(response?.items) ? response.items : [];
      const institutions = Array.isArray(response?.institutions) ? response.institutions : [];
      state.ui.directorReportTemplateImportCatalog = { items, institutions };

      const idsWithTemplates = new Set(items.map((item) => item.institutionId).filter(Boolean));
      const selectedInstitutionId = idsWithTemplates.has(state.ui.directorReportTemplateImportInstitutionId)
        ? state.ui.directorReportTemplateImportInstitutionId
        : idsWithTemplates.has(state.institution.id)
          ? state.institution.id
          : items[0]?.institutionId || state.institution.id || "";
      state.ui.directorReportTemplateImportInstitutionId = selectedInstitutionId;
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
      id: `daily-report-${state.institution.id || "institution"}-${Date.now()}`,
      templateType: "instance",
      baseTemplateId: imported.id || "",
      version: 1,
      updatedAt: "",
    };
    state.ui.directorReportTemplateEditingId = "";
    state.ui.directorReportTemplateTransient = { newSectionTitle: "", newItems: {} };
    state.ui.directorReportTemplateImportOpen = false;
    state.ui.directorReportTemplatePreviewOpen = false;
    touchToast("已导入云端模板，请填写模板名称后保存");
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
    notify();
  },
  closeDirectorInboxExport() {
    state.ui.directorInboxExportDate = "";
    notify();
  },
  async requestDirectorInboxDayExport(date = "", mode = "print") {
    const targetDate = date || state.ui.directorInboxExportDate || state.ui.directorInboxSelectedDate;
    if (!targetDate) return;

    await actions.refreshDirectorCloudReports({ recordDate: targetDate, silent: true });

    state.ui.directorCareRecordBatchDate = targetDate;
    state.ui.directorCareRecordPreviewOpen = true;
    state.ui.directorInboxExportDate = "";
    state.ui.pendingCareRecordAction = mode === "image" ? "image" : "print";
    notify();
  },
  async refreshDailyReportTemplate(options = {}) {
    return actions.refreshDailyReportTemplates(options);
  },
  async saveDailyReportTemplateDraft(draft, name) {
    const editingId = state.ui.directorReportTemplateEditingId;
    const isEditing = editingId && (state.dailyReportTemplates || {})[editingId];
    const templateName = (draft.title || "").trim();

    if (!templateName) {
      touchToast("请输入模板名称");
      return;
    }

    const titleSlug = String(templateName).replace(/[^a-zA-Z0-9一-鿿]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "custom";
    const draftId = String(draft?.id || "").trim();
    const isDraftInstanceId =
      draftId &&
      draftId !== "daily-report-basic" &&
      !draftId.startsWith("base-") &&
      !(state.dailyReportTemplates || {})[draftId];
    const newId = isEditing
      ? editingId
      : isDraftInstanceId
        ? draftId
        : `daily-report-${state.institution.id || "institution"}-${titleSlug}-${Date.now()}`;
    const existingTemplate = isEditing ? (state.dailyReportTemplates || {})[editingId] : null;

    const nextTemplate = normalizeDailyReportTemplate({
      ...(draft || {}),
      id: newId,
      version: isEditing ? Number(existingTemplate?.version || 1) + 1 : 1,
      updatedAt: `${formatNowDate()} ${formatNowTime()}`,
    });

    if (!nextTemplate.sections.length) {
      touchToast("日报模板至少保留一个栏目");
      return;
    }

    applyDailyReportTemplate(nextTemplate);
    state.ui.directorReportTemplateDraft = nextTemplate;
    state.ui.directorReportTemplateEditingId = nextTemplate.id;
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
          templateType: "instance",
          baseTemplateId: nextTemplate.baseTemplateId || "",
        });
        if (response?.item) {
          const cloudTemplate = normalizeDailyReportTemplate(response.item);
          applyDailyReportTemplate(cloudTemplate);
          state.ui.directorReportTemplateDraft = cloudTemplate;
          state.ui.directorReportTemplateEditingId = cloudTemplate.id;
          notify();
        }

        touchToast("日报模板已同步云端");
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
  async refreshDailyReportTemplates(options = {}) {
    if (!isCloudSyncConfigured()) return;
    try {
      const response = await fetchDailyReportTemplates({
        institutionId: getCurrentSessionInstitutionId(),
        templateType: "instance",
      });
      if (Array.isArray(response?.items)) {
        const map = {};
        response.items.forEach((tpl) => {
          const nt = normalizeDailyReportTemplate(tpl);
          if (nt.id) map[nt.id] = nt;
        });
        const prev = JSON.stringify(state.dailyReportTemplates || {});
        state.dailyReportTemplates = map;
        if (JSON.stringify(map) !== prev && !options.silent) notify();
      }
    } catch (_) {}
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
    const targetCaregiver = selectedElder ? getCaregiverForFloor(selectedElder.floor, selectedElder.id) : (state.caregivers[0] || null);

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
  async setDirectorAnomalyDate(value) {
    const nextDate = value || state.director.date || formatNowDate();
    state.ui.directorAuditDate = nextDate;
    notify();
    if (isCloudSyncConfigured()) {
      await actions.refreshDirectorCloudTasks({ silent: true, force: true, recordDate: nextDate, limit: 500 });
    }
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
      const reportTasks = state.tasks.filter(
        (task) =>
          task.caregiverId === (savedReport.caregiverId || state.caregiver.id) &&
          task.elderId === savedReport.elderId &&
          (!task.recordDate || task.recordDate === savedReport.recordDate),
      );
      await Promise.all(reportTasks.map((task) => syncCaregiverTaskToCloud(task, "任务记录云端同步失败")));
      const syncedReport = mergeCloudCareRecord({ ...savedReport, syncStatus: "synced", workflowStatus: "submitted" });
      state.ui.selectedCaregiverReportElderId = syncedReport.elderId;
      state.ui.caregiverDailyReportDraft = syncedReport;
      upsertFamilyCareReportNotice(syncedReport, "synced");
      setCloudCareReportsError("");
      setCloudCareReportsFetchedAt(`${formatNowDate()} ${formatNowTime()}`);
      await actions.persistInstitutionSharedState({ silent: true });
      touchToast("护工任务记录已同步到云端");
    } catch (error) {
      const failedReport = upsertDailyReport(savedReport, "sync-failed");
      state.ui.selectedCaregiverReportElderId = failedReport.elderId;
      state.ui.caregiverDailyReportDraft = failedReport;
      upsertFamilyCareReportNotice(failedReport, "sync-failed");
      setCloudCareReportsError(error?.message || "云端同步失败");
      touchToast(error?.message || "云端同步失败");
    }
  },
  async syncCaregiverAutoCareRecord(elderId = "", options = {}) {
    const elder = getElderById(elderId);
    if (!elder) return;

    const recordDate = getHistoryFilterRecordDate();
    const timelineTasks = sortTasksBySchedule(
      state.tasks.filter(
        (task) =>
          task.caregiverId === state.caregiver.id &&
          task.elderId === elder.id &&
          (!task.recordDate || task.recordDate === recordDate) &&
          hasCaregiverTaskOperation(task),
      ),
    );
    const existingReport = findDailyReport(elder.id, recordDate);
    const autoRecord = createAutoCareRecordFromTimeline(elder, timelineTasks, recordDate, existingReport);
    const pendingRecord = upsertDailyReport(autoRecord, "pending-sync");
    state.ui.selectedCaregiverReportElderId = elder.id;
    state.ui.caregiverDailyReportDraft = pendingRecord;
    upsertFamilyCareReportNotice(pendingRecord, "pending-sync");
    if (!options.deferNotify) notify();

    if (!isCloudSyncConfigured()) {
      const failedReport = upsertDailyReport(pendingRecord, "sync-failed");
      state.ui.caregiverDailyReportDraft = failedReport;
      touchToast("云端接口未配置，护理记录已保存为待归档");
      notify();
      return;
    }

    try {
      await Promise.all(timelineTasks.map((task) => syncCaregiverTaskToCloud(task, "护理记录云端同步失败")));
      const syncedReport = mergeCloudCareRecord({ ...pendingRecord, syncStatus: "synced", workflowStatus: "submitted" });
      state.ui.caregiverDailyReportDraft = syncedReport;
      upsertFamilyCareReportNotice(syncedReport, "synced");
      setCloudCareReportsError("");
      setCloudCareReportsFetchedAt(`${formatNowDate()} ${formatNowTime()}`);
      await actions.persistInstitutionSharedState({ silent: true });
      touchToast("护理记录已刷新");
      notify();
    } catch (error) {
      const failedReport = upsertDailyReport(pendingRecord, "sync-failed");
      state.ui.caregiverDailyReportDraft = failedReport;
      upsertFamilyCareReportNotice(failedReport, "sync-failed");
      setCloudCareReportsError(error?.message || "护理记录云端同步失败");
      touchToast(error?.message || "护理记录云端同步失败");
      notify();
    }
  },
  async refreshDirectorCloudReports(options = {}) {
    if (options.silent && isReportTemplateWorkspaceOpen()) return;
    if (directorCareReportsRequestInFlight) return;

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
    directorCareReportsRequestInFlight = true;
    try {
      const baseDate = options.recordDate || state.ui.directorAuditDate || state.director.date || formatNowDate();
      const match = /^(\d{4})-(\d{2})/.exec(String(baseDate || ""));
      const year = match ? Number(match[1]) : Number(formatNowDate().slice(0, 4));
      const month = match ? Number(match[2]) : Number(formatNowDate().slice(5, 7));
      const daysInMonth = new Date(year, month, 0).getDate();
      const today = state.director.date || formatNowDate();
      const dates = Array.from({ length: daysInMonth }, (_, index) => `${year}-${String(month).padStart(2, "0")}-${String(index + 1).padStart(2, "0")}`)
        .filter((date) => !today || date <= today);

      for (const recordDate of dates) {
        await actions.refreshDirectorCloudTasks({
          silent: true,
          force: true,
          recordDate,
          limit: options.limit || 500,
        });
      }
      setCloudCareReportsFetchedAt(`${formatNowDate()} ${formatNowTime()}`);
      setCloudCareReportsError("");
    } catch (error) {
      setCloudCareReportsError(error?.message || "收集云端日报任务失败");
    } finally {
      directorCareReportsRequestInFlight = false;
      setCloudCareReportsLoading(false);
      if (JSON.stringify(state.cloud.careReports) !== prevSnapshot || !options.silent) notify();
    }
  },
  async refreshCaregiverTaskRecords(options = {}) {
    if (state.session.identity !== "caregiver" || !state.caregiver?.id) return;
    if (caregiverCareReportsRequestInFlight) return;

    if (!isCloudSyncConfigured()) {
      setCloudCareReportsError("云端接口未配置");
      if (!options.silent) notify();
      return;
    }

    caregiverCareReportsRequestInFlight = true;
    setCloudCareReportsLoading(true);
    if (!options.preserveError) setCloudCareReportsError("");
    if (!options.silent) notify();

    const recordDate = options.recordDate || getHistoryFilterRecordDate();
    try {
      await downloadDirectorCareReports(
        {
          institutionId: getCurrentSessionInstitutionId(),
          caregiverId: state.caregiver.id,
          recordDate,
          limit: options.limit || 100,
        },
        { clear: false },
      );
    } catch (error) {
      setCloudCareReportsError(error?.message || "拉取云端护理记录失败");
      state.cloud.lastCaregiverRecordSync = {
        ...(state.cloud.lastCaregiverRecordSync || {}),
        institutionId: getCurrentSessionInstitutionId(),
        caregiverId: state.caregiver.id,
        recordDate,
        error: error?.message || "拉取云端护理记录失败",
      };
    } finally {
      caregiverCareReportsRequestInFlight = false;
      setCloudCareReportsLoading(false);
      notify();
    }
  },
  async refreshCloudInventory(options = {}) {
    if (!isCloudSyncConfigured()) {
      if (!options.silent) touchToast("云端接口未配置");
      return;
    }
    const institutionId = getCurrentSessionInstitutionId();
    const requestKey = [
      institutionId,
      options.recordDate || state.ui.inventoryUsageFilters?.recordDate || "",
      options.itemName || state.ui.inventoryUsageFilters?.itemName || "",
      options.limit || 100,
    ].join("|");
    if (inventoryRefreshInFlight?.key === requestKey) {
      return inventoryRefreshInFlight.promise;
    }
    const runRefresh = async () => {
      if (options.checkStatus && options.checkStatus !== "force") {
        try {
          const syncStatus = await checkCloudSyncDomains(["inventory"], {
            institutionId,
            recordDate: options.recordDate || state.director?.date || formatNowDate(),
            timeout: options.statusTimeout || INVENTORY_SYNC_STATUS_TIMEOUT_MS,
            commit: false,
          });
          if (syncStatus && !syncDomainChanged(syncStatus, "inventory")) {
            commitCloudSyncDomains(syncStatus, {
              institutionId,
              recordDate: options.recordDate || state.director?.date || formatNowDate(),
            });
            setCloudInventoryFetchedAt(`${formatNowDate()} ${formatNowTime()}`);
            setCloudInventoryError("");
            return false;
          }
          options._pendingSyncStatus = syncStatus;
        } catch (_) {}
      }
      const hasInventoryInputFocus = () =>
        Boolean(
          typeof document !== "undefined" &&
            document.activeElement?.closest?.("[data-inventory-stock-adjust-form], [data-inventory-item-form]"),
        );
      setCloudInventoryLoading(true);
      if (!options.preserveError) setCloudInventoryError("");
      if (!options.silent) notify();
      try {
        const [itemsResponse, usagesResponse] = await Promise.all([
          fetchInventoryItems({ institutionId }),
          fetchInventoryUsages({
            institutionId,
            recordDate: options.recordDate || state.ui.inventoryUsageFilters?.recordDate || "",
            itemName: options.itemName || state.ui.inventoryUsageFilters?.itemName || "",
            limit: options.limit || 100,
          }),
        ]);
        replaceInventoryItems(Array.isArray(itemsResponse?.items) ? itemsResponse.items : []);
        mergeInventoryUsages(Array.isArray(usagesResponse?.items) ? usagesResponse.items : []);
        setCloudInventoryFetchedAt(itemsResponse?.fetchedAt || usagesResponse?.fetchedAt || `${formatNowDate()} ${formatNowTime()}`);
        setCloudInventoryError("");
        if (options._pendingSyncStatus) {
          commitCloudSyncDomains(options._pendingSyncStatus, {
            institutionId,
            recordDate: options.recordDate || state.director?.date || formatNowDate(),
          });
        }
        if (!options.silent) touchToast("库存已刷新");
        if (!hasInventoryInputFocus()) {
          notify();
        } else {
          setCloudInventoryLoading(false);
        }
      } catch (error) {
        setCloudInventoryError(error?.message || "库存云端同步失败");
        if (!options.silent) touchToast(state.cloud.inventoryError);
      } finally {
        setCloudInventoryLoading(false);
      }
    };
    const promise = runRefresh();
    inventoryRefreshInFlight = { key: requestKey, promise };
    try {
      return await promise;
    } finally {
      if (inventoryRefreshInFlight?.promise === promise) {
        inventoryRefreshInFlight = null;
      }
    }
  },
  openInventoryItemDraft(itemId = "") {
    const item = getInventoryItemById(itemId);
    state.ui.inventoryItemActionsId = "";
    state.ui.inventoryItemDraft = item
      ? { ...item }
      : {
          id: "",
          name: "",
          category: "护理用品",
          unit: "件",
          quantity: 0,
          warningQuantity: 0,
          location: "",
        };
    notify();
  },
  closeInventoryItemDraft() {
    state.ui.inventoryItemDraft = null;
    notify();
  },
  openInventoryItemActions(itemId = "") {
    state.ui.inventoryItemActionsId = itemId;
    const item = getInventoryItemById(itemId);
    if (item?.name) {
      actions.refreshCloudInventory({ silent: true, itemName: item.name, limit: 500 });
    }
    notify();
  },
  closeInventoryItemActions() {
    state.ui.inventoryItemActionsId = "";
    notify();
  },
  openInventoryStockAdjust(itemId = "") {
    const item = getInventoryItemById(itemId);
    if (!item) return;
    state.ui.inventoryItemActionsId = "";
    state.ui.inventoryStockAdjustDraft = {
      id: item.id,
      name: item.name,
      category: item.category,
      unit: item.unit,
      currentQuantity: item.quantity,
      warningQuantity: item.warningQuantity,
      location: item.location,
      mode: "increase",
    };
    notify();
  },
  closeInventoryStockAdjust() {
    state.ui.inventoryStockAdjustDraft = null;
    notify();
  },
  setInventoryStockAdjustMode(mode = "increase") {
    if (!state.ui.inventoryStockAdjustDraft) return;
    state.ui.inventoryStockAdjustDraft = {
      ...state.ui.inventoryStockAdjustDraft,
      mode: mode === "decrease" ? "decrease" : "increase",
    };
    notify();
  },
  setInventoryUsageFilter(patch = {}) {
    state.ui.inventoryUsageFilters = {
      ...(state.ui.inventoryUsageFilters || {}),
      ...patch,
    };
    notify();
  },
  async deleteInventoryItem(itemId = "") {
    const item = getInventoryItemById(itemId);
    if (!item) return;
    if (!isCloudSyncConfigured()) {
      touchToast("云端接口未配置，无法删除库存");
      return;
    }
    try {
      const response = await upsertInventoryItem({
        id: item.id,
        institutionId: getCurrentSessionInstitutionId(),
        name: item.name,
        category: item.category,
        unit: item.unit,
        quantity: item.quantity,
        warningQuantity: item.warningQuantity,
        location: item.location,
        status: "deleted",
      });
      mergeInventoryItems(response?.item ? [response.item] : []);
      state.ui.inventoryItemActionsId = "";
      setCloudInventoryFetchedAt(response?.fetchedAt || `${formatNowDate()} ${formatNowTime()}`);
      touchToast("物资已删除");
      notify();
    } catch (error) {
      setCloudInventoryError(error?.message || "库存删除失败");
      touchToast(error?.message || "库存删除失败");
    }
  },
  async saveInventoryStockAdjust(input = {}) {
    const draft = {
      ...(state.ui.inventoryStockAdjustDraft || {}),
      ...input,
    };
    if (!draft.id) return;
    const amount = Math.max(0, Number(draft.amount || 0));
    if (!Number.isFinite(amount) || amount <= 0) {
      touchToast("请输入调整数量");
      return;
    }
    const delta = draft.mode === "decrease" ? -amount : amount;
    const nextQuantity = Math.max(0, Number(draft.currentQuantity || 0) + delta);
    if (!isCloudSyncConfigured()) {
      touchToast("云端接口未配置，无法调整库存");
      return;
    }
    try {
      const response = await upsertInventoryItem({
        id: draft.id,
        institutionId: getCurrentSessionInstitutionId(),
        name: draft.name,
        category: draft.category || "护理用品",
        unit: draft.unit || "件",
        quantity: nextQuantity,
        warningQuantity: Math.max(0, Number(draft.warningQuantity || 0)),
        location: draft.location || "",
        status: "active",
      });
      mergeInventoryItems(response?.item ? [response.item] : []);
      setCloudInventoryFetchedAt(response?.fetchedAt || `${formatNowDate()} ${formatNowTime()}`);
      setCloudInventoryError("");
      state.ui.inventoryStockAdjustDraft = null;
      touchToast("库存已调整");
      notify();
    } catch (error) {
      setCloudInventoryError(error?.message || "库存调整失败");
      touchToast(error?.message || "库存调整失败");
    }
  },
  async saveInventoryItem(input = {}) {
    const draft = {
      ...(state.ui.inventoryItemDraft || {}),
      ...input,
    };
    const name = String(draft.name || "").trim();
    if (!name) {
      touchToast("请输入库存名称");
      return;
    }
    if (!isCloudSyncConfigured()) {
      touchToast("云端接口未配置，无法保存库存");
      return;
    }
    try {
      const response = await upsertInventoryItem({
        id: draft.id || "",
        institutionId: getCurrentSessionInstitutionId(),
        name,
        category: draft.category || "护理用品",
        unit: draft.unit || "件",
        quantity: Math.max(0, Number(draft.quantity || 0)),
        warningQuantity: Math.max(0, Number(draft.warningQuantity || 0)),
        location: draft.location || "",
        status: draft.status || "active",
      });
      mergeInventoryItems(response?.item ? [response.item] : []);
      setCloudInventoryFetchedAt(response?.fetchedAt || `${formatNowDate()} ${formatNowTime()}`);
      setCloudInventoryError("");
      state.ui.inventoryItemDraft = null;
      touchToast("库存已保存到云端");
      notify();
    } catch (error) {
      setCloudInventoryError(error?.message || "库存保存失败");
      touchToast(error?.message || "库存保存失败");
    }
  },
  async loadLatestDirectorCareRecord(elderId, recordDate = "", options = {}) {
    if (!elderId || !isCloudSyncConfigured()) return;

    try {
      const response = await fetchCaregiverTaskRecords({
        institutionId: state.institution.id,
        elderId,
        recordDate,
        limit: 1,
      });
      const latestRecord = groupTaskRecordsAsCareReports(Array.isArray(response?.items) ? response.items : [])[0] || null;
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
  async loadTaskEvidence(taskId) {
    if (!taskId || !isCloudSyncConfigured()) return;
    if (taskEvidenceRequestsInFlight.has(taskId)) return;
    taskEvidenceRequestsInFlight.add(taskId);
    try {
      var detail = await requestJson("/api/tasks/" + encodeURIComponent(taskId));
      var item = detail && detail.item;
      if (!item) return;
      var tid = item.taskId || item.id || taskId;
      var taskIndex = state.tasks.findIndex(function (t) { return t.id === tid || t.cloudTaskId === tid; });
      if (taskIndex >= 0) {
        var existing = state.tasks[taskIndex];
        for (var _ek2 of ["recordEvidence", "exceptionEvidence"]) {
          var _cloudEv = item[_ek2];
          if (Array.isArray(_cloudEv) && _cloudEv.length) {
            existing[_ek2] = _cloudEv;
          }
        }
        state.tasks.splice(taskIndex, 1, {
          ...existing,
          recordNote: item.recordNote || existing.recordNote || "",
          recordEvidenceCount: Number(item.recordEvidenceCount || existing.recordEvidenceCount || 0),
          recordedAt: item.recordedAt || existing.recordedAt || "",
          exceptionNote: item.exceptionNote || existing.exceptionNote || "",
          exceptionType: item.exceptionType || existing.exceptionType || "",
          exceptionEvidenceCount: Number(item.exceptionEvidenceCount || existing.exceptionEvidenceCount || 0),
          exceptionReportedAt: item.exceptionReportedAt || existing.exceptionReportedAt || "",
          completedAt: item.completedAt || existing.completedAt || "",
        });
      }
      notify();
    } catch (_) {
    } finally {
      taskEvidenceRequestsInFlight.delete(taskId);
    }
  },
  async refreshCaregiverCloudTasks(options = {}) {
    if (state.session.identity !== "caregiver" || !state.caregiver?.id) return;
    const syncCaregiverId = state.caregiver.id;
    const syncInstitutionId = getCurrentSessionInstitutionId();
    if (syncInstitutionId && state.institution.id !== syncInstitutionId) {
      state.institution.id = syncInstitutionId;
    }
    const syncDate = getCaregiverRecordDate(options);
    state.ui.caregiverTaskRecordDate = syncDate;
    const requestKey = [syncInstitutionId, syncCaregiverId, syncDate].join("|");
    if (taskRefreshInFlight.caregiver?.key === requestKey) {
      return taskRefreshInFlight.caregiver.promise;
    }
    const runRefresh = async () => {
    const buildTaskSignature = () =>
      JSON.stringify(
        state.tasks
          .filter((task) => task.caregiverId === syncCaregiverId)
          .map((task) => [task.id, task.elderId, task.caregiverId, task.status, task.publishedAt]),
      );
    let shouldNotify = !options.silent || options.force;
    const beforeSignature = buildTaskSignature();

    if (!isCloudSyncConfigured()) {
      if (!options.silent) {
      setCloudTasksError("云端任务接口未配置");
        notify();
      }
      return;
    }

    if (!syncInstitutionId) {
      setCloudTasksError("当前登录会话缺少养老院ID，无法拉取任务");
      if (!options.silent) notify();
      return;
    }

    if (options.ensureInstitutionState || !state.cloud.institutionStateFetchedAt) {
      await actions.refreshInstitutionSharedState({ silent: true });
    }

    let pendingSyncStatus = null;
    if (!options.force && options.checkStatus !== false) {
      try {
        const syncStatus = await checkCloudSyncDomains(["tasks"], {
          institutionId: syncInstitutionId,
          recordDate: syncDate,
          commit: false,
        });
        if (syncStatus && !syncDomainChanged(syncStatus, "tasks")) {
          commitCloudSyncDomains(syncStatus, { institutionId: syncInstitutionId, recordDate: syncDate });
          setCloudTasksFetchedAt(`${formatNowDate()} ${formatNowTime()}`);
          setCloudTasksError("");
          return;
        }
        pendingSyncStatus = syncStatus;
      } catch (_) {}
    }

    setCloudTasksLoading(true);
    if (!options.preserveError) {
      setCloudTasksError("");
    }
    if (!options.silent) notify();

    try {
      const response = await fetchPublishedTasks({
        institutionId: syncInstitutionId,
        caregiverId: syncCaregiverId,
        recordDate: syncDate,
        limit: options.limit || 100,
        light: true,
        timeout: options.timeout || TASK_SYNC_FETCH_TIMEOUT_MS,
      });
      const nextItems = Array.isArray(response?.items)
        ? response.items
        : Array.isArray(response?.tasks)
          ? response.tasks
          : Array.isArray(response)
            ? response
            : [];

      const normalizedItems = nextItems.map((item) => normalizeCloudTask(item)).filter(Boolean);
      const mergedItems = normalizedItems.filter((item) => item.caregiverId === syncCaregiverId);
      state.cloud.lastCaregiverTaskSync = {
        institutionId: syncInstitutionId,
        caregiverId: syncCaregiverId,
        recordDate: syncDate,
        returnedCount: nextItems.length,
        normalizedCount: normalizedItems.length,
        mergedCount: mergedItems.length,
        skippedCount: normalizedItems.length - mergedItems.length,
        fetchedAt: response?.fetchedAt || "",
      };

      const cloudIds = new Set(normalizedItems.map((t) => t.id || t.taskId).filter(Boolean));
      state.tasks = state.tasks.filter((task) => {
        if (isTemporaryTask(task)) return true;
        if (task.caregiverId !== syncCaregiverId) return true;
        if (task.recordDate && task.recordDate !== syncDate) return true;
        if (cloudIds.has(task.id)) return true;
        return false;
      });

      mergedItems.forEach((item) => mergeCloudTask(item, { skipSort: true }));
      state.tasks = sortTasksBySchedule(state.tasks);

      refreshDirectorOverview();
      ensureCurrentSelections();
      setCloudTasksFetchedAt(response?.fetchedAt || `${formatNowDate()} ${formatNowTime()}`);
      setCloudTasksError("");
      if (pendingSyncStatus) {
        commitCloudSyncDomains(pendingSyncStatus, { institutionId: syncInstitutionId, recordDate: syncDate });
      }
      shouldNotify = shouldNotify || beforeSignature !== buildTaskSignature();
    } catch (error) {
      setCloudTasksError(error?.message || "拉取云端任务失败");
      state.cloud.lastCaregiverTaskSync = {
        ...(state.cloud.lastCaregiverTaskSync || {}),
        institutionId: syncInstitutionId,
        caregiverId: syncCaregiverId,
        recordDate: syncDate,
        error: error?.message || "拉取云端任务失败",
      };
    } finally {
      setCloudTasksLoading(false);
      if (shouldNotify) {
        notify();
      }
    }
    };
    const promise = runRefresh();
    taskRefreshInFlight.caregiver = { key: requestKey, promise };
    try {
      return await promise;
    } finally {
      if (taskRefreshInFlight.caregiver?.promise === promise) {
        taskRefreshInFlight.caregiver = null;
      }
    }
  },
  async refreshDirectorCloudTasks(options = {}) {
    if (state.session.identity !== "director" && state.session.identity !== "admin" && state.session.identity !== "superadmin") return;

    if (!isCloudSyncConfigured()) return;
    const syncDate = options.recordDate || state.director.date || formatNowDate();
    const requestKey = [state.institution.id || "", syncDate].join("|");
    if (taskRefreshInFlight.director?.key === requestKey) {
      return taskRefreshInFlight.director.promise;
    }
    const runRefresh = async () => {

    // updatedAt excluded — changes on every fetch, would break signature no-op
    const buildTaskSignature = () =>
      state.tasks.map((task) => [task.id, task.status, task.recordNote || "", (task.recordEvidence || []).length]);

    const signToString = (sig) => JSON.stringify(sig);

    let shouldNotify = !options.silent;
    const beforeSignature = buildTaskSignature();

    try {
      let pendingSyncStatus = null;
      if (!options.force && options.checkStatus !== false) {
        const syncStatus = await checkCloudSyncDomains(["tasks"], {
          institutionId: state.institution.id,
          recordDate: syncDate,
          commit: false,
        });
        if (syncStatus && !syncDomainChanged(syncStatus, "tasks")) {
          commitCloudSyncDomains(syncStatus, { institutionId: state.institution.id, recordDate: syncDate });
          setCloudTasksFetchedAt(`${formatNowDate()} ${formatNowTime()}`);
          setCloudTasksError("");
          return;
        }
        pendingSyncStatus = syncStatus;
      }
      const response = await fetchPublishedTasks({
        institutionId: state.institution.id,
        recordDate: syncDate,
        limit: options.limit || 200,
        light: true,
        timeout: options.timeout || TASK_SYNC_FETCH_TIMEOUT_MS,
      });
      const nextItems = Array.isArray(response?.items)
        ? response.items
        : Array.isArray(response?.tasks)
          ? response.tasks
          : Array.isArray(response)
            ? response
            : [];

      const cloudKeys = new Set();
      nextItems.forEach((item) => getTaskSyncKeys(normalizeCloudTask(item) || item).forEach((key) => cloudKeys.add(key)));
      state.tasks = state.tasks.filter((task) => {
        if (isTemporaryTask(task)) return true;
        if (task.recordDate && task.recordDate !== syncDate) return true;
        return taskMatchesSyncKeys(task, cloudKeys);
      });

      nextItems.forEach((item) => {
        mergeCloudTask(item, { skipSort: true });
      });
      state.tasks = sortTasksBySchedule(state.tasks);
      hydrateMissingDirectorExceptionEvidence(nextItems);

      setCloudTasksFetchedAt(response?.fetchedAt || `${formatNowDate()} ${formatNowTime()}`);
      setCloudTasksError("");
      if (pendingSyncStatus) {
        commitCloudSyncDomains(pendingSyncStatus, { institutionId: state.institution.id, recordDate: syncDate });
      }

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
      if (shouldNotify) {
        if (actions.patchDirectorTimeline()) return;
        notify();
      }
    }
    };
    const promise = runRefresh();
    taskRefreshInFlight.director = { key: requestKey, promise };
    try {
      return await promise;
    } finally {
      if (taskRefreshInFlight.director?.promise === promise) {
        taskRefreshInFlight.director = null;
      }
    }
  },
  patchDirectorTimeline() {
    if (state.ui.route !== "director-care-plans" || !state.ui.selectedDirectorElder) return false;
    var items = document.querySelectorAll(".director-timeline__item--task[data-task-id]");
    if (!items.length) return false;
    var timelineDate = state.ui.directorAuditDate || state.director.date || formatNowDate();
    var changed = false;
    items.forEach(function (el) {
      var taskId = el.getAttribute("data-task-id");
      var task = state.tasks.find(function (t) { return t.id === taskId; });
      if (!task) return;
      var status = getDirectorTimelineStatus(task, timelineDate);
      var tone = status.tone;
      var statusLabel = status.label;
      if (el.getAttribute("data-task-tone") === tone && el.getAttribute("data-task-status") === statusLabel) return;
      changed = true;
      el.setAttribute("data-task-tone", tone);
      el.setAttribute("data-task-status", statusLabel);
      var dot = el.querySelector(".director-timeline__dot");
      if (dot) dot.className = "director-timeline__dot is-active director-timeline__dot--" + tone;
      var pill = el.querySelector(".status-pill");
      if (pill) {
        pill.className = "status-pill status-pill--" + tone;
        pill.textContent = statusLabel;
      }
    });
    return changed;
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
  async reassignElderCaregiver(elderId, floor) {
    const elder = getElderById(elderId);
    if (!elder) return;
    const availableCaregivers = [...state.caregivers].sort((left, right) => {
      const leftRank = Number(left.floor) === Number(floor) ? 0 : 1;
      const rightRank = Number(right.floor) === Number(floor) ? 0 : 1;
      if (leftRank !== rightRank) return leftRank - rightRank;
      return String(left.name || "").localeCompare(String(right.name || ""), "zh-CN");
    });
    if (!availableCaregivers.length) {
      touchToast("当前养老院还没有可分配护工");
      return;
    }
    const currentIdx = availableCaregivers.findIndex((c) => c.id === elder.assignedCaregiverId);
    const nextIdx = (currentIdx + 1) % availableCaregivers.length;
    elder.assignedCaregiverId = availableCaregivers[nextIdx].id;
    touchToast("已分配给 " + availableCaregivers[nextIdx].name);

    const effectiveCaregiver = getCaregiverForFloor(floor, elder.id);
    if (effectiveCaregiver) syncPendingElderTasksToCaregiver(elder.id, effectiveCaregiver.id);

    notify();

    const uploadResult = effectiveCaregiver
      ? await syncElderAssignmentToCloud(elder.id, effectiveCaregiver.id)
      : await actions.persistInstitutionSharedState({ silent: true }).then((ok) => ({ ok, count: 0 }));
    if (!uploadResult.ok) {
      touchToast("老人分配已保存，任务云端同步失败");
      notify();
      return;
    }
    if (isCloudSyncConfigured()) {
      await actions.refreshDirectorCloudTasks({ silent: true, force: true, recordDate: state.director.date });
    }
  },
  async reassignElderToCaregiver(elderId, caregiverId) {
    const elder = getElderById(elderId);
    const caregiver = getCaregiverById(caregiverId);
    if (!elder || !caregiver) return;
    const previousCaregiverId = elder.assignedCaregiverId || "";
    elder.assignedCaregiverId = caregiverId;
    touchToast("已将 " + elder.name + " 分配给 " + caregiver.name);

    syncPendingElderTasksToCaregiver(elder.id, caregiver.id);

    notify();

    const uploadResult = await syncElderAssignmentToCloud(elder.id, caregiver.id);
    if (!uploadResult.ok) {
      elder.assignedCaregiverId = previousCaregiverId;
      touchToast("分配失败，云端未保存，请重试");
      notify();
      return;
    }
    if (isCloudSyncConfigured()) {
      await actions.refreshDirectorCloudTasks({ silent: true, force: true, recordDate: state.director.date });
    }
    touchToast("分配已同步云端");
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

    notify();
    await actions.persistInstitutionSharedState({ silent: true });
    if (isCloudSyncConfigured()) {

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

    touchToast(existingPlan ? "护理方案已更新" : "护理方案已新增");
  },
  togglePlanItem(planId, planItemId) {
    const item = getPlanItem(planId, planItemId);
    if (!item) return;

    item.isEnabled = item.isEnabled === false;

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

actions.devEnterCaregiver = async function devEnterCaregiver() {
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
  await actions.refreshInstitutionSharedState({ silent: true });
  const attendanceRecord = recordCurrentCaregiverClockIn();
  await actions.syncAttendanceRecord(attendanceRecord, { silent: true });
  await actions.refreshCaregiverCloudTasks({ silent: true, force: true });
  touchToast("已通过开发者入口进入护工端");
};

actions.clockIn = async function clockIn() {
  if (state.session.loggedIn && state.session.clockInAt) return;
  if (state.session.identity === "caregiver") {
    bindCurrentCaregiverFromSession();
  }

  state.session.loggedIn = true;
  state.session.clockInAt = formatNowTime();
  state.session.clockOutAt = "";
  state.session.clockInLocation = "院内打卡";
  state.session.clockInLocationRaw = null;
  const attendanceRecord = recordCurrentCaregiverClockIn();
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
  await actions.syncAttendanceRecord(attendanceRecord, { silent: true });
  await actions.refreshInstitutionSharedState({ silent: true });
  await actions.refreshCaregiverCloudTasks({ silent: true, force: true });
};

actions.enterWorkbench = function enterWorkbench() {
  if (state.session.identity === "caregiver") {
    bindCurrentCaregiverFromSession();
  }
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

  touchToast(existingPlan ? "护理方案已更新" : "护理方案已新增");
};

export function selectors() {
  const activeRecordDate = state.session.identity === "caregiver" ? getCaregiverRecordDate() : state.director.date || formatNowDate();
  const directorTaskDate = state.director.date || formatNowDate();
  const directorDateTasks = state.tasks.filter((task) => task.recordDate === directorTaskDate);
  const directorAnomalyDate = state.ui.directorAuditDate || state.director.date || formatNowDate();
  const directorAnomalyTasks = state.tasks.filter((task) => task.recordDate === directorAnomalyDate);
  const rawSelectedTask = getTaskById(state.ui.selectedTaskId);
  const selectedElder = getElderById(state.ui.selectedElderId) || createTaskElderFallback(rawSelectedTask);
  const selectedTask = rawSelectedTask?.caregiverId === state.caregiver.id ? rawSelectedTask : null;
  ensureAttendanceState();
  const selectedHistory = getHistoryById(state.ui.selectedHistoryId);
  const taskRecordEvidence = state.ui.taskRecordEvidence || state.ui.taskEvidence || {};
  const taskExceptionEvidence = state.ui.taskExceptionEvidence || {};
  const quickExceptionEvidence = state.ui.quickExceptionEvidence || {};
  const taskRecordNotes = state.ui.taskRecordNotes || state.ui.taskNotes || {};
  const taskExceptionNotes = state.ui.taskExceptionNotes || {};
  const quickExceptionNotes = state.ui.quickExceptionNotes || {};
  const selectedTaskEvidence = selectedTask ? taskRecordEvidence[selectedTask.id] || "" : "";

  const caregiverTasks = sortTasksBySchedule(
    state.tasks.filter((task) => task.caregiverId === state.caregiver.id && (!task.recordDate || task.recordDate === activeRecordDate)),
  ).map(enrichTask);

  const elderTasks = selectedElder ? caregiverTasks.filter((task) => task.elderId === selectedElder.id) : [];
  const pendingTasks = caregiverTasks.filter((task) => task.status === "pending");
  const riskTasks = caregiverTasks.filter((task) => task.status === "risk" || task.status === "refused");
  const completedTasks = caregiverTasks.filter((task) => task.status === "completed");

  const selectedFloorNumber = normalizeFloorNumber(state.ui.selectedFloor, 0);
  const floorRoomMap = new Map();
  caregiverTasks.forEach((task) => {
    const elder = task.elder || createTaskElderFallback(task);
    const taskFloor = normalizeFloorNumber(elder?.floor || task.elderFloor, 0);
    if (!elder || taskFloor !== selectedFloorNumber) return;
    const key = elder.id || task.elderId || `${taskFloor}-${elder.room || task.elderRoom || task.id}`;
    if (!floorRoomMap.has(key)) {
      floorRoomMap.set(key, {
        elder,
        tasks: [],
      });
    }
    floorRoomMap.get(key).tasks.push(task);
  });
  const floorRooms = Array.from(floorRoomMap.values())
    .sort((left, right) => String(left.elder.room || "").localeCompare(String(right.elder.room || ""), "zh-CN", { numeric: true }))
    .map(({ elder, tasks }) => {
      const hasRisk = tasks.some((task) => task.status === "risk" || task.status === "refused");
      const allDone = tasks.length > 0 && tasks.every((task) => task.status === "completed");
      const nextPending = tasks.find((task) => task.status === "pending");

      return {
        room: elder.room,
        floor: normalizeFloorNumber(elder.floor, 1),
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
  const caregiverRecordWorkspace = buildCaregiverRecordWorkspace(caregiverTasks);

  const floorSummaries = [1, 2, 3, 4, 5].map((floor) => ({
    floor,
    pendingCount: caregiverTasks.filter((task) => {
      const elder = getElderById(task.elderId);
      const taskFloor = normalizeFloorNumber(elder?.floor || task.elderFloor, 0);
      return taskFloor === floor && task.status !== "completed";
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
      const elderTasks = directorDateTasks.filter((task) => task.elderId === elder.id);
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
  const directorSelectedFloorCaregivers = buildDirectorFloorCaregiverProgress(state.ui.selectedDirectorFloor, directorDateTasks);
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
  const directorTimelineDate = state.ui.directorAuditDate || state.director.date || formatNowDate();
  const selectedDirectorElderTasks = selectedDirectorElder
    ? sortTasksBySchedule(state.tasks.filter((task) => task.elderId === selectedDirectorElder.id && task.recordDate === directorTimelineDate))
    : [];
  const fallbackDirectorTimeline =
    state.director.timelines.find((item) => item.elderName === state.ui.selectedDirectorElder) || state.director.timelines[0];
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
                id: task.id,
                status: task.status,
              };
            })
          : fallbackDirectorTimeline?.entries || [],
      }
    : fallbackDirectorTimeline;

  const caregiverLoads = state.caregivers
    .filter((c) => c.cloudUserId)
    .map((caregiver) => {
      const assigned = directorDateTasks.filter((task) => task.caregiverId === caregiver.id);
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

  const directorAttendance = buildDirectorAttendanceSummary(
    state.director.date || formatNowDate(),
    state.ui.selectedAttendanceShift || "all",
  );

  const allDirectorTasks = sortTasksBySchedule(directorDateTasks).map(enrichTask);
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
  const directorTaskOverview = buildDirectorTaskOverview(directorDateTasks);
  const directorCaregiverStatistics = buildDirectorCaregiverStatistics(directorDateTasks);
  const selectedDirectorCaregiverStat =
    directorCaregiverStatistics.find((item) => item.id === state.ui.selectedDirectorStatisticsCaregiverId) || null;
  const directorExceptionReports = buildDirectorExceptionReports(directorAnomalyTasks, { recordDate: directorAnomalyDate });

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

  const elderPlanSummaries = state.elderCarePlans.reduce((result, plan) => {
    const elder = getElderById(plan.elderId);
    if (!elder || !elder.familyUserId) return result;
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

    result.push({
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
    });
    return result;
  }, []);

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
    const assignedCaregiverIds = new Set(floorElders.map((elder) => elder.assignedCaregiverId).filter(Boolean));
    const floorCaregivers = state.caregivers.filter((caregiver) => caregiver.floor === floor || assignedCaregiverIds.has(caregiver.id));

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
      reportTemplateId: elder.reportTemplateId || "",
      reportTemplateTitle: elder.reportTemplateTitle || "",
      assignedCaregiverId: elder.assignedCaregiverId || "",
      assignedCaregiverName: getCaregiverById(elder.assignedCaregiverId)?.name || "",
      hasPlan: Boolean(plan),
      enabledCount: plan?.enabledCount || 0,
      manualCount:
        plan?.items.filter((item) => item.assignment === "manual" && item.isEnabled !== false).length || 0,
      selected: state.ui.selectedDirectorPlanRoom === elder.id,
      status: !plan ? "未配置方案" : plan.items.some((item) => item.assignment === "manual" && item.isEnabled) ? "需院长关注" : "常规执行",
    };
  });

  const allDirectorPlanResidents = directorPlanResidents;
  const selectedPlanFloorElders = getDirectorPlanEldersByFloor(state.ui.selectedDirectorPlanFloor);
  const selectedAssignedCaregiverIds = new Set(selectedPlanFloorElders.map((elder) => elder.assignedCaregiverId).filter(Boolean));
  const selectedPlanFloorCaregivers = state.caregivers
    .filter((caregiver) => caregiver.floor === state.ui.selectedDirectorPlanFloor || selectedAssignedCaregiverIds.has(caregiver.id))
    .sort((left, right) => {
      const leftAssigned = selectedAssignedCaregiverIds.has(left.id) ? 0 : 1;
      const rightAssigned = selectedAssignedCaregiverIds.has(right.id) ? 0 : 1;
      if (leftAssigned !== rightAssigned) return leftAssigned - rightAssigned;
      return String(left.name || "").localeCompare(String(right.name || ""), "zh-CN");
    });
  const directorPlanFloorStaff = selectedPlanFloorCaregivers.map((caregiver) => ({
    ...caregiver,
    isCrossFloorForSelectedFloor: caregiver.floor !== state.ui.selectedDirectorPlanFloor,
    rooms: [],
  }));

  selectedPlanFloorElders.forEach((elder, elderIndex) => {
    const matchedCaregiverId = elder.assignedCaregiverId || "";
    const targetCaregiver = directorPlanFloorStaff.find((caregiver) => caregiver.id === matchedCaregiverId) || null;

    if (targetCaregiver) {
      const resident = directorPlanResidents.find((item) => item.id === elder.id);
      if (resident) {
        resident.currentCaregiverId = targetCaregiver.id;
        resident.currentCaregiverName = targetCaregiver.name;
      }
      targetCaregiver.rooms.push({
        room: elder.room,
        elderName: elder.name,
        elderId: elder.id,
        floor: elder.floor,
        level: elder.level,
      });
    }
  });
  const unassignedPlanFloorResidents = selectedPlanFloorElders
    .filter((elder) => !elder.assignedCaregiverId || !getCaregiverById(elder.assignedCaregiverId))
    .map((elder) => ({
      room: elder.room,
      elderName: elder.name,
      elderId: elder.id,
      floor: elder.floor,
      level: elder.level,
    }));

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
      reportTemplate: Object.values(state.dailyReportTemplates || {})[0],
    });
  const directorCareRecordDraft = {
    ...directorCareRecordDraftSource,
    reportTemplateSnapshot: directorCareRecordDraftSource.reportTemplateSnapshot || Object.values(state.dailyReportTemplates || {})[0],
    reportItems: hydrateReportItems(directorCareRecordDraftSource, directorCareRecordDraftSource.reportTemplateSnapshot || Object.values(state.dailyReportTemplates || {})[0]),
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
        reportTemplateSnapshot: caregiverDailyReportDraftSource.reportTemplateSnapshot || Object.values(state.dailyReportTemplates || {})[0],
        reportItems: hydrateReportItems(
          caregiverDailyReportDraftSource,
          caregiverDailyReportDraftSource.reportTemplateSnapshot || Object.values(state.dailyReportTemplates || {})[0],
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
  const dailyReportTemplateOptions = Object.values(state.dailyReportTemplates || {}).map((tpl) => ({
    value: tpl.id,
    label: tpl.title || "未命名模板",
    template: tpl,
  }));
  const dailyReportTemplateHierarchy = (() => {
    const templates = Object.values(state.dailyReportTemplates || {});
    const baseCatalogItems = state.ui.directorReportTemplateImportCatalog?.items || [];
    const baseById = new Map(
      baseCatalogItems
        .filter((item) => item?.id && (item.templateType || "base") === "base")
        .map((item) => [item.id, normalizeCloudDailyReportTemplate(item)]),
    );
    const groups = new Map();
    templates.forEach((template) => {
      const baseId = template.baseTemplateId || "";
      const baseTemplate = baseById.get(baseId);
      const groupKey = baseId || "__no_base__";
      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          id: baseId,
          title: baseTemplate?.title || (baseId ? `基础模板 ${baseId}` : "未关联基础模板"),
          templates: [],
        });
      }
      groups.get(groupKey).templates.push(template);
    });
    return Array.from(groups.values()).map((group) => ({
      ...group,
      templates: group.templates.sort((left, right) => String(left.title || "").localeCompare(String(right.title || ""), "zh-CN")),
    }));
  })();
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
  const inventoryItems = (state.inventory || []).filter((item) => item.status !== "deleted");
  const inventoryUsageFilters = state.ui.inventoryUsageFilters || {};
  const inventoryUsages = (state.inventoryUsages || []).filter((usage) => {
    const filterDate = inventoryUsageFilters.recordDate || "";
    const filterName = String(inventoryUsageFilters.itemName || "").trim();
    if (filterDate && !String(usage.usedAt || usage.createdAt || "").startsWith(filterDate)) return false;
    if (filterName && !String(usage.itemName || "").includes(filterName)) return false;
    return true;
  });
  const selectedInventoryItem = state.ui.inventoryItemActionsId
    ? inventoryItems.find((item) => item.id === state.ui.inventoryItemActionsId) || null
    : null;
  const selectedInventoryItemUsages = selectedInventoryItem
    ? (state.inventoryUsages || []).filter((usage) => usage.itemId === selectedInventoryItem.id || usage.itemName === selectedInventoryItem.name)
    : [];
  const inventorySummary = {
    types: inventoryItems.length,
    warningCount: inventoryItems.filter((item) => item.quantity <= item.warningQuantity).length,
    usageCount: inventoryUsages.length,
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
    caregiverTimelineReadonly: Boolean(state.ui.caregiverTimelineReadonly),
    caregiverRecordDetail: state.ui.selectedCaregiverReportElderId
      ? buildCaregiverRecordDetail(state.ui.selectedCaregiverReportElderId)
      : null,
    caregiverTaskRecordDate: activeRecordDate,
    caregiverTaskSyncStatus: {
      loading: Boolean(state.cloud.tasksLoading),
      error: state.cloud.tasksError || "",
      fetchedAt: state.cloud.tasksFetchedAt || "",
      caregiverId: state.caregiver?.id || "",
      institutionId: getCurrentSessionInstitutionId(),
      detail: state.cloud.lastCaregiverTaskSync || null,
    },
    elderTasks,
    elderVitals: state.vitals.filter((item) => item.elderId === state.ui.selectedElderId).slice(0, 4),
    pendingTasks,
    riskTasks,
    completedTasks,
    floorRooms,
    filteredHistory,
    caregiverRecordWorkspace,
    floorSummaries,
    activeBatchJobs: state.batchJobs.filter((item) => !item.completed),
    unreadMessages: state.messages.filter((item) => !item.read).length,
    unreadFamilyMessages: state.family.messages.filter((item) => !item.read).length,
    directorSelectedFloor,
    directorSelectedTimeline,
    caregiverLoads,
    directorAttendance,
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
    unassignedPlanFloorResidents,
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
    directorAnomalyDate,
    directorExceptionReports,
    cloudStatus,
    dailyReportTemplate: Object.values(state.dailyReportTemplates || {})[0],
    dailyReportTemplates: state.dailyReportTemplates,
    dailyReportTemplateOptions,
    dailyReportTemplateHierarchy,
    directorReportTemplateDraft: state.ui.directorReportTemplateDraft,
    directorReportTemplateEditingId: state.ui.directorReportTemplateEditingId || "",
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
    inventoryItems,
    inventoryUsages,
    inventorySummary,
    inventoryItemDraft: state.ui.inventoryItemDraft,
    inventoryStockAdjustDraft: state.ui.inventoryStockAdjustDraft,
    inventoryItemActions: selectedInventoryItem,
    inventoryItemActionUsages: selectedInventoryItemUsages,
    inventoryUsageFilters,
    inventoryUsageDraft: state.ui.inventoryUsageDraft,
  };
}

refreshDirectorOverview();
syncDirectorPlanSelection();
setCurrentRoom(state.ui.selectedRoom);
