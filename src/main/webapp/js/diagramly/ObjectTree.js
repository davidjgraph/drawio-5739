/**
 * Copyright (c) 2026, JGraph Holdings Ltd
 * Copyright (c) 2026, draw.io AG
 */
/**
 * Native object hierarchy window.
 *
 * This deliberately lives outside the core Actions, Menus and Dialogs files.
 * The only integration points are the source-list entries in Devel.js and the
 * Ant build. See docs/object-tree.md for the core update procedure.
 */
(function()
{
	var WINDOW_KEY = 'objectTree';

	mxResources.parse('objectTree=Object Tree\n' +
		'objectTreeEmpty=No objects in this diagram\n' +
		'objectTreeHint=Drag to reorder; double-click to rename\n' +
		'objectTreeLayer=Layer\n' +
		'objectTreeGroup=Group\n' +
		'objectTreeEdge=Connector\n' +
		'objectTreeObject=Object\n' +
		'lockedByParent=Locked by parent');

	/**
	 * Creates the floating object tree window.
	 */
	var ObjectTreeWindow = function(editorUi, x, y, w, h)
	{
		var graph = editorUi.editor.graph;
		var model = graph.getModel();
		var collapsed = new mxDictionary();
		var rows = new mxDictionary();
		var activeCell = graph.getSelectionCell();
		var dragCell = null;
		var dropRow = null;

		var div = document.createElement('div');
		div.style.position = 'relative';
		div.style.height = '100%';
		div.style.userSelect = 'none';
		div.style.overflow = 'hidden';

		var toolbar = document.createElement('div');
		toolbar.className = 'geToolbarContainer geDialogToolbar';
		toolbar.style.position = 'absolute';
		toolbar.style.left = '0';
		toolbar.style.right = '0';
		toolbar.style.top = '0';
		toolbar.style.height = '32px';
		toolbar.style.boxSizing = 'border-box';
		toolbar.style.padding = '4px 6px';
		div.appendChild(toolbar);

		var treeDiv = document.createElement('div');
		treeDiv.style.position = 'absolute';
		treeDiv.style.left = '0';
		treeDiv.style.right = '0';
		treeDiv.style.top = '32px';
		treeDiv.style.bottom = '24px';
		treeDiv.style.overflow = 'auto';
		treeDiv.style.padding = '2px 0';
		div.appendChild(treeDiv);

		var hint = document.createElement('div');
		hint.style.position = 'absolute';
		hint.style.left = '0';
		hint.style.right = '0';
		hint.style.bottom = '0';
		hint.style.height = '24px';
		hint.style.boxSizing = 'border-box';
		hint.style.padding = '4px 8px';
		hint.style.fontSize = '10px';
		hint.style.opacity = '0.65';
		hint.style.overflow = 'hidden';
		hint.style.textOverflow = 'ellipsis';
		hint.style.whiteSpace = 'nowrap';
		mxUtils.write(hint, mxResources.get('objectTreeHint'));
		div.appendChild(hint);

		function addToolbarButton(image, title, funct)
		{
			var button = document.createElement('a');
			button.className = 'geButton';
			button.setAttribute('title', title);
			button.style.display = 'inline-block';
			button.style.width = '22px';
			button.style.height = '22px';
			button.style.marginRight = '4px';
			button.style.backgroundImage = 'url(' + image + ')';
			button.style.backgroundPosition = 'center';
			button.style.backgroundRepeat = 'no-repeat';
			button.style.backgroundSize = '18px 18px';
			button.style.cursor = 'pointer';

			mxEvent.addListener(button, 'click', function(evt)
			{
				funct();
				mxEvent.consume(evt);
			});

			toolbar.appendChild(button);
			return button;
		};

		addToolbarButton(Editor.expandMoreImage,
			mxResources.get('expandAll') || 'Expand all', function()
		{
			collapsed = new mxDictionary();
			refresh();
		});

		addToolbarButton(Editor.expandLessImage,
			mxResources.get('collapseAll') || 'Collapse all', function()
		{
			collapsed = new mxDictionary();
			var descendants = model.getDescendants(model.getRoot());

			for (var i = 0; i < descendants.length; i++)
			{
				if (model.getChildCount(descendants[i]) > 0)
				{
					collapsed.put(descendants[i], true);
				}
			}

			refresh();
		});

		/**
		 * Returns the cell's label as plain text for the compact tree row.
		 */
		function getPlainLabel(cell)
		{
			var label = graph.convertValueToString(cell);
			label = (label != null) ? String(label) : '';

			if (label.length > 0 && graph.isHtmlLabel(cell))
			{
				var temp = document.createElement('div');
				temp.innerHTML = Graph.sanitizeHtml(label);
				label = mxUtils.extractTextWithWhitespace(temp.childNodes);
			}

			return mxUtils.trim(label);
		};

		function getCellKind(cell)
		{
			if (model.isLayer(cell))
			{
				return mxResources.get('objectTreeLayer');
			}
			else if (model.isEdge(cell))
			{
				return mxResources.get('objectTreeEdge');
			}
			else if (model.getChildCount(cell) > 0)
			{
				return mxResources.get('objectTreeGroup');
			}

			return mxResources.get('objectTreeObject');
		};

		function getDisplayLabel(cell)
		{
			var label = getPlainLabel(cell);

			return (label.length > 0) ? label : '(' + getCellKind(cell) + ')';
		};

		function isOwnLock(cell)
		{
			return mxUtils.getValue(graph.getCurrentCellStyle(cell),
				'locked', '0') == '1';
		};

		function isLockedByAncestor(cell)
		{
			cell = model.getParent(cell);

			while (cell != null)
			{
				if (isOwnLock(cell))
				{
					return true;
				}

				cell = model.getParent(cell);
			}

			return false;
		};

		/**
		 * Uses the editor's standard lock style contract. The tree keeps its
		 * own active row, so locking a selected object does not lose context.
		 */
		function setCellLocked(cell, locked)
		{
			var value = (locked) ? 0 : 1;

			model.beginUpdate();
			try
			{
				graph.setCellStyles(mxConstants.STYLE_MOVABLE, value, [cell]);
				graph.setCellStyles(mxConstants.STYLE_RESIZABLE, value, [cell]);
				graph.setCellStyles(mxConstants.STYLE_ROTATABLE, value, [cell]);
				graph.setCellStyles(mxConstants.STYLE_DELETABLE, value, [cell]);
				graph.setCellStyles(mxConstants.STYLE_EDITABLE, value, [cell]);
				graph.setCellStyles('locked', (locked) ? 1 : 0, [cell]);
				graph.setCellStyles('connectable', value, [cell]);
			}
			finally
			{
				model.endUpdate();
			}

			editorUi.fireEvent(new mxEventObject('lockedChanged'));
		};

		/**
		 * Locked objects are intentionally selectable from the tree. The
		 * override exists only for this synchronous selection operation.
		 */
		function selectCell(cell)
		{
			if (graph.isEditing())
			{
				graph.stopEditing(false);
			}

			var graphIsCellSelectable = graph.isCellSelectable;

			graph.isCellSelectable = function(candidate)
			{
				return candidate == cell || graphIsCellSelectable.apply(this, arguments);
			};

			try
			{
				graph.setSelectionCell(cell);
			}
			finally
			{
				graph.isCellSelectable = graphIsCellSelectable;
			}

			activeCell = cell;
			updateSelection();
			graph.scrollCellToVisible(cell);
		};

		function updateSelection()
		{
			var rowValues = rows.getValues();

			for (var i = 0; i < rowValues.length; i++)
			{
				rowValues[i].classList.remove('geActivePage');
			}

			var selected = graph.getSelectionCells();

			for (var i = 0; i < selected.length; i++)
			{
				var row = rows.get(selected[i]);

				if (row != null)
				{
					row.classList.add('geActivePage');
				}
			}

			var activeRow = rows.get(activeCell);

			if (activeRow != null)
			{
				activeRow.classList.add('geActivePage');
			}
		};

		function revealCell(cell)
		{
			var changed = false;
			cell = model.getParent(cell);

			while (cell != null && cell != model.getRoot())
			{
				if (collapsed.get(cell))
				{
					collapsed.remove(cell);
					changed = true;
				}

				cell = model.getParent(cell);
			}

			return changed;
		};

		function startRename(cell, row, label)
		{
			if (!graph.isEnabled() || graph.isCellLocked(cell) ||
				label.contentEditable == 'true')
			{
				return;
			}

			var oldValue = getPlainLabel(cell);
			label.textContent = oldValue;
			label.contentEditable = 'true';
			label.style.cursor = 'text';
			label.style.textOverflow = '';
			row.setAttribute('draggable', 'false');
			label.focus();

			var selection = window.getSelection();

			if (selection != null)
			{
				var range = document.createRange();
				range.selectNodeContents(label);
				selection.removeAllRanges();
				selection.addRange(range);
			}

			var stopEditing = function(applyValue)
			{
				if (label.contentEditable == 'true')
				{
					var newValue = mxUtils.extractTextWithWhitespace(label.childNodes);
					label.contentEditable = 'false';
					label.style.cursor = '';
					label.style.textOverflow = 'ellipsis';

					if (!graph.isCellLocked(cell))
					{
						row.setAttribute('draggable', 'true');
					}

					if (applyValue && newValue != oldValue)
					{
						if (graph.isHtmlLabel(cell))
						{
							newValue = mxUtils.htmlEntities(newValue, false).
								replace(/\n/g, '<br>');
						}

						graph.cellLabelChanged(cell, newValue);
					}
					else
					{
						refresh();
					}
				}
			};

			mxEvent.addListener(label, 'keydown', function(evt)
			{
				if (evt.keyCode == 13 || evt.keyCode == 27)
				{
					stopEditing(evt.keyCode == 13);
					mxEvent.consume(evt);
				}
			});

			mxEvent.addListener(label, 'blur', function()
			{
				stopEditing(true);
			});
		};

		function clearDropMarker()
		{
			if (dropRow != null)
			{
				dropRow.style.borderTop = '';
				dropRow.style.borderBottom = '';
				dropRow.style.outline = '';
				dropRow = null;
			}
		};

		function canContainChildren(cell)
		{
			var geo = model.getGeometry(cell);

			return model.isLayer(cell) || (model.isVertex(cell) &&
				(geo == null || !geo.relative));
		};

		function getDropMode(evt, source, target, row)
		{
			if (source == null || source == target || model.isAncestor(source, target) ||
				graph.isCellLocked(source))
			{
				return null;
			}

			var sourceIsLayer = model.isLayer(source);
			var targetIsLayer = model.isLayer(target);

			if (sourceIsLayer != targetIsLayer && sourceIsLayer)
			{
				return null;
			}

			if (!sourceIsLayer && targetIsLayer)
			{
				return graph.isCellLocked(target) ? null : 'inside';
			}

			var bounds = row.getBoundingClientRect();
			var ratio = (mxEvent.getClientY(evt) - bounds.top) /
				Math.max(1, bounds.height);

			if (sourceIsLayer)
			{
				return (ratio < 0.5) ? 'before' : 'after';
			}
			else if (ratio < 0.25)
			{
				return 'before';
			}
			else if (ratio > 0.75 || !canContainChildren(target))
			{
				return 'after';
			}

			return graph.isCellLocked(target) ? null : 'inside';
		};

		function moveCell(source, target, mode)
		{
			var parent = (mode == 'inside') ? target : model.getParent(target);

			if (parent == null || (model.isRoot(parent) && !model.isLayer(source)) ||
				graph.isCellLocked(parent))
			{
				return;
			}

			var oldParent = model.getParent(source);
			var oldIndex = oldParent.getIndex(source);
			var index = (mode == 'inside') ? model.getChildCount(parent) :
				parent.getIndex(target) + ((mode == 'after') ? 1 : 0);

			if (oldParent == parent && oldIndex < index)
			{
				index--;
			}

			if (oldParent == parent && oldIndex == index)
			{
				return;
			}

			if (mode == 'inside')
			{
				collapsed.remove(target);
			}

			// absolute=true keeps the canvas position stable when reparenting.
			graph.cellsAdded([source], parent, index, null, null, true, false, false);
			selectCell(source);
		};

		function installDragHandlers(row, cell)
		{
			mxEvent.addListener(row, 'dragstart', function(evt)
			{
				if (!graph.isEnabled() || graph.isCellLocked(cell))
				{
					evt.preventDefault();
					return;
				}

				dragCell = cell;
				evt.dataTransfer.effectAllowed = 'move';
				evt.dataTransfer.setData('text/plain', cell.getId() || 'object');
			});

			mxEvent.addListener(row, 'dragover', function(evt)
			{
				var mode = getDropMode(evt, dragCell, cell, row);
				clearDropMarker();

				if (mode != null)
				{
					evt.preventDefault();
					evt.dataTransfer.dropEffect = 'move';
					dropRow = row;

					if (mode == 'before')
					{
						row.style.borderTop = '2px solid var(--accent-color, #29b6f2)';
					}
					else if (mode == 'after')
					{
						row.style.borderBottom = '2px solid var(--accent-color, #29b6f2)';
					}
					else
					{
						row.style.outline = '2px solid var(--accent-color, #29b6f2)';
					}
				}
			});

			mxEvent.addListener(row, 'dragleave', function(evt)
			{
				if (!mxUtils.isAncestorNode(row, evt.relatedTarget))
				{
					clearDropMarker();
				}
			});

			mxEvent.addListener(row, 'drop', function(evt)
			{
				var mode = getDropMode(evt, dragCell, cell, row);
				clearDropMarker();

				if (mode != null)
				{
					evt.preventDefault();
					moveCell(dragCell, cell, mode);
				}
			});

			mxEvent.addListener(row, 'dragend', function()
			{
				dragCell = null;
				clearDropMarker();
			});
		};

		function addCell(cell, depth)
		{
			var childCount = model.getChildCount(cell);
			var expanded = childCount > 0 && !collapsed.get(cell);
			var row = document.createElement('div');
			row.style.display = 'flex';
			row.style.alignItems = 'center';
			row.style.boxSizing = 'border-box';
			row.style.height = '28px';
			row.style.paddingLeft = (4 + depth * 16) + 'px';
			row.style.paddingRight = '4px';
			row.style.cursor = 'default';
			row.style.whiteSpace = 'nowrap';
			row.setAttribute('title', getCellKind(cell) +
				((cell.getId() != null) ? ' · ' + cell.getId() : ''));

			if (graph.isEnabled() && !graph.isCellLocked(cell))
			{
				row.setAttribute('draggable', 'true');
			}

			var toggle = document.createElement('span');
			toggle.style.display = 'inline-flex';
			toggle.style.alignItems = 'center';
			toggle.style.justifyContent = 'center';
			toggle.style.flex = '0 0 16px';
			toggle.style.height = '20px';
			toggle.style.cursor = (childCount > 0) ? 'pointer' : 'default';
			mxUtils.write(toggle, (childCount > 0) ?
				((expanded) ? '\u25be' : '\u25b8') : '');
			row.appendChild(toggle);

			if (childCount > 0)
			{
				mxEvent.addListener(toggle, 'click', function(evt)
				{
					if (collapsed.get(cell))
					{
						collapsed.remove(cell);
					}
					else
					{
						collapsed.put(cell, true);
					}

					refresh();
					mxEvent.consume(evt);
				});
			}

			var label = document.createElement('span');
			label.style.flex = '1 1 auto';
			label.style.minWidth = '0';
			label.style.overflow = 'hidden';
			label.style.textOverflow = 'ellipsis';
			label.style.whiteSpace = 'nowrap';
			label.style.padding = '5px 4px';
			mxUtils.write(label, getDisplayLabel(cell));
			row.appendChild(label);

			var ownLock = isOwnLock(cell);
			var effectiveLock = graph.isCellLocked(cell);
			var inheritedLock = isLockedByAncestor(cell);
			var lock = document.createElement('img');
			lock.className = 'geAdaptiveAsset';
			lock.setAttribute('src', (effectiveLock) ?
				Editor.lockedImage : Editor.unlockedImage);
			lock.setAttribute('title', (inheritedLock) ?
				mxResources.get('lockedByParent') : mxResources.get('lockUnlock'));
			lock.setAttribute('draggable', 'false');
			lock.style.width = '16px';
			lock.style.height = '16px';
			lock.style.flex = '0 0 16px';
			mxUtils.setOpacity(lock, (effectiveLock) ? 90 : 35);

			if (graph.isEnabled() && !inheritedLock)
			{
				lock.style.cursor = 'pointer';

				mxEvent.addListener(lock, 'click', function(evt)
				{
					activeCell = cell;
					selectCell(cell);
					setCellLocked(cell, !ownLock);
					mxEvent.consume(evt);
				});
			}

			row.appendChild(lock);

			mxEvent.addListener(row, 'click', function(evt)
			{
				if (label.contentEditable != 'true' && mxEvent.getSource(evt) != toggle &&
					mxEvent.getSource(evt) != lock)
				{
					selectCell(cell);
					mxEvent.consume(evt);
				}
			});

			mxEvent.addListener(label, 'dblclick', function(evt)
			{
				startRename(cell, row, label);
				mxEvent.consume(evt);
			});

			installDragHandlers(row, cell);
			rows.put(cell, row);
			treeDiv.appendChild(row);

			if (expanded)
			{
				for (var i = 0; i < childCount; i++)
				{
					addCell(model.getChildAt(cell, i), depth + 1);
				}
			}
		};

		function refresh()
		{
			var scrollTop = treeDiv.scrollTop;
			treeDiv.innerText = '';
			rows = new mxDictionary();

			if (activeCell != null && !model.contains(activeCell))
			{
				activeCell = null;
			}

			var root = model.getRoot();
			var childCount = model.getChildCount(root);

			for (var i = 0; i < childCount; i++)
			{
				addCell(model.getChildAt(root, i), 0);
			}

			if (childCount == 0)
			{
				var empty = document.createElement('div');
				empty.style.padding = '12px';
				empty.style.fontStyle = 'italic';
				empty.style.opacity = '0.65';
				mxUtils.write(empty, mxResources.get('objectTreeEmpty'));
				treeDiv.appendChild(empty);
			}

			updateSelection();
			treeDiv.scrollTop = scrollTop;
		};

		var modelChangeListener = function()
		{
			refresh();
		};

		var selectionChangeListener = function()
		{
			activeCell = graph.getSelectionCell();

			if (activeCell != null && revealCell(activeCell))
			{
				refresh();
			}
			else
			{
				updateSelection();
			}
		};

		model.addListener(mxEvent.CHANGE, modelChangeListener);
		graph.getSelectionModel().addListener(mxEvent.CHANGE,
			selectionChangeListener);

		refresh();

		this.window = new mxWindow(mxResources.get('objectTree'), div,
			x, y, w, h, true, true);
		this.window.minimumSize = new mxRectangle(0, 0, 190, 140);
		this.window.destroyOnClose = false;
		this.window.setMaximizable(false);
		this.window.setResizable(true);
		this.window.setClosable(true);
		this.window.setVisible(true);

		editorUi.installResizeHandler(this, true);

		this.refresh = refresh;
		this.destroy = mxUtils.bind(this, function()
		{
			model.removeListener(modelChangeListener);
			graph.getSelectionModel().removeListener(selectionChangeListener);

			if (this.window != null && this.window.div != null)
			{
				this.window.destroy();
			}
		});
	};

	/**
	 * Installs the native action and wraps only the two panel menu builders.
	 */
	EditorUi.prototype.installObjectTree = function()
	{
		if (this.objectTreeInstalled || this.editor.isChromelessView())
		{
			return;
		}

		this.objectTreeInstalled = true;
		var ui = this;
		var action = this.actions.addAction(WINDOW_KEY, function()
		{
			if (ui.objectTreeWindow == null)
			{
				var saved = (ui.installWindowPersistence != null &&
					typeof mxSettings !== 'undefined') ?
					mxSettings.getWindowState(WINDOW_KEY) : null;
				var width = (saved != null && saved.w != null) ? saved.w : 260;
				var height = (saved != null && saved.h != null) ? saved.h : 360;
				var x = (saved != null && saved.x != null) ? saved.x :
					document.body.offsetWidth - width - 20;
				var y = (saved != null && saved.y != null) ? saved.y : 120;

				ui.objectTreeWindow = new ObjectTreeWindow(ui, x, y, width, height);
				ui.objectTreeWindow.window.addListener(mxEvent.SHOW, function()
				{
					ui.fireEvent(new mxEventObject(WINDOW_KEY));
				});
				ui.objectTreeWindow.window.addListener(mxEvent.HIDE, function()
				{
					ui.fireEvent(new mxEventObject(WINDOW_KEY));
				});

				if (ui.installWindowPersistence != null)
				{
					ui.installWindowPersistence(WINDOW_KEY, ui.objectTreeWindow);

					if (saved != null)
					{
						ui.restoreWindowState(WINDOW_KEY, ui.objectTreeWindow);
					}
				}

				ui.objectTreeWindow.window.setVisible(true);
				ui.fireEvent(new mxEventObject(WINDOW_KEY));
			}
			else
			{
				ui.objectTreeWindow.window.setVisible(
					!ui.objectTreeWindow.window.isVisible());
			}
		});

		action.setToggleAction(true);
		action.setSelectedCallback(function()
		{
			return ui.objectTreeWindow != null &&
				ui.objectTreeWindow.window.isVisible();
		});

		function appendToMenu(name)
		{
			var menu = ui.menus.get(name);

			if (menu != null)
			{
				var oldFunct = menu.funct;

				menu.funct = function(menu, parent)
				{
					oldFunct.apply(this, arguments);
					ui.menus.addMenuItems(menu, ['-', WINDOW_KEY], parent);
				};
			}
		};

		appendToMenu('view');
		appendToMenu('viewPanels');

		this.destroyFunctions.push(function()
		{
			if (ui.objectTreeWindow != null)
			{
				ui.objectTreeWindow.destroy();
				ui.objectTreeWindow = null;
			}
		});
	};

	// Loaded after the UI extension wrappers in app.min.js and Devel.js so this
	// wraps their EditorUi.init chain without modifying those implementations.
	var editorUiInit = EditorUi.prototype.init;

	EditorUi.prototype.init = function()
	{
		this.installObjectTree();
		editorUiInit.apply(this, arguments);

		// Core restoreVisibleWindows intentionally knows only core windows.
		// Restore this module's window after the standard init has completed.
		if (this.objectTreeInstalled && Editor.isSettingsEnabled() &&
			typeof mxSettings !== 'undefined')
		{
			var state = mxSettings.getWindowState(WINDOW_KEY);

			if (state != null && state.visible && this.objectTreeWindow == null)
			{
				this.actions.get(WINDOW_KEY).funct();
			}
		}
	};

	// Exposed for lightweight test harnesses and future native extensions.
	window.ObjectTreeWindow = ObjectTreeWindow;
})();
