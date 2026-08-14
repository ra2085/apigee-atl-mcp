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
    var authHeader = context.getVariable("response.header.WWW-Authenticate");
    if (authHeader) {
        var host = context.getVariable("original_host") || context.getVariable("request.header.host");
        var proxyPrmUrl = "https://" + host + "/.well-known/oauth-protected-resource/bq-mcp";
        // Replace the resource_metadata URL in the header
        var newAuthHeader = authHeader.replace(/resource_metadata="[^"]+"/, 'resource_metadata="' + proxyPrmUrl + '"');
        context.setVariable("response.header.WWW-Authenticate", newAuthHeader);
    }
} catch (e) {
    // ignore
}
