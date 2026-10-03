const TOKEN_KEY = "adminToken";

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY));

async function request(path, { method = "GET", body, auth = false } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (auth && getToken()) headers.Authorization = `Bearer ${getToken()}`;
  const res = await fetch(`/api${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, credentials: "include" });
  const isCsv = res.headers.get("content-type")?.includes("text/csv");
  const data = isCsv ? await res.text() : await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && auth) {
      setToken(null);
      if (!location.pathname.startsWith("/admin/login")) location.href = "/admin/login";
    }
    const err = new Error(data.error || "Something went wrong.");
    err.fields = data.fields;
    err.data = data;
    err.status = res.status;
    throw err;
  }
  return data;
}

export const pub = {
  get: (p) => request(`/public${p}`),
  post: (p, body) => request(`/public${p}`, { method: "POST", body }),
};

export const admin = {
  get: (p) => request(`/admin${p}`, { auth: true }),
  post: (p, body = {}) => request(`/admin${p}`, { method: "POST", body, auth: true }),
  put: (p, body = {}) => request(`/admin${p}`, { method: "PUT", body, auth: true }),
  del: (p) => request(`/admin${p}`, { method: "DELETE", auth: true }),
  login: (email, password) => request("/admin/login", { method: "POST", body: { email, password } }),
};
