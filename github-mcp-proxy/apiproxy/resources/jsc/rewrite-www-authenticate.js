try {
    var authHeader = context.getVariable("response.header.WWW-Authenticate");
    if (authHeader) {
        var host = context.getVariable("original_host") || context.getVariable("request.header.host");
        var proxyPrmUrl = "https://" + host + "/.well-known/oauth-protected-resource/github-mcp";
        // Replace the resource_metadata URL in the header
        var newAuthHeader = authHeader.replace(/resource_metadata="[^"]+"/, 'resource_metadata="' + proxyPrmUrl + '"');
        context.setVariable("response.header.WWW-Authenticate", newAuthHeader);
    }
} catch (e) {
    // ignore
}
