# Website Kelas X TKJ - Project Graph

## Arsitektur Sistem

```mermaid
graph TD
    subgraph Client Layer
        A[Vite Dev Server:5173] -->|Proxy /api/*| B[Backend]
        C[Node.js Server:3000] -->|Static Files| F[public/index.html]
    end

    subgraph API Layer
        B[PHP Backend:8000] --> D[router.php]
        D --> E[api.php]
        F_JS[Express Server.js:3000]
        F_JS -->|API Routes| G[auth.js]
    end

    subgraph Data Layer
        H[SQLite: database.db]
        I[Supabase Postgres]
        J[Storage Bucket: uploads]
    end

    subgraph Deployment
        K[Vercel - Frontend + Functions]
        L[Supabase - Database + Storage]
    end

    E -->|PDO SQLite| H
    G -->|SQLite3| H
    K -->|Supabase API| I
    K -->|Storage API| J
    L -->|Replaces| H

    style A fill:#e11d48,stroke:#333,color:#fff
    style C fill:#1e40af,stroke:#333,color:#fff
    style B fill:#059669,stroke:#333,color:#fff
    style F_JS fill:#1e40af,stroke:#333,color:#fff
    style H fill:#ca8a04,stroke:#333,color:#fff
    style I fill:#8b5cf6,stroke:#333,color:#fff
    style K fill:#0ea5e0,stroke:#333,color:#fff
    style L fill:#8b5cf6,stroke:#333,color:#fff

    linkStyle 8 stroke:#8b5cf6,stroke-width:2px,color:#fff;
    linkStyle 9 stroke:#8b5cf6,stroke-width:2px,color:#fff;
```

## Komponen Utama
[[frontend]] | [[backend]] | [[server.js]] | [[auth.js]] | [[database.db]]

## Deployment Targets
[[vercel.json]] | [[Dockerfile]] | [[supabase/]] | [[render.yaml]]
