const pendingNativeRequests = new Map();

function createRequestId() {
  return `clock-in-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function normalizeLocation(location = {}) {
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

function normalizeBridgeError(payload = {}) {
  const stage = payload.stage === "location" ? "location" : "fingerprint";
  const defaultMessage = stage === "location" ? "定位获取失败，请重试" : "指纹验证失败，请重试";

  return {
    stage,
    code: String(payload.code || ""),
    message: String(payload.message || defaultMessage),
  };
}

function handleNativeClockInEvent(rawPayload) {
  let payload = rawPayload;

  if (typeof rawPayload === "string") {
    try {
      payload = JSON.parse(rawPayload);
    } catch (error) {
      payload = {
        type: "error",
        stage: "fingerprint",
        code: "invalid-payload",
        message: "原生打卡回调异常，请重试",
      };
    }
  }

  if (!payload || typeof payload !== "object") return;

  const requestId = String(payload.requestId || "");
  if (!requestId) return;

  const pendingRequest = pendingNativeRequests.get(requestId);
  if (!pendingRequest) return;

  if (payload.type === "progress") {
    pendingRequest.onProgress?.(payload);
    return;
  }

  pendingNativeRequests.delete(requestId);

  if (payload.type === "success") {
    pendingRequest.resolve({
      method: String(payload.method || "biometric"),
      location: normalizeLocation(payload.location),
    });
    return;
  }

  pendingRequest.reject(normalizeBridgeError(payload));
}

if (typeof window !== "undefined") {
  window.__onCaregiverNativeClockIn = handleNativeClockInEvent;
}

function requestBrowserLocation() {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject({
        stage: "location",
        code: "unsupported",
        message: "当前预览环境不支持定位，请在 APK 中测试",
      });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          capturedAt: new Date().toISOString(),
        });
      },
      (error) => {
        const errorMessageByCode = {
          1: "未开启定位权限，无法完成打卡",
          2: "定位暂不可用，请稍后重试",
          3: "定位获取超时，请重试",
        };

        reject({
          stage: "location",
          code: `browser-${error?.code || "unknown"}`,
          message: errorMessageByCode[error?.code] || "定位失败，请稍后重试",
        });
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 0,
      },
    );
  });
}

async function requestBrowserClockIn(onProgress) {
  const confirmed = window.confirm("开发预览环境将使用模拟指纹验证，是否继续？");
  if (!confirmed) {
    throw {
      stage: "fingerprint",
      code: "cancelled",
      message: "已取消指纹验证",
    };
  }

  onProgress?.({
    type: "progress",
    stage: "location",
  });

  const location = await requestBrowserLocation();
  return {
    method: "browser-simulated",
    location,
  };
}

function requestAndroidClockIn(onProgress) {
  return new Promise((resolve, reject) => {
    const requestId = createRequestId();
    pendingNativeRequests.set(requestId, {
      resolve,
      reject,
      onProgress,
    });

    try {
      window.AndroidBridge.startClockInFlow(requestId);
    } catch (error) {
      pendingNativeRequests.delete(requestId);
      reject({
        stage: "fingerprint",
        code: "bridge-error",
        message: "当前设备暂不支持指纹打卡，请稍后重试",
      });
    }
  });
}

export function requestAttendanceClockIn({ onProgress } = {}) {
  if (typeof window !== "undefined" && window.AndroidBridge && typeof window.AndroidBridge.startClockInFlow === "function") {
    return requestAndroidClockIn(onProgress);
  }

  return requestBrowserClockIn(onProgress);
}
