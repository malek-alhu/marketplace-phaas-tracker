# AUTHORSHIP EVIDENCE — Russian-language strings in the page-builder subsystem

**Investigation note (technical reverse-engineering).** This document lists every distinct
Russian-language string recovered from the kit's page-builder admin panel and related code,
each with an English translation. It is provided as authorship/attribution evidence.

**Source chunks**
- `kit-source/decompressed/327d4aa1e539…js.txt` — builder admin panel + scenario i18n
- `kit-source/decompressed/dc7efb52ff51…js.txt` — styled components / Milanuncios victim page

## Key finding (language split)

The **operator/admin-facing** user interface — the entire WYSIWYG "page builder" used to
configure a phishing page — is written **entirely in Russian**. The **victim-facing** copy is
in **English** (scenario scripts) and **Spanish** (the Milanuncios verification lure). A kit
whose internal tooling is localized only in Russian, while its phishing output targets
Spanish/English victims, indicates a **Russian-speaking author/operator**.

Additional fingerprints:
- Default brand name **"Continental Group"** with logo asset **`/static/cg.png`**, also shown
  as a watermark inside the builder panel itself.
- styled-component `displayName`s preserve the author's source component name `VerifyMainBlock`
  (componentId prefix `sc-60ccd14a`).

**Distinct Russian (Cyrillic-containing) strings documented: 123** (excluding pure-Latin
labels such as "Twitter / X", "Facebook", "Instagram", "LinkedIn", "App Store",
"Google Play", "URL", "RTL", "Auto", "Home/About/Contact"). The numbered table below
enumerates these; rows are grouped by subsystem.

---

## Group 1 — Builder UI: panel chrome, sections, controls

| # | Russian (verbatim) | English |
|---|---|---|
| 1 | Панель настроек шаблона | Template settings panel |
| 2 | Перетащить | Drag |
| 3 | Перетащить панель | Drag panel |
| 4 | Скрыть панель | Hide panel |
| 5 | Открыть настройки | Open settings |
| 6 | Развернуть | Expand |
| 7 | Свернуть | Collapse |
| 8 | Удалить | Delete |
| 9 | Добавить пункт | Add item |
| 10 | Добавить кнопку | Add button |
| 11 | Быстрый старт | Quick start |
| 12 | Текст | Text |
| 13 | Текст названия | Name text |

### Accordion section titles
| # | Russian | English |
|---|---|---|
| 14 | Шапка | Header |
| 15 | Подвал | Footer |
| 16 | Типографика | Typography |
| 17 | Макет | Layout |
| 18 | Визуальные эффекты | Visual effects |
| 19 | Расширенные цвета | Advanced colors |
| 20 | Детальная видимость | Detailed visibility |

### Header section controls
| # | Russian | English |
|---|---|---|
| 21 | Вариант шапки | Header variant |
| 22 | Статичная | Static |
| 23 | Динамичная | Dynamic |
| 24 | Загрузить лого | Upload logo |
| 25 | Заменить лого | Replace logo |
| 26 | Закругление лого: | Logo rounding: |
| 27 | нет | none |
| 28 | круг | circle |
| 29 | Название рядом с лого | Name next to logo |
| 30 | Навигация | Navigation |
| 31 | Кнопки шапки | Header buttons |

### Button-variant labels (header action buttons)
| # | Russian | English |
|---|---|---|
| 32 | Основная | Primary |
| 33 | Без фона | No background (Ghost) |
| 34 | Вторичная | Secondary |
| 35 | Контур | Outline |

### Footer section controls
| # | Russian | English |
|---|---|---|
| 36 | Вариант подвала | Footer variant |
| 37 | Обычный | Standard |
| 38 | Скруглённый | Rounded |
| 39 | Табличный | Table |
| 40 | Позиция соцсетей/сторов | Position of social networks / store badges |
| 41 | Справа (default) | Right (default) |
| 42 | Слева | Left |
| 43 | Описание под лого | Description under logo |
| 44 | Краткое описание | Short description |
| 45 | Копирайт | Copyright |
| 46 | Соцсети | Social networks |
| 47 | Соцсети (пресеты) | Social networks (presets) |
| 48 | Бейджи магазинов | Store badges |
| 49 | Тема бейджей | Badge theme |
| 50 | Тёмная | Dark |
| 51 | Светлая | Light |
| 52 | Код страны (бейджи) | Country code (badges) |

### Typography section
| # | Russian | English |
|---|---|---|
| 53 | Шрифт названия (шапка) | Name font (header) |
| 54 | Шрифт контента | Content font |
| 55 | Поиск Google Fonts… | Search Google Fonts… |
| 56 | Загрузить свой шрифт | Upload custom font |
| 57 | Нет шрифтов | No fonts |
| 58 | (проверка…) | (checking…) |

### Layout section
| # | Russian | English |
|---|---|---|
| 59 | Слева товар, справа получатель | Product left, recipient right |
| 60 | Справа товар, слева получатель | Product right, recipient left |
| 61 | Сверху товар, снизу получатель | Product top, recipient bottom |
| 62 | Снизу товар, сверху получатель | Product bottom, recipient top |
| 63 | Позиция кнопки действия | Action button position |
| 64 | Снизу слева | Bottom left |
| 65 | Снизу справа | Bottom right |
| 66 | Снизу по центру | Bottom center |
| 67 | На всю ширину | Full width |
| 68 | Ширина контейнера | Container width |
| 69 | Обычная | Normal |
| 70 | Узкая | Narrow |
| 71 | Широкая | Wide |
| 72 | На весь экран | Full screen |

