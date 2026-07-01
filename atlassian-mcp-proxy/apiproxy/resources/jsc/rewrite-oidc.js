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
    var payloadStr = context.getVariable("response.content");
    if (payloadStr) {
        var payload = JSON.parse(payloadStr);
        var host = context.getVariable("original_host") || context.getVariable("request.header.host");
        var tenantId = context.getVariable("tenant_id");
        if (tenantId) {
            payload.issuer = "https://" + host + "/atlassian-mcp/oauth2/" + tenantId;
            payload.authorization_endpoint = "https://" + host + "/atlassian-mcp/oauth2/" + tenantId + "/authorize";
            payload.token_endpoint = "https://" + host + "/atlassian-mcp/oauth2/" + tenantId + "/token";
            payload.registration_endpoint = "https://" + host + "/atlassian-mcp/v1/mcp/authv2/" + tenantId;
        } else {
            payload.issuer = "https://" + host + "/atlassian-mcp/oauth2";
            payload.authorization_endpoint = "https://" + host + "/atlassian-mcp/oauth2/authorize";
            payload.token_endpoint = "https://" + host + "/atlassian-mcp/oauth2/token";
            payload.registration_endpoint = "https://" + host + "/atlassian-mcp/v1/mcp/authv2";
        }
        payload.userinfo_endpoint = "https://api.atlassian.com/me";
        payload.jwks_uri = "https://auth.atlassian.com/.well-known/jwks.json";
        payload.end_session_endpoint = "https://auth.atlassian.com/v2/logout";
        context.setVariable("response.content", JSON.stringify(payload));
    }
} catch (e) {
    // ignore
}
