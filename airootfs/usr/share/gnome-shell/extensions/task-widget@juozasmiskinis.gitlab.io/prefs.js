'use strict';

import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

import * as Config from 'resource:///org/gnome/Shell/Extensions/js/misc/config.js';
import * as Utils from './utils.js';
import system from 'system';

import {
    ExtensionPreferences,
    ngettext,
    pgettext,
    gettext as _
} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

let HAS_EDS = true;
let EDataServer, ECal;

try {
    EDataServer = (await import('gi://EDataServer')).default;
    ECal = (await import('gi://ECal')).default;
} catch (e) {
    HAS_EDS = false;
}

/**
 * Enables the use of context in translation of plurals.
 *
 * @param {string} context - Context for the translation.
 * @param {string} singular - Singular of the translatable string.
 * @param {string} plural - Plural of the translatable string.
 * @param {number} n - Number to apply the plural formula to.
 *
 * @returns {string} Translated string.
 */
const _npgettext = (context, singular, plural, n) => {
    return n !== 1
        ? ngettext(`${context}\u0004${singular}`, plural, n)
        : pgettext(context, singular);
};

let _resource = null;

/**
 * (Re)loads UI as a resource file.
 */
const _loadResource = () => {
    if (_resource) return;

    _resource = Gio.Resource.load(
        import.meta.url.slice(7, -8) +
            'org.gnome.shell.extensions.task-widget.gresource'
    );

    Gio.resources_register(_resource);
};

_loadResource();

export default class TaskWidgetExtensionPreferences extends ExtensionPreferences {
    /**
     * Displays the preferences window if Evolution Data Server and required
     * dependencies are installed. Otherwise, an instance of `BeGoneWidget`
     * is shown.
     *
     * @param {Adw.PreferencesWindow} window - The preferences window.
     */
    fillPreferencesWindow(window) {
        _loadResource();

        const widget = HAS_EDS
            ? new TaskWidgetSettings(this.getSettings(), this.metadata)
            : new BeGoneWidget(this.metadata);

        window.add(widget);
    }
}

const BeGoneWidget = GObject.registerClass(
    class BeGoneWidget extends Adw.PreferencesPage {
        /**
         * Shows a message dialog if required dependencies are not installed on
         * the system.
         *
         * @param {object} metadata - Extension metadata.
         */
        _init(metadata) {
            super._init();

            GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
                this.get_root().close();

                const dialog = new Gtk.MessageDialog({
                    buttons: Gtk.ButtonsType.CLOSE,
                    text: _('Error: Missing Dependencies'),
                    secondary_text: _(
                        'Please install Evolution Data' +
                            ' Server to use this extension.'
                    )
                });

                dialog.add_button(_('Help'), 0);
                dialog.set_name('task-widget-error');
                dialog.present();

                dialog.connect('response', (widget, responseId) => {
                    if (responseId === 0) {
                        Gio.AppInfo.launch_default_for_uri_async(
                            metadata.dependencies,
                            null,
                            null,
                            null
                        );
                    }

                    widget.destroy();
                });

                Gio.resources_unregister(_resource);
                _resource = null;

                return GLib.SOURCE_REMOVE;
            });
        }
    }
);

