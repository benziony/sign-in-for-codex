const statusNode = document.querySelector("#status");
const listNode = document.querySelector("#requests");
const refreshButton = document.querySelector("#refresh");
let csrf = "";

function text(tag, className, value) {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = value;
  return node;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    cache: "no-store",
    credentials: "same-origin",
    ...options
  });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || "The local helper could not complete that request.");
  return value;
}

function expiration(value) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "Expires soon" : `Expires ${new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date)}`;
}

async function finish(request, outcome) {
  const verb = outcome === "complete" ? "mark this request done" : "deny this request";
  if (!window.confirm(`Are you sure you want to ${verb}?`)) return;
  statusNode.textContent = "Updating the request…";
  await api(`/api/requests/${encodeURIComponent(request.id)}/${outcome}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": csrf,
      "X-Action-Nonce": request.actionNonce
    },
    body: "{}"
  });
  await load();
}

function render(request) {
  const card = document.createElement("article");
  card.className = "card";

  const top = document.createElement("div");
  top.className = "card-top";
  const heading = document.createElement("div");
  heading.append(
    text("p", "provider", request.provider || "Provider sign-in"),
    text("h3", "", request.action || "Finish this sign-in"),
    text("p", "host", request.providerHost || "Provider approval page")
  );
  top.append(heading, text("span", "badge", "Needs you"));
  card.append(top);

  if (request.instructions) card.append(text("p", "instructions", request.instructions));
  if (request.deviceCode) {
    const block = document.createElement("div");
    block.className = "code-block";
    const code = text("code", "", request.deviceCode);
    const copy = text("button", "copy", "Copy code");
    copy.type = "button";
    copy.addEventListener("click", async () => {
      await navigator.clipboard.writeText(request.deviceCode);
      copy.textContent = "Copied";
    });
    block.append(code, copy);
    card.append(block);
  }
  card.append(text("p", "expiry", expiration(request.expiresAt)));

  const actions = document.createElement("div");
  actions.className = "actions";
  const open = text("a", "primary", "Open provider sign-in ↗");
  open.href = request.url;
  open.target = "_blank";
  open.rel = "noreferrer noopener";
  const done = text("button", "secondary", "I’m done");
  done.type = "button";
  done.addEventListener("click", () => finish(request, "complete"));
  const deny = text("button", "secondary", "Deny");
  deny.type = "button";
  deny.addEventListener("click", () => finish(request, "deny"));
  actions.append(open, done, deny);
  card.append(actions);
  return card;
}

async function load() {
  refreshButton.disabled = true;
  try {
    const session = await api("/api/session");
    csrf = session.csrf;
    const listed = await api("/api/requests");
    const pending = listed.requests.filter((request) => request.status === "pending");
    const details = await Promise.all(pending.map((request) => api(`/api/requests/${encodeURIComponent(request.id)}`)));
    listNode.replaceChildren(...details.map(render));
    if (details.length === 0) {
      listNode.replaceChildren(text("div", "empty", "Nothing needs your attention right now."));
      statusNode.textContent = "Ready. This page will refresh while it is open.";
    } else {
      statusNode.textContent = `${details.length} sign-in ${details.length === 1 ? "request needs" : "requests need"} your attention.`;
    }
  } catch (error) {
    statusNode.textContent = error instanceof Error ? error.message : "The local helper is unavailable.";
    listNode.replaceChildren();
  } finally {
    refreshButton.disabled = false;
  }
}

refreshButton.addEventListener("click", load);
await load();
window.setInterval(load, 5000);
