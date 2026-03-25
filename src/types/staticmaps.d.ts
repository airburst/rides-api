declare module "staticmaps" {
  interface StaticMapsOptions {
    width: number;
    height: number;
    paddingX?: number;
    paddingY?: number;
    tileUrl?: string | null;
    tileSize?: number;
    zoomRange?: { min: number; max: number };
  }

  interface LineOptions {
    coords: [number, number][];
    color?: string;
    width?: number;
  }

  interface MarkerOptions {
    img: string;
    offsetX: number;
    offsetY: number;
    width: number;
    height: number;
    coord: [number, number];
  }

  interface ImageInstance {
    buffer(mime: string): Promise<Buffer>;
    save(filename: string): Promise<void>;
  }

  class StaticMaps {
    constructor(options: StaticMapsOptions);
    addLine(options: LineOptions): void;
    addMarker(options: MarkerOptions): void;
    render(bbox: [number, number, number, number]): Promise<void>;
    render(center?: [number, number], zoom?: number): Promise<void>;
    image: ImageInstance;
  }

  export default StaticMaps;
}
