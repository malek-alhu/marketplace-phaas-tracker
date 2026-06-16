/**
 * templateSettingsPanel.js  — RECONSTRUCTED from minified Next.js 16.2.7 production bundle
 *
 * TECHNICAL REVERSE-ENGINEERING FOR SECURITY RESEARCH — SOURCE DOCUMENTATION, NOT EXECUTABLE.
 *
 * Source chunks:
 *   kit-source/decompressed/327d4aa1e539...js.txt   (this panel + scenario i18n)
 *   kit-source/decompressed/dc7efb52ff51...js.txt   (styled components / Milanuncios page)
 *
 * WHAT THIS IS
 * ------------
 * This is the in-page WYSIWYG "page builder" admin panel that the kit operator uses to
 * customise a phishing page before deploying it against victims. It is a draggable,
 * collapsible floating panel (`role="region"` aria-label "Панель настроек шаблона" =
 * "Template settings panel"). The ENTIRE operator-facing UI is written in RUSSIAN, while
 * the victim-facing fraud copy (scenario text) is in English/Spanish. This language split
 * is strong authorship evidence: the kit AUTHOR/OPERATOR is Russian-speaking.
 *
 * The panel is internally keyed off a dev-state object (`defaultDevState`, see bottom).
 * Minified single-letter identifiers from the bundle have been renamed to readable names;
 * where a behaviour is inferred rather than certain it is marked // RECONSTRUCTED-APPROX.
 *
 * EVERY Russian label is preserved verbatim with an inline English translation.
 */

import React, { useState, useRef, useEffect, useCallback } from "react";
import { cn } from "../lib/cn";                       // (0,r.cn) class-name joiner
import NextImage from "next/image";                   // z.default
import { ChevronDown } from "lucide-react";           // eO.ChevronDown
import { LayoutGrid } from "lucide-react";            // eH.LayoutGrid
import { Eye } from "lucide-react";                   // eB.Eye
// Custom inline SVG icon components (renamed): IconHide=eW, IconDrag=eI, IconCollapse=eD,
// IconExpand, IconUploadLogo=eE, IconUploadFont=eJ, IconTypography=eZ, IconHeader=e$,
// IconFooter=eV, IconVisual=e_, IconColors=eU, IconSettingsGear=eY, IconTrash=eK, IconPlus=eG

/* =========================================================================================
 * LABEL DICTIONARIES (verbatim Russian -> English)
 * These two maps drive the dynamic <select>/checkbox label text and are the densest single
 * source of Russian-language UI strings in the bundle.
 * ======================================================================================= */

// e8 — header-action button "variant" display names
const BUTTON_VARIANT_LABELS = {
  primary:   "Основная",   // "Primary"
  ghost:     "Без фона",   // "No background" / "Ghost"
  secondary: "Вторичная",  // "Secondary"
  outline:   "Контур",     // "Outline"
};

// e7 — display labels for every toggleable page BLOCK and inner ELEMENT (used by the
// "Детальная видимость" / "Detailed visibility" section checkboxes)
const BLOCK_ELEMENT_LABELS = {
  header:               "Шапка",                 // "Header"
  footer:               "Подвал",                // "Footer"
  notification:         "Уведомление",           // "Notification"
  sectionHeader:        "Заголовок секции",       // "Section header"
  productCard:          "Карточка товара",        // "Product card"
  recipientCard:        "Карточка получателя",    // "Recipient card"
  floatingBar:          "Плавающая кнопка",       // "Floating button"
  productImage:         "Фото товара",            // "Product photo"
  productName:          "Название товара",        // "Product name"
  productPrice:         "Цена",                   // "Price"
  productDetails:       "Детали товара",          // "Product details"
  productFaq:           "FAQ товара",             // "Product FAQ"
  productTerms:         "Условия",                // "Terms"
  recipientFirstName:   "Имя",                    // "First name"
  recipientLastName:    "Фамилия",                // "Last name"
  recipientAddress:     "Адрес",                  // "Address"
  recipientDisclaimer:  "Дисклеймер",             // "Disclaimer"
  recipientNote:        "Заметка",                // "Note"
  sectionTitle:         "Заголовок",              // "Title"
  sectionSubtitle:      "Подзаголовок",           // "Subtitle"
  sectionBadge:         "Бейдж",                  // "Badge"
  footerSocialPresets:  "Соцсети (пресеты)",      // "Social networks (presets)"
  footerStoreBadges:    "Бейджи магазинов",       // "Store badges"
};

