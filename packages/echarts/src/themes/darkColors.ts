/**
 * Resolved ECharts dark theme.
 *
 * @remarks
 * Values extracted from echarts' built-in dark tokens (lightness-inverted).
 */

export const darkColors = {
  theme: 'dark' as const,
  darkMode: true as const,
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
  backgroundColor: 'rgba(4,8,16,1)',
  axisPointer: {
    lineStyle: {
      color: 'rgba(91,94,100,1)',
    },
    crossStyle: {
      color: 'rgba(122,125,131,1)',
    },
    label: {
      color: 'rgba(179,180,183,1)',
    },
  },
  legend: {
    textStyle: {
      color: 'rgba(203,203,206,1)',
    },
    pageTextStyle: {
      color: 'rgba(179,180,183,1)',
    },
  },
  textStyle: {
    color: 'rgba(203,203,206,1)',
  },
  title: {
    textStyle: {
      color: 'rgba(223,223,225,1)',
    },
    subtextStyle: {
      color: 'rgba(152,153,157,1)',
    },
  },
  toolbox: {
    iconStyle: {
      borderColor: 'rgba(175,181,201,1)',
    },
  },
  tooltip: {
    backgroundColor: 'rgba(58,62,68,1)',
    defaultBorderColor: 'rgba(91,94,100,1)',
    textStyle: {
      color: 'rgba(179,180,183,1)',
    },
  },
};
