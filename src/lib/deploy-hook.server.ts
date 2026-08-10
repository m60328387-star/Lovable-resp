/** رابط خطّاف النشر على كونتابو مع قيم افتراضية حتى لو لم يُضبط PLATFORM_DEPLOY_URL. */
export function deployHookUrl(): string {
  const explicit = process.env["PLATFORM_DEPLOY_URL"];
  if (explicit && explicit.trim()) return explicit.trim();
  const ip = process.env["WEAVER_SERVER_IP"] ?? "194.163.155.52";
  const port = process.env["DEPLOY_HOOK_PORT"] ?? "8790";
  return `http://${ip}:${port}/deploy`;
}

/** يبني نقطة نهاية أخرى على نفس الخطّاف (status / domain …). */
export function deployHookEndpoint(path: string): string {
  return deployHookUrl().replace(/\/deploy\/?$/, path.startsWith("/") ? path : `/${path}`);
}
