package br.com.cenaaberta.prototipo;

import android.app.Activity;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowInsets;
import android.webkit.*;
import java.io.*;

public final class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private WebView web;
    private void back() {
        if (web.canGoBack()) web.goBack();
        else finish();
    }
    @Override public void onBackPressed() { back(); }
    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        web = new WebView(this);
        web.setBackgroundColor(0xff11141d);
        web.getSettings().setJavaScriptEnabled(true);
        web.getSettings().setDomStorageEnabled(true);
        web.getSettings().setAllowFileAccess(false);
        web.getSettings().setAllowContentAccess(false);
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                return !HOST.equals(req.getUrl().getHost()) || !"https".equals(req.getUrl().getScheme());
            }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
                String path = req.getUrl().getPath();
                if (HOST.equals(req.getUrl().getHost()) && "https".equals(req.getUrl().getScheme()) && path != null && path.matches("/(index\\.html|app\\.js|style\\.css)")) {
                    String mime = path.endsWith(".html") ? "text/html" : path.endsWith(".js") ? "text/javascript" : "text/css";
                    try { return new WebResourceResponse(mime, "UTF-8", getAssets().open(path.substring(1))); }
                    catch (IOException ignored) { }
                }
                return new WebResourceResponse("text/plain","UTF-8",404,"Not found",java.util.Collections.emptyMap(),null);
            }
        });
        setContentView(web);
        if (Build.VERSION.SDK_INT >= 30) web.setOnApplyWindowInsetsListener((v,insets) -> {
            android.graphics.Insets safe = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
            v.setPadding(safe.left,safe.top,safe.right,safe.bottom);
            return WindowInsets.CONSUMED;
        });
        if (Build.VERSION.SDK_INT >= 33)
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(0,this::back);
        if (saved == null || web.restoreState(saved) == null)
            web.loadUrl("https://"+HOST+"/index.html");
    }
    @Override protected void onSaveInstanceState(Bundle out) { web.saveState(out); super.onSaveInstanceState(out); }
}
