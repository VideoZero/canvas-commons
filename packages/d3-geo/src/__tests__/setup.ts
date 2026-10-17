import {RecordingPath2D} from './recordingPath2D';

if (typeof globalThis.Path2D === 'undefined') {
  Object.defineProperty(globalThis, 'Path2D', {value: RecordingPath2D});
}
