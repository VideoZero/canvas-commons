import {PlaybackManager, PlaybackState} from './PlaybackManager';

/**
 * A read-only representation of the playback.
 */
export class PlaybackStatus {
  public constructor(private readonly playback: PlaybackManager) {}

  /**
   * Convert seconds to frames using the current framerate.
   *
   * @param seconds - The seconds to convert.
   */
  public secondsToFrames(seconds: number) {
    return Math.ceil(seconds * this.playback.fps);
  }

  /**
   * Convert frames to seconds using the current framerate.
   *
   * @param frames - The frames to convert.
   */
  public framesToSeconds(frames: number) {
    return frames / this.playback.fps;
  }

  public get time(): number {
    return this.framesToSeconds(this.playback.frame);
  }

  /**
   * Triggered when the scenes get recalculated.
   *
   * @remarks
   * After a recalculation, the timing of all scenes is final and {@link frame}
   * is the duration of the entire project. Scene code can use it to resolve
   * timelines that span multiple scenes.
   *
   * Like other value events, it also dispatches the current scenes to new
   * subscribers. Pass `false` as the second argument of `subscribe` to only
   * get notified about future recalculations.
   *
   * @example
   * ```ts
   * const unsubscribe = useScene().playback.onScenesRecalculated.subscribe(
   *   scenes => console.log(scenes.at(-1)?.lastFrame),
   *   false,
   * );
   * ```
   *
   * @eventProperty
   */
  public get onScenesRecalculated() {
    return this.playback.onScenesRecalculated;
  }

  public get frame(): number {
    return this.playback.frame;
  }

  public get speed(): number {
    return this.playback.speed;
  }

  public get fps(): number {
    return this.playback.fps;
  }

  public get state(): PlaybackState {
    return this.playback.state;
  }

  /**
   * The time passed since the last frame in seconds.
   */
  public get deltaTime(): number {
    return this.framesToSeconds(1) * this.speed;
  }
}