// e9 — which accordion sections start collapsed (false = closed)
const DEFAULT_OPEN_SECTIONS = {
  header: false, footer: false, typography: false,
  layout: false, visual: false, colors: false, visibility: false, // RECONSTRUCTED-APPROX
};

/* =========================================================================================
 * MAIN PANEL COMPONENT  (renamed from minified function expression)
 *
 * Props (inferred):
 *   state           = e   current builder state (see defaultDevState)
 *   patchState      = I   ({...}) => void  shallow-merge a patch into state
 *   setBlockVisible = E   (key, checked) => void  toggle a block/element on/off
 *   setPreset       = i   (presetValue) => void  apply a scam-scenario preset
 *   open/setOpen    = n/l  panel visible?
 *   collapsed/setCollapsed = d/c  panel collapsed to title bar only?
 *   openSections/toggleSection = f/h  accordion open-state per section
 *   panelPos        = u   {x,y} draggable position
 * ======================================================================================= */
export function TemplateSettingsPanel({
  state,
  patchState,        // I(...)
  setBlockVisible,   // E(key, checked)
  setPreset,         // i(value)
}) {
  const [open, setOpen] = useState(false);          // n / l(...)
  const [collapsed, setCollapsed] = useState(false); // d / c(...)
  const [openSections, setOpenSections] = useState(DEFAULT_OPEN_SECTIONS); // f / h(...)
  const [panelPos] = useState({ x: 20, y: 20 });    // u — initial position {x:20,y:20}

  const logoFileInput = useRef(null);   // A — hidden <input type=file> for logo upload
  const brandFontInput = useRef(null);  // O — hidden <input type=file> for brand font upload
  const contentFontInput = useRef(null);// q — hidden <input type=file> for content font upload

  const toggleSection = (id) =>
    setOpenSections((s) => ({ ...s, [id]: !s[id] })); // h(id)

  // ---------------------------------------------------------------------------------------
  // PANEL TITLE BAR  (Z) — drag handle + hide + collapse controls
  // ---------------------------------------------------------------------------------------
  const titleBar = (
    <div className="flex cursor-grab items-center gap-2 border-b border-gray-200 bg-gray-50/80 px-2 py-1.5 active:cursor-grabbing">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(false); }}
        aria-label="Скрыть панель"          /* "Hide panel" */
        className="..."
      >
        {/* IconHide */}
      </button>
      <div
        className="flex min-w-0 flex-1 items-center gap-1.5"
        role="button"
        tabIndex={0}
        aria-label="Перетащить панель"        /* "Drag panel" */
        onMouseDown={/* begin drag */ undefined}
      >
        {/* IconDrag */}
        <span className="select-none text-xs text-gray-500">
          Перетащить{/* "Drag" */}
        </span>
      </div>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setCollapsed((v) => !v); }}
        aria-label={collapsed ? "Развернуть" : "Свернуть"} /* "Expand" : "Collapse" */
        className="..."
      >
        {/* collapsed ? IconExpand : IconCollapse */}
      </button>
    </div>
  );

  // ---------------------------------------------------------------------------------------
  // SECTION: "Быстрый старт" = "Quick start"  (J)
  // Scenario + method pickers. NOTE the scenario value/label mismatch documented in
  // scenarios.js — operator picks the scam playbook here.
  // ---------------------------------------------------------------------------------------
  const quickStartSection = (
    <>
      <div className="mb-3 font-medium text-gray-800">
        Быстрый старт{/* "Quick start" */}
      </div>
      <div className="grid grid-cols-2 gap-x-2 gap-y-2 mb-3">
        <div>
          <label className="...">Сценарий{/* "Scenario" */}</label>
          <select value={state.preset} onChange={(e) => setPreset(e.target.value)}>
            {/* WARNING: value/label are SWAPPED in the source — see scenarios.js */}
            <option value="purchase">Выплата (2.0){/* "Payout (2.0)" */}</option>
            <option value="payout">Покупка (1.0){/* "Purchase (1.0)" */}</option>
            <option value="verify">Верификация{/* "Verification" */}</option>
            <option value="delivery">Доставка{/* "Delivery" */}</option>
            <option value="custom">Своя тема{/* "Custom theme" */}</option>
          </select>
        </div>
        <div>
          <label className="...">Метод{/* "Method" */}</label>
          {/* `method` is the i18n content key actually used to render the victim page. */}
          <select value={state.method} onChange={(e) => patchState({ method: e.target.value })}>
            <option value="2_0">2.0 (выплата){/* "2.0 (payout)" */}</option>
            <option value="1_0">1.0 (покупка){/* "1.0 (purchase)" */}</option>
            <option value="verify">Верификация{/* "Verification" */}</option>
          </select>
        </div>
        <div className="col-span-2">
          <label className="...">Вариант основного блока{/* "Main block variant" */}</label>
          <select value={state.variant} onChange={(e) => patchState({ variant: e.target.value })}>
            <option value="base">Обычный (две карточки){/* "Standard (two cards)" */}</option>
            <option value="delivery">С шагами доставки{/* "With delivery steps" */}</option>
            <option value="adaptive">Адаптивный{/* "Adaptive" */}</option>
          </select>
        </div>
      </div>

      {/* Brand colour */}
      <label className="...">Цвет бренда{/* "Brand color" */}</label>
      <div className="flex gap-2 mb-3">
        <input type="color" value={state.themeBrand}
               onChange={(e) => patchState({ themeBrand: e.target.value })} />
        <input type="text" value={state.themeBrand}
               onChange={(e) => patchState({ themeBrand: e.target.value })} />
      </div>

      {/* Quick block on/off toggles */}
      <div className="...">Блоки на странице{/* "Blocks on the page" */}</div>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 mb-3">
        <label><input type="checkbox" checked={state.blocks.header !== false}
                 onChange={(e) => setBlockVisible("header", e.target.checked)} />Шапка{/* "Header" */}</label>
        <label><input type="checkbox" checked={state.blocks.footer !== false}
                 onChange={(e) => setBlockVisible("footer", e.target.checked)} />Подвал{/* "Footer" */}</label>
        <label><input type="checkbox" checked={state.blocks.notification !== false}
                 onChange={(e) => setBlockVisible("notification", e.target.checked)} />Уведомление{/* "Notification" */}</label>
      </div>
    </>
  );

  // ---------------------------------------------------------------------------------------
  // ACCORDION SECTIONS (X). `te` is a collapsible <Section> wrapper:
  //   <Section id label open onToggle icon className>...</Section>
  // ---------------------------------------------------------------------------------------
  const accordionSections = (
    <>
      {/* ---- SECTION: "Шапка" = "Header" ---- */}
      <Section id="header" label="Шапка" /* "Header" */
               open={openSections.header} onToggle={() => toggleSection("header")}>
        <label>Вариант шапки{/* "Header variant" */}</label>
        <select value={state.headerVariant}
                onChange={(e) => patchState({ headerVariant: e.target.value })}>
          <option value="static">Статичная{/* "Static" */}</option>
          <option value="dynamic">Динамичная{/* "Dynamic" */}</option>
        </select>

        {/* Logo upload / replace */}
        <input ref={logoFileInput} type="file" accept="image/*" className="hidden"
               onChange={/* V: read file -> data URL -> patchState({logoUrl}) */ undefined} />
        <button type="button" onClick={() => logoFileInput.current?.click()}>
          {state.logoUrl
            ? <>{/* preview */}<span>Заменить лого{/* "Replace logo" */}</span></>
            : <><span>Загрузить лого{/* "Upload logo" */}</span></>}
        </button>

        {/* Logo corner radius slider */}
        {state.logoUrl && (
          <div className="mb-2">
            <label>
              Закругление лого:{/* "Logo rounding:" */}{" "}
              {state.logoRounded === 0 ? "нет"        /* "none" */
               : state.logoRounded === 24 ? "круг"    /* "circle" */
               : `${state.logoRounded} px`}
            </label>
            <input type="range" min={0} max={24} value={state.logoRounded}
                   onChange={(e) => patchState({ logoRounded: Number(e.target.value) })} />
          </div>
        )}

        <label>Название рядом с лого{/* "Name next to logo" */}</label>
        <input type="text" value={state.brandName} placeholder="Текст названия" /* "Name text" */
               onChange={(e) => patchState({ brandName: e.target.value })} />

        {/* Header navigation editor */}
        <div className="...">Навигация{/* "Navigation" */}</div>
        {state.headerNav.map((item, idx) => (
          <div key={idx}>
            <input value={item.label} placeholder="Текст" /* "Text" */ onChange={/* edit label */ undefined} />
            <input value={item.href} placeholder="URL" onChange={/* edit href */ undefined} />
            <button aria-label="Удалить" /* "Delete" */ onClick={/* remove item */ undefined} />
          </div>
        ))}
        <button onClick={() => patchState({ headerNav: [...state.headerNav, { label: "", href: "#" }] })}>
          Добавить пункт{/* "Add item" */}
        </button>

        {/* Header action buttons editor */}
        <div className="...">Кнопки шапки{/* "Header buttons" */}</div>
        {state.headerActions.map((item, idx) => (
          <div key={idx}>
            <select value={item.variant} onChange={/* edit variant */ undefined}>
              {Object.entries(BUTTON_VARIANT_LABELS).map(([v, label]) => (
                <option key={v} value={v}>{label}</option>
              ))}
            </select>
            <input value={item.label} placeholder="Текст" /* "Text" */ onChange={/* edit label */ undefined} />
            <input value={item.href} placeholder="URL" onChange={/* edit href */ undefined} />
            <button aria-label="Удалить" /* "Delete" */ onClick={/* remove */ undefined} />
          </div>
        ))}
        <button onClick={() => patchState({ headerActions: [...state.headerActions, { variant: "ghost", label: "", href: "#" }] })}>
          Добавить кнопку{/* "Add button" */}
        </button>
      </Section>

      {/* ---- SECTION: "Подвал" = "Footer" ---- */}
      <Section id="footer" label="Подвал" /* "Footer" */
               open={openSections.footer} onToggle={() => toggleSection("footer")}>
        <label>Вариант подвала{/* "Footer variant" */}</label>
        <select value={state.footerVariant} onChange={(e) => patchState({ footerVariant: e.target.value })}>
          <option value="default">Обычный{/* "Standard" */}</option>
          <option value="rounded">Скруглённый{/* "Rounded" */}</option>
          <option value="table">Табличный{/* "Table" */}</option>
        </select>

        <label>Позиция соцсетей/сторов{/* "Position of social networks / store badges" */}</label>
        <select value={state.footerSocialStoresAlign}
                onChange={(e) => patchState({ footerSocialStoresAlign: e.target.value })}>
          <option value="right">Справа (default){/* "Right (default)" */}</option>
          <option value="left">Слева{/* "Left" */}</option>
        </select>

        <label>Описание под лого{/* "Description under logo" */}</label>
        <input type="text" value={state.footerDescription} placeholder="Краткое описание" /* "Short description" */
               onChange={(e) => patchState({ footerDescription: e.target.value })} />

        <label>Копирайт{/* "Copyright" */}</label>
        <input type="text" value={state.footerCopyright}
               placeholder={`© ${new Date().getFullYear()}`}
               onChange={(e) => patchState({ footerCopyright: e.target.value })} />

        {/* Social network links */}
        <label className="... font-semibold">Соцсети{/* "Social networks" */}</label>
        <label>Twitter / X</label>
        <input value={state.socialTwitter} placeholder="https://twitter.com/..." onChange={/* */ undefined} />
        <label>Facebook</label>
        <input value={state.socialFacebook} placeholder="https://facebook.com/..." onChange={/* */ undefined} />
        <label>Instagram</label>
        <input value={state.socialInstagram} placeholder="https://instagram.com/..." onChange={/* */ undefined} />
        <label>LinkedIn</label>
        <input value={state.socialLinkedin} placeholder="https://linkedin.com/..." onChange={/* */ undefined} />

        {/* App store badges */}
        <label className="... font-semibold">Бейджи магазинов{/* "Store badges" */}</label>
        <label>App Store</label>
        <input value={state.storeAppStore} placeholder="https://apps.apple.com/..." onChange={/* */ undefined} />
        <label>Google Play</label>
        <input value={state.storeGooglePlay} placeholder="https://play.google.com/..." onChange={/* */ undefined} />

        <label>Тема бейджей{/* "Badge theme" */}</label>
        <select value={state.storeBadgeTheme} onChange={(e) => patchState({ storeBadgeTheme: e.target.value })}>
          <option value="dark">Тёмная{/* "Dark" */}</option>
          <option value="light">Светлая{/* "Light" */}</option>
        </select>

        <label>Код страны (бейджи){/* "Country code (badges)" */}</label>
        <input value={state.storeCountryCode} placeholder="us"
               onChange={(e) => patchState({ storeCountryCode: e.target.value.toLowerCase() })} />
      </Section>

      {/* ---- SECTION: "Типографика" = "Typography" ---- */}
      <Section id="typography" label="Типографика" /* "Typography" */
               open={openSections.typography} onToggle={() => toggleSection("typography")}>
        <label>Шрифт названия (шапка){/* "Name font (header)" */}</label>
        {/* Google Fonts search combobox + custom font upload */}
        <input placeholder="Поиск Google Fonts…" /* "Search Google Fonts…" */ onChange={/* */ undefined} />
        <input ref={brandFontInput} type="file"
               accept=".woff2,.woff,.ttf,.otf,font/woff2,font/woff,font/ttf,font/otf" className="hidden"
               onChange={/* upload brand font */ undefined} />
        <button type="button" title="Загрузить свой шрифт" /* "Upload custom font" */
                onClick={() => brandFontInput.current?.click()} />
        {/* dropdown empty-state: "Нет шрифтов" = "No fonts"; loading suffix " (проверка…)" = " (checking…)" */}

        <label>Шрифт контента{/* "Content font" */}</label>
        <input placeholder="Поиск Google Fonts…" /* "Search Google Fonts…" */ onChange={/* */ undefined} />
        <input ref={contentFontInput} type="file"
               accept=".woff2,.woff,.ttf,.otf,font/woff2,font/woff,font/ttf,font/otf" className="hidden"
               onChange={/* upload content font */ undefined} />
        <button type="button" title="Загрузить свой шрифт" /* "Upload custom font" */
                onClick={() => contentFontInput.current?.click()} />
      </Section>

      {/* ---- SECTION: "Макет" = "Layout" ---- */}
      <Section id="layout" label="Макет" /* "Layout" */ icon={<LayoutGrid />}
               open={openSections.layout} onToggle={() => toggleSection("layout")}>
        <select value={state.cardsOrder ?? ""} onChange={(e) => patchState({ cardsOrder: e.target.value || undefined })}>
          <option value="left-right">Слева товар, справа получатель{/* "Product left, recipient right" */}</option>
          <option value="right-left">Справа товар, слева получатель{/* "Product right, recipient left" */}</option>
          <option value="top-bottom">Сверху товар, снизу получатель{/* "Product top, recipient bottom" */}</option>
          <option value="bottom-top">Снизу товар, сверху получатель{/* "Product bottom, recipient top" */}</option>
        </select>

        <label>Позиция кнопки действия{/* "Action button position" */}</label>
        <select value={state.ctaPosition ?? ""} onChange={(e) => patchState({ ctaPosition: e.target.value || undefined })}>
          <option value="bottom-left">Снизу слева{/* "Bottom left" */}</option>
          <option value="bottom-right">Снизу справа{/* "Bottom right" */}</option>
          <option value="bottom-center">Снизу по центру{/* "Bottom center" */}</option>
          <option value="bottom-full">На всю ширину{/* "Full width" */}</option>
        </select>

        <label>Ширина контейнера{/* "Container width" */}</label>
        <select value={state.containerWidth ?? ""} onChange={(e) => patchState({ containerWidth: e.target.value || undefined })}>
          <option value="default">Обычная{/* "Normal" */}</option>
          <option value="narrow">Узкая{/* "Narrow" */}</option>
          <option value="wide">Широкая{/* "Wide" */}</option>
          <option value="full">На весь экран{/* "Full screen" */}</option>
        </select>
      </Section>

      {/* ---- SECTION: "Визуальные эффекты" = "Visual effects" ---- */}
      <Section id="visual" label="Визуальные эффекты" /* "Visual effects" */
               open={openSections.visual} onToggle={() => toggleSection("visual")}>
        <label>Закругление карточек и полей (px){/* "Card and field rounding (px)" */}</label>
        <input type="range" min={0} max={24} value={state.themeRadius}
               onChange={(e) => patchState({ themeRadius: Number(e.target.value) })} />

        <label>Закругление кнопок (px){/* "Button rounding (px)" */}</label>
        <input type="range" min={0} max={24} value={state.themeButtonRadius}
               onChange={(e) => patchState({ themeButtonRadius: Number(e.target.value) })} />
        {/* slider display: themeButtonRadius>=24 ? "Auto" : `${n}px` */}

        <label><input type="checkbox" checked={state.cardShadow}
                 onChange={(e) => patchState({ cardShadow: e.target.checked })} />Тень карточек{/* "Card shadow" */}</label>
        <label><input type="checkbox" checked={state.animateCards}
                 onChange={(e) => patchState({ animateCards: e.target.checked })} />Анимация карточек{/* "Card animation" */}</label>
        <label><input type="checkbox" checked={state.rtl}
                 onChange={(e) => patchState({ rtl: e.target.checked })} />Справа налево (RTL){/* "Right to left (RTL)" */}</label>

        <label>Скорость анимаций{/* "Animation speed" */}</label>
        <select value={state.animSpeed} onChange={(e) => patchState({ animSpeed: e.target.value })}>
          <option value="none">Без анимаций{/* "No animations" */}</option>
          <option value="reduced">Медленно{/* "Slow" */}</option>
          <option value="normal">Обычно{/* "Normal" */}</option>
          <option value="fast">Быстро{/* "Fast" */}</option>
        </select>
      </Section>

      {/* ---- SECTION: "Расширенные цвета" = "Advanced colors" ---- */}
      <Section id="colors" label="Расширенные цвета" /* "Advanced colors" */
               open={openSections.colors} onToggle={() => toggleSection("colors")}>
        <p>Если не заданы — используются от цвета бренда.{/* "If not set — derived from the brand color." */}</p>

        <label>Фон карточек{/* "Card background" */}</label>
        <input type="color" value={state.themeSurface || state.themeBrand}
               onChange={(e) => patchState({ themeSurface: e.target.value })} />
        <input type="text" value={state.themeSurface} placeholder="от бренда" /* "from brand" */
               onChange={(e) => patchState({ themeSurface: e.target.value })} />

        <label>Фон страницы{/* "Page background" */}</label>
        <input type="color" value={state.themeBackground || state.themeBrand}
               onChange={(e) => patchState({ themeBackground: e.target.value })} />
        <input type="text" value={state.themeBackground} placeholder="от бренда" /* "from brand" */
               onChange={(e) => patchState({ themeBackground: e.target.value })} />

        <label>Цвет текста{/* "Text color" */}</label>
        <input type="color" value={state.themeForeground || state.themeBrand}
               onChange={(e) => patchState({ themeForeground: e.target.value })} />
        <input type="text" value={state.themeForeground} placeholder="от бренда" /* "from brand" */
               onChange={(e) => patchState({ themeForeground: e.target.value })} />
      </Section>

      {/* ---- SECTION: "Детальная видимость" = "Detailed visibility" ---- */}
      <Section id="visibility" label="Детальная видимость" /* "Detailed visibility" */ icon={<Eye />}
               open={openSections.visibility} onToggle={() => toggleSection("visibility")}>
        <div className="...">Блоки{/* "Blocks" */}</div>
        <div className="grid grid-cols-2 ...">
          {["header","footer","notification","sectionHeader","productCard","recipientCard","floatingBar"].map((key) => (
            <label key={key}>
              <input type="checkbox" checked={state.blocks[key] !== false}
                     onChange={(e) => setBlockVisible(key, e.target.checked)} />
              <span>{BLOCK_ELEMENT_LABELS[key]}</span>
            </label>
          ))}
        </div>

        <div className="...">Элементы внутри блоков{/* "Elements inside blocks" */}</div>
        <div className="grid grid-cols-2 ...">
          {["productImage","productName","productPrice","productDetails","productFaq","productTerms",
            "recipientFirstName","recipientLastName","recipientAddress","recipientDisclaimer","recipientNote",
            "sectionTitle","sectionSubtitle","sectionBadge"].map((key) => (
            <label key={key}>
              <input type="checkbox" checked={state.blocks[key] !== false}
                     onChange={(e) => setBlockVisible(key, e.target.checked)} />
              <span>{BLOCK_ELEMENT_LABELS[key]}</span>
            </label>
          ))}
        </div>
      </Section>
    </>
  );

  // ---------------------------------------------------------------------------------------
  // RENDER: floating "gear" button + draggable panel container
  // ---------------------------------------------------------------------------------------
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
              aria-label="Открыть настройки" /* "Open settings" */
              style={{ display: open ? "none" : "flex" }} className="fixed bottom-4 right-4 ...">
        {/* IconSettingsGear */}
      </button>

      <div role="region" aria-label="Панель настроек шаблона" /* "Template settings panel" */
           style={{ left: panelPos.x, top: panelPos.y, width: 360,
                    visibility: open ? "visible" : "hidden",
                    pointerEvents: open ? "auto" : "none" }}
           className="fixed z-9998 flex flex-col ...">
        {titleBar}
        {!collapsed && (
          <div className="flex flex-1 flex-col overflow-y-auto p-3 text-sm">
            {/* Operator branding watermark inside the panel */}
            <div className="mb-3 flex items-center gap-2 ...">
              <NextImage src="/static/cg.png" alt="" width={28} height={28} />
              <span className="text-xs font-medium text-gray-600">Continental Group</span>
            </div>
            {quickStartSection}
            {accordionSections}
          </div>
        )}
      </div>
    </>
  );
}