const TaskWidgetSettings = GObject.registerClass(
    {
        GTypeName: 'TaskWidgetSettings',
        Template:
            'resource:///org/gnome/shell/extensions/task-widget/settings-window.ui',
        InternalChildren: [
            'mtlSwitch',
            'gptSwitch',
            'hhfstlSwitch',
            'heactlSwitch',
            'socRow',
            'socSwitch',
            'taskCategoryPast',
            'taskCategoryToday',
            'taskCategoryTomorrow',
            'taskCategoryNextSevenDays',
            'taskCategoryScheduled',
            'taskCategoryUnscheduled',
            'taskCategoryNotCancelled',
            'taskCategoryStarted',
            'hctRow',
            'hctComboBox',
            'hctSettingsStack',
            'hctApotacComboBox',
            'hctApotacSpinButton',
            'hctAstodSpinButtonHour',
            'hctAstodSpinButtonMinute',
            'backendRefreshButton',
            'backendRefreshButtonSpinner',
            'taskListBox'
        ]
    },
    class TaskWidgetSettings extends Adw.PreferencesPage {
        /**
         * Initializes the settings widget.
         *
         * @param {Gio.Settings} settings - Settings object.
         * @param {object} metadata - Extension metadata.
         */
        _init(settings, metadata) {
            super._init();
            this._settings = settings;
            this._metadata = metadata;
            const provider = new Gtk.CssProvider();
            provider.load_from_resource(`${this._metadata.epath}/prefs.css`);

            Gtk.StyleContext.add_provider_for_display(
                Gdk.Display.get_default(),
                provider,
                Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION
            );

            [this._socRow, this._hctRow].forEach((row) =>
                this._findChildWidget(
                    'styleClass',
                    row,
                    'expander-row-arrow'
                ).hide()
            );

            this._hctComboBox.connect('changed', (option) => {
                const expanded = option.active > 1;
                this._hctRow.set_enable_expansion(expanded);
                this._hctRow.set_expanded(expanded);

                switch (option.active) {
                    case Utils.HIDE_COMPLETED_TASKS_['after-time-period']: {
                        this._hctSettingsStack.set_visible_child_name(
                            'hctApotacPage'
                        );

                        break;
                    }

                    case Utils.HIDE_COMPLETED_TASKS_['after-specified-time']: {
                        this._hctSettingsStack.set_visible_child_name(
                            'hctAstodPage'
                        );
                    }
                }
            });

            [
                ['merge-task-lists', this._mtlSwitch],
                ['group-past-tasks', this._gptSwitch],
                ['hide-header-for-singular-task-lists', this._hhfstlSwitch],
                ['hide-empty-completed-task-lists', this._heactlSwitch],
                ['hide-completed-tasks', this._hctComboBox],
                ['show-only-selected-categories', this._socSwitch],
                ['hct-apotac-value', this._hctApotacSpinButton, 'value'],
                ['hct-apotac-unit', this._hctApotacComboBox],
                ['hct-astod-hour', this._hctAstodSpinButtonHour, 'value'],
                ['hct-astod-minute', this._hctAstodSpinButtonMinute, 'value']
            ].forEach(
                ([
                    key,
                    object,
                    property = 'active',
                    flags = Gio.SettingsBindFlags.DEFAULT
                ]) => this._settings.bind(key, object, property, flags)
            );

            const selected = this._settings.get_strv(
                'selected-task-categories'
            );

            [
                this._taskCategoryPast,
                this._taskCategoryToday,
                this._taskCategoryTomorrow,
                this._taskCategoryNextSevenDays,
                this._taskCategoryScheduled,
                this._taskCategoryUnscheduled,
                this._taskCategoryNotCancelled,
                this._taskCategoryStarted
            ].forEach((category) =>
                category.set_active(selected.includes(category.name))
            );

            [
                [this._taskCategoryPast, this._taskCategoryScheduled],
                [this._taskCategoryToday, this._taskCategoryNextSevenDays],
                [this._taskCategoryToday, this._taskCategoryScheduled],
                [this._taskCategoryTomorrow, this._taskCategoryNextSevenDays],
                [this._taskCategoryTomorrow, this._taskCategoryScheduled],
                [this._taskCategoryScheduled, this._taskCategoryUnscheduled],
                [this._taskCategoryNextSevenDays, this._taskCategoryScheduled]
            ].forEach(([source, target]) =>
                source.bind_property_full(
                    'active',
                    target,
                    'active',
                    GObject.BindingFlags.BIDIRECTIONAL,
                    (value) => {
                        if (value.source.active) {
                            value.target.set_active(false);
                            return [true];
                        }

                        return [false];
                    },

                    (value) => {
                        if (value.target.active) {
                            value.source.set_active(false);
                            return [true];
                        }

                        return [false];
                    }
                )
            );

            this._listTaskListsAndAccounts();
        }

        /**
         * Recursively traverses the widget tree below the given parent and
         * returns the first widget whose given property matches the given
         * value.
         *
         * @param {string} property - Look for a child with this property.
         * @param {*} parent - Parent of the child to be searched.
         * @param {*} value - Value of the given property.
         *
         * @returns {*|null} Child that meets the criteria or `null`.
         */
        _findChildWidget(property, parent, value) {
            let match;

            for (const child of [...parent]) {
                switch (property) {
                    case 'type': {
                        if (child instanceof value) return child;

                        break;
                    }

                    case 'styleClass': {
                        if (child.get_css_classes().includes(value))
                            return child;
                    }
                }

                match = this._findChildWidget(property, child, value);

                if (match) return match;
            }

            return null;
        }

        /**
         * Handles click events for task category checkbuttons.
         *
         * @param {Gtk.CheckButton} button - Corresponding checkbutton.
         */
        _toggleTaskCategory(button) {
            const selection = this._settings.get_strv(
                'selected-task-categories'
            );

            if (!button.active)
                selection.splice(selection.indexOf(button.name), 1);
            else if (!selection.includes(button.name))
                selection.push(button.name);

            this._settings.set_strv('selected-task-categories', selection);
        }

        /**
         * Fills "After a period of time after completion" Gtk.ComboBox with
         * time units.
         *
         * @param {Gtk.SpinButton} button - Corresponding `Gtk.SpinButton` that
         * sets time units.
         */
        _fillApotacComboBox(button) {
            const active = this._hctApotacComboBox.active_id;
            const duration = button.get_value();

            const time = new Map([
                [
                    Utils.TIME_UNITS_['seconds'],
                    _npgettext(
                        'after X second(s)',
                        'second',
                        'seconds',
                        duration
                    )
                ],
                [
                    Utils.TIME_UNITS_['minutes'],
                    _npgettext(
                        'after X minute(s)',
                        'minute',
                        'minutes',
                        duration
                    )
                ],
                [
                    Utils.TIME_UNITS_['hours'],
                    _npgettext('after X hour(s)', 'hour', 'hours', duration)
                ],
                [
                    Utils.TIME_UNITS_['days'],
                    _npgettext('after X day(s)', 'day', 'days', duration)
                ]
            ]);

            this._hctApotacComboBox.remove_all();

            time.forEach((label, i) =>
                this._hctApotacComboBox.append(`${i}`, label)
            );

            if (active !== null) this._hctApotacComboBox.set_active_id(active);
        }

        /**
         * Lists task lists and accounts of remote task lists.
         *
         * @async
         * @param {boolean} [accountsOnly] - Only refresh the account list.
         */
        async _listTaskListsAndAccounts(accountsOnly = false) {
            try {
                if (!accountsOnly) await this._initRegistry();

                const accounts = new Map();

                for (const [, client] of this._clients) {
                    const remote = client.check_refresh_supported();

                    if (remote) {
                        // Account name (usually an email address):
                        const account = this._sourceRegistry.ref_source(
                            client.source.get_parent()
                        ).display_name;

                        // Keep an object of unique accounts:
                        if (!accounts.get(account)) {
                            accounts.set(
                                account,
                                this._sourceRegistry.ref_source(
                                    client.source.get_parent()
                                )
                            );
                        }
                    }

                    if (accountsOnly) continue;

                    const taskListRow = new TaskListRow(client, remote, this);
                    this._taskListBox.append(taskListRow);
                }

                if (!accounts.size) {
                    this._backendRefreshButton.set_sensitive(false);

                    this._backendRefreshButton.set_tooltip_text(
                        _('No remote task lists found')
                    );
                } else {
                    this._backendRefreshButton.set_tooltip_text(
                        _('Refresh the list of account task lists')
                    );

                    let i = 0;
                    let action;
                    const menu = Gio.Menu.new();
                    const actionGroup = new Gio.SimpleActionGroup();

                    // Here we use a simple integer-based naming convention to
                    // override true account names that may containt special
                    // characters and cause issues:
                    for (const [account, source] of accounts) {
                        menu.append(account, `accounts.${i}`);
                        action = new Gio.SimpleAction({ name: `${i}` });

                        action.connect('activate', () =>
                            this._onAccountButtonClicked(source, account)
                        );

                        actionGroup.add_action(action);
                        i++;
                    }

                    this._backendRefreshButton.set_menu_model(menu);

                    this._backendRefreshButton.insert_action_group(
                        'accounts',
                        actionGroup
                    );
                }
            } catch (e) {
                logError(e);
            }
        }

        /**
         * Initializes the source registry.
         *
         * @async
         */
        async _initRegistry() {
            try {
                const sourceType = EDataServer.SOURCE_EXTENSION_TASK_LIST;
                this._sourceRegistry = await Utils.getSourceRegistry_();
                const customOrder = this._settings.get_strv('task-list-order');

                const customSort = customOrder.length
                    ? Utils.customSort_.bind(this, customOrder)
                    : undefined;

                const sources = this._sourceRegistry
                    .list_sources(sourceType)
                    .sort(customSort);

                const clients = await Promise.all(
                    sources.map((source) =>
                        Utils.getECalClient_(
                            source,
                            ECal.ClientSourceType.TASKS,
                            1,
                            null
                        )
                    )
                );

                this._clients = new Map(
                    clients.map((client) => [client.source.uid, client])
                );

                this._taskListAddedId = this._sourceRegistry.connect(
                    'source-added',
                    (_self, source) => {
                        if (source.has_extension(sourceType))
                            this._onTaskListEvent('added', source);
                    }
                );

                this._taskListRemovedId = this._sourceRegistry.connect(
                    'source-removed',
                    (_self, source) => {
                        if (source.has_extension(sourceType))
                            this._onTaskListEvent('removed', source);
                    }
                );

                this._taskListChangedId = this._sourceRegistry.connect(
                    'source-changed',
                    (_self, source) => {
                        if (source.has_extension(sourceType))
                            this._onTaskListEvent('changed', source);
                    }
                );
            } catch (e) {
                logError(e);
            }
        }

        /**
         * Handles account button click events.
         *
         * @async
         * @param {EDataServer.SourceCollection} source - Account data source.
         * @param {string} account - Account name.
         */
        async _onAccountButtonClicked(source, account) {
            try {
                const extension = EDataServer.SOURCE_EXTENSION_COLLECTION;

                if (!source.has_extension(extension))
                    throw new Error(`${account} is not refreshable`);

                // Refresh list of account task lists:
                if (
                    !(await Utils.refreshBackend_(
                        this._sourceRegistry,
                        source.uid,
                        null
                    ))
                )
                    throw new Error(`${account} could not be refreshed`);

                this._backendRefreshButtonSpinner.set_tooltip_text(
                    _('Refresh in progress') + Utils.ELLIPSIS_CHAR_
                );

                this._backendRefreshButton.set_visible(false);
                this._backendRefreshButtonSpinner.set_visible(true);

                this._backendRefreshId = GLib.timeout_add_seconds(
                    GLib.PRIORITY_DEFAULT,
                    5,
                    () => {
                        this._backendRefreshButton.set_visible(true);
                        this._backendRefreshButtonSpinner.set_visible(false);
                        delete this._backendRefreshId;
                        return GLib.SOURCE_REMOVE;
                    }
                );
            } catch (e) {
                logError(e);
            }
        }

        /**
         * Handles task list events (additions, removals and changes).
         *
         * @async
         * @param {string} event - Type of event.
         * @param {EDataServer.Source} source - Associated data source.
         */
        async _onTaskListEvent(event, source) {
            try {
                let i = 0;
                let row = this._taskListBox.get_row_at_index(i);

                switch (event) {
                    case 'added': {
                        const client = await Utils.getECalClient_(
                            source,
                            ECal.ClientSourceType.TASKS,
                            1,
                            null
                        );

                        this._clients.set(source.uid, client);

                        const taskListRow = new TaskListRow(
                            client,
                            client.check_refresh_supported(),
                            this
                        );

                        this._taskListBox.append(taskListRow);

                        break;
                    }

                    case 'removed': {
                        this._clients.delete(source.uid);

                        while (row) {
                            if (row._uid === source.uid) {
                                this._taskListBox.remove(row);

                                break;
                            }

                            row = this._taskListBox.get_row_at_index(i++);
                        }

                        break;
                    }

                    case 'changed': {
                        while (row) {
                            if (row._uid === source.uid) {
                                row.set_title(source.display_name);
                                break;
                            }

                            row = this._taskListBox.get_row_at_index(i++);
                        }
                    }
                }

                // Refresh the list of accounts:
                this._listTaskListsAndAccounts(true);
            } catch (e) {
                logError(e);
            }
        }

        /**
         * Pads values of Gtk.SpinButton with zeros so that they always contain
         * two digits.
         *
         * @param {Gtk.SpinButton} button - Widget involved in the operation.
         *
         * @returns {boolean} `true` to display the formatted value.
         */
        _timeOutput(button) {
            button.set_text(button.adjustment.value.toString().padStart(2, 0));
            return true;
        }

        /**
         * Disconnects signal handlers and unregisters resources when settings
         * window gets destroyed.
         */
        _onUnrealized() {
            if (this._taskListAddedId)
                this._sourceRegistry.disconnect(this._taskListAddedId);

            if (this._taskListRemovedId)
                this._sourceRegistry.disconnect(this._taskListRemovedId);

            if (this._taskListChangedId)
                this._sourceRegistry.disconnect(this._taskListChangedId);

            if (this._backendRefreshId)
                GLib.source_remove(this._backendRefreshId);

            Gio.resources_unregister(_resource);
            _resource = null;
        }

        /**
         * Adds custom buttons to the header bar as soon as the widget gets
         * realized.
         *
         * @param {TaskWidgetSettings} widget - Widget that has been realized.
         */
        _onRealized(widget) {
            this._window = widget.get_root();

            const headerBar = this._findChildWidget(
                'type',
                this._window,
                Adw.HeaderBar
            );

            headerBar.pack_end(new SettingsMenuButton(this));
            headerBar.pack_end(new DonateMenuButton(this));
        }
    }
);

