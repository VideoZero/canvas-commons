type PathCommand =
  | {type: 'moveTo' | 'lineTo'; x: number; y: number}
  | {type: 'arc' | 'closePath' | 'other'};

/**
 * A Path2D stand-in for jsdom that records the commands it receives.
 */
export class RecordingPath2D {
  public readonly commands: PathCommand[] = [];

  public moveTo(x: number, y: number) {
    this.commands.push({type: 'moveTo', x, y});
  }

  public lineTo(x: number, y: number) {
    this.commands.push({type: 'lineTo', x, y});
  }

  public arc() {
    this.commands.push({type: 'arc'});
  }

  public closePath() {
    this.commands.push({type: 'closePath'});
  }

  public rect() {
    this.commands.push({type: 'other'});
  }

  public addPath() {
    this.commands.push({type: 'other'});
  }
}

export function recordedCommands(path: Path2D): PathCommand[] {
  return path instanceof RecordingPath2D ? path.commands : [];
}
