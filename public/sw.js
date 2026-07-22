self.addEventListener("push", function (event) {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }

  const title = typeof data.title === "string" && data.title ? data.title : "Powiadomienie";
  const body = typeof data.body === "string" ? data.body : "";
  const tag = typeof data.tag === "string" ? data.tag : undefined;
  const url = typeof data.url === "string" ? data.url : undefined;

  const options = {
    body: body,
    icon: "/icon-192.png",
    tag: tag,
    data: { url: url },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

function resolveSafeAppPath(rawUrl) {
  if (!rawUrl || typeof rawUrl !== "string") return "/notifications";

  try {
    const parsed = new URL(rawUrl, self.location.origin);
    if (parsed.origin !== self.location.origin) return "/notifications";
    if (!parsed.pathname.startsWith("/")) return "/notifications";
    return parsed.pathname + parsed.search + parsed.hash;
  } catch {
    if (rawUrl.startsWith("/") && !rawUrl.startsWith("//")) return rawUrl;
    return "/notifications";
  }
}

self.addEventListener("notificationclick", function (event) {
  event.notification.close();

  const targetPath = resolveSafeAppPath(
    event.notification.data && event.notification.data.url
  );

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (windowClients) {
      for (const client of windowClients) {
        if (client.url.startsWith(self.location.origin)) {
          client.focus();
          if ("navigate" in client) {
            return client.navigate(targetPath);
          }
          return undefined;
        }
      }
      return clients.openWindow(targetPath);
    })
  );
});
