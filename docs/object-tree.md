# Object tree

The native **View > Object Tree** window implements
[jgraph/drawio#5739](https://github.com/jgraph/drawio/issues/5739). It shows
the model hierarchy (layers, groups, vertices, connectors, and their child
cells), including objects that are obscured or locked.

## User interactions

- Click a row to select that exact cell. A short-lived `isCellSelectable`
  override allows a locked cell to be selected from the tree without making
  locked cells selectable on the canvas.
- Double-click a label to rename it. Enter commits and Escape cancels.
- Click the lock icon to apply the same style contract as the core
  `lockUnlock` action. The active tree row remains selected after locking.
  A child locked by an ancestor must be unlocked at the ancestor row.
- Drag a row before or after a sibling to change its order. Drop in the
  middle of a layer or non-relative vertex to reparent it. Reparenting uses
  `graph.cellsAdded(..., absolute=true)` to keep its canvas position stable.
- Use the window toolbar to expand or collapse the entire hierarchy.

The floating window uses the existing draw.io window persistence and docking
APIs. Its position, size, visibility, minimized state, and dock state are
stored under the `objectTree` window-state key.

## Isolation from core

The feature does **not** use `Draw.loadPlugin`, plugin settings, or custom
plugin URLs. Desktop plugin loading may remain disabled. All behavior is in
one native module:

`src/main/webapp/js/diagramly/ObjectTree.js`

That module installs itself by wrapping `EditorUi.prototype.init`, then adds
an action and wraps the already-created `view` and `viewPanels` menu builder
functions. No core action, menu, dialog, graph, or model implementation is
edited.

Only two source-list hooks are required:

1. `src/main/webapp/js/diagramly/Devel.js` loads `ObjectTree.js` after the
   existing UI extension wrappers for unbundled `?dev=1` runs.
2. `etc/build/build.xml` lists `ObjectTree.js` last in the full application
   compilation, so the desktop application receives it inside `app.min.js`.

It is intentionally absent from viewer-only bundles.

## Updating the draw.io core

When merging or replacing the core with a newer draw.io version:

1. Preserve `src/main/webapp/js/diagramly/ObjectTree.js` and this document.
2. If the source-list files were replaced, re-add these two lines after the
   other full-app extensions:

   ```xml
   <file name="ObjectTree.js" />
   ```

   ```javascript
   mxscript(drawDevUrl + 'js/diagramly/ObjectTree.js');
   ```

3. Check whether upstream changed any of the deliberately small API surface:
   `EditorUi.prototype.init`, `actions.addAction`, `menus.get`, `mxWindow`,
   `installResizeHandler`, `installWindowPersistence`, `restoreWindowState`,
   `graph.cellsAdded`, or the standard lock style keys. The module uses only
   these public/stable extension points.
4. Rebuild the full application from `etc/build`:

   ```bash
   ant app
   ```

5. Smoke-test both `index.html?dev=1` and the packaged desktop application:
   open **View > Object Tree**, select and rename a nested object, lock and
   unlock it, reorder siblings, reparent an object, undo/redo each model
   change, and confirm the window restores after restart.

The generated `src/main/webapp/js/app.min.js` should be rebuilt, never edited
by hand. In the common case, a core update therefore requires preserving one
module, restoring two one-line hooks if needed, and rebuilding.