/* =========================================================================================
 * defaultDevState — the builder's initial state object (exported in bundle as "defaultDevState")
 * Documents the kit's default scenario, brand and layout. The default brand "Continental
 * Group" + logo "/static/cg.png" are recurring kit-author fingerprints.
 * ======================================================================================= */
export const defaultDevState = {
  preset: "purchase",          // selected scam scenario preset (see scenarios.js / value mismatch)
  method: "2_0",               // i18n content key actually rendered -> "2_0" = Payout 2.0 scenario
  variant: "base",             // main block variant ("Обычный (две карточки)")
  themeBrand: "#1d4ed8",
  themeSurface: "",
  themeBackground: "",
  themeForeground: "",
  themeRadius: 10,
  themeButtonRadius: 24,
  cardShadow: true,
  rtl: false,
  cardsOrder: "left-right",
  ctaPosition: "bottom-left",
  containerWidth: "default",
  blocks: {
    header: true, footer: true, notification: true, sectionHeader: true,
    productCard: true, recipientCard: true, floatingBar: true,
  },
  animSpeed: "normal",
  animateCards: true,
  logoUrl: "/static/cg.png",   // default operator logo
  logoRounded: 0,
  brandName: "Continental Group", // default operator brand name
  brandNameFont: "",
  brandNameFontUrl: "",
  contentFont: "",
  contentFontUrl: "",
  headerVariant: "dynamic",
  footerVariant: "default",
  headerNav: [
    { label: "Home", href: "#" },
    { label: "About", href: "#" },
    { label: "Contact", href: "#" },
  ],
  // headerActions: [...] continues in bundle (truncated here)
};

/**
 * Section — RECONSTRUCTED-APPROX wrapper for the minified collapsible `te` component.
 * Renders a header row (icon + Russian label + chevron) and, when `open`, its children.
 */
function Section({ id, label, open, onToggle, icon, className, children }) {
  return (
    <div data-section={id} className={className}>
      <button type="button" onClick={onToggle} aria-expanded={open}>
        {icon}
        <span>{label}</span>
        <ChevronDown />
      </button>
      {open && <div>{children}</div>}
    </div>
  );
}
