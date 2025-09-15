type CssVar = `--${string}`;

export function setCssProp(target: HTMLElement | null, name: CssVar, value: string) {
  if (!target) {
    return;
  }
  target.style.setProperty(name, value);
}

export function setCssProps(target: HTMLElement | null, vars: { [k in CssVar]: string }) {
  if (!target) {
    return;
  }

  Object.entries(vars).forEach(([name, value]) => {
    setCssProp(target, name as CssVar, value);
  });
}

export function removeCssProps(target: HTMLElement | null, names: CssVar[]) {
  if (!target) {
    return;
  }

  names.forEach((name) => {
    target.style.removeProperty(name);
  });
}
