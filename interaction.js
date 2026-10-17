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
  // Keep native pinch, double-tap, wheel and keyboard zoom available.
})();
