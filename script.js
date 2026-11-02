/* Realça a secção visível no menu. Todo o conteúdo funciona sem JavaScript. */
"use strict";

(() => {
  const links = [...document.querySelectorAll('.site-nav a[href^="#"]')];
  const sections = links
    .map((link) => document.getElementById(link.hash.slice(1)))
    .filter(Boolean);

  function setActiveSection(id) {
    links.forEach((link) => {
      if (link.hash === `#${id}`) {
        link.setAttribute("aria-current", "location");
      } else {
        link.removeAttribute("aria-current");
      }
    });
  }

  setActiveSection(window.location.hash.slice(1) || "inicio");
  if (!("IntersectionObserver" in window)) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) setActiveSection(entry.target.id);
    });
  }, { rootMargin: "-15% 0px -55% 0px", threshold: 0 });

  sections.forEach((section) => observer.observe(section));
})();
