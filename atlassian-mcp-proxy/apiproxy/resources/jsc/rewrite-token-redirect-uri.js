/*
 * Copyright 2026 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
try {
    var body = context.getVariable("request.content");
    if (body) {
        var params = {};
        body.split('&').forEach(function(pair) {
            var index = pair.indexOf('=');
            if (index !== -1) {
                var key = pair.substring(0, index);
                var value = pair.substring(index + 1);
                params[decodeURIComponent(key)] = decodeURIComponent(value);
            }
        });
        
        var host = context.getVariable("original_host") || context.getVariable("request.header.host");
        params["redirect_uri"] = "https://" + host + "/atlassian-mcp/oauth2/callback";
        
        // Inner try-catch to protect the critical redirect_uri rewrite from JWT parsing errors
        try {
            if (!params["client_id"]) {
                var token = params["code"] || params["refresh_token"];
                if (token && token.indexOf("eyJ") === 0) {
                    var parts = token.split('.');
                    if (parts.length > 1) {
                        var payloadBase64 = parts[1];
                        // Replace URL-safe base64 characters
                        payloadBase64 = payloadBase64.replace(/-/g, '+').replace(/_/g, '/');
                        // Add padding if necessary
                        while (payloadBase64.length % 4) {
                            payloadBase64 += '=';
                        }
                        var javaString = new java.lang.String(payloadBase64);
                        var decodedBytes = java.util.Base64.getDecoder().decode(javaString);
                        var payloadStr = new java.lang.String(decodedBytes, "UTF-8");
                        var payload = JSON.parse(payloadStr);
                        var clientId = payload.aud;
                        if (clientId) {
                            params["client_id"] = (typeof clientId === 'object') ? clientId[0] : clientId;
                        }
                    }
                }
            }
        } catch (innerEx) {
            // Log/ignore inner JWT parsing exceptions to prevent blocking redirect_uri rewrite
        }
        
        var newBodyParts = [];
        for (var key in params) {
            if (params.hasOwnProperty(key)) {
                newBodyParts.push(encodeURIComponent(key) + "=" + encodeURIComponent(params[key]));
            }
        }
        context.setVariable("request.content", newBodyParts.join('&'));
        context.setVariable("request.header.Content-Type", "application/x-www-form-urlencoded");
    }
} catch (e) {
    // ignore
}
