package com.elderserve.caregiver;

import android.Manifest;
import android.app.Activity;
import android.content.ClipData;
import android.content.ActivityNotFoundException;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.location.Location;
import android.location.LocationManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.provider.MediaStore;
import android.provider.Settings;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.Toast;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
import androidx.core.location.LocationManagerCompat;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewClientCompat;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Collections;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.List;
import java.util.Locale;

public class MainActivity extends AppCompatActivity {
    private static final String JS_BRIDGE_NAME = "AndroidBridge";
    private static final String CLOCK_IN_CALLBACK = "__onCaregiverNativeClockIn";
    private static final String UPDATE_CALLBACK = "__onElderServeUpdate";
    private static final String[] LOCATION_PERMISSIONS = new String[] {
            Manifest.permission.ACCESS_FINE_LOCATION,
            Manifest.permission.ACCESS_COARSE_LOCATION
    };

    private WebView webView;
    private ValueCallback<Uri[]> fileChooserCallback;
    @Nullable
    private Uri pendingCameraCaptureUri;
    private ActivityResultLauncher<Intent> filePickerLauncher;
    private ActivityResultLauncher<String[]> locationPermissionLauncher;
    private BiometricPrompt biometricPrompt;
    private BiometricPrompt.PromptInfo biometricPromptInfo;

    @Nullable
    private String pendingClockInRequestId;

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        if ((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
            WebView.setWebContentsDebuggingEnabled(true);
        }

        webView = findViewById(R.id.webview);
        filePickerLauncher = registerForActivityResult(
                new ActivityResultContracts.StartActivityForResult(),
                result -> {
                    Uri[] uris = null;
                    Uri cameraUri = pendingCameraCaptureUri;
                    pendingCameraCaptureUri = null;

                    if (result.getResultCode() == Activity.RESULT_OK && result.getData() != null) {
                        Intent data = result.getData();
                        if (data.getClipData() != null) {
                            int count = data.getClipData().getItemCount();
                            uris = new Uri[count];
                            for (int index = 0; index < count; index += 1) {
                                uris[index] = data.getClipData().getItemAt(index).getUri();
                            }
                        } else if (data.getData() != null) {
                            uris = new Uri[]{data.getData()};
                        }
                    }

                    if (result.getResultCode() == Activity.RESULT_OK && uris == null && cameraUri != null) {
                        uris = new Uri[]{cameraUri};
                    }

                    deliverFileChooserResult(uris);
                }
        );
        locationPermissionLauncher = registerForActivityResult(
                new ActivityResultContracts.RequestMultiplePermissions(),
                result -> {
                    String requestId = pendingClockInRequestId;
                    if (requestId == null) {
                        return;
                    }

                    boolean granted = false;
                    for (Boolean value : result.values()) {
                        if (Boolean.TRUE.equals(value)) {
                            granted = true;
                            break;
                        }
                    }

                    if (granted) {
                        requestCurrentLocation(requestId);
                        return;
                    }

                    dispatchClockInError(requestId, "location", "permission-denied", "未开启定位权限，无法完成打卡");
                    clearPendingClockInRequest();
                }
        );

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);

        WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
                .setHttpAllowed(true)
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        biometricPrompt = new BiometricPrompt(
                this,
                ContextCompat.getMainExecutor(this),
                new BiometricPrompt.AuthenticationCallback() {
                    @Override
                    public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) {
                        super.onAuthenticationSucceeded(result);

                        String requestId = pendingClockInRequestId;
                        if (requestId == null) {
                            return;
                        }

                        dispatchClockInProgress(requestId, "location");
                        requestCurrentLocation(requestId);
                    }

                    @Override
                    public void onAuthenticationError(int errorCode, CharSequence errString) {
                        super.onAuthenticationError(errorCode, errString);

                        String requestId = pendingClockInRequestId;
                        if (requestId == null) {
                            return;
                        }

                        if (errorCode == BiometricPrompt.ERROR_NEGATIVE_BUTTON
                                || errorCode == BiometricPrompt.ERROR_USER_CANCELED
                                || errorCode == BiometricPrompt.ERROR_CANCELED) {
                            dispatchClockInError(requestId, "fingerprint", "cancelled", "已取消指纹验证");
                        } else {
                            dispatchClockInError(requestId, "fingerprint", "auth-error", "指纹验证失败，请重试");
                        }

                        clearPendingClockInRequest();
                    }

                    @Override
                    public void onAuthenticationFailed() {
                        super.onAuthenticationFailed();
                    }
                }
        );
        biometricPromptInfo = new BiometricPrompt.PromptInfo.Builder()
                .setTitle("指纹验证")
                .setSubtitle("请按压指纹完成上班打卡")
                .setNegativeButtonText("取消")
                .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_WEAK)
                .build();

        webView.setWebViewClient(new LocalAssetWebViewClient(assetLoader));
        webView.setWebChromeClient(new LocalAssetWebChromeClient());
        webView.addJavascriptInterface(new ClockInBridge(), JS_BRIDGE_NAME);

        if (savedInstanceState == null) {
            webView.loadUrl(getString(R.string.web_asset_entry));
        } else {
            webView.restoreState(savedInstanceState);
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null) {
            webView.evaluateJavascript(
                    "window.__elderServeAndroidBack ? window.__elderServeAndroidBack() : false",
                    result -> {
                        if (!"true".equals(result)) {
                            MainActivity.super.onBackPressed();
                        }
                    }
            );
            return;
        }

        super.onBackPressed();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        if (webView != null) {
            webView.saveState(outState);
        }
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.setWebChromeClient(null);
            webView.setWebViewClient(null);
            webView.destroy();
            webView = null;
        }

        super.onDestroy();
    }

    private void deliverFileChooserResult(@Nullable Uri[] uris) {
        pendingCameraCaptureUri = null;
        if (fileChooserCallback != null) {
            fileChooserCallback.onReceiveValue(uris);
            fileChooserCallback = null;
        }
    }

    @Nullable
    private Uri createCameraCaptureUri() {
        File directory = new File(getCacheDir(), "images");
        if (!directory.exists() && !directory.mkdirs()) {
            return null;
        }

        try {
            File imageFile = File.createTempFile("caregiver-evidence-", ".jpg", directory);
            return FileProvider.getUriForFile(this, getPackageName() + ".fileprovider", imageFile);
        } catch (IOException error) {
            return null;
        }
    }

    private boolean acceptsImageCapture(@Nullable WebChromeClient.FileChooserParams fileChooserParams) {
        if (fileChooserParams == null) {
            return false;
        }

        String[] acceptTypes = fileChooserParams.getAcceptTypes();
        if (acceptTypes == null || acceptTypes.length == 0) {
            return fileChooserParams.isCaptureEnabled();
        }

        for (String type : acceptTypes) {
            if (type == null || type.trim().isEmpty() || type.toLowerCase(Locale.US).startsWith("image/")) {
                return true;
            }
        }
        return false;
    }

    private void startClockInFlow(@Nullable String requestId) {
        if (requestId == null || requestId.trim().isEmpty()) {
            return;
        }

        if (pendingClockInRequestId != null) {
            dispatchClockInError(requestId, "fingerprint", "busy", "当前正在处理打卡，请稍候");
            return;
        }

        pendingClockInRequestId = requestId;

        int capability = BiometricManager.from(this).canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_WEAK);
        if (capability != BiometricManager.BIOMETRIC_SUCCESS) {
            dispatchClockInError(
                    requestId,
                    "fingerprint",
                    "unavailable",
                    buildBiometricUnavailableMessage(capability)
            );
            clearPendingClockInRequest();
            return;
        }

        biometricPrompt.authenticate(biometricPromptInfo);
    }

    private String buildBiometricUnavailableMessage(int capability) {
        if (capability == BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE) {
            return "当前设备不支持指纹验证";
        }
        if (capability == BiometricManager.BIOMETRIC_ERROR_HW_UNAVAILABLE) {
            return "指纹服务暂不可用，请稍后重试";
        }
        if (capability == BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED) {
            return "设备未录入指纹，请先在系统设置中录入";
        }
        return "当前设备暂不支持指纹打卡";
    }

    private void requestCurrentLocation(String requestId) {
        if (!hasAnyLocationPermission()) {
            locationPermissionLauncher.launch(LOCATION_PERMISSIONS);
            return;
        }

        LocationManager locationManager = getSystemService(LocationManager.class);
        if (locationManager == null) {
            dispatchClockInError(requestId, "location", "service-unavailable", "当前设备无法获取定位服务");
            clearPendingClockInRequest();
            return;
        }

        if (!LocationManagerCompat.isLocationEnabled(locationManager)) {
            dispatchClockInError(requestId, "location", "location-disabled", "请先开启系统定位服务");
            clearPendingClockInRequest();
            return;
        }

        String provider = resolveLocationProvider(locationManager);
        if (provider == null) {
            dispatchClockInError(requestId, "location", "provider-unavailable", "当前位置无法获取，请稍后重试");
            clearPendingClockInRequest();
            return;
        }

        try {
            LocationManagerCompat.getCurrentLocation(
                    locationManager,
                    provider,
                    (android.os.CancellationSignal) null,
                    ContextCompat.getMainExecutor(this),
                    location -> {
                        if (location == null) {
                            dispatchClockInError(requestId, "location", "location-empty", "定位获取超时，请重试");
                            clearPendingClockInRequest();
                            return;
                        }

                        dispatchClockInSuccess(requestId, location);
                        clearPendingClockInRequest();
                    }
            );
        } catch (SecurityException error) {
            dispatchClockInError(requestId, "location", "permission-denied", "未开启定位权限，无法完成打卡");
            clearPendingClockInRequest();
        }
    }

    @Nullable
    private String resolveLocationProvider(LocationManager locationManager) {
        boolean hasFinePermission = hasPermission(Manifest.permission.ACCESS_FINE_LOCATION);

        if (hasFinePermission && locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
            return LocationManager.GPS_PROVIDER;
        }

        if (locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
            return LocationManager.NETWORK_PROVIDER;
        }

        if (hasFinePermission && locationManager.isProviderEnabled(LocationManager.PASSIVE_PROVIDER)) {
            return LocationManager.PASSIVE_PROVIDER;
        }

        return null;
    }

    private boolean hasAnyLocationPermission() {
        return hasPermission(Manifest.permission.ACCESS_FINE_LOCATION)
                || hasPermission(Manifest.permission.ACCESS_COARSE_LOCATION);
    }

    private boolean hasPermission(String permission) {
        return ActivityCompat.checkSelfPermission(this, permission) == PackageManager.PERMISSION_GRANTED;
    }

    private void dispatchClockInProgress(String requestId, String stage) {
        JSONObject payload = new JSONObject();
        try {
            payload.put("requestId", requestId);
            payload.put("type", "progress");
            payload.put("stage", stage);
        } catch (JSONException error) {
            return;
        }

        dispatchClockInCallback(payload);
    }

    private void dispatchClockInSuccess(String requestId, Location location) {
        JSONObject payload = new JSONObject();
        JSONObject locationPayload = new JSONObject();

        try {
            locationPayload.put("latitude", location.getLatitude());
            locationPayload.put("longitude", location.getLongitude());
            locationPayload.put("accuracy", (double) location.getAccuracy());
            locationPayload.put("capturedAt", formatCurrentTimestamp());

            payload.put("requestId", requestId);
            payload.put("type", "success");
            payload.put("method", "biometric");
            payload.put("location", locationPayload);
        } catch (JSONException error) {
            dispatchClockInError(requestId, "location", "payload-error", "定位记录失败，请重试");
            return;
        }

        dispatchClockInCallback(payload);
    }

    private void dispatchClockInError(String requestId, String stage, String code, String message) {
        JSONObject payload = new JSONObject();

        try {
            payload.put("requestId", requestId);
            payload.put("type", "error");
            payload.put("stage", stage);
            payload.put("code", code);
            payload.put("message", message);
        } catch (JSONException error) {
            return;
        }

        dispatchClockInCallback(payload);
    }

    private void dispatchClockInCallback(JSONObject payload) {
        if (webView == null) {
            return;
        }

        String script = "if (window." + CLOCK_IN_CALLBACK + ") { window." + CLOCK_IN_CALLBACK + "("
                + JSONObject.quote(payload.toString()) + "); }";
        webView.post(() -> webView.evaluateJavascript(script, null));
    }

    private void clearPendingClockInRequest() {
        pendingClockInRequestId = null;
    }

    private String formatCurrentTimestamp() {
        return new SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.CHINA).format(new Date());
    }

    private String sanitizeFileName(String fileName, String fallbackName) {
        String rawName = fileName == null || fileName.trim().isEmpty() ? fallbackName : fileName.trim();
        return rawName.replaceAll("[\\\\/:*?\"<>|]", "-");
    }

    private boolean saveBase64ToDownloads(String fileName, String mimeType, String base64Data) {
        if (base64Data == null || base64Data.isEmpty()) {
            return false;
        }

        byte[] bytes = Base64.decode(base64Data, Base64.DEFAULT);
        String safeName = sanitizeFileName(fileName, "elder-care-record.png");
        String safeMime = mimeType == null || mimeType.isEmpty() ? "application/octet-stream" : mimeType;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ContentResolver resolver = getContentResolver();
            ContentValues values = new ContentValues();
            values.put(MediaStore.MediaColumns.DISPLAY_NAME, safeName);
            values.put(MediaStore.MediaColumns.MIME_TYPE, safeMime);
            values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/ElderServe");

            Uri uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
            if (uri == null) {
                return false;
            }

            try (OutputStream outputStream = resolver.openOutputStream(uri)) {
                if (outputStream == null) {
                    return false;
                }
                outputStream.write(bytes);
                outputStream.flush();
                return true;
            } catch (IOException error) {
                return false;
            }
        }

        File directory = new File(getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), "ElderServe");
        if (!directory.exists() && !directory.mkdirs()) {
            return false;
        }

        File targetFile = new File(directory, safeName);
        try (OutputStream outputStream = new FileOutputStream(targetFile)) {
            outputStream.write(bytes);
            outputStream.flush();
            return true;
        } catch (IOException error) {
            return false;
        }
    }

    private void printCurrentWebPage(String jobName) {
        if (webView == null) {
            return;
        }

        String safeJobName = sanitizeFileName(jobName, "elder-care-record");
        PrintManager printManager = (PrintManager) getSystemService(Context.PRINT_SERVICE);
        if (printManager == null) {
            Toast.makeText(this, "当前设备不支持打印或保存PDF", Toast.LENGTH_SHORT).show();
            return;
        }

        PrintDocumentAdapter adapter = webView.createPrintDocumentAdapter(safeJobName);
        PrintAttributes attributes = new PrintAttributes.Builder()
                .setMediaSize(PrintAttributes.MediaSize.ISO_A4)
                .setColorMode(PrintAttributes.COLOR_MODE_COLOR)
                .build();
        printManager.print(safeJobName, adapter, attributes);
    }

    private long getCurrentVersionCode() {
        try {
            PackageInfo info = getPackageManager().getPackageInfo(getPackageName(), 0);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                return info.getLongVersionCode();
            }
            return info.versionCode;
        } catch (PackageManager.NameNotFoundException error) {
            return 0L;
        }
    }

    private String getCurrentVersionName() {
        try {
            PackageInfo info = getPackageManager().getPackageInfo(getPackageName(), 0);
            return info.versionName == null ? "" : info.versionName;
        } catch (PackageManager.NameNotFoundException error) {
            return "";
        }
    }

    private void dispatchUpdateStatus(String type, String message, int progress) {
        if (webView == null) {
            return;
        }

        JSONObject payload = new JSONObject();
        try {
            payload.put("type", type);
            payload.put("message", message);
            payload.put("progress", Math.max(0, Math.min(100, progress)));
        } catch (JSONException error) {
            return;
        }

        String script = "if (window." + UPDATE_CALLBACK + ") { window." + UPDATE_CALLBACK + "("
                + JSONObject.quote(payload.toString()) + "); }";
        webView.post(() -> webView.evaluateJavascript(script, null));
    }

    private String resolveUpdateApkUrl(JSONObject release) throws JSONException {
        String baseUrl = getString(R.string.cloud_api_base_url).replaceAll("/+$", "");
        Uri baseUri = Uri.parse(baseUrl);
        String apkPath = release.optString("apkPath", "").trim();
        String apkUrl = release.optString("apkUrl", "").trim();

        if (!apkPath.isEmpty()) {
            if (apkPath.contains("..")) {
                throw new JSONException("invalid apk path");
            }
            if (!apkPath.startsWith("/")) {
                apkPath = "/" + apkPath;
            }
            if (!apkPath.startsWith("/static/releases/")) {
                throw new JSONException("apk path not allowed");
            }
            return baseUrl + apkPath;
        }

        Uri uri = Uri.parse(apkUrl);
        if (uri == null || uri.getScheme() == null || uri.getHost() == null) {
            throw new JSONException("invalid apk url");
        }
        String scheme = uri.getScheme().toLowerCase(Locale.US);
        if (!"https".equals(scheme) && !"http".equals(scheme)) {
            throw new JSONException("invalid apk url scheme");
        }
        if (!uri.getHost().equalsIgnoreCase(baseUri.getHost())) {
            throw new JSONException("apk host not allowed");
        }
        if (uri.getPort() != baseUri.getPort()) {
            throw new JSONException("apk port not allowed");
        }
        if (uri.getPath() == null || !uri.getPath().startsWith("/static/releases/")) {
            throw new JSONException("apk url path not allowed");
        }
        return apkUrl;
    }

    private File downloadUpdateFile(String apkUrl, String expectedSha256) throws IOException {
        File directory = new File(getCacheDir(), "updates");
        if (!directory.exists() && !directory.mkdirs()) {
            throw new IOException("cannot create update directory");
        }

        File targetFile = new File(directory, "elder-serve-update.apk");
        URL url = new URL(apkUrl);
        HttpURLConnection connection = (HttpURLConnection) url.openConnection();
        connection.setConnectTimeout(15000);
        connection.setReadTimeout(60000);
        connection.setRequestProperty("x-api-key", getString(R.string.cloud_api_key));
        connection.connect();

        int statusCode = connection.getResponseCode();
        if (statusCode < 200 || statusCode >= 300) {
            connection.disconnect();
            throw new IOException("download failed: " + statusCode);
        }

        long contentLength = connection.getContentLengthLong();
        long totalBytes = 0L;
        byte[] buffer = new byte[8192];

        try (InputStream inputStream = connection.getInputStream();
             OutputStream outputStream = new FileOutputStream(targetFile)) {
            int read;
            while ((read = inputStream.read(buffer)) >= 0) {
                outputStream.write(buffer, 0, read);
                totalBytes += read;
                if (contentLength > 0) {
                    int progress = (int) Math.min(95, Math.max(1, (totalBytes * 95) / contentLength));
                    dispatchUpdateStatus("progress", "正在下载更新包", progress);
                }
            }
            outputStream.flush();
        } finally {
            connection.disconnect();
        }

        String actualSha256 = sha256OfFile(targetFile);
        if (!expectedSha256.equalsIgnoreCase(actualSha256)) {
            targetFile.delete();
            throw new IOException("sha256 mismatch");
        }

        return targetFile;
    }

    private String sha256OfFile(File file) throws IOException {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] buffer = new byte[8192];
            try (InputStream inputStream = new java.io.FileInputStream(file)) {
                int read;
                while ((read = inputStream.read(buffer)) >= 0) {
                    digest.update(buffer, 0, read);
                }
            }
            return bytesToHex(digest.digest());
        } catch (NoSuchAlgorithmException error) {
            throw new IOException("sha256 unavailable", error);
        }
    }

    private String bytesToHex(byte[] bytes) {
        StringBuilder builder = new StringBuilder(bytes.length * 2);
        for (byte value : bytes) {
            builder.append(String.format(Locale.US, "%02x", value));
        }
        return builder.toString();
    }

    private List<String> collectSignatureDigests(PackageInfo packageInfo) throws NoSuchAlgorithmException {
        Signature[] signatures = null;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P && packageInfo.signingInfo != null) {
            signatures = packageInfo.signingInfo.hasMultipleSigners()
                    ? packageInfo.signingInfo.getApkContentsSigners()
                    : packageInfo.signingInfo.getSigningCertificateHistory();
        } else {
            signatures = packageInfo.signatures;
        }

        List<String> digests = new ArrayList<>();
        if (signatures == null) {
            return digests;
        }

        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        for (Signature signature : signatures) {
            digests.add(bytesToHex(digest.digest(signature.toByteArray())));
        }
        Collections.sort(digests);
        return digests;
    }

    private void verifyDownloadedApk(File apkFile) throws IOException {
        int signatureFlag = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
                ? PackageManager.GET_SIGNING_CERTIFICATES
                : PackageManager.GET_SIGNATURES;
        PackageInfo archiveInfo = getPackageManager().getPackageArchiveInfo(apkFile.getAbsolutePath(), signatureFlag);
        if (archiveInfo == null) {
            throw new IOException("invalid apk package");
        }

        if (!getPackageName().equals(archiveInfo.packageName)) {
            throw new IOException("package name mismatch");
        }

        long archiveVersionCode = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
                ? archiveInfo.getLongVersionCode()
                : archiveInfo.versionCode;
        if (archiveVersionCode <= getCurrentVersionCode()) {
            throw new IOException("version is not newer");
        }

        try {
            PackageInfo currentInfo = getPackageManager().getPackageInfo(getPackageName(), signatureFlag);
            List<String> currentSignatures = collectSignatureDigests(currentInfo);
            List<String> archiveSignatures = collectSignatureDigests(archiveInfo);
            if (currentSignatures.isEmpty() || !currentSignatures.equals(archiveSignatures)) {
                throw new IOException("signature mismatch");
            }
        } catch (PackageManager.NameNotFoundException | NoSuchAlgorithmException error) {
            throw new IOException("signature check failed", error);
        }
    }

    private void requestInstallApk(File apkFile) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !getPackageManager().canRequestPackageInstalls()) {
            dispatchUpdateStatus("error", "请允许本应用安装未知应用后再次点击立即更新", 0);
            Intent settingsIntent = new Intent(
                    Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + getPackageName())
            );
            startActivity(settingsIntent);
            return;
        }

        Uri apkUri = FileProvider.getUriForFile(
                this,
                getPackageName() + ".fileprovider",
                apkFile
        );
        Intent installIntent = new Intent(Intent.ACTION_VIEW);
        installIntent.setDataAndType(apkUri, "application/vnd.android.package-archive");
        installIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        installIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

        try {
            dispatchUpdateStatus("installing", "更新包已校验，正在打开系统安装器", 100);
            startActivity(installIntent);
        } catch (ActivityNotFoundException error) {
            dispatchUpdateStatus("error", "当前设备无法打开安装器", 0);
        }
    }

    private void downloadAndInstallUpdate(String releaseJson) {
        new Thread(() -> {
            try {
                JSONObject release = new JSONObject(releaseJson == null ? "{}" : releaseJson);
                String expectedSha256 = release.optString("sha256", "").trim().toLowerCase(Locale.US);
                if (!expectedSha256.matches("^[a-f0-9]{64}$")) {
                    throw new IOException("missing sha256");
                }

                long targetVersionCode = release.optLong("versionCode", 0L);
                if (targetVersionCode <= getCurrentVersionCode()) {
                    throw new IOException("version is not newer");
                }

                String apkUrl = resolveUpdateApkUrl(release);
                dispatchUpdateStatus("progress", "正在下载更新包", 1);
                File apkFile = downloadUpdateFile(apkUrl, expectedSha256);
                dispatchUpdateStatus("progress", "正在校验更新包", 96);
                verifyDownloadedApk(apkFile);
                runOnUiThread(() -> requestInstallApk(apkFile));
            } catch (Exception error) {
                dispatchUpdateStatus("error", "更新失败：" + (error.getMessage() == null ? "未知错误" : error.getMessage()), 0);
            }
        }).start();
    }

    private final class ClockInBridge {
        @JavascriptInterface
        public void startClockInFlow(String requestId) {
            runOnUiThread(() -> MainActivity.this.startClockInFlow(requestId));
        }

        @JavascriptInterface
        public void saveBase64File(String fileName, String mimeType, String base64Data) {
            new Thread(() -> {
                boolean saved = saveBase64ToDownloads(fileName, mimeType, base64Data);
                runOnUiThread(() -> Toast.makeText(
                        MainActivity.this,
                        saved ? "已保存到下载目录" : "保存失败，请稍后重试",
                        Toast.LENGTH_SHORT
                ).show());
            }).start();
        }

        @JavascriptInterface
        public void printCurrentPage(String jobName) {
            runOnUiThread(() -> printCurrentWebPage(jobName));
        }

        @JavascriptInterface
        public void downloadAndInstallUpdate(String releaseJson) {
            MainActivity.this.downloadAndInstallUpdate(releaseJson);
        }

        @JavascriptInterface
        public String getRuntimeInfo() {
            JSONObject payload = new JSONObject();

            try {
                payload.put("isEmulator", isProbablyEmulator());
                payload.put("model", Build.MODEL == null ? "" : Build.MODEL);
                payload.put("packageName", getPackageName());
                payload.put("versionCode", getCurrentVersionCode());
                payload.put("versionName", getCurrentVersionName());
                payload.put("cloudBaseUrl", getString(R.string.cloud_api_base_url));
                payload.put("cloudApiKey", getString(R.string.cloud_api_key));
            } catch (JSONException error) {
                return "{}";
            }

            return payload.toString();
        }
    }

    private boolean isProbablyEmulator() {
        return (Build.FINGERPRINT != null && (Build.FINGERPRINT.startsWith("generic") || Build.FINGERPRINT.contains("emulator")))
                || (Build.MODEL != null && (Build.MODEL.contains("Emulator") || Build.MODEL.contains("sdk_gphone")))
                || (Build.PRODUCT != null && Build.PRODUCT.contains("sdk"))
                || (Build.BRAND != null && Build.BRAND.startsWith("generic"));
    }

    private final class LocalAssetWebChromeClient extends WebChromeClient {
        @Override
        public boolean onShowFileChooser(
                WebView view,
                ValueCallback<Uri[]> filePathCallback,
                FileChooserParams fileChooserParams
        ) {
            deliverFileChooserResult(null);
            fileChooserCallback = filePathCallback;

            if (acceptsImageCapture(fileChooserParams)) {
                Uri captureUri = createCameraCaptureUri();
                Intent cameraIntent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
                if (captureUri != null) {
                    pendingCameraCaptureUri = captureUri;
                    cameraIntent.putExtra(MediaStore.EXTRA_OUTPUT, captureUri);
                    cameraIntent.setClipData(ClipData.newRawUri("caregiver-evidence", captureUri));
                    cameraIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    cameraIntent.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
                    try {
                        filePickerLauncher.launch(cameraIntent);
                        return true;
                    } catch (ActivityNotFoundException error) {
                        pendingCameraCaptureUri = null;
                    }
                }
            }

            Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType("image/*");
            intent.putExtra(
                    Intent.EXTRA_ALLOW_MULTIPLE,
                    fileChooserParams != null
                            && fileChooserParams.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE
            );

            try {
                filePickerLauncher.launch(intent);
                return true;
            } catch (ActivityNotFoundException error) {
                deliverFileChooserResult(null);
                return false;
            }
        }
    }

    private static final class LocalAssetWebViewClient extends WebViewClientCompat {
        private final WebViewAssetLoader assetLoader;

        private LocalAssetWebViewClient(WebViewAssetLoader assetLoader) {
            this.assetLoader = assetLoader;
        }

        @Override
        @Nullable
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            return assetLoader.shouldInterceptRequest(request.getUrl());
        }

        @Override
        @Nullable
        @SuppressWarnings("deprecation")
        public WebResourceResponse shouldInterceptRequest(WebView view, String url) {
            return assetLoader.shouldInterceptRequest(Uri.parse(url));
        }
    }
}
