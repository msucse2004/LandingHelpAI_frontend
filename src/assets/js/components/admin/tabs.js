function mountTabs(tabsRootEl, panelsRootEl, { defaultPanelId = null } = {}) {
  if (!tabsRootEl || !panelsRootEl) return;

  const tabButtons = Array.from(tabsRootEl.querySelectorAll("[data-panel]"));
  const getPanel = (panelId) => panelsRootEl.querySelector(`#${panelId}`);

  function activate(panelId) {
    tabButtons.forEach((btn) => {
      const pid = btn.getAttribute("data-panel");
      const isActive = pid === panelId;
      btn.classList.toggle("is-active", isActive);
    });

    const panelEls = Array.from(panelsRootEl.querySelectorAll(".admin-services__tab-panel"));
    panelEls.forEach((panel) => {
      const shouldShow = panel.id === panelId;
      if (shouldShow) {
        panel.removeAttribute("hidden");
      } else {
        panel.setAttribute("hidden", "hidden");
      }
    });
  }

  const initial = defaultPanelId || (tabButtons[0] ? tabButtons[0].getAttribute("data-panel") : null);
  if (initial) activate(initial);

  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const panelId = btn.getAttribute("data-panel");
      if (!panelId) return;
      activate(panelId);
    });
  });
}

export { mountTabs };

