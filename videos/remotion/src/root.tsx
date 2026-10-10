import { Composition, Folder } from "remotion";
import { Film } from "./film";
import { manifest } from "./manifest";

export const Root = () => (
  <>
    <Folder name="Narrated">
      {manifest.narrated.map((film) => {
        const source = manifest.sources.find(
          (item) => item.id === film.sourceId,
        )!;
        return (
          <Composition
            key={film.id}
            id={`${film.id}-narrated`}
            component={Film}
            fps={manifest.fps}
            width={source.width}
            height={source.height}
            durationInFrames={film.durationInFrames}
            defaultProps={{ sourceId: source.id, narrationId: film.id }}
          />
        );
      })}
    </Folder>
    <Folder name="Source">
      {manifest.sources.map((film) => (
        <Composition
          key={film.id}
          id={`${film.id}-source`}
          component={Film}
          fps={manifest.fps}
          width={film.width}
          height={film.height}
          durationInFrames={film.durationInFrames}
          defaultProps={{ sourceId: film.id, narrationId: null }}
        />
      ))}
    </Folder>
  </>
);
