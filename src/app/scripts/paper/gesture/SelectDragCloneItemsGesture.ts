import {
  ClipPathLayer,
  GroupLayer,
  Layer,
  LayerUtil,
  PathLayer,
  VectorLayer,
} from 'app/model/layers';
import { MathUtil, Matrix } from 'app/scripts/common';
import { PaperLayer } from 'app/scripts/paper/item';
import { PaperService } from 'app/services';
import * as paper from 'paper';

import { Gesture } from './Gesture';
import { MouseSnapper } from './MouseSnapper';

/**
 * A gesture that performs selection, move, and clone operations
 * on one or more items. This gesture is only used during selection mode.
 *
 * TODO: don't allow modifications to be made to groups and paths/masks simultaneously
 * TODO: make it possible to drag/clone groups
 * TODO: show a 'grabbing' cursor while dragging items
 * TODO: confirm that it is impossible for vector layers to be translated/transformed
 * TODO: make it possible to drag/clone multiple items at a time (doesn't seem to work)
 */
export class SelectDragCloneItemsGesture extends Gesture {
  private readonly paperLayer = paper.project.activeLayer as PaperLayer;
  private mouseSnapper: MouseSnapper;
  private selectedItems: ReadonlyArray<paper.Item>;
  private initialItemPositions: ReadonlyArray<paper.Point>;
  private initialMatrices: ReadonlyArray<paper.Matrix>;
  private initialVectorLayer: VectorLayer;
  private isDragging = false;

  // TODO: pressing alt should select the item directly beneath the hit item
  constructor(private readonly ps: PaperService, private readonly hitLayerId: string) {
    super();
  }

  // @Override
  onMouseDown(event: paper.ToolEvent) {
    // Clear the current hover layer, if it exists.
    this.ps.setHoveredLayer(undefined);

    const selectedLayers = new Set(this.ps.getSelectedLayers());
    if (!event.modifiers.shift && !selectedLayers.has(this.hitLayerId)) {
      // If shift isn't pressed, then clear any existing selections.
      selectedLayers.clear();
    }
    // Select the hit item.
    selectedLayers.add(this.hitLayerId);
    this.ps.setSelectedLayers(selectedLayers);

    // Save a copy of the initial vector layer so that we can make changes
    // to it as we drag.
    this.initialVectorLayer = this.ps.getVectorLayer();

    this.mouseSnapper = new MouseSnapper(this.ps);
  }

  // @Override
  onMouseDrag(event: paper.ToolEvent) {
    this.mouseSnapper.onMouseEvent(event);
    const { horizontal, vertical } = this.mouseSnapper.getSnapInfo();
    console.log('horizontal', horizontal);
    console.log('vertical', vertical);

    if (!this.isDragging) {
      if (event.modifiers.alt) {
        // TODO: clone the selected items
      }
      this.isDragging = true;
    }

    // TODO: make sure groups and paths/masks aren't modified simultaneously
    let newVl = this.initialVectorLayer.clone();
    const translateLayerFn = (layerId: string, distance: paper.Point) => {
      const initialLayer = this.initialVectorLayer.findLayerById(layerId);
      if (initialLayer instanceof PathLayer || initialLayer instanceof ClipPathLayer) {
        const replacementLayer = initialLayer.clone();
        replacementLayer.pathData = initialLayer.pathData.transform(
          Matrix.translation(distance.x, distance.y),
        );
        newVl = LayerUtil.replaceLayer(newVl, layerId, replacementLayer);
      } else if (initialLayer instanceof GroupLayer) {
        const replacementLayer = initialLayer.clone();
        replacementLayer.translateX += distance.x;
        replacementLayer.translateY += distance.y;
        newVl = LayerUtil.replaceLayer(newVl, layerId, replacementLayer);
      }
    };

    const selectedItems = this.getSelectedItems();
    selectedItems.forEach(item => {
      const downPoint = item.globalToLocal(event.downPoint);
      const point = item.globalToLocal(event.point);
      const localDelta = point.subtract(downPoint);
      const finalDelta = event.modifiers.shift
        ? new paper.Point(MathUtil.snapVectorToAngle(localDelta, 90))
        : localDelta;
      translateLayerFn(item.data.id, finalDelta);
    });

    this.ps.setVectorLayer(newVl);
  }

  private getSelectedItems() {
    return Array.from(this.ps.getSelectedLayers()).map(id => this.paperLayer.findItemByLayerId(id));
  }
}
