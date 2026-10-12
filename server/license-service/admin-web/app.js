"use strict";
const $ = (id) => document.getElementById(id);
let csrf = "",
  page = 1,
  query = "",
  total = 0,
  currentAction = null,
  auditBefore = "",
  busy = false;
const errors = {
  unauthorized: "登录已过期，请重新登录。",
  invalid_credentials: "账号或密码不正确。",
  invalid_request: "请检查输入内容。",
  invalid_origin: "访问地址与服务器配置不一致。",
  invalid_host: "请使用配置的管理地址访问。",
  invalid_csrf: "页面验证已过期，请刷新后重试。",
  rate_limited: "请求过于频繁，请稍后再试。",
  login_rate_limited: "登录尝试过于频繁，请 10 分钟后再试。",
  reason_required: "请填写操作原因。",
  license_revoked: "此授权已撤销，不能延期。",
  not_found: "记录不存在，请刷新。",
  service_unavailable: "服务暂不可用，请稍后再试。",
  existing_entitlement: "该用户已有授权，请使用延期或先撤销旧授权。",
  account_disabled: "该账号已停用，请先恢复账号。",
  invalid_product_config: "价格、二维码或更新配置不正确，请检查版本、直链、SHA-256 和字节数。",
  config_conflict: "配置已被其他管理员修改，请刷新后再编辑。",
  single_device_required: "每个账号仅允许绑定一台电脑。",
};
function message(text, error = false) {
  $("message").textContent = text;
  $("message").classList.toggle("error", error);
  $("message").hidden = !text;
}
async function api(path, data) {
  const response = await fetch("/admin/api/" + path, {
    method: data === undefined ? "GET" : "POST",
    headers:
      data === undefined
        ? {}
        : { "Content-Type": "application/json", "X-CSRF-Token": csrf },
    body: data === undefined ? undefined : JSON.stringify(data),
    credentials: "same-origin",
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  const value = await response.json();
  if (!response.ok) {
    if (response.status === 401 && path !== "login") {
      showLogin();
    }
    throw Error(errors[value.error] || "请求失败，请稍后重试。");
  }
  return value;
}
function showLogin() {
  csrf = "";
  $("workspace").hidden = true;
  $("login-view").hidden = false;
  $("logout").hidden = true;
  $("identity").textContent = "未登录";
  for (const dialog of document.querySelectorAll("dialog[open]"))
    dialog.close();
  $("issued-code").value = "";
}
function signedIn(value) {
  csrf = value.csrf;
  $("workspace").hidden = false;
  $("login-view").hidden = true;
  $("logout").hidden = false;
  $("identity").textContent = value.username;
  $("login-form").reset();
}
async function run(fn) {
  if (busy) return;
  busy = true;
  document.body.setAttribute("aria-busy", "true");
  const buttons = [...document.querySelectorAll("button")].map((b) => [
    b,
    b.disabled,
  ]);
  buttons.forEach(([b]) => (b.disabled = true));
  try {
    await fn();
  } catch (e) {
    message(
      e.name === "TimeoutError"
        ? "请求超时，请刷新确认结果后再操作。"
        : e.message,
      true,
    );
  } finally {
    busy = false;
    document.body.removeAttribute("aria-busy");
    buttons.forEach(([b, disabled]) => {
      if (b.isConnected) b.disabled = disabled;
    });
    updatePages();
  }
}
function cell(row, text) {
  const el = document.createElement("td");
  el.textContent = text;
  row.append(el);
  return el;
}
function button(label, callback) {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = label;
  b.addEventListener("click", () => {
    if (!busy) callback();
  });
  return b;
}
function date(ts) {
  return new Date(ts * 1000).toLocaleString("zh-CN", { hour12: false });
}
function updatePages() {
  $("previous").disabled = busy || page <= 1;
  $("next").disabled = busy || page * 25 >= total;
  $("users-previous").disabled = busy || usersPage <= 1;
  $("users-next").disabled = busy || usersPage * 25 >= usersTotal;
}
let usersPage = 1,
  usersTotal = 0,
  usersQuery = "",
  userAction = null;
async function loadUsers() {
  const result = await api(
    "users?page=" + usersPage + "&q=" + encodeURIComponent(usersQuery),
  );
  usersTotal = result.total;
  $("user-rows").replaceChildren();
  for (const user of result.items) {
    const row = document.createElement("tr"),
      name = cell(row, "");
    const title = document.createElement("strong");
    title.textContent = user.remark || user.username;
    const sub = document.createElement("small");
    sub.textContent = user.remark ? user.username : user.id;
    name.append(title, sub);
    const badge = document.createElement("span");
    badge.className = "badge " + (user.disabled ? "revoked" : "active");
    badge.textContent = user.disabled ? "已停用" : user.role === 'admin' ? "软件管理员" : "普通账号";
    cell(row, "").append(badge);
    const grant = user.entitlement;
    const licenseCell = cell(
      row,
      grant
        ? grant.revoked
          ? "已撤销"
          : grant.expires_at <= result.server_time
            ? "已到期"
            : "授权有效"
        : "待开通",
    );
    if (grant) {
      const detail = document.createElement("small");
      detail.textContent =
        date(grant.expires_at) +
        " · " +
        grant.device_count +
        "/" +
        grant.device_limit +
        " 台";
      licenseCell.append(detail);
    }
    if (user.role === 'admin') {
      const info = document.createElement('small');
      info.textContent = `管理员设备不限 · ${user.session_device_count} 台保持登录 · 帧率内部测试权限`;
      licenseCell.append(info);
    }
    const times = cell(row, date(user.created_at));
    const recent = document.createElement("small");
    recent.textContent =
      "最近登录 " + (user.last_login ? date(user.last_login) : "—");
    times.append(recent);
    const actions = document.createElement("div");
    actions.className = "actions";
    if ((!grant || grant.revoked) && !user.disabled)
      actions.append(button("开通授权", () => editUser("grant", user)));
    if (grant) {
      actions.append(button("设备", () => run(() => loadDevices(grant))));
      if (!grant.revoked)
        actions.append(
          button("延期", () => edit("extend", grant)),
          button("撤销授权", () => edit("revoke", grant)),
        );
    }
    actions.append(
      button(user.role === 'admin' ? '取消管理员' : '设为管理员', () => editUser(user.role === 'admin' ? 'demote' : 'promote', user)),
      button("换绑设备", () => editUser("unbind", user)),
      button("备注", () => editUser("remark", user)),
      button(user.disabled ? "恢复账号" : "停用账号", () =>
        editUser(user.disabled ? "enable" : "disable", user),
      ),
    );
    cell(row, "").append(actions);
    $("user-rows").append(row);
  }
  $("users-empty").hidden = result.items.length > 0;
  $("users-page-info").textContent =
    "共 " + usersTotal + " 位用户 · 第 " + usersPage + " 页";
  updatePages();
}
function editUser(action, user) {
  userAction = { action, user, requestId: crypto.randomUUID() };
  $("user-editor-form").reset();
  $("user-editor-error").hidden = true;
  $("user-editor-title").textContent = {
    grant: "给账号开通授权",
    remark: "修改用户备注",
    disable: "停用软件账号",
    enable: "恢复软件账号",
    unbind: "清除账号设备绑定（需要重新登录）",
    promote: "设为软件管理员",
    demote: "取消软件管理员",
  }[action];
  $("user-editor-target").textContent = user.username + " · " + user.id;
  if(action==='unbind')$("user-editor-target").textContent+=' · 将注销全部登录并清空绑定。旧设备离线凭证可能保留至到期（最多 7 天）。';
  if(action==='promote')$("user-editor-target").textContent+=' · 允许不限设备登录及帧率内部测试。不会授予网页后台权限，也不会修改原 VIP 授权。仅用于你自己的账号。';
  if(action==='demote')$("user-editor-target").textContent+=' · 注销全部设备登录、清空绑定，重新登录后恢复单设备限制；不能再次调整帧率，已修改游戏需手动恢复。';
  $("user-grant-fields").hidden = action !== "grant";
  $("user-remark-field").hidden = action !== "remark";
  $("user-editor-form").elements.remark.value = user.remark || "";
  $("user-editor").showModal();
}
$("user-editor-form").onsubmit = (e) => {
  e.preventDefault();
  run(async () => {
    try {
      const a = userAction,
        form = new FormData(e.target),
        data = {
          request_id: a.requestId,
          reason: String(form.get("reason")).trim(),
        };
      if (a.action === "grant")
        Object.assign(data, {
          days: Number(form.get("days")),
          device_limit: Number(form.get("device_limit")),
          features: String(form.get("features"))
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        });
      if (a.action === "remark") data.remark = String(form.get("remark"));
      await api("users/" + a.user.id + "/" + a.action, data);
      $("user-editor").close();
      message("操作已完成。用户可在客户端同步授权。");
      await loadUsers();
    } catch (error) {
      $("user-editor-error").textContent = error.message;
      $("user-editor-error").hidden = false;
      throw error;
    }
  });
};
$("close-user-editor").onclick = () => $("user-editor").close();
$("users-refresh").onclick = () => run(loadUsers);
$("users-search-form").onsubmit = (e) => {
  e.preventDefault();
  run(async () => {
    usersQuery = $("users-search").value.trim();
    usersPage = 1;
    await loadUsers();
  });
};
$("users-previous").onclick = () =>
  run(async () => {
    usersPage--;
    await loadUsers();
  });
$("users-next").onclick = () =>
  run(async () => {
    usersPage++;
    await loadUsers();
  });
async function loadLicenses() {
  const value = await api(
    "licenses?page=" + page + "&q=" + encodeURIComponent(query),
  );
  total = value.total;
  for (const key of ["total", "active", "expired", "revoked"])
    $("stat-" + key).textContent = value.stats[key];
  $("license-rows").replaceChildren();
  for (const item of value.items) {
    const row = document.createElement("tr");
    const name = cell(row, "");
    const title = document.createElement("strong");
    title.textContent = item.reference;
    const id = document.createElement("small");
    id.textContent = item.id;
    const features = document.createElement("small");
    features.textContent = item.features.join(" · ");
    name.append(title, id, features);
    const state = item.revoked
      ? "revoked"
      : item.expires_at <= value.server_time
        ? "expired"
        : "active";
    const badge = document.createElement("span");
    badge.className = "badge " + state;
    badge.textContent = {
      revoked: "已撤销",
      expired: "已到期",
      active: "有效",
    }[state];
    cell(row, "").append(badge);
    cell(row, item.device_count + " / " + item.device_limit);
    cell(row, date(item.expires_at));
    const actions = document.createElement("div");
    actions.className = "actions";
    actions.append(button("设备", () => run(() => loadDevices(item))));
    if (!item.revoked) {
      actions.append(
        button("延期", () => edit("extend", item)),
        button("撤销", () => edit("revoke", item)),
      );
    }
    cell(row, "").append(actions);
    $("license-rows").append(row);
  }
  $("empty").hidden = value.items.length > 0;
  $("page-info").textContent = "共 " + total + " 项 · 第 " + page + " 页";
  updatePages();
}
async function loadDevices(item) {
  const value = await api("licenses/" + item.id + "/devices");
  $("devices-list").replaceChildren();
  if (!value.items.length) $("devices-list").textContent = "暂无绑定设备。";
  for (const device of value.items) {
    const node = document.createElement("div");
    node.className = "device";
    node.textContent = "设备 " + device.fingerprint_hint;
    const info = document.createElement("small");
    info.textContent =
      "首次激活 " +
      date(device.created_at) +
      " · 最近续期 " +
      date(device.last_seen);
    node.append(
      info,
      button("解绑设备", () => {
        $("devices-dialog").close();
        edit("unbind", item, device.id);
      }),
    );
    $("devices-list").append(node);
  }
  $("devices-dialog").showModal();
}
function edit(action, item, deviceId) {
  currentAction = { action, item, deviceId, requestId: crypto.randomUUID() };
  $("editor-form").reset();
  $("editor-error").hidden = true;
  $("issue-fields").hidden = action !== "issue";
  $("action-fields").hidden = action === "issue";
  $("extension-label").hidden = action !== "extend";
  $("editor-title").textContent = {
    issue: "签发授权码",
    extend: "延长授权有效期",
    revoke: "撤销授权",
    unbind: "解绑设备",
  }[action];
  $("editor-submit").textContent = {
    issue: "确认签发",
    extend: "确认延期",
    revoke: "确认撤销",
    unbind: "确认解绑",
  }[action];
  $("editor").showModal();
}
$("editor-form").addEventListener("submit", (e) => {
  e.preventDefault();
  run(async () => {
    try {
      const form = new FormData(e.target),
        a = currentAction;
      if (a.action === "issue") {
        const value = await api("licenses", {
          request_id: a.requestId,
          reference: String(form.get("reference")).trim(),
          days: Number(form.get("days")),
          device_limit: Number(form.get("device_limit")),
          features: String(form.get("features"))
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        });
        $("editor").close();
        if (value.already_completed) {
          message(
            "该授权已签发，没有重复创建。若首次响应丢失且未保存授权码，请在列表中撤销该授权后重新签发。编号：" +
              value.license_id,
          );
        } else {
          $("issued-code").value = value.activation_code;
          $("copy-state").textContent = "";
          $("code-dialog").showModal();
        }
      } else {
        const value = await api("licenses/" + a.item.id + "/" + a.action, {
          request_id: a.requestId,
          reason: String(form.get("reason")).trim(),
          days: Number(form.get("extension_days")),
          device_id: a.deviceId,
        });
        $("editor").close();
        message("操作已完成。" + value.offline_notice);
      }
      await loadLicenses();
      await loadUsers();
    } catch (error) {
      $("editor-error").textContent = error.message;
      $("editor-error").hidden = false;
      throw error;
    }
  });
});
$("login-form").addEventListener("submit", (e) => {
  e.preventDefault();
  run(async () => {
    const data = Object.fromEntries(new FormData(e.target));
    try {
      signedIn(await api("login", data));
      message("");
      await loadUsers();
      await loadLicenses();
    } finally {
      e.target.elements.password.value = "";
    }
  });
});
$("logout").onclick = () =>
  run(async () => {
    await api("logout", {});
    showLogin();
    message("已退出登录。");
  });
$("password-form").addEventListener("submit", (e) => {
  e.preventDefault();
  run(async () => {
    try {
      await api("password", Object.fromEntries(new FormData(e.target)));
      showLogin();
      message("密码已修改，请重新登录。");
    } finally {
      e.target.reset();
    }
  });
});
$("search-form").onsubmit = (e) => {
  e.preventDefault();
  run(async () => {
    query = $("search").value.trim();
    page = 1;
    await loadLicenses();
  });
};
$("refresh").onclick = () => run(loadLicenses);
$("previous").onclick = () =>
  run(async () => {
    page--;
    await loadLicenses();
  });
$("next").onclick = () =>
  run(async () => {
    page++;
    await loadLicenses();
  });
$("new-license").onclick = () => edit("issue");
$("close-editor").onclick = () => $("editor").close();
$("close-code").onclick = () => $("code-dialog").close();
$("code-dialog").addEventListener("close", () => {
  $("issued-code").value = "";
});
$("close-devices").onclick = () => $("devices-dialog").close();
$("copy-code").onclick = async () => {
  try {
    await navigator.clipboard.writeText($("issued-code").value);
    $("copy-state").textContent = "已复制。";
  } catch {
    $("issued-code").select();
    $("copy-state").textContent = "请手动复制选中的授权码。";
  }
};
const eventNames = {
  "admin.user_promote": "设为软件管理员",
  "admin.user_demote": "取消软件管理员",
  "user.register": "用户注册",
  "user.login": "用户登录",
  "user.logout": "用户退出",
  "user.redeem": "账号兑换授权",
  "user.auth_attempt": "账号登录/注册尝试",
  "user.device_bound": "账号绑定设备",
  "admin.user_grant": "给账号开通授权",
  "admin.user_remark": "修改用户备注",
  "admin.user_disable": "停用用户",
  "admin.user_enable": "恢复用户",
  "license.issued": "签发授权",
  "device.activated": "设备激活",
  "device.deactivated": "本机解除授权",
  "admin.issue": "管理员签发",
  "admin.revoke": "撤销授权",
  "admin.extend": "延长有效期",
  "admin.unbind": "解绑设备",
  "admin.login": "管理员登录",
  "admin.logout": "退出登录",
  "admin.login_attempt": "登录尝试",
  "admin.password_set": "设置密码",
};
async function loadAudit(reset = true) {
  const result = await api(
    "audit" + (!reset && auditBefore ? "?before=" + auditBefore : ""),
  );
  if (reset) $("audit-rows").replaceChildren();
  for (const item of result.items) {
    const row = document.createElement("tr");
    cell(row, date(item.created_at));
    cell(row, eventNames[item.event] || item.event);
    const detail = cell(row, item.subject);
    const small = document.createElement("small");
    try {
      const detailData = JSON.parse(item.detail);
      small.textContent =
        [
          detailData.actor && "操作人：" + detailData.actor,
          detailData.reason && "原因：" + detailData.reason,
          detailData.previous_expiry &&
            "原到期：" + date(detailData.previous_expiry),
          detailData.expires_at && "新到期：" + date(detailData.expires_at),
          detailData.device_id && "设备：" + detailData.device_id,
        ]
          .filter(Boolean)
          .join(" · ") || item.detail;
    } catch {
      small.textContent = item.detail;
    }
    detail.append(small);
    $("audit-rows").append(row);
  }
  auditBefore = result.items.at(-1)?.id || "";
  $("audit-more").hidden = result.items.length < 50;
}
$("audit-refresh").onclick = () => run(() => loadAudit());
$("audit-more").onclick = () => run(() => loadAudit(false));
document.querySelectorAll("[data-view]").forEach((b) =>
  b.addEventListener("click", () =>
    run(async () => {
      if (!csrf) return;
      for (const name of ["users", "licenses", "audit", "settings"])
        $(name + "-view").hidden = name !== b.dataset.view;
      document
        .querySelectorAll("[data-view]")
        .forEach((n) => n.classList.toggle("selected", n === b));
      $("breadcrumb").textContent = {
        users: "用户管理",
        licenses: "授权管理",
        audit: "操作记录",
        settings: "管理设置",
      }[b.dataset.view];
      if (b.dataset.view === "audit") await loadAudit();
      if (b.dataset.view === "licenses") await loadLicenses();
      if (b.dataset.view === "users") await loadUsers();
    }),
  ),
);
run(async () => {
  try {
    signedIn(await api("session"));
    await loadUsers();
    await loadLicenses();
  } catch (e) {
    showLogin();
    if (e.message !== errors.unauthorized) message(e.message, true);
  }
});
