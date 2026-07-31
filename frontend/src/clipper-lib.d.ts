declare module 'clipper-lib' {
  export interface IntPoint {
    X: number;
    Y: number;
  }

  export type Path = IntPoint[];
  export type Paths = Path[];

  export enum ClipType {
    ctIntersection = 0,
    ctUnion = 1,
    ctDifference = 2,
    ctXor = 3,
  }

  export enum PolyType {
    ptSubject = 0,
    ptClip = 1,
  }

  export enum PolyFillType {
    pftEvenOdd = 0,
    pftNonZero = 1,
    pftPositive = 2,
    pftNegative = 3,
  }

  export enum JoinType {
    jtSquare = 0,
    jtRound = 1,
    jtMiter = 2,
  }

  export enum EndType {
    etSquare = 0,
    etRound = 1,
    etButt = 2,
    etClosedLine = 3,
    etClosedPolygon = 4,
  }

  export class Clipper {
    constructor();
    AddPath(pg: Path, polyType: PolyType, Closed: boolean): boolean;
    AddPaths(pgs: Paths, polyType: PolyType, Closed: boolean): boolean;
    Execute(
      clipType: ClipType,
      solution: Paths,
      subjFillType?: PolyFillType,
      clipFillType?: PolyFillType
    ): boolean;
    Clear(): void;
    static Area(poly: Path): number;
    static Orientation(poly: Path): boolean;
    static CleanPolygon(path: Path, distance?: number): Path;
  }

  export class ClipperOffset {
    constructor(miterLimit?: number, arcTolerance?: number);
    AddPath(path: Path, joinType: JoinType, endType: EndType): void;
    AddPaths(paths: Paths, joinType: JoinType, endType: EndType): void;
    Execute(solution: Paths, delta: number): void;
    Clear(): void;
  }

  const ClipperLib: {
    Clipper: typeof Clipper;
    ClipperOffset: typeof ClipperOffset;
    ClipType: typeof ClipType;
    PolyType: typeof PolyType;
    PolyFillType: typeof PolyFillType;
    JoinType: typeof JoinType;
    EndType: typeof EndType;
  };

  export default ClipperLib;
}