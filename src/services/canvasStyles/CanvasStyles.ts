import type { ICamera } from "../camera/CameraService";

export type TCanvasLength = number | `${number}px`;
export type TCanvasColor = string;

export type TCanvasFillStyle = Partial<{
  color: TCanvasColor;
}>;

export type TCanvasStrokeStyle = Partial<{
  color: TCanvasColor;
  width: TCanvasLength;
  /** When true, width is drawn in world units and visually changes with zoom. */
  scaleWithCamera: boolean;
  /** Max width when camera compensation is enabled. */
  maxWidth: TCanvasLength;
  dash: number[] | "solid" | "dashed" | "dotted";
  dashOffset: number;
  cap: CanvasLineCap;
  join: CanvasLineJoin;
  miterLimit: number;
}>;

export type TCanvasTextStyle = Partial<{
  color: TCanvasColor;
  size: TCanvasLength;
  /** When true, text size is used in world units and visually changes with zoom. */
  scaleWithCamera: boolean;
  family: string;
  weight: string | number;
  style: "normal" | "italic" | "oblique";
  align: CanvasTextAlign;
  baseline: CanvasTextBaseline;
}>;

export type TCanvasCompositeStyle = Partial<{
  opacity: number;
  blendMode: GlobalCompositeOperation;
}>;

export type TCanvasStyleDeclaration = Partial<{
  fill: TCanvasFillStyle;
  stroke: TCanvasStrokeStyle;
  text: TCanvasTextStyle;
  composite: TCanvasCompositeStyle;
}>;

export type TCanvasStyleRule = {
  /** CSS-like selector subset: ".block", ".block.selected", ".highlighted" */
  selector: string;
  style: TCanvasStyleDeclaration;
};

export type TCanvasScaleAdapter = Pick<ICamera, "getCameraScale" | "limitScaleEffect">;

export type TCanvasStyleResolveOptions = {
  scaleAdapter?: TCanvasScaleAdapter;
};

type TNormalizedRule = {
  selector: string;
  requiredClasses: string[];
  specificity: number;
  order: number;
  style: TCanvasStyleDeclaration;
};

function normalizeLength(value: TCanvasLength | undefined): number | undefined {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string" && value.endsWith("px")) {
    const numeric = Number(value.slice(0, -2));
    return Number.isFinite(numeric) ? numeric : undefined;
  }

  return undefined;
}

function normalizeDash(value: TCanvasStrokeStyle["dash"] | number[] | undefined): number[] | undefined {
  if (!value) {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value;
  }

  switch (value) {
    case "solid":
      return [];
    case "dashed":
      return [6, 4];
    case "dotted":
      return [2, 4];
    default:
      return undefined;
  }
}

function dropUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const result: Partial<T> = {};
  Object.entries(obj).forEach(([key, value]) => {
    if (value !== undefined) {
      result[key as keyof T] = value as T[keyof T];
    }
  });
  return result;
}

function normalizeStyle(style: TCanvasStyleDeclaration): TCanvasStyleDeclaration {
  const fill: TCanvasFillStyle = {
    color: style.fill?.color,
  };
  const stroke: TCanvasStrokeStyle = {
    color: style.stroke?.color,
    width: style.stroke?.width,
    scaleWithCamera: style.stroke?.scaleWithCamera,
    maxWidth: style.stroke?.maxWidth,
    dash: style.stroke?.dash,
    dashOffset: style.stroke?.dashOffset,
    cap: style.stroke?.cap,
    join: style.stroke?.join,
    miterLimit: style.stroke?.miterLimit,
  };
  const text: TCanvasTextStyle = {
    color: style.text?.color,
    size: style.text?.size,
    scaleWithCamera: style.text?.scaleWithCamera,
    family: style.text?.family,
    weight: style.text?.weight,
    style: style.text?.style,
    align: style.text?.align,
    baseline: style.text?.baseline,
  };
  const composite: TCanvasCompositeStyle = {
    opacity: style.composite?.opacity,
    blendMode: style.composite?.blendMode,
  };

  const normalizedStrokeWidth = normalizeLength(stroke.width);
  const normalizedStrokeMaxWidth = normalizeLength(stroke.maxWidth);
  const normalizedTextSize = normalizeLength(text.size);
  const normalizedDash = normalizeDash(stroke.dash);

  const normalizedStroke: TCanvasStrokeStyle = {
    ...stroke,
    width: normalizedStrokeWidth ?? stroke.width,
    maxWidth: normalizedStrokeMaxWidth ?? stroke.maxWidth,
    dash: normalizedDash,
  };
  const normalizedText: TCanvasTextStyle = {
    ...text,
    size: normalizedTextSize ?? text.size,
  };

  return dropUndefined({
    fill: dropUndefined(fill),
    stroke: dropUndefined(normalizedStroke),
    text: dropUndefined(normalizedText),
    composite: dropUndefined(composite),
  });
}

function normalizeSelector(selector: string): string[] {
  const compact = selector.trim().replace(/\s+/g, "");
  if (!compact) {
    return [];
  }

  const source = compact.startsWith(".") ? compact.slice(1) : compact;
  const chunks = source.split(".").filter(Boolean);
  return Array.from(new Set(chunks)).sort();
}

function buildResolveCacheKey(classes: string[], version: number): string {
  const unique = Array.from(new Set(classes)).sort();
  return `${unique.join("|")}|v${version}`;
}

