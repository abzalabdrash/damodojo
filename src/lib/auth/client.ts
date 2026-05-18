import { getPartyKitHost } from "@/lib/realtime/client";

export interface AuthSuccess {
  username: string;
  token: string;
}
export interface AuthError {
  error: string;
}
export type AuthResult = AuthSuccess | AuthError;

function authUrl(): string {
  const host = getPartyKitHost();
  const proto = host.startsWith("localhost") ? "http" : "https";
  return `${proto}://${host}/parties/auth/global`;
}

async function call(action: string, body: Record<string, unknown>): Promise<AuthResult> {
  try {
    const res = await fetch(authUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...body }),
    });
    return (await res.json()) as AuthResult;
  } catch (err) {
    return { error: "network_error" };
  }
}

export function signup(username: string, password: string): Promise<AuthResult> {
  return call("signup", { username, password });
}

export function login(username: string, password: string): Promise<AuthResult> {
  return call("login", { username, password });
}

export function verifyToken(token: string): Promise<AuthResult> {
  return call("verify", { token });
}

export function logout(token: string): Promise<AuthResult> {
  return call("logout", { token });
}

const AUTH_KEY = "dama_auth";

interface StoredAuth {
  username: string;
  token: string;
}

export function loadStoredAuth(): StoredAuth | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredAuth;
  } catch {
    return null;
  }
}

export function saveStoredAuth(auth: StoredAuth): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(AUTH_KEY, JSON.stringify(auth));
}

export function clearStoredAuth(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(AUTH_KEY);
}

export function isAuthError(r: AuthResult): r is AuthError {
  return "error" in r;
}

export function authErrorMessage(code: string): string {
  switch (code) {
    case "invalid_username":
      return "Юзернейм 3–20 символов, только буквы/цифры/_";
    case "weak_password":
      return "Пароль минимум 6 символов";
    case "username_taken":
      return "Юзернейм уже занят";
    case "not_found":
      return "Пользователь не найден";
    case "wrong_password":
      return "Неверный пароль";
    case "network_error":
      return "Ошибка сети";
    default:
      return "Ошибка: " + code;
  }
}
