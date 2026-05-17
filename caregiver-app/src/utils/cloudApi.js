const DEFAULT_API_BASE_URL = "";
const DEFAULT_API_KEY = "";

let nativeRuntimeInfoCache = null;

function readNativeRuntimeInfo() {
  if (nativeRuntimeInfoCache) {
    return nativeRuntimeInfoCache;
  }

  try {
    const raw = window.AndroidBridge?.getRuntimeInfo?.();
    if (!raw) {
      nativeRuntimeInfoCache = {};
      return nativeRuntimeInfoCache;
    }

    nativeRuntimeInfoCache = JSON.parse(raw);
    return nativeRuntimeInfoCache;
  } catch (error) {
    nativeRuntimeInfoCache = {};
    return nativeRuntimeInfoCache;
  }
}

function resolveDefaultBaseUrl() {
  const runtimeInfo = readNativeRuntimeInfo();
  return String(runtimeInfo.cloudBaseUrl || DEFAULT_API_BASE_URL || "").trim();
}

function resolveDefaultApiKey() {
  const runtimeInfo = readNativeRuntimeInfo();
  return String(runtimeInfo.cloudApiKey || DEFAULT_API_KEY || "").trim();
}

function readOverride(key, fallback) {
  try {
    const value = window.localStorage.getItem(key);
    return value ? String(value).trim() : fallback;
  } catch (error) {
    return fallback;
  }
}

export function getCloudApiConfig() {
  return {
    baseUrl: readOverride("elderCloudBaseUrl", resolveDefaultBaseUrl()).replace(/\/+$/, ""),
    apiKey: readOverride("elderCloudApiKey", resolveDefaultApiKey()),
  };
}

export function isCloudSyncConfigured() {
  const config = getCloudApiConfig();
  return Boolean(config.baseUrl && config.apiKey);
}

let _authToken = "";

export function setAuthToken(token) {
  _authToken = token || "";
  try {
    if (token) {
      window.localStorage.setItem("elderSessionToken", token);
    } else {
      window.localStorage.removeItem("elderSessionToken");
    }
  } catch (_) {}
}

export function getAuthToken() {
  if (_authToken) return _authToken;
  try {
    _authToken = window.localStorage.getItem("elderSessionToken") || "";
  } catch (_) {
    _authToken = "";
  }
  return _authToken;
}

function buildHeaders(extraHeaders = {}) {
  const { apiKey } = getCloudApiConfig();
  const headers = {
    "Content-Type": "application/json",
    "x-api-key": apiKey,
    ...extraHeaders,
  };
  const token = getAuthToken();
  if (token) {
    headers["Authorization"] = "Bearer " + token;
  }
  return headers;
}

export async function requestJson(path, init = {}) {
  const { baseUrl } = getCloudApiConfig();
  if (!baseUrl) {
    throw new Error("云端地址未配置");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(function () { controller.abort(); }, init.timeout || 30000);

  let response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method: init.method || "GET",
      headers: buildHeaders(init.headers || {}),
      body: init.body,
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === "AbortError" || /aborted/i.test(String(error?.message || ""))) {
      throw new Error("云端请求超时，请稍后重试");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  const rawText = await response.text();
  let payload = null;

  try {
    payload = rawText ? JSON.parse(rawText) : null;
  } catch (error) {
    payload = null;
  }

  if (!response.ok) {
    const detail =
      payload?.detail?.message ||
      payload?.detail ||
      payload?.message ||
      rawText ||
      `请求失败（${response.status}）`;
    throw new Error(String(detail));
  }

  return payload;
}

export async function uploadCareRecord(record) {
  return requestJson("/api/care-records", {
    method: "POST",
    body: JSON.stringify(record),
  });
}

export async function fetchCareRecords(filters = {}) {
  const search = new URLSearchParams();

  Object.entries(filters).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    search.set(key, String(value));
  });

  const suffix = search.toString() ? `?${search.toString()}` : "";
  return requestJson(`/api/care-records${suffix}`);
}

export async function uploadDailyReportTemplate(template) {
  return requestJson("/api/daily-report-template", {
    method: "POST",
    body: JSON.stringify(template),
  });
}

export async function fetchDailyReportTemplate(filters = {}) {
  const search = new URLSearchParams();

  Object.entries(filters).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    search.set(key, String(value));
  });

  const suffix = search.toString() ? `?${search.toString()}` : "";
  return requestJson(`/api/daily-report-template${suffix}`);
}