function mergeCanvasStyle(target: TCanvasStyleDeclaration, source: TCanvasStyleDeclaration): void {
  if (source.fill) {
    target.fill = { ...(target.fill ?? {}), ...source.fill };
  }
  if (source.stroke) {
    target.stroke = { ...(target.stroke ?? {}), ...source.stroke };
  }
  if (source.text) {
    target.text = { ...(target.text ?? {}), ...source.text };
  }
  if (source.composite) {
    target.composite = { ...(target.composite ?? {}), ...source.composite };
  }
}

function applyScaleAdaptation(
  style: Readonly<TCanvasStyleDeclaration>,
  scaleAdapter: TCanvasScaleAdapter
): Readonly<TCanvasStyleDeclaration> {
  let nextStroke = style.stroke;
  let nextText = style.text;

  if (typeof style.stroke?.width === "number") {
    const maxWidth = typeof style.stroke.maxWidth === "number" ? style.stroke.maxWidth : undefined;
    const adaptedWidth = style.stroke.scaleWithCamera
      ? style.stroke.width
      : scaleAdapter.limitScaleEffect(style.stroke.width, maxWidth);
    nextStroke = {
      ...style.stroke,
      width: adaptedWidth,
    };
  }

  if (typeof style.text?.size === "number") {
    const scale = scaleAdapter.getCameraScale();
    const adaptedSize = style.text.scaleWithCamera || scale === 0 ? style.text.size : style.text.size / scale;
    nextText = {
      ...style.text,
      size: adaptedSize,
    };
  }

  if (nextStroke === style.stroke && nextText === style.text) {
    return style;
  }

  return Object.freeze({
    ...style,
    ...(nextStroke ? { stroke: nextStroke } : {}),
    ...(nextText ? { text: nextText } : {}),
  });
}

export class CanvasStyles {
  private readonly rules: TNormalizedRule[] = [];
  private readonly resolveCache: Map<string, Readonly<TCanvasStyleDeclaration>> = new Map();
  private version = 0;
  private orderCounter = 0;
  private readonly onChange?: (version: number) => void;

  constructor(onChange?: (version: number) => void) {
    this.onChange = onChange;
  }

  private bumpVersion(): void {
    this.version += 1;
    this.resolveCache.clear();
    this.onChange?.(this.version);
  }

  private upsertRule(rule: TCanvasStyleRule): boolean {
    const requiredClasses = normalizeSelector(rule.selector);
    if (requiredClasses.length === 0) {
      return false;
    }

    const normalizedSelector = requiredClasses.join(".");
    const existingRuleIndex = this.rules.findIndex((item) => item.selector === normalizedSelector);
    const nextRule: TNormalizedRule = {
      selector: normalizedSelector,
      requiredClasses,
      specificity: requiredClasses.length,
      order: this.orderCounter,
      style: normalizeStyle(rule.style),
    };

    if (existingRuleIndex >= 0) {
      this.rules[existingRuleIndex] = nextRule;
    } else {
      this.rules.push(nextRule);
    }

    this.orderCounter += 1;
    return true;
  }

  public register(rule: TCanvasStyleRule): void {
    if (!this.upsertRule(rule)) {
      return;
    }
    this.bumpVersion();
  }

  public registerMany(rules: TCanvasStyleRule[]): void {
    if (rules.length === 0) {
      return;
    }

    let changed = false;
    rules.forEach((rule) => {
      changed = this.upsertRule(rule) || changed;
    });

    if (changed) {
      this.bumpVersion();
    }
  }

  public unregister(selectorOrClassName: string): void {
    const normalized = normalizeSelector(selectorOrClassName).join(".");
    if (!normalized) {
      return;
    }

    const initialLength = this.rules.length;
    const nextRules = this.rules.filter((rule) => rule.selector !== normalized);

    if (nextRules.length !== initialLength) {
      this.rules.length = 0;
      nextRules.forEach((rule) => this.rules.push(rule));
      this.bumpVersion();
    }
  }

  public clear(): void {
    if (this.rules.length === 0) {
      return;
    }

    this.rules.length = 0;
    this.bumpVersion();
  }

  public resolve(classes: string[], options?: TCanvasStyleResolveOptions): Readonly<TCanvasStyleDeclaration> {
    const cacheKey = buildResolveCacheKey(classes, this.version);
    const cached = this.resolveCache.get(cacheKey);
    if (cached && !options?.scaleAdapter) {
      return cached;
    }

    const baseResolved =
      cached ??
      (() => {
        const classSet = new Set(classes.filter(Boolean));
        const style: TCanvasStyleDeclaration = {};

        const matchedRules = this.rules
          .filter((rule) => {
            return rule.requiredClasses.every((item) => classSet.has(item));
          })
          .sort((left, right) => {
            if (left.specificity !== right.specificity) {
              return left.specificity - right.specificity;
            }
            return left.order - right.order;
          });

        matchedRules.forEach((rule) => {
          mergeCanvasStyle(style, rule.style);
        });

        const resolved = Object.freeze(style);
        this.resolveCache.set(cacheKey, resolved);
        return resolved;
      })();

    if (!options?.scaleAdapter) {
      return baseResolved;
    }

    return applyScaleAdaptation(baseResolved, options.scaleAdapter);
  }

  public getVersion(): number {
    return this.version;
  }
}
