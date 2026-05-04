# AgentFloor — Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Next.js frontend for AgentFloor — 5 screens, NextAuth.js auth (email + Google OAuth), real-time WebSocket agent monitoring, and a dark command-center aesthetic.

**Architecture:** Next.js 14 App Router. NextAuth.js v4 manages sessions; a custom fetch wrapper calls FastAPI with Bearer tokens attached. A `useAgentStream` hook manages WebSocket subscriptions for the live monitor. All data fetching via TanStack Query v5.

**Tech Stack:** Next.js 14, TypeScript, Tailwind CSS, NextAuth.js v4, TanStack Query v5, Zustand

**Prerequisite:** Backend from `2026-05-04-agentfloor-backend.md` must be running at `http://localhost:8000`

---

## File Map

```
frontend/
├── package.json
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── .env.local.example
├── middleware.ts
├── app/
│   ├── layout.tsx
│   ├── page.tsx                     # redirects → /runs
│   ├── login/page.tsx
│   ├── register/page.tsx
│   ├── runs/
│   │   ├── page.tsx                 # Run History
│   │   ├── new/page.tsx             # Launch Run
│   │   └── [id]/
│   │       ├── page.tsx             # Results Viewer
│   │       └── live/page.tsx        # Live Monitor
│   └── settings/page.tsx
├── components/
│   ├── layout/TopNav.tsx
│   ├── runs/
│   │   ├── RunForm.tsx
│   │   ├── RunTable.tsx
│   │   ├── RunFilters.tsx
│   │   ├── AgentFeed.tsx
│   │   ├── AgentSidebar.tsx
│   │   ├── PipelinePanel.tsx
│   │   ├── TraderDecision.tsx
│   │   ├── AnalystReports.tsx
│   │   └── BullBearDebate.tsx
│   └── settings/
│       ├── ApiKeyRow.tsx
│       └── TeamMemberRow.tsx
└── lib/
    ├── api.ts
    ├── auth.ts
    ├── types.ts
    └── websocket.ts
```

---

### Task 1: Next.js scaffold

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/next.config.ts`
- Create: `frontend/tailwind.config.ts`
- Create: `frontend/.env.local.example`

- [ ] **Step 1: Bootstrap Next.js**

```bash
cd /Users/saketnayak/Developer/trading-command-center
npx create-next-app@14 frontend \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --no-src-dir \
  --import-alias "@/*"
```

- [ ] **Step 2: Install dependencies**

```bash
cd frontend
npm install next-auth @tanstack/react-query zustand
npm install -D @types/node
```

- [ ] **Step 3: Create `frontend/.env.local.example`**

```
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=change-me-32-chars-minimum
NEXT_PUBLIC_API_URL=http://localhost:8000
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

- [ ] **Step 4: Update `frontend/next.config.ts`**

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/backend/:path*",
        destination: `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/:path*`,
      },
    ];
  },
};

export default nextConfig;
```

- [ ] **Step 5: Update `frontend/tailwind.config.ts`** — add dark mode

```typescript
import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        navy: { 900: "#0a0e1a", 800: "#0d1220", 700: "#0f1629", 600: "#1a1d2e" },
      },
      fontFamily: { mono: ["var(--font-mono)", "monospace"] },
    },
  },
  plugins: [],
};

export default config;
```

- [ ] **Step 6: Commit**

```bash
git add frontend/
git commit -m "feat: Next.js 14 scaffold with Tailwind + TanStack Query + Zustand"
```

---

### Task 2: Types, API client, and auth config

**Files:**
- Create: `frontend/lib/types.ts`
- Create: `frontend/lib/api.ts`
- Create: `frontend/lib/auth.ts`
- Create: `frontend/lib/websocket.ts`

- [ ] **Step 1: Create `frontend/lib/types.ts`**

```typescript
export interface User {
  id: string;
  email: string;
  name: string;
  role: "admin" | "member";
}

