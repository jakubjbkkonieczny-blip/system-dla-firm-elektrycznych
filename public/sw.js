self.addEventListener("push", function (event) {
  const data = event.data?.json() || {};

  const title = data.title || "Powiadomienie";
  const options = {
    body: data.body || "",
    icon: "/icon-192.png",
  };

  event.waitUntil(self.registration.showNotification(title, options));
});
