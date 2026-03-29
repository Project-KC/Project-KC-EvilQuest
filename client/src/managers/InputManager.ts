import { Scene } from '@babylonjs/core/scene';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { Plane } from '@babylonjs/core/Maths/math.plane';
import { PointerEventTypes } from '@babylonjs/core/Events/pointerEvents';
import '@babylonjs/core/Culling/ray';
import type { ChunkManager } from '../rendering/ChunkManager';

export type GroundClickCallback = (worldX: number, worldZ: number) => void;
export type ObjectClickCallback = (objectEntityId: number) => void;
export type IndoorCheck = () => { indoors: boolean; playerY: number };

/**
 * Handles mouse/keyboard input for the game.
 * Click-to-move: detects clicks on chunk terrain meshes and reports world coordinates.
 * Left-click on world objects: reports the objectEntityId for auto-interact.
 */
export class InputManager {
  private scene: Scene;
  private chunkManager: ChunkManager;
  private onGroundClick: GroundClickCallback | null = null;
  private onObjectClick: ObjectClickCallback | null = null;
  private indoorCheck: IndoorCheck | null = null;

  constructor(scene: Scene, chunkManager: ChunkManager) {
    this.scene = scene;
    this.chunkManager = chunkManager;

    this.scene.onPointerObservable.add((pointerInfo) => {
      if (pointerInfo.type === PointerEventTypes.POINTERDOWN) {
        // Only left click
        if (pointerInfo.event.button !== 0) return;

        // First, try to pick a world object (trees, rocks, etc.)
        if (this.onObjectClick) {
          const objPick = this.scene.pick(
            this.scene.pointerX,
            this.scene.pointerY,
          );
          if (objPick?.hit && objPick.pickedMesh) {
            // Walk up parent chain looking for objectEntityId metadata
            let node: any = objPick.pickedMesh;
            while (node) {
              if (node.metadata?.objectEntityId != null) {
                this.onObjectClick(node.metadata.objectEntityId);
                return;
              }
              node = node.parent;
            }
          }
        }

        // When indoors, project click onto a horizontal plane at player height
        // (avoids camera-angle-dependent pick offset)
        const indoor = this.indoorCheck?.();
        if (indoor?.indoors && this.scene.activeCamera) {
          const ray = this.scene.createPickingRay(
            this.scene.pointerX,
            this.scene.pointerY,
            null,
            this.scene.activeCamera
          );
          // Intersect ray with horizontal plane at player's Y
          // Plane equation: y = playerY → normal (0,1,0), d = -playerY
          if (ray.direction.y !== 0) {
            const t = (indoor.playerY - ray.origin.y) / ray.direction.y;
            if (t > 0) {
              const worldX = ray.origin.x + ray.direction.x * t;
              const worldZ = ray.origin.z + ray.direction.z * t;
              this.onGroundClick?.(worldX, worldZ);
              return;
            }
          }
        }

        // Outdoor: pick walkable ground meshes normally
        const pickResult = this.scene.pick(
          this.scene.pointerX,
          this.scene.pointerY,
          (mesh) => this.chunkManager.isWalkableMesh(mesh.name)
        );

        if (pickResult?.hit && pickResult.pickedPoint) {
          const point = pickResult.pickedPoint;
          this.onGroundClick?.(point.x, point.z);
        }
      }
    });
  }

  setGroundClickHandler(callback: GroundClickCallback): void {
    this.onGroundClick = callback;
  }

  setObjectClickHandler(callback: ObjectClickCallback): void {
    this.onObjectClick = callback;
  }

  setIndoorCheck(check: IndoorCheck): void {
    this.indoorCheck = check;
  }
}