export interface Run {
  id: string;
  ticker: string;
  analysis_date: string;
  llm_provider: string;
  llm_model: string;
  depth: "quick" | "standard" | "deep";
  analysts: string[];
  label: string | null;
  status: "pending" | "running" | "completed" | "aborted" | "failed";
  verdict: "buy" | "sell" | "hold" | null;
  created_by: string;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface AgentEventPayload {
  type: "started" | "token" | "completed" | "error" | "run_completed" | "run_aborted";
  agent?: string;
  token?: string;
  summary?: string;
  message?: string;
  sequence?: number;
  run_id?: string;
}

export interface Report {
  id: string;
  run_id: string;
  trader_decision: string;
  verdict: "buy" | "sell" | "hold";
  suggested_entry: string | null;
  suggested_stop: string | null;
  suggested_target: string | null;
  risk_assessment: string;
  raw_report: Record<string, unknown>;
}

export interface ApiKeyStatus {
  provider: string;
  is_valid: boolean;
  validated_at: string | null;
  masked_key: string;
}

export interface CreateRunRequest {
  ticker: string;
  analysis_date: string;
  llm_provider: string;
  llm_model: string;
  depth: string;
  analysts: string[];
  label?: string;
}
```

- [ ] **Step 2: Create `frontend/lib/api.ts`**

```typescript
import { getSession } from "next-auth/react";
import type { Run, CreateRunRequest, ApiKeyStatus, User } from "./types";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function fetchWithAuth(path: string, init: RequestInit = {}): Promise<Response> {
  const session = await getSession();
  const token = (session as { accessToken?: string })?.accessToken;
  return fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
}

export async function getRuns(params?: { ticker?: string; verdict?: string }): Promise<Run[]> {
  const qs = new URLSearchParams(params as Record<string, string>).toString();
  const r = await fetchWithAuth(`/runs${qs ? `?${qs}` : ""}`);
  if (!r.ok) throw new Error("Failed to fetch runs");
  return r.json();
}

export async function getRun(id: string): Promise<Run> {
  const r = await fetchWithAuth(`/runs/${id}`);
  if (!r.ok) throw new Error("Run not found");
  return r.json();
}

export async function createRun(req: CreateRunRequest): Promise<Run> {
  const r = await fetchWithAuth("/runs", { method: "POST", body: JSON.stringify(req) });
  if (!r.ok) throw new Error("Failed to create run");
  return r.json();
}

export async function abortRun(id: string): Promise<void> {
  await fetchWithAuth(`/runs/${id}`, { method: "DELETE" });
}

export async function getRunEvents(id: string): Promise<AgentEventPayload[]> {
  const r = await fetchWithAuth(`/runs/${id}/events`);
  if (!r.ok) throw new Error("Failed to fetch events");
  return r.json();
}

export async function getApiKeys(): Promise<ApiKeyStatus[]> {
  const r = await fetchWithAuth("/api-keys");
  if (!r.ok) throw new Error("Failed to fetch API keys");
  return r.json();
}

export async function upsertApiKey(provider: string, key: string): Promise<ApiKeyStatus> {
  const r = await fetchWithAuth("/api-keys", { method: "POST", body: JSON.stringify({ provider, key }) });
  if (!r.ok) throw new Error("Failed to save API key");
  return r.json();
}

export async function deleteApiKey(provider: string): Promise<void> {
  await fetchWithAuth(`/api-keys/${provider}`, { method: "DELETE" });
}

export async function getUsers(): Promise<User[]> {
  const r = await fetchWithAuth("/users");
  if (!r.ok) throw new Error("Failed to fetch users");
  return r.json();
}

export async function inviteUser(email: string): Promise<void> {
  await fetchWithAuth("/auth/invite", { method: "POST", body: JSON.stringify({ email }) });
}

export async function updateUserRole(id: string, role: string): Promise<User> {
  const r = await fetchWithAuth(`/users/${id}`, { method: "PATCH", body: JSON.stringify({ role }) });
  if (!r.ok) throw new Error("Failed to update user");
  return r.json();
}
```

- [ ] **Step 3: Create `frontend/lib/auth.ts`**

```typescript
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: "jwt" },
  providers: [
    CredentialsProvider({
      name: "Email",
      credentials: { email: { type: "email" }, password: { type: "password" } },
      async authorize(credentials) {
        if (!credentials) return null;
        const r = await fetch(`${API}/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: credentials.email, password: credentials.password }),
        });
        if (!r.ok) return null;
        const { access_token } = await r.json();
        const me = await fetch(`${API}/auth/me`, {
          headers: { Authorization: `Bearer ${access_token}` },
        });
        const user = await me.json();
        return { ...user, accessToken: access_token };
      },
    }),
    ...(process.env.GOOGLE_CLIENT_ID
      ? [
          GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
          }),
        ]
      : []),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.accessToken = (user as { accessToken?: string }).accessToken;
        token.role = (user as { role?: string }).role;
      }
      return token;
    },
    async session({ session, token }) {
      (session as { accessToken?: string }).accessToken = token.accessToken as string;
      if (session.user) (session.user as { role?: string }).role = token.role as string;
      return session;
    },
  },
  pages: { signIn: "/login" },
};
```

- [ ] **Step 4: Create `frontend/lib/websocket.ts`**

```typescript
"use client";
import { useEffect, useRef, useCallback } from "react";
import type { AgentEventPayload } from "./types";

const WS_BASE = process.env.NEXT_PUBLIC_API_URL?.replace("http", "ws") ?? "ws://localhost:8000";

export function useAgentStream(runId: string, onEvent: (e: AgentEventPayload) => void) {
  const wsRef = useRef<WebSocket | null>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const connect = useCallback(() => {
    const ws = new WebSocket(`${WS_BASE}/ws/runs/${runId}`);
    wsRef.current = ws;
    ws.onmessage = (msg) => {
      try {
        onEventRef.current(JSON.parse(msg.data) as AgentEventPayload);
      } catch {}
    };
    ws.onclose = (e) => {
      if (e.code !== 1000) setTimeout(connect, 2000); // reconnect unless intentional close
    };
  }, [runId]);

  useEffect(() => {
    connect();
    const ping = setInterval(() => wsRef.current?.send("ping"), 30000);
    return () => {
      clearInterval(ping);
      wsRef.current?.close(1000);
    };
  }, [connect]);
}
```

- [ ] **Step 5: Create NextAuth API route**

```bash
mkdir -p frontend/app/api/auth/\[...nextauth\]
```

Create `frontend/app/api/auth/[...nextauth]/route.ts`:

```typescript
import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
```

- [ ] **Step 6: Commit**

```bash
git add frontend/lib/ frontend/app/api/
git commit -m "feat: API client, TypeScript types, NextAuth config, WebSocket hook"
```

---

### Task 3: Root layout, TopNav, middleware, and login page

**Files:**
- Create: `frontend/middleware.ts`
- Modify: `frontend/app/layout.tsx`
- Create: `frontend/components/layout/TopNav.tsx`
- Create: `frontend/app/login/page.tsx`
- Create: `frontend/app/page.tsx`

- [ ] **Step 1: Create `frontend/middleware.ts`**

```typescript
export { default } from "next-auth/middleware";

export const config = {
  matcher: ["/((?!login|register|api/auth).*)"],
};
```

- [ ] **Step 2: Update `frontend/app/layout.tsx`**

```typescript
import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = { title: "AgentFloor", description: "AI Trading Agent Command Center" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} ${mono.variable} bg-navy-900 text-slate-200 font-mono min-h-screen`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

Create `frontend/app/providers.tsx`:

```typescript
"use client";
import { SessionProvider } from "next-auth/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

export function Providers({ children }: { children: React.ReactNode }) {
  const [qc] = useState(() => new QueryClient());
  return (
    <SessionProvider>
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    </SessionProvider>
  );
}
```

- [ ] **Step 3: Create `frontend/app/page.tsx`**

```typescript
import { redirect } from "next/navigation";
export default function Home() { redirect("/runs"); }
```

- [ ] **Step 4: Create `frontend/components/layout/TopNav.tsx`**

```typescript
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";

const NAV = [
  { href: "/runs/new", label: "New Run" },
  { href: "/runs", label: "History" },
  { href: "/settings", label: "Settings" },
];

export function TopNav() {
  const path = usePathname();
  const { data: session } = useSession();
  const isActive = (href: string) => path === href || (href !== "/runs/new" && path.startsWith(href) && href !== "/runs/new");

  return (
    <nav className="bg-navy-700 border-b border-slate-800 px-4 py-2 flex items-center gap-4 sticky top-0 z-50">
      <Link href="/runs" className="text-blue-400 font-bold text-sm tracking-widest mr-2">⬡ AgentFloor</Link>
      <span className="text-slate-700 text-lg">|</span>
      {NAV.map(({ href, label }) => (
        <Link
          key={href}
          href={href}
          className={`text-xs px-1 pb-0.5 ${isActive(href) ? "text-blue-400 border-b border-blue-400" : "text-slate-500 hover:text-slate-300"}`}
        >
          {label}
        </Link>
      ))}
      <div className="ml-auto flex items-center gap-3">
        {(session?.user as { role?: string })?.role === "admin" && (
          <span className="bg-blue-900 text-blue-300 text-xs px-1.5 py-0.5 rounded">ADMIN</span>
        )}
        <span className="text-slate-500 text-xs">{session?.user?.email}</span>
        <button onClick={() => signOut()} className="text-slate-600 text-xs hover:text-slate-400">Sign out</button>
      </div>
    </nav>
  );
}
```

- [ ] **Step 5: Create `frontend/app/login/page.tsx`**

```typescript
"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const res = await signIn("credentials", { email, password, redirect: false });
    if (res?.error) setError("Invalid email or password");
    else router.push("/runs");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-navy-900">
      <div className="w-80 bg-navy-700 border border-slate-800 rounded-lg p-8">
        <div className="text-blue-400 font-bold text-lg tracking-widest mb-6 text-center">⬡ AgentFloor</div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="text-slate-400 text-xs uppercase tracking-wide block mb-1">Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
              className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500" />
          </div>
          <div>
            <label className="text-slate-400 text-xs uppercase tracking-wide block mb-1">Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
              className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500" />
          </div>
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white rounded px-4 py-2 text-sm font-medium">
            Sign In
          </button>
        </form>
        <div className="mt-4 flex items-center gap-2">
          <div className="flex-1 h-px bg-slate-700" />
          <span className="text-slate-600 text-xs">or</span>
          <div className="flex-1 h-px bg-slate-700" />
        </div>
        <button onClick={() => signIn("google", { callbackUrl: "/runs" })}
          className="mt-4 w-full bg-slate-800 border border-slate-700 hover:border-slate-500 text-slate-300 rounded px-4 py-2 text-sm">
          Continue with Google
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Create `frontend/app/register/page.tsx`** — invite sign-up flow

```typescript
"use client";
import { useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { signIn } from "next-auth/react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export default function RegisterPage() {
  const params = useSearchParams();
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const inviteToken = params.get("token");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const r = await fetch(`${API}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password, invite_token: inviteToken }),
    });
    if (!r.ok) { setError("Registration failed. The invite link may have expired."); return; }
    await signIn("credentials", { email, password, callbackUrl: "/runs" });
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-navy-900">
      <div className="w-80 bg-navy-700 border border-slate-800 rounded-lg p-8">
        <div className="text-blue-400 font-bold text-lg tracking-widest mb-2 text-center">⬡ AgentFloor</div>
        <p className="text-slate-500 text-xs text-center mb-6">Create your account</p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {[["Name", "text", name, setName], ["Email", "email", email, setEmail], ["Password", "password", password, setPassword]].map(([label, type, value, setter]) => (
            <div key={label as string}>
              <label className="text-slate-400 text-xs uppercase tracking-wide block mb-1">{label as string}</label>
              <input type={type as string} value={value as string} onChange={e => (setter as (v: string) => void)(e.target.value)} required
                className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500" />
            </div>
          ))}
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white rounded px-4 py-2 text-sm font-medium">Create Account</button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Update all page layouts to include TopNav**

In each authenticated page (not login), wrap content:
```typescript
import { TopNav } from "@/components/layout/TopNav";
// wrap page content in:
<><TopNav /><main className="p-6">{/* content */}</main></>
```

- [ ] **Step 7: Start dev server and verify login works**

```bash
cd frontend && cp .env.local.example .env.local
# fill in NEXTAUTH_SECRET and NEXT_PUBLIC_API_URL
npm run dev
```

Visit `http://localhost:3000` — should redirect to `/login`. Sign in with a registered account — should redirect to `/runs`.

- [ ] **Step 8: Commit**

```bash
git add frontend/
git commit -m "feat: root layout, TopNav, auth middleware, login page"
```

---

### Task 4: Run History page

**Files:**
- Create: `frontend/components/runs/RunFilters.tsx`
- Create: `frontend/components/runs/RunTable.tsx`
- Create: `frontend/app/runs/page.tsx`

- [ ] **Step 1: Create `frontend/components/runs/RunFilters.tsx`**

```typescript
"use client";
import { useRouter, useSearchParams } from "next/navigation";

export function RunFilters() {
  const router = useRouter();
  const params = useSearchParams();

  function update(key: string, value: string) {
    const p = new URLSearchParams(params.toString());
    value ? p.set(key, value) : p.delete(key);
    router.push(`/runs?${p.toString()}`);
  }

  return (
    <div className="flex gap-3 items-center mb-4 flex-wrap">
      <input
        placeholder="Search ticker or label..."
        defaultValue={params.get("ticker") ?? ""}
        onChange={e => update("ticker", e.target.value)}
        className="bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-xs text-slate-200 w-48 focus:outline-none focus:border-blue-500"
      />
      <select defaultValue={params.get("verdict") ?? ""} onChange={e => update("verdict", e.target.value)}
        className="bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-xs text-slate-400">
        <option value="">Verdict: All</option>
        <option value="buy">BUY</option>
        <option value="sell">SELL</option>
        <option value="hold">HOLD</option>
      </select>
    </div>
  );
}
```

- [ ] **Step 2: Create `frontend/components/runs/RunTable.tsx`**

```typescript
"use client";
import Link from "next/link";
import type { Run } from "@/lib/types";

const VERDICT_STYLE: Record<string, string> = {
  buy: "bg-emerald-950 text-emerald-400",
  sell: "bg-red-950 text-red-400",
  hold: "bg-amber-950 text-amber-400",
};

export function RunTable({ runs }: { runs: Run[] }) {
  if (runs.length === 0) return <p className="text-slate-600 text-sm py-8 text-center">No runs yet. Launch one to get started.</p>;

  return (
    <div className="border border-slate-800 rounded-lg overflow-hidden">
      <div className="grid grid-cols-[80px_1fr_100px_80px_80px_90px_80px_80px] text-xs text-slate-600 uppercase tracking-wide px-4 py-2 bg-navy-800 border-b border-slate-800">
        <span>Ticker</span><span>Label</span><span>Date</span><span>Verdict</span>
        <span>Depth</span><span>Provider</span><span>By</span><span>Duration</span>
      </div>
      {runs.map(run => {
        const duration = run.completed_at && run.started_at
          ? Math.round((new Date(run.completed_at).getTime() - new Date(run.started_at).getTime()) / 1000)
          : null;
        return (
          <Link key={run.id} href={`/runs/${run.id}`}
            className={`grid grid-cols-[80px_1fr_100px_80px_80px_90px_80px_80px] px-4 py-2.5 border-b border-slate-900 hover:bg-navy-700 transition-colors ${run.status === "aborted" ? "opacity-50" : ""}`}>
            <span className="text-slate-100 font-bold">{run.ticker}</span>
            <span className="text-slate-500 text-xs truncate">{run.label ?? "—"}</span>
            <span className="text-slate-400 text-xs">{run.analysis_date}</span>
            <span>
              {run.verdict
                ? <span className={`text-xs px-1.5 py-0.5 rounded ${VERDICT_STYLE[run.verdict] ?? "bg-slate-800 text-slate-500"}`}>{run.verdict.toUpperCase()}</span>
                : <span className="text-xs bg-slate-800 text-slate-500 px-1.5 py-0.5 rounded">{run.status.toUpperCase()}</span>
              }
            </span>
            <span className="text-slate-500 text-xs capitalize">{run.depth}</span>
            <span className="text-slate-500 text-xs">{run.llm_provider}</span>
            <span className="text-slate-400 text-xs">{run.created_by.slice(0, 8)}</span>
            <span className="text-slate-500 text-xs">{duration ? `${Math.floor(duration / 60)}m ${duration % 60}s` : "—"}</span>
          </Link>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: Create `frontend/app/runs/page.tsx`**

```typescript
"use client";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { TopNav } from "@/components/layout/TopNav";
import { RunTable } from "@/components/runs/RunTable";
import { RunFilters } from "@/components/runs/RunFilters";
import { getRuns } from "@/lib/api";

export default function RunsPage() {
  const params = useSearchParams();
  const ticker = params.get("ticker") ?? undefined;
  const verdict = params.get("verdict") ?? undefined;

  const { data: runs = [], isLoading } = useQuery({
    queryKey: ["runs", ticker, verdict],
    queryFn: () => getRuns({ ticker, verdict }),
  });

  return (
    <>
      <TopNav />
      <main className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-slate-100 font-bold text-lg">Run History</h1>
          <Link href="/runs/new" className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded text-sm">
            + New Run
          </Link>
        </div>
        <RunFilters />
        {isLoading ? <p className="text-slate-600 text-sm">Loading...</p> : <RunTable runs={runs} />}
      </main>
    </>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/components/runs/RunFilters.tsx frontend/components/runs/RunTable.tsx frontend/app/runs/page.tsx
git commit -m "feat: Run History page with filters and sortable table"
```

---

### Task 5: Launch Run page

**Files:**
- Create: `frontend/components/runs/RunForm.tsx`
- Create: `frontend/app/runs/new/page.tsx`

- [ ] **Step 1: Create `frontend/components/runs/RunForm.tsx`**

```typescript
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createRun, getApiKeys } from "@/lib/api";
import type { CreateRunRequest } from "@/lib/types";

const DEPTH_OPTIONS = [
  { value: "quick", label: "Quick", desc: "~5 min · 1 debate round" },
  { value: "standard", label: "Standard", desc: "~15 min · 3 debate rounds" },
  { value: "deep", label: "Deep", desc: "~30 min · 5 debate rounds" },
];
const ANALYSTS = ["fundamentals", "sentiment", "news", "technical"];

export function RunForm({ recentRuns }: { recentRuns: { ticker: string; label?: string }[] }) {
  const router = useRouter();
  const [ticker, setTicker] = useState("");
  const [date, setDate] = useState(new Date(Date.now() - 86400000).toISOString().split("T")[0]);
  const [provider, setProvider] = useState("");
  const [model, setModel] = useState("");
  const [depth, setDepth] = useState("standard");
  const [analysts, setAnalysts] = useState<string[]>(ANALYSTS);
  const [label, setLabel] = useState("");

  const { data: apiKeys = [] } = useQuery({ queryKey: ["api-keys"], queryFn: getApiKeys });
  const validProviders = apiKeys.filter(k => k.is_valid);

  const mutation = useMutation({
    mutationFn: (req: CreateRunRequest) => createRun(req),
    onSuccess: (run) => router.push(`/runs/${run.id}/live`),
  });

  function toggleAnalyst(a: string) {
    setAnalysts(prev => prev.includes(a) ? prev.filter(x => x !== a) : [...prev, a]);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    mutation.mutate({ ticker: ticker.toUpperCase(), analysis_date: date, llm_provider: provider, llm_model: model, depth, analysts, label: label || undefined });
  }

  return (
    <div className="flex gap-6">
      <form onSubmit={handleSubmit} className="flex-1 bg-navy-700 border border-slate-800 rounded-lg p-6 flex flex-col gap-5">
        <p className="text-slate-500 text-xs">Research only — not financial advice. No trades will be executed.</p>

        <div className="flex gap-4">
          <div className="flex-1">
            <label className="text-slate-400 text-xs uppercase tracking-wide block mb-1.5">Ticker Symbol</label>
            <input value={ticker} onChange={e => setTicker(e.target.value.toUpperCase())} required placeholder="AAPL"
              className="w-full bg-slate-800 border border-slate-700 focus:border-blue-500 rounded px-3 py-2 text-sm text-slate-100 uppercase focus:outline-none" />
          </div>
          <div className="flex-1">
            <label className="text-slate-400 text-xs uppercase tracking-wide block mb-1.5">Analysis Date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} required max={new Date(Date.now() - 86400000).toISOString().split("T")[0]}
              className="w-full bg-slate-800 border border-slate-700 focus:border-blue-500 rounded px-3 py-2 text-sm text-slate-100 focus:outline-none" />
          </div>
        </div>

        <div>
          <label className="text-slate-400 text-xs uppercase tracking-wide block mb-1.5">LLM Provider</label>
          <div className="flex gap-2 flex-wrap">
            {validProviders.length === 0 && <p className="text-slate-600 text-xs">No API keys configured. Add them in Settings.</p>}
            {validProviders.map(k => (
              <button key={k.provider} type="button" onClick={() => setProvider(k.provider)}
                className={`px-3 py-1.5 rounded text-xs border ${provider === k.provider ? "bg-blue-950 border-blue-500 text-blue-300" : "bg-slate-800 border-slate-700 text-slate-400"}`}>
                {k.provider}
              </button>
            ))}
          </div>
          {provider && (
            <input value={model} onChange={e => setModel(e.target.value)} placeholder="e.g. gpt-4o"
              className="mt-2 w-full bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-blue-500" />
          )}
        </div>

        <div>
          <label className="text-slate-400 text-xs uppercase tracking-wide block mb-1.5">Research Depth</label>
          <div className="flex gap-3">
            {DEPTH_OPTIONS.map(opt => (
              <button key={opt.value} type="button" onClick={() => setDepth(opt.value)}
                className={`flex-1 px-3 py-2 rounded border text-left ${depth === opt.value ? "bg-blue-950 border-blue-500" : "bg-slate-800 border-slate-700"}`}>
                <div className={`text-xs font-medium ${depth === opt.value ? "text-blue-300" : "text-slate-400"}`}>{opt.label}</div>
                <div className="text-slate-600 text-xs mt-0.5">{opt.desc}</div>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-slate-400 text-xs uppercase tracking-wide block mb-1.5">Analysts</label>
          <div className="flex gap-2 flex-wrap">
            {ANALYSTS.map(a => (
              <button key={a} type="button" onClick={() => toggleAnalyst(a)}
                className={`px-3 py-1 rounded text-xs border capitalize ${analysts.includes(a) ? "bg-emerald-950 border-emerald-600 text-emerald-400" : "bg-slate-800 border-slate-700 text-slate-500"}`}>
                {analysts.includes(a) ? "✓ " : ""}{a}
              </button>
            ))}
            <span className="text-slate-600 text-xs self-center">Bull/Bear/Trader always included</span>
          </div>
        </div>

        <div>
          <label className="text-slate-400 text-xs uppercase tracking-wide block mb-1.5">Label <span className="text-slate-600">(optional)</span></label>
          <input value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. pre-earnings deep dive"
            className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500" />
        </div>

        <div className="flex items-center gap-4">
          <button type="submit" disabled={!ticker || !provider || !model || mutation.isPending}
            className="bg-gradient-to-r from-blue-600 to-purple-600 disabled:opacity-40 text-white px-6 py-2.5 rounded font-medium text-sm">
            {mutation.isPending ? "Starting..." : "▶ Launch Run"}
          </button>
          {provider && depth && <span className="text-slate-500 text-xs">Est. {DEPTH_OPTIONS.find(d => d.value === depth)?.desc}</span>}
        </div>
        {mutation.isError && <p className="text-red-400 text-xs">{String(mutation.error)}</p>}
      </form>

      <div className="w-44 bg-navy-800 border border-slate-800 rounded-lg p-4">
        <p className="text-slate-600 text-xs uppercase tracking-wide mb-3">Recent Runs</p>
        {recentRuns.length === 0 && <p className="text-slate-700 text-xs">No runs yet</p>}
        {recentRuns.map((r, i) => (
          <div key={i} className="mb-2 bg-navy-700 rounded p-2">
            <p className="text-slate-100 text-xs font-bold">{r.ticker}</p>
            <p className="text-slate-600 text-xs truncate">{r.label ?? "—"}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `frontend/app/runs/new/page.tsx`**

```typescript
import { TopNav } from "@/components/layout/TopNav";
import { RunForm } from "@/components/runs/RunForm";
import { getRuns } from "@/lib/api";

export default async function NewRunPage() {
  const runs = await getRuns().catch(() => []);
  return (
    <>
      <TopNav />
      <main className="p-6 max-w-4xl">
        <h1 className="text-slate-100 font-bold text-lg mb-6">Configure New Analysis Run</h1>
        <RunForm recentRuns={runs.slice(0, 5)} />
      </main>
    </>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/components/runs/RunForm.tsx frontend/app/runs/new/
git commit -m "feat: Launch Run page with form validation"
```

---

### Task 6: Live Monitor page

**Files:**
- Create: `frontend/components/runs/AgentSidebar.tsx`
- Create: `frontend/components/runs/AgentFeed.tsx`
- Create: `frontend/components/runs/PipelinePanel.tsx`
- Create: `frontend/app/runs/[id]/live/page.tsx`

- [ ] **Step 1: Create `frontend/components/runs/AgentSidebar.tsx`**

```typescript
"use client";
import type { Run } from "@/lib/types";

const AGENT_LABELS: Record<string, string> = {
  fundamentals_analyst: "Fundamentals",
  sentiment_analyst: "Sentiment",
  news_analyst: "News",
  technical_analyst: "Technical",
  bull_researcher: "Bull Researcher",
  bear_researcher: "Bear Researcher",
  trader: "Trader",
  risk_manager: "Risk Manager",
};

type AgentStatus = "waiting" | "active" | "completed" | "error";

export function AgentSidebar({ run, agentStatuses }: { run: Run; agentStatuses: Record<string, AgentStatus> }) {
  const dot: Record<AgentStatus, string> = {
    waiting: "bg-slate-700",
    active: "bg-amber-400 animate-pulse",
    completed: "bg-emerald-500",
    error: "bg-red-500",
  };

  return (
    <div className="w-44 bg-navy-800 border-r border-slate-800 p-3 flex flex-col gap-1 overflow-y-auto shrink-0">
      <p className="text-slate-600 text-xs uppercase tracking-wide mb-2 px-1">Agents</p>
      {Object.entries(AGENT_LABELS).map(([key, label]) => {
        const status = agentStatuses[key] ?? "waiting";
        return (
          <div key={key} className={`rounded px-2 py-2 border ${status === "active" ? "bg-blue-950 border-blue-700" : "bg-navy-700 border-transparent"}`}>
            <div className="flex items-center gap-1.5 mb-0.5">
              <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot[status]}`} />
              <span className={`text-xs ${status === "active" ? "text-blue-300 font-medium" : status === "completed" ? "text-emerald-400" : "text-slate-500"}`}>{label}</span>
            </div>
            <p className="text-slate-600 text-xs pl-3">{status === "completed" ? "✓ done" : status === "active" ? "running..." : status === "error" ? "error" : "waiting"}</p>
          </div>
        );
      })}
      <div className="mt-auto border-t border-slate-800 pt-3 text-xs text-slate-500 space-y-0.5 px-1">
        <div><span className="text-slate-600">Ticker:</span> {run.ticker}</div>
        <div><span className="text-slate-600">Date:</span> {run.analysis_date}</div>
        <div><span className="text-slate-600">LLM:</span> {run.llm_model}</div>
        <div><span className="text-slate-600">Depth:</span> {run.depth}</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `frontend/components/runs/AgentFeed.tsx`**

```typescript
"use client";
import { useEffect, useRef } from "react";

export interface FeedEntry {
  agent: string;
  type: "started" | "token" | "completed" | "error";
  content: string;
  isActive: boolean;
}

export function AgentFeed({ entries, autoScroll }: { entries: FeedEntry[]; autoScroll: boolean }) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoScroll) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries, autoScroll]);

  const grouped: { agent: string; lines: FeedEntry[]; completed: boolean }[] = [];
  for (const entry of entries) {
    const last = grouped[grouped.length - 1];
    if (last && last.agent === entry.agent && !last.completed) {
      last.lines.push(entry);
      if (entry.type === "completed") last.completed = true;
    } else {
      grouped.push({ agent: entry.agent, lines: [entry], completed: entry.type === "completed" });
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-3 font-mono text-xs">
      {grouped.map((group, i) => {
        const isActive = !group.completed;
        const text = group.lines.filter(l => l.type === "token").map(l => l.content).join("") ||
                     group.lines.find(l => l.type === "completed")?.content || "";
        return (
          <div key={i} className={`border-l-2 pl-3 py-1 rounded-r ${isActive ? "border-amber-500 bg-slate-900" : "border-emerald-700 bg-navy-800"}`}>
            <div className={`font-semibold mb-1 ${isActive ? "text-amber-400" : "text-emerald-400"}`}>
              {isActive ? "⟳" : "✓"} {group.agent}
            </div>
            <div className="text-slate-400 leading-relaxed whitespace-pre-wrap">{text}<span className={isActive ? "animate-pulse" : "hidden"}>█</span></div>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
```

- [ ] **Step 3: Create `frontend/components/runs/PipelinePanel.tsx`**

```typescript
"use client";
import type { Run } from "@/lib/types";

const PIPELINE = ["fundamentals_analyst","sentiment_analyst","news_analyst","technical_analyst","bull_researcher","bear_researcher","trader","risk_manager"];
const LABELS: Record<string, string> = {
  fundamentals_analyst:"Fundamentals",sentiment_analyst:"Sentiment",news_analyst:"News",
  technical_analyst:"Technical",bull_researcher:"Bull Research",bear_researcher:"Bear Research",
  trader:"Trader",risk_manager:"Risk Mgr",
};

type AgentStatus = "waiting"|"active"|"completed"|"error";

export function PipelinePanel({ run, agentStatuses, onAbort, onScrollToLive }:
  { run: Run; agentStatuses: Record<string,AgentStatus>; onAbort: ()=>void; onScrollToLive: ()=>void }) {
  const completed = Object.values(agentStatuses).filter(s => s === "completed").length;

  return (
    <div className="w-40 bg-navy-800 border-l border-slate-800 p-3 flex flex-col shrink-0">
      <p className="text-slate-600 text-xs uppercase tracking-wide mb-2">Progress</p>
      <div className="bg-slate-800 rounded h-1.5 mb-1 overflow-hidden">
        <div className="bg-gradient-to-r from-blue-500 to-purple-500 h-full rounded transition-all" style={{ width: `${(completed / 8) * 100}%` }} />
      </div>
      <p className="text-slate-400 text-xs mb-4">{completed} of 8 agents</p>

      <p className="text-slate-600 text-xs uppercase tracking-wide mb-2">Pipeline</p>
      <div className="flex flex-col gap-1.5 mb-auto">
        {PIPELINE.map(key => {
          const s = agentStatuses[key] ?? "waiting";
          return (
            <div key={key} className="flex items-center gap-1.5 text-xs">
              <span className={s==="completed"?"text-emerald-400":s==="active"?"text-amber-400":s==="error"?"text-red-400":"text-slate-700"}>
                {s==="completed"?"✓":s==="active"?"⟳":s==="error"?"✕":"○"}
              </span>
              <span className={s==="active"?"text-amber-300 font-medium":s==="completed"?"text-slate-400":"text-slate-700"}>{LABELS[key]}</span>
            </div>
          );
        })}
      </div>

      <div className="border-t border-slate-800 pt-3 flex flex-col gap-2 mt-3">
        <button onClick={onScrollToLive} className="bg-blue-950 text-blue-400 rounded px-2 py-1.5 text-xs hover:bg-blue-900">↓ Scroll to live</button>
        {run.status === "running" && (
          <button onClick={onAbort} className="bg-red-950 text-red-400 rounded px-2 py-1.5 text-xs hover:bg-red-900">■ Abort run</button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create `frontend/app/runs/[id]/live/page.tsx`**

```typescript
"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { TopNav } from "@/components/layout/TopNav";
import { AgentSidebar } from "@/components/runs/AgentSidebar";
import { AgentFeed, type FeedEntry } from "@/components/runs/AgentFeed";
import { PipelinePanel } from "@/components/runs/PipelinePanel";
import { useAgentStream } from "@/lib/websocket";
import { getRun, abortRun } from "@/lib/api";
import type { AgentEventPayload } from "@/lib/types";

type AgentStatus = "waiting"|"active"|"completed"|"error";

export default function LivePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const [entries, setEntries] = useState<FeedEntry[]>([]);
  const [agentStatuses, setAgentStatuses] = useState<Record<string, AgentStatus>>({});
  const [autoScroll, setAutoScroll] = useState(true);
  const [wsStatus, setWsStatus] = useState<"connecting"|"connected"|"disconnected">("connecting");
  const feedRef = useRef<HTMLDivElement>(null);

  const { data: run } = useQuery({ queryKey: ["run", id], queryFn: () => getRun(id), refetchInterval: 5000 });

  const handleEvent = useCallback((e: AgentEventPayload) => {
    if (e.type === "run_completed") {
      qc.invalidateQueries({ queryKey: ["run", id] });
      router.push(`/runs/${id}`);
      return;
    }
    if (e.type === "started" && e.agent) {
      setAgentStatuses(prev => ({ ...prev, [e.agent!]: "active" }));
    }
    if (e.type === "completed" && e.agent) {
      setAgentStatuses(prev => ({ ...prev, [e.agent!]: "completed" }));
    }
    if (e.type === "error" && e.agent) {
      setAgentStatuses(prev => ({ ...prev, [e.agent!]: "error" }));
    }
    if (e.type === "token" || e.type === "started" || e.type === "completed") {
      setEntries(prev => [...prev, {
        agent: e.agent ?? "system",
        type: e.type as FeedEntry["type"],
        content: e.token ?? e.summary ?? "",
        isActive: e.type !== "completed",
      }]);
    }
    setWsStatus("connected");
  }, [id, router, qc]);

  useAgentStream(id, handleEvent);

  if (!run) return <><TopNav /><main className="p-6 text-slate-500 text-sm">Loading...</main></>;

  return (
    <>
      <TopNav />
      <div ref={feedRef} className="flex h-[calc(100vh-41px)]">
        <AgentSidebar run={run} agentStatuses={agentStatuses} />
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="border-b border-slate-800 px-4 py-2 flex items-center justify-between">
            <span className="text-slate-300 text-xs font-medium">{run.ticker} — Live Agent Feed</span>
            <span className="text-slate-600 text-xs">scroll up to review ↑</span>
          </div>
          <div onScroll={e => setAutoScroll((e.target as HTMLElement).scrollHeight - (e.target as HTMLElement).scrollTop < 200)}>
            <AgentFeed entries={entries} autoScroll={autoScroll} />
          </div>
        </div>
        <PipelinePanel
          run={run}
          agentStatuses={agentStatuses}
          onAbort={() => abortRun(id)}
          onScrollToLive={() => { setAutoScroll(true); feedRef.current?.scrollTo(0, 9999999); }}
        />
      </div>
      <div className="bg-navy-700 border-t border-slate-800 px-4 py-1.5 flex gap-4 text-xs text-slate-600">
        <span>Run: {id.slice(0, 8)}</span>
        <span>·</span>
        <span className={wsStatus === "connected" ? "text-amber-400" : "text-slate-600"}>● {wsStatus}</span>
      </div>
    </>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add frontend/components/runs/AgentSidebar.tsx frontend/components/runs/AgentFeed.tsx frontend/components/runs/PipelinePanel.tsx frontend/app/runs/
git commit -m "feat: Live Monitor page with real-time WebSocket agent feed"
```

---

### Task 7: Results Viewer page

**Files:**
- Create: `frontend/components/runs/TraderDecision.tsx`
- Create: `frontend/components/runs/AnalystReports.tsx`
- Create: `frontend/components/runs/BullBearDebate.tsx`
- Create: `frontend/app/runs/[id]/page.tsx`

- [ ] **Step 1: Create `frontend/components/runs/TraderDecision.tsx`**

```typescript
import type { Report } from "@/lib/types";

const VERDICT_STYLE = {
  buy: { bg: "bg-emerald-950 border-emerald-700", text: "text-emerald-400" },
  sell: { bg: "bg-red-950 border-red-700", text: "text-red-400" },
  hold: { bg: "bg-amber-950 border-amber-700", text: "text-amber-400" },
};

export function TraderDecision({ report }: { report: Report }) {
  const style = VERDICT_STYLE[report.verdict] ?? VERDICT_STYLE.hold;
  return (
    <div className={`rounded-lg border p-5 mb-6 ${style.bg}`}>
      <div className="flex items-center gap-3 mb-3">
        <span className="bg-emerald-700 text-black text-xs font-bold px-2 py-0.5 rounded">TRADER DECISION</span>
        <span className="text-slate-500 text-xs">Research only — not financial advice</span>
      </div>
      <div className={`text-4xl font-bold mb-2 ${style.text}`}>{report.verdict.toUpperCase()}</div>
      <p className="text-slate-300 text-sm leading-relaxed mb-4">{report.trader_decision}</p>
      <div className="flex gap-6 text-xs">
        {report.suggested_entry && <div><span className="text-slate-500">Entry:</span> <span className="text-slate-200">{report.suggested_entry}</span></div>}
        {report.suggested_stop && <div><span className="text-slate-500">Stop:</span> <span className="text-red-400">{report.suggested_stop}</span></div>}
        {report.suggested_target && <div><span className="text-slate-500">Target:</span> <span className="text-emerald-400">{report.suggested_target}</span></div>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `frontend/components/runs/AnalystReports.tsx`**

```typescript
export function AnalystReports({ rawReport }: { rawReport: Record<string, unknown> }) {
  const analysts = [
    { key: "fundamentals_analyst", label: "Fundamentals Analyst" },
    { key: "sentiment_analyst", label: "Sentiment Analyst" },
    { key: "news_analyst", label: "News Analyst" },
    { key: "technical_analyst", label: "Technical Analyst" },
  ];
  return (
    <div className="space-y-3">
      {analysts.map(({ key, label }) => {
        const content = String(rawReport[key] ?? rawReport[`${key}_report`] ?? "No report available.");
        return (
          <div key={key} className="bg-navy-800 border border-slate-800 rounded-lg overflow-hidden">
            <div className="bg-navy-700 px-4 py-2 flex items-center gap-2 border-b border-slate-800">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span className="text-blue-300 text-xs font-semibold">{label}</span>
            </div>
            <div className="px-4 py-3 text-slate-400 text-xs leading-relaxed whitespace-pre-wrap">{content}</div>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: Create `frontend/components/runs/BullBearDebate.tsx`**

```typescript
export function BullBearDebate({ rawReport }: { rawReport: Record<string, unknown> }) {
  const bull = String(rawReport["bull_researcher"] ?? rawReport["bull_researcher_report"] ?? "No bull report.");
  const bear = String(rawReport["bear_researcher"] ?? rawReport["bear_researcher_report"] ?? "No bear report.");
  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="bg-emerald-950 border border-emerald-900 rounded-lg p-4">
        <div className="text-emerald-400 font-semibold text-xs mb-2">🐂 Bull Researcher</div>
        <p className="text-slate-400 text-xs leading-relaxed whitespace-pre-wrap">{bull}</p>
      </div>
      <div className="bg-red-950 border border-red-900 rounded-lg p-4">
        <div className="text-red-400 font-semibold text-xs mb-2">🐻 Bear Researcher</div>
        <p className="text-slate-400 text-xs leading-relaxed whitespace-pre-wrap">{bear}</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create `frontend/app/runs/[id]/page.tsx`**

```typescript
"use client";
import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { TopNav } from "@/components/layout/TopNav";
import { TraderDecision } from "@/components/runs/TraderDecision";
import { AnalystReports } from "@/components/runs/AnalystReports";
import { BullBearDebate } from "@/components/runs/BullBearDebate";
import { getRun, getRunEvents } from "@/lib/api";

const TABS = ["Analyst Reports", "Bull vs Bear", "Risk Assessment", "Raw Agent Log"];

export default function ResultsPage() {
  const { id } = useParams<{ id: string }>();
  const [tab, setTab] = useState(0);
  const { data: run } = useQuery({ queryKey: ["run", id], queryFn: () => getRun(id) });
  const { data: events = [] } = useQuery({ queryKey: ["events", id], queryFn: () => getRunEvents(id), enabled: tab === 3 });

  if (!run) return <><TopNav /><main className="p-6 text-slate-500 text-sm">Loading...</main></>;

  const report = (run as { report?: Record<string, unknown> }).report;
  const rawReport = report?.raw_report as Record<string, unknown> ?? {};

  return (
    <>
      <TopNav />
      <main className="p-6">
        <div className="flex items-center gap-4 mb-6">
          <div>
            <div className="flex items-baseline gap-3">
              <span className="text-slate-100 text-2xl font-bold">{run.ticker}</span>
              <span className="text-slate-500 text-sm">{run.analysis_date} · {run.llm_model} · {run.depth}</span>
            </div>
          </div>
          <div className="ml-auto flex gap-2">
            <Link href={`/runs/${id}/live`} className="bg-slate-800 border border-slate-700 text-slate-400 px-3 py-1.5 rounded text-xs">View Log</Link>
            <Link href="/runs/new" className="bg-slate-800 border border-slate-700 text-slate-400 px-3 py-1.5 rounded text-xs">⟳ Re-run</Link>
          </div>
        </div>

        {report && <TraderDecision report={report as unknown as import("@/lib/types").Report} />}

        <div className="flex border-b border-slate-800 mb-4">
          {TABS.map((t, i) => (
            <button key={t} onClick={() => setTab(i)}
              className={`px-4 py-2 text-xs border-b-2 -mb-px ${tab === i ? "text-blue-400 border-blue-400" : "text-slate-500 border-transparent hover:text-slate-300"}`}>
              {t}
            </button>
          ))}
        </div>

        {tab === 0 && <AnalystReports rawReport={rawReport} />}
        {tab === 1 && <BullBearDebate rawReport={rawReport} />}
        {tab === 2 && <div className="bg-navy-800 border border-slate-800 rounded-lg p-4 text-slate-400 text-xs leading-relaxed whitespace-pre-wrap">{String(rawReport["risk_manager"] ?? rawReport["risk_assessment"] ?? "No risk assessment available.")}</div>}
        {tab === 3 && (
          <div className="space-y-1 font-mono text-xs">
            {events.map((e, i) => (
              <div key={i} className="flex gap-3 text-slate-500">
                <span className="text-slate-700 w-6 shrink-0">{e.sequence}</span>
                <span className={e.type === "completed" ? "text-emerald-500" : e.type === "error" ? "text-red-500" : "text-slate-500"}>[{e.type}]</span>
                <span className="text-slate-400">{e.agent}</span>
                <span className="text-slate-600 truncate">{e.token ?? e.summary ?? e.message ?? ""}</span>
              </div>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add frontend/components/runs/ frontend/app/runs/
git commit -m "feat: Results Viewer with trader decision, analyst tabs, and raw log"
```

---

### Task 8: Settings page

**Files:**
- Create: `frontend/components/settings/ApiKeyRow.tsx`
- Create: `frontend/components/settings/TeamMemberRow.tsx`
- Create: `frontend/app/settings/page.tsx`

- [ ] **Step 1: Create `frontend/components/settings/ApiKeyRow.tsx`**

```typescript
"use client";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { upsertApiKey, deleteApiKey } from "@/lib/api";
import type { ApiKeyStatus } from "@/lib/types";

const STATUS = {
  valid: "bg-emerald-950 text-emerald-400",
  invalid: "bg-red-950 text-red-400",
  missing: "bg-amber-950 text-amber-400",
};

export function ApiKeyRow({ keyStatus, provider, label }: { keyStatus?: ApiKeyStatus; provider: string; label: string }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const qc = useQueryClient();

  const save = useMutation({
    mutationFn: () => upsertApiKey(provider, value),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["api-keys"] }); setEditing(false); setValue(""); },
  });

  const statusKey = keyStatus ? (keyStatus.is_valid ? "valid" : "invalid") : "missing";

  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-navy-900 last:border-0">
      <div className="w-36 shrink-0">
        <p className="text-slate-200 text-xs font-medium">{label}</p>
        <p className="text-slate-600 text-xs">{provider}</p>
      </div>
      <div className="flex-1">
        {editing ? (
          <input value={value} onChange={e => setValue(e.target.value)} placeholder="Paste API key..."
            className="w-full bg-slate-800 border border-blue-600 rounded px-3 py-1.5 text-xs font-mono text-slate-200 focus:outline-none" autoFocus />
        ) : (
          <div className="bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-xs font-mono text-slate-400">
            {keyStatus ? keyStatus.masked_key : "Not configured"}
          </div>
        )}
      </div>
      <div className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${STATUS[statusKey]}`}>
        {statusKey === "valid" ? "● valid" : statusKey === "invalid" ? "✕ invalid" : "○ missing"}
      </div>
      {editing ? (
        <div className="flex gap-1">
          <button onClick={() => save.mutate()} disabled={!value || save.isPending} className="text-blue-400 text-xs hover:text-blue-300">Save</button>
          <button onClick={() => { setEditing(false); setValue(""); }} className="text-slate-600 text-xs hover:text-slate-400">Cancel</button>
        </div>
      ) : (
        <button onClick={() => setEditing(true)} className="text-slate-600 text-xs hover:text-slate-400">{keyStatus ? "Edit" : "Add"}</button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create `frontend/components/settings/TeamMemberRow.tsx`**

```typescript
"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateUserRole } from "@/lib/api";
import type { User } from "@/lib/types";

export function TeamMemberRow({ member, isSelf }: { member: User; isSelf: boolean }) {
  const qc = useQueryClient();
  const toggleRole = useMutation({
    mutationFn: (role: string) => updateUserRole(member.id, role),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });

  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-navy-900 last:border-0">
      <div className="flex-1">
        <p className="text-slate-200 text-xs font-medium">{member.name}</p>
        <p className="text-slate-600 text-xs">{member.email}</p>
      </div>
      <span className={`text-xs px-1.5 py-0.5 rounded ${member.role === "admin" ? "bg-blue-950 text-blue-300" : "bg-slate-800 text-slate-500"}`}>
        {member.role}
      </span>
      {!isSelf && (
        <button onClick={() => toggleRole.mutate(member.role === "admin" ? "member" : "admin")}
          className="text-slate-600 text-xs hover:text-slate-400">
          Make {member.role === "admin" ? "member" : "admin"}
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create `frontend/app/settings/page.tsx`**

```typescript
"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { TopNav } from "@/components/layout/TopNav";
import { ApiKeyRow } from "@/components/settings/ApiKeyRow";
import { TeamMemberRow } from "@/components/settings/TeamMemberRow";
import { getApiKeys, getUsers, inviteUser } from "@/lib/api";

const PROVIDERS = [
  { provider: "openai", label: "OpenAI", desc: "GPT-4o, GPT-4o-mini" },
  { provider: "anthropic", label: "Anthropic", desc: "Claude 3.5 Sonnet" },
  { provider: "google", label: "Google Gemini", desc: "Gemini 2.0 Flash" },
  { provider: "deepseek", label: "DeepSeek", desc: "DeepSeek-V3, R1" },
  { provider: "alpha_vantage", label: "Alpha Vantage", desc: "Market data" },
];

type SettingsTab = "api-keys" | "team" | "profile";

export default function SettingsPage() {
  const { data: session } = useSession();
  const [tab, setTab] = useState<SettingsTab>("api-keys");
  const [inviteEmail, setInviteEmail] = useState("");
  const qc = useQueryClient();

  const isAdmin = (session?.user as { role?: string })?.role === "admin";
  const { data: apiKeys = [] } = useQuery({ queryKey: ["api-keys"], queryFn: getApiKeys, enabled: isAdmin });
  const { data: users = [] } = useQuery({ queryKey: ["users"], queryFn: getUsers, enabled: isAdmin });

  const invite = useMutation({
    mutationFn: () => inviteUser(inviteEmail),
    onSuccess: () => setInviteEmail(""),
  });

  return (
    <>
      <TopNav />
      <main className="p-6 max-w-4xl">
        <h1 className="text-slate-100 font-bold text-lg mb-6">Settings</h1>
        <div className="flex gap-6">
          <div className="w-40 shrink-0 space-y-1">
            <p className="text-slate-600 text-xs uppercase tracking-wide px-2 mb-2">Account</p>
            {(["profile"] as SettingsTab[]).map(t => (
              <button key={t} onClick={() => setTab(t)} className={`w-full text-left px-2 py-1.5 rounded text-xs capitalize ${tab === t ? "bg-navy-700 text-slate-200" : "text-slate-500 hover:text-slate-300"}`}>{t}</button>
            ))}
            {isAdmin && <>
              <p className="text-slate-600 text-xs uppercase tracking-wide px-2 mb-2 mt-4">Admin</p>
              {(["api-keys", "team"] as SettingsTab[]).map(t => (
                <button key={t} onClick={() => setTab(t)} className={`w-full text-left px-2 py-1.5 rounded text-xs capitalize ${tab === t ? "bg-blue-950 border border-blue-800 text-blue-300" : "text-slate-500 hover:text-slate-300"}`}>{t === "api-keys" ? "API Keys" : "Team Members"}</button>
              ))}
            </>}
          </div>

          <div className="flex-1">
            {tab === "profile" && (
              <div className="bg-navy-700 border border-slate-800 rounded-lg p-4">
                <p className="text-slate-200 text-sm font-medium">{session?.user?.name}</p>
                <p className="text-slate-500 text-xs mt-1">{session?.user?.email}</p>
                <p className="text-slate-600 text-xs mt-1">Role: {(session?.user as { role?: string })?.role ?? "member"}</p>
              </div>
            )}

            {tab === "api-keys" && isAdmin && (
              <div className="bg-navy-700 border border-slate-800 rounded-lg overflow-hidden">
                {PROVIDERS.map(p => (
                  <ApiKeyRow key={p.provider} provider={p.provider} label={p.label}
                    keyStatus={apiKeys.find(k => k.provider === p.provider)} />
                ))}
              </div>
            )}

            {tab === "team" && isAdmin && (
              <div>
                <div className="bg-navy-700 border border-slate-800 rounded-lg overflow-hidden mb-4">
                  {users.map(u => (
                    <TeamMemberRow key={u.id} member={u} isSelf={u.email === session?.user?.email} />
                  ))}
                </div>
                <div className="bg-navy-700 border border-dashed border-slate-700 rounded-lg p-4">
                  <p className="text-slate-400 text-xs mb-2">Invite a team member</p>
                  <div className="flex gap-2">
                    <input value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} type="email" placeholder="email@company.com"
                      className="flex-1 bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500" />
                    <button onClick={() => invite.mutate()} disabled={!inviteEmail || invite.isPending}
                      className="bg-blue-700 disabled:opacity-40 text-white px-3 py-1.5 rounded text-xs">
                      {invite.isPending ? "Sending..." : "Send Invite"}
                    </button>
                  </div>
                  {invite.isSuccess && <p className="text-emerald-400 text-xs mt-1">Invite sent!</p>}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/components/settings/ frontend/app/settings/
git commit -m "feat: Settings page — API keys, team management, profile"
```

---

### Task 9: Docker Compose and deployment

**Files:**
- Create: `docker-compose.yml`
- Create: `nginx/nginx.conf`
- Create: `frontend/Dockerfile`
- Create: `.gitignore`

- [ ] **Step 1: Create `frontend/Dockerfile`**

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
CMD ["node", "server.js"]
```

- [ ] **Step 2: Create `nginx/nginx.conf`**

```nginx
events {}
http {
  server {
    listen 80;
    location /api/ { proxy_pass http://backend:8000/; proxy_set_header Host $host; }
    location /ws/  { proxy_pass http://backend:8000/ws/; proxy_http_version 1.1; proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade"; }
    location /     { proxy_pass http://frontend:3000/; proxy_set_header Host $host; }
  }
}
```

- [ ] **Step 3: Create root `docker-compose.yml`**

```yaml
version: "3.9"
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_USER: agentfloor
      POSTGRES_PASSWORD: agentfloor
      POSTGRES_DB: agentfloor
    volumes:
      - pgdata:/var/lib/postgresql/data

  backend:
    build: ./backend
    depends_on: [db]
    environment:
      DATABASE_URL: postgresql://agentfloor:agentfloor@db:5432/agentfloor
      JWT_SECRET: ${JWT_SECRET}
      ENCRYPTION_KEY: ${ENCRYPTION_KEY}
      GOOGLE_CLIENT_ID: ${GOOGLE_CLIENT_ID:-}
      GOOGLE_CLIENT_SECRET: ${GOOGLE_CLIENT_SECRET:-}
      SMTP_HOST: ${SMTP_HOST:-}
      SMTP_PORT: ${SMTP_PORT:-587}
      SMTP_USER: ${SMTP_USER:-}
      SMTP_PASSWORD: ${SMTP_PASSWORD:-}
      SMTP_FROM: ${SMTP_FROM:-noreply@agentfloor.local}
      FRONTEND_URL: ${FRONTEND_URL:-http://localhost}
    command: >
      sh -c "alembic upgrade head && uvicorn main:app --host 0.0.0.0 --port 8000"

  frontend:
    build: ./frontend
    depends_on: [backend]
    environment:
      NEXTAUTH_URL: ${NEXTAUTH_URL:-http://localhost}
      NEXTAUTH_SECRET: ${NEXTAUTH_SECRET}
      NEXT_PUBLIC_API_URL: http://backend:8000
      GOOGLE_CLIENT_ID: ${GOOGLE_CLIENT_ID:-}
      GOOGLE_CLIENT_SECRET: ${GOOGLE_CLIENT_SECRET:-}

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
    depends_on: [frontend, backend]

volumes:
  pgdata:
```

- [ ] **Step 4: Create root `.gitignore`**

```
.env
.env.*
!.env.example
!.env.local.example
*.pyc
__pycache__/
.venv/
node_modules/
.next/
.superpowers/
*.hprof
```

- [ ] **Step 5: Full integration test**

```bash
cp .env.example .env
# Set JWT_SECRET, ENCRYPTION_KEY (64 hex chars), NEXTAUTH_SECRET in .env
docker compose up --build
```

Expected:
- `http://localhost` → redirects to `/login`
- Login with registered account → redirects to `/runs`
- Create a run → redirects to `/runs/{id}/live`
- After run completes → redirects to `/runs/{id}` with results

- [ ] **Step 6: Commit**

```bash
git add docker-compose.yml nginx/ frontend/Dockerfile .gitignore
git commit -m "feat: Docker Compose deployment with Nginx reverse proxy"
```

---

**Phase 2 complete.** AgentFloor is fully built and deployable.

**Deploy to Railway:**
```bash
# Push to GitHub, then in Railway dashboard:
# New Project → Deploy from GitHub → select repo
# Add environment variables from .env
# Railway auto-detects docker-compose.yml
```

**Deploy to DigitalOcean Droplet:**
```bash
git clone <repo> && cd trading-command-center
cp .env.example .env && nano .env  # fill in secrets
docker compose up -d
```
