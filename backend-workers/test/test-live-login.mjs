const API_BASE = "https://applyflow-backend.harishabblu123.workers.dev/api";

async function testLogin() {
  console.log("1. Logging in as admin...");
  const loginRes = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "harishabblu@gmail.com", password: "Harish@2007" }),
  });

  console.log("Login status:", loginRes.status);
  const setCookies = loginRes.headers.getSetCookie ? loginRes.headers.getSetCookie() : [loginRes.headers.get("set-cookie")];
  console.log("Set-Cookie headers:", setCookies);

  const loginData = await loginRes.json();
  console.log("Login body:", loginData);

  if (!setCookies || setCookies.length === 0 || !setCookies[0]) {
    console.error("NO COOKIES RETURNED!");
    return;
  }

  // Extract cookies
  const cookieHeader = setCookies.map(c => c.split(';')[0]).join('; ');
  console.log("Cookie header for subsequent requests:", cookieHeader);

  console.log("\n2. Fetching /auth/bootstrap with cookie...");
  const bootRes = await fetch(`${API_BASE}/auth/bootstrap`, {
    headers: {
      Cookie: cookieHeader,
      Origin: "https://applyflowforcloudflare.pages.dev"
    },
  });
  console.log("Bootstrap status:", bootRes.status);
  const bootData = await bootRes.text();
  console.log("Bootstrap response:", bootData);

  console.log("\n3. Fetching /dashboard/admin/home with cookie...");
  const dashRes = await fetch(`${API_BASE}/dashboard/admin/home`, {
    headers: {
      Cookie: cookieHeader,
      Origin: "https://applyflowforcloudflare.pages.dev"
    },
  });
  console.log("Dashboard status:", dashRes.status);
  const dashData = await dashRes.text();
  console.log("Dashboard response preview:", dashData.slice(0, 200));

  console.log("\n4. Fetching /chat/unread-count with cookie...");
  const chatRes = await fetch(`${API_BASE}/chat/unread-count`, {
    headers: {
      Cookie: cookieHeader,
      Origin: "https://applyflowforcloudflare.pages.dev"
    },
  });
  console.log("Chat status:", chatRes.status);
  const chatData = await chatRes.text();
  console.log("Chat response:", chatData);

  console.log("\n5. Fetching /notifications with cookie...");
  const notifRes = await fetch(`${API_BASE}/notifications`, {
    headers: {
      Cookie: cookieHeader,
      Origin: "https://applyflowforcloudflare.pages.dev"
    },
  });
  console.log("Notifications status:", notifRes.status);
  const notifData = await notifRes.text();
  console.log("Notifications response preview:", notifData.slice(0, 200));
}

testLogin().catch(console.error);
