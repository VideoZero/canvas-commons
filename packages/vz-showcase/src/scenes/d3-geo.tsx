import {Node, makeScene2D} from '@canvas-commons/2d';
import {ThreadGenerator, all, waitFor} from '@canvas-commons/core';
import {
  Colors,
  NodeClass,
  caption,
  intro,
  loadOptional,
  placeholder,
} from '../shared/ui';

type Signal = (value: unknown, duration: number) => ThreadGenerator;
type GeoMapNode = Node & {
  flyTo: (
    location: string | [number, number],
    zoom: number | null,
    duration: number,
  ) => ThreadGenerator;
  zoom: Signal;
};
type Animated = Node & {end: Signal; reveal: Signal};

export default makeScene2D(function* (view) {
  yield* intro(
    view,
    'd3-geo',
    '@canvas-commons/d3-geo: animated d3-geo maps — great-circle flights, highlights, routes, pins, bundled world atlas.',
    'package',
  );
  caption(
    view,
    '<GeoMap> with GeoFeature, GeoLine, GeoPin · map.flyTo(…)',
    -245,
  );
  const geo = (yield loadOptional(
    () => import('@canvas-commons/d3-geo'),
  )) as Record<string, unknown>;
  const GeoMap = geo.GeoMap as NodeClass<GeoMapNode> | undefined;
  const GeoFeature = geo.GeoFeature as NodeClass<Animated> | undefined;
  const GeoLine = geo.GeoLine as NodeClass<Animated> | undefined;
  const GeoPin = geo.GeoPin as NodeClass | undefined;
  const worldAtlas = geo.worldAtlas as
    ((r: string) => Promise<unknown>) | undefined;
  if (!GeoMap || !GeoFeature || !GeoLine || !GeoPin || !worldAtlas) {
    placeholder(
      view,
      "import {GeoMap, GeoFeature, GeoLine, worldAtlas} from '@canvas-commons/d3-geo'",
    );
    yield* waitFor(6);
    return;
  }
  const data: unknown = yield worldAtlas('110m');
  const germany = new GeoFeature({
    feature: 'Germany',
    fill: Colors.red,
    reveal: 0,
  });
  const route = new GeoLine({
    points: ['Berlin', 'New York', 'Tokyo'],
    stroke: Colors.yellow,
    lineWidth: 4,
    bulge: 0.2,
    end: 0,
  });
  const map = new GeoMap({
    data,
    size: [900, 440],
    y: 15,
    projection: 'naturalEarth',
    water: '#0e1a2e',
    land: '#31415a',
    borders: '#0e1a2e',
    radius: 16,
    clip: true,
    children: [
      germany,
      route,
      new GeoPin({at: 'Berlin', fill: 'white'}),
      new GeoPin({at: 'New York', fill: 'white'}),
      new GeoPin({at: 'Tokyo', fill: 'white'}),
    ],
  });
  view.add(map);
  yield* waitFor(0.5);
  yield* all(map.flyTo('Berlin', 4, 2), germany.reveal(1, 2));
  yield* all(map.flyTo([-35, 45], 1.3, 2), route.end(0.5, 2));
  yield* all(map.flyTo('Tokyo', 1.6, 2), route.end(1, 2));
  yield* waitFor(0.5);
});