const TaskListRow = GObject.registerClass(
    {
        GTypeName: 'TaskListRow',
        Template:
            'resource:///org/gnome/shell/extensions/task-widget/task-list-row.ui',
        InternalChildren: [
            'taskListProvider',
            'taskListSwitch',
            'taskListOptionsButton',
            'taskListOptionsSpinner'
        ]
    },
    class TaskListRow extends Adw.ActionRow {
        /**
         * Initializes a task list row.
         *
         * @param {ECal.Client} client - `ECal.Client` of the task list.
         * @param {boolean} remote - It's a remote task list.
         * @param {TaskWidgetSettings} widget - Reference to the main widget
         * class.
         */
        _init(client, remote, widget) {
            super._init();
            this._source = client.source;
            this._settings = widget._settings;
            this._uid = this._source.uid;
            this.set_title(this._source.display_name);

            this._taskListProvider.set_text(
                widget._sourceRegistry.ref_source(this._source.get_parent())
                    .display_name
            );

            this._taskListSwitch.active =
                this._settings
                    .get_strv('disabled-task-lists')
                    .indexOf(this._source.uid) === -1;

            let action;
            const actionGroup = new Gio.SimpleActionGroup();
            action = new Gio.SimpleAction({ name: 'up' });
            action.connect('activate', () => this._moveRow(true));
            actionGroup.add_action(action);
            action = new Gio.SimpleAction({ name: 'down' });
            action.connect('activate', () => this._moveRow(false));
            actionGroup.add_action(action);

            if (remote) {
                const menu = this._taskListOptionsButton.menu_model;
                menu.append(_('Refresh Tasks'), 'options-menu.refresh');
                action = new Gio.SimpleAction({ name: 'refresh' });

                action.connect('activate', () =>
                    this._onRefreshButtonClicked(client)
                );

                actionGroup.add_action(action);
                menu.append(_('Properties'), 'options-menu.properties');
                action = new Gio.SimpleAction({ name: 'properties' });

                action.connect('activate', () =>
                    new TaskListPropertiesDialog(widget, this._source).present()
                );

                actionGroup.add_action(action);
                this._taskListOptionsButton.set_menu_model(menu);
            }

            this._taskListOptionsButton.insert_action_group(
                'options-menu',
                actionGroup
            );
        }

        /**
         * Handles motion events.
         *
         * @param {Gtk.EventControllerMotion} controller - Event controller.
         * @param {number} x - The X coordinate.
         */
        _onMotionEvent(controller, x) {
            let cursor;

            const reactive =
                controller.widget instanceof Gtk.Switch ||
                controller.widget instanceof Gtk.MenuButton;

            if (x !== undefined) cursor = reactive ? 'default' : 'grab';
            else cursor = reactive ? 'grab' : 'default';

            this.get_root().set_cursor(Gdk.Cursor.new_from_name(cursor, null));
        }

        /**
         * Updates the task content of the task list when it's `Refresh Tasks`
         * button gets clicked.
         *
         * @async
         * @param {ECal.Client} client - `ECal.Client` of the task list.
         */
        async _onRefreshButtonClicked(client) {
            try {
                this._taskListOptionsButton.set_visible(false);
                this._taskListOptionsSpinner.set_visible(true);

                GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
                    this._taskListOptionsButton.set_visible(true);
                    this._taskListOptionsSpinner.set_visible(false);
                    return GLib.SOURCE_REMOVE;
                });

                if (!(await Utils.refreshClient_(client, null))) {
                    throw new Error(
                        'Cannot refresh the task list: ' +
                            client.source.display_name
                    );
                }
            } catch (e) {
                logError(e);
            }
        }

        /**
         * Ensures that changes in task list order are saved in settings.
         */
        _updateTaskListOrder() {
            let i = 0;
            const uids = [];
            const taskListBox = this.get_parent();
            let row = taskListBox.get_row_at_index(i);

            while (row) {
                uids.push(row._uid);
                row = taskListBox.get_row_at_index(i++);
            }

            this._settings.set_strv('task-list-order', uids);
        }

        /**
         * Moves the row up or down in the list of task lists.
         *
         * @param {boolean} up - Move the row upwards.
         */
        _moveRow(up) {
            let index = this.get_index();
            const taskListBox = this.get_parent();
            taskListBox.remove(this);

            if (up) --index;
            else if (taskListBox.get_row_at_index(index)) ++index;
            else index = 0;

            taskListBox.insert(this, index);
            this._updateTaskListOrder();
        }

        /**
         * Prepares drag and drop operations.
         *
         * @param {*} y - the Y coordinate of the drag starting point.
         * @param {*} x - the X coordinate of the drag starting point.
         *
         * @returns {Gdk.ContentProvider} Type of content to provide in drag and
         * drop operations.
         */
        _dragPrepare(y, x) {
            const taskListBox = this.get_parent();
            taskListBox.dragX = x;
            taskListBox.dragY = y;
            return Gdk.ContentProvider.new_for_value(this);
        }

        /**
         * Initializes drag and drop operations.
         *
         * @param {Gtk.DragSource} source - `Gtk.DragSource` of the drag and
         * drop operation.
         */
        _dragBegin(source) {
            this.get_style_context().add_class('drag-icon');
            const taskListBox = this.get_parent();

            source.set_icon(
                Gtk.WidgetPaintable.new(this),
                taskListBox.dragX,
                taskListBox.dragY
            );
        }

        /**
         * Handles the `drop` part of a drag and drop operation.
         *
         * @param {Gtk.DropTarget} target - `tk.DropTarget` of the drag and
         * drop operation.
         */
        _dragDrop(target) {
            const taskListBox = this.get_parent();
            const dropIndex = this.get_index();
            const dragRow = target.value;

            if (dropIndex === dragRow.get_index()) return false;

            taskListBox.remove(dragRow);
            taskListBox.insert(dragRow, dropIndex);
            this._updateTaskListOrder();
            return true;
        }

        /**
         * Finalizes the drag and drop operation.
         */
        _dragEnd() {
            this.get_style_context().remove_class('drag-icon');
        }

        /**
         * Adds or removes the task list from the list of disabled task lists.
         *
         * @param {Gtk.Switch} widget - Switch whose state is handled.
         */
        _setTaskListState(widget) {
            const disabled = this._settings.get_strv('disabled-task-lists');

            if (widget.active) {
                const index = disabled.indexOf(this._source.uid);

                if (index !== -1) disabled.splice(index, 1);
            } else {
                disabled.push(this._source.uid);
            }

            this._settings.set_strv('disabled-task-lists', disabled);
        }
    }
);

