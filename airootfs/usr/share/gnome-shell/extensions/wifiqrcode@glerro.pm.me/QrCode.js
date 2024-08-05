/* -*- Mode: js; indent-tabs-mode: nil; js-basic-offset: 4; tab-width: 4; -*- */
/*
 * This file is part of Wifi QR Code.
 * https://gitlab.gnome.org/glerro/gnome-shell-extension-wifiqrcode
 *
 * QrCode.js
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

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import NM from 'gi://NM';
import St from 'gi://St';

import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';
import * as Config from 'resource:///org/gnome/shell/misc/config.js';

import Cairo from 'cairo';

import * as QrCodeGen from './libs/qrcodegen.js';

const SHELL_MAJOR = parseInt(Config.PACKAGE_VERSION.split('.')[0]);
const MIN_SQUARE_SIZE = 1.0;
const MIN_BORDER = 1;
const MIN_WIDTH = 150;

// Extend the BoxLayout class from St.
export const QrCodeBox = GObject.registerClass({
    GTypeName: 'QrCodeBox',
}, class QrCodeBox extends St.BoxLayout {
    constructor(extension, device, isVisible = true) {
        super({
            vertical: true,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            y_expand: true,
            x_expand: true,
            style: 'padding-bottom: 10px;',
            visible: isVisible,
        });

        this._extension = extension;
        this._extensionName = this._extension.metadata.name;

        let _qrCodeActor = new QrCodeActor(this._extension, this._getWifiSettingsString(device), 200, 2);
        this.add_child(_qrCodeActor);
    }

    _getWifiSettingsString(device) {
        console.log(`${this._extensionName}: Collecting Wifi Settings`);

        // device is a NM.Device class
        let _device = device;

        // Return an NM.activeConnection class or null if the device is
        // not part of an active connection.
        let _activeConnection = _device.get_active_connection();
        if (!_activeConnection)
            return null;

        // Return the NM.RemoteConnection which this NM.ActiveConnection
        // is an active instance of.
        let _remoteConnection = _activeConnection.get_connection();
        if (!_remoteConnection)
            return null;

        // Return an NM.SettingWireless if the connection contains one or null
        let _setting = _remoteConnection.get_setting_wireless();
        if (!_setting)
            return null;

        let _qrCodeString = 'WIFI:';

        /* SSID */
        let decoder = new TextDecoder('utf-8');
        let _ssid = decoder.decode(_setting.get_ssid().get_data());
        if (!_ssid)
            return null;

        _qrCodeString = `${_qrCodeString}S:${_ssid};`;

        // Return an NM.SettingWirelessSecurity if the connection contains one or null
        let _securitySetting = _remoteConnection.get_setting_wireless_security();
        if (!_securitySetting)
            return null;

        /* Security Type */
        let _securityType = 'nopass';
        if (_securitySetting.get_key_mgmt() === 'wpa-psk' || _securitySetting.get_key_mgmt() === 'wpa-none' ||
            _securitySetting.get_key_mgmt() === 'sae') // WPA3 Personal
            _securityType = 'WPA';
        else if (_securitySetting.get_key_mgmt() === 'none')
            _securityType = 'WEP';

        _qrCodeString = `${_qrCodeString}T:${_securityType};`;

        /* Password */
        let _password = '';
        if (_securityType !== 'nopass') {
            try {
                let _secrets = _remoteConnection.get_secrets(NM.SETTING_WIRELESS_SECURITY_SETTING_NAME, null);
                _remoteConnection.update_secrets(NM.SETTING_WIRELESS_SECURITY_SETTING_NAME, _secrets);
            } catch (e) {
                console.error(e.message, 'Wifi QR Code');
                return null;
            }

            if (_securityType === 'WPA') {
                /* WPA Password */
                _password = _securitySetting.get_psk();
            } else if (_securityType === 'WEP') {
                /* WEP Password */
                let _wepIndex = _securitySetting.get_wep_tx_keyidx();
                _password = _securitySetting.get_wep_key(_wepIndex);
            }
        }

        _qrCodeString = `${_qrCodeString}P:${_password};`;

        /* WiFi Hidden */
        if (_setting.get_hidden())
            _qrCodeString = `${_qrCodeString}H:true;;`;
        else
            _qrCodeString = `${_qrCodeString}H:false;;`;

        return _qrCodeString;
    }
});

