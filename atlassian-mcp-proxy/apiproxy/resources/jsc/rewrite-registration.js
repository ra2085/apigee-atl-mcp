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
var flow = context.getVariable("current.flow.direction");

if (flow === "request") {
    try {
        var payloadStr = context.getVariable("request.content");
        if (payloadStr) {
            var payload = JSON.parse(payloadStr);
            var host = context.getVariable("original_host") || context.getVariable("request.header.host");
            
            if (payload.redirect_uris) {
                context.setVariable("client_original_redirect_uris", JSON.stringify(payload.redirect_uris));
                payload.redirect_uris = [
                    "https://" + host + "/atlassian-mcp/oauth2/callback"
                ];
                context.setVariable("request.content", JSON.stringify(payload));
            }
        }
    } catch (e) {
        // ignore
    }
} else if (flow === "response") {
    try {
        var payloadStr = context.getVariable("response.content");
        if (payloadStr) {
            var payload = JSON.parse(payloadStr);
            var origUrisStr = context.getVariable("client_original_redirect_uris");
            if (origUrisStr && payload.redirect_uris) {
                payload.redirect_uris = JSON.parse(origUrisStr);
                context.setVariable("response.content", JSON.stringify(payload));
            }
        }
    } catch (e) {
        // ignore
    }
}
