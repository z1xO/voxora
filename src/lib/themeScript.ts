// Server-safe theme constants (imported by the root layout, which is a server component).
export const THEME_KEY = "voxora.theme";

/** Inline script for <head>: applies the saved theme before the page renders, so there's no flash. */
// Also honors the key used before the product was renamed ("speakode.theme").
export const THEME_SCRIPT = `try{var t=localStorage.getItem("${THEME_KEY}")||localStorage.getItem("speakode.theme");if(t==="light")document.documentElement.dataset.theme="light"}catch(e){}`;
