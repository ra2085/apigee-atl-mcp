# MCP Apigee Proxies (Atlassian, GitHub & BigQuery)

This repository contains the configuration and codebase for placing an **Apigee API Gateway** in-between **Model Context Protocol (MCP) clients** and cloud-hosted MCP servers (**Atlassian Rovo**, **GitHub**, and **Google Cloud BigQuery**) in a multitenant environment.

The gateways intercept MCP requests, dynamically manage client credentials and OAuth redirects under tenant-specific namespaces, validate tokens via edge-caching introspection, capture end-user identity metadata, and forward authorized requests downstream.

---

## Project Structure

* **`atlassian-mcp-proxy/apiproxy/`**: The dedicated Atlassian MCP proxy bundle (`atlassian-mcp`), exposing dynamic client registration passthroughs and introspective resource access.
* **`github-mcp-proxy/apiproxy/`**: The dedicated GitHub MCP proxy bundle (`github-mcp`), exposing OAuth discovery metadata, OIDC configuration, authorization redirects, token exchange, and authenticated tool calls with user identity injection.
* **`bq-mcp-proxy/apiproxy/`**: The dedicated Google Cloud BigQuery MCP proxy bundle (`bq-mcp`), exposing RFC 9728 discovery, Google OAuth 2.0 / OIDC metadata, 3LO authorization redirection, token exchange mediation, userinfo caching, and end-user identity metadata injection.

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

## BigQuery MCP Proxy Architecture & Flow

The BigQuery MCP proxy mediates between local/remote MCP clients and Google Cloud BigQuery MCP backend. It uses Google Cloud OAuth 2.0 credentials for consent and token acquisition, caches Google user profile info (`userinfo`), and injects end-user identity metadata (`X-End-User-Email`, `X-End-User-Sub`, `X-End-User-Name`) into downstream BigQuery requests.

### Flow 1: RFC 9728 / OIDC Discovery & Google OAuth Token Exchange
```mermaid
sequenceDiagram
    autonumber
    participant Client as MCP Client
    participant Apigee as Apigee Gateway
    participant Google as Google Cloud OAuth & Userinfo

    Note over Client, Apigee: Discovery Phase
    Client->>Apigee: GET /.well-known/oauth-protected-resource/bq-mcp
    Apigee-->>Client: PRM Metadata (Scopes: bigquery, cloud-platform, openid, email, profile)

    Client->>Apigee: GET /.well-known/openid-configuration/bq-mcp
    Apigee-->>Client: OIDC Configuration (Auth & Token Endpoints)

    Note over Client, Apigee: Authorize & Consent Flow
    Client->>Apigee: GET /bq-mcp/oauth2/authorize?client_id=...&redirect_uri=ClientCallback&state=...
    Apigee->>Apigee: Cache Client Callback (Key: State)
    Apigee-->>Client: 302 Redirect to Google OAuth (accounts.google.com)
    
    Client->>Google: Authenticate & Consent (Google Account)
    Google-->>Apigee: 302 Callback (Code=GoogleAuthCode, State)
    Apigee->>Apigee: Retrieve Client Callback from Cache & Invalidate
    Apigee-->>Client: 302 Redirect to ClientCallback (Code=GoogleAuthCode, State)

    Note over Client, Apigee: Token Exchange
    Client->>Apigee: POST /bq-mcp/oauth2/token (code, redirect_uri)
    Apigee->>Apigee: Inject Google Client ID, Secret & Mediated Callback
    Apigee->>Google: POST https://oauth2.googleapis.com/token
    Google-->>Apigee: 200 OK (Google Access Token, ID Token, Refresh Token)
    Apigee->>Google: GET https://openidconnect.googleapis.com/v1/userinfo
    Google-->>Apigee: Userinfo JSON (email, sub, name)
    Apigee->>Apigee: PopulateCache (Hashed Token Key)
    Apigee-->>Client: Return Token Response
```

### Flow 2: Authenticated MCP Requests & Identity Injection
```mermaid
sequenceDiagram
    autonumber
    participant Client as MCP Client
    participant Apigee as Apigee Gateway
    participant Cache as Apigee Cache
    participant GoogleUserinfo as Google Userinfo API
    participant BigQueryMCP as BigQuery MCP Server

    Client->>Apigee: POST /bq-mcp/mcp (Authorization: Bearer GoogleAccessToken)
    Apigee->>Cache: LookupCache (Hashed Token)

    alt Cache Hit
        Cache-->>Apigee: Cached User Profile
    else Cache Miss
        Apigee->>GoogleUserinfo: GET /v1/userinfo (Bearer Token)
        GoogleUserinfo-->>Apigee: User Profile (email, sub, name)
        Apigee->>Cache: PopulateCache (TTL: 600s)
    end

    Apigee->>Apigee: Extract email, sub, name
    Apigee->>Apigee: Set Headers: X-End-User-Email, X-End-User-Sub, X-End-User-Name
    Apigee->>BigQueryMCP: Forward Request with Token & Identity Headers
    BigQueryMCP-->>Apigee: Response Stream
    Apigee-->>Client: Mediated Response
```

---

## Client Integration Guide

To configure your local developer harnesses to query Atlassian, GitHub, or BigQuery through the Apigee Gateway:

### 1. **Cursor IDE**
Create or edit `mcp.json` (`.cursor/mcp.json` or `~/.cursor/mcp.json`):
```json
{
  "mcpServers": {
    "atlassian-apigee": {
      "url": "https://YOUR_APIGEE_HOST/atlassian-mcp/v1/mcp"
    },
    "github-apigee": {
      "url": "https://YOUR_APIGEE_HOST/github-mcp/mcp/"
    },
    "bigquery-apigee": {
      "url": "https://YOUR_APIGEE_HOST/bq-mcp/mcp"
    }
  }
}
```

### 2. **Claude Code (CLI)**
```bash
# Add endpoints
claude mcp add --transport http atlassian-apigee https://YOUR_APIGEE_HOST/atlassian-mcp/v1/mcp
claude mcp add --transport http github-apigee https://YOUR_APIGEE_HOST/github-mcp/mcp/
claude mcp add --transport http bigquery-apigee https://YOUR_APIGEE_HOST/bq-mcp/mcp

# Login / Authorize
claude mcp login atlassian-apigee
claude mcp login github-apigee
claude mcp login bigquery-apigee
```

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

### Deploy BigQuery MCP Proxy
```bash
apigeecli apis create bundle -n bq-mcp -f ./bq-mcp-proxy/apiproxy -o <YOUR_ORG> -e <YOUR_ENV> --default-token --ovr --wait
```
