"use strict";
let productConfig = null,
  productRevision = 0,
  qrLoading = false;
const productForm = document.getElementById("product-form");
document.getElementById("product-load").onclick = () =>
  run(async () => {
    const result = await api("product");
    productConfig = result.config;
    productRevision = result.revision;
    const f = productForm.elements;
    f.month.value = productConfig.month_fen / 100;
    f.year.value = productConfig.year_fen / 100;
    f.wechat.value = productConfig.wechat;
    f.service_text.value = productConfig.service_text || "";
    for (const k of ["version", "mode", "url", "sha256", "size", "notes"])
      f[k].value = productConfig.update[k];
    f.enabled.checked = productConfig.update.enabled;
    document.getElementById("product-qr-preview").src = productConfig.qr_data;
    productForm.hidden = false;
    document.getElementById("product-status").textContent =
      "已读取服务器配置 · 修订 " + productRevision;
  });
document.getElementById("product-qr").onchange = async (e) => {
  const file = e.target.files[0];
  if (!file || !productConfig) return;
  qrLoading = true;
  try {
    if (file.size > 200 * 1024 || file.type !== "image/png")
      throw Error("请选择不超过 200 KB 的 PNG 图片");
    const data = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    productConfig.qr_data = data;
    document.getElementById("product-qr-preview").src = data;
    document.getElementById("product-status").textContent =
      "二维码已载入，点击保存配置后发布。";
  } catch (error) {
    message(error.message, true);
  } finally {
    qrLoading = false;
  }
};
productForm.onsubmit = (e) => {
  e.preventDefault();
  if (!productConfig || qrLoading) return;
  run(async () => {
    const f = productForm.elements,
      config = {
        month_fen: Math.round(Number(f.month.value) * 100),
        year_fen: Math.round(Number(f.year.value) * 100),
        wechat: f.wechat.value.trim(),
        service_text: f.service_text.value.trim(),
        qr_data: productConfig.qr_data,
        update: {
          enabled: f.enabled.checked,
          version: f.version.value.trim(),
          mode: f.mode.value,
          url: f.url.value.trim(),
          sha256: f.sha256.value.trim().toLowerCase(),
          size: Number(f.size.value),
          notes: f.notes.value,
        },
      };
    const result = await api("product", { revision: productRevision, config });
    productRevision = result.revision;
    productConfig = config;
    document.getElementById("product-status").textContent =
      "已保存。客户端下次联网检查后生效（通常 15 分钟内，也可手动检查）。";
  });
};
