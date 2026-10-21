// OZ Assistant chat window. Talks to /api/chat (a Netlify function that holds the OpenAI key).
(function () {
  var history = [];
  var busy = false;
  var lastFocus = null;

  var panel = document.createElement("div");
  panel.className = "oz-chat";
  panel.id = "oz-chat";
  panel.hidden = true;
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "false");
  panel.setAttribute("aria-labelledby", "oz-chat-title");
  panel.innerHTML =
    '<div class="oz-chat-head">' +
      '<div><div class="oz-chat-title" id="oz-chat-title"><span class="chat-dot" aria-hidden="true"></span>OZ Assistant</div>' +
      '<div class="oz-chat-sub">General information, not tax advice.</div></div>' +
      '<button type="button" class="oz-chat-x" aria-label="Close the assistant">' +
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>' +
      '</button>' +
    '</div>' +
    '<div class="oz-chat-log" aria-live="polite"></div>' +
    '<div class="oz-chat-starters"></div>' +
    '<form class="oz-chat-form">' +
      '<label class="oz-sr" for="oz-chat-input">Your question</label>' +
      '<textarea id="oz-chat-input" rows="1" maxlength="800" placeholder="Ask about Opportunity Zones…"></textarea>' +
      '<button type="submit" class="oz-chat-send" aria-label="Send">' +
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>' +
      '</button>' +
    '</form>' +
    '<div class="oz-chat-foot">Please don\'t share personal or financial details. Questions about your situation: <a href="mailto:info@ozintelpro.com">info@ozintelpro.com</a></div>';
  document.body.appendChild(panel);

  var launcher = document.createElement("button");
  launcher.type = "button";
  launcher.className = "oz-launch";
  launcher.setAttribute("aria-controls", "oz-chat");
  launcher.setAttribute("aria-expanded", "false");
  launcher.innerHTML =
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/></svg>' +
    '<span>Ask the OZ Assistant</span>';
  document.body.appendChild(launcher);

  var log = panel.querySelector(".oz-chat-log");
  var form = panel.querySelector(".oz-chat-form");
  var input = panel.querySelector("#oz-chat-input");
  var starters = panel.querySelector(".oz-chat-starters");

  var STARTERS = ["Which gains qualify?", "How does OZ 2.0 work?", "What is the 10-year exclusion?", "What happens on Dec 31, 2026?"];
  STARTERS.forEach(function (q) {
    var b = document.createElement("button");
    b.type = "button";
    b.textContent = q;
    b.addEventListener("click", function () { send(q); });
    starters.appendChild(b);
  });

  function esc(s) {
    return s.replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  // Safe, minimal formatting: escape first, then bold, links, and bullet lines.
  function format(text) {
    var lines = esc(text).split(/\n/);
    var html = "", inList = false;
    lines.forEach(function (raw) {
      var line = raw
        .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
        .replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g, '<a href="$1" target="_blank" rel="noopener">$1</a>')
        .replace(/\b([A-Za-z0-9._%+-]+@ozintelpro\.com)\b/g, '<a href="mailto:$1">$1</a>');
      var m = line.match(/^\s*[-•*]\s+(.*)$/);
      if (m) { if (!inList) { html += "<ul>"; inList = true; } html += "<li>" + m[1] + "</li>"; return; }
      if (inList) { html += "</ul>"; inList = false; }
      if (line.trim()) html += "<p>" + line + "</p>";
    });
    if (inList) html += "</ul>";
    return html;
  }

  function add(role, text, isError) {
    var d = document.createElement("div");
    d.className = "bubble " + (role === "user" ? "user" : "bot") + (isError ? " err" : "");
    if (role === "user") d.textContent = text; else d.innerHTML = format(text);
    log.appendChild(d);
    log.scrollTop = log.scrollHeight;
    return d;
  }

  function greet() {
    if (log.childElementCount) return;
    add("assistant", "Hi! I can answer general questions about Opportunity Zones, OZ 2.0, and the capital gains rules around them. What would you like to know?");
  }

  function open(prefill) {
    lastFocus = document.activeElement;
    panel.hidden = false;
    launcher.setAttribute("aria-expanded", "true");
    launcher.classList.add("hide");
    greet();
    if (prefill) send(prefill); else input.focus();
  }
  function close() {
    panel.hidden = true;
    launcher.setAttribute("aria-expanded", "false");
    launcher.classList.remove("hide");
    (lastFocus && lastFocus.focus ? lastFocus : launcher).focus();
  }

  function send(text) {
    text = (text || "").trim();
    if (!text || busy) return;
    busy = true;
    starters.hidden = true;
    input.value = "";
    autosize();
    add("user", text);
    history.push({ role: "user", content: text });
    var wait = add("assistant", "Thinking…");
    wait.classList.add("wait");

    fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: history.slice(-10) })
    })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        wait.remove();
        if (res.ok && res.j.reply) {
          add("assistant", res.j.reply);
          history.push({ role: "assistant", content: res.j.reply });
        } else {
          history.pop();
          add("assistant", (res.j && res.j.error) || "Something went wrong. Please try again, or email info@ozintelpro.com.", true);
        }
      })
      .catch(function () {
        wait.remove();
        history.pop();
        add("assistant", "I couldn't connect just now. Please try again, or email info@ozintelpro.com.", true);
      })
      .then(function () { busy = false; input.focus(); });
  }

  function autosize() {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 120) + "px";
  }

  form.addEventListener("submit", function (e) { e.preventDefault(); send(input.value); });
  input.addEventListener("input", autosize);
  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input.value); }
  });
  panel.querySelector(".oz-chat-x").addEventListener("click", close);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !panel.hidden) close(); });
  launcher.addEventListener("click", function () { open(); });

  // Any link or button with data-ask opens the chat (and asks its question, if it has one).
  document.querySelectorAll("[data-ask]").forEach(function (el) {
    el.addEventListener("click", function (e) {
      e.preventDefault();
      open(el.getAttribute("data-ask") || "");
    });
  });
})();
