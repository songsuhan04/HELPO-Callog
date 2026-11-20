import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseConfigured = Boolean(url && anonKey);

// 자동 로그인 체크박스에 따라 localStorage(유지) 또는 sessionStorage(탭 닫으면 로그아웃)를 선택
export function createAutoLoginStorage(autoLogin: boolean) {
  const store = autoLogin ? window.localStorage : window.sessionStorage;
  return {
    getItem: (key: string) => store.getItem(key),
    setItem: (key: string, value: string) => store.setItem(key, value),
    removeItem: (key: string) => store.removeItem(key),
  };
}

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!supabaseConfigured) {
    throw new Error("Supabase 환경변수가 설정되지 않았어요 (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)");
  }
  if (!client) {
    const autoLogin = window.localStorage.getItem("callog.autoLogin") !== "false";
    client = createClient(url as string, anonKey as string, {
      auth: {
        storage: createAutoLoginStorage(autoLogin),
        persistSession: true,
        autoRefreshToken: true,
      },
    });
  }
  return client;
}
