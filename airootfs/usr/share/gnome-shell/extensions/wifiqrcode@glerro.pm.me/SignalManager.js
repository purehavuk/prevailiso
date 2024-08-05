/* -*- Mode: js; indent-tabs-mode: nil; js-basic-offset: 4; tab-width: 4; -*- */
/*
 * This file is part of Wifi QR Code.
 * https://gitlab.gnome.org/glerro/gnome-shell-extension-wifiqrcode
 *
 * SignalManager.js
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
 * *****************************************************************************
 * Original Author: Gopi Sankar Karmegam
 *****************************************************************************
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * SPDX-FileCopyrightText: 2021-2024 Gianni Lerro <glerro@pm.me>
 */

import GObject from 'gi://GObject';

let Signal =  class Signal {
    constructor(signalSource, signalName, callback) {
        this._signalSource = signalSource;
        this._signalName = signalName;
        this._signalCallback = callback;
    }

    connect() {
        this._signalId = this._signalSource.connect(this._signalName, this._signalCallback);
    }

    disconnect() {
        if (this._signalId) {
            GObject.Object.prototype.disconnect.call(this._signalSource, this._signalId);
            this._signalId = null;
        }
    }
};

export class SignalManager {
    constructor() {
        this._signals = [];
        this._signalsBySource = {};
    }

    addSignal(signalSource, signalName, callback) {
        let obj = null;
        if (signalSource && signalName && callback) {
            obj = new Signal(signalSource, signalName, callback);
            obj.connect();
            this._signals.push(obj);
            if (!this._signalsBySource[signalSource])
                this._signalsBySource[signalSource] = [];
            let item = this._signalsBySource[signalSource];
            item.push(obj);
        }
        return obj;
    }

    disconnectAll() {
        this._signals.forEach(obj => {
            obj.disconnect();
        });
    }

    disconnectBySource(signalSource) {
        if (this._signalsBySource[signalSource]) {
            let signalBySource = this._signalsBySource[signalSource];
            signalBySource.forEach(obj => {
                obj.disconnect();
            });
        }
    }
}