const TaskListPropertiesDialog = GObject.registerClass(
    {
        GTypeName: 'TaskListPropertiesDialog',
        Template:
            'resource:///org/gnome/shell/extensions/task-widget/task-list-properties-dialog.ui',
        InternalChildren: [
            'taskListPropertiesDialogComboBox',
            'taskListPropertiesDialogSpinButton'
        ]
    },
    class TaskListPropertiesDialog extends Gtk.Dialog {
        /**
         * Initializes a dialog for task list properties.
         *
         * @param {TaskWidgetSettings} widget - Reference to the main widget
         * class.
         * @param {EDataServer.Source} source - Source of the task list.
         */
        _init(widget, source) {
            super._init();
            this.set_transient_for(widget._window);
            this._source = source;

            this.set_title(
                this.get_title() +
                    ' ' +
                    Utils.EM_DASH_CHAR_ +
                    ' ' +
                    source.display_name
            );

            this._extension = source.get_extension(
                EDataServer.SOURCE_EXTENSION_REFRESH
            );

            let units;
            let interval = this._extension.interval_minutes;

            if (interval === 0) {
                units = Utils.TIME_UNITS_['minutes'];
            } else if (interval % Utils.MINUTES_PER_DAY_ === 0) {
                interval /= Utils.MINUTES_PER_DAY_;
                units = Utils.TIME_UNITS_['days'];
            } else if (interval % Utils.MINUTES_PER_HOUR_ === 0) {
                interval /= Utils.MINUTES_PER_HOUR_;
                units = Utils.TIME_UNITS_['hours'];
            } else {
                units = Utils.TIME_UNITS_['minutes'];
            }

            this._taskListPropertiesDialogSpinButton.set_value(interval);
            this._taskListPropertiesDialogComboBox.set_active_id(`${units}`);
        }

        /**
         * Fills Gtk.ComboBox with time units.
         */
        _fillTimeUnitComboBox() {
            const interval = this._taskListPropertiesDialogSpinButton.value;

            const time = new Map([
                [
                    Utils.TIME_UNITS_['minutes'],
                    _npgettext(
                        'refresh every X minutes(s)',
                        'minute',
                        'minutes',
                        interval
                    )
                ],
                [
                    Utils.TIME_UNITS_['hours'],
                    _npgettext(
                        'refresh every X hour(s)',
                        'hour',
                        'hours',
                        interval
                    )
                ],
                [
                    Utils.TIME_UNITS_['days'],
                    _npgettext(
                        'refresh every X day(s)',
                        'day',
                        'days',
                        interval
                    )
                ]
            ]);

            const active = this._taskListPropertiesDialogComboBox.active_id;
            this._taskListPropertiesDialogComboBox.remove_all();

            time.forEach((label, i) =>
                this._taskListPropertiesDialogComboBox.append(`${i}`, label)
            );

            if (active !== null)
                this._taskListPropertiesDialogComboBox.set_active_id(active);
        }

        /**
         * Handles closing of the dialog.
         *
         * @param {Gtk.ResponseType} id - Response type id returned after
         * closing the dialog.
         */
        vfunc_response(id) {
            if (id === Gtk.ResponseType.OK) {
                const active = this._taskListPropertiesDialogComboBox.active_id;
                let interval = this._taskListPropertiesDialogSpinButton.value;

                switch (parseInt(active)) {
                    case Utils.TIME_UNITS_['hours']:
                        interval *= Utils.MINUTES_PER_HOUR_;
                        break;
                    case Utils.TIME_UNITS_['days']:
                        interval *= Utils.MINUTES_PER_DAY_;
                }

                this._extension.set_interval_minutes(interval);
                this._source.write_sync(null);
            }

            this.destroy();
        }
    }
);

