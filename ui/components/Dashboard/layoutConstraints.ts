interface LayoutItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
  moved?: boolean;
  static?: boolean;
}

type Layouts = Record<string, LayoutItem[]>;
type ColsConfig = Record<string, number>;

export const applyMinSizeConstraints = (
  layouts: Layouts,
  defaultLayouts: Layouts,
  colsConfig: ColsConfig,
): Layouts => {
  const constrained: Layouts = {};

  for (const [bp, items] of Object.entries(layouts || {})) {
    const maxCols = colsConfig[bp] ?? 12;
    const defaults = defaultLayouts?.[bp] ?? [];

    constrained[bp] = items.map((item) => {
      const defaultItem = defaults.find((d) => d.i === item.i);
      const minW = Math.min(Math.max(defaultItem?.w ?? item.w, 1), maxCols);
      const minH = Math.max(defaultItem?.h ?? item.h, 1);

      return {
        ...item,
        w: Math.max(item.w, minW),
        h: Math.max(item.h, minH),
        minW,
        minH,
      };
    });
  }

  return constrained;
};
