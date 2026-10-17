import type {GeoContext, GeoProjection} from 'd3-geo';
import {geoPath} from 'd3-geo';
import type {GeoObject} from './geometry';

function pathContext(path: Path2D): GeoContext {
  return {
    arc: (x, y, radius, startAngle, endAngle, anticlockwise) =>
      path.arc(x, y, radius, startAngle, endAngle, anticlockwise),
    beginPath: () => {
      // A Path2D accumulates every geometry; there is nothing to reset.
    },
    closePath: () => path.closePath(),
    lineTo: (x, y) => path.lineTo(x, y),
    moveTo: (x, y) => path.moveTo(x, y),
  };
}

/**
 * Render geographic objects into a single `Path2D`.
 *
 * @param projection - The projection to render with.
 * @param objects - The objects to render.
 */
export function projectToPath(
  projection: GeoProjection,
  ...objects: GeoObject[]
): Path2D {
  const path = new Path2D();
  const render = geoPath(projection, pathContext(path));
  for (const object of objects) {
    render(object);
  }
  return path;
}
