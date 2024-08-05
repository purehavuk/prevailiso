/* -*- Mode: js; indent-tabs-mode: nil; js-basic-offset: 4; tab-width: 4; -*- */
/*
 * This file is part of Wifi QR Code.
 * https://gitlab.gnome.org/glerro/gnome-shell-extension-wifiqrcode
 *
 * extension.js
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

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import * as WifiQrCode from './WifiQrCode.js';

export default class WifiQrCodeExtension extends Extension {
    enable() {
        console.log(`Enabling ${this.metadata.name} - Version ${this.metadata.version}`);

        this._wifiqrcode = new WifiQrCode.WifiQrCode(this);
    }

    disable() {
        console.log(`Disabling ${this.metadata.name} - Version ${this.metadata.version}`);

        if (this._wifiqrcode !== null) {
            this._wifiqrcode.destroy();
            this._wifiqrcode = null;
        }
    }
}