const SettingsMenuButton = GObject.registerClass(
    {
        GTypeName: 'SettingsMenuButton',
        Template:
            'resource:///org/gnome/shell/extensions/task-widget/settings-menu.ui',
        InternalChildren: ['aboutDialog', 'supportLogDialog']
    },
    class SettingsMenuButton extends Gtk.MenuButton {
        /**
         * Initializes the settings menu.
         *
         * @param {TaskWidgetSettings} widget - Reference to the main widget
         * class.
         */
        _init(widget) {
            super._init();
            const { modal } = widget._window;
            this._metadata = widget._metadata;
            this._aboutDialog.transient_for = widget._window;
            this._aboutDialog.program_name = _(this._metadata.name);
            this._aboutDialog.version = this._metadata.version.toString();
            this._aboutDialog.website = this._metadata.url;
            this._aboutDialog.comments = _(this._metadata.description);

            this._aboutDialog.translator_credits =
                /* Translators: put down your name/nickname and email (optional)
            according to the format below. This will credit you in the "About"
            window of the extension settings. */
                pgettext('translator name <email>', 'translator-credits');

            const actionGroup = new Gio.SimpleActionGroup();
            let action = new Gio.SimpleAction({ name: 'log' });

            action.connect('activate', () => {
                this._supportLogDialog._time =
                    GLib.DateTime.new_now_local().format('%F %T');

                if (modal) widget._window.set_modal(false);

                this._supportLogDialog.present();
                this.set_sensitive(false);
            });

            actionGroup.add_action(action);
            action = new Gio.SimpleAction({ name: 'wiki' });

            action.connect('activate', () => {
                Gio.AppInfo.launch_default_for_uri_async(
                    this._metadata.wiki,
                    null,
                    null,
                    null
                );
            });

            actionGroup.add_action(action);
            action = new Gio.SimpleAction({ name: 'about' });
            action.connect('activate', () => this._aboutDialog.present());
            actionGroup.add_action(action);
            this.insert_action_group('settings-menu', actionGroup);

            this._supportLogDialog.connect('response', (dialog, response) => {
                if (response === Gtk.ResponseType.OK)
                    this._generateSupportLog(dialog._time);

                if (modal) widget._window.set_modal(true);

                this.set_sensitive(true);
                dialog._time = null;
                dialog.hide();
            });
        }

        /**
         * Generates the support log. User is notified to remove or censor any
         * information he/she considers to be private.
         *
         * @async
         * @author Andy Holmes <andrew.g.r.holmes@gmail.com> (the original code
         * was extended to include more data).
         * @param {GLib.DateTime} time - Restricts log entries displayed to
         * those after this time.
         */
        async _generateSupportLog(time) {
            try {
                const gschema = (id) =>
                    new Gio.Settings({
                        settings_schema:
                            Gio.SettingsSchemaSource.get_default().lookup(
                                id,
                                true
                            )
                    });

                const [file, stream] = Gio.File.new_tmp('taskwidget.XXXXXX');
                const logFile = stream.get_output_stream();
                const widgetName = `${this._metadata.name} v${this._metadata.version}`;

                const iconTheme = gschema(
                    'org.gnome.desktop.interface'
                ).get_string('icon-theme');

                const gtkTheme = gschema(
                    'org.gnome.desktop.interface'
                ).get_string('gtk-theme');

                let shellTheme;

                try {
                    shellTheme = gschema(
                        'org.gnome.shell.extensions.user-theme'
                    ).get_string('name');

                    if (!shellTheme) throw new Error();
                } catch (e) {
                    shellTheme = 'Default / Unknown';
                }

                const monitors = Gdk.Display.get_default().get_monitors();
                const total = monitors.get_n_items();
                let display = '';

                for (let i = 0; i < total; i++) {
                    const item = monitors.get_item(i);

                    display +=
                        item.geometry.width * item.scale_factor +
                        'x' +
                        item.geometry.height * item.scale_factor +
                        '@' +
                        item.scale_factor +
                        'x';

                    if (i !== total - 1) display += ', ';
                }

                const logHeader =
                    widgetName +
                    '\n' +
                    GLib.get_os_info('PRETTY_NAME') +
                    '\n' +
                    'GNOME Shell ' +
                    Config.PACKAGE_VERSION +
                    '\n' +
                    'gjs ' +
                    system.version +
                    '\n' +
                    (Adw ? 'Libadwaita ' + Adw.VERSION_S + '\n' : '') +
                    'Language: ' +
                    GLib.getenv('LANG') +
                    '\n' +
                    'XDG Session Type: ' +
                    GLib.getenv('XDG_SESSION_TYPE') +
                    '\n' +
                    'GDM Session Type: ' +
                    GLib.getenv('GDMSESSION') +
                    '\n' +
                    'Shell Theme: ' +
                    shellTheme +
                    '\n' +
                    'Icon Theme: ' +
                    iconTheme +
                    '\n' +
                    'GTK Theme: ' +
                    gtkTheme +
                    '\n' +
                    'Display: ' +
                    display +
                    '\n\n';

                await Utils.writeBytesAsync_(
                    logFile,
                    new GLib.Bytes(logHeader),
                    0,
                    null
                );

                const process = new Gio.Subprocess({
                    flags:
                        Gio.SubprocessFlags.STDOUT_PIPE |
                        Gio.SubprocessFlags.STDERR_MERGE,
                    argv: ['journalctl', '--no-host', '--since', time]
                });

                process.init(null);

                logFile.splice_async(
                    process.get_stdout_pipe(),
                    Gio.OutputStreamSpliceFlags.CLOSE_TARGET,
                    GLib.PRIORITY_DEFAULT,
                    null,
                    (source, result) => {
                        try {
                            source.splice_finish(result);
                        } catch (e) {
                            logError(e);
                        }
                    }
                );

                await Utils.waitCheckAsync_(process, null);

                Gio.AppInfo.launch_default_for_uri_async(
                    file.get_uri(),
                    null,
                    null,
                    null
                );
            } catch (e) {
                logError(e);
            }
        }
    }
);

