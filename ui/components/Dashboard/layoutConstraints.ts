// @ts-nocheck
export const applyMinSizeConstraints = (layouts, colsConfig, widgets) => {
  const constrained = {};

  for (const [bp, items] of Object.entries(layouts || {})) {
    const maxCols = colsConfig[bp] ?? 12;
    constrained[bp] = items.map((item) => {
      const widget = widgets?.[item.i];
      if (!widget?.defaultSizing) {
        return item;
      }

      const rawMinW = item.minW ?? widget.defaultSizing.minW ?? widget.defaultSizing.w;
      return {
        ...item,
        minW: Math.min(rawMinW, maxCols),
        minH: item.minH ?? widget.defaultSizing.minH ?? widget.defaultSizing.h,
      };
    });
  }

  return constrained;
};
