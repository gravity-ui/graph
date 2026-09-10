export function setCssProps(target: HTMLElement | null | undefined, vars: Record<`--${string}`, string>) {
  if (!target) return;
  for (const [name, value] of Object.entries(vars)) {
    target.style.setProperty(name, value);
  }
}
