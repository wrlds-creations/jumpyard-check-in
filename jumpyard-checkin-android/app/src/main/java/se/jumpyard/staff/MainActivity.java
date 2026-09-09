package se.jumpyard.staff;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.ActivityManager;
import android.content.pm.PackageManager;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.graphics.Insets;
import android.net.http.SslError;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.CookieManager;
import android.webkit.PermissionRequest;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.SslErrorHandler;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

public final class MainActivity extends Activity {
    private static final int CAMERA_REQUEST = 345;
    private static final int RED = Color.rgb(227, 24, 55);
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final WebPolicy policy = new WebPolicy(BuildConfig.START_URL, BuildConfig.DEBUG);
    private final Runnable loadingTimeout = this::showError;
    private FrameLayout root;
    private WebView web;
    private LinearLayout errorPanel;
    private ProgressBar progress;
    private PermissionRequest pendingCamera;
    private boolean failed;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        // Do not persist WebView state, PIN/session data, or booking details in an Activity bundle.
        root = new FrameLayout(this);
        root.setBackgroundColor(Color.WHITE);
        setContentView(root);
        applyInsets();
        createWebView();
        createStatusViews();
        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(0, this::handleBack);
        }
        loadStaff();
    }

    @SuppressWarnings("deprecation")
    private void applyInsets() {
        if (Build.VERSION.SDK_INT >= 30) getWindow().setDecorFitsSystemWindows(false);
        root.setOnApplyWindowInsetsListener((view, insets) -> {
            if (Build.VERSION.SDK_INT >= 30) {
                Insets safe = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
                view.setPadding(safe.left, safe.top, safe.right, safe.bottom);
            } else {
                view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                        insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            }
            return insets;
        });
    }

    @SuppressLint("SetJavaScriptEnabled") // The reviewed staff Next.js app requires JS; no native bridge exists.
    private void createWebView() {
        web = new WebView(this);
        web.setId(android.R.id.primary);
        web.setBackgroundColor(Color.WHITE);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSafeBrowsingEnabled(true);
        settings.setGeolocationEnabled(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, false);
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (policy.allowNavigation(request.getUrl().toString())) return false;
                if (request.isForMainFrame()) Toast.makeText(MainActivity.this, R.string.navigation_blocked, Toast.LENGTH_SHORT).show();
                return true;
            }

            @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap icon) {
                if (!policy.allowNavigation(url)) {
                    view.stopLoading();
                    showError();
                    return;
                }
                failed = false;
                errorPanel.setVisibility(View.GONE);
                progress.setVisibility(View.VISIBLE);
                handler.removeCallbacks(loadingTimeout);
                handler.postDelayed(loadingTimeout, 30_000);
            }

            @Override public void onPageFinished(WebView view, String url) {
                handler.removeCallbacks(loadingTimeout);
                progress.setVisibility(View.GONE);
                if (!failed) errorPanel.setVisibility(View.GONE);
            }

            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) showError();
            }

            @Override public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
                if (request.isForMainFrame()) showError();
            }

            @Override public void onReceivedSslError(WebView view, SslErrorHandler ssl, SslError error) {
                ssl.cancel();
                showError();
            }

            @Override public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                cancelCamera();
                root.removeView(view);
                view.destroy();
                createWebView();
                errorPanel.bringToFront();
                progress.bringToFront();
                showError();
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public void onPermissionRequest(PermissionRequest request) {
                cancelCamera();
                if (!policy.allowCamera(request.getOrigin().toString(), web.getUrl(), request.getResources())) {
                    request.deny();
                    return;
                }
                if (checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
                    request.grant(new String[] { PermissionRequest.RESOURCE_VIDEO_CAPTURE });
                } else {
                    pendingCamera = request;
                    requestPermissions(new String[] { Manifest.permission.CAMERA }, CAMERA_REQUEST);
                }
            }
            @Override public void onPermissionRequestCanceled(PermissionRequest request) {
                if (pendingCamera == request) pendingCamera = null;
            }
        });
        root.addView(web, 0, new FrameLayout.LayoutParams(-1, -1));
    }

    private void createStatusViews() {
        errorPanel = new LinearLayout(this);
        errorPanel.setOrientation(LinearLayout.VERTICAL);
        errorPanel.setGravity(Gravity.CENTER);
        errorPanel.setPadding(dp(24), dp(24), dp(24), dp(24));
        errorPanel.setBackgroundColor(Color.WHITE);
        ImageView logo = new ImageView(this);
        logo.setImageResource(R.drawable.jumpyard_logo);
        logo.setScaleType(ImageView.ScaleType.FIT_CENTER);
        logo.setContentDescription(getString(R.string.logo_description));
        errorPanel.addView(logo, new LinearLayout.LayoutParams(dp(180), dp(80)));
        TextView title = new TextView(this);
        title.setText(R.string.offline_title);
        title.setTextSize(24);
        title.setTextColor(Color.BLACK);
        title.setGravity(Gravity.CENTER);
        title.setPadding(0, dp(24), 0, dp(8));
        errorPanel.addView(title);
        TextView description = new TextView(this);
        description.setText(R.string.offline_body);
        description.setTextColor(Color.BLACK);
        description.setTextSize(16);
        description.setGravity(Gravity.CENTER);
        errorPanel.addView(description);
        Button retry = new Button(this);
        retry.setText(R.string.retry);
        retry.setTextColor(Color.WHITE);
        retry.setBackgroundTintList(ColorStateList.valueOf(RED));
        retry.setOnClickListener(view -> loadStaff());
        LinearLayout.LayoutParams retryLayout = new LinearLayout.LayoutParams(dp(220), dp(56));
        retryLayout.topMargin = dp(24);
        errorPanel.addView(retry, retryLayout);
        errorPanel.setVisibility(View.GONE);
        root.addView(errorPanel, new FrameLayout.LayoutParams(-1, -1));
        progress = new ProgressBar(this);
        progress.setIndeterminateTintList(ColorStateList.valueOf(RED));
        progress.setContentDescription(getString(R.string.loading));
        FrameLayout.LayoutParams progressLayout = new FrameLayout.LayoutParams(dp(32), dp(32), Gravity.CENTER);
        root.addView(progress, progressLayout);
    }

    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }

    private void loadStaff() {
        cancelCamera();
        failed = false;
        errorPanel.setVisibility(View.GONE);
        progress.setVisibility(View.VISIBLE);
        web.loadUrl(BuildConfig.START_URL);
    }

    private void showError() {
        if (isDestroyed()) return;
        failed = true;
        handler.removeCallbacks(loadingTimeout);
        web.stopLoading();
        progress.setVisibility(View.GONE);
        errorPanel.setVisibility(View.VISIBLE);
    }

    private void cancelCamera() {
        if (pendingCamera != null) { pendingCamera.deny(); pendingCamera = null; }
    }

    @Override public void onRequestPermissionsResult(int code, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(code, permissions, results);
        if (code != CAMERA_REQUEST || pendingCamera == null) return;
        PermissionRequest request = pendingCamera;
        pendingCamera = null;
        if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED
                && policy.allowCamera(request.getOrigin().toString(), web.getUrl(), request.getResources())) {
            request.grant(new String[] { PermissionRequest.RESOURCE_VIDEO_CAPTURE });
        } else {
            request.deny();
            Toast.makeText(this, R.string.camera_denied, Toast.LENGTH_LONG).show();
        }
    }

    @Override protected void onResume() {
        super.onResume();
        web.setVisibility(View.VISIBLE);
        web.onResume();
    }

    @Override protected void onPause() {
        web.onPause();
        web.setVisibility(View.INVISIBLE);
        super.onPause();
    }

    private void handleBack() {
        if (web.canGoBack()) web.goBack();
        else if (getSystemService(ActivityManager.class).getLockTaskModeState() == ActivityManager.LOCK_TASK_MODE_NONE) moveTaskToBack(true);
    }

    @SuppressWarnings("deprecation")
    @SuppressLint("GestureBackNavigation") // API 33+ uses OnBackInvokedDispatcher above; this is only the API 28-32 fallback.
    @Override public void onBackPressed() { handleBack(); }

    @Override protected void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        cancelCamera();
        root.removeView(web);
        web.destroy();
        super.onDestroy();
    }
}
