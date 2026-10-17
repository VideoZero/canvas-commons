declare module 'world-atlas/*.json' {
  import type {Objects, Topology} from 'topojson-specification';

  const topology: Topology<Objects>;
  export default topology;
}