const DonateMenuButton = GObject.registerClass(
    {
        GTypeName: 'DonateMenuButton',
        Template:
            'resource:///org/gnome/shell/extensions/task-widget/donate-menu.ui',
        InternalChildren: [
            'donateCrypto',
            'donateOptionsComboBox',
            'donateOptionsStack'
        ]
    },
    class DonateMenuButton extends Gtk.MenuButton {
        /**
         * Initializes the donations menu.
         *
         * @param {TaskWidgetSettings} widget - Reference to the main widget
         * class.
         */
        _init(widget) {
            super._init();
            this._metadata = widget._metadata;
            this._donateCrypto.set_transient_for(widget._window);
            const actionGroup = new Gio.SimpleActionGroup();
            let action = new Gio.SimpleAction({ name: 'coffee' });

            action.connect('activate', () => {
                Gio.AppInfo.launch_default_for_uri_async(
                    this._metadata.coffee,
                    null,
                    null,
                    null
                );
            });

            actionGroup.add_action(action);
            action = new Gio.SimpleAction({ name: 'paypal' });

            action.connect('activate', () => {
                Gio.AppInfo.launch_default_for_uri_async(
                    this._metadata.paypal,
                    null,
                    null,
                    null
                );
            });

            actionGroup.add_action(action);
            action = new Gio.SimpleAction({ name: 'liberapay' });

            action.connect('activate', () => {
                Gio.AppInfo.launch_default_for_uri_async(
                    this._metadata.liberapay,
                    null,
                    null,
                    null
                );
            });

            actionGroup.add_action(action);
            action = new Gio.SimpleAction({ name: 'crypto' });
            action.connect('activate', () => this._donateCrypto.present());
            actionGroup.add_action(action);
            this.insert_action_group('donate-menu', actionGroup);

            this._donateOptionsComboBox.connect('changed', (option) => {
                switch (option.active_id) {
                    case 'bitcoin':
                        this._donateOptionsStack.set_visible_child_name(
                            'donateBitcoinPage'
                        );

                        break;
                    case 'bitcoin-cash':
                        this._donateOptionsStack.set_visible_child_name(
                            'donateBitcoinCashPage'
                        );

                        break;
                    case 'ethereum':
                        this._donateOptionsStack.set_visible_child_name(
                            'donateEthereumPage'
                        );
                }
            });
        }
    }
);
