# MCP Apigee Proxies (Atlassian & GitHub)

This repository contains the configuration and codebase for placing an **Apigee API Gateway** in-between **Model Context Protocol (MCP) clients** and cloud-hosted MCP servers (**Atlassian Rovo** and **GitHub**) in a multitenant environment.

The gateways intercept MCP requests, dynamically manage client credentials and OAuth redirects under tenant-specific namespaces, validate tokens via edge-caching introspection, capture end-user identity metadata, and forward authorized requests downstream.

---

## Project Structure

* **`atlassian-mcp-proxy/apiproxy/`**: The dedicated Atlassian MCP proxy bundle (`atlassian-mcp`), exposing dynamic client registration passthroughs and introspective resource access.
* **`github-mcp-proxy/apiproxy/`**: The dedicated GitHub MCP proxy bundle (`github-mcp`), exposing OAuth discovery metadata, OIDC configuration, authorization redirects, token exchange, and authenticated tool calls with user identity injection.

---

## Atlassian MCP Proxy Architecture & Authorization Flow

The authentication flow utilizes **RFC 9728** (Protected Resource Metadata) for discovery, dynamically registers client credentials, intercepts OAuth 3LO redirects to capture codes, and proxies token exchanges back to Atlassian while caching sessions at the edge.

### Flow 1: RFC 9728 Discovery, Dynamic Registration & Token Acquisition (SSO)
```mermaid
sequenceDiagram
    autonumber
    participant Client as MCP Client
    participant Apigee as Apigee Gateway
    participant Atlassian as Atlassian Cloud

    Note over Client, Apigee: Discovery Phase (RFC 9728)
    Client->>Apigee: GET /.well-known/oauth-protected-resource/atlassian-mcp
    Apigee->>Atlassian: Forward GET to Atlassian PRM Endpoint
    Atlassian-->>Apigee: Return Atlassian Protected Resource Metadata
    Apigee->>Apigee: JS Policy: Rewrite resource URLs to point to Apigee
    Apigee-->>Client: Return Mediated Protected Resource Metadata
    
    Client->>Apigee: GET /.well-known/oauth-authorization-server/atlassian-mcp
    Apigee->>Atlassian: Forward GET to Atlassian OASM Endpoint
    Atlassian-->>Apigee: Return Atlassian Authorization Server Metadata
    Apigee->>Apigee: JS Policy: Rewrite auth, token, and DCR endpoints to Apigee
    Apigee-->>Client: Return Mediated Authorization Server Metadata

    Note over Client, Apigee: Dynamic Client Registration (DCR)
    Client->>Apigee: POST /atlassian-mcp/v1/mcp/authv2 (Register Client Metadata)
    Apigee->>Atlassian: Forward POST /v1/mcp/authv2
    Atlassian-->>Atlassian: 200 OK (Atlassian Client ID & Secret)
    Apigee-->>Client: Dynamic Credentials Returned
    
    Note over Client, Atlassian: Start Authorize Redirect Flow
    Client->>Apigee: GET /atlassian-mcp/oauth2/authorize?client_id=AtlassianClientID&redirect_uri=ClientCallback
    Apigee->>Apigee: Cache Client Callback (Key: State)
    Apigee-->>Client: 302 Redirect to Atlassian SSO
    
    Client->>Atlassian: Authenticate & Consent (SSO)
    Atlassian-->>Apigee: 302 Callback (Code=AtlassianCode, State)
    Apigee->>Apigee: Read Cached Client Callback & Invalidate Cache Entry
    Apigee-->>Client: 302 Redirect to ClientCallback (Code=AtlassianCode, State)
    
    Note over Client, Atlassian: Exchange Code for Access Token
    Client->>Apigee: POST /atlassian-mcp/oauth2/token (Grant=authorization_code, Code=AtlassianCode)
    Apigee->>Atlassian: Forward POST /oauth/token
    Atlassian-->>Atlassian: 200 OK (Atlassian Access Token)
    Apigee->>Apigee: Service Callout /me, Cache User Profile (Hashed Token Key)
    Apigee-->>Client: Dynamic Token Response Returned
```

### Flow 2: Proxy Request Flow (Introspection & Caching)
```mermaid
sequenceDiagram
    autonumber
    participant Client as MCP Client
    participant Apigee as Apigee Gateway
    participant Cache as Apigee Cache
    participant AtlassianAPI as Atlassian User API (/me)
    participant AtlassianMCP as Atlassian MCP Server

    Client->>Apigee: POST /atlassian-mcp/v1/mcp (Authorization: Bearer AtlassianToken)
    Apigee->>Cache: LookupCache (Key: AtlassianToken)
    
    alt Cache Hit
        Cache-->>Apigee: User Profile JSON (email, account_id)
    else Cache Miss
        Apigee->>AtlassianAPI: GET /me (Authorization: Bearer AtlassianToken)
        AtlassianAPI-->>Atlassian: 200 OK User Profile JSON
        Apigee->>Cache: PopulateCache (User Profile JSON)
    end

    Apigee->>Apigee: Extract email & account_id
    Apigee->>Apigee: Set Headers: X-End-User-Email, X-End-User-Sub
    Apigee->>AtlassianMCP: Forward POST /v1/mcp (with token unchanged)
    AtlassianMCP-->>Apigee: Response Stream
    Apigee-->>Client: Forwarded Stream
```

