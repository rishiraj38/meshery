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

      const sysMinW = widget.defaultSizing.minW ?? widget.defaultSizing.w;
      const sysMinH = widget.defaultSizing.minH ?? widget.defaultSizing.h;
      const minW = Math.min(Math.max(item.minW ?? 0, sysMinW), maxCols);
      const minH = Math.max(item.minH ?? 0, sysMinH);

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
