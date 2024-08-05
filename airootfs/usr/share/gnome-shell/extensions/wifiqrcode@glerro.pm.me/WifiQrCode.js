/* -*- Mode: js; indent-tabs-mode: nil; js-basic-offset: 4; tab-width: 4; -*- */
/*
 * This file is part of Wifi QR Code.
 * https://gitlab.gnome.org/glerro/gnome-shell-extension-wifiqrcode
 *
 * WifiQrCode.js
 *
 * Copyright (c) 2021-2024 Gianni Lerro {glerro} ~ <glerro@pm.me>
 *
 * Wifi QR Code is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by the
 * Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Wifi QR Code is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 * See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License along
 * with Wifi QR Code. If not, see <https://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * SPDX-FileCopyrightText: 2021-2024 Gianni Lerro <glerro@pm.me>
 */

'use strict';

import GLib from 'gi://GLib';
import NM from 'gi://NM';

import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import * as SignalManager from './SignalManager.js';
import * as QrCode from './QrCode.js';

export class WifiQrCode {
    constructor(extension) {
        this._nAttempts = 0;
        this._signalManager = new SignalManager.SignalManager();

        this._extension = extension;
        this._extensionName = this._extension.metadata.name;

        // NOTE: Make sure don't initialize anything after this
        this._checkDevices();
    }

    _checkDevices() {
        if (this._timeoutId) {
            GLib.source_remove(this._timeoutId);
            this._timeoutId = null;
        }

        this._quickSettings = Main.panel.statusArea.quickSettings;

        if (this._quickSettings._network) {
            this._network = this._quickSettings._network;
            if (!this._network._client) {
                // Shell not initialized completely wait for max of 100 * 1s
                console.log(`${this._extensionName}: Gnome Shell is not inizialized`);
                if ((this._nAttempts += 1) < 100) {
                    this._timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT,
                        1000, this._checkDevices.bind(this));
                }
            } else {
                this._client = this._network._client;

                for (let device of this._network._wirelessToggle._nmDevices)
                    this._deviceAdded(this._client, device);

                this._signalManager.addSignal(this._client, 'device-added', this._deviceAdded.bind(this));
                this._signalManager.addSignal(this._client, 'device-removed', this._deviceRemoved.bind(this));
            }
        } else {
            // Shell not initialized completely wait for max of 100 * 1s
            console.log(`${this._extensionName}: Gnome Shell is not inizialized`);
            if ((this._nAttempts += 1) < 100) {
                this._timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT,
                    1000, this._checkDevices.bind(this));
            }
        }
    }

    _deviceAdded(client, device) {
        if ((device.get_device_type() !== NM.DeviceType.WIFI) ||
            (device.get_state() === NM.DeviceState.UNMANAGED))
            return;

        console.log(`${this._extensionName}: Device Added: ${device.product}`);

        this._signalManager.addSignal(device, 'state-changed', this._stateChanged.bind(this));

        this._addMenu(device);
    }

    _addMenu(device) {
        if (device) {
            console.log(`${this._extensionName}: Adding menu....`);

            if (!this._network._wirelessToggle._items.get(device)) {
                // Device item not created wait for max of 1s
                console.log(`${this._extensionName}: Device item not ready, waiting...`);
                if (!device.timeout) {
                    device.timeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000,  () => {
                        this._addMenu(device);
                    });
                    return;
                } else {
                    return;
                }
            }

            if (device.timeout) {
                GLib.source_remove(device.timeout);
                device.timeout = null;
            }

            if (device.get_state() !== NM.DeviceState.ACTIVATED)
                return;

            let wrapper = this._network._wirelessToggle._items.get(device);

            if (!wrapper.QrCodeMenuSection) {
                wrapper.QrCodeMenuSection = new PopupMenu.PopupMenuSection();
                wrapper.switchMenuItem = new PopupMenu.PopupSwitchMenuItem(_('Show QR Code'), false);

                wrapper.QrCodeBox = new QrCode.QrCodeBox(this._extension, device, false);

                wrapper.QrCodeMenuSection.actor.add_child(wrapper.switchMenuItem);
                wrapper.QrCodeMenuSection.actor.add_child(wrapper.QrCodeBox);

                // Add a timer to automatically close the switch menu for privacy
                wrapper.switchMenuItem.connectObject('toggled', () => {
                    wrapper.QrCodeBox.visible = wrapper.switchMenuItem.state;
                    if (device.privacyTimeout) {
                        GLib.source_remove(device.privacyTimeout);
                        device.privacyTimeout = null;
                    } else if (wrapper.switchMenuItem.state) {
                        // TODO: Eventually create a setting to regulate the time.
                        device.privacyTimeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 10000,  () => {
                            wrapper.switchMenuItem.toggle();
                            return GLib.SOURCE_REMOVE;
                        });
                    }
                }, this);

                wrapper.section.addMenuItem(wrapper.QrCodeMenuSection);
            }

            this._stateChanged(device, device.state, device.state, null);
        }
    }

    _deviceRemoved(client, device) {
        if ((device.get_device_type() !== NM.DeviceType.WIFI) ||
            (device.get_state() === NM.DeviceState.UNMANAGED))
            return;

        console.log(`${this._extensionName}: Device Removed: ${device.product}`);

        this._signalManager.disconnectBySource(device);

        this._removeMenu(device);
    }

    _removeMenu(device) {
        console.log(`${this._extensionName}: Removing menu....`);

        if (!this._network._wirelessToggle._items.get(device))
            return;

        let wrapper = this._network._wirelessToggle._items.get(device);

        if (wrapper.QrCodeMenuSection) {
            wrapper.QrCodeMenuSection.destroy();
            wrapper.QrCodeMenuSection = null;
        }
    }

    _stateChanged(device, newstate, _oldstate, _reason) {
        if (device.get_device_type() !== NM.DeviceType.WIFI)
            return;

        console.log(`${this._extensionName}: Device State Changed: ${device.product}`);

        if (!this._network._wirelessToggle._items.get(device))
            return;

        let wrapper = this._network._wirelessToggle._items.get(device);

        if (wrapper.QrCodeMenuSection && newstate !== NM.DeviceState.ACTIVATED)
            this._removeMenu(device);

        if (!wrapper.QrCodeMenuSection && newstate === NM.DeviceState.ACTIVATED)
            this._addMenu(device);
    }

    destroy() {
        console.log(`${this._extensionName}: Destroying....bye bye`);

        if (this._network && this._network._wirelessToggle._nmDevices) {
            for (let device of this._network._wirelessToggle._nmDevices) {
                this._deviceRemoved(this._client, device);
                if (device.timeout) {
                    GLib.source_remove(device.timeout);
                    device.timeout = null;
                }
                if (device.privacyTimeout) {
                    GLib.source_remove(device.privacyTimeout);
                    device.privacyTimeout = null;
                }
            }
        }

        if (this._timeoutId) {
            GLib.source_remove(this._timeoutId);
            this._timeoutId = null;
        }

        this._signalManager.disconnectAll();
    }
}

