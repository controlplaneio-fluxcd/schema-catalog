/**
 * localStorage key for the user's explicit theme choice. Absence means the UI
 * follows `prefers-color-scheme` through CSS/media behavior.
 */
const THEME_KEY = "schema-catalog-theme";

type Theme = "light" | "dark";

/** Applies a stored explicit theme before the first route render. */
export function initializeTheme(): void {
  const stored = localStorage.getItem(THEME_KEY);
  if (stored === "light" || stored === "dark") {
    document.documentElement.dataset.theme = stored;
  }
}

/**
 * Creates the header theme toggle. Clicking flips the explicit theme, stores it
 * in localStorage, and updates the button label/title for the next action.
 */
export function createThemeToggle(): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "icon-button";
  button.addEventListener("click", () => {
    const next = activeTheme() === "dark" ? "light" : "dark";
    localStorage.setItem(THEME_KEY, next);
    document.documentElement.dataset.theme = next;
    updateThemeButton(button);
  });
  updateThemeButton(button);
  return button;
}

function updateThemeButton(button: HTMLButtonElement): void {
  const next = activeTheme() === "dark" ? "light" : "dark";
  button.textContent = next === "dark" ? "☾" : "☀";
  button.setAttribute("aria-label", `Switch to ${next} theme`);
  button.title = `Switch to ${next} theme`;
}

function activeTheme(): Theme {
  const forced = document.documentElement.dataset.theme;
  if (forced === "light" || forced === "dark") {
    return forced;
  }
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
