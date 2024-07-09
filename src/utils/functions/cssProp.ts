type CssVar = `--${string}`;

export function setCssProp(target: HTMLElement, name: CssVar, value: string) {
  target.style.setProperty(name, value);
}

export function setCssProps(target: HTMLElement, vars: { [k in CssVar]: string }) {
  Object.entries(vars).forEach(([name, value]) => {
    setCssProp(target, name as CssVar, value);
  });
}

export function removeCssProps(target: HTMLElement, names: CssVar[]) {
  names.forEach((name) => {
    target.style.removeProperty(name);
  });
}
