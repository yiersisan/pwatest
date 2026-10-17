// Integration boundary: the existing static project has no identity/upload/config API.
// Supply an authenticated implementation here; never replace this with a local PIN check.
// See docs/10-parent-customization.md for the contract. Cookies/tokens and CSRF remain
// the responsibility of the application's existing server adapter.
window.ParentBackend = window.ParentBackend || null;
