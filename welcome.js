// First visit: a welcome window where a mom picks her language with one big button, each written in its own language.
// Shown once: the choice is remembered (kn-lang), and links with ?lang= skip it. Load after tabs.js on every page.
(function () {
  "use strict";

  var CHOICES = [
    { lang: "uk", mark: "🇺🇦", text: "Я розмовляю українською", hint: "Українська" },
    { lang: "de", mark: "🇩🇪", text: "Ich spreche Deutsch", hint: "Deutsch" },
    { lang: "en", mark: "🇬🇧", text: "I speak English", hint: "English" },
    { lang: "ru", mark: "💬", text: "Я говорю по-русски", hint: "Русский" }
  ];

  var stored = null;
  try { stored = localStorage.getItem("kn-lang"); } catch (e) { return; } // storage blocked: don't nag every visit
  if (stored || new URLSearchParams(location.search).get("lang")) return;
  if (!window.HTMLDialogElement) return;

  function remember(lang) {
    try { localStorage.setItem("kn-lang", lang); } catch (e) {}
  }

  // The language the browser suggests goes first.
  var guess = window.KN ? window.KN.pickLang() : "en";
  var ordered = CHOICES.filter(function (c) { return c.lang === guess; })
    .concat(CHOICES.filter(function (c) { return c.lang !== guess; }));

  var dialog = document.createElement("dialog");
  dialog.className = "sheet welcome";
  dialog.setAttribute("aria-labelledby", "welcome-h");
  dialog.innerHTML =
    '<img src="images/icon.svg" width="56" height="56" alt="" class="welcome-logo">' +
    '<h2 id="welcome-h">Вітаємо · Willkommen · Welcome · Добро пожаловать</h2>' +
    '<p class="welcome-sub">Оберіть мову · Sprache wählen · Choose your language · Выберите язык</p>' +
    '<div class="welcome-choices"></div>';
  var box = dialog.querySelector(".welcome-choices");

  ordered.forEach(function (c) {
    var b = document.createElement("button");
    b.type = "button";
    b.lang = c.lang;
    b.className = "welcome-choice" + (c.lang === guess ? " suggested" : "");
    b.innerHTML = '<span class="mark" aria-hidden="true"></span><span class="text"></span><small></small>';
    b.querySelector(".mark").textContent = c.mark;
    b.querySelector(".text").textContent = c.text;
    b.querySelector("small").textContent = c.hint;
    b.addEventListener("click", function () {
      remember(c.lang);
      dialog.close();
      // The page's own language button translates everything and keeps the choice.
      var headerButton = document.querySelector('.lang button[data-lang="' + c.lang + '"]');
      if (headerButton && headerButton.getAttribute("aria-pressed") !== "true") headerButton.click();
    });
    box.appendChild(b);
  });

  // Closing without choosing (Esc) keeps the language the site guessed, and doesn't ask again.
  dialog.addEventListener("cancel", function () { remember(document.documentElement.lang || guess); });

  document.body.appendChild(dialog);
  dialog.showModal();
})();
