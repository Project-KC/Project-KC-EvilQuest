import type { AppearanceColorSlot } from '@projectrs/shared';
import type { AdditionalAnimation } from '../rendering/CharacterEntity';

/**
 * Defines a group of switchable meshes (e.g. hairstyles, eyes).
 * Only one variant is visible at a time. The `meshNames` array maps
 * appearance index → mesh name(s) in the GLB.
 */
export interface ModularMeshGroup {
  /** Mesh names for each index. Sub-arrays handle multi-part variants (e.g. hair + bangs). */
  meshNames: string[][];
  /** Appearance field that controls this group */
  appearanceField: string;
  /** If true, index -1 means "none visible" */
  allowNone?: boolean;
}

export interface CharacterProfile {
  id: string;
  modelPath: string;
  /** Equipment slot → bone name in this skeleton */
  boneMap: Record<string, string>;
  /** Material name → appearance color slot for recoloring */
  materialMap: Record<AppearanceColorSlot, string[]>;
  hairMaterialNames: string[];
  additionalAnimations: AdditionalAnimation[];
  boneRotationOffsets: Record<string, { x: number; y: number; z: number }>;
  targetHeight: number;
  animBoneRemap?: Record<string, string>;
  /** Skip rest-pose correction for pre-baked animations that already target this skeleton */
  skipAnimRestCorrection?: boolean;
  /** Modular mesh groups for show/hide switching */
  modularMeshes?: ModularMeshGroup[];
}

const DEFAULT_ANIMATIONS: AdditionalAnimation[] = [
  { name: 'idle', path: '/Character models/animations/idle.glb' },
  { name: 'walk', path: '/Character models/animations/walk.glb' },
  { name: 'attack', path: '/Character models/animations/attack.glb' },
  { name: 'attack_slash', path: '/Character models/animations/attack_slash.glb' },
  { name: 'attack_punch', path: '/Character models/animations/attack_punch.glb' },
  { name: 'chop', path: '/Character models/animations/chop.glb' },
  { name: 'mine', path: '/Character models/animations/mine.glb' },
];

const DEFAULT_PROFILE: CharacterProfile = {
  id: 'default',
  modelPath: '/Character models/main character.glb',
  boneMap: {
    weapon: 'mixamorig:RightHand',
    shield: 'mixamorig:LeftForeArm',
    head:   'mixamorig:Head',
    body:   'mixamorig:Spine2',
    legs:   'mixamorig:Hips',
    feet:   'mixamorig:RightFoot',
    hands:  'mixamorig:RightHand',
    neck:   'mixamorig:Neck',
    ring:   'mixamorig:LeftHand',
    cape:   'mixamorig:Spine1',
  },
  materialMap: {
    shirtColor: ['Shirt', 'shirt openings', 'mat_4550'],
    pantsColor: ['pants'],
    shoesColor: ['socks'],
    hairColor:  ['Hair_1'],
    beltColor:  ['belt'],
  },
  hairMaterialNames: ['hair_1'],
  additionalAnimations: DEFAULT_ANIMATIONS,
  boneRotationOffsets: {},
  targetHeight: 1.53,
};

const PROFILES: Record<string, CharacterProfile> = {
  default: DEFAULT_PROFILE,
};

export function getProfile(id: string): CharacterProfile {
  return PROFILES[id] ?? DEFAULT_PROFILE;
}

export function getProfileForPath(modelPath: string): CharacterProfile {
  for (const profile of Object.values(PROFILES)) {
    if (modelPath === profile.modelPath) return profile;
  }
  return DEFAULT_PROFILE;
}

export { DEFAULT_PROFILE };
