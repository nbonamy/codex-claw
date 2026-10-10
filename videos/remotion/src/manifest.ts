import data from "../../local/remotion/public/manifest.json";

type SourceFilm = {
  id: string;
  title: string;
  duration: number;
  durationInFrames: number;
  posterSecond: number;
  width: number;
  height: number;
  markup: string;
  css: string;
};
type NarratedFilm = {
  id: string;
  sourceId: string;
  title: string;
  durationInFrames: number;
  sourceBoundaries: number[];
  targetBoundaries: number[];
  audio: string;
};

// A checkout without local approved takes still has valid source compositions.
export const manifest: {
  fps: number;
  sources: SourceFilm[];
  narrated: NarratedFilm[];
} = data;