---

## GitHub MCP Proxy Architecture & Flow

The GitHub MCP proxy provides secure mediation between local MCP tools and GitHub, handling OIDC/OAuth discovery, token exchange, and user identity extraction (`X-End-User-Email`, `X-End-User-Sub`, `X-End-User-Login`).

### Flow 1: OIDC Discovery & OAuth Token Exchange
```mermaid
sequenceDiagram
    autonumber
    participant Client as MCP Client
    participant Apigee as Apigee Gateway
    participant GitHub as GitHub OAuth & API

    Note over Client, Apigee: OIDC & OAuth Discovery
    Client->>Apigee: GET /.well-known/openid-configuration/github-mcp
    Apigee->>GitHub: GET /login/oauth/.well-known/openid-configuration
    GitHub-->>Apigee: OIDC Metadata JSON
    Apigee->>Apigee: JavaScript-RewriteOpenIdConfiguration
    Apigee-->>Client: Mediated OIDC Metadata

    Note over Client, Apigee: Authorize & Token Exchange
    Client->>Apigee: GET /github-mcp/oauth2/authorize
    Apigee-->>Client: 302 Redirect to GitHub /login/oauth/authorize
    Client->>GitHub: Authenticate & Authorize
    GitHub-->>Apigee: 302 Callback (Code)
    Apigee-->>Client: 302 Redirect to Client Callback
    Client->>Apigee: POST /github-mcp/oauth2/token
    Apigee->>GitHub: POST /login/oauth/access_token
    GitHub-->>Apigee: GitHub Access Token
    Apigee->>GitHub: GET /user (User Profile)
    GitHub-->>Apigee: User Profile (id, email, login)
    Apigee->>Apigee: PopulateCache (Hashed Token Key)
    Apigee-->>Client: Token Response
```

### Flow 2: Authenticated Tool Calls & Metadata Injection
```mermaid
sequenceDiagram
    autonumber
    participant Client as MCP Client
    participant Apigee as Apigee Gateway
    participant Cache as Apigee Cache
    participant GitHubAPI as GitHub API (/user)
    participant GitHubMCP as GitHub MCP Server

    Client->>Apigee: POST /github-mcp/mcp (Bearer Token)
    Apigee->>Cache: LookupCache (Hashed Token)
    
    alt Cache Hit
        Cache-->>Apigee: Cached User Profile
    else Cache Miss
        Apigee->>GitHubAPI: GET /user
        GitHubAPI-->>Apigee: User Profile (id, email, login)
        Apigee->>Cache: PopulateCache
    end

    Apigee->>Apigee: Extract id, email, login
    Apigee->>Apigee: Set Headers: X-End-User-Sub, X-End-User-Email, X-End-User-Login
    Apigee->>GitHubMCP: Forward Request with User Headers
    GitHubMCP-->>Apigee: Response
    Apigee-->>Client: Response
```

---

## Client Integration Guide

To configure your local developer harnesses to query Atlassian or GitHub through the Apigee Gateway:

### 1. **Cursor IDE**
1. Create or edit `mcp.json` (`.cursor/mcp.json` or `~/.cursor/mcp.json`):
   ```json
   {
     "mcpServers": {
       "atlassian-apigee": {
         "url": "https://YOUR_APIGEE_HOST/atlassian-mcp/v1/mcp"
       },
       "github-apigee": {
         "url": "https://YOUR_APIGEE_HOST/github-mcp/mcp/"
       }
     }
   }
   ```
2. Save the file and complete the browser authentication prompt.

### 2. **Claude Code (CLI)**
1. Run:
   ```bash
   claude mcp add --transport http atlassian-apigee https://YOUR_APIGEE_HOST/atlassian-mcp/v1/mcp
   claude mcp add --transport http github-apigee https://YOUR_APIGEE_HOST/github-mcp/mcp/
   ```
2. Run `claude mcp login atlassian-apigee` / `github-apigee` and complete browser authentication.

---

## Deployment

Deployments are performed using **`apigeecli`**.

### Deploy Atlassian MCP Proxy
```bash
apigeecli apis create bundle -n atlassian-mcp -f ./atlassian-mcp-proxy/apiproxy -o <YOUR_ORG> -e <YOUR_ENV> --default-token --ovr --wait
```

### Deploy GitHub MCP Proxy
```bash
apigeecli apis create bundle -n github-mcp -f ./github-mcp-proxy/apiproxy -o <YOUR_ORG> -e <YOUR_ENV> --default-token --ovr --wait
```