### Visual-effects section
| # | Russian | English |
|---|---|---|
| 73 | Закругление карточек и полей (px) | Card and field rounding (px) |
| 74 | Закругление кнопок (px) | Button rounding (px) |
| 75 | Тень карточек | Card shadow |
| 76 | Анимация карточек | Card animation |
| 77 | Справа налево (RTL) | Right to left (RTL) |
| 78 | Скорость анимаций | Animation speed |
| 79 | Без анимаций | No animations |
| 80 | Медленно | Slow |
| 81 | Обычно | Normal (frequency) |
| 82 | Быстро | Fast |

### Advanced-colors section
| # | Russian | English |
|---|---|---|
| 83 | Если не заданы — используются от цвета бренда. | If not set — derived from the brand color. |
| 84 | Фон карточек | Card background |
| 85 | Фон страницы | Page background |
| 86 | Цвет текста | Text color |
| 87 | Цвет бренда | Brand color |
| 88 | от бренда | from brand |

### Quick blocks / visibility
| # | Russian | English |
|---|---|---|
| 89 | Блоки на странице | Blocks on the page |
| 90 | Блоки | Blocks |
| 91 | Элементы внутри блоков | Elements inside blocks |
| 92 | Вариант основного блока | Main block variant |
| 93 | Обычный (две карточки) | Standard (two cards) |
| 94 | С шагами доставки | With delivery steps |
| 95 | Адаптивный | Adaptive |

---

## Group 2 — Scenario labels (scam playbook selectors)

| # | Russian | English | Notes |
|---|---|---|---|
| 96 | Сценарий | Scenario | the dropdown title |
| 97 | Метод | Method | the i18n content-key selector |
| 98 | Покупка (1.0) | Purchase (1.0) | method key `1_0` |
| 99 | Выплата (2.0) | Payout (2.0) | method key `2_0`; **token prefix `2/`** |
| 100 | 1.0 (покупка) | 1.0 (purchase) | Method dropdown form |
| 101 | 2.0 (выплата) | 2.0 (payout) | Method dropdown form |
| 102 | Верификация | Verification | |
| 103 | Доставка | Delivery | |
| 104 | Своя тема | Custom theme | |

> **Token-prefix attribution:** the per-victim token prefix **`2/` = the Выплата (Payout) 2.0
> scenario** (method key `2_0`). See `scenarios.js`.
>
> **Quirk preserved as evidence:** in the "Сценарий" dropdown the option *values* and *labels*
> are swapped (`value="purchase"` shows label "Выплата (2.0)"; `value="payout"` shows
> "Покупка (1.0)"). The "Метод" dropdown and `defaultDevState` (preset:"purchase",
> method:"2_0") are the authoritative mapping.

---

## Group 3 — Field / block labels (page element names)

These name the page elements toggled in "Детальная видимость" (Detailed visibility).

| # | Russian | English |
|---|---|---|
| 105 | Уведомление | Notification |
| 106 | Заголовок секции | Section header |
| 107 | Карточка товара | Product card |
| 108 | Карточка получателя | Recipient card |
| 109 | Плавающая кнопка | Floating button |
| 110 | Фото товара | Product photo |
| 111 | Название товара | Product name |
| 112 | Цена | Price |
| 113 | Детали товара | Product details |
| 114 | FAQ товара | Product FAQ |
| 115 | Условия | Terms |
| 116 | Имя | First name |
| 117 | Фамилия | Last name |
| 118 | Адрес | Address |
| 119 | Дисклеймер | Disclaimer |
| 120 | Заметка | Note |
| 121 | Заголовок | Title |
| 122 | Подзаголовок | Subtitle |
| 123 | Бейдж | Badge |

---

## Group 4 — Operator fraud scripts (victim-facing, NON-Russian)

Listed for completeness; these are **NOT** in the author's language but show the criminal
purpose of the Russian-localized tool. Full text is in `scenarios.js` and `styledComponents.js`.

- **English (Payout 2.0 / `2_0`):** "Payment Reserved", "The buyer has reserved payment…",
  "Accept Payment", "You must ship within 5-7 business days after accepting." (fake-escrow lure).
- **English (Purchase 1.0 / `1_0`):** "Payout Ready", "Your sale is complete. Claim your payout
  now.", "Get Payout" (fake-earnings lure).
- **Spanish (Verification scenario, Milanuncios):** "Su cuenta de Milanuncios está
  restringida…", "Confirma tus datos bancarios en un plazo de 24 horas…", "Verificar"
  (bank-detail-capture / urgency lure).

---

## Counting note

The **count of DISTINCT Russian (Cyrillic-containing) strings** documented across the builder
UI, scenario labels, and field labels is **123**. This excludes pure-Latin UI labels
("Twitter / X", "Facebook", "Instagram", "LinkedIn", "App Store", "Google Play", "URL",
"RTL", "Auto", "Home/About/Contact"), which appear in the bundle but are not author-language
evidence. The English (scenario) and Spanish (Milanuncios) strings in Group 4 are
victim-facing lure copy, counted separately and not included in the 123.