export async function fetchDailyReportTemplates(filters = {}) {
  const search = new URLSearchParams();

  Object.entries(filters).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    search.set(key, String(value));
  });

  const suffix = search.toString() ? `?${search.toString()}` : "";
  return requestJson(`/api/daily-report-templates${suffix}`);
}

export async function uploadPublishedTask(task) {
  return requestJson("/api/tasks", {
    method: "POST",
    body: JSON.stringify(task),
  });
}

export async function uploadPublishedTasksBulk(tasks = []) {
  return requestJson("/api/tasks/bulk", {
    method: "POST",
    body: JSON.stringify({ tasks }),
  });
}

export async function fetchPublishedTasks(filters = {}) {
  const search = new URLSearchParams();

  Object.entries(filters).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    search.set(key, String(value));
  });

  const suffix = search.toString() ? `?${search.toString()}` : "";
  return requestJson(`/api/tasks${suffix}`);
}

export async function uploadInstitutionState(snapshot) {
  return requestJson("/api/institution-state", {
    method: "POST",
    body: JSON.stringify(snapshot),
  });
}

export async function fetchInstitutionState(filters = {}) {
  const search = new URLSearchParams();

  Object.entries(filters).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    search.set(key, String(value));
  });

  const suffix = search.toString() ? `?${search.toString()}` : "";
  return requestJson(`/api/institution-state${suffix}`);
}

export async function fetchLatestAppRelease(filters = {}) {
  const search = new URLSearchParams();

  Object.entries(filters).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    search.set(key, String(value));
  });

  const suffix = search.toString() ? `?${search.toString()}` : "";
  return requestJson(`/api/app-releases/latest${suffix}`);
}

export async function createAuthUser(payload) {
  return requestJson("/api/auth/users", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function fetchAuthUsers(institutionId) {
  return requestJson(`/api/auth/users?institutionId=${encodeURIComponent(institutionId)}`);
}

export async function disableAuthUser(userId) {
  return requestJson(`/api/auth/users/${encodeURIComponent(userId)}/disable`, { method: "PUT" });
}

export async function fetchCaregivers(filters = {}) {
  const search = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    search.set(key, String(value));
  });
  const suffix = search.toString() ? `?${search.toString()}` : "";
  return requestJson(`/api/caregivers${suffix}`);
}

export async function createCaregiver(payload) {
  return requestJson("/api/caregivers", { method: "POST", body: JSON.stringify(payload) });
}

export async function updateCaregiver(id, payload) {
  return requestJson(`/api/caregivers/${encodeURIComponent(id)}/update`, { method: "POST", body: JSON.stringify(payload) });
}

export async function deleteCaregiver(id) {
  return requestJson(`/api/caregivers/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function createTaskCompletion(payload) {
  return requestJson("/api/task-completions", { method: "POST", body: JSON.stringify(payload) });
}

export async function fetchTaskCompletions(filters = {}) {
  const search = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    search.set(key, String(value));
  });
  const suffix = search.toString() ? `?${search.toString()}` : "";
  return requestJson(`/api/task-completions${suffix}`);
}

export async function createVital(payload) {
  return requestJson("/api/vitals", { method: "POST", body: JSON.stringify(payload) });
}

export async function fetchVitals(filters = {}) {
  const search = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    search.set(key, String(value));
  });
  const suffix = search.toString() ? `?${search.toString()}` : "";
  return requestJson(`/api/vitals${suffix}`);
}

export async function createAnomaly(payload) {
  return requestJson("/api/anomalies", { method: "POST", body: JSON.stringify(payload) });
}

export async function fetchAnomalies(filters = {}) {
  const search = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    search.set(key, String(value));
  });
  const suffix = search.toString() ? `?${search.toString()}` : "";
  return requestJson(`/api/anomalies${suffix}`);
}

export async function updateAnomaly(id, payload) {
  return requestJson(`/api/anomalies/${encodeURIComponent(id)}/update`, { method: "POST", body: JSON.stringify(payload) });
}

export async function updateInstitution(payload) {
  return requestJson("/api/institution/update", { method: "POST", body: JSON.stringify(payload) });
}

export async function fetchInstitution(institutionId = "") {
  const suffix = institutionId ? `?institutionId=${encodeURIComponent(institutionId)}` : "";
  return requestJson(`/api/institution${suffix}`);
}
