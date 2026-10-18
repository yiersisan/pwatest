(() => {
  "use strict";
  const editable = (target) =>
    target?.closest?.('input, textarea, [contenteditable="true"]');
  for (const name of ["contextmenu", "selectstart", "copy", "cut"]) {
    document.addEventListener(name, (event) => {
      if (!editable(event.target)) event.preventDefault();
    });
  }
  document.addEventListener("dragstart", (event) => {
    if (!editable(event.target)) event.preventDefault();
  });
  // Safari gesture events and older touch engines need an explicit fallback.
  for (const name of ["gesturestart", "gesturechange", "gestureend"]) {
    document.addEventListener(name, (event) => event.preventDefault(), {
      passive: false,
    });
  }
  for (const name of ["touchstart", "touchmove"]) {
    document.addEventListener(
      name,
      (event) => {
        if (event.touches.length > 1) event.preventDefault();
      },
      { passive: false },
    );
  }
  // Trackpad pinch is delivered as a control-wheel gesture in Chromium.
  document.addEventListener(
    "wheel",
    (event) => {
      if (event.ctrlKey) event.preventDefault();
    },
    { passive: false },
  );
})();
