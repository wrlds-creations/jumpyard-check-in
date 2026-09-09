package se.jumpyard.staff;

import java.net.URI;
import java.net.URISyntaxException;

/** No external intents, deep-link URL overrides, or privileged JavaScript bridge. */
final class WebPolicy {
    static final String LIVE_ORIGIN = "https://staff-checkin.jumpyard.se";
    private final String origin;

    WebPolicy(String startUrl, boolean debug) {
        if ((LIVE_ORIGIN + "/").equals(startUrl)) origin = LIVE_ORIGIN;
        else if (debug && "http://127.0.0.1:3002/".equals(startUrl)) origin = "http://127.0.0.1:3002";
        else throw new IllegalArgumentException("Unapproved staff origin");
    }

    boolean trustedOrigin(String value) {
        if (value == null) return false;
        try {
            URI uri = new URI(value);
            URI expected = new URI(origin);
            int port = uri.getPort() == -1 ? defaultPort(uri.getScheme()) : uri.getPort();
            int expectedPort = expected.getPort() == -1 ? defaultPort(expected.getScheme()) : expected.getPort();
            return expected.getScheme().equals(uri.getScheme())
                    && expected.getHost().equals(uri.getHost())
                    && uri.getRawUserInfo() == null && port == expectedPort;
        } catch (URISyntaxException error) { return false; }
    }

    boolean allowNavigation(String value) {
        if (!trustedOrigin(value)) return false;
        try {
            String path = new URI(value).getRawPath();
            return path == null || path.isEmpty() || path.equals("/");
        } catch (URISyntaxException error) { return false; }
    }

    boolean allowCamera(String requestedOrigin, String currentPage, String[] resources) {
        if (!trustedOrigin(requestedOrigin) || !allowNavigation(currentPage) || resources == null) return false;
        for (String resource : resources) {
            if ("android.webkit.resource.VIDEO_CAPTURE".equals(resource)) return true;
        }
        return false;
    }

    private static int defaultPort(String scheme) { return "https".equals(scheme) ? 443 : "http".equals(scheme) ? 80 : -1; }
}
