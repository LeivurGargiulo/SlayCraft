import { useEffect, useState } from "react";
import { resolveInitialTheme, type Theme } from "../lib/theme";

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const current = document.documentElement.getAttribute("data-theme");
    if (current === "dark" || current === "light") {
      setTheme(current);
      return;
    }
    setTheme(
      resolveInitialTheme(
        localStorage.getItem("theme"),
        window.matchMedia("(prefers-color-scheme: dark)").matches
      )
    );
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === "dark" ? "Cambiar a modo superficie" : "Cambiar a modo subterráneo"}
      className="rounded border border-border-strong px-3 py-1 font-mono text-sm text-text transition-colors hover:text-accent"
    >
      {theme === "dark" ? "☀ superficie" : "☾ subterráneo"}
    </button>
  );
}
