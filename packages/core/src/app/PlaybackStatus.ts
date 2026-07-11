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
   * Triggered once after every scene has been recalculated.
   *
   * @remarks
   * Fires at the end of a full {@link PlaybackManager.recalculate} pass, when
   * the timing of all scenes is final and {@link frame} holds the total project
   * length. Exposed here so scene-scoped code (which only sees this read-only
   * status, not the manager) can resolve timelines that span multiple scenes —
   * e.g. the music director expands its cross-scene cue ledger against the final
   * project duration.
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
