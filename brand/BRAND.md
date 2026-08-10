# دليل الهوية البصرية — تطبيق تجريبي

الطابع: technical · الوضع: light · اللغة: ar

## الألوان
| الرمز | القيمة | الاستخدام |
| --- | --- | --- |
| `--color-primary` | `#2563eb` | primary |
| `--color-primary-600` | `#1350d4` | primary-600 |
| `--color-primary-700` | `#1042ae` | primary-700 |
| `--color-primary-100` | `#e9edf6` | primary-100 |
| `--color-primary-on` | `#ffffff` | primary-on |
| `--color-primary-text` | `#2563eb` | primary-text |
| `--color-accent` | `#e1491e` | accent |
| `--color-accent-on` | `#0b0f14` | accent-on |
| `--color-bg` | `#fbfbfb` | bg |
| `--color-surface` | `#ffffff` | surface |
| `--color-surface-2` | `#f5f6f7` | surface-2 |
| `--color-border` | `#e3e5e8` | border |
| `--color-text` | `#161a22` | text |
| `--color-muted` | `#5e6678` | muted |
| `--color-success` | `#258056` | success |
| `--color-warning` | `#9c670d` | warning |
| `--color-danger` | `#c32822` | danger |
| `--color-info` | `#2d6cb4` | info |

تباين WCAG المحسوب: النص/الخلفية 16.84:1 · النص الثانوي 5.56:1 · نص الزر الأساسي 5.17:1 (الحد الأدنى المقبول 4.5:1).

## الخطوط
- العناوين: IBM Plex Sans Arabic
- المتن: IBM Plex Sans Arabic
- الأحادي: JetBrains Mono
- وزنان فقط لكل عائلة (400 و 700)، و display=swap.

## القواعد
1. ممنوع أي قيمة لون أو مسافة مباشرة خارج `brand/tokens.css`.
2. كل عنصر تفاعلي: default / hover / focus-visible / active / disabled.
3. كل قائمة بيانات: skeleton / فارغ / خطأ / محتوى.
4. RTL: استخدم margin-inline و padding-inline و inset-inline.
5. الشعار: هامش حماية لا يقل عن نصف ارتفاع الرمز، ولا تُشوَّه نسبه.
