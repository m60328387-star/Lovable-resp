/**
 * سجل الروابط (Connectors) المجانية لـ Weaver.
 * كل رابط يعتمد مفتاحاً يُحفظ في «مفاتيح المشروع» (project_secrets) — بلا اشتراكات وسيطة.
 */

export type ConnectorAuth =
  | { kind: "bearer" }
  | { kind: "header"; header: string }
  | { kind: "query"; param: string }
  | { kind: "path" }
  | { kind: "none" };

export type Connector = {
  id: string;
  name: string;
  category: "تواصل" | "بيانات" | "محتوى" | "تطوير" | "ذكاء" | "خدمات";
  baseUrl: string;
  /** اسم المفتاح المطلوب داخل مفاتيح المشروع، أو null إن لم يلزم مفتاح. */
  secret: string | null;
  auth: ConnectorAuth;
  free: string;
  docs: string;
  examples: string[];
  extraHeaders?: Record<string, string>;
};

export const CONNECTORS: Connector[] = [
  {
    id: "telegram",
    name: "Telegram Bot",
    category: "تواصل",
    baseUrl: "https://api.telegram.org/bot{key}",
    secret: "TELEGRAM_BOT_TOKEN",
    auth: { kind: "path" },
    free: "مجاني بالكامل بلا حدود عملية.",
    docs: "https://core.telegram.org/bots/api",
    examples: ["/getMe", "/sendMessage?chat_id=123&text=مرحباً"],
  },
  {
    id: "discord",
    name: "Discord Webhook",
    category: "تواصل",
    baseUrl: "https://discord.com/api/webhooks",
    secret: "DISCORD_WEBHOOK_PATH",
    auth: { kind: "none" },
    free: "مجاني — الويبهوك يُنشأ من إعدادات القناة.",
    docs: "https://discord.com/developers/docs/resources/webhook",
    examples: ["/{DISCORD_WEBHOOK_PATH}"],
  },
  {
    id: "slack",
    name: "Slack Incoming Webhook",
    category: "تواصل",
    baseUrl: "https://hooks.slack.com/services",
    secret: "SLACK_WEBHOOK_PATH",
    auth: { kind: "none" },
    free: "مجاني ضمن خطة Slack المجانية.",
    docs: "https://api.slack.com/messaging/webhooks",
    examples: ["/{SLACK_WEBHOOK_PATH}"],
  },
  {
    id: "resend",
    name: "Resend (بريد)",
    category: "تواصل",
    baseUrl: "https://api.resend.com",
    secret: "RESEND_API_KEY",
    auth: { kind: "bearer" },
    free: "3000 رسالة شهرياً مجاناً.",
    docs: "https://resend.com/docs/api-reference",
    examples: ["/emails", "/domains"],
  },
  {
    id: "github",
    name: "GitHub API",
    category: "تطوير",
    baseUrl: "https://api.github.com",
    secret: "GITHUB_TOKEN",
    auth: { kind: "bearer" },
    free: "5000 طلب/ساعة للحساب المجاني.",
    docs: "https://docs.github.com/rest",
    examples: ["/user/repos", "/repos/{owner}/{repo}/issues"],
  },
  {
    id: "notion",
    name: "Notion",
    category: "محتوى",
    baseUrl: "https://api.notion.com/v1",
    secret: "NOTION_TOKEN",
    auth: { kind: "bearer" },
    free: "مجاني للمساحات الشخصية.",
    docs: "https://developers.notion.com/reference",
    examples: ["/users/me", "/search"],
    extraHeaders: { "Notion-Version": "2022-06-28" },
  },
  {
    id: "airtable",
    name: "Airtable",
    category: "بيانات",
    baseUrl: "https://api.airtable.com/v0",
    secret: "AIRTABLE_TOKEN",
    auth: { kind: "bearer" },
    free: "1000 سجل لكل قاعدة مجاناً.",
    docs: "https://airtable.com/developers/web/api/introduction",
    examples: ["/{baseId}/{tableName}?maxRecords=20"],
  },
  {
    id: "supabase_rest",
    name: "Supabase REST (خارجي)",
    category: "بيانات",
    baseUrl: "{SUPABASE_TARGET_URL}/rest/v1",
    secret: "SUPABASE_TARGET_KEY",
    auth: { kind: "header", header: "apikey" },
    free: "مشروع مجاني دائم.",
    docs: "https://supabase.com/docs/guides/api",
    examples: ["/table_name?select=*&limit=10"],
  },
  {
    id: "unsplash",
    name: "Unsplash (صور)",
    category: "محتوى",
    baseUrl: "https://api.unsplash.com",
    secret: "UNSPLASH_ACCESS_KEY",
    auth: { kind: "header", header: "Authorization" },
    free: "50 طلب/ساعة مجاناً.",
    docs: "https://unsplash.com/documentation",
    examples: ["/search/photos?query=office&per_page=10"],
  },
  {
    id: "openweather",
    name: "OpenWeather",
    category: "خدمات",
    baseUrl: "https://api.openweathermap.org/data/2.5",
    secret: "OPENWEATHER_API_KEY",
    auth: { kind: "query", param: "appid" },
    free: "1000 نداء يومياً مجاناً.",
    docs: "https://openweathermap.org/api",
    examples: ["/weather?q=Beirut&units=metric&lang=ar"],
  },
  {
    id: "exchangerate",
    name: "أسعار العملات",
    category: "بيانات",
    baseUrl: "https://open.er-api.com/v6",
    secret: null,
    auth: { kind: "none" },
    free: "مجاني بلا مفتاح.",
    docs: "https://www.exchangerate-api.com/docs/free",
    examples: ["/latest/USD"],
  },
  {
    id: "worldbank",
    name: "بيانات البنك الدولي",
    category: "بيانات",
    baseUrl: "https://api.worldbank.org/v2",
    secret: null,
    auth: { kind: "none" },
    free: "مجاني بلا مفتاح.",
    docs: "https://datahelpdesk.worldbank.org/knowledgebase/topics/125589",
    examples: ["/country/LBN/indicator/NY.GDP.MKTP.CD?format=json"],
  },
  {
    id: "openalex",
    name: "OpenAlex (أبحاث)",
    category: "بيانات",
    baseUrl: "https://api.openalex.org",
    secret: null,
    auth: { kind: "none" },
    free: "مجاني بلا مفتاح.",
    docs: "https://docs.openalex.org",
    examples: ["/works?search=llm+agents&per-page=10"],
  },
  {
    id: "hn",
    name: "Hacker News",
    category: "محتوى",
    baseUrl: "https://hn.algolia.com/api/v1",
    secret: null,
    auth: { kind: "none" },
    free: "مجاني بلا مفتاح.",
    docs: "https://hn.algolia.com/api",
    examples: ["/search?query=ai&hitsPerPage=10"],
  },
  {
    id: "wikipedia",
    name: "ويكيبيديا",
    category: "محتوى",
    baseUrl: "https://ar.wikipedia.org/api/rest_v1",
    secret: null,
    auth: { kind: "none" },
    free: "مجاني بلا مفتاح.",
    docs: "https://ar.wikipedia.org/api/rest_v1/",
    examples: ["/page/summary/الذكاء_الاصطناعي"],
  },
  {
    id: "cloudflare",
    name: "Cloudflare (DNS/نشر)",
    category: "خدمات",
    baseUrl: "https://api.cloudflare.com/client/v4",
    secret: "CLOUDFLARE_API_TOKEN",
    auth: { kind: "bearer" },
    free: "الخطة المجانية تكفي DNS والنشر.",
    docs: "https://developers.cloudflare.com/api/",
    examples: ["/zones", "/zones/{zone_id}/dns_records"],
  },
];

export function findConnector(id: string): Connector | undefined {
  return CONNECTORS.find((c) => c.id === id);
}
