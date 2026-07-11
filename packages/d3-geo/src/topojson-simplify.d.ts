declare module 'topojson-simplify' {
  export function presimplify(topology: any, weight?: (triangle: any) => number): any;
  export function simplify(topology: any, minWeight?: number): any;
  export function quantile(topology: any, p: number): number;
  export function filter(topology: any, filter: any): any;
  export function filterWeight(topology: any, minWeight?: number): any;
  export const planarTriangleArea: (triangle: any) => number;
  export const sphericalTriangleArea: (triangle: any) => number;
}