// Extend the DrawingArea class from St.
const QrCodeActor = GObject.registerClass({
    GTypeName: 'QrCodeActor',
}, class QrCodeActor extends St.DrawingArea {
    constructor(extension, qrcodetext = 'Invalid Text', size = 100, border = 2) {
        super({
            layout_manager: new Clutter.BinLayout(),
            clip_to_allocation: true,
            reactive: true,
        });

        this._extension = extension;
        this._extensionName = this._extension.metadata.name;
        this._extensionPath = this._extension.path;

        console.log(`${this._extensionName}: Generating Wifi QR Code`);

        // Define local variables
        this._qrcodetext = qrcodetext;
        this._size = size < MIN_WIDTH ? MIN_WIDTH : size;
        this._border = border < MIN_BORDER ? MIN_BORDER : border;

        // Generate the QR Code
        let QRC = QrCodeGen.qrcodegen.QrCode;
        this._qrcode = QRC.encodeText(this._qrcodetext, QRC.Ecc.MEDIUM);

        if (this._qrcode !== null || this._qrcode !== undefined) {
            this.set_size(this._size, this._size);
            this.connectObject('repaint', this.draw.bind(this), this);

            // Emitt the repaint signal
            this.queue_repaint();
        } else {
            console.log(`${this._extensionName}: An error occurred generating the QR Code`);
        }
    }

    // Copy QR Code to the Clipboard
    vfunc_event(event) {
        if (event.type() === Clutter.EventType.BUTTON_PRESS) {
            if (event.get_button() === 3) {
                let _qrSize = this._qrcode.size;
                let _size = this._size * 2;
                let _border = this._border;

                let _rowSize = _border + _qrSize + _border;
                let _squareSize = (_size / _rowSize) < MIN_SQUARE_SIZE ? MIN_SQUARE_SIZE : _size / _rowSize;

                let surface = new Cairo.ImageSurface(Cairo.Format.ARGB32, _size, _size);
                let cr = new Cairo.Context(surface);

                // Set Antialiasing mode to none (bilevel alpha mask)
                cr.setAntialias(Cairo.Antialias.NONE);

                // Draw a white background
                cr.setSourceRGBA(1, 1, 1, 1);
                cr.rectangle(0, 0, _size, _size);
                cr.fill();

                // Now draw the black QR Code pixels
                for (let iy = _border; iy < (_rowSize - _border); iy++) {
                    for (let ix = _border; ix < (_rowSize - _border); ix++) {
                        if (this._qrcode.getModule(ix - _border, iy - _border)) {
                            cr.setSourceRGBA(0.0, 0.0, 0.0, 1.0);
                            cr.rectangle(ix * _squareSize, iy * _squareSize, _squareSize, _squareSize);
                            cr.fill();
                        }
                    }
                }

                cr.$dispose();

                surface.writeToPNG(`${this._extensionPath}/TmpQrCode.png`);

                const imageFile = Gio.File.new_for_path(`${this._extensionPath}/TmpQrCode.png`);
                if (!imageFile.query_exists(null)) {
                    console.log(`${this._extensionName}: Temp file to copy in the clipboard not found`);
                    return;
                }

                const [bytes] = imageFile.load_bytes(null);
                const data = bytes.get_data();
                if (!data) {
                    console.log(`${this._extensionName}: Error reading temp file to copy in the clipboard`);
                    return;
                }

                bytes.unref();

                imageFile.delete(null);

                // Copy to Clipboard
                const Clipboard = St.Clipboard.get_default();
                const CLIPBOARD_TYPE = St.ClipboardType.CLIPBOARD;
                Clipboard.set_content(CLIPBOARD_TYPE, 'image/png', data);

                // Show Notification
                if (SHELL_MAJOR > 45) {
                    this._notifySource = new MessageTray.Source({
                        title: 'Gnome Shell Extension',
                        iconName: 'org.gnome.Shell.Extensions-symbolic',
                    });
                    this._notification = new MessageTray.Notification({
                        source: this._notifySource,
                        title: 'Wifi QR Code',
                        body: _('QR Code copied to clipboard'),
                        iconName: 'edit-paste-symbolic',
                        isTransient: true,
                        resident: false,
                    });
                } else {
                    this._notifySource = new MessageTray.Source('Gnome Shell Extension',
                        'edit-paste-symbolic');
                    this._notification = new MessageTray.Notification(this._notifySource,
                        'Wifi QR Code', _('QR Code copied to clipboard'));
                    this._notification.setTransient(true);
                }

                this._notifySource.connectObject('destroy', () => (this._notifySource = null), this);
                Main.messageTray.add(this._notifySource);

                if (SHELL_MAJOR > 45)
                    this._notifySource.addNotification(this._notification);
                else
                    this._notifySource.showNotification(this._notification);
            }
        }
    }

    // Draw the QR Code into the St.DrawingArea
    draw() {
        let _qrSize = this._qrcode.size;
        let _border = this._border;

        let [width, height] = this.get_surface_size();
        let _rowSize = _border + _qrSize + _border;
        let _squareSize = (width / _rowSize) < MIN_SQUARE_SIZE ? MIN_SQUARE_SIZE : width / _rowSize;

        let cr = this.get_context();
        // Set Antialiasing mode to none (bilevel alpha mask)
        cr.setAntialias(Cairo.Antialias.NONE);

        // Draw a white background
        cr.setSourceRGBA(1, 1, 1, 1);
        cr.rectangle(0, 0, width, height);
        cr.fill();

        // Now draw the black QR Code pixels
        for (let iy = _border; iy < (_rowSize - _border); iy++) {
            for (let ix = _border; ix < (_rowSize - _border); ix++) {
                if (this._qrcode.getModule(ix - _border, iy - _border)) {
                    cr.setSourceRGBA(0.0, 0.0, 0.0, 1.0);
                    cr.rectangle(ix * _squareSize, iy * _squareSize, _squareSize, _squareSize);
                    cr.fill();
                }
            }
        }
        cr.$dispose();
        return true;
    }
});

