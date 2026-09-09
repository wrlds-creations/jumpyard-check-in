package se.jumpyard.staff;

import org.junit.Test;
import static org.junit.Assert.*;

public class WebPolicyTest {
    private final WebPolicy live = new WebPolicy(WebPolicy.LIVE_ORIGIN + "/", false);

    @Test public void acceptsOnlyStaffRoot() {
        assertTrue(live.allowNavigation(WebPolicy.LIVE_ORIGIN + "/"));
        assertTrue(live.allowNavigation(WebPolicy.LIVE_ORIGIN + ":443/?venue=50871#staff"));
        for (String url : new String[] {"http://staff-checkin.jumpyard.se/", "https://staff-checkin.jumpyard.se.evil.test/",
                "https://staff-checkin.jumpyard.se@evil.test/", "https://evil@staff-checkin.jumpyard.se/",
                "https://staff-checkin.jumpyard.se:8443/", "https://staff-checkin.jumpyard.se/admin",
                "https://staff-checkin.jumpyard.se/%2fadmin", "https://staff-checkin.jumpyard.se/./admin",
                "https://checkin.jumpyard.se/", "intent://staff", "javascript:alert(1)", "file:///data/", "not a URL"}) {
            assertFalse(url, live.allowNavigation(url));
        }
        assertFalse(live.allowNavigation(null));
    }

    @Test public void cameraRequiresTrustedOriginAndCurrentStaffPage() {
        String video = "android.webkit.resource.VIDEO_CAPTURE";
        assertTrue(live.allowCamera(WebPolicy.LIVE_ORIGIN, WebPolicy.LIVE_ORIGIN + "/", new String[]{video}));
        assertFalse(live.allowCamera("https://evil.test", WebPolicy.LIVE_ORIGIN + "/", new String[]{video}));
        assertFalse(live.allowCamera(WebPolicy.LIVE_ORIGIN, WebPolicy.LIVE_ORIGIN + "/admin", new String[]{video}));
        assertFalse(live.allowCamera(WebPolicy.LIVE_ORIGIN, null, new String[]{video}));
        assertFalse(live.allowCamera(WebPolicy.LIVE_ORIGIN, WebPolicy.LIVE_ORIGIN + "/", new String[]{"android.webkit.resource.AUDIO_CAPTURE"}));
        assertFalse(live.allowCamera(WebPolicy.LIVE_ORIGIN, WebPolicy.LIVE_ORIGIN + "/", null));
    }

    @Test public void releaseCannotSelectLocalhostOrAnArbitraryUrl() {
        for (String url : new String[]{"http://127.0.0.1:3002/", "https://evil.test/"}) {
            assertThrows(IllegalArgumentException.class, () -> new WebPolicy(url, false));
        }
        assertThrows(IllegalArgumentException.class, () -> new WebPolicy("https://evil.test/", true));
        WebPolicy local = new WebPolicy("http://127.0.0.1:3002/", true);
        assertTrue(local.allowNavigation("http://127.0.0.1:3002/"));
        assertFalse(local.allowNavigation("http://127.0.0.1:4005/"));
        assertFalse(local.allowNavigation(WebPolicy.LIVE_ORIGIN + "/"));
    }
}
