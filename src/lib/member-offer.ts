import wechatQr from "../assets/wechat-contact.png";

// Public contact information only. Never used for entitlement or update checks.
export const bundledMemberOffer = {
  month_fen: 990,
  year_fen: 9900,
  wechat: "Tens__",
  qr_data: wechatQr,
  service_text: "一对一系统优化 · 硬件超频调校，联系微信咨询。",
};

export function memberOffer(config: ProductConfig | null | undefined) {
  return config
    ? { ...config, service_text: config.service_text ?? bundledMemberOffer.service_text }
    : bundledMemberOffer;
}
