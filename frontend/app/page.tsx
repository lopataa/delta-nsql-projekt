"use client";

import { useEffect, useMemo, useState } from "react";
import { io, Socket } from "socket.io-client";

type TaskStatus = "open" | "in_progress" | "done";

type Task = {
  id: string;
  title: string;
  description?: string;
  category?: string;
  status: TaskStatus;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
};

type User = {
  id: string;
  email: string;
  name: string;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const categories = ["Matematika", "Programování", "Biologie", "Jazyky", "Ostatní"];

export default function Home() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [authForm, setAuthForm] = useState({ email: "", password: "", name: "" });
  const [taskForm, setTaskForm] = useState({ title: "", description: "", category: categories[0] });
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [filters, setFilters] = useState({ category: "", status: "", q: "" });
  const [socket, setSocket] = useState<Socket | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const statusPill = useMemo(
    () => ({
      open: "text-amber-800 bg-amber-100 border-amber-200",
      in_progress: "text-blue-800 bg-blue-100 border-blue-200",
      done: "text-emerald-800 bg-emerald-100 border-emerald-200",
    }),
    [],
  );

  useEffect(() => {
    const stored = localStorage.getItem("token");
    if (stored) {
      setToken(stored);
    }
  }, []);

  useEffect(() => {
    if (!token) return;
    fetchProfile();
    connectSocket(token);
  }, [token]);

  useEffect(() => {
    if (!token) return;
    fetchTasks();
  }, [token, filters]);

  useEffect(() => {
    return () => {
      socket?.disconnect();
    };
  }, [socket]);

  const connectSocket = (jwt: string) => {
    if (socket) {
      socket.disconnect();
    }
    const nextSocket = io(API_URL, {
      transports: ["websocket"],
      auth: { token: jwt },
    });

    nextSocket.on("connect", () => setStatusMessage("Připojeno k real-time kanálu"));
    nextSocket.on("task:update", (payload) => {
      setTasks((prev) => applyRealtime(prev, payload));
    });
    nextSocket.on("disconnect", () => setStatusMessage("Odpojeno, čekám na obnovu..."));
    nextSocket.on("auth_error", (msg: string) => setError(msg));

    setSocket(nextSocket);
  };

  const apiFetch = async (path: string, options: RequestInit = {}) => {
    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || "Request failed");
    }
    return response.json();
  };

  const fetchProfile = async () => {
    try {
      const data = await apiFetch("/auth/me");
      setUser(data.user);
    } catch (err) {
      console.error(err);
      logout();
    }
  };

  const fetchTasks = async () => {
    try {
      setLoadingTasks(true);
      const qs = new URLSearchParams();
      if (filters.category) qs.append("category", filters.category);
      if (filters.status) qs.append("status", filters.status);
      if (filters.q) qs.append("q", filters.q);
      const suffix = qs.toString();
      const data = await apiFetch(`/tasks${suffix ? `?${suffix}` : ""}`);
      setTasks(data);
    } catch (err) {
      setError("Nepodařilo se načíst úkoly");
    } finally {
      setLoadingTasks(false);
    }
  };

  const handleAuth = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      const endpoint = mode === "login" ? "/auth/login" : "/auth/register";
      const body =
        mode === "login"
          ? { email: authForm.email, password: authForm.password }
          : authForm;
      const data = await apiFetch(endpoint, { method: "POST", body: JSON.stringify(body) });
      setToken(data.token);
      localStorage.setItem("token", data.token);
      setUser(data.user);
      setAuthForm({ email: "", password: "", name: "" });
    } catch (err: any) {
      setError(err?.message ?? "Přihlášení selhalo");
    }
  };

  const handleTaskCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!taskForm.title) return;
    try {
      const created = await apiFetch("/tasks", { method: "POST", body: JSON.stringify(taskForm) });
      setTasks((prev) => [created, ...prev]);
      setTaskForm({ title: "", description: "", category: categories[0] });
      setStatusMessage("Úkol přidán a rozeslán v real-time");
    } catch {
      setError("Úkol se nepodařilo uložit");
    }
  };

  const handleStatusChange = async (task: Task, status: TaskStatus) => {
    try {
      const updated = await apiFetch(`/tasks/${task.id}`, {
        method: "PUT",
        body: JSON.stringify({ status }),
      });
      setTasks((prev) => applyRealtime(prev, { action: "updated", task: updated, userId: user?.id }));
    } catch {
      setError("Aktualizace úkolu selhala");
    }
  };

  const handleDelete = async (taskId: string) => {
    try {
      await apiFetch(`/tasks/${taskId}`, { method: "DELETE" });
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
    } catch {
      setError("Smazání úkolu selhalo");
    }
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    setTasks([]);
    localStorage.removeItem("token");
    socket?.disconnect();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-950 to-indigo-950 text-slate-50">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10">
        <header className="flex flex-col gap-3 rounded-3xl border border-white/10 bg-white/5 p-6 shadow-lg shadow-indigo-900/30 backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm uppercase tracking-[0.25em] text-indigo-200">Redis Stack · Socket.io</p>
              <h1 className="text-3xl font-semibold text-white sm:text-4xl">Task Tracker pro žáky</h1>
              <p className="mt-1 text-slate-200/80">
                Registrace, přidávání úkolů, filtrování podle kategorií a real-time aktualizace.
              </p>
            </div>
            {user && (
              <div className="flex items-center gap-3 rounded-full border border-white/10 bg-white/10 px-4 py-2 text-sm text-indigo-50">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                {user.name} · {user.email}
              </div>
            )}
          </div>
          {statusMessage && <div className="text-sm text-emerald-200">{statusMessage}</div>}
          {error && (
            <div className="rounded-lg border border-rose-400/60 bg-rose-900/30 px-4 py-2 text-sm text-rose-50">
              {error}
            </div>
          )}
        </header>

        <div className="grid gap-6 lg:grid-cols-3">
          <section className="lg:col-span-1">
            {!user ? (
              <form
                onSubmit={handleAuth}
                className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-white/10 p-6 shadow-lg shadow-indigo-900/40 backdrop-blur"
              >
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold text-white">Přihlášení / Registrace</h2>
                  <div className="flex gap-2 rounded-full bg-slate-900/70 p-1 text-xs">
                    <button
                      type="button"
                      onClick={() => setMode("login")}
                      className={`rounded-full px-3 py-1 ${mode === "login" ? "bg-indigo-500 text-white" : "text-slate-200"}`}
                    >
                      Login
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode("register")}
                      className={`rounded-full px-3 py-1 ${mode === "register" ? "bg-indigo-500 text-white" : "text-slate-200"}`}
                    >
                      Registrovat
                    </button>
                  </div>
                </div>
                {mode === "register" && (
                  <div className="flex flex-col gap-2">
                    <label className="text-sm text-slate-200">Jméno</label>
                    <input
                      required
                      value={authForm.name}
                      onChange={(e) => setAuthForm((p) => ({ ...p, name: e.target.value }))}
                      className="rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-slate-50 outline-none ring-2 ring-transparent focus:border-indigo-400 focus:ring-indigo-400/50"
                      placeholder="Jméno"
                    />
                  </div>
                )}
                <div className="flex flex-col gap-2">
                  <label className="text-sm text-slate-200">E-mail</label>
                  <input
                    type="email"
                    required
                    value={authForm.email}
                    onChange={(e) => setAuthForm((p) => ({ ...p, email: e.target.value }))}
                    className="rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-slate-50 outline-none ring-2 ring-transparent focus:border-indigo-400 focus:ring-indigo-400/50"
                    placeholder="student@example.com"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-sm text-slate-200">Heslo</label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={authForm.password}
                    onChange={(e) => setAuthForm((p) => ({ ...p, password: e.target.value }))}
                    className="rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-slate-50 outline-none ring-2 ring-transparent focus:border-indigo-400 focus:ring-indigo-400/50"
                    placeholder="•••••••"
                  />
                </div>
                <button
                  type="submit"
                  className="mt-2 rounded-xl bg-indigo-500 px-4 py-2 text-white transition hover:bg-indigo-400"
                >
                  {mode === "login" ? "Přihlásit se" : "Registrovat"}
                </button>
              </form>
            ) : (
              <div className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-white/10 p-6 shadow-lg shadow-indigo-900/40 backdrop-blur">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold">Filtry</h2>
                  <button onClick={logout} className="text-sm text-rose-200 hover:underline">
                    Odhlásit
                  </button>
                </div>
                <div className="flex flex-col gap-3 text-sm">
                  <label className="flex flex-col gap-1">
                    Kategorie
                    <select
                      value={filters.category}
                      onChange={(e) => setFilters((p) => ({ ...p, category: e.target.value }))}
                      className="rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-slate-50 outline-none focus:border-indigo-400"
                    >
                      <option value="">Vše</option>
                      {categories.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1">
                    Stav
                    <select
                      value={filters.status}
                      onChange={(e) => setFilters((p) => ({ ...p, status: e.target.value }))}
                      className="rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-slate-50 outline-none focus:border-indigo-400"
                    >
                      <option value="">Vše</option>
                      <option value="open">Otevřený</option>
                      <option value="in_progress">Rozpracovaný</option>
                      <option value="done">Hotovo</option>
                    </select>
                  </label>
                  <label className="flex flex-col gap-1">
                    Hledat
                    <input
                      value={filters.q}
                      onChange={(e) => setFilters((p) => ({ ...p, q: e.target.value }))}
                      placeholder="Název nebo popis"
                      className="rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-slate-50 outline-none focus:border-indigo-400"
                    />
                  </label>
                </div>
              </div>
            )}
          </section>

          <section className="lg:col-span-2 flex flex-col gap-4">
            {user && (
              <form
                onSubmit={handleTaskCreate}
                className="rounded-3xl border border-indigo-200/30 bg-indigo-500/20 p-6 shadow-lg shadow-indigo-900/40 backdrop-blur"
              >
                <h2 className="text-xl font-semibold text-white">Přidat úkol</h2>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <label className="flex flex-col gap-2 text-sm">
                    Název
                    <input
                      value={taskForm.title}
                      onChange={(e) => setTaskForm((p) => ({ ...p, title: e.target.value }))}
                      required
                      className="rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-slate-50 outline-none focus:border-indigo-200"
                      placeholder="Např. vyřešit příklad 5"
                    />
                  </label>
                  <label className="flex flex-col gap-2 text-sm">
                    Kategorie
                    <select
                      value={taskForm.category}
                      onChange={(e) => setTaskForm((p) => ({ ...p, category: e.target.value }))}
                      className="rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-slate-50 outline-none focus:border-indigo-200"
                    >
                      {categories.map((cat) => (
                        <option key={cat}>{cat}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="mt-4 flex flex-col gap-2 text-sm">
                  Popis
                  <textarea
                    value={taskForm.description}
                    onChange={(e) => setTaskForm((p) => ({ ...p, description: e.target.value }))}
                    rows={3}
                    className="rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-slate-50 outline-none focus:border-indigo-200"
                    placeholder="Detailní kroky, odkazy, termín..."
                  />
                </label>
                <button
                  type="submit"
                  className="mt-4 rounded-xl bg-white px-4 py-2 text-indigo-700 shadow hover:bg-indigo-50"
                >
                  Uložit úkol
                </button>
              </form>
            )}

            <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-lg shadow-indigo-900/30 backdrop-blur">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold text-white">Úkoly</h2>
                  <p className="text-sm text-slate-200/80">Real-time aktualizace přes Socket.io</p>
                </div>
                {loadingTasks && <span className="text-xs text-indigo-100">Načítám...</span>}
              </div>
              <div className="mt-4 grid gap-3">
                {tasks.length === 0 && <p className="text-sm text-slate-200/60">Zatím žádné úkoly</p>}
                {tasks.map((task) => (
                  <article
                    key={task.id}
                    className="group flex flex-col gap-3 rounded-2xl border border-white/10 bg-slate-900/50 p-4 transition hover:border-indigo-300/50 hover:shadow-lg hover:shadow-indigo-900/40"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded-full border px-3 py-1 text-xs font-medium ${statusPill[task.status]}`}
                        >
                          {task.status === "open"
                            ? "Otevřený"
                            : task.status === "in_progress"
                              ? "Rozpracovaný"
                              : "Hotovo"}
                        </span>
                        <span className="rounded-full bg-indigo-500/20 px-3 py-1 text-xs text-indigo-100">
                          {task.category}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-300/80">
                        <span>{new Date(task.updatedAt).toLocaleString()}</span>
                      </div>
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-white">{task.title}</h3>
                      {task.description && (
                        <p className="mt-1 text-sm text-slate-200/80">{task.description}</p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => handleStatusChange(task, "open")}
                        className={`rounded-full px-3 py-1 text-xs ${
                          task.status === "open"
                            ? "bg-indigo-500 text-white"
                            : "border border-white/10 text-slate-200"
                        }`}
                      >
                        Otevřený
                      </button>
                      <button
                        onClick={() => handleStatusChange(task, "in_progress")}
                        className={`rounded-full px-3 py-1 text-xs ${
                          task.status === "in_progress"
                            ? "bg-indigo-500 text-white"
                            : "border border-white/10 text-slate-200"
                        }`}
                      >
                        Rozpracovaný
                      </button>
                      <button
                        onClick={() => handleStatusChange(task, "done")}
                        className={`rounded-full px-3 py-1 text-xs ${
                          task.status === "done"
                            ? "bg-emerald-500 text-emerald-50"
                            : "border border-white/10 text-slate-200"
                        }`}
                      >
                        Hotovo
                      </button>
                      <button
                        onClick={() => handleDelete(task.id)}
                        className="ml-auto rounded-full border border-rose-300/50 px-3 py-1 text-xs text-rose-100 hover:bg-rose-500/20"
                      >
                        Smazat
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function applyRealtime(prev: Task[], payload: any): Task[] {
  const { action, task } = payload;
  if (!task?.id) return prev;
  if (action === "deleted") {
    return prev.filter((t) => t.id !== task.id);
  }
  const existing = prev.findIndex((t) => t.id === task.id);
  if (existing >= 0) {
    const updated = [...prev];
    updated[existing] = task;
    return updated;
  }
  return [task, ...prev];
}
