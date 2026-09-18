import VideoPlayerBase from './VideoPlayerBase'

/** The provider owns the compositor; optional engines cannot block player creation. */
export class CanvasVideoPlayer extends VideoPlayerBase {}
