/** Simplified MDX-to-JSON schema used under public/assets/models. */

export interface MdxSequence {
  index: number;
  name: string;
  interval: [number, number];
  rarity?: number;
}

export interface MdxGeoset {
  index: number;
  materialId: number;
  texture: string;
  vertices: number[];
  normals: number[];
  faces: number[];
  uvs: number[];
}

export interface MdxJsonModel {
  name: string;
  geosets: MdxGeoset[];
  sequences: MdxSequence[];
  textures: string[];
}
