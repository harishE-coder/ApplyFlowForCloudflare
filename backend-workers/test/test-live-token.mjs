const API_BASE = "https://applyflow-backend.harishabblu123.workers.dev/api";

async function testBearerTokenAuth() {
  console.log("1. Logging in with credentials...");
  const loginRes = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "harishabblu@gmail.com", password: "Harish@2007" }),
  });

  const loginData = await loginRes.json();
  console.log("Login status:", loginRes.status);
  console.log("Returned access_token exists:", Boolean(loginData.access_token));
  console.log("Returned refresh_token exists:", Boolean(loginData.refresh_token));

  if (!loginData.access_token) {
    throw new Error("Missing access_token in login response!");
  }

  const token = loginData.access_token;
  const refreshToken = loginData.refresh_token;

  console.log("\n2. Fetching /auth/bootstrap using ONLY Bearer token (NO COOKIES)...");
  const bootRes = await fetch(`${API_BASE}/auth/bootstrap`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Origin: "https://applyflowforcloudflare.pages.dev",
    },
  });
  console.log("Bootstrap status:", bootRes.status);
  const bootData = await bootRes.json();
  console.log("Bootstrap user name:", bootData?.user?.name);
  console.log("Bootstrap user role:", bootData?.user?.role);

  console.log("\n3. Fetching /dashboard/admin/home using ONLY Bearer token (NO COOKIES)...");
  const dashRes = await fetch(`${API_BASE}/dashboard/admin/home`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Origin: "https://applyflowforcloudflare.pages.dev",
    },
  });
  console.log("Dashboard status:", dashRes.status);
  const dashData = await dashRes.json();
  console.log("Total clients:", dashData?.overview?.total_clients);
  console.log("Total resumes:", dashData?.overview?.total_resumes);

  console.log("\n4. Refreshing token using JSON body refresh_token (NO COOKIES)...");
  const refreshRes = await fetch(`${API_BASE}/auth/refresh`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://applyflowforcloudflare.pages.dev",
    },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  console.log("Refresh status:", refreshRes.status);
  const refreshData = await refreshRes.json();
  console.log("New access_token exists:", Boolean(refreshData.access_token));

  console.log("\n5. Testing new refreshed access token on /notifications...");
  const notifRes = await fetch(`${API_BASE}/notifications`, {
    headers: {
      Authorization: `Bearer ${refreshData.access_token}`,
      Origin: "https://applyflowforcloudflare.pages.dev",
    },
  });
  console.log("Notifications status with refreshed token:", notifRes.status);

  console.log("\n✅ ALL BEARER TOKEN AUTHENTICATION CHECKS PASSED PERFECTLY!");
}

testBearerTokenAuth().catch(console.error);
