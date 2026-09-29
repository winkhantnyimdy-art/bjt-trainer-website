/* =============================================================================
   BJT Trainer — website behaviour
   -----------------------------------------------------------------------------
   Small, dependency-free, progressive enhancement. Every page is fully
   readable and navigable with JavaScript disabled:

     * English is the default language; both languages are in the DOM and
       CSS reveals one based on <html data-lang>.
     * The Android download follows js/config.js: when downloadAvailable is
       true, each [data-download-btn] becomes a real <a download> link; when
       it is false, each stays a disabled "coming soon" button. The page
       ships with the download live.
     * The contact block on privacy.html is empty in the markup and is only
       populated when config.contactEmail holds a real address.
   ========================================================================== */

(function () {
  "use strict";

  var STORAGE_KEY = "bjt-lang";
  var SUPPORTED = ["en", "ja"];

  var config = window.BJT_SITE_CONFIG || {};
  var root = document.documentElement;

  /* ------------------------------------------------------------ utilities */

  function $(sel, ctx) {
    return (ctx || document).querySelector(sel);
  }

  function $$(sel, ctx) {
    return Array.prototype.slice.call((ctx || document).querySelectorAll(sel));
  }

  function isPlaceholder(value) {
    return !value || /^[A-Z0-9_]+$/.test(String(value).trim());
  }

  /* ---------------------------------------------------------------- i18n */

  function readStoredLang() {
    try {
      return window.localStorage.getItem(STORAGE_KEY);
    } catch (err) {
      return null;
    }
  }

  function storeLang(lang) {
    try {
      window.localStorage.setItem(STORAGE_KEY, lang);
    } catch (err) {
      /* private mode / storage disabled — the toggle still works for this page */
    }
  }

  function pickInitialLang() {
    var stored = readStoredLang();
    if (SUPPORTED.indexOf(stored) !== -1) {
      return stored;
    }
    /* No stored preference: honour an explicit ?lang= override, otherwise
       default to English.

       Browser-language detection is deliberately NOT used. The site has a
       single default and it is English, so the first visit looks the same on
       every machine; a Japanese-locale browser must not silently flip the
       page before the visitor has chosen anything. */
    var forced = new URLSearchParams(window.location.search).get("lang");
    if (SUPPORTED.indexOf(forced) !== -1) {
      return forced;
    }
    return "en";
  }

  function applyLang(lang) {
    root.setAttribute("data-lang", lang);
    root.setAttribute("lang", lang);

    $$("[data-lang-btn]").forEach(function (btn) {
      btn.setAttribute("aria-pressed", btn.getAttribute("data-lang-btn") === lang ? "true" : "false");
    });

    var titleEn = document.body.getAttribute("data-title-en");
    var titleJa = document.body.getAttribute("data-title-ja");
    if (titleEn && titleJa) {
      document.title = lang === "ja" ? titleJa : titleEn;
    }

    var status = $("#lang-status");
    if (status) {
      status.textContent =
        lang === "ja" ? "表示言語: 日本語" : "Language: English";
    }

    /* Mirror the choice into the URL so a specific language can be linked
       to and so the visible state survives a reload. Wrapped because some
       browsers refuse history writes on file:// origins; the page is fully
       functional without it, and localStorage already carries the choice. */
    if (window.history && window.history.replaceState) {
      try {
        var url = new URL(window.location.href);
        url.searchParams.set("lang", lang);
        window.history.replaceState(null, "", url.toString());
      } catch (err) {
        /* no-op */
      }
    }
  }

  function setupLanguage() {
    var buttons = $$("[data-lang-btn]");
    if (!buttons.length) {
      return;
    }

    buttons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var lang = btn.getAttribute("data-lang-btn");
        if (SUPPORTED.indexOf(lang) === -1) {
          return;
        }
        applyLang(lang);
        storeLang(lang);
      });
    });

    applyLang(pickInitialLang());
  }

  /* --------------------------------------------------------- mobile nav */

  function setupNav() {
    var toggle = $("[data-nav-toggle]");
    var nav = $("[data-nav]");
    if (!toggle || !nav) {
      return;
    }

    function setOpen(open) {
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      nav.classList.toggle("is-open", open);
    }

    function close(refocus) {
      if (toggle.getAttribute("aria-expanded") !== "true") {
        return;
      }
      setOpen(false);
      if (refocus) {
        toggle.focus();
      }
    }

    setOpen(false);

    toggle.addEventListener("click", function () {
      var open = toggle.getAttribute("aria-expanded") === "true";
      if (open) {
        close(false);
      } else {
        setOpen(true);
        var first = nav.querySelector("a, button");
        if (first) {
          first.focus();
        }
      }
    });

    /* Following an in-page link should reveal the target, so close the panel
       and let the browser scroll. */
    nav.addEventListener("click", function (event) {
      if (event.target.closest("a")) {
        close(false);
      }
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" || event.key === "Esc") {
        close(true);
      }
    });

    document.addEventListener("click", function (event) {
      if (!nav.contains(event.target) && !toggle.contains(event.target)) {
        close(false);
      }
    });

    /* Keep focus inside the panel while it is open on small screens. */
    nav.addEventListener("keydown", function (event) {
      if (event.key !== "Tab" || toggle.getAttribute("aria-expanded") !== "true") {
        return;
      }
      if (window.matchMedia("(min-width: 900px)").matches) {
        return;
      }
      var items = $$("a, button", nav);
      if (!items.length) {
        return;
      }
      var first = items[0];
      var last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });

    window.addEventListener("resize", function () {
      if (window.matchMedia("(min-width: 900px)").matches) {
        close(false);
      }
    });
  }

  /* Mark the nav link for whichever section is currently in view. */
  function setupScrollSpy() {
    var links = $$("[data-nav-link]");
    if (!links.length || typeof IntersectionObserver !== "function") {
      return;
    }

    var byId = {};
    var sections = [];
    links.forEach(function (link) {
      var id = (link.getAttribute("href") || "").replace(/^#/, "");
      var section = id && document.getElementById(id);
      if (section) {
        byId[id] = link;
        sections.push(section);
      }
    });

    if (!sections.length) {
      return;
    }

    var visible = new Set();

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            visible.add(entry.target.id);
          } else {
            visible.delete(entry.target.id);
          }
        });

        var active = null;
        for (var i = 0; i < sections.length; i++) {
          if (visible.has(sections[i].id)) {
            active = sections[i].id;
            break;
          }
        }

        links.forEach(function (link) {
          link.removeAttribute("aria-current");
        });
        if (active && byId[active]) {
          byId[active].setAttribute("aria-current", "true");
        }
      },
      { rootMargin: "-45% 0px -50% 0px", threshold: 0 }
    );

    sections.forEach(function (section) {
      observer.observe(section);
    });
  }

  /* ------------------------------------------------------- download state
     Single switch: window.BJT_SITE_CONFIG.downloadAvailable in js/config.js
     ------------------------------------------------------------------------ */

  function setupDownload() {
    var available = config.downloadAvailable === true;
    var url = typeof config.androidDownloadUrl === "string" ? config.androidDownloadUrl.trim() : "";
    var ready = available && url.length > 0;

    root.setAttribute("data-download-state", ready ? "ready" : "pending");

    if (!ready) {
      return;
    }

    var fileName =
      config.androidFileName || (url.split("/").pop() || "bjt-trainer.apk");

    $$("[data-download-btn]").forEach(function (el) {
      if (el.tagName === "A") {
        el.setAttribute("href", url);
        el.setAttribute("download", fileName);
        el.removeAttribute("aria-disabled");
        el.removeAttribute("aria-describedby");
        el.classList.remove("is-disabled");
        return;
      }

      /* Swap the disabled <button> for a real link, keeping classes/contents. */
      var link = document.createElement("a");
      link.className = el.className;
      link.innerHTML = el.innerHTML;
      link.href = url;
      link.download = fileName;
      link.rel = "noopener";
      link.setAttribute("data-download-btn", "");
      el.parentNode.replaceChild(link, el);
    });
  }

  /* ------------------------------------------------- config-driven content */

  function fill(el, value) {
    if (el && typeof value === "string" && value.length) {
      el.textContent = value;
    }
  }

  function setupConfigBindings() {
    $$("[data-config]").forEach(function (el) {
      var key = el.getAttribute("data-config");
      var lang = el.getAttribute("data-config-lang");
      var value = config[key];
      if (value && typeof value === "object" && lang) {
        value = value[lang] || value.en;
      }
      fill(el, value);
    });

    /* Support contact: never expose a placeholder to visitors. */
    var contact = $("[data-contact]");
    if (contact) {
      var email = config.contactEmail;
      if (!isPlaceholder(email)) {
        var link = $("[data-contact-email]", contact);
        if (link) {
          link.textContent = email;
          link.href = "mailto:" + email;
        }
        var url = $("[data-contact-url]", contact);
        if (url && config.supportUrl && !isPlaceholder(config.supportUrl)) {
          url.hidden = false;
          url.href = config.supportUrl;
        }
        contact.hidden = false;
      } else {
        contact.hidden = true;
      }
    }
  }

  /* ------------------------------------------------------------------ boot */

  function init() {
    setupConfigBindings();
    setupDownload();
    setupLanguage();
    setupNav();
    setupScrollSpy();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
