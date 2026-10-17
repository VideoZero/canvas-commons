/**
 * The resolved colors of the default ECharts theme.
 *
 * @remarks
 * Pass it as the {@link EChart.theme} to use the default theme, or read its
 * colors to match other nodes to the chart.
 *
 * @example
 * ```tsx
 * <EChart theme={lightColors} initialOption={option} />
 * <Circle fill={lightColors.color[0]} />
 * ```
 */
export const lightColors = {
  theme: 'default' as const,
  darkMode: false as const,
  color: [
    '#5070dd',
    '#b6d634',
    '#505372',
    '#ff994d',
    '#0ca8df',
    '#ffd10a',
    '#fb628b',
    '#785db0',
    '#3fbe95',
  ],
  backgroundColor: '#f4f7fd',
  axisPointer: {
    lineStyle: {
      color: '#b7b9be',
    },
    crossStyle: {
      color: '#9ea0a5',
    },
    label: {
      color: '#6d6e73',
    },
  },
  legend: {
    textStyle: {
      color: '#54555a',
    },
    pageTextStyle: {
      color: '#6d6e73',
    },
  },
  textStyle: {
    color: '#54555a',
  },
  title: {
    textStyle: {
      color: '#3c3c41',
    },
    subtextStyle: {
      color: '#86878c',
    },
  },
  toolbox: {
    iconStyle: {
      borderColor: '#6578ba',
    },
  },
  tooltip: {
    backgroundColor: '#cfd2d7',
    defaultBorderColor: '#b7b9be',
    textStyle: {
      color: '#6d6e73',
    },
  },
};
